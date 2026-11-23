import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { GroupSuggestion } from "../src/group-suggestions";
import { syncGroupSuggestions, type GroupSelectionSession } from "../src/group-ui";
import { BUBBLE_CARDS_GRID } from "../src/tags";

const GRID_SELECTOR = `.${BUBBLE_CARDS_GRID} > .card`;

type FakeEvent = {
  key?: string;
  stopPropagation(): void;
  preventDefault(): void;
};

type FakeNode = {
  id: string;
  tag: string;
  tagName: string;
  type: string;
  value: string;
  checked: boolean;
  disabled: boolean;
  placeholder: string;
  textContent: string;
  className: string;
  style: Record<string, string>;
  classList: { contains(name: string): boolean };
  config?: Record<string, unknown>;
  dataset: Record<string, string>;
  children: FakeNode[];
  parentElement: FakeNode | null;
  firstChild: FakeNode | null;
  firstElementChild: FakeNode | null;
  attributes: Record<string, string>;
  setAttribute(name: string, value: string): void;
  getAttribute(name: string): string | null;
  addEventListener(type: string, listener: (event: FakeEvent) => void): void;
  append(...nodes: FakeNode[]): void;
  querySelector(selector: string): FakeNode | null;
  querySelectorAll(selector: string): FakeNode[];
  insertBefore(node: FakeNode, before: FakeNode | null): void;
  remove(): void;
  fire(type: string, extra?: Partial<FakeEvent>): boolean;
};

function matchesSimple(node: FakeNode, selector: string): boolean {
  if (selector.includes(",")) {
    return selector.split(",").some((part) => matchesSimple(node, part.trim()));
  }
  if (selector.startsWith(".")) return node.classList.contains(selector.slice(1));
  if (selector.startsWith("#")) return node.id === selector.slice(1);
  return node.tag === selector;
}

function syncEnds(cell: FakeNode): void {
  cell.firstChild = cell.children[0] ?? null;
  cell.firstElementChild = cell.children[0] ?? null;
}

function fakeNode(tag = "div", className = "", config?: Record<string, unknown>): FakeNode {
  const listeners = new Map<string, Array<(event: FakeEvent) => void>>();
  const node: FakeNode = {
    id: "",
    tag,
    tagName: tag.toUpperCase(),
    type: "",
    value: "",
    checked: false,
    disabled: false,
    placeholder: "",
    textContent: "",
    className,
    style: {},
    config,
    dataset: {},
    children: [],
    parentElement: null,
    firstChild: null,
    firstElementChild: null,
    attributes: {},
    classList: {
      contains(name: string) {
        return node.className.split(/\s+/).includes(name);
      },
    },
    setAttribute(name: string, value: string) {
      node.attributes[name] = value;
    },
    getAttribute(name: string) {
      return node.attributes[name] ?? null;
    },
    addEventListener(type, listener) {
      const list = listeners.get(type);
      if (list) list.push(listener);
      else listeners.set(type, [listener]);
    },
    append(...children) {
      for (const child of children) {
        child.parentElement = node;
        node.children.push(child);
      }
      syncEnds(node);
    },
    querySelector(selector: string) {
      return node.querySelectorAll(selector)[0] ?? null;
    },
    querySelectorAll(selector: string) {
      if (selector.startsWith(":scope > ")) {
        const inner = selector.slice(":scope > ".length);
        return node.children.filter((child) => matchesSimple(child, inner));
      }
      const found: FakeNode[] = [];
      const walk = (current: FakeNode) => {
        for (const child of current.children) {
          if (matchesSimple(child, selector)) found.push(child);
          walk(child);
        }
      };
      walk(node);
      return found;
    },
    insertBefore(child, before) {
      const existing = node.children.indexOf(child);
      if (existing !== -1) node.children.splice(existing, 1);
      const index = before ? node.children.indexOf(before) : node.children.length;
      node.children.splice(index < 0 ? node.children.length : index, 0, child);
      child.parentElement = node;
      syncEnds(node);
    },
    remove() {
      const parent = node.parentElement;
      if (!parent) return;
      const index = parent.children.indexOf(node);
      if (index !== -1) parent.children.splice(index, 1);
      syncEnds(parent);
      node.parentElement = null;
    },
    fire(type: string, extra?: Partial<FakeEvent>) {
      let stopped = false;
      const evt: FakeEvent = {
        ...extra,
        stopPropagation() {
          stopped = true;
        },
        preventDefault() {},
      };
      for (const listener of listeners.get(type) ?? []) listener(evt);
      return stopped;
    },
  };
  return node;
}

