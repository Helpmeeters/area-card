import { hideAreaDotTooltip, showAreaDotTooltip } from "./dot-tooltip";

const STYLE_ID = "area-card-floor-options-style";

export interface FloorOptionsState {
  collapsedAreas: number;
  sortByPresence: boolean;
  maxAreas: number;
}

export interface FloorOptionsHandlers {
  onCollapsedAreasChange: (next: number) => void;
  onSortByPresenceChange: (next: boolean) => void;
}

interface FloorOptionsMenu extends HTMLElement {
  closeOnDismiss?: () => void;
}

interface FloorOptionsButton extends HTMLButtonElement {
  floorMenu?: FloorOptionsMenu;
  floorState?: FloorOptionsState;
  floorHandlers?: FloorOptionsHandlers;
}

let nextMenuId = 0;

export function floorOptionsTooltipText(state: FloorOptionsState): string {
  const countLabel =
    state.collapsedAreas === 1
      ? "1 area shown when collapsed"
      : `${state.collapsedAreas} areas shown when collapsed`;
  const sortLabel = state.sortByPresence ? "Sorted by presence" : "Sorted alphabetically";
  return `Floor options\n${countLabel} · ${sortLabel}`;
}

export function createFloorOptionsButton(handlers: FloorOptionsHandlers): HTMLButtonElement {
  const button = document.createElement("button") as FloorOptionsButton;
  button.type = "button";
  button.className = "floor-card-options-btn";
  button.setAttribute("aria-haspopup", "dialog");
  button.setAttribute("aria-expanded", "false");
  button.style.cssText = [
    "display:inline-flex",
    "align-items:center",
    "justify-content:center",
    "flex:0 0 auto",
    "gap:3px",
    "height:22px",
    "min-width:22px",
    "margin:0 8px 0 0",
    "padding:0 6px",
    "border:none",
    "border-radius:999px",
    "background:color-mix(in srgb, var(--secondary-text-color, #888) 12%, transparent)",
    "color:var(--secondary-text-color)",
    "font-family:inherit",
    "font-size:11px",
    "font-weight:600",
    "line-height:1",
    "cursor:pointer",
    "--mdc-icon-size:14px",
  ].join(";");

  const icon = document.createElement("ha-icon");
  icon.setAttribute("icon", "mdi:tune-variant");
  icon.setAttribute("aria-hidden", "true");

  const badge = document.createElement("span");
  badge.dataset.floorOptBadge = "";
  badge.style.display = "none";

  button.append(icon, badge);

  const menu = document.createElement("div") as FloorOptionsMenu;
  menu.className = "floor-card-options-menu";
  menu.id = `floor-card-options-menu-${nextMenuId++}`;
  menu.setAttribute("popover", "manual");
  menu.setAttribute("role", "dialog");
  menu.setAttribute("aria-label", "Floor options");
  menu.dataset.open = "false";
  button.setAttribute("aria-controls", menu.id);

  const title = document.createElement("div");
  title.className = "floor-card-options-title";
  title.textContent = "Floor options";

  // Stepper row: Areas when collapsed
  const countRow = document.createElement("div");
  countRow.className = "floor-card-options-row";

  const countLabel = document.createElement("span");
  countLabel.className = "floor-card-options-label";
  countLabel.textContent = "Areas when collapsed";

  const stepper = document.createElement("div");
  stepper.className = "floor-card-options-stepper";

  const decBtn = document.createElement("button");
  decBtn.type = "button";
  decBtn.className = "floor-card-options-step";
  decBtn.dataset.floorOpt = "dec";
  decBtn.setAttribute("aria-label", "Decrease areas shown when collapsed");
  decBtn.textContent = "−";

  const countVal = document.createElement("span");
  countVal.className = "floor-card-options-value";
  countVal.dataset.floorOptCount = "";
  countVal.textContent = "0";

  const incBtn = document.createElement("button");
  incBtn.type = "button";
  incBtn.className = "floor-card-options-step";
  incBtn.dataset.floorOpt = "inc";
  incBtn.setAttribute("aria-label", "Increase areas shown when collapsed");
  incBtn.textContent = "+";

  stepper.append(decBtn, countVal, incBtn);
  countRow.append(countLabel, stepper);

  // Toggle row: Sort by presence
  const sortRow = document.createElement("button");
  sortRow.type = "button";
  sortRow.className = "floor-card-options-toggle";
  sortRow.dataset.floorOpt = "sort";
  sortRow.setAttribute("aria-pressed", "true");

  const sortLabel = document.createElement("span");
  sortLabel.className = "floor-card-options-label";
  sortLabel.textContent = "Sort by presence";

  const sortPill = document.createElement("span");
  sortPill.className = "floor-card-options-pill";
  sortPill.dataset.floorOptSortPill = "";
  sortPill.textContent = "On";

  sortRow.append(sortLabel, sortPill);
  menu.append(title, countRow, sortRow);

  button.floorMenu = menu;
  button.floorHandlers = handlers;
  button.floorState = { collapsedAreas: 0, sortByPresence: true, maxAreas: 20 };

  const currentTip = () =>
    floorOptionsTooltipText(button.floorState ?? { collapsedAreas: 0, sortByPresence: true, maxAreas: 20 });

  button.addEventListener("pointerenter", () => {
    if (menuIsOpen(menu)) return;
    showAreaDotTooltip(button, currentTip());
  });
  button.addEventListener("pointerleave", hideAreaDotTooltip);
  button.addEventListener("focus", () => {
    if (menuIsOpen(menu)) return;
    showAreaDotTooltip(button, currentTip());
  });
  button.addEventListener("blur", hideAreaDotTooltip);
  button.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
    hideAreaDotTooltip();
  });
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    hideAreaDotTooltip();
    if (menuIsOpen(menu)) hideMenu(button, menu);
    else showMenu(button, menu);
  });

  menu.addEventListener("pointerdown", (event) => event.stopPropagation());
  menu.addEventListener("click", (event) => {
    event.stopPropagation();
    const target = event.target instanceof Element ? event.target.closest("[data-floor-opt]") : null;
    if (!(target instanceof HTMLElement)) return;
    const state = button.floorState ?? { collapsedAreas: 0, sortByPresence: true, maxAreas: 20 };
    const maxLimit = Math.max(20, state.maxAreas);
    const action = target.dataset.floorOpt;
    if (action === "dec") {
      const next = Math.max(0, state.collapsedAreas - 1);
      if (next !== state.collapsedAreas) button.floorHandlers?.onCollapsedAreasChange(next);
    } else if (action === "inc") {
      const next = Math.min(maxLimit, state.collapsedAreas + 1);
      if (next !== state.collapsedAreas) button.floorHandlers?.onCollapsedAreasChange(next);
    } else if (action === "sort") {
      button.floorHandlers?.onSortByPresenceChange(!state.sortByPresence);
    }
  });
  menu.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    hideMenu(button, menu);
    button.focus();
  });

  return button;
}

