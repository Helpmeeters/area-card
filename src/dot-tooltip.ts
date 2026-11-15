import { eventTargetsDemoEntity } from "./demo";
import { sectionPopupCards } from "./popup-cards";
import { visibleDotRollupId, type RollupId } from "./rollups";
import { popupOuterWidth } from "./row-width";
import type { AreaSections, ClassifierHass, EntityState } from "./sections";

export interface DotTooltipSource {
  sections: AreaSections;
  states: Record<string, EntityState | undefined>;
  roomName: string;
  formatEntityState?: (state: EntityState, stateText?: string) => string;
  hass?: ClassifierHass;
  disabledAutomations?: ReadonlySet<string>;
  /** Demo rows already have a title and state, so the tooltip must not send those templates to Home Assistant. */
  literalState?: boolean;
}

export interface SectionTooltip {
  cards: readonly Record<string, unknown>[];
  hass: ClassifierHass;
}

const TIP_ID = "area-card-dot-tooltip";
const GAP = 6;
const MARGIN = 4;
const HIDE_DELAY_MS = 120;

export function tooltipPosition(
  anchor: { left: number; top: number; width: number; height: number },
  tip: { width: number; height: number },
  viewport: { width: number; height: number },
): { left: number; top: number } {
  let top = anchor.top + anchor.height + GAP;
  if (top + tip.height > viewport.height - MARGIN) {
    const above = anchor.top - GAP - tip.height;
    if (above >= MARGIN) top = above;
    else top = Math.max(MARGIN, Math.min(top, viewport.height - MARGIN - tip.height));
  }
  let left = anchor.left + anchor.width / 2 - tip.width / 2;
  const maxLeft = Math.max(MARGIN, viewport.width - MARGIN - tip.width);
  if (left < MARGIN) left = MARGIN;
  if (left > maxLeft) left = maxLeft;
  return { left, top };
}

let tipEl: HTMLDivElement | undefined;
let scrollBound = false;
let hideTimer = 0;
let resizeObserver: ResizeObserver | undefined;
let anchorEl: HTMLElement | undefined;
const tipSources = new WeakMap<HTMLElement, DotTooltipSource>();

interface TooltipCardElement extends HTMLElement {
  hass?: ClassifierHass;
  config?: Record<string, unknown>;
  load?: () => Promise<unknown> | void;
}

function ensureTip(): HTMLDivElement {
  if (tipEl?.isConnected) return tipEl;
  let style = document.getElementById("area-card-dot-tooltip-style");
  if (!style) {
    style = document.createElement("style");
    style.id = "area-card-dot-tooltip-style";
    style.textContent = `
      #${TIP_ID} {
        position: fixed;
        inset: auto;
        margin: 0;
        box-sizing: border-box;
        height: auto;
        overflow: visible;
        border: 1px solid var(--divider-color, rgba(127, 127, 127, 0.35));
        border-radius: 12px;
        background: var(--secondary-background-color, #202124);
        color: var(--primary-text-color, #f5f5f5);
        font: 500 13px/1.3 var(--primary-font-family, var(--ha-font-family, system-ui, sans-serif));
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.28);
        pointer-events: none;
      }
      #${TIP_ID}[data-tip-kind="text"] {
        width: max-content;
        padding: 4px 10px;
        white-space: pre;
      }
      #${TIP_ID}[data-tip-kind="cards"] {
        padding: 4px 18px 12px;
        white-space: normal;
        pointer-events: auto;
      }
      #${TIP_ID}[data-tip-side="below"]::before,
      #${TIP_ID}[data-tip-side="above"]::after {
        content: "";
        position: absolute;
        left: 0;
        right: 0;
        height: ${GAP}px;
      }
      #${TIP_ID}[data-tip-side="below"]::before { top: -${GAP}px; }
      #${TIP_ID}[data-tip-side="above"]::after { bottom: -${GAP}px; }
      #${TIP_ID} .area-card-dot-tip-grid {
        display: grid;
        grid-template-columns: repeat(12, minmax(0, 1fr));
        column-gap: 8px;
        row-gap: 8px;
        overflow: auto;
      }
    `;
    document.head.appendChild(style);
  }
  const el = document.createElement("div");
  el.id = TIP_ID;
  el.setAttribute("role", "tooltip");
  el.popover = "manual";
  el.addEventListener("pointerenter", () => {
    window.clearTimeout(hideTimer);
    hideTimer = 0;
  });
  el.addEventListener("pointerleave", hideAreaDotTooltip);
  // The tooltip lives on document.body, outside <home-assistant>. Row taps
  // fire hass-action here, and Home Assistant only handles that event on itself.
  el.addEventListener("hass-action", forwardHomeAssistantEvent);
  el.addEventListener("hass-more-info", forwardHomeAssistantEvent);
  document.body.appendChild(el);
  tipEl = el;
  return el;
}

