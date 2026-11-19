import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  automationStateText,
  automationSubtitleSegments,
  helperStateText,
  placeAutomationSubtitle,
} from "../src/automation-subtitle";
import { buildButtonConfig } from "../src/button-config";
import { climateSubtitle } from "../src/climate-subtitle";
import { floorExpandedKey, floorRuntimeConfig, parseFloorExpanded } from "../src/floor-state";
import { areasOnFloor, floorDisplay } from "../src/floors";
import { stripRoomName } from "../src/names";
import { areaDotTooltipCards, tooltipPosition } from "../src/dot-tooltip";
import { buildPopupCards, buildPopupConfig } from "../src/popup-cards";
import { collapsedDotSlots, dotTooltipLabel, floorDotRow, iconInk, parseHideSections, ROLLUP_ORDER, rollupLabel, sectionColor, sectionHasEntities, sectionIcon, sectionRollups, sectionTitle, withoutSections, type RollupId } from "../src/rollups";
import {
  areaDisplay,
  areaUnavailable,
  classifyArea,
  emptySections,
  type AreaEntry,
  type AreaSections,
  type ClassifierHass,
  type DeviceEntry,
  type EntityState,
  type FloorEntry,
  type RegistryEntry,
} from "../src/sections";

interface Fixture {
  entities?: RegistryEntry[];
  devices?: DeviceEntry[];
  states?: Record<string, EntityState>;
  areas?: Record<string, AreaEntry>;
}

function state(entityId: string, value: string, attributes: Record<string, unknown> = {}): EntityState {
  return { entity_id: entityId, state: value, attributes };
}

function withKioskElements(defined: readonly string[], run: () => void): void {
  const host = globalThis as unknown as { customElements?: { get(name: string): unknown } };
  const previous = host.customElements;
  const names = new Set(defined);
  host.customElements = {
    get(name: string) {
      return names.has(name) ? function KioskSatelliteCard() {} : undefined;
    },
  };
  try {
    run();
  } finally {
    if (previous) host.customElements = previous;
    else delete host.customElements;
  }
}

function hass(fixture: Fixture): ClassifierHass {
  const entities: Record<string, RegistryEntry> = {};
  const states: Record<string, EntityState> = {};
  for (const entry of fixture.entities ?? []) {
    entities[entry.entity_id] = entry;
    states[entry.entity_id] = fixture.states?.[entry.entity_id] ?? state(entry.entity_id, "off");
  }
  for (const [id, value] of Object.entries(fixture.states ?? {})) {
    states[id] = value;
  }
  const devices: Record<string, DeviceEntry> = {};
  for (const device of fixture.devices ?? []) devices[device.id] = device;
  return { entities, devices, states, areas: fixture.areas };
}

interface FakeNode {
  tag: string;
  className: string;
  textContent: string;
  attrs: Record<string, string>;
  styleMap: Record<string, string>;
  style: { setProperty(name: string, value: string): void };
  setAttribute(name: string, value: string): void;
}

function placeHost(initial: string) {
  const kids: FakeNode[] = [];
  let raw: string | null = initial;
  let replacements = 0;
  return {
    get kids() {
      return kids;
    },
    get replacements() {
      return replacements;
    },
    get textContent() {
      if (raw !== null) return raw;
      return kids.map((node) => node.textContent).join("");
    },
    ownerDocument: {
      createElement(tag: string): FakeNode {
        const styleMap: Record<string, string> = {};
        const node: FakeNode = {
          tag,
          className: "",
          textContent: "",
          attrs: {},
          styleMap,
          style: {
            setProperty(name: string, value: string) {
              styleMap[name] = value;
            },
          },
          setAttribute(name: string, value: string) {
            node.attrs[name] = value;
          },
        };
        return node;
      },
      createTextNode(text: string): FakeNode {
        return {
          tag: "#text",
          className: "",
          textContent: text,
          attrs: {},
          styleMap: {},
          style: { setProperty() {} },
          setAttribute() {},
        };
      },
    },
    replaceChildren(...nodes: FakeNode[]) {
      kids.splice(0, kids.length, ...nodes);
      raw = null;
      replacements += 1;
    },
    style: { removeProperty() {} },
  };
}

describe("classifyArea", () => {
  it("drops hidden entities and keeps a visible light", () => {
    const result = classifyArea(
      hass({
        entities: [
          { entity_id: "light.hidden_lamp", area_id: "bedroom", hidden_by: "user" },
          { entity_id: "light.reading_lamp", area_id: "bedroom" },
        ],
      }),
      "bedroom",
    );
    assert.deepEqual(result.lights, ["light.reading_lamp"]);
  });

  it("drops diagnostic and config lights", () => {
    const result = classifyArea(
      hass({
        entities: [
          { entity_id: "light.diag", area_id: "bedroom", entity_category: "diagnostic" },
          { entity_id: "light.config", area_id: "bedroom", entity_category: "config" },
          { entity_id: "light.reading_lamp", area_id: "bedroom" },
        ],
      }),
      "bedroom",
    );
    assert.deepEqual(result.lights, ["light.reading_lamp"]);
  });

  it("drops satellite LEDs by led_control and by kiosk satellite manufacturer", () => {
    const result = classifyArea(
      hass({
        devices: [
          { id: "updoot", area_id: "bedroom", manufacturer: "ESPhome" },
          { id: "kiosk", area_id: "bedroom", manufacturer: "Kiosk Satellite" },
        ],
        entities: [
          { entity_id: "light.updoot_led_control_idle", device_id: "updoot" },
          { entity_id: "light.updoot2_led_control_idle", device_id: "kiosk" },
          { entity_id: "light.kiosk_spot", device_id: "kiosk" },
          { entity_id: "light.reading_lamp", area_id: "bedroom" },
          { entity_id: "assist_satellite.updoot", device_id: "updoot" },
          { entity_id: "switch.kiosk_relay", device_id: "kiosk" },
        ],
      }),
      "bedroom",
    );
    assert.deepEqual(result.lights, ["light.reading_lamp"]);
    assert.deepEqual(result.switches, []);
    assert.deepEqual(result.satellites, [
      { entityId: "assist_satellite.updoot", deviceId: "updoot", ledEntityId: "light.updoot_led_control_idle" },
    ]);
  });

  it("rolls a same-device pressure sensor into occupancy and keeps it off status", () => {
    const result = classifyArea(
      hass({
        devices: [{ id: "chair", area_id: "office_of_drew" }],
        entities: [
          { entity_id: "binary_sensor.office_chair", device_id: "chair" },
          { entity_id: "sensor.office_chair_pressure", device_id: "chair", entity_category: "diagnostic" },
          { entity_id: "sensor.office_temperature", area_id: "office_of_drew" },
          { entity_id: "sensor.office_humidity", area_id: "office_of_drew" },
        ],
        states: {
          "binary_sensor.office_chair": state("binary_sensor.office_chair", "on", {
            device_class: "occupancy",
            friendly_name: "Office Chair",
          }),
          "sensor.office_chair_pressure": state("sensor.office_chair_pressure", "42", {
            device_class: "pressure",
            unit_of_measurement: "hPa",
          }),
          "sensor.office_temperature": state("sensor.office_temperature", "21", { device_class: "temperature" }),
          "sensor.office_humidity": state("sensor.office_humidity", "40", { device_class: "humidity" }),
        },
      }),
      "office_of_drew",
    );
    assert.deepEqual(result.occupancy, [
      { entityId: "binary_sensor.office_chair", pressureEntityId: "sensor.office_chair_pressure" },
    ]);
    assert.deepEqual(result.climate, ["sensor.office_humidity", "sensor.office_temperature"]);
  });

  it("uses the device area when the entity area is unset, and the entity area when both are set", () => {
    const result = classifyArea(
      hass({
        devices: [
          { id: "desk", area_id: "office_of_drew" },
          { id: "lamp", area_id: "bedroom" },
        ],
        entities: [
          { entity_id: "light.desk_lamp", device_id: "desk", area_id: null },
          { entity_id: "light.reading_lamp", device_id: "lamp", area_id: "bedroom" },
          { entity_id: "light.moved", device_id: "lamp", area_id: "office_of_drew" },
        ],
      }),
      "office_of_drew",
    );
    assert.deepEqual(result.lights, ["light.desk_lamp", "light.moved"]);

    const bedroom = classifyArea(
      hass({
        devices: [{ id: "lamp", area_id: "bedroom" }],
        entities: [
          { entity_id: "light.reading_lamp", device_id: "lamp", area_id: "bedroom" },
          { entity_id: "light.moved", device_id: "lamp", area_id: "office_of_drew" },
        ],
      }),
      "bedroom",
    );
    assert.deepEqual(bedroom.lights, ["light.reading_lamp"]);
  });

  it("reads device class from state attributes and files other binary sensors under sensors", () => {
    const result = classifyArea(
      hass({
        entities: [
          { entity_id: "binary_sensor.motion", area_id: "bedroom" },
          { entity_id: "binary_sensor.door", area_id: "bedroom" },
          { entity_id: "binary_sensor.helpmeet_something", area_id: "bedroom" },
          { entity_id: "cover.shade", area_id: "bedroom" },
          { entity_id: "binary_sensor.diag_contact", area_id: "bedroom", entity_category: "diagnostic" },
        ],
        states: {
          "binary_sensor.motion": state("binary_sensor.motion", "off", { device_class: "motion" }),
          "binary_sensor.door": state("binary_sensor.door", "off", { device_class: "door" }),
          "binary_sensor.helpmeet_something": state("binary_sensor.helpmeet_something", "off", {
            device_class: "connectivity",
          }),
          "cover.shade": state("cover.shade", "closed"),
          "binary_sensor.diag_contact": state("binary_sensor.diag_contact", "off", { device_class: "connectivity" }),
        },
      }),
      "bedroom",
    );
    assert.deepEqual(result.occupancy.map((item) => item.entityId), ["binary_sensor.motion"]);
    assert.deepEqual(result.openings, ["binary_sensor.door", "cover.shade"]);
    assert.deepEqual(result.sensors, ["binary_sensor.helpmeet_something"]);
    assert.equal(listedIds(result).includes("binary_sensor.diag_contact"), false);
    assert.deepEqual(result.climate, []);
  });

  it("sends LED switches and template entities to helpers, and leaves circadian lights as lights", () => {
    const result = classifyArea(
      hass({
        entities: [
          { entity_id: "switch.desk_led", area_id: "office_of_drew" },
          { entity_id: "switch.desk_plug", area_id: "office_of_drew" },
          { entity_id: "light.circadian_lamps", area_id: "office_of_drew", platform: "group" },
          { entity_id: "light.template_lamp", area_id: "office_of_drew", platform: "template" },
          { entity_id: "input_boolean.guest", area_id: "office_of_drew" },
          { entity_id: "input_select.scene", area_id: "office_of_drew" },
          { entity_id: "timer.nap", area_id: "office_of_drew" },
        ],
        states: {
          "switch.desk_plug": state("switch.desk_plug", "off", { device_class: "outlet" }),
        },
      }),
      "office_of_drew",
    );
    assert.deepEqual(result.lights, ["light.circadian_lamps"]);
    assert.deepEqual(result.switches, ["switch.desk_plug"]);
    assert.deepEqual(result.helpers, ["input_boolean.guest", "light.template_lamp", "timer.nap"]);
    assert.equal(listedIds(result).includes("switch.desk_led"), false);
    assert.deepEqual(result.selects, ["input_select.scene"]);
  });

  it("includes an automation assigned to the area or its device", () => {
    const result = classifyArea(
      hass({
        areas: roomAreas,
        devices: [{ id: "bed-device", area_id: "bedroom" }],
        entities: [
          { entity_id: "automation.bedtime", area_id: "bedroom" },
          { entity_id: "automation.on_device", device_id: "bed-device" },
          { entity_id: "automation.kitchen_only", area_id: "kitchen" },
          { entity_id: "media_player.tv", area_id: "bedroom" },
        ],
        states: {
          "automation.bedtime": state("automation.bedtime", "on", { friendly_name: "Bedtime" }),
          "automation.on_device": state("automation.on_device", "off", { friendly_name: "Lamp routine" }),
          "automation.kitchen_only": state("automation.kitchen_only", "on", { friendly_name: "Kitchen lights" }),
        },
      }),
      "bedroom",
    );
    assert.deepEqual(result.automations, ["automation.bedtime", "automation.on_device"]);
    assert.deepEqual(result.mediaPlayers, ["media_player.tv"]);
  });

  it("includes an automation whose name contains the room name", () => {
    const lights = "automation.man_cave_lights";
    const tv = "automation.turn_on_man_cave_tv";
    const assigned = "automation.also_assigned";
    const result = classifyArea(
      hass({
        areas: roomAreas,
        entities: [
          { entity_id: lights, area_id: "kitchen" },
          { entity_id: tv },
          { entity_id: assigned, area_id: "office_of_drew" },
          { entity_id: "automation.hidden_match", area_id: "kitchen", hidden_by: "user" },
        ],
        states: {
          [lights]: state(lights, "on", { friendly_name: "Man Cave Lights" }),
          [tv]: state(tv, "off", { friendly_name: "Turn on man cave TV" }),
          [assigned]: state(assigned, "on", { friendly_name: "Man Cave Lights" }),
          "automation.hidden_match": state("automation.hidden_match", "on", { friendly_name: "Man Cave hidden" }),
        },
      }),
      "office_of_drew",
    );
    assert.deepEqual(result.automations, [assigned, lights, tv]);

    const states = {
      [lights]: state(lights, "on", { friendly_name: "Man Cave · Occupied · Turn on Lights" }),
      [tv]: state(tv, "off", { friendly_name: "Turn on man cave TV" }),
      [assigned]: state(assigned, "on", { friendly_name: "Man Cave Lights" }),
    };
    const rollup = sectionRollups(result, states).find((item) => item.id === "automations");
    assert.equal(rollup && rollupLabel(rollup), "Automations 2/3 on, 0 disabled");
    const cards = buildPopupCards(
      { ...emptySections(), automations: [lights] },
      { [lights]: states[lights] },
      "Man Cave",
    );
    const row = cards.find((card) => card.entity === lights);
    assert.equal(row?.primary, "Occupied · Turn on Lights");
    assert.equal((row?.hold_action as { perform_action?: string }).perform_action, "automation.toggle");
    assert.deepEqual(
      cards.filter((card) => card.title).map((card) => card.title),
      ["Status", "Automations"],
    );
  });

  it("excludes an automation for a different room", () => {
    const fixture = hass({
      areas: roomAreas,
      entities: [
        { entity_id: "automation.guest", area_id: "guest_bedroom" },
        { entity_id: "automation.cave_word" },
        { entity_id: "automation.man_word" },
        { entity_id: "automation.master" },
        { entity_id: "automation.closet", area_id: "bedroom_closet" },
        { entity_id: "automation.bedroom_motion", area_id: "cabin_bedroom" },
      ],
      states: {
        "automation.guest": state("automation.guest", "on", { friendly_name: "Guest Bedroom Lights" }),
        "automation.cave_word": state("automation.cave_word", "on", { friendly_name: "Cave Lights" }),
        "automation.man_word": state("automation.man_word", "on", { friendly_name: "Man Lights" }),
        "automation.master": state("automation.master", "on", { friendly_name: "Master Bedroom Lights" }),
        "automation.closet": state("automation.closet", "on", { friendly_name: "Bedroom Closet · Door Closed" }),
        "automation.bedroom_motion": state("automation.bedroom_motion", "on", {
          friendly_name: "Bedroom · Motion · Turn on Overhead",
        }),
      },
    });
    assert.deepEqual(classifyArea(fixture, "office_of_drew").automations, []);
    assert.deepEqual(classifyArea(fixture, "bedroom").automations, ["automation.master"]);
    assert.deepEqual(classifyArea(fixture, "guest_bedroom").automations, ["automation.guest"]);
    assert.deepEqual(classifyArea(fixture, "bedroom_closet").automations, ["automation.closet"]);
    assert.deepEqual(classifyArea(fixture, "cabin_bedroom").automations, ["automation.bedroom_motion"]);
  });

  it("rolls up a same-device pressure sensor that has no device class", () => {
    const result = classifyArea(
      hass({
        devices: [{ id: "bed", area_id: "bedroom" }],
        entities: [
          { entity_id: "binary_sensor.bedroom_bed_pressure_sensor", device_id: "bed" },
          { entity_id: "sensor.bedroom_bed_pressure_sensor_pressure", device_id: "bed" },
          { entity_id: "select.bedroom_bed_pressure_sensor_sensitivity", device_id: "bed", entity_category: "config" },
        ],
        states: {
          "binary_sensor.bedroom_bed_pressure_sensor": state("binary_sensor.bedroom_bed_pressure_sensor", "on", {
            device_class: "occupancy",
          }),
          "sensor.bedroom_bed_pressure_sensor_pressure": state("sensor.bedroom_bed_pressure_sensor_pressure", "338", {
            friendly_name: "Bed Pressure Sensor Pressure",
          }),
          "select.bedroom_bed_pressure_sensor_sensitivity": state("select.bedroom_bed_pressure_sensor_sensitivity", "middle"),
        },
      }),
      "bedroom",
    );
    assert.deepEqual(result.occupancy, [
      {
        entityId: "binary_sensor.bedroom_bed_pressure_sensor",
        pressureEntityId: "sensor.bedroom_bed_pressure_sensor_pressure",
      },
    ]);
    assert.deepEqual(result.climate, []);
    assert.deepEqual(result.selects, []);
    assert.deepEqual(result.helpers, []);
  });

  it("treats a chair or bed binary sensor as occupancy", () => {
    const result = classifyArea(
      hass({
        entities: [
          { entity_id: "binary_sensor.under_bed", area_id: "bedroom" },
          { entity_id: "binary_sensor.bedroom_window", area_id: "bedroom" },
        ],
        states: {
          "binary_sensor.under_bed": state("binary_sensor.under_bed", "on", { friendly_name: "Under bed" }),
          "binary_sensor.bedroom_window": state("binary_sensor.bedroom_window", "off", {
            device_class: "window",
            friendly_name: "Bedroom window",
          }),
        },
      }),
      "bedroom",
    );
    assert.deepEqual(result.occupancy.map((item) => item.entityId), ["binary_sensor.under_bed"]);
    assert.deepEqual(result.openings, ["binary_sensor.bedroom_window"]);
  });
});

