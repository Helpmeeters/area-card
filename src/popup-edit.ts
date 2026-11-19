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
const SECTION_TITLE_TYPE = "custom:area-card-section-title";
const DRAG_THRESHOLD_PX = 5;
const FLIP_TRANSITION = "transform 160ms cubic-bezier(0.2, 0, 0, 1)";

interface PinnedCardElement extends HTMLElement {
  hass?: ClassifierHass;
  config?: Record<string, unknown>;
  load?: () => void;
}

interface GuardState {
  editing: boolean;
}

const guardStates = new WeakMap<ParentNode, GuardState>();
const activeDragCancels = new Map<HTMLElement, () => void>();

export function isPopupDragActive(root: ParentNode): boolean {
  const grid = root.querySelector(`.${BUBBLE_CARDS_GRID}`);
  return grid instanceof HTMLElement && activeDragCancels.has(grid);
}

export function popupEditStyles(): string {
  return [
    `.${BUBBLE_CARDS_GRID} > .card[data-edit-draggable="1"] {`,
    "  cursor: grab;",
    "  user-select: none;",
    "  touch-action: none;",
    "  position: relative;",
    "}",
    `.${BUBBLE_CARDS_GRID} > .card[data-edit-draggable="1"] > :not(.area-card-pin-switch):not(.area-card-pin-menu):not(.area-card-battery-readout):not(.area-card-drag-handle) {`,
    "  pointer-events: none !important;",
    "}",
    `.${BUBBLE_CARDS_GRID} > .card:not([data-edit-draggable="1"]) > :not(.area-card-pin-switch):not(.area-card-pin-menu):not(.area-card-battery-readout):not(.area-card-pin-order-wrap) {`,
    "  pointer-events: none !important;",
    "}",
    ".area-card-drag-handle {",
    "  flex: 0 0 auto;",
    "  display: inline-flex;",
    "  align-items: center;",
    "  justify-content: center;",
    "  width: 28px;",
    "  height: 36px;",
    "  color: var(--secondary-text-color);",
    "  opacity: 0.65;",
    "  cursor: grab;",
    "  touch-action: none;",
    "  --mdc-icon-size: 20px;",
    "}",
    ".area-card-drag-handle:hover {",
    "  opacity: 1;",
    "  color: var(--primary-text-color);",
    "}",
    ".area-card-dragging {",
    "  position: fixed !important;",
    "  z-index: 9999 !important;",
    "  pointer-events: none !important;",
    "  margin: 0 !important;",
    "  border-radius: 14px;",
    "  outline: 2px solid var(--primary-color, #03a9f4) !important;",
    "  outline-offset: 2px;",
    "  box-shadow: 0 14px 36px rgba(0, 0, 0, 0.34), 0 0 0 4px color-mix(in srgb, var(--primary-color, #03a9f4) 24%, transparent) !important;",
    "  scale: 1.02;",
    "  opacity: 0.98 !important;",
    "  will-change: transform;",
    "}",
    ".area-card-drag-placeholder {",
    "  box-sizing: border-box;",
    "  border: 1.5px dashed color-mix(in srgb, var(--primary-text-color, #ffffff) 18%, transparent);",
    "  border-radius: 12px;",
    "  background: color-mix(in srgb, var(--primary-text-color, #ffffff) 4%, transparent);",
    "  pointer-events: none;",
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
    "  flex-direction: column;",
    "  gap: 0;",
    "  width: 100%;",
    "  border-radius: 12px;",
    "  overflow: visible;",
    "}",
    ".area-card-pin-order-row {",
    "  display: flex;",
    "  flex-direction: row;",
    "  flex-wrap: nowrap;",
    "  align-items: stretch;",
    "  gap: 0;",
    "  width: 100%;",
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
    "  touch-action: none;",
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
    if (
      child.classList.contains("area-card-pin-switch") ||
      child.classList.contains("area-card-drag-handle")
    ) {
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
        child.localName === "area-card-camera-row"
      ) {
        const queue: HTMLElement[] = [child];
        while (queue.length > 0) {
          const parent = queue.shift()!;
          for (const nested of parent.children) {
            if (!(nested instanceof HTMLElement)) continue;
            if (nested.localName === "area-card-device-row" || nested.localName === "area-card-camera-row" || nested.localName === "hui-card") {
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
  const existing = root.querySelector(`#${CSS.escape(id)}`);
  if (!text) {
    existing?.remove();
    return;
  }
  let style = existing;
  if (!(style instanceof HTMLStyleElement)) {
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
      host.localName === "area-card-camera-row"
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
      h.localName !== "area-card-camera-row" &&
      h.shadowRoot?.querySelector("ha-card"),
  );
  if (!ready && tries < 30 && card.isConnected && typeof requestAnimationFrame === "function") {
    requestAnimationFrame(() => stylePreviewCard(card, edge, sideBySide, tries + 1));
  }
}

const previewConfigKeys = new WeakMap<HTMLElement, string>();

interface DragControllerOptions {
  grid: HTMLElement;
  handleOnly?: boolean;
  beginDrag: (item: HTMLElement, rect: DOMRect) => HTMLElement;
  getSiblings: (item: HTMLElement, placeholder: HTMLElement) => HTMLElement[];
  getOrderedSlots: (placeholder: HTMLElement) => HTMLElement[];
  reorderToTarget: (placeholder: HTMLElement, target: HTMLElement) => void;
  commitDrag: (item: HTMLElement, placeholder: HTMLElement) => void;
  revertDrag: (item: HTMLElement, placeholder: HTMLElement) => void;
}

const dragOptionsMap = new WeakMap<HTMLElement, DragControllerOptions>();

function clearFlipStyles(elements: readonly HTMLElement[]): void {
  for (const el of elements) {
    el.style.transition = "";
    el.style.transform = "";
  }
}

function animateFlip(elements: readonly HTMLElement[], beforeRects: ReadonlyMap<HTMLElement, DOMRect>): void {
  const moved: Array<{ el: HTMLElement; dx: number; dy: number }> = [];
  for (const el of elements) {
    const before = beforeRects.get(el);
    if (!before) continue;
    const after = el.getBoundingClientRect();
    const dx = before.left - after.left;
    const dy = before.top - after.top;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
    moved.push({ el, dx, dy });
  }
  if (moved.length === 0) return;

  for (const { el, dx, dy } of moved) {
    el.style.transition = "none";
    el.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
  }

  void moved[0].el.offsetHeight;

  const startTransition = () => {
    for (const { el } of moved) {
      el.style.transition = FLIP_TRANSITION;
      el.style.transform = "translate3d(0, 0, 0)";
    }
  };

  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(startTransition);
  } else {
    startTransition();
  }
}

function shouldSwapWithTarget(
  clientX: number,
  clientY: number,
  targetRect: DOMRect,
  placeholderRect: DOMRect,
  fromIdx: number,
  toIdx: number,
): boolean {
  if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return false;
  const sameRow =
    placeholderRect.height > 0 &&
    Math.abs(targetRect.top - placeholderRect.top) < Math.min(targetRect.height, placeholderRect.height) * 0.5;
  if (sameRow) {
    const midX = targetRect.left + targetRect.width * 0.5;
    return fromIdx < toIdx ? clientX >= midX : clientX <= midX;
  }
  const midY = targetRect.top + targetRect.height * 0.5;
  return fromIdx < toIdx ? clientY >= midY : clientY <= midY;
}

function attachPointerDrag(item: HTMLElement, options: DragControllerOptions): void {
  dragOptionsMap.set(item, options);
  if (item.dataset.editDragBound === "1") return;
  item.dataset.editDragBound = "1";

  item.addEventListener("pointerdown", (downEvent: PointerEvent) => {
    const opts = dragOptionsMap.get(item);
    if (!opts) return;
    if (downEvent.pointerType === "mouse" && downEvent.button !== 0) return;
    const path = eventPath(downEvent);
    if (
      path.some(
        (n) =>
          n instanceof Element &&
          (n.classList.contains("area-card-pin-switch") || n.classList.contains("area-card-pin-menu")),
      )
    ) {
      return;
    }
    if (opts.handleOnly && downEvent.pointerType !== "mouse") {
      if (!path.some((n) => n instanceof Element && n.classList.contains("area-card-drag-handle"))) {
        return;
      }
    }

    const startX = downEvent.clientX;
    const startY = downEvent.clientY;
    let dragging = false;
    let placeholder: HTMLElement | null = null;
    let baseX = 0;
    let baseY = 0;
    let savedStyle: {
      position: string;
      left: string;
      top: string;
      width: string;
      height: string;
      margin: string;
      transform: string;
      transition: string;
      zIndex: string;
    } | null = null;

    const cleanupListenersAndStyles = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKeyDown);
      activeDragCancels.delete(opts.grid);

      if (dragging && placeholder) {
        clearFlipStyles(opts.getSiblings(item, placeholder));
      }
      if (savedStyle) {
        item.style.position = savedStyle.position;
        item.style.left = savedStyle.left;
        item.style.top = savedStyle.top;
        item.style.width = savedStyle.width;
        item.style.height = savedStyle.height;
        item.style.margin = savedStyle.margin;
        item.style.transform = savedStyle.transform;
        item.style.transition = savedStyle.transition;
        item.style.zIndex = savedStyle.zIndex;
      }
      item.classList.remove("area-card-dragging");
      delete item.dataset.editDragging;
    };

    const onMove = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      if (!dragging) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
        dragging = true;
        const rect = item.getBoundingClientRect();
        savedStyle = {
          position: item.style.position,
          left: item.style.left,
          top: item.style.top,
          width: item.style.width,
          height: item.style.height,
          margin: item.style.margin,
          transform: item.style.transform,
          transition: item.style.transition,
          zIndex: item.style.zIndex,
        };
        placeholder = opts.beginDrag(item, rect);
        activeDragCancels.set(opts.grid, onCancel);

        item.classList.add("area-card-dragging");
        item.dataset.editDragging = "1";
        item.style.position = "fixed";
        item.style.left = "0px";
        item.style.top = "0px";
        item.style.width = `${rect.width}px`;
        item.style.height = `${rect.height}px`;
        item.style.margin = "0";
        item.style.transition = "none";
        item.style.transform = "none";
        const fixedRect = item.getBoundingClientRect();
        baseX = rect.left - fixedRect.left;
        baseY = rect.top - fixedRect.top;
      }

      moveEvent.preventDefault();
      item.style.transform = `translate3d(${baseX + dx}px, ${baseY + dy}px, 0)`;

      if (!placeholder) return;
      const siblings = opts.getSiblings(item, placeholder);
      const slots = opts.getOrderedSlots(placeholder);
      const fromIdx = slots.indexOf(placeholder);
      const placeholderRect = placeholder.getBoundingClientRect();

      let hoveredTarget: HTMLElement | null = null;
      for (const candidate of siblings) {
        const cRect = candidate.getBoundingClientRect();
        if (cRect.width <= 0 || cRect.height <= 0) continue;
        if (
          moveEvent.clientX >= cRect.left &&
          moveEvent.clientX <= cRect.right &&
          moveEvent.clientY >= cRect.top &&
          moveEvent.clientY <= cRect.bottom
        ) {
          const toIdx = slots.indexOf(candidate);
          if (shouldSwapWithTarget(moveEvent.clientX, moveEvent.clientY, cRect, placeholderRect, fromIdx, toIdx)) {
            hoveredTarget = candidate;
            break;
          }
        }
      }

      if (hoveredTarget) {
        const beforeRects = new Map<HTMLElement, DOMRect>();
        for (const sib of siblings) {
          beforeRects.set(sib, sib.getBoundingClientRect());
        }
        clearFlipStyles(siblings);
        opts.reorderToTarget(placeholder, hoveredTarget);
        animateFlip(siblings, beforeRects);
      }
    };

    const onUp = () => {
      const wasDragging = dragging;
      const ph = placeholder;
      cleanupListenersAndStyles();
      if (wasDragging && ph) {
        opts.commitDrag(item, ph);
      }
    };

    const onCancel = () => {
      const wasDragging = dragging;
      const ph = placeholder;
      cleanupListenersAndStyles();
      if (wasDragging && ph) {
        opts.revertDrag(item, ph);
      }
    };

    const onKeyDown = (keyEvent: KeyboardEvent) => {
      if (keyEvent.key === "Escape") {
        keyEvent.preventDefault();
        onCancel();
      }
    };

    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKeyDown);
  });
}

