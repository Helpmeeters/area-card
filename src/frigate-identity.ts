import { areaPresenceInfo } from "./presence";
import type { ClassifierHass, EntityState, OccupancyItem } from "./sections";

export interface FrigateCameraRef {
  entityId: string;
  instanceId: string;
  cameraName: string;
}

export interface FrigateEvent {
  id?: string;
  camera?: string;
  label?: string;
  sub_label?: string | [string, number] | null;
  start_time?: number;
  end_time?: number | null;
}

export interface FrigateReviewItem {
  id?: string;
  camera?: string;
  severity?: string;
  has_been_reviewed?: boolean;
  end_time?: number | null;
}

export interface AreaIdentitySummary {
  names: string[];
  occupied: boolean;
}

const CACHE_TTL_MS = 30_000;
const MIN_TRIGGER_REFRESH_MS = 1_500;
const ACTIVE_RECENT_GRACE_MS = 120_000;
const LAST_SEEN_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const CO_OCCURRENCE_WINDOW_MS = 60_000;
const DEFAULT_EVENT_LIMIT = 20;

interface InstanceCacheEntry {
  events: FrigateEvent[];
  reviews: FrigateReviewItem[];
  fetchedAt: number;
  triggerKey: string;
  inFlight?: Promise<void>;
  listeners: Set<() => void>;
}

const instanceCache = new Map<string, InstanceCacheEntry>();

function getOrCreateEntry(instanceId: string): InstanceCacheEntry {
  let entry = instanceCache.get(instanceId);
  if (!entry) {
    entry = {
      events: [],
      reviews: [],
      fetchedAt: 0,
      triggerKey: "",
      listeners: new Set(),
    };
    instanceCache.set(instanceId, entry);
  }
  return entry;
}

export function resetFrigateIdentityCacheForTests(): void {
  instanceCache.clear();
}

export function getCachedFrigateEvents(instanceId: string): readonly FrigateEvent[] {
  return instanceCache.get(instanceId)?.events ?? [];
}

export function getCachedFrigateReviews(instanceId: string): readonly FrigateReviewItem[] {
  return instanceCache.get(instanceId)?.reviews ?? [];
}

export function getFrigateCameraRef(
  entityId: string,
  states: Record<string, EntityState | undefined>,
): FrigateCameraRef | null {
  if (!entityId.startsWith("camera.")) return null;
  const attrs = states[entityId]?.attributes;
  if (!attrs || typeof attrs !== "object") return null;
  const instanceId = typeof attrs.client_id === "string" ? attrs.client_id.trim() : "";
  const cameraName = typeof attrs.camera_name === "string" ? attrs.camera_name.trim() : "";
  if (!instanceId || !cameraName) return null;
  return { entityId, instanceId, cameraName };
}

export function getFrigateCameraRefs(
  cameraIds: readonly string[],
  states: Record<string, EntityState | undefined>,
): FrigateCameraRef[] {
  const refs: FrigateCameraRef[] = [];
  for (const id of cameraIds) {
    const ref = getFrigateCameraRef(id, states);
    if (ref) refs.push(ref);
  }
  return refs;
}

