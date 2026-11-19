import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  floorCollapsedAreasKey,
  floorRuntimeConfig,
  floorSortByPresenceKey,
  parseFloorCollapsedAreas,
  parseFloorSortByPresence,
} from "../src/floor-state";
import { areasOnFloor, areasOnFloorByPresence, floorIds, floorsSortedByPresence } from "../src/floors";
import type { ClassifierHass, FloorEntry } from "../src/sections";

describe("floorIds", () => {
  it("returns undefined when floors is missing or undefined", () => {
    assert.equal(floorIds({}), undefined);
    assert.equal(floorIds({ floors: undefined }), undefined);
  });

  it("returns undefined when floors is null before the registry loads", () => {
    const hass = { floors: null } as unknown as ClassifierHass;
    assert.equal(floorIds(hass), undefined);
  });

  it("returns an empty list when the floor registry is empty", () => {
    assert.deepEqual(floorIds({ floors: {} }), []);
  });

  it("returns keys in insertion order when names are not alphabetical", () => {
    const hass: ClassifierHass = {
      floors: {
        zebra: { floor_id: "zebra", name: "Zebra" },
        apple: { floor_id: "apple", name: "Apple" },
      },
    };
    assert.deepEqual(floorIds(hass), ["zebra", "apple"]);
  });

  it("does not invent floors from areas", () => {
    const hass: ClassifierHass = {
      areas: {
        kitchen: { area_id: "kitchen", name: "Kitchen", floor_id: "downstairs" },
      },
    };
    assert.equal(floorIds(hass), undefined);
  });

  it("lists a floor that has no matching areas", () => {
    const hass: ClassifierHass = {
      floors: {
        attic: { floor_id: "attic", name: "Attic" },
      },
      areas: {
        kitchen: { area_id: "kitchen", name: "Kitchen", floor_id: "downstairs" },
      },
    };
    assert.deepEqual(floorIds(hass), ["attic"]);
  });

  it("ignores level and aliases and keeps insertion order", () => {
    const floors = {
      basement: { floor_id: "basement", name: "Basement", level: 0, aliases: ["lower"] },
      roof: { floor_id: "roof", name: "Roof", level: 3, aliases: ["top"] },
    } as unknown as Record<string, FloorEntry>;
    assert.deepEqual(floorIds({ floors }), ["basement", "roof"]);
  });
});

describe("floorRuntimeConfig", () => {
  it("defaults sortByPresence to true and collapsedAreas to 0", () => {
    assert.deepEqual(floorRuntimeConfig("down"), {
      floor: "down",
      type: "custom:vertical-stack-in-card",
      sortByPresence: true,
      collapsedAreas: 0,
    });
  });

  it("clamps collapsedAreas to a non-negative integer", () => {
    assert.equal(
      floorRuntimeConfig("down", { sortByPresence: false, collapsedAreas: -5 }).collapsedAreas,
      0,
    );
    assert.equal(floorRuntimeConfig("down", { collapsedAreas: 3.8 }).collapsedAreas, 3);
    assert.equal(floorRuntimeConfig("down", { collapsedAreas: Number.NaN }).collapsedAreas, 0);
    assert.equal(floorRuntimeConfig("down", { sortByPresence: false }).sortByPresence, false);
  });
});

describe("floor UI state parsers", () => {
  it("keys floor collapsed areas and sort-by-presence per floor", () => {
    assert.equal(floorCollapsedAreasKey("downstairs"), "area-card-floor-collapsed-areas:downstairs");
    assert.equal(floorSortByPresenceKey("downstairs"), "area-card-floor-sort-presence:downstairs");
  });

  it("parses collapsed areas counts and falls back cleanly", () => {
    assert.equal(parseFloorCollapsedAreas(undefined), 0);
    assert.equal(parseFloorCollapsedAreas("", 2), 2);
    assert.equal(parseFloorCollapsedAreas("3"), 3);
    assert.equal(parseFloorCollapsedAreas(-4), 0);
    assert.equal(parseFloorCollapsedAreas(2.9), 2);
  });

  it("parses sort-by-presence booleans and strings", () => {
    assert.equal(parseFloorSortByPresence(undefined), true);
    assert.equal(parseFloorSortByPresence(false), false);
    assert.equal(parseFloorSortByPresence("false"), false);
    assert.equal(parseFloorSortByPresence("true", false), true);
  });
});