describe("popup and button configs", () => {
  it("opens as the private bubble popup, not the legacy vertical-stack popup", () => {
    const popup = buildPopupConfig("bedroom", "Master Bedroom", "mdi:bed", emptySections());
    assert.equal(popup.type, "custom:area-card-bubble");
    assert.equal(popup.card_type, "pop-up");
    assert.equal(popup.hash, "#area-bedroom");
    assert.equal(JSON.stringify(popup).includes("custom:bubble-card"), false);
  });

  it("uses the built-in media control card", () => {
    const cards = buildPopupCards(
      {
        ...emptySections(),
        mediaPlayers: ["media_player.tv"],
      },
      {
        "media_player.tv": state("media_player.tv", "off", { friendly_name: "Man Cave TV" }),
      },
      "Man Cave",
    );
    const media = cards.find((card) => card.type === "media-control");
    assert.equal(media?.entity, "media_player.tv");
    assert.equal(media?.name, "TV");
    assert.deepEqual(media?.grid_options, { columns: 12 });
    assert.equal(media?.use_media_info, undefined);
    assert.equal(media?.show_volume_level, undefined);
    assert.equal(media?.media_controls, undefined);
    assert.equal(media?.volume_controls, undefined);
    assert.equal(
      cards.some((card) => String(card.type).includes("media-player-card")),
      false,
    );
  });

  it("omits empty section headings", () => {
    const cards = buildPopupCards(emptySections());
    assert.deepEqual(cards, []);
  });

  it("puts the section icon to the left of each heading", () => {
    const cards = buildPopupCards({
      ...emptySections(),
      climate: ["sensor.temp"],
      lights: ["light.a"],
      mediaPlayers: ["media_player.tv"],
      cameras: ["camera.webcam"],
      switches: ["switch.a"],
      occupancy: [{ entityId: "binary_sensor.motion" }],
      openings: ["binary_sensor.door"],
      satellites: [{ entityId: "assist_satellite.kiosk" }],
      sensors: ["binary_sensor.leak"],
      locks: ["lock.front"],
      vacuums: ["vacuum.rover"],
      buttons: ["button.ding"],
      scenes: ["scene.movie"],
      scripts: ["script.go"],
      helpers: ["input_boolean.a"],
      automations: ["automation.a"],
    });
    const headings = cards.filter((card) => card.type === "custom:area-card-section-title");
    const popupSections = [
      "climate",
      "lights",
      "media",
      "cameras",
      "switches",
      "occupancy",
      "openings",
      "satellites",
      "sensors",
      "locks",
      "vacuums",
      "buttons",
      "scenes",
      "scripts",
      "helpers",
      "automations",
    ] as const;
    assert.deepEqual(
      headings.map((card) => [card.title, card.icon, card.color]),
      [
        ["Status", "mdi:list-status", "var(--primary-text-color)"],
        ...popupSections.map((id) => [sectionTitle(id), sectionIcon(id), sectionColor(id)]),
      ],
    );
    assert.equal(sectionIcon("lights"), "mdi:lightbulb");
    assert.equal(sectionIcon("openings"), "mdi:door");
    assert.equal(iconInk("rgb(255, 193, 7)"), "#1a1a1a");
    assert.equal(iconInk("rgb(158, 158, 158)"), "#1a1a1a");
    assert.equal(iconInk("rgb(255, 235, 59)"), "#1a1a1a");
    assert.equal(iconInk("rgb(33, 150, 243)"), "#fff");
    assert.equal(iconInk("rgb(3, 169, 244)"), "#fff");
  });

  it("renders only the sections that have entities, with prefixed mushroom types", () => {
    const cards = buildPopupCards(
      {
        ...emptySections(),
        lights: ["light.reading_lamp", "light.under_bed"],
        occupancy: [{ entityId: "binary_sensor.bed", pressureEntityId: "sensor.bed_pressure" }],
      },
      {
        "light.reading_lamp": state("light.reading_lamp", "on", { supported_color_modes: ["brightness"] }),
        "light.under_bed": state("light.under_bed", "on", { supported_color_modes: ["color_temp", "xy"] }),
      },
    );
    const titles = cards.filter((card) => card.title).map((card) => card.title);
    assert.deepEqual(titles, ["Status", "Lights", "Occupancy"]);
    const chips = cards.find((card) => String(card.type).endsWith("chips-card"));
    const contents = (chips?.chips as Array<{ content: string }>).map((chip) => chip.content);
    assert.deepEqual(contents, ["Lights 2/2 On", "Occupancy 0/1 On"]);
    assert.equal(cards.some((card) => JSON.stringify(card).includes("sensor.bed_pressure") && card.type?.toString().includes("entity-card")), false);
    const types = cards.map((card) => String(card.type));
    assert.ok(
      types.every(
        (type) => type.startsWith("custom:area-card-mushroom-") || type === "custom:area-card-section-title",
      ),
    );
    assert.ok(types.includes("custom:area-card-section-title"));
    assert.ok(types.includes("custom:area-card-mushroom-light-card"));
    assert.ok(types.includes("custom:area-card-mushroom-template-card"));
    assert.equal(types.some((type) => type.startsWith("custom:mushroom-")), false);
    assert.equal(JSON.stringify(cards).includes("custom:bubble-card"), false);
  });

  it("toggles an on/off light from the icon and opens more-info from the row", () => {
    const desk = "light.man_cave_desk_lamp";
    const strip = "light.master_bedroom_under_bed_light_strip";
    const cards = buildPopupCards(
      { ...emptySections(), lights: [desk, strip, "light.no_modes"] },
      {
        [desk]: state(desk, "off", { friendly_name: "Man Cave Desk Lamp", supported_color_modes: ["onoff"] }),
        [strip]: state(strip, "on", { supported_color_modes: ["color_temp", "xy"] }),
        "light.no_modes": state("light.no_modes", "off", {}),
      },
    );
    const onOff = cards.find((card) => card.entity === desk);
    const dimmable = cards.find((card) => card.entity === strip);
    const unknown = cards.find((card) => card.entity === "light.no_modes");

    assert.equal(onOff?.type, "custom:area-card-mushroom-template-card");
    assert.deepEqual(onOff?.tap_action, { action: "more-info" });
    assert.deepEqual(onOff?.icon_tap_action, {
      action: "perform-action",
      perform_action: "light.toggle",
      target: { entity_id: desk },
    });
    assert.equal(JSON.stringify(onOff).includes("show_brightness_control"), false);

    assert.equal(unknown?.type, "custom:area-card-mushroom-template-card");
    assert.deepEqual((unknown?.icon_tap_action as { target: { entity_id: string } }).target.entity_id, "light.no_modes");

    assert.equal(dimmable?.type, "custom:area-card-mushroom-light-card");
    assert.equal(dimmable?.show_brightness_control, true);
    assert.equal(dimmable?.show_color_temp_control, true);
    assert.equal(dimmable?.show_color_control, true);
    assert.equal(dimmable?.icon_tap_action, undefined);
    assert.equal(dimmable?.tap_action, undefined);
  });

  it("keeps every brightness, color, and color-temperature mode on the light card", () => {
    for (const mode of ["brightness", "color_temp", "hs", "xy", "rgb", "rgbw", "rgbww", "white"]) {
      const entity = `light.${mode}`;
      const cards = buildPopupCards(
        { ...emptySections(), lights: [entity] },
        { [entity]: state(entity, "on", { supported_color_modes: [mode] }) },
      );
      const card = cards.find((item) => item.entity === entity);
      assert.equal(card?.type, "custom:area-card-mushroom-light-card", mode);
      assert.equal(card?.show_brightness_control, true, mode);
    }
  });

  it("reserves a fixed dot slot for every section and hides empty ones", () => {
    const lights = ["light.a", "light.b", "light.c", "light.d"];
    const sections = { ...emptySections(), lights };
    const offStates = Object.fromEntries(lights.map((id) => [id, state(id, "off")]));
    const onStates = { ...offStates, "light.a": state("light.a", "on") };

    const inactive = buildButtonConfig({
      areaId: "bedroom",
      name: "Master Bedroom",
      icon: "mdi:bed",
      sections,
      states: offStates,
      dotSlots: DOT_SLOTS,
    });
    const active = buildButtonConfig({
      areaId: "bedroom",
      name: "Master Bedroom",
      icon: "mdi:bed",
      sections,
      states: onStates,
      dotSlots: DOT_SLOTS,
    });
    const other = buildButtonConfig({
      areaId: "office_of_drew",
      name: "Man Cave",
      icon: "mdi:office-building",
      sections: {
        ...emptySections(),
        climate: ["sensor.temp"],
        openings: ["binary_sensor.door"],
        selects: ["input_select.scene"],
        helpers: ["timer.nap"],
      },
      states: {
        "sensor.temp": state("sensor.temp", "21", { device_class: "temperature" }),
        "binary_sensor.door": state("binary_sensor.door", "off"),
        "input_select.scene": state("input_select.scene", "movie"),
        "timer.nap": state("timer.nap", "idle"),
      },
      dotSlots: DOT_SLOTS,
    });
    const offDots = inactive.sub_button as Array<Record<string, unknown>>;
    const onDots = active.sub_button as Array<Record<string, unknown>>;
    const otherDots = other.sub_button as Array<Record<string, unknown>>;
    const expectedOff = DOT_SLOTS.map((id) => (id === "lights" ? "area-dot-lights-off" : `area-dot-${id}-empty`));
    const expectedOn = DOT_SLOTS.map((id) => (id === "lights" ? "area-dot-lights-on" : `area-dot-${id}-empty`));
    const expectedOther = DOT_SLOTS.map((id) => (id === "openings" ? "area-dot-openings-off" : `area-dot-${id}-empty`));
    assert.deepEqual(offDots.map((dot) => dot.css_class), expectedOff);
    assert.deepEqual(onDots.map((dot) => dot.css_class), expectedOn);
    assert.deepEqual(otherDots.map((dot) => dot.css_class), expectedOther);
    assert.equal(offDots.length, otherDots.length);

    const styles = String(inactive.styles);
    assert.match(styles, /opacity: 0 !important/);
    assert.match(styles, /visibility: hidden !important/);
    assert.match(styles, /pointer-events: none !important/);
    assert.match(styles, /width: 22px !important/);
    assert.match(styles, /--mdc-icon-size: 14px/);
    assert.equal(styles.includes("color: transparent"), false);
    const sectionIcons = DOT_SLOTS.map((id) => sectionIcon(id));
    assert.equal(DOT_SLOTS.includes("automations"), false);
    assert.equal(DOT_SLOTS.includes("buttons"), false);
    assert.equal(DOT_SLOTS.includes("scenes"), false);
    assert.equal(DOT_SLOTS.includes("scripts"), false);
    assert.deepEqual(offDots.map((dot) => dot.icon), sectionIcons);
    const withAutomations = { ...sections, automations: ["automation.bedtime"] };
    const automationStates = {
      ...onStates,
      "automation.bedtime": state("automation.bedtime", "on", { friendly_name: "Bedtime" }),
    };
    const automationDots = (
      buildButtonConfig({
        areaId: "bedroom",
        name: "Master Bedroom",
        icon: "mdi:bed",
        sections: withAutomations,
        states: automationStates,
        dotSlots: DOT_SLOTS,
      }).sub_button as Array<Record<string, unknown>>
    ).map((dot) => dot.css_class);
    assert.equal(automationDots.some((css) => String(css).includes("automations")), false);
    assert.deepEqual(automationDots, expectedOn);
    assert.deepEqual(
      buildPopupCards(withAutomations, automationStates, "Master Bedroom")
        .filter((card) => card.title)
        .map((card) => card.title),
      ["Status", "Lights", "Automations"],
    );
    assert.deepEqual(onDots.map((dot) => dot.icon), sectionIcons);
    assert.deepEqual(otherDots.map((dot) => dot.icon), sectionIcons);
    assert.match(
      String(active.styles),
      /\.bubble-sub-button\.area-dot-lights-on \{[^}]*color: #1a1a1a !important/,
    );
    assert.match(
      styles,
      /\.bubble-sub-button\.area-dot-lights-off \{[^}]*color: rgb\(255, 193, 7\) !important/,
    );
    assert.match(styles, /:host\s*\{[^}]*--bubble-box-shadow:\s*var\(--ha-card-box-shadow\)/);
    assert.match(
      styles,
      /--bubble-main-background-color:\s*var\(--ha-card-background,\s*var\(--card-background-color\)\)/,
    );
    assert.match(styles, /--bubble-border-radius:\s*var\(--ha-card-border-radius\)/);
    assert.match(styles, /--bubble-icon-border-radius:\s*50%/);
    const emptyRule = styles.slice(styles.indexOf('[class*="-empty"]'));
    assert.equal(emptyRule.includes("display: none"), false);
    assert.equal(styles.includes("background: rgb(255, 193, 7)"), false);
    assert.equal(String(active.styles).includes("background: rgb(255, 193, 7)"), true);
    assert.equal(styles.includes("box-shadow: inset 0 0 0 1.5px rgb(255, 193, 7)"), true);

    const emptyDot = offDots.find((dot) => String(dot.css_class).endsWith("-empty"));
    assert.ok(emptyDot);
    assert.deepEqual(emptyDot.tap_action, { action: "none" });
    assert.equal(JSON.stringify(emptyDot).includes("light.toggle"), false);
    assert.equal(JSON.stringify(emptyDot).includes("automation.toggle"), false);
    assert.equal(JSON.stringify(onDots).includes("light.toggle"), false);
    assert.equal(JSON.stringify(onDots).includes("perform-action"), false);
    const lightsDot = onDots[DOT_SLOTS.indexOf("lights")];
    const tap = lightsDot?.tap_action as { navigation_path: string };
    assert.equal(tap.navigation_path, "#area-bedroom");
    assert.equal(active.name, "Master Bedroom");
    assert.equal(JSON.stringify(active).includes("custom:bubble-card"), false);
    assert.equal(String(active.type), "custom:area-card-bubble");

    const sparseSections = {
      ...emptySections(),
      climate: ["sensor.temp"],
      openings: ["binary_sensor.door"],
      selects: ["input_select.scene"],
      helpers: ["timer.nap"],
    };
    const sparseStates = {
      "sensor.temp": state("sensor.temp", "21", { device_class: "temperature", friendly_name: "Man Cave Temperature" }),
      "binary_sensor.door": state("binary_sensor.door", "off"),
      "input_select.scene": state("input_select.scene", "movie"),
      "timer.nap": state("timer.nap", "idle"),
    };
    const sparseDots = (
      buildButtonConfig({
        areaId: "office_of_drew",
        name: "Man Cave",
        icon: "mdi:office-building",
        sections: sparseSections,
        states: sparseStates,
        dotSlots: DOT_SLOTS,
      }).sub_button as Array<Record<string, unknown>>
    ).map((dot) => dot.css_class);
    assert.deepEqual(
      sparseDots,
      DOT_SLOTS.map((id) => (id === "openings" ? "area-dot-openings-off" : `area-dot-${id}-empty`)),
    );
    const sparseCards = buildPopupCards(sparseSections, sparseStates, "Man Cave");
    assert.deepEqual(
      sparseCards.filter((card) => card.title).map((card) => card.title),
      ["Status", "Climate", "Entries", "Helpers"],
    );
  });
});

const DOT_SLOTS = collapsedDotSlots([]);

const roomAreas: Record<string, { area_id: string; name: string }> = {
  office_of_drew: { area_id: "office_of_drew", name: "Man Cave" },
  bedroom: { area_id: "bedroom", name: "Master Bedroom" },
  cabin_bedroom: { area_id: "cabin_bedroom", name: "Bedroom" },
  guest_bedroom: { area_id: "guest_bedroom", name: "Guest Bedroom" },
  bedroom_closet: { area_id: "bedroom_closet", name: "Bedroom Closet" },
};

function listedIds(sections: AreaSections): string[] {
  return [
    ...sections.climate,
    ...sections.lights,
    ...Object.values(sections.lightLeds),
    ...sections.mediaPlayers,
    ...sections.cameras,
    ...sections.switches,
    ...sections.occupancy.map((item) => item.entityId),
    ...sections.openings,
    ...sections.satellites.flatMap((item) => [item.entityId, item.ledEntityId, item.alarmEntityId].filter(Boolean) as string[]),
    ...sections.sensors,
    ...sections.locks,
    ...sections.vacuums,
    ...sections.buttons,
    ...sections.scenes,
    ...sections.scripts,
    ...sections.helpers,
    ...sections.selects,
    ...sections.automations,
  ];
}

