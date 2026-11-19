import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ENTITY_ORDER_KEY_PREFIX,
  applyEntityOrderToSections,
  entityOrderKey,
  entityScopeMap,
  mergeEntityOrder,
  parseEntityOrder,
  setScopeEntityOrder,
} from "../src/entity-order";
import { buildPopupCards } from "../src/popup-cards";
import type { AreaSections, EntityState } from "../src/sections";

function emptySections(): AreaSections {
  return {
    climate: [],
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

describe("entityOrderKey and parseEntityOrder", () => {
  it("prefixes area id", () => {
    assert.equal(ENTITY_ORDER_KEY_PREFIX, "area-card-order:");
    assert.equal(entityOrderKey("kitchen"), "area-card-order:kitchen");
  });

  it("parses valid JSON or object and ignores malformed entries", () => {
    assert.deepEqual(
      parseEntityOrder(JSON.stringify({ lights: ["light.b", "light.a", "light.b", ""], bad: "nope" })),
      { lights: ["light.b", "light.a"] },
    );
    assert.deepEqual(parseEntityOrder(null), {});
    assert.deepEqual(parseEntityOrder("{"), {});
    assert.deepEqual(parseEntityOrder(["a"]), {});
  });
});

describe("mergeEntityOrder", () => {
  it("keeps saved order for existing entities, drops removed ones, and appends newly added ones", () => {
    assert.deepEqual(
      mergeEntityOrder(["light.a", "light.b", "light.c", "light.d"], ["light.c", "light.gone", "light.a"]),
      ["light.c", "light.a", "light.b", "light.d"],
    );
  });
});

describe("applyEntityOrderToSections and popup rendering", () => {
  it("reorders sections and device sensor subsections independently and merges new entities", () => {
    const sections: AreaSections = {
      ...emptySections(),
      lights: ["light.a", "light.b", "light.c"],
      switches: ["switch.1", "switch.2"],
      sensors: ["sensor.ungrouped_1", "sensor.ungrouped_2", "sensor.dryer_1", "sensor.dryer_2", "sensor.washer_1"],
      sensorDevices: {
        "sensor.dryer_1": { id: "dev-dryer", name: "Dryer" },
        "sensor.dryer_2": { id: "dev-dryer", name: "Dryer" },
        "sensor.washer_1": { id: "dev-washer", name: "Washer" },
      },
      selects: ["input_select.mode"],
      helpers: ["input_boolean.guest"],
    };

    const order = setScopeEntityOrder(
      setScopeEntityOrder({}, "lights", ["light.b", "light.a"]),
      "sensors:dev-dryer",
      ["sensor.dryer_2", "sensor.dryer_1"],
    );
    const withHelpers = setScopeEntityOrder(order, "helpers", ["input_boolean.guest", "input_select.mode"]);

    const ordered = applyEntityOrderToSections(sections, withHelpers);
    assert.deepEqual(ordered.lights, ["light.b", "light.a", "light.c"]);
    assert.deepEqual(ordered.switches, ["switch.1", "switch.2"]);
    assert.deepEqual(ordered.sensors, [
      "sensor.ungrouped_1",
      "sensor.ungrouped_2",
      "sensor.dryer_2",
      "sensor.dryer_1",
      "sensor.washer_1",
    ]);

    const scopes = entityScopeMap(sections);
    assert.equal(scopes.get("light.a"), "lights");
    assert.equal(scopes.get("sensor.ungrouped_1"), "sensors");
    assert.equal(scopes.get("sensor.dryer_1"), "sensors:dev-dryer");
    assert.equal(scopes.get("sensor.washer_1"), "sensors:dev-washer");

    const states: Record<string, EntityState> = {
      "light.a": { state: "off", attributes: { friendly_name: "A" } },
      "light.b": { state: "off", attributes: { friendly_name: "B" } },
      "light.c": { state: "off", attributes: { friendly_name: "C" } },
      "input_select.mode": { state: "Home", attributes: { friendly_name: "Mode", options: ["Home", "Away"] } },
      "input_boolean.guest": { state: "off", attributes: { friendly_name: "Guest" } },
    };
    const cards = buildPopupCards(ordered, states, "", new Set(), {
      viewportWidth: 1200,
      entityOrder: withHelpers,
    });
    const entities = cards.map((c) => c.entity).filter((e): e is string => typeof e === "string");
    assert.deepEqual(entities.slice(0, 3), ["light.b", "light.a", "light.c"]);
    const dryerIdx1 = entities.indexOf("sensor.dryer_2");
    const dryerIdx2 = entities.indexOf("sensor.dryer_1");
    assert.ok(dryerIdx1 !== -1 && dryerIdx2 === dryerIdx1 + 1);
    const helperIdx1 = entities.indexOf("input_boolean.guest");
    const helperIdx2 = entities.indexOf("input_select.mode");
    assert.ok(helperIdx1 !== -1 && helperIdx2 === helperIdx1 + 1);
  });
});
