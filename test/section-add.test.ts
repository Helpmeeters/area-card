import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { AreaSections } from "../src/sections";
import {
  CREATABLE_SECTIONS,
  emptyCreatableSections,
  openSectionCreate,
  sectionAddChipLabel,
  sectionAddStyles,
  sectionCreateLabel,
  sectionCreatePath,
  syncSectionAddActions,
} from "../src/section-add";
import { BUBBLE_CARDS_GRID } from "../src/tags";

type FakeEvent = {
  button?: number;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  defaultPrevented: boolean;
  propagationStopped: boolean;
  stopPropagation(): void;
  preventDefault(): void;
};

type FakeNode = {
  id: string;
  tag: string;
  tagName: string;
  localName: string;
  textContent: string;
  className: string;
  classList: { contains(name: string): boolean };
  config?: Record<string, unknown>;
  dataset: Record<string, string>;
  style: Record<string, string>;
  children: FakeNode[];
  parentElement: FakeNode | null;
  previousElementSibling: FakeNode | null;
  nextElementSibling: FakeNode | null;
  firstElementChild: FakeNode | null;
  shadowRoot: FakeNode | null;
  attributes: Record<string, string>;
  setAttribute(name: string, value: string): void;
  getAttribute(name: string): string | null;
  addEventListener(type: string, listener: (event: FakeEvent) => void): void;
  append(...nodes: FakeNode[]): void;
  querySelector(selector: string): FakeNode | null;
  querySelectorAll(selector: string): FakeNode[];
  insertAdjacentElement(position: string, node: FakeNode): FakeNode | null;
  remove(): void;
  fire(type: string, init?: Partial<FakeEvent>): FakeEvent;
};

function matchesSelector(node: FakeNode, selector: string): boolean {
  if (selector.includes(",")) {
    return selector.split(",").some((part) => matchesSelector(node, part.trim()));
  }
  if (selector === "ha-icon") return node.tag === "ha-icon";
  if (selector === "span") return node.tag === "span";
  if (selector === `#${node.id}` && node.id) return true;
  if (selector.startsWith("[data-section=")) {
    const match = selector.match(/\[data-section="([^"]+)"\]/);
    return match ? node.dataset.section === match[1] : false;
  }
  if (selector.startsWith(".")) return node.classList.contains(selector.slice(1));
  return node.tag === selector;
}

function syncSiblings(parent: FakeNode): void {
  for (let i = 0; i < parent.children.length; i++) {
    const child = parent.children[i];
    child.previousElementSibling = parent.children[i - 1] ?? null;
    child.nextElementSibling = parent.children[i + 1] ?? null;
  }
  parent.firstElementChild = parent.children[0] ?? null;
}