describe("satellite scope", () => {
  it("keeps satellite entities off every other section and puts alarm on the kiosk card", () => {
    const result = classifyArea(
      hass({
        devices: [
          { id: "updoot", area_id: "office_of_drew", manufacturer: "kiosk_satellite" },
          { id: "plain", area_id: "office_of_drew", manufacturer: "Espressif" },
        ],
        entities: [
          { entity_id: "assist_satellite.updoot", device_id: "updoot" },
          { entity_id: "binary_sensor.updoot_alarm_ringing", device_id: "updoot" },
          { entity_id: "light.updoot_led_control_idle", device_id: "updoot" },
          { entity_id: "button.updoot_stop_alarm", device_id: "updoot" },
          { entity_id: "switch.updoot_relay", device_id: "updoot" },
          { entity_id: "sensor.updoot_cpu_temperature", device_id: "updoot", entity_category: "diagnostic" },
          { entity_id: "sensor.updoot_ambient_light", device_id: "updoot" },
          { entity_id: "assist_satellite.plain", device_id: "plain" },
          { entity_id: "binary_sensor.plain_alarm_ringing", device_id: "plain" },
          { entity_id: "light.desk_lamp", area_id: "office_of_drew" },
          { entity_id: "binary_sensor.door", area_id: "office_of_drew" },
        ],
        states: {
          "binary_sensor.updoot_alarm_ringing": state("binary_sensor.updoot_alarm_ringing", "off", {
            friendly_name: "Updoot1 Alarm ringing",
          }),
          "binary_sensor.plain_alarm_ringing": state("binary_sensor.plain_alarm_ringing", "on", {
            friendly_name: "Alarm ringing",
          }),
          "sensor.updoot_cpu_temperature": state("sensor.updoot_cpu_temperature", "40", { device_class: "temperature" }),
          "binary_sensor.door": state("binary_sensor.door", "off", { device_class: "door" }),
          "light.updoot_led_control_idle": state("light.updoot_led_control_idle", "on"),
        },
      }),
      "office_of_drew",
    );

    assert.deepEqual(result.satellites, [
      {
        entityId: "assist_satellite.plain",
        deviceId: "plain",
        alarmEntityId: "binary_sensor.plain_alarm_ringing",
      },
      {
        entityId: "assist_satellite.updoot",
        deviceId: "updoot",
        ledEntityId: "light.updoot_led_control_idle",
        alarmEntityId: "binary_sensor.updoot_alarm_ringing",
      },
    ]);
    assert.deepEqual(result.lights, ["light.desk_lamp"]);
    assert.deepEqual(result.openings, ["binary_sensor.door"]);
    assert.deepEqual(result.climate, []);
    for (const leaked of [
      "binary_sensor.updoot_alarm_ringing",
      "binary_sensor.plain_alarm_ringing",
      "light.updoot_led_control_idle",
      "button.updoot_stop_alarm",
      "switch.updoot_relay",
      "sensor.updoot_cpu_temperature",
      "sensor.updoot_ambient_light",
    ]) {
      assert.equal(result.helpers.includes(leaked), false, leaked);
      assert.equal(result.switches.includes(leaked), false, leaked);
      assert.equal(result.lights.includes(leaked), false, leaked);
      assert.equal(result.openings.includes(leaked), false, leaked);
      assert.equal(result.climate.includes(leaked), false, leaked);
      assert.equal(result.sensors.includes(leaked), false, leaked);
      assert.equal(result.locks.includes(leaked), false, leaked);
      assert.equal(result.vacuums.includes(leaked), false, leaked);
      assert.equal(result.buttons.includes(leaked), false, leaked);
      assert.equal(result.scenes.includes(leaked), false, leaked);
      assert.equal(result.scripts.includes(leaked), false, leaked);
    }

    const cards = buildPopupCards(result, {
      "assist_satellite.updoot": state("assist_satellite.updoot", "idle", { friendly_name: "Updoot1 Assist satellite" }),
      "binary_sensor.updoot_alarm_ringing": state("binary_sensor.updoot_alarm_ringing", "off", {
        friendly_name: "Updoot1 Alarm ringing",
      }),
      "light.updoot_led_control_idle": state("light.updoot_led_control_idle", "on"),
    });
    const kiosk = cards.find((card) => card.entity === "assist_satellite.updoot");
    assert.equal(String(kiosk?.secondary).includes("Alarm:"), true);
    assert.equal(String(kiosk?.secondary).includes("light.updoot_led_control_idle"), true);
    assert.equal(kiosk?.primary, "Updoot1 Assist satellite");
    assert.equal(cards.some((card) => card.entity === "binary_sensor.updoot_alarm_ringing"), false);
    assert.deepEqual(
      cards.filter((card) => card.title).map((card) => card.title),
      ["Status", "Lights", "Entries", "Satellites"],
    );
  });

  it("pulls an unassigned Kiosk Satellite player into the satellite area by entity id", () => {
    const fixture = hass({
      devices: [
        { id: "updoot1", area_id: "office_of_drew", name: "Updoot1", manufacturer: "kiosk_satellite" },
        { id: "updoot-player", name: "Updoot", manufacturer: "Kiosk Satellite" },
        { id: "updoot2", area_id: "bedroom", name: "Updoot2", manufacturer: "kiosk_satellite" },
        { id: "updoot2-player", name: "Updoot2", manufacturer: "Kiosk Satellite" },
        { id: "other-player", name: "Updoot", manufacturer: "Music Assistant" },
      ],
      entities: [
        { entity_id: "assist_satellite.updoot_assist_satellite", device_id: "updoot1" },
        { entity_id: "media_player.updoot", device_id: "updoot-player" },
        { entity_id: "button.updoot_favorite_current_song", device_id: "updoot-player" },
        { entity_id: "assist_satellite.updoot2_assist_satellite", device_id: "updoot2" },
        { entity_id: "media_player.updoot2", device_id: "updoot2-player", hidden_by: "user" },
        { entity_id: "media_player.tv", area_id: "office_of_drew" },
        { entity_id: "media_player.updoot_other", device_id: "other-player" },
      ],
      states: {
        "media_player.updoot": state("media_player.updoot", "idle", { friendly_name: "Updoot" }),
        "media_player.tv": state("media_player.tv", "playing", { friendly_name: "Office TV" }),
      },
    });

    const office = classifyArea(fixture, "office_of_drew");
    assert.deepEqual(office.satellites, [
      { entityId: "assist_satellite.updoot_assist_satellite", deviceId: "updoot1" },
    ]);
    assert.deepEqual(office.mediaPlayers, ["media_player.tv", "media_player.updoot"]);
    assert.equal(office.switches.includes("button.updoot_favorite_current_song"), false);
    assert.equal(office.buttons.includes("button.updoot_favorite_current_song"), false);
    assert.equal(listedIds(office).includes("button.updoot_favorite_current_song"), false);

    const bedroom = classifyArea(fixture, "bedroom");
    assert.deepEqual(bedroom.satellites, [
      { entityId: "assist_satellite.updoot2_assist_satellite", deviceId: "updoot2" },
    ]);
    assert.deepEqual(bedroom.mediaPlayers, []);

    const cards = buildPopupCards(office, fixture.states ?? {});
    const player = cards.find((card) => card.entity === "media_player.updoot");
    assert.equal(player?.type, "media-control");
    assert.equal(cards.some((card) => card.entity === "button.updoot_favorite_current_song"), false);
    assert.ok(cards.some((card) => card.title === "Media players"));
  });

  it("uses the kiosk card for a satellite and leaves its player out of Media players", () => {
    const fixture = hass({
      devices: [
        { id: "updoot1", area_id: "office_of_drew", name: "Updoot1", manufacturer: "kiosk_satellite" },
        { id: "updoot-player", area_id: "office_of_drew", name: "Updoot", manufacturer: "Kiosk Satellite" },
      ],
      entities: [
        { entity_id: "assist_satellite.updoot_assist_satellite", device_id: "updoot1" },
        { entity_id: "media_player.updoot", device_id: "updoot-player" },
        { entity_id: "media_player.tv", area_id: "office_of_drew" },
        { entity_id: "assist_satellite.speaker", area_id: "office_of_drew" },
        { entity_id: "media_player.speaker", area_id: "office_of_drew" },
      ],
      states: {
        "media_player.updoot": state("media_player.updoot", "idle", { friendly_name: "Updoot" }),
        "media_player.tv": state("media_player.tv", "playing", { friendly_name: "Office TV" }),
        "media_player.speaker": state("media_player.speaker", "playing", { friendly_name: "Speaker" }),
      },
    });

    withKioskElements(["kiosk-satellite-card", "kiosk-satellite-card-local", "kiosk-redisplay"], () => {
      const office = classifyArea(fixture, "office_of_drew");
      assert.deepEqual(office.mediaPlayers, ["media_player.tv", "media_player.speaker"]);
      assert.deepEqual(
        office.satellites.map((item) => item.entityId),
        ["assist_satellite.speaker", "assist_satellite.updoot_assist_satellite"],
      );

      const cards = buildPopupCards(office, fixture.states ?? {});
      const kiosk = cards.find((card) => card.entity === "assist_satellite.updoot_assist_satellite");
      assert.equal(kiosk?.type, "custom:kiosk-satellite-card");
      assert.equal(kiosk?.device, "updoot1");
      assert.equal(kiosk?.style, undefined);
      assert.deepEqual(kiosk?.grid_options, { columns: 12 });
      assert.equal(cards.some((card) => card.entity === "media_player.updoot"), false);

      const plain = cards.find((card) => card.entity === "assist_satellite.speaker");
      assert.equal(plain?.type, "custom:area-card-mushroom-template-card");
      assert.equal(cards.some((card) => card.entity === "media_player.speaker"), true);
    });
  });

  it("drops an unavailable paired player when the installed kiosk card is loaded", () => {
    const fixture = hass({
      devices: [{ id: "updoot1", area_id: "office_of_drew", manufacturer: "kiosk_satellite" }],
      entities: [
        { entity_id: "assist_satellite.updoot_assist_satellite", device_id: "updoot1" },
        { entity_id: "media_player.updoot", area_id: "office_of_drew" },
      ],
      states: {
        "media_player.updoot": state("media_player.updoot", "unavailable", { friendly_name: "Updoot" }),
      },
    });

    withKioskElements(["kiosk-satellite-card"], () => {
      const office = classifyArea(fixture, "office_of_drew");
      assert.deepEqual(office.mediaPlayers, []);
      const cards = buildPopupCards(office, fixture.states ?? {});
      const kiosk = cards.find((card) => card.entity === "assist_satellite.updoot_assist_satellite");
      assert.equal(kiosk?.type, "custom:kiosk-satellite-card");
      assert.equal(kiosk?.style, undefined);
      assert.equal(cards.some((card) => card.title === "Media players"), false);
    });
  });

  it("ignores a locally served kiosk card and the old redisplay name, and keeps the paired player under Media players", () => {
    const fixture = hass({
      devices: [
        { id: "updoot1", area_id: "office_of_drew", manufacturer: "kiosk_satellite" },
        { id: "updoot-player", manufacturer: "Kiosk Satellite" },
      ],
      entities: [
        { entity_id: "assist_satellite.updoot_assist_satellite", device_id: "updoot1" },
        { entity_id: "media_player.updoot", device_id: "updoot-player" },
      ],
      states: {
        "media_player.updoot": state("media_player.updoot", "idle", { friendly_name: "Updoot" }),
      },
    });

    withKioskElements(["kiosk-satellite-card-local", "kiosk-redisplay", "kiosk-redisplay-local"], () => {
      const office = classifyArea(fixture, "office_of_drew");
      assert.deepEqual(office.mediaPlayers, ["media_player.updoot"]);
      const cards = buildPopupCards(office, fixture.states ?? {});
      const satellite = cards.find((card) => card.entity === "assist_satellite.updoot_assist_satellite");
      assert.equal(satellite?.type, "custom:area-card-mushroom-template-card");
      assert.equal(cards.some((card) => String(card.type).includes("kiosk")), false);
      assert.equal(cards.find((card) => card.entity === "media_player.updoot")?.type, "media-control");
    });
  });
});

describe("device sections", () => {
  it("classifies climate devices and environment sensors, and leaves an occupancy pressure companion in place", () => {
    const environment: Record<string, string> = {
      "sensor.illuminance": "illuminance",
      "sensor.co2": "carbon_dioxide",
      "sensor.co": "carbon_monoxide",
      "sensor.pm1": "pm1",
      "sensor.pm25": "pm25",
      "sensor.pm10": "pm10",
      "sensor.aqi": "aqi",
      "sensor.voc": "volatile_organic_compounds",
      "sensor.voc_parts": "volatile_organic_compounds_parts",
      "sensor.moisture": "moisture",
      "sensor.room_pressure": "pressure",
      "sensor.room_air": "atmospheric_pressure",
      "sensor.temp": "temperature",
      "sensor.humidity": "humidity",
    };
    const devices = ["climate.office", "humidifier.room", "water_heater.tank"];
    const entities: RegistryEntry[] = [
      { entity_id: "binary_sensor.chair", device_id: "chair" },
      { entity_id: "sensor.chair_pressure", device_id: "chair" },
      { entity_id: "sensor.barometer_pressure", area_id: "office_of_drew" },
      { entity_id: "sensor.power", area_id: "office_of_drew" },
      { entity_id: "sensor.lux_diag", area_id: "office_of_drew", entity_category: "diagnostic" },
    ];
    const states: Record<string, EntityState> = {
      "binary_sensor.chair": state("binary_sensor.chair", "on", { device_class: "occupancy" }),
      "sensor.chair_pressure": state("sensor.chair_pressure", "42", { device_class: "pressure" }),
      "sensor.barometer_pressure": state("sensor.barometer_pressure", "1000"),
      "sensor.power": state("sensor.power", "10", { device_class: "power" }),
      "sensor.lux_diag": state("sensor.lux_diag", "12", { device_class: "illuminance" }),
    };
    for (const [id, deviceClass] of Object.entries(environment)) {
      entities.push({ entity_id: id, area_id: "office_of_drew" });
      states[id] = state(id, "1", { device_class: deviceClass });
    }
    for (const id of devices) {
      entities.push({ entity_id: id, area_id: "office_of_drew" });
      states[id] = state(id, "heat");
    }

    const result = classifyArea(
      hass({
        devices: [{ id: "chair", area_id: "office_of_drew" }],
        entities,
        states,
      }),
      "office_of_drew",
    );

    assert.deepEqual(
      result.climate,
      [...Object.keys(environment), ...devices, "sensor.barometer_pressure"].sort((a, b) => a.localeCompare(b)),
    );
    assert.deepEqual(result.occupancy, [
      { entityId: "binary_sensor.chair", pressureEntityId: "sensor.chair_pressure" },
    ]);
    assert.equal(result.climate.includes("sensor.chair_pressure"), false);
    assert.equal(result.sensors.includes("sensor.chair_pressure"), false);
    assert.deepEqual(result.sensors, ["sensor.power"]);
    assert.equal(listedIds(result).includes("sensor.lux_diag"), false);
  });

  it("files locks, vacuums, buttons, scenes, scripts, and other binary sensors, and drops fans and settings entities", () => {
    const result = classifyArea(
      hass({
        entities: [
          { entity_id: "lock.front", area_id: "bedroom" },
          { entity_id: "lock.config", area_id: "bedroom", entity_category: "config" },
          { entity_id: "vacuum.rover", area_id: "bedroom" },
          { entity_id: "vacuum.diag", area_id: "bedroom", entity_category: "diagnostic" },
          { entity_id: "button.ding", area_id: "bedroom" },
          { entity_id: "input_button.quiet", area_id: "bedroom" },
          { entity_id: "scene.movie", area_id: "bedroom" },
          { entity_id: "script.bedtime", area_id: "bedroom" },
          { entity_id: "binary_sensor.leak", area_id: "bedroom" },
          { entity_id: "binary_sensor.plain", area_id: "bedroom" },
          { entity_id: "binary_sensor.problem", area_id: "bedroom" },
          { entity_id: "binary_sensor.door", area_id: "bedroom" },
          { entity_id: "binary_sensor.garage", area_id: "bedroom" },
          { entity_id: "binary_sensor.opening", area_id: "bedroom" },
          { entity_id: "binary_sensor.window", area_id: "bedroom" },
          { entity_id: "binary_sensor.motion", area_id: "bedroom" },
          { entity_id: "binary_sensor.diag", area_id: "bedroom", entity_category: "diagnostic" },
          { entity_id: "fan.ceiling", area_id: "bedroom" },
          { entity_id: "select.mode", area_id: "bedroom" },
          { entity_id: "number.level", area_id: "bedroom" },
          { entity_id: "person.drew", area_id: "bedroom" },
          { entity_id: "device_tracker.phone", area_id: "bedroom" },
        ],
        states: {
          "binary_sensor.leak": state("binary_sensor.leak", "on", { device_class: "moisture" }),
          "binary_sensor.problem": state("binary_sensor.problem", "off", { device_class: "problem" }),
          "binary_sensor.door": state("binary_sensor.door", "off", { device_class: "door" }),
          "binary_sensor.garage": state("binary_sensor.garage", "off", { device_class: "garage_door" }),
          "binary_sensor.opening": state("binary_sensor.opening", "off", { device_class: "opening" }),
          "binary_sensor.window": state("binary_sensor.window", "off", { device_class: "window" }),
          "binary_sensor.motion": state("binary_sensor.motion", "off", { device_class: "motion" }),
          "binary_sensor.diag": state("binary_sensor.diag", "on", { device_class: "connectivity" }),
          "fan.ceiling": state("fan.ceiling", "on"),
          "select.mode": state("select.mode", "auto"),
          "number.level": state("number.level", "3"),
          "person.drew": state("person.drew", "home"),
          "device_tracker.phone": state("device_tracker.phone", "home"),
        },
      }),
      "bedroom",
    );

    assert.deepEqual(result.locks, ["lock.front"]);
    assert.deepEqual(result.vacuums, ["vacuum.rover"]);
    assert.deepEqual(result.buttons, ["button.ding", "input_button.quiet"]);
    assert.deepEqual(result.scenes, ["scene.movie"]);
    assert.deepEqual(result.scripts, ["script.bedtime"]);
    assert.deepEqual(result.sensors, ["binary_sensor.leak", "binary_sensor.plain", "binary_sensor.problem"]);
    assert.deepEqual(result.openings, [
      "binary_sensor.door",
      "binary_sensor.garage",
      "binary_sensor.opening",
      "binary_sensor.window",
    ]);
    assert.deepEqual(result.occupancy.map((item) => item.entityId), ["binary_sensor.motion"]);
    assert.deepEqual(result.helpers, []);
    assert.deepEqual(result.selects, []);
    assert.deepEqual(result.switches, []);
    assert.deepEqual(result.climate, []);
    for (const dropped of [
      "lock.config",
      "vacuum.diag",
      "binary_sensor.diag",
      "fan.ceiling",
      "select.mode",
      "number.level",
      "person.drew",
      "device_tracker.phone",
    ]) {
      assert.equal(listedIds(result).includes(dropped), false, dropped);
    }
  });

  it("renders sensors, locks, vacuums, buttons, scenes, and scripts after satellites", () => {
    const sections = {
      ...emptySections(),
      climate: ["sensor.temp", "sensor.lux", "climate.office", "humidifier.room", "water_heater.tank"],
      satellites: [{ entityId: "assist_satellite.kiosk" }],
      sensors: ["binary_sensor.leak"],
      locks: ["lock.front"],
      vacuums: ["vacuum.rover"],
      buttons: ["button.ding", "input_button.quiet"],
      scenes: ["scene.movie"],
      scripts: ["script.bedtime"],
      selects: ["input_select.mood"],
    };
    const states = {
      "sensor.temp": state("sensor.temp", "21", { device_class: "temperature", friendly_name: "Master Bedroom Temperature" }),
      "sensor.lux": state("sensor.lux", "10", { device_class: "illuminance", friendly_name: "Master Bedroom Illuminance" }),
      "climate.office": state("climate.office", "heat", { friendly_name: "Master Bedroom Thermostat" }),
      "humidifier.room": state("humidifier.room", "on", { friendly_name: "Master Bedroom Humidifier" }),
      "water_heater.tank": state("water_heater.tank", "eco", { friendly_name: "Master Bedroom Tank" }),
      "assist_satellite.kiosk": state("assist_satellite.kiosk", "idle", { friendly_name: "Kiosk" }),
      "binary_sensor.leak": state("binary_sensor.leak", "on", { friendly_name: "Leak" }),
      "lock.front": state("lock.front", "unlocked", { friendly_name: "Front" }),
      "vacuum.rover": state("vacuum.rover", "cleaning", { friendly_name: "Rover" }),
      "button.ding": state("button.ding", "unknown", { friendly_name: "Ding" }),
      "input_button.quiet": state("input_button.quiet", "unknown", { friendly_name: "Quiet" }),
      "scene.movie": state("scene.movie", "unknown", { friendly_name: "Movie" }),
      "script.bedtime": state("script.bedtime", "off", { friendly_name: "Bedtime" }),
      "input_select.mood": state("input_select.mood", "bright", { friendly_name: "Mood" }),
    };
    const cards = buildPopupCards(sections, states, "Master Bedroom");
    assert.deepEqual(
      cards.filter((card) => card.title).map((card) => card.title),
      [
        "Status",
        "Climate",
        "Satellites",
        "Other Sensors",
        "Locks",
        "Vacuums",
        "Buttons",
        "Scenes",
        "Scripts",
        "Helpers",
      ],
    );
    assert.equal(sectionTitle("sensors"), "Other Sensors");
    assert.equal(sectionTitle("locks"), "Locks");
    assert.equal(sectionTitle("vacuums"), "Vacuums");
    assert.equal(sectionTitle("buttons"), "Buttons");
    assert.equal(sectionTitle("scenes"), "Scenes");
    assert.equal(sectionTitle("scripts"), "Scripts");

    const climateEntities = ["sensor.temp", "sensor.lux", "climate.office", "humidifier.room", "water_heater.tank"];
    assert.deepEqual(
      cards.filter((card) => climateEntities.includes(String(card.entity))).map((card) => card.entity),
      climateEntities,
    );
    assert.equal(String(cards.find((card) => card.entity === "sensor.temp")?.type).includes("entity-card"), true);
    assert.equal(String(cards.find((card) => card.entity === "sensor.lux")?.type).includes("entity-card"), true);
    assert.equal(String(cards.find((card) => card.entity === "climate.office")?.type).includes("climate-card"), true);
    const humidifier = cards.find((card) => card.entity === "humidifier.room");
    assert.equal(String(humidifier?.type).includes("humidifier-card"), true);
    assert.equal(humidifier?.show_target_humidity_control, true);
    const tank = cards.find((card) => card.entity === "water_heater.tank");
    assert.equal(String(tank?.type).includes("entity-card"), true);
    assert.equal(String(tank?.type).includes("climate-card"), false);
    assert.equal(String(cards.find((card) => card.entity === "binary_sensor.leak")?.type).includes("entity-card"), true);

    const lock = cards.find((card) => card.entity === "lock.front");
    assert.equal(String(lock?.type).includes("lock-card"), true);
    assert.deepEqual(lock?.grid_options, { columns: 12 });
    const vacuum = cards.find((card) => card.entity === "vacuum.rover");
    assert.equal(String(vacuum?.type).includes("vacuum-card"), true);
    assert.deepEqual(vacuum?.grid_options, { columns: 12 });

    const ding = cards.find((card) => card.entity === "button.ding");
    const dingTap = ding?.tap_action as { action?: string; perform_action?: string; target?: { entity_id?: string } };
    assert.equal(String(ding?.type).includes("template-card"), true);
    assert.equal(dingTap?.action, "perform-action");
    assert.equal(dingTap?.perform_action, "button.press");
    assert.equal(dingTap?.target?.entity_id, "button.ding");
    assert.equal((ding?.hold_action as { action?: string }).action, "more-info");

    const quiet = cards.find((card) => card.entity === "input_button.quiet");
    const quietTap = quiet?.tap_action as { action?: string; perform_action?: string; target?: { entity_id?: string } };
    assert.equal(String(quiet?.type).includes("template-card"), true);
    assert.equal(quietTap?.action, "perform-action");
    assert.equal(quietTap?.perform_action, "input_button.press");
    assert.equal(quietTap?.target?.entity_id, "input_button.quiet");
    assert.equal((quiet?.hold_action as { action?: string }).action, "more-info");

    const scene = cards.find((card) => card.entity === "scene.movie");
    const sceneTap = scene?.tap_action as { action?: string; perform_action?: string; target?: { entity_id?: string } };
    assert.equal(String(scene?.type).includes("template-card"), true);
    assert.equal(sceneTap?.action, "perform-action");
    assert.equal(sceneTap?.perform_action, "scene.turn_on");
    assert.equal(sceneTap?.target?.entity_id, "scene.movie");

    const script = cards.find((card) => card.entity === "script.bedtime");
    const scriptTap = script?.tap_action as { action?: string; perform_action?: string; target?: { entity_id?: string } };
    assert.equal(String(script?.type).includes("template-card"), true);
    assert.equal(scriptTap?.action, "perform-action");
    assert.equal(scriptTap?.perform_action, "script.turn_on");
    assert.equal(scriptTap?.target?.entity_id, "script.bedtime");
  });

  it("fills Other Sensors, Locks, and Vacuums from their active states and leaves the other new sections off the dots", () => {
    const sections = {
      ...emptySections(),
      sensors: ["binary_sensor.leak", "binary_sensor.safe"],
      locks: ["lock.unlocked", "lock.locked", "lock.unavailable", "lock.unknown", "lock.jammed", "lock.open"],
      vacuums: [
        "vacuum.cleaning",
        "vacuum.idle",
        "vacuum.returning",
        "vacuum.on",
        "vacuum.docked",
        "vacuum.paused",
        "vacuum.off",
      ],
      buttons: ["button.ding"],
      scenes: ["scene.movie"],
      scripts: ["script.bedtime"],
    };
    const states = {
      "binary_sensor.leak": state("binary_sensor.leak", "on"),
      "binary_sensor.safe": state("binary_sensor.safe", "off"),
      "lock.unlocked": state("lock.unlocked", "unlocked"),
      "lock.locked": state("lock.locked", "locked"),
      "lock.unavailable": state("lock.unavailable", "unavailable"),
      "lock.unknown": state("lock.unknown", "unknown"),
      "lock.jammed": state("lock.jammed", "jammed"),
      "lock.open": state("lock.open", "open"),
      "vacuum.cleaning": state("vacuum.cleaning", "cleaning"),
      "vacuum.idle": state("vacuum.idle", "idle"),
      "vacuum.returning": state("vacuum.returning", "returning"),
      "vacuum.on": state("vacuum.on", "on"),
      "vacuum.docked": state("vacuum.docked", "docked"),
      "vacuum.paused": state("vacuum.paused", "paused"),
      "vacuum.off": state("vacuum.off", "off"),
      "button.ding": state("button.ding", "unknown"),
      "scene.movie": state("scene.movie", "unknown"),
      "script.bedtime": state("script.bedtime", "on"),
    };
    const rollups = sectionRollups(sections, states);
    assert.deepEqual(
      rollups
        .filter((rollup) => rollup.id === "sensors" || rollup.id === "locks" || rollup.id === "vacuums")
        .map((rollup) => rollupLabel(rollup)),
      ["Other Sensors 1/2 On", "Locks 3/6 Unlocked", "Vacuums 3/7 Cleaning"],
    );
    assert.equal(dotTooltipLabel("bubble-sub-button area-dot-sensors-on", rollups), "Other Sensors 1/2 On");
    assert.equal(dotTooltipLabel("bubble-sub-button area-dot-locks-on", rollups), "Locks 3/6 Unlocked");
    assert.equal(dotTooltipLabel("bubble-sub-button area-dot-vacuums-on", rollups), "Vacuums 3/7 Cleaning");

    const slots = collapsedDotSlots([]);
    const config = buildButtonConfig({
      areaId: "bedroom",
      name: "Master Bedroom",
      icon: "mdi:bed",
      sections,
      states,
      dotSlots: slots,
    });
    const dots = config.sub_button as Array<{ css_class: string }>;
    assert.equal(dots[slots.indexOf("sensors")]?.css_class, "area-dot-sensors-on");
    assert.equal(dots[slots.indexOf("locks")]?.css_class, "area-dot-locks-on");
    assert.equal(dots[slots.indexOf("vacuums")]?.css_class, "area-dot-vacuums-on");
    assert.equal(dots.some((dot) => dot.css_class.includes("buttons")), false);
    assert.equal(dots.some((dot) => dot.css_class.includes("scenes")), false);
    assert.equal(dots.some((dot) => dot.css_class.includes("scripts")), false);
    assert.equal("state_content" in config, false);
  });

  it("leaves sensors, locks, and vacuums hollow when nothing is active", () => {
    const sections = {
      ...emptySections(),
      sensors: ["binary_sensor.safe", "binary_sensor.gone"],
      locks: ["lock.locked"],
      vacuums: ["vacuum.docked"],
      buttons: ["button.ding"],
      scenes: ["scene.movie"],
      scripts: ["script.bedtime"],
    };
    const states = {
      "binary_sensor.safe": state("binary_sensor.safe", "off"),
      "binary_sensor.gone": state("binary_sensor.gone", "unavailable"),
      "lock.locked": state("lock.locked", "locked"),
      "vacuum.docked": state("vacuum.docked", "docked"),
      "button.ding": state("button.ding", "unknown"),
      "scene.movie": state("scene.movie", "unknown"),
      "script.bedtime": state("script.bedtime", "on"),
    };
    const rollups = sectionRollups(sections, states);
    assert.deepEqual(
      rollups
        .filter((rollup) => rollup.id === "sensors" || rollup.id === "locks" || rollup.id === "vacuums")
        .map((rollup) => rollupLabel(rollup)),
      ["Other Sensors 0/2 On", "Locks 0/1 Unlocked", "Vacuums 0/1 Cleaning"],
    );
    const slots = collapsedDotSlots([]);
    const config = buildButtonConfig({
      areaId: "bedroom",
      name: "Master Bedroom",
      icon: "mdi:bed",
      sections,
      states,
      dotSlots: slots,
    });
    const dots = config.sub_button as Array<{ css_class: string }>;
    assert.equal(dots[slots.indexOf("sensors")]?.css_class, "area-dot-sensors-off");
    assert.equal(dots[slots.indexOf("locks")]?.css_class, "area-dot-locks-off");
    assert.equal(dots[slots.indexOf("vacuums")]?.css_class, "area-dot-vacuums-off");
    assert.equal("state_content" in config, false);
  });

  it("hides the new sections and still rejects an unknown id", () => {
    const hide = parseHideSections(["sensors", "locks", "vacuums", "buttons", "scenes", "scripts"]);
    assert.deepEqual(hide, ["sensors", "locks", "vacuums", "buttons", "scenes", "scripts"]);
    assert.throws(() => parseHideSections(["fans"]), /Unknown/);
    assert.throws(() => parseHideSections(["sensors", "bogus"]), /Unknown/);

    const sections = {
      ...emptySections(),
      lights: ["light.a"],
      sensors: ["binary_sensor.leak"],
      locks: ["lock.front"],
      vacuums: ["vacuum.rover"],
      buttons: ["button.ding"],
      scenes: ["scene.movie"],
      scripts: ["script.bedtime"],
    };
    for (const id of hide) assert.equal(sectionHasEntities(id, sections), true, id);
    const visible = withoutSections(sections, hide);
    assert.deepEqual(visible.sensors, []);
    assert.deepEqual(visible.locks, []);
    assert.deepEqual(visible.vacuums, []);
    assert.deepEqual(visible.buttons, []);
    assert.deepEqual(visible.scenes, []);
    assert.deepEqual(visible.scripts, []);
    assert.deepEqual(visible.lights, ["light.a"]);
    for (const id of hide) assert.equal(sectionHasEntities(id, visible), false, id);

    const slots = collapsedDotSlots(hide);
    assert.equal(slots.includes("sensors"), false);
    assert.equal(slots.includes("locks"), false);
    assert.equal(slots.includes("vacuums"), false);
    const states = {
      "light.a": state("light.a", "on"),
      "binary_sensor.leak": state("binary_sensor.leak", "on"),
      "lock.front": state("lock.front", "unlocked"),
      "vacuum.rover": state("vacuum.rover", "cleaning"),
      "button.ding": state("button.ding", "unknown"),
      "scene.movie": state("scene.movie", "unknown"),
      "script.bedtime": state("script.bedtime", "on"),
    };
    const titles = buildPopupCards(visible, states, "Bedroom")
      .filter((card) => card.title)
      .map((card) => card.title);
    assert.deepEqual(titles, ["Status", "Lights"]);
    assert.equal(JSON.stringify(titles).includes("Other Sensors"), false);
    assert.equal(JSON.stringify(titles).includes("Buttons"), false);
    assert.equal(JSON.stringify(titles).includes("Scenes"), false);
    assert.equal(JSON.stringify(titles).includes("Scripts"), false);
  });

  it("files non-climate sensor.* entities in Other Sensors while keeping template, diagnostic, and satellite sensors separate", () => {
    const result = classifyArea(
      hass({
        devices: [{ id: "kiosk", area_id: "laundry", manufacturer: "Kiosk Satellite" }],
        entities: [
          { entity_id: "sensor.dryer_status", area_id: "laundry" },
          { entity_id: "sensor.dryer_power", area_id: "laundry" },
          { entity_id: "sensor.dryer_diag", area_id: "laundry", entity_category: "diagnostic" },
          { entity_id: "sensor.dryer_config", area_id: "laundry", entity_category: "config" },
          { entity_id: "sensor.template_countdown", area_id: "laundry", platform: "template" },
          { entity_id: "sensor.kiosk_uptime", device_id: "kiosk" },
          { entity_id: "assist_satellite.kiosk", device_id: "kiosk" },
        ],
        states: {
          "sensor.dryer_status": state("sensor.dryer_status", "drying", { friendly_name: "Dryer Status" }),
          "sensor.dryer_power": state("sensor.dryer_power", "2400", { device_class: "power", friendly_name: "Dryer Power" }),
          "sensor.dryer_diag": state("sensor.dryer_diag", "ok"),
          "sensor.dryer_config": state("sensor.dryer_config", "1"),
          "sensor.template_countdown": state("sensor.template_countdown", "12"),
          "sensor.kiosk_uptime": state("sensor.kiosk_uptime", "100"),
          "assist_satellite.kiosk": state("assist_satellite.kiosk", "idle"),
        },
      }),
      "laundry",
    );
    assert.deepEqual(result.sensors, ["sensor.dryer_power", "sensor.dryer_status"]);
    assert.deepEqual(result.helpers, ["sensor.template_countdown"]);
    assert.equal(listedIds(result).includes("sensor.dryer_diag"), false);
    assert.equal(listedIds(result).includes("sensor.dryer_config"), false);
    assert.equal(listedIds(result).includes("sensor.kiosk_uptime"), false);
  });

  it("shows a hollow sensors dot without a 0/0 status chip when Other Sensors has only non-binary sensors", () => {
    const sections = {
      ...emptySections(),
      sensors: ["sensor.dryer_power", "sensor.dryer_status"],
    };
    const states = {
      "sensor.dryer_power": state("sensor.dryer_power", "2400", { friendly_name: "Dryer Power" }),
      "sensor.dryer_status": state("sensor.dryer_status", "drying", { friendly_name: "Dryer Status" }),
    };

    const slots = collapsedDotSlots([]);
    const button = buildButtonConfig({
      areaId: "laundry",
      name: "Laundry",
      icon: "mdi:tumble-dryer",
      sections,
      states,
      dotSlots: slots,
    });
    const dots = button.sub_button as Array<{ css_class: string }>;
    assert.equal(dots[slots.indexOf("sensors")]?.css_class, "area-dot-sensors-off");

    const cards = buildPopupCards(sections, states, "Laundry");
    assert.equal(cards.some((card) => card.title === "Status"), false);
    assert.deepEqual(
      cards.filter((card) => card.title).map((card) => card.title),
      ["Other Sensors"],
    );
    assert.deepEqual(
      cards.filter((card) => card.entity).map((card) => card.entity),
      ["sensor.dryer_power", "sensor.dryer_status"],
    );

    const floorOnlyNonBinary = floorDotRow(slots, [sectionRollups(sections, states)]);
    const sensorDot = floorOnlyNonBinary.find((dot) => dot.id === "sensors");
    assert.equal(sensorDot?.state, "off");
    assert.equal(sensorDot?.label, "Other Sensors");

    const withBinary = {
      ...emptySections(),
      sensors: ["binary_sensor.leak", "sensor.dryer_power"],
    };
    const withBinaryStates = {
      "binary_sensor.leak": state("binary_sensor.leak", "on"),
      ...states,
    };
    const mixedRollups = sectionRollups(withBinary, withBinaryStates);
    assert.deepEqual(
      mixedRollups.map((rollup) => rollupLabel(rollup)),
      ["Other Sensors 1/1 On"],
    );

    const floorMerged = floorDotRow(slots, [sectionRollups(sections, states), mixedRollups]);
    const mergedDot = floorMerged.find((dot) => dot.id === "sensors");
    assert.equal(mergedDot?.state, "on");
    assert.equal(mergedDot?.label, "Other Sensors 1/1 On");
  });

  it("groups Other Sensors by device under device subheadings", () => {
    const h = hass({
      devices: [
        { id: "dryer", area_id: "laundry", name: "Laundry Dryer" },
        { id: "washer", area_id: "laundry", name: "Washer", name_by_user: "Laundry Washer" },
      ],
      entities: [
        { entity_id: "binary_sensor.standalone", area_id: "laundry" },
        { entity_id: "sensor.dryer_status", device_id: "dryer" },
        { entity_id: "sensor.dryer_remaining", device_id: "dryer" },
        { entity_id: "sensor.washer_status", device_id: "washer" },
      ],
      states: {
        "binary_sensor.standalone": state("binary_sensor.standalone", "off", { friendly_name: "Floor Leak" }),
        "sensor.dryer_status": state("sensor.dryer_status", "off", { friendly_name: "Dryer Current status" }),
        "sensor.dryer_remaining": state("sensor.dryer_remaining", "unknown", { friendly_name: "Dryer Remaining time" }),
        "sensor.washer_status": state("sensor.washer_status", "off", { friendly_name: "Washer Current status" }),
      },
    });
    const sections = classifyArea(h, "laundry");
    const cards = buildPopupCards(sections, h.states, "Laundry");
    assert.deepEqual(
      cards.map((card) => (card.title ? `title:${card.title}:${card.variant ?? "section"}` : `entity:${card.entity}`)),
      [
        "title:Status:section",
        "entity:undefined",
        "title:Other Sensors:section",
        "entity:binary_sensor.standalone",
        "title:Dryer:group",
        "entity:sensor.dryer_status",
        "entity:sensor.dryer_remaining",
        "title:Washer:group",
        "entity:sensor.washer_status",
      ],
    );
  });
});

