import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  clearGroupMembershipCache,
  computeGroupSuggestions,
  createHelperGroup,
  groupIgnoreKey,
  loadRelatedGroupMemberships,
  parseGroupIgnores,
  serializeGroupIgnores,
  setGroupIgnore,
} from "../src/group-suggestions";
import { classifyArea, type ClassifierHass, type EntityState, type RegistryEntry } from "../src/sections";

function makeHass(options: {
  entities: RegistryEntry[];
  states: Record<string, EntityState>;
  devices?: ClassifierHass["devices"];
  areas?: ClassifierHass["areas"];
  user?: ClassifierHass["user"];
  callWS?: ClassifierHass["callWS"];
  callApi?: ClassifierHass["callApi"];
  fetchWithAuth?: ClassifierHass["fetchWithAuth"];
}): ClassifierHass {
  return {
    areas: options.areas ?? { office: { area_id: "office", name: "Office" } },
    entities: Object.fromEntries(options.entities.map((e) => [e.entity_id, e])),
    devices: options.devices ?? {},
    states: options.states,
    user: options.user ?? { id: "u1", is_admin: true },
    callWS: options.callWS,
    callApi: options.callApi,
    fetchWithAuth: options.fetchWithAuth,
  };
}

describe("group suggestions persistence helpers", () => {
  it("prefixes area id and parses/serializes ignores safely", () => {
    assert.equal(groupIgnoreKey("office"), "area-card-group-ignore:office");
    assert.deepEqual(parseGroupIgnores(null), {});
    assert.deepEqual(parseGroupIgnores("not json"), {});
    assert.deepEqual(
      parseGroupIgnores('{"lights":"fp1","bad":"","empty":123}'),
      { lights: "fp1" },
    );
    assert.deepEqual(
      serializeGroupIgnores({ z: "2", a: "1" }),
      { a: "1", z: "2" },
    );
  });
});

