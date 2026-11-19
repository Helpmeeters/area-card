import { automationStateText, helperStateText } from "./automation-subtitle";
import { climateSubtitle } from "./climate-subtitle";
import { lightTintBackgroundStyles, type RgbColor } from "./light-tint";
import { pictureBackgroundStyles } from "./picture";
import { emptyRollupDotClass, FLOOR_CHEVRON_PX, ROLLUP_ORDER, rollupDotClass, rollupDotStyles, sectionIcon, sectionRollups, type RollupId, type SectionRollup } from "./rollups";
import type { AreaSections, EntityState } from "./sections";
import { areaHash, BUBBLE_CARD_TYPE } from "./tags";

export interface PresenceBadge {
  text: string;
  occupied: boolean;
}

export interface ButtonConfigInput {
  areaId: string;
  name: string;
  icon: string;
  sections: AreaSections;
  states?: Record<string, EntityState | undefined>;
  /** Ordered list of section ids to include as dot sub-buttons. Defaults to all slots (ROLLUP_ORDER). */
  dotSlots?: readonly RollupId[];
  picture?: string | null;
  lightTint?: RgbColor | null;
  presenceBadge?: PresenceBadge | null;
  unavailable?: boolean;
  /** Automations that cannot trigger because their devices are unavailable. */
  disabledAutomations?: ReadonlySet<string>;
  /** Shift the dot row left by the floor chevron so it lines up with the floor header. */
  alignDots?: boolean;
  /** Home Assistant's state formatter. The card falls back to state and unit when this is missing. */
  formatEntityState?: (state: EntityState) => string;
}

/** Same treatment Bubble applies to a button whose entity is unavailable. */
const UNAVAILABLE_BUTTON_STYLES = [
  "ha-card {",
  "  opacity: 0.5 !important;",
  "}",
  ".bubble-wrapper {",
  "  cursor: not-allowed;",
  "}",
  ".bubble-buttons-container {",
  "  display: none;",
  "}",
].join("\n");

/**
 * Ellipsis on the subtitle under the room name. display has no !important so
 * Bubble's `.hidden { display: none !important }` still hides an empty state line.
 */
const STATE_LINE_STYLES = [
  ".bubble-name-container > .bubble-state {",
  "  display: block;",
  "  min-width: 0;",
  "  max-width: 100%;",
  "  overflow: hidden;",
  "  text-overflow: ellipsis;",
  "  white-space: nowrap;",
  "}",
  ".bubble-name-container > .bubble-state > ha-icon.area-card-subtitle-icon {",
  "  display: inline-block;",
  "  width: 12px;",
  "  height: 12px;",
  "  line-height: 0;",
  "  vertical-align: 1px;",
  "  --mdc-icon-size: 12px;",
  "}",
  ".bubble-name-container > .bubble-state > s.area-card-automation-disabled {",
  "  text-decoration: line-through;",
  "}",
].join("\n");

export function buildButtonConfig(input: ButtonConfigInput): Record<string, unknown> {
  const hash = areaHash(input.areaId);
  const navigate = {
    action: "navigate",
    navigation_path: hash,
  };
  const rollups = sectionRollups(input.sections, input.states ?? {}, input.disabledAutomations);
  const byId = new Map(rollups.map((rollup) => [rollup.id, rollup]));
  const slots = input.dotSlots ?? ROLLUP_ORDER;
  const subButtons = slots.map((id) => {
    const rollup = byId.get(id);
    if (!rollup) {
      return {
        icon: sectionIcon(id),
        show_name: false,
        show_icon: true,
        show_background: false,
        css_class: emptyRollupDotClass(id),
        tap_action: { action: "none" },
        hold_action: { action: "none" },
        double_tap_action: { action: "none" },
      };
    }
    return {
      icon: sectionIcon(id),
      show_name: false,
      show_icon: true,
      show_background: false,
      css_class: rollupDotClass(rollup),
      tap_action: navigate,
      hold_action: { action: "none" },
      double_tap_action: { action: "none" },
    };
  });

  const config: Record<string, unknown> = {
    type: BUBBLE_CARD_TYPE,
    card_type: "button",
    button_type: "name",
    name: input.name,
    icon: input.icon,
    tap_action: navigate,
    button_action: {
      tap_action: navigate,
      hold_action: { action: "none" },
      double_tap_action: { action: "none" },
    },
    sub_button: subButtons,
    styles: buttonStyles(
      rollups,
      input.picture,
      input.lightTint,
      input.presenceBadge,
      input.unavailable,
      input.alignDots,
    ),
  };
  const climate = climateSubtitle(
    input.sections.climate,
    input.states ?? {},
    input.name,
    input.formatEntityState,
  );
  const counts = countSubtitle(rollups);
  const subtitle = [climate, counts].filter((part) => part !== "").join(" · ");
  if (subtitle) config.state_content = `{{ ${JSON.stringify(subtitle)} }}`;
  // The marquee rewrite replaces .bubble-state and would drop the icons.
  if (counts) config.scrolling_effect = false;
  return config;
}