function titleCell(section: string, title: string): FakeNode {
  const cell = fakeNode("div", "card");
  const hui = fakeNode("hui-card", "", {
    type: "custom:area-card-section-title",
    section,
    title,
  });
  const titleEl = fakeNode("area-card-section-title");
  titleEl.dataset.section = section;
  const row = fakeNode("div", "area-card-section-title-row");
  titleEl.append(row);
  hui.append(titleEl);
  cell.append(hui);
  return cell;
}

function entityCell(entity: string, type = "custom:area-card-mushroom-light-card"): FakeNode {
  const cell = fakeNode("div", "card");
  const hui = fakeNode("hui-card", "", { type, entity });
  cell.append(hui);
  return cell;
}

function fakeRoot(cells: FakeNode[]) {
  const styles: FakeNode[] = [];
  return {
    styles,
    root: {
      querySelector(selector: string) {
        if (selector === "#area-card-group-suggest-style") {
          return styles.find((s) => s.id === "area-card-group-suggest-style") ?? null;
        }
        return null;
      },
      appendChild(node: FakeNode) {
        styles.push(node);
        return node;
      },
      querySelectorAll(selector: string) {
        return selector === GRID_SELECTOR ? cells : [];
      },
    },
  };
}

describe("syncGroupSuggestions", () => {
  const previousDocument = globalThis.document;

  before(() => {
    globalThis.document = {
      createElement(tag: string) {
        return fakeNode(tag) as unknown as HTMLElement;
      },
    } as unknown as Document;
  });

  after(() => {
    globalThis.document = previousDocument;
  });

  const lightSuggestion: GroupSuggestion = {
    key: "lights",
    sectionId: "lights",
    groupType: "light",
    actionLabel: "Create group",
    defaultName: "Office Lights",
    candidateIds: ["light.a", "light.b", "light.existing_group"],
    suggestedIds: ["light.a", "light.b"],
    fingerprint: "light.a,light.b,light.existing_group|light.existing_group=",
  };

  it("surfaces Create group and Ignore links in the section title and handles clicks", () => {
    const lightsTitle = titleCell("lights", "Lights");
    const switchesTitle = titleCell("switches", "Switches");
    const l1 = entityCell("light.a");
    const l2 = entityCell("light.b");
    const l3 = entityCell("light.existing_group");
    const sw1 = entityCell("switch.fan", "custom:area-card-mushroom-entity-card");
    const { root, styles } = fakeRoot([lightsTitle, l1, l2, l3, switchesTitle, sw1]);

    const started: GroupSuggestion[] = [];
    const ignored: GroupSuggestion[] = [];

    syncGroupSuggestions(root as unknown as ParentNode, {
      disabled: false,
      suggestions: [lightSuggestion],
      session: null,
      onStart: (s) => started.push(s),
      onIgnore: (s) => ignored.push(s),
      onToggleEntity: () => {},
      onNameChange: () => {},
      onHideMembersChange: () => {},
      onCancel: () => {},
      onSave: () => {},
    });

    assert.equal(styles.length, 1);
    const link = lightsTitle.querySelector(".area-card-group-link");
    const ignoreBtn = lightsTitle.querySelector(".area-card-group-ignore");
    assert.equal(link?.textContent, "Create group");
    assert.equal(ignoreBtn?.textContent, "Ignore");
    assert.equal(switchesTitle.querySelector(".area-card-group-actions"), null);
    assert.equal(l1.querySelector(".area-card-group-check"), null);

    link!.fire("click");
    assert.deepEqual(started, [lightSuggestion]);

    ignoreBtn!.fire("click");
    assert.deepEqual(ignored, [lightSuggestion]);
  });

  it("renders checkboxes on all section candidates with only suggested items pre-checked and supports saving", () => {
    const lightsTitle = titleCell("lights", "Lights");
    const l1 = entityCell("light.a");
    const l2 = entityCell("light.b");
    const l3 = entityCell("light.existing_group");
    const sw1 = entityCell("switch.fan", "custom:area-card-mushroom-entity-card");
    const { root } = fakeRoot([lightsTitle, l1, l2, l3, sw1]);

    const toggled: string[] = [];
    const names: string[] = [];
    const hides: boolean[] = [];
    let saved = 0;
    let cancelled = 0;

    const session: GroupSelectionSession = {
      suggestion: lightSuggestion,
      selected: new Set(["light.a", "light.b"]),
      name: "Office Lights",
      hideMembers: false,
      saving: false,
      error: null,
    };

    const opts = {
      disabled: false,
      suggestions: [lightSuggestion],
      session,
      onStart: () => {},
      onIgnore: () => {},
      onToggleEntity: (id: string) => toggled.push(id),
      onNameChange: (n: string) => names.push(n),
      onHideMembersChange: (h: boolean) => hides.push(h),
      onCancel: () => {
        cancelled += 1;
      },
      onSave: () => {
        saved += 1;
      },
    };

    syncGroupSuggestions(root as unknown as ParentNode, opts);

    // Title actions replaced by inline creation bar
    assert.equal(lightsTitle.querySelector(".area-card-group-actions"), null);
    const bar = lightsTitle.querySelector(".area-card-group-bar");
    assert.ok(bar);
    const nameInput = bar!.querySelector(".area-card-group-name-input");
    assert.equal(nameInput?.value, "Office Lights");
    const saveBtn = bar!.querySelector(".area-card-group-save");
    assert.equal(saveBtn?.textContent, "Save (2)");
    assert.equal(saveBtn?.disabled, false);

    // Checkboxes on all 3 lights; only a and b checked; switch untouched
    assert.equal(l1.dataset.groupSelectable, "1");
    assert.equal(l1.dataset.groupChecked, "1");
    assert.equal(l1.querySelector(".area-card-group-checkbox")?.checked, true);
    assert.equal(l2.dataset.groupChecked, "1");
    assert.equal(l3.dataset.groupSelectable, "1");
    assert.equal(l3.dataset.groupChecked, "0");
    assert.equal(l3.querySelector(".area-card-group-checkbox")?.checked, false);
    assert.equal(sw1.dataset.groupSelectable, undefined);
    assert.equal(sw1.querySelector(".area-card-group-check"), null);

    // Clicking the row toggles selection
    l3.fire("click");
    assert.deepEqual(toggled, ["light.existing_group"]);

    // Changing name, toggling hide members, clicking Save & Cancel
    nameInput!.value = "Desk & Ceiling";
    nameInput!.fire("input");
    assert.deepEqual(names, ["Desk & Ceiling"]);

    const hideInput = bar!.querySelector(".area-card-group-hide-input");
    hideInput!.checked = true;
    hideInput!.fire("change");
    assert.deepEqual(hides, [true]);

    saveBtn!.fire("click");
    assert.equal(saved, 1);

    bar!.querySelector(".area-card-group-cancel")!.fire("click");
    assert.equal(cancelled, 1);

    // Disabling (e.g. entering popup edit mode) removes all group controls cleanly
    syncGroupSuggestions(root as unknown as ParentNode, { ...opts, disabled: true });
    assert.equal(lightsTitle.querySelector(".area-card-group-bar"), null);
    assert.equal(l1.querySelector(".area-card-group-check"), null);
    assert.equal(l1.dataset.groupSelectable, undefined);
  });
});
