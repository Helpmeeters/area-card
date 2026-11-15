import { pinEntityId, pinModeChoices, type PinMode } from "./pinned-entities";
import { pinSwitchStyles } from "./popup-chrome";
import { BUBBLE_CARDS_GRID } from "./tags";

const PIN_STYLE_ID = "area-card-pin-switch-style";

const PIN_ICONS: Record<PinMode, string> = {
  hidden: "mdi:eye-off",
  background: "mdi:image",
  always: "mdi:pin",
  "when-on": "mdi:eye-check",
};

const PIN_LABELS: Record<PinMode, string> = {
  hidden: "Hidden on the area card",
  background: "Use as area background",
  always: "Always on the area card",
  "when-on": "On the area card while on",
};

interface PinControl extends HTMLElement {
  pinSelect?: (entityId: string, mode: PinMode) => void;
}

interface PinMenu extends HTMLElement {
  closeOnDismiss?: () => void;
}

let nextMenuId = 0;

function rowConfig(cell: Element): Record<string, unknown> | null {
  for (const child of cell.children) {
    if (child.classList.contains("area-card-pin-switch")) continue;
    const config = (child as Element & { config?: unknown }).config;
    if (config && typeof config === "object" && !Array.isArray(config)) {
      return config as Record<string, unknown>;
    }
  }
  return null;
}

function unbindDismiss(menu: PinMenu): void {
  menu.closeOnDismiss?.();
}

function removeSwitches(cell: Element): void {
  for (const node of cell.querySelectorAll(":scope > .area-card-pin-switch")) {
    const menu = node.querySelector(":scope > .area-card-pin-menu");
    if (menu) unbindDismiss(menu as PinMenu);
    node.remove();
  }
}

function triggerOf(control: ParentNode): HTMLElement | null {
  return control.querySelector(":scope > .area-card-pin-switch-trigger");
}

function menuOf(control: ParentNode): PinMenu | null {
  return control.querySelector(":scope > .area-card-pin-menu") as PinMenu | null;
}

function popoverOpen(menu: HTMLElement): boolean {
  return typeof menu.matches === "function" && menu.matches(":popover-open");
}

function menuIsOpen(menu: HTMLElement): boolean {
  return popoverOpen(menu) || menu.dataset.open === "true";
}

function showPopover(menu: HTMLElement): boolean {
  if (typeof menu.showPopover !== "function") return false;
  try {
    menu.showPopover();
    return true;
  } catch {
    return false;
  }
}

function hidePopover(menu: HTMLElement): void {
  if (!popoverOpen(menu) || typeof menu.hidePopover !== "function") return;
  try {
    menu.hidePopover();
  } catch {
    // Already closed, or not shown as a popover.
  }
}