/** On/off helpers, then automations. A comma separates the counts when both are present. */
function countSubtitle(rollups: readonly SectionRollup[]): string {
  const helpers = rollups.find((rollup) => rollup.id === "helpers");
  const automations = rollups.find((rollup) => rollup.id === "automations");
  const parts: string[] = [];
  if (helpers) parts.push(helperStateText(helpers));
  if (automations) parts.push(automationStateText(automations));
  return parts.join(", ");
}

function buttonStyles(
  rollups: ReturnType<typeof sectionRollups>,
  picture: string | null | undefined,
  lightTint: RgbColor | null | undefined,
  presenceBadge: PresenceBadge | null | undefined,
  unavailable: boolean | undefined,
  alignDots: boolean | undefined,
): string {
  const parts = [rollupDotStyles(rollups), STATE_LINE_STYLES];
  if (alignDots) parts.push(alignDotStyles());
  if (picture) parts.push(pictureBackgroundStyles(picture, "button"));
  else if (lightTint) parts.push(lightTintBackgroundStyles(lightTint, "button"));
  if (presenceBadge) parts.push(presencePillStyles(Boolean(picture)));
  if (unavailable) parts.push(UNAVAILABLE_BUTTON_STYLES);
  return parts.join("\n");
}

function presencePillStyles(overPicture: boolean): string {
  const occupiedBg = overPicture
    ? "rgba(76, 175, 80, 0.34)"
    : "color-mix(in srgb, var(--success-color, #4caf50) 20%, transparent)";
  const occupiedColor = overPicture
    ? "#d7ffd9"
    : "var(--success-color, #4caf50)";
  const idleBg = overPicture
    ? "rgba(255, 255, 255, 0.16)"
    : "color-mix(in srgb, var(--secondary-text-color, #888) 16%, transparent)";
  const idleColor = overPicture
    ? "rgba(255, 255, 255, 0.88)"
    : "var(--secondary-text-color)";
  return [
    ".area-card-name-row {",
    "  display: flex;",
    "  align-items: center;",
    "  min-width: 0;",
    "  max-width: 100%;",
    "}",
    ".area-card-name-row > .bubble-name {",
    "  display: block;",
    "  min-width: 0;",
    "  overflow: hidden;",
    "  text-overflow: ellipsis;",
    "  white-space: nowrap;",
    "}",
    ".area-card-presence-pill {",
    "  display: inline-flex;",
    "  align-items: center;",
    "  flex-shrink: 0;",
    "  margin-left: 6px;",
    "  padding: 1px 6px;",
    "  border-radius: 999px;",
    "  font-size: 10px;",
    "  font-weight: 600;",
    "  line-height: 16px;",
    "  letter-spacing: 0.01em;",
    `  background: ${idleBg};`,
    `  color: ${idleColor};`,
    "  text-shadow: none;",
    "  pointer-events: auto;",
    "  cursor: default;",
    "}",
    '.area-card-presence-pill[data-occupied="1"] {',
    `  background: ${occupiedBg};`,
    `  color: ${occupiedColor};`,
    "}",
    ".area-card-presence-pill:focus-visible {",
    "  outline: 2px solid var(--primary-color, currentColor);",
    "  outline-offset: 1px;",
    "}",
    ".area-card-presence-identity {",
    "  --mdc-icon-size: 12px;",
    "  display: inline-flex;",
    "  margin-left: 3px;",
    "  opacity: 0.9;",
    "}",
  ].join("\n");
}

/** Bubble already insets the row 8px. The extra margin clears the floor chevron. */
function alignDotStyles(): string {
  return [
    ".bubble-sub-button-container {",
    `  margin-inline-end: ${FLOOR_CHEVRON_PX}px !important;`,
    "}",
  ].join("\n");
}
