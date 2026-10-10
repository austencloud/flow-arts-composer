import type { PictographData } from "../domain/models/pictograph-data";
import { isVisibleMotion, type MotionData } from "../domain/models/motion-data";
import type {
  PreparedPictographData,
  PreparedRenderData,
} from "../domain/models/prepared-pictograph-data";
import type { PrepareOptions } from "./types";
import { bootProfiler } from "#lib/shared/analytics/boot-profiler.js";
import type { ArrowLifecycleManager } from "../../arrow/orchestration/services/arrow-lifecycle-manager";
import type { PropSvgLoader } from "../../prop/services/prop-svg-loader";
import type { PropPlacer } from "../../prop/services/prop-placer";
import { deriveGridMode as _deriveGridMode } from "../../grid/services/grid-mode-deriver";
import type { PropPosition } from "../../prop/domain/models/prop-position";
import type { PropAssets } from "../../prop/domain/models/prop-assets";
import { GridMode } from "../../grid/domain/enums/grid-enums";
import { PropType } from "../../prop/domain/enums/prop-type";
import {
  HandSide,
  MotionType,
} from "../domain/enums/pictograph-enums";
import { getPictographGeometryRevision } from "#lib/shared/render/services/pictograph-key-hasher.js";
import {
  fanAppearanceSignature,
  isFanPropType,
  normalizeFanAppearance,
} from "../../prop/domain/fan-appearance";
import { resolvePropRenderKey } from "../../prop/domain/prop-look";
import type { GridJoin } from "@tka/tka-types";
import {
  drawsHandPaths,
  getGridJoinLayout,
  gridJoinKey,
  gridJoinPropNudges,
  handPathMotionOverrides,
  isGridJoin,
} from "@tka/render-core";
import { getBetaOffsetSize } from "#lib/shared/render/core/constants/prop-classification.js";
// Prop-type defaults used when callers don't pass explicit options.
// Formerly imported getSettings() from app-state.svelte, but that module chain
// pulls in Firebase auth which accesses `window` — crashing in Web Workers.
// All render-path callers (ImageComposer, CompositionDispatcher) already pass
// prop types through options, so this default is only hit in edge cases.
const DEFAULT_PROP_SETTINGS = {
  leftPropType: PropType.STAFF,
  rightPropType: PropType.STAFF,
};

/** One warning per session per hand — a propless grid would otherwise emit
 *  hundreds of identical lines and bury the signal it exists to give. */
let warnedMissingPropPlacement = false;
function warnMissingPropPlacement(hand: HandSide): void {
  if (warnedMissingPropPlacement) return;
  warnedMissingPropPlacement = true;
  console.warn(
    `[PictographPreparer] Motion "${hand}" has no propPlacementData — rendering ` +
      `this cell without props. The data reached the renderer un-backfilled: run ` +
      `its read path through ensureStepPlacement() ` +
      `(pictograph/shared/services/motion-placement.ts). Further occurrences ` +
      `this session are suppressed.`
  );
}

export class PictographPreparer {
  private prepareCache = new Map<string, PreparedRenderData>();
  private pendingPrepares = new Map<string, Promise<PreparedRenderData>>();
  private cacheHits = 0;
  private cacheMisses = 0;

  constructor(
    private arrowManager: ArrowLifecycleManager,
    private propLoader: PropSvgLoader,
    private propPlacer: PropPlacer
  ) {}

  async prepareBatch(
    pictographs: PictographData[],
    options?: PrepareOptions
  ): Promise<PreparedPictographData[]> {
    return Promise.all(
      pictographs.map(async (p) => {
        try {
          return await this.prepareSingle(p, options);
        } catch (error) {
          console.error("Failed to prepare pictograph:", p.id, error);
          return p as PreparedPictographData;
        }
      })
    );
  }

