import { kioskSatelliteCardType } from "./kiosk-card";
import { matchesRoomPhrase } from "./names";

export interface RegistryEntry {
  entity_id: string;
  /** Entity registry id. Device triggers store this, not the entity_id. */
  id?: string;
  /** Platform unique id (used for script edit URLs). */
  unique_id?: string | null;
  area_id?: string | null;
  device_id?: string | null;
  platform?: string | null;
  entity_category?: string | null;
  hidden_by?: string | null;
  hidden?: boolean | null;
  disabled_by?: string | null;
  device_class?: string | null;
  original_device_class?: string | null;
}

export interface DeviceEntry {
  id: string;
  area_id?: string | null;
  manufacturer?: string | null;
  name?: string | null;
  name_by_user?: string | null;
}

export interface EntityState {
  entity_id?: string;
  state: string;
  attributes: Record<string, unknown>;
  last_updated?: string;
}

export interface AreaEntry {
  area_id?: string;
  name?: string;
  icon?: string | null;
  picture?: string | null;
  floor_id?: string | null;
}

export interface FloorEntry {
  floor_id?: string;
  name?: string;
  icon?: string | null;
}

export interface ClassifierHass {
  states?: Record<string, EntityState>;
  entities?: Record<string, RegistryEntry> | RegistryEntry[];
  devices?: Record<string, DeviceEntry> | DeviceEntry[];
  areas?: Record<string, AreaEntry>;
  floors?: Record<string, FloorEntry>;
  user?: { id?: string; is_admin?: boolean };
  hassUrl?: (path: string) => string;
  themes?: { darkMode?: boolean };
  callWS?: (message: { type: string; [key: string]: unknown }) => Promise<unknown>;
  callApi?: <T = unknown>(
    method: string,
    path: string,
    parameters?: Record<string, unknown>,
  ) => Promise<T>;
  fetchWithAuth?: (path: string, init?: RequestInit) => Promise<Response>;
  formatEntityState?: (stateObj: EntityState, state?: string) => string;
  callService?: (
    domain: string,
    service: string,
    serviceData?: Record<string, unknown>,
    target?: Record<string, unknown>,
    ...rest: unknown[]
  ) => Promise<unknown>;
}

export interface OccupancyItem {
  entityId: string;
  pressureEntityId?: string;
}

export interface SatelliteItem {
  entityId: string;
  /** Device the sibling Kiosk Satellite Card is bound to. Absent when the satellite has none. */
  deviceId?: string;
  ledEntityId?: string;
  alarmEntityId?: string;
}

export interface SensorDeviceRef {
  id: string;
  name: string;
}

export interface CameraDetectionClass {
  name: string;
  occupancyEntityId?: string;
  countEntityId?: string;
}

export interface CameraDetection {
  totalCountEntityId?: string;
  allOccupancyEntityId?: string;
  motionEntityId?: string;
  reviewStatusEntityId?: string;
  classes: CameraDetectionClass[];
}

/** One Adaptive Lighting instance (main switch + companion toggles). */
export interface AdaptiveLightingGroup {
  id: string;
  name: string;
  mainEntityId?: string;
  adaptColorEntityId?: string;
  adaptBrightnessEntityId?: string;
  sleepModeEntityId?: string;
  extraEntityIds?: string[];
}

export interface AreaSections {
  climate: string[];
  lights: string[];
  lightLeds: Record<string, string>;
  mediaPlayers: string[];
  /** Satellite-paired media players covered by Kiosk Satellite Card (omitted from `mediaPlayers`). */
  satelliteMediaPlayers?: string[];
  cameras: string[];
  cameraDetections?: Record<string, CameraDetection>;
  switches: string[];
  /** Adaptive Lighting switch groups swept out of `switches` (shown under Lights). */
  adaptiveLighting?: AdaptiveLightingGroup[];
  occupancy: OccupancyItem[];
  openings: string[];
  satellites: SatelliteItem[];
  helpers: string[];
  selects: string[];
  automations: string[];
  sensors: string[];
  sensorDevices?: Record<string, SensorDeviceRef>;
  /** Sensors in Other Sensors on a device with a single main-section entity (`sensorId -> mainEntityId`). */
  sensorChipTargets?: Record<string, string>;
  /** Other Sensors absorbed into a single main-section entity on the same device. */
  deviceSensors?: Record<string, string[]>;
  locks: string[];
  vacuums: string[];
  buttons: string[];
  scenes: string[];
  scripts: string[];
}

const OCCUPANCY_CLASSES = new Set(["occupancy", "motion", "presence", "chair", "bed"]);
const OPENING_CLASSES = new Set(["door", "window", "opening", "garage_door"]);
const CLIMATE_SENSOR_CLASSES = new Set([
  "illuminance",
  "carbon_dioxide",
  "carbon_monoxide",
  "pm1",
  "pm25",
  "pm10",
  "aqi",
  "volatile_organic_compounds",
  "volatile_organic_compounds_parts",
  "moisture",
]);

export function emptySections(): AreaSections {
  return {
    climate: [],
    lights: [],
    lightLeds: {},
    mediaPlayers: [],
    cameras: [],
    switches: [],
    occupancy: [],
    openings: [],
    satellites: [],
    helpers: [],
    selects: [],
    automations: [],
    sensors: [],
    locks: [],
    vacuums: [],
    buttons: [],
    scenes: [],
    scripts: [],
  };
}