function layoutPinOrderPreview(
  preview: HTMLElement,
  orderedIds: readonly string[],
  popupCards: readonly Record<string, unknown>[],
  itemById: ReadonlyMap<string, HTMLElement>,
  draggedEntityId?: string,
  placeholder?: HTMLElement,
): void {
  const selected = selectPinnedCards(popupCards, orderedIds);
  const layout = layoutPinnedCards(selected);

  const rowEls: HTMLElement[] = [];
  for (let rowIndex = 0; rowIndex < layout.length; rowIndex += 1) {
    const row = layout[rowIndex];
    let rowEl = preview.children[rowIndex] as HTMLElement | undefined;
    if (!rowEl || !rowEl.classList.contains("area-card-pin-order-row")) {
      rowEl = document.createElement("div");
      rowEl.className = "area-card-pin-order-row";
      preview.insertBefore(rowEl, preview.children[rowIndex] ?? null);
    }
    rowEls.push(rowEl);

    let cardIndex = 0;
    for (let i = 0; i < row.cards.length; i += 1) {
      const item = row.cards[i];
      const id = pinEntityId(item.config);
      if (!id) continue;
      const slotEl = id === draggedEntityId && placeholder ? placeholder : itemById.get(id);
      if (!slotEl) continue;

      applyItemWidth(slotEl, item.width);
      if (slotEl !== placeholder) {
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
      }

      const at = rowEl.children[cardIndex] ?? null;
      if (at !== slotEl) rowEl.insertBefore(slotEl, at);
      cardIndex += 1;
    }
    while (rowEl.children.length > cardIndex) {
      rowEl.children[rowEl.children.length - 1]?.remove();
    }
  }
  while (preview.children.length > rowEls.length) {
    const last = preview.children[preview.children.length - 1];
    if (last instanceof HTMLElement && last.dataset.editDragging === "1") break;
    last?.remove();
  }
}

