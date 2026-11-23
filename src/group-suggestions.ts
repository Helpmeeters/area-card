import type { AreaSections, ClassifierHass, DeviceEntry, EntityState, RegistryEntry } from "./sections";

export type HelperGroupType = "light" | "binary_sensor" | "switch" | "cover" | "media_player" | "lock";

export type GroupableSectionId = "lights" | "occupancy" | "switches" | "openings" | "media" | "locks";

export interface GroupSuggestion {
  /** Stable key for ignore persistence (e.g. "lights", "occupancy", "openings:binary_sensor"). */
  key: string;
  sectionId: GroupableSectionId;
  groupType: HelperGroupType;
  /** Text shown on the section title link (e.g. "Create group"). */
  actionLabel: string;
  /** Pre-filled default name for the new helper group. */
  defaultName: string;
  /** Compatible entities in this section that receive checkboxes in selection mode. */
  candidateIds: string[];
  /** Non-group entities not yet part of a related helper group (checked by default). */
  suggestedIds: string[];
  /** Fingerprint of section items + related helper groups/memberships (for ignore invalidation). */
  fingerprint: string;
  /** Optional device_class to apply on the created binary_sensor group entity. */
  deviceClassFor?: (selectedIds: readonly string[]) => string | undefined;
}

export interface OptimisticGroupRecord {
  entityId?: string;
  areaId: string;
  domain: HelperGroupType;
  members: readonly string[];
}

export type AreaGroupIgnores = Record<string, string>;

export const GROUP_IGNORE_KEY_PREFIX = "area-card-group-ignore:";

export function groupIgnoreKey(areaId: string): string {
  return `${GROUP_IGNORE_KEY_PREFIX}${areaId}`;
}

export function parseGroupIgnores(raw: unknown): AreaGroupIgnores {
  let value: unknown = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return {};
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: AreaGroupIgnores = {};
  for (const [key, fingerprint] of Object.entries(value as Record<string, unknown>)) {
    if (typeof key !== "string" || key.trim() === "") continue;
    if (typeof fingerprint !== "string" || fingerprint.trim() === "") continue;
    result[key] = fingerprint;
  }
  return result;
}

export function serializeGroupIgnores(ignores: AreaGroupIgnores): AreaGroupIgnores {
  const result: AreaGroupIgnores = {};
  for (const key of Object.keys(ignores).sort()) {
    const val = ignores[key];
    if (typeof val === "string" && val.trim() !== "") result[key] = val;
  }
  return result;
}

export function cloneGroupIgnores(ignores: AreaGroupIgnores): AreaGroupIgnores {
  return { ...ignores };
}

export function groupIgnoresEqual(left: AreaGroupIgnores, right: AreaGroupIgnores): boolean {
  const lk = Object.keys(left);
  const rk = Object.keys(right);
  if (lk.length !== rk.length) return false;
  for (const key of lk) {
    if (left[key] !== right[key]) return false;
  }
  return true;
}

export function setGroupIgnore(
  ignores: AreaGroupIgnores,
  key: string,
  fingerprint: string,
): AreaGroupIgnores {
  return { ...ignores, [key]: fingerprint };
}

const RELATED_CACHE = new Map<string, { stamp: string; groups: string[] }>();
const RELATED_INFLIGHT = new Map<string, Promise<string[]>>();

export function clearGroupMembershipCache(): void {
  RELATED_CACHE.clear();
  RELATED_INFLIGHT.clear();
}

function registryList(hass: ClassifierHass): RegistryEntry[] {
  const entities = hass.entities;
  if (!entities) return [];
  if (Array.isArray(entities)) return entities.filter((e) => Boolean(e.entity_id));
  return Object.entries(entities).map(([key, entry]) => ({
    ...entry,
    entity_id: entry.entity_id || key,
  }));
}

function deviceMap(devices: ClassifierHass["devices"]): Record<string, DeviceEntry> {
  if (!devices) return {};
  if (Array.isArray(devices)) return Object.fromEntries(devices.map((d) => [d.id, d]));
  return devices;
}

function areaOf(entry: RegistryEntry | undefined, devices: Record<string, DeviceEntry>): string | null {
  if (!entry) return null;
  if (entry.area_id) return entry.area_id;
  if (!entry.device_id) return null;
  return devices[entry.device_id]?.area_id || null;
}

