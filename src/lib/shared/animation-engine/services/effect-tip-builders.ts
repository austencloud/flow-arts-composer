import type { EmitterTip } from "#lib/shared/effects/renderers/emitter-tip.js";
import {
  dimHex,
  spotlightFactor,
  tunnelPropColor,
  tunnelPerformerPair,
  type TunnelPropColorPair,
  type TunnelLayerSelection,
} from "#lib/shared/sequence-viewer/tunnel/tunnel-prop-colors.js";
import type {
  RenderedPropTransform,
  PropTipData,
} from "../domain/types/fire-types";
import { resolveEffect } from "../domain/types/tip-effect-types";
import type {
  EffectType,
  TipEffectMap,
} from "../domain/types/tip-effect-types";
import type { TrailPoint } from "../domain/types/trail-types";
import type { RenderFrameParams } from "./IAnimationRenderLoop";

// Per-tip input for the overlay effects: which tracked prop tips an effect
// owns this frame, and the colour each tip inherits from the staff it sits
// on. Pure transforms shared by the dispatch registry and the render loop.

export function hasTrailTips(map: TipEffectMap | undefined): boolean {
  if (!map) return false;
  return Object.values(map).some((a) => a.effect === "trails");
}

/**
 * Build the flat emitter list for the per-tip overlay effects. Unlike
 * buildFourPosTips (4 fixed slots, base props only), this carries every
 * matching tip including tunnel kaleidoscope layers (propIndex >= 2), each
 * tagged with its end (for tracking-mode) and its spectrum-gated color (for
 * prop-colored effects). Color gating mirrors the trail overlay: base props
 * use the trail colors; layers use the spectrum fan when rainbow is on, base
 * colors when off.
 */
export function buildEmitterTips(
  tips: PropTipData[],
  tipMap: TipEffectMap,
  effect: EffectType,
  params: RenderFrameParams
): EmitterTip[] {
  const layerCount = params.props.additionalLayers.length;
  const spectrum =
    (params.props.tunnelSpectrum ?? true) && !params.props.tunnelPropColors;
  const baseLeft =
    params.props.tunnelPropColors?.left ?? params.trailSettings.leftColor;
  const baseRight =
    params.props.tunnelPropColors?.right ?? params.trailSettings.rightColor;
  const out: EmitterTip[] = [];
  for (const t of tips) {
    if (resolveEffect(t.propIndex, t.tipIndex, tipMap, {}) !== effect) continue;
    out.push({
      x: t.x,
      y: t.y,
      propIndex: t.propIndex,
      tipIndex: t.tipIndex,
      end: t.tipIndex === 0 ? "A" : "B",
      color: resolveTipColor(
        t.propIndex,
        layerCount,
        spectrum,
        baseLeft,
        baseRight,
        params.props.tunnelSelectedLayer ?? null,
        params.props.tunnelPropColors
      ),
    });
  }
  return out;
}

/**
 * Resolve a tip's prop color the way the trail overlay does: the base pair
 * (propIndex 0/1) uses the trail colors; overlaid tunnel layers (propIndex >= 2)
 * fan across the spectrum when the rainbow toggle is on, base colors by parity
 * (even = left family, odd = right) when off. Shared by buildEmitterTips and
 * buildArrayTips so every per-tip effect — bloom and pulse included —
 * color-matches the staff it sits on instead of collapsing every copy to red.
 */
export function resolveTipColor(
  propIndex: number,
  layerCount: number,
  spectrum: boolean,
  baseLeft: string,
  baseRight: string,
  selectedLayer: TunnelLayerSelection = null,
  colors?: TunnelPropColorPair | null
): string {
  const isLeft = propIndex % 2 === 0;
  const exact = colors
    ? tunnelPerformerPair(colors, Math.floor(propIndex / 2))
    : null;
  const raw = exact
    ? isLeft
      ? exact.left
      : exact.right
    : propIndex <= 1
      ? isLeft
        ? baseLeft
        : baseRight
      : spectrum
        ? tunnelPropColor(propIndex, layerCount).hex
        : isLeft
          ? baseLeft
          : baseRight;
  // Spotlight: dim the tip's color when another performer is selected.
  return dimHex(raw, spotlightFactor(selectedLayer, Math.floor(propIndex / 2)));
}

/**
 * Build array-of-tips input for bloom and pulse (effects that need
 * {x, y, propIndex, tipIndex, leftColor, rightColor}[] with center fallback).
 */
export function buildArrayTips(
  tips: PropTipData[],
  tipMap: TipEffectMap,
  effect: EffectType,
  params: RenderFrameParams,
  renderedTransforms:
    | {
        left: RenderedPropTransform | null;
        right: RenderedPropTransform | null;
      }
    | undefined
): {
  x: number;
  y: number;
  propIndex: number;
  tipIndex: number;
  /** Which end of the prop (0 or 1); absent on center fallbacks. */
  end?: number;
  color: string;
  velocityX?: number;
  velocityY?: number;
}[] {
  const layerCount = params.props.additionalLayers.length;
  const spectrum =
    (params.props.tunnelSpectrum ?? true) && !params.props.tunnelPropColors;
  const baseLeft =
    params.props.tunnelPropColors?.left ?? params.trailSettings.leftColor;
  const baseRight =
    params.props.tunnelPropColors?.right ?? params.trailSettings.rightColor;
  const result: {
    x: number;
    y: number;
    propIndex: number;
    tipIndex: number;
    end?: number;
    color: string;
    velocityX?: number;
    velocityY?: number;
  }[] = [];
  let globalTipIndex = 0;
  for (const t of tips) {
    if (resolveEffect(t.propIndex, t.tipIndex, tipMap, {}) !== effect) continue;
    result.push({
      x: t.x,
      y: t.y,
      propIndex: t.propIndex,
      tipIndex: globalTipIndex++,
      end: t.tipIndex,
      velocityX: t.velocityX,
      velocityY: t.velocityY,
      color: resolveTipColor(
        t.propIndex,
        layerCount,
        spectrum,
        baseLeft,
        baseRight,
        params.props.tunnelSelectedLayer ?? null,
        params.props.tunnelPropColors
      ),
    });
  }
  // Center fallback for props with no tip-tracker output (base pair only).
  const leftTransform = renderedTransforms?.left;
  if (
    params.props.leftProp &&
    leftTransform &&
    resolveEffect(0, 0, tipMap, {}) === effect &&
    !result.some((t) => t.propIndex === 0)
  ) {
    result.push({
      x: leftTransform.centerX,
      y: leftTransform.centerY,
      propIndex: 0,
      tipIndex: globalTipIndex++,
      color: baseLeft,
    });
  }
  const rightTransform = renderedTransforms?.right;
  if (
    params.props.rightProp &&
    rightTransform &&
    resolveEffect(1, 0, tipMap, {}) === effect &&
    !result.some((t) => t.propIndex === 1)
  ) {
    result.push({
      x: rightTransform.centerX,
      y: rightTransform.centerY,
      propIndex: 1,
      tipIndex: globalTipIndex++,
      color: baseRight,
    });
  }
  return result;
}

export function compactByTrailFlag(
  points: TrailPoint[],
  tipMap: TipEffectMap
): void {
  let w = 0;
  for (let i = 0; i < points.length; i++) {
    const pt = points[i]!;
    if (resolveEffect(pt.propIndex, pt.tipIndex, tipMap, {}) === "trails") {
      points[w++] = pt;
    }
  }
  points.length = w;
}
