/**
 * LedSampler
 *
 * Produces, for every frame, the world position and color of every
 * addressable LED on both props.
 *
 * Positions come from the same prop-local tip transform the fire and trail
 * effects use: a capsule lights the two tracked shaft ends, a pixel staff
 * lerps N points between those same two ends. Colors come from a
 * `StripPattern` materialized once per config change and sampled by frame
 * index, so the frame loop only reads bytes.
 */

import type { LedOverlayConfig, LedSample } from "../domain/types/led-types";
import { ledBrightnessToFloat } from "../domain/types/led-types";
import type { PropState } from "$lib/shared/foundation/domain/types/prop-state";
import { getTipPoints } from "../domain/types/prop-tip-points";
import type { StripPattern } from "$lib/shared/poi/domain/strip-pattern";
import { getPixel } from "$lib/shared/poi/domain/strip-pattern";
import {
  LedPatternMaterializer,
  type LedImageLoader,
} from "./led/led-pattern-materializer";
import {
  calculatePropCenter,
  type PropEndpointConfig,
} from "./prop-position-calculator";
import {
  tunnelColorFromHex,
  tunnelPropColor,
  tunnelPerformerPair,
  type TunnelPropColorPair,
} from "$lib/shared/sequence-viewer/tunnel/tunnel-prop-colors";

export interface LedSamplerConfig {
  canvasSize: number;
  leftPropDimensions: { width: number; height: number };
  rightPropDimensions: { width: number; height: number };
  leftPropType?: string;
  rightPropType?: string;
  /**
   * Overlaid tunnel layers. When present, LEDs are also emitted for each
   * layer's left/right props (propIndex >= 2) so the LED effect covers the whole
   * kaleidoscope. Layers share the base dimensions/types and use the fallback
   * position path. Absent = the plain two-prop case.
   */
  additionalLayers?: Array<{
    leftProp: PropState | null;
    rightProp: PropState | null;
    opacity?: number;
  }>;
  /** Tunnel rainbow spectrum. When false, overlaid layers take the pattern's
   *  own colors instead of a distinct per-copy spectrum color. Default true. */
  tunnelSpectrum?: boolean;
  tunnelPropColors?: TunnelPropColorPair | null;
}

/**
 * Hard ceiling on LEDs emitted per frame, shared with the renderers' instance
 * buffers. Two 200-LED staffs fill it exactly; a tunnel of 200-LED staffs
 * therefore renders its base pair and drops the overlaid copies rather than
 * silently overflowing the buffer.
 */
export const LED_SAMPLER_MAX_LEDS = 400;

/** Viewbox size for coordinate calculations (matches PropPositionCalculator) */
const VIEWBOX_SIZE = 950;

const BLACK = { r: 0, g: 0, b: 0 };

/** Frames skipped after a reset while the canvas size settles. */
const WARMUP_FRAMES = 3;

export class LedSampler {
  private readonly materializer: LedPatternMaterializer;

  /** Output array reused each frame */
  private outputLeds: LedSample[] = [];

  /** Skip first few frames after reset to let canvas size settle. */
  private warmupFramesRemaining = WARMUP_FRAMES;

  constructor(imageLoader?: LedImageLoader) {
    this.materializer = new LedPatternMaterializer(imageLoader);
  }

  update(
    leftProp: PropState | null,
    rightProp: PropState | null,
    config: LedSamplerConfig,
    currentTime: number,
    ledConfig: LedOverlayConfig
  ): LedSample[] {
    // Let canvas size settle before emitting LED positions
    if (this.warmupFramesRemaining > 0) {
      this.warmupFramesRemaining--;
      this.outputLeds.length = 0;
      return this.outputLeds;
    }

    this.outputLeds.length = 0;

    const ledCount = Math.max(1, Math.round(ledConfig.device.ledCount));
    const pattern = this.materializer.resolve(ledConfig.pattern, ledCount);
    const frameIndex = pattern
      ? patternFrameIndex(
          currentTime,
          ledConfig.cycleDuration,
          pattern.frameCount
        )
      : 0;
    // Brightness is a flux term, applied once by the renderer's photometry
    // (PROP_REFERENCE_FLUX x level). Applying it here too would square it.
    // This gain only normalizes pattern bytes to [0,1].
    const gain = 1 / 255;

    let count = 0;
    if (leftProp) {
      count = this.emitProp(
        leftProp,
        config,
        config.leftPropDimensions,
        config.leftPropType ?? null,
        0,
        ledCount,
        pattern,
        frameIndex,
        gain,
        config.tunnelPropColors
          ? tunnelColorFromHex(config.tunnelPropColors.left).rgb01
          : null,
        count
      );
    }
    if (rightProp) {
      count = this.emitProp(
        rightProp,
        config,
        config.rightPropDimensions,
        config.rightPropType ?? null,
        1,
        ledCount,
        pattern,
        frameIndex,
        gain,
        config.tunnelPropColors
          ? tunnelColorFromHex(config.tunnelPropColors.right).rgb01
          : null,
        count
      );
    }

    // Overlaid tunnel layers: each kaleidoscope copy gets its own spectrum
    // color so the copies stay distinguishable, exactly as they did in v1.
    const layers = config.additionalLayers;
    if (layers && layers.length > 0) {
      const spectrum =
        (config.tunnelSpectrum ?? true) && !config.tunnelPropColors;
      for (
        let li = 0;
        li < layers.length && count < LED_SAMPLER_MAX_LEDS;
        li++
      ) {
        const layer = layers[li]!;
        const exact = config.tunnelPropColors
          ? tunnelPerformerPair(config.tunnelPropColors, li + 1)
          : null;
        if (layer.leftProp) {
          const propIndex = 2 + li * 2;
          count = this.emitProp(
            layer.leftProp,
            config,
            config.leftPropDimensions,
            config.leftPropType ?? null,
            propIndex,
            ledCount,
            pattern,
            frameIndex,
            gain,
            exact
              ? tunnelColorFromHex(exact.left).rgb01
              : spectrum
                ? tunnelPropColor(propIndex, layers.length).rgb01
                : null,
            count,
            layer.opacity ?? 1
          );
        }
        if (layer.rightProp) {
          const propIndex = 3 + li * 2;
          count = this.emitProp(
            layer.rightProp,
            config,
            config.rightPropDimensions,
            config.rightPropType ?? null,
            propIndex,
            ledCount,
            pattern,
            frameIndex,
            gain,
            exact
              ? tunnelColorFromHex(exact.right).rgb01
              : spectrum
                ? tunnelPropColor(propIndex, layers.length).rgb01
                : null,
            count,
            layer.opacity ?? 1
          );
        }
      }
    }

    return this.outputLeds;
  }

