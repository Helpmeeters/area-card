import type { GroupSuggestion } from "./group-suggestions";
import { pinEntityId } from "./pinned-entities";
import { BUBBLE_CARDS_GRID } from "./tags";

const GROUP_STYLE_ID = "area-card-group-suggest-style";
const SECTION_TITLE_SELECTOR = "area-card-section-title, area-card-local-section-title";

export interface GroupSelectionSession {
  suggestion: GroupSuggestion;
  selected: Set<string>;
  name: string;
  hideMembers: boolean;
  saving: boolean;
  error: string | null;
}

export interface SyncGroupSuggestionsOptions {
  /** When true (e.g. popup edit mode or demo mode), removes all group-suggestion controls. */
  disabled: boolean;
  suggestions: readonly GroupSuggestion[];
  session: GroupSelectionSession | null;
  onStart: (suggestion: GroupSuggestion) => void;
  onIgnore: (suggestion: GroupSuggestion) => void;
  onToggleEntity: (entityId: string) => void;
  onNameChange: (name: string) => void;
  onHideMembersChange: (hide: boolean) => void;
  onCancel: () => void;
  onSave: () => void;
}

interface ActionsHost extends HTMLElement {
  groupSuggestion?: GroupSuggestion;
  onStart?: (suggestion: GroupSuggestion) => void;
  onIgnore?: (suggestion: GroupSuggestion) => void;
}

interface BarHost extends HTMLElement {
  onNameChange?: (name: string) => void;
  onHideMembersChange?: (hide: boolean) => void;
  onCancel?: () => void;
  onSave?: () => void;
  canSave?: () => boolean;
}

interface CheckHost extends HTMLElement {
  groupEntity?: string;
  onToggle?: (entityId: string) => void;
}

interface SelectableCell extends HTMLElement {
  groupCellBound?: boolean;
  groupCellEntity?: string;
  groupCellToggle?: (entityId: string) => void;
}