function onScroll(): void {
  hideAreaDotTooltip();
}

/** Home Assistant handles these on its own element, not on document. */
function forwardHomeAssistantEvent(event: Event): void {
  if (eventTargetsDemoEntity(event)) {
    event.stopPropagation();
    return;
  }
  const detail = (event as CustomEvent<unknown>).detail;
  if (detail === undefined) return;
  const homeAssistant = document.querySelector("home-assistant");
  if (!(homeAssistant instanceof HTMLElement)) return;
  homeAssistant.dispatchEvent(
    new CustomEvent(event.type, {
      bubbles: true,
      composed: true,
      cancelable: true,
      detail,
    }),
  );
}

function refreshOpenTooltip(hass: ClassifierHass | undefined): void {
  if (!hass || !tipEl?.matches(":popover-open")) return;
  tipEl.querySelectorAll("hui-card").forEach((node) => {
    if (node instanceof HTMLElement) (node as TooltipCardElement).hass = hass;
  });
}

function placeTooltip(el: HTMLElement, anchor: DOMRect): void {
  const viewport = { width: window.innerWidth, height: window.innerHeight };
  const spaceBelow = viewport.height - MARGIN - (anchor.bottom + GAP);
  const spaceAbove = anchor.top - GAP - MARGIN;
  const pad = verticalPadding(el);
  const cap = Math.max(0, Math.max(spaceBelow, spaceAbove) - pad);
  const body = el.querySelector(".area-card-dot-tip-grid");
  const capped = body instanceof HTMLElement ? body : el;
  const nextMax = `${cap}px`;
  if (capped.style.maxHeight !== nextMax) capped.style.maxHeight = nextMax;
  const maxWidth = `${Math.max(0, viewport.width - 2 * MARGIN)}px`;
  if (el.style.maxWidth !== maxWidth) el.style.maxWidth = maxWidth;
  const tip = el.getBoundingClientRect();
  const pos = tooltipPosition(anchor, { width: tip.width, height: tip.height }, viewport);
  el.dataset.tipSide = pos.top >= anchor.bottom ? "below" : "above";
  el.style.left = `${pos.left}px`;
  el.style.top = `${pos.top}px`;
}