describe("section rollups", () => {
  it("counts 1 of 4 lights on and 1 of 4 openings open", () => {
    const lights = ["light.a", "light.b", "light.c", "light.d"];
    const openings = ["binary_sensor.d1", "binary_sensor.d2", "binary_sensor.d3", "binary_sensor.d4"];
    const sections = { ...emptySections(), lights, openings };
    const states = {
      "light.a": state("light.a", "on"),
      "light.b": state("light.b", "off"),
      "light.c": state("light.c", "off"),
      "light.d": state("light.d", "off"),
      "binary_sensor.d1": state("binary_sensor.d1", "on"),
      "binary_sensor.d2": state("binary_sensor.d2", "off"),
      "binary_sensor.d3": state("binary_sensor.d3", "off"),
      "binary_sensor.d4": state("binary_sensor.d4", "off"),
    };
    const rollups = sectionRollups(sections, states);
    assert.deepEqual(
      rollups.map((rollup) => rollupLabel(rollup)),
      ["Lights 1/4 On", "Entries 1/4 Open"],
    );
    assert.equal(dotTooltipLabel("bubble-sub-button area-dot-lights-on", rollups), "Lights 1/4 On");
    assert.equal(dotTooltipLabel("bubble-sub-button area-dot-openings-on", rollups), "Entries 1/4 Open");
    assert.equal(dotTooltipLabel("bubble-sub-button area-dot-media-empty", rollups), null);
    assert.equal(dotTooltipLabel("bubble-sub-button area-dot-climate-empty", rollups), null);
    const below = tooltipPosition({ left: 100, top: 80, width: 14, height: 14 }, { width: 120, height: 24 }, { width: 800, height: 600 });
    assert.equal(below.top, 80 + 14 + 6);
    assert.equal(below.left, 100 + 7 - 60);
    const nearTop = tooltipPosition({ left: 100, top: 2, width: 14, height: 14 }, { width: 120, height: 24 }, { width: 800, height: 600 });
    assert.equal(nearTop.top, 2 + 14 + 6);
    const pushedUp = tooltipPosition({ left: 100, top: 580, width: 14, height: 14 }, { width: 120, height: 24 }, { width: 800, height: 600 });
    assert.equal(pushedUp.top, 580 - 6 - 24);
    const clampedRight = tooltipPosition({ left: 780, top: 80, width: 14, height: 14 }, { width: 120, height: 24 }, { width: 800, height: 600 });
    assert.equal(clampedRight.left, 800 - 4 - 120);
    const clampedLeft = tooltipPosition({ left: 2, top: 80, width: 14, height: 14 }, { width: 120, height: 24 }, { width: 800, height: 600 });
    assert.equal(clampedLeft.left, 4);
    const wide = tooltipPosition({ left: 400, top: 80, width: 14, height: 14 }, { width: 900, height: 24 }, { width: 800, height: 600 });
    assert.equal(wide.left, 4);

    const openingCover = sectionRollups(
      { ...emptySections(), openings: ["cover.shade"] },
      { "cover.shade": state("cover.shade", "opening") },
    );
    assert.equal(openingCover[0]?.active, 1);
    const closedCover = sectionRollups(
      { ...emptySections(), openings: ["cover.shade"] },
      { "cover.shade": state("cover.shade", "closed") },
    );
    assert.equal(closedCover[0]?.active, 0);
  });

  it("counts helper binaries and ignores input_select and timers", () => {
    const sections = {
      ...emptySections(),
      helpers: ["input_boolean.guest", "input_boolean.away", "timer.nap", "binary_sensor.template_flag"],
      selects: ["input_select.scene"],
    };
    const states = {
      "input_boolean.guest": state("input_boolean.guest", "on"),
      "input_boolean.away": state("input_boolean.away", "off"),
      "timer.nap": state("timer.nap", "active"),
      "binary_sensor.template_flag": state("binary_sensor.template_flag", "off"),
      "input_select.scene": state("input_select.scene", "movie"),
    };
    const rollups = sectionRollups(sections, states);
    assert.deepEqual(
      rollups.map((rollup) => `${rollup.title} ${rollup.active}/${rollup.total} ${rollup.word}`),
      ["Helpers 1/3 On"],
    );

    const selectsOnly = sectionRollups(
      { ...emptySections(), selects: ["input_select.scene"], helpers: ["timer.nap"] },
      states,
    );
    assert.deepEqual(selectsOnly, []);
    const cards = buildPopupCards(
      { ...emptySections(), selects: ["input_select.scene"], helpers: ["timer.nap"] },
      states,
    );
    assert.deepEqual(
      cards.filter((card) => card.title).map((card) => card.title),
      ["Helpers"],
    );
  });

  it("omits a climate chip for numeric sensors and still shows the cards", () => {
    const sections = {
      ...emptySections(),
      climate: ["sensor.temp"],
      lights: ["light.desk"],
    };
    const states = {
      "sensor.temp": state("sensor.temp", "21", { device_class: "temperature", friendly_name: "Man Cave Temperature" }),
      "light.desk": state("light.desk", "off", { friendly_name: "Desk" }),
    };
    assert.deepEqual(
      sectionRollups(sections, states).map((rollup) => rollup.id),
      ["lights"],
    );
    const cards = buildPopupCards(sections, states, "Man Cave");
    assert.deepEqual(
      cards.filter((card) => card.title).map((card) => card.title),
      ["Status", "Climate", "Lights"],
    );
    const climate = cards.find((card) => card.entity === "sensor.temp");
    assert.equal(climate?.name, "Temperature");
    assert.equal(climateSubtitle(sections.climate, states, "Man Cave"), "Temperature 21");
  });

  it("labels the satellite section Satellites and counts alarm or companion LED", () => {
    const sections = {
      ...emptySections(),
      satellites: [
        {
          entityId: "assist_satellite.kiosk",
          ledEntityId: "light.kiosk_led",
          alarmEntityId: "binary_sensor.kiosk_alarm",
        },
      ],
    };
    const offStates = {
      "assist_satellite.kiosk": state("assist_satellite.kiosk", "idle", { friendly_name: "Man Cave Kiosk" }),
      "binary_sensor.kiosk_alarm": state("binary_sensor.kiosk_alarm", "off"),
      "light.kiosk_led": state("light.kiosk_led", "off"),
    };
    const off = sectionRollups(sections, offStates);
    assert.equal(sectionTitle("satellites"), "Satellites");
    assert.equal(off[0]?.id, "satellites");
    assert.deepEqual(
      off.map((rollup) => rollupLabel(rollup)),
      ["Satellites 0/1 On"],
    );
    assert.equal(dotTooltipLabel("bubble-sub-button area-dot-satellites-off", off), "Satellites 0/1 On");
    assert.equal(dotTooltipLabel("bubble-sub-button area-dot-satellites-empty", off), null);

    const cards = buildPopupCards(sections, offStates, "Man Cave");
    assert.deepEqual(
      cards.filter((card) => card.title).map((card) => card.title),
      ["Status", "Satellites"],
    );
    const chips = cards.find((card) => String(card.type).endsWith("chips-card"));
    const contents = (chips?.chips as Array<{ content: string }>).map((chip) => chip.content);
    assert.deepEqual(contents, ["Satellites 0/1 On"]);

    const alarmOn = sectionRollups(sections, {
      ...offStates,
      "binary_sensor.kiosk_alarm": state("binary_sensor.kiosk_alarm", "on"),
    });
    assert.equal(rollupLabel(alarmOn[0]!), "Satellites 1/1 On");
    const ledOn = sectionRollups(sections, {
      "binary_sensor.kiosk_alarm": state("binary_sensor.kiosk_alarm", "off"),
      "light.kiosk_led": state("light.kiosk_led", "on"),
    });
    assert.equal(rollupLabel(ledOn[0]!), "Satellites 1/1 On");
    assert.equal(JSON.stringify(cards).includes("Kiosk & Satellites"), false);
  });
});

