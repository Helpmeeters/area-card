/**
 * Parsing and serialization stay pure. Persistence is Home Assistant frontend
 * user data in user-data.ts.
 */
export const PINNED_KEY_PREFIX = "area-card-pinned:";

const SECTION_TITLE = "custom:area-card-section-title";
const LIGHT_ROW = "custom:area-card-light-row";

export function pinnedKey(areaId: string): string {
  return `${PINNED_KEY_PREFIX}${areaId}`;
}

export type PinMode = "hidden" | "always" | "when-on";

/** Always pins and while-on pins. An id is in at most one list. */
export interface AreaPins {
  always: string[];
  whenOn: string[];
  /** @deprecated Legacy camera background list; kept optional for compatibility. */
  background?: string[];
  /** Unified display order across `always` and `whenOn`. */
  order?: string[];
}

const ENTITY_CYCLE: readonly PinMode[] = ["hidden", "always", "when-on"];

type StoredMode = "always" | "when-on";
type LegacyStoredMode = StoredMode | "background";

function emptyPins(): AreaPins {
  return { always: [], whenOn: [], background: [] };
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) return false;
  }
  return true;
}

function list(ids: readonly string[] | undefined): string[] {
  return ids ? [...ids] : [];
}

export function isCameraEntity(entityId: string): boolean {
  return entityId.split(".")[0] === "camera";
}

function legacyPinEntry(entry: unknown): { id: string; mode: LegacyStoredMode } | null {
  if (typeof entry === "string") return entry.length > 0 ? { id: entry, mode: "always" } : null;
  if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return null;
  const id = (entry as { id?: unknown }).id;
  const mode = (entry as { mode?: unknown }).mode;
  if (typeof id !== "string" || id.length === 0) return null;
  if (mode === "when-on" || mode === "always" || mode === "background") return { id, mode };
  return null;
}

function pinEntry(entry: unknown): { id: string; mode: StoredMode } | null {
  const parsed = legacyPinEntry(entry);
  if (!parsed || parsed.mode === "background") return null;
  return { id: parsed.id, mode: parsed.mode };
}

function parseRawArray(raw: unknown): unknown[] | null {
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    if (raw.length === 0) return null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return Array.isArray(parsed) ? parsed : null;
}

/**
 * Extracts a legacy `{ id, mode: "background" }` camera entry from a stored
 * pin array, if its final mode in the array is `"background"`.
 */
export function legacyBackgroundCamera(raw: unknown): string | null {
  const parsed = parseRawArray(raw);
  if (!parsed) return null;
  const modes = new Map<string, LegacyStoredMode>();
  const order: string[] = [];
  for (const entry of parsed) {
    const pin = legacyPinEntry(entry);
    if (!pin) continue;
    if (!modes.has(pin.id)) order.push(pin.id);
    modes.set(pin.id, pin.mode);
  }
  for (const id of order) {
    if (modes.get(id) === "background") return id;
  }
  return null;
}

/**
 * A JSON string is parsed, then treated like an array. An already-parsed array
 * uses the same rules. Strings are always-pins. `{ id, mode: "when-on" | "always" }`
 * is a pin object. Legacy `{ id, mode: "background" }` entries are ignored here
 * (use `legacyBackgroundCamera` for migration). The last entry for an id wins,
 * in first-seen order, and that id stays in only one list. Null, undefined, bad
 * JSON, and non-arrays are empty.
 */
export function parseAreaPins(raw: unknown): AreaPins {
  const parsed = parseRawArray(raw);
  if (!parsed) return emptyPins();
  const modes = new Map<string, StoredMode>();
  const order: string[] = [];
  for (const entry of parsed) {
    const pin = pinEntry(entry);
    if (!pin) continue;
    if (!modes.has(pin.id)) order.push(pin.id);
    modes.set(pin.id, pin.mode);
  }
  const pins = emptyPins();
  const pinOrder: string[] = [];
  for (const id of order) {
    const mode = modes.get(id);
    if (mode === "when-on") {
      pins.whenOn.push(id);
      pinOrder.push(id);
    } else {
      pins.always.push(id);
      pinOrder.push(id);
    }
  }
  if (!sameIds(pinOrder, [...pins.always, ...pins.whenOn])) pins.order = pinOrder;
  return pins;
}

