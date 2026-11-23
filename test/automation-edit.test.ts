import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import {
  ENTITY_EDIT_CLASS,
  automationEditPath,
  entityEditStyles,
  entityEditTarget,
  navigateHomeAssistant,
  openEntitySettings,
  sceneEditPath,
  scriptEditPath,
  syncEntityEditControls,
} from "../src/automation-edit";
import type { ClassifierHass, EntityState, RegistryEntry } from "../src/sections";
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
  parentNode: FakeNode | null;
  shadowRoot: FakeNode | null;
  attributes: Record<string, string>;
  type?: string;
  setAttribute(name: string, value: string): void;
  getAttribute(name: string): string | null;
  removeAttribute(name: string): void;
  addEventListener(type: string, listener: (event: FakeEvent) => void): void;
  append(...nodes: FakeNode[]): void;
  dispatchEvent(event: { type: string; detail?: unknown; bubbles?: boolean; composed?: boolean }): boolean;
  querySelector(selector: string): FakeNode | null;
  querySelectorAll(selector: string): FakeNode[];
  remove(): void;
  fire(type: string, init?: Partial<FakeEvent>): FakeEvent;
};

function matchesSelector(node: FakeNode, selector: string): boolean {
  if (selector === "ha-icon") return node.tag === "ha-icon";
  if (selector === "ha-card") return node.tag === "ha-card";
  if (selector === `#${node.id}` && node.id) return true;
  if (selector === `.${ENTITY_EDIT_CLASS}` || selector === ".area-card-entity-edit") {
    return node.classList.contains(ENTITY_EDIT_CLASS);
  }
  if (selector === ".area-card-automation-edit") {
    return node.classList.contains("area-card-automation-edit");
  }
  if (selector === "[data-pin-entity]" || selector === "[data-pin-entity]:not(.area-card-pin-switch)") {
    if (node.dataset.pinEntity === undefined) return false;
    if (selector.includes(":not(.area-card-pin-switch)") && node.classList.contains("area-card-pin-switch")) {
      return false;
    }
    return true;
  }
  if (selector.startsWith(".")) return node.classList.contains(selector.slice(1));
  return false;
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
    parentNode: null,
    shadowRoot: null,
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
    removeAttribute(name: string) {
      delete node.attributes[name];
    },
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    append(...children) {
      for (const child of children) {
        child.parentElement = node;
        child.parentNode = node;
        node.children.push(child);
      }
    },
    dispatchEvent() {
      return true;
    },
    querySelector(selector: string) {
      return node.querySelectorAll(selector)[0] ?? null;
    },
    querySelectorAll(selector: string) {
      if (selector.includes(",")) {
        const parts = selector.split(",").map((part) => part.trim());
        const found: FakeNode[] = [];
        const seen = new Set<FakeNode>();
        for (const part of parts) {
          for (const match of node.querySelectorAll(part)) {
            if (seen.has(match)) continue;
            seen.add(match);
            found.push(match);
          }
        }
        return found;
      }
      if (selector.startsWith(":scope > ")) {
        const inner = selector.slice(":scope > ".length);
        return node.children.filter((child) => matchesSelector(child, inner));
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
    remove() {
      const parent = node.parentElement;
      if (!parent) return;
      const index = parent.children.indexOf(node);
      if (index !== -1) parent.children.splice(index, 1);
      node.parentElement = null;
      node.parentNode = null;
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

function state(entityId: string, value: string, attributes: Record<string, unknown> = {}): EntityState {
  return { entity_id: entityId, state: value, attributes };
}

function entry(partial: Partial<RegistryEntry> & { entity_id: string }): RegistryEntry {
  return partial as RegistryEntry;
}

function hassWith(
  states: Record<string, EntityState>,
  entities: RegistryEntry[] = [],
  user?: ClassifierHass["user"],
): ClassifierHass {
  return {
    states,
    entities: Object.fromEntries(entities.map((item) => [item.entity_id, item])),
    user,
  };
}

describe("edit paths", () => {
  it("builds automation, script, and scene edit URLs", () => {
    assert.equal(
      automationEditPath(state("automation.bedtime", "on", { id: "abc-123" })),
      "/config/automation/edit/abc-123",
    );
    assert.equal(
      automationEditPath(state("automation.a", "on", { id: "helpmeet/with space" })),
      "/config/automation/edit/helpmeet%2Fwith%20space",
    );
    assert.equal(automationEditPath(state("automation.a", "on")), null);

    assert.equal(
      scriptEditPath("script.helpmeet_announce", entry({ entity_id: "script.helpmeet_announce", unique_id: "helpmeet_announce" })),
      "/config/script/edit/helpmeet_announce",
    );
    assert.equal(scriptEditPath("script.helpmeet_announce"), "/config/script/edit/helpmeet_announce");

    assert.equal(
      sceneEditPath(state("scene.movie", "scening", { id: "scene-1" })),
      "/config/scene/edit/scene-1",
    );
    assert.equal(sceneEditPath(state("scene.movie", "scening")), null);
  });
});

describe("entityEditTarget", () => {
  it("returns link targets for automations, scripts, and scenes", () => {
    const hass = hassWith({
      "automation.bedtime": state("automation.bedtime", "on", { id: "uid-1", friendly_name: "Bedtime" }),
      "script.announce": state("script.announce", "off", { friendly_name: "Announce" }),
      "scene.movie": state("scene.movie", "scening", { id: "scene-9", friendly_name: "Movie" }),
    }, [
      entry({ entity_id: "script.announce", unique_id: "announce" }),
    ]);
    assert.deepEqual(entityEditTarget("automation.bedtime", hass), {
      kind: "link",
      path: "/config/automation/edit/uid-1",
      label: "Edit Bedtime",
    });
    assert.deepEqual(entityEditTarget("script.announce", hass), {
      kind: "link",
      path: "/config/script/edit/announce",
      label: "Edit Announce",
    });
    assert.deepEqual(entityEditTarget("scene.movie", hass), {
      kind: "link",
      path: "/config/scene/edit/scene-9",
      label: "Edit Movie",
    });
  });

  it("returns settings targets for manual helpers and excludes device-backed entities", () => {
    const hass = hassWith(
      {
        "binary_sensor.man_cave_presence": state("binary_sensor.man_cave_presence", "on", {
          friendly_name: "Man Cave Presence",
        }),
        "binary_sensor.man_cave_doors_are_correct": state("binary_sensor.man_cave_doors_are_correct", "on", {
          friendly_name: "Man Cave Doors are Correct",
        }),
        "input_boolean.sleep_mode": state("input_boolean.sleep_mode", "off", { friendly_name: "Sleep Mode" }),
        "binary_sensor.zha_motion": state("binary_sensor.zha_motion", "on", { friendly_name: "Motion" }),
        "light.lamp": state("light.lamp", "on", { friendly_name: "Lamp" }),
      },
      [
        entry({
          entity_id: "binary_sensor.man_cave_presence",
          platform: "group",
          config_entry_id: "abc",
          device_id: null,
        } as RegistryEntry),
        entry({
          entity_id: "binary_sensor.man_cave_doors_are_correct",
          platform: "template",
          device_id: null,
        }),
        entry({
          entity_id: "input_boolean.sleep_mode",
          platform: "input_boolean",
          device_id: null,
        }),
        entry({
          entity_id: "binary_sensor.zha_motion",
          platform: "zha",
          device_id: "dev-1",
        }),
        entry({
          entity_id: "light.lamp",
          platform: "zha",
          device_id: "dev-2",
        }),
      ],
    );

    assert.deepEqual(entityEditTarget("binary_sensor.man_cave_presence", hass), {
      kind: "settings",
      entityId: "binary_sensor.man_cave_presence",
      label: "Edit Man Cave Presence",
    });
    assert.equal(entityEditTarget("binary_sensor.man_cave_doors_are_correct", hass)?.kind, "settings");
    assert.equal(entityEditTarget("input_boolean.sleep_mode", hass)?.kind, "settings");
    assert.equal(entityEditTarget("binary_sensor.zha_motion", hass), null);
    assert.equal(entityEditTarget("light.lamp", hass), null);
  });

  it("hides pencils for non-admin users", () => {
    const hass = hassWith(
      {
        "automation.bedtime": state("automation.bedtime", "on", { id: "uid-1", friendly_name: "Bedtime" }),
      },
      [],
      { id: "u1", is_admin: false },
    );
    assert.equal(entityEditTarget("automation.bedtime", hass), null);
  });
});

describe("entityEditStyles", () => {
  it("hides the pencil until hover on fine pointers", () => {
    const css = entityEditStyles();
    assert.match(css, /\.area-card-entity-edit/);
    assert.match(css, /@media \(hover: hover\)/);
    assert.match(css, /opacity:\s*0/);
    assert.match(css, /:hover > \.area-card-entity-edit/);
  });
});

describe("syncEntityEditControls", () => {
  const previousDocument = globalThis.document;
  const previousHTMLElement = globalThis.HTMLElement;
  const previousHTMLAnchorElement = globalThis.HTMLAnchorElement;
  const previousHTMLButtonElement = globalThis.HTMLButtonElement;
  const previousShadowRoot = globalThis.ShadowRoot;
  const previousDocumentCtor = globalThis.Document;
  const previousWindow = globalThis.window;

  before(() => {
    globalThis.HTMLElement = Object as unknown as typeof HTMLElement;
    globalThis.HTMLAnchorElement = Object as unknown as typeof HTMLAnchorElement;
    globalThis.HTMLButtonElement = Object as unknown as typeof HTMLButtonElement;
    globalThis.ShadowRoot = Object as unknown as typeof ShadowRoot;
    globalThis.Document = Object as unknown as typeof Document;
    globalThis.document = {
      createElement(tag: string) {
        const node = fakeNode(tag) as FakeNode & { type?: string };
        if (tag === "button") node.type = "button";
        return node as unknown as HTMLElement;
      },
    } as unknown as Document;
    globalThis.window = {
      location: { pathname: "/lovelace/home", search: "", hash: "" },
      history: { pushState() {} },
      dispatchEvent() {
        return true;
      },
      addEventListener() {},
      removeEventListener() {},
    } as unknown as Window & typeof globalThis;
  });

  after(() => {
    globalThis.document = previousDocument;
    globalThis.HTMLElement = previousHTMLElement;
    globalThis.HTMLAnchorElement = previousHTMLAnchorElement;
    globalThis.HTMLButtonElement = previousHTMLButtonElement;
    globalThis.ShadowRoot = previousShadowRoot;
    globalThis.Document = previousDocumentCtor;
    globalThis.window = previousWindow;
  });

  it("mounts link pencils for automations and settings pencils for groups", () => {
    const root = fakeNode("div");
    const grid = fakeNode("div", BUBBLE_CARDS_GRID);

    const autoCell = fakeNode("div", "card");
    const autoCard = fakeNode("area-card-mushroom-template-card", "", {
      type: "custom:area-card-mushroom-template-card",
      entity: "automation.bedtime",
    });
    autoCell.append(autoCard);
    grid.append(autoCell);

    const groupCell = fakeNode("div", "card");
    const groupCard = fakeNode("area-card-mushroom-entity-card", "", {
      type: "custom:area-card-mushroom-entity-card",
      entity: "binary_sensor.man_cave_presence",
    });
    groupCell.append(groupCard);
    grid.append(groupCell);
    root.append(grid);

    const hass = hassWith(
      {
        "automation.bedtime": state("automation.bedtime", "on", { id: "uid-1", friendly_name: "Bedtime" }),
        "binary_sensor.man_cave_presence": state("binary_sensor.man_cave_presence", "on", {
          friendly_name: "Man Cave Presence",
        }),
      },
      [
        entry({
          entity_id: "binary_sensor.man_cave_presence",
          platform: "group",
          device_id: null,
        }),
      ],
    );

    syncEntityEditControls(root as unknown as ParentNode, hass);

    const autoLink = autoCell.querySelector(`:scope > .${ENTITY_EDIT_CLASS}`);
    assert.ok(autoLink);
    assert.equal(autoLink.tag, "a");
    assert.equal(autoLink.getAttribute("href"), "/config/automation/edit/uid-1");

    const groupBtn = groupCell.querySelector(`:scope > .${ENTITY_EDIT_CLASS}`);
    assert.ok(groupBtn);
    assert.equal(groupBtn.tag, "button");
    assert.equal(groupBtn.dataset.entityId, "binary_sensor.man_cave_presence");
    assert.equal(groupBtn.getAttribute("aria-label"), "Edit Man Cave Presence");
  });

  it("removes pencils while editing or in demo mode", () => {
    const root = fakeNode("div");
    const grid = fakeNode("div", BUBBLE_CARDS_GRID);
    const cell = fakeNode("div", "card");
    const mushroom = fakeNode("area-card-mushroom-template-card", "", {
      type: "custom:area-card-mushroom-template-card",
      entity: "automation.bedtime",
    });
    cell.append(mushroom);
    grid.append(cell);
    root.append(grid);

    const hass = hassWith({
      "automation.bedtime": state("automation.bedtime", "on", { id: "uid-1", friendly_name: "Bedtime" }),
    });
    syncEntityEditControls(root as unknown as ParentNode, hass);
    assert.equal(cell.querySelectorAll(`.${ENTITY_EDIT_CLASS}`).length, 1);

    syncEntityEditControls(root as unknown as ParentNode, hass, { editing: true });
    assert.equal(cell.querySelectorAll(`.${ENTITY_EDIT_CLASS}`).length, 0);

    syncEntityEditControls(root as unknown as ParentNode, hass, { disabled: true });
    assert.equal(cell.querySelectorAll(`.${ENTITY_EDIT_CLASS}`).length, 0);
  });

  it("SPA-navigates link pencils and opens settings for helper pencils", () => {
    const root = fakeNode("div");
    const grid = fakeNode("div", BUBBLE_CARDS_GRID);

    const autoCell = fakeNode("div", "card");
    autoCell.append(
      fakeNode("area-card-mushroom-template-card", "", {
        type: "custom:area-card-mushroom-template-card",
        entity: "automation.bedtime",
      }),
    );
    const groupCell = fakeNode("div", "card");
    groupCell.append(
      fakeNode("area-card-mushroom-entity-card", "", {
        type: "custom:area-card-mushroom-entity-card",
        entity: "binary_sensor.man_cave_presence",
      }),
    );
    grid.append(autoCell, groupCell);
    root.append(grid);

    syncEntityEditControls(
      root as unknown as ParentNode,
      hassWith(
        {
          "automation.bedtime": state("automation.bedtime", "on", { id: "uid-1", friendly_name: "Bedtime" }),
          "binary_sensor.man_cave_presence": state("binary_sensor.man_cave_presence", "on", {
            friendly_name: "Man Cave Presence",
          }),
        },
        [entry({ entity_id: "binary_sensor.man_cave_presence", platform: "group", device_id: null })],
      ),
    );

    const link = autoCell.querySelector(`.${ENTITY_EDIT_CLASS}`);
    const button = groupCell.querySelector(`.${ENTITY_EDIT_CLASS}`);
    assert.ok(link);
    assert.ok(button);

    const pointer = link.fire("pointerdown");
    assert.equal(pointer.propagationStopped, true);

    const pushes: string[] = [];
    const win = globalThis.window as Window & {
      history: { pushState: (data: unknown, unused: string, url?: string | URL | null) => void };
      dispatchEvent: (event: Event) => boolean;
    };
    const previousHistory = win.history;
    const previousDispatch = win.dispatchEvent;
    win.history = {
      pushState(_data: unknown, _unused: string, url?: string | URL | null) {
        pushes.push(String(url ?? ""));
      },
    } as History;
    win.dispatchEvent = (() => true) as Window["dispatchEvent"];
    try {
      const click = link.fire("click", { button: 0 });
      assert.equal(click.defaultPrevented, true);
      assert.deepEqual(pushes, ["/config/automation/edit/uid-1"]);
    } finally {
      win.history = previousHistory;
      win.dispatchEvent = previousDispatch;
    }

    const events: Array<{ type: string; detail: unknown }> = [];
    button.dispatchEvent = ((event: { type: string; detail?: unknown }) => {
      events.push({ type: event.type, detail: event.detail });
      return true;
    }) as FakeNode["dispatchEvent"];
    const settingsClick = button.fire("click", { button: 0 });
    assert.equal(settingsClick.propagationStopped, true);
    assert.equal(settingsClick.defaultPrevented, true);
    assert.deepEqual(events, [
      { type: "hass-more-info", detail: { entityId: "binary_sensor.man_cave_presence", view: "settings" } },
    ]);
  });
});

describe("navigateHomeAssistant and openEntitySettings", () => {
  const previousWindow = globalThis.window;

  after(() => {
    globalThis.window = previousWindow;
  });

  it("pushes history and dispatches location-changed", () => {
    const pushes: Array<{ data: unknown; url: string }> = [];
    let detail: unknown;
    globalThis.window = {
      location: { pathname: "/lovelace/home", search: "", hash: "#area-demo" },
      history: {
        pushState(data: unknown, _unused: string, url?: string | URL | null) {
          pushes.push({ data, url: String(url ?? "") });
        },
      },
      dispatchEvent(event: Event) {
        detail = (event as CustomEvent).detail;
        return true;
      },
    } as unknown as Window & typeof globalThis;

    navigateHomeAssistant("/config/automation/edit/x");
    assert.equal(pushes[0]?.url, "/config/automation/edit/x");
    assert.deepEqual((pushes[0]?.data as { from: string }).from, "/lovelace/home#area-demo");
    assert.deepEqual(detail, { replace: false });
  });

  it("dispatches hass-more-info settings from openEntitySettings", () => {
    const host = fakeNode("div");
    const events: Array<{ type: string; detail: unknown }> = [];
    host.dispatchEvent = ((event: { type: string; detail?: unknown }) => {
      events.push({ type: event.type, detail: event.detail });
      return true;
    }) as FakeNode["dispatchEvent"];
    openEntitySettings(host as unknown as EventTarget, "binary_sensor.man_cave_presence");
    assert.deepEqual(events, [
      { type: "hass-more-info", detail: { entityId: "binary_sensor.man_cave_presence", view: "settings" } },
    ]);
  });
});
