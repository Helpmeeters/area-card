import { BUBBLE_CARDS_GRID } from "./tags";

/** Header title has no fill, with or without a picture. Picture rules are appended when one exists. */
const POPUP_TITLE_CHROME = [
  ".bubble-pop-up > .bubble-header-container > .bubble-header .bubble-button-card-container {",
  "  background: none !important;",
  "  box-shadow: none !important;",
  "}",
  ".bubble-pop-up > .bubble-header-container > .bubble-header .bubble-background,",
  ".bubble-pop-up > .bubble-header-container > .bubble-header .bubble-button-card-container > ha-ripple {",
  "  display: none !important;",
  "}",
].join("\n");

/** White text on the header that actually renders, only when a picture sits behind it. */
const POPUP_TITLE_ON_PICTURE = [
  ".bubble-pop-up > .bubble-header-container > .bubble-header .bubble-name,",
  ".bubble-pop-up > .bubble-header-container > .bubble-header .bubble-state {",
  "  color: #fff !important;",
  "  text-shadow: 0 1px 2px rgba(0,0,0,.65);",
  "}",
].join("\n");

/**
 * Pin-switch layout. Bubble rewrites popup `styles` and appends a `:not()` that
 * excludes `.area-card-bubbles-grid-container` and everything inside it, so these
 * rules never match when they ride along in that stylesheet. `syncPinToggles`
 * injects this text in its own style element.
 */
export function pinSwitchStyles(): string {
  return [
    `.${BUBBLE_CARDS_GRID} > .card:has(> .area-card-pin-switch) {`,
    "  display: flex !important;",
    "  align-items: center;",
    "  gap: 8px;",
    "}",
    `.${BUBBLE_CARDS_GRID} > .card:has(> .area-card-pin-switch) > :not(.area-card-pin-switch):not(.area-card-battery-readout):not(.area-card-drag-handle) {`,
    "  flex: 1 1 auto;",
    "  min-width: 0;",
    "}",
    ".area-card-pin-switch {",
    "  flex: 0 0 auto;",
    "  position: relative;",
    "}",
    ".area-card-pin-switch-trigger {",
    "  display: inline-flex;",
    "  align-items: center;",
    "  justify-content: center;",
    "  box-sizing: border-box;",
    "  width: 36px;",
    "  height: 36px;",
    "  padding: 0;",
    "  border: none;",
    "  border-radius: 8px;",
    "  background: transparent;",
    "  color: var(--primary-text-color);",
    "  cursor: pointer;",
    "  --mdc-icon-size: 24px;",
    "}",
    ".area-card-pin-switch-trigger:hover,",
    ".area-card-pin-switch-trigger[aria-expanded=\"true\"] {",
    "  background: color-mix(in srgb, var(--primary-text-color) 8%, transparent);",
    "}",
    '.area-card-pin-switch-trigger[data-pin-mode="always"],',
    '.area-card-pin-switch-trigger[data-pin-mode="when-on"],',
    '.area-card-pin-switch-trigger[data-pin-mode="chip"],',
    '.area-card-pin-switch-trigger[data-pin-mode="background"] {',
    "  color: var(--primary-color);",
    "  opacity: 1;",
    "}",
    '.area-card-pin-switch-trigger[data-pin-mode="hidden"] {',
    "  opacity: 0.45;",
    "}",
    ".area-card-pin-menu {",
    "  position: fixed;",
    "  inset: auto;",
    "  width: max-content;",
    "  height: max-content;",
    "  max-width: min(320px, calc(100vw - 16px));",
    "  max-height: 70vh;",
    "  margin: 0;",
    "  padding: 6px;",
    "  overflow: auto;",
    "  border: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));",
    "  border-radius: 12px;",
    "  background: var(--card-background-color, var(--primary-background-color, var(--ha-card-background)));",
    "  color: var(--primary-text-color);",
    "  box-shadow: var(--ha-card-box-shadow, 0 4px 16px rgba(0, 0, 0, 0.28));",
    "}",
    ".area-card-pin-option {",
    "  display: flex;",
    "  align-items: center;",
    "  gap: 12px;",
    "  width: 100%;",
    "  min-height: 40px;",
    "  margin: 0;",
    "  padding: 8px 12px;",
    "  border: none;",
    "  border-radius: 8px;",
    "  background: transparent;",
    "  color: inherit;",
    "  font: inherit;",
    "  font-size: 14px;",
    "  line-height: 20px;",
    "  text-align: left;",
    "  white-space: nowrap;",
    "  cursor: pointer;",
    "  box-sizing: border-box;",
    "}",
    ".area-card-pin-option ha-icon {",
    "  flex: 0 0 auto;",
    "  --mdc-icon-size: 24px;",
    "}",
    ".area-card-pin-option:hover,",
    ".area-card-pin-option:focus-visible {",
    "  background: color-mix(in srgb, var(--primary-text-color) 8%, transparent);",
    "}",
    '.area-card-pin-option[aria-checked="true"] {',
    "  background: color-mix(in srgb, var(--primary-color) 18%, transparent);",
    "  color: var(--primary-color);",
    "}",
    '.area-card-pin-option[aria-checked="true"]:hover,',
    '.area-card-pin-option[aria-checked="true"]:focus-visible {',
    "  background: color-mix(in srgb, var(--primary-color) 28%, transparent);",
    "}",
  ].join("\n");
}

/** Header action buttons sit tight against close. */
const POPUP_HEADER_ACTIONS = [
  ".bubble-header-container > .bubble-header-actions {",
  "  gap: 4px !important;",
  "}",
  ".bubble-header-container > .bubble-header-actions > .bubble-header-action-button {",
  "  width: 36px !important;",
  "  height: 36px !important;",
  "}",
  ".area-card-pin-edit[aria-pressed=\"true\"] {",
  "  background: var(--primary-color) !important;",
  "  color: var(--text-primary-color, #fff) !important;",
  "}",
].join("\n");

export function popupChromeStyles(pictureStyles?: string): string {
  const title = pictureStyles
    ? [POPUP_TITLE_CHROME, pictureStyles, POPUP_TITLE_ON_PICTURE].join("\n")
    : POPUP_TITLE_CHROME;
  return [title, POPUP_HEADER_ACTIONS].join("\n");
}

export function areaSettingsPath(areaId: string): string {
  return `/config/areas/area/${areaId}`;
}

/** Place the gear immediately left of close. A gear already in that spot is left alone. */
export function insertAreaEditButton(actions: Element, button: HTMLElement): void {
  const close = actions.querySelector(".bubble-close-button");
  if (!close) return;
  if (close.previousElementSibling?.classList.contains("area-card-edit-area")) return;
  actions.insertBefore(button, close);
}

/**
 * Place the battery first, then the pencil and gear immediately left of close.
 * One placement per button. Snapping the battery both to the front and to the
 * pencil fights Bubble's previous button and retriggers the header observer forever.
 */
export function ensureHeaderButtons(
  actions: Element,
  battery: HTMLElement,
  pencil: HTMLElement,
  gear: HTMLElement,
): void {
  const close = actions.querySelector(".bubble-close-button");
  if (!close) return;
  if (actions.firstElementChild !== battery) actions.insertBefore(battery, actions.firstElementChild);
  if (close.previousElementSibling !== gear) actions.insertBefore(gear, close);
  if (gear.previousElementSibling !== pencil) actions.insertBefore(pencil, gear);
}