  async prepareSingle(
    pictograph: PictographData,
    options?: PrepareOptions
  ): Promise<PreparedPictographData> {
    const cacheKey = this.deriveCacheKey(pictograph, options);
    const renderedPictograph = this.createRenderedPictograph(
      pictograph,
      options
    );

    const cached = this.prepareCache.get(cacheKey);
    if (cached) {
      this.cacheHits++;
      return { ...renderedPictograph, _prepared: cached };
    }

    const pending = this.pendingPrepares.get(cacheKey);
    if (pending) {
      const prepared = await pending;
      return { ...renderedPictograph, _prepared: prepared };
    }

    this.cacheMisses++;
    const join = pictograph.conjoined;
    const preparePromise = isGridJoin(join)
      ? this.doPrepareJoined(pictograph, join, options)
      : this.doPrepare(pictograph, options);
    this.pendingPrepares.set(cacheKey, preparePromise);

    try {
      const prepared = await preparePromise;
      // Don't poison the cache with a partial/failed prop-asset load (e.g. a
      // missing or unparseable prop SVG). calculateProps() swallows per-color
      // load errors and silently omits that color's asset/position so one
      // bad prop doesn't break the whole pictograph — but caching that
      // "successful, prop just missing" result would permanently hide the
      // prop under this key for the life of this singleton, even after the
      // underlying asset is fixed. Skip the cache write so the next request
      // for this key retries the load instead.
      if (!this.hasPropLoadFailure(pictograph, prepared, options)) {
        this.prepareCache.set(cacheKey, prepared);
      }

      return { ...renderedPictograph, _prepared: prepared };
    } finally {
      this.pendingPrepares.delete(cacheKey);
    }
  }

  /**
   * True when a visible motion that should have produced a rendered prop
   * (has propPlacementData) ended up with no entry in propAssets — i.e. its
   * SVG failed to load or parse. Mirrors the early-return/skip conditions in
   * calculateProps() so this check stays in lockstep with what actually gets
   * populated.
   */
  private hasPropLoadFailure(
    pictograph: PictographData,
    prepared: PreparedRenderData,
    options?: PrepareOptions
  ): boolean {
    const motions = pictograph.motions;
    if (!motions) return false;
    for (const [color, motion] of Object.entries(motions) as [
      HandSide,
      MotionData,
    ][]) {
      if (!isVisibleMotion(motion)) continue;
      if (color === HandSide.LEFT && options?.showLeftMotion === false)
        continue;
      if (color === HandSide.RIGHT && options?.showRightMotion === false)
        continue;
      if (!motion.propPlacementData) continue;
      if (!prepared.propAssets[color]) return true;
    }
    return false;
  }

  private async doPrepare(
    pictograph: PictographData,
    options?: PrepareOptions
  ): Promise<PreparedRenderData> {
    const gridMode = this.deriveGridMode(pictograph);

    const pictographWithPropOverrides = this.createRenderedPictograph(
      pictograph,
      options
    );

    const showLeft = isVisibleMotion(pictographWithPropOverrides.motions.left);
    const showRight = isVisibleMotion(
      pictographWithPropOverrides.motions.right
    );
    const soloMode = showLeft !== showRight;

    // Both render layers read the same motion snapshot. Prop assets and
    // placement do not depend on arrows finishing their asset/placement load.
    const [arrowResult, { propPositions, propAssets }] = await Promise.all([
      bootProfiler.measureAsync("pictograph:prepare-arrows", () =>
        this.arrowManager.coordinateArrowLifecycle(
          pictographWithPropOverrides,
          {
            themeMode: options?.themeMode,
            gridMode,
            soloMode,
          }
        )
      ),
      bootProfiler.measureAsync("pictograph:prepare-props", () =>
        this.calculateProps(pictographWithPropOverrides, options)
      ),
    ]);

    return {
      gridMode,
      arrowPositions: arrowResult.positions,
      arrowAssets: arrowResult.assets,
      arrowMirroring: arrowResult.mirroring,
      propPositions,
      propAssets,
    };
  }

