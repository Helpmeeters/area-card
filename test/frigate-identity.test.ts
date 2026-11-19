import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { computeCameraDetectionBadges } from "../src/camera-detections";
import { sectionTooltipCards } from "../src/dot-tooltip";
import { pairHalfWidthCards } from "../src/popup-cards";
import {
  cachedEventsMap,
  countUnreviewedFrigateItems,
  ensureFrigateEvents,
  extractSubLabel,
  formatPersonBadgeTitle,
  frigateReviewQueueUrl,
  getCachedFrigateReviews,
  getFrigateCameraRef,
  parseFrigateEvents,
  resetFrigateIdentityCacheForTests,
  selectAreaPresenceIdentities,
  selectCameraPersonIdentities,
  subscribeFrigateEvents,
  type FrigateEvent,
} from "../src/frigate-identity";
import type { AreaSections, ClassifierHass, EntityState } from "../src/sections";

function state(entityId: string, val: string, attributes: Record<string, unknown> = {}, lastChanged?: string): EntityState {
  return {
    entity_id: entityId,
    state: val,
    attributes,
    ...(lastChanged ? { last_changed: lastChanged } : {}),
  } as EntityState;
}

describe("Frigate identity decoration", () => {
  beforeEach(() => {
    resetFrigateIdentityCacheForTests();
  });

  it("detects Frigate cameras from client_id and camera_name attributes", () => {
    const states = {
      "camera.mac_webcam": state("camera.mac_webcam", "recording", {
        client_id: "frigate",
        camera_name: "mac_webcam",
      }),
      "camera.generic": state("camera.generic", "idle", {}),
    };
    assert.deepEqual(getFrigateCameraRef("camera.mac_webcam", states), {
      entityId: "camera.mac_webcam",
      instanceId: "frigate",
      cameraName: "mac_webcam",
    });
    assert.equal(getFrigateCameraRef("camera.generic", states), null);
  });

  it("parses JSON-stringified and tuple sub_label Frigate events", () => {
    const raw = JSON.stringify([
      { camera: "mac_webcam", label: "person", sub_label: "Iffat", start_time: 100, end_time: null },
      { camera: "mac_webcam", label: "person", sub_label: ["Drew", 0.94], start_time: 90, end_time: null },
      { camera: "mac_webcam", label: "dog", sub_label: "Rex", start_time: 95, end_time: null },
    ]);
    const events = parseFrigateEvents(raw);
    assert.equal(events.length, 3);
    assert.equal(extractSubLabel(events[0].sub_label), "Iffat");
    assert.equal(extractSubLabel(events[1].sub_label), "Drew");
    assert.equal(extractSubLabel("  "), null);
  });

  it("selects active person identities and falls back to recent cooldown window", () => {
    const nowMs = 1_700_000_000_000;
    const nowSec = nowMs / 1000;
    const events: FrigateEvent[] = [
      { camera: "mac_webcam", label: "person", sub_label: "Iffat", start_time: nowSec - 10, end_time: null },
      { camera: "mac_webcam", label: "person", sub_label: "Drew", start_time: nowSec - 20, end_time: null },
      { camera: "other_cam", label: "person", sub_label: "Guest", start_time: nowSec - 5, end_time: null },
    ];
    assert.deepEqual(selectCameraPersonIdentities(events, "mac_webcam", { nowMs }), ["Iffat", "Drew"]);

    const endedRecently: FrigateEvent[] = [
      { camera: "mac_webcam", label: "person", sub_label: "Drew", start_time: nowSec - 40, end_time: nowSec - 15 },
      { camera: "mac_webcam", label: "person", sub_label: "Old", start_time: nowSec - 600, end_time: nowSec - 500 },
    ];
    assert.deepEqual(selectCameraPersonIdentities(endedRecently, "mac_webcam", { nowMs }), ["Drew"]);
  });

  it("selects area presence identities for occupied and recently-cleared states", () => {
    const nowMs = 1_700_000_000_000;
    const nowSec = nowMs / 1000;
    const refs = [{ entityId: "camera.mac_webcam", instanceId: "frigate", cameraName: "mac_webcam" }];
    const occupancy = [{ entityId: "binary_sensor.mac_webcam_person_occupancy" }];
    const eventsByInstance = new Map<string, FrigateEvent[]>([
      [
        "frigate",
        [
          { camera: "mac_webcam", label: "person", sub_label: "Iffat", start_time: nowSec - 300, end_time: nowSec - 200 },
          { camera: "mac_webcam", label: "person", sub_label: "Drew", start_time: nowSec - 290, end_time: nowSec - 190 },
        ],
      ],
    ]);

    // Occupied without active/recent events -> null (no stale identities shown as present)
    const occupiedStates = {
      "binary_sensor.mac_webcam_person_occupancy": state(
        "binary_sensor.mac_webcam_person_occupancy",
        "on",
        {},
        new Date(nowMs - 10_000).toISOString(),
      ),
    };
    assert.equal(selectAreaPresenceIdentities(eventsByInstance, refs, occupancy, occupiedStates, nowMs), null);

    // Cleared -> shows last recognized co-occurring identities
    const clearStates = {
      "binary_sensor.mac_webcam_person_occupancy": state(
        "binary_sensor.mac_webcam_person_occupancy",
        "off",
        {},
        new Date(nowMs - 190_000).toISOString(),
      ),
    };
    assert.deepEqual(selectAreaPresenceIdentities(eventsByInstance, refs, occupancy, clearStates, nowMs), {
      names: ["Drew", "Iffat"],
      occupied: false,
    });
  });

  it("decorates camera person badge title and hasIdentity flag", () => {
    assert.equal(formatPersonBadgeTitle(1, ["Drew"]), "Person: Drew");
    assert.equal(formatPersonBadgeTitle(2, ["Drew", "Iffat"]), "Person: Drew, Iffat");
    assert.equal(formatPersonBadgeTitle(3, ["Drew"]), "Person: 3 (Drew)");
    assert.equal(formatPersonBadgeTitle(2, []), "Person: 2");

    const badges = computeCameraDetectionBadges(
      {
        totalCountEntityId: "sensor.mac_webcam_all_count",
        classes: [
          {
            name: "person",
            occupancyEntityId: "binary_sensor.mac_webcam_person_occupancy",
            countEntityId: "sensor.mac_webcam_person_count",
          },
        ],
      },
      {
        "sensor.mac_webcam_all_count": state("sensor.mac_webcam_all_count", "1"),
        "binary_sensor.mac_webcam_person_occupancy": state("binary_sensor.mac_webcam_person_occupancy", "on"),
        "sensor.mac_webcam_person_count": state("sensor.mac_webcam_person_count", "1"),
      },
      { personNames: ["Iffat"] },
    );
    assert.equal(badges.classes[0].title, "Person: Iffat");
    assert.equal(badges.classes[0].hasIdentity, true);
    assert.equal(badges.classes[0].countText, "Iffat");
  });

  it("uses unreviewed Frigate review count when review_status is NONE and builds review URL", () => {
    const unreviewed = countUnreviewedFrigateItems(
      [
        { camera: "mac_webcam", has_been_reviewed: false },
        { camera: "mac_webcam", has_been_reviewed: false },
        { camera: "mac_webcam", has_been_reviewed: true },
        { camera: "other_cam", has_been_reviewed: false },
      ],
      "mac_webcam",
    );
    assert.equal(unreviewed, 2);

    const badges = computeCameraDetectionBadges(
      {
        reviewStatusEntityId: "sensor.mac_webcam_review_status",
        classes: [],
      },
      {
        "sensor.mac_webcam_review_status": state("sensor.mac_webcam_review_status", "NONE"),
      },
      { unreviewedCount: unreviewed },
    );
    assert.equal(badges.reviewStatus?.active, true);
    assert.equal(badges.reviewStatus?.text, "2");
    assert.equal(badges.reviewStatus?.title, "Review queue: 2 awaiting review");
    assert.equal(frigateReviewQueueUrl({ protocol: "http:", hostname: "treetop" }), "http://treetop:5000/review");
  });

  it("appends identity card to occupancy tooltip when presenceIdentity is present", () => {
    const sections: AreaSections = {
      climate: [],
      lights: [],
      lightLeds: {},
      mediaPlayers: [],
      cameras: ["camera.mac_webcam"],
      cameraDetections: {},
      switches: [],
      occupancy: [{ entityId: "binary_sensor.mac_webcam_person_occupancy" }],
      openings: [],
      satellites: [],
      satelliteDevices: [],
      sensors: [],
      sensorDevices: [],
      absorbedSensors: {},
      locks: [],
      vacuums: [],
      buttons: [],
      scenes: [],
      scripts: [],
      helpers: [],
      selects: [],
      automations: [],
    };
    const states = {
      "binary_sensor.mac_webcam_person_occupancy": state("binary_sensor.mac_webcam_person_occupancy", "on", {
        friendly_name: "Mac Webcam Person occupancy",
      }),
    };
    const cards = sectionTooltipCards("occupancy", {
      sections,
      states,
      roomName: "Office",
      literalState: true,
      presenceIdentity: { names: ["Drew", "Iffat"], occupied: true },
    });
    assert.ok(cards);
    const last = cards[cards.length - 1];
    assert.equal(last.icon, "mdi:face-recognition");
    assert.equal(last.primary, "Recognized");
    assert.equal(last.secondary, "Drew, Iffat");
    assert.equal(last.icon_color, "blue");
    assert.deepEqual(last.grid_options, { columns: 6 });
  });

  it("pairs half-width cards separated by a full-width card", () => {
    const half1 = { id: "h1", grid_options: { columns: 6 } };
    const full = { id: "f1", grid_options: { columns: 12 } };
    const half2 = { id: "h2", grid_options: { columns: 6 } };
    assert.deepEqual(
      pairHalfWidthCards([half1, full, half2]).map((c) => c.id),
      ["h1", "h2", "f1"],
    );
  });

  it("fetches frigate/events/get once, caches, and notifies subscribers", async () => {
    let calls = 0;
    const hass: ClassifierHass = {
      states: {},
      areas: {},
      entities: {},
      devices: {},
      callWS: async (msg) => {
        calls++;
        if (msg.type === "frigate/events/get") {
          return JSON.stringify([
            { camera: "mac_webcam", label: "person", sub_label: "Drew", start_time: 100, end_time: null },
          ]);
        }
        assert.equal(msg.type, "frigate/reviews/get");
        return JSON.stringify([
          { camera: "mac_webcam", has_been_reviewed: false, severity: "alert" },
        ]);
      },
    };
    const refs = [{ entityId: "camera.mac_webcam", instanceId: "frigate", cameraName: "mac_webcam" }];
    let notified = 0;
    const unsub = subscribeFrigateEvents(["frigate"], () => {
      notified++;
    });

    ensureFrigateEvents(hass, refs, "k1", 10_000);
    await new Promise((r) => setTimeout(r, 10));

    assert.equal(calls, 2);
    assert.equal(notified, 1);
    assert.equal(cachedEventsMap(refs).get("frigate")?.length, 1);
    assert.equal(getCachedFrigateReviews("frigate").length, 1);

    // Same trigger within TTL does not re-fetch
    ensureFrigateEvents(hass, refs, "k1", 15_000);
    assert.equal(calls, 2);

    unsub();
  });
});