describe("areasOnFloorByPresence", () => {
  const hass: ClassifierHass = {
    floors: {
      main: { floor_id: "main", name: "Main" },
    },
    areas: {
      den: { area_id: "den", name: "Den", floor_id: "main" },
      kitchen: { area_id: "kitchen", name: "Kitchen", floor_id: "main" },
      office: { area_id: "office", name: "Office", floor_id: "main" },
      pantry: { area_id: "pantry", name: "Pantry", floor_id: "main" },
      hall: { area_id: "hall", name: "Hall", floor_id: "main" },
    },
    entities: {
      "binary_sensor.den_occ": {
        entity_id: "binary_sensor.den_occ",
        area_id: "den",
      },
      "binary_sensor.kitchen_occ": {
        entity_id: "binary_sensor.kitchen_occ",
        area_id: "kitchen",
      },
      "binary_sensor.office_occ": {
        entity_id: "binary_sensor.office_occ",
        area_id: "office",
      },
      "binary_sensor.hall_occ": {
        entity_id: "binary_sensor.hall_occ",
        area_id: "hall",
      },
    },
    states: {
      "binary_sensor.den_occ": {
        entity_id: "binary_sensor.den_occ",
        state: "off",
        last_updated: "2026-11-18T12:00:00Z",
        attributes: { device_class: "occupancy" },
      },
      "binary_sensor.kitchen_occ": {
        entity_id: "binary_sensor.kitchen_occ",
        state: "on",
        last_updated: "2026-11-18T10:00:00Z",
        attributes: { device_class: "occupancy" },
      },
      "binary_sensor.office_occ": {
        entity_id: "binary_sensor.office_occ",
        state: "on",
        last_updated: "2026-11-18T11:00:00Z",
        attributes: { device_class: "occupancy" },
      },
      "binary_sensor.hall_occ": {
        entity_id: "binary_sensor.hall_occ",
        state: "off",
        last_updated: "2026-11-18T12:00:00Z",
        attributes: { device_class: "occupancy" },
      },
    },
  };

  it("sorts occupied areas first, then most recent lastChangedMs, then alphabetically", () => {
    assert.deepEqual(
      areasOnFloorByPresence(hass, "main").map((a) => a.areaId),
      ["office", "kitchen", "den", "hall", "pantry"],
    );
  });

  it("keeps alphabetical order when sortByPresence is false", () => {
    assert.deepEqual(
      areasOnFloor(hass, "main", false).map((a) => a.areaId),
      ["den", "hall", "kitchen", "office", "pantry"],
    );
  });
});

describe("floorsSortedByPresence", () => {
  const hass: ClassifierHass = {
    floors: {
      basement: { floor_id: "basement", name: "Basement" },
      upstairs: { floor_id: "upstairs", name: "Upstairs" },
      main: { floor_id: "main", name: "Main" },
      attic: { floor_id: "attic", name: "Attic" },
    },
    areas: {
      rec: { area_id: "rec", name: "Rec", floor_id: "basement" },
      bedroom: { area_id: "bedroom", name: "Bedroom", floor_id: "upstairs" },
      kitchen: { area_id: "kitchen", name: "Kitchen", floor_id: "main" },
    },
    entities: {
      "binary_sensor.rec_occ": {
        entity_id: "binary_sensor.rec_occ",
        area_id: "rec",
      },
      "binary_sensor.bedroom_occ": {
        entity_id: "binary_sensor.bedroom_occ",
        area_id: "bedroom",
      },
      "binary_sensor.kitchen_occ": {
        entity_id: "binary_sensor.kitchen_occ",
        area_id: "kitchen",
      },
    },
    states: {
      "binary_sensor.rec_occ": {
        entity_id: "binary_sensor.rec_occ",
        state: "off",
        last_updated: "2026-11-18T12:00:00Z",
        attributes: { device_class: "occupancy" },
      },
      "binary_sensor.bedroom_occ": {
        entity_id: "binary_sensor.bedroom_occ",
        state: "on",
        last_updated: "2026-11-18T09:00:00Z",
        attributes: { device_class: "occupancy" },
      },
      "binary_sensor.kitchen_occ": {
        entity_id: "binary_sensor.kitchen_occ",
        state: "on",
        last_updated: "2026-11-18T11:00:00Z",
        attributes: { device_class: "occupancy" },
      },
    },
  };

  it("preserves registry order when sortByPresence is false", () => {
    assert.deepEqual(floorsSortedByPresence(hass, false), [
      "basement",
      "upstairs",
      "main",
      "attic",
    ]);
  });

  it("sorts occupied floors first by most recent activity, preserving registry order on ties", () => {
    assert.deepEqual(floorsSortedByPresence(hass, true), [
      "main",
      "upstairs",
      "basement",
      "attic",
    ]);
  });
});
