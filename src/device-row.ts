import { stripRoomName } from "./names";
import type { ClassifierHass, EntityState } from "./sections";

export interface DeviceRowConfig {
  card?: Record<string, unknown>;
  sensors?: string[];
  room_name?: string;
  device_name?: string;
}

interface CardElement extends HTMLElement {
  hass?: ClassifierHass;
  config?: Record<string, unknown>;
  setConfig?: (config: Record<string, unknown>) => void;
  load?: () => Promise<unknown> | void;
  getCardSize?: () => number;
  getGridOptions?: () => { columns?: number; rows?: number | string };
  updateComplete?: Promise<boolean>;
}

const STYLE_ID = "area-card-device-sensors-style";
const SENSORS_CLASS = "area-card-device-sensors";
const BAR_CLASS = "area-card-device-sensors-bar";
const SKIP_STATES = new Set(["unknown", "unavailable", "none"]);

function tagForType(type: unknown): string | undefined {
  if (typeof type !== "string" || !type.startsWith("custom:")) return undefined;
  return type.slice("custom:".length);
}

function titleCaseState(raw: string): string {
  return raw.replace(/[A-Za-z]+(?:'[A-Za-z]+)?/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

export function sensorLabel(state: EntityState, roomName: string, deviceName: string): string {
  const raw = state.attributes?.friendly_name;
  if (typeof raw !== "string" || raw.trim() === "") return "";
  let label = roomName ? stripRoomName(raw, roomName) : raw.trim();
  if (deviceName) {
    const strippedDevice = stripRoomName(deviceName, roomName) || deviceName;
    const afterDevice = stripRoomName(label, strippedDevice);
    if (afterDevice && afterDevice !== label) label = afterDevice;
    else if (deviceName !== strippedDevice) {
      const afterFull = stripRoomName(label, deviceName);
      if (afterFull && afterFull !== label) label = afterFull;
    }
  }
  return label.trim();
}

export function formatDeviceSensors(
  sensorIds: readonly string[],
  states: Record<string, EntityState | undefined>,
  options?: {
    roomName?: string;
    deviceName?: string;
    formatEntityState?: (state: EntityState, sample?: string) => string;
  },
): string[] {
  const parts: string[] = [];
  const roomName = options?.roomName ?? "";
  const deviceName = options?.deviceName ?? "";
  for (const id of sensorIds) {
    const state = states[id];
    if (!state) continue;
    const raw = state.state;
    if (typeof raw !== "string" || !raw || SKIP_STATES.has(raw)) continue;
    const unit = state.attributes?.unit_of_measurement;
    const hasUnit = typeof unit === "string" && unit.trim() !== "";
    let formatted: string | undefined;
    if (options?.formatEntityState) {
      try {
        const res = options.formatEntityState(state);
        if (typeof res === "string" && res.trim() !== "") formatted = res.trim();
      } catch {
        // Fall back to raw formatting below.
      }
    }
    const valueText = formatted ?? (hasUnit ? `${raw} ${unit}` : titleCaseState(raw));
    if (hasUnit) {
      parts.push(valueText);
    } else {
      const label = sensorLabel(state, roomName, deviceName);
      parts.push(label ? `${label}: ${valueText}` : valueText);
    }
  }
  return parts;
}

if (typeof HTMLElement !== "undefined" && typeof customElements !== "undefined") {
  class AreaCardDeviceRow extends HTMLElement {
    private config?: DeviceRowConfig;
    private _hass?: ClassifierHass;
    private cardEl?: CardElement;
    private barEl?: HTMLDivElement;
    private cardType?: string;
    private cardConfigKey?: string;
    private syncScheduled = false;
    private observedRoots = new WeakSet<Node>();
    private observers: MutationObserver[] = [];

    createRenderRoot(): HTMLElement {
      return this;
    }

    getCardSize(): number {
      return this.cardEl?.getCardSize?.() ?? 1;
    }

    getGridOptions(): { columns?: number; rows?: number | string } {
      return this.cardEl?.getGridOptions?.() ?? { columns: 12 };
    }

    setConfig(config: DeviceRowConfig): void {
      this.config = config;
      this.mount();
    }

    set hass(value: ClassifierHass) {
      this._hass = value;
      if (this.cardEl) this.cardEl.hass = value;
      this.scheduleSync();
    }

    get hass(): ClassifierHass | undefined {
      return this._hass;
    }

    connectedCallback(): void {
      this.style.display = "block";
      this.mount();
    }

    disconnectedCallback(): void {
      for (const observer of this.observers) observer.disconnect();
      this.observers = [];
      this.observedRoots = new WeakSet<Node>();
    }

    private mount(): void {
      const card = this.config?.card;
      if (!card || typeof card !== "object") return;
      const customTag = tagForType(card.type);
      const key = JSON.stringify(card);
      if (customTag) {
        if (!this.cardEl || this.cardType !== String(card.type)) {
          this.cardEl?.remove();
          this.cardEl = document.createElement(customTag) as CardElement;
          this.cardType = String(card.type);
          this.insertBefore(this.cardEl, this.barEl ?? null);
        }
        const applyCustom = () => {
          if (!this.cardEl || this.config?.card !== card) return;
          this.cardEl.setConfig?.(card);
          if (this._hass) this.cardEl.hass = this._hass;
          this.scheduleSync();
        };
        if (customElements.get(customTag)) {
          applyCustom();
        } else {
          void customElements.whenDefined(customTag).then(applyCustom);
        }
      } else {
        if (!this.cardEl || this.cardType !== "hui-card") {
          this.cardEl?.remove();
          this.cardEl = document.createElement("hui-card") as CardElement;
          this.cardEl.style.display = "block";
          this.cardType = "hui-card";
          this.insertBefore(this.cardEl, this.barEl ?? null);
        }
        if (this._hass) this.cardEl.hass = this._hass;
        if (this.cardConfigKey !== key) {
          this.cardEl.config = card;
          this.cardConfigKey = key;
          this.cardEl.load?.();
        }
        this.scheduleSync();
      }
    }

    private scheduleSync(): void {
      this.syncSensors();
      if (this.cardEl?.updateComplete) {
        void this.cardEl.updateComplete.then(() => {
          if (this.isConnected) this.syncSensors();
        });
      }
      if (!this.syncScheduled && this.isConnected && typeof requestAnimationFrame === "function") {
        this.syncScheduled = true;
        requestAnimationFrame(() => {
          this.syncScheduled = false;
          if (this.isConnected) this.syncSensors();
        });
      }
    }

    private observeRoot(root: Node | null | undefined): void {
      if (!root || this.observedRoots.has(root) || typeof MutationObserver === "undefined") return;
      this.observedRoots.add(root);
      const observer = new MutationObserver(() => {
        if (this.isConnected) this.syncSensors();
      });
      observer.observe(root, { childList: true, subtree: true });
      this.observers.push(observer);
    }

    private syncSensors(): void {
      const sensorIds = this.config?.sensors ?? [];
      const parts =
        sensorIds.length > 0 && this._hass?.states
          ? formatDeviceSensors(sensorIds, this._hass.states, {
              roomName: this.config?.room_name,
              deviceName: this.config?.device_name,
              formatEntityState: this._hass.formatEntityState,
            })
          : [];
      const text = parts.length > 0 ? ` · ${parts.join(" · ")}` : "";

      if (this.cardEl?.shadowRoot) this.observeRoot(this.cardEl.shadowRoot);

      const stateInfo = this.findStateInfo() as (CardElement & HTMLElement) | null;
      if (stateInfo) {
        this.observeRoot(stateInfo.shadowRoot);
        if (!stateInfo.shadowRoot && stateInfo.updateComplete) {
          void stateInfo.updateComplete.then(() => {
            if (this.isConnected) this.syncSensors();
          });
        }
        if (stateInfo.shadowRoot) {
          this.removeBar();
          const root = stateInfo.shadowRoot;
          const secondary = root.querySelector(".secondary");
          if (secondary instanceof HTMLElement) {
            if (!root.querySelector(`#${STYLE_ID}`)) {
              const style = document.createElement("style");
              style.id = STYLE_ID;
              style.textContent = ".secondary { white-space: normal !important; }";
              root.append(style);
            }
            let span = secondary.querySelector(`.${SENSORS_CLASS}`);
            if (text) {
              if (!(span instanceof HTMLSpanElement)) {
                span = document.createElement("span");
                span.className = SENSORS_CLASS;
                secondary.append(span);
              }
              if (span.textContent !== text) span.textContent = text;
            } else if (span) {
              span.remove();
            }
            return;
          }
          if (stateInfo.updateComplete) {
            void stateInfo.updateComplete.then(() => {
              if (this.isConnected) this.syncSensors();
            });
          }
          return;
        }
      }

      if (this.hasRenderedNonMushroomCard()) {
        this.renderBar(parts.join(" · "));
      }
    }

  private findStateInfo(): HTMLElement | null {
    const queue: ParentNode[] = [];
    if (this.cardEl) {
      if (this.cardEl.shadowRoot) queue.push(this.cardEl.shadowRoot);
      queue.push(this.cardEl);
    }
    while (queue.length > 0) {
      const node = queue.shift()!;
      for (const child of node.children) {
        if (!(child instanceof HTMLElement)) continue;
        if (child.localName === "area-card-mushroom-state-info") return child;
        if (child.shadowRoot) queue.push(child.shadowRoot);
        if (child.children.length > 0) queue.push(child);
      }
    }
    return null;
  }

  private hasRenderedNonMushroomCard(): boolean {
    if (!this.cardEl) return false;
    const target = this.cardEl.localName === "hui-card" ? this.cardEl.firstElementChild : this.cardEl;
    if (!(target instanceof HTMLElement)) return false;
    if (target.localName.startsWith("area-card-mushroom")) return false;
    return Boolean(target.shadowRoot?.querySelector("ha-card") || target.querySelector("ha-card"));
  }

  private renderBar(text: string): void {
    if (!text) {
      this.removeBar();
      return;
    }
    if (!this.barEl) {
      this.barEl = document.createElement("div");
      this.barEl.className = BAR_CLASS;
      Object.assign(this.barEl.style, {
        fontSize: "12px",
        lineHeight: "16px",
        color: "var(--secondary-text-color)",
        padding: "2px 12px 6px",
        whiteSpace: "normal",
      });
      this.append(this.barEl);
    }
    if (this.barEl.textContent !== text) this.barEl.textContent = text;
  }

  private removeBar(): void {
    this.barEl?.remove();
    this.barEl = undefined;
  }
}

  if (!customElements.get("area-card-device-row")) {
    customElements.define("area-card-device-row", AreaCardDeviceRow);
  }
}