function fakeNode(tag = "div", className = "", config?: Record<string, unknown>): FakeNode {
  const listeners = new Map<string, (event: FakeEvent) => void>();
  const node: FakeNode = {
    id: "",
    tag,
    tagName: tag.toUpperCase(),
    localName: tag,
    textContent: "",
    className,
    config,
    dataset: {},
    style: {},
    children: [],
    parentElement: null,
    previousElementSibling: null,
    nextElementSibling: null,
    firstElementChild: null,
    shadowRoot: null,
    attributes: {},
    classList: {
      contains(name: string) {
        return node.className.split(/\s+/).includes(name);
      },
    },
    setAttribute(name: string, value: string) {
      node.attributes[name] = value;
      if (name === "id") node.id = value;
    },
    getAttribute(name: string) {
      return node.attributes[name] ?? null;
    },
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    append(...children) {
      for (const child of children) {
        child.parentElement = node;
        node.children.push(child);
      }
      syncSiblings(node);
    },
    querySelector(selector: string) {
      return node.querySelectorAll(selector)[0] ?? null;
    },
    querySelectorAll(selector: string) {
      if (selector.startsWith(":scope > ")) {
        const rest = selector.slice(":scope > ".length);
        if (rest.includes("[")) {
          const classPart = rest.split("[")[0];
          const attrMatch = rest.match(/\[data-section="([^"]+)"\]/);
          return node.children.filter((child) => {
            if (classPart && !matchesSelector(child, classPart)) return false;
            if (attrMatch && child.dataset.section !== attrMatch[1]) return false;
            return true;
          });
        }
        return node.children.filter((child) => matchesSelector(child, rest));
      }
      if (selector === `.${BUBBLE_CARDS_GRID} > .card`) {
        const found: FakeNode[] = [];
        const walk = (current: FakeNode) => {
          for (const child of current.children) {
            if (current.classList.contains(BUBBLE_CARDS_GRID) && child.classList.contains("card")) {
              found.push(child);
            }
            walk(child);
          }
        };
        walk(node);
        return found;
      }
      const found: FakeNode[] = [];
      const walk = (current: FakeNode) => {
        for (const child of current.children) {
          if (matchesSelector(child, selector)) found.push(child);
          walk(child);
        }
      };
      walk(node);
      return found;
    },
    insertAdjacentElement(position: string, inserted: FakeNode) {
      const parent = node.parentElement;
      if (!parent || position !== "afterend") return null;
      const index = parent.children.indexOf(node);
      if (index === -1) return null;
      if (inserted.parentElement) {
        const old = inserted.parentElement.children.indexOf(inserted);
        if (old !== -1) inserted.parentElement.children.splice(old, 1);
        syncSiblings(inserted.parentElement);
      }
      inserted.parentElement = parent;
      parent.children.splice(index + 1, 0, inserted);
      syncSiblings(parent);
      return inserted;
    },
    remove() {
      const parent = node.parentElement;
      if (!parent) return;
      const index = parent.children.indexOf(node);
      if (index !== -1) parent.children.splice(index, 1);
      node.parentElement = null;
      syncSiblings(parent);
    },
    fire(type: string, init: Partial<FakeEvent> = {}) {
      const event: FakeEvent = {
        button: init.button ?? 0,
        metaKey: init.metaKey === true,
        ctrlKey: init.ctrlKey === true,
        shiftKey: init.shiftKey === true,
        altKey: init.altKey === true,
        defaultPrevented: false,
        propagationStopped: false,
        stopPropagation() {
          event.propagationStopped = true;
        },
        preventDefault() {
          event.defaultPrevented = true;
        },
      };
      listeners.get(type)?.(event);
      return event;
    },
  };
  return node;
}

function emptySections(): AreaSections {
  return {
    climate: [],
    lights: [],
    lightLeds: {},
    mediaPlayers: [],
    cameras: [],
    switches: [],
    occupancy: [],
    openings: [],
    satellites: [],
    helpers: [],
    selects: [],
    automations: [],
    sensors: [],
    locks: [],
    vacuums: [],
    buttons: [],
    scenes: [],
    scripts: [],
  };
}

function titleCell(section: string): FakeNode {
  const cell = fakeNode("div", "card");
  const title = fakeNode("area-card-section-title", "", { section, title: section });
  title.dataset.section = section;
  const row = fakeNode("div", "area-card-section-title-row");
  title.append(row);
  cell.append(title);
  return cell;
}

describe("section create paths and labels", () => {
  it("builds HA create URLs", () => {
    assert.equal(sectionCreatePath("automations", "kitchen"), "/config/automation/edit/new");
    assert.equal(sectionCreatePath("scenes", "kitchen"), "/config/scene/edit/new");
    assert.equal(sectionCreatePath("scripts", "kitchen"), "/config/script/edit/new");
    assert.equal(
      sectionCreatePath("helpers", "kitchen"),
      "/config/helpers?historyBack=1&area=kitchen",
    );
    assert.equal(
      sectionCreatePath("helpers", "area with space"),
      "/config/helpers?historyBack=1&area=area%20with%20space",
    );
  });

  it("uses singular create labels and chip text", () => {
    assert.equal(sectionCreateLabel("scenes"), "Create scene");
    assert.equal(sectionAddChipLabel("automations"), "Automation");
    assert.deepEqual([...CREATABLE_SECTIONS], ["scenes", "scripts", "helpers", "automations"]);
  });
});

