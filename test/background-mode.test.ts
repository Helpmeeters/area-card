import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BACKGROUND_MODE_KEY_PREFIX,
  areaBackgroundEqual,
  backgroundModeKey,
  parseAreaBackground,
  serializeAreaBackground,
} from "../src/background-mode";

describe("backgroundModeKey", () => {
  it("prefixes the area id", () => {
    assert.equal(BACKGROUND_MODE_KEY_PREFIX, "area-card-background:");
    assert.equal(backgroundModeKey("kitchen"), "area-card-background:kitchen");
  });
});

describe("parseAreaBackground and serializeAreaBackground", () => {
  it("defaults to light-tint for missing or invalid values", () => {
    assert.deepEqual(parseAreaBackground(undefined), { mode: "light-tint" });
    assert.deepEqual(parseAreaBackground(null), { mode: "light-tint" });
    assert.deepEqual(parseAreaBackground(""), { mode: "light-tint" });
    assert.deepEqual(parseAreaBackground("not json"), { mode: "light-tint" });
    assert.deepEqual(parseAreaBackground({ mode: "unknown" }), { mode: "light-tint" });
    assert.deepEqual(parseAreaBackground({ mode: "camera" }), { mode: "light-tint" });
    assert.deepEqual(parseAreaBackground({ mode: "camera", entityId: "" }), { mode: "light-tint" });
    assert.deepEqual(parseAreaBackground({ mode: "media-artwork" }), { mode: "light-tint" });
    assert.deepEqual(parseAreaBackground({ mode: "media-artwork", entityId: "" }), { mode: "light-tint" });
  });

  it("parses and serializes all valid modes", () => {
    assert.deepEqual(parseAreaBackground({ mode: "light-tint" }), { mode: "light-tint" });
    assert.deepEqual(parseAreaBackground({ mode: "area-picture" }), { mode: "area-picture" });
    assert.deepEqual(parseAreaBackground({ mode: "media-artwork", entityId: "media_player.tv" }), {
      mode: "media-artwork",
      entityId: "media_player.tv",
    });
    assert.deepEqual(
      parseAreaBackground(JSON.stringify({ mode: "media-artwork", entityId: "media_player.tv" })),
      { mode: "media-artwork", entityId: "media_player.tv" },
    );
    assert.deepEqual(parseAreaBackground({ mode: "camera", entityId: "camera.front" }), {
      mode: "camera",
      entityId: "camera.front",
    });
    assert.deepEqual(
      parseAreaBackground(JSON.stringify({ mode: "camera", entityId: "camera.front" })),
      { mode: "camera", entityId: "camera.front" },
    );
    assert.deepEqual(serializeAreaBackground({ mode: "light-tint" }), { mode: "light-tint" });
    assert.deepEqual(serializeAreaBackground({ mode: "area-picture" }), { mode: "area-picture" });
    assert.deepEqual(serializeAreaBackground({ mode: "media-artwork", entityId: "media_player.tv" }), {
      mode: "media-artwork",
      entityId: "media_player.tv",
    });
    assert.deepEqual(serializeAreaBackground({ mode: "camera", entityId: "camera.front" }), {
      mode: "camera",
      entityId: "camera.front",
    });
  });
});

describe("areaBackgroundEqual", () => {
  it("compares modes and camera entity ids", () => {
    assert.equal(areaBackgroundEqual({ mode: "light-tint" }, { mode: "light-tint" }), true);
    assert.equal(
      areaBackgroundEqual(
        { mode: "media-artwork", entityId: "media_player.a" },
        { mode: "media-artwork", entityId: "media_player.a" },
      ),
      true,
    );
    assert.equal(
      areaBackgroundEqual(
        { mode: "media-artwork", entityId: "media_player.a" },
        { mode: "media-artwork", entityId: "media_player.b" },
      ),
      false,
    );
    assert.equal(
      areaBackgroundEqual({ mode: "media-artwork", entityId: "media_player.a" }, { mode: "area-picture" }),
      false,
    );
    assert.equal(areaBackgroundEqual({ mode: "area-picture" }, { mode: "light-tint" }), false);
    assert.equal(
      areaBackgroundEqual(
        { mode: "camera", entityId: "camera.a" },
        { mode: "camera", entityId: "camera.a" },
      ),
      true,
    );
    assert.equal(
      areaBackgroundEqual(
        { mode: "camera", entityId: "camera.a" },
        { mode: "camera", entityId: "camera.b" },
      ),
      false,
    );
  });
});