/** Unified display order across `always` and `whenOn` (excluding `background`). */
export function pinnedOrder(pins: Pick<AreaPins, "always" | "whenOn" | "order">): string[] {
  const valid = new Set([...pins.always, ...pins.whenOn]);
  const seen = new Set<string>();
  const result: string[] = [];
  if (pins.order) {
    for (const id of pins.order) {
      if (valid.has(id) && !seen.has(id)) {
        seen.add(id);
        result.push(id);
      }
    }
  }
  for (const id of pins.always) {
    if (!seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  }
  for (const id of pins.whenOn) {
    if (!seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  }
  return result;
}

/** Stored pin value. Strings only when every pin is always. */
export function serializeAreaPins(
  pins: AreaPins,
): Array<string | { id: string; mode: "when-on" }> {
  const ordered = pinnedOrder(pins);
  const whenOnSet = new Set(list(pins.whenOn));
  if (whenOnSet.size === 0) return ordered;
  return ordered.map((id) => (whenOnSet.has(id) ? { id, mode: "when-on" as const } : id));
}

/** Always or while on. Anything else is hidden. */
export function pinMode(pins: AreaPins, entityId: string): PinMode {
  if (pins.always.includes(entityId)) return "always";
  if (pins.whenOn.includes(entityId)) return "when-on";
  return "hidden";
}

/** All entities (including cameras) share the same pin mode choices. */
export function pinModeChoices(_entityId: string): readonly PinMode[] {
  return ENTITY_CYCLE;
}

/**
 * Move one entity to `mode`, leaving every other id where it is.
 * The input is not changed.
 */
export function setPinMode(pins: AreaPins, entityId: string, mode: PinMode): AreaPins {
  const prevOrder = pinnedOrder(pins);
  const always = pins.always.filter((id) => id !== entityId);
  const whenOn = pins.whenOn.filter((id) => id !== entityId);
  const next = ENTITY_CYCLE.includes(mode) ? mode : "hidden";
  let order: string[];
  if (next === "always" || next === "when-on") {
    if (next === "always") always.push(entityId);
    else whenOn.push(entityId);
    order = prevOrder.includes(entityId) ? prevOrder : [...prevOrder, entityId];
  } else {
    order = prevOrder.filter((id) => id !== entityId);
  }
  const result: AreaPins = { always, whenOn, background: [] };
  if (!sameIds(order, [...always, ...whenOn])) result.order = order;
  return result;
}

/** Reorder `always` and `whenOn` pins according to `nextOrder`. Any missing pinned ids are appended. */
export function reorderPins(pins: AreaPins, nextOrder: readonly string[]): AreaPins {
  const alwaysSet = new Set(pins.always);
  const whenOnSet = new Set(pins.whenOn);
  const order = pinnedOrder({ always: pins.always, whenOn: pins.whenOn, order: [...nextOrder] });
  const always = order.filter((id) => alwaysSet.has(id));
  const whenOn = order.filter((id) => whenOnSet.has(id));
  const result: AreaPins = { always, whenOn, background: [] };
  if (!sameIds(order, [...always, ...whenOn])) result.order = order;
  return result;
}

/**
 * Entities walk hidden, always, while on, then hidden.
 */
export function cyclePin(pins: AreaPins, entityId: string): AreaPins {
  const order = pinModeChoices(entityId);
  const index = order.indexOf(pinMode(pins, entityId));
  const next = order[((index === -1 ? 0 : index) + 1) % order.length];
  return setPinMode(pins, entityId, next);
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Entity id a popup row can be pinned by.
 * Section titles and the Status chips card are not rows. A light row pins its inner card.
 */
export function pinEntityId(config: Record<string, unknown> | null | undefined): string | null {
  if (!config) return null;
  const type = config.type;
  if (type === SECTION_TITLE) return null;
  if (typeof type === "string" && type.endsWith("chips-card")) return null;
  if (type === LIGHT_ROW) {
    const card = config.card;
    if (typeof card !== "object" || card === null) return null;
    return nonEmptyString((card as Record<string, unknown>).entity);
  }
  return nonEmptyString(config.entity);
}

/** Stored pin order, original card objects, first entity id only. */
export function selectPinnedCards(
  cards: readonly Record<string, unknown>[],
  pinned: readonly string[],
): Record<string, unknown>[] {
  const byId = new Map<string, Record<string, unknown>>();
  for (const card of cards) {
    const id = pinEntityId(card);
    if (!id || byId.has(id)) continue;
    byId.set(id, card);
  }
  const seen = new Set<string>();
  const selected: Record<string, unknown>[] = [];
  for (const id of pinned) {
    if (seen.has(id)) continue;
    const card = byId.get(id);
    if (!card) continue;
    seen.add(id);
    selected.push(card);
  }
  return selected;
}

/**
 * How a pinned card is drawn under the area button.
 * `half` shares a row. `expanded-full` is a half-width card stretched because
 * it has no partner. `full` was already full width and stays on its own row.
 */
export type PinnedLayoutWidth = "half" | "expanded-full" | "full";

export interface PinnedLayoutCard {
  config: Record<string, unknown>;
  width: PinnedLayoutWidth;
}

export interface PinnedLayoutRow {
  cards: PinnedLayoutCard[];
}

/** Where a pinned card sits against the area button and the other pinned cards. */
export interface PinnedEdge {
  first: boolean;
  last: boolean;
  left: boolean;
  right: boolean;
}

/**
 * Square every corner that meets the area button or another pinned card.
 * Outer bottom corners are omitted so each bottom card keeps its own radius.
 * A pill radius on the stack clips a tall card.
 */
export function pinnedEdgeRadius(edge: PinnedEdge): string {
  const parts = [
    "border-top-left-radius:0 !important",
    "border-top-right-radius:0 !important",
  ];
  if (!(edge.last && edge.left)) parts.push("border-bottom-left-radius:0 !important");
  if (!(edge.last && edge.right)) parts.push("border-bottom-right-radius:0 !important");
  return parts.join(";");
}

function pinnedBody(config: Record<string, unknown>): Record<string, unknown> {
  if (config.type !== LIGHT_ROW) return config;
  const card = config.card;
  if (typeof card !== "object" || card === null || Array.isArray(card)) return config;
  return card as Record<string, unknown>;
}

function gridRows(config: Record<string, unknown>): unknown {
  const grid = config.grid_options;
  if (typeof grid !== "object" || grid === null || Array.isArray(grid)) return undefined;
  return (grid as { rows?: unknown }).rows;
}

function controlFlag(config: Record<string, unknown>, key: string): boolean {
  return config[key] === true;
}

/**
 * Two visual rows under the name.
 * A dimmable light or a cover with its control, or a card that declares
 * `grid_options.rows === 2`. A light row is judged by the card inside it.
 */
export function isDoubleTallPinnedCard(config: Record<string, unknown>): boolean {
  const body = pinnedBody(config);
  if (gridRows(config) === 2 || (body !== config && gridRows(body) === 2)) return true;
  const type = body.type;
  if (typeof type !== "string") return false;
  if (type.endsWith("light-card")) {
    return (
      controlFlag(body, "show_brightness_control") ||
      controlFlag(body, "show_color_temp_control") ||
      controlFlag(body, "show_color_control")
    );
  }
  if (type.endsWith("cover-card")) {
    return (
      controlFlag(body, "show_position_control") ||
      controlFlag(body, "show_buttons_control") ||
      controlFlag(body, "show_tilt_position_control")
    );
  }
  return false;
}

/**
 * Half-width, double-tall, and stretched because it has no partner.
 * A paired half and a card that was already full width stay stacked.
 */
export function pinnedRowsSideBySide(config: Record<string, unknown>, width: PinnedLayoutWidth): boolean {
  return width === "expanded-full" && isDoubleTallPinnedCard(config);
}

/**
 * Name row and control row as two equal columns, one row tall.
 * A single slotted row still fills the card. Controls stay visible.
 */
export function pinnedSideBySideStyles(): string {
  return [
    ".container {",
    "  flex-direction: row !important;",
    "  flex-wrap: nowrap !important;",
    "  align-items: center !important;",
    "  overflow: visible !important;",
    "}",
    ".container > ::slotted(area-card-mushroom-state-item),",
    ".container > ::slotted(.actions) {",
    "  flex: 1 1 0% !important;",
    "  min-width: 0 !important;",
    "  max-width: none !important;",
    "  overflow: visible !important;",
    "}",
    ".container > ::slotted(.actions) {",
    "  padding-top: 0 !important;",
    "  padding-bottom: 0 !important;",
    "  padding-left: 0 !important;",
    "  --control-spacing: var(--spacing);",
    "  --control-height: var(--icon-size);",
    "}",
  ].join("\n");
}

/** Keeps the slider and buttons from being clipped by the card that owns them. */
export function pinnedSideBySideHostStyles(): string {
  return [
    "ha-card {",
    "  overflow: visible !important;",
    "  height: auto !important;",
    "}",
    "area-card-mushroom-state-item {",
    "  flex: 1 1 0% !important;",
    "  min-width: 0 !important;",
    "  max-width: none !important;",
    "}",
    ".actions {",
    "  overflow: visible !important;",
    "  flex: 1 1 0% !important;",
    "  min-width: 0 !important;",
    "  max-width: none !important;",
    "  align-items: center !important;",
    "  padding-top: 0 !important;",
    "  padding-bottom: 0 !important;",
    "  padding-left: 0 !important;",
    "  --control-spacing: var(--spacing);",
    "  --control-height: var(--icon-size);",
    "}",
  ].join("\n");
}

/**
 * Two columns for a card whose rows are direct children of ha-card.
 * A third block wraps instead of becoming another column.
 */
export function pinnedSideBySideGridStyles(): string {
  return [
    "ha-card {",
    "  display: grid !important;",
    "  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) !important;",
    "  grid-auto-flow: row !important;",
    "  align-items: center !important;",
    "  overflow: visible !important;",
    "  height: auto !important;",
    "}",
    "ha-card > * {",
    "  min-width: 0 !important;",
    "  overflow: visible !important;",
    "}",
  ].join("\n");
}

/** Half of a Bubble popup row. Anything else, including a missing grid, is full width. */
function isHalfWidthPinnedCard(config: Record<string, unknown>): boolean {
  const grid = config.grid_options;
  if (typeof grid !== "object" || grid === null || Array.isArray(grid)) return false;
  return (grid as { columns?: unknown }).columns === 6;
}

/**
 * Pack pinned cards for the collapsed stack, in popup order.
 * Each half-width card pairs with the next unpaired half-width card on one row,
 * even across full-width cards, so two half-width cards do not flank a full-width
 * card alone. A full-width card takes its own row. A half left without a partner
 * expands. Card objects are returned as-is so the popup keeps `grid_options.columns === 6`.
 */
export function layoutPinnedCards(cards: readonly Record<string, unknown>[]): PinnedLayoutRow[] {
  const rows: PinnedLayoutRow[] = [];
  const consumed = new Array<boolean>(cards.length).fill(false);
  for (let index = 0; index < cards.length; index += 1) {
    if (consumed[index]) continue;
    const config = cards[index];
    if (!isHalfWidthPinnedCard(config)) {
      rows.push({ cards: [{ config, width: "full" }] });
      continue;
    }
    let partnerIndex = -1;
    for (let lookahead = index + 1; lookahead < cards.length; lookahead += 1) {
      if (!consumed[lookahead] && isHalfWidthPinnedCard(cards[lookahead])) {
        partnerIndex = lookahead;
        break;
      }
    }
    if (partnerIndex !== -1) {
      consumed[partnerIndex] = true;
      rows.push({
        cards: [
          { config, width: "half" },
          { config: cards[partnerIndex], width: "half" },
        ],
      });
    } else {
      rows.push({ cards: [{ config, width: "expanded-full" }] });
    }
  }
  return rows;
}
