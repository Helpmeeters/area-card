import { CAMERA_ROW_TAG } from "./camera-detections";
import { syncAutomationSubtitle } from "./automation-subtitle";
import { areaBackgroundEqual, type AreaBackgroundMode } from "./background-mode";
import { createBatteryButton, syncBatteryButton, syncBatteryReadouts } from "./battery-ui";
import type { BatteryMode } from "./battery";
import { loadDisabledAutomations } from "./automations";
import { buildButtonConfig, type ButtonConfigInput } from "./button-config";
import { averageLightColor, lightTintBackgroundStyles, type RgbColor } from "./light-tint";
import { stripRoomName } from "./names";
import {
  AREA_CARD_CONFIG_FORM,
  contentFor,
  DEMO_AREA_ID,
  eventTargetsDemoEntity,
  parseAreaConfig,
  presentArea,
  publishChildHass,
  type ParsedAreaConfig,
} from "./demo";
import {
  absoluteStreamUrl,
  autoplayRejected,
  cameraFrameReady,
  cameraAccessToken,
  createCameraStreamPlayer,
  ensureCameraStreamPlayer,
  hideCameraPlaybackControls,
  installCameraStreamAuth,
  primeCameraVideo,
  type CameraStreamPlayer,
} from "./camera-video";
import { hideAreaDotTooltip, syncAreaDotTooltips, syncPresencePillTooltip, type DotTooltipSource } from "./dot-tooltip";
import { ensureDeps } from "./ensure-deps";
import {
  cachedEventsMap,
  ensureFrigateEvents,
  getFrigateCameraRefs,
  selectAreaPresenceIdentities,
  subscribeFrigateEvents,
  type AreaIdentitySummary,
} from "./frigate-identity";
import { syncCardThemeFallback } from "./theme";
import "./floor-card";
import "./floors-card";
import "./camera-row";
import "./device-row";
import "./light-row";
import "./section-title";
import { entityScopeMap, setScopeEntityOrder, type AreaEntityOrder } from "./entity-order";
import {
  layoutPinnedCards,
  pinEntityId,
  pinMode,
  reorderPins,
  setPinMode,
  pinnedEdgeRadius,
  pinnedKey,
  pinnedRowsSideBySide,
  pinnedSideBySideGridStyles,
  pinnedSideBySideHostStyles,
  pinnedSideBySideStyles,
  selectPinnedCards,
  type AreaPins,
  type PinMode,
  type PinnedEdge,
  type PinnedLayoutWidth,
} from "./pinned-entities";
import { syncPinToggles } from "./pin-toggles";
import {
  isPopupDragActive,
  syncCardBackgroundSection,
  syncPinOrderSection,
  syncPopupEditGuards,
  syncSectionDragOrder,
} from "./popup-edit";
import { visiblePinnedIds, type PinStickyState } from "./pin-visibility";
import {
  backgroundCameraId,
  buttonPictureSuppressStyles,
  cameraEntityPicture,
  cameraStreamPath,
  cameraSupportsStream,
  cameraVideoScrim,
  clusterPictureWhileVideo,
  CLUSTER_PICTURE_RADIUS,
  clusterPictureProperties,
  collapsedPictureForMode,
  pictureAfterAutoplayFailure,
  pictureAfterCameraLoad,
  picturePlacement,
  pinnedPictureSurfaceStyles,
  type CameraPictureLoad,
} from "./picture";
import { syncAreaEditButton, syncCloseButtonTooltip, syncPinEditButton } from "./header-tooltips";
import { areaSettingsPath, ensureHeaderButtons } from "./popup-chrome";
import { withoutSections, type RollupId, type SectionRollup } from "./rollups";
import { areaUnavailable, membershipKey, type ClassifierHass } from "./sections";
import { BUBBLE_ELEMENT } from "./tags";
import {
  backgroundModeKey,
  batteryModeKey,
  cachedAreaBackground,
  cachedBatteryMode,
  cachedEntityOrder,
  cachedPins,
  ensureUserData,
  entityOrderKey,
  saveAreaBackground,
  saveAreaEntityOrder,
  saveAreaPins,
  saveBatteryMode,
  subscribeUserData,
} from "./user-data";

interface BubbleElement extends HTMLElement {
  hass?: ClassifierHass;
  setConfig?: (config: Record<string, unknown>) => void;
}

interface PinnedCardElement extends HTMLElement {
  hass?: ClassifierHass;
  config?: Record<string, unknown>;
  load?: () => void;
}

function popupCardsFrom(config: Record<string, unknown>): readonly Record<string, unknown>[] {
  const cards = config.cards;
  if (!Array.isArray(cards)) return [];
  const list: Record<string, unknown>[] = [];
  for (const card of cards) {
    if (card && typeof card === "object" && !Array.isArray(card)) list.push(card as Record<string, unknown>);
  }
  return list;
}

function applyPinnedHostStyle(host: HTMLElement): void {
  host.style.display = "flex";
  host.style.flexDirection = "column";
  host.style.gap = "0";
  host.style.margin = "0";
  host.style.padding = "0";
  host.style.width = "100%";
  host.style.overflow = "visible";
  host.style.borderRadius = "0";
}

function applyPinnedRowStyle(row: HTMLElement): void {
  row.style.display = "flex";
  row.style.flexDirection = "row";
  row.style.flexWrap = "nowrap";
  row.style.alignItems = "stretch";
  row.style.gap = "0";
  row.style.margin = "0";
  row.style.padding = "0";
  row.style.width = "100%";
}

function applyPinnedCardStyle(card: HTMLElement, width: PinnedLayoutWidth): void {
  const half = width === "half";
  card.style.display = "block";
  card.style.boxSizing = "border-box";
  card.style.margin = "0";
  card.style.padding = "0";
  card.style.minWidth = "0";
  card.style.flex = half ? "1 1 50%" : "1 1 100%";
  card.style.width = half ? "50%" : "100%";
  card.style.maxWidth = half ? "50%" : "100%";
}

/** Card element inside hui-card, plus a light row's mushroom card. Not the LED dot. */
function pinnedInnerHosts(card: HTMLElement): HTMLElement[] {
  const hosts: HTMLElement[] = [];
  const roots: ParentNode[] = [];
  if (card.shadowRoot) roots.push(card.shadowRoot);
  roots.push(card);
  for (const root of roots) {
    for (const child of root.children) {
      if (!(child instanceof HTMLElement) || !child.localName.includes("-")) continue;
      hosts.push(child);
      if (
        child.localName === "area-card-light-row" ||
        child.localName === "area-card-device-row" ||
        child.localName === CAMERA_ROW_TAG
      ) {
        const queue: HTMLElement[] = [child];
        while (queue.length > 0) {
          const parent = queue.shift()!;
          for (const nested of parent.children) {
            if (!(nested instanceof HTMLElement)) continue;
            if (nested.localName === "area-card-device-row" || nested.localName === CAMERA_ROW_TAG || nested.localName === "hui-card") {
              if (nested.localName !== "hui-card") hosts.push(nested);
              queue.push(nested);
            } else if (nested.localName.includes("-")) {
              hosts.push(nested);
            }
          }
        }
      }
    }
  }
  return hosts;
}

function pinnedChromeReady(card: HTMLElement): boolean {
  const hosts = pinnedInnerHosts(card).filter(
    (host) =>
      host.localName !== "area-card-light-row" &&
      host.localName !== "area-card-device-row" &&
      host.localName !== CAMERA_ROW_TAG,
  );
  if (hosts.length === 0) return false;
  return hosts.every((host) => host.shadowRoot?.querySelector("ha-card"));
}

const PIN_SPLIT_STYLE = "area-card-pin-split";
const PIN_SPLIT_ROWS = "area-card-pin-split-rows";

function syncPinnedStyle(root: ParentNode | null | undefined, id: string, text: string | null): void {
  if (!root) return;
  const existing = root.querySelector(`#${CSS.escape(id)}`);
  if (!text) {
    existing?.remove();
    return;
  }
  let style = existing;
  if (!(style instanceof HTMLStyleElement)) {
    style = document.createElement("style");
    style.id = id;
    root.append(style);
  }
  if (style.textContent !== text) style.textContent = text;
}

function mushroomLayout(host: HTMLElement): HTMLElement | null {
  const found = host.shadowRoot?.querySelector("area-card-mushroom-card");
  return found instanceof HTMLElement ? found : null;
}

/** Direct ha-card children when they are not already a mushroom name and control. */
function stackedCardBlocks(host: HTMLElement): HTMLElement[] {
  const card = host.shadowRoot?.querySelector("ha-card");
  if (!(card instanceof HTMLElement)) return [];
  const blocks = [...card.children].filter((node): node is HTMLElement => node instanceof HTMLElement);
  if (blocks.some((node) => node.localName === "area-card-mushroom-card")) return [];
  return blocks.length >= 2 ? blocks : [];
}

