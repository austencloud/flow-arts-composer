import type { TrailPoint, TrailSettings } from "../domain/types/trail-types";
import type { AdditionalLayerRenderData } from "../domain/types/animation-render-types";
import type { PropState } from "$lib/shared/foundation/domain/types/prop-state";
import type { TipEffectMap } from "../domain/types/tip-effect-types";
import type { TunnelPropColorPair } from "$lib/shared/sequence-viewer/tunnel/tunnel-prop-colors";

export interface TrailOverlayRenderParams {
  leftTrailPoints: TrailPoint[];
  rightTrailPoints: TrailPoint[];
  trailSettings: TrailSettings;
  deltaTime: number;
  canvasSize: number;
  hasLeft: boolean;
  hasRight: boolean;
  additionalLayers?: AdditionalLayerRenderData[];
  /** Tunnel rainbow spectrum. When false, overlaid layer trails inherit the base
   *  blue/red trail color instead of a per-layer spectrum hue. Default true. */
  tunnelSpectrum?: boolean;
  tunnelPropColors?: TunnelPropColorPair | null;
  /** Spotlight: the selected performer (0 = base "you", k = copy arm k), or null.
   *  When set, every other layer's trail dims. Default null (no spotlight). */
  tunnelSelectedLayer?: number | readonly number[] | null;
  /** Raw prop states - overlay reads positions directly (fire-renderer pattern) */
  leftProp?: PropState | null;
  rightProp?: PropState | null;
  /** Prop type names for correct trail endpoint resolution */
  leftPropType?: string | null;
  rightPropType?: string | null;
  /** Chirality flip as drawn this frame; trail sources mirror with the sprite. */
  leftPropFlipped?: boolean;
  rightPropFlipped?: boolean;
  /** Current animation time in ms (performance.now() or virtualTime) */
  currentTime: number;
  /** Per-tip effect assignments — gates which tips capture trail points */
  tipEffectMap?: TipEffectMap;
  /** True on the frame the animation wrapped from end back to start. */
  loopDetected?: boolean;
  /**
   * Whether the sequence's end position equals its start position. When false,
   * the loop teleports the props, so the overlay must drop its source rings on
   * `loopDetected` to avoid drawing a straight line from the end position to the
   * start. When true, end == start, so the trail flows across the boundary and
   * must NOT be reset.
   */
  isSeamlesslyLoopable?: boolean;
  /**
   * True while that hand's prop-type is mid hot-swap — either the texture is
   * still loading, or (post-load) its prop crossfade is still running. Tip
   * geometry (getTipPoints/getTrailPointConfig) differs per prop type, so
   * capturing a new point against the swap target's geometry while the old
   * sprite is still visible stamps a straight line connecting the two
   * different physical tip locations — the reported "trail jumps
   * across in a straight line" artifact. While true: new tip captures for
   * THIS color are skipped (the ring/tail freeze and recede as if the prop
   * had stopped, so the existing trail shrinks/fades naturally instead of
   * jumping); the already-stamped accumulator pixels are untouched and keep
   * decaying every frame via the backend's normal per-frame decay. On the
   * frame this flips back to false, that color's ring/tail are reset so the
   * next capture starts a fresh, disconnected segment at the new geometry —
   * WITHOUT touching the accumulator (unlike a hidden→visible transition,
   * this never bumps the tip epoch / allocates a fresh FBO, because the goal
   * is exactly to let the old trail keep fading, not wipe it). Default false
   * — zero behavior change for callers that don't pass it.
   */
  leftPropSwapSuppressed?: boolean;
  /** Right-hand counterpart of leftPropSwapSuppressed. */
  rightPropSwapSuppressed?: boolean;
}

export interface ITrailOverlayCanvas {
  initialize(
    container: HTMLElement,
    width: number,
    height: number
  ): void | Promise<void>;
  resize(width: number, height: number): void;
  renderFrame(params: TrailOverlayRenderParams): void;
  clear(): void;
  clearBuffers(): void;
  setVisible(visible: boolean): void;
  setCanvasZIndex(z: number): void;
  dispose(): void;
}
