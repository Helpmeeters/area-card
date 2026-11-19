import { mergeEntityOrder, type AreaEntityOrder } from "./entity-order";
import { kioskSatelliteCardType } from "./kiosk-card";
import { stripRoomName } from "./names";
import { pictureBackgroundStyles } from "./picture";
import { popupChromeStyles } from "./popup-chrome";
import { readViewportWidth, rowColumns, type LineMeasure } from "./row-width";
import { rollupLabel, sectionColor, sectionIcon, sectionRollups, sectionTitle, type RollupId } from "./rollups";
import type { AreaSections, EntityState, SatelliteItem } from "./sections";
import { areaHash, BUBBLE_CARD_TYPE, mushroomCardType } from "./tags";

const FULL = { columns: 12 };
const UNAVAILABLE = "Unavailable";

export interface PopupLayout {
  viewportWidth?: number;
  measure?: LineMeasure;
  formatEntityState?: (state: EntityState, sample?: string) => string;
  /**
   * Write the known title, icon, and state instead of a Jinja template.
   * Demo entities are not in Home Assistant, so a template round-trip cannot see them.
   */
  literalState?: boolean;
  entityOrder?: AreaEntityOrder;
}

interface RowLayout {
  viewportWidth: number;
  measure?: LineMeasure;
  formatEntityState?: PopupLayout["formatEntityState"];
  literalState: boolean;
  entityOrder?: AreaEntityOrder;
}
const LIGHT_ROW = "custom:area-card-light-row";
const CAMERA_ROW = "custom:area-card-camera-row";
const SECTION_TITLE = "custom:area-card-section-title";
const STATUS_HEADING = {
  title: "Status",
  icon: "mdi:list-status",
  color: "var(--primary-text-color)",
};

export function buildPopupConfig(
  areaId: string,
  name: string,
  icon: string,
  sections: AreaSections,
  states: Record<string, EntityState> = {},
  picture?: string | null,
  disabledAutomations: ReadonlySet<string> = new Set(),
  layout?: PopupLayout,
): Record<string, unknown> {
  const config: Record<string, unknown> = {
    type: BUBBLE_CARD_TYPE,
    card_type: "pop-up",
    hash: areaHash(areaId),
    name,
    icon,
    bg_blur: 15,
    background_update: true,
    cards: buildPopupCards(sections, states, name, disabledAutomations, layout),
  };
  config.styles = popupChromeStyles(picture ? pictureBackgroundStyles(picture, "popup") : undefined);
  return config;
}

const POPUP_SECTION_ORDER = [
  "status",
  "climate",
  "lights",
  "media",
  "cameras",
  "switches",
  "occupancy",
  "openings",
  "satellites",
  "sensors",
  "locks",
  "vacuums",
  "buttons",
  "scenes",
  "scripts",
  "helpers",
  "automations",
] as const;

type PopupSectionId = (typeof POPUP_SECTION_ORDER)[number];

export function buildPopupCards(
  sections: AreaSections,
  states: Record<string, EntityState> = {},
  roomName = "",
  disabledAutomations: ReadonlySet<string> = new Set(),
  layout?: PopupLayout,
): Record<string, unknown>[] {
  const rows = resolveLayout(layout);
  const cards: Record<string, unknown>[] = [];
  for (const id of POPUP_SECTION_ORDER) {
    const body = sectionBody(id, sections, states, roomName, disabledAutomations, rows);
    if (body.length === 0) continue;
    cards.push(titleCard(id), ...body);
  }
  return cards;
}

/** Heading and rows for one popup section. Empty when that section has nothing to show. */
export function sectionPopupCards(
  id: RollupId,
  sections: AreaSections,
  states: Record<string, EntityState> = {},
  roomName = "",
  disabledAutomations: ReadonlySet<string> = new Set(),
  layout?: PopupLayout,
): Record<string, unknown>[] {
  const body = sectionBody(id, sections, states, roomName, disabledAutomations, resolveLayout(layout));
  if (body.length === 0) return [];
  return [titleCard(id), ...body];
}

