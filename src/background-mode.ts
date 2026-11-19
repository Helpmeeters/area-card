export const BACKGROUND_MODE_KEY_PREFIX = "area-card-background:";

export function backgroundModeKey(areaId: string): string {
  return `${BACKGROUND_MODE_KEY_PREFIX}${areaId}`;
}

export type AreaBackgroundMode =
  | { mode: "light-tint" }
  | { mode: "area-picture" }
  | { mode: "camera"; entityId: string };

const DEFAULT_BACKGROUND: AreaBackgroundMode = { mode: "light-tint" };

export function parseAreaBackground(raw: unknown): AreaBackgroundMode {
  let value: unknown = raw;
  if (typeof raw === "string") {
    if (raw === "light-tint") return { mode: "light-tint" };
    if (raw === "area-picture") return { mode: "area-picture" };
    if (raw.length === 0) return { ...DEFAULT_BACKGROUND };
    try {
      value = JSON.parse(raw);
    } catch {
      return { ...DEFAULT_BACKGROUND };
    }
  }

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ...DEFAULT_BACKGROUND };
  }

  const record = value as { mode?: unknown; entityId?: unknown };
  if (record.mode === "light-tint") return { mode: "light-tint" };
  if (record.mode === "area-picture") return { mode: "area-picture" };
  if (record.mode === "camera" && typeof record.entityId === "string" && record.entityId.length > 0) {
    return { mode: "camera", entityId: record.entityId };
  }

  return { ...DEFAULT_BACKGROUND };
}

export function serializeAreaBackground(bg: AreaBackgroundMode): unknown {
  if (bg.mode === "area-picture") return { mode: "area-picture" };
  if (bg.mode === "camera" && typeof bg.entityId === "string" && bg.entityId.length > 0) {
    return { mode: "camera", entityId: bg.entityId };
  }
  return { mode: "light-tint" };
}

export function areaBackgroundEqual(a: AreaBackgroundMode, b: AreaBackgroundMode): boolean {
  if (a.mode !== b.mode) return false;
  if (a.mode === "camera" && b.mode === "camera") return a.entityId === b.entityId;
  return true;
}