export function groupSuggestionStyles(): string {
  return [
    ".area-card-group-actions {",
    "  margin-left: auto;",
    "  display: inline-flex;",
    "  align-items: center;",
    "  gap: 6px;",
    "  flex-shrink: 0;",
    "}",
    ".area-card-group-link {",
    "  appearance: none;",
    "  border: none;",
    "  border-radius: 999px;",
    "  padding: 4px 10px;",
    "  background: color-mix(in srgb, var(--primary-color, #03a9f4) 14%, transparent);",
    "  color: var(--primary-color, #03a9f4);",
    "  font: inherit;",
    "  font-size: 12px;",
    "  font-weight: 600;",
    "  line-height: 18px;",
    "  cursor: pointer;",
    "  white-space: nowrap;",
    "}",
    ".area-card-group-link:hover,",
    ".area-card-group-link:focus-visible {",
    "  background: color-mix(in srgb, var(--primary-color, #03a9f4) 24%, transparent);",
    "}",
    ".area-card-group-ignore {",
    "  appearance: none;",
    "  border: none;",
    "  border-radius: 999px;",
    "  padding: 4px 8px;",
    "  background: transparent;",
    "  color: var(--secondary-text-color);",
    "  font: inherit;",
    "  font-size: 12px;",
    "  font-weight: 500;",
    "  line-height: 18px;",
    "  cursor: pointer;",
    "  white-space: nowrap;",
    "}",
    ".area-card-group-ignore:hover,",
    ".area-card-group-ignore:focus-visible {",
    "  color: var(--primary-text-color);",
    "  background: color-mix(in srgb, var(--primary-text-color, #ffffff) 8%, transparent);",
    "}",
    ".area-card-group-bar {",
    "  display: flex;",
    "  flex-direction: column;",
    "  gap: 8px;",
    "  margin: 4px 4px 8px;",
    "  padding: 10px 12px;",
    "  border-radius: 12px;",
    "  border: 1px solid color-mix(in srgb, var(--primary-text-color, #ffffff) 14%, transparent);",
    "  background: color-mix(in srgb, var(--primary-text-color, #ffffff) 6%, transparent);",
    "  box-sizing: border-box;",
    "}",
    ".area-card-group-name-input {",
    "  width: 100%;",
    "  box-sizing: border-box;",
    "  padding: 7px 10px;",
    "  border-radius: 8px;",
    "  border: 1px solid color-mix(in srgb, var(--primary-text-color, #ffffff) 20%, transparent);",
    "  background: color-mix(in srgb, var(--card-background-color, #1c1c1e) 70%, transparent);",
    "  color: var(--primary-text-color);",
    "  font: inherit;",
    "  font-size: 14px;",
    "  line-height: 20px;",
    "  outline: none;",
    "}",
    ".area-card-group-name-input:focus {",
    "  border-color: var(--primary-color, #03a9f4);",
    "}",
    ".area-card-group-bar-footer {",
    "  display: flex;",
    "  align-items: center;",
    "  justify-content: space-between;",
    "  flex-wrap: wrap;",
    "  gap: 8px;",
    "}",
    ".area-card-group-hide-label {",
    "  display: inline-flex;",
    "  align-items: center;",
    "  gap: 6px;",
    "  font-size: 13px;",
    "  color: var(--secondary-text-color);",
    "  cursor: pointer;",
    "  user-select: none;",
    "}",
    ".area-card-group-hide-label input {",
    "  width: 16px;",
    "  height: 16px;",
    "  margin: 0;",
    "  accent-color: var(--primary-color, #03a9f4);",
    "  cursor: pointer;",
    "}",
    ".area-card-group-bar-buttons {",
    "  display: inline-flex;",
    "  align-items: center;",
    "  gap: 8px;",
    "  margin-left: auto;",
    "}",
    ".area-card-group-cancel {",
    "  appearance: none;",
    "  border: 1px solid color-mix(in srgb, var(--primary-text-color, #ffffff) 18%, transparent);",
    "  border-radius: 999px;",
    "  padding: 6px 12px;",
    "  background: transparent;",
    "  color: var(--primary-text-color);",
    "  font: inherit;",
    "  font-size: 13px;",
    "  font-weight: 500;",
    "  line-height: 18px;",
    "  cursor: pointer;",
    "}",
    ".area-card-group-cancel:hover:not(:disabled) {",
    "  background: color-mix(in srgb, var(--primary-text-color, #ffffff) 8%, transparent);",
    "}",
    ".area-card-group-save {",
    "  appearance: none;",
    "  border: none;",
    "  border-radius: 999px;",
    "  padding: 6px 14px;",
    "  background: var(--primary-color, #03a9f4);",
    "  color: var(--text-primary-color, #ffffff);",
    "  font: inherit;",
    "  font-size: 13px;",
    "  font-weight: 600;",
    "  line-height: 18px;",
    "  cursor: pointer;",
    "}",
    ".area-card-group-save:disabled,",
    ".area-card-group-cancel:disabled {",
    "  opacity: 0.45;",
    "  cursor: default;",
    "}",
    ".area-card-group-error {",
    "  font-size: 12px;",
    "  line-height: 16px;",
    "  color: var(--error-color, #db4437);",
    "}",
    `.${BUBBLE_CARDS_GRID} > .card[data-group-selectable="1"] {`,
    "  display: flex !important;",
    "  align-items: center;",
    "  gap: 8px;",
    "  cursor: pointer;",
    "  user-select: none;",
    "  -webkit-user-select: none;",
    "}",
    `.${BUBBLE_CARDS_GRID} > .card[data-group-selectable="1"] > :not(.area-card-group-check):not(.area-card-battery-readout) {`,
    "  flex: 1 1 auto;",
    "  min-width: 0;",
    "  pointer-events: none !important;",
    "}",
    `.${BUBBLE_CARDS_GRID} > .card[data-group-selectable="1"][data-group-checked="0"] > :not(.area-card-group-check):not(.area-card-battery-readout) {`,
    "  opacity: 0.65;",
    "}",
    ".area-card-group-check {",
    "  flex: 0 0 auto;",
    "  display: inline-flex;",
    "  align-items: center;",
    "  justify-content: center;",
    "  width: 32px;",
    "  height: 32px;",
    "  cursor: pointer;",
    "}",
    ".area-card-group-checkbox {",
    "  width: 18px;",
    "  height: 18px;",
    "  margin: 0;",
    "  accent-color: var(--primary-color, #03a9f4);",
    "  cursor: pointer;",
    "}",
  ].join("\n");
}

