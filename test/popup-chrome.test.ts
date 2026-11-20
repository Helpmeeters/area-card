import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { buildButtonConfig } from "../src/button-config";
import { buildPopupConfig } from "../src/popup-cards";
import {
  areaEditButtonLabel,
  areaEditTooltipText,
  closeButtonTooltipText,
  pinEditButtonLabel,
  pinEditTooltipText,
  syncAreaEditButton,
  syncCloseButtonTooltip,
  syncPinEditButton,
} from "../src/header-tooltips";
import { areaSettingsPath, ensureHeaderButtons, insertAreaEditButton, pinSwitchStyles } from "../src/popup-chrome";
import { emptySections } from "../src/sections";

const picture = "https://ha.local/api/image/serve/kitchen";

type FakeHeaderNode = {
  previousElementSibling: FakeHeaderNode | null;
  classList: { contains(name: string): boolean };
};

function fakeNode(className?: string): FakeHeaderNode {
  return {
    previousElementSibling: null,
    classList: { contains: (name: string) => name === className },
  };
}

/** querySelector plus insertBefore that moves a node and records previousElementSibling. */
function fakeHeaderActions(includeClose = true) {
  const close = fakeNode("bubble-close-button");
  const children: FakeHeaderNode[] = includeClose ? [close] : [];
  const actions = {
    querySelector(selector: string) {
      if (selector === ".bubble-close-button" && includeClose) return close;
      return null;
    },
    get firstElementChild() {
      return children[0] ?? null;
    },
    insertBefore(node: FakeHeaderNode, child: FakeHeaderNode) {
      const existing = children.indexOf(node);
      if (existing !== -1) children.splice(existing, 1);
      const index = children.indexOf(child);
      children.splice(index, 0, node);
      for (let i = 0; i < children.length; i += 1) {
        children[i].previousElementSibling = i === 0 ? null : children[i - 1];
      }
    },
  };
  return { close, children, actions };
}

