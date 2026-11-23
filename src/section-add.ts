import { navigateHomeAssistant } from "./automation-edit";
import { sectionColor, sectionIcon, type RollupId } from "./rollups";
import type { AreaSections } from "./sections";
import { BUBBLE_CARDS_GRID } from "./tags";

const STYLE_ID = "area-card-section-add-style";
const LINK_CLASS = "area-card-section-add";
const CHIP_CLASS = "area-card-section-add-chip";
const ROW_CLASS = "area-card-section-add-row";
const SECTION_TITLE_SELECTOR = "area-card-section-title, area-card-local-section-title";
const PREPOP_TIMEOUT_MS = 8_000;
const PREPOP_POLL_MS = 100;

export const CREATABLE_SECTIONS = ["scenes", "scripts", "helpers", "automations"] as const;

export type CreatableSectionId = (typeof CREATABLE_SECTIONS)[number];

const CHIP_LABEL: Record<CreatableSectionId, string> = {
  scenes: "Scene",
  scripts: "Script",
  helpers: "Helper",
  automations: "Automation",
};

export function isCreatableSection(id: string): id is CreatableSectionId {
  return (CREATABLE_SECTIONS as readonly string[]).includes(id);
}

export function sectionCreatePath(section: CreatableSectionId, areaId: string): string {
  switch (section) {
    case "automations":
      return "/config/automation/edit/new";
    case "scenes":
      return "/config/scene/edit/new";
    case "scripts":
      return "/config/script/edit/new";
    case "helpers":
      return `/config/helpers?historyBack=1&area=${encodeURIComponent(areaId)}`;
    default: {
      const exhaustive: never = section;
      return exhaustive;
    }
  }
}

export function sectionCreateLabel(section: CreatableSectionId): string {
  return `Create ${CHIP_LABEL[section].toLowerCase()}`;
}

export function sectionAddChipLabel(section: CreatableSectionId): string {
  return CHIP_LABEL[section];
}

/** Creatable sections with no entities that are not listed in hide_sections. */
export function emptyCreatableSections(
  sections: AreaSections | undefined,
  hideSections: readonly RollupId[] = [],
): CreatableSectionId[] {
  if (!sections) return [];
  const hidden = new Set(hideSections);
  return CREATABLE_SECTIONS.filter((id) => !hidden.has(id) && creatableEntityCount(sections, id) === 0);
}

function creatableEntityCount(sections: AreaSections, id: CreatableSectionId): number {
  switch (id) {
    case "scenes":
      return sections.scenes.length;
    case "scripts":
      return sections.scripts.length;
    case "helpers":
      return sections.helpers.length + sections.selects.length;
    case "automations":
      return sections.automations.length;
    default: {
      const exhaustive: never = id;
      return exhaustive;
    }
  }
}

export function sectionAddStyles(): string {
  return [
    `.${LINK_CLASS} {`,
    "  margin-left: auto;",
    "  display: inline-flex;",
    "  align-items: center;",
    "  justify-content: center;",
    "  box-sizing: border-box;",
    "  width: 32px;",
    "  height: 32px;",
    "  border-radius: 8px;",
    "  color: var(--secondary-text-color);",
    "  text-decoration: none;",
    "  flex-shrink: 0;",
    "  --mdc-icon-size: 22px;",
    "}",
    `.${LINK_CLASS}:hover,`,
    `.${LINK_CLASS}:focus-visible {`,
    "  color: var(--primary-text-color);",
    "  background: color-mix(in srgb, var(--primary-text-color) 8%, transparent);",
    "}",
    `.${ROW_CLASS} {`,
    "  display: flex;",
    "  flex-wrap: wrap;",
    "  align-items: center;",
    "  gap: 8px;",
    "  margin: 8px 12px 16px;",
    "  box-sizing: border-box;",
    "}",
    `.${CHIP_CLASS} {`,
    "  display: inline-flex;",
    "  align-items: center;",
    "  gap: 6px;",
    "  box-sizing: border-box;",
    "  padding: 6px 12px;",
    "  border-radius: 999px;",
    "  border: 1px solid color-mix(in srgb, var(--primary-text-color, #ffffff) 18%, transparent);",
    "  background: color-mix(in srgb, var(--primary-text-color, #ffffff) 6%, transparent);",
    "  color: var(--primary-text-color);",
    "  text-decoration: none;",
    "  font: inherit;",
    "  font-size: 13px;",
    "  font-weight: 500;",
    "  line-height: 18px;",
    "  white-space: nowrap;",
    "  --mdc-icon-size: 18px;",
    "}",
    `.${CHIP_CLASS}:hover,`,
    `.${CHIP_CLASS}:focus-visible {`,
    "  background: color-mix(in srgb, var(--primary-text-color, #ffffff) 12%, transparent);",
    "}",
    `.${CHIP_CLASS} ha-icon {`,
    "  color: var(--secondary-text-color);",
    "}",
  ].join("\n");
}