function popupSection(cards: readonly Record<string, unknown>[], title: string): Record<string, unknown>[] {
  const start = cards.findIndex((card) => String(card.type).endsWith("section-title") && card.title === title);
  if (start < 0) return [];
  let end = cards.length;
  for (let index = start + 1; index < cards.length; index += 1) {
    if (String(cards[index]?.type).endsWith("section-title")) {
      end = index;
      break;
    }
  }
  return cards.slice(start, end);
}

describe("collapsed area dot tooltips", () => {
  const room = "Man Cave";

  it("shows the popup section, including the heading and every row", () => {
    const sections = {
      ...emptySections(),
      lights: ["light.lamp", "light.bare", "light.desk"],
      lightLeds: { "light.desk": "switch.desk_led" },
      mediaPlayers: ["media_player.speaker", "media_player.tv"],
      cameras: ["camera.door"],
      openings: ["binary_sensor.window", "cover.door"],
      switches: ["switch.fan"],
      climate: ["sensor.temp"],
      automations: ["automation.bedtime"],
    };
    const states = {
      "light.lamp": state("light.lamp", "off", { friendly_name: "Man Cave Lamp" }),
      "light.bare": state("light.bare", "on"),
      "light.desk": state("light.desk", "off", { friendly_name: "Man Cave Desk" }),
      "media_player.speaker": state("media_player.speaker", "off", { friendly_name: "Man Cave Speaker" }),
      "media_player.tv": state("media_player.tv", "playing", { friendly_name: "Man Cave TV" }),
      "camera.door": state("camera.door", "idle", { friendly_name: "Man Cave Door Camera" }),
      "binary_sensor.window": state("binary_sensor.window", "on", { friendly_name: "Man Cave Window" }),
      "cover.door": state("cover.door", "closed", { friendly_name: "Man Cave Door" }),
      "switch.fan": state("switch.fan", "on", { friendly_name: "Man Cave Fan" }),
      "sensor.temp": state("sensor.temp", "21", {
        friendly_name: "Man Cave Temperature",
        device_class: "temperature",
        unit_of_measurement: "°C",
      }),
      "automation.bedtime": state("automation.bedtime", "on", { friendly_name: "Man Cave Bedtime" }),
    };
    const rollups = sectionRollups(sections, states);
    const tipSource = { sections, states, roomName: room };
    const popup = buildPopupCards(sections, states, room);
    const lights = areaDotTooltipCards("bubble-sub-button area-dot-lights-on", tipSource);
    assert.deepEqual(lights, popupSection(popup, "Lights"));
    assert.equal(lights?.[0]?.title, "Lights");
    assert.equal(JSON.stringify(lights).includes("switch.desk_led"), true);
    assert.equal(JSON.stringify(lights).includes("switch.fan"), false);
    assert.equal(JSON.stringify(lights).includes("camera.door"), false);
    assert.deepEqual(areaDotTooltipCards("bubble-sub-button area-dot-media-on", tipSource), popupSection(popup, "Media players"));
    assert.deepEqual(areaDotTooltipCards("bubble-sub-button area-dot-cameras-off", tipSource), popupSection(popup, "Cameras"));
    assert.deepEqual(areaDotTooltipCards("bubble-sub-button area-dot-openings-on", tipSource), popupSection(popup, "Entries"));
    assert.equal(areaDotTooltipCards("bubble-sub-button area-dot-occupancy-empty", tipSource), null);
    assert.equal(areaDotTooltipCards("bubble-sub-button area-dot-helpers-empty", tipSource), null);
    const [floorDot] = floorDotRow(["lights"], [rollups]);
    assert.equal(floorDot?.label, "Lights 1/3 On");
  });

  it("includes every helpers row from the popup, including selects and timers", () => {
    const sections = {
      ...emptySections(),
      helpers: ["input_boolean.guest", "timer.nap", "binary_sensor.flag"],
      selects: ["input_select.scene"],
    };
    const states = {
      "input_boolean.guest": state("input_boolean.guest", "on", { friendly_name: "Man Cave Guest Mode" }),
      "timer.nap": state("timer.nap", "active", { friendly_name: "Man Cave Nap" }),
      "binary_sensor.flag": state("binary_sensor.flag", "off", { friendly_name: "Flag" }),
      "input_select.scene": state("input_select.scene", "movie", { friendly_name: "Man Cave Scene" }),
    };
    const tip = areaDotTooltipCards("bubble-sub-button area-dot-helpers-on", {
      sections,
      states,
      roomName: room,
    });
    const helpers = popupSection(buildPopupCards(sections, states, room), "Helpers");
    assert.deepEqual(tip, helpers);
    assert.deepEqual(
      helpers.flatMap((card) => (typeof card.entity === "string" ? [card.entity] : [])),
      ["input_select.scene", "input_boolean.guest", "timer.nap", "binary_sensor.flag"],
    );
    assert.equal(
      areaDotTooltipCards("bubble-sub-button area-dot-helpers-empty", {
        sections,
        states,
        roomName: room,
      }),
      null,
    );
  });

  it("uses the same rows the popup builds for each dotted section", () => {
    const sections = {
      ...emptySections(),
      lights: ["light.plain", "light.dim"],
      switches: ["switch.fan"],
      openings: ["binary_sensor.window"],
      occupancy: [{ entityId: "binary_sensor.motion", pressureEntityId: "sensor.pressure" }],
      satellites: [
        {
          entityId: "assist_satellite.kiosk",
          ledEntityId: "light.kiosk_led",
          alarmEntityId: "binary_sensor.kiosk_alarm",
        },
      ],
    };
    const states = {
      "light.plain": state("light.plain", "off", { friendly_name: "Man Cave Plain" }),
      "light.dim": state("light.dim", "on", {
        friendly_name: "Man Cave Dim",
        supported_color_modes: ["brightness"],
      }),
      "switch.fan": state("switch.fan", "on", { friendly_name: "Man Cave Fan" }),
      "binary_sensor.window": state("binary_sensor.window", "on", { friendly_name: "Man Cave Window" }),
      "binary_sensor.motion": state("binary_sensor.motion", "on", { friendly_name: "Man Cave Motion" }),
      "sensor.pressure": state("sensor.pressure", "1013", {
        friendly_name: "Man Cave Pressure",
        unit_of_measurement: "hPa",
      }),
      "assist_satellite.kiosk": state("assist_satellite.kiosk", "idle", { friendly_name: "Man Cave Kiosk" }),
      "light.kiosk_led": state("light.kiosk_led", "on", { brightness: 128 }),
      "binary_sensor.kiosk_alarm": state("binary_sensor.kiosk_alarm", "off"),
    };
    const format = (entity: EntityState) => `fmt ${entity.state}`;
    const tipSource = { sections, states, roomName: room, formatEntityState: format };
    const popup = buildPopupCards(sections, states, room, new Set(), { formatEntityState: format });
    assert.deepEqual(areaDotTooltipCards("bubble-sub-button area-dot-lights-on", tipSource), popupSection(popup, "Lights"));
    assert.deepEqual(areaDotTooltipCards("bubble-sub-button area-dot-switches-on", tipSource), popupSection(popup, "Switches"));
    assert.deepEqual(areaDotTooltipCards("bubble-sub-button area-dot-openings-on", tipSource), popupSection(popup, "Entries"));
    assert.deepEqual(areaDotTooltipCards("bubble-sub-button area-dot-occupancy-on", tipSource), popupSection(popup, "Occupancy"));
    const satellite = areaDotTooltipCards("bubble-sub-button area-dot-satellites-on", tipSource);
    assert.deepEqual(satellite, popupSection(popup, "Satellites"));
    assert.equal(JSON.stringify(satellite).includes("light.kiosk_led"), true);
    assert.equal(JSON.stringify(satellite).includes("binary_sensor.kiosk_alarm"), true);
  });
});

describe("light LED dot", () => {
  it("puts a same-device LED switch on the light card and not in helpers", () => {
    const desk = "light.man_cave_desk_lamp";
    const led = "switch.man_cave_desk_lamp_led";
    const result = classifyArea(
      hass({
        devices: [{ id: "desk", area_id: "office_of_drew" }],
        entities: [
          { entity_id: desk, device_id: "desk" },
          { entity_id: led, device_id: "desk", entity_category: "config" },
          { entity_id: "switch.orphan_led", area_id: "office_of_drew" },
        ],
        states: {
          [desk]: state(desk, "off", { friendly_name: "Man Cave Desk Lamp", supported_color_modes: ["onoff"] }),
          [led]: state(led, "on", { friendly_name: "Man Cave Desk Lamp LED" }),
          "switch.orphan_led": state("switch.orphan_led", "on"),
        },
      }),
      "office_of_drew",
    );
    assert.deepEqual(result.lights, [desk]);
    assert.deepEqual(result.lightLeds, { [desk]: led });
    assert.deepEqual(result.helpers, []);
    assert.deepEqual(result.switches, []);

    const cards = buildPopupCards(result, {
      [desk]: state(desk, "off", { friendly_name: "Man Cave Desk Lamp", supported_color_modes: ["onoff"] }),
      [led]: state(led, "on"),
    }, "Man Cave");
    const row = cards.find((card) => card.led_entity === led);
    const inner = row?.card as Record<string, unknown>;
    assert.equal(row?.type, "custom:area-card-light-row");
    assert.equal(inner?.type, "custom:area-card-mushroom-template-card");
    assert.equal(inner?.primary, "Desk Lamp");
    assert.deepEqual(inner?.tap_action, { action: "more-info" });
    assert.deepEqual(inner?.icon_tap_action, {
      action: "perform-action",
      perform_action: "light.toggle",
      target: { entity_id: desk },
    });
    assert.equal(cards.some((card) => card.entity === led), false);
    assert.equal(cards.some((card) => card.entity === "switch.orphan_led"), false);
  });
});

describe("stripRoomName", () => {
  it("removes a leading room name and one separator", () => {
    assert.equal(stripRoomName("Man Cave Desk Lamp", "Man Cave"), "Desk Lamp");
    assert.equal(stripRoomName("Man Cave - Desk Lamp", "Man Cave"), "Desk Lamp");
    assert.equal(stripRoomName("Man Cave: Desk Lamp", "Man Cave"), "Desk Lamp");
    assert.equal(stripRoomName("Man Cave|Desk Lamp", "Man Cave"), "Desk Lamp");
    assert.equal(stripRoomName("Master Bedroom — Under Bed Light Strip", "Master Bedroom"), "Under Bed Light Strip");
    assert.equal(stripRoomName("Master Bedroom Reading Lamp", "Master Bedroom"), "Reading Lamp");
    assert.equal(stripRoomName("Man Cave Doors are Correct", "Man Cave"), "Doors are Correct");
    assert.equal(stripRoomName("Man Cave · Occupied · Turn on Lights", "Man Cave"), "Occupied · Turn on Lights");
  });

  it("leaves unrelated titles, the exact room name, and the header alone", () => {
    assert.equal(stripRoomName("Updoot1 Alarm ringing", "Man Cave"), "Updoot1 Alarm ringing");
    assert.equal(stripRoomName("Man Cave", "Man Cave"), "Man Cave");
    assert.equal(stripRoomName("man cave desk lamp", "Man Cave"), "desk lamp");
    assert.equal(stripRoomName("Man Caves are nice", "Man Cave"), "Man Caves are nice");

    const popup = buildPopupConfig(
      "office_of_drew",
      "Man Cave",
      "mdi:office-building",
      {
        ...emptySections(),
        lights: ["light.man_cave_desk_lamp"],
      },
      {
        "light.man_cave_desk_lamp": state("light.man_cave_desk_lamp", "on", {
          friendly_name: "Man Cave Desk Lamp",
          supported_color_modes: ["onoff"],
        }),
      },
    );
    assert.equal(popup.name, "Man Cave");
    const lamp = (popup.cards as Array<Record<string, unknown>>).find((card) => card.entity === "light.man_cave_desk_lamp");
    assert.equal(lamp?.primary, "Desk Lamp");
    const button = buildButtonConfig({
      areaId: "office_of_drew",
      name: "Man Cave",
      icon: "mdi:office-building",
      sections: { ...emptySections(), lights: ["light.man_cave_desk_lamp"] },
      states: {
        "light.man_cave_desk_lamp": state("light.man_cave_desk_lamp", "off"),
      },
    });
    assert.equal(button.name, "Man Cave");
  });
});

// ---------------------------------------------------------------------------
// Floor helpers
// ---------------------------------------------------------------------------

function floorHass(
  floors: Record<string, FloorEntry>,
  areas: Record<string, AreaEntry>,
): ClassifierHass {
  return { floors, areas };
}

describe("floorDisplay", () => {
  it("returns the floor name and icon when present", () => {
    const h = floorHass({ downstairs: { floor_id: "downstairs", name: "Downstairs", icon: "mdi:home-floor-0" } }, {});
    assert.deepEqual(floorDisplay(h, "downstairs"), { name: "Downstairs", icon: "mdi:home-floor-0" });
  });

  it("falls back to the floor id when name is missing", () => {
    const h = floorHass({ f1: { floor_id: "f1" } }, {});
    assert.equal(floorDisplay(h, "f1").name, "f1");
  });

  it("returns no icon when the floor icon is missing", () => {
    const h = floorHass({ f1: { floor_id: "f1", name: "Ground" } }, {});
    assert.equal(floorDisplay(h, "f1").icon, null);
  });

  it("returns no icon when the floor icon is null or empty", () => {
    const missing = floorHass({ f1: { floor_id: "f1", name: "Ground", icon: null } }, {});
    const empty = floorHass({ f1: { floor_id: "f1", name: "Ground", icon: "" } }, {});
    assert.equal(floorDisplay(missing, "f1").icon, null);
    assert.equal(floorDisplay(empty, "f1").icon, null);
  });

  it("returns the floor id and no icon when the floor is unknown", () => {
    const h = floorHass({}, {});
    assert.deepEqual(floorDisplay(h, "unknown"), { name: "unknown", icon: null });
  });

  it("returns the floor id and no icon when floors registry is absent", () => {
    const h: ClassifierHass = {};
    assert.deepEqual(floorDisplay(h, "x"), { name: "x", icon: null });
  });
});

describe("areasOnFloor", () => {
  it("returns areas whose floor_id matches, sorted by name", () => {
    const h = floorHass(
      { down: { floor_id: "down", name: "Downstairs" } },
      {
        kitchen: { area_id: "kitchen", name: "Kitchen", floor_id: "down" },
        living: { area_id: "living", name: "Living Room", floor_id: "down" },
        office: { area_id: "office", name: "Office", floor_id: "up" },
        garage: { area_id: "garage", name: "Garage" },
      },
    );
    const result = areasOnFloor(h, "down");
    assert.deepEqual(
      result.map((a) => a.areaId),
      ["kitchen", "living"],
    );
  });

  it("sorts areas alphabetically by name", () => {
    const h = floorHass(
      { f: { floor_id: "f" } },
      {
        z_area: { area_id: "z_area", name: "Zebra Room", floor_id: "f" },
        a_area: { area_id: "a_area", name: "Apple Room", floor_id: "f" },
        m_area: { area_id: "m_area", name: "Mango Room", floor_id: "f" },
      },
    );
    const result = areasOnFloor(h, "f");
    assert.deepEqual(
      result.map((a) => a.name),
      ["Apple Room", "Mango Room", "Zebra Room"],
    );
  });

  it("breaks name ties by area id", () => {
    const h = floorHass(
      { f: { floor_id: "f" } },
      {
        b_room: { area_id: "b_room", name: "Room", floor_id: "f" },
        a_room: { area_id: "a_room", name: "Room", floor_id: "f" },
      },
    );
    const result = areasOnFloor(h, "f");
    assert.deepEqual(
      result.map((a) => a.areaId),
      ["a_room", "b_room"],
    );
  });

  it("falls back to area id as name when area name is missing", () => {
    const h = floorHass(
      { f: { floor_id: "f" } },
      {
        nameless: { area_id: "nameless", floor_id: "f" },
      },
    );
    const result = areasOnFloor(h, "f");
    assert.equal(result[0].name, "nameless");
  });

  it("returns an empty list when no areas match the floor", () => {
    const h = floorHass(
      { f: { floor_id: "f" } },
      { kitchen: { area_id: "kitchen", name: "Kitchen", floor_id: "other" } },
    );
    assert.deepEqual(areasOnFloor(h, "f"), []);
  });

  it("returns an empty list when there are no areas at all", () => {
    const h: ClassifierHass = { floors: { f: { floor_id: "f" } } };
    assert.deepEqual(areasOnFloor(h, "f"), []);
  });
});

// ---------------------------------------------------------------------------
// hide_sections
// ---------------------------------------------------------------------------

describe("parseHideSections", () => {
  it("returns empty for undefined and null", () => {
    assert.deepEqual(parseHideSections(undefined), []);
    assert.deepEqual(parseHideSections(null), []);
  });

  it("returns valid ids unchanged", () => {
    assert.deepEqual(parseHideSections(["media", "satellites"]), ["media", "satellites"] as RollupId[]);
  });

  it("throws for a non-list value", () => {
    assert.throws(() => parseHideSections("media"), /list/);
    assert.throws(() => parseHideSections(42), /list/);
  });

  it("throws for an unknown section id", () => {
    assert.throws(() => parseHideSections(["media", "bogus"]), /Unknown/);
  });
});

describe("sectionHasEntities", () => {
  it("climate: present when climate has sensors, absent when empty", () => {
    assert.equal(sectionHasEntities("climate", { ...emptySections(), climate: ["sensor.temp"] }), true);
    assert.equal(sectionHasEntities("climate", emptySections()), false);
  });

  it("helpers: present when helpers OR selects non-empty, absent when both empty", () => {
    assert.equal(sectionHasEntities("helpers", { ...emptySections(), selects: ["input_select.s"] }), true);
    assert.equal(sectionHasEntities("helpers", { ...emptySections(), helpers: ["input_boolean.b"] }), true);
    assert.equal(sectionHasEntities("helpers", emptySections()), false);
  });

  it("covers every RollupId", () => {
    for (const id of ROLLUP_ORDER) {
      assert.equal(typeof sectionHasEntities(id, emptySections()), "boolean");
    }
  });
});