export interface CardBackgroundOption {
  label: string;
  mode: AreaBackgroundMode;
}

export function cardBackgroundOptions(options: {
  areaPicture: string | null | undefined;
  cameras: readonly string[];
  states?: Record<string, EntityState | undefined>;
  roomName?: string;
}): CardBackgroundOption[] {
  const choices: CardBackgroundOption[] = [
    { label: "Light tint (default)", mode: { mode: "light-tint" } },
  ];
  if (typeof options.areaPicture === "string" && options.areaPicture.length > 0) {
    choices.push({ label: "Area picture", mode: { mode: "area-picture" } });
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
  return mode.mode === "camera" ? `camera:${mode.entityId}` : mode.mode;
}

export function syncCardBackgroundSection(
  root: ParentNode,
  options: {
    editing: boolean;
    current: AreaBackgroundMode;
    areaPicture: string | null | undefined;
    cameras: readonly string[];
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
      if (choice.mode.mode === "camera") btn.dataset.bgEntity = choice.mode.entityId;
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

export function syncPinOrderSection(
  root: ParentNode,
  options: {
    editing: boolean;
    pins: AreaPins;
    popupCards: readonly Record<string, unknown>[];
    hass: ClassifierHass;
    onReorderPins: (nextOrder: string[]) => void;
  },
): void {
  const grid = root.querySelector(`.${BUBBLE_CARDS_GRID}`);
  if (!(grid instanceof HTMLElement)) return;
  if (activeDragCancels.has(grid)) {
    if (options.editing) return;
    activeDragCancels.get(grid)?.();
  }
  const existing = grid.querySelector(`:scope > .${PIN_ORDER_CLASS}`);
  const orderedIds = pinnedOrder(options.pins);
  if (!options.editing || orderedIds.length < 2) {
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
    section.append(header, preview);
  }
  const bgSection = grid.querySelector(`:scope > .${BG_SECTION_CLASS}`);
  const anchor = bgSection
    ? (grid.children[[...grid.children].indexOf(bgSection) + 1] ?? null)
    : grid.firstElementChild;
  if (anchor !== section) grid.insertBefore(section, anchor);

  const preview = section.querySelector(":scope > .area-card-pin-order-preview");
  if (!(preview instanceof HTMLElement)) return;

  const selected = selectPinnedCards(options.popupCards, orderedIds);
  const existingItems = new Map<string, HTMLElement>();
  for (const el of preview.querySelectorAll<HTMLElement>("[data-pin-order-entity]")) {
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

  layoutPinOrderPreview(preview, orderedIds, options.popupCards, itemById);

  let currentOrder = [...orderedIds];
  let initialOrder = [...orderedIds];
  let draggedId = "";

  for (const [id, itemEl] of itemById) {
    attachPointerDrag(itemEl, {
      grid,
      beginDrag: (dragged, rect) => {
        draggedId = id;
        initialOrder = [...orderedIds];
        currentOrder = [...orderedIds];
        const placeholder = document.createElement("div");
        placeholder.className = "area-card-drag-placeholder";
        placeholder.dataset.pinOrderPlaceholder = id;
        placeholder.style.height = `${rect.height}px`;
        if (dragged.parentElement) {
          dragged.parentElement.insertBefore(placeholder, dragged);
        }
        preview.append(dragged);
        layoutPinOrderPreview(preview, currentOrder, options.popupCards, itemById, draggedId, placeholder);
        return placeholder;
      },
      getSiblings: () =>
        [...preview.querySelectorAll<HTMLElement>("[data-pin-order-entity]")].filter(
          (el) => el.dataset.editDragging !== "1",
        ),
      getOrderedSlots: (placeholder) => {
        const slots: HTMLElement[] = [];
        for (const row of preview.children) {
          if (!row.classList.contains("area-card-pin-order-row")) continue;
          for (const child of row.children) {
            if (
              child instanceof HTMLElement &&
              (child === placeholder || (child.dataset.pinOrderEntity && child.dataset.editDragging !== "1"))
            ) {
              slots.push(child);
            }
          }
        }
        return slots;
      },
      reorderToTarget: (placeholder, target) => {
        const toId = target.dataset.pinOrderEntity;
        if (!toId || !draggedId) return;
        const nextOrder = reorderIds(currentOrder, draggedId, toId);
        if (nextOrder.every((v, idx) => v === currentOrder[idx])) return;
        currentOrder = nextOrder;
        layoutPinOrderPreview(preview, currentOrder, options.popupCards, itemById, draggedId, placeholder);
      },
      commitDrag: (_dragged, placeholder) => {
        placeholder.remove();
        layoutPinOrderPreview(preview, currentOrder, options.popupCards, itemById);
        const changed = currentOrder.some((v, idx) => v !== initialOrder[idx]);
        if (changed) {
          options.onReorderPins(currentOrder);
        }
      },
      revertDrag: (_dragged, placeholder) => {
        placeholder.remove();
        currentOrder = [...initialOrder];
        layoutPinOrderPreview(preview, initialOrder, options.popupCards, itemById);
      },
    });
  }
}

function scopeSlotElements(grid: HTMLElement, scope: string, includeDragging: boolean): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (const child of grid.children) {
    if (!(child instanceof HTMLElement)) continue;
    if (!child.classList.contains("card")) continue;
    if (child.dataset.editScope !== scope) continue;
    if (!includeDragging && child.dataset.editDragging === "1") continue;
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
  if (activeDragCancels.has(grid)) {
    if (options.editing) return;
    activeDragCancels.get(grid)?.();
  }
  let scopeIndex = 0;
  for (const cell of [...grid.children]) {
    if (!(cell instanceof HTMLElement)) continue;
    if (cell.classList.contains(PIN_ORDER_CLASS) || cell.classList.contains(BG_SECTION_CLASS)) continue;
    if (isTitleCell(cell)) {
      scopeIndex += 1;
      delete cell.dataset.editDraggable;
      delete cell.dataset.editScope;
      delete cell.dataset.editEntity;
      cell.querySelector(":scope > .area-card-drag-handle")?.remove();
      continue;
    }
    const entityId = options.editing ? pinEntityId(rowConfig(cell)) : null;
    if (!options.editing || !entityId) {
      delete cell.dataset.editDraggable;
      delete cell.dataset.editScope;
      delete cell.dataset.editEntity;
      cell.querySelector(":scope > .area-card-drag-handle")?.remove();
      continue;
    }
    cell.dataset.editDraggable = "1";
    cell.dataset.editScope = String(scopeIndex);
    cell.dataset.editEntity = entityId;
    let handle = cell.querySelector(":scope > .area-card-drag-handle");
    if (!handle) {
      handle = document.createElement("div");
      handle.className = "area-card-drag-handle";
      handle.setAttribute("aria-hidden", "true");
      const icon = document.createElement("ha-icon");
      icon.setAttribute("icon", "mdi:drag");
      handle.append(icon);
      cell.append(handle);
    }

    let initialScopeElements: HTMLElement[] = [];
    let initialScopeIds: string[] = [];

    attachPointerDrag(cell, {
      grid,
      handleOnly: true,
      beginDrag: (dragged, rect) => {
        const scope = dragged.dataset.editScope ?? "";
        initialScopeElements = scopeSlotElements(grid, scope, true);
        initialScopeIds = initialScopeElements
          .map((el) => el.dataset.editEntity)
          .filter((id): id is string => Boolean(id));

        const placeholder = document.createElement("div");
        const preservedClasses = dragged.className
          .split(/\s+/)
          .filter((c) => c && c !== "area-card-dragging");
        placeholder.className = [...preservedClasses, "area-card-drag-placeholder"].join(" ");
        placeholder.dataset.editScope = scope;
        placeholder.dataset.editEntity = dragged.dataset.editEntity ?? "";
        placeholder.style.height = `${rect.height}px`;
        if (dragged.style.gridColumn) placeholder.style.gridColumn = dragged.style.gridColumn;
        if (dragged.style.gridRow) placeholder.style.gridRow = dragged.style.gridRow;
        grid.insertBefore(placeholder, dragged);
        return placeholder;
      },
      getSiblings: (dragged) => {
        const scope = dragged.dataset.editScope;
        if (!scope) return [];
        return scopeSlotElements(grid, scope, false).filter(
          (el) => el !== dragged && !el.classList.contains("area-card-drag-placeholder"),
        );
      },
      getOrderedSlots: (placeholder) => {
        const scope = placeholder.dataset.editScope;
        if (!scope) return [];
        return scopeSlotElements(grid, scope, false);
      },
      reorderToTarget: (placeholder, target) => {
        const scope = placeholder.dataset.editScope;
        if (!scope || !canDropInScope(scope, target.dataset.editScope)) return;
        const slots = scopeSlotElements(grid, scope, false);
        const fromIdx = slots.indexOf(placeholder);
        const toIdx = slots.indexOf(target);
        if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;
        if (fromIdx < toIdx) {
          const targetIdx = [...grid.children].indexOf(target);
          const afterTarget = targetIdx !== -1 ? (grid.children[targetIdx + 1] ?? null) : null;
          grid.insertBefore(placeholder, afterTarget);
        } else {
          grid.insertBefore(placeholder, target);
        }
      },
      commitDrag: (dragged, placeholder) => {
        grid.insertBefore(dragged, placeholder);
        placeholder.remove();
        const scope = dragged.dataset.editScope;
        const fromId = dragged.dataset.editEntity;
        if (!scope || !fromId) return;
        const scopeCells = scopeSlotElements(grid, scope, true);
        const scopeIds = scopeCells
          .map((el) => el.dataset.editEntity)
          .filter((id): id is string => Boolean(id));
        const changed = scopeIds.some((id, idx) => id !== initialScopeIds[idx]);
        if (changed) {
          options.onReorderScope(fromId, scopeIds);
        }
      },
      revertDrag: (_dragged, placeholder) => {
        const anchor = placeholder;
        for (const el of initialScopeElements) {
          grid.insertBefore(el, anchor);
        }
        placeholder.remove();
      },
    });
  }
}