function domainOf(entityId: string): string {
  const dot = entityId.indexOf(".");
  return dot > 0 ? entityId.slice(0, dot) : "";
}

function stateMemberIds(state: EntityState | undefined): string[] | null {
  const raw = state?.attributes?.entity_id;
  if (!Array.isArray(raw)) return null;
  const ids = raw.filter((item): item is string => typeof item === "string" && item.length > 0);
  return ids;
}

function deviceClassOf(
  entityId: string,
  entry: RegistryEntry | undefined,
  states: Record<string, EntityState>,
): string | undefined {
  const fromState = states[entityId]?.attributes?.device_class;
  if (typeof fromState === "string" && fromState) return fromState;
  return entry?.device_class || entry?.original_device_class || undefined;
}

interface SectionSpec {
  key: string;
  sectionId: GroupableSectionId;
  groupType: HelperGroupType;
  actionLabel: string;
  candidateIds: string[];
  defaultName: (roomName: string, suggestedIds: readonly string[]) => string;
  deviceClassFor?: (selectedIds: readonly string[]) => string | undefined;
}

const OPENING_DEVICE_CLASSES = new Set(["door", "window", "opening", "garage_door"]);
const OCCUPANCY_DEVICE_CLASSES = new Set(["occupancy", "motion", "presence", "chair", "bed"]);

function openingGroupDeviceClass(
  entityIds: readonly string[],
  entryById: ReadonlyMap<string, RegistryEntry>,
  states: Record<string, EntityState>,
): string {
  const classes = new Set<string>();
  for (const id of entityIds) {
    const dc = deviceClassOf(id, entryById.get(id), states);
    if (dc && OPENING_DEVICE_CLASSES.has(dc)) classes.add(dc);
  }
  if (classes.size === 1) return [...classes][0];
  return "opening";
}

function openingGroupLabel(deviceClass: string): string {
  switch (deviceClass) {
    case "door":
      return "Doors";
    case "window":
      return "Windows";
    case "garage_door":
      return "Garage Doors";
    default:
      return "Entries";
  }
}

function sectionSpecs(
  sections: AreaSections,
  entryById: ReadonlyMap<string, RegistryEntry>,
  states: Record<string, EntityState>,
): SectionSpec[] {
  const openingSensors = sections.openings.filter((id) => id.startsWith("binary_sensor."));
  const openingCovers = sections.openings.filter((id) => id.startsWith("cover."));
  const mixedOpenings = openingSensors.length > 0 && openingCovers.length > 0;
  const prefix = (roomName: string, suffix: string) => (roomName.trim() ? `${roomName.trim()} ${suffix}` : suffix);

  return [
    {
      key: "lights",
      sectionId: "lights",
      groupType: "light",
      actionLabel: "Create group",
      candidateIds: sections.lights,
      defaultName: (room) => prefix(room, "Lights"),
    },
    {
      key: "occupancy",
      sectionId: "occupancy",
      groupType: "binary_sensor",
      actionLabel: "Create group",
      candidateIds: sections.occupancy.map((item) => item.entityId),
      defaultName: (room) => prefix(room, "Occupancy"),
      deviceClassFor: () => "occupancy",
    },
    {
      key: "switches",
      sectionId: "switches",
      groupType: "switch",
      actionLabel: "Create group",
      candidateIds: sections.switches,
      defaultName: (room) => prefix(room, "Switches"),
    },
    {
      key: "openings:binary_sensor",
      sectionId: "openings",
      groupType: "binary_sensor",
      actionLabel: mixedOpenings ? "Create opening group" : "Create group",
      candidateIds: openingSensors,
      defaultName: (room, ids) =>
        prefix(room, openingGroupLabel(openingGroupDeviceClass(ids, entryById, states))),
      deviceClassFor: (selectedIds) => openingGroupDeviceClass(selectedIds, entryById, states),
    },
    {
      key: "openings:cover",
      sectionId: "openings",
      groupType: "cover",
      actionLabel: mixedOpenings ? "Create cover group" : "Create group",
      candidateIds: openingCovers,
      defaultName: (room) => prefix(room, "Covers"),
    },
    {
      key: "media",
      sectionId: "media",
      groupType: "media_player",
      actionLabel: "Create group",
      candidateIds: sections.mediaPlayers,
      defaultName: (room) => prefix(room, "Media Players"),
    },
    {
      key: "locks",
      sectionId: "locks",
      groupType: "lock",
      actionLabel: "Create group",
      candidateIds: sections.locks,
      defaultName: (room) => prefix(room, "Locks"),
    },
  ];
}