export function areaDisplay(
  hass: ClassifierHass,
  areaId: string,
): { name: string; icon: string; picture: string | null } {
  const area = hass.areas?.[areaId];
  return {
    name: area?.name || areaId,
    icon: area?.icon || "mdi:door",
    picture: resolvePicture(hass, area?.picture),
  };
}

const PURE_HELPER_DOMAINS = new Set(["input_boolean", "input_button", "input_select", "timer"]);

/**
 * True when the area has device entities and every one of them is unavailable.
 * Pure helpers and template helpers that are not device entities are ignored.
 * An area with no device entities stays available.
 * A disabled automation does not count as available, so it cannot keep the area lit.
 */
export function areaUnavailable(
  hass: ClassifierHass,
  areaId: string,
  disabledAutomations: ReadonlySet<string> = new Set(),
): boolean {
  const devices = deviceMap(hass.devices);
  const states = hass.states ?? {};
  const deviceEntities = registryEntries(hass).filter((entry) => {
    if (!entry.entity_id || !states[entry.entity_id]) return false;
    if (isHidden(entry)) return false;
    if (areaOf(entry, devices) !== areaId) return false;
    return isDeviceEntity(entry);
  });
  if (deviceEntities.length === 0) return false;
  return deviceEntities.every((entry) => {
    if (disabledAutomations.has(entry.entity_id)) return true;
    return states[entry.entity_id]?.state === "unavailable";
  });
}

function resolvePicture(hass: ClassifierHass, picture: string | null | undefined): string | null {
  if (!picture) return null;
  if (typeof hass.hassUrl !== "function") return picture;
  return hass.hassUrl(picture);
}

function isDeviceEntity(entry: RegistryEntry): boolean {
  const domain = entry.entity_id.split(".")[0] ?? "";
  if (PURE_HELPER_DOMAINS.has(domain)) return false;
  if (entry.platform === "template" && !entry.device_id) return false;
  return Boolean(entry.device_id);
}