function sectionBody(
  id: PopupSectionId,
  sections: AreaSections,
  states: Record<string, EntityState>,
  roomName: string,
  disabledAutomations: ReadonlySet<string>,
  rows: RowLayout,
): Record<string, unknown>[] {
  switch (id) {
    case "status": {
      const rollups = sectionRollups(sections, states, disabledAutomations).filter((rollup) => !rollup.dotOnly);
      if (rollups.length === 0) return [];
      return [
        {
          type: mushroomCardType("chips-card"),
          alignment: "start",
          grid_options: FULL,
          chips: rollups.map((rollup) => ({
            type: "template",
            icon: rollup.icon,
            icon_color: rollup.iconColor,
            content: rollupLabel(rollup),
            tap_action: { action: "none" },
            hold_action: { action: "none" },
            double_tap_action: { action: "none" },
          })),
        },
      ];
    }
    case "climate":
      return sections.climate.map((entity) => climateCard(entity, states, roomName, rows));
    case "lights":
      return sections.lights.map((entity) =>
        withLedDot(
          lightCard(entity, states[entity], states, roomName, rows, Boolean(sections.lightLeds[entity])),
          sections.lightLeds[entity],
        ),
      );
    case "media":
      return sections.mediaPlayers.map((entity) =>
        named(
          {
            type: "media-control",
            entity,
            grid_options: FULL,
          },
          entity,
          states,
          roomName,
        ),
      );
    case "cameras":
      return sections.cameras.map((entity) =>
        withCameraDetections(
          cameraCard(entity, states, roomName),
          sections.cameraDetections?.[entity],
        ),
      );
    case "switches":
      return sections.switches.map((entity) =>
        entityCard(entity, states, roomName, rows, {
          tap_action: { action: "toggle" },
          hold_action: { action: "more-info" },
        }),
      );
    case "occupancy":
      return sections.occupancy.map((item) =>
        occupancyCard(item.entityId, states, roomName, rows, item.pressureEntityId),
      );
    case "openings":
      return sections.openings.map((entity) =>
        entity.startsWith("cover.")
          ? named(
              {
                type: mushroomCardType("cover-card"),
                entity,
                show_position_control: true,
                show_buttons_control: true,
                grid_options: gridFor(rows, entityTitle(entity, states, roomName), entitySecondaries(states[entity], rows)),
              },
              entity,
              states,
              roomName,
            )
          : entityCard(entity, states, roomName, rows),
      );
    case "satellites":
      return sections.satellites.map((item) => satelliteCard(item, states, roomName, rows));
    case "sensors":
      return sensorCards(sections, states, roomName, rows);
    case "locks":
      return sections.locks.map((entity) => lockCard(entity, states, roomName));
    case "vacuums":
      return sections.vacuums.map((entity) => vacuumCard(entity, states, roomName));
    case "buttons":
      return sections.buttons.map((entity) =>
        commandCard(entity, states, roomName, rows, buttonPressService(entity), "mdi:gesture-tap-button", "pink"),
      );
    case "scenes":
      return sections.scenes.map((entity) =>
        commandCard(entity, states, roomName, rows, "scene.turn_on", "mdi:palette", "deep-purple"),
      );
    case "scripts":
      return sections.scripts.map((entity) =>
        commandCard(entity, states, roomName, rows, "script.turn_on", "mdi:script-text", "brown"),
      );
    case "helpers": {
      const selectsSet = new Set(sections.selects);
      const combined = mergeEntityOrder(
        [...sections.selects, ...sections.helpers],
        rows.entityOrder?.helpers,
      );
      return combined.map((entity) =>
        selectsSet.has(entity)
          ? named(
              {
                type: mushroomCardType("select-card"),
                entity,
                grid_options: gridFor(rows, entityTitle(entity, states, roomName), selectSecondaries(states[entity], rows)),
              },
              entity,
              states,
              roomName,
            )
          : entityCard(entity, states, roomName, rows),
      );
    }
    case "automations":
      return sections.automations.map((entity) =>
        automationCard(entity, states, roomName, rows, disabledAutomations.has(entity)),
      );
    default: {
      const exhaustive: never = id;
      return exhaustive;
    }
  }
}