export function syncFloorOptionsButton(button: HTMLButtonElement, state: FloorOptionsState): void {
  const host = button as FloorOptionsButton;
  host.floorState = state;
  button.setAttribute("aria-label", floorOptionsTooltipText(state).replace("\n", " — "));

  const badge = button.querySelector("[data-floor-opt-badge]");
  if (badge instanceof HTMLElement) {
    if (state.collapsedAreas > 0) {
      badge.textContent = `+${state.collapsedAreas}`;
      badge.style.display = "inline";
    } else {
      badge.textContent = "";
      badge.style.display = "none";
    }
  }

  const menu = host.floorMenu;
  if (!menu) return;
  const maxLimit = Math.max(20, state.maxAreas);
  const countEl = menu.querySelector("[data-floor-opt-count]");
  if (countEl) countEl.textContent = String(state.collapsedAreas);

  const decBtn = menu.querySelector<HTMLButtonElement>('[data-floor-opt="dec"]');
  if (decBtn) decBtn.disabled = state.collapsedAreas <= 0;

  const incBtn = menu.querySelector<HTMLButtonElement>('[data-floor-opt="inc"]');
  if (incBtn) incBtn.disabled = state.collapsedAreas >= maxLimit;

  const sortBtn = menu.querySelector<HTMLButtonElement>('[data-floor-opt="sort"]');
  if (sortBtn) sortBtn.setAttribute("aria-pressed", state.sortByPresence ? "true" : "false");

  const sortPill = menu.querySelector<HTMLElement>("[data-floor-opt-sort-pill]");
  if (sortPill) {
    sortPill.textContent = state.sortByPresence ? "On" : "Off";
    sortPill.dataset.active = state.sortByPresence ? "1" : "0";
  }

  const root = button.getRootNode();
  if (root instanceof ShadowRoot || root instanceof Document) {
    ensureFloorMenuStyles(root);
    if (menu.parentNode !== root) root.append(menu);
  }
}

