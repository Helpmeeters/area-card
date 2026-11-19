import { CAMERA_ROW_TAG, computeCameraDetectionBadges } from "./camera-detections";
import { hideAreaDotTooltip, showAreaDotTooltip } from "./dot-tooltip";
import {
  countUnreviewedFrigateItems,
  ensureFrigateEvents,
  frigateReviewQueueUrl,
  getCachedFrigateEvents,
  getCachedFrigateReviews,
  getFrigateCameraRef,
  selectCameraPersonIdentities,
  subscribeFrigateEvents,
} from "./frigate-identity";
import type { CameraDetection, ClassifierHass } from "./sections";

interface CameraRowConfig {
  card?: Record<string, unknown>;
  detections?: CameraDetection;
}

interface HuiCardElement extends HTMLElement {
  hass?: ClassifierHass;
  config?: Record<string, unknown>;
  load?: () => Promise<unknown> | void;
  getCardSize?: () => number;
  getGridOptions?: () => { columns?: number; rows?: number | string };
}

class AreaCardCameraRow extends HTMLElement {
  private config?: CameraRowConfig;
  private _hass?: ClassifierHass;
  private cardEl?: HuiCardElement;
  private overlayEl?: HTMLDivElement;
  private reviewOverlayEl?: HTMLDivElement;
  private cardConfigKey?: string;
  private unsubscribeFrigate?: () => void;
  private frigateInstanceId?: string;

  createRenderRoot(): HTMLElement {
    return this;
  }

  getCardSize(): number {
    return this.cardEl?.getCardSize?.() ?? 3;
  }

  getGridOptions(): { columns?: number; rows?: number | string } {
    return this.cardEl?.getGridOptions?.() ?? { columns: 12 };
  }

  setConfig(config: CameraRowConfig): void {
    this.config = config;
    this.mount();
  }

  set hass(value: ClassifierHass) {
    this._hass = value;
    if (this.cardEl) this.cardEl.hass = value;
    this.paintOverlay();
  }

  get hass(): ClassifierHass | undefined {
    return this._hass;
  }

  connectedCallback(): void {
    this.style.display = "block";
    this.style.position = "relative";
    this.mount();
  }

  disconnectedCallback(): void {
    this.unsubscribeFrigate?.();
    this.unsubscribeFrigate = undefined;
    this.frigateInstanceId = undefined;
  }

  private mount(): void {
    const card = this.config?.card;
    if (!card || typeof card !== "object") return;
    const key = JSON.stringify(card);
    if (!this.cardEl) {
      this.cardEl = document.createElement("hui-card") as HuiCardElement;
      this.cardEl.style.display = "block";
      this.insertBefore(this.cardEl, this.overlayEl ?? null);
    }
    if (this._hass) this.cardEl.hass = this._hass;
    if (this.cardConfigKey !== key) {
      this.cardEl.config = card;
      this.cardConfigKey = key;
      this.cardEl.load?.();
    }
    this.paintOverlay();
  }