function placeMenu(trigger: HTMLElement, menu: HTMLElement): void {
  if (typeof trigger.getBoundingClientRect !== "function") return;
  const rect = trigger.getBoundingClientRect();
  const gap = 4;
  const margin = 8;
  menu.style.margin = "0";
  let top = rect.bottom + gap;
  let left = Math.max(margin, rect.left);
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

function focusChoice(menu: HTMLElement, which: "selected" | "first" | "last"): void {
  const options = [...menu.querySelectorAll<HTMLElement>(":scope > .area-card-pin-option")];
  const selected = options.find((option) => option.getAttribute("aria-checked") === "true");
  const target =
    which === "last" ? options[options.length - 1] : which === "first" ? options[0] : (selected ?? options[0]);
  if (typeof target?.focus === "function") target.focus({ preventScroll: true });
}

function menuRoot(control: HTMLElement): ParentNode | null {
  if (typeof control.getRootNode !== "function") return null;
  const root = control.getRootNode();
  if (root && typeof (root as ParentNode).querySelectorAll === "function") return root as ParentNode;
  return null;
}

function hideMenu(trigger: HTMLElement, menu: PinMenu): void {
  unbindDismiss(menu);
  hidePopover(menu);
  menu.dataset.open = "false";
  trigger.setAttribute("aria-expanded", "false");
}

function bindDismiss(control: HTMLElement, trigger: HTMLElement, menu: PinMenu): void {
  unbindDismiss(menu);
  if (typeof document.addEventListener !== "function") return;
  let scrollReady = false;
  const armScroll = () => {
    scrollReady = true;
  };
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(armScroll);
  else scrollReady = true;

  const hide = () => hideMenu(trigger, menu);
  const onPointerDown = (event: Event) => {
    const path = typeof event.composedPath === "function" ? event.composedPath() : [];
    if (path.includes(control) || path.includes(menu)) return;
    event.preventDefault();
    event.stopPropagation();
    hide();
  };
  const onKeyDown = (event: Event) => {
    if ((event as KeyboardEvent).key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    hide();
  };
  const onScroll = () => {
    if (!scrollReady) return;
    hide();
  };
  document.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("keydown", onKeyDown, true);
  document.addEventListener("scroll", onScroll, true);
  menu.closeOnDismiss = () => {
    document.removeEventListener("pointerdown", onPointerDown, true);
    document.removeEventListener("keydown", onKeyDown, true);
    document.removeEventListener("scroll", onScroll, true);
    menu.closeOnDismiss = undefined;
  };
}

function closeOtherMenus(control: HTMLElement, menu: HTMLElement): void {
  const root = menuRoot(control);
  if (!root) return;
  for (const other of root.querySelectorAll(".area-card-pin-menu")) {
    if (other === menu || !menuIsOpen(other as HTMLElement)) continue;
    const otherTrigger = other.parentElement?.querySelector(":scope > .area-card-pin-switch-trigger");
    if (otherTrigger) hideMenu(otherTrigger as HTMLElement, other as PinMenu);
  }
}

function showMenu(control: HTMLElement, trigger: HTMLElement, menu: PinMenu): void {
  closeOtherMenus(control, menu);
  menu.dataset.open = "true";
  trigger.setAttribute("aria-expanded", "true");
  showPopover(menu);
  placeMenu(trigger, menu);
  bindDismiss(control, trigger, menu);
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(() => {
      if (menuIsOpen(menu)) placeMenu(trigger, menu);
    });
  }
}

function toggleMenu(control: HTMLElement, trigger: HTMLElement, menu: PinMenu): void {
  if (menuIsOpen(menu)) hideMenu(trigger, menu);
  else showMenu(control, trigger, menu);
}

function showPinMode(control: PinControl, mode: PinMode): void {
  control.dataset.pinMode = mode;
  const trigger = triggerOf(control);
  if (!trigger) return;
  const label = PIN_LABELS[mode];
  trigger.dataset.pinMode = mode;
  trigger.setAttribute("aria-label", label);
  trigger.setAttribute("title", label);
  trigger.title = label;
  trigger.querySelector("ha-icon")?.setAttribute("icon", PIN_ICONS[mode]);
  const menu = menuOf(control);
  if (!menu) return;
  for (const option of menu.querySelectorAll<HTMLElement>(":scope > .area-card-pin-option")) {
    option.setAttribute("aria-checked", option.dataset.pinMode === mode ? "true" : "false");
  }
}

function createOption(control: PinControl, mode: PinMode): HTMLButtonElement {
  const option = document.createElement("button");
  option.type = "button";
  option.className = "area-card-pin-option";
  option.dataset.pinMode = mode;
  option.setAttribute("role", "menuitemradio");
  option.setAttribute("aria-checked", "false");
  const icon = document.createElement("ha-icon");
  icon.setAttribute("icon", PIN_ICONS[mode]);
  icon.setAttribute("aria-hidden", "true");
  const label = document.createElement("span");
  label.className = "area-card-pin-option-label";
  label.textContent = PIN_LABELS[mode];
  option.append(icon, label);
  option.addEventListener("click", (event) => {
    event.stopPropagation();
    const entityId = control.dataset.pinEntity;
    if (entityId) control.pinSelect?.(entityId, mode);
    const trigger = triggerOf(control);
    const menu = menuOf(control);
    if (trigger && menu) hideMenu(trigger, menu);
  });
  return option;
}

function syncOptions(control: PinControl, entityId: string): void {
  const menu = menuOf(control);
  if (!menu) return;
  const modes = pinModeChoices(entityId);
  const options = [...menu.querySelectorAll<HTMLElement>(":scope > .area-card-pin-option")];
  const same =
    options.length === modes.length && options.every((option, index) => option.dataset.pinMode === modes[index]);
  if (same) return;
  for (const option of options) option.remove();
  for (const mode of modes) menu.append(createOption(control, mode));
}

function moveOptionFocus(menu: HTMLElement, key: string, current: EventTarget | null): void {
  const options = [...menu.querySelectorAll<HTMLElement>(":scope > .area-card-pin-option")];
  if (options.length === 0) return;
  const index = options.findIndex((option) => option === current);
  let next = 0;
  if (key === "ArrowDown") next = index < 0 ? 0 : (index + 1) % options.length;
  else if (key === "ArrowUp") next = index <= 0 ? options.length - 1 : index - 1;
  else if (key === "End") next = options.length - 1;
  else next = 0;
  const target = options[next];
  if (typeof target?.focus === "function") target.focus({ preventScroll: true });
}

function createPinControl(): PinControl {
  const control = document.createElement("div") as PinControl;
  control.className = "area-card-pin-switch";

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "area-card-pin-switch-trigger";
  trigger.setAttribute("aria-haspopup", "menu");
  trigger.setAttribute("aria-expanded", "false");
  const icon = document.createElement("ha-icon");
  icon.setAttribute("aria-hidden", "true");
  trigger.append(icon);

  const menu = document.createElement("div") as PinMenu;
  menu.className = "area-card-pin-menu";
  menu.id = `area-card-pin-menu-${nextMenuId++}`;
  menu.setAttribute("popover", "manual");
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", "Show on the area card");
  menu.dataset.open = "false";
  trigger.setAttribute("aria-controls", menu.id);

  control.append(trigger, menu);
  control.addEventListener("pointerdown", (event) => event.stopPropagation());
  control.addEventListener("click", (event) => event.stopPropagation());

  trigger.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleMenu(control, trigger, menu);
  });
  trigger.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    event.stopPropagation();
    if (!menuIsOpen(menu)) showMenu(control, trigger, menu);
    focusChoice(menu, event.key === "ArrowUp" ? "last" : "selected");
  });
  menu.addEventListener("keydown", (event) => {
    const key = event.key;
    if (key !== "ArrowDown" && key !== "ArrowUp" && key !== "Home" && key !== "End") return;
    event.preventDefault();
    event.stopPropagation();
    moveOptionFocus(menu, key, event.target);
  });
  return control;
}