function ensureGroupStyles(root: ParentNode): void {
  const host = root as ParentNode & {
    querySelector?: (selector: string) => Element | null;
    appendChild?: (node: Node) => Node;
  };
  if (typeof host.querySelector !== "function" || typeof host.appendChild !== "function") return;
  if (host.querySelector(`#${GROUP_STYLE_ID}`)) return;
  const style = document.createElement("style");
  style.id = GROUP_STYLE_ID;
  style.textContent = groupSuggestionStyles();
  host.appendChild(style);
}

function rowConfig(cell: Element): Record<string, unknown> | null {
  for (const child of cell.children) {
    if (
      child.classList.contains("area-card-pin-switch") ||
      child.classList.contains("area-card-group-check") ||
      child.classList.contains("area-card-group-bar")
    ) {
      continue;
    }
    const config = (child as Element & { config?: unknown }).config;
    if (config && typeof config === "object" && !Array.isArray(config)) {
      return config as Record<string, unknown>;
    }
  }
  return null;
}

function findSectionTitleEl(cell: Element): HTMLElement | null {
  const direct = cell.querySelector(SECTION_TITLE_SELECTOR);
  if (direct) return direct as HTMLElement;
  for (const child of cell.children) {
    const sr = (child as Element & { shadowRoot?: ParentNode | null }).shadowRoot;
    const nested = sr?.querySelector(SECTION_TITLE_SELECTOR);
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

function stopBubblePropagation(el: HTMLElement): void {
  const stop = (event: Event) => event.stopPropagation();
  el.addEventListener("pointerdown", stop);
  el.addEventListener("touchstart", stop);
  el.addEventListener("click", stop);
}

function createActionsEl(): ActionsHost {
  const wrap = document.createElement("div") as ActionsHost;
  wrap.className = "area-card-group-actions";
  stopBubblePropagation(wrap);

  const createBtn = document.createElement("button");
  createBtn.type = "button";
  createBtn.className = "area-card-group-link";
  createBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    if (wrap.groupSuggestion) wrap.onStart?.(wrap.groupSuggestion);
  });

  const ignoreBtn = document.createElement("button");
  ignoreBtn.type = "button";
  ignoreBtn.className = "area-card-group-ignore";
  ignoreBtn.textContent = "Ignore";
  ignoreBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    if (wrap.groupSuggestion) wrap.onIgnore?.(wrap.groupSuggestion);
  });

  wrap.append(createBtn, ignoreBtn);
  return wrap;
}

function createGroupBar(): BarHost {
  const bar = document.createElement("div") as BarHost;
  bar.className = "area-card-group-bar";
  stopBubblePropagation(bar);

  const input = document.createElement("input");
  input.type = "text";
  input.className = "area-card-group-name-input";
  input.placeholder = "Group name";
  input.setAttribute("aria-label", "Helper group name");
  input.addEventListener("input", () => {
    bar.onNameChange?.(input.value);
  });
  input.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.key === "Enter" && bar.canSave?.()) {
      event.preventDefault();
      bar.onSave?.();
    } else if (event.key === "Escape") {
      event.preventDefault();
      bar.onCancel?.();
    }
  });

  const footer = document.createElement("div");
  footer.className = "area-card-group-bar-footer";

  const hideLabel = document.createElement("label");
  hideLabel.className = "area-card-group-hide-label";
  const hideCheck = document.createElement("input");
  hideCheck.type = "checkbox";
  hideCheck.className = "area-card-group-hide-input";
  hideCheck.addEventListener("change", () => {
    bar.onHideMembersChange?.(hideCheck.checked);
  });
  const hideText = document.createElement("span");
  hideText.textContent = "Hide members";
  hideLabel.append(hideCheck, hideText);

  const buttons = document.createElement("div");
  buttons.className = "area-card-group-bar-buttons";

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "area-card-group-cancel";
  cancelBtn.textContent = "Cancel";
  cancelBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    bar.onCancel?.();
  });

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "area-card-group-save";
  saveBtn.textContent = "Save";
  saveBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    if (bar.canSave?.()) bar.onSave?.();
  });

  buttons.append(cancelBtn, saveBtn);
  footer.append(hideLabel, buttons);

  const errorEl = document.createElement("div");
  errorEl.className = "area-card-group-error";
  errorEl.style.display = "none";

  bar.append(input, footer, errorEl);
  return bar;
}

