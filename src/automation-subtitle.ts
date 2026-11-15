import type { SectionRollup } from "./rollups";

const STRIKE_OPEN = "\u2061";
const STRIKE_CLOSE = "\u2062";

export interface SubtitleSegment {
  kind: "text" | "strike";
  text?: string;
}

/**
 * `X/Y auto` when nothing is disabled.
 * `X/Y+`, a struck Z, then ` auto` when Z is greater than zero.
 */
export function automationSubtitleSegments(rollup: SectionRollup): SubtitleSegment[] {
  const disabled = rollup.disabled ?? 0;
  const off = rollup.off ?? Math.max(0, rollup.total - rollup.active - disabled);
  const ready = rollup.active + off;
  const tail = " auto";
  if (disabled > 0) {
    return [
      { kind: "text", text: `${rollup.active}/${ready}+` },
      { kind: "strike", text: String(disabled) },
      { kind: "text", text: tail },
    ];
  }
  return [{ kind: "text", text: `${rollup.active}/${ready}${tail}` }];
}

/** Plain text for the state template. Marks stand where the struck count goes. */
export function automationStateText(rollup: SectionRollup): string {
  return automationSubtitleSegments(rollup)
    .map((segment) => {
      if (segment.kind === "strike") return `${STRIKE_OPEN}${segment.text ?? ""}${STRIKE_CLOSE}`;
      return segment.text ?? "";
    })
    .join("");
}

function parseAutomationSubtitle(raw: string): SubtitleSegment[] | null {
  if (!raw.includes(STRIKE_OPEN)) return null;
  const segments: SubtitleSegment[] = [];
  let text = "";
  const pushText = () => {
    if (text === "") return;
    segments.push({ kind: "text", text });
    text = "";
  };
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (ch === STRIKE_OPEN) {
      pushText();
      const end = raw.indexOf(STRIKE_CLOSE, i + 1);
      if (end < 0) return null;
      segments.push({ kind: "strike", text: raw.slice(i + 1, end) });
      i = end;
      continue;
    }
    text += ch;
  }
  pushText();
  return segments;
}

const CLAMP_PROPS = [
  "display",
  "white-space",
  "-webkit-line-clamp",
  "-webkit-box-orient",
  "text-overflow",
  "overflow",
];

/**
 * Replace the strike marks in `.bubble-state` with a struck count.
 * Returns false when the line has no disabled count, so a repeat observer pass does nothing.
 */
export function placeAutomationSubtitle(state: HTMLElement): boolean {
  const raw = state.textContent ?? "";
  const segments = parseAutomationSubtitle(raw);
  if (!segments) return false;
  const doc = state.ownerDocument;
  const nodes = segments.map((segment) => {
    if (segment.kind === "text") return doc.createTextNode(segment.text ?? "");
    const struck = doc.createElement("s");
    struck.className = "area-card-automation-disabled";
    struck.textContent = segment.text ?? "";
    struck.style.setProperty("text-decoration", "line-through");
    return struck;
  });
  state.replaceChildren(...nodes);
  for (const prop of CLAMP_PROPS) state.style.removeProperty(prop);
  return true;
}

/** Collapsed button subtitle only. The popup header uses a different `.bubble-state`. */
export function syncAutomationSubtitle(root: ParentNode): void {
  const state = root.querySelector(".bubble-name-container > .bubble-state");
  if (!(state instanceof HTMLElement)) return;
  placeAutomationSubtitle(state);
}
