import type { CameraDetection, EntityState } from "./sections";

export interface CameraClassBadge {
  name: string;
  icon: string;
  count: number | null;
  countText: string | null;
  title: string;
}

export interface CameraReviewBadge {
  active: boolean;
  icon: string;
  text: string | null;
  title: string;
}

export interface CameraDetectionBadges {
  total: number;
  totalText: string;
  active: boolean;
  classes: CameraClassBadge[];
  reviewStatus?: CameraReviewBadge;
}

const CLASS_ICONS: Record<string, string> = {
  person: "mdi:account",
  dog: "mdi:dog",
  cat: "mdi:cat",
  bird: "mdi:bird",
  car: "mdi:car",
  vehicle: "mdi:car",
  bicycle: "mdi:bicycle",
  motorcycle: "mdi:motorbike",
  package: "mdi:package-variant-closed",
};

function parseCount(state: EntityState | undefined): number | null {
  const raw = state?.state;
  if (typeof raw !== "string" || raw.trim() === "") return null;
  if (raw === "unknown" || raw === "unavailable" || raw === "none") return null;
  const num = Number(raw);
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.floor(num);
}

function classIcon(
  name: string,
  occState: EntityState | undefined,
  countState: EntityState | undefined,
): string {
  const mapped = CLASS_ICONS[name.toLowerCase()];
  if (mapped) return mapped;
  const occIcon = occState?.attributes?.icon;
  if (typeof occIcon === "string" && occIcon.trim() !== "") return occIcon;
  const countIcon = countState?.attributes?.icon;
  if (typeof countIcon === "string" && countIcon.trim() !== "") return countIcon;
  return "mdi:eye";
}

export function computeCameraDetectionBadges(
  detection: CameraDetection,
  states: Record<string, EntityState | undefined>,
): CameraDetectionBadges {
  const classes: CameraClassBadge[] = [];
  let fallbackTotal = 0;

  for (const cls of detection.classes) {
    const occState = cls.occupancyEntityId ? states[cls.occupancyEntityId] : undefined;
    const countState = cls.countEntityId ? states[cls.countEntityId] : undefined;
    const occOn = occState?.state === "on";
    const count = parseCount(countState);

    if (count !== null && count > 0) fallbackTotal += count;
    else if (occOn) fallbackTotal += 1;

    if (!occOn && (count === null || count <= 0)) continue;

    const icon = classIcon(cls.name, occState, countState);
    const countText = count !== null && count >= 2 ? `×${count}` : null;
    const label = cls.name.charAt(0).toUpperCase() + cls.name.slice(1);
    const title = count !== null && count > 0 ? `${label}: ${count}` : label;
    classes.push({
      name: cls.name,
      icon,
      count,
      countText,
      title,
    });
  }

  const rawTotal = detection.totalCountEntityId ? parseCount(states[detection.totalCountEntityId]) : null;
  const total = rawTotal !== null ? rawTotal : fallbackTotal;
  const allOn = detection.allOccupancyEntityId ? states[detection.allOccupancyEntityId]?.state === "on" : false;

  const reviewStatus = detection.reviewStatusEntityId
    ? computeReviewBadge(states[detection.reviewStatusEntityId])
    : undefined;

  return {
    total,
    totalText: String(total),
    active: total > 0 || allOn || classes.length > 0,
    classes,
    ...(reviewStatus ? { reviewStatus } : {}),
  };
}

function computeReviewBadge(state: EntityState | undefined): CameraReviewBadge {
  const iconAttr = state?.attributes?.icon;
  const icon = typeof iconAttr === "string" && iconAttr.trim() !== "" ? iconAttr : "mdi:eye-check";
  const raw = typeof state?.state === "string" ? state.state.trim() : "";
  const lower = raw.toLowerCase();
  if (!raw || lower === "none" || lower === "unknown" || lower === "unavailable" || lower === "0") {
    return {
      active: false,
      icon,
      text: null,
      title: `Review status: ${raw || "None"}`,
    };
  }
  const num = Number(raw);
  const text =
    Number.isFinite(num) && num > 0
      ? String(Math.floor(num))
      : raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
  return {
    active: true,
    icon,
    text,
    title: `Review status: ${text}`,
  };
}
