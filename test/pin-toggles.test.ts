import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { syncPinToggles } from "../src/pin-toggles";
import type { PinMode } from "../src/pinned-entities";
import { BUBBLE_CARDS_GRID } from "../src/tags";

const GRID_SELECTOR = `.${BUBBLE_CARDS_GRID} > .card`;

type FakeNode = {
  id: string;
  tag: string;
  tagName: string;
  textContent: string;
  className: string;
  title: string;
  classList: { contains(name: string): boolean };
  config?: Record<string, unknown>;
  dataset: Record<string, string>;
  pinSelect?: (entityId: string, mode: PinMode) => void;
  children: FakeNode[];
  parentElement: FakeNode | null;
  firstChild: FakeNode | null;
  firstElementChild: FakeNode | null;
  attributes: Record<string, string>;
  setAttribute(name: string, value: string): void;
  getAttribute(name: string): string | null;
  addEventListener(type: string, listener: (event: { stopPropagation(): void }) => void): void;
  append(...nodes: FakeNode[]): void;
  querySelector(selector: string): FakeNode | null;
  querySelectorAll(selector: string): FakeNode[];
  insertBefore(node: FakeNode, before: FakeNode | null): void;
  remove(): void;
  fire(type: string): boolean;
};

function matchesSimple(node: FakeNode, selector: string): boolean {
  if (selector === "ha-icon") return node.tag === "ha-icon";
  if (selector === "span") return node.tag === "span";
  if (selector.startsWith(".")) return node.classList.contains(selector.slice(1));
  return false;
}

function syncEnds(cell: FakeNode): void {
  cell.firstChild = cell.children[0] ?? null;
  cell.firstElementChild = cell.children[0] ?? null;
}

function fakeNode(className = "", config?: Record<string, unknown>): FakeNode {
  const listeners = new Map<string, (event: { stopPropagation(): void }) => void>();
  const node: FakeNode = {
    id: "",
    tag: "",
    tagName: "",
    textContent: "",
    className,
    title: "",
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
      listeners.set(type, listener);
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
    fire(type: string) {
      let stopped = false;
      listeners.get(type)?.({
        stopPropagation() {
          stopped = true;
        },
      });
      return stopped;
    },
  };
  return node;
}

function iconOf(node: FakeNode): string | null {
  return node.querySelector("ha-icon")?.getAttribute("icon") ?? null;
}

function triggerOf(control: FakeNode): FakeNode {
  const trigger = control.querySelector(":scope > .area-card-pin-switch-trigger");
  if (!trigger) throw new Error("missing pin trigger");
  return trigger;
}

function menuOptions(control: FakeNode): Array<{ mode: string; label: string | null; icon: string | null; checked: string | null }> {
  const menu = control.querySelector(":scope > .area-card-pin-menu");
  if (!menu) return [];
  return menu.children.map((option) => ({
    mode: option.dataset.pinMode ?? "",
    label: option.querySelector("span")?.textContent ?? null,
    icon: iconOf(option),
    checked: option.getAttribute("aria-checked"),
  }));
}

function cellWith(config: Record<string, unknown> | null): FakeNode {
  const cell = fakeNode("card");
  if (config) {
    const card = fakeNode("", config);
    card.remove = () => {
      const index = cell.children.indexOf(card);
      if (index !== -1) cell.children.splice(index, 1);
      syncEnds(cell);
    };
    cell.children.push(card);
  }
  syncEnds(cell);
  const insert = cell.insertBefore.bind(cell);
  cell.insertBefore = (child, before) => {
    child.remove = () => {
      const index = cell.children.indexOf(child);
      if (index !== -1) cell.children.splice(index, 1);
      syncEnds(cell);
    };
    insert(child, before);
  };
  return cell;
}

function grid(cells: FakeNode[]) {
  const selectors: string[] = [];
  return {
    selectors,
    root: {
      querySelectorAll(selector: string) {
        selectors.push(selector);
        return selector === GRID_SELECTOR ? cells : [];
      },
    },
  };
}

