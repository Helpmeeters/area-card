import Sortable, { type Options as SortableOptions } from "sortablejs";
import { CAMERA_ROW_TAG } from "./camera-detections";
import { areaBackgroundEqual, type AreaBackgroundMode } from "./background-mode";
import { stripRoomName } from "./names";
import { entityPinActive } from "./pin-visibility";
import {
  layoutPinnedCards,
  pinEntityId,
  pinMode,
  pinnedEdgeRadius,
  pinnedOrder,
  pinnedRowsSideBySide,
  pinnedSideBySideGridStyles,
  pinnedSideBySideHostStyles,
  pinnedSideBySideStyles,
  selectPinnedCards,
  type AreaPins,
  type PinnedEdge,
  type PinnedLayoutWidth,
} from "./pinned-entities";
import type { ClassifierHass, EntityState } from "./sections";
import { BUBBLE_CARDS_GRID } from "./tags";

const EDIT_STYLE_ID = "area-card-pin-edit-style";
const BG_SECTION_CLASS = "area-card-bg-section";
const PIN_ORDER_CLASS = "area-card-pin-order-section";
const PIN_NEW_ROW_CLASS = "area-card-pin-new-row";
const SECTION_TITLE_TYPE = "custom:area-card-section-title";

interface PinnedCardElement extends HTMLElement {
  hass?: ClassifierHass;
  config?: Record<string, unknown>;
  load?: () => void;
}

interface GuardState {
  editing: boolean;
}

type SortableFactory = (el: HTMLElement, options: SortableOptions) => Sortable;

let sortableFactory: SortableFactory = (el, options) => Sortable.create(el, options);

/** Override the SortableJS factory in unit tests; pass `null` to restore `Sortable.create`. */
export function setSortableFactoryForTest(factory: SortableFactory | null): void {
  sortableFactory = factory ?? ((el, options) => Sortable.create(el, options));
}

const guardStates = new WeakMap<ParentNode, GuardState>();
const activeDragGrids = new Set<HTMLElement>();
const sectionSortables = new WeakMap<HTMLElement, Sortable>();
const pinOrderSortables = new WeakMap<HTMLElement, { main: Sortable; newRow: Sortable }>();
let pinGroupCounter = 0;

export function isPopupDragActive(root: ParentNode): boolean {
  const grid = root.querySelector(`.${BUBBLE_CARDS_GRID}`);
  return grid instanceof HTMLElement && activeDragGrids.has(grid);
}