const TARGET_DOMAINS = new Set<string>(["light", "binary_sensor", "switch", "cover", "media_player", "lock"]);

/**
 * When a Home Assistant group helper is `unavailable`, HA omits its `attributes.entity_id` list.
 * Query `search/related` (cached per entity + domain group set) ONLY when an unavailable/memberless
 * group helper exists for a domain where this area has multiple candidates.
 */
export async function loadRelatedGroupMemberships(
  hass: ClassifierHass,
  areaId: string,
  sections: AreaSections,
): Promise<ReadonlyMap<string, readonly string[]>> {
  const result = new Map<string, readonly string[]>();
  if (typeof hass.callWS !== "function") return result;

  const entries = registryList(hass);
  const devices = deviceMap(hass.devices);
  const states = hass.states ?? {};

  const groupsByDomain = new Map<string, string[]>();
  const memberlessDomains = new Set<string>();
  for (const entry of entries) {
    if (entry.platform !== "group") continue;
    if (entry.disabled_by) continue;
    const domain = domainOf(entry.entity_id);
    if (!TARGET_DOMAINS.has(domain)) continue;
    const list = groupsByDomain.get(domain);
    if (list) list.push(entry.entity_id);
    else groupsByDomain.set(domain, [entry.entity_id]);

    const groupArea = areaOf(entry, devices);
    if (groupArea !== areaId) continue;
    const members = stateMemberIds(states[entry.entity_id]);
    if (!members || members.length === 0) {
      memberlessDomains.add(domain);
    }
  }

  if (memberlessDomains.size === 0) return result;

  const entryById = new Map(entries.map((e) => [e.entity_id, e]));
  const specs = sectionSpecs(sections, entryById, states);
  const toQuery: Array<{ entityId: string; stamp: string }> = [];
  const seen = new Set<string>();

  for (const spec of specs) {
    if (spec.candidateIds.length < 2) continue;
    if (!memberlessDomains.has(spec.groupType)) continue;
    const domainGroups = (groupsByDomain.get(spec.groupType) ?? []).slice().sort().join(",");
    for (const entityId of spec.candidateIds) {
      if (seen.has(entityId)) continue;
      if (entryById.get(entityId)?.platform === "group") continue;
      seen.add(entityId);
      toQuery.push({ entityId, stamp: domainGroups });
    }
  }

  if (toQuery.length === 0) return result;

  await Promise.all(
    toQuery.map(async ({ entityId, stamp }) => {
      const groups = await fetchEntityGroups(hass, entityId, stamp);
      if (groups.length > 0) result.set(entityId, groups);
    }),
  );

  return result;
}

async function fetchEntityGroups(
  hass: ClassifierHass,
  entityId: string,
  stamp: string,
): Promise<string[]> {
  const cached = RELATED_CACHE.get(entityId);
  if (cached && cached.stamp === stamp) return cached.groups;
  const flightKey = `${entityId}|${stamp}`;
  const pending = RELATED_INFLIGHT.get(flightKey);
  if (pending) return pending;

  const run = async (): Promise<string[]> => {
    try {
      const response = await hass.callWS!({
        type: "search/related",
        item_type: "entity",
        item_id: entityId,
      });
      const raw =
        response && typeof response === "object" && "group" in response
          ? (response as { group?: unknown }).group
          : undefined;
      const groups = Array.isArray(raw)
        ? raw.filter((item): item is string => typeof item === "string" && item.length > 0)
        : [];
      RELATED_CACHE.set(entityId, { stamp, groups });
      return groups;
    } catch {
      return [];
    }
  };

  const promise = run();
  RELATED_INFLIGHT.set(flightKey, promise);
  return promise.finally(() => {
    if (RELATED_INFLIGHT.get(flightKey) === promise) RELATED_INFLIGHT.delete(flightKey);
  });
}

