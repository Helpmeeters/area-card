import type { AreaSections } from "./sections";

export const ENTITY_ORDER_KEY_PREFIX = "area-card-order:";

export function entityOrderKey(areaId: string): string {
  return `${ENTITY_ORDER_KEY_PREFIX}${areaId}`;
}

/** Map from section or device-group scope key to ordered entity ids. */
export type AreaEntityOrder = Record<string, string[]>;

function cleanIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string" || item.length === 0 || seen.has(item)) continue;
    seen.add(item);
    ids.push(item);
  }
  return ids;
}

export function parseEntityOrder(raw: unknown): AreaEntityOrder {
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    if (raw.length === 0) return {};
    try {
      parsed = JSON.parse(raw);
    } catch {
      return {};
    }
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
  const result: AreaEntityOrder = {};
  for (const [scope, list] of Object.entries(parsed)) {
    if (scope.length === 0) continue;
    const ids = cleanIds(list);
    if (ids.length > 0) result[scope] = ids;
  }
  return result;
}

export function serializeEntityOrder(order: AreaEntityOrder): AreaEntityOrder {
  const result: AreaEntityOrder = {};
  for (const [scope, list] of Object.entries(order)) {
    if (scope.length === 0) continue;
    const ids = cleanIds(list);
    if (ids.length > 0) result[scope] = ids;
  }
  return result;
}

export function cloneEntityOrder(order: AreaEntityOrder): AreaEntityOrder {
  const copy: AreaEntityOrder = {};
  for (const [scope, list] of Object.entries(order)) {
    copy[scope] = [...list];
  }
  return copy;
}

export function entityOrderEqual(left: AreaEntityOrder, right: AreaEntityOrder): boolean {
  const leftKeys = Object.keys(left).filter((k) => left[k].length > 0);
  const rightKeys = Object.keys(right).filter((k) => right[k].length > 0);
  if (leftKeys.length !== rightKeys.length) return false;
  for (const key of leftKeys) {
    const a = left[key];
    const b = right[key];
    if (!b || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] !== b[i]) return false;
    }
  }
  return true;
}

/**
 * Merge current entity ids with a saved order for one scope.
 * Saved ids that still exist come first in saved order; newly added ids are appended.
 */
export function mergeEntityOrder(entities: readonly string[], saved: readonly string[] | undefined): string[] {
  if (!saved || saved.length === 0) return [...entities];
  const present = new Set(entities);
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const id of saved) {
    if (!present.has(id) || seen.has(id)) continue;
    seen.add(id);
    merged.push(id);
  }
  for (const id of entities) {
    if (seen.has(id)) continue;
    seen.add(id);
    merged.push(id);
  }
  return merged;
}

export function mergeEntityOrderBy<T>(
  items: readonly T[],
  saved: readonly string[] | undefined,
  idOf: (item: T) => string,
): T[] {
  if (!saved || saved.length === 0) return [...items];
  const byId = new Map<string, T>();
  for (const item of items) {
    const id = idOf(item);
    if (!byId.has(id)) byId.set(id, item);
  }
  const seen = new Set<string>();
  const merged: T[] = [];
  for (const id of saved) {
    const item = byId.get(id);
    if (!item || seen.has(id)) continue;
    seen.add(id);
    merged.push(item);
  }
  for (const item of items) {
    const id = idOf(item);
    if (seen.has(id)) continue;
    seen.add(id);
    merged.push(item);
  }
  return merged;
}

export function setScopeEntityOrder(
  order: AreaEntityOrder,
  scope: string,
  ids: readonly string[],
): AreaEntityOrder {
  const next = cloneEntityOrder(order);
  const cleaned = cleanIds(ids);
  if (cleaned.length > 0) next[scope] = cleaned;
  else delete next[scope];
  return next;
}

/** Scope key for each entity in `sections` (for persistence under `area-card-order:<areaId>`). */
export function entityScopeMap(sections: AreaSections): Map<string, string> {
  const map = new Map<string, string>();
  for (const id of sections.climate) map.set(id, "climate");
  for (const id of sections.lights) map.set(id, "lights");
  for (const id of sections.mediaPlayers) map.set(id, "media");
  for (const id of sections.cameras) map.set(id, "cameras");
  for (const id of sections.switches) map.set(id, "switches");
  for (const item of sections.occupancy) map.set(item.entityId, "occupancy");
  for (const id of sections.openings) map.set(id, "openings");
  for (const item of sections.satellites) map.set(item.entityId, "satellites");
  for (const id of sections.sensors) {
    const dev = sections.sensorDevices?.[id];
    map.set(id, dev ? `sensors:${dev.id}` : "sensors");
  }
  for (const id of sections.locks) map.set(id, "locks");
  for (const id of sections.vacuums) map.set(id, "vacuums");
  for (const id of sections.buttons) map.set(id, "buttons");
  for (const id of sections.scenes) map.set(id, "scenes");
  for (const id of sections.scripts) map.set(id, "scripts");
  for (const id of sections.selects) map.set(id, "helpers");
  for (const id of sections.helpers) map.set(id, "helpers");
  for (const id of sections.automations) map.set(id, "automations");
  return map;
}

/** Apply saved per-section / per-device-group ordering to `sections`. */
export function applyEntityOrderToSections(
  sections: AreaSections,
  order: AreaEntityOrder | undefined,
): AreaSections {
  if (!order || Object.keys(order).length === 0) return sections;
  const sensors = reorderSensors(sections.sensors, sections.sensorDevices, order);
  return {
    ...sections,
    climate: mergeEntityOrder(sections.climate, order.climate),
    lights: mergeEntityOrder(sections.lights, order.lights),
    mediaPlayers: mergeEntityOrder(sections.mediaPlayers, order.media),
    cameras: mergeEntityOrder(sections.cameras, order.cameras),
    switches: mergeEntityOrder(sections.switches, order.switches),
    occupancy: mergeEntityOrderBy(sections.occupancy, order.occupancy, (item) => item.entityId),
    openings: mergeEntityOrder(sections.openings, order.openings),
    satellites: mergeEntityOrderBy(sections.satellites, order.satellites, (item) => item.entityId),
    sensors,
    locks: mergeEntityOrder(sections.locks, order.locks),
    vacuums: mergeEntityOrder(sections.vacuums, order.vacuums),
    buttons: mergeEntityOrder(sections.buttons, order.buttons),
    scenes: mergeEntityOrder(sections.scenes, order.scenes),
    scripts: mergeEntityOrder(sections.scripts, order.scripts),
    selects: mergeEntityOrder(sections.selects, order.helpers),
    helpers: mergeEntityOrder(sections.helpers, order.helpers),
    automations: mergeEntityOrder(sections.automations, order.automations),
  };
}

function reorderSensors(
  sensors: readonly string[],
  sensorDevices: AreaSections["sensorDevices"],
  order: AreaEntityOrder,
): string[] {
  if (!sensorDevices) return mergeEntityOrder(sensors, order.sensors);
  const ungrouped: string[] = [];
  const byDevice = new Map<string, string[]>();
  for (const id of sensors) {
    const dev = sensorDevices[id];
    if (!dev) {
      ungrouped.push(id);
    } else {
      const list = byDevice.get(dev.id);
      if (list) list.push(id);
      else byDevice.set(dev.id, [id]);
    }
  }
  const result = mergeEntityOrder(ungrouped, order.sensors);
  for (const [devId, list] of byDevice.entries()) {
    result.push(...mergeEntityOrder(list, order[`sensors:${devId}`]));
  }
  return result;
}