export function classifyArea(hass: ClassifierHass, areaId: string): AreaSections {
  const devices = deviceMap(hass.devices);
  const states = hass.states ?? {};
  const allEntries = registryEntries(hass);
  const satelliteDevices = satelliteDeviceIds(allEntries, devices);
  const entries = allEntries.filter((entry) => {
    if (!entry.entity_id || !states[entry.entity_id]) return false;
    if (isHidden(entry)) return false;
    return areaOf(entry, devices) === areaId;
  });

  const pressureByDevice = new Map<string, string>();
  const atmosphericByDevice = new Map<string, string>();
  for (const entry of entries) {
    if (!entry.device_id) continue;
    const pressureClass = deviceClass(entry, states[entry.entity_id]);
    if (
      pressureClass === "atmospheric_pressure" &&
      entry.entity_id.startsWith("sensor.") &&
      !isPressureReading(entry.entity_id, pressureClass)
    ) {
      const existing = atmosphericByDevice.get(entry.device_id);
      if (!existing || entry.entity_id < existing) {
        atmosphericByDevice.set(entry.device_id, entry.entity_id);
      }
    }
    if (!isPressureReading(entry.entity_id, pressureClass)) continue;
    if (isDirectClimateSensor(pressureClass)) continue;
    const existing = pressureByDevice.get(entry.device_id);
    if (!existing || entry.entity_id < existing) {
      pressureByDevice.set(entry.device_id, entry.entity_id);
    }
  }
  const occupancyDevices = occupancyDeviceIds(entries, states, satelliteDevices);

  const renderedLights = entries.filter((entry) => isRenderedLight(entry, devices, satelliteDevices, states));
  const lightLeds = assignLightLeds(renderedLights, entries, satelliteDevices);
  const { cameraDetections, absorbedOccupancy, absorbedSensors } = collectCameraDetections(entries);
  const sections = emptySections();
  sections.lightLeds = lightLeds;
  if (Object.keys(cameraDetections).length > 0) sections.cameraDetections = cameraDetections;
  const sensorDevices: Record<string, SensorDeviceRef> = {};

  for (const entry of entries) {
    const id = entry.entity_id;
    const domain = id.split(".")[0] ?? "";
    const state = states[id];
    const dc = deviceClass(entry, state);
    const device = entry.device_id ? devices[entry.device_id] : undefined;
    const suppressed = isDiagnosticOrConfig(entry);

    if (isSatelliteRelated(entry, satelliteDevices)) {
      if (domain === "assist_satellite") {
        sections.satellites.push(satelliteItem(entry, entries, states));
      }
      continue;
    }

    if (domain === "automation") {
      sections.automations.push(id);
      continue;
    }

    if (domain === "sensor" && isDirectClimateSensor(dc)) {
      if (!suppressed) sections.climate.push(id);
      continue;
    }

    // A pressure reading on an occupancy device stays the occupancy companion.
    if (domain === "sensor" && isPressureCandidate(id, dc)) {
      const companion = Boolean(entry.device_id && occupancyDevices.has(entry.device_id));
      if (!companion && !suppressed) sections.climate.push(id);
      continue;
    }

    if (domain === "climate" || domain === "humidifier" || domain === "water_heater") {
      if (!suppressed) sections.climate.push(id);
      continue;
    }

    if (domain === "lock") {
      if (!suppressed) sections.locks.push(id);
      continue;
    }

    if (domain === "vacuum") {
      if (!suppressed) sections.vacuums.push(id);
      continue;
    }

    if (domain === "button" || domain === "input_button") {
      if (suppressed) continue;
      sections.buttons.push(id);
      continue;
    }

    if (domain === "scene") {
      if (!suppressed) sections.scenes.push(id);
      continue;
    }

    if (domain === "script") {
      if (!suppressed) sections.scripts.push(id);
      continue;
    }

    if (isLedSwitch(id)) continue;

    if (domain === "camera") {
      if (suppressed) continue;
      sections.cameras.push(id);
      continue;
    }

    if (entry.platform === "template") {
      // Template binary sensors with Show as Occupancy / Opening follow those sections;
      // other template entities stay under Helpers.
      if (domain === "binary_sensor" && !suppressed && !absorbedOccupancy.has(id)) {
        if (dc && OPENING_CLASSES.has(dc)) {
          sections.openings.push(id);
          continue;
        }
        if (isOccupancyBinary(entry, state, satelliteDevices)) {
          sections.occupancy.push({
            entityId: id,
            pressureEntityId: entry.device_id
              ? pressureByDevice.get(entry.device_id) ?? atmosphericByDevice.get(entry.device_id)
              : undefined,
          });
          continue;
        }
      }
      sections.helpers.push(id);
      continue;
    }

    if (domain === "light") {
      if (suppressed || isSatelliteLed(id, device)) continue;
      sections.lights.push(id);
      continue;
    }

    if (domain === "media_player") {
      if (suppressed) continue;
      sections.mediaPlayers.push(id);
      continue;
    }

    if (domain === "switch") {
      if (suppressed) continue;
      if (isAdaptiveLightingSwitch(entry)) continue;
      sections.switches.push(id);
      continue;
    }

    if (domain === "cover") {
      if (suppressed) continue;
      sections.openings.push(id);
      continue;
    }

    if (domain === "input_select") {
      sections.selects.push(id);
      continue;
    }

    if (domain === "input_boolean" || domain === "timer") {
      sections.helpers.push(id);
      continue;
    }

    if (domain === "sensor") {
      if (!suppressed && !absorbedSensors.has(id)) {
        sections.sensors.push(id);
        recordSensorDevice(entry, devices, sensorDevices);
      }
      continue;
    }

    if (domain === "binary_sensor") {
      if (suppressed || absorbedOccupancy.has(id)) continue;
      if (dc && OPENING_CLASSES.has(dc)) {
        sections.openings.push(id);
        continue;
      }
      if (isOccupancyBinary(entry, state, satelliteDevices)) {
        sections.occupancy.push({
          entityId: id,
          pressureEntityId: entry.device_id
            ? pressureByDevice.get(entry.device_id) ?? atmosphericByDevice.get(entry.device_id)
            : undefined,
        });
        continue;
      }
      sections.sensors.push(id);
      recordSensorDevice(entry, devices, sensorDevices);
    }
  }

  appendNamedAutomations(hass, areaId, allEntries, states, sections);
  appendSatelliteMediaPlayers(sections, allEntries, devices, states);
  dropPlayersShownOnKioskCard(sections, allEntries, states);
  collectSingleDeviceSensorTargets(sections, entries);
  const adaptiveLighting = collectAdaptiveLightingGroups(entries, allEntries, devices, states);
  if (adaptiveLighting.length > 0) sections.adaptiveLighting = adaptiveLighting;

  sections.climate = sortIds(sections.climate, states);
  sections.lights = sortIds(sections.lights, states);
  sections.mediaPlayers = sortIds(sections.mediaPlayers, states);
  sections.cameras = sortIds(sections.cameras, states);
  sections.switches = sortIds(sections.switches, states);
  sections.openings = sortIds(sections.openings, states);
  sections.helpers = sortIds(sections.helpers, states);
  sections.selects = sortIds(sections.selects, states);
  sections.automations = sortIds(sections.automations, states);
  sections.sensors = sortIds(sections.sensors, states);
  sections.locks = sortIds(sections.locks, states);
  sections.vacuums = sortIds(sections.vacuums, states);
  sections.buttons = sortIds(sections.buttons, states);
  sections.scenes = sortIds(sections.scenes, states);
  sections.scripts = sortIds(sections.scripts, states);
  sections.occupancy.sort((a, b) => compareIds(a.entityId, b.entityId, states));
  sections.satellites.sort((a, b) => compareIds(a.entityId, b.entityId, states));
  if (Object.keys(sensorDevices).length > 0) sections.sensorDevices = sensorDevices;
  return sections;
}