  /**
   * Two joined grids, one per hand. Each hand is prepared alone on its own
   * grid (no beta offset, solo arrow placement) and moved by that grid's
   * offset. Props left lying along one line get the join's nudge instead of
   * a beta offset.
   */
  private async doPrepareJoined(
    pictograph: PictographData,
    join: GridJoin,
    options?: PrepareOptions
  ): Promise<PreparedRenderData> {
    // One-hand placement reads `pictograph.gridMode`, so pin the mode the two
    // hands derive together.
    const gridMode = this.deriveGridMode(pictograph);
    const pinned = { ...pictograph, gridMode };
    const [leftPrep, rightPrep] = await Promise.all([
      this.doPrepare(pinned, { ...options, showRightMotion: false }),
      this.doPrepare(pinned, { ...options, showLeftMotion: false }),
    ]);
    // The layout lines the join up with this grid; draw and nudge by that.
    const layout = getGridJoinLayout(join, gridMode);
    const { offsets } = layout;

    const prepared: PreparedRenderData = {
      gridMode,
      arrowPositions: {},
      arrowAssets: {},
      arrowMirroring: {},
      propPositions: {},
      propAssets: {},
      join: layout.join,
    };
    for (const [hand, prep, offset] of [
      [HandSide.LEFT, leftPrep, offsets.left],
      [HandSide.RIGHT, rightPrep, offsets.right],
    ] as const) {
      const arrow = prep.arrowPositions[hand];
      const arrowAsset = prep.arrowAssets[hand];
      if (arrow && arrowAsset) {
        prepared.arrowPositions[hand] = {
          ...arrow,
          x: arrow.x + offset.x,
          y: arrow.y + offset.y,
        };
        prepared.arrowAssets[hand] = arrowAsset;
        prepared.arrowMirroring[hand] = prep.arrowMirroring[hand] ?? false;
      }
      const prop = prep.propPositions[hand];
      const propAsset = prep.propAssets[hand];
      if (prop && propAsset) {
        prepared.propPositions[hand] = {
          ...prop,
          x: prop.x + offset.x,
          y: prop.y + offset.y,
        };
        prepared.propAssets[hand] = propAsset;
      }
    }

    const left = prepared.propPositions[HandSide.LEFT];
    const right = prepared.propPositions[HandSide.RIGHT];
    const leftAsset = prepared.propAssets[HandSide.LEFT];
    const rightAsset = prepared.propAssets[HandSide.RIGHT];
    if (left && right && leftAsset && rightAsset) {
      const halfLength = (asset: PropAssets) =>
        (Number(asset.viewBox.split(" ")[0]) || 0) / 2;
      const nudges = gridJoinPropNudges(
        layout.join,
        { ...left, halfLength: halfLength(leftAsset) },
        { ...right, halfLength: halfLength(rightAsset) },
        {
          left: getBetaOffsetSize(String(leftAsset.propType ?? PropType.STAFF)),
          right: getBetaOffsetSize(
            String(rightAsset.propType ?? PropType.STAFF)
          ),
        }
      );
      if (nudges) {
        prepared.propPositions[HandSide.LEFT] = {
          ...left,
          x: left.x + nudges.left.x,
          y: left.y + nudges.left.y,
        };
        prepared.propPositions[HandSide.RIGHT] = {
          ...right,
          x: right.x + nudges.right.x,
          y: right.y + nudges.right.y,
        };
      }
    }
    return prepared;
  }

  /**
   * Keep the motion data handed to the renderer aligned with the prop assets
   * prepared for it. Otherwise a hands preview could load hand artwork while
   * still reporting and styling the stale staff motion from its source step.
   */
  private createRenderedPictograph(
    pictograph: PictographData,
    options?: PrepareOptions
  ): PictographData {
    const settings = {
      leftPropType: options?.leftPropType ?? DEFAULT_PROP_SETTINGS.leftPropType,
      rightPropType:
        options?.rightPropType ?? DEFAULT_PROP_SETTINGS.rightPropType,
    };
    const useHandPath =
      options?.handPathMode ||
      drawsHandPaths(settings.leftPropType, settings.rightPropType);
    const effectivePictograph = useHandPath
      ? this.transformForHandPath(pictograph)
      : pictograph;

    return {
      ...effectivePictograph,
      motions: Object.fromEntries(
        this.getMotionsWithOverrides(effectivePictograph, settings, options)
      ) as PictographData["motions"],
    };
  }