const LIGHT_CONTROL_MODES = new Set([
  "brightness",
  "color_temp",
  "hs",
  "xy",
  "rgb",
  "rgbw",
  "rgbww",
  "white",
]);

/** True when Mushroom's light card would show a brightness, color, or color-temp control. */
export function lightExposesControls(state: EntityState | undefined): boolean {
  const modes = state?.attributes?.supported_color_modes;
  if (!Array.isArray(modes)) return false;
  return modes.some((mode) => typeof mode === "string" && LIGHT_CONTROL_MODES.has(mode));
}

function lightCard(
  entity: string,
  state: EntityState | undefined,
  states: Record<string, EntityState>,
  roomName: string,
  layout: RowLayout,
  led = false,
): Record<string, unknown> {
  const title = entityTitle(entity, states, roomName);
  if (lightExposesControls(state)) {
    return named(
      {
        type: mushroomCardType("light-card"),
        entity,
        use_light_color: true,
        show_brightness_control: true,
        show_color_temp_control: true,
        show_color_control: true,
        collapsible_controls: true,
        grid_options: gridFor(layout, title, entitySecondaries(state, layout), led),
      },
      entity,
      states,
      roomName,
    );
  }
  // The light card binds one action to the whole row. The template card splits
  // icon tap from the rest of the row and still renders a Mushroom row.
  // Its secondary is the raw state title, so "Unavailable" is the longest line.
  const literal = layout.literalState;
  return {
    type: mushroomCardType("template-card"),
    entity,
    entity_id: entity,
    primary: title,
    secondary: literal ? shownState(state) : `{{ states('${entity}') | title }}`,
    icon: literal ? shownIcon(state, "mdi:lightbulb") : `{{ state_attr('${entity}', 'icon') or 'mdi:lightbulb' }}`,
    icon_color: literal
      ? state?.state === "on"
        ? "amber"
        : "grey"
      : `{{ 'amber' if is_state('${entity}', 'on') else 'grey' }}`,
    tap_action: { action: "more-info" },
    hold_action: { action: "more-info" },
    double_tap_action: { action: "none" },
    icon_tap_action: {
      action: "perform-action",
      perform_action: "light.toggle",
      target: { entity_id: entity },
    },
    icon_hold_action: { action: "more-info" },
    icon_double_tap_action: { action: "none" },
    grid_options: gridFor(layout, title, [UNAVAILABLE], led),
  };
}

function withLedDot(card: Record<string, unknown>, ledEntityId?: string): Record<string, unknown> {
  if (!ledEntityId) return card;
  return {
    type: LIGHT_ROW,
    led_entity: ledEntityId,
    card,
    grid_options: card.grid_options ?? FULL,
  };
}

function withCameraDetections(
  card: Record<string, unknown>,
  detections?: AreaSections["cameraDetections"] extends Record<string, infer D> | undefined ? D : never,
): Record<string, unknown> {
  if (!detections) return card;
  return {
    type: CAMERA_ROW,
    detections,
    card,
    grid_options: card.grid_options ?? FULL,
  };
}

function sensorCards(
  sections: AreaSections,
  states: Record<string, EntityState>,
  roomName: string,
  layout: RowLayout,
): Record<string, unknown>[] {
  const deviceMap = sections.sensorDevices;
  if (!deviceMap) {
    return sections.sensors.map((entity) => entityCard(entity, states, roomName, layout));
  }
  const ungrouped: string[] = [];
  const byDevice = new Map<string, { name: string; entities: string[] }>();
  for (const entity of sections.sensors) {
    const dev = deviceMap[entity];
    if (!dev) {
      ungrouped.push(entity);
      continue;
    }
    const label = stripRoomName(dev.name, roomName) || dev.name;
    const group = byDevice.get(dev.id);
    if (group) {
      group.entities.push(entity);
    } else {
      byDevice.set(dev.id, { name: label, entities: [entity] });
    }
  }
  const cards: Record<string, unknown>[] = ungrouped.map((entity) => entityCard(entity, states, roomName, layout));
  const groups = [...byDevice.entries()].sort(
    ([idA, a], [idB, b]) => a.name.localeCompare(b.name) || idA.localeCompare(idB),
  );
  for (const [, group] of groups) {
    cards.push({
      type: SECTION_TITLE,
      title: group.name,
      variant: "group",
      grid_options: FULL,
    });
    for (const entity of group.entities) {
      cards.push(entityCard(entity, states, roomName, layout));
    }
  }
  return cards;
}

