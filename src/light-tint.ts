import type { EntityState } from "./sections";

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

const WARM_WHITE: readonly [number, number, number] = [255, 214, 153];

function clampByte(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(255, Math.round(value)));
}

function hsToRgb(hRaw: number, sRaw: number): [number, number, number] {
  const h = ((hRaw % 360) + 360) % 360;
  const s = Math.max(0, Math.min(100, sRaw)) / 100;
  const v = 1;
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;

  let r1 = 0;
  let g1 = 0;
  let b1 = 0;
  if (h < 60) {
    r1 = c;
    g1 = x;
  } else if (h < 120) {
    r1 = x;
    g1 = c;
  } else if (h < 180) {
    g1 = c;
    b1 = x;
  } else if (h < 240) {
    g1 = x;
    b1 = c;
  } else if (h < 300) {
    r1 = x;
    b1 = c;
  } else {
    r1 = c;
    b1 = x;
  }

  return [clampByte((r1 + m) * 255), clampByte((g1 + m) * 255), clampByte((b1 + m) * 255)];
}

function kelvinToRgb(kelvinRaw: number): [number, number, number] {
  const kelvin = Math.max(1000, Math.min(40000, kelvinRaw));
  const temp = kelvin / 100;

  let r: number;
  let g: number;
  let b: number;

  if (temp <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(temp) - 161.1195681661;
  } else {
    r = 329.698727446 * Math.pow(temp - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(temp - 60, -0.0755148492);
  }

  if (temp >= 66) {
    b = 255;
  } else if (temp <= 19) {
    b = 0;
  } else {
    b = 138.5177312231 * Math.log(temp - 10) - 305.0447927307;
  }

  return [clampByte(r), clampByte(g), clampByte(b)];
}

function lightRgb(attributes: Record<string, unknown> | undefined): readonly [number, number, number] {
  if (!attributes) return WARM_WHITE;

  const rgb = attributes.rgb_color;
  if (
    Array.isArray(rgb) &&
    rgb.length >= 3 &&
    typeof rgb[0] === "number" &&
    typeof rgb[1] === "number" &&
    typeof rgb[2] === "number" &&
    Number.isFinite(rgb[0]) &&
    Number.isFinite(rgb[1]) &&
    Number.isFinite(rgb[2])
  ) {
    return [clampByte(rgb[0]), clampByte(rgb[1]), clampByte(rgb[2])];
  }

  const hs = attributes.hs_color;
  if (
    Array.isArray(hs) &&
    hs.length >= 2 &&
    typeof hs[0] === "number" &&
    typeof hs[1] === "number" &&
    Number.isFinite(hs[0]) &&
    Number.isFinite(hs[1])
  ) {
    return hsToRgb(hs[0], hs[1]);
  }

  const kelvin = attributes.color_temp_kelvin;
  if (typeof kelvin === "number" && Number.isFinite(kelvin) && kelvin > 0) {
    return kelvinToRgb(kelvin);
  }

  const mireds = attributes.color_temp;
  if (typeof mireds === "number" && Number.isFinite(mireds) && mireds > 0) {
    return kelvinToRgb(1_000_000 / mireds);
  }

  return WARM_WHITE;
}

/**
 * Average RGB color across all `"on"` lights in `lightIds`.
 * Returns `null` when no lights are `"on"`.
 */
export function averageLightColor(
  lightIds: readonly string[],
  states: Record<string, EntityState | undefined>,
): RgbColor | null {
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let count = 0;

  for (const id of lightIds) {
    const entity = states[id];
    if (!entity || entity.state !== "on") continue;
    const [r, g, b] = lightRgb(entity.attributes);
    sumR += r;
    sumG += g;
    sumB += b;
    count += 1;
  }

  if (count === 0) return null;
  return {
    r: clampByte(sumR / count),
    g: clampByte(sumG / count),
    b: clampByte(sumB / count),
  };
}

/**
 * Subtle translucent background tint for the collapsed card or pinned cluster,
 * designed to remain readable over both light and dark themes.
 */
export function lightTintBackgroundStyles(
  rgb: RgbColor,
  surface: "button" | "cluster" | "popup" = "button",
): string {
  const r = clampByte(rgb.r);
  const g = clampByte(rgb.g);
  const b = clampByte(rgb.b);

  if (surface === "cluster") {
    return `background: linear-gradient(135deg, rgba(${r}, ${g}, ${b}, 0.22), rgba(${r}, ${g}, ${b}, 0.08)) !important;`;
  }

  if (surface === "popup") {
    return [
      ".bubble-pop-up-background {",
      `  background: linear-gradient(135deg, rgba(${r}, ${g}, ${b}, 0.24), rgba(${r}, ${g}, ${b}, 0.10)) !important;`,
      "}",
    ].join("\n");
  }

  return [
    ".bubble-background {",
    `  background: linear-gradient(135deg, rgba(${r}, ${g}, ${b}, 0.24), rgba(${r}, ${g}, ${b}, 0.10)) !important;`,
    "}",
  ].join("\n");
}