/**
 * An expanded odd double-tall card puts its name and its control in two columns.
 * The stylesheet lives in the card shadow, so the popup config is untouched.
 */
function applyPinnedSideBySide(card: HTMLElement, follow = true): void {
  const sideBySide = card.dataset.pinSplit === "1";
  if (sideBySide) card.style.setProperty("overflow", "visible", "important");
  else card.style.removeProperty("overflow");

  let actionsVisible = false;
  for (const host of pinnedInnerHosts(card)) {
    if (
      host.localName === "area-card-light-row" ||
      host.localName === "area-card-device-row" ||
      host.localName === CAMERA_ROW_TAG
    ) continue;
    const root = host.shadowRoot;
    if (!root) continue;
    if (root.querySelector(".actions")) actionsVisible = true;
    const layout = mushroomLayout(host);
    const grid = sideBySide && !layout && stackedCardBlocks(host).length >= 2;
    const hostText = sideBySide
      ? grid
        ? `${pinnedSideBySideHostStyles()}\n${pinnedSideBySideGridStyles()}`
        : pinnedSideBySideHostStyles()
      : null;
    syncPinnedStyle(root, PIN_SPLIT_STYLE, hostText);
    syncPinnedStyle(layout?.shadowRoot, PIN_SPLIT_ROWS, sideBySide && layout ? pinnedSideBySideStyles() : null);
  }

  for (const host of pinnedInnerHosts(card)) {
    if (host.localName !== "area-card-light-row") continue;
    const dot = host.querySelector(".area-card-led-dot");
    if (!(dot instanceof HTMLElement)) continue;
    dot.style.right = sideBySide && actionsVisible ? "calc(50% + 16px)" : "16px";
  }

  if (follow && sideBySide && !actionsVisible && card.isConnected) {
    requestAnimationFrame(() => {
      if (card.isConnected && card.dataset.pinSplit === "1") applyPinnedSideBySide(card, false);
    });
  }
}

function pinnedSplitApplied(card: HTMLElement): boolean {
  if (card.dataset.pinSplit !== "1") return true;
  const hosts = pinnedInnerHosts(card).filter(
    (host) =>
      host.localName !== "area-card-light-row" &&
      host.localName !== "area-card-device-row" &&
      host.localName !== CAMERA_ROW_TAG,
  );
  if (hosts.length === 0) return false;
  return hosts.some((host) => {
    const layout = mushroomLayout(host);
    if (layout) return Boolean(layout.shadowRoot?.querySelector(`#${CSS.escape(PIN_SPLIT_ROWS)}`));
    return Boolean(host.shadowRoot?.querySelector(`#${CSS.escape(PIN_SPLIT_STYLE)}`));
  });
}

class AreaCard extends HTMLElement {
  private _config?: ParsedAreaConfig;
  /** Last hass Home Assistant assigned. Demo mode rebuilds the child object from this. */
  private _rawHass?: ClassifierHass;
  /** Hass this card and its children read. Demo mode includes the mock entities. */
  private _hass?: ClassifierHass;
  private readonly stopDemoBackend = (event: Event): void => {
    if (!this._config?.demo || !eventTargetsDemoEntity(event)) return;
    event.stopPropagation();
  };
  private buttonEl?: BubbleElement;
  private popupEl?: BubbleElement;
  private signature?: string;
  private buttonKey?: string;
  private popupKey?: string;
  private running = false;
  private queued = false;
  private dotRollups: SectionRollup[] = [];
  private dotTooltipSource?: DotTooltipSource;
  private presenceIdentity: AreaIdentitySummary | null = null;
  private unsubscribeFrigate?: () => void;
  private frigateInstanceKey?: string;
  private tooltipHost?: HTMLElement;
  private tooltipObserver?: MutationObserver;
  private tooltipFrame = 0;
  private tooltipTries = 0;
  private editHost?: HTMLElement;
  private editObserver?: MutationObserver;
  private editFrame = 0;
  private editTries = 0;
  private editAreaId?: string;
  private applyingAreaEdit = false;
  private pinEditing = false;
  private pinSticky = new Map<string, PinStickyState>();
  private pinStickyTimer = 0;
  private pinEditEl?: HTMLButtonElement;
  private areaEditEl?: HTMLButtonElement;
  private batteryEl?: HTMLButtonElement;
  /** Last filter this card asked to save. Fast clicks queue instead of matching a stale cache. */
  private batteryWanted: BatteryMode | null = null;
  private pinnedEl?: HTMLElement;
  /** Photo painted on the collapsed card. The popup keeps the area picture. */
  private areaPicture: string | null = null;
  /** Area picture from the registry. A camera background does not replace the popup. */
  private areaPhoto: string | null = null;
  private roomName = "";
  private lightIds: readonly string[] = [];
  private resolvedLightTint: RgbColor | null = null;
  private cameraOrder: readonly string[] = [];
  private buttonInput?: ButtonConfigInput;
  private cameraLoads = new Map<string, CameraPictureLoad>();
  /** Last still that loaded for a camera, held while a refreshed URL is loading. */
  private heldCamera: { entityId: string; url: string } | null = null;
  /** Live HLS background. Failed stays failed until the chosen camera changes. */
  private streamState: { entityId: string; phase: "pending" | "playing" | "failed" } | null = null;
  private streamGeneration = 0;
  private streamTimer = 0;
  private resumeTimer = 0;
  /** The video element was created and did not start. The area picture stays up. */
  private autoplayFailed = false;
  private videoPlayer?: CameraStreamPlayer;
  private pinnedRowsVisible = false;
  private popupCards: readonly Record<string, unknown>[] = [];
  private entityScopes = new Map<string, string>();
  private sensorChipTargets: Record<string, string> = {};
  private lastChipKey = "";
  private pinnedConfigKey = new WeakMap<HTMLElement, string>();
  private resizeTimer = 0;
  private lastViewport = 0;
  private unsubscribeUserData?: () => void;
  private pendingPins = new Map<string, { pins: AreaPins; seq: number }>();
  private pendingPinSeq = 0;
  private pendingEntityOrder = new Map<string, { order: AreaEntityOrder; seq: number }>();
  private pendingOrderSeq = 0;
  private readonly onResize = () => {
    const width = window.innerWidth;
    if (width === this.lastViewport) return;
    window.clearTimeout(this.resizeTimer);
    this.resizeTimer = window.setTimeout(() => this.schedule(), 150);
  };

  static getConfigForm(): typeof AREA_CARD_CONFIG_FORM {
    return AREA_CARD_CONFIG_FORM;
  }

  static getStubConfig(hass?: ClassifierHass): { area: string; hide_sections: RollupId[] } {
    const first = hass?.areas ? Object.keys(hass.areas)[0] : undefined;
    return { area: first || "area", hide_sections: [] };
  }

  getConfigForm(): typeof AREA_CARD_CONFIG_FORM {
    return AreaCard.getConfigForm();
  }

  createRenderRoot(): HTMLElement {
    return this;
  }

  getCardSize(): number {
    return 2;
  }

  setConfig(config: { area?: unknown; hide_sections?: unknown; demo?: unknown }): void {
    this._config = parseAreaConfig(config);
    if (this._rawHass) this.adoptHass(this._rawHass);
    this.schedule();
  }

  /** Area the card is showing. Demo mode uses the stable demo id, not a registry area. */
  private boundAreaId(): string {
    const config = this._config;
    if (!config) return "";
    return config.demo ? DEMO_AREA_ID : config.area;
  }

  private effectivePins(areaId: string): AreaPins {
    return this.pendingPins.get(areaId)?.pins ?? cachedPins(areaId);
  }

  private effectiveEntityOrder(areaId: string): AreaEntityOrder {
    return this.pendingEntityOrder.get(areaId)?.order ?? cachedEntityOrder(areaId);
  }

  get hass(): ClassifierHass | undefined {
    return this._hass;
  }

  set hass(value: ClassifierHass) {
    this.adoptHass(value);
    this.schedule();
  }

  /**
   * Keeps the raw assignment, then gives this card and any button or popup
   * already on screen the demo overlay. Render assigns that same object again
   * once those elements exist.
   */
  private needsThemeFallback(): boolean {
    if (!this.pinnedRowsVisible) return false;
    return picturePlacement(this.areaPicture, true) === "cluster" || this.cameraVideoCovers();
  }

  private adoptHass(value: ClassifierHass): void {
    this._rawHass = value;
    syncCardThemeFallback(this, value, this.needsThemeFallback());
    const targets: { hass?: ClassifierHass }[] = [];
    if (this.buttonEl) targets.push(this.buttonEl);
    if (this.popupEl) targets.push(this.popupEl);
    this._hass = publishChildHass(Boolean(this._config?.demo), value, targets);
  }

