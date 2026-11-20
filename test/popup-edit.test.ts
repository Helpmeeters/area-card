import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import Sortable, { type MoveEvent, type Options as SortableOptions, type SortableEvent } from "sortablejs";
import {
  canDropInScope,
  cardBackgroundOptions,
  isPopupDragActive,
  popupEditStyles,
  reorderIds,
  setSortableFactoryForTest,
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
  preventDefault(): void;
  stopPropagation(): void;
  composedPath(): unknown[];
};

class FakeTextNode {
  nodeType = 3;
  textContent: string;
  parentElement: FakeElement | null = null;
  constructor(text: string) {
    this.textContent = text;
  }
}

class FakeElement {
  nodeType = 1;
  tagName: string;
  localName: string;
  namespaceURI = "http://www.w3.org/1999/xhtml";
  id = "";
  className = "";
  textContent = "";
  dataset: Record<string, string> = {};
  attributesMap = new Map<string, string>();
  style: Record<string, string> & {
    setProperty(k: string, v: string): void;
    removeProperty(k: string): void;
  };
  children: FakeElement[] = [];
  childNodes: Array<FakeElement | FakeTextNode> = [];
  parentElement: FakeElement | null = null;
  config?: Record<string, unknown>;
  hass?: ClassifierHass;
  shadowRoot: (FakeElement & { adoptedStyleSheets?: unknown[] }) | null = null;
  host?: { releasePopupSlideToClose?: () => void };
  isConnected = true;
  private listeners = new Map<string, ListenerEntry[]>();

  constructor(tag = "div", ns = "http://www.w3.org/1999/xhtml") {
    this.tagName = tag.toUpperCase();
    this.localName = tag.toLowerCase();
    this.namespaceURI = ns;
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

  get attributes(): Array<{ name: string; value: string }> {
    const out: Array<{ name: string; value: string }> = [];
    if (this.className) out.push({ name: "class", value: this.className });
    for (const [name, value] of this.attributesMap) {
      if (name !== "class") out.push({ name, value });
    }
    return out;
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
    if (name === "class") this.className = value;
    this.attributesMap.set(name, value);
  }

  getAttribute(name: string): string | null {
    if (name === "class") return this.className || null;
    return this.attributesMap.get(name) ?? null;
  }

  attachShadow(): FakeElement & { adoptedStyleSheets?: unknown[] } {
    const sr = new FakeElement("#shadow-root") as FakeElement & { adoptedStyleSheets?: unknown[] };
    sr.adoptedStyleSheets = [];
    this.shadowRoot = sr;
    return sr;
  }

  append(...nodes: Array<FakeElement | FakeTextNode>): void {
    for (const n of nodes) {
      if (n.parentElement) {
        n.parentElement.childNodes = n.parentElement.childNodes.filter((c) => c !== n);
        if (n instanceof FakeElement) {
          n.parentElement.children = n.parentElement.children.filter((c) => c !== n);
        }
      }
      n.parentElement = this;
      this.childNodes.push(n);
      if (n instanceof FakeElement) this.children.push(n);
    }
    this.onMutate?.();
  }

  insertBefore(node: FakeElement, ref: FakeElement | null): FakeElement {
    if (node.parentElement) {
      node.parentElement.childNodes = node.parentElement.childNodes.filter((c) => c !== node);
      node.parentElement.children = node.parentElement.children.filter((c) => c !== node);
    }
    node.parentElement = this;
    if (!ref) {
      this.children.push(node);
      this.childNodes.push(node);
    } else {
      const idx = this.children.indexOf(ref);
      if (idx === -1) this.children.push(node);
      else this.children.splice(idx, 0, node);
      const cIdx = this.childNodes.indexOf(ref);
      if (cIdx === -1) this.childNodes.push(node);
      else this.childNodes.splice(cIdx, 0, node);
    }
    this.onMutate?.();
    return node;
  }

  appendChild(node: FakeElement | FakeTextNode): FakeElement | FakeTextNode {
    this.append(node);
    return node;
  }

  prepend(...nodes: FakeElement[]): void {
    for (let i = nodes.length - 1; i >= 0; i -= 1) {
      const n = nodes[i];
      if (n.parentElement) {
        n.parentElement.childNodes = n.parentElement.childNodes.filter((c) => c !== n);
        n.parentElement.children = n.parentElement.children.filter((c) => c !== n);
      }
      n.parentElement = this;
      this.children.unshift(n);
      this.childNodes.unshift(n);
    }
    this.onMutate?.();
  }

  replaceChildren(...nodes: Array<FakeElement | FakeTextNode>): void {
    for (const c of this.childNodes) c.parentElement = null;
    this.children = [];
    this.childNodes = [];
    this.append(...nodes);
  }

  remove(): void {
    if (!this.parentElement) return;
    const parent = this.parentElement;
    parent.children = parent.children.filter((c) => c !== this);
    parent.childNodes = parent.childNodes.filter((c) => c !== this);
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
    const attrMatches = [...clean.matchAll(/\[([^\]=]+)(?:=['"]?([^'"\]]+)['"]?)?\]/g)];
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

interface RecordedSortable {
  el: FakeElement;
  options: SortableOptions;
  destroyed: boolean;
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

  it("keeps the floating wrapper transparent without artificial outlines and shows the new-row zone while dragging", () => {
    const css = popupEditStyles();
    const draggingBlock = css.slice(css.indexOf(".area-card-dragging {"), css.indexOf(".area-card-drag-placeholder {"));
    assert.ok(draggingBlock.includes("outline: none !important;"));
    assert.equal(draggingBlock.includes("var(--primary-color"), false);
    assert.ok(css.includes(".area-card-pin-order-section.is-dragging > .area-card-pin-new-row"));
  });
});

describe("popup-edit DOM behavior", () => {
  const previousDocument = globalThis.document;
  const previousElement = globalThis.Element;
  const previousHTMLElement = globalThis.HTMLElement;
  const sortables: RecordedSortable[] = [];

  before(() => {
    Object.defineProperty(globalThis, "Element", { configurable: true, writable: true, value: FakeElement });
    Object.defineProperty(globalThis, "HTMLElement", { configurable: true, writable: true, value: FakeElement });
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      writable: true,
      value: {
        createElement: (tag: string) => new FakeElement(tag),
        createElementNS: (ns: string, tag: string) => new FakeElement(tag, ns),
        createTextNode: (text: string) => new FakeTextNode(text),
      },
    });
    setSortableFactoryForTest((el, options) => {
      const rec: RecordedSortable = {
        el: el as unknown as FakeElement,
        options,
        destroyed: false,
      };
      sortables.push(rec);
      return {
        destroy() {
          rec.destroyed = true;
        },
      } as unknown as Sortable;
    });
  });

