import { entityTitle } from "./popup-cards";
import type { EntityState } from "./sections";

/**
 * One line under the room name, from temperature and humidity sensors only.
 * An empty string means the button should not set state_content.
 */
export function climateSubtitle(
  entities: readonly string[],
  states: Record<string, EntityState | undefined>,
  roomName: string,
  formatEntityState?: (state: EntityState) => string,
): string {
  const pieces: string[] = [];
  for (const id of entities) {
    const entityState = states[id];
    if (!entityState || !isTemperatureOrHumidity(id, entityState)) continue;
    const title = entityTitle(id, states as Record<string, EntityState>, roomName);
    const label = title.startsWith("{{") ? "" : title;
    const value = formattedValue(entityState, formatEntityState);
    if (value === "") continue;
    pieces.push(label ? `${label} ${value}` : value);
  }
  return pieces.join(" · ");
}

function isTemperatureOrHumidity(entityId: string, entityState: EntityState): boolean {
  if (entityId.split(".")[0] !== "sensor") return false;
  const deviceClass = entityState.attributes?.device_class;
  return deviceClass === "temperature" || deviceClass === "humidity";
}

function formattedValue(entityState: EntityState, formatEntityState?: (state: EntityState) => string): string {
  if (formatEntityState) return formatEntityState(entityState) ?? "";
  const unit = entityState.attributes?.unit_of_measurement;
  const raw = entityState.state ?? "";
  if (typeof unit === "string" && unit !== "" && raw !== "unknown" && raw !== "unavailable" && raw !== "") {
    return `${raw} ${unit}`;
  }
  return raw;
}
