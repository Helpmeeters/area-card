/**
 * Half of a Bubble popup row, in the 12-column grid.
 * Desktop popups are 540px from 600px up. Narrower viewports use the screen
 * width, with 7px of the right edge off-screen. Horizontal padding is 18px
 * and the column gap is 8px, so one half-row card is (outer - 36 - 8) / 2.
 * The title sits beside a 36px icon and 10px of padding and gap on each side.
 * A light's LED dot covers another 22px of that text.
 */
const DESKTOP_BREAKPOINT = 600;
const DESKTOP_POPUP = 540;
const POPUP_PADDING = 36;
const COLUMN_GAP = 8;
const ROW_CHROME = 66;
const MOBILE_CLIP = 7;
const LED_RESERVE = 22;
const PRIMARY_FONT = 14;
const SECONDARY_FONT = 12;

/** Wider than Roboto, so a line that passes this still fits when the font is measured. */
export const LINE_WIDTH_RATIO = 0.62;

export type LineMeasure = (text: string, fontSize: number) => number;

export type HalfRowOptions = {
  led?: boolean;
  /** Extra pixels reserved on the right (e.g. automation edit pencil). */
  rightReserve?: number;
  measure?: LineMeasure;
};

export function readViewportWidth(): number {
  if (typeof window !== "undefined" && window.innerWidth > 0) return window.innerWidth;
  return 1200;
}

/** Popup dialog width. Desktop is fixed; a narrower screen uses the viewport. */
export function popupOuterWidth(viewportWidth: number): number {
  return viewportWidth >= DESKTOP_BREAKPOINT ? DESKTOP_POPUP : viewportWidth;
}

export function halfRowTextWidth(viewportWidth: number, ledOrOptions: boolean | Pick<HalfRowOptions, "led" | "rightReserve"> = false): number {
  const led = typeof ledOrOptions === "boolean" ? ledOrOptions : ledOrOptions.led === true;
  const rightReserve = typeof ledOrOptions === "boolean" ? 0 : (ledOrOptions.rightReserve ?? 0);
  const desktop = viewportWidth >= DESKTOP_BREAKPOINT;
  const outer = popupOuterWidth(viewportWidth);
  const card = (outer - POPUP_PADDING - COLUMN_GAP) / 2;
  return card - ROW_CHROME - (desktop ? 0 : MOBILE_CLIP) - (led ? LED_RESERVE : 0) - rightReserve;
}

export function estimateLineWidth(text: string, fontSize: number): number {
  return text.length * fontSize * LINE_WIDTH_RATIO;
}

export function measureLine(text: string, fontSize: number): number {
  const weight = fontSize >= PRIMARY_FONT ? 500 : 400;
  const probe = textProbe();
  if (!probe) return estimateLineWidth(text, fontSize);
  probe.style.fontSize = `${fontSize}px`;
  probe.style.fontWeight = String(weight);
  probe.textContent = text;
  return Math.ceil(probe.getBoundingClientRect().width);
}

/** True when both lines fit a half-row without ellipsis. An unknown title does not. */
export function fitsHalfRow(
  primary: string,
  secondaries: readonly string[],
  viewportWidth: number,
  options?: HalfRowOptions,
): boolean {
  if (primary.startsWith("{{") || primary.trim() === "") return false;
  const measure = options?.measure ?? measureLine;
  const available = halfRowTextWidth(viewportWidth, {
    led: options?.led === true,
    rightReserve: options?.rightReserve ?? 0,
  });
  if (!(available > 0)) return false;
  if (measure(primary, PRIMARY_FONT) > available) return false;
  for (const line of secondaries) {
    if (line && measure(line, SECONDARY_FONT) > available) return false;
  }
  return true;
}

export function rowColumns(
  primary: string,
  secondaries: readonly string[],
  viewportWidth: number,
  options?: HalfRowOptions,
): { columns: number } {
  return { columns: fitsHalfRow(primary, secondaries, viewportWidth, options) ? 6 : 12 };
}

let probe: HTMLSpanElement | undefined;

function textProbe(): HTMLSpanElement | undefined {
  if (typeof document === "undefined" || !document.body) return undefined;
  if (probe?.isConnected) return probe;
  probe = document.createElement("span");
  probe.setAttribute("data-area-card-measure", "");
  probe.style.position = "absolute";
  probe.style.left = "-9999px";
  probe.style.top = "0";
  probe.style.visibility = "hidden";
  probe.style.whiteSpace = "nowrap";
  probe.style.fontFamily = "var(--ha-font-family, var(--primary-font-family, Roboto, sans-serif))";
  probe.style.letterSpacing = "normal";
  document.body.append(probe);
  return probe;
}
