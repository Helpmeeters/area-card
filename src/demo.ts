import { buildButtonConfig, type ButtonConfigInput } from "./button-config";
import { buildPopupConfig } from "./popup-cards";
import { collapsedDotSlots, parseHideSections, ROLLUP_ORDER, sectionRollups, sectionTitle, withoutSections, type RollupId, type SectionRollup } from "./rollups";
import { areaDisplay, classifyArea, type AreaSections, type ClassifierHass, type EntityState } from "./sections";

/** Stable id for the demo popup hash (`#area-demo`). Not a Home Assistant area. */
export const DEMO_AREA_ID = "demo";
export const DEMO_NAME = "Demo Room";
export const DEMO_ICON = "mdi:home-assistant";

export const DEMO_ENTITIES = {
  temperature: "sensor.demo_temperature",
  humidity: "sensor.demo_humidity",
  illuminance: "sensor.demo_illuminance",
  thermostat: "climate.demo_thermostat",
  humidifier: "humidifier.demo_humidifier",
  waterHeater: "water_heater.demo_water_heater",
  lightDim: "light.demo_dimmer",
  lightOnOff: "light.demo_lamp",
  lightLed: "switch.demo_dimmer_led",
  media: "media_player.demo_player",
  camera: "camera.demo_camera",
  switchOn: "switch.demo_switch",
  switchOff: "switch.demo_outlet",
  occupancy: "binary_sensor.demo_occupancy",
  door: "binary_sensor.demo_door",
  satellite: "assist_satellite.demo_satellite",
  smoke: "binary_sensor.demo_smoke",
  lockUnlocked: "lock.demo_front",
  lockLocked: "lock.demo_back",
  vacuum: "vacuum.demo_vacuum",
  button: "button.demo_button",
  inputButton: "input_button.demo_button",
  scene: "scene.demo_scene",
  script: "script.demo_script",
  inputBoolean: "input_boolean.demo_guest",
  inputSelect: "input_select.demo_mode",
  timer: "timer.demo_timer",
  automationOn: "automation.demo_arrive",
  automationOff: "automation.demo_leave",
} as const;

const DEMO_ENTITY_IDS = new Set<string>(Object.values(DEMO_ENTITIES));

export interface ParsedAreaConfig {
  area: string;
  hide_sections: RollupId[];
  demo: boolean;
}

export interface AreaContent {
  areaId: string;
  name: string;
  icon: string;
  picture: string | null;
  sections: AreaSections;
  states: Record<string, EntityState>;
}

export interface PresentAreaOptions {
  disabledAutomations?: ReadonlySet<string>;
  alignDots?: boolean;
  formatEntityState?: (state: EntityState, sample?: string) => string;
  viewportWidth?: number;
  /** Collapsed button picture. Omit to use the area picture. Popup keeps the area picture. */
  shownPicture?: string | null;
  unavailable?: boolean;
}

export interface AreaPresentation {
  content: AreaContent;
  sections: AreaSections;
  button: Record<string, unknown>;
  popup: Record<string, unknown>;
  rollups: SectionRollup[];
  buttonInput: ButtonConfigInput;
}

export const AREA_CARD_CONFIG_FORM = {
  schema: [
    {
      name: "area",
      required: true,
      selector: { area: {} },
    },
    {
      name: "hide_sections",
      selector: {
        select: {
          multiple: true,
          options: ROLLUP_ORDER.map((id) => ({ value: id, label: sectionTitle(id) })),
        },
      },
    },
    {
      name: "demo",
      label: "Demo",
      selector: { boolean: {} },
    },
  ],
  computeLabel(schema: { name?: string }): string {
    switch (schema.name) {
      case "area":
        return "Area";
      case "hide_sections":
        return "Hide sections";
      case "demo":
        return "Demo";
      default:
        return schema.name ?? "";
    }
  },
};

export function parseAreaConfig(
  config: { area?: unknown; hide_sections?: unknown; demo?: unknown } | null | undefined,
): ParsedAreaConfig {
  if (!config || typeof config !== "object") throw new Error("Area is required");
  const demo = config.demo === true;
  const area = typeof config.area === "string" ? config.area : "";
  if (!demo && area.trim() === "") throw new Error("Area is required");
  return {
    area,
    hide_sections: parseHideSections(config.hide_sections),
    demo,
  };
}

/**
 * Demo mode returns the built-in room and does not read `hass`.
 * Otherwise this is the live area name, picture, and classification.
 */
export function contentFor(config: ParsedAreaConfig, hass: ClassifierHass): AreaContent {
  if (config.demo) {
    const demo = demoDataset();
    return {
      areaId: demo.areaId,
      name: demo.name,
      icon: demo.icon,
      picture: null,
      sections: demo.sections,
      states: demo.states,
    };
  }
  const display = areaDisplay(hass, config.area);
  return {
    areaId: config.area,
    name: display.name,
    icon: display.icon,
    picture: display.picture,
    sections: classifyArea(hass, config.area),
    states: hass.states ?? {},
  };
}

