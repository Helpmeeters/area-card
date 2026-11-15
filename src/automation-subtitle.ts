import { sectionIcon, type SectionRollup } from "./rollups";

const STRIKE_OPEN = "\u2061";
const STRIKE_CLOSE = "\u2062";
/** Invisible slots. Bubble escapes HTML in state_content, so the icons are inserted later. */
export const AUTOMATION_ICON_MARK = "\u2063";
export const HELPER_ICON_MARK = "\u2064";

export interface SubtitleSegment {
  kind: "text" | "strike" | "icon";
  text?: string;
  icon?: string;
}

/** `X/Y` and the helpers icon. */
export function helperSubtitleSegments(rollup: SectionRollup): SubtitleSegment[] {
  return [
    { kind: "text", text: `${rollup.active}/${rollup.total} ` },
    { kind: "icon", icon: sectionIcon("helpers") },
  ];
}

/**
 * `X/Y` and the automations icon when nothing is disabled.
 * `X/Y+`, a struck Z, a space, and the icon when Z is greater than zero.
 */
export function automationSubtitleSegments(rollup: SectionRollup): SubtitleSegment[] {
  const disabled = rollup.disabled ?? 0;
  const off = rollup.off ?? Math.max(0, rollup.total - rollup.active - disabled);
  const ready = rollup.active + off;
  const icon: SubtitleSegment = { kind: "icon", icon: sectionIcon("automations") };
  if (disabled > 0) {
    return [
      { kind: "text", text: `${rollup.active}/${ready}+` },
      { kind: "strike", text: String(disabled) },
      { kind: "text", text: " " },
      icon,
    ];
  }
  return [{ kind: "text", text: `${rollup.active}/${ready} ` }, icon];
}

export function helperStateText(rollup: SectionRollup): string {
  return encodeSubtitle(helperSubtitleSegments(rollup));
}

/** Plain text for the state template. Marks stand where the struck count and icons go. */
export function automationStateText(rollup: SectionRollup): string {
  return encodeSubtitle(automationSubtitleSegments(rollup));
}

function encodeSubtitle(segments: readonly SubtitleSegment[]): string {
  return segments
    .map((segment) => {
      if (segment.kind === "strike") return `${STRIKE_OPEN}${segment.text ?? ""}${STRIKE_CLOSE}`;
      if (segment.kind === "icon") return iconMark(segment.icon ?? "");
      return segment.text ?? "";
    })
    .join("");
}

function iconMark(icon: string): string {
  return icon === sectionIcon("helpers") ? HELPER_ICON_MARK : AUTOMATION_ICON_MARK;
}

function iconName(mark: string): string {
  return mark === HELPER_ICON_MARK ? sectionIcon("helpers") : sectionIcon("automations");
}

function parseSubtitle(raw: string): SubtitleSegment[] | null {
  if (!raw.includes(STRIKE_OPEN) && !raw.includes(HELPER_ICON_MARK) && !raw.includes(AUTOMATION_ICON_MARK)) {
    return null;
  }
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
    if (ch === HELPER_ICON_MARK || ch === AUTOMATION_ICON_MARK) {
      pushText();
      segments.push({ kind: "icon", icon: iconName(ch) });
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
 * Replace the marks in `.bubble-state` with icons and a struck disabled count.
 * Returns false when the line has no marks, so a repeat observer pass does nothing.
 */
export function placeAutomationSubtitle(state: HTMLElement): boolean {
  const raw = state.textContent ?? "";
  const segments = parseSubtitle(raw);
  if (!segments) return false;
  const doc = state.ownerDocument;
  const nodes = segments.map((segment) => {
    if (segment.kind === "text") return doc.createTextNode(segment.text ?? "");
    if (segment.kind === "strike") {
      const struck = doc.createElement("s");
      struck.className = "area-card-automation-disabled";
      struck.textContent = segment.text ?? "";
      struck.style.setProperty("text-decoration", "line-through");
      return struck;
    }
    const icon = doc.createElement("ha-icon");
    icon.className = "area-card-subtitle-icon";
    icon.setAttribute("icon", segment.icon ?? sectionIcon("automations"));
    icon.setAttribute("aria-hidden", "true");
    icon.style.setProperty("display", "inline-block");
    icon.style.setProperty("width", "12px");
    icon.style.setProperty("height", "12px");
    // The subtitle line-height otherwise drops the glyph below the icon box.
    icon.style.setProperty("line-height", "0");
    icon.style.setProperty("vertical-align", "1px");
    icon.style.setProperty("--mdc-icon-size", "12px");
    return icon;
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
