import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { floorClimateSummary } from "../src/floor-climate";
import type { AreaSections, EntityState } from "../src/sections";

function emptySections(climate: string[] = []): AreaSections {
  return {
    climate,
    lights: [],
    lightLeds: {},
    mediaPlayers: [],
    cameras: [],
    switches: [],
    occupancy: [],
    openings: [],
    satellites: [],
    helpers: [],
    selects: [],
    automations: [],
    sensors: [],
    locks: [],
    vacuums: [],
    buttons: [],
    scenes: [],
    scripts: [],
  };
}

function sensor(state: string, deviceClass: string, unit?: string): EntityState {
  return {
    state,
    attributes: {
      device_class: deviceClass,
      ...(unit !== undefined ? { unit_of_measurement: unit } : {}),
    },
  };
}

describe("floorClimateSummary", () => {
  it("returns nulls when there are no numeric temperature or humidity sensors", () => {
    assert.deepEqual(
      floorClimateSummary([emptySections(["sensor.t1", "climate.thermostat"])], {
        "sensor.t1": sensor("unavailable", "temperature", "°F"),
        "climate.thermostat": { state: "heat", attributes: { device_class: "temperature" } },
      }),
      { temperature: null, humidity: null },
    );
  });

  it("computes medians for odd and even counts and formats with unit_of_measurement", () => {
    const areas = [
      emptySections(["sensor.t1", "sensor.h1"]),
      emptySections(["sensor.t2", "sensor.h2"]),
      emptySections(["sensor.t3"]),
    ];
    const states: Record<string, EntityState> = {
      "sensor.t1": sensor("68", "temperature", "°F"),
      "sensor.t2": sensor("75", "temperature", "°F"),
      "sensor.t3": sensor("71.5", "temperature", "°F"),
      "sensor.h1": sensor("40", "humidity", "%"),
      "sensor.h2": sensor("50", "humidity", "%"),
    };

    assert.deepEqual(floorClimateSummary(areas, states), {
      temperature: "71.5 °F",
      humidity: "45 %",
    });
  });

  it("ignores unknown/non-numeric sensors and deduplicates repeated entity ids", () => {
    const areas = [
      emptySections(["sensor.t1", "sensor.t_bad"]),
      emptySections(["sensor.t1", "sensor.t2"]),
    ];
    const states: Record<string, EntityState> = {
      "sensor.t1": sensor("70", "temperature", "°F"),
      "sensor.t2": sensor("74", "temperature", "°F"),
      "sensor.t_bad": sensor("unknown", "temperature", "°F"),
    };

    assert.deepEqual(floorClimateSummary(areas, states), {
      temperature: "72 °F",
      humidity: null,
    });
  });
});
