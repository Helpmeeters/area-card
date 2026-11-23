/**
 * Symmetric ease-in-out curve for percent sliders (`area-card-mushroom-slider`).
 *
 * Slows down value changes near both ends (single digits and nineties) so fine
 * values are easy to dial in, while staying strictly monotonic and invertible
 * so the filled bar tracks the pointer 1:1.
 */

export const SLIDER_CURVE_EXPONENT = 1.65;
export const MUSHROOM_SLIDER_TAG = "area-card-mushroom-slider";

const PATCHED = Symbol.for("area-card.slider-curve.patched");

export interface SliderLike {
  min: number;
  max: number;
  step: number;
  showActive?: boolean;
  showIndicator?: boolean;
  valueToPercentage(value: number): number;
  percentageToValue(percentage: number): number;
  [PATCHED]?: boolean;
}

function clamp01(x: number): number {
  if (!Number.isFinite(x) || x <= 0) return 0;
  if (x >= 1) return 1;
  return x;
}

/** Map normalized track position [0, 1] -> normalized value [0, 1]. */
export function curvePositionToFraction(
  position: number,
  exponent = SLIDER_CURVE_EXPONENT,
): number {
  const p = clamp01(position);
  if (p < 0.5) return 0.5 * Math.pow(2 * p, exponent);
  return 1 - 0.5 * Math.pow(2 * (1 - p), exponent);
}

/** Exact inverse: map normalized value [0, 1] -> normalized track position [0, 1]. */
export function curveFractionToPosition(
  fraction: number,
  exponent = SLIDER_CURVE_EXPONENT,
): number {
  const u = clamp01(fraction);
  if (u < 0.5) return 0.5 * Math.pow(2 * u, 1 / exponent);
  return 1 - 0.5 * Math.pow(2 * (1 - u), 1 / exponent);
}

/**
 * Only curve continuous percent-style fill sliders (brightness, cover position,
 * humidity, volume, fine fan speed). Leave gradient/indicator sliders (hue,
 * color temp, cover tilt) and coarse stepped sliders linear so indicators stay
 * aligned with their background gradients and steps stay evenly spaced.
 */
export function shouldCurveSlider(
  slider: Pick<SliderLike, "min" | "max" | "step" | "showActive" | "showIndicator">,
): boolean {
  if (!slider.showActive || slider.showIndicator) return false;
  if (!Number.isFinite(slider.min) || !Number.isFinite(slider.max)) return false;
  if (slider.max - slider.min < 20) return false;
  if (!Number.isFinite(slider.step) || slider.step <= 0 || slider.step > 5) return false;
  return true;
}

export function patchMushroomSliderPrototype(proto: SliderLike): boolean {
  if (proto[PATCHED]) return false;
  const origValueToPercentage = proto.valueToPercentage;
  const origPercentageToValue = proto.percentageToValue;
  if (typeof origValueToPercentage !== "function" || typeof origPercentageToValue !== "function") {
    return false;
  }

  proto.valueToPercentage = function (this: SliderLike, value: number): number {
    if (!shouldCurveSlider(this)) {
      return origValueToPercentage.call(this, value);
    }
    const span = this.max - this.min;
    const linear = (value - this.min) / span;
    return curveFractionToPosition(linear);
  };

  proto.percentageToValue = function (this: SliderLike, percentage: number): number {
    if (!shouldCurveSlider(this)) {
      return origPercentageToValue.call(this, percentage);
    }
    const span = this.max - this.min;
    const curved = curvePositionToFraction(percentage);
    return span * curved + this.min;
  };

  proto[PATCHED] = true;
  return true;
}

export function patchMushroomSlider(): boolean {
  if (typeof customElements === "undefined") return false;
  const ctor = customElements.get(MUSHROOM_SLIDER_TAG);
  if (!ctor?.prototype) return false;
  return patchMushroomSliderPrototype(ctor.prototype as SliderLike);
}

/** Patch immediately if already defined, or as soon as Mushroom defines it. */
export function installMushroomSliderCurve(): void {
  if (typeof customElements === "undefined") return;
  if (patchMushroomSlider()) return;
  void customElements.whenDefined(MUSHROOM_SLIDER_TAG).then(() => {
    patchMushroomSlider();
  });
}