function verticalPadding(el: HTMLElement): number {
  const style = getComputedStyle(el);
  return (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
}

function watchSize(el: HTMLElement, anchor: HTMLElement): void {
  anchorEl = anchor;
  if (typeof ResizeObserver === "undefined") return;
  if (!resizeObserver) {
    resizeObserver = new ResizeObserver(() => {
      if (!tipEl || !anchorEl || !tipEl.matches(":popover-open")) return;
      placeTooltip(tipEl, anchorEl.getBoundingClientRect());
    });
  }
  resizeObserver.observe(el);
}

function renderTooltip(el: HTMLDivElement, content: string | SectionTooltip): void {
  if (typeof content === "string") {
    el.dataset.tipKind = "text";
    el.style.width = "";
    el.textContent = content;
    return;
  }
  el.dataset.tipKind = "cards";
  const outer = popupOuterWidth(window.innerWidth);
  const fitted = Math.min(outer, Math.max(0, window.innerWidth - 2 * MARGIN));
  el.style.width = `${fitted}px`;
  const grid = document.createElement("div");
  grid.className = "area-card-dot-tip-grid";
  for (const config of content.cards) grid.append(createTooltipCard(config, content.hass));
  el.replaceChildren(grid);
}

function createTooltipCard(config: Record<string, unknown>, hass: ClassifierHass): HTMLElement {
  const card = document.createElement("hui-card") as TooltipCardElement;
  card.style.gridColumn = `span ${columnsOf(config)}`;
  card.style.minWidth = "0";
  card.hass = hass;
  card.config = config;
  const load = card.load?.();
  if (load && typeof (load as Promise<unknown>).then === "function") {
    void (load as Promise<unknown>).then(
      () => undefined,
      () => undefined,
    );
  }
  return card;
}

function columnsOf(config: Record<string, unknown>): number {
  const grid = config.grid_options;
  if (!grid || typeof grid !== "object") return 12;
  const columns = (grid as { columns?: unknown }).columns;
  if (typeof columns !== "number" || !Number.isFinite(columns) || columns < 1) return 12;
  return Math.min(12, Math.round(columns));
}

export function showAreaDotTooltip(target: HTMLElement, content: string | SectionTooltip): void {
  const el = ensureTip();
  renderTooltip(el, content);
  el.style.visibility = "hidden";
  const anchor = target.getBoundingClientRect();
  el.style.left = `${anchor.left}px`;
  el.style.top = `${anchor.bottom + GAP}px`;
  if (!el.matches(":popover-open")) el.showPopover();
  placeTooltip(el, anchor);
  el.style.visibility = "visible";
  watchSize(el, target);
  if (!scrollBound) {
    window.addEventListener("scroll", onScroll, true);
    scrollBound = true;
  }
}

/** Card tooltips wait briefly so the pointer can cross the gap onto the tooltip. */
export function dismissAreaDotTooltip(): void {
  window.clearTimeout(hideTimer);
  if (tipEl?.dataset.tipKind !== "cards") {
    hideAreaDotTooltip();
    return;
  }
  hideTimer = window.setTimeout(() => {
    hideTimer = 0;
    if (tipEl?.matches(":hover")) return;
    hideAreaDotTooltip();
  }, HIDE_DELAY_MS);
}

export function hideAreaDotTooltip(): void {
  window.clearTimeout(hideTimer);
  hideTimer = 0;
  resizeObserver?.disconnect();
  anchorEl = undefined;
  if (scrollBound) {
    window.removeEventListener("scroll", onScroll, true);
    scrollBound = false;
  }
  if (!tipEl) return;
  if (tipEl.matches(":popover-open")) tipEl.hidePopover();
}

/**
 * Cards for a visible collapsed dot: the popup heading and every row in that section.
 * Empty slots have no tooltip. Floor headers keep their own summary text.
 */
export function areaDotTooltipCards(
  className: string,
  source?: DotTooltipSource,
): Record<string, unknown>[] | null {
  if (!source) return null;
  const id = visibleDotRollupId(className);
  if (!id) return null;
  const cards = sectionPopupCards(
    id,
    source.sections,
    source.states as Record<string, EntityState>,
    source.roomName,
    source.disabledAutomations ?? new Set<string>(),
    {
      viewportWidth: typeof window === "undefined" ? undefined : window.innerWidth,
      formatEntityState: source.formatEntityState,
      literalState: source.literalState,
    },
  );
  return cards.length > 0 ? cards : null;
}

/** Bind an immediate tooltip on each visible dot. Empty slots are left alone. */
export function syncAreaDotTooltips(root: ParentNode, source?: DotTooltipSource): void {
  root.querySelectorAll(".bubble-sub-button").forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    if (!node.className.includes("area-dot-")) return;
    node.removeAttribute("title");
    const cards = areaDotTooltipCards(node.className, source);
    if (!cards || !source?.hass) {
      tipSources.delete(node);
      delete node.dataset.areaTip;
      return;
    }
    tipSources.set(node, source);
    node.dataset.areaTip = sectionKey(node.className);
    if (node.dataset.areaTipBound === "1") return;
    node.dataset.areaTipBound = "1";
    node.addEventListener("pointerenter", () => {
      const current = tipSources.get(node);
      if (!current?.hass) return;
      const next = areaDotTooltipCards(node.className, current);
      if (!next) return;
      showAreaDotTooltip(node, { cards: next, hass: current.hass });
    });
    node.addEventListener("pointerleave", dismissAreaDotTooltip);
    node.addEventListener("pointerdown", hideAreaDotTooltip);
  });
  refreshOpenTooltip(source?.hass);
}

function sectionKey(className: string): string {
  const id: RollupId | null = visibleDotRollupId(className);
  return id ?? "";
}
