import {
  BATTERY_LEVEL_COLOR,
  buildBatteryIndex,
  shownBattery,
  type BatteryMode,
  type BatteryReading,
} from "./battery";
import { pinEntityId } from "./pinned-entities";
import type { ClassifierHass } from "./sections";
import { BUBBLE_CARDS_GRID } from "./tags";

const STYLE_ID = "area-card-battery-style";
const LIGHT_ROW = "custom:area-card-light-row";

const MENU: ReadonlyArray<{ mode: BatteryMode; label: string; icon: string }> = [
  { mode: "off", label: "Off", icon: "mdi:battery-off" },
  { mode: "green", label: "Green", icon: "mdi:battery" },
  { mode: "yellow", label: "Yellow", icon: "mdi:battery-50" },
  { mode: "red", label: "Red", icon: "mdi:battery-alert" },
];

interface BatteryButton extends HTMLButtonElement {
  batteryMenu?: BatteryMenu;
  batterySelect?: (mode: BatteryMode) => void;
}

interface BatteryMenu extends HTMLElement {
  closeOnDismiss?: () => void;
}

let nextMenuId = 0;

/** Header button and its menu. The menu is appended to the button's root when the button is placed. */
export function createBatteryButton(onSelect: (mode: BatteryMode) => void): HTMLButtonElement {
  const button = document.createElement("button") as BatteryButton;
  button.type = "button";
  button.className = "bubble-header-action-button area-card-battery";
  button.setAttribute("aria-label", "Battery percentages");
  button.setAttribute("aria-haspopup", "menu");
  button.setAttribute("aria-expanded", "false");
  button.style.padding = "0";
  button.style.border = "none";
  const icon = document.createElement("ha-icon");
  icon.setAttribute("icon", "mdi:battery-off");
  icon.setAttribute("aria-hidden", "true");
  icon.style.setProperty("--mdc-icon-size", "24px");
  button.append(icon);

  const menu = document.createElement("div") as BatteryMenu;
  menu.className = "area-card-battery-menu";
  menu.id = `area-card-battery-menu-${nextMenuId++}`;
  menu.setAttribute("popover", "manual");
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", "Battery percentages");
  menu.dataset.open = "false";
  button.setAttribute("aria-controls", menu.id);
  for (const option of MENU) menu.append(menuOption(option.mode, option.label, option.icon));
  button.batteryMenu = menu;
  button.batterySelect = onSelect;

  button.addEventListener("pointerdown", (event) => event.stopPropagation());
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    const open = menuIsOpen(menu);
    if (open) hideMenu(button, menu);
    else showMenu(button, menu);
  });
  menu.addEventListener("pointerdown", (event) => event.stopPropagation());
  menu.addEventListener("click", (event) => {
    event.stopPropagation();
    const option = optionTarget(event.target);
    if (!option) return;
    const mode = option.dataset.mode;
    if (mode !== "off" && mode !== "green" && mode !== "yellow" && mode !== "red") return;
    hideMenu(button, menu);
    button.batterySelect?.(mode);
  });
  menu.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    hideMenu(button, menu);
    button.focus();
  });
  return button;
}

/** Icon color follows the selected filter. Reattaches the menu after Bubble rebuilds the header. */
export function syncBatteryButton(button: HTMLButtonElement, mode: BatteryMode): void {
  const host = button as BatteryButton;
  const icon = button.querySelector("ha-icon");
  const choice = MENU.find((item) => item.mode === mode) ?? MENU[0];
  if (icon instanceof HTMLElement) {
    icon.setAttribute("icon", choice.icon);
    icon.style.color = mode === "off" ? "" : BATTERY_LEVEL_COLOR[mode];
  }
  button.dataset.mode = mode;
  const menu = host.batteryMenu;
  if (!menu) return;
  for (const option of menu.querySelectorAll<HTMLElement>(".area-card-battery-option")) {
    option.setAttribute("aria-checked", option.dataset.mode === mode ? "true" : "false");
  }
  const root = button.getRootNode();
  if ((root instanceof ShadowRoot || root instanceof Document) && menu.parentNode !== root) root.append(menu);
}

/**
 * Colored percentage on each entity row, and on a pinned copy of that row.
 * `styleRoot` defaults to `root`. Pinned rows pass the area card so the style
 * element is not trimmed with the pinned row list.
 */
