/**
 * Fallback theme variables matching Liquid Glass Tinted when the active Home
 * Assistant theme uses an opaque card background that would hide area photos
 * behind controls.
 */

const SHARED_THEME_VARS: Record<string, string> = {
  "--ha-card-backdrop-filter": "blur(12px) saturate(1.3)",
  "--ha-card-border-radius": "34px",
  "--ha-card-features-border-radius": "34px",
  "--ha-card-border-width": "0px",
  "--bubble-main-background-color": "var(--ha-card-background)",
  "--bubble-pop-up-main-background-color": "var(--ha-card-background)",
  "--bubble-border-radius": "34px",
  "--mush-chip-background": "var(--ha-card-background)",
};

const DARK_THEME_VARS: Record<string, string> = {
  ...SHARED_THEME_VARS,
  "--ha-card-background": "rgba(58, 58, 60, 0.6)",
  "--ha-card-box-shadow":
    "3px 3px 0.5px -3.5px rgba(255, 255, 255, 0.7) inset, -2px -2px 0.5px -2px rgba(255, 255, 255, 0.55) inset, 0 0 8px 1px rgba(255, 255, 255, 0.18) inset, 0 0 0 0.5px rgba(0, 0, 0, 0.15), 0 0.5px 1px 0 rgba(0, 0, 0, 0.12)",
  "--ha-dialog-surface-background": "rgba(58, 58, 60, 0.8)",
  "--bubble-secondary-background-color": "rgba(255, 255, 255, 0.1)",
  "--bubble-icon-background-color": "rgba(0, 0, 0, 0.2)",
};

const LIGHT_THEME_VARS: Record<string, string> = {
  ...SHARED_THEME_VARS,
  "--ha-card-background": "rgba(245, 245, 247, 0.6)",
  "--ha-card-box-shadow":
    "3px 3px 0.5px -3.5px rgba(255, 255, 255, 0.7) inset, -2px -2px 0.5px -2px rgba(255, 255, 255, 0.55) inset, 0 0 8px 1px rgba(255, 255, 255, 0.18) inset, 0 0 0 0.5px rgba(0, 0, 0, 0.1), 0 0.5px 1px 0 rgba(0, 0, 0, 0.12)",
  "--ha-dialog-surface-background": "rgba(245, 245, 247, 0.8)",
  "--bubble-secondary-background-color": "rgba(0, 0, 0, 0.06)",
  "--bubble-icon-background-color": "rgba(255, 255, 255, 0.7)",
};

const ALL_THEME_KEYS = Object.keys(DARK_THEME_VARS);

export function hardcodedThemeVars(darkMode: boolean): Record<string, string> {
  return darkMode ? { ...DARK_THEME_VARS } : { ...LIGHT_THEME_VARS };
}

/** Alpha channel in [0, 1] for a resolved CSS color. Unknown formats default to 1. */
export function colorAlpha(color: string): number {
  const value = color.trim().toLowerCase();
  if (!value) return 1;
  if (value === "transparent") return 0;

  if (value.startsWith("#")) {
    const hex = value.slice(1);
    if (hex.length === 4) {
      const a = Number.parseInt(hex[3] + hex[3], 16);
      return Number.isNaN(a) ? 1 : a / 255;
    }
    if (hex.length === 8) {
      const a = Number.parseInt(hex.slice(6, 8), 16);
      return Number.isNaN(a) ? 1 : a / 255;
    }
    return 1;
  }

  const fn = value.match(/^rgba?\(([^)]+)\)$/);
  if (!fn) return 1;
  const body = fn[1];
  const slashIdx = body.indexOf("/");
  let rawAlpha: string | undefined;
  if (slashIdx !== -1) {
    rawAlpha = body.slice(slashIdx + 1).trim();
  } else {
    const parts = body.split(",").map((part) => part.trim());
    if (parts.length >= 4) rawAlpha = parts[3];
  }
  if (!rawAlpha) return 1;
  if (rawAlpha.endsWith("%")) {
    const pct = Number.parseFloat(rawAlpha.slice(0, -1));
    return Number.isNaN(pct) ? 1 : Math.min(1, Math.max(0, pct / 100));
  }
  const num = Number.parseFloat(rawAlpha);
  return Number.isNaN(num) ? 1 : Math.min(1, Math.max(0, num));
}

export function isOpaqueThemeColor(color: string): boolean {
  return colorAlpha(color) >= 0.99;
}

function resolveInheritedCardBackground(host: HTMLElement): string {
  if (typeof document === "undefined" || typeof getComputedStyle !== "function") return "";
  const parent = host.parentElement ?? document.documentElement;
  if (!parent) return "";
  const probe = document.createElement("span");
  probe.style.cssText =
    "display:none;background-color:var(--ha-card-background, var(--card-background-color, #fff))";
  parent.append(probe);
  try {
    return getComputedStyle(probe).backgroundColor;
  } finally {
    probe.remove();
  }
}

function detectDarkMode(hass: { themes?: { darkMode?: boolean } } | undefined): boolean {
  if (typeof hass?.themes?.darkMode === "boolean") return hass.themes.darkMode;
  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  return true;
}

/**
 * Applies Liquid Glass Tinted CSS variables on `host` when `needed` is true and
 * the inherited HA theme's card background is opaque, and removes them when
 * `needed` is false or a translucent theme is active.
 */
export function syncCardThemeFallback(
  host: HTMLElement,
  hass: { themes?: { darkMode?: boolean } } | undefined,
  needed = true,
): void {
  if (!needed || !isOpaqueThemeColor(resolveInheritedCardBackground(host))) {
    if (host.dataset.areaCardThemeFallback === "1") {
      for (const key of ALL_THEME_KEYS) host.style.removeProperty(key);
      delete host.dataset.areaCardThemeFallback;
    }
    return;
  }
  const vars = hardcodedThemeVars(detectDarkMode(hass));
  for (const [key, val] of Object.entries(vars)) {
    if (host.style.getPropertyValue(key) !== val) {
      host.style.setProperty(key, val);
    }
  }
  host.dataset.areaCardThemeFallback = "1";
}
