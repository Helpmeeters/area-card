import type { ClassifierHass, EntityState, RegistryEntry } from "./sections";

/** Off hides every percentage. Green shows all. Yellow hides green. Red hides green and yellow. */
export type BatteryMode = "off" | "green" | "yellow" | "red";

/** Home Assistant battery colors: green from 70%, yellow from 30%, red below 30%. */
export type BatteryLevel = "green" | "yellow" | "red";

export interface BatteryReading {
  percent: number;
  level: BatteryLevel;
}

export const BATTERY_LEVEL_COLOR: Record<BatteryLevel, string> = {
  green: "var(--state-sensor-battery-high-color, var(--green-color, #4caf50))",
  yellow: "var(--state-sensor-battery-medium-color, var(--amber-color, #ffc107))",
  red: "var(--state-sensor-battery-low-color, var(--red-color, #f44336))",
};

export interface BatteryIndex {
  /** Battery-sensor entity → its own rounded percent. */
  own: Map<string, number>;
  /** Device → lowest battery-sensor percent on that device. */
  byDevice: Map<string, number>;
  deviceOf: Map<string, string>;
}

export function batteryLevel(percent: number): BatteryLevel {
  if (percent >= 70) return "green";
  if (percent >= 30) return "yellow";
  return "red";
}

export function parseBatteryMode(value: unknown): BatteryMode {
  if (value === "off" || value === "green" || value === "yellow" || value === "red") return value;
  return "off";
}

/** The percent that should be drawn for this mode. Off and suppressed levels return null. */
export function shownBattery(
  index: BatteryIndex,
  hass: ClassifierHass,
  entityId: string,
  mode: BatteryMode,
): BatteryReading | null {
  if (mode === "off") return null;
  const percent = batteryPercent(index, hass, entityId);
  if (percent === null) return null;
  const level = batteryLevel(percent);
  if (mode === "yellow" && level === "green") return null;
  if (mode === "red" && level !== "red") return null;
  return { percent, level };
}

/**
 * A battery sensor on the same device wins. Otherwise a battery_level or battery
 * attribute on the entity itself. The number shown is the rounded percent.
 */
export function batteryPercent(index: BatteryIndex, hass: ClassifierHass, entityId: string): number | null {
  const own = index.own.get(entityId);
  if (own !== undefined) return own;
  const deviceId = index.deviceOf.get(entityId);
  if (deviceId) {
    const sibling = index.byDevice.get(deviceId);
    if (sibling !== undefined) return sibling;
  }
  return attributePercent(hass.states?.[entityId]);
}

export function buildBatteryIndex(hass: ClassifierHass): BatteryIndex {
  const index: BatteryIndex = {
    own: new Map(),
    byDevice: new Map(),
    deviceOf: new Map(),
  };
  const states = hass.states ?? {};
  for (const entry of registryEntries(hass)) {
    if (!entry.entity_id) continue;
    if (entry.device_id) index.deviceOf.set(entry.entity_id, entry.device_id);
    if (!isBatterySensor(entry, states[entry.entity_id])) continue;
    const percent = percentFromState(states[entry.entity_id]);
    if (percent === null) continue;
    index.own.set(entry.entity_id, percent);
    if (!entry.device_id) continue;
    const current = index.byDevice.get(entry.device_id);
    if (current === undefined || percent < current) index.byDevice.set(entry.device_id, percent);
  }
  return index;
}

function attributePercent(state: EntityState | undefined): number | null {
  const attributes = state?.attributes;
  if (!attributes) return null;
  const level = attributes.battery_level ?? attributes.battery;
  return percentNumber(level);
}

function isBatterySensor(entry: RegistryEntry, state: EntityState | undefined): boolean {
  if (!entry.entity_id.startsWith("sensor.")) return false;
  return deviceClass(entry, state) === "battery";
}

function deviceClass(entry: RegistryEntry, state: EntityState | undefined): string | undefined {
  const fromState = state?.attributes?.device_class;
  if (typeof fromState === "string" && fromState) return fromState;
  if (typeof entry.device_class === "string" && entry.device_class) return entry.device_class;
  if (typeof entry.original_device_class === "string" && entry.original_device_class) {
    return entry.original_device_class;
  }
  return undefined;
}

function percentFromState(state: EntityState | undefined): number | null {
  if (!state) return null;
  const raw = state.state;
  if (raw === "unknown" || raw === "unavailable" || raw === "none" || raw === "") return null;
  return percentNumber(raw);
}

function percentNumber(value: unknown): number | null {
  const numeric = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(numeric)) return null;
  const rounded = Math.round(numeric);
  if (rounded < 0 || rounded > 100) return null;
  return rounded;
}

function registryEntries(hass: ClassifierHass): RegistryEntry[] {
  const entities = hass.entities;
  if (!entities) return [];
  if (Array.isArray(entities)) return entities.map((entry) => normalizeEntry(entry));
  return Object.entries(entities).map(([key, entry]) => normalizeEntry(entry, key));
}

function normalizeEntry(entry: RegistryEntry, key?: string): RegistryEntry {
  return {
    ...entry,
    entity_id: entry.entity_id || key || "",
  };
}