function titleCard(id: RollupId | "status"): Record<string, unknown> {
  const heading = id === "status"
    ? STATUS_HEADING
    : { title: sectionTitle(id), icon: sectionIcon(id), color: sectionColor(id) };
  return {
    type: SECTION_TITLE,
    title: heading.title,
    icon: heading.icon,
    color: heading.color,
    grid_options: FULL,
  };
}

function cameraCard(
  entity: string,
  states: Record<string, EntityState>,
  roomName: string,
): Record<string, unknown> {
  return named(
    {
      type: "picture-entity",
      entity,
      camera_image: entity,
      camera_view: "live",
      show_name: true,
      show_state: true,
      aspect_ratio: "16:9",
      fit_mode: "contain",
      tap_action: { action: "more-info" },
      hold_action: { action: "none" },
      double_tap_action: { action: "none" },
      grid_options: FULL,
    },
    entity,
    states,
    roomName,
  );
}

function entityCard(
  entity: string,
  states: Record<string, EntityState>,
  roomName: string,
  layout: RowLayout,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return named(
    {
      type: mushroomCardType("entity-card"),
      entity,
      ...extra,
      grid_options: gridFor(layout, entityTitle(entity, states, roomName), entitySecondaries(states[entity], layout)),
    },
    entity,
    states,
    roomName,
  );
}

function climateCard(
  entity: string,
  states: Record<string, EntityState>,
  roomName: string,
  layout: RowLayout,
): Record<string, unknown> {
  const domain = entity.split(".")[0];
  if (domain === "climate") {
    return named(
      {
        type: mushroomCardType("climate-card"),
        entity,
        grid_options: FULL,
      },
      entity,
      states,
      roomName,
    );
  }
  if (domain === "humidifier") {
    return named(
      {
        type: mushroomCardType("humidifier-card"),
        entity,
        show_target_humidity_control: true,
        grid_options: FULL,
      },
      entity,
      states,
      roomName,
    );
  }
  // Sensors, water heaters, and any other climate-section entity. Mushroom has no water-heater card.
  return entityCard(entity, states, roomName, layout);
}

function lockCard(
  entity: string,
  states: Record<string, EntityState>,
  roomName: string,
): Record<string, unknown> {
  return named(
    {
      type: mushroomCardType("lock-card"),
      entity,
      grid_options: FULL,
    },
    entity,
    states,
    roomName,
  );
}

function vacuumCard(
  entity: string,
  states: Record<string, EntityState>,
  roomName: string,
): Record<string, unknown> {
  return named(
    {
      type: mushroomCardType("vacuum-card"),
      entity,
      grid_options: FULL,
    },
    entity,
    states,
    roomName,
  );
}

/** Whole-row tap runs the service. Hold opens more-info. The icon uses the same actions. */
function commandCard(
  entity: string,
  states: Record<string, EntityState>,
  roomName: string,
  layout: RowLayout,
  service: string,
  fallbackIcon: string,
  activeColor: string,
): Record<string, unknown> {
  const title = entityTitle(entity, states, roomName);
  const state = states[entity];
  const literal = layout.literalState;
  return {
    type: mushroomCardType("template-card"),
    entity,
    entity_id: entity,
    primary: title,
    secondary: literal ? shownState(state) : `{{ states('${entity}') | title }}`,
    icon: literal ? shownIcon(state, fallbackIcon) : `{{ state_attr('${entity}', 'icon') or '${fallbackIcon}' }}`,
    icon_color: literal
      ? state?.state === "on"
        ? activeColor
        : "grey"
      : `{{ '${activeColor}' if is_state('${entity}', 'on') else 'grey' }}`,
    tap_action: performAction(service, entity),
    hold_action: { action: "more-info" },
    double_tap_action: { action: "none" },
    icon_tap_action: performAction(service, entity),
    icon_hold_action: { action: "more-info" },
    icon_double_tap_action: { action: "none" },
    grid_options: gridFor(layout, title, entitySecondaries(states[entity], layout)),
  };
}

