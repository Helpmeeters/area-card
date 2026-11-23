/**
 * Split icon-tap from row-tap on Mushroom cards (`area-card-mushroom-*`).
 *
 * Mushroom's template card supports `icon_tap_action` separately from `tap_action`,
 * while its entity-specific cards (light, entity, cover, climate, humidifier) bind
 * a single `tap_action` to `<area-card-mushroom-state-item>`. This patch tracks
 * whether the pointer interaction hit the icon slot on `<area-card-mushroom-state-item>`
 * and routes that action to `icon_*_action` when configured, leaving the rest of the
 * row (title, state, whitespace) to run `tap_action` (e.g. `more-info`).
 */

export const MUSHROOM_STATE_ITEM_TAG = "area-card-mushroom-state-item";

export const MUSHROOM_ICON_ACTION_CARD_TAGS = [
  "area-card-mushroom-light-card",
  "area-card-mushroom-entity-card",
  "area-card-mushroom-cover-card",
  "area-card-mushroom-climate-card",
  "area-card-mushroom-humidifier-card",
] as const;

const STATE_ITEM_PATCHED = Symbol.for("area-card.mushroom-state-item-icon-action.patched");
const STATE_ITEM_BOUND = Symbol.for("area-card.mushroom-state-item-icon-action.bound");
const LAST_ICON_TARGET = Symbol.for("area-card.mushroom-state-item-icon-action.last-icon-target");
const CARD_PATCHED = Symbol.for("area-card.mushroom-card-icon-action.patched");

export interface StateItemLike {
  firstUpdated?: (changed: unknown) => void;
  updated?: (changed: unknown) => void;
  connectedCallback?: () => void;
  addEventListener: (type: string, listener: (event: Event) => void, options?: boolean | AddEventListenerOptions) => void;
  [STATE_ITEM_PATCHED]?: boolean;
  [STATE_ITEM_BOUND]?: boolean;
  [LAST_ICON_TARGET]?: boolean;
}

export interface ActionCardLike {
  _config?: Record<string, unknown>;
  shadowRoot?: { querySelector?: (selector: string) => unknown } | null;
  _handleAction?: (event: CustomEvent<{ action?: string }>) => unknown;
  dispatchEvent: (event: Event) => boolean;
  [CARD_PATCHED]?: boolean;
}

interface ElementLike {
  getAttribute?: (name: string) => string | null;
  classList?: { contains?: (cls: string) => boolean };
  closest?: (selector: string) => unknown;
}

function isElementLike(node: unknown): node is ElementLike {
  return Boolean(node && typeof node === "object" && "getAttribute" in node);
}

/** True when an event's target or composed path hits the icon/badge slot of a state item. */
export function eventTargetsIcon(event: Event): boolean {
  const path = typeof event.composedPath === "function" ? event.composedPath() : [];
  for (const node of path) {
    if (!isElementLike(node)) continue;
    const slot = node.getAttribute?.("slot");
    if (slot === "icon" || slot === "badge") return true;
    if (slot === "info") return false;
    if (node.classList?.contains?.("icon")) return true;
    if (node.classList?.contains?.("info")) return false;
  }
  const target = event.target;
  if (isElementLike(target) && typeof target.closest === "function") {
    return Boolean(target.closest('[slot="icon"], [slot="badge"], .icon'));
  }
  return false;
}

export function hasIconActions(config: Record<string, unknown> | undefined): boolean {
  if (!config) return false;
  return (
    config.icon_tap_action !== undefined ||
    config.icon_hold_action !== undefined ||
    config.icon_double_tap_action !== undefined
  );
}

export function buildIconActionConfig(config: Record<string, unknown>): Record<string, unknown> {
  return {
    ...config,
    tap_action: config.icon_tap_action ?? config.tap_action,
    hold_action: config.icon_hold_action ?? config.hold_action,
    double_tap_action: config.icon_double_tap_action ?? config.double_tap_action,
  };
}

function bindStateItemTracking(el: StateItemLike): void {
  if (el[STATE_ITEM_BOUND]) return;
  el[STATE_ITEM_BOUND] = true;
  const recordPointer = (event: Event) => {
    el[LAST_ICON_TARGET] = eventTargetsIcon(event);
  };
  const clearPointer = () => {
    el[LAST_ICON_TARGET] = false;
  };
  el.addEventListener("pointerdown", recordPointer, true);
  el.addEventListener("mousedown", recordPointer, true);
  el.addEventListener("touchstart", recordPointer, { capture: true, passive: true });
  el.addEventListener("click", recordPointer, true);
  el.addEventListener("keydown", clearPointer, true);
}