export function ensureFloorMenuStyles(root: ParentNode): void {
  if (typeof root.querySelector !== "function") return;
  if (root.querySelector(`#${STYLE_ID}`)) return;
  const target = root instanceof Document ? root.head ?? root.documentElement : root;
  if (!target) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = [
    ".floor-card-options-btn:hover {",
    "  color: var(--primary-text-color) !important;",
    "  background: color-mix(in srgb, var(--secondary-text-color, #888) 20%, transparent) !important;",
    "}",
    ".floor-card-options-menu {",
    "  position: fixed;",
    "  inset: auto;",
    "  width: max-content;",
    "  min-width: 230px;",
    "  height: max-content;",
    "  margin: 0;",
    "  padding: 8px;",
    "  border: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));",
    "  border-radius: 12px;",
    "  background: var(--card-background-color, var(--primary-background-color, var(--ha-card-background)));",
    "  color: var(--primary-text-color);",
    "  box-shadow: var(--ha-card-box-shadow, 0 4px 16px rgba(0, 0, 0, 0.28));",
    "  z-index: 9999;",
    "}",
    ".floor-card-options-title {",
    "  padding: 4px 8px 6px;",
    "  font-size: 12px;",
    "  font-weight: 600;",
    "  color: var(--secondary-text-color);",
    "}",
    ".floor-card-options-row {",
    "  display: flex;",
    "  align-items: center;",
    "  justify-content: space-between;",
    "  gap: 12px;",
    "  padding: 6px 8px;",
    "}",
    ".floor-card-options-label {",
    "  font-size: 13px;",
    "  font-weight: 500;",
    "  color: var(--primary-text-color);",
    "}",
    ".floor-card-options-stepper {",
    "  display: inline-flex;",
    "  align-items: center;",
    "  gap: 6px;",
    "}",
    ".floor-card-options-step {",
    "  display: inline-flex;",
    "  align-items: center;",
    "  justify-content: center;",
    "  width: 28px;",
    "  height: 28px;",
    "  border: 1px solid var(--divider-color, rgba(128, 128, 128, 0.25));",
    "  border-radius: 8px;",
    "  background: transparent;",
    "  color: var(--primary-text-color);",
    "  font-size: 16px;",
    "  font-weight: 600;",
    "  line-height: 1;",
    "  cursor: pointer;",
    "}",
    ".floor-card-options-step:hover:not(:disabled) {",
    "  background: color-mix(in srgb, var(--primary-text-color, #888) 10%, transparent);",
    "}",
    ".floor-card-options-step:disabled {",
    "  opacity: 0.35;",
    "  cursor: default;",
    "}",
    ".floor-card-options-value {",
    "  min-width: 20px;",
    "  text-align: center;",
    "  font-size: 14px;",
    "  font-weight: 600;",
    "  font-variant-numeric: tabular-nums;",
    "}",
    ".floor-card-options-toggle {",
    "  display: flex;",
    "  align-items: center;",
    "  justify-content: space-between;",
    "  gap: 12px;",
    "  width: 100%;",
    "  padding: 8px;",
    "  border: none;",
    "  border-radius: 8px;",
    "  background: transparent;",
    "  color: inherit;",
    "  font: inherit;",
    "  cursor: pointer;",
    "  text-align: left;",
    "}",
    ".floor-card-options-toggle:hover {",
    "  background: color-mix(in srgb, var(--primary-text-color, #888) 8%, transparent);",
    "}",
    ".floor-card-options-pill {",
    "  padding: 2px 8px;",
    "  border-radius: 999px;",
    "  font-size: 11px;",
    "  font-weight: 600;",
    "  background: color-mix(in srgb, var(--secondary-text-color, #888) 16%, transparent);",
    "  color: var(--secondary-text-color);",
    "}",
    '.floor-card-options-pill[data-active="1"] {',
    "  background: color-mix(in srgb, var(--primary-color, #03a9f4) 20%, transparent);",
    "  color: var(--primary-color, #03a9f4);",
    "}",
  ].join("\n");
  target.append(style);
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

function showMenu(trigger: HTMLButtonElement, menu: FloorOptionsMenu): void {
  menu.dataset.open = "true";
  trigger.setAttribute("aria-expanded", "true");
  showPopover(menu);
  placeMenu(trigger, menu);
  bindDismiss(trigger, menu);
}

function hideMenu(trigger: HTMLButtonElement, menu: FloorOptionsMenu): void {
  menu.closeOnDismiss?.();
  hidePopover(menu);
  menu.dataset.open = "false";
  trigger.setAttribute("aria-expanded", "false");
}

function bindDismiss(trigger: HTMLButtonElement, menu: FloorOptionsMenu): void {
  menu.closeOnDismiss?.();
  const hide = (event: Event) => {
    const path = typeof event.composedPath === "function" ? event.composedPath() : [];
    if (path.includes(trigger) || path.includes(menu)) return;
    hideMenu(trigger, menu);
  };
  document.addEventListener("pointerdown", hide, true);
  document.addEventListener("click", hide, true);
  menu.closeOnDismiss = () => {
    document.removeEventListener("pointerdown", hide, true);
    document.removeEventListener("click", hide, true);
    menu.closeOnDismiss = undefined;
  };
}