/** Same button, popup, and rollup path the live card uses. `hide_sections` is applied here. */
export function presentArea(
  config: ParsedAreaConfig,
  hass: ClassifierHass,
  options: PresentAreaOptions = {},
): AreaPresentation {
  const content = contentFor(config, hass);
  const sections = withoutSections(content.sections, config.hide_sections);
  const disabled = options.disabledAutomations ?? new Set<string>();
  const picture = options.shownPicture !== undefined ? options.shownPicture : content.picture;
  const buttonInput: ButtonConfigInput = {
    areaId: content.areaId,
    name: content.name,
    icon: content.icon,
    sections,
    states: content.states,
    dotSlots: collapsedDotSlots(config.hide_sections),
    picture,
    unavailable: options.unavailable ?? false,
    disabledAutomations: disabled,
    alignDots: options.alignDots,
    formatEntityState: options.formatEntityState,
  };
  return {
    content,
    sections,
    button: buildButtonConfig(buttonInput),
    popup: buildPopupConfig(
      content.areaId,
      content.name,
      content.icon,
      sections,
      content.states,
      content.picture,
      disabled,
      {
        viewportWidth: options.viewportWidth,
        formatEntityState: options.formatEntityState,
        literalState: config.demo,
      },
    ),
    rollups: sectionRollups(sections, content.states, disabled),
    buttonInput,
  };
}

interface DemoDataset {
  areaId: typeof DEMO_AREA_ID;
  name: typeof DEMO_NAME;
  icon: typeof DEMO_ICON;
  sections: AreaSections;
  states: Record<string, EntityState>;
}

function demoState(entityId: string, state: string, attributes: Record<string, unknown> = {}): EntityState {
  return { entity_id: entityId, state, attributes };
}

/** Fresh objects on every call so a hidden section cannot mutate the next render. */
export function demoDataset(): DemoDataset {
  const id = DEMO_ENTITIES;
  const states: Record<string, EntityState> = {
    [id.temperature]: demoState(id.temperature, "72", {
      device_class: "temperature",
      unit_of_measurement: "°F",
      friendly_name: "Temperature",
    }),
    [id.humidity]: demoState(id.humidity, "44", {
      device_class: "humidity",
      unit_of_measurement: "%",
      friendly_name: "Humidity",
    }),
    [id.illuminance]: demoState(id.illuminance, "320", {
      device_class: "illuminance",
      unit_of_measurement: "lx",
      friendly_name: "Illuminance",
    }),
    [id.thermostat]: demoState(id.thermostat, "heat", {
      friendly_name: "Thermostat",
      current_temperature: 68,
      temperature: 70,
    }),
    [id.humidifier]: demoState(id.humidifier, "off", {
      friendly_name: "Humidifier",
      current_humidity: 40,
      humidity: 45,
    }),
    [id.waterHeater]: demoState(id.waterHeater, "off", {
      friendly_name: "Water Heater",
      current_temperature: 110,
      temperature: 120,
    }),
    [id.lightDim]: demoState(id.lightDim, "on", {
      friendly_name: "Dimmer",
      supported_color_modes: ["brightness"],
      brightness: 128,
    }),
    [id.lightOnOff]: demoState(id.lightOnOff, "off", {
      friendly_name: "Lamp",
      supported_color_modes: ["onoff"],
    }),
    [id.lightLed]: demoState(id.lightLed, "on", { friendly_name: "Dimmer LED" }),
    [id.media]: demoState(id.media, "playing", { friendly_name: "Player", media_title: "Demo Track" }),
    [id.camera]: demoState(id.camera, "idle", { friendly_name: "Camera" }),
    [id.switchOn]: demoState(id.switchOn, "on", { friendly_name: "Switch" }),
    [id.switchOff]: demoState(id.switchOff, "off", { friendly_name: "Outlet" }),
    [id.occupancy]: demoState(id.occupancy, "on", { device_class: "occupancy", friendly_name: "Occupancy" }),
    [id.door]: demoState(id.door, "off", { device_class: "door", friendly_name: "Door", battery_level: 82 }),
    [id.satellite]: demoState(id.satellite, "idle", { friendly_name: "Satellite" }),
    [id.smoke]: demoState(id.smoke, "on", { device_class: "smoke", friendly_name: "Smoke", battery_level: 41 }),
    [id.lockUnlocked]: demoState(id.lockUnlocked, "unlocked", { friendly_name: "Front Lock", battery_level: 18 }),
    [id.lockLocked]: demoState(id.lockLocked, "locked", { friendly_name: "Back Lock", battery_level: 76 }),
    [id.vacuum]: demoState(id.vacuum, "cleaning", { friendly_name: "Vacuum", battery_level: 55 }),
    [id.button]: demoState(id.button, "unknown", { friendly_name: "Button" }),
    [id.inputButton]: demoState(id.inputButton, "unknown", { friendly_name: "Input Button" }),
    [id.scene]: demoState(id.scene, "unknown", { friendly_name: "Scene" }),
    [id.script]: demoState(id.script, "off", { friendly_name: "Script" }),
    [id.inputBoolean]: demoState(id.inputBoolean, "on", { friendly_name: "Guest Mode" }),
    [id.inputSelect]: demoState(id.inputSelect, "Day", {
      friendly_name: "Mode",
      options: ["Day", "Night"],
    }),
    [id.timer]: demoState(id.timer, "idle", { friendly_name: "Timer", duration: "0:05:00" }),
    [id.automationOn]: demoState(id.automationOn, "on", { friendly_name: "Arrive" }),
    [id.automationOff]: demoState(id.automationOff, "off", { friendly_name: "Leave" }),
  };
  const sections: AreaSections = {
    climate: [id.temperature, id.humidity, id.thermostat, id.humidifier, id.waterHeater, id.illuminance],
    lights: [id.lightDim, id.lightOnOff],
    lightLeds: { [id.lightDim]: id.lightLed },
    mediaPlayers: [id.media],
    cameras: [id.camera],
    switches: [id.switchOn, id.switchOff],
    occupancy: [{ entityId: id.occupancy }],
    openings: [id.door],
    satellites: [{ entityId: id.satellite }],
    helpers: [id.inputBoolean, id.timer],
    selects: [id.inputSelect],
    automations: [id.automationOn, id.automationOff],
    sensors: [id.smoke],
    locks: [id.lockUnlocked, id.lockLocked],
    vacuums: [id.vacuum],
    buttons: [id.button, id.inputButton],
    scenes: [id.scene],
    scripts: [id.script],
  };
  return {
    areaId: DEMO_AREA_ID,
    name: DEMO_NAME,
    icon: DEMO_ICON,
    sections,
    states,
  };
}

