import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { areaPresenceInfo, comparePresence, floorPresenceInfo, formatPresenceBadge } from "../src/presence";
import type { AreaSections, EntityState } from "../src/sections";

const NOW = Date.parse("2026-11-18T12:00:00Z");

function sensor(state: string, lastUpdatedIso?: string): EntityState {
  return {
    state,
    attributes: {},
    ...(lastUpdatedIso ? { last_updated: lastUpdatedIso } : {}),
  };
}

describe("areaPresenceInfo", () => {
  it("returns hasSensors false when occupancyItems is empty", () => {
    assert.deepEqual(areaPresenceInfo([], {}), {
      hasSensors: false,
      occupied: false,
      lastChangedMs: null,
    });
  });

  it("detects occupied state and latest timestamp across occupancy sensors", () => {
    const info = areaPresenceInfo(
      [{ entityId: "binary_sensor.motion_1" }, { entityId: "binary_sensor.motion_2" }],
      {
        "binary_sensor.motion_1": sensor("off", "2026-11-18T11:50:00Z"),
        "binary_sensor.motion_2": sensor("on", "2026-11-18T11:55:00Z"),
      },
    );
    assert.deepEqual(info, {
      hasSensors: true,
      occupied: true,
      lastChangedMs: Date.parse("2026-11-18T11:55:00Z"),
    });
  });

  it("returns unoccupied with latest timestamp when all sensors are off", () => {
    const info = areaPresenceInfo([{ entityId: "binary_sensor.motion_1" }], {
      "binary_sensor.motion_1": sensor("off", "2026-11-18T11:55:00Z"),
    });
    assert.deepEqual(info, {
      hasSensors: true,
      occupied: false,
      lastChangedMs: Date.parse("2026-11-18T11:55:00Z"),
    });
  });
});

describe("formatPresenceBadge", () => {
  it("returns null when no sensors", () => {
    assert.equal(formatPresenceBadge({ hasSensors: false, occupied: false, lastChangedMs: null }, NOW), null);
  });

  it("returns Clear when sensors exist without a timestamp while idle", () => {
    assert.deepEqual(
      formatPresenceBadge({ hasSensors: true, occupied: false, lastChangedMs: null }, NOW),
      { text: "Clear", occupied: false },
    );
  });

  it("returns Occupied when occupied", () => {
    assert.deepEqual(
      formatPresenceBadge({ hasSensors: true, occupied: true, lastChangedMs: null }, NOW),
      { text: "Occupied", occupied: true },
    );
  });

  it("formats relative idle durations", () => {
    assert.deepEqual(
      formatPresenceBadge({ hasSensors: true, occupied: false, lastChangedMs: NOW - 25_000 }, NOW),
      { text: "Just now", occupied: false },
    );
    assert.deepEqual(
      formatPresenceBadge({ hasSensors: true, occupied: false, lastChangedMs: NOW - 5 * 60_000 }, NOW),
      { text: "5m ago", occupied: false },
    );
    assert.deepEqual(
      formatPresenceBadge({ hasSensors: true, occupied: false, lastChangedMs: NOW - 2 * 3_600_000 }, NOW),
      { text: "2h ago", occupied: false },
    );
    assert.deepEqual(
      formatPresenceBadge({ hasSensors: true, occupied: false, lastChangedMs: NOW - 3 * 86_400_000 }, NOW),
      { text: "3d ago", occupied: false },
    );
  });
});

describe("comparePresence", () => {
  it("orders occupied first, then lastChangedMs descending, and 0 on tie", () => {
    const occRecent = { hasSensors: true, occupied: true, lastChangedMs: 200 };
    const occOlder = { hasSensors: true, occupied: true, lastChangedMs: 100 };
    const idleRecent = { hasSensors: true, occupied: false, lastChangedMs: 300 };
    const idleOlder = { hasSensors: true, occupied: false, lastChangedMs: 50 };
    const idleNone = { hasSensors: false, occupied: false, lastChangedMs: null };

    assert.ok(comparePresence(occOlder, idleRecent) < 0);
    assert.ok(comparePresence(idleRecent, occOlder) > 0);
    assert.ok(comparePresence(occRecent, occOlder) < 0);
    assert.ok(comparePresence(idleRecent, idleOlder) < 0);
    assert.ok(comparePresence(idleOlder, idleNone) < 0);
    assert.equal(comparePresence(idleNone, { ...idleNone }), 0);
    assert.equal(comparePresence(occRecent, { ...occRecent }), 0);
  });
});

function emptyArea(): AreaSections {
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

describe("floorPresenceInfo", () => {
  it("aggregates occupancy sensors across areas on a floor", () => {
    const areaA = { ...emptyArea(), occupancy: [{ entityId: "binary_sensor.a_motion" }] };
    const areaB = { ...emptyArea(), occupancy: [{ entityId: "binary_sensor.b_motion" }] };
    const info = floorPresenceInfo([areaA, areaB], {
      "binary_sensor.a_motion": sensor("off", "2026-11-18T11:50:00Z"),
      "binary_sensor.b_motion": sensor("on", "2026-11-18T11:55:00Z"),
    });
    assert.deepEqual(info, {
      hasSensors: true,
      occupied: true,
      lastChangedMs: Date.parse("2026-11-18T11:55:00Z"),
    });
  });

  it("returns Clear via formatPresenceBadge when floor sensors have no timestamp", () => {
    const areaA = { ...emptyArea(), occupancy: [{ entityId: "binary_sensor.a_motion" }] };
    const info = floorPresenceInfo([areaA], {
      "binary_sensor.a_motion": sensor("off"),
    });
    assert.deepEqual(formatPresenceBadge(info, NOW), { text: "Clear", occupied: false });
  });

  it("returns hasSensors false when no area on the floor has occupancy sensors", () => {
    const info = floorPresenceInfo([emptyArea(), emptyArea()], {});
    assert.deepEqual(info, {
      hasSensors: false,
      occupied: false,
      lastChangedMs: null,
    });
    assert.equal(formatPresenceBadge(info, NOW), null);
  });
});