export function membershipKey(areaId: string, name: string, icon: string, sections: AreaSections): string {
  const occupancy = sections.occupancy
    .map((item) => `${item.entityId}=${item.pressureEntityId ?? ""}`)
    .join(",");
  const satellites = sections.satellites
    .map((item) => `${item.entityId}=${item.ledEntityId ?? ""}=${item.alarmEntityId ?? ""}=${item.deviceId ?? ""}`)
    .join(",");
  const leds = sections.lights.map((id) => `${id}=${sections.lightLeds[id] ?? ""}`).join(",");
  const adaptiveLighting = (sections.adaptiveLighting ?? [])
    .map((group) =>
      [
        group.id,
        group.name,
        group.mainEntityId ?? "",
        group.adaptColorEntityId ?? "",
        group.adaptBrightnessEntityId ?? "",
        group.sleepModeEntityId ?? "",
        (group.extraEntityIds ?? []).join(","),
      ].join("="),
    )
    .join(";");
  const sensorDevs = sections.sensors
    .map((id) => {
      const dev = sections.sensorDevices?.[id];
      return dev ? `${id}=${dev.id}:${dev.name}` : id;
    })
    .join(",");
  const camDetections = Object.keys(sections.cameraDetections ?? {})
    .sort()
    .map((camId) => {
      const det = sections.cameraDetections![camId];
      const cls = det.classes
        .map((c) => `${c.name}:${c.occupancyEntityId ?? ""}:${c.countEntityId ?? ""}`)
        .join(",");
      return `${camId}=${det.totalCountEntityId ?? ""}=${det.allOccupancyEntityId ?? ""}=${det.motionEntityId ?? ""}=${det.reviewStatusEntityId ?? ""}=${cls}`;
    })
    .join(";");
  const deviceSensors = Object.keys(sections.deviceSensors ?? {})
    .sort()
    .map((entityId) => `${entityId}=${(sections.deviceSensors![entityId] ?? []).join(",")}`)
    .join(";");
  const chipTargets = Object.keys(sections.sensorChipTargets ?? {})
    .sort()
    .map((sensorId) => `${sensorId}=${sections.sensorChipTargets![sensorId] ?? ""}`)
    .join(";");
  return [
    areaId,
    name,
    icon,
    sections.climate.join(","),
    sections.lights.join(","),
    leds,
    adaptiveLighting,
    sections.mediaPlayers.join(","),
    sections.cameras.join(","),
    camDetections,
    sections.switches.join(","),
    occupancy,
    sections.openings.join(","),
    satellites,
    sections.helpers.join(","),
    sections.selects.join(","),
    sections.automations.join(","),
    sensorDevs,
    chipTargets,
    deviceSensors,
    sections.locks.join(","),
    sections.vacuums.join(","),
    sections.buttons.join(","),
    sections.scenes.join(","),
    sections.scripts.join(","),
  ].join("|");
}

const ADAPTIVE_LIGHTING_SUFFIXES = ["_sleep_mode", "_adapt_color", "_adapt_brightness"] as const;

export function isAdaptiveLightingSwitch(entry: RegistryEntry): boolean {
  if (!entry.entity_id.startsWith("switch.")) return false;
  if (entry.platform === "adaptive_lighting") return true;
  return entry.entity_id.startsWith("switch.adaptive_lighting_");
}

type AdaptiveLightingRole = "main" | "adaptColor" | "adaptBrightness" | "sleepMode" | "extra";

function adaptiveLightingRole(entry: RegistryEntry): AdaptiveLightingRole {
  const unique = typeof entry.unique_id === "string" ? entry.unique_id : "";
  const id = entry.entity_id;
  if (unique.endsWith("_sleep_mode") || id.endsWith("_sleep_mode")) return "sleepMode";
  if (unique.endsWith("_adapt_color") || id.endsWith("_adapt_color")) return "adaptColor";
  if (unique.endsWith("_adapt_brightness") || id.endsWith("_adapt_brightness")) return "adaptBrightness";
  return "main";
}

function adaptiveLightingGroupKey(entry: RegistryEntry): string {
  if (entry.device_id) return entry.device_id;
  let base = entry.entity_id;
  for (const suffix of ADAPTIVE_LIGHTING_SUFFIXES) {
    if (base.endsWith(suffix)) {
      base = base.slice(0, -suffix.length);
      break;
    }
  }
  return base;
}

function adaptiveLightingDisplayName(
  device: DeviceEntry | undefined,
  mainState: EntityState | undefined,
  groupKey: string,
): string {
  const raw =
    (typeof device?.name_by_user === "string" && device.name_by_user.trim()) ||
    (typeof device?.name === "string" && device.name.trim()) ||
    (typeof mainState?.attributes?.friendly_name === "string" && mainState.attributes.friendly_name.trim()) ||
    groupKey;
  const stripped = raw.replace(/^Adaptive Lighting:\s*/i, "").trim();
  return stripped || "Adaptive Lighting";
}

