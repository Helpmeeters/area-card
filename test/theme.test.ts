import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { colorAlpha, hardcodedThemeVars, isOpaqueThemeColor, syncCardThemeFallback } from "../src/theme";

describe("theme fallback", () => {
  it("detects opaque vs translucent CSS colors", () => {
    assert.equal(colorAlpha("rgb(28, 28, 30)"), 1);
    assert.equal(colorAlpha("rgba(43, 55, 78, 1)"), 1);
    assert.equal(colorAlpha("rgba(43, 55, 78, 0.99)"), 0.99);
    assert.equal(colorAlpha("#1c1c1c"), 1);
    assert.equal(colorAlpha("#ffffff"), 1);
    assert.equal(colorAlpha("rgba(58, 58, 60, 0.6)"), 0.6);
    assert.equal(colorAlpha("rgb(58 58 60 / 60%)"), 0.6);
    assert.equal(colorAlpha("transparent"), 0);
    assert.equal(colorAlpha("#1c1c1c99"), 0x99 / 255);

    assert.equal(isOpaqueThemeColor("rgb(28, 28, 30)"), true);
    assert.equal(isOpaqueThemeColor("rgba(43, 55, 78, 1)"), true);
    assert.equal(isOpaqueThemeColor("#1c1c1c"), true);
    assert.equal(isOpaqueThemeColor(""), true);
    assert.equal(isOpaqueThemeColor("rgba(58, 58, 60, 0.6)"), false);
    assert.equal(isOpaqueThemeColor("rgba(245, 245, 247, 0.6)"), false);
    assert.equal(isOpaqueThemeColor("transparent"), false);
  });

  it("provides translucent Liquid Glass Tinted variables for dark and light modes", () => {
    const dark = hardcodedThemeVars(true);
    assert.equal(dark["--ha-card-background"], "rgba(58, 58, 60, 0.6)");
    assert.equal(dark["--ha-card-backdrop-filter"], "blur(12px) saturate(1.3)");
    assert.equal(dark["--ha-card-border-radius"], "34px");
    assert.equal(dark["--ha-card-border-width"], "0px");
    assert.equal(dark["--bubble-main-background-color"], "var(--ha-card-background)");
    assert.equal(dark["--bubble-pop-up-main-background-color"], "var(--ha-card-background)");
    assert.equal(dark["--mush-chip-background"], "var(--ha-card-background)");
    assert.equal(isOpaqueThemeColor(dark["--ha-card-background"]), false);

    const light = hardcodedThemeVars(false);
    assert.equal(light["--ha-card-background"], "rgba(245, 245, 247, 0.6)");
    assert.equal(light["--ha-card-backdrop-filter"], "blur(12px) saturate(1.3)");
    assert.equal(isOpaqueThemeColor(light["--ha-card-background"]), false);
  });

  it("applies fallback variables when inherited background is opaque and clears them when translucent", () => {
    const props = new Map<string, string>();
    const fakeHost = {
      dataset: {} as Record<string, string>,
      parentElement: {
        append: () => {},
      },
      style: {
        getPropertyValue: (key: string) => props.get(key) ?? "",
        setProperty: (key: string, val: string) => {
          props.set(key, val);
        },
        removeProperty: (key: string) => {
          props.delete(key);
        },
      },
    } as unknown as HTMLElement;

    let computedBg = "rgb(28, 28, 30)";
    const origDocument = globalThis.document;
    const origGetComputedStyle = globalThis.getComputedStyle;
    (globalThis as Record<string, unknown>).document = {
      documentElement: fakeHost.parentElement,
      createElement: () => ({
        style: { cssText: "" },
        remove: () => {},
      }),
    };
    (globalThis as Record<string, unknown>).getComputedStyle = () => ({ backgroundColor: computedBg });

    try {
      syncCardThemeFallback(fakeHost, { themes: { darkMode: true } });
      assert.equal(fakeHost.dataset.areaCardThemeFallback, "1");
      assert.equal(props.get("--ha-card-background"), "rgba(58, 58, 60, 0.6)");
      assert.equal(props.get("--bubble-main-background-color"), "var(--ha-card-background)");

      // Switching to light mode updates the fallback palette.
      syncCardThemeFallback(fakeHost, { themes: { darkMode: false } });
      assert.equal(props.get("--ha-card-background"), "rgba(245, 245, 247, 0.6)");

      // Switching to a translucent theme removes all fallback overrides.
      computedBg = "rgba(58, 58, 60, 0.6)";
      syncCardThemeFallback(fakeHost, { themes: { darkMode: true } });
      assert.equal(fakeHost.dataset.areaCardThemeFallback, undefined);
      assert.equal(props.size, 0);
    } finally {
      (globalThis as Record<string, unknown>).document = origDocument;
      (globalThis as Record<string, unknown>).getComputedStyle = origGetComputedStyle;
    }
  });
});