  private paintOverlay(): void {
    const detections = this.config?.detections;
    if (!detections) {
      this.overlayEl?.remove();
      this.overlayEl = undefined;
      this.reviewOverlayEl?.remove();
      this.reviewOverlayEl = undefined;
      return;
    }
    const overlay = this.ensureOverlay();
    const states = this._hass?.states ?? {};
    const cameraEntityId = typeof this.config?.card?.entity === "string" ? this.config.card.entity : "";
    const frigateRef = cameraEntityId ? getFrigateCameraRef(cameraEntityId, states) : null;
    if (frigateRef) {
      if (this.frigateInstanceId !== frigateRef.instanceId) {
        this.unsubscribeFrigate?.();
        this.frigateInstanceId = frigateRef.instanceId;
        this.unsubscribeFrigate = subscribeFrigateEvents([frigateRef.instanceId], () => {
          this.paintOverlay();
        });
      }
      const personCls = detections.classes.find((c) => c.name === "person");
      const occState = personCls?.occupancyEntityId ? states[personCls.occupancyEntityId] : undefined;
      const countState = personCls?.countEntityId ? states[personCls.countEntityId] : undefined;
      const triggerKey = `${frigateRef.cameraName}:${occState?.state ?? ""}:${countState?.state ?? ""}`;
      ensureFrigateEvents(this._hass, [frigateRef], triggerKey);
    } else if (this.unsubscribeFrigate) {
      this.unsubscribeFrigate();
      this.unsubscribeFrigate = undefined;
      this.frigateInstanceId = undefined;
    }

    const personCls = detections.classes.find((c) => c.name === "person");
    const personOccState = personCls?.occupancyEntityId ? states[personCls.occupancyEntityId] : undefined;
    const occChangedRaw =
      (personOccState as { last_changed?: string } | undefined)?.last_changed ?? personOccState?.last_updated;
    const occChangedMs = typeof occChangedRaw === "string" ? Date.parse(occChangedRaw) : NaN;
    const personNames = frigateRef
      ? selectCameraPersonIdentities(getCachedFrigateEvents(frigateRef.instanceId), frigateRef.cameraName, {
          occupancyLastChangedMs: Number.isFinite(occChangedMs) ? occChangedMs : null,
        })
      : [];
    const unreviewedCount = frigateRef
      ? countUnreviewedFrigateItems(getCachedFrigateReviews(frigateRef.instanceId), frigateRef.cameraName)
      : 0;

    const badges = computeCameraDetectionBadges(detections, states, { personNames, unreviewedCount });

    const totalEl = document.createElement("span");
    totalEl.className = "area-card-camera-badge area-card-camera-total";
    totalEl.dataset.active = badges.active ? "true" : "false";
    totalEl.textContent = badges.totalText;
    Object.assign(totalEl.style, badgeBaseStyle(badges.active), {
      width: "26px",
      padding: "0",
    });
    this.bindBadgeInteractions(totalEl, `Detections: ${badges.total}`);

    const nodes: HTMLElement[] = [totalEl];
    for (const cls of badges.classes) {
      const el = document.createElement("span");
      el.className = "area-card-camera-badge area-card-camera-class";
      el.dataset.class = cls.name;
      Object.assign(
        el.style,
        badgeBaseStyle(true),
        cls.countText ? { padding: "0 7px" } : { width: "26px", padding: "0" },
      );

      const icon = document.createElement("ha-icon");
      icon.setAttribute("icon", cls.icon);
      icon.setAttribute("aria-hidden", "true");
      icon.style.setProperty("--mdc-icon-size", "16px");
      icon.style.display = "flex";
      el.append(icon);

      if (cls.countText) {
        const countSpan = document.createElement("span");
        countSpan.textContent = cls.countText;
        el.append(countSpan);
      }
      if (cls.hasIdentity) {
        el.dataset.hasIdentity = "true";
        el.style.position = "relative";
        const dot = document.createElement("span");
        dot.className = "area-card-camera-identity-dot";
        dot.setAttribute("aria-hidden", "true");
        Object.assign(dot.style, {
          position: "absolute",
          top: "-2px",
          right: "-2px",
          width: "7px",
          height: "7px",
          borderRadius: "999px",
          background: "#4ade80",
          boxShadow: "0 0 0 1.5px rgba(0, 0, 0, 0.7)",
          pointerEvents: "none",
        });
        el.append(dot);
      }
      this.bindBadgeInteractions(el, cls.title);
      nodes.push(el);
    }

    overlay.replaceChildren(...nodes);

    if (badges.reviewStatus) {
      const reviewOverlay = this.ensureReviewOverlay();
      const rev = badges.reviewStatus;
      const el = document.createElement("span");
      el.className = "area-card-camera-badge area-card-camera-review";
      el.dataset.active = rev.active ? "true" : "false";
      Object.assign(
        el.style,
        badgeBaseStyle(rev.active),
        rev.text ? { padding: "0 8px" } : { width: "26px", padding: "0" },
      );

      const icon = document.createElement("ha-icon");
      icon.setAttribute("icon", rev.icon);
      icon.setAttribute("aria-hidden", "true");
      icon.style.setProperty("--mdc-icon-size", "16px");
      icon.style.display = "flex";
      el.append(icon);

      if (rev.text) {
        const textSpan = document.createElement("span");
        textSpan.textContent = rev.text;
        el.append(textSpan);
      }
      this.bindBadgeInteractions(el, rev.title, frigateRef ? () => {
        window.open(frigateReviewQueueUrl(), "_blank", "noopener");
      } : undefined);
      reviewOverlay.replaceChildren(el);
    } else {
      this.reviewOverlayEl?.remove();
      this.reviewOverlayEl = undefined;
    }
  }

