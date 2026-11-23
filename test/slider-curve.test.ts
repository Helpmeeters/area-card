import assert from "node:assert/strict";
import test from "node:test";
import {
  curveFractionToPosition,
  curvePositionToFraction,
  patchMushroomSliderPrototype,
  shouldCurveSlider,
  type SliderLike,
} from "../src/slider-curve";

test("curve endpoints and midpoint are preserved", () => {
  assert.equal(curvePositionToFraction(0), 0);
  assert.equal(curvePositionToFraction(0.5), 0.5);
  assert.equal(curvePositionToFraction(1), 1);
  assert.equal(curveFractionToPosition(0), 0);
  assert.equal(curveFractionToPosition(0.5), 0.5);
  assert.equal(curveFractionToPosition(1), 1);
});

test("curve clamps out-of-range and NaN inputs safely", () => {
  assert.equal(curvePositionToFraction(-0.25), 0);
  assert.equal(curvePositionToFraction(1.5), 1);
  assert.equal(curvePositionToFraction(Number.NaN), 0);
  assert.equal(curveFractionToPosition(-0.1), 0);
  assert.equal(curveFractionToPosition(1.2), 1);
  assert.equal(curveFractionToPosition(Number.NaN), 0);
});

test("curve is symmetric and slows down near both ends", () => {
  for (const p of [0.05, 0.1, 0.15, 0.2, 0.3, 0.4]) {
    const low = curvePositionToFraction(p);
    const high = curvePositionToFraction(1 - p);
    assert.ok(Math.abs(low + high - 1) < 1e-12, `symmetry at p=${p}`);
    // Near 0, value grows slower than linear; near 1, closer to 1 than linear.
    assert.ok(low < p, `expected f(${p})=${low} < ${p}`);
    assert.ok(high > 1 - p, `expected f(${1 - p})=${high} > ${1 - p}`);
  }
  // Single digits (0..10%) and nineties (90..100%) each get >15% of track width.
  assert.ok(curveFractionToPosition(0.1) > 0.15);
  assert.ok(1 - curveFractionToPosition(0.9) > 0.15);
});

test("curvePositionToFraction and curveFractionToPosition are exact inverses", () => {
  for (let i = 0; i <= 100; i += 1) {
    const t = i / 100;
    const roundTrip1 = curveFractionToPosition(curvePositionToFraction(t));
    const roundTrip2 = curvePositionToFraction(curveFractionToPosition(t));
    assert.ok(Math.abs(roundTrip1 - t) < 1e-12, `roundTrip1 at ${t}: ${roundTrip1}`);
    assert.ok(Math.abs(roundTrip2 - t) < 1e-12, `roundTrip2 at ${t}: ${roundTrip2}`);
  }
});

test("shouldCurveSlider targets percent fill sliders and skips gradient or coarse sliders", () => {
  // Light brightness
  assert.equal(shouldCurveSlider({ min: 1, max: 100, step: 1, showActive: true }), true);
  // Cover position / volume / fine fan
  assert.equal(shouldCurveSlider({ min: 0, max: 100, step: 1, showActive: true }), true);
  // Humidifier target humidity
  assert.equal(shouldCurveSlider({ min: 30, max: 80, step: 1, showActive: true }), true);
  // Light hue & color temp (indicator over gradient, no showActive)
  assert.equal(shouldCurveSlider({ min: 0, max: 100, step: 1, showIndicator: true }), false);
  assert.equal(shouldCurveSlider({ min: 2700, max: 6500, step: 1, showIndicator: true }), false);
  // 3-speed fan (coarse step)
  assert.equal(shouldCurveSlider({ min: 0, max: 100, step: 33, showActive: true }), false);
});

test("patchMushroomSliderPrototype curves percent sliders and preserves linear for others", () => {
  class FakeSlider implements SliderLike {
    min = 0;
    max = 100;
    step = 1;
    showActive?: boolean;
    showIndicator?: boolean;
    valueToPercentage(value: number): number {
      return (value - this.min) / (this.max - this.min);
    }
    percentageToValue(percentage: number): number {
      return (this.max - this.min) * percentage + this.min;
    }
  }

  assert.equal(patchMushroomSliderPrototype(FakeSlider.prototype), true);
  // Idempotent on second call
  assert.equal(patchMushroomSliderPrototype(FakeSlider.prototype), false);

  const brightness = new FakeSlider();
  brightness.min = 1;
  brightness.max = 100;
  brightness.showActive = true;

  // Off light passes value 0 with min=1 -> clamps cleanly to 0 (no NaN)
  assert.equal(brightness.valueToPercentage(0), 0);
  // 10% track position yields a single-digit brightness (< 6%)
  assert.ok(brightness.percentageToValue(0.1) < 6);
  // 90% track position yields a nineties brightness (> 95%)
  assert.ok(brightness.percentageToValue(0.9) > 95);
  // Pointer position and rendered bar stay 1:1
  for (const p of [0, 0.05, 0.15, 0.5, 0.85, 0.95, 1]) {
    const v = brightness.percentageToValue(p);
    assert.ok(Math.abs(brightness.valueToPercentage(v) - p) < 1e-12);
  }

  // Color temp slider stays strictly linear
  const colorTemp = new FakeSlider();
  colorTemp.min = 2700;
  colorTemp.max = 6500;
  colorTemp.showIndicator = true;
  assert.equal(colorTemp.percentageToValue(0.25), 2700 + (6500 - 2700) * 0.25);
  assert.equal(colorTemp.valueToPercentage(2700 + (6500 - 2700) * 0.25), 0.25);
});
