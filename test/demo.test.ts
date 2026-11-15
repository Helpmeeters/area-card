import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { climateSubtitle } from "../src/climate-subtitle";
import {
  AREA_CARD_CONFIG_FORM,
  DEMO_AREA_ID,
  DEMO_ENTITIES,
  DEMO_ICON,
  DEMO_NAME,
  eventTargetsDemoEntity,
  parseAreaConfig,
  presentArea,
  publishChildHass,
} from "../src/demo";
import { collapsedDotSlots, ROLLUP_ORDER, rollupLabel, sectionHasEntities } from "../src/rollups";
import { classifyArea, type ClassifierHass, type EntityState } from "../src/sections";
import { areaHash, mushroomCardType } from "../src/tags";

const DOT_ORDER = [
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
] as const;

const POPUP_TITLES = [
  "Status",
  "Climate",
  "Lights",
  "Media players",
  "Cameras",
  "Switches",
  "Occupancy",
  "Entries",
  "Satellites",
  "Other Sensors",
  "Locks",
  "Vacuums",
  "Buttons",
  "Scenes",
  "Scripts",
  "Helpers",
  "Automations",
];

function officeHass(): ClassifierHass {
  const light = "light.office_lamp";
  const temp = "sensor.office_temp";
  const state = (entityId: string, value: string, attributes: Record<string, unknown> = {}): EntityState => ({
    entity_id: entityId,
    state: value,
    attributes,
  });
  return {
    areas: { office: { area_id: "office", name: "Office", icon: "mdi:desk" } },
    entities: {
      [light]: { entity_id: light, area_id: "office" },
      [temp]: { entity_id: temp, area_id: "office" },
    },
    states: {
      [light]: state(light, "on", { friendly_name: "Lamp" }),
      [temp]: state(temp, "70", {
        device_class: "temperature",
        unit_of_measurement: "°F",
        friendly_name: "Temperature",
      }),
    },
  };
}

function cardsOf(popup: Record<string, unknown>): Record<string, unknown>[] {
  const cards = popup.cards;
  assert.ok(Array.isArray(cards));
  return cards as Record<string, unknown>[];
}

function performAction(card: Record<string, unknown>): string | undefined {
  const tap = card.tap_action;
  if (!tap || typeof tap !== "object") return undefined;
  const name = (tap as { perform_action?: unknown }).perform_action;
  return typeof name === "string" ? name : undefined;
}