  after(() => {
    setSortableFactoryForTest(null);
    Object.defineProperty(globalThis, "document", { configurable: true, writable: true, value: previousDocument });
    Object.defineProperty(globalThis, "Element", { configurable: true, writable: true, value: previousElement });
    Object.defineProperty(globalThis, "HTMLElement", { configurable: true, writable: true, value: previousHTMLElement });
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

  function makeEvent(type: string, path: unknown[]): FakeEvent {
    const ev: FakeEvent = {
      type,
      target: path[0],
      defaultPrevented: false,
      propagationStopped: false,
      path,
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

    const twoPins: AreaPins = { always: ["light.a"], whenOn: ["media_player.tv"], background: ["camera.front"] };
    syncPinOrderSection(root, { editing: false, pins: twoPins, popupCards, hass, onReorderPins: () => {} });
    assert.equal(grid.querySelector(".area-card-pin-order-section"), null);

    const onePinAndBg: AreaPins = { always: ["light.a"], whenOn: [], background: ["camera.front"] };
    syncPinOrderSection(root, { editing: true, pins: onePinAndBg, popupCards, hass, onReorderPins: () => {} });
    assert.equal(grid.querySelector(".area-card-pin-order-section"), null);

    syncPinOrderSection(root, { editing: true, pins: twoPins, popupCards, hass, onReorderPins: () => {} });
    const section = grid.firstElementChild;
    assert.ok(section?.classList.contains("area-card-pin-order-section"));
    assert.ok(section.querySelector(".area-card-pin-new-row"));
    const items = section.querySelectorAll(".area-card-pin-order-item");
    assert.equal(items.length, 2);
    assert.equal(items[0].style.width, "50%");
    assert.equal(items[1].style.width, "50%");
    assert.equal(items[1].dataset.pinWhenOnOff, "1");
    assert.equal(items[1].querySelector(".area-card-pin-order-badge")?.textContent, "While on");
  });

  it("marks draggable entity rows per section/group scope, configures SortableJS without drag handles, and enforces scope onMove", () => {
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

    let committed: { draggedId: string; scopeIds: string[] } | null = null;
    syncSectionDragOrder(root, {
      editing: true,
      onReorderScope: (draggedId, scopeIds) => {
        committed = { draggedId, scopeIds };
      },
    });
    assert.equal(statusTitle.dataset.editDraggable, undefined);
    assert.equal(chips.dataset.editDraggable, undefined);
    assert.equal(lightsTitle.dataset.editDraggable, undefined);
    assert.equal(light1.dataset.editDraggable, "1");
    assert.equal(light2.dataset.editDraggable, "1");
    assert.equal(light1.dataset.editScope, light2.dataset.editScope);
    assert.equal(switch1.dataset.editDraggable, "1");
    assert.notEqual(light1.dataset.editScope, switch1.dataset.editScope);
    assert.equal(light1.querySelector(".area-card-drag-handle"), null);

    const gridSortable = sortables.find((s) => s.el === grid && !s.destroyed);
    assert.ok(gridSortable);
    assert.equal(gridSortable.options.handle, undefined);
    assert.equal(gridSortable.options.swapThreshold, 0.85);

    // Same scope allowed; cross-scope rejected
    assert.equal(
      gridSortable.options.onMove?.(
        { dragged: light1 as unknown as HTMLElement, related: light2 as unknown as HTMLElement } as MoveEvent,
        new Event("move"),
      ),
      true,
    );
    assert.equal(
      gridSortable.options.onMove?.(
        { dragged: light1 as unknown as HTMLElement, related: switch1 as unknown as HTMLElement } as MoveEvent,
        new Event("move"),
      ),
      false,
    );

    // Reorder within scope commits
    gridSortable.options.onStart?.({ item: light1 as unknown as HTMLElement } as SortableEvent);
    assert.equal(isPopupDragActive(root), true);
    grid.insertBefore(light2, light1);
    gridSortable.options.onEnd?.({ item: light1 as unknown as HTMLElement } as SortableEvent);
    assert.equal(isPopupDragActive(root), false);
    assert.deepEqual(committed, { draggedId: "light.a", scopeIds: ["light.b", "light.a"] });

    syncSectionDragOrder(root, { editing: false, onReorderScope: () => {} });
    assert.equal(light1.dataset.editDraggable, undefined);
    assert.equal(gridSortable.destroyed, true);
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

    const touchEv = makeEvent("touchstart", [card, grid, popup, root]);
    root.dispatchCapture(touchEv);
    assert.equal(touchEv.propagationStopped, true);

    const clickEv = makeEvent("click", [card, grid, popup, root]);
    root.dispatchCapture(clickEv);
    assert.equal(clickEv.defaultPrevented, true);
    assert.equal(clickEv.propagationStopped, true);

    const hassActionEv = makeEvent("hass-action", [card, grid, popup, root]);
    root.dispatchCapture(hassActionEv);
    assert.equal(hassActionEv.defaultPrevented, true);

    const pinClick = makeEvent("click", [pinSwitch, card, grid, popup, root]);
    root.dispatchCapture(pinClick);
    assert.equal(pinClick.defaultPrevented, false);
    assert.equal(pinClick.propagationStopped, false);

    const headerClick = makeEvent("click", [header, popup, root]);
    root.dispatchCapture(headerClick);
    assert.equal(headerClick.defaultPrevented, false);

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

    runAll();

    let mutations = 0;
    const attachObserver = (el: FakeElement) => {
      el.onMutate = () => {
        mutations += 1;
      };
      for (const child of el.children) attachObserver(child);
    };
    attachObserver(root);

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
        "media_player.kitchen": { state: "playing", attributes: { friendly_name: "Kitchen Speaker" } },
        "camera.front": { state: "idle", attributes: { friendly_name: "Kitchen Front" } },
      },
    };
    const pins: AreaPins = { always: ["light.a", "light.b"], whenOn: [], background: [] };

    const choices = cardBackgroundOptions({
      areaPicture: "/local/kitchen.jpg",
      cameras: ["camera.front"],
      mediaPlayers: ["media_player.kitchen"],
      states: hass.states,
      roomName: "Kitchen",
    });
    assert.deepEqual(choices, [
      { label: "Light tint (default)", mode: { mode: "light-tint" } },
      { label: "Area picture", mode: { mode: "area-picture" } },
      { label: "Media: Speaker", mode: { mode: "media-artwork", entityId: "media_player.kitchen" } },
      { label: "Camera: Front", mode: { mode: "camera", entityId: "camera.front" } },
    ]);

    const withoutMedia = cardBackgroundOptions({
      areaPicture: "/local/kitchen.jpg",
      cameras: ["camera.front"],
      mediaPlayers: [],
      states: hass.states,
      roomName: "Kitchen",
    });
    assert.deepEqual(withoutMedia, [
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
    assert.equal(buttons[1].getAttribute("aria-pressed"), "true");

    const clickEv = makeEvent("click", [buttons[2], bgSection, grid, popup, root]);
    root.dispatchCapture(clickEv);
    assert.equal(clickEv.defaultPrevented, false);
    buttons[2].dispatchEvent(clickEv);
    assert.deepEqual(selected, { mode: "camera", entityId: "camera.front" });

    syncCardBackgroundSection(root, {
      editing: false,
      current: { mode: "light-tint" },
      areaPicture: null,
      cameras: [],
      onSelect: () => {},
    });
    assert.equal(grid.querySelector(".area-card-bg-section"), null);
  });

  it("mirrors shadow DOM and slot attributes into Sortable.ghost so dragged cards look natural", () => {
    const { root, grid } = makePopupRoot();
    const popupCards = [
      { type: "custom:area-card-mushroom-entity-card", entity: "light.a", grid_options: { columns: 6 } },
      { type: "custom:area-card-mushroom-entity-card", entity: "light.b", grid_options: { columns: 6 } },
    ];
    const hass: ClassifierHass = {
      states: {
        "light.a": { state: "on", attributes: {} },
        "light.b": { state: "on", attributes: {} },
      },
    };
    const pins: AreaPins = { always: ["light.a", "light.b"], whenOn: [], background: [] };
    syncPinOrderSection(root, { editing: true, pins, popupCards, hass, onReorderPins: () => {} });

    const preview = grid.querySelector(".area-card-pin-order-preview")!;
    const itemA = preview.children[0];
    const huiCard = itemA.querySelector("hui-card")!;
    const cardSr = huiCard.attachShadow();
    const mush = new FakeElement("area-card-mushroom-template-card");
    const mushSr = mush.attachShadow();
    const haCard = new FakeElement("ha-card");
    haCard.attachShadow().append(new FakeElement("slot"));
    const stateItem = new FakeElement("area-card-mushroom-state-item");
    const iconSlot = new FakeElement("area-card-mushroom-shape-icon");
    iconSlot.setAttribute("slot", "icon");
    iconSlot.attachShadow();
    const infoSlot = new FakeElement("area-card-mushroom-state-info");
    infoSlot.setAttribute("slot", "info");
    const infoSr = infoSlot.attachShadow();
    const label = new FakeElement("span");
    label.append(new FakeTextNode("Corner Lamp"));
    infoSr.append(label);
    stateItem.append(iconSlot, infoSlot);
    haCard.append(stateItem);
    mushSr.append(haCard);
    cardSr.append(mush);

    const fakeGhost = new FakeElement("div");
    const prevGhost = Sortable.ghost;
    (Sortable as unknown as { ghost: unknown }).ghost = fakeGhost;
    try {
      const mainSortable = sortables.find((s) => s.el === preview && !s.destroyed)!;
      mainSortable.options.onStart?.({ item: itemA as unknown as HTMLElement } as SortableEvent);
      mainSortable.options.onEnd?.({ item: itemA as unknown as HTMLElement, to: preview as unknown as HTMLElement } as SortableEvent);
    } finally {
      (Sortable as unknown as { ghost: unknown }).ghost = prevGhost;
    }

    assert.equal(fakeGhost.style.opacity, "1");
    assert.equal(fakeGhost.style["max-width"], "none");
    const mirroredHui = fakeGhost.children[0];
    assert.ok(mirroredHui?.shadowRoot);
    const mirroredMush = mirroredHui.shadowRoot.children[0];
    assert.ok(mirroredMush?.shadowRoot);
    const mirroredHaCard = mirroredMush.shadowRoot.children[0];
    assert.equal(mirroredHaCard.style["border-radius"], "12px");
    const mirroredStateItem = mirroredHaCard.children[0];
    assert.equal(mirroredStateItem.children[0]?.getAttribute("slot"), "icon");
    assert.equal(mirroredStateItem.children[1]?.getAttribute("slot"), "info");
    assert.equal(
      (mirroredStateItem.children[1]?.shadowRoot?.children[0]?.childNodes[0] as FakeTextNode | undefined)?.textContent,
      "Corner Lamp",
    );
  });

  it("keeps the new-row drop zone visible during drag, splits lamps dragged under a full-width TV or into new-row, and re-pairs when dragged back", () => {
    const { root, grid } = makePopupRoot();
    const popupCards = [
      { type: "custom:area-card-mushroom-entity-card", entity: "light.corner", grid_options: { columns: 6 } },
      { type: "custom:area-card-mushroom-entity-card", entity: "light.work", grid_options: { columns: 6 } },
      { type: "custom:area-card-mushroom-entity-card", entity: "media_player.tv", grid_options: { columns: 12 } },
    ];
    const hass: ClassifierHass = {
      states: {
        "light.corner": { state: "on", attributes: {} },
        "light.work": { state: "on", attributes: {} },
        "media_player.tv": { state: "on", attributes: {} },
      },
    };
    const pins: AreaPins = {
      always: ["light.corner", "light.work", "media_player.tv"],
      whenOn: [],
      background: [],
    };

    const commits: Array<{ order: string[]; solo: string[] }> = [];
    syncPinOrderSection(root, {
      editing: true,
      pins,
      popupCards,
      hass,
      onReorderPins: (order, solo) => {
        commits.push({ order, solo });
      },
    });

    const section = grid.querySelector(".area-card-pin-order-section")!;
    const preview = section.querySelector(".area-card-pin-order-preview")!;
    const newRowEl = section.querySelector(".area-card-pin-new-row")!;
    const mainSortable = sortables.find((s) => s.el === preview && !s.destroyed)!;
    const newRowSortable = sortables.find((s) => s.el === newRowEl && !s.destroyed)!;
    assert.ok(mainSortable);
    assert.ok(newRowSortable);

    const [itemCorner, itemWork, itemTv] = preview.children;
    assert.equal(itemCorner.style.width, "50%");
    assert.equal(itemWork.style.width, "50%");
    assert.equal(itemTv.style.width, "100%");

    // 1. Horizontal swap within the same row keeps them paired (solo stays [])
    mainSortable.options.onStart?.({ item: itemWork as unknown as HTMLElement } as SortableEvent);
    assert.equal(section.classList.contains("is-dragging"), true);
    preview.insertBefore(itemWork, itemCorner);
    mainSortable.options.onEnd?.({ item: itemWork as unknown as HTMLElement, to: preview as unknown as HTMLElement } as SortableEvent);
    assert.equal(section.classList.contains("is-dragging"), false);
    assert.deepEqual(commits.at(-1), {
      order: ["light.work", "light.corner", "media_player.tv"],
      solo: [],
    });

    // 2. Dragging Corner Lamp into the always-visible newRowEl puts it under the TV as solo
    mainSortable.options.onStart?.({ item: itemCorner as unknown as HTMLElement } as SortableEvent);
    assert.equal(section.classList.contains("is-dragging"), true);
    newRowEl.append(itemCorner);
    mainSortable.options.onEnd?.({ item: itemCorner as unknown as HTMLElement, to: newRowEl as unknown as HTMLElement } as SortableEvent);
    assert.deepEqual(commits.at(-1), {
      order: ["light.work", "media_player.tv", "light.corner"],
      solo: ["light.corner"],
    });
    assert.equal(newRowEl.children.length, 0);
    assert.equal(itemWork.style.width, "100%");
    assert.equal(itemCorner.style.width, "100%");

    // 3. Dragging solo Corner Lamp back up next to unpaired Work Lamp re-pairs them!
    mainSortable.options.onStart?.({ item: itemCorner as unknown as HTMLElement } as SortableEvent);
    preview.insertBefore(itemCorner, itemTv);
    mainSortable.options.onEnd?.({ item: itemCorner as unknown as HTMLElement, to: preview as unknown as HTMLElement } as SortableEvent);
    assert.deepEqual(commits.at(-1), {
      order: ["light.work", "light.corner", "media_player.tv"],
      solo: [],
    });
    assert.equal(itemWork.style.width, "50%");
    assert.equal(itemCorner.style.width, "50%");

    // 4. Dragging Work Lamp directly below TV inside preview (without hitting newRowEl) ALSO splits it under TV!
    mainSortable.options.onStart?.({ item: itemWork as unknown as HTMLElement } as SortableEvent);
    preview.append(itemWork);
    mainSortable.options.onEnd?.({ item: itemWork as unknown as HTMLElement, to: preview as unknown as HTMLElement } as SortableEvent);
    assert.deepEqual(commits.at(-1), {
      order: ["light.corner", "media_player.tv", "light.work"],
      solo: ["light.work"],
    });
    assert.equal(itemCorner.style.width, "100%");
    assert.equal(itemWork.style.width, "100%");
  });
});