  connectedCallback(): void {
    this.style.display = "block";
    syncCardThemeFallback(this, this._rawHass, this.needsThemeFallback());
    this.addEventListener("hass-more-info", this.stopDemoBackend);
    this.addEventListener("hass-action", this.stopDemoBackend);
    window.addEventListener("resize", this.onResize);
    this.unsubscribeUserData?.();
    this.unsubscribeUserData = subscribeUserData((key: string) => {
      const hass = this._hass;
      const areaId = this.boundAreaId();
      if (!hass || !areaId) return;
      if (key === batteryModeKey(areaId)) {
        this.paintBatteries(cachedBatteryMode(areaId));
        return;
      }
      if (key === entityOrderKey(areaId)) {
        this.schedule();
        return;
      }
      if (key === backgroundModeKey(areaId)) {
        this.syncPinnedRow(hass, areaId);
        this.applyAreaEdit();
        return;
      }
      if (key !== pinnedKey(areaId)) return;
      const chipKey = (cachedPins(areaId).chip ?? []).slice().sort().join(",");
      if (chipKey !== this.lastChipKey) {
        this.lastChipKey = chipKey;
        this.schedule();
      }
      this.syncPinnedRow(hass, areaId);
      this.applyAreaEdit();
    });
    this.schedule();
  }

  disconnectedCallback(): void {
    this.removeEventListener("hass-more-info", this.stopDemoBackend);
    this.removeEventListener("hass-action", this.stopDemoBackend);
    this.stopCameraVideo();
    this.unsubscribeUserData?.();
    this.unsubscribeUserData = undefined;
    this.unsubscribeFrigate?.();
    this.unsubscribeFrigate = undefined;
    this.frigateInstanceKey = undefined;
    window.removeEventListener("resize", this.onResize);
    window.clearTimeout(this.resizeTimer);
    window.clearTimeout(this.pinStickyTimer);
    this.pinStickyTimer = 0;
    this.stopDotTooltipWatch();
    this.stopAreaEditWatch();
    this.pinEditing = false;
    hideAreaDotTooltip();
  }

