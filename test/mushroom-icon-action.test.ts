import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildIconActionConfig,
  eventTargetsIcon,
  hasIconActions,
  MUSHROOM_STATE_ITEM_TAG,
  patchMushroomCardActionPrototype,
  patchMushroomStateItemPrototype,
  type ActionCardLike,
  type StateItemLike,
} from "../src/mushroom-icon-action";

interface FakeEl {
  tagName: string;
  slot?: string;
  classes: Set<string>;
  getAttribute(name: string): string | null;
  classList: { contains(cls: string): boolean };
}

function fakeEl(tagName: string, opts?: { slot?: string; classes?: string[] }): FakeEl {
  const classes = new Set(opts?.classes ?? []);
  return {
    tagName,
    slot: opts?.slot,
    classes,
    getAttribute(name: string) {
      return name === "slot" ? (opts?.slot ?? null) : null;
    },
    classList: {
      contains: (cls: string) => classes.has(cls),
    },
  };
}

function fakeEvent(type: string, path: unknown[], detail?: unknown): CustomEvent {
  return {
    type,
    detail,
    target: path[0] ?? null,
    currentTarget: null,
    composedPath: () => path,
  } as unknown as CustomEvent;
}

describe("mushroom icon action split", () => {
  it("detects icon/badge hits vs info/title hits in composedPath", () => {
    const innerIcon = fakeEl("ha-state-icon");
    const shapeIcon = fakeEl("area-card-mushroom-shape-icon", { slot: "icon" });
    const iconWrap = fakeEl("div", { classes: ["icon"] });
    const badge = fakeEl("area-card-mushroom-badge-icon", { slot: "badge" });
    const title = fakeEl("span", { classes: ["primary"] });
    const stateInfo = fakeEl("area-card-mushroom-state-info", { slot: "info" });
    const infoWrap = fakeEl("div", { classes: ["info"] });
    const container = fakeEl("div", { classes: ["container"] });

    assert.equal(eventTargetsIcon(fakeEvent("click", [innerIcon, shapeIcon, iconWrap, container])), true);
    assert.equal(eventTargetsIcon(fakeEvent("click", [badge, iconWrap, container])), true);
    assert.equal(eventTargetsIcon(fakeEvent("click", [title, stateInfo, infoWrap, container])), false);
    assert.equal(eventTargetsIcon(fakeEvent("click", [container])), false);
  });

  it("routes icon clicks to icon_tap_action and title clicks to tap_action even when action fires on state-item", () => {
    const listeners = new Map<string, Array<(event: Event) => void>>();

    class FakeStateItem implements StateItemLike {
      firstUpdated(): void {
        // LitElement lifecycle hook (unlike connectedCallback, not snapshotted by customElements.define)
      }
      addEventListener(type: string, listener: (event: Event) => void): void {
        const list = listeners.get(type) ?? [];
        list.push(listener);
        listeners.set(type, list);
      }
      fire(event: Event): void {
        for (const fn of listeners.get(event.type) ?? []) fn(event);
      }
    }

    const dispatched: Array<{ type: string; detail: { config: Record<string, unknown>; action?: string } }> = [];
    const origCalls: Array<{ action?: string; config?: Record<string, unknown> }> = [];

    class FakeLightCard implements ActionCardLike {
      _config?: Record<string, unknown>;
      shadowRoot: { querySelector: (selector: string) => unknown };
      constructor(stateItem: FakeStateItem) {
        this.shadowRoot = {
          querySelector: (sel: string) => (sel === MUSHROOM_STATE_ITEM_TAG ? stateItem : null),
        };
      }
      _handleAction(event: CustomEvent<{ action?: string }>): void {
        origCalls.push({ action: event.detail?.action, config: this._config });
      }
      dispatchEvent(event: Event): boolean {
        const ce = event as CustomEvent<{ config: Record<string, unknown>; action?: string }>;
        dispatched.push({ type: ce.type, detail: ce.detail });
        return true;
      }
    }

    assert.equal(patchMushroomStateItemPrototype(FakeStateItem.prototype), true);
    assert.equal(patchMushroomStateItemPrototype(FakeStateItem.prototype), false);
    assert.equal(patchMushroomCardActionPrototype(FakeLightCard.prototype), true);
    assert.equal(patchMushroomCardActionPrototype(FakeLightCard.prototype), false);

    const stateItem = new FakeStateItem();
    stateItem.firstUpdated();

    const card = new FakeLightCard(stateItem);
    card._config = {
      type: "custom:area-card-mushroom-light-card",
      entity: "light.man_cave_overheads",
      tap_action: { action: "more-info" },
      hold_action: { action: "more-info" },
      double_tap_action: { action: "none" },
      icon_tap_action: { action: "toggle" },
      icon_hold_action: { action: "more-info" },
      icon_double_tap_action: { action: "none" },
    };

    // 1. User clicks the icon: pointerdown/click hits icon slot, then HA's action-handler fires "action" on state-item
    const shapeIcon = fakeEl("area-card-mushroom-shape-icon", { slot: "icon" });
    stateItem.fire(fakeEvent("pointerdown", [shapeIcon]));
    const actionOnStateItem = fakeEvent("action", [stateItem], { action: "tap" });
    (actionOnStateItem as unknown as { currentTarget: unknown }).currentTarget = stateItem;
    card._handleAction(actionOnStateItem);

    assert.equal(dispatched.length, 1);
    assert.equal(dispatched[0].type, "hass-action");
    assert.equal(dispatched[0].detail.action, "tap");
    assert.deepEqual(dispatched[0].detail.config.tap_action, { action: "toggle" });
    assert.equal(origCalls.length, 0);

    // 2. User clicks the title: pointerdown hits info slot -> routes to original _handleAction (more-info)
    const stateInfo = fakeEl("area-card-mushroom-state-info", { slot: "info" });
    stateItem.fire(fakeEvent("pointerdown", [stateInfo]));
    card._handleAction(actionOnStateItem);

    assert.equal(dispatched.length, 1);
    assert.equal(origCalls.length, 1);
    assert.equal(origCalls[0].action, "tap");
    assert.deepEqual(origCalls[0].config?.tap_action, { action: "more-info" });

    // 3. Keyboard activation after an icon click clears icon state and uses row tap_action
    stateItem.fire(fakeEvent("pointerdown", [shapeIcon]));
    stateItem.fire(fakeEvent("keydown", [stateItem]));
    card._handleAction(actionOnStateItem);

    assert.equal(dispatched.length, 1);
    assert.equal(origCalls.length, 2);
  });

  it("helpers detect and build icon action configs cleanly", () => {
    assert.equal(hasIconActions(undefined), false);
    assert.equal(hasIconActions({ tap_action: { action: "more-info" } }), false);
    assert.equal(hasIconActions({ icon_tap_action: { action: "toggle" } }), true);

    const built = buildIconActionConfig({
      entity: "switch.fan",
      tap_action: { action: "more-info" },
      hold_action: { action: "more-info" },
      icon_tap_action: { action: "toggle" },
    });
    assert.deepEqual(built.tap_action, { action: "toggle" });
    assert.deepEqual(built.hold_action, { action: "more-info" });
  });
});
