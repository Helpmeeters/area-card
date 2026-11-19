import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import {
  canDropInScope,
  cardBackgroundOptions,
  isPopupDragActive,
  popupEditStyles,
  reorderIds,
  syncCardBackgroundSection,
  syncPinOrderSection,
  syncPopupEditGuards,
  syncSectionDragOrder,
} from "../src/popup-edit";
import type { AreaBackgroundMode } from "../src/background-mode";
import type { AreaPins } from "../src/pinned-entities";
import type { ClassifierHass } from "../src/sections";
import { BUBBLE_CARDS_GRID } from "../src/tags";

type ListenerEntry = { fn: (e: FakeEvent) => void; capture: boolean };

type FakeEvent = {
  type: string;
  target: unknown;
  defaultPrevented: boolean;
  propagationStopped: boolean;
  path: unknown[];
  button?: number;
  pointerType?: string;
  clientX?: number;
  clientY?: number;
  key?: string;
  preventDefault(): void;
  stopPropagation(): void;
  composedPath(): unknown[];
};

class FakeElement {
  tagName: string;
  localName: string;
  id = "";
  className = "";
  textContent = "";
  dataset: Record<string, string> = {};
  attributes: Record<string, string> = {};
  style: Record<string, string> & { setProperty(k: string, v: string): void; removeProperty(k: string): void };
  children: FakeElement[] = [];
  parentElement: FakeElement | null = null;
  config?: Record<string, unknown>;
  hass?: ClassifierHass;
  shadowRoot: FakeElement | null = null;
  host?: { releasePopupSlideToClose?: () => void };
  isConnected = true;
  offsetHeight = 40;
  private rect: { left: number; top: number; right: number; bottom: number; width: number; height: number } = {
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    width: 0,
    height: 0,
  };
  private rectProvider?: () => { left: number; top: number; right: number; bottom: number; width: number; height: number };
  private listeners = new Map<string, ListenerEntry[]>();

  constructor(tag = "div") {
    this.tagName = tag.toUpperCase();
    this.localName = tag.toLowerCase();
    const styleObj: Record<string, string> = {};
    this.style = Object.assign(styleObj, {
      setProperty: (k: string, v: string) => {
        styleObj[k] = v;
      },
      removeProperty: (k: string) => {
        delete styleObj[k];
      },
    });
  }

  get classList() {
    const tokens = () => this.className.split(/\s+/).filter(Boolean);
    return {
      contains: (name: string) => tokens().includes(name),
      add: (name: string) => {
        if (!tokens().includes(name)) this.className = [...tokens(), name].join(" ");
      },
      remove: (name: string) => {
        this.className = tokens()
          .filter((t) => t !== name)
          .join(" ");
      },
    };
  }

  get firstElementChild(): FakeElement | null {
    return this.children[0] ?? null;
  }

  setAttribute(name: string, value: string): void {
    this.attributes[name] = value;
  }

  append(...nodes: FakeElement[]): void {
    for (const n of nodes) {
      if (n.parentElement) n.parentElement.children = n.parentElement.children.filter((c) => c !== n);
      n.parentElement = this;
      this.children.push(n);
    }
    this.onMutate?.();
  }

  insertBefore(node: FakeElement, ref: FakeElement | null): FakeElement {
    if (node.parentElement) node.parentElement.children = node.parentElement.children.filter((c) => c !== node);
    node.parentElement = this;
    if (!ref) {
      this.children.push(node);
    } else {
      const idx = this.children.indexOf(ref);
      if (idx === -1) this.children.push(node);
      else this.children.splice(idx, 0, node);
    }
    this.onMutate?.();
    return node;
  }

  appendChild(node: FakeElement): FakeElement {
    this.append(node);
    return node;
  }

  prepend(...nodes: FakeElement[]): void {
    for (let i = nodes.length - 1; i >= 0; i -= 1) {
      const n = nodes[i];
      if (n.parentElement) n.parentElement.children = n.parentElement.children.filter((c) => c !== n);
      n.parentElement = this;
      this.children.unshift(n);
    }
    this.onMutate?.();
  }

  replaceChildren(...nodes: FakeElement[]): void {
    for (const c of this.children) c.parentElement = null;
    this.children = [];
    this.append(...nodes);
  }

  remove(): void {
    if (!this.parentElement) return;
    const parent = this.parentElement;
    parent.children = parent.children.filter((c) => c !== this);
    this.parentElement = null;
    parent.onMutate?.();
  }

  onMutate?: () => void;

