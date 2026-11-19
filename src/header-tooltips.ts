import { hideAreaDotTooltip, showAreaDotTooltip } from "./dot-tooltip";

export function pinEditButtonLabel(editing: boolean): string {
  return editing
    ? "Edit pinned controls — On (click to finish)"
    : "Edit pinned controls — Choose which rows appear on the area card";
}

export function pinEditTooltipText(editing: boolean): string {
  return editing
    ? "Edit pinned controls: On\nClick to finish"
    : "Edit pinned controls\nChoose which rows appear on the area card";
}

export function areaEditButtonLabel(): string {
  return "Area settings — Open Home Assistant settings for this area";
}

export function areaEditTooltipText(): string {
  return "Area settings\nOpen Home Assistant settings for this area";
}

export function closeButtonTooltipText(): string {
  return "Close";
}

/** Attach consistent tooltip and dismiss listeners once to a header action button. */
export function bindHeaderButtonTooltip(button: HTMLElement, text: string | (() => string)): void {
  button.removeAttribute("title");
  if (button.dataset.areaHeaderTipBound === "1") return;
  button.dataset.areaHeaderTipBound = "1";
  const resolveText = typeof text === "function" ? text : () => text;
  button.addEventListener("pointerenter", () => showAreaDotTooltip(button, resolveText()));
  button.addEventListener("pointerleave", hideAreaDotTooltip);
  button.addEventListener("focus", () => showAreaDotTooltip(button, resolveText()));
  button.addEventListener("blur", hideAreaDotTooltip);
  button.addEventListener("pointerdown", hideAreaDotTooltip);
  button.addEventListener("click", hideAreaDotTooltip);
}

export function syncPinEditButton(button: HTMLButtonElement, editing: boolean): void {
  button.setAttribute("aria-pressed", editing ? "true" : "false");
  button.setAttribute("aria-label", pinEditButtonLabel(editing));
  bindHeaderButtonTooltip(button, () => pinEditTooltipText(button.getAttribute("aria-pressed") === "true"));
}

export function syncAreaEditButton(button: HTMLButtonElement): void {
  button.setAttribute("aria-label", areaEditButtonLabel());
  bindHeaderButtonTooltip(button, areaEditTooltipText);
}

export function syncCloseButtonTooltip(actions: Element): void {
  const close = actions.querySelector(".bubble-close-button");
  if (close instanceof HTMLElement) {
    bindHeaderButtonTooltip(close, closeButtonTooltipText);
  }
}
