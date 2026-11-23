import { pinEntityId } from "./pinned-entities";
import type { ClassifierHass, EntityState, RegistryEntry } from "./sections";
import { BUBBLE_CARDS_GRID } from "./tags";

const STYLE_ID = "area-card-entity-edit-style";
const PAD_STYLE_ID = "area-card-entity-edit-pad";
/** Shared class for both page-link and settings-dialog pencils. */
export const ENTITY_EDIT_CLASS = "area-card-entity-edit";

/** @deprecated Use ENTITY_EDIT_CLASS. Kept for older tests/callers. */
export const AUTOMATION_EDIT_CLASS = ENTITY_EDIT_CLASS;

/** Space that would be reserved if the pencil stayed visible; hover-only overlays instead. */
export const ENTITY_EDIT_RESERVE = 36;
/** @deprecated Use ENTITY_EDIT_RESERVE. */
export const AUTOMATION_EDIT_RESERVE = ENTITY_EDIT_RESERVE;

const MANUAL_HELPER_PLATFORMS = new Set([
  "group",
  "template",
  "threshold",
  "switch_as_x",
  "input_boolean",
  "input_select",
  "input_number",
  "input_text",
  "input_datetime",
  "input_button",
  "timer",
  "counter",
  "schedule",
  "min_max",
  "derivative",
  "integration",
  "utility_meter",
  "statistics",
  "tod",
  "trend",
  "bayesian",
  "generic_thermostat",
  "generic_hygrostat",
  "mold_indicator",
  "random",
  "filter",
  "history_stats",
  "combine",
]);

const MANUAL_HELPER_DOMAINS = new Set([
  "input_boolean",
  "input_select",
  "input_number",
  "input_text",
  "input_datetime",
  "input_button",
  "timer",
  "counter",
  "schedule",
]);

export type EntityEditTarget =
  | { kind: "link"; path: string; label: string }
  | { kind: "settings"; entityId: string; label: string };

export function automationEditPath(state: EntityState | undefined): string | null {
  const id = state?.attributes?.id;
  if (typeof id !== "string" || id.trim() === "") return null;
  return `/config/automation/edit/${encodeURIComponent(id)}`;
}

export function scriptEditPath(entityId: string, entry?: RegistryEntry | null): string | null {
  if (!entityId.startsWith("script.")) return null;
  const unique = entry?.unique_id;
  const objectId =
    typeof unique === "string" && unique.trim() !== ""
      ? unique.trim()
      : entityId.slice("script.".length);
  if (!objectId) return null;
  return `/config/script/edit/${encodeURIComponent(objectId)}`;
}

export function sceneEditPath(state: EntityState | undefined): string | null {
  const id = state?.attributes?.id;
  if (typeof id !== "string" || id.trim() === "") return null;
  return `/config/scene/edit/${encodeURIComponent(id)}`;
}

/** Resolves a full-page editor link or a Settings-dialog target for manually created entities. */
export function entityEditTarget(entityId: string, hass: ClassifierHass): EntityEditTarget | null {
  if (!entityId || hass.user?.is_admin === false) return null;
  const state = hass.states?.[entityId];
  const name = friendlyName(state, entityId);
  const label = `Edit ${name}`;
  const domain = entityId.split(".")[0] ?? "";

  if (domain === "automation") {
    const path = automationEditPath(state);
    return path ? { kind: "link", path, label } : null;
  }
  if (domain === "script") {
    const path = scriptEditPath(entityId, registryEntry(hass, entityId));
    return path ? { kind: "link", path, label } : null;
  }
  if (domain === "scene") {
    const path = sceneEditPath(state);
    return path ? { kind: "link", path, label } : null;
  }

  const entry = registryEntry(hass, entityId);
  if (entry?.device_id) return null;
  const platform = typeof entry?.platform === "string" ? entry.platform : "";
  if (MANUAL_HELPER_PLATFORMS.has(platform) || MANUAL_HELPER_DOMAINS.has(domain)) {
    return { kind: "settings", entityId, label };
  }
  return null;
}