describe("emptyCreatableSections", () => {
  it("returns creatable sections with no entities", () => {
    const sections = emptySections();
    sections.scenes = ["scene.movie"];
    sections.helpers = ["input_boolean.a"];
    assert.deepEqual(emptyCreatableSections(sections), ["scripts", "automations"]);
  });

  it("treats selects as helpers content and respects hide_sections", () => {
    const sections = emptySections();
    sections.selects = ["input_select.mode"];
    assert.deepEqual(emptyCreatableSections(sections, ["scripts", "automations"]), ["scenes"]);
  });

  it("returns an empty list when sections are missing", () => {
    assert.deepEqual(emptyCreatableSections(undefined), []);
  });
});

describe("sectionAddStyles", () => {
  it("styles heading plus links and bottom chips", () => {
    const css = sectionAddStyles();
    assert.match(css, /\.area-card-section-add\b/);
    assert.match(css, /\.area-card-section-add-chip\b/);
    assert.match(css, /\.area-card-section-add-row\b/);
    assert.match(css, /margin-left:\s*auto/);
  });
});

describe("syncSectionAddActions", () => {
  const previousDocument = globalThis.document;
  const previousHTMLElement = globalThis.HTMLElement;
  const previousHTMLAnchorElement = globalThis.HTMLAnchorElement;
  const previousWindow = globalThis.window;
  let navigated: string[] = [];

  before(() => {
    globalThis.HTMLElement = Object as unknown as typeof HTMLElement;
    globalThis.HTMLAnchorElement = Object as unknown as typeof HTMLAnchorElement;
    globalThis.document = {
      createElement(tag: string) {
        return fakeNode(tag) as unknown as HTMLElement;
      },
      querySelector() {
        return null;
      },
      querySelectorAll() {
        return [];
      },
    } as unknown as Document;
    globalThis.window = {
      location: { pathname: "/lovelace/home", search: "", hash: "" },
      history: {
        pushState(_state: unknown, _title: string, url?: string | URL | null) {
          if (typeof url === "string") {
            navigated.push(url);
            const [path, search = ""] = url.split("?");
            (globalThis.window.location as { pathname: string; search: string }).pathname = path;
            (globalThis.window.location as { pathname: string; search: string }).search = search
              ? `?${search}`
              : "";
          }
        },
      },
      dispatchEvent() {
        return true;
      },
      addEventListener() {},
      removeEventListener() {},
      setTimeout() {
        return 1 as unknown as ReturnType<typeof setTimeout>;
      },
      clearTimeout() {},
    } as unknown as Window & typeof globalThis;
  });

  after(() => {
    globalThis.document = previousDocument;
    globalThis.HTMLElement = previousHTMLElement;
    globalThis.HTMLAnchorElement = previousHTMLAnchorElement;
    globalThis.window = previousWindow;
  });

  function popupRoot(sections: string[]): { root: FakeNode; grid: FakeNode; cells: Record<string, FakeNode> } {
    const root = fakeNode("div");
    const grid = fakeNode("div", BUBBLE_CARDS_GRID);
    const cells: Record<string, FakeNode> = {};
    for (const section of sections) {
      const cell = titleCell(section);
      cells[section] = cell;
      grid.append(cell);
    }
    root.append(grid);
    return { root, grid, cells };
  }

  it("floats a plus link on non-empty creatable headings only", () => {
    navigated = [];
    const { root, cells } = popupRoot(["lights", "helpers", "automations", "scenes"]);
    syncSectionAddActions(root as unknown as ParentNode, {
      disabled: false,
      areaId: "kitchen",
      emptySections: [],
    });

    assert.equal(cells.lights.querySelectorAll(".area-card-section-add").length, 0);
    const helpersLink = cells.helpers.querySelector(".area-card-section-add");
    assert.ok(helpersLink);
    assert.equal(helpersLink.getAttribute("href"), "/config/helpers?historyBack=1&area=kitchen");
    assert.equal(helpersLink.getAttribute("aria-label"), "Create helper");
    assert.equal(helpersLink.querySelector("ha-icon")?.getAttribute("icon"), "mdi:plus-circle-outline");

    assert.equal(
      cells.automations.querySelector(".area-card-section-add")?.getAttribute("href"),
      "/config/automation/edit/new",
    );
    assert.equal(
      cells.scenes.querySelector(".area-card-section-add")?.getAttribute("href"),
      "/config/scene/edit/new",
    );
    assert.equal(root.querySelectorAll(".area-card-section-add-row").length, 0);
  });

  it("collapses empty creatable sections into one bottom chip row", () => {
    const { root, grid, cells } = popupRoot(["helpers"]);
    syncSectionAddActions(root as unknown as ParentNode, {
      disabled: false,
      areaId: "den",
      emptySections: ["scenes", "scripts", "automations"],
    });

    assert.equal(cells.helpers.querySelectorAll(".area-card-section-add").length, 1);
    const row = grid.nextElementSibling;
    assert.ok(row);
    assert.equal(row.className, "area-card-section-add-row");
    const chips = row.querySelectorAll(":scope > .area-card-section-add-chip");
    assert.equal(chips.length, 3);
    assert.equal(chips[0].dataset.section, "scenes");
    assert.equal(chips[0].querySelector("span")?.textContent, "Scene");
    assert.equal(chips[1].dataset.section, "scripts");
    assert.equal(chips[2].dataset.section, "automations");
    assert.equal(chips[2].getAttribute("href"), "/config/automation/edit/new");
  });

  it("removes heading links and chips when disabled", () => {
    const { root, cells } = popupRoot(["helpers", "automations"]);
    syncSectionAddActions(root as unknown as ParentNode, {
      disabled: false,
      areaId: "kitchen",
      emptySections: ["scenes"],
    });
    assert.equal(cells.helpers.querySelectorAll(".area-card-section-add").length, 1);
    assert.equal(root.querySelectorAll(".area-card-section-add-chip").length, 1);

    syncSectionAddActions(root as unknown as ParentNode, {
      disabled: true,
      areaId: "kitchen",
      emptySections: ["scenes"],
    });
    assert.equal(cells.helpers.querySelectorAll(".area-card-section-add").length, 0);
    assert.equal(root.querySelectorAll(".area-card-section-add-row").length, 0);
  });

  it("navigates on create-link click", () => {
    navigated = [];
    const { root, cells } = popupRoot(["automations"]);
    syncSectionAddActions(root as unknown as ParentNode, {
      disabled: false,
      areaId: "kitchen",
      emptySections: [],
    });
    const link = cells.automations.querySelector(".area-card-section-add");
    assert.ok(link);
    const event = link.fire("click");
    assert.equal(event.defaultPrevented, true);
    assert.equal(navigated.at(-1), "/config/automation/edit/new");
  });
});

describe("openSectionCreate", () => {
  const previousWindow = globalThis.window;
  let navigated: string[] = [];

  before(() => {
    globalThis.window = {
      location: { pathname: "/lovelace/home", search: "", hash: "" },
      history: {
        pushState(_state: unknown, _title: string, url?: string | URL | null) {
          if (typeof url === "string") navigated.push(url);
        },
      },
      dispatchEvent() {
        return true;
      },
      addEventListener() {},
      removeEventListener() {},
      setTimeout() {
        return 1 as unknown as ReturnType<typeof setTimeout>;
      },
      clearTimeout() {},
    } as unknown as Window & typeof globalThis;
  });

  after(() => {
    globalThis.window = previousWindow;
  });

  it("navigates to each creatable section path", () => {
    navigated = [];
    openSectionCreate("scripts", "office");
    openSectionCreate("helpers", "office");
    assert.deepEqual(navigated, [
      "/config/script/edit/new",
      "/config/helpers?historyBack=1&area=office",
    ]);
  });
});