describe("computeGroupSuggestions", () => {
  afterEach(() => {
    clearGroupMembershipCache();
  });

  it("suggests a light group when multiple lights are not in a helper group", () => {
    const hass = makeHass({
      entities: [
        { entity_id: "light.a", area_id: "office", platform: "zha" },
        { entity_id: "light.b", area_id: "office", platform: "zha" },
        { entity_id: "light.c", area_id: "office", platform: "zha" },
      ],
      states: {
        "light.a": { state: "on", attributes: { friendly_name: "Lamp A" } },
        "light.b": { state: "off", attributes: { friendly_name: "Lamp B" } },
        "light.c": { state: "off", attributes: { friendly_name: "Lamp C" } },
      },
    });
    const sections = classifyArea(hass, "office");
    const suggestions = computeGroupSuggestions(hass, "office", "Office", sections);
    assert.equal(suggestions.length, 1);
    assert.equal(suggestions[0].sectionId, "lights");
    assert.equal(suggestions[0].groupType, "light");
    assert.equal(suggestions[0].defaultName, "Office Lights");
    assert.deepEqual(suggestions[0].candidateIds, ["light.a", "light.b", "light.c"]);
    assert.deepEqual(suggestions[0].suggestedIds, ["light.a", "light.b", "light.c"]);
  });

  it("does not suggest when fewer than two ungrouped lights remain", () => {
    const hass = makeHass({
      entities: [
        { entity_id: "light.a", area_id: "office", platform: "zha" },
        { entity_id: "light.b", area_id: "office", platform: "zha" },
        { entity_id: "light.c", area_id: "office", platform: "zha" },
        { entity_id: "light.closet_group", area_id: "office", platform: "group" },
      ],
      states: {
        "light.a": { state: "off", attributes: { friendly_name: "Closet Left" } },
        "light.b": { state: "off", attributes: { friendly_name: "Closet Right" } },
        "light.c": { state: "off", attributes: { friendly_name: "Desk Lamp" } },
        "light.closet_group": {
          state: "off",
          attributes: { friendly_name: "Closet Lights", entity_id: ["light.a", "light.b"] },
        },
      },
    });
    const sections = classifyArea(hass, "office");
    const suggestions = computeGroupSuggestions(hass, "office", "Office", sections);
    assert.deepEqual(suggestions, []);
  });

  it("pre-checks only ungrouped lights while keeping all lights selectable as candidates", () => {
    const hass = makeHass({
      entities: [
        { entity_id: "light.bed_l", area_id: "office", platform: "zha" },
        { entity_id: "light.bed_r", area_id: "office", platform: "zha" },
        { entity_id: "light.bed_group", area_id: "office", platform: "group" },
        { entity_id: "light.desk", area_id: "office", platform: "zha" },
        { entity_id: "light.overhead", area_id: "office", platform: "zha" },
      ],
      states: {
        "light.bed_l": { state: "off", attributes: { friendly_name: "Bed Left" } },
        "light.bed_r": { state: "off", attributes: { friendly_name: "Bed Right" } },
        "light.bed_group": {
          state: "off",
          attributes: { friendly_name: "Bed Lamps", entity_id: ["light.bed_l", "light.bed_r"] },
        },
        "light.desk": { state: "off", attributes: { friendly_name: "Desk" } },
        "light.overhead": { state: "off", attributes: { friendly_name: "Overhead" } },
      },
    });
    const sections = classifyArea(hass, "office");
    const suggestions = computeGroupSuggestions(hass, "office", "Office", sections);
    assert.equal(suggestions.length, 1);
    assert.deepEqual(suggestions[0].suggestedIds, ["light.desk", "light.overhead"]);
    assert.equal(suggestions[0].candidateIds.length, 5);
    assert.ok(suggestions[0].candidateIds.includes("light.bed_group"));
    assert.ok(suggestions[0].candidateIds.includes("light.bed_l"));
  });

  it("ignores house-wide multi-area groups but respects single-area groups with no area_id", () => {
    const hass = makeHass({
      areas: {
        office: { area_id: "office", name: "Office" },
        kitchen: { area_id: "kitchen", name: "Kitchen" },
      },
      entities: [
        { entity_id: "light.office_1", area_id: "office", platform: "zha" },
        { entity_id: "light.office_2", area_id: "office", platform: "zha" },
        { entity_id: "light.kitchen_1", area_id: "kitchen", platform: "zha" },
        { entity_id: "light.all_circadian", area_id: null, platform: "group" },
      ],
      states: {
        "light.office_1": { state: "off", attributes: { friendly_name: "Office 1" } },
        "light.office_2": { state: "off", attributes: { friendly_name: "Office 2" } },
        "light.kitchen_1": { state: "off", attributes: { friendly_name: "Kitchen 1" } },
        "light.all_circadian": {
          state: "off",
          attributes: { friendly_name: "Circadian", entity_id: ["light.office_1", "light.kitchen_1"] },
        },
      },
    });
    const sections = classifyArea(hass, "office");
    const suggestions = computeGroupSuggestions(hass, "office", "Office", sections);
    assert.equal(suggestions.length, 1);
    assert.deepEqual(suggestions[0].suggestedIds, ["light.office_1", "light.office_2"]);

    // If a no-area group only contains entities from office, it DOES count as related.
    hass.states!["light.all_circadian"].attributes.entity_id = ["light.office_1", "light.office_2"];
    assert.deepEqual(computeGroupSuggestions(hass, "office", "Office", sections), []);
  });

  it("uses search/related for unavailable group helpers whose entity_id attribute is absent", async () => {
    const wsCalls: Record<string, unknown>[] = [];
    const hass = makeHass({
      entities: [
        { entity_id: "light.hall_1", area_id: "office", platform: "zha" },
        { entity_id: "light.hall_2", area_id: "office", platform: "zha" },
        { entity_id: "light.hall_group", area_id: "office", platform: "group" },
      ],
      states: {
        "light.hall_1": { state: "unavailable", attributes: { friendly_name: "Hall 1" } },
        "light.hall_2": { state: "unavailable", attributes: { friendly_name: "Hall 2" } },
        "light.hall_group": { state: "unavailable", attributes: { friendly_name: "Hall Group" } },
      },
      callWS: async (msg) => {
        wsCalls.push(msg);
        return { group: ["light.hall_group"] };
      },
    });
    const sections = classifyArea(hass, "office");
    const memberships = await loadRelatedGroupMemberships(hass, "office", sections);
    assert.equal(wsCalls.length, 2);
    assert.deepEqual(
      computeGroupSuggestions(hass, "office", "Office", sections, {}, memberships),
      [],
    );

    // Cached on second call without hitting WS again
    await loadRelatedGroupMemberships(hass, "office", sections);
    assert.equal(wsCalls.length, 2);
  });

  it("does not treat an unavailable no-area house-wide group from search/related as an area group", () => {
    const hass = makeHass({
      entities: [
        { entity_id: "light.porch_1", area_id: "office", platform: "zha" },
        { entity_id: "light.porch_2", area_id: "office", platform: "zha" },
        { entity_id: "light.porch_3", area_id: "office", platform: "zha" },
        { entity_id: "light.music_lights", area_id: null, platform: "group" },
      ],
      states: {
        "light.porch_1": { state: "off", attributes: { friendly_name: "Porch 1" } },
        "light.porch_2": { state: "off", attributes: { friendly_name: "Porch 2" } },
        "light.porch_3": { state: "off", attributes: { friendly_name: "Porch 3" } },
        "light.music_lights": { state: "unavailable", attributes: { friendly_name: "Music Lights" } },
      },
    });
    const sections = classifyArea(hass, "office");
    const extraMemberships = new Map<string, readonly string[]>([
      ["light.porch_3", ["light.music_lights"]],
    ]);
    const suggestions = computeGroupSuggestions(hass, "office", "Office", sections, {}, extraMemberships);
    assert.equal(suggestions.length, 1);
    assert.deepEqual(suggestions[0].suggestedIds, ["light.porch_1", "light.porch_2", "light.porch_3"]);
  });

  it("suggests groups for occupancy, switches, openings (doors/windows/covers), media, and locks", () => {
    const hass = makeHass({
      entities: [
        { entity_id: "binary_sensor.motion_1", area_id: "office", platform: "zha", device_class: "motion" },
        { entity_id: "binary_sensor.presence_1", area_id: "office", platform: "zha", device_class: "occupancy" },
        { entity_id: "switch.fan", area_id: "office", platform: "zha" },
        { entity_id: "switch.heater", area_id: "office", platform: "zha" },
        { entity_id: "binary_sensor.door_l", area_id: "office", platform: "zha", device_class: "door" },
        { entity_id: "binary_sensor.door_r", area_id: "office", platform: "zha", device_class: "door" },
        { entity_id: "cover.shade_l", area_id: "office", platform: "zha" },
        { entity_id: "cover.shade_r", area_id: "office", platform: "zha" },
        { entity_id: "media_player.spkr_1", area_id: "office", platform: "sonos" },
        { entity_id: "media_player.spkr_2", area_id: "office", platform: "sonos" },
        { entity_id: "lock.front", area_id: "office", platform: "zwave" },
        { entity_id: "lock.back", area_id: "office", platform: "zwave" },
      ],
      states: {
        "binary_sensor.motion_1": { state: "off", attributes: { device_class: "motion", friendly_name: "Motion" } },
        "binary_sensor.presence_1": { state: "off", attributes: { device_class: "occupancy", friendly_name: "Presence" } },
        "switch.fan": { state: "off", attributes: { friendly_name: "Fan" } },
        "switch.heater": { state: "off", attributes: { friendly_name: "Heater" } },
        "binary_sensor.door_l": { state: "off", attributes: { device_class: "door", friendly_name: "Door L" } },
        "binary_sensor.door_r": { state: "off", attributes: { device_class: "door", friendly_name: "Door R" } },
        "cover.shade_l": { state: "closed", attributes: { friendly_name: "Shade L" } },
        "cover.shade_r": { state: "closed", attributes: { friendly_name: "Shade R" } },
        "media_player.spkr_1": { state: "idle", attributes: { friendly_name: "Speaker 1" } },
        "media_player.spkr_2": { state: "idle", attributes: { friendly_name: "Speaker 2" } },
        "lock.front": { state: "locked", attributes: { friendly_name: "Front" } },
        "lock.back": { state: "locked", attributes: { friendly_name: "Back" } },
      },
    });
    const sections = classifyArea(hass, "office");
    const suggestions = computeGroupSuggestions(hass, "office", "Office", sections);
    const bySection = Object.fromEntries(suggestions.map((s) => [s.sectionId, s]));

    assert.equal(bySection.occupancy.groupType, "binary_sensor");
    assert.equal(bySection.occupancy.defaultName, "Office Occupancy");
    assert.equal(bySection.occupancy.deviceClassFor?.(["binary_sensor.motion_1"]), "occupancy");

    assert.equal(bySection.switches.groupType, "switch");
    assert.equal(bySection.switches.defaultName, "Office Switches");

    assert.equal(bySection.openings.key, "openings:binary_sensor");
    assert.equal(bySection.openings.actionLabel, "Create opening group");
    assert.equal(bySection.openings.defaultName, "Office Doors");
    assert.equal(bySection.openings.deviceClassFor?.(["binary_sensor.door_l", "binary_sensor.door_r"]), "door");

    // Ignoring opening binary_sensors surfaces the cover group suggestion next.
    const afterIgnoreDoors = computeGroupSuggestions(
      hass,
      "office",
      "Office",
      sections,
      setGroupIgnore({}, bySection.openings.key, bySection.openings.fingerprint),
    );
    const coverSuggestion = afterIgnoreDoors.find((s) => s.sectionId === "openings");
    assert.equal(coverSuggestion?.key, "openings:cover");
    assert.equal(coverSuggestion?.groupType, "cover");
    assert.equal(coverSuggestion?.actionLabel, "Create cover group");
    assert.equal(coverSuggestion?.defaultName, "Office Covers");

    assert.equal(bySection.media.groupType, "media_player");
    assert.equal(bySection.media.defaultName, "Office Media Players");

    assert.equal(bySection.locks.groupType, "lock");
    assert.equal(bySection.locks.defaultName, "Office Locks");
  });

  it("suppresses ignored suggestions until section entities OR related helpers change", () => {
    const entities: RegistryEntry[] = [
      { entity_id: "light.a", area_id: "office", platform: "zha" },
      { entity_id: "light.b", area_id: "office", platform: "zha" },
      { entity_id: "light.c", area_id: "office", platform: "zha" },
    ];
    const states: Record<string, EntityState> = {
      "light.a": { state: "off", attributes: { friendly_name: "A" } },
      "light.b": { state: "off", attributes: { friendly_name: "B" } },
      "light.c": { state: "off", attributes: { friendly_name: "C" } },
    };
    let hass = makeHass({ entities, states });
    let sections = classifyArea(hass, "office");
    const first = computeGroupSuggestions(hass, "office", "Office", sections);
    assert.equal(first.length, 1);

    const ignores = setGroupIgnore({}, first[0].key, first[0].fingerprint);
    assert.deepEqual(computeGroupSuggestions(hass, "office", "Office", sections, ignores), []);

    // Adding a light resurfaces the suggestion
    const withFourth = makeHass({
      entities: [...entities, { entity_id: "light.d", area_id: "office", platform: "zha" }],
      states: { ...states, "light.d": { state: "off", attributes: { friendly_name: "D" } } },
    });
    const sectionsFourth = classifyArea(withFourth, "office");
    assert.equal(computeGroupSuggestions(withFourth, "office", "Office", sectionsFourth, ignores).length, 1);

    // Adding a related helper group (covering only 1 light, or a subset leaving 2+ ungrouped) resurfaces
    const withHelper = makeHass({
      entities: [
        ...entities,
        { entity_id: "light.d", area_id: "office", platform: "zha" },
        { entity_id: "light.pair", area_id: "office", platform: "group" },
      ],
      states: {
        ...states,
        "light.d": { state: "off", attributes: { friendly_name: "D" } },
        "light.pair": { state: "off", attributes: { friendly_name: "Pair", entity_id: ["light.a", "light.b"] } },
      },
    });
    const sectionsHelper = classifyArea(withHelper, "office");
    const afterHelper = computeGroupSuggestions(withHelper, "office", "Office", sectionsHelper, ignores);
    assert.equal(afterHelper.length, 1);
    assert.deepEqual(afterHelper[0].suggestedIds, ["light.c", "light.d"]);

    // Ignore again, then change the helper's member list -> resurfaces!
    const ignores2 = setGroupIgnore(ignores, afterHelper[0].key, afterHelper[0].fingerprint);
    assert.deepEqual(computeGroupSuggestions(withHelper, "office", "Office", sectionsHelper, ignores2), []);

    withHelper.states!["light.pair"].attributes.entity_id = ["light.a"];
    const afterHelperMemberChange = computeGroupSuggestions(withHelper, "office", "Office", sectionsHelper, ignores2);
    assert.equal(afterHelperMemberChange.length, 1);
    assert.deepEqual(afterHelperMemberChange[0].suggestedIds, ["light.b", "light.c", "light.d"]);
  });

  it("hides suggestions for non-admin users", () => {
    const hass = makeHass({
      user: { id: "u2", is_admin: false },
      entities: [
        { entity_id: "light.a", area_id: "office", platform: "zha" },
        { entity_id: "light.b", area_id: "office", platform: "zha" },
      ],
      states: {
        "light.a": { state: "off", attributes: { friendly_name: "A" } },
        "light.b": { state: "off", attributes: { friendly_name: "B" } },
      },
    });
    const sections = classifyArea(hass, "office");
    assert.deepEqual(computeGroupSuggestions(hass, "office", "Office", sections), []);
  });
});