export function syncBatteryReadouts(
  root: ParentNode,
  hass: ClassifierHass,
  mode: BatteryMode,
  styleRoot: ParentNode = root,
): void {
  ensureBatteryStyles(styleRoot);
  const index = buildBatteryIndex(hass);
  if (typeof root.querySelectorAll !== "function") return;
  for (const cell of root.querySelectorAll(`.${BUBBLE_CARDS_GRID} > .card`)) {
    const entityId = entityIdOf(cell);
    applyReadout(cell, entityId ? shownBattery(index, hass, entityId, mode) : null, false);
  }
  for (const card of root.querySelectorAll("[data-pin-entity]")) {
    if (!(card instanceof HTMLElement)) continue;
    const entityId = card.dataset.pinEntity ?? "";
    const reading = entityId ? shownBattery(index, hass, entityId, mode) : null;
    applyReadout(card, reading, ledInset(card));
  }
}

export function batteryChromeStyles(): string {
  return [
    `.${BUBBLE_CARDS_GRID} > .card:has(> .area-card-battery-readout) {`,
    "  display: flex !important;",
    "  align-items: flex-start;",
    "}",
    `.${BUBBLE_CARDS_GRID} > .card:has(> .area-card-battery-readout) > :not(.area-card-battery-readout):not(.area-card-pin-switch) {`,
    "  flex: 1 1 auto;",
    "  min-width: 0;",
    "}",
    ".area-card-battery-readout {",
    "  flex: 0 0 auto;",
    "  margin: 18px 12px 0 4px;",
    "  font-size: 13px;",
    "  font-weight: 700;",
    "  font-variant-numeric: tabular-nums;",
    "  line-height: 18px;",
    "  pointer-events: none;",
    "}",
    "[data-pin-entity] {",
    "  position: relative;",
    "}",
    "[data-pin-entity] > .area-card-battery-readout {",
    "  position: absolute;",
    "  top: 18px;",
    "  right: 12px;",
    "  z-index: 2;",
    "  margin: 0;",
    "}",
    '[data-pin-entity] > .area-card-battery-readout[data-inset="led"] {',
    "  right: 40px;",
    "}",
    ".area-card-battery-menu {",
    "  position: fixed;",
    "  inset: auto;",
    "  width: max-content;",
    "  height: max-content;",
    "  margin: 0;",
    "  padding: 6px;",
    "  border: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));",
    "  border-radius: 12px;",
    "  background: var(--card-background-color, var(--primary-background-color, var(--ha-card-background)));",
    "  color: var(--primary-text-color);",
    "  box-shadow: var(--ha-card-box-shadow, 0 4px 16px rgba(0, 0, 0, 0.28));",
    "}",
    ".area-card-battery-option {",
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
    "  cursor: pointer;",
    "  box-sizing: border-box;",
    "}",
    ".area-card-battery-option ha-icon {",
    "  flex: 0 0 auto;",
    "  --mdc-icon-size: 24px;",
    "}",
    ".area-card-battery-option:hover,",
    ".area-card-battery-option:focus-visible {",
    "  background: color-mix(in srgb, var(--primary-text-color) 8%, transparent);",
    "}",
    '.area-card-battery-option[aria-checked="true"] {',
    "  background: color-mix(in srgb, var(--primary-color) 18%, transparent);",
    "}",
  ].join("\n");
}

function menuOption(mode: BatteryMode, label: string, iconName: string): HTMLButtonElement {
  const option = document.createElement("button");
  option.type = "button";
  option.className = "area-card-battery-option";
  option.dataset.mode = mode;
  option.setAttribute("role", "menuitemradio");
  option.setAttribute("aria-checked", "false");
  const icon = document.createElement("ha-icon");
  icon.setAttribute("icon", iconName);
  icon.setAttribute("aria-hidden", "true");
  if (mode !== "off") icon.style.color = BATTERY_LEVEL_COLOR[mode];
  const text = document.createElement("span");
  text.textContent = label;
  option.append(icon, text);
  return option;
}

function optionTarget(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  const option = target.closest(".area-card-battery-option");
  return option instanceof HTMLElement ? option : null;
}

function menuIsOpen(menu: HTMLElement): boolean {
  return (typeof menu.matches === "function" && menu.matches(":popover-open")) || menu.dataset.open === "true";
}

function showPopover(menu: HTMLElement): void {
  if (typeof menu.showPopover !== "function") return;
  try {
    menu.showPopover();
  } catch {
    // Already open, or the browser has no popover.
  }
}

function hidePopover(menu: HTMLElement): void {
  if (typeof menu.hidePopover !== "function") return;
  if (typeof menu.matches === "function" && !menu.matches(":popover-open")) return;
  try {
    menu.hidePopover();
  } catch {
    // Already closed.
  }
}