export function entityEditStyles(): string {
  return [
    `.${BUBBLE_CARDS_GRID} > .card:has(> .${ENTITY_EDIT_CLASS}),`,
    `[data-pin-entity]:not(.area-card-pin-switch):has(> .${ENTITY_EDIT_CLASS}) {`,
    "  position: relative;",
    "}",
    `.${ENTITY_EDIT_CLASS} {`,
    "  position: absolute;",
    "  right: 8px;",
    "  top: 14px;",
    "  z-index: 3;",
    "  display: inline-flex;",
    "  align-items: center;",
    "  justify-content: center;",
    "  box-sizing: border-box;",
    "  width: 32px;",
    "  height: 32px;",
    "  padding: 0;",
    "  border: none;",
    "  border-radius: 8px;",
    "  background: transparent;",
    "  color: var(--secondary-text-color);",
    "  text-decoration: none;",
    "  cursor: pointer;",
    "  --mdc-icon-size: 18px;",
    "}",
    `@media (hover: hover) {`,
    `  .${ENTITY_EDIT_CLASS} {`,
    "    opacity: 0;",
    "    pointer-events: none;",
    "  }",
    `  .${BUBBLE_CARDS_GRID} > .card:hover > .${ENTITY_EDIT_CLASS},`,
    `  .${BUBBLE_CARDS_GRID} > .card:focus-within > .${ENTITY_EDIT_CLASS},`,
    `  [data-pin-entity]:not(.area-card-pin-switch):hover > .${ENTITY_EDIT_CLASS},`,
    `  [data-pin-entity]:not(.area-card-pin-switch):focus-within > .${ENTITY_EDIT_CLASS},`,
    `  .${ENTITY_EDIT_CLASS}:focus-visible {`,
    "    opacity: 1;",
    "    pointer-events: auto;",
    "  }",
    "}",
    `.${ENTITY_EDIT_CLASS}:hover,`,
    `.${ENTITY_EDIT_CLASS}:focus-visible {`,
    "  color: var(--primary-text-color);",
    "  background: color-mix(in srgb, var(--primary-text-color) 8%, transparent);",
    "}",
  ].join("\n");
}

/** @deprecated Use entityEditStyles. */
export function automationEditStyles(): string {
  return entityEditStyles();
}

export interface SyncEntityEditOptions {
  editing?: boolean;
  disabled?: boolean;
  styleRoot?: ParentNode;
}

/** @deprecated Use SyncEntityEditOptions. */
export type SyncAutomationEditOptions = SyncEntityEditOptions;

/**
 * Floats an edit pencil on manually created entities (automations, scripts, scenes,
 * helpers/groups). Hover-only on fine pointers. Hidden in popup edit mode and demo mode.
 */
export function syncEntityEditControls(
  root: ParentNode,
  hass: ClassifierHass,
  options: SyncEntityEditOptions = {},
): void {
  const styleRoot = options.styleRoot ?? root;
  ensureStyles(styleRoot);
  if (typeof root.querySelectorAll !== "function") return;
  const suppress = options.editing === true || options.disabled === true;

  for (const cell of root.querySelectorAll(`.${BUBBLE_CARDS_GRID} > .card`)) {
    syncHost(cell, entityIdOf(cell), hass, suppress);
  }
  for (const card of root.querySelectorAll("[data-pin-entity]:not(.area-card-pin-switch)")) {
    if (!(card instanceof HTMLElement)) continue;
    if (card.classList.contains("area-card-pin-switch")) continue;
    syncHost(card, card.dataset.pinEntity ?? "", hass, suppress);
  }
}

/** @deprecated Use syncEntityEditControls. */
export function syncAutomationEditLinks(
  root: ParentNode,
  hass: ClassifierHass,
  options: SyncEntityEditOptions = {},
): void {
  syncEntityEditControls(root, hass, options);
}

function syncHost(host: Element, entityId: string, hass: ClassifierHass, suppress: boolean): void {
  const target = suppress ? null : entityEditTarget(entityId, hass);
  if (!target) {
    removeControls(host);
    clearPads(host);
    return;
  }
  const existing = [...host.querySelectorAll(`:scope > .${ENTITY_EDIT_CLASS}`)];
  const wantLink = target.kind === "link";
  const current = existing[0] instanceof HTMLElement ? existing[0] : null;
  const currentTag = current?.localName ?? "";
  const reusable =
    (wantLink && currentTag === "a") || (!wantLink && currentTag === "button") ? current : null;

  let control: HTMLElement;
  if (reusable) {
    control = reusable;
  } else {
    control = wantLink ? document.createElement("a") : document.createElement("button");
    control.className = ENTITY_EDIT_CLASS;
    if (!wantLink) (control as HTMLButtonElement).type = "button";
    const icon = document.createElement("ha-icon");
    icon.setAttribute("icon", "mdi:pencil");
    icon.setAttribute("aria-hidden", "true");
    control.append(icon);
    if (wantLink) bindLink(control as HTMLAnchorElement);
    else bindSettings(control as HTMLButtonElement);
    host.append(control);
  }
  for (const extra of existing) {
    if (extra !== control) extra.remove();
  }

  if (control.getAttribute("aria-label") !== target.label) control.setAttribute("aria-label", target.label);
  if (control.getAttribute("title") !== target.label) control.setAttribute("title", target.label);
  if (target.kind === "link") {
    const link = control as HTMLAnchorElement;
    if (link.getAttribute("href") !== target.path) link.setAttribute("href", target.path);
    delete control.dataset.entityId;
  } else {
    control.dataset.entityId = target.entityId;
    control.removeAttribute("href");
  }
  padHosts(host);
}

function friendlyName(state: EntityState | undefined, entityId: string): string {
  const raw = state?.attributes?.friendly_name;
  if (typeof raw === "string" && raw.trim() !== "") return raw.trim();
  return entityId;
}

function bindLink(link: HTMLAnchorElement): void {
  link.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
  });
  link.addEventListener("click", (event) => {
    event.stopPropagation();
    if (event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const path = link.getAttribute("href");
    if (!path) return;
    event.preventDefault();
    navigateHomeAssistant(path);
  });
}