describe("syncPinToggles", () => {
  const created: string[] = [];
  const previousDocument = globalThis.document;

  before(() => {
    globalThis.document = {
      createElement(tag: string) {
        created.push(tag);
        const node = fakeNode();
        node.tag = tag;
        node.tagName = tag.toUpperCase();
        return node as unknown as HTMLElement;
      },
    } as unknown as Document;
  });

  after(() => {
    globalThis.document = previousDocument;
  });

  it("puts one menu button on entity rows and skips titles and chips", () => {
    created.length = 0;
    const title = cellWith({ type: "custom:area-card-section-title", title: "Lights" });
    const chips = cellWith({ type: "custom:area-card-mushroom-chips-card", chips: [] });
    const light = cellWith({
      type: "custom:area-card-light-row",
      card: { type: "custom:area-card-mushroom-light-card", entity: "light.kitchen" },
    });
    const media = cellWith({ type: "media-control", entity: "media_player.tv" });
    const cover = cellWith({ type: "custom:area-card-mushroom-cover-card", entity: "cover.shade" });
    const { root, selectors } = grid([title, chips, light, media, cover]);
    const modes = new Map<string, PinMode>([
      ["light.kitchen", "always"],
      ["media_player.tv", "when-on"],
    ]);
    const selected: Array<{ entityId: string; mode: PinMode }> = [];

    syncPinToggles(root as unknown as ParentNode, {
      editing: true,
      modeOf: (entityId) => modes.get(entityId) ?? "hidden",
      onSelect: (entityId, mode) => selected.push({ entityId, mode }),
    });

    assert.deepEqual(selectors, [GRID_SELECTOR]);
    assert.equal(created.includes("ha-switch"), false);
    assert.equal(created.includes("div"), true);
    assert.equal(title.children.some((child) => child.classList.contains("area-card-pin-switch")), false);
    assert.equal(chips.children.some((child) => child.classList.contains("area-card-pin-switch")), false);

    const lightSwitch = light.children[0];
    const mediaSwitch = media.children[0];
    const coverSwitch = cover.children[0];
    const lightTrigger = triggerOf(lightSwitch);
    const mediaTrigger = triggerOf(mediaSwitch);
    const coverTrigger = triggerOf(coverSwitch);
    assert.equal(lightSwitch.className, "area-card-pin-switch");
    assert.equal(mediaSwitch.className, "area-card-pin-switch");
    assert.equal(coverSwitch.className, "area-card-pin-switch");
    assert.equal(lightSwitch.dataset.pinEntity, "light.kitchen");
    assert.equal(lightSwitch.dataset.pinMode, "always");
    assert.equal(lightTrigger.getAttribute("aria-haspopup"), "menu");
    assert.equal(lightTrigger.getAttribute("aria-expanded"), "false");
    assert.equal(lightTrigger.getAttribute("aria-label"), "Always on the area card");
    assert.equal(lightTrigger.title, "Always on the area card");
    assert.equal(iconOf(lightTrigger), "mdi:pin");
    assert.equal(mediaSwitch.dataset.pinMode, "when-on");
    assert.equal(mediaTrigger.getAttribute("aria-label"), "On the area card while on");
    assert.equal(mediaTrigger.title, "On the area card while on");
    assert.equal(iconOf(mediaTrigger), "mdi:eye-check");
    assert.equal(coverSwitch.dataset.pinEntity, "cover.shade");
    assert.equal(coverSwitch.dataset.pinMode, "hidden");
    assert.equal(coverTrigger.getAttribute("aria-label"), "Hidden on the area card");
    assert.equal(coverTrigger.title, "Hidden on the area card");
    assert.equal(iconOf(coverTrigger), "mdi:eye-off");
    assert.deepEqual(menuOptions(lightSwitch), [
      { mode: "hidden", label: "Hidden on the area card", icon: "mdi:eye-off", checked: "false" },
      { mode: "always", label: "Always on the area card", icon: "mdi:pin", checked: "true" },
      { mode: "when-on", label: "On the area card while on", icon: "mdi:eye-check", checked: "false" },
    ]);
    assert.deepEqual(menuOptions(coverSwitch), [
      { mode: "hidden", label: "Hidden on the area card", icon: "mdi:eye-off", checked: "true" },
      { mode: "always", label: "Always on the area card", icon: "mdi:pin", checked: "false" },
      { mode: "when-on", label: "On the area card while on", icon: "mdi:eye-check", checked: "false" },
    ]);
    assert.equal(light.children[1].config?.type, "custom:area-card-light-row");

    assert.equal(mediaSwitch.fire("pointerdown"), true);
    assert.equal(mediaTrigger.fire("click"), true);
    assert.equal(mediaTrigger.getAttribute("aria-expanded"), "true");
    assert.deepEqual(selected, []);
    const whileOn = mediaSwitch.querySelector(":scope > .area-card-pin-menu")?.children.find(
      (option) => option.dataset.pinMode === "when-on",
    );
    assert.equal(whileOn?.fire("click"), true);
    assert.deepEqual(selected, [{ entityId: "media_player.tv", mode: "when-on" }]);
    assert.equal(mediaTrigger.getAttribute("aria-expanded"), "false");

    const again = created.length;
    const reselected: Array<{ entityId: string; mode: PinMode }> = [];
    modes.set("light.kitchen", "when-on");
    lightTrigger.setAttribute("aria-expanded", "true");
    syncPinToggles(root as unknown as ParentNode, {
      editing: true,
      modeOf: (entityId) => modes.get(entityId) ?? "hidden",
      onSelect: (entityId, mode) => reselected.push({ entityId, mode }),
    });
    assert.equal(created.length, again);
    assert.equal(light.children[0], lightSwitch);
    assert.equal(light.querySelector(":scope > .area-card-pin-switch"), lightSwitch);
    assert.equal(lightSwitch.dataset.pinMode, "when-on");
    assert.equal(iconOf(lightTrigger), "mdi:eye-check");
    assert.equal(lightTrigger.getAttribute("aria-expanded"), "true");
    assert.equal(menuOptions(lightSwitch)[2]?.checked, "true");
    assert.equal(lightTrigger.fire("click"), true);
    assert.deepEqual(reselected, []);
    const hidden = lightSwitch.querySelector(":scope > .area-card-pin-menu")?.children.find(
      (option) => option.dataset.pinMode === "hidden",
    );
    assert.equal(hidden?.fire("click"), true);
    assert.deepEqual(reselected, [{ entityId: "light.kitchen", mode: "hidden" }]);

    syncPinToggles(root as unknown as ParentNode, {
      editing: false,
      modeOf: () => "always",
      onSelect: () => {},
    });
    assert.equal(light.children.some((child) => child.classList.contains("area-card-pin-switch")), false);
    assert.equal(media.children.some((child) => child.classList.contains("area-card-pin-switch")), false);
    assert.equal(cover.children.some((child) => child.classList.contains("area-card-pin-switch")), false);
  });

  it("shows the same three pin options for cameras without a background option", () => {
    const camera = cellWith({ type: "picture-entity", entity: "camera.webcam" });
    const { root } = grid([camera]);
    syncPinToggles(root as unknown as ParentNode, {
      editing: true,
      modeOf: () => "always",
      onSelect: () => {},
    });
    const button = camera.children[0];
    const trigger = triggerOf(button);
    assert.equal(button.dataset.pinMode, "always");
    assert.equal(trigger.getAttribute("aria-label"), "Always on the area card");
    assert.equal(trigger.title, "Always on the area card");
    assert.equal(iconOf(trigger), "mdi:pin");
    assert.deepEqual(menuOptions(button), [
      { mode: "hidden", label: "Hidden on the area card", icon: "mdi:eye-off", checked: "false" },
      { mode: "always", label: "Always on the area card", icon: "mdi:pin", checked: "true" },
      { mode: "when-on", label: "On the area card while on", icon: "mdi:eye-check", checked: "false" },
    ]);
  });

  it("shows a fourth 'Pin to X chip' option only when chipTargetOf returns a primary entity", () => {
    const power = cellWith({ type: "custom:area-card-mushroom-entity-card", entity: "sensor.lamp_power" });
    const standalone = cellWith({ type: "custom:area-card-mushroom-entity-card", entity: "sensor.room_air" });
    const { root } = grid([power, standalone]);
    const selected: Array<{ entityId: string; mode: PinMode }> = [];

    syncPinToggles(root as unknown as ParentNode, {
      editing: true,
      modeOf: (entityId) => (entityId === "sensor.lamp_power" ? "chip" : "hidden"),
      chipTargetOf: (entityId) =>
        entityId === "sensor.lamp_power" ? { entityId: "light.lamp", label: "Work Lamp" } : null,
      onSelect: (entityId, mode) => selected.push({ entityId, mode }),
    });

    const powerSwitch = power.children[0];
    const standaloneSwitch = standalone.children[0];
    const powerTrigger = triggerOf(powerSwitch);
    assert.equal(powerSwitch.dataset.pinMode, "chip");
    assert.equal(powerTrigger.getAttribute("aria-label"), "Pin to Work Lamp chip");
    assert.equal(iconOf(powerTrigger), "mdi:subtitles-outline");
    assert.deepEqual(menuOptions(powerSwitch), [
      { mode: "hidden", label: "Hidden on the area card", icon: "mdi:eye-off", checked: "false" },
      { mode: "always", label: "Always on the area card", icon: "mdi:pin", checked: "false" },
      { mode: "when-on", label: "On the area card while on", icon: "mdi:eye-check", checked: "false" },
      { mode: "chip", label: "Pin to Work Lamp chip", icon: "mdi:subtitles-outline", checked: "true" },
    ]);
    assert.deepEqual(menuOptions(standaloneSwitch), [
      { mode: "hidden", label: "Hidden on the area card", icon: "mdi:eye-off", checked: "true" },
      { mode: "always", label: "Always on the area card", icon: "mdi:pin", checked: "false" },
      { mode: "when-on", label: "On the area card while on", icon: "mdi:eye-check", checked: "false" },
    ]);

    const chipOption = powerSwitch.querySelector(":scope > .area-card-pin-menu")?.children.find(
      (option) => option.dataset.pinMode === "chip",
    );
    assert.equal(chipOption?.fire("click"), true);
    assert.deepEqual(selected, [{ entityId: "sensor.lamp_power", mode: "chip" }]);
  });

  it("does not match the unprefixed bubble grid class", () => {
    const light = cellWith({ type: "custom:area-card-mushroom-entity-card", entity: "light.desk" });
    const root = {
      querySelectorAll(selector: string) {
        return selector === ".bubble-cards-grid-container > .card" ? [light] : [];
      },
    };
    syncPinToggles(root as unknown as ParentNode, {
      editing: true,
      modeOf: () => "always",
      onSelect: () => {},
    });
    assert.equal(light.children.some((child) => child.classList.contains("area-card-pin-switch")), false);
  });

  it("injects pin layout once, outside Bubble's rewritten popup stylesheet", () => {
    const nodes: FakeNode[] = [];
    const root = {
      querySelector(selector: string) {
        if (selector !== "#area-card-pin-switch-style") return null;
        return nodes.find((node) => node.id === "area-card-pin-switch-style") ?? null;
      },
      appendChild(node: FakeNode) {
        nodes.push(node);
      },
      querySelectorAll() {
        return [];
      },
    };
    const options = { editing: true, modeOf: (): PinMode => "hidden", onSelect: () => {} };
    syncPinToggles(root as unknown as ParentNode, options);
    syncPinToggles(root as unknown as ParentNode, options);
    assert.equal(nodes.length, 1);
    assert.equal(nodes[0].id, "area-card-pin-switch-style");
    const css = nodes[0].textContent;
    assert.match(css, /\.area-card-bubbles-grid-container > \.card:has\(> \.area-card-pin-switch\)/);
    assert.match(css, /flex:\s*0 0 auto/);
    assert.match(css, /width:\s*36px/);
    assert.match(css, /height:\s*36px/);
    assert.match(css, /background:\s*transparent/);
    assert.match(css, /border:\s*none/);
    assert.match(css, /padding:\s*0/);
    assert.match(css, /color:\s*var\(--primary-text-color\)/);
    assert.match(css, /color:\s*var\(--primary-color\)/);
    assert.match(css, /\[data-pin-mode="hidden"\][^}]*opacity:\s*0\.45/);
    assert.match(css, /\.area-card-pin-menu/);
    assert.match(css, /\.area-card-pin-option/);
    assert.match(css, /\[aria-checked="true"\]/);
    assert.equal(css.includes(":not(.area-card-bubbles-grid-container"), false);
  });
});