function syncBarContent(bar: BarHost, session: GroupSelectionSession, options: SyncGroupSuggestionsOptions): void {
  bar.onNameChange = options.onNameChange;
  bar.onHideMembersChange = options.onHideMembersChange;
  bar.onCancel = options.onCancel;
  bar.onSave = options.onSave;
  const canSave = !session.saving && session.selected.size > 0 && session.name.trim() !== "";
  bar.canSave = () => canSave;

  const input = bar.querySelector(".area-card-group-name-input") as HTMLInputElement | null;
  if (input) {
    if (input.value !== session.name) input.value = session.name;
    input.disabled = session.saving;
  }

  const hideCheck = bar.querySelector(".area-card-group-hide-input") as HTMLInputElement | null;
  if (hideCheck) {
    hideCheck.checked = session.hideMembers;
    hideCheck.disabled = session.saving;
  }

  const cancelBtn = bar.querySelector(".area-card-group-cancel") as HTMLButtonElement | null;
  if (cancelBtn) cancelBtn.disabled = session.saving;

  const saveBtn = bar.querySelector(".area-card-group-save") as HTMLButtonElement | null;
  if (saveBtn) {
    saveBtn.disabled = !canSave;
    const label = session.saving
      ? "Saving..."
      : session.selected.size > 0
        ? `Save (${session.selected.size})`
        : "Save";
    if (saveBtn.textContent !== label) saveBtn.textContent = label;
  }

  const errorEl = bar.querySelector(".area-card-group-error") as HTMLElement | null;
  if (errorEl) {
    if (session.error) {
      errorEl.textContent = session.error;
      errorEl.style.display = "block";
    } else {
      errorEl.textContent = "";
      errorEl.style.display = "none";
    }
  }
}

function createCheckControl(): CheckHost {
  const wrap = document.createElement("label") as CheckHost;
  wrap.className = "area-card-group-check";
  wrap.addEventListener("pointerdown", (event) => event.stopPropagation());
  wrap.addEventListener("touchstart", (event) => event.stopPropagation());
  wrap.addEventListener("click", (event) => event.stopPropagation());

  const input = document.createElement("input");
  input.type = "checkbox";
  input.className = "area-card-group-checkbox";
  input.addEventListener("change", () => {
    if (wrap.groupEntity) wrap.onToggle?.(wrap.groupEntity);
  });

  wrap.append(input);
  return wrap;
}

function bindCellToggle(cell: SelectableCell): void {
  if (cell.groupCellBound) return;
  cell.groupCellBound = true;
  cell.addEventListener("click", (event) => {
    if (cell.dataset.groupSelectable !== "1") return;
    event.preventDefault();
    event.stopPropagation();
    if (cell.groupCellEntity) cell.groupCellToggle?.(cell.groupCellEntity);
  });
}

function clearRowCheckbox(cell: SelectableCell): void {
  for (const node of cell.querySelectorAll(":scope > .area-card-group-check")) {
    node.remove();
  }
  delete cell.dataset.groupSelectable;
  delete cell.dataset.groupChecked;
  cell.groupCellEntity = undefined;
  cell.groupCellToggle = undefined;
}