function bindSettings(button: HTMLButtonElement): void {
  button.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
  });
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    event.preventDefault();
    const entityId = button.dataset.entityId;
    if (!entityId) return;
    openEntitySettings(button, entityId);
  });
}

export function openEntitySettings(host: EventTarget, entityId: string): void {
  const event = new CustomEvent("hass-more-info", {
    bubbles: true,
    composed: true,
    detail: { entityId, view: "settings" },
  });
  if (typeof (host as { dispatchEvent?: unknown }).dispatchEvent === "function") {
    host.dispatchEvent(event);
    return;
  }
  document.dispatchEvent(event);
}

export function navigateHomeAssistant(path: string): void {
  const from = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  window.history.pushState({ from }, "", path);
  window.dispatchEvent(
    new CustomEvent("location-changed", {
      bubbles: true,
      composed: true,
      detail: { replace: false },
    }),
  );
}

function removeControls(host: Element): void {
  for (const node of host.querySelectorAll(`:scope > .${ENTITY_EDIT_CLASS}, :scope > .area-card-automation-edit`)) {
    node.remove();
  }
}

function clearPads(host: Element): void {
  for (const card of cardHosts(host)) {
    const root = card.shadowRoot;
    if (!root) continue;
    root.querySelector(`#${PAD_STYLE_ID}`)?.remove();
  }
}

function padHosts(host: Element): void {
  for (const card of cardHosts(host)) {
    const root = card.shadowRoot;
    if (!root || root.querySelector(`#${PAD_STYLE_ID}`)) continue;
    if (!root.querySelector("ha-card") && !root.querySelector("area-card-mushroom-state-item")) continue;
    const style = document.createElement("style");
    style.id = PAD_STYLE_ID;
    style.textContent = [
      ":host-context(.card:hover) area-card-mushroom-state-item,",
      ":host-context(.card:focus-within) area-card-mushroom-state-item,",
      ":host-context([data-pin-entity]:hover) area-card-mushroom-state-item,",
      ":host-context([data-pin-entity]:focus-within) area-card-mushroom-state-item,",
      ":host-context(.card:hover) ha-card,",
      ":host-context(.card:focus-within) ha-card,",
      ":host-context([data-pin-entity]:hover) ha-card,",
      ":host-context([data-pin-entity]:focus-within) ha-card {",
      "  padding-right: 40px !important;",
      "}",
      "@media (hover: none) {",
      "  area-card-mushroom-state-item,",
      "  ha-card {",
      "    padding-right: 40px !important;",
      "  }",
      "}",
    ].join("\n");
    root.append(style);
  }
}

function cardHosts(host: Element): HTMLElement[] {
  const hosts: HTMLElement[] = [];
  for (const child of host.children) {
    if (!(child instanceof HTMLElement)) continue;
    if (
      child.classList.contains(ENTITY_EDIT_CLASS) ||
      child.classList.contains("area-card-battery-readout") ||
      child.classList.contains("area-card-pin-switch")
    ) {
      continue;
    }
    if (child.localName.includes("-")) hosts.push(child);
  }
  const shadow = host instanceof HTMLElement ? host.shadowRoot : null;
  if (shadow) {
    for (const child of shadow.children) {
      if (child instanceof HTMLElement && child.localName.includes("-")) hosts.push(child);
    }
  }
  return hosts;
}

function entityIdOf(cell: Element): string {
  for (const child of cell.children) {
    if (
      child.classList.contains(ENTITY_EDIT_CLASS) ||
      child.classList.contains("area-card-pin-switch") ||
      child.classList.contains("area-card-battery-readout")
    ) {
      continue;
    }
    const config = (child as Element & { config?: unknown }).config;
    if (config && typeof config === "object" && !Array.isArray(config)) {
      return pinEntityId(config as Record<string, unknown>) ?? "";
    }
  }
  return "";
}

function registryEntry(hass: ClassifierHass, entityId: string): RegistryEntry | null {
  const entities = hass.entities;
  if (!entities) return null;
  if (Array.isArray(entities)) {
    return entities.find((entry) => entry.entity_id === entityId) ?? null;
  }
  const byKey = entities[entityId];
  if (byKey) return { ...byKey, entity_id: byKey.entity_id || entityId };
  for (const entry of Object.values(entities)) {
    if (entry.entity_id === entityId) return entry;
  }
  return null;
}

function ensureStyles(root: ParentNode): void {
  const host = root as ParentNode & {
    querySelector?: (selector: string) => Element | null;
    append?: (node: Node) => void;
    appendChild?: (node: Node) => Node;
  };
  if (typeof host.querySelector !== "function") return;
  const existing = host.querySelector(`#${STYLE_ID}`);
  if (existing) {
    // Migrate older automation-only style id content if present.
    if (existing.textContent !== entityEditStyles()) existing.textContent = entityEditStyles();
    return;
  }
  // Remove legacy style id from the first automation-only version.
  host.querySelector("#area-card-automation-edit-style")?.remove();
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = entityEditStyles();
  if (typeof host.append === "function") host.append(style);
  else host.appendChild?.(style);
}