function isPinControl(node: Element): node is PinControl {
  const tag = node.tagName;
  if (typeof tag === "string" && tag.toUpperCase() !== "DIV") return false;
  return Boolean(node.querySelector(":scope > .area-card-pin-switch-trigger"));
}

function ensurePinStyles(root: ParentNode): void {
  const host = root as ParentNode & {
    querySelector?: (selector: string) => Element | null;
    appendChild?: (node: Node) => Node;
  };
  if (typeof host.querySelector !== "function" || typeof host.appendChild !== "function") return;
  if (host.querySelector(`#${PIN_STYLE_ID}`)) return;
  const style = document.createElement("style");
  style.id = PIN_STYLE_ID;
  style.textContent = pinSwitchStyles();
  host.appendChild(style);
}

/** One menu button per entity row while editing. Reuses the existing control so focus survives a rebuild. */
export function syncPinToggles(
  root: ParentNode,
  options: {
    editing: boolean;
    modeOf: (entityId: string) => PinMode;
    onSelect: (entityId: string, mode: PinMode) => void;
  },
): void {
  ensurePinStyles(root);
  for (const cell of root.querySelectorAll(`.${BUBBLE_CARDS_GRID} > .card`)) {
    const entityId = options.editing ? pinEntityId(rowConfig(cell)) : null;
    if (!options.editing || !entityId) {
      removeSwitches(cell);
      continue;
    }

    const found = cell.querySelector(":scope > .area-card-pin-switch");
    let control: PinControl | null = found && isPinControl(found) ? found : null;
    if (found && !control) found.remove();
    if (!control) {
      control = createPinControl();
      cell.insertBefore(control, cell.firstChild);
    } else if (control !== cell.firstElementChild) {
      cell.insertBefore(control, cell.firstChild);
    }
    for (const extra of cell.querySelectorAll(":scope > .area-card-pin-switch")) {
      if (extra !== control) extra.remove();
    }

    control.dataset.pinEntity = entityId;
    control.pinSelect = options.onSelect;
    syncOptions(control, entityId);
    showPinMode(control, options.modeOf(entityId));
  }
}