interface HelperGroupInfo {
  entityId: string;
  domain: string;
  areaId: string | null;
  members: Set<string>;
  /** True when the full member list was read from state attributes (not a partial search/related lookup). */
  hasCompleteMembers: boolean;
  deviceClass?: string;
  friendlyName: string;
}

function collectHelperGroups(
  hass: ClassifierHass,
  entries: readonly RegistryEntry[],
  entryById: ReadonlyMap<string, RegistryEntry>,
  devices: Record<string, DeviceEntry>,
  extraMemberships?: ReadonlyMap<string, readonly string[]>,
  optimisticGroups?: readonly OptimisticGroupRecord[],
): Map<string, HelperGroupInfo> {
  const states = hass.states ?? {};
  const groups = new Map<string, HelperGroupInfo>();

  const ensureGroup = (groupId: string): HelperGroupInfo => {
    let info = groups.get(groupId);
    if (!info) {
      const entry = entryById.get(groupId);
      const state = states[groupId];
      const name = state?.attributes?.friendly_name;
      info = {
        entityId: groupId,
        domain: domainOf(groupId),
        areaId: areaOf(entry, devices),
        members: new Set<string>(),
        hasCompleteMembers: false,
        deviceClass: deviceClassOf(groupId, entry, states),
        friendlyName: typeof name === "string" ? name : "",
      };
      groups.set(groupId, info);
    }
    return info;
  };

  // 1. All registry entries with platform === "group" (not disabled)
  for (const entry of entries) {
    if (entry.platform !== "group" || entry.disabled_by) continue;
    const domain = domainOf(entry.entity_id);
    if (!TARGET_DOMAINS.has(domain)) continue;
    const info = ensureGroup(entry.entity_id);
    const members = stateMemberIds(states[entry.entity_id]);
    if (members && members.length > 0) {
      info.hasCompleteMembers = true;
      for (const member of members) info.members.add(member);
    }
  }

  // 2. Any target-domain state exposing attributes.entity_id array (supports test fixtures / YAML groups)
  for (const [entityId, state] of Object.entries(states)) {
    const domain = domainOf(entityId);
    if (!TARGET_DOMAINS.has(domain)) continue;
    const members = stateMemberIds(state);
    if (!members || members.length === 0) continue;
    const entry = entryById.get(entityId);
    if (entry?.disabled_by) continue;
    const info = ensureGroup(entityId);
    info.hasCompleteMembers = true;
    for (const member of members) info.members.add(member);
  }

  // 3. Merge search/related memberships (covers unavailable groups)
  if (extraMemberships) {
    for (const [memberId, groupIds] of extraMemberships) {
      for (const groupId of groupIds) {
        const domain = domainOf(groupId);
        if (!TARGET_DOMAINS.has(domain)) continue;
        const info = ensureGroup(groupId);
        info.members.add(memberId);
      }
    }
  }

  // 4. Merge optimistic newly created groups until HA's registry/state catches up
  if (optimisticGroups) {
    for (let idx = 0; idx < optimisticGroups.length; idx += 1) {
      const opt = optimisticGroups[idx];
      const id = opt.entityId || `${opt.domain}.__pending_group_${idx}`;
      const info = ensureGroup(id);
      if (!info.areaId) info.areaId = opt.areaId;
      for (const member of opt.members) info.members.add(member);
    }
  }

  return groups;
}

function isAreaRelatedGroup(
  group: HelperGroupInfo,
  areaId: string,
  entryById: ReadonlyMap<string, RegistryEntry>,
  devices: Record<string, DeviceEntry>,
): boolean {
  if (group.areaId === areaId) return true;
  if (group.areaId !== null) return false;
  if (!group.hasCompleteMembers || group.members.size === 0) return false;
  for (const memberId of group.members) {
    const memberArea = areaOf(entryById.get(memberId), devices);
    if (memberArea !== areaId) return false;
  }
  return true;
}

