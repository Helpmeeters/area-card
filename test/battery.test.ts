import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  batteryLevel,
  batteryPercent,
  buildBatteryIndex,
  parseBatteryMode,
  shownBattery,
  type BatteryMode,
} from "../src/battery";
import type { ClassifierHass, EntityState, RegistryEntry } from "../src/sections";

function state(entityId: string, value: string, attributes: Record<string, unknown> = {}): EntityState {
  return { entity_id: entityId, state: value, attributes };
}

function entry(entityId: string, deviceId: string | null, deviceClass?: string): RegistryEntry {
  return {
    entity_id: entityId,
    device_id: deviceId,
    device_class: deviceClass ?? null,
    entity_category: deviceClass === "battery" ? "diagnostic" : null,
  };
}

function hass(partial: {
  states?: Record<string, EntityState>;
  entities?: Record<string, RegistryEntry> | RegistryEntry[];
}): ClassifierHass {
  return partial;
}

describe("battery levels", () => {
  it("uses Home Assistant thresholds", () => {
    assert.equal(batteryLevel(100), "green");
    assert.equal(batteryLevel(70), "green");
    assert.equal(batteryLevel(69), "yellow");
    assert.equal(batteryLevel(30), "yellow");
    assert.equal(batteryLevel(29), "red");
    assert.equal(batteryLevel(0), "red");
  });

  it("parses the four menu modes", () => {
    for (const mode of ["off", "green", "yellow", "red"] as const) {
      assert.equal(parseBatteryMode(mode), mode);
    }
    assert.equal(parseBatteryMode("on"), "off");
    assert.equal(parseBatteryMode(null), "off");
  });
});

describe("battery association", () => {
  const door = "binary_sensor.front_door";
  const lock = "lock.front";
  const sensor = "sensor.front_door_battery";
  const other = "sensor.other_battery";

  function home(): ClassifierHass {
    return hass({
      states: {
        [door]: state(door, "off", { device_class: "door" }),
        [lock]: state(lock, "locked", { battery_level: "90" }),
        [sensor]: state(sensor, "18.4", { device_class: "battery", unit_of_measurement: "%" }),
        [other]: state(other, "80", { device_class: "battery" }),
        "sensor.dead": state("sensor.dead", "unavailable", { device_class: "battery" }),
        "sensor.low_flag": state("sensor.low_flag", "on", { device_class: "battery" }),
      },
      entities: {
        [door]: entry(door, "device-door", "door"),
        [lock]: entry(lock, "device-lock"),
        [sensor]: entry(sensor, "device-door", "battery"),
        [other]: entry(other, "device-other", "battery"),
        "sensor.dead": entry("sensor.dead", "device-dead", "battery"),
        "sensor.low_flag": entry("sensor.low_flag", "device-flag", "battery"),
      },
    });
  }

  it("uses the lowest battery sensor on the same device", () => {
    const homeWithTwo = hass({
      states: {
        [door]: state(door, "off"),
        [sensor]: state(sensor, "64.6", { device_class: "battery" }),
        "sensor.front_door_battery_2": state("sensor.front_door_battery_2", "12", { device_class: "battery" }),
      },
      entities: [
        entry(door, "device-door", "door"),
        entry(sensor, "device-door", "battery"),
        entry("sensor.front_door_battery_2", "device-door", "battery"),
      ],
    });
    const index = buildBatteryIndex(homeWithTwo);
    assert.equal(batteryPercent(index, homeWithTwo, door), 12);
    assert.equal(batteryPercent(index, homeWithTwo, sensor), 65);
  });

  it("prefers the device sensor over a battery attribute", () => {
    const data = home();
    data.states![door] = state(door, "off", { battery_level: 95 });
    const index = buildBatteryIndex(data);
    assert.equal(batteryPercent(index, data, door), 18);
  });

  it("falls back to battery_level when the device has no battery sensor", () => {
    const data = home();
    const index = buildBatteryIndex(data);
    assert.equal(batteryPercent(index, data, lock), 90);
    assert.equal(batteryPercent(index, data, "binary_sensor.missing"), null);
  });

  it("ignores unavailable, non-numeric, and other devices", () => {
    const data = home();
    const index = buildBatteryIndex(data);
    assert.equal(batteryPercent(index, data, "sensor.dead"), null);
    assert.equal(batteryPercent(index, data, "sensor.low_flag"), null);
    assert.equal(index.byDevice.get("device-other"), 80);
    assert.equal(batteryPercent(index, data, door), 18);
  });
});

describe("battery filter", () => {
  const door = "binary_sensor.door";
  const data = hass({
    states: {
      [door]: state(door, "off", { battery_level: 82 }),
      "binary_sensor.smoke": state("binary_sensor.smoke", "on", { battery_level: 41 }),
      "lock.front": state("lock.front", "unlocked", { battery_level: 18 }),
    },
  });
  const index = buildBatteryIndex(data);

  function shown(entityId: string, mode: BatteryMode): string | null {
    const reading = shownBattery(index, data, entityId, mode);
    return reading ? `${reading.percent}:${reading.level}` : null;
  }

  it("hides every percentage until a color is chosen", () => {
    assert.equal(shown(door, "off"), null);
    assert.equal(shown("binary_sensor.smoke", "off"), null);
    assert.equal(shown("lock.front", "off"), null);
  });

  it("shows every percentage in green, then drops green, then drops yellow", () => {
    assert.equal(shown(door, "green"), "82:green");
    assert.equal(shown("binary_sensor.smoke", "green"), "41:yellow");
    assert.equal(shown("lock.front", "green"), "18:red");

    assert.equal(shown(door, "yellow"), null);
    assert.equal(shown("binary_sensor.smoke", "yellow"), "41:yellow");
    assert.equal(shown("lock.front", "yellow"), "18:red");

    assert.equal(shown(door, "red"), null);
    assert.equal(shown("binary_sensor.smoke", "red"), null);
    assert.equal(shown("lock.front", "red"), "18:red");
  });
});
