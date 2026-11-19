import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { averageLightColor, lightTintBackgroundStyles } from "../src/light-tint";
import type { EntityState } from "../src/sections";

function lightState(state: string, attributes: Record<string, unknown> = {}): EntityState {
  return { state, attributes };
}

describe("averageLightColor", () => {
  it("returns null when no lights are on", () => {
    assert.equal(averageLightColor([], {}), null);
    assert.equal(
      averageLightColor(["light.a", "light.b"], {
        "light.a": lightState("off", { rgb_color: [255, 0, 0] }),
        "light.b": lightState("unavailable"),
      }),
      null,
    );
  });

  it("extracts rgb_color and averages across on lights", () => {
    const color = averageLightColor(["light.a", "light.b", "light.c"], {
      "light.a": lightState("on", { rgb_color: [200, 100, 50] }),
      "light.b": lightState("on", { rgb_color: [100, 200, 150] }),
      "light.c": lightState("off", { rgb_color: [0, 0, 0] }),
    });
    assert.deepEqual(color, { r: 150, g: 150, b: 100 });
  });

  it("converts hs_color with v=100", () => {
    assert.deepEqual(
      averageLightColor(["light.red"], {
        "light.red": lightState("on", { hs_color: [0, 100] }),
      }),
      { r: 255, g: 0, b: 0 },
    );
    assert.deepEqual(
      averageLightColor(["light.green"], {
        "light.green": lightState("on", { hs_color: [120, 100] }),
      }),
      { r: 0, g: 255, b: 0 },
    );
    assert.deepEqual(
      averageLightColor(["light.blue"], {
        "light.blue": lightState("on", { hs_color: [240, 100] }),
      }),
      { r: 0, g: 0, b: 255 },
    );
  });

  it("converts color_temp_kelvin and legacy color_temp mireds to RGB", () => {
    const warm = averageLightColor(["light.warm"], {
      "light.warm": lightState("on", { color_temp_kelvin: 2700 }),
    });
    assert.ok(warm !== null);
    assert.equal(warm.r, 255);
    assert.ok(warm.g > 150 && warm.g < 185);
    assert.ok(warm.b > 70 && warm.b < 110);

    const warm4000 = averageLightColor(["light.warm4k"], {
      "light.warm4k": lightState("on", { color_temp_kelvin: 4000 }),
    });
    const fromMireds = averageLightColor(["light.mireds"], {
      "light.mireds": lightState("on", { color_temp: 250 }),
    });
    assert.deepEqual(fromMireds, warm4000);

    const cool = averageLightColor(["light.cool"], {
      "light.cool": lightState("on", { color_temp_kelvin: 6500 }),
    });
    assert.ok(cool !== null);
    assert.ok(cool.b > 240);
  });

  it("falls back to warm white [255, 214, 153] for on/off-only bulbs", () => {
    assert.deepEqual(
      averageLightColor(["light.plain"], {
        "light.plain": lightState("on", {}),
      }),
      { r: 255, g: 214, b: 153 },
    );
  });

  it("clamps out-of-range rgb values to 0..255 ints", () => {
    assert.deepEqual(
      averageLightColor(["light.weird"], {
        "light.weird": lightState("on", { rgb_color: [300.7, -10.2, 127.6] }),
      }),
      { r: 255, g: 0, b: 128 },
    );
  });
});

describe("lightTintBackgroundStyles", () => {
  it("returns translucent rgba styles for button and cluster surfaces", () => {
    const buttonCss = lightTintBackgroundStyles({ r: 255, g: 200, b: 100 });
    assert.match(buttonCss, /\.bubble-background/);
    assert.match(buttonCss, /rgba\(255,\s*200,\s*100,\s*0\.\d+\)/);

    const clusterCss = lightTintBackgroundStyles({ r: 255, g: 200, b: 100 }, "cluster");
    assert.doesNotMatch(clusterCss, /\.bubble-background/);
    assert.match(clusterCss, /rgba\(255,\s*200,\s*100,\s*0\.\d+\)/);
  });
});