function binaryGroupRelevantToSection(
  group: HelperGroupInfo,
  sectionId: "occupancy" | "openings",
  candidateSet: ReadonlySet<string>,
): boolean {
  if (candidateSet.has(group.entityId)) return true;
  for (const memberId of group.members) {
    if (candidateSet.has(memberId)) return true;
  }
  const dc = group.deviceClass;
  if (sectionId === "occupancy") {
    if (dc && OCCUPANCY_DEVICE_CLASSES.has(dc)) return true;
    if (dc && OPENING_DEVICE_CLASSES.has(dc)) return false;
    return /\b(occupancy|presence|motion|chair|bed)\b/i.test(`${group.entityId} ${group.friendlyName}`);
  }
  if (dc && OPENING_DEVICE_CLASSES.has(dc)) return true;
  if (dc && OCCUPANCY_DEVICE_CLASSES.has(dc)) return false;
  return /\b(door|doors|window|windows|opening|open|entry|entries|garage)\b/i.test(
    `${group.entityId} ${group.friendlyName}`,
  );
}

/**
 * Compute active (non-ignored) helper group suggestions for each groupable section of an area.
 * At most one suggestion is returned per popup section (e.g. if Entries has both covers and
 * opening sensors eligible, the first non-ignored one surfaces first).
 */
export function computeGroupSuggestions(
  hass: ClassifierHass,
  areaId: string,
  roomName: string,
  sections: AreaSections,
  ignores: AreaGroupIgnores = {},
  extraMemberships?: ReadonlyMap<string, readonly string[]>,
  optimisticGroups?: readonly OptimisticGroupRecord[],
): GroupSuggestion[] {
  if (!areaId) return [];
  if (hass.user && hass.user.is_admin === false) return [];

  const entries = registryList(hass);
  const entryById = new Map(entries.map((e) => [e.entity_id, e]));
  const devices = deviceMap(hass.devices);
  const states = hass.states ?? {};

  const allGroups = collectHelperGroups(hass, entries, entryById, devices, extraMemberships, optimisticGroups);
  const specs = sectionSpecs(sections, entryById, states);

  const suggestions: GroupSuggestion[] = [];
  const emittedSections = new Set<GroupableSectionId>();

  for (const spec of specs) {
    if (emittedSections.has(spec.sectionId)) continue;
    if (spec.candidateIds.length < 2) continue;

    const candidateSet = new Set(spec.candidateIds);
    const relatedGroups: HelperGroupInfo[] = [];
    for (const group of allGroups.values()) {
      if (group.domain !== spec.groupType) continue;
      if (!isAreaRelatedGroup(group, areaId, entryById, devices)) continue;
      if (spec.groupType === "binary_sensor" && (spec.sectionId === "occupancy" || spec.sectionId === "openings")) {
        if (!binaryGroupRelevantToSection(group, spec.sectionId, candidateSet)) continue;
      }
      relatedGroups.push(group);
    }

    const groupedMembers = new Set<string>();
    for (const group of relatedGroups) {
      for (const memberId of group.members) groupedMembers.add(memberId);
    }

    const suggestedIds = spec.candidateIds.filter(
      (id) => !allGroups.has(id) && !groupedMembers.has(id),
    );
    if (suggestedIds.length < 2) continue;

    const entityPart = [...spec.candidateIds].sort().join(",");
    const helperPart = relatedGroups
      .map((group) => `${group.entityId}=${[...group.members].sort().join(",")}`)
      .sort()
      .join(";");
    const fingerprint = `${entityPart}|${helperPart}`;

    if (ignores[spec.key] === fingerprint) continue;

    emittedSections.add(spec.sectionId);
    suggestions.push({
      key: spec.key,
      sectionId: spec.sectionId,
      groupType: spec.groupType,
      actionLabel: spec.actionLabel,
      defaultName: spec.defaultName(roomName, suggestedIds),
      candidateIds: [...spec.candidateIds],
      suggestedIds,
      fingerprint,
      ...(spec.deviceClassFor ? { deviceClassFor: spec.deviceClassFor } : {}),
    });
  }

  return suggestions;
}

