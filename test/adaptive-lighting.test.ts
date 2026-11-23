import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  adaptiveLightingCardConfig,
  adaptiveLightingMainTooltip,
  adaptiveLightingManualTooltip,
  adaptiveLightingPills,
  adaptiveLightingPillTooltip,
  adaptiveLightingRange,
  adaptiveLightingSettings,
  adaptiveLightingTitle,
  buildChangeSettingsPayload,
  clampTickPercent,
  DEFAULT_MAX_BRIGHTNESS,
  DEFAULT_MAX_KELVIN,
  DEFAULT_MIN_BRIGHTNESS,
  DEFAULT_MIN_KELVIN,
  DEFAULT_SLEEP_BRIGHTNESS,
  DEFAULT_SLEEP_KELVIN,
  kelvinGradientCss,
  kelvinToRgb,
  normalizeAdaptiveLightingSettings,
} from "../src/adaptive-lighting";
import { buildPopupCards } from "../src/popup-cards";
import { sectionHasEntities, withoutSections } from "../src/rollups";
import {
  classifyArea,
  emptySections,
  membershipKey,
  type ClassifierHass,
  type DeviceEntry,
  type EntityState,
  type RegistryEntry,
} from "../src/sections";

function state(entityId: string, value: string, attributes: Record<string, unknown> = {}): EntityState {
  return { entity_id: entityId, state: value, attributes: { friendly_name: entityId, ...attributes } };
}

function hass(fixture: {
  entities?: RegistryEntry[];
  devices?: DeviceEntry[];
  states?: Record<string, EntityState>;
}): ClassifierHass {
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
  return { entities, devices, states };
}