  reset(): void {
    this.outputLeds.length = 0;
    this.warmupFramesRemaining = WARMUP_FRAMES;
    this.materializer.reset();
  }

  /**
   * Emit every LED for one prop. `overrideColor` (0-1 RGB) replaces the
   * pattern color for tunnel-layer copies.
   */
  private emitProp(
    prop: PropState,
    config: LedSamplerConfig,
    propDimensions: { width: number; height: number },
    propType: string | null,
    propIndex: number,
    ledCount: number,
    pattern: StripPattern | null,
    frameIndex: number,
    gain: number,
    overrideColor: { r: number; g: number; b: number } | null,
    outputStartIndex: number,
    brightnessScale = 1
  ): number {
    const clampedBrightness = Math.max(0, Math.min(1, brightnessScale));
    const points = getTipPoints(propType).points;
    if (points.length === 0) return outputStartIndex;

    const endpointConfig: PropEndpointConfig = {
      canvasSize: config.canvasSize,
      propDimensions,
    };
    const center = calculatePropCenter(prop, endpointConfig);
    const gridScaleFactor = config.canvasSize / VIEWBOX_SIZE;
    const angle = prop.staffRotationAngle;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    // A capsule lights the prop's own tip points. A pixel staff spans the
    // strip between the first and last of those same tracked points, so it
    // needs no new tracking — and a single-point prop (e.g. a club) simply
    // lights that one point.
    const spanStrip = ledCount > points.length && points.length >= 2;
    const emitCount = spanStrip ? ledCount : Math.min(ledCount, points.length);
    const first = points[0]!;
    const last = points[points.length - 1]!;

    let outputIndex = outputStartIndex;
    for (let i = 0; i < emitCount && outputIndex < LED_SAMPLER_MAX_LEDS; i++) {
      const t = emitCount > 1 ? i / (emitCount - 1) : 0;
      const dx = spanStrip
        ? first.dx + (last.dx - first.dx) * t
        : points[i]!.dx;
      const dy = spanStrip
        ? first.dy + (last.dy - first.dy) * t
        : points[i]!.dy;

      const x = center.x + (dx * cosA - dy * sinA) * gridScaleFactor;
      const y = center.y + (dx * sinA + dy * cosA) * gridScaleFactor;

      // Tip-effect assignment is per shaft end, so a 200-LED strip still
      // resolves against endpoint 0 or 1.
      const endpointIndex = spanStrip ? (t < 0.5 ? 0 : points.length - 1) : i;

      const color = overrideColor
        ? overrideColor
        : pattern
          ? scale(getPixel(pattern, frameIndex, i % pattern.ledCount), gain)
          : BLACK;

      this.emitLed(
        x,
        y,
        propIndex,
        i,
        endpointIndex,
        color,
        outputIndex,
        clampedBrightness
      );
      outputIndex++;
    }

    return outputIndex;
  }

  private emitLed(
    x: number,
    y: number,
    propIndex: number,
    ledIndex: number,
    endpointIndex: number,
    color: { r: number; g: number; b: number },
    outputIndex: number,
    brightness: number
  ): void {
    const existing = this.outputLeds[outputIndex];
    if (existing) {
      existing.x = x;
      existing.y = y;
      existing.propIndex = propIndex;
      existing.ledIndex = ledIndex;
      existing.endpointIndex = endpointIndex;
      existing.brightness = brightness;
      existing.r = color.r;
      existing.g = color.g;
      existing.b = color.b;
    } else {
      this.outputLeds.push({
        x,
        y,
        propIndex,
        ledIndex,
        endpointIndex,
        brightness,
        r: color.r,
        g: color.g,
        b: color.b,
      });
    }
  }
}

/**
 * Which frame of the pattern loop is showing at `currentTime` (ms). One clock
 * drives every prop, so the whole rig stays in phase.
 */
export function patternFrameIndex(
  currentTime: number,
  cycleDuration: number,
  frameCount: number
): number {
  if (frameCount <= 0) return 0;
  const seconds = Math.max(0.001, cycleDuration);
  const phase = (((currentTime / 1000 / seconds) % 1) + 1) % 1;
  return Math.min(frameCount - 1, Math.floor(phase * frameCount));
}

function scale(
  color: { r: number; g: number; b: number },
  gain: number
): { r: number; g: number; b: number } {
  return { r: color.r * gain, g: color.g * gain, b: color.b * gain };
}