describe("demo config", () => {
  it("keeps demo in the editor and allows a card with no area", () => {
    const demoField = AREA_CARD_CONFIG_FORM.schema.find((field) => field.name === "demo");
    assert.ok(demoField);
    assert.equal(demoField.label, "Demo");
    assert.equal(demoField.required, undefined);
    assert.deepEqual(demoField.selector, { boolean: {} });
    assert.equal(AREA_CARD_CONFIG_FORM.computeLabel({ name: "demo" }), "Demo");
    assert.equal(AREA_CARD_CONFIG_FORM.computeLabel({ name: "hide_sections" }), "Hide sections");
    assert.equal(AREA_CARD_CONFIG_FORM.schema[0]?.name, "area");
    assert.equal(AREA_CARD_CONFIG_FORM.schema[0]?.required, true);

    const parsed = parseAreaConfig({ demo: true, hide_sections: ["lights"] });
    assert.equal(parsed.demo, true);
    assert.equal(parsed.area, "");
    assert.deepEqual(parsed.hide_sections, ["lights"]);
    assert.equal(parseAreaConfig({ area: "office", demo: true }).area, "office");
    assert.throws(() => parseAreaConfig({}), /Area is required/);
    assert.throws(() => parseAreaConfig({ demo: false }), /Area is required/);
    assert.throws(() => parseAreaConfig({ demo: "true" }), /Area is required/);
  });

  it("renders every section from the demo dataset", () => {
    const view = presentArea(parseAreaConfig({ demo: true }), {});
    assert.equal(view.content.areaId, DEMO_AREA_ID);
    assert.equal(view.content.name, DEMO_NAME);
    assert.equal(view.content.icon, DEMO_ICON);
    assert.equal(view.content.picture, null);
    assert.equal(view.button.name, DEMO_NAME);
    assert.equal(view.button.icon, DEMO_ICON);
    assert.equal(view.popup.hash, areaHash(DEMO_AREA_ID));
    assert.equal(view.popup.name, DEMO_NAME);
    assert.equal(String(view.button.styles).includes("background-image"), false);

    for (const id of ROLLUP_ORDER) {
      assert.equal(sectionHasEntities(id, view.content.sections), true, id);
    }

    assert.deepEqual([...collapsedDotSlots([])], [...DOT_ORDER]);
    const sub = view.button.sub_button as { css_class: string }[];
    assert.deepEqual(
      sub.map((item) => item.css_class),
      [
        "area-dot-lights-on",
        "area-dot-media-on",
        "area-dot-cameras-off",
        "area-dot-switches-on",
        "area-dot-occupancy-on",
        "area-dot-openings-off",
        "area-dot-satellites-off",
        "area-dot-sensors-on",
        "area-dot-locks-on",
        "area-dot-vacuums-on",
      ],
    );

    const climate = climateSubtitle(view.content.sections.climate, view.content.states, view.content.name);
    assert.equal(climate, "Temperature 72 °F · Humidity 44 %");
    assert.equal(String(view.button.state_content).includes(climate), true);
    assert.equal(climate.includes("Illuminance"), false);
    assert.equal(climate.includes("Thermostat"), false);
    assert.equal(climate.includes("Humidifier"), false);
    assert.equal(climate.includes("Water Heater"), false);
    assert.match(String(view.button.state_content), /1\/1/);
    assert.match(String(view.button.state_content), /1\/2/);

    const locks = view.rollups.find((rollup) => rollup.id === "locks");
    assert.equal(rollupLabel(locks!), "Locks 1/2 Unlocked");

    const cards = cardsOf(view.popup);
    const titles = cards.filter((card) => card.type === "custom:area-card-section-title").map((card) => card.title);
    assert.deepEqual(titles, POPUP_TITLES);
    assert.equal(
      cards.some((card) => card.type === mushroomCardType("climate-card") && card.entity === DEMO_ENTITIES.thermostat),
      true,
    );
    assert.equal(
      cards.some(
        (card) => card.type === mushroomCardType("humidifier-card") && card.entity === DEMO_ENTITIES.humidifier,
      ),
      true,
    );
    assert.equal(cards.some((card) => card.entity === DEMO_ENTITIES.waterHeater), true);
    assert.equal(cards.some((card) => card.entity === DEMO_ENTITIES.illuminance), true);
    assert.equal(cards.some((card) => card.entity === DEMO_ENTITIES.temperature), true);
    assert.equal(cards.some((card) => card.entity === DEMO_ENTITIES.humidity), true);
    assert.equal(
      cards.some((card) => card.type === mushroomCardType("lock-card") && card.entity === DEMO_ENTITIES.lockUnlocked),
      true,
    );
    assert.equal(
      cards.some((card) => card.type === mushroomCardType("vacuum-card") && card.entity === DEMO_ENTITIES.vacuum),
      true,
    );
    assert.equal(
      cards.some((card) => card.type === "custom:area-card-light-row" && card.led_entity === DEMO_ENTITIES.lightLed),
      true,
    );
    const actions = cards.map(performAction);
    assert.equal(actions.includes("button.press"), true);
    assert.equal(actions.includes("input_button.press"), true);
    assert.equal(actions.includes("scene.turn_on"), true);
    assert.equal(actions.includes("script.turn_on"), true);
  });

  it("still removes a hidden demo section", () => {
    const view = presentArea(parseAreaConfig({ demo: true, hide_sections: ["cameras"] }), {});
    assert.deepEqual(view.content.sections.cameras, [DEMO_ENTITIES.camera]);
    assert.deepEqual(view.sections.cameras, []);
    assert.equal(sectionHasEntities("cameras", view.sections), false);
    assert.equal(sectionHasEntities("lights", view.sections), true);
    const sub = view.button.sub_button as { css_class: string }[];
    assert.equal(sub.some((item) => item.css_class.includes("cameras")), false);
    assert.equal(sub.some((item) => item.css_class === "area-dot-lights-on"), true);
    const cards = cardsOf(view.popup);
    const titles = cards.filter((card) => card.type === "custom:area-card-section-title").map((card) => card.title);
    assert.equal(titles.includes("Cameras"), false);
    assert.equal(titles.includes("Lights"), true);
    assert.equal(cards.some((card) => card.entity === DEMO_ENTITIES.camera), false);
  });

  it("does not change classification when demo is omitted or false", () => {
    const hass = officeHass();
    const omitted = presentArea(parseAreaConfig({ area: "office" }), hass);
    assert.equal(parseAreaConfig({ area: "office" }).demo, false);
    assert.deepEqual(omitted.content.sections, classifyArea(hass, "office"));
    assert.equal(omitted.content.name, "Office");
    assert.equal(omitted.content.icon, "mdi:desk");
    assert.equal(omitted.content.areaId, "office");
    assert.equal(omitted.content.sections.lights.includes("light.office_lamp"), true);
    assert.equal(omitted.content.sections.lights.includes(DEMO_ENTITIES.lightDim), false);

    const explicit = presentArea(parseAreaConfig({ area: "office", demo: false }), hass);
    assert.deepEqual(explicit.content.sections, classifyArea(hass, "office"));

    const demo = presentArea(parseAreaConfig({ area: "office", demo: true }), hass);
    assert.equal(demo.content.areaId, DEMO_AREA_ID);
    assert.equal(demo.content.name, DEMO_NAME);
    assert.equal(demo.content.sections.lights.includes("light.office_lamp"), false);
    assert.equal(demo.content.sections.lights.includes(DEMO_ENTITIES.lightDim), true);

    const liveLight = flatCards(cardsOf(explicit.popup)).find((card) => card.entity === "light.office_lamp");
    assert.match(String(liveLight?.secondary), /\{\{/);
    const lamp = flatCards(cardsOf(demo.popup)).find((card) => card.entity === DEMO_ENTITIES.lightOnOff);
    assert.equal(lamp?.primary, "Lamp");
    assert.equal(lamp?.secondary, "Off");
    assert.equal(lamp?.icon, "mdi:lightbulb");
    assert.equal(lamp?.icon_color, "grey");
    assert.equal(String(lamp?.secondary).includes("{{"), false);
  });

  it("gives child cards demo states and keeps them after a later hass assignment", async () => {
    const button: { hass?: ClassifierHass } = {};
    const popup: { hass?: ClassifierHass } = {};
    const calls: string[] = [];
    const live = (entityId: string, value: string): EntityState => ({
      entity_id: entityId,
      state: value,
      attributes: {},
    });
    const track = (label: string) => (domain: string, service: string, data?: Record<string, unknown>) => {
      calls.push(`${label}:${domain}.${service}:${String(data?.entity_id ?? "")}`);
      return Promise.resolve();
    };

    const first = publishChildHass(
      true,
      {
        states: { "light.office_lamp": live("light.office_lamp", "on") },
        callService: track("first"),
      },
      [button, popup],
    );
    assert.equal(button.hass, first);
    assert.equal(popup.hass, first);
    assert.equal(first.states?.[DEMO_ENTITIES.temperature]?.state, "72");
    assert.equal(first.states?.[DEMO_ENTITIES.temperature]?.attributes.unit_of_measurement, "°F");
    assert.equal(first.states?.[DEMO_ENTITIES.temperature]?.attributes.device_class, "temperature");
    assert.equal(first.states?.[DEMO_ENTITIES.lockUnlocked]?.state, "unlocked");
    assert.equal(first.states?.["light.office_lamp"]?.state, "on");

    const second = publishChildHass(
      true,
      {
        states: { "switch.kitchen": live("switch.kitchen", "off") },
        callService: track("second"),
      },
      [button, popup],
    );
    assert.equal(button.hass, second);
    assert.equal(popup.hass, second);
    assert.notEqual(second, first);
    assert.equal(second.states?.[DEMO_ENTITIES.temperature]?.state, "72");
    assert.equal(second.states?.[DEMO_ENTITIES.lockUnlocked]?.state, "unlocked");
    assert.equal(second.states?.[DEMO_ENTITIES.lockUnlocked]?.attributes.friendly_name, "Front Lock");
    assert.equal(second.states?.["switch.kitchen"]?.state, "off");
    assert.equal(second.states?.["light.office_lamp"], undefined);

    await second.callService?.("light", "toggle", { entity_id: DEMO_ENTITIES.lightOnOff });
    await second.callService?.("lock", "unlock", undefined, { entity_id: DEMO_ENTITIES.lockUnlocked });
    await second.callService?.("switch", "toggle", { entity_id: "switch.kitchen" });
    assert.deepEqual(calls, ["second:switch.toggle:switch.kitchen"]);

    const plain = { states: { "light.office_lamp": live("light.office_lamp", "off") } };
    const unchanged = publishChildHass(false, plain, [button]);
    assert.equal(unchanged, plain);
    assert.equal(button.hass, plain);
    assert.equal(plain.states[DEMO_ENTITIES.temperature], undefined);

    const moreInfo = new CustomEvent("hass-more-info", { detail: { entityId: DEMO_ENTITIES.lockUnlocked } });
    assert.equal(eventTargetsDemoEntity(moreInfo), true);
    const action = new CustomEvent("hass-action", {
      detail: {
        action: "tap",
        config: { entity: DEMO_ENTITIES.button, tap_action: { action: "perform-action" } },
      },
    });
    assert.equal(eventTargetsDemoEntity(action), true);
    assert.equal(eventTargetsDemoEntity(new CustomEvent("hass-action", { detail: { action: "tap" } })), false);
  });

  it("shows mock titles on demo template rows", () => {
    const cards = flatCards(cardsOf(presentArea(parseAreaConfig({ demo: true }), {}).popup));
    const byEntity = (entity: string) => cards.find((card) => card.entity === entity);
    assert.equal(byEntity(DEMO_ENTITIES.button)?.secondary, "Unknown");
    assert.equal(byEntity(DEMO_ENTITIES.button)?.icon, "mdi:gesture-tap-button");
    assert.equal(byEntity(DEMO_ENTITIES.scene)?.secondary, "Unknown");
    assert.equal(byEntity(DEMO_ENTITIES.scene)?.icon, "mdi:palette");
    assert.equal(byEntity(DEMO_ENTITIES.script)?.secondary, "Off");
    assert.equal(byEntity(DEMO_ENTITIES.script)?.icon, "mdi:script-text");
    assert.equal(byEntity(DEMO_ENTITIES.occupancy)?.secondary, "On");
    assert.equal(byEntity(DEMO_ENTITIES.occupancy)?.icon_color, "amber");
    assert.equal(byEntity(DEMO_ENTITIES.satellite)?.secondary, "Idle");
    assert.equal(byEntity(DEMO_ENTITIES.satellite)?.icon_color, "blue");
    assert.equal(byEntity(DEMO_ENTITIES.automationOn)?.secondary, "Never triggered");
    assert.equal(byEntity(DEMO_ENTITIES.automationOn)?.icon_color, "green");
    assert.equal(byEntity(DEMO_ENTITIES.automationOff)?.icon_color, "grey");
    for (const entity of [
      DEMO_ENTITIES.button,
      DEMO_ENTITIES.scene,
      DEMO_ENTITIES.script,
      DEMO_ENTITIES.lightOnOff,
      DEMO_ENTITIES.occupancy,
      DEMO_ENTITIES.satellite,
      DEMO_ENTITIES.automationOn,
    ]) {
      const card = byEntity(entity);
      assert.equal(String(card?.secondary).includes("{{"), false, entity);
      assert.equal(String(card?.icon).includes("{{"), false, entity);
      assert.equal(String(card?.icon_color).includes("{{"), false, entity);
    }
  });
});

function flatCards(cards: Record<string, unknown>[]): Record<string, unknown>[] {
  const flat: Record<string, unknown>[] = [];
  for (const card of cards) {
    flat.push(card);
    if (card.card && typeof card.card === "object" && !Array.isArray(card.card)) {
      flat.push(card.card as Record<string, unknown>);
    }
  }
  return flat;
}