describe("withoutSections and hide_sections on button config", () => {
  it("clearing media and satellites removes those fields and leaves others intact", () => {
    const sections = {
      ...emptySections(),
      lights: ["light.a"],
      mediaPlayers: ["media_player.tv"],
      satellites: [{ entityId: "assist_satellite.kiosk" }],
    };
    const result = withoutSections(sections, ["media", "satellites"]);
    assert.deepEqual(result.mediaPlayers, []);
    assert.deepEqual(result.satellites, []);
    assert.deepEqual(result.lights, ["light.a"]);
  });

  it("clearing helpers removes both helpers and selects", () => {
    const sections = {
      ...emptySections(),
      helpers: ["input_boolean.g"],
      selects: ["input_select.s"],
    };
    const result = withoutSections(sections, ["helpers"]);
    assert.deepEqual(result.helpers, []);
    assert.deepEqual(result.selects, []);
  });

  it("clearing lights also removes lightLeds", () => {
    const sections = {
      ...emptySections(),
      lights: ["light.a"],
      lightLeds: { "light.a": "switch.a_led" },
    };
    const result = withoutSections(sections, ["lights"]);
    assert.deepEqual(result.lights, []);
    assert.deepEqual(result.lightLeds, {});
  });

  it("hiding media and satellites produces a shorter dot row with correct classes", () => {
    const hide: RollupId[] = ["media", "satellites"];
    const sections = {
      ...emptySections(),
      lights: ["light.a"],
      mediaPlayers: ["media_player.tv"],
    };
    const states = {
      "light.a": state("light.a", "on"),
      "media_player.tv": state("media_player.tv", "playing"),
    };
    const visibleSections = withoutSections(sections, hide);
    const dotSlots = collapsedDotSlots(hide);
    const config = buildButtonConfig({
      areaId: "room",
      name: "Room",
      icon: "mdi:home",
      sections: visibleSections,
      states,
      dotSlots,
    });
    const dots = config.sub_button as Array<Record<string, unknown>>;
    assert.equal(dots.length, dotSlots.length);
    assert.ok(!dots.some((d) => String(d.css_class).includes("media")));
    assert.ok(!dots.some((d) => String(d.css_class).includes("satellites")));
    assert.ok(!dots.some((d) => String(d.css_class).includes("climate")));
    assert.ok(dots.some((d) => String(d.css_class).includes("lights-on")));
    const classes = dots.map((d) => String(d.css_class));
    const expectedOrder = dotSlots.map((id) =>
      id === "lights" ? "area-dot-lights-on" : `area-dot-${id}-empty`,
    );
    assert.deepEqual(classes, expectedOrder);
  });

  it("popup omits hidden sections and their Status chips", () => {
    const hide: RollupId[] = ["media", "satellites"];
    const sections = {
      ...emptySections(),
      lights: ["light.a"],
      mediaPlayers: ["media_player.tv"],
      satellites: [{ entityId: "assist_satellite.kiosk" }],
    };
    const states = {
      "light.a": state("light.a", "off"),
      "media_player.tv": state("media_player.tv", "playing"),
      "assist_satellite.kiosk": state("assist_satellite.kiosk", "idle"),
    };
    const visible = withoutSections(sections, hide);
    const cards = buildPopupCards(visible, states, "Room");
    const titles = cards.filter((c) => c.title).map((c) => c.title);
    assert.ok(titles.includes("Lights"), "Lights section should be present");
    assert.ok(!titles.includes("Media players"), "Media players section should be hidden");
    assert.ok(!titles.includes("Satellites"), "Satellites section should be hidden");
  });
});

describe("floor-wide section hiding", () => {
  it("hides sections absent on every area and keeps sections present on any area", () => {
    // area1 has lights + temp sensor; area2 has openings + selects (helpers)
    const sections1 = { ...emptySections(), lights: ["light.a"], climate: ["sensor.temp"] };
    const sections2 = { ...emptySections(), openings: ["binary_sensor.door"], selects: ["input_select.s"] };
    const all = [sections1, sections2];
    const hide = ROLLUP_ORDER.filter((id) => all.every((s) => !sectionHasEntities(id, s)));
    // lights, openings, climate, helpers(selects) all have at least one area → not hidden
    assert.ok(!hide.includes("lights"), "lights present in area1");
    assert.ok(!hide.includes("openings"), "openings present in area2");
    assert.ok(!hide.includes("climate"), "climate present in area1 (temp sensor counts)");
    assert.ok(!hide.includes("helpers"), "helpers present in area2 (selects count)");
    // media, switches, occupancy, satellites, automations absent everywhere → hidden
    assert.ok(hide.includes("media"));
    assert.ok(hide.includes("switches"));
    assert.ok(hide.includes("occupancy"));
    assert.ok(hide.includes("satellites"));
    assert.ok(hide.includes("automations"));
  });

  it("hides all sections when areas list is empty (guarded by floor card)", () => {
    // computeFloorHide returns [] for empty areas; test the sectionHasEntities logic directly
    const noAreas: typeof emptySections[] = [];
    const hide = ROLLUP_ORDER.filter((id) => noAreas.every((s) => !sectionHasEntities(id, s())));
    // every() on empty array is vacuously true — all ids would be hidden
    // The floor card guards against this by returning [] when areas.length === 0
    assert.equal(hide.length, ROLLUP_ORDER.length);
  });
});