  private deriveCacheKey(
    pictograph: PictographData,
    options?: PrepareOptions
  ): string {
    const left = pictograph.motions?.left;
    const right = pictograph.motions?.right;

    const effectiveLeft =
      options?.leftPropType ?? DEFAULT_PROP_SETTINGS.leftPropType;
    const effectiveRight =
      options?.rightPropType ?? DEFAULT_PROP_SETTINGS.rightPropType;

    const parts = [
      pictograph.letter ?? "none",
      left?.motionType ?? "none",
      left?.startLocation ?? "",
      left?.endLocation ?? "",
      left?.rotationDirection ?? "",
      left?.turns ?? 0,
      left?.startOrientation ?? "",
      left?.endOrientation ?? "",
      effectiveLeft ?? "",
      left?.arrowPlacementData?.manualAdjustmentX ?? 0,
      left?.arrowPlacementData?.manualAdjustmentY ?? 0,
      right?.motionType ?? "none",
      right?.startLocation ?? "",
      right?.endLocation ?? "",
      right?.rotationDirection ?? "",
      right?.turns ?? 0,
      right?.startOrientation ?? "",
      right?.endOrientation ?? "",
      effectiveRight ?? "",
      right?.arrowPlacementData?.manualAdjustmentX ?? 0,
      right?.arrowPlacementData?.manualAdjustmentY ?? 0,
      options?.themeMode ?? "dark",
      (options?.useGridVersion ?? false) ? "grid" : "thumbnail",
      options?.handPathMode ||
      drawsHandPaths(effectiveLeft, effectiveRight)
        ? "hp"
        : "",
      options?.showLeftMotion === false ? "hideBlue" : "",
      options?.showRightMotion === false ? "hideRed" : "",
      // Chirality changes the beta offset, so a flip must not reuse the
      // unflipped entry.
      options?.leftBuugengFlipped ? "bFlip" : "",
      options?.rightBuugengFlipped ? "rFlip" : "",
      // The fan build changes the prop artwork, so a build swap must not
      // reuse the entry prepared for another build.
      options?.fanAppearance &&
      (isFanPropType(effectiveLeft) || isFanPropType(effectiveRight))
        ? fanAppearanceSignature(normalizeFanAppearance(options.fanAppearance))
        : "",
      resolvePropRenderKey(effectiveLeft, {
        fanAppearance: options?.fanAppearance,
        propLook: options?.propLook,
        triangleGrip: options?.triangleGrip,
      }),
      resolvePropRenderKey(effectiveRight, {
        fanAppearance: options?.fanAppearance,
        propLook: options?.propLook,
        triangleGrip: options?.triangleGrip,
      }),
      pictograph.betaSwapped ? "bs" : "",
      getPictographGeometryRevision(pictograph) ?? "",
      // Visibility is render-relevant: an invisible placeholder hand must not
      // share a cache entry with a visible static twin.
      left?.isVisible === false ? "bInvis" : "",
      right?.isVisible === false ? "rInvis" : "",
    ];
    // Appended only when joined, so every single-grid key stays as it was.
    if (isGridJoin(pictograph.conjoined)) {
      parts.push(`join:${gridJoinKey(pictograph.conjoined)}`);
    }

    return parts.join("|");
  }

  private deriveGridMode(pictograph: PictographData): GridMode {
    if (pictograph.gridMode) {
      const raw = pictograph.gridMode;
      const lower = raw.toLowerCase() as GridMode;
      const validModes: Set<string> = new Set(Object.values(GridMode));
      if (validModes.has(lower)) return lower;
      return raw;
    }

    if (
      !isVisibleMotion(pictograph.motions?.left) ||
      !isVisibleMotion(pictograph.motions?.right)
    ) {
      return GridMode.DIAMOND;
    }
    try {
      return _deriveGridMode(pictograph.motions.left, pictograph.motions.right);
    } catch {
      return GridMode.DIAMOND;
    }
  }