  addEventListener(type: string, fn: (e: FakeEvent) => void, options?: AddEventListenerOptions | boolean): void {
    const capture = typeof options === "boolean" ? options : Boolean(options?.capture);
    const list = this.listeners.get(type) ?? [];
    list.push({ fn, capture });
    this.listeners.set(type, list);
  }

  setRect(left: number, top: number, width: number, height: number): void {
    this.rect = { left, top, right: left + width, bottom: top + height, width, height };
  }

  setRectProvider(fn: () => { left: number; top: number; right: number; bottom: number; width: number; height: number }): void {
    this.rectProvider = fn;
  }

  getBoundingClientRect(): { left: number; top: number; right: number; bottom: number; width: number; height: number } {
    if (this.rectProvider) return this.rectProvider();
    return { ...this.rect };
  }

  dispatchCapture(event: FakeEvent): void {
    for (const entry of this.listeners.get(event.type) ?? []) {
      if (entry.capture) entry.fn(event);
    }
  }

  dispatchEvent(event: FakeEvent): void {
    for (const entry of this.listeners.get(event.type) ?? []) {
      entry.fn(event);
    }
  }

  private matches(selector: string): boolean {
    if (selector.includes(",")) {
      return selector.split(",").some((part) => this.matches(part.trim()));
    }
    const clean = selector.replace(/^:scope\s*>\s*/, "");
    if (clean.startsWith("#")) return this.id === clean.slice(1);
    const classMatch = clean.match(/^\.([a-zA-Z0-9_-]+)/);
    if (classMatch && !this.classList.contains(classMatch[1])) return false;
    const attrMatches = [...clean.matchAll(/\[([^\]=]+)(?:="([^"]+)")?\]/g)];
    for (const attrMatch of attrMatches) {
      if (attrMatch[1].startsWith("data-")) {
        const camel = attrMatch[1].slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        if (attrMatch[2] !== undefined) {
          if (this.dataset[camel] !== attrMatch[2]) return false;
        } else if (this.dataset[camel] === undefined) {
          return false;
        }
      }
    }
    return Boolean(classMatch || attrMatches.length > 0 || clean === this.localName);
  }

  querySelector(selector: string): FakeElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector: string): FakeElement[] {
    const directOnly = selector.trim().startsWith(":scope >");
    const out: FakeElement[] = [];
    const walk = (parent: FakeElement, depth: number) => {
      for (const child of parent.children) {
        if (child.matches(selector)) out.push(child);
        if (!directOnly || depth === 0) {
          if (!directOnly) walk(child, depth + 1);
        }
      }
    };
    walk(this, 0);
    return out;
  }
}

describe("popup-edit pure helpers", () => {
  it("scopes drags strictly to the same section or device group", () => {
    assert.equal(canDropInScope("1", "1"), true);
    assert.equal(canDropInScope("1", "2"), false);
    assert.equal(canDropInScope(undefined, "1"), false);
    assert.equal(canDropInScope("1", undefined), false);
  });

  it("reorders ids by moving draggedId to targetId slot", () => {
    assert.deepEqual(reorderIds(["a", "b", "c", "d"], "a", "c"), ["b", "c", "a", "d"]);
    assert.deepEqual(reorderIds(["a", "b", "c", "d"], "d", "b"), ["a", "d", "b", "c"]);
    assert.deepEqual(reorderIds(["a", "b"], "x", "b"), ["a", "b"]);
  });

  it("highlights the dragged widget and keeps the placeholder slot muted", () => {
    const css = popupEditStyles();
    const draggingBlock = css.slice(css.indexOf(".area-card-dragging {"), css.indexOf(".area-card-drag-placeholder {"));
    const placeholderBlock = css.slice(css.indexOf(".area-card-drag-placeholder {"), css.indexOf(".area-card-pin-order-section"));
    assert.ok(draggingBlock.includes("var(--primary-color, #03a9f4)"));
    assert.ok(draggingBlock.includes("scale: 1.02"));
    assert.equal(placeholderBlock.includes("var(--primary-color"), false);
  });
});