export interface SyncSectionAddActionsOptions {
  disabled: boolean;
  areaId: string;
  emptySections: readonly CreatableSectionId[];
}

/**
 * Floats a circled-plus create link on non-empty creatable section headings,
 * and collapses empty creatable sections into a single bottom chip row.
 */
export function syncSectionAddActions(root: ParentNode, options: SyncSectionAddActionsOptions): void {
  if (!options.disabled) ensureStyles(root);

  const emptySet = new Set(options.disabled ? [] : options.emptySections);

  for (const cell of root.querySelectorAll(`.${BUBBLE_CARDS_GRID} > .card`)) {
    const sectionId = sectionIdOfTitleCell(cell);
    if (!sectionId || !isCreatableSection(sectionId)) {
      removeHeadingLinks(cell);
      continue;
    }
    if (options.disabled || emptySet.has(sectionId)) {
      removeHeadingLinks(cell);
      continue;
    }
    const titleRow = titleRowOfCell(cell);
    if (!titleRow) {
      removeHeadingLinks(cell);
      continue;
    }
    syncHeadingLink(titleRow, sectionId, options.areaId);
  }

  syncEmptyRow(root, options);
}

function syncHeadingLink(titleRow: Element, section: CreatableSectionId, areaId: string): void {
  const path = sectionCreatePath(section, areaId);
  const label = sectionCreateLabel(section);
  const existing = [...titleRow.querySelectorAll(`:scope > .${LINK_CLASS}`)];
  let link: HTMLAnchorElement;
  if (existing[0] instanceof HTMLAnchorElement) {
    link = existing[0];
  } else {
    link = document.createElement("a");
    link.className = LINK_CLASS;
    const icon = document.createElement("ha-icon");
    icon.setAttribute("icon", "mdi:plus-circle-outline");
    icon.setAttribute("aria-hidden", "true");
    link.append(icon);
    bindCreateLink(link, section, areaId);
    titleRow.append(link);
  }
  for (const extra of existing) {
    if (extra !== link) extra.remove();
  }
  if (link.getAttribute("href") !== path) link.setAttribute("href", path);
  if (link.getAttribute("aria-label") !== label) link.setAttribute("aria-label", label);
  if (link.getAttribute("title") !== label) link.setAttribute("title", label);
  if (link.dataset.section !== section) link.dataset.section = section;
}

function syncEmptyRow(root: ParentNode, options: SyncSectionAddActionsOptions): void {
  const host = root as ParentNode & {
    querySelector?: (selector: string) => Element | null;
  };
  if (typeof host.querySelector !== "function") return;

  const grid = host.querySelector(`.${BUBBLE_CARDS_GRID}`);
  if (!grid || !(grid instanceof HTMLElement) || !grid.parentElement) {
    removeEmptyRows(root);
    return;
  }

  const empty = options.disabled ? [] : [...options.emptySections];
  if (empty.length === 0) {
    removeEmptyRows(root);
    return;
  }

  let row = grid.parentElement.querySelector(`:scope > .${ROW_CLASS}`) as HTMLElement | null;
  if (!row) {
    row = document.createElement("div");
    row.className = ROW_CLASS;
    grid.insertAdjacentElement("afterend", row);
  } else if (row.previousElementSibling !== grid) {
    grid.insertAdjacentElement("afterend", row);
  }

  const wanted = new Set(empty);
  const chipsBySection = new Map<CreatableSectionId, HTMLAnchorElement>();
  for (const child of [...row.children]) {
    if (!(child instanceof HTMLAnchorElement) || !child.classList.contains(CHIP_CLASS)) {
      child.remove();
      continue;
    }
    const section = child.dataset.section;
    if (!section || !isCreatableSection(section) || !wanted.has(section) || chipsBySection.has(section)) {
      child.remove();
      continue;
    }
    chipsBySection.set(section, child);
  }

  for (const section of empty) {
    let chip = chipsBySection.get(section);
    if (!chip) {
      chip = document.createElement("a");
      chip.className = CHIP_CLASS;
      chip.dataset.section = section;
      const icon = document.createElement("ha-icon");
      icon.setAttribute("icon", "mdi:plus-circle-outline");
      icon.setAttribute("aria-hidden", "true");
      const text = document.createElement("span");
      chip.append(icon, text);
      bindCreateLink(chip, section, options.areaId);
      chipsBySection.set(section, chip);
    }
    const path = sectionCreatePath(section, options.areaId);
    const label = sectionCreateLabel(section);
    const chipLabel = sectionAddChipLabel(section);
    if (chip.getAttribute("href") !== path) chip.setAttribute("href", path);
    if (chip.getAttribute("aria-label") !== label) chip.setAttribute("aria-label", label);
    if (chip.getAttribute("title") !== label) chip.setAttribute("title", label);
    const text = chip.querySelector("span");
    if (text && text.textContent !== chipLabel) text.textContent = chipLabel;
    const icon = chip.querySelector("ha-icon");
    if (icon instanceof HTMLElement) {
      const color = sectionColor(section);
      if (icon.style.color !== color) icon.style.color = color;
      const sectionIconName = sectionIcon(section);
      if (icon.getAttribute("data-section-icon") !== sectionIconName) {
        icon.setAttribute("data-section-icon", sectionIconName);
      }
    }
    row.append(chip);
  }
}

