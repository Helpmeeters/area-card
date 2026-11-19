import { areaPresenceInfo, comparePresence } from "./presence";
import { classifyArea, type AreaEntry, type ClassifierHass } from "./sections";

/** Registry order, which is hass.floors key order. Do not sort. */
export function floorIds(hass: ClassifierHass): string[] | undefined {
  if (!hass.floors) return undefined;
  return Object.keys(hass.floors);
}

export function floorDisplay(
  hass: ClassifierHass,
  floorId: string,
): { name: string; icon: string | null } {
  const floor = hass.floors?.[floorId];
  const icon = floor?.icon;
  return {
    name: floor?.name || floorId,
    icon: icon ? icon : null,
  };
}

export interface AreaRef {
  areaId: string;
  name: string;
}

export function areasOnFloor(
  hass: ClassifierHass,
  floorId: string,
  sortByPresence = false,
): AreaRef[] {
  if (!hass.areas) return [];
  const refs = (Object.entries(hass.areas) as [string, AreaEntry][])
    .filter(([, area]) => area?.floor_id === floorId)
    .map(([areaId, area]) => ({ areaId, name: area?.name || areaId }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.areaId.localeCompare(b.areaId));

  if (!sortByPresence || refs.length <= 1) return refs;

  const states = hass.states ?? {};
  return refs
    .map((ref) => ({
      ref,
      presence: areaPresenceInfo(classifyArea(hass, ref.areaId).occupancy, states),
    }))
    .sort(
      (a, b) =>
        comparePresence(a.presence, b.presence) ||
        a.ref.name.localeCompare(b.ref.name) ||
        a.ref.areaId.localeCompare(b.ref.areaId),
    )
    .map((entry) => entry.ref);
}

export function areasOnFloorByPresence(hass: ClassifierHass, floorId: string): AreaRef[] {
  return areasOnFloor(hass, floorId, true);
}

export function floorsSortedByPresence(
  hass: ClassifierHass,
  sortByPresence = true,
): string[] | undefined {
  const ids = floorIds(hass);
  if (!ids || !sortByPresence || ids.length <= 1) return ids;

  const states = hass.states ?? {};
  return ids
    .map((floorId, index) => {
      const occupancy = areasOnFloor(hass, floorId).flatMap(
        (area) => classifyArea(hass, area.areaId).occupancy,
      );
      return {
        floorId,
        index,
        presence: areaPresenceInfo(occupancy, states),
      };
    })
    .sort((a, b) => comparePresence(a.presence, b.presence) || a.index - b.index)
    .map((entry) => entry.floorId);
}