function collectAdaptiveLightingGroups(
  areaEntries: readonly RegistryEntry[],
  allEntries: readonly RegistryEntry[],
  devices: Record<string, DeviceEntry>,
  states: Record<string, EntityState>,
): AdaptiveLightingGroup[] {
  const areaKeys = new Set<string>();
  for (const entry of areaEntries) {
    if (isHidden(entry) || isDiagnosticOrConfig(entry)) continue;
    if (!isAdaptiveLightingSwitch(entry)) continue;
    if (!states[entry.entity_id]) continue;
    areaKeys.add(adaptiveLightingGroupKey(entry));
  }
  if (areaKeys.size === 0) return [];

  const byKey = new Map<string, RegistryEntry[]>();
  for (const entry of allEntries) {
    if (isHidden(entry) || isDiagnosticOrConfig(entry)) continue;
    if (!isAdaptiveLightingSwitch(entry)) continue;
    if (!states[entry.entity_id]) continue;
    const key = adaptiveLightingGroupKey(entry);
    if (!areaKeys.has(key)) continue;
    const list = byKey.get(key);
    if (list) list.push(entry);
    else byKey.set(key, [entry]);
  }

  const groups: AdaptiveLightingGroup[] = [];
  for (const [key, members] of byKey) {
    const group: AdaptiveLightingGroup = { id: key, name: "" };
    const extras: string[] = [];
    for (const entry of members) {
      const role = adaptiveLightingRole(entry);
      if (role === "main" && !group.mainEntityId) group.mainEntityId = entry.entity_id;
      else if (role === "adaptColor" && !group.adaptColorEntityId) group.adaptColorEntityId = entry.entity_id;
      else if (role === "adaptBrightness" && !group.adaptBrightnessEntityId) {
        group.adaptBrightnessEntityId = entry.entity_id;
      } else if (role === "sleepMode" && !group.sleepModeEntityId) group.sleepModeEntityId = entry.entity_id;
      else extras.push(entry.entity_id);
    }
    if (extras.length > 0) group.extraEntityIds = sortIds(extras, states);
    const device = members.find((entry) => entry.device_id)?.device_id
      ? devices[members.find((entry) => entry.device_id)!.device_id!]
      : undefined;
    group.name = adaptiveLightingDisplayName(device, group.mainEntityId ? states[group.mainEntityId] : undefined, key);
    groups.push(group);
  }

  return groups.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

function collectSingleDeviceSensorTargets(
  sections: AreaSections,
  entries: readonly RegistryEntry[],
): void {
  if (sections.sensors.length === 0) return;
  const entryById = new Map(entries.map((entry) => [entry.entity_id, entry]));
  const mainByDevice = new Map<string, string[]>();
  const mainIds = [
    ...sections.climate,
    ...sections.lights,
    ...sections.mediaPlayers,
    ...sections.cameras,
    ...sections.switches,
    ...sections.occupancy.map((item) => item.entityId),
    ...sections.openings,
    ...sections.locks,
    ...sections.vacuums,
  ];
  for (const id of mainIds) {
    const deviceId = entryById.get(id)?.device_id;
    if (!deviceId) continue;
    const list = mainByDevice.get(deviceId);
    if (list) list.push(id);
    else mainByDevice.set(deviceId, [id]);
  }

  const targets: Record<string, string> = {};
  for (const sensorId of sections.sensors) {
    const deviceId = entryById.get(sensorId)?.device_id;
    if (!deviceId) continue;
    const mains = mainByDevice.get(deviceId);
    if (!mains || mains.length !== 1) continue;
    targets[sensorId] = mains[0];
  }
  if (Object.keys(targets).length > 0) sections.sensorChipTargets = targets;
}

/**
 * Absorb sensors pinned to their device's singular primary entity chip into `deviceSensors`.
 * By default, sensors remain in `sections.sensors` (Other Sensors, grouped by device).
 * When `keepInSensors` is true (e.g. while editing pins), the sensors also stay in `sections.sensors`
 * so the user can un-pin them from the primary chip.
 */
export function applyChipPins(
  sections: AreaSections,
  chipIds: readonly string[] | undefined,
  states: Record<string, EntityState> = {},
  keepInSensors = false,
): AreaSections {
  const targets = sections.sensorChipTargets;
  if (!targets || !chipIds || chipIds.length === 0) return sections;
  const pinned = new Set(chipIds);
  const absorbed = new Set<string>();
  const deviceSensors: Record<string, string[]> = {};
  if (sections.deviceSensors) {
    for (const [targetId, list] of Object.entries(sections.deviceSensors)) {
      deviceSensors[targetId] = [...list];
    }
  }
  for (const sensorId of sections.sensors) {
    if (!pinned.has(sensorId)) continue;
    const targetId = targets[sensorId];
    if (!targetId) continue;
    absorbed.add(sensorId);
    if (!deviceSensors[targetId]) deviceSensors[targetId] = [];
    if (!deviceSensors[targetId].includes(sensorId)) deviceSensors[targetId].push(sensorId);
  }
  if (absorbed.size === 0) return sections;
  for (const targetId of Object.keys(deviceSensors)) {
    deviceSensors[targetId] = sortIds(deviceSensors[targetId], states);
  }
  if (keepInSensors) {
    return { ...sections, deviceSensors };
  }
  const sensors = sections.sensors.filter((id) => !absorbed.has(id));
  let sensorDevices: Record<string, SensorDeviceRef> | undefined;
  if (sections.sensorDevices) {
    const nextDevices: Record<string, SensorDeviceRef> = {};
    for (const [id, ref] of Object.entries(sections.sensorDevices)) {
      if (!absorbed.has(id)) nextDevices[id] = ref;
    }
    if (Object.keys(nextDevices).length > 0) sensorDevices = nextDevices;
  }
  return {
    ...sections,
    sensors,
    sensorDevices,
    deviceSensors,
  };
}

function appendNamedAutomations(
  hass: ClassifierHass,
  areaId: string,
  allEntries: RegistryEntry[],
  states: Record<string, EntityState>,
  sections: AreaSections,
): void {
  const roomName = hass.areas?.[areaId]?.name;
  if (typeof roomName !== "string" || roomName.trim() === "") return;
  const areaNames = Object.values(hass.areas ?? {})
    .map((area) => area?.name ?? "")
    .filter((name) => name.trim() !== "");
  const seen = new Set(sections.automations);
  for (const entry of allEntries) {
    const id = entry.entity_id;
    if (!id.startsWith("automation.")) continue;
    if (seen.has(id)) continue;
    if (!states[id] || isHidden(entry)) continue;
    const name = friendlyName(states[id]);
    if (!name || !matchesRoomPhrase(name, roomName, areaNames)) continue;
    sections.automations.push(id);
    seen.add(id);
  }
}

function registryEntries(hass: ClassifierHass): RegistryEntry[] {
  const entities = hass.entities;
  if (!entities) return [];
  if (Array.isArray(entities)) {
    return entities.map((entry) => normalizeEntry(entry));
  }
  return Object.entries(entities).map(([key, entry]) => normalizeEntry(entry, key));
}

function normalizeEntry(entry: RegistryEntry, key?: string): RegistryEntry {
  return {
    ...entry,
    entity_id: entry.entity_id || key || "",
  };
}

function deviceMap(devices: ClassifierHass["devices"]): Record<string, DeviceEntry> {
  if (!devices) return {};
  if (Array.isArray(devices)) {
    return Object.fromEntries(devices.map((device) => [device.id, device]));
  }
  return devices;
}

function areaOf(entry: RegistryEntry, devices: Record<string, DeviceEntry>): string | null {
  if (entry.area_id) return entry.area_id;
  if (!entry.device_id) return null;
  return devices[entry.device_id]?.area_id || null;
}

function isHidden(entry: RegistryEntry): boolean {
  return Boolean(entry.hidden || entry.hidden_by || entry.disabled_by);
}

function isDiagnosticOrConfig(entry: RegistryEntry): boolean {
  return entry.entity_category === "diagnostic" || entry.entity_category === "config";
}

function deviceClass(entry: RegistryEntry, state: EntityState | undefined): string | undefined {
  const fromState = state?.attributes?.device_class;
  if (typeof fromState === "string" && fromState) return fromState;
  return entry.device_class || entry.original_device_class || undefined;
}

function friendlyName(state: EntityState | undefined): string | undefined {
  const name = state?.attributes?.friendly_name;
  return typeof name === "string" ? name : undefined;
}

function satelliteDeviceIds(entries: RegistryEntry[], devices: Record<string, DeviceEntry>): Set<string> {
  const ids = new Set<string>();
  for (const entry of entries) {
    if (!entry.device_id) continue;
    const domain = entry.entity_id.split(".")[0] ?? "";
    if (domain === "assist_satellite" || isKioskSatellite(devices[entry.device_id])) {
      ids.add(entry.device_id);
    }
  }
  return ids;
}

function isSatelliteRelated(entry: RegistryEntry, satelliteDevices: Set<string>): boolean {
  const domain = entry.entity_id.split(".")[0] ?? "";
  if (domain === "assist_satellite") return true;
  return Boolean(entry.device_id && satelliteDevices.has(entry.device_id));
}

function isKioskSatellite(device: DeviceEntry | undefined): boolean {
  return /kiosk[\s_-]*satellite/i.test(device?.manufacturer ?? "");
}

function isSatelliteLed(entityId: string, device: DeviceEntry | undefined): boolean {
  if (!entityId.startsWith("light.")) return false;
  if (entityId.includes("led_control")) return true;
  return isKioskSatellite(device);
}

function isLedSwitch(entityId: string): boolean {
  return /^switch\..*_led$/.test(entityId);
}

function isRenderedLight(
  entry: RegistryEntry,
  devices: Record<string, DeviceEntry>,
  satelliteDevices: Set<string>,
  states: Record<string, EntityState>,
): boolean {
  const id = entry.entity_id;
  if (!id.startsWith("light.")) return false;
  if (isSatelliteRelated(entry, satelliteDevices)) return false;
  if (isDiagnosticOrConfig(entry)) return false;
  if (entry.platform === "template") return false;
  const device = entry.device_id ? devices[entry.device_id] : undefined;
  if (isSatelliteLed(id, device)) return false;
  if (isPressureReading(id, deviceClass(entry, states[id]))) return false;
  return true;
}

function assignLightLeds(
  lights: RegistryEntry[],
  entries: RegistryEntry[],
  satelliteDevices: Set<string>,
): Record<string, string> {
  const leds = entries.filter(
    (entry) => isLedSwitch(entry.entity_id) && entry.device_id && !isSatelliteRelated(entry, satelliteDevices),
  );
  const assigned = new Map<string, string>();
  const used = new Set<string>();

  for (const light of lights) {
    if (!light.device_id) continue;
    const stem = light.entity_id.slice("light.".length);
    const named = leds.find(
      (entry) =>
        entry.device_id === light.device_id &&
        entry.entity_id === `switch.${stem}_led` &&
        !used.has(entry.entity_id),
    );
    if (!named) continue;
    assigned.set(light.entity_id, named.entity_id);
    used.add(named.entity_id);
  }

  for (const light of lights) {
    if (!light.device_id || assigned.has(light.entity_id)) continue;
    const available = leds.filter((entry) => entry.device_id === light.device_id && !used.has(entry.entity_id));
    const openLights = lights.filter((entry) => entry.device_id === light.device_id && !assigned.has(entry.entity_id));
    if (available.length !== 1 || openLights.length !== 1) continue;
    assigned.set(light.entity_id, available[0].entity_id);
    used.add(available[0].entity_id);
  }

  return Object.fromEntries(assigned);
}

function appendSatelliteMediaPlayers(
  sections: AreaSections,
  allEntries: RegistryEntry[],
  devices: Record<string, DeviceEntry>,
  states: Record<string, EntityState>,
): void {
  const byId = new Map(allEntries.map((entry) => [entry.entity_id, entry]));
  const seen = new Set(sections.mediaPlayers);
  for (const item of sections.satellites) {
    const playerId = satelliteMediaPlayerId(item.entityId);
    if (!playerId || seen.has(playerId)) continue;
    const entry = byId.get(playerId);
    if (!entry || isHidden(entry) || isDiagnosticOrConfig(entry) || !states[playerId]) continue;
    const device = entry.device_id ? devices[entry.device_id] : undefined;
    if (!isKioskSatellite(device)) continue;
    sections.mediaPlayers.push(playerId);
    seen.add(playerId);
  }
}

/**
 * Kiosk Satellite Card shows Now Playing whenever the paired player exists.
 * That player is already on the satellite card, so it is not also a Media players row.
 * A satellite with no device stays on the template row, and its player stays listed.
 */
function dropPlayersShownOnKioskCard(
  sections: AreaSections,
  allEntries: RegistryEntry[],
  states: Record<string, EntityState>,
): void {
  if (!kioskSatelliteCardType()) return;
  const known = new Set(allEntries.map((entry) => entry.entity_id).filter((id) => id.length > 0));
  const covered = new Set<string>();
  for (const item of sections.satellites) {
    if (!item.deviceId) continue;
    const playerId = satelliteMediaPlayerId(item.entityId);
    if (!playerId || (!states[playerId] && !known.has(playerId))) continue;
    covered.add(playerId);
  }
  if (covered.size === 0) return;
  const dropped = sections.mediaPlayers.filter((id) => covered.has(id));
  if (dropped.length > 0) sections.satelliteMediaPlayers = dropped;
  sections.mediaPlayers = sections.mediaPlayers.filter((id) => !covered.has(id));
}

export function areaMediaPlayers(sections: AreaSections): string[] {
  if (!sections.satelliteMediaPlayers || sections.satelliteMediaPlayers.length === 0) {
    return sections.mediaPlayers;
  }
  const seen = new Set(sections.mediaPlayers);
  return [...sections.mediaPlayers, ...sections.satelliteMediaPlayers.filter((id) => !seen.has(id))];
}

function satelliteMediaPlayerId(entityId: string): string | undefined {
  const prefix = "assist_satellite.";
  if (!entityId.startsWith(prefix)) return undefined;
  let objectId = entityId.slice(prefix.length);
  const suffix = "_assist_satellite";
  if (objectId.endsWith(suffix)) objectId = objectId.slice(0, -suffix.length);
  if (!objectId) return undefined;
  return `media_player.${objectId}`;
}

function satelliteItem(entry: RegistryEntry, entries: RegistryEntry[], states: Record<string, EntityState>): SatelliteItem {
  const item: SatelliteItem = { entityId: entry.entity_id };
  if (entry.device_id) item.deviceId = entry.device_id;
  const led = companionLed(entry.device_id, entries);
  const alarm = companionAlarm(entry.device_id, entries, states);
  if (led) item.ledEntityId = led;
  if (alarm) item.alarmEntityId = alarm;
  return item;
}

function isPressureReading(entityId: string, deviceClassName: string | undefined): boolean {
  if (!entityId.startsWith("sensor.")) return false;
  if (deviceClassName === "pressure") return true;
  return entityId.endsWith("_pressure");
}

function isPressureCandidate(entityId: string, deviceClassName: string | undefined): boolean {
  if (!entityId.startsWith("sensor.")) return false;
  if (deviceClassName === "pressure" || deviceClassName === "atmospheric_pressure") return true;
  return entityId.endsWith("_pressure");
}

function isDirectClimateSensor(deviceClassName: string | undefined): boolean {
  if (!deviceClassName) return false;
  return (
    deviceClassName === "temperature" ||
    deviceClassName === "humidity" ||
    CLIMATE_SENSOR_CLASSES.has(deviceClassName)
  );
}

function occupancyDeviceIds(
  entries: RegistryEntry[],
  states: Record<string, EntityState>,
  satelliteDevices: Set<string>,
): Set<string> {
  const ids = new Set<string>();
  for (const entry of entries) {
    if (!entry.device_id) continue;
    if (!isOccupancyBinary(entry, states[entry.entity_id], satelliteDevices)) continue;
    ids.add(entry.device_id);
  }
  return ids;
}

function isOccupancyBinary(
  entry: RegistryEntry,
  state: EntityState | undefined,
  satelliteDevices: Set<string>,
): boolean {
  const id = entry.entity_id;
  if (!id.startsWith("binary_sensor.")) return false;
  if (isSatelliteRelated(entry, satelliteDevices)) return false;
  if (isDiagnosticOrConfig(entry)) return false;
  const dc = deviceClass(entry, state);
  if (dc && OPENING_CLASSES.has(dc)) return false;
  return Boolean((dc && OCCUPANCY_CLASSES.has(dc)) || mentionsChairOrBed(id, friendlyName(state)));
}

function mentionsChairOrBed(entityId: string, name?: string): boolean {
  const tail = entityId.includes(".") ? entityId.slice(entityId.indexOf(".") + 1) : entityId;
  if (hasWord(tail, "chair") || hasWord(tail, "bed")) return true;
  if (!name) return false;
  return hasWord(name, "chair") || hasWord(name, "bed");
}

function hasWord(value: string, word: string): boolean {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .includes(word);
}

function companionLed(deviceId: string | null | undefined, entries: RegistryEntry[]): string | undefined {
  if (!deviceId) return undefined;
  const lights = entries
    .filter((entry) => entry.device_id === deviceId && entry.entity_id.startsWith("light."))
    .map((entry) => entry.entity_id)
    .sort();
  return lights.find((id) => id.includes("led_control")) ?? lights.find((id) => id.includes("led")) ?? lights[0];
}

function companionAlarm(
  deviceId: string | null | undefined,
  entries: RegistryEntry[],
  states: Record<string, EntityState>,
): string | undefined {
  if (!deviceId) return undefined;
  const matches = entries
    .filter(
      (entry) =>
        entry.device_id === deviceId &&
        entry.entity_id.startsWith("binary_sensor.") &&
        isAlarmRinging(entry.entity_id, states[entry.entity_id]),
    )
    .map((entry) => entry.entity_id)
    .sort();
  return matches[0];
}

function isAlarmRinging(entityId: string, state: EntityState | undefined): boolean {
  if (entityId.includes("alarm_ringing")) return true;
  const name = friendlyName(state);
  return Boolean(name && /alarm[\s_-]*ringing/i.test(name));
}

function recordSensorDevice(
  entry: RegistryEntry,
  devices: Record<string, DeviceEntry>,
  target: Record<string, SensorDeviceRef>,
): void {
  if (!entry.device_id) return;
  const device = devices[entry.device_id];
  const name = (device?.name_by_user || device?.name || "").trim();
  if (!name) return;
  target[entry.entity_id] = { id: entry.device_id, name };
}

function sortIds(ids: string[], states: Record<string, EntityState>): string[] {
  return [...ids].sort((a, b) => compareIds(a, b, states));
}

function compareIds(a: string, b: string, states: Record<string, EntityState>): number {
  const an = friendlyName(states[a]) ?? a;
  const bn = friendlyName(states[b]) ?? b;
  return an.localeCompare(bn) || a.localeCompare(b);
}

function collectCameraDetections(entries: readonly RegistryEntry[]): {
  cameraDetections: Record<string, CameraDetection>;
  absorbedOccupancy: Set<string>;
  absorbedSensors: Set<string>;
} {
  const cameraDetections: Record<string, CameraDetection> = {};
  const absorbedOccupancy = new Set<string>();
  const absorbedSensors = new Set<string>();

  const cameras = entries.filter((entry) => entry.entity_id.startsWith("camera.") && !isDiagnosticOrConfig(entry));
  for (const cam of cameras) {
    const camId = cam.entity_id;
    const camStem = camId.slice("camera.".length);
    const prefix = `${camStem}_`;
    const classMap = new Map<string, CameraDetectionClass>();
    let totalCountEntityId: string | undefined;
    let allOccupancyEntityId: string | undefined;
    let motionEntityId: string | undefined;
    let reviewStatusEntityId: string | undefined;

    const getClass = (name: string): CameraDetectionClass => {
      let item = classMap.get(name);
      if (!item) {
        item = { name };
        classMap.set(name, item);
      }
      return item;
    };

    for (const entry of entries) {
      const id = entry.entity_id;
      if (id === camId || isDiagnosticOrConfig(entry)) continue;
      const dot = id.indexOf(".");
      if (dot < 1) continue;
      const domain = id.slice(0, dot);
      const objectId = id.slice(dot + 1);
      if (cam.device_id) {
        if (entry.device_id !== cam.device_id) continue;
      } else if (!objectId.startsWith(prefix)) {
        continue;
      }

      const suffix = objectId.startsWith(prefix) ? objectId.slice(prefix.length) : objectId;

      if (domain === "binary_sensor") {
        if (suffix === "all_occupancy") {
          allOccupancyEntityId = id;
          absorbedOccupancy.add(id);
        } else if (suffix === "motion") {
          motionEntityId = id;
          absorbedOccupancy.add(id);
        } else if (suffix.endsWith("_occupancy")) {
          const cls = suffix.slice(0, -"_occupancy".length);
          if (cls) {
            getClass(cls).occupancyEntityId = id;
            if (cls !== "person") absorbedOccupancy.add(id);
          }
        }
      } else if (domain === "sensor") {
        if (suffix === "all_count") {
          totalCountEntityId = id;
          absorbedSensors.add(id);
        } else if (suffix === "review_status") {
          reviewStatusEntityId = id;
          absorbedSensors.add(id);
        } else if (suffix.endsWith("_active_count")) {
          absorbedSensors.add(id);
        } else if (suffix.endsWith("_count")) {
          const cls = suffix.slice(0, -"_count".length);
          if (cls) {
            getClass(cls).countEntityId = id;
            absorbedSensors.add(id);
          }
        }
      }
    }

    if (totalCountEntityId || allOccupancyEntityId || motionEntityId || reviewStatusEntityId || classMap.size > 0) {
      const classes = [...classMap.values()].sort((a, b) => {
        if (a.name === "person" && b.name !== "person") return -1;
        if (b.name === "person" && a.name !== "person") return 1;
        return a.name.localeCompare(b.name);
      });
      cameraDetections[camId] = {
        ...(totalCountEntityId ? { totalCountEntityId } : {}),
        ...(allOccupancyEntityId ? { allOccupancyEntityId } : {}),
        ...(motionEntityId ? { motionEntityId } : {}),
        ...(reviewStatusEntityId ? { reviewStatusEntityId } : {}),
        classes,
      };
    }
  }

  return { cameraDetections, absorbedOccupancy, absorbedSensors };
}