export function patchMushroomStateItemPrototype(proto: StateItemLike): boolean {
  if (proto[STATE_ITEM_PATCHED]) return false;
  // Note: browsers snapshot `connectedCallback` at `customElements.define()` time,
  // so patching `connectedCallback` after definition is ignored by the CE engine.
  // Patching LitElement's `firstUpdated` / `updated` (and `connectedCallback` for
  // any non-Lit mocks) ensures tracking binds on every rendered state-item.
  const origFirstUpdated = proto.firstUpdated;
  proto.firstUpdated = function (this: StateItemLike, changed: unknown) {
    bindStateItemTracking(this);
    return origFirstUpdated?.call(this, changed);
  };
  const origUpdated = proto.updated;
  proto.updated = function (this: StateItemLike, changed: unknown) {
    bindStateItemTracking(this);
    return origUpdated?.call(this, changed);
  };
  const origConnected = proto.connectedCallback;
  proto.connectedCallback = function (this: StateItemLike) {
    bindStateItemTracking(this);
    return origConnected?.call(this);
  };
  proto[STATE_ITEM_PATCHED] = true;
  return true;
}

function findStateItem(card: ActionCardLike, event: Event): StateItemLike | undefined {
  const current = event.currentTarget as StateItemLike | null | undefined;
  if (current && typeof current === "object" && LAST_ICON_TARGET in current) {
    return current;
  }
  const fromShadow = card.shadowRoot?.querySelector?.(MUSHROOM_STATE_ITEM_TAG) as StateItemLike | null | undefined;
  return fromShadow ?? undefined;
}

export function patchMushroomCardActionPrototype(proto: ActionCardLike): boolean {
  if (proto[CARD_PATCHED]) return false;
  const origHandleAction = proto._handleAction;
  if (typeof origHandleAction !== "function") return false;

  proto._handleAction = function (this: ActionCardLike, event: CustomEvent<{ action?: string }>) {
    const config = this._config;
    if (hasIconActions(config)) {
      const stateItem = findStateItem(this, event);
      const fromIcon = stateItem?.[LAST_ICON_TARGET] === true || eventTargetsIcon(event);
      if (fromIcon) {
        const iconConfig = buildIconActionConfig(config!);
        const detail = { config: iconConfig, action: event.detail?.action };
        const actionEvent =
          typeof CustomEvent === "function"
            ? new CustomEvent("hass-action", { bubbles: true, composed: true, detail })
            : Object.assign(new Event("hass-action", { bubbles: true, composed: true }), { detail });
        this.dispatchEvent(actionEvent);
        return;
      }
    }
    return origHandleAction.call(this, event);
  };

  proto[CARD_PATCHED] = true;
  return true;
}

export function patchMushroomIconActions(): void {
  if (typeof customElements === "undefined") return;
  const stateItemCtor = customElements.get(MUSHROOM_STATE_ITEM_TAG);
  if (stateItemCtor?.prototype) {
    patchMushroomStateItemPrototype(stateItemCtor.prototype as StateItemLike);
  }
  for (const tag of MUSHROOM_ICON_ACTION_CARD_TAGS) {
    const ctor = customElements.get(tag);
    if (ctor?.prototype) {
      patchMushroomCardActionPrototype(ctor.prototype as ActionCardLike);
    }
  }
}

/** Patch immediately if already defined, or as soon as Mushroom defines each element. */
export function installMushroomIconActions(): void {
  if (typeof customElements === "undefined") return;
  patchMushroomIconActions();
  if (!customElements.get(MUSHROOM_STATE_ITEM_TAG)) {
    void customElements.whenDefined(MUSHROOM_STATE_ITEM_TAG).then(() => {
      patchMushroomIconActions();
    });
  }
  for (const tag of MUSHROOM_ICON_ACTION_CARD_TAGS) {
    if (!customElements.get(tag)) {
      void customElements.whenDefined(tag).then(() => {
        patchMushroomIconActions();
      });
    }
  }
}