function clearTitleControls(cell: Element): void {
  for (const node of cell.querySelectorAll(".area-card-group-actions")) node.remove();
  for (const node of cell.querySelectorAll(":scope > .area-card-group-bar")) node.remove();
  const titleEl = findSectionTitleEl(cell);
  if (titleEl) {
    for (const node of titleEl.querySelectorAll(".area-card-group-actions")) node.remove();
    for (const node of titleEl.querySelectorAll(".area-card-group-bar")) node.remove();
  }
}

/**
 * Sync helper-group suggestion links in section titles, inline creation toolbar,
 * and per-row selection checkboxes inside the popup grid.
 */
export function syncGroupSuggestions(root: ParentNode, options: SyncGroupSuggestionsOptions): void {
  const hasWork = !options.disabled && (options.suggestions.length > 0 || options.session !== null);
  if (hasWork) ensureGroupStyles(root);

  const suggestionBySection = new Map<string, GroupSuggestion>();
  if (!options.disabled) {
    for (const s of options.suggestions) suggestionBySection.set(s.sectionId, s);
  }

  const activeSession = options.disabled ? null : options.session;
  const activeCandidates = activeSession ? new Set(activeSession.suggestion.candidateIds) : null;

  for (const cell of root.querySelectorAll(`.${BUBBLE_CARDS_GRID} > .card`)) {
    const sectionId = sectionIdOfTitleCell(cell);
    if (sectionId) {
      clearRowCheckbox(cell as SelectableCell);
      if (options.disabled) {
        clearTitleControls(cell);
        continue;
      }

      const isActiveSection = activeSession?.suggestion.sectionId === sectionId;
      const suggestion = suggestionBySection.get(sectionId);
      const titleRow = titleRowOfCell(cell);

      if (isActiveSection && activeSession) {
        for (const node of cell.querySelectorAll(".area-card-group-actions")) node.remove();
        if (titleRow) {
          for (const node of titleRow.querySelectorAll(".area-card-group-actions")) node.remove();
        }
        let bar = cell.querySelector(":scope > .area-card-group-bar") as BarHost | null;
        if (!bar) {
          bar = createGroupBar();
          cell.append(bar);
        }
        syncBarContent(bar, activeSession, options);
      } else if (suggestion && titleRow) {
        for (const node of cell.querySelectorAll(":scope > .area-card-group-bar")) node.remove();
        let actions = titleRow.querySelector(":scope > .area-card-group-actions") as ActionsHost | null;
        if (!actions) {
          actions = createActionsEl();
          titleRow.append(actions);
        }
        actions.groupSuggestion = suggestion;
        actions.onStart = options.onStart;
        actions.onIgnore = options.onIgnore;
        const link = actions.querySelector(".area-card-group-link");
        if (link && link.textContent !== suggestion.actionLabel) {
          link.textContent = suggestion.actionLabel;
        }
      } else {
        clearTitleControls(cell);
      }
      continue;
    }

    const entityId = activeSession ? pinEntityId(rowConfig(cell)) : null;
    if (!activeSession || !activeCandidates || !entityId || !activeCandidates.has(entityId)) {
      clearRowCheckbox(cell as SelectableCell);
      continue;
    }

    const selectable = cell as SelectableCell;
    const checked = activeSession.selected.has(entityId);
    selectable.dataset.groupSelectable = "1";
    selectable.dataset.groupChecked = checked ? "1" : "0";
    selectable.groupCellEntity = entityId;
    selectable.groupCellToggle = options.onToggleEntity;
    bindCellToggle(selectable);

    let check = selectable.querySelector(":scope > .area-card-group-check") as CheckHost | null;
    if (!check) {
      check = createCheckControl();
      selectable.insertBefore(check, selectable.firstChild);
    } else if (check !== selectable.firstElementChild) {
      selectable.insertBefore(check, selectable.firstChild);
    }
    check.groupEntity = entityId;
    check.onToggle = options.onToggleEntity;
    const input = check.querySelector(".area-card-group-checkbox") as HTMLInputElement | null;
    if (input) {
      input.checked = checked;
      input.disabled = activeSession.saving;
      input.setAttribute("aria-label", `Include ${entityId} in group`);
    }
  }
}
