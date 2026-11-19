import type { AreaSections, EntityState, OccupancyItem } from "./sections";

export interface AreaPresenceInfo {
  hasSensors: boolean;
  occupied: boolean;
  lastChangedMs: number | null;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

function stateTimestampMs(entity: EntityState | undefined): number | null {
  if (!entity) return null;
  const raw = (entity as EntityState & { last_changed?: string }).last_changed ?? entity.last_updated;
  if (typeof raw !== "string" || raw.length === 0) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : null;
}

export function areaPresenceInfo(
  occupancyItems: readonly OccupancyItem[],
  states: Record<string, EntityState | undefined>,
): AreaPresenceInfo {
  if (occupancyItems.length === 0) {
    return { hasSensors: false, occupied: false, lastChangedMs: null };
  }

  let occupied = false;
  let lastChangedMs: number | null = null;

  for (const item of occupancyItems) {
    const entity = states[item.entityId];
    if (!entity) continue;
    if (entity.state === "on") occupied = true;
    const ms = stateTimestampMs(entity);
    if (ms !== null && (lastChangedMs === null || ms > lastChangedMs)) {
      lastChangedMs = ms;
    }
  }

  return { hasSensors: true, occupied, lastChangedMs };
}

export function floorPresenceInfo(
  sectionsList: readonly AreaSections[],
  states: Record<string, EntityState | undefined>,
): AreaPresenceInfo {
  return areaPresenceInfo(
    sectionsList.flatMap((sections) => sections.occupancy),
    states,
  );
}

export function formatPresenceBadge(
  info: AreaPresenceInfo,
  nowMs: number = Date.now(),
): { text: string; occupied: boolean } | null {
  if (!info.hasSensors) return null;
  if (info.occupied) return { text: "Occupied", occupied: true };
  if (info.lastChangedMs === null) return { text: "Clear", occupied: false };

  const elapsed = Math.max(0, nowMs - info.lastChangedMs);
  if (elapsed < MINUTE_MS) return { text: "Just now", occupied: false };
  if (elapsed < HOUR_MS) return { text: `${Math.floor(elapsed / MINUTE_MS)}m ago`, occupied: false };
  if (elapsed < DAY_MS) return { text: `${Math.floor(elapsed / HOUR_MS)}h ago`, occupied: false };
  return { text: `${Math.floor(elapsed / DAY_MS)}d ago`, occupied: false };
}

export function comparePresence(a: AreaPresenceInfo, b: AreaPresenceInfo): number {
  if (a.occupied !== b.occupied) return a.occupied ? -1 : 1;
  if (a.lastChangedMs === b.lastChangedMs) return 0;
  if (a.lastChangedMs === null) return 1;
  if (b.lastChangedMs === null) return -1;
  return b.lastChangedMs - a.lastChangedMs;
}