function placeMenu(trigger: HTMLElement, menu: HTMLElement): void {
  if (typeof trigger.getBoundingClientRect !== "function") return;
  const rect = trigger.getBoundingClientRect();
  const gap = 4;
  const margin = 8;
  let top = rect.bottom + gap;
  let left = Math.max(margin, rect.left);
  menu.style.margin = "0";
  menu.style.top = `${top}px`;
  menu.style.left = `${left}px`;
  if (typeof menu.getBoundingClientRect !== "function") return;
  const menuRect = menu.getBoundingClientRect();
  if (menuRect.width === 0 || menuRect.height === 0) return;
  const viewWidth = window.innerWidth || 0;
  const viewHeight = window.innerHeight || 0;
  if (viewHeight && top + menuRect.height > viewHeight - margin) {
    const above = rect.top - menuRect.height - gap;
    if (above >= margin) top = above;
  }
  if (viewWidth && left + menuRect.width > viewWidth - margin) {
    left = Math.max(margin, viewWidth - menuRect.width - margin);
  }
  menu.style.top = `${top}px`;
  menu.style.left = `${left}px`;
}

function showMenu(trigger: HTMLButtonElement, menu: BatteryMenu): void {
  menu.dataset.open = "true";
  trigger.setAttribute("aria-expanded", "true");
  showPopover(menu);
  placeMenu(trigger, menu);
  bindDismiss(trigger, menu);
}

function hideMenu(trigger: HTMLButtonElement, menu: BatteryMenu): void {
  menu.closeOnDismiss?.();
  hidePopover(menu);
  menu.dataset.open = "false";
  trigger.setAttribute("aria-expanded", "false");
}

function bindDismiss(trigger: HTMLButtonElement, menu: BatteryMenu): void {
  menu.closeOnDismiss?.();
  const hide = (event: Event) => {
    const path = typeof event.composedPath === "function" ? event.composedPath() : [];
    if (path.includes(trigger) || path.includes(menu)) return;
    hideMenu(trigger, menu);
  };
  const onKey = (event: Event) => {
    if (!(event instanceof KeyboardEvent) || event.key !== "Escape") return;
    hideMenu(trigger, menu);
  };
  document.addEventListener("pointerdown", hide, true);
  window.addEventListener("keydown", onKey);
  menu.closeOnDismiss = () => {
    document.removeEventListener("pointerdown", hide, true);
    window.removeEventListener("keydown", onKey);
    menu.closeOnDismiss = undefined;
  };
}

function entityIdOf(cell: Element): string | null {
  for (const child of cell.children) {
    if (child.classList.contains("area-card-pin-switch")) continue;
    if (child.classList.contains("area-card-battery-readout")) continue;
    const config = (child as Element & { config?: unknown }).config;
    if (config && typeof config === "object" && !Array.isArray(config)) {
      return pinEntityId(config as Record<string, unknown>);
    }
  }
  return null;
}

function ledInset(card: HTMLElement): boolean {
  const config = (card as { config?: { type?: unknown; led_entity?: unknown } }).config;
  return config?.type === LIGHT_ROW && typeof config.led_entity === "string" && config.led_entity.length > 0;
}

function applyReadout(host: Element, reading: BatteryReading | null, led: boolean): void {
  const existing = [...host.querySelectorAll(":scope > .area-card-battery-readout")];
  if (!reading) {
    for (const node of existing) node.remove();
    return;
  }
  const found = existing[0];
  let node: HTMLElement;
  if (found instanceof HTMLElement) node = found;
  else {
    node = document.createElement("span");
    node.className = "area-card-battery-readout";
    host.append(node);
  }
  for (const extra of existing) {
    if (extra !== node) extra.remove();
  }
  const label = `${reading.percent}%`;
  const color = BATTERY_LEVEL_COLOR[reading.level];
  if (node.dataset.level !== reading.level) node.dataset.level = reading.level;
  if (led) node.dataset.inset = "led";
  else if (node.dataset.inset) delete node.dataset.inset;
  if (node.style.color !== color) node.style.color = color;
  if (node.textContent !== label) node.textContent = label;
  const aria = `Battery ${reading.percent}%`;
  if (node.getAttribute("aria-label") !== aria) node.setAttribute("aria-label", aria);
}

function ensureBatteryStyles(root: ParentNode): void {
  const host = root as ParentNode & {
    querySelector?: (selector: string) => Element | null;
    append?: (node: Node) => void;
    appendChild?: (node: Node) => Node;
  };
  if (typeof host.querySelector !== "function") return;
  if (host.querySelector(`#${STYLE_ID}`)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = batteryChromeStyles();
  if (typeof host.append === "function") host.append(style);
  else host.appendChild?.(style);
}