export function popupEditStyles(): string {
  return [
    `.${BUBBLE_CARDS_GRID} > .card[data-edit-draggable="1"] {`,
    "  cursor: grab;",
    "  user-select: none;",
    "  -webkit-user-select: none;",
    "  position: relative;",
    "}",
    `.${BUBBLE_CARDS_GRID} > .card[data-edit-draggable="1"] > :not(.area-card-pin-switch):not(.area-card-pin-menu):not(.area-card-battery-readout) {`,
    "  pointer-events: none !important;",
    "}",
    `.${BUBBLE_CARDS_GRID} > .card:not([data-edit-draggable="1"]) > :not(.area-card-pin-switch):not(.area-card-pin-menu):not(.area-card-battery-readout):not(.area-card-pin-order-wrap) {`,
    "  pointer-events: none !important;",
    "}",
    ".area-card-dragging {",
    "  z-index: 100000 !important;",
    "  pointer-events: none !important;",
    "  margin: 0 !important;",
    "  opacity: 1 !important;",
    "  background: transparent !important;",
    "  border: none !important;",
    "  outline: none !important;",
    "  box-shadow: none !important;",
    "  cursor: grabbing;",
    "}",
    ".area-card-drag-placeholder {",
    "  box-sizing: border-box;",
    "  border: 1.5px dashed color-mix(in srgb, var(--primary-text-color, #ffffff) 22%, transparent);",
    "  border-radius: 12px;",
    "  background: color-mix(in srgb, var(--primary-text-color, #ffffff) 4%, transparent);",
    "  pointer-events: none;",
    "}",
    ".area-card-drag-placeholder > * {",
    "  visibility: hidden !important;",
    "}",
    `.${PIN_ORDER_CLASS} {`,
    "  grid-column: 1 / -1;",
    "  display: flex;",
    "  flex-direction: column;",
    "  margin-bottom: 4px;",
    "}",
    ".area-card-pin-order-header {",
    "  display: flex;",
    "  align-items: center;",
    "  gap: 8px;",
    "  padding: var(--mush-title-padding, 16px 12px 8px);",
    "}",
    ".area-card-pin-order-header ha-icon {",
    "  color: var(--primary-color);",
    "  --mdc-icon-size: var(--mush-title-font-size, 24px);",
    "  flex-shrink: 0;",
    "}",
    ".area-card-pin-order-header h1 {",
    "  margin: 0;",
    "  font-size: var(--mush-title-font-size, 24px);",
    "  font-weight: var(--mush-title-font-weight, normal);",
    "  line-height: var(--mush-title-line-height, 32px);",
    "  letter-spacing: var(--mush-title-letter-spacing, -0.288px);",
    "  color: var(--mush-title-color, var(--primary-text-color));",
    "}",
    ".area-card-pin-order-preview {",
    "  display: flex;",
    "  flex-direction: row;",
    "  flex-wrap: wrap;",
    "  align-items: stretch;",
    "  gap: 0;",
    "  width: 100%;",
    "  border-radius: 12px;",
    "  overflow: visible;",
    "}",
    ".area-card-pin-order-item {",
    "  position: relative;",
    "  display: block;",
    "  box-sizing: border-box;",
    "  margin: 0;",
    "  padding: 0;",
    "  min-width: 0;",
    "  cursor: grab;",
    "  user-select: none;",
    "  -webkit-user-select: none;",
    "}",
    ".area-card-pin-order-item > hui-card {",
    "  pointer-events: none !important;",
    "  display: block;",
    "  margin: 0;",
    "}",
    '.area-card-pin-order-item[data-pin-when-on-off="1"] > hui-card {',
    "  opacity: 0.52;",
    "}",
    ".area-card-pin-order-badge {",
    "  position: absolute;",
    "  top: 4px;",
    "  right: 6px;",
    "  z-index: 2;",
    "  padding: 1px 6px;",
    "  border-radius: 999px;",
    "  font-size: 10px;",
    "  font-weight: 600;",
    "  line-height: 16px;",
    "  background: color-mix(in srgb, var(--primary-color) 18%, var(--card-background-color, #1c1c1e));",
    "  color: var(--primary-color);",
    "  pointer-events: none;",
    "}",
    `.${PIN_NEW_ROW_CLASS} {`,
    "  display: none;",
    "  align-items: center;",
    "  justify-content: center;",
    "  box-sizing: border-box;",
    "  width: 100%;",
    "  min-height: 56px;",
    "  margin-top: 8px;",
    "  border: 1.5px dashed color-mix(in srgb, var(--primary-text-color, #ffffff) 26%, transparent);",
    "  border-radius: 12px;",
    "  background: color-mix(in srgb, var(--primary-text-color, #ffffff) 4%, transparent);",
    "  color: var(--secondary-text-color);",
    "  font-size: 13px;",
    "  font-weight: 500;",
    "  transition: border-color 120ms ease, background-color 120ms ease, color 120ms ease;",
    "}",
    `.${PIN_ORDER_CLASS}.is-dragging > .${PIN_NEW_ROW_CLASS} {`,
    "  display: flex;",
    "}",
    `.${PIN_NEW_ROW_CLASS}:empty::before {`,
    '  content: "Drop here for new row";',
    "  pointer-events: none;",
    "}",
    `.${PIN_NEW_ROW_CLASS}:not(:empty) {`,
    "  border-color: var(--primary-color, #03a9f4);",
    "  background: color-mix(in srgb, var(--primary-color, #03a9f4) 14%, transparent);",
    "}",
    `.${PIN_NEW_ROW_CLASS} > .area-card-pin-order-item {`,
    "  flex: 1 1 100% !important;",
    "  width: 100% !important;",
    "  max-width: 100% !important;",
    "}",
    `.${PIN_NEW_ROW_CLASS} > .area-card-drag-placeholder {`,
    "  border-color: transparent !important;",
    "  background: transparent !important;",
    "}",
    `.${BG_SECTION_CLASS} {`,
    "  grid-column: 1 / -1;",
    "  display: flex;",
    "  flex-direction: column;",
    "  margin-bottom: 4px;",
    "}",
    ".area-card-bg-header {",
    "  display: flex;",
    "  align-items: center;",
    "  gap: 8px;",
    "  padding: var(--mush-title-padding, 16px 12px 8px);",
    "}",
    ".area-card-bg-header ha-icon {",
    "  color: var(--primary-color);",
    "  --mdc-icon-size: var(--mush-title-font-size, 24px);",
    "  flex-shrink: 0;",
    "}",
    ".area-card-bg-header h1 {",
    "  margin: 0;",
    "  font-size: var(--mush-title-font-size, 24px);",
    "  font-weight: var(--mush-title-font-weight, normal);",
    "  line-height: var(--mush-title-line-height, 32px);",
    "  letter-spacing: var(--mush-title-letter-spacing, -0.288px);",
    "  color: var(--mush-title-color, var(--primary-text-color));",
    "}",
    ".area-card-bg-options {",
    "  display: flex;",
    "  flex-wrap: wrap;",
    "  gap: 8px;",
    "  padding: 0 12px 8px;",
    "}",
    ".area-card-bg-option {",
    "  appearance: none;",
    "  border: 1px solid color-mix(in srgb, var(--primary-text-color, #ffffff) 16%, transparent);",
    "  border-radius: 999px;",
    "  padding: 6px 12px;",
    "  font: inherit;",
    "  font-size: 13px;",
    "  font-weight: 500;",
    "  line-height: 18px;",
    "  background: color-mix(in srgb, var(--primary-text-color, #ffffff) 6%, transparent);",
    "  color: var(--primary-text-color);",
    "  cursor: pointer;",
    "}",
    ".area-card-bg-option.is-active {",
    "  border-color: var(--primary-color, #03a9f4);",
    "  background: color-mix(in srgb, var(--primary-color, #03a9f4) 18%, transparent);",
    "  color: var(--primary-color, #03a9f4);",
    "  font-weight: 600;",
    "}",
  ].join("\n");
}

/** True only when both scopes are defined and identical. */
export function canDropInScope(dragScope: string | undefined, targetScope: string | undefined): boolean {
  return Boolean(dragScope && targetScope && dragScope === targetScope);
}

/** Move `draggedId` to the position of `targetId` in `ids`. */
export function reorderIds(ids: readonly string[], draggedId: string, targetId: string): string[] {
  const from = ids.indexOf(draggedId);
  const to = ids.indexOf(targetId);
  if (from === -1 || to === -1 || from === to) return [...ids];
  const next = [...ids];
  next.splice(from, 1);
  next.splice(to, 0, draggedId);
  return next;
}

function eventPath(event: Event): EventTarget[] {
  return typeof event.composedPath === "function" ? event.composedPath() : [];
}

function isInteractiveEditTarget(path: readonly EventTarget[]): boolean {
  for (const node of path) {
    if (!(node instanceof Element)) continue;
    if (
      node.classList.contains("bubble-header-container") ||
      node.classList.contains("area-card-pin-switch") ||
      node.classList.contains("area-card-pin-menu") ||
      node.classList.contains("area-card-bg-option")
    ) {
      return true;
    }
  }
  return false;
}

