import { dismissAreaDotTooltip, hideAreaDotTooltip, showAreaDotTooltip } from "./dot-tooltip";
import { stripRoomName } from "./names";
import type { AdaptiveLightingGroup, ClassifierHass, EntityState } from "./sections";

export const ADAPTIVE_LIGHTING_CARD = "custom:area-card-adaptive-lighting";
export const ADAPTIVE_LIGHTING_ELEMENT = "area-card-adaptive-lighting";

export const DEFAULT_MIN_KELVIN = 2000;
export const DEFAULT_MAX_KELVIN = 5500;
export const DEFAULT_MIN_BRIGHTNESS = 1;
export const DEFAULT_MAX_BRIGHTNESS = 100;
export const DEFAULT_SLEEP_BRIGHTNESS = 1;
export const DEFAULT_SLEEP_KELVIN = 1000;

/** Approximate black-body RGB for a Kelvin value. */
export function kelvinToRgb(kelvin: number): [number, number, number] {
  const temp = Math.max(1000, Math.min(40000, Number(kelvin) || 4000)) / 100;
  let r: number;
  let g: number;
  let b: number;
  if (temp <= 66) {
    r = 255;
    g = Math.max(0, Math.min(255, 99.4708025861 * Math.log(temp) - 161.1195681661));
    b = temp <= 19 ? 0 : Math.max(0, Math.min(255, 138.5177312231 * Math.log(temp - 10) - 305.0447927307));
  } else {
    r = Math.max(0, Math.min(255, 329.698727446 * Math.pow(temp - 60, -0.1332047592)));
    g = Math.max(0, Math.min(255, 288.1221695283 * Math.pow(temp - 60, -0.0755148492)));
    b = 255;
  }
  return [Math.round(r), Math.round(g), Math.round(b)];
}

/** Warm→cool CSS gradient across a Kelvin range. */
export function kelvinGradientCss(minK: number, maxK: number): string {
  const lo = Number(minK);
  const hi = Number(maxK);
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) {
    return "linear-gradient(to right, #ffb347, #fff4d6, #a8d4ff)";
  }
  const stops: string[] = [];
  const steps = 6;
  for (let i = 0; i <= steps; i += 1) {
    const k = lo + ((hi - lo) * i) / steps;
    const [r, g, b] = kelvinToRgb(k);
    stops.push(`rgb(${r}, ${g}, ${b}) ${Math.round((i / steps) * 100)}%`);
  }
  return `linear-gradient(to right, ${stops.join(", ")})`;
}

export function clampTickPercent(currentK: number, minK: number, maxK: number): number {
  const span = Math.max(1, maxK - minK);
  return Math.max(0, Math.min(100, ((currentK - minK) / span) * 100));
}

export function adaptiveLightingTitle(name: string, roomName = ""): string {
  const strippedPrefix = name.replace(/^Adaptive Lighting:\s*/i, "").trim();
  const base = strippedPrefix || "Adaptive Lighting";
  return stripRoomName(base, roomName) || base;
}

export interface AdaptiveLightingRange {
  minK: number;
  maxK: number;
  currentK: number | null;
  brightnessPct: number | null;
  manualControl: boolean;
  manualControlIds: string[];
  on: boolean;
}

export interface AdaptiveLightingSettings {
  minBrightness: number;
  maxBrightness: number;
  minColorTemp: number;
  maxColorTemp: number;
  sleepBrightness: number;
  sleepColorTemp: number;
  hasConfig: boolean;
}