function buttonPressService(entity: string): string {
  const domain = entity.split(".")[0];
  return `${domain || "button"}.press`;
}

function performAction(service: string, entity: string): Record<string, unknown> {
  return {
    action: "perform-action",
    perform_action: service,
    target: { entity_id: entity },
  };
}

function occupancyCard(
  entity: string,
  states: Record<string, EntityState>,
  roomName: string,
  layout: RowLayout,
  pressureId?: string,
): Record<string, unknown> {
  const title = entityTitle(entity, states, roomName);
  const state = states[entity];
  const literal = layout.literalState;
  const pressure = pressureId
    ? `{% set p = '${pressureId}' %}{% if states(p) not in ['unknown', 'unavailable', 'none', ''] %} · {{ states(p) }}{% set unit = state_attr(p, 'unit_of_measurement') %}{% if unit %} {{ unit }}{% endif %}{% endif %}`
    : "";
  return {
    type: mushroomCardType("template-card"),
    entity,
    primary: title,
    secondary: literal ? occupancyLiteral(state, pressureId ? states[pressureId] : undefined) : `{{ states('${entity}') | title }}${pressure}`,
    icon: literal ? shownIcon(state, "mdi:motion-sensor") : `{{ state_attr('${entity}', 'icon') or 'mdi:motion-sensor' }}`,
    icon_color: literal
      ? state?.state === "on"
        ? "amber"
        : "grey"
      : `{{ 'amber' if is_state('${entity}', 'on') else 'grey' }}`,
    tap_action: { action: "more-info" },
    hold_action: { action: "none" },
    grid_options: gridFor(layout, title, occupancySecondaries(pressureId ? states[pressureId] : undefined)),
  };
}

function satelliteCard(
  item: SatelliteItem,
  states: Record<string, EntityState>,
  roomName: string,
  layout: RowLayout,
): Record<string, unknown> {
  const entity = item.entityId;
  const ledId = item.ledEntityId;
  const alarmId = item.alarmEntityId;
  const kiosk = item.deviceId ? kioskSatelliteCardType() : undefined;
  if (kiosk && item.deviceId) {
    return {
      type: kiosk,
      device: item.deviceId,
      entity,
      grid_options: FULL,
    };
  }
  const literal = layout.literalState;
  const led = ledId
    ? ` · LED: {{ states('${ledId}') | title }}{% if is_state('${ledId}', 'on') and state_attr('${ledId}', 'brightness') %} ({{ (state_attr('${ledId}', 'brightness') / 2.55) | round }}%){% endif %}`
    : "";
  const alarm = alarmId ? ` · Alarm: {{ 'On' if is_state('${alarmId}', 'on') else 'Off' }}` : "";
  const card: Record<string, unknown> = {
    type: mushroomCardType("template-card"),
    entity,
    primary: entityTitle(entity, states, roomName),
    secondary: literal
      ? satelliteLiteral(states[entity], ledId ? states[ledId] : undefined, alarmId ? states[alarmId] : undefined, Boolean(alarmId))
      : `{{ states('${entity}') | title }}${led}${alarm}`,
    icon: "mdi:tablet-dashboard",
    icon_color: literal
      ? states[entity]?.state === "idle"
        ? "blue"
        : "green"
      : `{{ 'blue' if is_state('${entity}', 'idle') else 'green' }}`,
    tap_action: { action: "more-info" },
    hold_action: { action: "none" },
    grid_options: gridFor(layout, entityTitle(entity, states, roomName), satelliteSecondaries(Boolean(ledId), Boolean(alarmId))),
  };
  if (ledId) {
    const ledOn = states[ledId]?.state === "on";
    card.badge_icon = literal ? (ledOn ? "mdi:led-on" : "mdi:led-off") : `{{ 'mdi:led-on' if is_state('${ledId}', 'on') else 'mdi:led-off' }}`;
    card.badge_color = literal ? (ledOn ? "amber" : "grey") : `{{ 'amber' if is_state('${ledId}', 'on') else 'grey' }}`;
  }
  return card;
}