describe("popup chrome", () => {
  it("fits the popup photo to the dialog width and keeps the button on cover", () => {
    const popupStyles = String(
      buildPopupConfig("kitchen", "Kitchen", "mdi:pot-steam", emptySections(), {}, picture).styles,
    );
    const buttonStyles = String(
      buildButtonConfig({
        areaId: "kitchen",
        name: "Kitchen",
        icon: "mdi:pot-steam",
        sections: emptySections(),
        picture,
      }).styles,
    );
    assert.match(popupStyles, /background-size:\s*100% auto/);
    assert.match(popupStyles, /background-position:\s*top center/);
    assert.match(popupStyles, /background-repeat:\s*no-repeat/);
    assert.match(buttonStyles, /background-size:\s*cover/);
    assert.match(buttonStyles, /background-position:\s*center/);
  });

  it("clears the header title fill with and without a picture", () => {
    const withPicture = String(
      buildPopupConfig("kitchen", "Kitchen", "mdi:pot-steam", emptySections(), {}, picture).styles,
    );
    const withoutPicture = String(buildPopupConfig("kitchen", "Kitchen", "mdi:pot-steam", emptySections()).styles);
    for (const styles of [withPicture, withoutPicture]) {
      assert.match(
        styles,
        /\.bubble-header \.bubble-button-card-container \{[^}]*background:\s*none !important/,
      );
      assert.match(styles, /\.bubble-header \.bubble-background,[\s\S]*display:\s*none !important/);
    }
    assert.equal(withoutPicture.includes("background-image"), false);
    assert.match(withPicture, /background-image:/);
  });

  it("builds the area settings path", () => {
    assert.equal(areaSettingsPath("office_of_drew"), "/config/areas/area/office_of_drew");
  });

  it("inserts the gear immediately before the close button", () => {
    const { close, children, actions } = fakeHeaderActions();
    const button = fakeNode("area-card-edit-area");
    insertAreaEditButton(actions as unknown as Element, button as unknown as HTMLElement);
    assert.equal(children[0], button);
    assert.equal(children[1], close);
    assert.equal(close.previousElementSibling, button);

    const extra = fakeNode("area-card-edit-area");
    insertAreaEditButton(actions as unknown as Element, extra as unknown as HTMLElement);
    assert.deepEqual(children, [button, close]);
  });

  it("places the battery, the pencil, then the gear, immediately before close", () => {
    const { close, children, actions } = fakeHeaderActions();
    const battery = fakeNode("area-card-battery");
    const pencil = fakeNode("area-card-pin-edit");
    const gear = fakeNode("area-card-edit-area");
    ensureHeaderButtons(
      actions as unknown as Element,
      battery as unknown as HTMLElement,
      pencil as unknown as HTMLElement,
      gear as unknown as HTMLElement,
    );
    assert.deepEqual(children, [battery, pencil, gear, close]);
    assert.equal(pencil.previousElementSibling, battery);
    assert.equal(gear.previousElementSibling, pencil);
    assert.equal(close.previousElementSibling, gear);

    children.splice(0, children.length, gear, pencil, battery, close);
    gear.previousElementSibling = null;
    pencil.previousElementSibling = gear;
    battery.previousElementSibling = pencil;
    close.previousElementSibling = battery;
    ensureHeaderButtons(
      actions as unknown as Element,
      battery as unknown as HTMLElement,
      pencil as unknown as HTMLElement,
      gear as unknown as HTMLElement,
    );
    assert.deepEqual(children, [battery, pencil, gear, close]);
    assert.equal(children.filter((node) => node === battery).length, 1);
    assert.equal(children.filter((node) => node === pencil).length, 1);
    assert.equal(children.filter((node) => node === gear).length, 1);
  });

  it("keeps the battery to the left of Bubble's previous button", () => {
    const { close, children, actions } = fakeHeaderActions();
    const previous = fakeNode("bubble-previous-button");
    children.splice(0, 0, previous);
    close.previousElementSibling = previous;
    const battery = fakeNode("area-card-battery");
    const pencil = fakeNode("area-card-pin-edit");
    const gear = fakeNode("area-card-edit-area");
    ensureHeaderButtons(
      actions as unknown as Element,
      battery as unknown as HTMLElement,
      pencil as unknown as HTMLElement,
      gear as unknown as HTMLElement,
    );
    assert.deepEqual(children, [battery, previous, pencil, gear, close]);
    ensureHeaderButtons(
      actions as unknown as Element,
      battery as unknown as HTMLElement,
      pencil as unknown as HTMLElement,
      gear as unknown as HTMLElement,
    );
    assert.deepEqual(children, [battery, previous, pencil, gear, close]);
  });

  it("leaves the header buttons in place on a second call", () => {
    const { children, actions } = fakeHeaderActions();
    const battery = fakeNode("area-card-battery");
    const pencil = fakeNode("area-card-pin-edit");
    const gear = fakeNode("area-card-edit-area");
    const host = actions as unknown as Element;
    ensureHeaderButtons(
      host,
      battery as unknown as HTMLElement,
      pencil as unknown as HTMLElement,
      gear as unknown as HTMLElement,
    );
    const placed = [...children];
    ensureHeaderButtons(
      host,
      battery as unknown as HTMLElement,
      pencil as unknown as HTMLElement,
      gear as unknown as HTMLElement,
    );
    assert.deepEqual(children, placed);
    assert.equal(children.filter((node) => node === battery).length, 1);
    assert.equal(children.filter((node) => node === pencil).length, 1);
    assert.equal(children.filter((node) => node === gear).length, 1);
  });

  it("does nothing when the popup has no close button", () => {
    const { children, actions } = fakeHeaderActions(false);
    const battery = fakeNode("area-card-battery");
    const pencil = fakeNode("area-card-pin-edit");
    const gear = fakeNode("area-card-edit-area");
    assert.doesNotThrow(() =>
      ensureHeaderButtons(
        actions as unknown as Element,
        battery as unknown as HTMLElement,
        pencil as unknown as HTMLElement,
        gear as unknown as HTMLElement,
      ),
    );
    assert.deepEqual(children, []);
    assert.equal(battery.previousElementSibling, null);
    assert.equal(pencil.previousElementSibling, null);
    assert.equal(gear.previousElementSibling, null);
  });

  it("sizes header action buttons with and without a picture", () => {
    const withPicture = String(
      buildPopupConfig("kitchen", "Kitchen", "mdi:pot-steam", emptySections(), {}, picture).styles,
    );
    const withoutPicture = String(buildPopupConfig("kitchen", "Kitchen", "mdi:pot-steam", emptySections()).styles);
    for (const styles of [withPicture, withoutPicture]) {
      assert.match(styles, /\.bubble-header-actions \{[^}]*gap:\s*4px !important/);
      assert.match(
        styles,
        /\.bubble-header-action-button \{[^}]*width:\s*36px !important;[^}]*height:\s*36px !important/,
      );
      assert.equal(styles.includes("area-card-bubbles-grid-container"), false);
    }
    const pinStyles = pinSwitchStyles();
    assert.match(
      pinStyles,
      /\.area-card-bubbles-grid-container > \.card:has\(> \.area-card-pin-switch\) \{[^}]*display:\s*flex !important/,
    );
    assert.equal(pinStyles.includes("bubble-cards-grid-container"), false);
  });

  it("applies lightTint to the popup background when no picture is set, without forcing white header text", () => {
    const tinted = String(
      buildPopupConfig("kitchen", "Kitchen", "mdi:pot-steam", emptySections(), {}, null, new Set(), {
        lightTint: { r: 255, g: 180, b: 90 },
      }).styles,
    );
    assert.match(tinted, /\.bubble-pop-up-background[\s\S]*rgba\(255,\s*180,\s*90/);
    assert.equal(tinted.includes("text-shadow: 0 1px 2px rgba(0,0,0,.65)"), false);
  });
});

