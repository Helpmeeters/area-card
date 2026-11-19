/**
 * Bubble's standalone popup takes the nearest `hui-card` out of the layout
 * while it is open (`position: absolute`) and hides that row when it closes
 * (`display: none`). A room popup is rendered inside the floor card, so that
 * row is the whole floor. Bubble already skips this for
 * `vertical-stack-in-card`. The floor card reports the same type.
 */
export const BUBBLE_SHARED_STACK_TYPE = "custom:vertical-stack-in-card";

export interface FloorRuntimeConfig {
  floor: string;
  type: typeof BUBBLE_SHARED_STACK_TYPE;
  sortByPresence: boolean;
  collapsedAreas: number;
}

export function floorRuntimeConfig(
  floor: string,
  options?: { sortByPresence?: boolean; collapsedAreas?: number },
): FloorRuntimeConfig {
  const sortByPresence = parseFloorSortByPresence(options?.sortByPresence, true);
  const collapsedAreas = parseFloorCollapsedAreas(options?.collapsedAreas, 0);
  return {
    floor,
    type: BUBBLE_SHARED_STACK_TYPE,
    sortByPresence,
    collapsedAreas,
  };
}

export const FLOOR_EXPANDED_KEY_PREFIX = "area-card-floor-expanded:";
export const FLOOR_COLLAPSED_AREAS_KEY_PREFIX = "area-card-floor-collapsed-areas:";
export const FLOOR_SORT_BY_PRESENCE_KEY_PREFIX = "area-card-floor-sort-presence:";

export function floorExpandedKey(floorId: string): string {
  return `${FLOOR_EXPANDED_KEY_PREFIX}${floorId}`;
}

export function floorCollapsedAreasKey(floorId: string): string {
  return `${FLOOR_COLLAPSED_AREAS_KEY_PREFIX}${floorId}`;
}

export function floorSortByPresenceKey(floorId: string): string {
  return `${FLOOR_SORT_BY_PRESENCE_KEY_PREFIX}${floorId}`;
}

export function parseFloorCollapsedAreas(value: unknown, fallback = 0): number {
  const num =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.floor(num));
}

export function parseFloorSortByPresence(value: unknown, fallback = true): boolean {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return fallback;
}

/** Missing or unrecognized values keep the card's default, which is expanded. */
export function parseFloorExpanded(stored: string | null | undefined, fallback = true): boolean {
  if (stored === "true") return true;
  if (stored === "false") return false;
  return fallback;
}

export function readFloorExpanded(storage: Pick<Storage, "getItem"> | undefined, floorId: string): boolean {
  if (!storage) return true;
  try {
    return parseFloorExpanded(storage.getItem(floorExpandedKey(floorId)));
  } catch {
    return true;
  }
}

export function writeFloorExpanded(
  storage: Pick<Storage, "setItem"> | undefined,
  floorId: string,
  expanded: boolean,
): void {
  if (!storage) return;
  try {
    storage.setItem(floorExpandedKey(floorId), expanded ? "true" : "false");
  } catch {
    // A blocked or full localStorage should not stop the chevron from toggling.
  }
}

