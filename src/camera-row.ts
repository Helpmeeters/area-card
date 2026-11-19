import { computeCameraDetectionBadges } from "./camera-detections";
import { hideAreaDotTooltip, showAreaDotTooltip } from "./dot-tooltip";
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
    const badges = computeCameraDetectionBadges(detections, this._hass?.states ?? {});

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
      this.bindBadgeInteractions(el, rev.title);
      reviewOverlay.replaceChildren(el);
    } else {
      this.reviewOverlayEl?.remove();
      this.reviewOverlayEl = undefined;
    }
  }

  private bindBadgeInteractions(badge: HTMLElement, tip: string): void {
    badge.setAttribute("aria-label", tip);
    badge.addEventListener("pointerenter", () => showAreaDotTooltip(badge, tip));
    badge.addEventListener("pointerleave", hideAreaDotTooltip);
    badge.addEventListener("pointerdown", hideAreaDotTooltip);
    badge.addEventListener("click", (event) => {
      hideAreaDotTooltip();
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

if (!customElements.get("area-card-camera-row")) {
  customElements.define("area-card-camera-row", AreaCardCameraRow);
}