  private bindBadgeInteractions(badge: HTMLElement, tip: string, onClick?: () => void): void {
    badge.setAttribute("aria-label", tip);
    badge.addEventListener("pointerenter", () => showAreaDotTooltip(badge, tip));
    badge.addEventListener("pointerleave", hideAreaDotTooltip);
    badge.addEventListener("pointerdown", hideAreaDotTooltip);
    badge.addEventListener("click", (event) => {
      hideAreaDotTooltip();
      if (onClick) {
        event.stopPropagation();
        onClick();
        return;
      }
      const entityId = this.config?.card?.entity;
      if (typeof entityId !== "string" || !entityId) return;
      event.stopPropagation();
      this.dispatchEvent(
        new CustomEvent("hass-more-info", {
          bubbles: true,
          composed: true,
          detail: { entityId },
        }),
      );
    });
  }

  private ensureOverlay(): HTMLDivElement {
    if (this.overlayEl && this.overlayEl.parentElement === this) return this.overlayEl;
    const overlay = document.createElement("div");
    overlay.className = "area-card-camera-overlay";
    overlay.setAttribute("aria-hidden", "true");
    Object.assign(overlay.style, {
      position: "absolute",
      top: "10px",
      left: "14px",
      zIndex: "2",
      display: "flex",
      alignItems: "center",
      gap: "6px",
      pointerEvents: "none",
    });
    this.overlayEl = overlay;
    this.append(overlay);
    return overlay;
  }

  private ensureReviewOverlay(): HTMLDivElement {
    if (this.reviewOverlayEl && this.reviewOverlayEl.parentElement === this) return this.reviewOverlayEl;
    const overlay = document.createElement("div");
    overlay.className = "area-card-camera-review-overlay";
    overlay.setAttribute("aria-hidden", "true");
    Object.assign(overlay.style, {
      position: "absolute",
      top: "10px",
      right: "14px",
      zIndex: "2",
      display: "flex",
      alignItems: "center",
      pointerEvents: "none",
    });
    this.reviewOverlayEl = overlay;
    this.append(overlay);
    return overlay;
  }
}

function badgeBaseStyle(active: boolean): Partial<CSSStyleDeclaration> {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "3px",
    height: "26px",
    minWidth: "26px",
    borderRadius: "999px",
    boxSizing: "border-box",
    background: active ? "rgba(33, 150, 243, 0.85)" : "rgba(0, 0, 0, 0.6)",
    color: "#ffffff",
    border: active ? "1px solid rgba(255, 255, 255, 0.45)" : "1px solid rgba(255, 255, 255, 0.22)",
    backdropFilter: "blur(6px)",
    boxShadow: "0 1px 4px rgba(0, 0, 0, 0.35)",
    fontSize: "12px",
    fontWeight: "600",
    lineHeight: "1",
    pointerEvents: "auto",
    cursor: "pointer",
  };
}

if (!customElements.get(CAMERA_ROW_TAG)) {
  customElements.define(CAMERA_ROW_TAG, AreaCardCameraRow);
}
