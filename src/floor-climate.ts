import type { AreaSections, EntityState } from "./sections";

export interface FloorClimateSummary {
  temperature: string | null;
  humidity: string | null;
}

interface SensorSample {
  value: number;
  unit: string;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function formatMedian(samples: readonly SensorSample[]): string | null {
  if (samples.length === 0) return null;
  const med = median(samples.map((s) => s.value));
  const rounded = Math.round(med * 10) / 10;
  const unit = samples.find((s) => s.unit.length > 0)?.unit ?? "";
  return unit ? `${rounded} ${unit}` : String(rounded);
}

export function floorClimateSummary(
  sectionsList: readonly AreaSections[],
  states: Record<string, EntityState | undefined>,
): FloorClimateSummary {
  const seen = new Set<string>();
  const temperatures: SensorSample[] = [];
  const humidities: SensorSample[] = [];

  for (const sections of sectionsList) {
    for (const entityId of sections.climate) {
      if (seen.has(entityId)) continue;
      seen.add(entityId);
      if (entityId.split(".")[0] !== "sensor") continue;

      const stateObj = states[entityId];
      if (!stateObj) continue;

      const deviceClass = stateObj.attributes?.device_class;
      if (deviceClass !== "temperature" && deviceClass !== "humidity") continue;

      const rawState = stateObj.state?.trim() ?? "";
      if (rawState === "" || rawState === "unknown" || rawState === "unavailable") continue;
      const num = Number(rawState);
      if (!Number.isFinite(num)) continue;

      const unitRaw = stateObj.attributes?.unit_of_measurement;
      const unit = typeof unitRaw === "string" ? unitRaw.trim() : "";

      if (deviceClass === "temperature") {
        temperatures.push({ value: num, unit });
      } else {
        humidities.push({ value: num, unit });
      }
    }
  }

  return {
    temperature: formatMedian(temperatures),
    humidity: formatMedian(humidities),
  };
}