function automationCard(
  entity: string,
  states: Record<string, EntityState>,
  roomName: string,
  layout: RowLayout,
  disabled = false,
): Record<string, unknown> {
  const literal = layout.literalState;
  return {
    type: mushroomCardType("template-card"),
    entity,
    primary: entityTitle(entity, states, roomName),
    secondary: disabled
      ? "Disabled"
      : literal
        ? automationLiteral(states[entity])
        : `{% set lt = state_attr('${entity}', 'last_triggered') %}{{ relative_time(lt) + ' ago' if lt else 'Never triggered' }}`,
    icon: disabled ? "mdi:flash-off" : "mdi:flash",
    icon_color: disabled
      ? "grey"
      : literal
        ? states[entity]?.state === "on"
          ? "green"
          : "grey"
        : `{{ 'green' if is_state('${entity}', 'on') else 'grey' }}`,
    tap_action: { action: "more-info" },
    hold_action: {
      action: "perform-action",
      perform_action: "automation.toggle",
      target: { entity_id: entity },
    },
    double_tap_action: { action: "none" },
    grid_options: gridFor(layout, entityTitle(entity, states, roomName), [disabled ? "Disabled" : "Never triggered"]),
  };
}

function named(
  card: Record<string, unknown>,
  entity: string,
  states: Record<string, EntityState>,
  roomName: string,
): Record<string, unknown> {
  const title = entityTitle(entity, states, roomName);
  if (!title.startsWith("{{")) card.name = title;
  return card;
}

export function entityTitle(entity: string, states: Record<string, EntityState>, roomName: string): string {
  const raw = states[entity]?.attributes?.friendly_name;
  if (typeof raw !== "string" || raw.trim() === "") {
    return `{{ state_attr('${entity}', 'friendly_name') }}`;
  }
  return stripRoomName(raw, roomName);
}

function resolveLayout(layout?: PopupLayout): RowLayout {
  const viewportWidth = layout?.viewportWidth && layout.viewportWidth > 0 ? layout.viewportWidth : readViewportWidth();
  return {
    viewportWidth,
    measure: layout?.measure,
    formatEntityState: layout?.formatEntityState,
    literalState: layout?.literalState === true,
    entityOrder: layout?.entityOrder,
  };
}