describe("popup-edit DOM behavior", () => {
  const previousDocument = globalThis.document;
  const previousElement = globalThis.Element;
  const previousHTMLElement = globalThis.HTMLElement;
  const previousWindow = globalThis.window;

  const windowListeners = new Map<string, Set<(e: FakeEvent) => void>>();

  function dispatchWindowEvent(ev: FakeEvent): void {
    for (const fn of [...(windowListeners.get(ev.type) ?? [])]) {
      fn(ev);
    }
  }

  before(() => {
    Object.defineProperty(globalThis, "Element", { configurable: true, writable: true, value: FakeElement });
    Object.defineProperty(globalThis, "HTMLElement", { configurable: true, writable: true, value: FakeElement });
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      writable: true,
      value: {
        createElement: (tag: string) => new FakeElement(tag),
      },
    });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      writable: true,
      value: {
        addEventListener: (type: string, fn: (e: FakeEvent) => void) => {
          let set = windowListeners.get(type);
          if (!set) {
            set = new Set();
            windowListeners.set(type, set);
          }
          set.add(fn);
        },
        removeEventListener: (type: string, fn: (e: FakeEvent) => void) => {
          windowListeners.get(type)?.delete(fn);
        },
      },
    });
  });

  after(() => {
    Object.defineProperty(globalThis, "document", { configurable: true, writable: true, value: previousDocument });
    Object.defineProperty(globalThis, "Element", { configurable: true, writable: true, value: previousElement });
    Object.defineProperty(globalThis, "HTMLElement", { configurable: true, writable: true, value: previousHTMLElement });
    Object.defineProperty(globalThis, "window", { configurable: true, writable: true, value: previousWindow });
  });

  function makePopupRoot(): { root: FakeElement; popup: FakeElement; grid: FakeElement; header: FakeElement } {
    const root = new FakeElement("div");
    let released = false;
    root.host = {
      releasePopupSlideToClose: () => {
        released = true;
      },
    };
    (root as FakeElement & { released?: () => boolean }).released = () => released;
    const popup = new FakeElement("div");
    popup.className = "bubble-pop-up is-popup-opened";
    const header = new FakeElement("div");
    header.className = "bubble-header-container";
    const grid = new FakeElement("div");
    grid.className = BUBBLE_CARDS_GRID;
    popup.append(header, grid);
    root.append(popup);
    return { root, popup, grid, header };
  }

  function makeEvent(
    type: string,
    path: unknown[],
    extra: Partial<Pick<FakeEvent, "button" | "pointerType" | "clientX" | "clientY" | "key">> = {},
  ): FakeEvent {
    const ev: FakeEvent = {
      type,
      target: path[0],
      defaultPrevented: false,
      propagationStopped: false,
      path,
      ...extra,
      preventDefault() {
        ev.defaultPrevented = true;
      },
      stopPropagation() {
        ev.propagationStopped = true;
      },
      composedPath() {
        return path;
      },
    };
    return ev;
  }

  it("renders Pin Order only when editing and always+whenOn >= 2 (excluding background), with dimmed While on badge", () => {
    const { root, grid } = makePopupRoot();
    const firstCard = new FakeElement("div");
    firstCard.className = "card";
    grid.append(firstCard);

    const popupCards = [
      { type: "custom:area-card-mushroom-entity-card", entity: "light.a", grid_options: { columns: 6 } },
      { type: "custom:area-card-mushroom-entity-card", entity: "media_player.tv", grid_options: { columns: 6 } },
      { type: "picture-entity", entity: "camera.front", grid_options: { columns: 12 } },
    ];
    const hass: ClassifierHass = {
      states: {
        "light.a": { state: "on", attributes: {} },
        "media_player.tv": { state: "off", attributes: {} },
        "camera.front": { state: "idle", attributes: {} },
      },
    };

    // Not editing -> no Pin Order section
    const twoPins: AreaPins = { always: ["light.a"], whenOn: ["media_player.tv"], background: ["camera.front"] };
    syncPinOrderSection(root, { editing: false, pins: twoPins, popupCards, hass, onReorderPins: () => {} });
    assert.equal(grid.querySelector(".area-card-pin-order-section"), null);

    // Editing, but only 1 always + 1 background camera -> still no Pin Order section
    const onePinAndBg: AreaPins = { always: ["light.a"], whenOn: [], background: ["camera.front"] };
    syncPinOrderSection(root, { editing: true, pins: onePinAndBg, popupCards, hass, onReorderPins: () => {} });
    assert.equal(grid.querySelector(".area-card-pin-order-section"), null);

    // Editing with always + whenOn >= 2 -> renders at top with 2-column row and "While on" badge for off when-on pin
    syncPinOrderSection(root, { editing: true, pins: twoPins, popupCards, hass, onReorderPins: () => {} });
    const section = grid.firstElementChild;
    assert.ok(section?.classList.contains("area-card-pin-order-section"));
    const items = section.querySelectorAll(".area-card-pin-order-item");
    assert.equal(items.length, 2);
    assert.equal(items[0].style.width, "50%");
    assert.equal(items[1].style.width, "50%");
    assert.equal(items[1].dataset.pinWhenOnOff, "1");
    assert.equal(items[1].querySelector(".area-card-pin-order-badge")?.textContent, "While on");
  });

  it("marks draggable entity rows per section/group scope and skips titles and chips", () => {
    const { root, grid } = makePopupRoot();
    const makeCell = (cfg: Record<string, unknown>) => {
      const cell = new FakeElement("div");
      cell.className = "card";
      const inner = new FakeElement("hui-card");
      inner.config = cfg;
      cell.append(inner);
      return cell;
    };

    const statusTitle = makeCell({ type: "custom:area-card-section-title", title: "Status" });
    const chips = makeCell({ type: "custom:area-card-mushroom-chips-card", chips: [] });
    const lightsTitle = makeCell({ type: "custom:area-card-section-title", title: "Lights" });
    const light1 = makeCell({ type: "custom:area-card-mushroom-entity-card", entity: "light.a" });
    const light2 = makeCell({ type: "custom:area-card-mushroom-entity-card", entity: "light.b" });
    const switchesTitle = makeCell({ type: "custom:area-card-section-title", title: "Switches" });
    const switch1 = makeCell({ type: "custom:area-card-mushroom-entity-card", entity: "switch.1" });
    grid.append(statusTitle, chips, lightsTitle, light1, light2, switchesTitle, switch1);

    syncSectionDragOrder(root, { editing: true, onReorderScope: () => {} });
    assert.equal(statusTitle.dataset.editDraggable, undefined);
    assert.equal(chips.dataset.editDraggable, undefined);
    assert.equal(lightsTitle.dataset.editDraggable, undefined);
    assert.equal(light1.dataset.editDraggable, "1");
    assert.equal(light2.dataset.editDraggable, "1");
    assert.equal(light1.dataset.editScope, light2.dataset.editScope);
    assert.equal(switch1.dataset.editDraggable, "1");
    assert.notEqual(light1.dataset.editScope, switch1.dataset.editScope);

    // Turning off edit mode cleans up handles and draggable attributes
    syncSectionDragOrder(root, { editing: false, onReorderScope: () => {} });
    assert.equal(light1.dataset.editDraggable, undefined);
    assert.equal(light1.querySelector(".area-card-drag-handle"), null);
  });

  it("blocks card tap/hold actions and Bubble swipe-to-close only while editing, while keeping pin switches and header working", () => {
    const { root, popup, grid, header } = makePopupRoot();
    const card = new FakeElement("div");
    card.className = "card";
    const pinSwitch = new FakeElement("div");
    pinSwitch.className = "area-card-pin-switch";
    card.append(pinSwitch);
    grid.append(card);

    syncPopupEditGuards(root, true);

    // Swipe-to-close touchstart inside .bubble-pop-up is stopped from reaching .bubble-pop-up
    const touchEv = makeEvent("touchstart", [card, grid, popup, root]);
    root.dispatchCapture(touchEv);
    assert.equal(touchEv.propagationStopped, true);

    // Card tap & hass-action inside grid are blocked
    const clickEv = makeEvent("click", [card, grid, popup, root]);
    root.dispatchCapture(clickEv);
    assert.equal(clickEv.defaultPrevented, true);
    assert.equal(clickEv.propagationStopped, true);

    const hassActionEv = makeEvent("hass-action", [card, grid, popup, root]);
    root.dispatchCapture(hassActionEv);
    assert.equal(hassActionEv.defaultPrevented, true);

    // Pin switch click is NOT blocked
    const pinClick = makeEvent("click", [pinSwitch, card, grid, popup, root]);
    root.dispatchCapture(pinClick);
    assert.equal(pinClick.defaultPrevented, false);
    assert.equal(pinClick.propagationStopped, false);

    // Header button click is NOT blocked
    const headerClick = makeEvent("click", [header, popup, root]);
    root.dispatchCapture(headerClick);
    assert.equal(headerClick.defaultPrevented, false);

    // When editing turns false, guards stop blocking
    syncPopupEditGuards(root, false);
    const normalTouch = makeEvent("touchstart", [card, grid, popup, root]);
    root.dispatchCapture(normalTouch);
    assert.equal(normalTouch.propagationStopped, false);

    const normalClick = makeEvent("click", [card, grid, popup, root]);
    root.dispatchCapture(normalClick);
    assert.equal(normalClick.defaultPrevented, false);
  });

  it("produces zero DOM childList mutations on repeat sync calls (prevents MutationObserver feedback loop)", () => {
    const { root, grid } = makePopupRoot();
    const makeCell = (cfg: Record<string, unknown>) => {
      const cell = new FakeElement("div");
      cell.className = "card";
      const inner = new FakeElement("hui-card");
      inner.config = cfg;
      cell.append(inner);
      return cell;
    };

    const title = makeCell({ type: "custom:area-card-section-title", title: "Lights" });
    const light1 = makeCell({ type: "custom:area-card-mushroom-entity-card", entity: "light.a", grid_options: { columns: 6 } });
    const light2 = makeCell({ type: "custom:area-card-mushroom-entity-card", entity: "light.b", grid_options: { columns: 6 } });
    grid.append(title, light1, light2);

    const popupCards = [
      { type: "custom:area-card-mushroom-entity-card", entity: "light.a", grid_options: { columns: 6 } },
      { type: "custom:area-card-mushroom-entity-card", entity: "light.b", grid_options: { columns: 6 } },
    ];
    const pins: AreaPins = { always: ["light.a"], whenOn: ["light.b"], background: [] };
    const hass: ClassifierHass = {
      states: {
        "light.a": { state: "on", attributes: {} },
        "light.b": { state: "off", attributes: {} },
      },
    };

    const runAll = () => {
      syncPopupEditGuards(root, true);
      syncPinOrderSection(root, { editing: true, pins, popupCards, hass, onReorderPins: () => {} });
      syncSectionDragOrder(root, { editing: true, onReorderScope: () => {} });
    };

    // Initial pass populates edit UI
    runAll();

    // Attach mutation counter across the entire subtree (simulating MutationObserver)
    let mutations = 0;
    const attachObserver = (el: FakeElement) => {
      el.onMutate = () => {
        mutations += 1;
      };
      for (const child of el.children) attachObserver(child);
    };
    attachObserver(root);

    // Repeat passes with unchanged state must cause zero childList mutations
    runAll();
    runAll();
    assert.equal(mutations, 0);
  });

  it("renders Card Background selector above Pin Order, highlights active choice, and allows clicks in edit mode", () => {
    const { root, popup, grid } = makePopupRoot();
    const popupCards = [
      { type: "custom:area-card-mushroom-entity-card", entity: "light.a", grid_options: { columns: 6 } },
      { type: "custom:area-card-mushroom-entity-card", entity: "light.b", grid_options: { columns: 6 } },
    ];
    const hass: ClassifierHass = {
      states: {
        "light.a": { state: "on", attributes: {} },
        "light.b": { state: "on", attributes: {} },
        "camera.front": { state: "idle", attributes: { friendly_name: "Kitchen Front" } },
      },
    };
    const pins: AreaPins = { always: ["light.a", "light.b"], whenOn: [], background: [] };

    const choices = cardBackgroundOptions({
      areaPicture: "/local/kitchen.jpg",
      cameras: ["camera.front"],
      states: hass.states,
      roomName: "Kitchen",
    });
    assert.deepEqual(choices, [
      { label: "Light tint (default)", mode: { mode: "light-tint" } },
      { label: "Area picture", mode: { mode: "area-picture" } },
      { label: "Camera: Front", mode: { mode: "camera", entityId: "camera.front" } },
    ]);

    let selected: AreaBackgroundMode | null = null;
    syncPopupEditGuards(root, true);
    syncCardBackgroundSection(root, {
      editing: true,
      current: { mode: "area-picture" },
      areaPicture: "/local/kitchen.jpg",
      cameras: ["camera.front"],
      states: hass.states,
      roomName: "Kitchen",
      onSelect: (mode) => {
        selected = mode;
      },
    });
    syncPinOrderSection(root, { editing: true, pins, popupCards, hass, onReorderPins: () => {} });

    const bgSection = grid.firstElementChild;
    assert.ok(bgSection?.classList.contains("area-card-bg-section"));
    assert.ok(grid.children[1]?.classList.contains("area-card-pin-order-section"));

    const buttons = bgSection.querySelectorAll(".area-card-bg-option");
    assert.equal(buttons.length, 3);
    assert.equal(buttons[0].classList.contains("is-active"), false);
    assert.equal(buttons[1].classList.contains("is-active"), true);
    assert.equal(buttons[1].attributes["aria-pressed"], "true");

    // Click on Camera option is not blocked by edit guards and invokes onSelect
    const clickEv = makeEvent("click", [buttons[2], bgSection, grid, popup, root]);
    root.dispatchCapture(clickEv);
    assert.equal(clickEv.defaultPrevented, false);
    buttons[2].dispatchEvent(clickEv);
    assert.deepEqual(selected, { mode: "camera", entityId: "camera.front" });

    // Turning off edit mode removes the Card Background section
    syncCardBackgroundSection(root, {
      editing: false,
      current: { mode: "light-tint" },
      areaPicture: null,
      cameras: [],
      onSelect: () => {},
    });
    assert.equal(grid.querySelector(".area-card-bg-section"), null);
  });

  it("ignores non-primary mouse buttons, pin switches/menus, touch outside drag handle, and movement below 5px threshold", () => {
    const { root, grid } = makePopupRoot();
    const makeCell = (entity: string) => {
      const cell = new FakeElement("div");
      cell.className = "card";
      const inner = new FakeElement("hui-card");
      inner.config = { type: "custom:area-card-mushroom-entity-card", entity };
      cell.append(inner);
      return cell;
    };

    const title = makeCell("light.title");
    (title.children[0] as FakeElement).config = { type: "custom:area-card-section-title", title: "Lights" };
    const light1 = makeCell("light.a");
    const pinSwitch = new FakeElement("div");
    pinSwitch.className = "area-card-pin-switch";
    const pinMenu = new FakeElement("div");
    pinMenu.className = "area-card-pin-menu";
    light1.append(pinSwitch, pinMenu);
    light1.setRect(0, 50, 200, 40);
    grid.append(title, light1);

    syncSectionDragOrder(root, { editing: true, onReorderScope: () => {} });

    // Non-primary mouse button (right-click)
    light1.dispatchEvent(makeEvent("pointerdown", [light1], { pointerType: "mouse", button: 2, clientX: 10, clientY: 60 }));
    dispatchWindowEvent(makeEvent("pointermove", [], { clientX: 10, clientY: 120 }));
    assert.equal(isPopupDragActive(root), false);
    dispatchWindowEvent(makeEvent("pointerup", []));

    // Pin switch & pin menu ignore drag
    light1.dispatchEvent(makeEvent("pointerdown", [pinSwitch, light1], { pointerType: "mouse", button: 0, clientX: 10, clientY: 60 }));
    dispatchWindowEvent(makeEvent("pointermove", [], { clientX: 10, clientY: 120 }));
    assert.equal(isPopupDragActive(root), false);

    light1.dispatchEvent(makeEvent("pointerdown", [pinMenu, light1], { pointerType: "mouse", button: 0, clientX: 10, clientY: 60 }));
    dispatchWindowEvent(makeEvent("pointermove", [], { clientX: 10, clientY: 120 }));
    assert.equal(isPopupDragActive(root), false);

    // Touch outside .area-card-drag-handle is ignored
    light1.dispatchEvent(makeEvent("pointerdown", [light1], { pointerType: "touch", button: 0, clientX: 10, clientY: 60 }));
    dispatchWindowEvent(makeEvent("pointermove", [], { clientX: 10, clientY: 120 }));
    assert.equal(isPopupDragActive(root), false);

    // Mouse movement < 5px does not start drag
    light1.dispatchEvent(makeEvent("pointerdown", [light1], { pointerType: "mouse", button: 0, clientX: 10, clientY: 60 }));
    dispatchWindowEvent(makeEvent("pointermove", [], { clientX: 12, clientY: 62 }));
    assert.equal(isPopupDragActive(root), false);
    assert.equal(light1.classList.contains("area-card-dragging"), false);
    dispatchWindowEvent(makeEvent("pointerup", []));
  });

  it("follows cursor, live-reorders within scope with placeholder, enforces scope boundaries, and commits on pointerup", () => {
    const { root, grid } = makePopupRoot();
    const makeCell = (cfg: Record<string, unknown>) => {
      const cell = new FakeElement("div");
      cell.className = "card";
      const inner = new FakeElement("hui-card");
      inner.config = cfg;
      cell.append(inner);
      return cell;
    };

    const lightsTitle = makeCell({ type: "custom:area-card-section-title", title: "Lights" });
    const light1 = makeCell({ type: "custom:area-card-mushroom-entity-card", entity: "light.a" });
    const light2 = makeCell({ type: "custom:area-card-mushroom-entity-card", entity: "light.b" });
    const switchesTitle = makeCell({ type: "custom:area-card-section-title", title: "Switches" });
    const switch1 = makeCell({ type: "custom:area-card-mushroom-entity-card", entity: "switch.1" });
    grid.append(lightsTitle, light1, light2, switchesTitle, switch1);

    // Dynamic layout rects based on DOM order in grid (excluding fixed-position dragging item)
    const assignDynamicRect = (el: FakeElement) => {
      el.setRectProvider(() => {
        if (el.dataset.editDragging === "1") {
          return { left: 0, top: 0, right: 200, bottom: 40, width: 200, height: 40 };
        }
        const flow = grid.children.filter((c) => c.dataset.editDragging !== "1");
        const idx = flow.indexOf(el);
        const top = Math.max(0, idx) * 50;
        return { left: 0, top, right: 200, bottom: top + 40, width: 200, height: 40 };
      });
    };
    assignDynamicRect(light1);
    assignDynamicRect(light2);
    assignDynamicRect(switch1);

    let committed: { draggedId: string; scopeIds: string[] } | null = null;
    syncSectionDragOrder(root, {
      editing: true,
      onReorderScope: (draggedId, scopeIds) => {
        committed = { draggedId, scopeIds };
      },
    });

    // Drag light1 down over light2 (starts at top=50, light2 is at top=100..140)
    light1.dispatchEvent(makeEvent("pointerdown", [light1], { pointerType: "mouse", button: 0, clientX: 50, clientY: 70 }));
    dispatchWindowEvent(makeEvent("pointermove", [], { clientX: 60, clientY: 125 }));

    assert.equal(isPopupDragActive(root), true);
    assert.equal(light1.classList.contains("area-card-dragging"), true);
    assert.equal(light1.style.position, "fixed");
    assert.equal(light1.style.transform, "translate3d(10px, 105px, 0)");

    const placeholder = grid.querySelector(".area-card-drag-placeholder");
    assert.ok(placeholder, "placeholder should be present in grid");

    // Live DOM order should now have light2 before placeholder
    const scopeChildren = grid.children.filter(
      (c) => c.dataset.editScope === light1.dataset.editScope && c.dataset.editDragging !== "1",
    );
    assert.deepEqual(
      scopeChildren.map((c) => c.dataset.editEntity),
      ["light.b", "light.a"],
    );

    // Observer-triggered syncSectionDragOrder while dragging must NOT clobber active drag
    syncSectionDragOrder(root, { editing: true, onReorderScope: () => {} });
    assert.ok(grid.querySelector(".area-card-drag-placeholder"));

    // Moving over switch1 (different scope) must NOT move placeholder out of Lights scope
    dispatchWindowEvent(makeEvent("pointermove", [], { clientX: 60, clientY: 225 }));
    const scopeChildrenAfterCross = grid.children.filter(
      (c) => c.dataset.editScope === light1.dataset.editScope && c.dataset.editDragging !== "1",
    );
    assert.deepEqual(
      scopeChildrenAfterCross.map((c) => c.dataset.editEntity),
      ["light.b", "light.a"],
    );

    // Commit on pointerup
    dispatchWindowEvent(makeEvent("pointerup", []));
    assert.equal(isPopupDragActive(root), false);
    assert.equal(grid.querySelector(".area-card-drag-placeholder"), null);
    assert.equal(light1.classList.contains("area-card-dragging"), false);
    assert.equal(light1.style.position || "", "");
    assert.deepEqual(committed, { draggedId: "light.a", scopeIds: ["light.b", "light.a"] });
  });

  it("reverts section drag order cleanly on pointercancel and Escape without committing", () => {
    const { root, grid } = makePopupRoot();
    const makeCell = (cfg: Record<string, unknown>) => {
      const cell = new FakeElement("div");
      cell.className = "card";
      const inner = new FakeElement("hui-card");
      inner.config = cfg;
      cell.append(inner);
      return cell;
    };

    const title = makeCell({ type: "custom:area-card-section-title", title: "Lights" });
    const light1 = makeCell({ type: "custom:area-card-mushroom-entity-card", entity: "light.a" });
    const light2 = makeCell({ type: "custom:area-card-mushroom-entity-card", entity: "light.b" });
    grid.append(title, light1, light2);

    const assignRect = (el: FakeElement) => {
      el.setRectProvider(() => {
        if (el.dataset.editDragging === "1") {
          return { left: 0, top: 0, right: 200, bottom: 40, width: 200, height: 40 };
        }
        const flow = grid.children.filter((c) => c.dataset.editDragging !== "1");
        const idx = flow.indexOf(el);
        const top = Math.max(0, idx) * 50;
        return { left: 0, top, right: 200, bottom: top + 40, width: 200, height: 40 };
      });
    };
    assignRect(light1);
    assignRect(light2);

    let commitCalls = 0;
    syncSectionDragOrder(root, {
      editing: true,
      onReorderScope: () => {
        commitCalls += 1;
      },
    });

    // Touch drag via handle, move over light2, then pointercancel
    const handle = light1.querySelector(".area-card-drag-handle")!;
    light1.dispatchEvent(makeEvent("pointerdown", [handle, light1], { pointerType: "touch", button: 0, clientX: 50, clientY: 70 }));
    dispatchWindowEvent(makeEvent("pointermove", [], { clientX: 50, clientY: 125 }));
    assert.equal(isPopupDragActive(root), true);
    dispatchWindowEvent(makeEvent("pointercancel", []));

    assert.equal(isPopupDragActive(root), false);
    assert.equal(commitCalls, 0);
    assert.equal(grid.querySelector(".area-card-drag-placeholder"), null);
    assert.deepEqual(
      grid.children.slice(1).map((c) => c.dataset.editEntity),
      ["light.a", "light.b"],
    );

    // Drag again and press Escape
    light1.dispatchEvent(makeEvent("pointerdown", [light1], { pointerType: "mouse", button: 0, clientX: 50, clientY: 70 }));
    dispatchWindowEvent(makeEvent("pointermove", [], { clientX: 50, clientY: 125 }));
    assert.equal(isPopupDragActive(root), true);
    dispatchWindowEvent(makeEvent("keydown", [], { key: "Escape" }));

    assert.equal(isPopupDragActive(root), false);
    assert.equal(commitCalls, 0);
    assert.deepEqual(
      grid.children.slice(1).map((c) => c.dataset.editEntity),
      ["light.a", "light.b"],
    );
  });

  it("live-reorders Pin Order across 2-column rows and commits on pointerup", () => {
    const { root, grid } = makePopupRoot();
    const popupCards = [
      { type: "custom:area-card-mushroom-entity-card", entity: "light.a", grid_options: { columns: 6 } },
      { type: "custom:area-card-mushroom-entity-card", entity: "light.b", grid_options: { columns: 6 } },
      { type: "custom:area-card-mushroom-entity-card", entity: "light.c", grid_options: { columns: 12 } },
    ];
    const hass: ClassifierHass = {
      states: {
        "light.a": { state: "on", attributes: {} },
        "light.b": { state: "on", attributes: {} },
        "light.c": { state: "on", attributes: {} },
      },
    };
    const pins: AreaPins = { always: ["light.a", "light.b", "light.c"], whenOn: [], background: [] };

    let committedPins: string[] | null = null;
    syncPinOrderSection(root, {
      editing: true,
      pins,
      popupCards,
      hass,
      onReorderPins: (next) => {
        committedPins = next;
      },
    });

    const preview = grid.querySelector(".area-card-pin-order-preview")!;
    const items = preview.querySelectorAll("[data-pin-order-entity]");
    assert.equal(items.length, 3);
    const [itemA, itemB, itemC] = items;

    // Assign rects based on current row/column placement
    for (const el of items) {
      el.setRectProvider(() => {
        if (el.dataset.editDragging === "1") {
          return { left: 0, top: 0, right: 100, bottom: 40, width: 100, height: 40 };
        }
        const rows = preview.children.filter((r) => r.classList.contains("area-card-pin-order-row"));
        for (let r = 0; r < rows.length; r += 1) {
          const idx = rows[r].children.indexOf(el);
          if (idx !== -1) {
            const w = rows[r].children.length === 2 ? 100 : 200;
            const left = idx * 100;
            const top = r * 50;
            return { left, top, right: left + w, bottom: top + 40, width: w, height: 40 };
          }
        }
        return { left: 0, top: 0, right: 100, bottom: 40, width: 100, height: 40 };
      });
    }

    // Drag itemA (row 0, col 0) down over itemC (row 1, full-width)
    itemA.dispatchEvent(makeEvent("pointerdown", [itemA], { pointerType: "mouse", button: 0, clientX: 50, clientY: 20 }));
    dispatchWindowEvent(makeEvent("pointermove", [], { clientX: 100, clientY: 75 }));

    assert.equal(isPopupDragActive(root), true);
    assert.ok(preview.querySelector(".area-card-drag-placeholder"));

    // Live 2-column pairing pairs light.b + placeholder (light.a) in row 0, and light.c (full) in row 1
    const rowsAfterMove = preview.children.filter((r) => r.classList.contains("area-card-pin-order-row"));
    assert.equal(rowsAfterMove.length, 2);
    assert.equal(rowsAfterMove[0].children.length, 2);
    assert.equal(rowsAfterMove[0].children[0].dataset.pinOrderEntity, "light.b");
    assert.ok(rowsAfterMove[0].children[1].classList.contains("area-card-drag-placeholder"));
    assert.equal(rowsAfterMove[1].children[0].dataset.pinOrderEntity, "light.c");

    // Observer-triggered syncPinOrderSection during active drag must not clobber
    syncPinOrderSection(root, { editing: true, pins, popupCards, hass, onReorderPins: () => {} });
    assert.ok(preview.querySelector(".area-card-drag-placeholder"));

    dispatchWindowEvent(makeEvent("pointerup", []));
    assert.equal(isPopupDragActive(root), false);
    assert.deepEqual(committedPins, ["light.b", "light.c", "light.a"]);
    void itemB;
    void itemC;
  });
});