function numberAttr(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

function configObject(mainState: EntityState | undefined): Record<string, unknown> | undefined {
  const raw = mainState?.attributes?.configuration;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return undefined;
}

function configNumber(config: Record<string, unknown> | undefined, key: string): number | null {
  if (!config) return null;
  return numberAttr(config[key]);
}

export function adaptiveLightingSettings(mainState: EntityState | undefined): AdaptiveLightingSettings {
  const config = configObject(mainState);
  const minBrightness = configNumber(config, "min_brightness");
  const maxBrightness = configNumber(config, "max_brightness");
  const minColorTemp = configNumber(config, "min_color_temp") ?? configNumber(config, "min_colortemp");
  const maxColorTemp = configNumber(config, "max_color_temp") ?? configNumber(config, "max_colortemp");
  const sleepBrightness = configNumber(config, "sleep_brightness");
  const sleepColorTemp = configNumber(config, "sleep_color_temp") ?? configNumber(config, "sleep_colortemp");
  const hasConfig =
    minBrightness !== null ||
    maxBrightness !== null ||
    minColorTemp !== null ||
    maxColorTemp !== null ||
    sleepBrightness !== null ||
    sleepColorTemp !== null;
  return {
    minBrightness: minBrightness ?? DEFAULT_MIN_BRIGHTNESS,
    maxBrightness: maxBrightness ?? DEFAULT_MAX_BRIGHTNESS,
    minColorTemp: minColorTemp ?? DEFAULT_MIN_KELVIN,
    maxColorTemp: maxColorTemp ?? DEFAULT_MAX_KELVIN,
    sleepBrightness: sleepBrightness ?? DEFAULT_SLEEP_BRIGHTNESS,
    sleepColorTemp: sleepColorTemp ?? DEFAULT_SLEEP_KELVIN,
    hasConfig,
  };
}

function clampInt(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}

export function normalizeAdaptiveLightingSettings(
  draft: Omit<AdaptiveLightingSettings, "hasConfig">,
): Omit<AdaptiveLightingSettings, "hasConfig"> {
  const minBrightness = clampInt(draft.minBrightness, 1, 100, DEFAULT_MIN_BRIGHTNESS);
  const maxBrightness = Math.max(minBrightness, clampInt(draft.maxBrightness, 1, 100, DEFAULT_MAX_BRIGHTNESS));
  const minColorTemp = clampInt(draft.minColorTemp, 1000, 10000, DEFAULT_MIN_KELVIN);
  const maxColorTemp = Math.max(minColorTemp, clampInt(draft.maxColorTemp, 1000, 10000, DEFAULT_MAX_KELVIN));
  const sleepBrightness = clampInt(draft.sleepBrightness, 1, 100, DEFAULT_SLEEP_BRIGHTNESS);
  const sleepColorTemp = clampInt(draft.sleepColorTemp, 1000, 10000, DEFAULT_SLEEP_KELVIN);
  return {
    minBrightness,
    maxBrightness,
    minColorTemp,
    maxColorTemp,
    sleepBrightness,
    sleepColorTemp,
  };
}

export function buildChangeSettingsPayload(
  entityId: string,
  draft: Omit<AdaptiveLightingSettings, "hasConfig">,
): Record<string, unknown> {
  const clean = normalizeAdaptiveLightingSettings(draft);
  return {
    entity_id: entityId,
    include_config_in_attributes: true,
    min_brightness: clean.minBrightness,
    max_brightness: clean.maxBrightness,
    min_color_temp: clean.minColorTemp,
    max_color_temp: clean.maxColorTemp,
    sleep_brightness: clean.sleepBrightness,
    sleep_color_temp: clean.sleepColorTemp,
  };
}

export function adaptiveLightingRange(mainState: EntityState | undefined): AdaptiveLightingRange {
  const attrs = mainState?.attributes ?? {};
  const settings = adaptiveLightingSettings(mainState);
  const currentK = numberAttr(attrs.color_temp_kelvin) ?? numberAttr(attrs.colortemp);
  const brightnessPct = numberAttr(attrs.brightness_pct);
  const manual = attrs.manual_control;
  const manualControlIds = Array.isArray(manual)
    ? manual.filter((id): id is string => typeof id === "string" && id.length > 0)
    : [];
  const manualControl = manualControlIds.length > 0 || (!Array.isArray(manual) && Boolean(manual));
  return {
    minK: settings.minColorTemp,
    maxK: settings.maxColorTemp > settings.minColorTemp ? settings.maxColorTemp : settings.minColorTemp + 1,
    currentK,
    brightnessPct,
    manualControl,
    manualControlIds,
    on: mainState?.state === "on",
  };
}

export function adaptiveLightingCardConfig(
  group: AdaptiveLightingGroup,
  roomName = "",
): Record<string, unknown> {
  return {
    type: ADAPTIVE_LIGHTING_CARD,
    entity: group.mainEntityId,
    group,
    room_name: roomName,
    grid_options: { columns: 12 },
  };
}

export type AdaptiveLightingPillKind = "color" | "brightness" | "sleep" | "extra";

export interface AdaptiveLightingPill {
  kind: AdaptiveLightingPillKind;
  entityId: string;
  label: string;
  icon: string;
}

export function adaptiveLightingPills(group: AdaptiveLightingGroup): AdaptiveLightingPill[] {
  const pills: AdaptiveLightingPill[] = [];
  if (group.adaptColorEntityId) {
    pills.push({ kind: "color", entityId: group.adaptColorEntityId, label: "Color", icon: "mdi:sun-thermometer" });
  }
  if (group.adaptBrightnessEntityId) {
    pills.push({
      kind: "brightness",
      entityId: group.adaptBrightnessEntityId,
      label: "Brightness",
      icon: "mdi:brightness-4",
    });
  }
  if (group.sleepModeEntityId) {
    pills.push({ kind: "sleep", entityId: group.sleepModeEntityId, label: "Sleep", icon: "mdi:sleep" });
  }
  for (const entityId of group.extraEntityIds ?? []) {
    pills.push({ kind: "extra", entityId, label: "Extra", icon: "mdi:toggle-switch" });
  }
  return pills;
}

export function adaptiveLightingPillTooltip(pill: AdaptiveLightingPill, on: boolean): string {
  const stateWord = on ? "On" : "Off";
  switch (pill.kind) {
    case "color":
      return `Adapt Color: ${stateWord}\nAdjusts color temperature to daylight`;
    case "brightness":
      return `Adapt Brightness: ${stateWord}\nAdjusts brightness to daylight`;
    case "sleep":
      return `Sleep Mode: ${stateWord}\nDims lights to warm sleep settings`;
    default:
      return `${pill.label}: ${stateWord}`;
  }
}

export function adaptiveLightingMainTooltip(on: boolean): string {
  return on ? "Adaptive Lighting: On\nClick to pause adaptation" : "Adaptive Lighting: Off\nClick to resume adaptation";
}

export function adaptiveLightingManualTooltip(
  ids: readonly string[],
  states: Record<string, EntityState | undefined>,
): string {
  if (ids.length === 0) return "Manual control active";
  const names = ids.map((id) => {
    const raw = states[id]?.attributes?.friendly_name;
    return typeof raw === "string" && raw.trim() ? raw.trim() : id;
  });
  return `Manual control:\n${names.join("\n")}`;
}

interface AdaptiveLightingConfig {
  entity?: string;
  group?: AdaptiveLightingGroup;
  room_name?: string;
}

interface ServiceHass extends ClassifierHass {
  callService?: (domain: string, service: string, data?: Record<string, unknown>) => Promise<unknown>;
}

interface SettingsFieldSpec {
  key: keyof Omit<AdaptiveLightingSettings, "hasConfig">;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
}

const SETTINGS_FIELDS: readonly SettingsFieldSpec[] = [
  { key: "minBrightness", label: "Min brightness", unit: "%", min: 1, max: 100, step: 1 },
  { key: "maxBrightness", label: "Max brightness", unit: "%", min: 1, max: 100, step: 1 },
  { key: "minColorTemp", label: "Min color temp", unit: "K", min: 1000, max: 10000, step: 50 },
  { key: "maxColorTemp", label: "Max color temp", unit: "K", min: 1000, max: 10000, step: 50 },
  { key: "sleepBrightness", label: "Sleep brightness", unit: "%", min: 1, max: 100, step: 1 },
  { key: "sleepColorTemp", label: "Sleep color temp", unit: "K", min: 1000, max: 10000, step: 50 },
];

function bindTooltip(el: HTMLElement, text: string | null): void {
  if (text) el.dataset.alTip = text;
  else delete el.dataset.alTip;
  if (el.dataset.alTipBound === "1") return;
  el.dataset.alTipBound = "1";
  const show = () => {
    const current = el.dataset.alTip;
    if (current) showAreaDotTooltip(el, current);
  };
  el.addEventListener("pointerenter", show);
  el.addEventListener("focus", show);
  el.addEventListener("pointerleave", dismissAreaDotTooltip);
  el.addEventListener("blur", hideAreaDotTooltip);
  el.addEventListener("pointerdown", hideAreaDotTooltip);
}

if (typeof HTMLElement !== "undefined" && typeof customElements !== "undefined") {
  class AreaCardAdaptiveLighting extends HTMLElement {
    private config?: AdaptiveLightingConfig;
    private _hass?: ServiceHass;
    private root?: HTMLElement;
    private expanded = false;
    private dirty = false;
    private saving = false;
    private configRequestedFor?: string;
    private inputs = new Map<keyof Omit<AdaptiveLightingSettings, "hasConfig">, HTMLInputElement>();

    createRenderRoot(): HTMLElement {
      return this;
    }

    getCardSize(): number {
      return this.expanded ? 4 : 2;
    }

    getGridOptions(): { columns: number } {
      return { columns: 12 };
    }

    setConfig(config: AdaptiveLightingConfig): void {
      this.config = config;
      this.render();
    }

    set hass(value: ServiceHass) {
      this._hass = value;
      this.render();
    }

    get hass(): ServiceHass | undefined {
      return this._hass;
    }

    connectedCallback(): void {
      this.style.display = "block";
      this.render();
    }

    disconnectedCallback(): void {
      hideAreaDotTooltip();
    }

    private group(): AdaptiveLightingGroup | null {
      const group = this.config?.group;
      if (!group || typeof group !== "object") return null;
      return group;
    }

    private render(): void {
      const group = this.group();
      if (!group) return;
      const hass = this._hass;
      const states = hass?.states ?? {};
      const mainId = group.mainEntityId ?? this.config?.entity;
      const mainState = mainId ? states[mainId] : undefined;
      const range = adaptiveLightingRange(mainState);
      const settings = adaptiveLightingSettings(mainState);
      const roomName = typeof this.config?.room_name === "string" ? this.config.room_name : "";
      const title = adaptiveLightingTitle(group.name, roomName);
      const pills = adaptiveLightingPills(group);

      if (!this.root) {
        this.root = document.createElement("ha-card");
        this.root.className = "area-card-adaptive-lighting";
        this.append(this.root);
      }
      const card = this.root;
      card.style.cssText = [
        "padding:12px",
        "box-sizing:border-box",
        range.on ? "" : "opacity:0.72",
      ]
        .filter(Boolean)
        .join(";");

      const header = this.ensureChild(card, "header", "div");
      header.style.cssText =
        "display:flex;align-items:center;gap:10px;margin:0 0 10px;min-width:0";

      const iconBtn = this.ensureChild(header, "icon", "button") as HTMLButtonElement;
      iconBtn.type = "button";
      iconBtn.setAttribute(
        "aria-label",
        range.on ? "Turn off Adaptive Lighting" : "Turn on Adaptive Lighting",
      );
      bindTooltip(iconBtn, adaptiveLightingMainTooltip(range.on));
      iconBtn.style.cssText = [
        "display:inline-flex",
        "align-items:center",
        "justify-content:center",
        "width:40px",
        "height:40px",
        "border:none",
        "border-radius:50%",
        "padding:0",
        "cursor:pointer",
        "flex:0 0 auto",
        range.on
          ? "background:color-mix(in srgb, rgb(255, 193, 7) 22%, transparent);color:rgb(255, 193, 7)"
          : "background:color-mix(in srgb, var(--disabled-text-color, #9e9e9e) 18%, transparent);color:var(--disabled-text-color, #9e9e9e)",
      ].join(";");
      const iconEl = this.ensureChild(iconBtn, "icon-el", "ha-icon");
      iconEl.setAttribute("icon", "mdi:theme-light-dark");
      iconEl.style.setProperty("--mdc-icon-size", "22px");
      iconBtn.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!mainId || !this._hass?.callService) return;
        void this._hass.callService("switch", "toggle", { entity_id: mainId });
      };

      const titleBtn = this.ensureChild(header, "title", "button") as HTMLButtonElement;
      titleBtn.type = "button";
      titleBtn.textContent = title;
      titleBtn.style.cssText = [
        "flex:1 1 auto",
        "min-width:0",
        "margin:0",
        "padding:0",
        "border:none",
        "background:none",
        "text-align:left",
        "cursor:pointer",
        "font:600 15px/1.3 var(--ha-font-family-body, var(--primary-font-family, system-ui, sans-serif))",
        "color:var(--primary-text-color)",
        "overflow:hidden",
        "text-overflow:ellipsis",
        "white-space:nowrap",
      ].join(";");
      titleBtn.onclick = (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!mainId) return;
        this.dispatchEvent(
          new CustomEvent("hass-more-info", {
            bubbles: true,
            composed: true,
            detail: { entityId: mainId },
          }),
        );
      };

      const meta = this.ensureChild(header, "meta", "div");
      meta.style.cssText =
        "display:flex;flex-direction:column;align-items:flex-end;gap:2px;flex:0 0 auto;font-variant-numeric:tabular-nums";
      const kelvinLabel =
        range.currentK != null && Number.isFinite(range.currentK) ? `${Math.round(range.currentK)}K` : "—";
      const brightnessLabel =
        range.brightnessPct != null && Number.isFinite(range.brightnessPct)
          ? `${Math.round(range.brightnessPct)}%`
          : "";
      const live = this.ensureChild(meta, "live", "span");
      live.textContent = brightnessLabel ? `${kelvinLabel} · ${brightnessLabel}` : kelvinLabel;
      live.style.cssText =
        "font-size:12px;font-weight:600;color:var(--primary-text-color);white-space:nowrap";
      const manual = this.ensureChild(meta, "manual", "span");
      if (range.manualControl) {
        manual.textContent = "Manual";
        manual.style.cssText =
          "font-size:10px;font-weight:600;color:var(--warning-color, #ff9800);white-space:nowrap";
        manual.style.display = "block";
        bindTooltip(manual, adaptiveLightingManualTooltip(range.manualControlIds, states));
      } else {
        manual.textContent = "";
        manual.style.display = "none";
        bindTooltip(manual, null);
      }

      const barWrap = this.ensureChild(card, "bar-wrap", "div");
      barWrap.style.cssText = "margin:0 0 8px";
      const bar = this.ensureChild(barWrap, "bar", "div");
      bar.style.cssText = [
        "position:relative",
        "height:10px",
        "border-radius:999px",
        `background:${kelvinGradientCss(range.minK, range.maxK)}`,
        "box-shadow:inset 0 0 0 1px rgba(0,0,0,0.08)",
      ].join(";");
      const tick = this.ensureChild(bar, "tick", "span");
      if (range.currentK != null) {
        const pct = clampTickPercent(range.currentK, range.minK, range.maxK);
        tick.style.cssText = [
          "position:absolute",
          "top:50%",
          "width:3px",
          "height:16px",
          "margin-left:-1.5px",
          "border-radius:2px",
          "background:var(--primary-text-color)",
          "box-shadow:0 0 0 1px var(--card-background-color, #fff)",
          "transform:translateY(-50%)",
          "pointer-events:none",
          `left:${pct.toFixed(2)}%`,
        ].join(";");
        tick.style.display = "block";
      } else {
        tick.style.display = "none";
      }

      const labels = this.ensureChild(barWrap, "labels", "div");
      labels.style.cssText =
        "display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:4px;font-size:10px;color:var(--secondary-text-color);font-variant-numeric:tabular-nums";
      this.ensureChild(labels, "min", "span").textContent = `${Math.round(range.minK)}K`;
      const current = this.ensureChild(labels, "current", "span");
      current.textContent = kelvinLabel;
      current.style.cssText = "font-weight:600;color:var(--primary-text-color)";
      this.ensureChild(labels, "max", "span").textContent = `${Math.round(range.maxK)}K`;

      const controlsRow = this.ensureChild(card, "controls-row", "div");
      controlsRow.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:6px;flex-wrap:wrap";

      const pillRow = this.ensureChild(controlsRow, "pills", "div");
      pillRow.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;flex:1 1 auto";
      const wanted = new Set(pills.map((pill) => pill.entityId));
      for (const child of [...pillRow.children]) {
        if (!(child instanceof HTMLElement) || !wanted.has(child.dataset.entity ?? "")) child.remove();
      }
      for (const pill of pills) {
        const state = states[pill.entityId];
        const on = state?.state === "on";
        const existingBtn = pillRow.querySelector(`[data-entity="${CSS.escape(pill.entityId)}"]`);
        const btn =
          existingBtn instanceof HTMLButtonElement
            ? existingBtn
            : (() => {
                const created = document.createElement("button");
                created.type = "button";
                created.dataset.entity = pill.entityId;
                pillRow.append(created);
                return created;
              })();
        btn.setAttribute("aria-pressed", on ? "true" : "false");
        bindTooltip(btn, adaptiveLightingPillTooltip(pill, on));
        btn.style.cssText = [
          "display:inline-flex",
          "align-items:center",
          "gap:5px",
          "padding:4px 9px",
          "border-radius:999px",
          "font-size:11px",
          "font-weight:600",
          "cursor:pointer",
          "border:1px solid",
          on
            ? "border-color:color-mix(in srgb, var(--success-color, #4caf50) 45%, var(--divider-color, #888));color:var(--success-color, #4caf50);background:color-mix(in srgb, var(--success-color, #4caf50) 12%, transparent)"
            : "border-color:var(--divider-color, rgba(127,127,127,0.4));color:var(--secondary-text-color);background:transparent",
        ].join(";");
        const pillIcon = this.ensureChild(btn, "pill-icon", "ha-icon");
        pillIcon.setAttribute("icon", pill.icon);
        pillIcon.style.setProperty("--mdc-icon-size", "14px");
        const pillLabel = this.ensureChild(btn, "pill-label", "span");
        pillLabel.textContent = pill.label;
        btn.onclick = (event: MouseEvent) => {
          event.preventDefault();
          event.stopPropagation();
          if (!this._hass?.callService) return;
          void this._hass.callService("switch", "toggle", { entity_id: pill.entityId });
        };
      }

      const settingsBtn = this.ensureChild(controlsRow, "settings-toggle", "button") as HTMLButtonElement;
      if (mainId) {
        settingsBtn.type = "button";
        settingsBtn.style.display = "inline-flex";
        settingsBtn.setAttribute("aria-expanded", this.expanded ? "true" : "false");
        settingsBtn.setAttribute("aria-label", this.expanded ? "Hide settings" : "Adaptive Lighting settings");
        bindTooltip(
          settingsBtn,
          this.expanded ? "Hide settings" : "Settings\nAdjust brightness, Kelvin range & sleep",
        );
        settingsBtn.style.cssText = [
          "display:inline-flex",
          "align-items:center",
          "gap:3px",
          "padding:4px 8px",
          "border-radius:999px",
          "font-size:11px",
          "font-weight:600",
          "cursor:pointer",
          "flex:0 0 auto",
          "border:1px solid",
          this.expanded
            ? "border-color:color-mix(in srgb, var(--primary-color, #03a9f4) 55%, var(--divider-color, #888));color:var(--primary-color, #03a9f4);background:color-mix(in srgb, var(--primary-color, #03a9f4) 12%, transparent)"
            : "border-color:var(--divider-color, rgba(127,127,127,0.4));color:var(--secondary-text-color);background:transparent",
        ].join(";");
        const tuneIcon = this.ensureChild(settingsBtn, "tune-icon", "ha-icon");
        tuneIcon.setAttribute("icon", "mdi:tune");
        tuneIcon.style.setProperty("--mdc-icon-size", "14px");
        const chevIcon = this.ensureChild(settingsBtn, "chev-icon", "ha-icon");
        chevIcon.setAttribute("icon", this.expanded ? "mdi:chevron-up" : "mdi:chevron-down");
        chevIcon.style.setProperty("--mdc-icon-size", "14px");
        settingsBtn.onclick = (event: MouseEvent) => {
          event.preventDefault();
          event.stopPropagation();
          this.expanded = !this.expanded;
          if (!this.expanded) {
            this.dirty = false;
          } else if (!settings.hasConfig && this.configRequestedFor !== mainId && this._hass?.callService) {
            this.configRequestedFor = mainId;
            void this._hass.callService("adaptive_lighting", "change_switch_settings", {
              entity_id: mainId,
              include_config_in_attributes: true,
            });
          }
          this.render();
        };
      } else {
        settingsBtn.style.display = "none";
      }

      this.renderSettingsPanel(card, mainId, settings);
    }

    private renderSettingsPanel(
      card: HTMLElement,
      mainId: string | undefined,
      settings: AdaptiveLightingSettings,
    ): void {
      const panel = this.ensureChild(card, "settings-panel", "div");
      if (!this.expanded || !mainId) {
        panel.style.display = "none";
        return;
      }
      panel.style.cssText = [
        "display:block",
        "margin-top:10px",
        "padding-top:10px",
        "border-top:1px solid var(--divider-color, rgba(127,127,127,0.25))",
      ].join(";");
      if (panel.dataset.alStopBound !== "1") {
        panel.dataset.alStopBound = "1";
        panel.addEventListener("pointerdown", (event) => event.stopPropagation());
        panel.addEventListener("click", (event) => event.stopPropagation());
      }

      const grid = this.ensureChild(panel, "settings-grid", "div");
      grid.style.cssText = "display:grid;grid-template-columns:repeat(2, minmax(0, 1fr));gap:8px;margin-bottom:10px";

      for (const spec of SETTINGS_FIELDS) {
        const field = this.ensureChild(grid, `field-${spec.key}`, "label");
        field.style.cssText =
          "display:flex;flex-direction:column;gap:3px;font-size:11px;color:var(--secondary-text-color)";
        const labelSpan = this.ensureChild(field, `label-${spec.key}`, "span");
        labelSpan.textContent = `${spec.label} (${spec.unit})`;
        let input = this.inputs.get(spec.key);
        if (!input || !input.isConnected) {
          const existing = field.querySelector("input");
          if (existing instanceof HTMLInputElement) {
            input = existing;
          } else {
            input = document.createElement("input");
            input.type = "number";
            input.min = String(spec.min);
            input.max = String(spec.max);
            input.step = String(spec.step);
            input.inputMode = "numeric";
            input.style.cssText = [
              "width:100%",
              "box-sizing:border-box",
              "padding:5px 8px",
              "border-radius:8px",
              "border:1px solid var(--divider-color, rgba(127,127,127,0.4))",
              "background:var(--secondary-background-color, rgba(127,127,127,0.08))",
              "color:var(--primary-text-color)",
              "font-size:12px",
              "font-variant-numeric:tabular-nums",
            ].join(";");
            input.addEventListener("input", () => {
              this.dirty = true;
            });
            field.append(input);
          }
          this.inputs.set(spec.key, input);
        }
        if (!this.dirty && document.activeElement !== input) {
          input.value = String(Math.round(settings[spec.key]));
        }
      }

      const actions = this.ensureChild(panel, "settings-actions", "div");
      actions.style.cssText = "display:flex;align-items:center;justify-content:flex-end;gap:8px";

      const resetBtn = this.ensureChild(actions, "reset-btn", "button") as HTMLButtonElement;
      resetBtn.type = "button";
      resetBtn.textContent = "Reset";
      resetBtn.disabled = this.saving;
      bindTooltip(resetBtn, "Revert runtime overrides to switch configuration defaults");
      resetBtn.style.cssText = [
        "padding:5px 10px",
        "border-radius:8px",
        "border:1px solid var(--divider-color, rgba(127,127,127,0.4))",
        "background:transparent",
        "color:var(--secondary-text-color)",
        "font-size:12px",
        "font-weight:600",
        "cursor:pointer",
      ].join(";");
      resetBtn.onclick = (event: MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        if (!this._hass?.callService || this.saving) return;
        this.saving = true;
        this.dirty = false;
        this.render();
        void Promise.resolve(
          this._hass.callService("adaptive_lighting", "change_switch_settings", {
            entity_id: mainId,
            use_defaults: "configuration",
            include_config_in_attributes: true,
          }),
        ).finally(() => {
          this.saving = false;
          this.render();
        });
      };

      const applyBtn = this.ensureChild(actions, "apply-btn", "button") as HTMLButtonElement;
      applyBtn.type = "button";
      applyBtn.textContent = this.saving ? "Applying…" : "Apply";
      applyBtn.disabled = this.saving;
      bindTooltip(applyBtn, "Apply settings via adaptive_lighting.change_switch_settings");
      applyBtn.style.cssText = [
        "padding:5px 12px",
        "border-radius:8px",
        "border:none",
        "background:var(--primary-color, #03a9f4)",
        "color:var(--text-primary-color, #fff)",
        "font-size:12px",
        "font-weight:600",
        "cursor:pointer",
      ].join(";");
      applyBtn.onclick = (event: MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        if (!this._hass?.callService || this.saving) return;
        const draft: Omit<AdaptiveLightingSettings, "hasConfig"> = {
          minBrightness: Number(this.inputs.get("minBrightness")?.value),
          maxBrightness: Number(this.inputs.get("maxBrightness")?.value),
          minColorTemp: Number(this.inputs.get("minColorTemp")?.value),
          maxColorTemp: Number(this.inputs.get("maxColorTemp")?.value),
          sleepBrightness: Number(this.inputs.get("sleepBrightness")?.value),
          sleepColorTemp: Number(this.inputs.get("sleepColorTemp")?.value),
        };
        const payload = buildChangeSettingsPayload(mainId, draft);
        this.saving = true;
        this.dirty = false;
        this.render();
        void Promise.resolve(
          this._hass.callService("adaptive_lighting", "change_switch_settings", payload),
        ).finally(() => {
          this.saving = false;
          this.render();
        });
      };
    }

    private ensureChild(parent: HTMLElement, key: string, tag: string): HTMLElement {
      const existing = parent.querySelector(`[data-al="${CSS.escape(key)}"]`);
      if (existing instanceof HTMLElement) return existing;
      const el = document.createElement(tag) as HTMLElement;
      el.dataset.al = key;
      parent.append(el);
      return el;
    }
  }

  if (!customElements.get(ADAPTIVE_LIGHTING_ELEMENT)) {
    customElements.define(ADAPTIVE_LIGHTING_ELEMENT, AreaCardAdaptiveLighting);
  }
}
