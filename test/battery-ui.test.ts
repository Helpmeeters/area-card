import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import {
  batteryButtonLabel,
  batteryChromeStyles,
  batteryTooltipText,
  createBatteryButton,
  syncBatteryButton,
  syncBatteryReadouts,
} from "../src/battery-ui";
import type { ClassifierHass, EntityState } from "../src/sections";
import { BUBBLE_CARDS_GRID } from "../src/tags";

type FakeNode = {
  id: string;
  tag: string;
  tagName: string;
  textContent: string;
  className: string;
  classList: { contains(name: string): boolean };
  config?: Record<string, unknown>;
  dataset: Record<string, string>;
  style: Record<string, string> & { setProperty(name: string, value: string): void };
  children: FakeNode[];
  parentElement: FakeNode | null;
  parentNode: FakeNode | null;
  attributes: Record<string, string>;
  setAttribute(name: string, value: string): void;
  getAttribute(name: string): string | null;
  addEventListener(type: string, listener: (event: unknown) => void): void;
  append(...nodes: FakeNode[]): void;
  getRootNode(): FakeNode | null;
  querySelector(selector: string): FakeNode | null;
  querySelectorAll(selector: string): FakeNode[];
  remove(): void;
};

function matchesSelector(node: FakeNode, selector: string): boolean {
  if (selector === "ha-icon") return node.tag === "ha-icon";
  if (selector === `#${node.id}` && node.id) return true;
  if (selector === ".area-card-battery-option") return node.classList.contains("area-card-battery-option");
  if (selector === ".area-card-battery-readout") return node.classList.contains("area-card-battery-readout");
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
  const styleProps: Record<string, string> & { setProperty?: (name: string, value: string) => void } = {};
  styleProps.setProperty = (name: string, value: string) => {
    styleProps[name] = value;
  };
  const style = new Proxy(styleProps, {
    set(target, prop, value) {
      if (typeof prop === "string") target[prop] = String(value);
      return true;
    },
  }) as FakeNode["style"];

  const node: FakeNode = {
    id: "",
    tag,
    tagName: tag.toUpperCase(),
    textContent: "",
    className,
    config,
    dataset: {},
    style,
    children: [],
    parentElement: null,
    parentNode: null,
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
    addEventListener() {},
    append(...children) {
      for (const child of children) {
        child.parentElement = node;
        child.parentNode = node;
        node.children.push(child);
      }
    },
    getRootNode() {
      let current: FakeNode = node;
      while (current.parentNode) current = current.parentNode;
      return current;
    },
    querySelector(selector: string) {
      return node.querySelectorAll(selector)[0] ?? null;
    },
    querySelectorAll(selector: string) {
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
  };
  return node;
}

function state(entityId: string, value: string, attributes: Record<string, unknown> = {}): EntityState {
  return { entity_id: entityId, state: value, attributes };
}

describe("battery UI", () => {
  const previousDocument = globalThis.document;
  const previousHTMLElement = globalThis.HTMLElement;
  const previousShadowRoot = globalThis.ShadowRoot;
  const previousDocumentCtor = globalThis.Document;

  before(() => {
    globalThis.HTMLElement = Object as unknown as typeof HTMLElement;
    globalThis.ShadowRoot = Object as unknown as typeof ShadowRoot;
    globalThis.Document = Object as unknown as typeof Document;
    globalThis.document = {
      createElement(tag: string) {
        return fakeNode(tag) as unknown as HTMLElement;
      },
    } as unknown as Document;
  });

  after(() => {
    globalThis.document = previousDocument;
    globalThis.HTMLElement = previousHTMLElement;
    globalThis.ShadowRoot = previousShadowRoot;
    globalThis.Document = previousDocumentCtor;
  });

  it("does not attach a second battery readout onto the edit-mode pin switch", () => {
    const popupRoot = fakeNode("div");
    const grid = fakeNode("div", BUBBLE_CARDS_GRID);
    const cell = fakeNode("div", "card");
    const pinSwitch = fakeNode("div", "area-card-pin-switch");
    pinSwitch.dataset.pinEntity = "lock.front";
    const lockCard = fakeNode("area-card-mushroom-lock-card", "", {
      type: "custom:area-card-mushroom-lock-card",
      entity: "lock.front",
    });
    cell.append(pinSwitch, lockCard);
    grid.append(cell);
    popupRoot.append(grid);

    const pinnedHost = fakeNode("div", "area-card-pinned");
    const pinnedCard = fakeNode("div", "area-card-pinned-card", {
      type: "custom:area-card-mushroom-lock-card",
      entity: "lock.front",
    });
    pinnedCard.dataset.pinEntity = "lock.front";
    pinnedHost.append(pinnedCard);

    const hass: ClassifierHass = {
      states: {
        "lock.front": state("lock.front", "unlocked", { battery_level: 18 }),
      },
    };

    syncBatteryReadouts(popupRoot as unknown as ParentNode, hass, "green");
    syncBatteryReadouts(pinnedHost as unknown as ParentNode, hass, "green", popupRoot as unknown as ParentNode);

    const cellReadouts = cell.querySelectorAll(":scope > .area-card-battery-readout");
    assert.equal(cellReadouts.length, 1);
    assert.equal(cellReadouts[0].textContent, "18%");
    assert.equal(pinSwitch.querySelectorAll(":scope > .area-card-battery-readout").length, 0);

    const pinnedReadouts = pinnedCard.querySelectorAll(":scope > .area-card-battery-readout");
    assert.equal(pinnedReadouts.length, 1);
    assert.equal(pinnedReadouts[0].textContent, "18%");
  });

  it("excludes the pin switch from pinned battery readout CSS", () => {
    const css = batteryChromeStyles();
    assert.match(css, /\[data-pin-entity\]:not\(\.area-card-pin-switch\)/);
    assert.equal(css.includes("[data-pin-entity] >"), false);
  });

  it("explains the battery button mode in aria-label, tooltip text, and menu options", () => {
    const button = createBatteryButton(() => {}) as unknown as FakeNode & { batteryMenu?: FakeNode };
    assert.equal(button.getAttribute("aria-label"), batteryButtonLabel("off"));
    assert.match(button.getAttribute("aria-label") ?? "", /Off/);
    assert.match(button.getAttribute("aria-label") ?? "", /Hide battery percentages/);

    syncBatteryButton(button as unknown as HTMLButtonElement, "yellow");
    assert.equal(button.dataset.mode, "yellow");
    assert.equal(button.getAttribute("aria-label"), batteryButtonLabel("yellow"));
    assert.match(button.getAttribute("aria-label") ?? "", /Yellow/);
    assert.match(button.getAttribute("aria-label") ?? "", /below 70%/);
    assert.match(batteryTooltipText("red"), /Red/);
    assert.match(batteryTooltipText("red"), /below 30%/);

    const menu = button.batteryMenu;
    assert.ok(menu);
    assert.equal(menu.children[0].className, "area-card-battery-menu-title");
    assert.equal(menu.children[0].textContent, "Battery percentages");

    const options = menu.querySelectorAll(".area-card-battery-option");
    assert.equal(options.length, 4);
    const descriptions = options.map((opt) => opt.querySelector(".area-card-battery-option-desc")?.textContent ?? "");
    assert.deepEqual(descriptions, [
      "Hide battery percentages",
      "Show all (70%+ and lower)",
      "Show below 70% (yellow & red)",
      "Show below 30% (red only)",
    ]);
    assert.equal(options[2].getAttribute("aria-checked"), "true");
  });
});