  private schedule(): void {
    if (this.running) {
      this.queued = true;
      return;
    }
    this.running = true;
    void this.render()
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "Area Card failed to render";
        this.showError(message);
      })
      .finally(() => {
        this.running = false;
        if (this.queued) {
          this.queued = false;
          this.schedule();
        }
      });
  }

  private async render(): Promise<void> {
    if (!this._config || !this._hass) return;
    const hass = this._hass;
    const configArea = this._config.area;
    const demo = this._config.demo;
    const same = () =>
      Boolean(this._config && this._hass === hass && this._config.area === configArea && this._config.demo === demo);
    await ensureUserData(hass);
    if (!same()) return;
    await ensureDeps();
    if (!same() || !this._config) return;
    const disabled = demo
      ? new Set<string>()
      : await loadDisabledAutomations(hass, contentFor(this._config, hass).sections.automations);
    if (!same() || !this._config) return;
    const latest = this._config;
    const seeded = contentFor(latest, hass);
    this.areaPhoto = demo ? null : seeded.picture;
    this.cameraOrder = demo ? [] : seeded.sections.cameras;
    const bgMode = cachedAreaBackground(seeded.areaId);
    const visibleLightIds = withoutSections(seeded.sections, latest.hide_sections).lights;
    this.lightIds = visibleLightIds;
    this.resolvedLightTint =
      bgMode.mode === "light-tint" ? averageLightColor(visibleLightIds, seeded.states) : null;
    const shownPicture = demo ? null : this.resolveCollapsedPicture(hass, seeded.areaId);
    const unavailable = demo ? false : areaUnavailable(hass, seeded.areaId, disabled);
    const formatEntityState = hass.formatEntityState;
    const formatState =
      !demo && typeof formatEntityState === "function" ? formatEntityState.bind(hass) : undefined;
    const viewportWidth = window.innerWidth;
    this.lastViewport = viewportWidth;
    const view = presentArea(latest, hass, {
      disabledAutomations: disabled,
      alignDots: !!this.closest("floor-card"),
      formatEntityState: formatState,
      viewportWidth,
      shownPicture,
      lightTint: this.pinnedRowsVisible ? null : this.resolvedLightTint,
      unavailable,
      entityOrder: this.effectiveEntityOrder(seeded.areaId),
      chipPins: this.effectivePins(seeded.areaId).chip,
      keepChipSensorsInList: this.pinEditing,
    });
    const areaId = view.content.areaId;
    const { name, icon, sections } = view.content;
    this.roomName = name;
    const visibleSections = view.sections;
    const states = view.content.states;
    const signature = membershipKey(areaId, name, icon, sections);
    this.entityScopes = entityScopeMap(visibleSections);
    this.sensorChipTargets = visibleSections.sensorChipTargets ?? {};
    this.lastChipKey = (this.effectivePins(areaId).chip ?? []).slice().sort().join(",");
    this.dotRollups = view.rollups;
    const frigateRefs = demo ? [] : getFrigateCameraRefs(visibleSections.cameras, states);
    if (frigateRefs.length > 0) {
      const instanceIds = [...new Set(frigateRefs.map((r) => r.instanceId))].sort();
      const instanceKey = instanceIds.join(",");
      if (this.frigateInstanceKey !== instanceKey) {
        this.unsubscribeFrigate?.();
        this.frigateInstanceKey = instanceKey;
        this.unsubscribeFrigate = subscribeFrigateEvents(instanceIds, () => {
          this.schedule();
        });
      }
      const triggerKey = visibleSections.occupancy
        .map((o) => `${o.entityId}:${states[o.entityId]?.state ?? ""}`)
        .join("|");
      ensureFrigateEvents(hass, frigateRefs, triggerKey);
      this.presenceIdentity = selectAreaPresenceIdentities(
        cachedEventsMap(frigateRefs),
        frigateRefs,
        visibleSections.occupancy,
        states,
      );
    } else {
      if (this.unsubscribeFrigate) {
        this.unsubscribeFrigate();
        this.unsubscribeFrigate = undefined;
        this.frigateInstanceKey = undefined;
      }
      this.presenceIdentity = null;
    }
    this.dotTooltipSource = {
      sections: visibleSections,
      states,
      roomName: name,
      formatEntityState: formatState,
      hass,
      disabledAutomations: disabled,
      literalState: demo,
      presenceIdentity: this.presenceIdentity,
    };
    this.buttonInput = view.buttonInput;
    const buttonConfig = view.button;
    const popupConfig = view.popup;
    const buttonKey = JSON.stringify(buttonConfig);
    const popupKey = JSON.stringify(popupConfig);
    this.popupCards = popupCardsFrom(popupConfig);

    if (this.signature !== signature || !this.buttonEl || !this.popupEl) {
      hideAreaDotTooltip();
      this.stopDotTooltipWatch();
      this.stopAreaEditWatch();
      this.pinEditing = false;
      this.buttonEl?.remove();
      this.popupEl?.remove();
      this.buttonEl = document.createElement(BUBBLE_ELEMENT) as BubbleElement;
      this.popupEl = document.createElement(BUBBLE_ELEMENT) as BubbleElement;
      Object.defineProperty(this.popupEl, "detectedEditor", { get: () => false, configurable: true });
      Object.defineProperty(this.popupEl, "inEditorPreview", { get: () => false, configurable: true });
      // Bubble's host is inline-block. The closed popup is 0px tall and still
      // wraps onto a line box under the button, which shows up as extra padding.
      this.buttonEl.style.display = "block";
      this.popupEl.style.display = "block";
      this.dataset.area = areaId;
      this.append(this.buttonEl, this.pinnedHost(), this.popupEl);
      this.signature = signature;
      this.buttonKey = undefined;
      this.popupKey = undefined;
    }

    if (this.buttonKey !== buttonKey) {
      this.buttonEl.setConfig?.(buttonConfig);
      this.buttonKey = buttonKey;
    }
    const popupDragging = Boolean(this.popupEl?.shadowRoot && isPopupDragActive(this.popupEl.shadowRoot));
    if (this.popupKey !== popupKey && !popupDragging) {
      this.popupEl.setConfig?.(popupConfig);
      this.popupKey = popupKey;
    }

    this.buttonEl.hass = hass;
    this.popupEl.hass = hass;
    this.syncPinnedRow(hass, areaId);
    this.watchDotTooltips();
    this.watchAreaEdit(areaId);
    this.querySelector("[data-area-card-error]")?.remove();
  }

  private stopDotTooltipWatch(): void {
    this.tooltipObserver?.disconnect();
    this.tooltipObserver = undefined;
    if (this.tooltipFrame) cancelAnimationFrame(this.tooltipFrame);
    this.tooltipFrame = 0;
    this.tooltipHost = undefined;
    this.tooltipTries = 0;
  }

  private watchDotTooltips(): void {
    const host = this.buttonEl;
    if (!host) return;
    if (this.tooltipHost === host) {
      this.applyDotTooltips();
      return;
    }
    this.stopDotTooltipWatch();
    this.tooltipHost = host;
    const attach = () => {
      if (this.buttonEl !== host || !this.isConnected) return;
      const root = host.shadowRoot;
      if (!root) {
        if (this.tooltipTries++ < 90) this.tooltipFrame = requestAnimationFrame(attach);
        return;
      }
      this.applyDotTooltips();
      this.tooltipObserver = new MutationObserver(() => this.applyDotTooltips());
      this.tooltipObserver.observe(root, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["class"],
      });
    };
    attach();
  }

  private applyDotTooltips(): void {
    const root = this.buttonEl?.shadowRoot;
    if (!root) return;
    this.syncPresencePill(root);
    syncAreaDotTooltips(root, this.dotTooltipSource);
    syncAutomationSubtitle(root);
  }

  private syncPresencePill(root: ShadowRoot): void {
    const badge = this.buttonInput?.presenceBadge ?? null;
    const nameContainer = root.querySelector(".bubble-name-container");
    const nameEl = root.querySelector(".bubble-name");
    if (!(nameContainer instanceof HTMLElement) || !(nameEl instanceof HTMLElement)) return;
    if (!badge) {
      root.querySelector(".area-card-presence-pill")?.remove();
      const parent = nameEl.parentElement;
      if (parent instanceof HTMLElement && parent.classList.contains("area-card-name-row")) {
        parent.before(nameEl);
        parent.remove();
      }
      return;
    }
    let row = nameEl.parentElement;
    if (!(row instanceof HTMLElement) || !row.classList.contains("area-card-name-row")) {
      row = document.createElement("div");
      row.className = "area-card-name-row";
      nameEl.before(row);
      row.append(nameEl);
    }
    const existingPill = row.querySelector(":scope > .area-card-presence-pill");
    let pill: HTMLSpanElement;
    if (existingPill instanceof HTMLSpanElement) {
      pill = existingPill;
    } else {
      pill = document.createElement("span");
      pill.className = "area-card-presence-pill";
      pill.tabIndex = 0;
      row.append(pill);
    }
    let textEl = pill.querySelector(":scope > .area-card-presence-text");
    if (!(textEl instanceof HTMLSpanElement)) {
      textEl = document.createElement("span");
      textEl.className = "area-card-presence-text";
      pill.prepend(textEl);
    }
    const singleOccupiedName =
      this.presenceIdentity && this.presenceIdentity.occupied && this.presenceIdentity.names.length === 1
        ? this.presenceIdentity.names[0]
        : null;
    const pillText = singleOccupiedName ?? badge.text;
    if (textEl.textContent !== pillText) textEl.textContent = pillText;
    const hasIdentity = Boolean(this.presenceIdentity && this.presenceIdentity.names.length > 0);
    const existingIdentityEl = pill.querySelector(":scope > .area-card-presence-identity");
    if (hasIdentity) {
      pill.dataset.hasIdentity = "1";
      if (!existingIdentityEl) {
        const iconEl = document.createElement("ha-icon");
        iconEl.className = "area-card-presence-identity";
        iconEl.setAttribute("icon", "mdi:face-recognition");
        iconEl.setAttribute("aria-hidden", "true");
        pill.append(iconEl);
      }
    } else {
      delete pill.dataset.hasIdentity;
      existingIdentityEl?.remove();
    }
    const occupiedFlag = badge.occupied ? "1" : "0";
    if (pill.dataset.occupied !== occupiedFlag) pill.dataset.occupied = occupiedFlag;
    syncPresencePillTooltip(pill, this.dotTooltipSource);
  }

  private stopAreaEditWatch(): void {
    this.editObserver?.disconnect();
    this.editObserver = undefined;
    if (this.editFrame) cancelAnimationFrame(this.editFrame);
    this.editFrame = 0;
    this.editHost = undefined;
    this.editTries = 0;
    this.pinEditEl = undefined;
    this.areaEditEl = undefined;
    this.batteryEl = undefined;
  }

  // Bubble rebuilds header actions, so the pencil and gear are reapplied.
  private watchAreaEdit(areaId: string): void {
    const host = this.popupEl;
    this.editAreaId = areaId;
    if (!host) return;
    if (this.editHost === host) {
      this.applyAreaEdit();
      return;
    }
    this.stopAreaEditWatch();
    this.editAreaId = areaId;
    this.editHost = host;
    const attach = () => {
      if (this.popupEl !== host || !this.isConnected) return;
      const root = host.shadowRoot;
      if (!root) {
        if (this.editTries++ < 90) this.editFrame = requestAnimationFrame(attach);
        return;
      }
      this.applyAreaEdit();
      this.editObserver = new MutationObserver(() => this.applyAreaEdit());
      this.editObserver.observe(root, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["class"],
      });
    };
    attach();
  }

  private applyAreaEdit(): void {
    const root = this.popupEl?.shadowRoot;
    const areaId = this.editAreaId;
    if (!root || !areaId || this.applyingAreaEdit) return;
    this.applyingAreaEdit = true;
    this.editObserver?.disconnect();
    try {
      const popup = root.querySelector(".bubble-pop-up");
      if (this.pinEditing && !popup?.classList.contains("is-popup-opened")) {
        this.pinEditing = false;
        if (this.lastChipKey !== "") this.schedule();
      }
      const actions = root.querySelector(".bubble-header-actions");
      if (actions) {
        const battery = this.headerButton(actions, ".area-card-battery", this.batteryEl, () => this.batteryButton());
        const pencil = this.headerButton(actions, ".area-card-pin-edit", this.pinEditEl, () => this.pinEditButton());
        const gear = this.headerButton(actions, ".area-card-edit-area", this.areaEditEl, () => this.areaEditButton(areaId));
        this.batteryEl = battery;
        this.pinEditEl = pencil;
        this.areaEditEl = gear;
        ensureHeaderButtons(actions, battery, pencil, gear);
        syncPinEditButton(pencil, this.pinEditing);
        syncAreaEditButton(gear);
        syncCloseButtonTooltip(actions);
        syncBatteryButton(battery, cachedBatteryMode(areaId));
      }
      this.paintBatteries(cachedBatteryMode(areaId));
      syncPopupEditGuards(root, this.pinEditing);
      syncPinToggles(root, {
        editing: this.pinEditing,
        modeOf: (entityId) => {
          const mode = pinMode(this.effectivePins(areaId), entityId);
          if (mode === "chip" && !this.sensorChipTargets[entityId]) return "hidden";
          return mode;
        },
        chipTargetOf: (entityId) => {
          const targetId = this.sensorChipTargets[entityId];
          if (!targetId || !this._hass) return null;
          const raw = this._hass.states?.[targetId]?.attributes?.friendly_name;
          const label =
            typeof raw === "string" && raw.trim() !== ""
              ? stripRoomName(raw, this.roomName) || raw.trim()
              : targetId;
          return { entityId: targetId, label };
        },
        onSelect: (entityId, mode) => this.pinSelected(areaId, entityId, mode),
      });
      if (this._hass) {
        syncCardBackgroundSection(root, {
          editing: this.pinEditing,
          current: cachedAreaBackground(areaId),
          areaPicture: this.areaPhoto,
          cameras: this.cameraOrder,
          states: this._hass.states,
          roomName: this.roomName,
          onSelect: (choice) => this.backgroundSelected(areaId, choice),
        });
        syncPinOrderSection(root, {
          editing: this.pinEditing,
          pins: this.effectivePins(areaId),
          popupCards: this.popupCards,
          hass: this._hass,
          onReorderPins: (nextOrder, nextSolo) => this.pinsReordered(areaId, nextOrder, nextSolo),
        });
      }
      syncSectionDragOrder(root, {
        editing: this.pinEditing,
        onReorderScope: (draggedId, scopeIds) => this.sectionReordered(areaId, draggedId, scopeIds),
      });
    } finally {
      this.applyingAreaEdit = false;
      if (this.editObserver && this.editHost === this.popupEl && this.isConnected) {
        this.editObserver.observe(root, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ["class"],
        });
      }
    }
  }

  private headerButton(
    actions: Element,
    selector: string,
    held: HTMLButtonElement | undefined,
    create: () => HTMLButtonElement,
  ): HTMLButtonElement {
    const found = actions.querySelector(`:scope > ${selector}`);
    if (found instanceof HTMLButtonElement) return found;
    if (held && !held.isConnected) return held;
    return create();
  }

  private pinEditButton(): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "bubble-header-action-button area-card-pin-edit";
    button.style.padding = "0";
    button.style.border = "none";
    const icon = document.createElement("ha-icon");
    icon.setAttribute("icon", "mdi:pencil");
    icon.setAttribute("aria-hidden", "true");
    icon.style.setProperty("--mdc-icon-size", "24px");
    button.append(icon);
    button.addEventListener("pointerdown", (event) => event.stopPropagation());
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      this.pinEditing = !this.pinEditing;
      if (this.lastChipKey !== "") this.schedule();
      this.applyAreaEdit();
    });
    syncPinEditButton(button, this.pinEditing);
    return button;
  }

  private backgroundSelected(areaId: string, choice: AreaBackgroundMode): void {
    const hass = this._hass;
    if (!hass || this.boundAreaId() !== areaId) return;
    if (areaBackgroundEqual(cachedAreaBackground(areaId), choice)) return;
    void saveAreaBackground(hass, areaId, choice).then(
      () => {
        if (this._hass !== hass || this.boundAreaId() !== areaId) return;
        this.syncPinnedRow(hass, areaId);
        this.applyAreaEdit();
      },
      () => {
        // A rejected save leaves the cache and the on-screen background unchanged.
      },
    );
  }

  private pinSelected(areaId: string, entityId: string, mode: PinMode): void {
    const hass = this._hass;
    if (!hass || this.boundAreaId() !== areaId) return;
    const current = this.effectivePins(areaId);
    if (pinMode(current, entityId) === mode) return;
    const next = setPinMode(current, entityId, mode);
    const seq = (this.pendingPinSeq += 1);
    this.pendingPins.set(areaId, { pins: next, seq });
    this.syncPinnedRow(hass, areaId);
    this.applyAreaEdit();
    void saveAreaPins(hass, areaId, next).then(
      () => {
        if (this.pendingPins.get(areaId)?.seq === seq) this.pendingPins.delete(areaId);
        if (this._hass !== hass || this.boundAreaId() !== areaId) return;
        this.syncPinnedRow(hass, areaId);
        this.applyAreaEdit();
      },
      () => {
        if (this.pendingPins.get(areaId)?.seq === seq) this.pendingPins.delete(areaId);
        if (this._hass !== hass || this.boundAreaId() !== areaId) return;
        this.syncPinnedRow(hass, areaId);
        this.applyAreaEdit();
      },
    );
  }

  private pinsReordered(areaId: string, nextOrder: readonly string[], nextSolo?: readonly string[]): void {
    const hass = this._hass;
    if (!hass || this.boundAreaId() !== areaId) return;
    const next = reorderPins(this.effectivePins(areaId), nextOrder, nextSolo);
    const seq = (this.pendingPinSeq += 1);
    this.pendingPins.set(areaId, { pins: next, seq });
    this.syncPinnedRow(hass, areaId);
    this.applyAreaEdit();
    void saveAreaPins(hass, areaId, next).then(
      () => {
        if (this.pendingPins.get(areaId)?.seq === seq) this.pendingPins.delete(areaId);
        if (this._hass !== hass || this.boundAreaId() !== areaId) return;
        this.syncPinnedRow(hass, areaId);
        this.applyAreaEdit();
      },
      () => {
        if (this.pendingPins.get(areaId)?.seq === seq) this.pendingPins.delete(areaId);
        if (this._hass !== hass || this.boundAreaId() !== areaId) return;
        this.syncPinnedRow(hass, areaId);
        this.applyAreaEdit();
      },
    );
  }

  private sectionReordered(areaId: string, draggedId: string, scopeIds: readonly string[]): void {
    const hass = this._hass;
    if (!hass || this.boundAreaId() !== areaId) return;
    const scope = this.entityScopes.get(draggedId);
    if (!scope) return;
    const next = setScopeEntityOrder(this.effectiveEntityOrder(areaId), scope, scopeIds);
    const seq = (this.pendingOrderSeq += 1);
    this.pendingEntityOrder.set(areaId, { order: next, seq });
    this.schedule();
    void saveAreaEntityOrder(hass, areaId, next).then(
      () => {
        if (this.pendingEntityOrder.get(areaId)?.seq === seq) this.pendingEntityOrder.delete(areaId);
        if (this._hass !== hass || this.boundAreaId() !== areaId) return;
        this.schedule();
      },
      () => {
        if (this.pendingEntityOrder.get(areaId)?.seq === seq) this.pendingEntityOrder.delete(areaId);
        if (this._hass !== hass || this.boundAreaId() !== areaId) return;
        this.schedule();
      },
    );
  }

  private pinnedHost(): HTMLElement {
    if (!this.pinnedEl) {
      this.pinnedEl = document.createElement("div");
      this.pinnedEl.className = "area-card-pinned";
    }
    const parent = this.pinnedEl.parentElement;
    const button = this.buttonEl;
    const popup = this.popupEl;
    if (
      parent &&
      parent !== this &&
      button?.parentElement === parent &&
      !(popup && parent.contains(popup))
    ) {
      return this.pinnedEl;
    }
    if (popup?.parentElement && this.pinnedEl.nextElementSibling !== popup) popup.before(this.pinnedEl);
    return this.pinnedEl;
  }

  private syncPinnedRow(hass: ClassifierHass, areaId: string): void {
    const bgMode = cachedAreaBackground(areaId);
    this.resolvedLightTint =
      bgMode.mode === "light-tint" ? averageLightColor(this.lightIds, hass.states ?? {}) : null;
    const shown = this.resolveCollapsedPicture(hass, areaId);
    this.syncCameraVideo(hass, areaId);
    const host = this.pinnedHost();
    const now = Date.now();
    const pins = this.effectivePins(areaId);
    const visible = visiblePinnedIds(
      pins,
      (id) => hass.states?.[id]?.state,
      this.pinSticky,
      areaId,
      now,
    );
    this.pinSticky = visible.sticky;
    this.armPinSticky(visible.deadline, now);
    const selected = selectPinnedCards(this.popupCards, visible.ids);
    const layout = layoutPinnedCards(selected, pins.solo);
    this.pinnedRowsVisible = layout.length > 0;
    this.applyShownPicture(hass, shown);
    const wanted = new Set<string>();
    for (const row of layout) {
      for (const item of row.cards) {
        const id = pinEntityId(item.config);
        if (id) wanted.add(id);
      }
    }
    for (const node of [...host.querySelectorAll<HTMLElement>("[data-pin-entity]")]) {
      if (!wanted.has(node.dataset.pinEntity ?? "")) node.remove();
    }

    const rowEls: HTMLElement[] = [];
    for (let index = 0; index < layout.length; index += 1) {
      let rowEl = host.children[index] as HTMLElement | undefined;
      if (!rowEl || rowEl.dataset.pinRow !== "1") {
        rowEl = document.createElement("div");
        rowEl.className = "area-card-pinned-row";
        rowEl.dataset.pinRow = "1";
        host.insertBefore(rowEl, host.children[index] ?? null);
      }
      applyPinnedRowStyle(rowEl);
      rowEls.push(rowEl);
    }

    layout.forEach((row, index) => {
      const rowEl = rowEls[index];
      row.cards.forEach((item, cardIndex) => {
        const id = pinEntityId(item.config);
        if (!id) return;
        const card = this.pinnedCard(host, id, item.config, hass);
        applyPinnedCardStyle(card, item.width);
        if (pinnedRowsSideBySide(item.config, item.width)) card.dataset.pinSplit = "1";
        else delete card.dataset.pinSplit;
        card.dataset.pinEdge = JSON.stringify({
          first: index === 0,
          last: index === layout.length - 1,
          left: cardIndex === 0,
          right: cardIndex === row.cards.length - 1,
        });
        this.watchPinnedChrome(card);
        const at = rowEl.children[cardIndex] ?? null;
        if (at !== card) rowEl.insertBefore(card, at);
      });
    });

    for (const rowEl of rowEls) {
      for (const child of [...rowEl.children]) {
        if (!(child instanceof HTMLElement) || !child.dataset.pinEntity) child.remove();
      }
    }
    while (host.childElementCount > rowEls.length) host.lastElementChild?.remove();

    if (rowEls.length === 0) {
      host.replaceChildren();
      host.style.display = "none";
      this.syncButtonGap(false);
      this.syncPicturePlacement(false);
      return;
    }
    applyPinnedHostStyle(host);
    this.syncButtonGap(true);
    this.syncPicturePlacement(true);
    this.paintBatteries(cachedBatteryMode(areaId));
  }

  private pinnedCard(
    host: HTMLElement,
    entityId: string,
    config: Record<string, unknown>,
    hass: ClassifierHass,
  ): PinnedCardElement {
    let card = this.findPinnedCard(host, entityId);
    const key = JSON.stringify(config);
    if (!card) {
      card = document.createElement("hui-card") as PinnedCardElement;
      card.dataset.pinEntity = entityId;
      card.hass = hass;
      card.config = config;
      const load = card.load?.();
      if (load && typeof (load as Promise<void>).then === "function") {
        void (load as Promise<void>).then(() => {
          if (card?.isConnected) this.clearPinnedCardChrome(card);
        });
      }
      this.pinnedConfigKey.set(card, key);
      return card;
    }
    card.hass = hass;
    if (this.pinnedConfigKey.get(card) !== key) {
      card.config = config;
      this.pinnedConfigKey.set(card, key);
    }
    return card;
  }

  private findPinnedCard(host: HTMLElement, entityId: string): PinnedCardElement | null {
    const found = host.querySelector(`[data-pin-entity="${CSS.escape(entityId)}"]`);
    return found instanceof HTMLElement ? (found as PinnedCardElement) : null;
  }

  /** ha-card shows up after hui-card finishes loading. A later state update clears again. */
  private watchPinnedChrome(card: HTMLElement): void {
    this.clearPinnedCardChrome(card);
    if ((pinnedChromeReady(card) && pinnedSplitApplied(card)) || card.dataset.pinChrome === "pending") return;
    card.dataset.pinChrome = "pending";
    const clear = (tries: number) => {
      if (!card.isConnected) return;
      this.clearPinnedCardChrome(card);
      if ((pinnedChromeReady(card) && pinnedSplitApplied(card)) || tries >= 40) {
        delete card.dataset.pinChrome;
        return;
      }
      requestAnimationFrame(() => clear(tries + 1));
    };
    requestAnimationFrame(() => clear(0));
  }

  private clusterLightTint(): RgbColor | null {
    if (!this.pinnedRowsVisible) return null;
    const areaId = this.boundAreaId();
    if (!areaId) return null;
    if (cachedAreaBackground(areaId).mode !== "light-tint") return null;
    return this.resolvedLightTint;
  }

  private clearPinnedCardChrome(card: HTMLElement): void {
    card.style.setProperty("margin", "0", "important");
    const clusterPicture = picturePlacement(this.areaPicture, this.pinnedRowsVisible) === "cluster";
    const clusterTint = this.clusterLightTint();
    if (clusterPicture || clusterTint) {
      card.style.setProperty("background", "transparent", "important");
      card.style.setProperty("box-shadow", "none", "important");
      card.style.setProperty("backdrop-filter", "none", "important");
      card.style.setProperty("-webkit-backdrop-filter", "none", "important");
      card.style.setProperty("filter", "none", "important");
      card.style.setProperty("--ha-card-backdrop-filter", "none", "important");
    } else {
      card.style.removeProperty("background");
      card.style.removeProperty("box-shadow");
      card.style.removeProperty("backdrop-filter");
      card.style.removeProperty("-webkit-backdrop-filter");
      card.style.removeProperty("filter");
      card.style.removeProperty("--ha-card-backdrop-filter");
    }
    let edge: PinnedEdge = { first: true, last: true, left: true, right: true };
    try {
      const parsed: unknown = JSON.parse(card.dataset.pinEdge ?? "");
      if (parsed && typeof parsed === "object") edge = { ...edge, ...(parsed as PinnedEdge) };
    } catch {
      // A card created before its row position is known stays fully square on top.
    }
    const radius = pinnedEdgeRadius(edge);
    for (const host of pinnedInnerHosts(card)) {
      host.style.setProperty("margin", "0", "important");
      host.style.setProperty("display", "block", "important");
      host.style.setProperty("width", "100%", "important");
      const root = host.shadowRoot;
      if (!root) continue;
      // Mushroom rewrites ha-card's inline style on each update, which drops a
      // radius set on the element. A stylesheet in the shadow root keeps winning.
      let style = root.querySelector("#area-card-pin-flat");
      if (!(style instanceof HTMLStyleElement)) {
        style = document.createElement("style");
        style.id = "area-card-pin-flat";
        root.append(style);
      }
      const radiusText = `:host{margin:0 !important;display:block !important;width:100% !important}ha-card{margin:0 !important;${radius}}`;
      const text = clusterPicture
        ? `${radiusText}\n${pinnedPictureSurfaceStyles()}`
        : clusterTint
          ? `${radiusText}\nha-card{background:transparent !important;background-color:transparent !important;border:none !important;box-shadow:none !important;--ha-card-background:transparent;--card-background-color:transparent;--ha-card-background-color:transparent;}`
          : radiusText;
      if (style.textContent !== text) style.textContent = text;
    }
    applyPinnedSideBySide(card);
  }

  /** One timer for the soonest while-on grace. Cleared on every rearm and on disconnect. */
  private armPinSticky(deadline: number | undefined, now: number): void {
    window.clearTimeout(this.pinStickyTimer);
    this.pinStickyTimer = 0;
    if (deadline === undefined) return;
    this.pinStickyTimer = window.setTimeout(() => {
      const hass = this._hass;
      const areaId = this.boundAreaId();
      if (!this.isConnected || !hass || !areaId) return;
      this.syncPinnedRow(hass, areaId);
    }, Math.max(0, deadline - now));
  }

  /**
   * Still under the collapsed card, and the fallback when the camera video is
   * missing or fails. The popup is built with the area picture.
   * The first camera in area order wins. No still, or a still that fails to
   * load, leaves the area picture in place.
   */
  private resolveCollapsedPicture(hass: ClassifierHass, areaId: string): string | null {
    const bgMode = cachedAreaBackground(areaId);
    if (bgMode.mode === "light-tint") {
      this.heldCamera = null;
      return null;
    }
    const area = this.areaPhoto && this.areaPhoto.length > 0 ? this.areaPhoto : null;
    if (bgMode.mode === "area-picture") {
      this.heldCamera = null;
      return area;
    }
    const chosen = backgroundCameraId(bgMode, this.cameraOrder);
    const candidate = collapsedPictureForMode(bgMode, area, this.cameraOrder, (id) => {
      const raw = cameraEntityPicture(hass.states?.[id]);
      if (!raw) return null;
      return typeof hass.hassUrl === "function" ? hass.hassUrl(raw) : raw;
    });
    const cameraUrl = candidate && candidate !== area ? candidate : null;
    if (!cameraUrl || !chosen) {
      this.heldCamera = null;
      return area;
    }
    if (!this.cameraLoads.has(cameraUrl)) this.probeCamera(cameraUrl, areaId);
    const load = this.cameraLoads.get(cameraUrl);
    const held = this.heldCamera?.entityId === chosen ? this.heldCamera.url : null;
    const shown = pictureAfterCameraLoad(area, cameraUrl, load, held);
    if (load === "loaded") this.heldCamera = { entityId: chosen, url: cameraUrl };
    else if (load === "failed") this.heldCamera = null;
    return pictureAfterAutoplayFailure(area, this.autoplayFailed, shown);
  }

  private probeCamera(url: string, areaId: string): void {
    this.cameraLoads.set(url, "pending");
    const image = new Image();
    const finish = (status: "loaded" | "failed") => {
      this.cameraLoads.set(url, status);
      queueMicrotask(() => {
        if (!this.isConnected || this.boundAreaId() !== areaId) return;
        const hass = this._hass;
        if (!hass) return;
        const shown = this.resolveCollapsedPicture(hass, areaId);
        const previous = this.areaPicture;
        this.applyShownPicture(hass, shown);
        if (shown !== previous) this.syncPicturePlacement(this.pinnedRowsVisible);
      });
    };
    image.onload = () => finish("loaded");
    image.onerror = () => finish("failed");
    image.src = url;
  }

  /** Rebuilds the collapsed button when its photo or light tint changes. The popup config is left alone. */
  private applyShownPicture(hass: ClassifierHass, shown: string | null): void {
    this.areaPicture = shown;
    if (!this.buttonInput || !this.buttonEl) return;
    const nextTint = shown || this.pinnedRowsVisible ? null : this.resolvedLightTint;
    this.buttonInput = { ...this.buttonInput, picture: shown, lightTint: nextTint };
    const buttonConfig = buildButtonConfig(this.buttonInput);
    const buttonKey = JSON.stringify(buttonConfig);
    if (this.buttonKey === buttonKey) return;
    this.buttonEl.setConfig?.(buttonConfig);
    this.buttonKey = buttonKey;
    this.buttonEl.hass = hass;
  }

  private cameraVideoCovers(): boolean {
    const phase = this.streamState?.phase;
    return phase === "pending" || phase === "playing";
  }

  /** Start the chosen camera's muted HLS video, or leave the still in place. */
  private syncCameraVideo(hass: ClassifierHass, areaId: string): void {
    const chosen = backgroundCameraId(cachedAreaBackground(areaId), this.cameraOrder);
    if (!chosen || !cameraSupportsStream(hass.states?.[chosen])) {
      this.stopCameraVideo();
      return;
    }
    if (this.streamState?.entityId === chosen) return;
    this.startCameraVideo(hass, areaId, chosen);
  }

  private stopCameraVideo(): void {
    if (!this.streamState && !this.videoPlayer && !this.streamTimer && !this.resumeTimer) return;
    this.streamGeneration += 1;
    this.clearStreamTimers();
    this.autoplayFailed = false;
    this.streamState = null;
    this.videoPlayer?.remove();
    this.videoPlayer = undefined;
    this.querySelector(".area-card-camera-video")?.remove();
  }

  private clearStreamTimers(): void {
    window.clearTimeout(this.streamTimer);
    window.clearTimeout(this.resumeTimer);
    this.streamTimer = 0;
    this.resumeTimer = 0;
  }

  private startCameraVideo(hass: ClassifierHass, areaId: string, entityId: string): void {
    const generation = ++this.streamGeneration;
    this.clearStreamTimers();
    this.autoplayFailed = false;
    this.videoPlayer?.remove();
    this.videoPlayer = undefined;
    this.streamState = { entityId, phase: "pending" };
    void this.openCameraVideo(hass, areaId, entityId, generation);
  }

  private failCameraVideo(entityId: string, generation: number): void {
    if (generation !== this.streamGeneration) return;
    this.clearStreamTimers();
    this.videoPlayer?.remove();
    this.videoPlayer = undefined;
    this.streamState = { entityId, phase: "failed" };
    const hass = this._hass;
    const areaId = this.boundAreaId();
    if (hass && areaId) this.applyShownPicture(hass, this.resolveCollapsedPicture(hass, areaId));
    this.syncPicturePlacement(this.pinnedRowsVisible);
  }

  /**
   * Play the HLS playlist Home Assistant already serves. The player is muted
   * and started with play() once its video element is connected. If that start
   * is refused, the area picture stays and the player is removed.
   */
  private async openCameraVideo(
    hass: ClassifierHass,
    areaId: string,
    entityId: string,
    generation: number,
  ): Promise<void> {
    const current = () =>
      generation === this.streamGeneration && this.isConnected && this.boundAreaId() === areaId;
    try {
      if (typeof hass.callWS !== "function") {
        this.failCameraVideo(entityId, generation);
        return;
      }
      installCameraStreamAuth(() => cameraAccessToken(this._hass));
      const call = hass.callWS as (message: Record<string, unknown>) => Promise<unknown>;
      const result = await call({ type: "camera/stream", entity_id: entityId, format: "hls" });
      if (!current()) return;
      const path = cameraStreamPath(result);
      if (!path) {
        this.failCameraVideo(entityId, generation);
        return;
      }
      const absolute = absoluteStreamUrl(path, (value) =>
        typeof hass.hassUrl === "function" ? hass.hassUrl(value) : value,
      );
      const ready = await ensureCameraStreamPlayer();
      if (!current()) return;
      if (!ready) {
        this.failCameraVideo(entityId, generation);
        return;
      }
      const player = createCameraStreamPlayer(entityId);
      this.videoPlayer = player;
      this.streamTimer = window.setTimeout(() => {
        if (generation !== this.streamGeneration || this.streamState?.phase === "playing") return;
        this.autoplayFailed = true;
        this.failCameraVideo(entityId, generation);
      }, 12_000);
      this.syncPicturePlacement(this.pinnedRowsVisible);
      player.url = absolute;
      this.armCameraPlayback(player, entityId, generation);
    } catch {
      this.failCameraVideo(entityId, generation);
    }
  }

  /** Mute, hide the start control, and call play() until the stream is actually running. */
  private armCameraPlayback(player: CameraStreamPlayer, entityId: string, generation: number): void {
    let starting = false;
    const markPlaying = () => {
      if (generation !== this.streamGeneration || this.streamState?.phase === "failed") return;
      window.clearTimeout(this.streamTimer);
      this.streamTimer = 0;
      if (this.streamState?.phase === "playing") return;
      this.streamState = { entityId, phase: "playing" };
      this.syncPicturePlacement(this.pinnedRowsVisible);
    };
    const tick = () => {
      if (generation !== this.streamGeneration || this.streamState?.phase === "failed") return;
      hideCameraPlaybackControls(player);
      const video = primeCameraVideo(player);
      if (cameraFrameReady(video)) {
        markPlaying();
        this.resumeTimer = window.setTimeout(tick, 1000);
        return;
      }
      if (this.streamState?.phase === "playing") {
        this.streamState = { entityId, phase: "pending" };
        this.syncPicturePlacement(this.pinnedRowsVisible);
      }
      if (video && !starting) {
        starting = true;
        const attempt = video.play();
        if (attempt && typeof attempt.then === "function") {
          void attempt.then(
            () => {
              starting = false;
              if (cameraFrameReady(video)) markPlaying();
            },
            (error: unknown) => {
              starting = false;
              if (generation !== this.streamGeneration || !autoplayRejected(error)) return;
              this.autoplayFailed = true;
              this.failCameraVideo(entityId, generation);
            },
          );
        } else starting = false;
      }
      this.resumeTimer = window.setTimeout(tick, 200);
    };
    window.clearTimeout(this.resumeTimer);
    tick();
  }

  /** Video layer under the button and pinned rows. Hidden until a frame is playing. */
  private mountCameraVideo(cluster: HTMLElement): void {
    const player = this.videoPlayer;
    const covers = this.cameraVideoCovers();
    const found = cluster.querySelector(":scope > .area-card-camera-video");
    if (!covers || !player) {
      if (found instanceof HTMLElement) found.remove();
      this.raiseCollapsedContent(false);
      return;
    }
    const layer = found instanceof HTMLElement ? found : this.createCameraVideoLayer();
    if (layer.parentElement !== cluster) cluster.prepend(layer);
    const scrim = layer.querySelector(".area-card-camera-scrim");
    if (scrim instanceof HTMLElement) scrim.style.backgroundImage = cameraVideoScrim(this.pinnedRowsVisible);
    if (player.parentElement !== layer) {
      if (scrim) layer.insertBefore(player, scrim);
      else layer.append(player);
    }
    layer.style.opacity = this.streamState?.phase === "playing" ? "1" : "0";
    this.raiseCollapsedContent(true);
  }

  private createCameraVideoLayer(): HTMLElement {
    const layer = document.createElement("div");
    layer.className = "area-card-camera-video";
    layer.setAttribute("aria-hidden", "true");
    layer.style.position = "absolute";
    layer.style.inset = "0";
    layer.style.zIndex = "0";
    layer.style.pointerEvents = "none";
    layer.style.overflow = "hidden";
    layer.style.borderRadius = CLUSTER_PICTURE_RADIUS;
    const scrim = document.createElement("div");
    scrim.className = "area-card-camera-scrim";
    scrim.style.position = "absolute";
    scrim.style.inset = "0";
    layer.append(scrim);
    return layer;
  }

  private raiseCollapsedContent(above: boolean): void {
    for (const el of [this.buttonEl, this.pinnedEl]) {
      if (!el) continue;
      if (above) {
        el.style.position = "relative";
        el.style.zIndex = "1";
      } else {
        el.style.removeProperty("position");
        el.style.removeProperty("z-index");
      }
    }
  }

  /**
   * One photo behind the area button and the pinned rows while any pinned row
   * is showing. A camera video uses that same cluster, with the still underneath
   * until a frame is playing. With neither, the button keeps its picture.
   */
  private syncPicturePlacement(pinnedRowsVisible: boolean): void {
    this.pinnedRowsVisible = pinnedRowsVisible;
    const videoCovers = this.cameraVideoCovers();
    const videoPlaying = this.streamState?.phase === "playing";
    const placement = picturePlacement(this.areaPicture, pinnedRowsVisible);
    syncCardThemeFallback(
      this,
      this._rawHass,
      pinnedRowsVisible && (placement === "cluster" || videoCovers),
    );
    const clusterTint = pinnedRowsVisible ? this.clusterLightTint() : null;
    const cluster = this.ensurePictureCluster();
    if (cluster && cluster !== this) {
      this.applyClusterLayout(cluster);
      const underVideo = clusterPictureWhileVideo(
        videoPlaying,
        placement === "cluster" || videoCovers ? this.areaPicture : null,
      );
      if (underVideo) {
        cluster.style.removeProperty("background");
        const props = clusterPictureProperties(underVideo);
        cluster.style.setProperty("background-image", props["background-image"]);
        cluster.style.setProperty("background-size", props["background-size"]);
        cluster.style.setProperty("background-position", props["background-position"]);
        cluster.style.setProperty("border-radius", props["border-radius"]);
        cluster.style.setProperty("--ha-card-backdrop-filter", props["--ha-card-backdrop-filter"]);
      } else if (clusterTint) {
        cluster.style.removeProperty("background-image");
        cluster.style.removeProperty("background-size");
        cluster.style.removeProperty("background-position");
        cluster.style.removeProperty("--ha-card-backdrop-filter");
        const decl = lightTintBackgroundStyles(clusterTint, "cluster").trim();
        const match = /^background:\s*(.+?)\s*!important;?$/i.exec(decl);
        if (match) cluster.style.setProperty("background", match[1], "important");
        cluster.style.setProperty("border-radius", CLUSTER_PICTURE_RADIUS);
      } else {
        cluster.style.removeProperty("background");
        cluster.style.removeProperty("background-image");
        cluster.style.removeProperty("background-size");
        cluster.style.removeProperty("background-position");
        cluster.style.removeProperty("border-radius");
        cluster.style.removeProperty("--ha-card-backdrop-filter");
      }
      this.mountCameraVideo(cluster);
    }
    this.syncButtonPictureSuppress(placement === "cluster" || videoCovers || Boolean(clusterTint));
    const host = this.pinnedEl;
    if (!host) return;
    for (const card of host.querySelectorAll<HTMLElement>("[data-pin-entity]")) {
      this.clearPinnedCardChrome(card);
    }
  }

  /** Button and pinned host only. The popup stays a sibling after this wrapper. */
  private ensurePictureCluster(): HTMLElement | null {
    const button = this.buttonEl;
    const pinned = this.pinnedEl;
    if (!button || !pinned) return null;
    const popup = this.popupEl;
    const current = button.parentElement;
    const content = current
      ? [...current.children].filter(
          (node) => !(node instanceof HTMLElement && node.classList.contains("area-card-camera-video")),
        )
      : [];
    if (
      current &&
      current !== this &&
      pinned.parentElement === current &&
      !(popup && current.contains(popup)) &&
      content.length === 2 &&
      content[0] === button &&
      content[1] === pinned
    ) {
      return current;
    }
    let cluster: HTMLElement | null = null;
    for (const node of this.children) {
      if (!(node instanceof HTMLElement) || !node.classList.contains("area-card-cluster")) continue;
      if (popup && node.contains(popup)) continue;
      cluster = node;
      break;
    }
    if (!cluster) {
      cluster = document.createElement("div");
      cluster.className = "area-card-cluster";
    }
    if (!cluster.contains(button)) {
      if (button.parentElement) button.before(cluster);
      else if (popup?.parentElement === this) popup.before(cluster);
      else this.append(cluster);
    }
    cluster.append(button, pinned);
    if (popup && cluster.contains(popup)) cluster.after(popup);
    else if (popup?.parentElement === this && cluster.nextElementSibling !== popup) cluster.after(popup);
    for (const extra of [...this.children]) {
      if (extra !== cluster && extra instanceof HTMLElement && extra.classList.contains("area-card-cluster")) {
        if (extra.childElementCount === 0) extra.remove();
      }
    }
    return cluster;
  }

  private applyClusterLayout(cluster: HTMLElement): void {
    cluster.style.display = "flex";
    cluster.style.flexDirection = "column";
    cluster.style.margin = "0";
    cluster.style.padding = "0";
    cluster.style.gap = "0";
    cluster.style.position = "relative";
    // The photo's own background clips to the cluster radius. overflow:hidden
    // here would also clip a tall pinned card (a light slider, a media player).
    cluster.style.removeProperty("overflow");
  }

  private syncButtonPictureSuppress(suppress: boolean): void {
    const button = this.buttonEl;
    if (!button) return;
    const apply = (): boolean => {
      if (this.buttonEl !== button || !button.isConnected) return true;
      const root = button.shadowRoot;
      if (!root) return !suppress;
      const existing = root.querySelector("#area-card-picture-suppress");
      if (!suppress) {
        existing?.remove();
        return true;
      }
      let style = existing;
      if (!(style instanceof HTMLStyleElement)) {
        style = document.createElement("style");
        style.id = "area-card-picture-suppress";
        root.append(style);
      }
      const text = buttonPictureSuppressStyles();
      if (style.textContent !== text) style.textContent = text;
      return true;
    };
    if (apply()) return;
    let tries = 0;
    const tick = () => {
      if (
        picturePlacement(this.areaPicture, this.pinnedRowsVisible) !== "cluster" &&
        !this.cameraVideoCovers() &&
        !this.clusterLightTint()
      ) {
        button.shadowRoot?.querySelector("#area-card-picture-suppress")?.remove();
        return;
      }
      if (apply() || tries++ >= 40) return;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  /** The area button's bottom margin would split it from the first pinned row. */
  private syncButtonGap(pinned: boolean): void {
    const button = this.buttonEl;
    if (!button) return;
    const apply = () => {
      const ha = button.shadowRoot?.querySelector("ha-card");
      const bubble = button.shadowRoot?.querySelector(".bubble-container");
      const background = button.shadowRoot?.querySelector(".bubble-background");
      if (!pinned) {
        button.style.removeProperty("margin-bottom");
        for (const el of [ha, bubble, background]) {
          if (!(el instanceof HTMLElement)) continue;
          el.style.removeProperty("margin-bottom");
          el.style.removeProperty("border-bottom-left-radius");
          el.style.removeProperty("border-bottom-right-radius");
        }
        return true;
      }
      button.style.setProperty("margin-bottom", "0", "important");
      if (ha instanceof HTMLElement) {
        ha.style.setProperty("margin-bottom", "0", "important");
        ha.style.setProperty("border-bottom-left-radius", "0", "important");
        ha.style.setProperty("border-bottom-right-radius", "0", "important");
      }
      // Square the seam against the pinned rows. The cluster photo supplies the
      // outer corners, so a second radius here would curve the middle.
      for (const el of [bubble, background]) {
        if (!(el instanceof HTMLElement)) continue;
        el.style.setProperty("border-bottom-left-radius", "0", "important");
        el.style.setProperty("border-bottom-right-radius", "0", "important");
      }
      return ha instanceof HTMLElement && bubble instanceof HTMLElement && background instanceof HTMLElement;
    };
    if (apply()) return;
    let tries = 0;
    const tick = () => {
      if (apply() || tries++ >= 40) return;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  private batteryButton(): HTMLButtonElement {
    return createBatteryButton((mode) => this.chooseBatteryMode(mode));
  }

  private chooseBatteryMode(mode: BatteryMode): void {
    const hass = this._hass;
    const areaId = this.boundAreaId();
    if (!hass || !areaId) return;
    const shown = this.batteryWanted ?? cachedBatteryMode(areaId);
    if (shown === mode) {
      this.paintBatteries(mode);
      return;
    }
    this.batteryWanted = mode;
    this.paintBatteries(mode);
    void saveBatteryMode(hass, areaId, mode).then(
      () => {
        if (this._hass !== hass || this.boundAreaId() !== areaId) return;
        if (this.batteryWanted === mode) this.batteryWanted = null;
        this.paintBatteries(cachedBatteryMode(areaId));
      },
      () => {
        if (this._hass !== hass || this.boundAreaId() !== areaId) return;
        if (this.batteryWanted === mode) this.batteryWanted = null;
        this.paintBatteries(cachedBatteryMode(areaId));
      },
    );
  }

  private paintBatteries(mode: BatteryMode): void {
    const hass = this._hass;
    if (!hass) return;
    const root = this.popupEl?.shadowRoot;
    if (root) {
      if (this.batteryEl?.isConnected) syncBatteryButton(this.batteryEl, mode);
      syncBatteryReadouts(root, hass, mode);
    }
    if (this.pinnedEl) syncBatteryReadouts(this.pinnedEl, hass, mode, this);
  }

  private areaEditButton(areaId: string): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "bubble-header-action-button area-card-edit-area";
    button.style.padding = "0";
    button.style.border = "none";
    const icon = document.createElement("ha-icon");
    icon.setAttribute("icon", "mdi:cog");
    icon.setAttribute("aria-hidden", "true");
    icon.style.setProperty("--mdc-icon-size", "24px");
    button.append(icon);
    button.addEventListener("pointerdown", (event) => event.stopPropagation());
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const from = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      window.history.pushState({ from }, "", areaSettingsPath(areaId));
      window.dispatchEvent(
        new CustomEvent("location-changed", {
          bubbles: true,
          composed: true,
          detail: { replace: false },
        }),
      );
    });
    syncAreaEditButton(button);
    return button;
  }

  private showError(message: string): void {
    let error = this.querySelector("[data-area-card-error]");
    if (!error) {
      error = document.createElement("div");
      error.setAttribute("data-area-card-error", "");
      this.append(error);
    }
    error.textContent = message;
  }
}

if (!customElements.get("area-card")) {
  customElements.define("area-card", AreaCard);
}

type CustomCard = {
  type: string;
  name: string;
  description: string;
  preview: boolean;
  documentationURL: string;
};

const registry = window as Window & { customCards?: CustomCard[] };
registry.customCards = registry.customCards || [];
if (!registry.customCards.some((card) => card.type === "area-card")) {
  registry.customCards.push({
    type: "area-card",
    name: "Area Card",
    description: "Area summary button and popup",
    preview: true,
    documentationURL: "https://github.com/Helpmeeters/area-card",
  });
}