async function callHaApi(
  hass: ClassifierHass,
  method: "POST" | "DELETE" | "GET",
  path: string,
  body?: Record<string, unknown>,
): Promise<unknown> {
  if (typeof hass.callApi === "function") {
    return hass.callApi(method, path, body);
  }
  if (typeof hass.fetchWithAuth === "function") {
    const response = await hass.fetchWithAuth(`/api/${path}`, {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(text || `Home Assistant API error (${response.status})`);
    }
    const text = await response.text();
    return text ? JSON.parse(text) : undefined;
  }
  throw new Error("Home Assistant API is unavailable");
}

function flowErrorMessage(errors: unknown): string {
  if (errors && typeof errors === "object") {
    const values = Object.values(errors as Record<string, unknown>).filter(
      (v): v is string => typeof v === "string" && v.length > 0,
    );
    if (values.length > 0) return values.join(", ");
  }
  return "Failed to create helper group";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function findEntityForConfigEntry(
  hass: ClassifierHass,
  entryId: string,
  domain: HelperGroupType,
): Promise<string | undefined> {
  if (typeof hass.callWS !== "function") return undefined;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (attempt > 0) await sleep(150);
    try {
      const list = await hass.callWS({ type: "config/entity_registry/list" });
      if (!Array.isArray(list)) continue;
      for (const item of list) {
        if (!item || typeof item !== "object") continue;
        const record = item as { entity_id?: unknown; config_entry_id?: unknown };
        if (
          record.config_entry_id === entryId &&
          typeof record.entity_id === "string" &&
          record.entity_id.startsWith(`${domain}.`)
        ) {
          return record.entity_id;
        }
      }
    } catch {
      // Retry briefly if entity registry call transiently failed.
    }
  }
  return undefined;
}

export interface CreateHelperGroupParams {
  groupType: HelperGroupType;
  name: string;
  entities: readonly string[];
  areaId: string;
  hideMembers?: boolean;
  deviceClass?: string;
}

/**
 * Create a Home Assistant Group helper via the `group` config flow, then assign the
 * resulting entity to `areaId` (and `deviceClass` for occupancy/opening binary_sensor groups).
 */
export async function createHelperGroup(
  hass: ClassifierHass,
  params: CreateHelperGroupParams,
): Promise<{ entryId?: string; entityId?: string }> {
  const name = params.name.trim();
  if (!name) throw new Error("Group name is required");
  if (params.entities.length === 0) throw new Error("Select at least one entity");

  const start = (await callHaApi(hass, "POST", "config/config_entries/flow", {
    handler: "group",
    show_advanced_options: true,
  })) as { flow_id?: string; type?: string; errors?: unknown } | undefined;

  const flowId = start?.flow_id;
  if (!flowId) throw new Error("Could not start Home Assistant group helper flow");

  let completed = false;
  try {
    if (start.type === "menu") {
      const nextStep = (await callHaApi(hass, "POST", `config/config_entries/flow/${flowId}`, {
        next_step_id: params.groupType,
      })) as { type?: string; errors?: unknown } | undefined;
      if (nextStep?.errors) throw new Error(flowErrorMessage(nextStep.errors));
    }

    const payload: Record<string, unknown> = {
      name,
      entities: [...params.entities],
      hide_members: Boolean(params.hideMembers),
    };
    if (
      params.groupType === "light" ||
      params.groupType === "binary_sensor" ||
      params.groupType === "switch"
    ) {
      payload.all = false;
    }

    const finished = (await callHaApi(
      hass,
      "POST",
      `config/config_entries/flow/${flowId}`,
      payload,
    )) as {
      type?: string;
      errors?: unknown;
      result?: { entry_id?: string };
    } | undefined;

    if (finished?.type !== "create_entry") {
      throw new Error(flowErrorMessage(finished?.errors));
    }
    completed = true;

    const entryId = finished.result?.entry_id;
    let entityId: string | undefined;
    if (entryId) {
      entityId = await findEntityForConfigEntry(hass, entryId, params.groupType);
      if (entityId && typeof hass.callWS === "function") {
        await hass.callWS({
          type: "config/entity_registry/update",
          entity_id: entityId,
          area_id: params.areaId,
          ...(params.deviceClass ? { device_class: params.deviceClass } : {}),
        });
      }
    }

    clearGroupMembershipCache();
    return { entryId, entityId };
  } finally {
    if (!completed) {
      try {
        await callHaApi(hass, "DELETE", `config/config_entries/flow/${flowId}`);
      } catch {
        // Best-effort cleanup of aborted config flow.
      }
    }
  }
}