describe("area pictures", () => {
  const picture = 'https://ha.local/api/image/serve/abc")def';

  it("resolves a picture through hassUrl and leaves a path alone otherwise", () => {
    const withUrl = areaDisplay(
      {
        areas: { kitchen: { name: "Kitchen", picture: "/api/image/serve/kitchen" } },
        hassUrl: (path) => `http://treetop:8123${path}`,
      },
      "kitchen",
    );
    assert.equal(withUrl.picture, "http://treetop:8123/api/image/serve/kitchen");
    const plain = areaDisplay(
      { areas: { kitchen: { name: "Kitchen", picture: "/api/image/serve/kitchen" } } },
      "kitchen",
    );
    assert.equal(plain.picture, "/api/image/serve/kitchen");
    assert.equal(areaDisplay({ areas: { kitchen: { name: "Kitchen" } } }, "kitchen").picture, null);
  });

  it("paints the picture on the button and the popup, and escapes quotes", () => {
    const button = buildButtonConfig({
      areaId: "kitchen",
      name: "Kitchen",
      icon: "mdi:pot-steam",
      sections: emptySections(),
      picture,
    });
    const popup = buildPopupConfig("kitchen", "Kitchen", "mdi:pot-steam", emptySections(), {}, picture);
    const buttonStyles = String(button.styles);
    const popupStyles = String(popup.styles);
    const escaped = JSON.stringify(picture);
    assert.ok(buttonStyles.includes(`url(${escaped})`));
    assert.ok(popupStyles.includes(`url(${escaped})`));
    assert.match(buttonStyles, /\.bubble-background[\s\S]*background-image: linear-gradient\(90deg/);
    assert.match(popupStyles, /\.bubble-pop-up-background[\s\S]*linear-gradient\(to bottom/);
    assert.match(buttonStyles, /color:\s*#fff !important/);
    assert.match(popupStyles, /color:\s*#fff !important/);
    assert.match(buttonStyles, /\.bubble-state[^{]*\{[^}]*color:\s*#fff !important/);
    assert.match(buttonStyles, /\.bubble-state[^{]*\{[^}]*text-shadow:\s*0 1px 2px rgba\(0,0,0,\.65\)/);
    assert.match(
      popupStyles,
      /\.bubble-pop-up > \.bubble-header-container > \.bubble-header \.bubble-name,\n\.bubble-pop-up > \.bubble-header-container > \.bubble-header \.bubble-state \{[^}]*color:\s*#fff !important/,
    );
    assert.equal(popupStyles.includes("popup-style-classic"), false);
    assert.equal(popupStyles.includes("popup-style-home-assistant"), false);
    assert.equal(buttonStyles.includes('url("' + picture + '")'), false);
  });

  it("leaves both surfaces without a background image when the area has no picture", () => {
    const button = buildButtonConfig({
      areaId: "kitchen",
      name: "Kitchen",
      icon: "mdi:pot-steam",
      sections: emptySections(),
    });
    const popup = buildPopupConfig("kitchen", "Kitchen", "mdi:pot-steam", emptySections());
    assert.equal(String(button.styles).includes("background-image"), false);
    assert.equal(/\.bubble-state[^{]*\{[^}]*#fff/.test(String(button.styles)), false);
    const popupStyles = String(popup.styles);
    assert.equal(popupStyles.includes("background-image"), false);
    assert.match(
      popupStyles,
      /\.bubble-header \.bubble-button-card-container \{[^}]*background:\s*none !important/,
    );
    assert.match(popupStyles, /\.bubble-header \.bubble-background,[\s\S]*display:\s*none !important/);
  });
});

describe("disabled automations", () => {
  it("splits the summary into off, on, and disabled and shows it on the subtitle", () => {
    const motion = "automation.motion";
    const bedtime = "automation.bedtime";
    const away = "automation.away";
    const sections = { ...emptySections(), automations: [motion, bedtime, away] };
    const states = {
      [motion]: state(motion, "on", { friendly_name: "Motion" }),
      [bedtime]: state(bedtime, "on", { friendly_name: "Bedtime" }),
      [away]: state(away, "off", { friendly_name: "Away" }),
    };
    const disabled = new Set([motion]);
    const rollups = sectionRollups(sections, states, disabled);
    assert.equal(rollupLabel(rollups[0]!), "Automations 1/2 on, 1 disabled");
    assert.equal(
      dotTooltipLabel("bubble-sub-button area-dot-automations-on", rollups),
      "Automations 1/2 on, 1 disabled",
    );
    const filled = buildButtonConfig({
      areaId: "bedroom",
      name: "Bedroom",
      icon: "mdi:bed",
      sections,
      states,
      disabledAutomations: disabled,
      dotSlots: collapsedDotSlots([]),
    });
    const filledDots = filled.sub_button as Array<{ css_class: string }>;
    assert.equal(filledDots.some((dot) => dot.css_class.includes("automations")), false);
    assert.deepEqual(automationSubtitleSegments(rollups[0]!), [
      { kind: "text", text: "1/2+" },
      { kind: "strike", text: "1" },
      { kind: "text", text: " " },
      { kind: "icon", icon: "mdi:flash" },
    ]);
    assert.equal(filled.state_content, `{{ ${JSON.stringify(automationStateText(rollups[0]!))} }}`);
    assert.equal(String(filled.state_content).includes("Automations"), false);
    assert.equal(String(filled.state_content).includes("disabled"), false);

    const onlyDisabled = sectionRollups({ ...emptySections(), automations: [motion] }, states, disabled);
    assert.equal(rollupLabel(onlyDisabled[0]!), "Automations 1 disabled");
    assert.equal(onlyDisabled[0]?.active, 0);
    const onlyDisabledButton = buildButtonConfig({
      areaId: "bedroom",
      name: "Bedroom",
      icon: "mdi:bed",
      sections: { ...emptySections(), automations: [motion] },
      states,
      disabledAutomations: disabled,
      dotSlots: collapsedDotSlots([]),
    });
    const onlyDisabledDots = onlyDisabledButton.sub_button as Array<{ css_class: string }>;
    assert.equal(onlyDisabledDots.some((dot) => dot.css_class.includes("automations")), false);
    assert.deepEqual(automationSubtitleSegments(onlyDisabled[0]!), [
      { kind: "text", text: "0/0+" },
      { kind: "strike", text: "1" },
      { kind: "text", text: " " },
      { kind: "icon", icon: "mdi:flash" },
    ]);
    assert.equal(onlyDisabledButton.state_content, `{{ ${JSON.stringify(automationStateText(onlyDisabled[0]!))} }}`);

    const offAndDead = sectionRollups(
      { ...emptySections(), automations: [away] },
      states,
      new Set([away]),
    );
    assert.equal(rollupLabel(offAndDead[0]!), "Automations 1 disabled");

    const cards = buildPopupCards(sections, states, "Bedroom", disabled);
    const row = cards.find((card) => card.entity === motion);
    const live = cards.find((card) => card.entity === bedtime);
    assert.equal(row?.secondary, "Disabled");
    assert.equal(row?.icon, "mdi:flash-off");
    assert.equal(row?.icon_color, "grey");
    assert.equal((row?.hold_action as { perform_action?: string }).perform_action, "automation.toggle");
    assert.equal(String(live?.secondary).includes("last_triggered"), true);
    assert.equal(String(live?.icon_color).includes("green"), true);
    const chips = cards.find((card) => String(card.type).endsWith("chips-card"));
    const contents = (chips?.chips as Array<{ content: string }>).map((chip) => chip.content);
    assert.deepEqual(contents, ["Automations 1/2 on, 1 disabled"]);
  });

  it("keeps a zero on-count in the fraction and leaves disabled out of that total", () => {
    const on = "automation.on";
    const offA = "automation.off_a";
    const offB = "automation.off_b";
    const offC = "automation.off_c";
    const deadA = "automation.dead_a";
    const deadB = "automation.dead_b";
    const deadC = "automation.dead_c";

    const allOff = sectionRollups(
      { ...emptySections(), automations: [offA, offB, offC] },
      {
        [offA]: state(offA, "off"),
        [offB]: state(offB, "off"),
        [offC]: state(offC, "off"),
      },
    );
    assert.equal(rollupLabel(allOff[0]!), "Automations 0/3 on, 0 disabled");
    assert.equal(dotTooltipLabel("bubble-sub-button area-dot-automations-off", allOff), "Automations 0/3 on, 0 disabled");
    assert.deepEqual(automationSubtitleSegments(allOff[0]!), [
      { kind: "text", text: "0/3 " },
      { kind: "icon", icon: "mdi:flash" },
    ]);

    const offAndDisabled = sectionRollups(
      { ...emptySections(), automations: [offA, offB, deadA] },
      {
        [offA]: state(offA, "off"),
        [offB]: state(offB, "off"),
        [deadA]: state(deadA, "on"),
      },
      new Set([deadA]),
    );
    assert.equal(rollupLabel(offAndDisabled[0]!), "Automations 0/2 on, 1 disabled");
    assert.equal(offAndDisabled[0]?.active, 0);
    assert.equal(offAndDisabled[0]?.off, 2);
    assert.equal(offAndDisabled[0]?.disabled, 1);

    const disabledNotInTotal = sectionRollups(
      { ...emptySections(), automations: [on, offA, deadA, deadB, deadC] },
      {
        [on]: state(on, "on"),
        [offA]: state(offA, "off"),
        [deadA]: state(deadA, "on"),
        [deadB]: state(deadB, "off"),
        [deadC]: state(deadC, "on"),
      },
      new Set([deadA, deadB, deadC]),
    );
    assert.equal(rollupLabel(disabledNotInTotal[0]!), "Automations 1/2 on, 3 disabled");
    assert.deepEqual(automationSubtitleSegments(disabledNotInTotal[0]!), [
      { kind: "text", text: "1/2+" },
      { kind: "strike", text: "3" },
      { kind: "text", text: " " },
      { kind: "icon", icon: "mdi:flash" },
    ]);
    assert.equal(disabledNotInTotal[0]?.active, 1);
    assert.equal(disabledNotInTotal[0]?.off, 1);
    assert.equal(disabledNotInTotal[0]?.disabled, 3);
    assert.equal(dotTooltipLabel("bubble-sub-button area-dot-automations-empty", disabledNotInTotal), null);
  });

  it("does not let a disabled automation keep the area available", () => {
    const fixture = hass({
      devices: [{ id: "shed-dev", area_id: "shed" }],
      entities: [
        { entity_id: "light.shed", device_id: "shed-dev" },
        { entity_id: "automation.shed_lights", device_id: "shed-dev" },
      ],
      states: {
        "light.shed": state("light.shed", "unavailable"),
        "automation.shed_lights": state("automation.shed_lights", "on"),
      },
    });
    assert.equal(areaUnavailable(fixture, "shed"), false);
    assert.equal(areaUnavailable(fixture, "shed", new Set(["automation.shed_lights"])), true);

    const onlyAutomation = hass({
      devices: [{ id: "shed-dev", area_id: "shed" }],
      entities: [{ entity_id: "automation.shed_lights", device_id: "shed-dev" }],
      states: { "automation.shed_lights": state("automation.shed_lights", "on") },
    });
    assert.equal(areaUnavailable(onlyAutomation, "shed"), false);
    assert.equal(areaUnavailable(onlyAutomation, "shed", new Set(["automation.shed_lights"])), true);
  });
});

describe("areaUnavailable", () => {
  it("marks an area unavailable when every device entity is unavailable", () => {
    const result = areaUnavailable(
      hass({
        devices: [{ id: "shed-dev", area_id: "shed" }],
        entities: [
          { entity_id: "light.shed", device_id: "shed-dev" },
          { entity_id: "binary_sensor.shed_door", device_id: "shed-dev" },
          { entity_id: "input_boolean.shed_guest", area_id: "shed" },
          { entity_id: "sensor.shed_note", area_id: "shed", platform: "template" },
        ],
        states: {
          "light.shed": state("light.shed", "unavailable"),
          "binary_sensor.shed_door": state("binary_sensor.shed_door", "unavailable"),
          "input_boolean.shed_guest": state("input_boolean.shed_guest", "on"),
          "sensor.shed_note": state("sensor.shed_note", "on"),
        },
      }),
      "shed",
    );
    assert.equal(result, true);
  });

  it("stays available when one device entity is available", () => {
    const result = areaUnavailable(
      hass({
        devices: [{ id: "kitchen-dev", area_id: "kitchen" }],
        entities: [
          { entity_id: "light.kitchen", device_id: "kitchen-dev" },
          { entity_id: "sensor.kitchen_temp", device_id: "kitchen-dev" },
        ],
        states: {
          "light.kitchen": state("light.kitchen", "unavailable"),
          "sensor.kitchen_temp": state("sensor.kitchen_temp", "21"),
        },
      }),
      "kitchen",
    );
    assert.equal(result, false);
  });

  it("stays available when the area has no device entities", () => {
    const helpersOnly = areaUnavailable(
      hass({
        entities: [
          { entity_id: "input_boolean.guest", area_id: "hall" },
          { entity_id: "input_select.scene", area_id: "hall" },
          { entity_id: "timer.nap", area_id: "hall" },
          { entity_id: "sensor.note", area_id: "hall", platform: "template" },
        ],
        states: {
          "input_boolean.guest": state("input_boolean.guest", "unavailable"),
          "input_select.scene": state("input_select.scene", "unavailable"),
          "timer.nap": state("timer.nap", "unavailable"),
          "sensor.note": state("sensor.note", "unavailable"),
        },
      }),
      "hall",
    );
    assert.equal(helpersOnly, false);
    assert.equal(areaUnavailable(hass({}), "empty"), false);
  });

  it("dims the collapsed button and still lists the area on its floor", () => {
    const fixture = hass({
      devices: [{ id: "shed-dev", area_id: "shed" }],
      entities: [{ entity_id: "light.shed", device_id: "shed-dev" }],
      states: { "light.shed": state("light.shed", "unavailable") },
      areas: {
        shed: { area_id: "shed", name: "Shed", floor_id: "down" },
        kitchen: { area_id: "kitchen", name: "Kitchen", floor_id: "down" },
      },
    });
    assert.equal(areaUnavailable(fixture, "shed"), true);
    assert.deepEqual(
      areasOnFloor(fixture, "down").map((area) => area.areaId),
      ["kitchen", "shed"],
    );
    const button = buildButtonConfig({
      areaId: "shed",
      name: "Shed",
      icon: "mdi:greenhouse",
      sections: emptySections(),
      unavailable: true,
    });
    const styles = String(button.styles);
    assert.match(styles, /opacity:\s*0\.5 !important/);
    assert.match(styles, /cursor:\s*not-allowed/);
    assert.equal(button.card_type, "button");
    assert.equal(Array.isArray(button.sub_button), true);
  });

  it("shifts dots left by the floor chevron only when the card asks to align them", () => {
    const input = {
      areaId: "bedroom",
      name: "Bedroom",
      icon: "mdi:bed",
      sections: { ...emptySections(), lights: ["light.a"] },
      states: { "light.a": state("light.a", "on") },
    };
    assert.equal(String(buildButtonConfig(input).styles).includes("margin-inline-end: 36px"), false);
    assert.match(String(buildButtonConfig({ ...input, alignDots: true }).styles), /margin-inline-end: 36px !important/);
  });

  it("ignores an input button when deciding whether the area is unavailable", () => {
    const onlyButton = areaUnavailable(
      hass({
        devices: [{ id: "pad", area_id: "hall" }],
        entities: [{ entity_id: "input_button.quiet", device_id: "pad", area_id: "hall" }],
        states: { "input_button.quiet": state("input_button.quiet", "unavailable") },
      }),
      "hall",
    );
    assert.equal(onlyButton, false);

    const lightDown = areaUnavailable(
      hass({
        devices: [
          { id: "shed-dev", area_id: "shed" },
          { id: "pad", area_id: "shed" },
        ],
        entities: [
          { entity_id: "light.shed", device_id: "shed-dev" },
          { entity_id: "input_button.quiet", device_id: "pad", area_id: "shed" },
        ],
        states: {
          "light.shed": state("light.shed", "unavailable"),
          "input_button.quiet": state("input_button.quiet", "unknown"),
        },
      }),
      "shed",
    );
    assert.equal(lightDown, true);
  });
});

describe("climate subtitle", () => {
  const room = "Man Cave";

  function button(
    sections: AreaSections,
    states: Record<string, EntityState | undefined>,
    extra: { formatEntityState?: (state: EntityState) => string } = {},
  ) {
    return buildButtonConfig({
      areaId: "office_of_drew",
      name: room,
      icon: "mdi:office-building",
      sections,
      states,
      dotSlots: collapsedDotSlots([]),
      ...extra,
    });
  }

  it("strips the room name from a temperature sensor and quotes the template", () => {
    const sections = { ...emptySections(), climate: ["sensor.temp"] };
    const states = {
      "sensor.temp": state("sensor.temp", "21", {
        device_class: "temperature",
        friendly_name: "Man Cave Temperature",
        unit_of_measurement: "°C",
      }),
    };
    assert.equal(climateSubtitle(sections.climate, states, room), "Temperature 21 °C");
    const config = button(sections, states);
    assert.equal(config.state_content, '{{ "Temperature 21 °C" }}');
    assert.equal(config.button_type, "name");
    assert.equal(config.entity, undefined);
    assert.equal(config.show_state, undefined);
    const styles = String(config.styles);
    assert.match(styles, /\.bubble-state[^{]*\{[^}]*text-overflow:\s*ellipsis/);
    assert.equal(/\.bubble-state[^{]*\{[^}]*display:[^;}]*!important/.test(styles), false);
  });

  it("joins humidity and temperature in friendly-name order with the fallback formatter", () => {
    assert.equal(
      climateSubtitle(
        ["sensor.humidity"],
        {
          "sensor.humidity": state("sensor.humidity", "40", {
            device_class: "humidity",
            friendly_name: "Man Cave Humidity",
            unit_of_measurement: "%",
          }),
        },
        room,
      ),
      "Humidity 40 %",
    );

    const fixtureStates = {
      "sensor.office_temperature": state("sensor.office_temperature", "21", {
        device_class: "temperature",
        friendly_name: "Man Cave Temperature",
        unit_of_measurement: "°C",
      }),
      "sensor.office_humidity": state("sensor.office_humidity", "40", {
        device_class: "humidity",
        friendly_name: "Man Cave Humidity",
        unit_of_measurement: "%",
      }),
    };
    const classified = classifyArea(
      hass({
        areas: { office_of_drew: { name: room } },
        entities: [
          { entity_id: "sensor.office_temperature", area_id: "office_of_drew" },
          { entity_id: "sensor.office_humidity", area_id: "office_of_drew" },
        ],
        states: fixtureStates,
      }),
      "office_of_drew",
    );
    assert.deepEqual(classified.climate, ["sensor.office_humidity", "sensor.office_temperature"]);
    assert.equal(
      climateSubtitle(classified.climate, fixtureStates, room),
      "Humidity 40 % · Temperature 21 °C",
    );
  });

  it("keeps unavailable and unknown and does not append a unit", () => {
    assert.equal(
      climateSubtitle(
        ["sensor.temp"],
        {
          "sensor.temp": state("sensor.temp", "unavailable", {
            device_class: "temperature",
            friendly_name: "Man Cave Temperature",
            unit_of_measurement: "°C",
          }),
        },
        room,
      ),
      "Temperature unavailable",
    );
    assert.equal(
      climateSubtitle(
        ["sensor.temp"],
        {
          "sensor.temp": state("sensor.temp", "unknown", {
            device_class: "temperature",
            friendly_name: "Man Cave Temperature",
            unit_of_measurement: "°C",
          }),
        },
        room,
      ),
      "Temperature unknown",
    );
  });

  it("uses the value alone when the sensor has no friendly name", () => {
    assert.equal(
      climateSubtitle(
        ["sensor.temp"],
        { "sensor.temp": state("sensor.temp", "21", { device_class: "temperature", unit_of_measurement: "°C" }) },
        room,
      ),
      "21 °C",
    );
  });

  it("skips a missing state object", () => {
    assert.equal(
      climateSubtitle(
        ["sensor.missing", "sensor.temp"],
        {
          "sensor.temp": state("sensor.temp", "21", {
            device_class: "temperature",
            friendly_name: "Man Cave Temperature",
            unit_of_measurement: "°C",
          }),
        },
        room,
      ),
      "Temperature 21 °C",
    );
  });

  it("skips an empty formatted value and omits state_content when nothing remains", () => {
    const states = {
      "sensor.temp": state("sensor.temp", "21", {
        device_class: "temperature",
        friendly_name: "Man Cave Temperature",
        unit_of_measurement: "°C",
      }),
      "sensor.humidity": state("sensor.humidity", "40", {
        device_class: "humidity",
        friendly_name: "Man Cave Humidity",
        unit_of_measurement: "%",
      }),
    };
    const formatEntityState = (entity: EntityState) =>
      entity.entity_id === "sensor.temp" ? "" : `fmt ${entity.state}`;
    assert.equal(
      climateSubtitle(["sensor.humidity", "sensor.temp"], states, room, formatEntityState),
      "Humidity fmt 40",
    );
    assert.equal(
      climateSubtitle(["sensor.temp"], states, room, (entity) => `fmt ${entity.state}`),
      "Temperature fmt 21",
    );
    const config = button({ ...emptySections(), climate: ["sensor.temp"] }, states, {
      formatEntityState: () => "",
    });
    assert.equal("state_content" in config, false);
    assert.equal("state_content" in button(emptySections(), {}), false);
  });

  it("drops the subtitle and the climate dot when climate is hidden", () => {
    const hide: RollupId[] = ["climate"];
    const sections = {
      ...emptySections(),
      climate: ["sensor.temp"],
      lights: ["light.desk"],
    };
    const states = {
      "sensor.temp": state("sensor.temp", "21", {
        friendly_name: "Man Cave Temperature",
        unit_of_measurement: "°C",
      }),
      "light.desk": state("light.desk", "on"),
    };
    const config = buildButtonConfig({
      areaId: "office_of_drew",
      name: room,
      icon: "mdi:office-building",
      sections: withoutSections(sections, hide),
      states,
      dotSlots: collapsedDotSlots(hide),
    });
    assert.equal("state_content" in config, false);
    const dots = config.sub_button as Array<{ css_class: string }>;
    assert.equal(dots.some((dot) => dot.css_class.includes("climate")), false);
    assert.equal(dots[0]?.css_class, "area-dot-lights-on");
  });

  it("puts a thermostat in the climate section", () => {
    const result = classifyArea(
      hass({
        entities: [{ entity_id: "climate.office", area_id: "office_of_drew" }],
        states: {
          "climate.office": state("climate.office", "heat", { friendly_name: "Man Cave" }),
        },
      }),
      "office_of_drew",
    );
    assert.deepEqual(result.climate, ["climate.office"]);
  });

  it("keeps only temperature and humidity on the collapsed climate line", () => {
    const states = {
      "sensor.humidity": state("sensor.humidity", "40", {
        device_class: "humidity",
        friendly_name: "Man Cave Humidity",
        unit_of_measurement: "%",
      }),
      "sensor.temp": state("sensor.temp", "21", {
        device_class: "temperature",
        friendly_name: "Man Cave Temperature",
        unit_of_measurement: "°C",
      }),
      "sensor.lux": state("sensor.lux", "120", {
        device_class: "illuminance",
        friendly_name: "Man Cave Illuminance",
        unit_of_measurement: "lx",
      }),
      "sensor.aqi": state("sensor.aqi", "42", {
        device_class: "aqi",
        friendly_name: "Man Cave Air quality",
      }),
      "climate.office": state("climate.office", "heat", { friendly_name: "Man Cave Thermostat" }),
      "humidifier.room": state("humidifier.room", "on", { friendly_name: "Man Cave Humidifier" }),
      "water_heater.tank": state("water_heater.tank", "eco", { friendly_name: "Man Cave Water heater" }),
      "lock.front": state("lock.front", "unlocked"),
      "vacuum.rover": state("vacuum.rover", "cleaning"),
      "script.bedtime": state("script.bedtime", "on"),
    };
    const climate = [
      "sensor.humidity",
      "sensor.temp",
      "sensor.lux",
      "sensor.aqi",
      "climate.office",
      "humidifier.room",
      "water_heater.tank",
    ];
    assert.equal(climateSubtitle(climate, states, room), "Humidity 40 % · Temperature 21 °C");
    const config = button(
      {
        ...emptySections(),
        climate,
        locks: ["lock.front"],
        vacuums: ["vacuum.rover"],
        scripts: ["script.bedtime"],
      },
      states,
    );
    assert.equal(config.state_content, '{{ "Humidity 40 % · Temperature 21 °C" }}');
    for (const absent of ["Illuminance", "Air quality", "Thermostat", "Humidifier", "Water heater", "Unlocked", "Cleaning"]) {
      assert.equal(String(config.state_content).includes(absent), false, absent);
    }

    const classified = classifyArea(
      hass({
        areas: { office_of_drew: { name: room } },
        entities: climate.map((entity_id) => ({ entity_id, area_id: "office_of_drew" })),
        states,
      }),
      "office_of_drew",
    );
    for (const id of climate) assert.equal(classified.climate.includes(id), true, id);
    assert.equal(climateSubtitle(classified.climate, states, room), "Humidity 40 % · Temperature 21 °C");
    assert.equal("state_content" in button({ ...emptySections(), climate: ["climate.office"] }, states), false);
    assert.equal("state_content" in button({ ...emptySections(), climate: ["sensor.lux"] }, states), false);
    assert.equal("state_content" in button({ ...emptySections(), climate: ["humidifier.room"] }, states), false);
    assert.equal("state_content" in button({ ...emptySections(), climate: ["water_heater.tank"] }, states), false);
  });

  it("keeps both temperature sensors in climate section order", () => {
    const states = {
      "sensor.east": state("sensor.east", "18", {
        device_class: "temperature",
        friendly_name: "Man Cave Temperature",
        unit_of_measurement: "°C",
      }),
      "sensor.west": state("sensor.west", "21", {
        device_class: "temperature",
        friendly_name: "Man Cave Temperature",
        unit_of_measurement: "°C",
      }),
    };
    assert.equal(
      climateSubtitle(["sensor.west", "sensor.east"], states, room),
      "Temperature 21 °C · Temperature 18 °C",
    );
  });

  it("escapes quotes and backslashes in the state template", () => {
    const states = {
      "sensor.temp": state("sensor.temp", "21", {
        device_class: "temperature",
        friendly_name: 'Man Cave Temp "C" \\',
        unit_of_measurement: "°C",
      }),
    };
    assert.equal(climateSubtitle(["sensor.temp"], states, room), 'Temp "C" \\ 21 °C');
    const config = button({ ...emptySections(), climate: ["sensor.temp"] }, states);
    assert.equal(config.state_content, '{{ "Temp \\"C\\" \\\\ 21 °C" }}');
  });

  it("drops climate, occupancy, buttons, scenes, scripts, helpers, and automations from collapsed dots", () => {
    assert.deepEqual(collapsedDotSlots([]), [
      "lights",
      "media",
      "cameras",
      "switches",
      "openings",
      "satellites",
      "sensors",
      "locks",
      "vacuums",
    ]);
    assert.equal(collapsedDotSlots([]).includes("climate"), false);
    assert.equal(collapsedDotSlots([]).includes("occupancy"), false);
    assert.equal(collapsedDotSlots([]).includes("buttons"), false);
    assert.equal(collapsedDotSlots([]).includes("scenes"), false);
    assert.equal(collapsedDotSlots([]).includes("scripts"), false);
    assert.equal(collapsedDotSlots([]).includes("helpers"), false);
    assert.equal(collapsedDotSlots([]).includes("automations"), false);
    for (const id of ["climate", "occupancy", "sensors", "locks", "vacuums", "buttons", "scenes", "scripts", "helpers", "automations"]) {
      assert.equal((ROLLUP_ORDER as readonly string[]).includes(id), true, id);
    }
    assert.deepEqual(collapsedDotSlots(["media"]), [
      "lights",
      "cameras",
      "switches",
      "openings",
      "satellites",
      "sensors",
      "locks",
      "vacuums",
    ]);
  });

  it("shows the automation summary alone when the room has no climate", () => {
    const sections = { ...emptySections(), automations: ["automation.a"] };
    const states = { "automation.a": state("automation.a", "on") };
    const config = button(sections, states);
    const alone = sectionRollups(sections, states)[0]!;
    assert.deepEqual(automationSubtitleSegments(alone), [
      { kind: "text", text: "1/1 " },
      { kind: "icon", icon: "mdi:flash" },
    ]);
    assert.equal(String(automationStateText(alone)).includes("+0"), false);
    assert.equal(config.state_content, `{{ ${JSON.stringify(automationStateText(alone))} }}`);
    assert.equal(config.scrolling_effect, false);
    assert.equal(config.button_type, "name");
    assert.equal(config.entity, undefined);
    assert.equal(config.show_state, undefined);
    const dots = config.sub_button as Array<{ css_class: string }>;
    assert.equal(dots.some((dot) => dot.css_class.includes("automations")), false);
  });

  it("joins climate and the automation summary on one subtitle", () => {
    const states = {
      "sensor.office_humidity": state("sensor.office_humidity", "40", {
        device_class: "humidity",
        friendly_name: "Man Cave Humidity",
        unit_of_measurement: "%",
      }),
      "sensor.office_temperature": state("sensor.office_temperature", "21", {
        device_class: "temperature",
        friendly_name: "Man Cave Temperature",
        unit_of_measurement: "°C",
      }),
      "automation.a": state("automation.a", "on"),
      "automation.b": state("automation.b", "on"),
      "automation.c": state("automation.c", "off"),
    };
    const sections = {
      ...emptySections(),
      climate: ["sensor.office_humidity", "sensor.office_temperature"],
      automations: ["automation.a", "automation.b", "automation.c"],
    };
    const config = button(sections, states);
    const rollup = sectionRollups(sections, states).find((item) => item.id === "automations");
    assert.ok(rollup);
    assert.deepEqual(automationSubtitleSegments(rollup), [
      { kind: "text", text: "2/3 " },
      { kind: "icon", icon: "mdi:flash" },
    ]);
    assert.equal(String(automationStateText(rollup)).includes("+0"), false);
    assert.equal(
      config.state_content,
      `{{ ${JSON.stringify(`Humidity 40 % · Temperature 21 °C · ${automationStateText(rollup)}`)} }}`,
    );
  });

  it("adds helper counts on the subtitle and separates them from automations with a comma", () => {
    const states = {
      "input_boolean.guest": state("input_boolean.guest", "on"),
      "input_boolean.away": state("input_boolean.away", "off"),
      "timer.nap": state("timer.nap", "active"),
      "input_select.scene": state("input_select.scene", "movie"),
      "automation.a": state("automation.a", "on"),
      "automation.b": state("automation.b", "off"),
      "automation.dead": state("automation.dead", "on"),
      "sensor.temp": state("sensor.temp", "21", {
        device_class: "temperature",
        friendly_name: "Man Cave Temperature",
        unit_of_measurement: "°C",
      }),
    };
    const helpersOnly = button(
      { ...emptySections(), helpers: ["input_boolean.guest", "input_boolean.away", "timer.nap"] },
      states,
    );
    const helperRollup = sectionRollups(
      { ...emptySections(), helpers: ["input_boolean.guest", "input_boolean.away", "timer.nap"] },
      states,
    ).find((item) => item.id === "helpers");
    assert.ok(helperRollup);
    assert.equal(helpersOnly.state_content, `{{ ${JSON.stringify(helperStateText(helperRollup))} }}`);
    const helperDots = helpersOnly.sub_button as Array<{ css_class: string }>;
    assert.equal(helperDots.some((dot) => dot.css_class.includes("helpers")), false);

    const noneOn = button(
      { ...emptySections(), helpers: ["input_boolean.guest", "input_boolean.away"] },
      {
        ...states,
        "input_boolean.guest": state("input_boolean.guest", "off"),
      },
    );
    const noneOnRollup = sectionRollups(
      { ...emptySections(), helpers: ["input_boolean.guest", "input_boolean.away"] },
      { ...states, "input_boolean.guest": state("input_boolean.guest", "off") },
    ).find((item) => item.id === "helpers");
    assert.ok(noneOnRollup);
    assert.equal(noneOn.state_content, `{{ ${JSON.stringify(helperStateText(noneOnRollup))} }}`);

    const withClimate = button(
      {
        ...emptySections(),
        climate: ["sensor.temp"],
        helpers: ["input_boolean.guest", "input_boolean.away"],
      },
      states,
    );
    const climateHelpers = sectionRollups(
      { ...emptySections(), helpers: ["input_boolean.guest", "input_boolean.away"] },
      states,
    ).find((item) => item.id === "helpers");
    assert.ok(climateHelpers);
    assert.equal(
      withClimate.state_content,
      `{{ ${JSON.stringify(`Temperature 21 °C · ${helperStateText(climateHelpers)}`)} }}`,
    );

    const both = button(
      {
        ...emptySections(),
        helpers: ["input_boolean.guest", "input_boolean.away"],
        automations: ["automation.a", "automation.b"],
      },
      states,
    );
    const automation = sectionRollups(
      { ...emptySections(), automations: ["automation.a", "automation.b"] },
      states,
    ).find((item) => item.id === "automations");
    assert.ok(automation);
    assert.equal(
      both.state_content,
      `{{ ${JSON.stringify(`${helperStateText(climateHelpers)}, ${automationStateText(automation)}`)} }}`,
    );

    const withDisabled = buildButtonConfig({
      areaId: "office_of_drew",
      name: room,
      icon: "mdi:office-building",
      sections: {
        ...emptySections(),
        climate: ["sensor.temp"],
        helpers: ["input_boolean.guest"],
        automations: ["automation.a", "automation.dead"],
      },
      states,
      disabledAutomations: new Set(["automation.dead"]),
      dotSlots: collapsedDotSlots([]),
    });
    const disabledRollup = sectionRollups(
      { ...emptySections(), automations: ["automation.a", "automation.dead"] },
      states,
      new Set(["automation.dead"]),
    ).find((item) => item.id === "automations");
    assert.ok(disabledRollup);
    assert.equal(
      withDisabled.state_content,
      `{{ ${JSON.stringify(`Temperature 21 °C · ${helperStateText(sectionRollups({ ...emptySections(), helpers: ["input_boolean.guest"] }, states)[0]!)}, ${automationStateText(disabledRollup)}`)} }}`,
    );
    assert.equal(withDisabled.scrolling_effect, false);
    assert.equal(both.scrolling_effect, false);
    assert.equal(helpersOnly.scrolling_effect, false);

    const selectsOnly = button(
      { ...emptySections(), selects: ["input_select.scene"], helpers: ["timer.nap"] },
      states,
    );
    assert.equal("state_content" in selectsOnly, false);

    const hidden = withoutSections(
      {
        ...emptySections(),
        climate: ["sensor.temp"],
        helpers: ["input_boolean.guest"],
        automations: ["automation.a"],
      },
      ["helpers"],
    );
    const hiddenButton = buildButtonConfig({
      areaId: "office_of_drew",
      name: room,
      icon: "mdi:office-building",
      sections: hidden,
      states,
      dotSlots: collapsedDotSlots(["helpers"]),
    });
    const kept = sectionRollups(hidden, states).find((item) => item.id === "automations");
    assert.ok(kept);
    assert.equal(
      hiddenButton.state_content,
      `{{ ${JSON.stringify(`Temperature 21 °C · ${automationStateText(kept)}`)} }}`,
    );
    const titles = buildPopupCards(hidden, states, room)
      .filter((card) => card.title)
      .map((card) => card.title);
    assert.equal(titles.includes("Helpers"), false);
    assert.equal(titles.includes("Automations"), true);
  });

  it("omits the automation piece when automations are hidden and keeps climate", () => {
    const hide: RollupId[] = ["automations"];
    const sections = {
      ...emptySections(),
      climate: ["sensor.temp"],
      automations: ["automation.a"],
      lights: ["light.desk"],
    };
    const states = {
      "sensor.temp": state("sensor.temp", "21", {
        device_class: "temperature",
        friendly_name: "Man Cave Temperature",
        unit_of_measurement: "°C",
      }),
      "automation.a": state("automation.a", "on"),
      "light.desk": state("light.desk", "on"),
    };
    const visible = withoutSections(sections, hide);
    const config = buildButtonConfig({
      areaId: "office_of_drew",
      name: room,
      icon: "mdi:office-building",
      sections: visible,
      states,
      dotSlots: collapsedDotSlots(hide),
    });
    assert.equal(config.state_content, '{{ "Temperature 21 °C" }}');
    const titles = buildPopupCards(visible, states, room)
      .filter((card) => card.title)
      .map((card) => card.title);
    assert.equal(titles.includes("Automations"), false);
    assert.equal(titles.includes("Climate"), true);
  });

  it("omits only climate when climate is hidden and keeps the automation summary", () => {
    const hide: RollupId[] = ["climate"];
    const sections = {
      ...emptySections(),
      climate: ["sensor.temp"],
      automations: ["automation.a", "automation.b"],
    };
    const states = {
      "sensor.temp": state("sensor.temp", "21", {
        friendly_name: "Man Cave Temperature",
        unit_of_measurement: "°C",
      }),
      "automation.a": state("automation.a", "on"),
      "automation.b": state("automation.b", "off"),
    };
    const visible = withoutSections(sections, hide);
    const config = buildButtonConfig({
      areaId: "office_of_drew",
      name: room,
      icon: "mdi:office-building",
      sections: visible,
      states,
      dotSlots: collapsedDotSlots(hide),
    });
    const rollup = sectionRollups(visible, states).find((item) => item.id === "automations");
    assert.ok(rollup);
    assert.deepEqual(automationSubtitleSegments(rollup), [
      { kind: "text", text: "1/2 " },
      { kind: "icon", icon: "mdi:flash" },
    ]);
    assert.equal(config.state_content, `{{ ${JSON.stringify(automationStateText(rollup))} }}`);
    const titles = buildPopupCards(visible, states, room)
      .filter((card) => card.title)
      .map((card) => card.title);
    assert.equal(titles.includes("Climate"), false);
    assert.equal(titles.includes("Automations"), true);
    const dots = config.sub_button as Array<{ css_class: string }>;
    assert.equal(dots.some((dot) => dot.css_class.includes("automations")), false);
    assert.equal(dots.some((dot) => dot.css_class.includes("climate")), false);
  });

  it("places the count icons and strikes only the disabled count", () => {
    const struck = placeHost("1/2+\u20613\u2062 \u2063");
    assert.equal(placeAutomationSubtitle(struck as unknown as HTMLElement), true);
    assert.deepEqual(
      struck.kids.map((node) => [node.tag, node.textContent, node.attrs.icon, node.styleMap["text-decoration"]]),
      [
        ["#text", "1/2+", undefined, undefined],
        ["s", "3", undefined, "line-through"],
        ["#text", " ", undefined, undefined],
        ["ha-icon", "", "mdi:flash", undefined],
      ],
    );
    assert.equal(struck.kids[1]?.className, "area-card-automation-disabled");
    assert.equal(struck.kids[3]?.className, "area-card-subtitle-icon");
    assert.equal(struck.kids[3]?.styleMap["--mdc-icon-size"], "12px");
    assert.equal(struck.kids[3]?.styleMap["line-height"], "0");
    assert.equal(struck.kids[3]?.styleMap["vertical-align"], "1px");
    assert.equal(placeAutomationSubtitle(struck as unknown as HTMLElement), false);
    assert.equal(struck.replacements, 1);

    const plain = placeHost("2/3 \u2063");
    assert.equal(placeAutomationSubtitle(plain as unknown as HTMLElement), true);
    assert.equal(plain.kids.find((node) => node.tag === "ha-icon")?.attrs.icon, "mdi:flash");
    assert.equal(placeAutomationSubtitle(plain as unknown as HTMLElement), false);

    const helpers = placeHost("1/2 \u2064");
    assert.equal(placeAutomationSubtitle(helpers as unknown as HTMLElement), true);
    assert.equal(helpers.kids.find((node) => node.tag === "ha-icon")?.attrs.icon, "mdi:cog");
    assert.equal(placeAutomationSubtitle(helpers as unknown as HTMLElement), false);

    const words = placeHost("Temperature 21 °C");
    assert.equal(placeAutomationSubtitle(words as unknown as HTMLElement), false);
    assert.equal(words.replacements, 0);
  });

  it("omits state_content when the room has no climate, helpers, or automations", () => {
    assert.equal("state_content" in button(emptySections(), {}), false);
    assert.equal(
      "state_content" in button({ ...emptySections(), lights: ["light.desk"] }, { "light.desk": state("light.desk", "on") }),
      false,
    );
  });

  it("leaves the floor header without a climate, helpers, or automations slot", () => {
    const sections = {
      ...emptySections(),
      climate: ["sensor.temp"],
      helpers: ["input_boolean.guest"],
      selects: ["input_select.scene"],
      automations: ["automation.a"],
    };
    const hide = ROLLUP_ORDER.filter((id) => !sectionHasEntities(id, sections));
    assert.equal(hide.includes("climate"), false);
    assert.equal(hide.includes("helpers"), false);
    assert.equal(hide.includes("automations"), false);
    const slots = collapsedDotSlots(hide);
    assert.equal(slots.includes("climate"), false);
    assert.equal(slots.includes("helpers"), false);
    assert.equal(slots.includes("automations"), false);
    assert.deepEqual(slots, []);
  });
});

describe("floor dot rollup", () => {
  it("fills a slot when any area is active and adds the counts", () => {
    const on = sectionRollups(
      { ...emptySections(), lights: ["light.a", "light.b"] },
      { "light.a": state("light.a", "on"), "light.b": state("light.b", "off") },
    );
    const off = sectionRollups(
      { ...emptySections(), lights: ["light.c"], openings: ["binary_sensor.door"] },
      { "light.c": state("light.c", "off"), "binary_sensor.door": state("binary_sensor.door", "on") },
    );
    const dots = floorDotRow(["lights", "openings", "media"], [on, off]);
    assert.deepEqual(
      dots.map((dot) => [dot.id, dot.state, dot.label]),
      [
        ["lights", "on", "Lights 1/3 On"],
        ["openings", "on", "Entries 1/1 Open"],
        ["media", "empty", null],
      ],
    );
    assert.equal(dots[0]?.background, "rgb(255, 193, 7)");
    assert.equal(dots[0]?.ring, null);
    assert.equal(dots[2]?.icon, "mdi:play-circle");
  });

  it("keeps a hollow dot when the section is present and nothing is active", () => {
    const idle = sectionRollups(
      { ...emptySections(), lights: ["light.a"] },
      { "light.a": state("light.a", "off") },
    );
    const [dot] = floorDotRow(["lights"], [idle]);
    assert.equal(dot?.state, "off");
    assert.equal(dot?.label, "Lights 0/1 On");
    assert.equal(dot?.background, "transparent");
    assert.equal(dot?.ring, "rgb(255, 193, 7)");
    assert.equal(dot?.color, "rgb(255, 193, 7)");
  });

  it("adds automation off, on, and disabled counts across areas", () => {
    const first = sectionRollups(
      { ...emptySections(), automations: ["automation.a", "automation.b"] },
      {
        "automation.a": state("automation.a", "on"),
        "automation.b": state("automation.b", "off"),
      },
      new Set(["automation.b"]),
    );
    const second = sectionRollups(
      { ...emptySections(), automations: ["automation.c"] },
      { "automation.c": state("automation.c", "off") },
    );
    const [dot] = floorDotRow(["automations"], [first, second]);
    assert.equal(dot?.state, "on");
    assert.equal(dot?.label, "Automations 1/2 on, 1 disabled");
  });

  it("leaves a slot empty when the section has entities but does not draw a dot", () => {
    const sensors = sectionRollups(
      { ...emptySections(), climate: ["sensor.temp"], selects: ["input_select.scene"] },
      {
        "sensor.temp": state("sensor.temp", "21", { device_class: "temperature" }),
        "input_select.scene": state("input_select.scene", "movie"),
      },
    );
    const dots = floorDotRow(["climate", "helpers"], [sensors]);
    assert.deepEqual(
      dots.map((dot) => dot.state),
      ["empty", "empty"],
    );
  });
});

describe("cameras", () => {
  const webcam = "camera.webcam";
  const deviceId = "5e1233cc5cc0f01f36eba3ad24699a5a";

  function manCaveHass(extra: Fixture = {}): ClassifierHass {
    return hass({
      areas: roomAreas,
      devices: [{ id: deviceId, area_id: "office_of_drew" }, ...(extra.devices ?? [])],
      entities: [
        { entity_id: webcam, device_id: deviceId, platform: "generic" },
        ...(extra.entities ?? []),
      ],
      states: {
        [webcam]: state(webcam, "idle", { friendly_name: "Webcam" }),
        ...(extra.states ?? {}),
      },
    });
  }

  it("classifies a generic camera assigned through the area device", () => {
    const result = classifyArea(
      manCaveHass({
        entities: [
          { entity_id: "camera.other_room", area_id: "bedroom", platform: "generic" },
          { entity_id: "camera.hidden_webcam", area_id: "office_of_drew", platform: "generic", hidden_by: "user" },
          { entity_id: "camera.diag", area_id: "office_of_drew", platform: "generic", entity_category: "diagnostic" },
          { entity_id: "camera.door", area_id: "office_of_drew", platform: "generic" },
          { entity_id: "camera.template_cam", area_id: "office_of_drew", platform: "template" },
          { entity_id: "light.desk", area_id: "office_of_drew" },
        ],
        states: {
          "camera.other_room": state("camera.other_room", "streaming", { friendly_name: "Bedroom Camera" }),
          "camera.hidden_webcam": state("camera.hidden_webcam", "streaming", { friendly_name: "Hidden Webcam" }),
          "camera.diag": state("camera.diag", "idle", { friendly_name: "Diagnostic Camera" }),
          "camera.door": state("camera.door", "idle", { friendly_name: "Door Camera" }),
          "camera.template_cam": state("camera.template_cam", "idle", { friendly_name: "Template Camera" }),
          "light.desk": state("light.desk", "off", { friendly_name: "Desk" }),
        },
      }),
      "office_of_drew",
    );
    assert.deepEqual(result.cameras, ["camera.door", "camera.template_cam", webcam]);
    assert.deepEqual(result.lights, ["light.desk"]);
    assert.equal(result.helpers.includes("camera.template_cam"), false);
    for (const excluded of ["camera.other_room", "camera.hidden_webcam", "camera.diag"]) {
      assert.equal(listedIds(result).includes(excluded), false, excluded);
    }
  });

  it("fills the cameras dot for recording or streaming and leaves an idle camera hollow", () => {
    const slots = collapsedDotSlots([]);
    assert.equal(slots[slots.indexOf("media") + 1], "cameras");
    assert.equal(slots.includes("climate"), false);
    assert.equal(slots.includes("helpers"), false);
    assert.equal(slots.includes("automations"), false);
    assert.equal(sectionIcon("cameras"), "mdi:video");
    assert.equal(sectionTitle("cameras"), "Cameras");

    const idleSections = { ...emptySections(), cameras: [webcam] };
    const idleStates = { [webcam]: state(webcam, "idle", { friendly_name: "Webcam" }) };
    const idle = sectionRollups(idleSections, idleStates);
    assert.equal(rollupLabel(idle[0]!), "Cameras 0/1 On");
    const idleButton = buildButtonConfig({
      areaId: "office_of_drew",
      name: "Man Cave",
      icon: "mdi:office-building",
      sections: idleSections,
      states: idleStates,
      dotSlots: slots,
    });
    const idleDots = idleButton.sub_button as Array<{ css_class: string; icon: string }>;
    assert.equal(idleDots[slots.indexOf("cameras")]?.css_class, "area-dot-cameras-off");
    assert.equal(idleDots[slots.indexOf("cameras")]?.icon, "mdi:video");
    assert.match(String(idleButton.styles), /area-dot-cameras-off \{[^}]*box-shadow: inset 0 0 0 1\.5px rgb\(244, 67, 54\)/);

    for (const value of ["streaming", "recording"]) {
      const live = sectionRollups(idleSections, { [webcam]: state(webcam, value, { friendly_name: "Webcam" }) });
      assert.equal(rollupLabel(live[0]!), "Cameras 1/1 On", value);
      assert.equal(live[0]?.active, 1, value);
    }

    const mixed = sectionRollups(
      { ...emptySections(), cameras: [webcam, "camera.door"] },
      {
        [webcam]: state(webcam, "idle", { friendly_name: "Webcam" }),
        "camera.door": state("camera.door", "recording", { friendly_name: "Door Camera" }),
      },
    );
    assert.equal(rollupLabel(mixed[0]!), "Cameras 1/2 On");
    const mixedButton = buildButtonConfig({
      areaId: "office_of_drew",
      name: "Man Cave",
      icon: "mdi:office-building",
      sections: { ...emptySections(), cameras: [webcam, "camera.door"] },
      states: {
        [webcam]: state(webcam, "idle"),
        "camera.door": state("camera.door", "streaming"),
      },
      dotSlots: slots,
    });
    const mixedDots = mixedButton.sub_button as Array<{ css_class: string }>;
    assert.equal(mixedDots[slots.indexOf("cameras")]?.css_class, "area-dot-cameras-on");

    const absent = buildButtonConfig({
      areaId: "office_of_drew",
      name: "Man Cave",
      icon: "mdi:office-building",
      sections: emptySections(),
      dotSlots: slots,
    });
    const absentDots = absent.sub_button as Array<{ css_class: string }>;
    assert.equal(absentDots[slots.indexOf("cameras")]?.css_class, "area-dot-cameras-empty");
    assert.match(String(absent.styles), /visibility: hidden !important/);
  });

  it("omits the cameras slot and popup section when cameras is hidden", () => {
    const hide: RollupId[] = ["cameras"];
    assert.deepEqual(parseHideSections(["cameras"]), ["cameras"]);
    const sections = { ...emptySections(), cameras: [webcam], lights: ["light.desk"] };
    const states = {
      [webcam]: state(webcam, "streaming", { friendly_name: "Man Cave Webcam" }),
      "light.desk": state("light.desk", "on", { friendly_name: "Desk" }),
    };
    const visible = withoutSections(sections, hide);
    assert.deepEqual(visible.cameras, []);
    assert.deepEqual(visible.lights, ["light.desk"]);
    const slots = collapsedDotSlots(hide);
    assert.equal(slots.includes("cameras"), false);
    const button = buildButtonConfig({
      areaId: "office_of_drew",
      name: "Man Cave",
      icon: "mdi:office-building",
      sections: visible,
      states,
      dotSlots: slots,
    });
    const dots = button.sub_button as Array<{ css_class: string }>;
    assert.equal(dots.length, slots.length);
    assert.equal(dots.some((dot) => dot.css_class.includes("cameras")), false);
    assert.equal(dots[slots.indexOf("lights")]?.css_class, "area-dot-lights-on");
    const titles = buildPopupCards(visible, states, "Man Cave")
      .filter((card) => card.title)
      .map((card) => card.title);
    assert.equal(titles.includes("Cameras"), false);
    assert.equal(titles.includes("Lights"), true);
  });

  it("shows a picture-entity for the webcam and strips the room name", () => {
    const cards = buildPopupCards(
      { ...emptySections(), cameras: [webcam], mediaPlayers: ["media_player.tv"] },
      {
        [webcam]: state(webcam, "idle", {
          friendly_name: "Man Cave Webcam",
          entity_picture: "/api/camera_proxy/camera.webcam",
        }),
        "media_player.tv": state("media_player.tv", "off", { friendly_name: "TV" }),
      },
      "Man Cave",
    );
    const titles = cards.filter((card) => card.title).map((card) => card.title);
    assert.deepEqual(titles, ["Status", "Media players", "Cameras"]);
    const camera = cards.find((card) => card.entity === webcam);
    assert.equal(camera?.type, "picture-entity");
    assert.equal(camera?.camera_image, webcam);
    assert.equal(camera?.camera_view, "live");
    assert.equal(camera?.show_name, true);
    assert.equal(camera?.name, "Webcam");
    assert.deepEqual(camera?.tap_action, { action: "more-info" });
    assert.deepEqual(camera?.grid_options, { columns: 12 });
    assert.equal(JSON.stringify(camera).includes("custom:area-card-mushroom"), false);
    assert.equal(JSON.stringify(camera).includes("{{"), false);

    const plain = buildPopupCards(
      { ...emptySections(), cameras: [webcam] },
      { [webcam]: state(webcam, "idle", { friendly_name: "Webcam" }) },
      "Man Cave",
    ).find((card) => card.entity === webcam);
    assert.equal(plain?.name, "Webcam");

    assert.deepEqual(
      buildPopupCards(emptySections()).filter((card) => card.title).map((card) => card.title),
      [],
    );
  });

  it("keeps the floor cameras column only when some area has a camera", () => {
    const withCamera = { ...emptySections(), cameras: [webcam] };
    const without = emptySections();
    const kept = ROLLUP_ORDER.filter((id) => [withCamera, without].every((section) => !sectionHasEntities(id, section)));
    assert.equal(kept.includes("cameras"), false);
    const slots = collapsedDotSlots(kept);
    assert.equal(slots.includes("cameras"), true);
    const hidden = ROLLUP_ORDER.filter((id) => [without, emptySections()].every((section) => !sectionHasEntities(id, section)));
    assert.equal(hidden.includes("cameras"), true);
    assert.equal(collapsedDotSlots(hidden).includes("cameras"), false);

    const idle = sectionRollups(withCamera, { [webcam]: state(webcam, "idle", { friendly_name: "Webcam" }) });
    const live = sectionRollups(
      { ...emptySections(), cameras: ["camera.door"] },
      { "camera.door": state("camera.door", "streaming", { friendly_name: "Door Camera" }) },
    );
    const dots = floorDotRow(["cameras"], [idle, live, []]);
    assert.equal(dots[0]?.state, "on");
    assert.equal(dots[0]?.label, "Cameras 1/2 On");
    assert.equal(dots[0]?.icon, "mdi:video");
    const hollow = floorDotRow(["cameras"], [idle]);
    assert.equal(hollow[0]?.state, "off");
    assert.equal(hollow[0]?.background, "transparent");
    assert.equal(hollow[0]?.ring, "rgb(244, 67, 54)");
    const missing = floorDotRow(["cameras"], [[]]);
    assert.equal(missing[0]?.state, "empty");
    assert.equal(missing[0]?.label, null);
  });
});

describe("floor expanded storage", () => {
  it("keys each floor separately", () => {
    assert.equal(floorExpandedKey("upstairs"), "area-card-floor-expanded:upstairs");
    assert.equal(floorExpandedKey("downstairs"), "area-card-floor-expanded:downstairs");
    assert.equal(floorExpandedKey("cabin"), "area-card-floor-expanded:cabin");
  });

  it("tells Bubble the floor is a shared stack so a room popup does not hide it", () => {
    assert.deepEqual(floorRuntimeConfig("upstairs"), {
      floor: "upstairs",
      type: "custom:vertical-stack-in-card",
      sortByPresence: true,
      collapsedAreas: 0,
    });
  });

  it("parses stored booleans and uses expanded when the value is missing", () => {
    assert.equal(parseFloorExpanded("true"), true);
    assert.equal(parseFloorExpanded("false"), false);
    assert.equal(parseFloorExpanded(null), true);
    assert.equal(parseFloorExpanded(undefined), true);
    assert.equal(parseFloorExpanded(""), true);
    assert.equal(parseFloorExpanded("yes"), true);
    assert.equal(parseFloorExpanded(null, false), false);
  });
});