describe("adaptive lighting helpers", () => {
  it("maps Kelvin to warm and cool RGB endpoints", () => {
    const warm = kelvinToRgb(2000);
    const cool = kelvinToRgb(7000);
    assert.equal(warm[0], 255);
    assert.ok(warm[2] < 100);
    assert.equal(cool[2], 255);
    assert.ok(cool[0] < 255);
  });

  it("builds a gradient and clamps the tick", () => {
    const css = kelvinGradientCss(2000, 5500);
    assert.match(css, /^linear-gradient\(to right,/);
    assert.equal(clampTickPercent(2000, 2000, 5500), 0);
    assert.equal(clampTickPercent(5500, 2000, 5500), 100);
    assert.equal(clampTickPercent(1000, 2000, 5500), 0);
    assert.equal(clampTickPercent(9000, 2000, 5500), 100);
  });

  it("strips Adaptive Lighting and room prefixes from titles", () => {
    assert.equal(adaptiveLightingTitle("Adaptive Lighting: Man Cave Overheads", "Man Cave"), "Overheads");
    assert.equal(adaptiveLightingTitle("Bathroom", "Bathroom"), "Bathroom");
  });

  it("reads range defaults and live attributes from the main switch", () => {
    const empty = adaptiveLightingRange(undefined);
    assert.equal(empty.minK, DEFAULT_MIN_KELVIN);
    assert.equal(empty.maxK, DEFAULT_MAX_KELVIN);
    assert.equal(empty.currentK, null);
    assert.equal(empty.on, false);

    const live = adaptiveLightingRange(
      state("switch.adaptive_lighting_bathroom", "on", {
        color_temp_kelvin: 2500,
        brightness_pct: 41.2,
        manual_control: ["light.bath"],
        configuration: { min_color_temp: 2200, max_color_temp: 5000 },
      }),
    );
    assert.equal(live.minK, 2200);
    assert.equal(live.maxK, 5000);
    assert.equal(live.currentK, 2500);
    assert.equal(live.brightnessPct, 41.2);
    assert.equal(live.manualControl, true);
    assert.equal(live.on, true);
  });

  it("builds pill and card configs for a group", () => {
    const group = {
      id: "dev1",
      name: "Adaptive Lighting: Overheads",
      mainEntityId: "switch.adaptive_lighting_overheads",
      adaptColorEntityId: "switch.adaptive_lighting_overheads_adapt_color",
      adaptBrightnessEntityId: "switch.adaptive_lighting_overheads_adapt_brightness",
      sleepModeEntityId: "switch.adaptive_lighting_overheads_sleep_mode",
    };
    assert.deepEqual(
      adaptiveLightingPills(group).map((pill) => pill.label),
      ["Color", "Brightness", "Sleep"],
    );
    const card = adaptiveLightingCardConfig(group, "Man Cave");
    assert.equal(card.type, "custom:area-card-adaptive-lighting");
    assert.equal(card.entity, group.mainEntityId);
    assert.deepEqual(card.group, group);
  });

  it("formats chip, main, and manual-control tooltips", () => {
    assert.match(adaptiveLightingMainTooltip(true), /On/);
    assert.match(adaptiveLightingMainTooltip(false), /Off/);
    const pills = adaptiveLightingPills({
      id: "dev1",
      name: "Overheads",
      adaptColorEntityId: "switch.adaptive_lighting_overheads_adapt_color",
      adaptBrightnessEntityId: "switch.adaptive_lighting_overheads_adapt_brightness",
      sleepModeEntityId: "switch.adaptive_lighting_overheads_sleep_mode",
    });
    assert.match(adaptiveLightingPillTooltip(pills[0], true), /Adapt Color: On/);
    assert.match(adaptiveLightingPillTooltip(pills[1], false), /Adapt Brightness: Off/);
    assert.match(adaptiveLightingPillTooltip(pills[2], true), /Sleep Mode: On/);
    assert.equal(
      adaptiveLightingManualTooltip(["light.desk"], {
        "light.desk": state("light.desk", "on", { friendly_name: "Desk Lamp" }),
      }),
      "Manual control:\nDesk Lamp",
    );
  });

  it("parses settings, normalizes bounds, and builds change_switch_settings payload", () => {
    const defaults = adaptiveLightingSettings(undefined);
    assert.equal(defaults.hasConfig, false);
    assert.equal(defaults.minBrightness, DEFAULT_MIN_BRIGHTNESS);
    assert.equal(defaults.maxBrightness, DEFAULT_MAX_BRIGHTNESS);
    assert.equal(defaults.sleepBrightness, DEFAULT_SLEEP_BRIGHTNESS);
    assert.equal(defaults.sleepColorTemp, DEFAULT_SLEEP_KELVIN);

    const parsed = adaptiveLightingSettings(
      state("switch.adaptive_lighting_overheads", "on", {
        configuration: {
          min_brightness: 10,
          max_brightness: 85,
          min_color_temp: 2200,
          max_color_temp: 5000,
          sleep_brightness: 5,
          sleep_color_temp: 1800,
        },
      }),
    );
    assert.equal(parsed.hasConfig, true);
    assert.equal(parsed.minBrightness, 10);
    assert.equal(parsed.maxBrightness, 85);
    assert.equal(parsed.sleepBrightness, 5);
    assert.equal(parsed.sleepColorTemp, 1800);

    const normalized = normalizeAdaptiveLightingSettings({
      minBrightness: 60,
      maxBrightness: 40,
      minColorTemp: 4000,
      maxColorTemp: 3000,
      sleepBrightness: 0,
      sleepColorTemp: 500,
    });
    assert.deepEqual(normalized, {
      minBrightness: 60,
      maxBrightness: 60,
      minColorTemp: 4000,
      maxColorTemp: 4000,
      sleepBrightness: 1,
      sleepColorTemp: 1000,
    });

    const payload = buildChangeSettingsPayload("switch.adaptive_lighting_overheads", normalized);
    assert.deepEqual(payload, {
      entity_id: "switch.adaptive_lighting_overheads",
      include_config_in_attributes: true,
      min_brightness: 60,
      max_brightness: 60,
      min_color_temp: 4000,
      max_color_temp: 4000,
      sleep_brightness: 1,
      sleep_color_temp: 1000,
    });
  });
});

describe("adaptive lighting classification", () => {
  it("sweeps Adaptive Lighting switches out of Switches into Lights groups", () => {
    const result = classifyArea(
      hass({
        devices: [{ id: "al_man_cave", area_id: "office_of_drew", name: "Adaptive Lighting: Man Cave Overheads" }],
        entities: [
          {
            entity_id: "switch.adaptive_lighting_man_cave_overheads",
            device_id: "al_man_cave",
            platform: "adaptive_lighting",
            unique_id: "Man Cave Overheads",
          },
          {
            entity_id: "switch.adaptive_lighting_man_cave_overheads_adapt_color",
            device_id: "al_man_cave",
            platform: "adaptive_lighting",
            unique_id: "Man Cave Overheads_adapt_color",
          },
          {
            entity_id: "switch.adaptive_lighting_man_cave_overheads_adapt_brightness",
            device_id: "al_man_cave",
            platform: "adaptive_lighting",
            unique_id: "Man Cave Overheads_adapt_brightness",
          },
          {
            entity_id: "switch.adaptive_lighting_man_cave_overheads_sleep_mode",
            device_id: "al_man_cave",
            platform: "adaptive_lighting",
            unique_id: "Man Cave Overheads_sleep_mode",
          },
          { entity_id: "switch.desk_plug", area_id: "office_of_drew" },
          { entity_id: "light.desk", area_id: "office_of_drew" },
        ],
        states: {
          "switch.adaptive_lighting_man_cave_overheads": state(
            "switch.adaptive_lighting_man_cave_overheads",
            "on",
            { color_temp_kelvin: 2000, brightness_pct: 2 },
          ),
        },
      }),
      "office_of_drew",
    );

    assert.deepEqual(result.switches, ["switch.desk_plug"]);
    assert.deepEqual(result.lights, ["light.desk"]);
    assert.equal(result.adaptiveLighting?.length, 1);
    assert.deepEqual(result.adaptiveLighting?.[0], {
      id: "al_man_cave",
      name: "Man Cave Overheads",
      mainEntityId: "switch.adaptive_lighting_man_cave_overheads",
      adaptColorEntityId: "switch.adaptive_lighting_man_cave_overheads_adapt_color",
      adaptBrightnessEntityId: "switch.adaptive_lighting_man_cave_overheads_adapt_brightness",
      sleepModeEntityId: "switch.adaptive_lighting_man_cave_overheads_sleep_mode",
    });
    assert.equal(sectionHasEntities("lights", result), true);
    assert.equal(sectionHasEntities("switches", result), true);

    const hidden = withoutSections(result, ["lights"]);
    assert.equal(hidden.adaptiveLighting, undefined);
    assert.deepEqual(hidden.lights, []);
    assert.equal(sectionHasEntities("lights", hidden), false);

    const key = membershipKey("office_of_drew", "Man Cave", "mdi:office", result);
    assert.match(key, /al_man_cave=Man Cave Overheads=/);
  });

  it("places Adaptive Lighting cards under Lights in the popup", () => {
    const sections = {
      ...emptySections(),
      lights: ["light.desk"],
      adaptiveLighting: [
        {
          id: "al1",
          name: "Overheads",
          mainEntityId: "switch.adaptive_lighting_overheads",
          adaptColorEntityId: "switch.adaptive_lighting_overheads_adapt_color",
        },
      ],
    };
    const cards = buildPopupCards(sections, {
      "light.desk": state("light.desk", "on", { friendly_name: "Desk" }),
      "switch.adaptive_lighting_overheads": state("switch.adaptive_lighting_overheads", "on", {
        friendly_name: "Overheads",
        color_temp_kelvin: 3000,
      }),
    });
    const lightsTitle = cards.findIndex((card) => card.title === "Lights");
    assert.ok(lightsTitle >= 0);
    assert.equal(cards[lightsTitle + 1]?.entity, "light.desk");
    assert.equal(cards[lightsTitle + 2]?.type, "custom:area-card-adaptive-lighting");
    assert.equal(cards[lightsTitle + 2]?.entity, "switch.adaptive_lighting_overheads");
  });
});