  private async calculateProps(
    pictograph: PictographData,
    options?: PrepareOptions
  ): Promise<{
    propPositions: Partial<Record<HandSide, PropPosition>>;
    propAssets: Partial<Record<HandSide, PropAssets>>;
  }> {
    if (!pictograph.motions) {
      return { propPositions: {}, propAssets: {} };
    }

    const positions: Partial<Record<HandSide, PropPosition>> = {};
    const assets: Partial<Record<HandSide, PropAssets>> = {};
    const settings = {
      leftPropType: options?.leftPropType ?? DEFAULT_PROP_SETTINGS.leftPropType,
      rightPropType:
        options?.rightPropType ?? DEFAULT_PROP_SETTINGS.rightPropType,
      // Chirality decides whether the beta offset fires at all: two
      // opposite-chirality buugeng nest into an infinity symbol and must share
      // the hand point. Omitting these here made the beta calc read both props
      // as unflipped, so the nesting gate never fired in the app.
      leftBuugengFlipped: options?.leftBuugengFlipped ?? false,
      rightBuugengFlipped: options?.rightBuugengFlipped ?? false,
    };

    const motions = this.getMotionsWithOverrides(pictograph, settings, options);

    const visibility = {
      showLeft: options?.showLeftMotion,
      showRight: options?.showRightMotion,
    };

    await Promise.all(
      motions.map(async ([hand, motion]) => {
        try {
          if (!motion.propPlacementData) {
            // Bailing here renders the cell as grid + label with no prop in it,
            // and used to do so in total silence — which is how the same defect
            // shipped twice and was found by eye months later, in a screenshot.
            // Anything reaching the renderer should already have been through
            // ensureStepPlacement (motion-placement.ts); if it has not, the
            // stored data is lean and its READ PATH is what needs fixing, not
            // this guard. Warn once per session so a broken path is loud
            // without spamming a grid of hundreds of cells.
            warnMissingPropPlacement(hand);
            return;
          }

          const [renderData, placementData] = await Promise.all([
            this.propLoader.loadPropSvg(
              motion.propPlacementData,
              motion,
              options?.useGridVersion ?? false,
              options?.themeMode ||
                options?.fanAppearance ||
                options?.propLook ||
                options?.triangleGrip
                ? {
                    themeMode: options.themeMode,
                    fanAppearance: options.fanAppearance,
                    propLook: options.propLook,
                    triangleGrip: options.triangleGrip,
                  }
                : undefined
            ),
            this.propPlacer.calculatePlacement(
              pictograph,
              motion,
              visibility,
              settings
            ),
          ]);

          if (!renderData.svgData) return;

          assets[hand] = {
            imageSrc: renderData.svgData.svgContent,
            viewBox: `${renderData.svgData.viewBox.width} ${renderData.svgData.viewBox.height}`,
            center: renderData.svgData.center,
            propType: motion.propType,
          };

          positions[hand] = {
            x: placementData.positionX,
            y: placementData.positionY,
            rotation: placementData.rotationAngle,
          };
        } catch (error) {
          console.warn(`Failed to calculate ${hand} prop:`, error);
        }
      })
    );

    return { propPositions: positions, propAssets: assets };
  }

  private getMotionsWithOverrides(
    pictograph: PictographData,
    settings: { leftPropType?: unknown; rightPropType?: unknown },
    options?: PrepareOptions
  ): [HandSide, MotionData][] {
    return (
      (Object.entries(pictograph.motions || {}) as [HandSide, MotionData][])
        // invisible placeholder = hand not really there (both-required Step shape)
        .filter((entry): entry is [HandSide, MotionData] => {
          const [hand, motion] = entry;
          if (!isVisibleMotion(motion)) return false;
          if (hand === HandSide.LEFT && options?.showLeftMotion === false)
            return false;
          if (hand === HandSide.RIGHT && options?.showRightMotion === false)
            return false;
          return true;
        })
        .map(([hand, motion]) => {
          const explicitPropType =
            hand === HandSide.LEFT
              ? options?.leftPropType
              : options?.rightPropType;
          if (explicitPropType !== undefined) {
            return [hand, { ...motion, propType: explicitPropType }] as [
              HandSide,
              MotionData,
            ];
          }

          const settingsPropType =
            hand === HandSide.LEFT
              ? settings.leftPropType
              : settings.rightPropType;
          if (settingsPropType) {
            return [hand, { ...motion, propType: settingsPropType }] as [
              HandSide,
              MotionData,
            ];
          }
          return [hand, motion] as [HandSide, MotionData];
        })
    );
  }

  private transformForHandPath(pictograph: PictographData): PictographData {
    const motions = pictograph.motions;
    if (!motions) return pictograph;

    const transform = (motion: MotionData): MotionData => {
      const transformed = {
        ...motion,
        ...handPathMotionOverrides(motion),
      } as MotionData;
      // A static hand draws its arrow from the hand point, not a stored nudge.
      return motion.motionType === MotionType.STATIC
        ? {
            ...transformed,
            arrowPlacementData:
              undefined as unknown as typeof motion.arrowPlacementData,
          }
        : transformed;
    };

    return {
      ...pictograph,
      motions: {
        left: motions.left ? transform(motions.left) : undefined,
        right: motions.right ? transform(motions.right) : undefined,
      } as PictographData["motions"],
    };
  }

  clearCache(): void {
    this.prepareCache.clear();
    this.pendingPrepares.clear();
  }
}

import { arrowLifecycleManager } from "../../arrow/orchestration/services/arrow-lifecycle-manager";
import { propSvgLoader } from "../../prop/services/prop-svg-loader";
import { propPlacer } from "../../prop/services/prop-placer";

export const pictographPreparer = new PictographPreparer(
  arrowLifecycleManager,
  propSvgLoader,
  propPlacer
);