/** Same words Jinja's `| title` produces, so a demo row matches a rendered template. */
function shownState(state: EntityState | undefined): string {
  const raw = state?.state;
  if (typeof raw !== "string" || raw.trim() === "") return UNAVAILABLE;
  return raw.replace(/[A-Za-z]+(?:'[A-Za-z]+)?/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

function shownIcon(state: EntityState | undefined, fallback: string): string {
  const icon = state?.attributes?.icon;
  return typeof icon === "string" && icon.trim() !== "" ? icon : fallback;
}

function occupancyLiteral(state: EntityState | undefined, pressure: EntityState | undefined): string {
  let text = shownState(state);
  if (!pressure) return text;
  const raw = pressure.state;
  if (!raw || raw === "unknown" || raw === "unavailable" || raw === "none") return text;
  text += ` · ${raw}`;
  const unit = pressure.attributes?.unit_of_measurement;
  if (typeof unit === "string" && unit !== "") text += ` ${unit}`;
  return text;
}

function satelliteLiteral(
  state: EntityState | undefined,
  led: EntityState | undefined,
  alarm: EntityState | undefined,
  hasAlarm: boolean,
): string {
  let text = shownState(state);
  if (led) {
    text += ` · LED: ${shownState(led)}`;
    const brightness = led.attributes?.brightness;
    if (led.state === "on" && typeof brightness === "number") {
      text += ` (${Math.round(brightness / 2.55)}%)`;
    }
  }
  if (hasAlarm) text += ` · Alarm: ${alarm?.state === "on" ? "On" : "Off"}`;
  return text;
}

function automationLiteral(state: EntityState | undefined): string {
  const triggered = state?.attributes?.last_triggered;
  if (typeof triggered !== "string" || triggered.trim() === "") return "Never triggered";
  const then = Date.parse(triggered);
  if (Number.isNaN(then)) return "Never triggered";
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 45) return "seconds ago";
  const minutes = Math.round(seconds / 60);
  if (minutes < 45) return minutes === 1 ? "1 minute ago" : `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 22) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

function gridFor(
  layout: RowLayout,
  primary: string,
  secondaries: readonly string[],
  led = false,
): { columns: number } {
  return rowColumns(primary, secondaries, layout.viewportWidth, { led, measure: layout.measure });
}

function entitySecondaries(state: EntityState | undefined, layout: RowLayout): string[] {
  const lines = [displayedState(state, "unavailable", layout)];
  const current = currentStateLine(state, layout);
  if (current) lines.push(current);
  return lines;
}

function selectSecondaries(state: EntityState | undefined, layout: RowLayout): string[] {
  const lines = entitySecondaries(state, layout);
  const options = state?.attributes?.options;
  if (!Array.isArray(options)) return lines;
  for (const option of options) {
    if (typeof option === "string" && option.trim() !== "") lines.push(option);
  }
  return lines;
}

function occupancySecondaries(pressure: EntityState | undefined): string[] {
  if (!pressure) return [UNAVAILABLE];
  const raw = pressure.state;
  if (!raw || raw === "unknown" || raw === "unavailable" || raw === "none") return [UNAVAILABLE];
  const unit = pressure.attributes?.unit_of_measurement;
  const value = widenNumericText(raw);
  const suffix = typeof unit === "string" && unit !== "" ? `${value} ${unit}` : value;
  return [UNAVAILABLE, `${UNAVAILABLE} · ${suffix}`];
}

function satelliteSecondaries(led: boolean, alarm: boolean): string[] {
  const parts = [UNAVAILABLE];
  if (led) parts.push("LED: Unavailable");
  if (alarm) parts.push("Alarm: Off");
  return [parts.join(" · ")];
}

function displayedState(state: EntityState | undefined, sample: string, layout: RowLayout): string {
  const format = layout.formatEntityState;
  if (format && state) {
    try {
      const text = format(state, sample);
      if (typeof text === "string" && text.trim() !== "") return text.trim();
    } catch {
      // Fall through to the English word the card shows when formatting is unavailable.
    }
  }
  return sample === "unavailable" ? UNAVAILABLE : sample;
}

function currentStateLine(state: EntityState | undefined, layout: RowLayout): string | undefined {
  if (!state) return undefined;
  const format = layout.formatEntityState;
  if (format) {
    try {
      const text = format(state);
      if (typeof text === "string" && text.trim() !== "") return widenNumericText(text.trim());
    } catch {
      // Use the raw state below.
    }
  }
  return widenNumericText(rawWithUnit(state));
}

function rawWithUnit(state: EntityState): string {
  const unit = state.attributes?.unit_of_measurement;
  const raw = state.state ?? "";
  if (typeof unit === "string" && unit !== "" && raw !== "unknown" && raw !== "unavailable" && raw !== "") {
    return `${raw} ${unit}`;
  }
  return raw;
}

/** One extra digit, so a value that grows from 9.9 to 10.0 still fits. */
function widenNumericText(value: string): string {
  return value.replace(/-?\d+(?:\.\d+)?/, (match) => {
    const sign = match.startsWith("-") ? "-" : "";
    return `${sign}0${match.slice(sign.length)}`;
  });
}