export function isDemoEntity(entityId: string): boolean {
  return DEMO_ENTITY_IDS.has(entityId);
}

/**
 * Hass object the area card keeps for itself and assigns to nested cards.
 * Demo mode copies the dataset into `states` on top of whatever Home Assistant sent.
 * A later assignment builds a new object, so those ids are present again.
 */
export function hassForChildren(demo: boolean, hass: ClassifierHass): ClassifierHass {
  if (!demo) return hass;
  const states: Record<string, EntityState> = { ...(hass.states ?? {}) };
  for (const [entityId, state] of Object.entries(demoDataset().states)) {
    states[entityId] = {
      ...state,
      attributes: { ...state.attributes },
    };
  }
  const callService = hass.callService?.bind(hass);
  return {
    ...hass,
    states,
    callService(domain, service, data, target, ...rest) {
      if (serviceTargetsDemo(data, target)) return Promise.resolve();
      if (!callService) return Promise.resolve();
      return callService(domain, service, data, target, ...rest);
    },
  };
}

/** Assigns {@link hassForChildren} to each nested card. Returns that same object. */
export function publishChildHass(
  demo: boolean,
  hass: ClassifierHass,
  targets: { hass?: ClassifierHass }[],
): ClassifierHass {
  const next = hassForChildren(demo, hass);
  for (const target of targets) target.hass = next;
  return next;
}

/** More-info and hass-action events whose entity is one of the demo ids. */
export function eventTargetsDemoEntity(event: Event): boolean {
  const detail = (event as CustomEvent<unknown>).detail;
  return collectEntityIds(detail).some((entityId) => DEMO_ENTITY_IDS.has(entityId));
}

function serviceTargetsDemo(
  data?: Record<string, unknown>,
  target?: Record<string, unknown>,
): boolean {
  const ids = [...entityIdList(data?.entity_id), ...entityIdList(target?.entity_id)];
  const nested = data?.target;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    ids.push(...entityIdList((nested as { entity_id?: unknown }).entity_id));
  }
  return ids.length > 0 && ids.every((entityId) => DEMO_ENTITY_IDS.has(entityId));
}

function entityIdList(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

const ENTITY_ID_KEYS = new Set(["entity", "entityId", "entity_id"]);
const ENTITY_WALK_KEYS = new Set([
  "target",
  "config",
  "tap_action",
  "hold_action",
  "double_tap_action",
  "icon_tap_action",
  "icon_hold_action",
  "icon_double_tap_action",
]);

function collectEntityIds(value: unknown, depth = 0): string[] {
  if (depth > 5 || !value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap((item) => collectEntityIds(item, depth + 1));
  const record = value as Record<string, unknown>;
  const ids: string[] = [];
  for (const [key, field] of Object.entries(record)) {
    if (ENTITY_ID_KEYS.has(key)) {
      ids.push(...entityIdList(field));
      continue;
    }
    if (ENTITY_WALK_KEYS.has(key)) ids.push(...collectEntityIds(field, depth + 1));
  }
  return ids;
}
