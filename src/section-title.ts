interface SectionTitleConfig {
  title?: string;
  icon?: string;
  color?: string;
  variant?: "section" | "group";
  section?: string;
}

/** Popup section heading: the section icon, then the title in Mushroom's title type. */
class AreaCardSectionTitle extends HTMLElement {
  private config?: SectionTitleConfig;

  createRenderRoot(): HTMLElement {
    return this;
  }

  getCardSize(): number {
    return 1;
  }

  getGridOptions(): { columns: number } {
    return { columns: 12 };
  }

  setConfig(config: SectionTitleConfig): void {
    this.config = config;
    if (config.section) this.dataset.section = config.section;
    else delete this.dataset.section;
    this.render();
  }

  connectedCallback(): void {
    this.style.display = "block";
    this.style.background = "none";
    this.render();
  }

  private render(): void {
    const config = this.config;
    if (!config) return;
    if (config.section) this.dataset.section = config.section;
    else delete this.dataset.section;
    const isGroup = config.variant === "group";
    const row = document.createElement("div");
    row.className = "area-card-section-title-row";
    row.style.cssText = [
      "display:flex",
      "align-items:center",
      "flex-wrap:wrap",
      "gap:8px",
      isGroup ? "padding:12px 12px 4px" : "padding:var(--mush-title-padding, 24px 12px 8px)",
      "background:none",
    ].join(";");

    if (config.icon) {
      const iconEl = document.createElement("ha-icon");
      iconEl.setAttribute("icon", config.icon);
      iconEl.style.cssText = [
        `color:${config.color || "var(--primary-text-color)"}`,
        isGroup ? "--mdc-icon-size:16px" : "--mdc-icon-size:var(--mush-title-font-size, 24px)",
        "flex-shrink:0",
      ].join(";");
      row.append(iconEl);
    }

    const titleEl = document.createElement(isGroup ? "h2" : "h1");
    titleEl.textContent = config.title ?? "";
    titleEl.style.cssText = isGroup
      ? [
          "margin:0",
          "font-size:14px",
          "font-weight:500",
          "line-height:20px",
          "color:var(--secondary-text-color)",
        ].join(";")
      : [
          "margin:0",
          "font-size:var(--mush-title-font-size, 24px)",
          "font-weight:var(--mush-title-font-weight, normal)",
          "line-height:var(--mush-title-line-height, 32px)",
          "letter-spacing:var(--mush-title-letter-spacing, -0.288px)",
          "color:var(--mush-title-color, var(--primary-text-color))",
        ].join(";");
    row.append(titleEl);
    this.replaceChildren(row);
  }
}

if (!customElements.get("area-card-section-title")) {
  customElements.define("area-card-section-title", AreaCardSectionTitle);
}