function bindCreateLink(link: HTMLAnchorElement, section: CreatableSectionId, areaId: string): void {
  link.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
  });
  link.addEventListener("click", (event) => {
    event.stopPropagation();
    if (event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const path = link.getAttribute("href") || sectionCreatePath(section, areaId);
    event.preventDefault();
    openSectionCreate(section, areaId, path);
  });
}

/** Navigate to HA's create flow and best-effort prepopulate the area. */
export function openSectionCreate(section: CreatableSectionId, areaId: string, path?: string): void {
  const target = path ?? sectionCreatePath(section, areaId);
  navigateHomeAssistant(target);
  startAreaPrepopulation(section, areaId);
}

function startAreaPrepopulation(section: CreatableSectionId, areaId: string): void {
  const startedAt = Date.now();
  const startPath = `${window.location.pathname}${window.location.search}`;
  let done = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const finish = () => {
    if (done) return;
    done = true;
    if (timer !== undefined) window.clearTimeout(timer);
    window.removeEventListener("location-changed", onLocationChanged);
  };

  const onLocationChanged = () => {
    const now = `${window.location.pathname}${window.location.search}`;
    if (now !== startPath && !pathMatchesSection(section, now)) {
      finish();
    }
  };

  const tick = () => {
    if (done) return;
    if (Date.now() - startedAt > PREPOP_TIMEOUT_MS) {
      finish();
      return;
    }
    if (tryPrepopulateArea(section, areaId)) {
      finish();
      return;
    }
    timer = window.setTimeout(tick, PREPOP_POLL_MS);
  };

  window.addEventListener("location-changed", onLocationChanged);
  timer = window.setTimeout(tick, PREPOP_POLL_MS);
}

function pathMatchesSection(section: CreatableSectionId, pathAndSearch: string): boolean {
  switch (section) {
    case "automations":
      return pathAndSearch.includes("/config/automation/edit/new");
    case "scenes":
      return pathAndSearch.includes("/config/scene/edit/new");
    case "scripts":
      return pathAndSearch.includes("/config/script/edit/new");
    case "helpers":
      return pathAndSearch.includes("/config/helpers");
    default: {
      const exhaustive: never = section;
      return exhaustive;
    }
  }
}

function tryPrepopulateArea(section: CreatableSectionId, areaId: string): boolean {
  switch (section) {
    case "automations":
      return prepopulateEditorArea("ha-automation-editor", "entityRegistryUpdate", areaId, {
        requireNew: true,
      });
    case "scripts":
      return prepopulateEditorArea("ha-script-editor", "entityRegistryUpdate", areaId, {
        requireNew: true,
        idProp: "scriptId",
      });
    case "scenes":
      return prepopulateEditorArea("ha-scene-editor", "_entityRegistryUpdate", areaId, {
        requireNew: true,
        idProp: "sceneId",
      });
    case "helpers":
      return prepopulateHelperArea(areaId);
    default: {
      const exhaustive: never = section;
      return exhaustive;
    }
  }
}

interface EditorPrepopOptions {
  requireNew?: boolean;
  idProp?: string;
}

function prepopulateEditorArea(
  tag: string,
  updateProp: string,
  areaId: string,
  options: EditorPrepopOptions = {},
): boolean {
  const editor = findDeepElement(document, tag);
  if (!editor) return false;

  if (options.requireNew) {
    const idProp = options.idProp ?? "automationId";
    const id = (editor as unknown as Record<string, unknown>)[idProp];
    if (id !== null && id !== undefined && id !== "") return false;
  }

  const current = (editor as unknown as Record<string, unknown>)[updateProp] as
    | { area?: string; labels?: string[]; category?: string }
    | undefined;
  if (current?.area === areaId) return true;

  (editor as unknown as Record<string, unknown>)[updateProp] = {
    area: areaId,
    labels: current?.labels ?? [],
    category: current?.category ?? "",
  };
  const requestUpdate = (editor as unknown as { requestUpdate?: () => void }).requestUpdate;
  if (typeof requestUpdate === "function") requestUpdate.call(editor);
  return true;
}