describe("header action tooltips", () => {
  type FakeDomNode = {
    id: string;
    tag: string;
    className: string;
    textContent: string;
    popover?: string;
    dataset: Record<string, string>;
    style: Record<string, string>;
    attributes: Record<string, string>;
    children: FakeDomNode[];
    listeners: Record<string, Array<(event: unknown) => void>>;
    isConnected: boolean;
    popoverOpen: boolean;
    showPopoverCalls: number;
    hidePopoverCalls: number;
    setAttribute(name: string, value: string): void;
    getAttribute(name: string): string | null;
    removeAttribute(name: string): void;
    addEventListener(type: string, listener: (event: unknown) => void): void;
    removeEventListener(type: string, listener: (event: unknown) => void): void;
    dispatch(type: string, event?: unknown): void;
    appendChild(child: FakeDomNode): FakeDomNode;
    append(...children: FakeDomNode[]): void;
    querySelector(selector: string): FakeDomNode | null;
    querySelectorAll(selector: string): FakeDomNode[];
    getBoundingClientRect(): { left: number; top: number; right: number; bottom: number; width: number; height: number };
    matches(selector: string): boolean;
    showPopover(): void;
    hidePopover(): void;
  };

  function makeDomNode(tag = "div", className = ""): FakeDomNode {
    const node: FakeDomNode = {
      id: "",
      tag,
      className,
      textContent: "",
      dataset: {},
      style: {},
      attributes: {},
      children: [],
      listeners: {},
      isConnected: true,
      popoverOpen: false,
      showPopoverCalls: 0,
      hidePopoverCalls: 0,
      setAttribute(name, value) {
        node.attributes[name] = value;
      },
      getAttribute(name) {
        return node.attributes[name] ?? null;
      },
      removeAttribute(name) {
        delete node.attributes[name];
      },
      addEventListener(type, listener) {
        (node.listeners[type] ??= []).push(listener);
      },
      removeEventListener(type, listener) {
        const list = node.listeners[type];
        if (!list) return;
        const idx = list.indexOf(listener);
        if (idx !== -1) list.splice(idx, 1);
      },
      dispatch(type, event = {}) {
        for (const listener of node.listeners[type] ?? []) listener(event);
      },
      appendChild(child) {
        node.children.push(child);
        return child;
      },
      append(...children) {
        node.children.push(...children);
      },
      querySelector(selector) {
        return node.querySelectorAll(selector)[0] ?? null;
      },
      querySelectorAll(selector) {
        const found: FakeDomNode[] = [];
        const walk = (cur: FakeDomNode) => {
          for (const child of cur.children) {
            if (selector.startsWith(".") && child.className.split(/\s+/).includes(selector.slice(1))) {
              found.push(child);
            } else if (selector.startsWith("#") && child.id === selector.slice(1)) {
              found.push(child);
            }
            walk(child);
          }
        };
        walk(node);
        return found;
      },
      getBoundingClientRect() {
        return { left: 100, top: 40, right: 136, bottom: 76, width: 36, height: 36 };
      },
      matches(selector) {
        return selector === ":popover-open" ? node.popoverOpen : false;
      },
      showPopover() {
        node.popoverOpen = true;
        node.showPopoverCalls += 1;
      },
      hidePopover() {
        node.popoverOpen = false;
        node.hidePopoverCalls += 1;
      },
    };
    return node;
  }

  const prevDocument = globalThis.document;
  const prevWindow = globalThis.window;
  const prevHTMLElement = globalThis.HTMLElement;
  const prevGetComputedStyle = globalThis.getComputedStyle;
  let head: FakeDomNode;
  let body: FakeDomNode;

  before(() => {
    head = makeDomNode("head");
    body = makeDomNode("body");
    globalThis.HTMLElement = Object as unknown as typeof HTMLElement;
    globalThis.getComputedStyle = (() => ({ paddingTop: "4", paddingBottom: "4" })) as unknown as typeof getComputedStyle;
    globalThis.window = {
      innerWidth: 1024,
      innerHeight: 768,
      addEventListener() {},
      removeEventListener() {},
      clearTimeout() {},
      setTimeout() {
        return 1;
      },
    } as unknown as Window & typeof globalThis;
    globalThis.document = {
      head,
      body,
      createElement(tag: string) {
        return makeDomNode(tag);
      },
      getElementById(id: string) {
        return head.querySelector(`#${id}`) ?? body.querySelector(`#${id}`);
      },
      querySelector() {
        return null;
      },
    } as unknown as Document;
  });

  after(() => {
    globalThis.document = prevDocument;
    globalThis.window = prevWindow;
    globalThis.HTMLElement = prevHTMLElement;
    globalThis.getComputedStyle = prevGetComputedStyle;
  });

  it("wires consistent tooltips and syncs aria-label for pin edit button", () => {
    const pencil = makeDomNode("button", "bubble-header-action-button area-card-pin-edit");
    syncPinEditButton(pencil as unknown as HTMLButtonElement, false);
    assert.equal(pencil.getAttribute("aria-pressed"), "false");
    assert.equal(pencil.getAttribute("aria-label"), pinEditButtonLabel(false));

    pencil.dispatch("pointerenter");
    const tip = body.querySelector("#area-card-dot-tooltip");
    assert.ok(tip);
    assert.equal(tip.popoverOpen, true);
    assert.equal(tip.textContent, pinEditTooltipText(false));

    pencil.dispatch("pointerleave");
    assert.equal(tip.popoverOpen, false);

    syncPinEditButton(pencil as unknown as HTMLButtonElement, true);
    assert.equal(pencil.getAttribute("aria-pressed"), "true");
    assert.equal(pencil.getAttribute("aria-label"), pinEditButtonLabel(true));
    assert.equal(pencil.listeners.pointerenter?.length, 1);

    pencil.dispatch("focus");
    assert.equal(tip.popoverOpen, true);
    assert.equal(tip.textContent, pinEditTooltipText(true));

    pencil.dispatch("blur");
    assert.equal(tip.popoverOpen, false);

    pencil.dispatch("focus");
    assert.equal(tip.popoverOpen, true);
    pencil.dispatch("pointerdown");
    assert.equal(tip.popoverOpen, false);

    pencil.dispatch("focus");
    assert.equal(tip.popoverOpen, true);
    pencil.dispatch("click");
    assert.equal(tip.popoverOpen, false);
  });

  it("wires consistent tooltips for area settings and close buttons without breaking propagation", () => {
    const gear = makeDomNode("button", "bubble-header-action-button area-card-edit-area");
    syncAreaEditButton(gear as unknown as HTMLButtonElement);
    assert.equal(gear.getAttribute("aria-label"), areaEditButtonLabel());

    gear.dispatch("pointerenter");
    const tip = body.querySelector("#area-card-dot-tooltip");
    assert.ok(tip);
    assert.equal(tip.popoverOpen, true);
    assert.equal(tip.textContent, areaEditTooltipText());
    gear.dispatch("pointerleave");
    assert.equal(tip.popoverOpen, false);

    const actions = makeDomNode("div", "bubble-header-actions");
    const close = makeDomNode("button", "bubble-header-action-button bubble-close-button");
    close.setAttribute("title", "Native close");
    actions.append(close);

    syncCloseButtonTooltip(actions as unknown as Element);
    syncCloseButtonTooltip(actions as unknown as Element);
    assert.equal(close.getAttribute("title"), null);
    assert.equal(close.listeners.pointerenter?.length, 1);

    close.dispatch("pointerenter");
    assert.equal(tip.popoverOpen, true);
    assert.equal(tip.textContent, closeButtonTooltipText());

    let stopped = false;
    close.dispatch("click", {
      stopPropagation() {
        stopped = true;
      },
    });
    assert.equal(tip.popoverOpen, false);
    assert.equal(stopped, false);
  });
});