export function extractSubLabel(raw: FrigateEvent["sub_label"]): string | null {
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (Array.isArray(raw) && typeof raw[0] === "string") {
    const trimmed = raw[0].trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return null;
}

export function parseFrigateEvents(raw: unknown): FrigateEvent[] {
  let data: unknown = raw;
  if (typeof raw === "string") {
    try {
      data = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (
    data &&
    typeof data === "object" &&
    !Array.isArray(data) &&
    Array.isArray((data as { events?: unknown }).events)
  ) {
    data = (data as { events: unknown[] }).events;
  }
  if (!Array.isArray(data)) return [];
  return data.filter((item): item is FrigateEvent => Boolean(item) && typeof item === "object");
}

function eventStartMs(event: FrigateEvent): number {
  return typeof event.start_time === "number" && Number.isFinite(event.start_time)
    ? event.start_time * 1000
    : 0;
}

function eventEndMs(event: FrigateEvent): number | null {
  return typeof event.end_time === "number" && Number.isFinite(event.end_time)
    ? event.end_time * 1000
    : null;
}

function uniqueOrderedNames(events: readonly FrigateEvent[]): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const event of events) {
    const name = extractSubLabel(event.sub_label);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  return names;
}

export function selectCameraPersonIdentities(
  events: readonly FrigateEvent[],
  cameraName: string,
  options: {
    nowMs?: number;
    occupancyLastChangedMs?: number | null;
  } = {},
): string[] {
  const nowMs = options.nowMs ?? Date.now();
  const occMs = options.occupancyLastChangedMs ?? null;
  const matching = events
    .filter((e) => e.camera === cameraName && e.label === "person" && extractSubLabel(e.sub_label) !== null)
    .sort((a, b) => eventStartMs(b) - eventStartMs(a));

  if (matching.length === 0) return [];

  const inProgress = matching.filter((e) => eventEndMs(e) === null);
  if (inProgress.length > 0) {
    return uniqueOrderedNames(inProgress);
  }

  const recent = matching.filter((e) => {
    const endMs = eventEndMs(e);
    if (endMs === null) return false;
    if (nowMs - endMs <= ACTIVE_RECENT_GRACE_MS) return true;
    if (occMs !== null && endMs >= occMs - 5_000) return true;
    return false;
  });
  return uniqueOrderedNames(recent);
}

export function selectAreaPresenceIdentities(
  eventsByInstance: ReadonlyMap<string, readonly FrigateEvent[]>,
  refs: readonly FrigateCameraRef[],
  occupancyItems: readonly OccupancyItem[],
  states: Record<string, EntityState | undefined>,
  nowMs: number = Date.now(),
): AreaIdentitySummary | null {
  if (refs.length === 0 || occupancyItems.length === 0) return null;
  const presence = areaPresenceInfo(occupancyItems, states);
  if (!presence.hasSensors) return null;

  if (presence.occupied) {
    const seen = new Set<string>();
    const names: string[] = [];
    for (const ref of refs) {
      const events = eventsByInstance.get(ref.instanceId) ?? [];
      for (const name of selectCameraPersonIdentities(events, ref.cameraName, {
        nowMs,
        occupancyLastChangedMs: presence.lastChangedMs,
      })) {
        if (!seen.has(name)) {
          seen.add(name);
          names.push(name);
        }
      }
    }
    return names.length > 0 ? { names, occupied: true } : null;
  }

  const candidates: FrigateEvent[] = [];
  for (const ref of refs) {
    const events = eventsByInstance.get(ref.instanceId) ?? [];
    for (const e of events) {
      if (e.camera !== ref.cameraName || e.label !== "person") continue;
      if (extractSubLabel(e.sub_label) === null) continue;
      const refTime = eventEndMs(e) ?? eventStartMs(e);
      if (refTime <= 0 || nowMs - refTime > LAST_SEEN_MAX_AGE_MS) continue;
      candidates.push(e);
    }
  }
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => (eventEndMs(b) ?? eventStartMs(b)) - (eventEndMs(a) ?? eventStartMs(a)));
  const latestMs = eventEndMs(candidates[0]) ?? eventStartMs(candidates[0]);
  const coOccurring = candidates.filter((e) => {
    const t = eventEndMs(e) ?? eventStartMs(e);
    return latestMs - t <= CO_OCCURRENCE_WINDOW_MS;
  });
  const names = uniqueOrderedNames(coOccurring);
  return names.length > 0 ? { names, occupied: false } : null;
}

export function formatPersonBadgeTitle(count: number | null, names: readonly string[]): string {
  if (names.length === 0) {
    return count !== null && count > 0 ? `Person: ${count}` : "Person";
  }
  if (count !== null && count > names.length) {
    return `Person: ${count} (${names.join(", ")})`;
  }
  return `Person: ${names.join(", ")}`;
}

export function subscribeFrigateEvents(
  instanceIds: readonly string[],
  onUpdate: () => void,
): () => void {
  const uniqueIds = [...new Set(instanceIds.filter((id) => id.length > 0))];
  for (const id of uniqueIds) {
    getOrCreateEntry(id).listeners.add(onUpdate);
  }
  return () => {
    for (const id of uniqueIds) {
      instanceCache.get(id)?.listeners.delete(onUpdate);
    }
  };
}

export function ensureFrigateEvents(
  hass: ClassifierHass | undefined,
  refs: readonly FrigateCameraRef[],
  triggerKey: string,
  nowMs: number = Date.now(),
): void {
  if (!hass || typeof hass.callWS !== "function" || refs.length === 0) return;

  const instanceIds = [...new Set(refs.map((r) => r.instanceId))];
  for (const instanceId of instanceIds) {
    const entry = getOrCreateEntry(instanceId);
    if (entry.inFlight) continue;

    const age = nowMs - entry.fetchedAt;
    const triggerChanged = entry.triggerKey !== triggerKey && age >= MIN_TRIGGER_REFRESH_MS;
    const stale = entry.fetchedAt === 0 || age >= CACHE_TTL_MS;
    if (!stale && !triggerChanged) continue;

    entry.triggerKey = triggerKey;
    const call = hass.callWS as (message: Record<string, unknown>) => Promise<unknown>;
    entry.inFlight = Promise.allSettled([
      call({
        type: "frigate/events/get",
        instance_id: instanceId,
        limit: DEFAULT_EVENT_LIMIT,
      }),
      call({
        type: "frigate/reviews/get",
        instance_id: instanceId,
        limit: 50,
      }),
    ])
      .then(([eventsRes, reviewsRes]) => {
        if (eventsRes.status === "fulfilled") {
          entry.events = parseFrigateEvents(eventsRes.value);
        }
        if (reviewsRes.status === "fulfilled") {
          entry.reviews = parseFrigateReviews(reviewsRes.value);
        }
        entry.fetchedAt = Date.now();
        for (const listener of [...entry.listeners]) {
          listener();
        }
      })
      .catch(() => {
        // Leave existing cached events intact if Frigate is unreachable.
        entry.fetchedAt = Date.now();
      })
      .finally(() => {
        entry.inFlight = undefined;
      });
  }
}

export function parseFrigateReviews(raw: unknown): FrigateReviewItem[] {
  let data: unknown = raw;
  if (typeof raw === "string") {
    try {
      data = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(data)) return [];
  return data.filter((item): item is FrigateReviewItem => Boolean(item) && typeof item === "object");
}

export function countUnreviewedFrigateItems(
  reviews: readonly FrigateReviewItem[],
  cameraName: string,
): number {
  let count = 0;
  for (const item of reviews) {
    if (item.camera !== cameraName) continue;
    if (item.has_been_reviewed === false) count++;
  }
  return count;
}

export function frigateReviewQueueUrl(
  loc: { protocol?: string; hostname?: string } | undefined = typeof window !== "undefined" ? window.location : undefined,
): string {
  const protocol = loc?.protocol === "https:" ? "https:" : "http:";
  const hostname = loc?.hostname && loc.hostname.length > 0 ? loc.hostname : "localhost";
  return `${protocol}//${hostname}:5000/review`;
}

export function cachedEventsMap(refs: readonly FrigateCameraRef[]): Map<string, readonly FrigateEvent[]> {
  const map = new Map<string, readonly FrigateEvent[]>();
  for (const ref of refs) {
    if (!map.has(ref.instanceId)) {
      map.set(ref.instanceId, getCachedFrigateEvents(ref.instanceId));
    }
  }
  return map;
}