function prepopulateHelperArea(areaId: string): boolean {
  const dialog = findDeepElement(document, "dialog-helper-detail") as
    | (HTMLElement & {
        _area?: string;
        _domain?: string;
        _open?: boolean;
        requestUpdate?: () => void;
      })
    | null;

  if (dialog && dialog._open !== false && dialog._domain && !dialog._area) {
    dialog._area = areaId;
    dialog.requestUpdate?.();
    return true;
  }
  if (dialog && dialog._area === areaId) return true;

  const helpersPage = findDeepElement(document, "ha-config-helpers") as
    | (HTMLElement & { _createHelper?: () => void })
    | null;
  if (!helpersPage) return false;

  if (!dialog || dialog._open === false) {
    if (typeof helpersPage._createHelper === "function") {
      helpersPage._createHelper();
    } else {
      const fab = findDeepElement(helpersPage, "ha-fab") ?? helpersPage.querySelector("ha-fab");
      if (fab instanceof HTMLElement) fab.click();
      else return false;
    }
    return false;
  }

  return false;
}

function findDeepElement(root: ParentNode | ShadowRoot | Document | null | undefined, tag: string): HTMLElement | null {
  if (!root || typeof root.querySelector !== "function") return null;
  const direct = root.querySelector(tag);
  if (direct instanceof HTMLElement) return direct;

  const walk = (node: ParentNode | ShadowRoot): HTMLElement | null => {
    if (typeof (node as ParentNode).querySelectorAll !== "function") return null;
    for (const el of (node as ParentNode).querySelectorAll("*")) {
      if (!(el instanceof HTMLElement)) continue;
      if (el.localName === tag) return el;
      const shadow = el.shadowRoot;
      if (shadow) {
        const nested = walk(shadow);
        if (nested) return nested;
      }
    }
    return null;
  };

  return walk(root);
}

function removeHeadingLinks(cell: Element): void {
  for (const node of cell.querySelectorAll(`.${LINK_CLASS}`)) node.remove();
  const titleEl = findSectionTitleEl(cell);
  if (titleEl) {
    for (const node of titleEl.querySelectorAll(`.${LINK_CLASS}`)) node.remove();
  }
}

function removeEmptyRows(root: ParentNode): void {
  if (typeof root.querySelectorAll !== "function") return;
  for (const node of root.querySelectorAll(`.${ROW_CLASS}`)) node.remove();
}

function findSectionTitleEl(cell: Element): HTMLElement | null {
  const direct = cell.querySelector(SECTION_TITLE_SELECTOR);
  if (direct) return direct as HTMLElement;
  for (const child of cell.children) {
    const sr = (child as Element & { shadowRoot?: ParentNode | null }).shadowRoot;
    const nested = sr?.querySelector?.(SECTION_TITLE_SELECTOR);
    if (nested) return nested as HTMLElement;
  }
  return null;
}

function sectionIdOfTitleCell(cell: Element): string | null {
  const cfg = rowConfig(cell);
  if (typeof cfg?.section === "string" && cfg.section) return cfg.section;
  const el = findSectionTitleEl(cell);
  if (el?.dataset?.section) return el.dataset.section;
  return null;
}

function titleRowOfCell(cell: Element): HTMLElement | null {
  const el = findSectionTitleEl(cell);
  if (el) {
    const row = el.querySelector(".area-card-section-title-row");
    if (row) return row as HTMLElement;
    const first = el.firstElementChild;
    if (first) return first as HTMLElement;
  }
  const fallback = cell.querySelector(".area-card-section-title-row");
  return fallback ? (fallback as HTMLElement) : null;
}

function rowConfig(cell: Element): Record<string, unknown> | null {
  for (const child of cell.children) {
    if (child.classList.contains(LINK_CLASS) || child.classList.contains("area-card-group-actions")) continue;
    const config = (child as Element & { config?: unknown }).config;
    if (config && typeof config === "object" && !Array.isArray(config)) {
      return config as Record<string, unknown>;
    }
  }
  return null;
}

function ensureStyles(root: ParentNode): void {
  const host = root as ParentNode & {
    querySelector?: (selector: string) => Element | null;
    append?: (node: Node) => void;
    appendChild?: (node: Node) => Node;
  };
  if (typeof host.querySelector !== "function") return;
  if (host.querySelector(`#${STYLE_ID}`)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = sectionAddStyles();
  if (typeof host.append === "function") host.append(style);
  else host.appendChild?.(style);
}