function isInsidePopupGrid(path: readonly EventTarget[]): boolean {
  for (const node of path) {
    if (!(node instanceof Element)) continue;
    if (
      node.classList.contains(BUBBLE_CARDS_GRID) ||
      node.classList.contains(PIN_ORDER_CLASS) ||
      node.classList.contains(BG_SECTION_CLASS)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Block Bubble Card's swipe-to-close (touchstart on .bubble-pop-up) and card
 * tap/hold actions inside the popup while `editing === true`.
 */
export function syncPopupEditGuards(root: ParentNode, editing: boolean): void {
  const host = root as ParentNode & {
    querySelector?: (selector: string) => Element | null;
    appendChild?: (node: Node) => Node;
    addEventListener?: (type: string, listener: EventListener, options?: AddEventListenerOptions) => void;
    host?: { releasePopupSlideToClose?: () => void };
  };
  let state = guardStates.get(root);
  if (!state) {
    state = { editing };
    guardStates.set(root, state);
    if (typeof host.addEventListener === "function") {
      host.addEventListener(
        "touchstart",
        (event: Event) => {
          if (!state?.editing) return;
          const path = eventPath(event);
          if (path.some((n) => n instanceof Element && n.classList.contains("bubble-pop-up"))) {
            event.stopPropagation();
          }
        },
        { capture: true },
      );
      const blockAction = (event: Event) => {
        if (!state?.editing) return;
        const path = eventPath(event);
        if (isInteractiveEditTarget(path)) return;
        if (isInsidePopupGrid(path)) {
          event.preventDefault();
          event.stopPropagation();
        }
      };
      for (const type of ["click", "dblclick", "contextmenu", "hass-action", "hass-more-info"]) {
        host.addEventListener(type, blockAction, { capture: true });
      }
    }
  }
  state.editing = editing;
  if (editing) {
    host.host?.releasePopupSlideToClose?.();
  }

  if (typeof host.querySelector !== "function" || typeof host.appendChild !== "function") return;
  const existing = host.querySelector(`#${EDIT_STYLE_ID}`);
  if (!editing) {
    existing?.remove();
    return;
  }
  if (!existing) {
    const style = document.createElement("style");
    style.id = EDIT_STYLE_ID;
    style.textContent = popupEditStyles();
    host.appendChild(style);
  }
}

function rowConfig(cell: Element): Record<string, unknown> | null {
  for (const child of cell.children) {
    if (child.classList.contains("area-card-pin-switch")) {
      continue;
    }
    const config = (child as Element & { config?: unknown }).config;
    if (config && typeof config === "object" && !Array.isArray(config)) {
      return config as Record<string, unknown>;
    }
  }
  return null;
}

function isTitleCell(cell: Element): boolean {
  const cfg = rowConfig(cell);
  if (cfg?.type === SECTION_TITLE_TYPE) return true;
  return Boolean(cell.querySelector("area-card-section-title, area-card-local-section-title"));
}

function applyItemWidth(el: HTMLElement, width: PinnedLayoutWidth): void {
  const half = width === "half";
  el.style.flex = half ? "1 1 50%" : "1 1 100%";
  el.style.width = half ? "50%" : "100%";
  el.style.maxWidth = half ? "50%" : "100%";
}

function innerHosts(card: HTMLElement): HTMLElement[] {
  const hosts: HTMLElement[] = [];
  const roots: ParentNode[] = [];
  if (card.shadowRoot) roots.push(card.shadowRoot);
  roots.push(card);
  for (const root of roots) {
    for (const child of root.children) {
      if (!(child instanceof HTMLElement) || !child.localName.includes("-")) continue;
      hosts.push(child);
      if (
        child.localName === "area-card-light-row" ||
        child.localName === "area-card-device-row" ||
        child.localName === CAMERA_ROW_TAG
      ) {
        const queue: HTMLElement[] = [child];
        while (queue.length > 0) {
          const parent = queue.shift()!;
          for (const nested of parent.children) {
            if (!(nested instanceof HTMLElement)) continue;
            if (nested.localName === "area-card-device-row" || nested.localName === CAMERA_ROW_TAG || nested.localName === "hui-card") {
              if (nested.localName !== "hui-card") hosts.push(nested);
              queue.push(nested);
            } else if (nested.localName.includes("-")) {
              hosts.push(nested);
            }
          }
        }
      }
    }
  }
  return hosts;
}

function syncPreviewStyle(root: ParentNode | null | undefined, id: string, text: string | null): void {
  if (!root) return;
  const escapedId = typeof CSS !== "undefined" && typeof CSS.escape === "function" ? CSS.escape(id) : id;
  const existing = root.querySelector(`#${escapedId}`);
  if (!text) {
    existing?.remove();
    return;
  }
  let style = existing;
  if (!style || style.localName !== "style") {
    style = document.createElement("style");
    style.id = id;
    root.append(style);
  }
  if (style.textContent !== text) style.textContent = text;
}

function stylePreviewCard(card: HTMLElement, edge: PinnedEdge, sideBySide: boolean, tries = 0): void {
  card.style.setProperty("margin", "0", "important");
  const radius = pinnedEdgeRadius(edge);
  const hosts = innerHosts(card);
  for (const host of hosts) {
    host.style.setProperty("margin", "0", "important");
    host.style.setProperty("display", "block", "important");
    host.style.setProperty("width", "100%", "important");
    if (
      host.localName === "area-card-light-row" ||
      host.localName === "area-card-device-row" ||
      host.localName === CAMERA_ROW_TAG
    ) continue;
    const root = host.shadowRoot;
    if (!root) continue;
    syncPreviewStyle(
      root,
      "area-card-pin-flat",
      `:host{margin:0 !important;display:block !important;width:100% !important}ha-card{margin:0 !important;${radius}}`,
    );
    const layout = root.querySelector("area-card-mushroom-card");
    const ha = root.querySelector("ha-card");
    const blocks =
      ha instanceof HTMLElement
        ? [...ha.children].filter((n): n is HTMLElement => n instanceof HTMLElement)
        : [];
    const grid = sideBySide && !(layout instanceof HTMLElement) && blocks.length >= 2;
    const hostText = sideBySide
      ? grid
        ? `${pinnedSideBySideHostStyles()}\n${pinnedSideBySideGridStyles()}`
        : pinnedSideBySideHostStyles()
      : null;
    syncPreviewStyle(root, "area-card-pin-split", hostText);
    if (layout instanceof HTMLElement) {
      syncPreviewStyle(layout.shadowRoot, "area-card-pin-split-rows", sideBySide ? pinnedSideBySideStyles() : null);
    }
  }
  const ready = hosts.some(
    (h) =>
      h.localName !== "area-card-light-row" &&
      h.localName !== "area-card-device-row" &&
      h.localName !== CAMERA_ROW_TAG &&
      h.shadowRoot?.querySelector("ha-card"),
  );
  if (!ready && tries < 30 && card.isConnected && typeof requestAnimationFrame === "function") {
    requestAnimationFrame(() => stylePreviewCard(card, edge, sideBySide, tries + 1));
  }
}

const previewConfigKeys = new WeakMap<HTMLElement, string>();

const MIRRORED_STYLE_PROPS = [
  "display",
  "position",
  "top",
  "right",
  "bottom",
  "left",
  "z-index",
  "box-sizing",
  "width",
  "height",
  "min-width",
  "min-height",
  "max-width",
  "max-height",
  "padding",
  "margin",
  "flex",
  "flex-direction",
  "flex-wrap",
  "align-items",
  "justify-content",
  "gap",
  "grid-template-columns",
  "grid-template-rows",
  "grid-column",
  "grid-row",
  "overflow",
  "background",
  "backdrop-filter",
  "-webkit-backdrop-filter",
  "border",
  "border-radius",
  "box-shadow",
  "color",
  "fill",
  "font",
  "line-height",
  "letter-spacing",
  "text-align",
  "text-overflow",
  "white-space",
  "opacity",
  "transform",
] as const;

function copySafeAttributes(source: Element, target: Element): void {
  if (!source.attributes) return;
  for (const attr of Array.from(source.attributes)) {
    if (attr.name === "id") continue;
    try {
      target.setAttribute(attr.name, attr.value);
    } catch {
      // Ignore non-transferable attributes on SVG/custom nodes.
    }
  }
}

function copyComputedVisualStyles(source: Element, target: HTMLElement | SVGElement): void {
  if (typeof getComputedStyle !== "function") return;
  const cs = getComputedStyle(source);
  for (const prop of MIRRORED_STYLE_PROPS) {
    const val = cs.getPropertyValue(prop);
    if (val) target.style.setProperty(prop, val);
  }
}

/**
 * SortableJS fallback mode clones `dragEl` with `cloneNode(true)`, which drops
 * custom element Shadow DOM trees. Mirroring open shadow roots, `slot`
 * attributes, adopted stylesheets, and computed styles into inert `<div>`
 * shadow hosts makes the floating element look identical to the live card on
 * frame 0 without re-running Lit lifecycle hooks.
 */
function mirrorDomWithShadows(node: Node, elevatedCard: { done: boolean }): Node {
  if (node.nodeType === 3) {
    return document.createTextNode(node.textContent ?? "");
  }
  if (!(node instanceof Element)) {
    return document.createTextNode("");
  }
  if (node.classList.contains("area-card-pin-menu")) {
    return document.createTextNode("");
  }
  if (node.classList.contains("area-card-pin-switch")) {
    const spacer = document.createElement("div");
    spacer.className = "area-card-pin-switch";
    copyComputedVisualStyles(node, spacer);
    spacer.style.setProperty("visibility", "hidden", "important");
    spacer.style.setProperty("pointer-events", "none", "important");
    return spacer;
  }

  if (node.shadowRoot && typeof document.createElement === "function") {
    const host = document.createElement("div");
    copySafeAttributes(node, host);
    copyComputedVisualStyles(node, host);
    host.style.setProperty("pointer-events", "none", "important");
    if (node.localName === "ha-card" && !elevatedCard.done) {
      elevatedCard.done = true;
      host.style.setProperty("border-radius", "12px", "important");
      host.style.setProperty(
        "box-shadow",
        "0 10px 24px rgba(0, 0, 0, 0.28), 0 2px 6px rgba(0, 0, 0, 0.16)",
        "important",
      );
    }
    if (typeof host.attachShadow === "function") {
      const sr = host.attachShadow({ mode: "open" });
      if (node.shadowRoot.adoptedStyleSheets && "adoptedStyleSheets" in sr) {
        sr.adoptedStyleSheets = [...node.shadowRoot.adoptedStyleSheets];
      }
      for (const sChild of Array.from(node.shadowRoot.childNodes)) {
        sr.appendChild(mirrorDomWithShadows(sChild, elevatedCard));
      }
      const noPointerStyle = document.createElement("style");
      noPointerStyle.textContent = ":host, * { pointer-events: none !important; }";
      sr.appendChild(noPointerStyle);
    }
    for (const lChild of Array.from(node.childNodes)) {
      host.appendChild(mirrorDomWithShadows(lChild, elevatedCard));
    }
    return host;
  }

  const isCustom = node.localName.includes("-");
  const isSvg = node.namespaceURI === "http://www.w3.org/2000/svg";
  const clone =
    isCustom || typeof document.createElementNS !== "function"
      ? document.createElement(isCustom ? "div" : node.localName)
      : document.createElementNS(node.namespaceURI || "http://www.w3.org/2000/xhtml", node.localName);
  copySafeAttributes(node, clone);
  if (clone instanceof HTMLElement || (typeof SVGElement !== "undefined" && clone instanceof SVGElement)) {
    if (isCustom || isSvg) copyComputedVisualStyles(node, clone);
    clone.style.setProperty("pointer-events", "none", "important");
  }
  for (const child of Array.from(node.childNodes)) {
    clone.appendChild(mirrorDomWithShadows(child, elevatedCard));
  }
  return clone;
}

function hydrateSortableGhost(sourceEl: unknown): void {
  const ghost = Sortable.ghost;
  if (!(ghost instanceof HTMLElement) || !(sourceEl instanceof HTMLElement)) return;
  if (!sourceEl.childNodes || typeof ghost.replaceChildren !== "function") return;
  const hadPlaceholder = sourceEl.classList.contains("area-card-drag-placeholder");
  if (hadPlaceholder) sourceEl.classList.remove("area-card-drag-placeholder");
  const elevatedCard = { done: false };
  const mirroredChildren: Node[] = [];
  try {
    for (const child of Array.from(sourceEl.childNodes)) {
      mirroredChildren.push(mirrorDomWithShadows(child, elevatedCard));
    }
  } finally {
    if (hadPlaceholder) sourceEl.classList.add("area-card-drag-placeholder");
  }
  ghost.style.setProperty("opacity", "1", "important");
  ghost.style.setProperty("max-width", "none", "important");
  ghost.style.setProperty("flex", "none", "important");
  ghost.replaceChildren(...mirroredChildren);
}

function baseSortableOptions(): SortableOptions {
  return {
    forceFallback: true,
    fallbackOnBody: false,
    fallbackTolerance: 4,
    delay: 120,
    delayOnTouchOnly: true,
    touchStartThreshold: 5,
    swapThreshold: 0.85,
    direction: (_evt, target, dragEl) => {
      if (target instanceof HTMLElement && dragEl instanceof HTMLElement) {
        const tr = target.getBoundingClientRect();
        const dr = dragEl.getBoundingClientRect();
        const verticalOverlap = Math.min(tr.bottom, dr.bottom) - Math.max(tr.top, dr.top);
        const minHeight = Math.min(tr.height, dr.height);
        if (minHeight > 0 && verticalOverlap > minHeight * 0.5) {
          return "horizontal";
        }
      }
      return "vertical";
    },
    animation: 150,
    easing: "cubic-bezier(0.2, 0, 0, 1)",
    ghostClass: "area-card-drag-placeholder",
    fallbackClass: "area-card-dragging",
    chosenClass: "area-card-drag-chosen",
  };
}

function layoutPinOrderPreview(
  preview: HTMLElement,
  orderedIds: readonly string[],
  popupCards: readonly Record<string, unknown>[],
  itemById: ReadonlyMap<string, HTMLElement>,
  soloIds?: ReadonlySet<string> | readonly string[],
): void {
  const selected = selectPinnedCards(popupCards, orderedIds);
  const layout = layoutPinnedCards(selected, soloIds);

  const orderedEls: HTMLElement[] = [];
  for (let rowIndex = 0; rowIndex < layout.length; rowIndex += 1) {
    const row = layout[rowIndex];
    for (let i = 0; i < row.cards.length; i += 1) {
      const item = row.cards[i];
      const id = pinEntityId(item.config);
      if (!id) continue;
      const slotEl = itemById.get(id);
      if (!slotEl) continue;

      applyItemWidth(slotEl, item.width);
      const card = slotEl.querySelector("hui-card") as HTMLElement | null;
      if (card) {
        const edge: PinnedEdge = {
          first: rowIndex === 0,
          last: rowIndex === layout.length - 1,
          left: i === 0,
          right: i === row.cards.length - 1,
        };
        stylePreviewCard(card, edge, pinnedRowsSideBySide(item.config, item.width));
      }
      orderedEls.push(slotEl);
    }
  }

  for (let i = 0; i < orderedEls.length; i += 1) {
    const el = orderedEls[i];
    const at = preview.children[i] ?? null;
    if (at !== el) preview.insertBefore(el, at);
  }
  while (preview.children.length > orderedEls.length) {
    preview.children[preview.children.length - 1]?.remove();
  }
}

export interface CardBackgroundOption {
  label: string;
  mode: AreaBackgroundMode;
}

export function cardBackgroundOptions(options: {
  areaPicture: string | null | undefined;
  cameras: readonly string[];
  mediaPlayers?: readonly string[];
  states?: Record<string, EntityState | undefined>;
  roomName?: string;
}): CardBackgroundOption[] {
  const choices: CardBackgroundOption[] = [
    { label: "Light tint (default)", mode: { mode: "light-tint" } },
  ];
  if (typeof options.areaPicture === "string" && options.areaPicture.length > 0) {
    choices.push({ label: "Area picture", mode: { mode: "area-picture" } });
  }
  for (const entityId of options.mediaPlayers ?? []) {
    const rawName = options.states?.[entityId]?.attributes?.friendly_name;
    const playerName =
      typeof rawName === "string" && rawName.trim() !== ""
        ? options.roomName
          ? stripRoomName(rawName, options.roomName)
          : rawName.trim()
        : entityId;
    choices.push({
      label: `Media: ${playerName}`,
      mode: { mode: "media-artwork", entityId },
    });
  }
  for (const entityId of options.cameras) {
    const rawName = options.states?.[entityId]?.attributes?.friendly_name;
    const cameraName =
      typeof rawName === "string" && rawName.trim() !== ""
        ? options.roomName
          ? stripRoomName(rawName, options.roomName)
          : rawName.trim()
        : entityId;
    choices.push({
      label: `Camera: ${cameraName}`,
      mode: { mode: "camera", entityId },
    });
  }
  return choices;
}

interface BgOptionButton extends HTMLButtonElement {
  bgChoice?: AreaBackgroundMode;
  onBgSelect?: (mode: AreaBackgroundMode) => void;
}

function backgroundOptionKey(mode: AreaBackgroundMode): string {
  if (mode.mode === "camera") return `camera:${mode.entityId}`;
  if (mode.mode === "media-artwork") return `media-artwork:${mode.entityId}`;
  return mode.mode;
}

export function syncCardBackgroundSection(
  root: ParentNode,
  options: {
    editing: boolean;
    current: AreaBackgroundMode;
    areaPicture: string | null | undefined;
    cameras: readonly string[];
    mediaPlayers?: readonly string[];
    states?: Record<string, EntityState | undefined>;
    roomName?: string;
    onSelect: (mode: AreaBackgroundMode) => void;
  },
): void {
  const grid = root.querySelector(`.${BUBBLE_CARDS_GRID}`);
  if (!(grid instanceof HTMLElement)) return;
  const existing = grid.querySelector(`:scope > .${BG_SECTION_CLASS}`);
  if (!options.editing) {
    existing?.remove();
    return;
  }

  let section = existing instanceof HTMLElement ? existing : null;
  if (!section) {
    section = document.createElement("div");
    section.className = BG_SECTION_CLASS;
    const header = document.createElement("div");
    header.className = "area-card-bg-header";
    const icon = document.createElement("ha-icon");
    icon.setAttribute("icon", "mdi:image-outline");
    icon.setAttribute("aria-hidden", "true");
    const title = document.createElement("h1");
    title.textContent = "Card Background";
    header.append(icon, title);
    const list = document.createElement("div");
    list.className = "area-card-bg-options";
    section.append(header, list);
  }
  if (grid.firstElementChild !== section) grid.prepend(section);

  const list = section.querySelector(":scope > .area-card-bg-options");
  if (!(list instanceof HTMLElement)) return;

  const choices = cardBackgroundOptions({
    areaPicture: options.areaPicture,
    cameras: options.cameras,
    mediaPlayers: options.mediaPlayers,
    states: options.states,
    roomName: options.roomName,
  });

  const existingButtons = new Map<string, BgOptionButton>();
  for (const child of list.children) {
    if (!(child instanceof HTMLElement) || !child.classList.contains("area-card-bg-option")) continue;
    const key = child.dataset.bgKey;
    if (key) existingButtons.set(key, child as BgOptionButton);
  }

  const orderedButtons: BgOptionButton[] = [];
  for (const choice of choices) {
    const key = backgroundOptionKey(choice.mode);
    let btn = existingButtons.get(key);
    if (!btn) {
      btn = document.createElement("button") as BgOptionButton;
      btn.type = "button";
      btn.className = "area-card-bg-option";
      btn.dataset.bgKey = key;
      btn.dataset.bgMode = choice.mode.mode;
      if (choice.mode.mode === "camera" || choice.mode.mode === "media-artwork") {
        btn.dataset.bgEntity = choice.mode.entityId;
      }
      btn.addEventListener("click", (event) => {
        event.stopPropagation();
        if (btn?.bgChoice) btn.onBgSelect?.(btn.bgChoice);
      });
    }
    btn.bgChoice = choice.mode;
    btn.onBgSelect = options.onSelect;
    if (btn.textContent !== choice.label) btn.textContent = choice.label;
    const active = areaBackgroundEqual(choice.mode, options.current);
    if (active) {
      btn.classList.add("is-active");
      btn.setAttribute("aria-pressed", "true");
      btn.dataset.active = "1";
    } else {
      btn.classList.remove("is-active");
      btn.setAttribute("aria-pressed", "false");
      delete btn.dataset.active;
    }
    orderedButtons.push(btn);
  }

  for (let i = 0; i < orderedButtons.length; i += 1) {
    const btn = orderedButtons[i];
    const at = list.children[i] ?? null;
    if (at !== btn) list.insertBefore(btn, at);
  }
  while (list.children.length > orderedButtons.length) {
    list.children[list.children.length - 1]?.remove();
  }
}

interface PinOrderState {
  orderedIds: string[];
  solo: string[];
  popupCards: readonly Record<string, unknown>[];
  itemById: ReadonlyMap<string, HTMLElement>;
  onReorderPins: (nextOrder: string[], nextSolo: string[]) => void;
}

const pinOrderStates = new WeakMap<HTMLElement, PinOrderState>();
const sectionReorderCallbacks = new WeakMap<HTMLElement, (draggedId: string, scopeIds: string[]) => void>();

function containerOrderIds(container: HTMLElement): string[] {
  const ids: string[] = [];
  for (const child of container.children) {
    if (!(child instanceof HTMLElement)) continue;
    const id = child.dataset.pinOrderEntity;
    if (id && !child.classList.contains("area-card-dragging")) {
      ids.push(id);
    }
  }
  return ids;
}

function findPinRowIndex(
  layout: ReturnType<typeof layoutPinnedCards>,
  entityId: string,
): { rowIdx: number; partnerId: string | null } {
  for (let r = 0; r < layout.length; r += 1) {
    const ids = layout[r].cards
      .map((c) => pinEntityId(c.config))
      .filter((id): id is string => Boolean(id));
    if (ids.includes(entityId)) {
      const partner = ids.length === 2 ? (ids.find((id) => id !== entityId) ?? null) : null;
      return { rowIdx: r, partnerId: partner };
    }
  }
  return { rowIdx: -1, partnerId: null };
}

function isHalfWidthCard(popupCards: readonly Record<string, unknown>[], entityId: string): boolean {
  const card = selectPinnedCards(popupCards, [entityId])[0];
  if (!card) return false;
  const grid = card.grid_options;
  return Boolean(grid && typeof grid === "object" && !Array.isArray(grid) && (grid as { columns?: unknown }).columns === 6);
}

export function syncPinOrderSection(
  root: ParentNode,
  options: {
    editing: boolean;
    pins: AreaPins;
    popupCards: readonly Record<string, unknown>[];
    hass: ClassifierHass;
    onReorderPins: (nextOrder: string[], nextSolo: string[]) => void;
  },
): void {
  const grid = root.querySelector(`.${BUBBLE_CARDS_GRID}`);
  if (!(grid instanceof HTMLElement)) return;
  if (activeDragGrids.has(grid)) {
    if (options.editing) return;
    activeDragGrids.delete(grid);
  }
  const existing = grid.querySelector(`:scope > .${PIN_ORDER_CLASS}`);
  const orderedIds = pinnedOrder(options.pins);
  if (!options.editing || orderedIds.length < 2) {
    const oldPreview = existing?.querySelector(":scope > .area-card-pin-order-preview");
    if (oldPreview instanceof HTMLElement) {
      const pair = pinOrderSortables.get(oldPreview);
      pair?.main.destroy();
      pair?.newRow.destroy();
      pinOrderSortables.delete(oldPreview);
    }
    existing?.remove();
    return;
  }

  let section = existing instanceof HTMLElement ? existing : null;
  if (!section) {
    section = document.createElement("div");
    section.className = PIN_ORDER_CLASS;
    const header = document.createElement("div");
    header.className = "area-card-pin-order-header";
    const icon = document.createElement("ha-icon");
    icon.setAttribute("icon", "mdi:sort");
    icon.setAttribute("aria-hidden", "true");
    const title = document.createElement("h1");
    title.textContent = "Pin Order";
    header.append(icon, title);
    const preview = document.createElement("div");
    preview.className = "area-card-pin-order-preview";
    const newRow = document.createElement("div");
    newRow.className = PIN_NEW_ROW_CLASS;
    section.append(header, preview, newRow);
  }
  const bgSection = grid.querySelector(`:scope > .${BG_SECTION_CLASS}`);
  const anchor = bgSection
    ? (grid.children[[...grid.children].indexOf(bgSection) + 1] ?? null)
    : grid.firstElementChild;
  if (anchor !== section) grid.insertBefore(section, anchor);

  const preview = section.querySelector(":scope > .area-card-pin-order-preview");
  if (!(preview instanceof HTMLElement)) return;
  const existingNewRow = section.querySelector(`:scope > .${PIN_NEW_ROW_CLASS}`);
  let dropRowEl: HTMLElement;
  if (existingNewRow instanceof HTMLElement) {
    dropRowEl = existingNewRow;
  } else {
    dropRowEl = document.createElement("div");
    dropRowEl.className = PIN_NEW_ROW_CLASS;
    section.append(dropRowEl);
  }
  const sectionEl = section;

  const selected = selectPinnedCards(options.popupCards, orderedIds);
  const existingItems = new Map<string, HTMLElement>();
  for (const el of section.querySelectorAll<HTMLElement>("[data-pin-order-entity]")) {
    const id = el.dataset.pinOrderEntity;
    if (id) existingItems.set(id, el);
  }

  const itemById = new Map<string, HTMLElement>();
  for (const config of selected) {
    const id = pinEntityId(config);
    if (!id) continue;
    let itemEl = existingItems.get(id);
    if (!itemEl) {
      itemEl = document.createElement("div");
      itemEl.className = "area-card-pin-order-item";
      itemEl.dataset.pinOrderEntity = id;
      const card = document.createElement("hui-card") as PinnedCardElement;
      card.hass = options.hass;
      card.config = config;
      previewConfigKeys.set(card, JSON.stringify(config));
      void card.load?.();
      itemEl.append(card);
    } else {
      const card = itemEl.querySelector("hui-card") as PinnedCardElement | null;
      if (card) {
        card.hass = options.hass;
        const key = JSON.stringify(config);
        if (previewConfigKeys.get(card) !== key) {
          card.config = config;
          previewConfigKeys.set(card, key);
        }
      }
    }

    const isOffWhenOn =
      pinMode(options.pins, id) === "when-on" &&
      !entityPinActive(id, options.hass.states?.[id]?.state);
    let badge = itemEl.querySelector(":scope > .area-card-pin-order-badge");
    if (isOffWhenOn) {
      if (itemEl.dataset.pinWhenOnOff !== "1") itemEl.dataset.pinWhenOnOff = "1";
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "area-card-pin-order-badge";
        badge.textContent = "While on";
        itemEl.append(badge);
      }
    } else {
      if (itemEl.dataset.pinWhenOnOff !== undefined) delete itemEl.dataset.pinWhenOnOff;
      badge?.remove();
    }
    itemById.set(id, itemEl);
  }

  const initialSoloList = [...(options.pins.solo ?? [])];
  layoutPinOrderPreview(preview, orderedIds, options.popupCards, itemById, initialSoloList);
  while (dropRowEl.firstElementChild) {
    dropRowEl.firstElementChild.remove();
  }
  pinOrderStates.set(preview, {
    orderedIds: [...orderedIds],
    solo: initialSoloList,
    popupCards: options.popupCards,
    itemById,
    onReorderPins: options.onReorderPins,
  });

  if (!pinOrderSortables.has(preview)) {
    const groupName = `area-card-pin-order-${(pinGroupCounter += 1)}`;
    let initialOrder: string[] = [];
    let initialSolo: string[] = [];
    let draggedId = "";
    let startPartnerId: string | null = null;

    const main = sortableFactory(preview, {
      ...baseSortableOptions(),
      group: { name: groupName, pull: true, put: true },
      draggable: ".area-card-pin-order-item",
      onStart: (evt) => {
        hydrateSortableGhost(evt.item);
        activeDragGrids.add(grid);
        sectionEl.classList.add("is-dragging");
        const state = pinOrderStates.get(preview);
        initialOrder = state ? [...state.orderedIds] : containerOrderIds(preview);
        initialSolo = state ? [...state.solo] : [];
        draggedId = evt.item instanceof HTMLElement ? (evt.item.dataset.pinOrderEntity ?? "") : "";
        startPartnerId = null;
        if (state && draggedId) {
          const layout = layoutPinnedCards(selectPinnedCards(state.popupCards, initialOrder), initialSolo);
          startPartnerId = findPinRowIndex(layout, draggedId).partnerId;
        }
      },
      onEnd: (evt) => {
        activeDragGrids.delete(grid);
        sectionEl.classList.remove("is-dragging");
        const state = pinOrderStates.get(preview);
        if (!state) return;

        const droppedInNewRow =
          evt.to === dropRowEl ||
          (evt.item instanceof HTMLElement && evt.item.parentElement === dropRowEl);
        const nextOrder = [...containerOrderIds(preview), ...containerOrderIds(dropRowEl)];
        const orderChanged =
          nextOrder.length === initialOrder.length &&
          nextOrder.some((v, idx) => v !== initialOrder[idx]);

        const nextSoloSet = new Set(initialSolo);
        if (draggedId && isHalfWidthCard(state.popupCards, draggedId)) {
          if (droppedInNewRow) {
            nextSoloSet.add(draggedId);
          } else if (startPartnerId) {
            const idxDragged = nextOrder.indexOf(draggedId);
            const idxPartner = nextOrder.indexOf(startPartnerId);
            const separated = idxDragged !== -1 && idxPartner !== -1 && Math.abs(idxDragged - idxPartner) > 1;
            const layout = layoutPinnedCards(selectPinnedCards(state.popupCards, nextOrder), nextSoloSet);
            const draggedPos = findPinRowIndex(layout, draggedId);
            const partnerPos = findPinRowIndex(layout, startPartnerId);
            if (separated || draggedPos.rowIdx !== partnerPos.rowIdx) {
              nextSoloSet.add(draggedId);
            }
          } else if (orderChanged && nextSoloSet.has(draggedId)) {
            const candidateSolo = new Set(nextSoloSet);
            candidateSolo.delete(draggedId);
            const candidateLayout = layoutPinnedCards(
              selectPinnedCards(state.popupCards, nextOrder),
              candidateSolo,
            );
            const candidatePartner = findPinRowIndex(candidateLayout, draggedId).partnerId;
            if (candidatePartner) {
              const idxDragged = nextOrder.indexOf(draggedId);
              const idxPartner = nextOrder.indexOf(candidatePartner);
              if (idxDragged !== -1 && idxPartner !== -1 && Math.abs(idxDragged - idxPartner) === 1) {
                nextSoloSet.delete(draggedId);
              }
            }
          }
        }

        const nextSolo = [...nextSoloSet];
        layoutPinOrderPreview(preview, nextOrder, state.popupCards, state.itemById, nextSolo);
        while (dropRowEl.firstElementChild) {
          dropRowEl.firstElementChild.remove();
        }
        state.orderedIds = [...nextOrder];
        state.solo = [...nextSolo];

        const soloChanged =
          nextSolo.length !== initialSolo.length ||
          nextSolo.some((v, idx) => v !== initialSolo[idx]);
        if (orderChanged || soloChanged) {
          state.onReorderPins(nextOrder, nextSolo);
        }
      },
    });

    const newRow = sortableFactory(dropRowEl, {
      ...baseSortableOptions(),
      group: { name: groupName, pull: true, put: true },
      draggable: ".area-card-pin-order-item",
      emptyInsertThreshold: 28,
    });

    pinOrderSortables.set(preview, { main, newRow });
  }
}

function scopeSlotElements(grid: HTMLElement, scope: string): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (const child of grid.children) {
    if (!(child instanceof HTMLElement)) continue;
    if (!child.classList.contains("card")) continue;
    if (child.dataset.editScope !== scope) continue;
    if (child.classList.contains("area-card-dragging")) continue;
    out.push(child);
  }
  return out;
}

export function syncSectionDragOrder(
  root: ParentNode,
  options: {
    editing: boolean;
    onReorderScope: (draggedId: string, scopeIds: string[]) => void;
  },
): void {
  const grid = root.querySelector(`.${BUBBLE_CARDS_GRID}`);
  if (!(grid instanceof HTMLElement)) return;
  if (activeDragGrids.has(grid)) {
    if (options.editing) return;
    activeDragGrids.delete(grid);
  }

  let scopeIndex = 0;
  for (const cell of [...grid.children]) {
    if (!(cell instanceof HTMLElement)) continue;
    cell.querySelector(":scope > .area-card-drag-handle")?.remove();
    if (cell.classList.contains(PIN_ORDER_CLASS) || cell.classList.contains(BG_SECTION_CLASS)) continue;
    if (isTitleCell(cell)) {
      scopeIndex += 1;
      delete cell.dataset.editDraggable;
      delete cell.dataset.editScope;
      delete cell.dataset.editEntity;
      continue;
    }
    const entityId = options.editing ? pinEntityId(rowConfig(cell)) : null;
    if (!options.editing || !entityId) {
      delete cell.dataset.editDraggable;
      delete cell.dataset.editScope;
      delete cell.dataset.editEntity;
      continue;
    }
    cell.dataset.editDraggable = "1";
    cell.dataset.editScope = String(scopeIndex);
    cell.dataset.editEntity = entityId;
  }

  if (!options.editing) {
    sectionSortables.get(grid)?.destroy();
    sectionSortables.delete(grid);
    sectionReorderCallbacks.delete(grid);
    return;
  }

  sectionReorderCallbacks.set(grid, options.onReorderScope);

  if (!sectionSortables.has(grid)) {
    let initialScopeIds: string[] = [];
    const sortable = sortableFactory(grid, {
      ...baseSortableOptions(),
      draggable: ".card[data-edit-draggable='1']",
      filter: ".area-card-pin-switch, .area-card-pin-menu, .area-card-bg-option",
      preventOnFilter: false,
      onStart: (evt) => {
        hydrateSortableGhost(evt.item);
        activeDragGrids.add(grid);
        const scope = evt.item instanceof HTMLElement ? evt.item.dataset.editScope : undefined;
        initialScopeIds = scope
          ? scopeSlotElements(grid, scope)
              .map((el) => el.dataset.editEntity)
              .filter((id): id is string => Boolean(id))
          : [];
      },
      onMove: (evt) => {
        const dragScope = evt.dragged instanceof HTMLElement ? evt.dragged.dataset.editScope : undefined;
        const targetScope = evt.related instanceof HTMLElement ? evt.related.dataset.editScope : undefined;
        return canDropInScope(dragScope, targetScope);
      },
      onEnd: (evt) => {
        activeDragGrids.delete(grid);
        if (!(evt.item instanceof HTMLElement)) return;
        const scope = evt.item.dataset.editScope;
        const fromId = evt.item.dataset.editEntity;
        if (!scope || !fromId) return;
        const scopeIds = scopeSlotElements(grid, scope)
          .map((el) => el.dataset.editEntity)
          .filter((id): id is string => Boolean(id));
        const changed =
          scopeIds.length === initialScopeIds.length &&
          scopeIds.some((id, idx) => id !== initialScopeIds[idx]);
        if (changed) {
          sectionReorderCallbacks.get(grid)?.(fromId, scopeIds);
        }
      },
    });
    sectionSortables.set(grid, sortable);
  }
}