describe("createHelperGroup", () => {
  it("runs the group config flow and assigns area_id and device_class", async () => {
    const apiCalls: Array<{ method: string; path: string; body?: Record<string, unknown> }> = [];
    const wsCalls: Record<string, unknown>[] = [];
    const hass = makeHass({
      entities: [],
      states: {},
      callApi: async (method, path, parameters) => {
        apiCalls.push({ method, path, body: parameters });
        if (path === "config/config_entries/flow") {
          return { flow_id: "flow-1", type: "menu" } as never;
        }
        if (parameters?.next_step_id) {
          return { flow_id: "flow-1", type: "form", step_id: parameters.next_step_id } as never;
        }
        return { type: "create_entry", result: { entry_id: "entry-99" } } as never;
      },
      callWS: async (msg) => {
        wsCalls.push(msg);
        if (msg.type === "config/entity_registry/list") {
          return [
            {
              entity_id: "binary_sensor.office_occupancy",
              config_entry_id: "entry-99",
              platform: "group",
            },
          ];
        }
        return {};
      },
    });

    const created = await createHelperGroup(hass, {
      groupType: "binary_sensor",
      name: "Office Occupancy",
      entities: ["binary_sensor.a", "binary_sensor.b"],
      areaId: "office",
      hideMembers: true,
      deviceClass: "occupancy",
    });

    assert.deepEqual(created, { entryId: "entry-99", entityId: "binary_sensor.office_occupancy" });
    assert.deepEqual(apiCalls, [
      {
        method: "POST",
        path: "config/config_entries/flow",
        body: { handler: "group", show_advanced_options: true },
      },
      {
        method: "POST",
        path: "config/config_entries/flow/flow-1",
        body: { next_step_id: "binary_sensor" },
      },
      {
        method: "POST",
        path: "config/config_entries/flow/flow-1",
        body: {
          name: "Office Occupancy",
          entities: ["binary_sensor.a", "binary_sensor.b"],
          hide_members: true,
          all: false,
        },
      },
    ]);
    assert.deepEqual(wsCalls, [
      { type: "config/entity_registry/list" },
      {
        type: "config/entity_registry/update",
        entity_id: "binary_sensor.office_occupancy",
        area_id: "office",
        device_class: "occupancy",
      },
    ]);
  });

  it("omits 'all' for cover/lock/media_player groups and aborts flow on error", async () => {
    const apiCalls: Array<{ method: string; path: string; body?: Record<string, unknown> }> = [];
    const hass = makeHass({
      entities: [],
      states: {},
      callApi: async (method, path, parameters) => {
        apiCalls.push({ method, path, body: parameters });
        if (method === "DELETE") return {} as never;
        if (path === "config/config_entries/flow") return { flow_id: "flow-2", type: "menu" } as never;
        if (parameters?.next_step_id) return { flow_id: "flow-2", type: "form" } as never;
        return { type: "form", errors: { name: "already_exists" } } as never;
      },
    });

    await assert.rejects(
      createHelperGroup(hass, {
        groupType: "cover",
        name: "Office Covers",
        entities: ["cover.a", "cover.b"],
        areaId: "office",
        hideMembers: false,
      }),
      /already_exists/,
    );

    assert.deepEqual(apiCalls[2].body, {
      name: "Office Covers",
      entities: ["cover.a", "cover.b"],
      hide_members: false,
    });
    assert.deepEqual(apiCalls[3], {
      method: "DELETE",
      path: "config/config_entries/flow/flow-2",
      body: undefined,
    });
  });
});
