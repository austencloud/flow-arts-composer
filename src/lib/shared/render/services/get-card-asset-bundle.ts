//
// MAIN-THREAD entry point for building an AssetBundle before dispatching to the
// worker pool. Warms the singleton svgCache by RENDERING each sequence once at a
// tiny size — preparing only selects svg asset strings and never populates the
// cache (the decode+cache happens inside Canvas2DDirectRenderer at render time).
// svgCache keys are content-hashed (independent of canvas size), so a tiny render
// populates EXACTLY the keys the full-size worker renders will request.

import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import type { SequenceExportOptions } from "../domain/models/sequence-export-options";
import { buildAssetBundle, type AssetBundle } from "./card-asset-bundle";
import { getImageComposer } from "../get-image-composer";

const WARM_W = 120;
const WARM_H = 168; // ~5:7 card-ish; size is irrelevant to cache keys, just keep it tiny

/**
 * MAIN THREAD. Renders every sequence once at a tiny size to populate the
 * singleton svgCache + svgAssetLoader with every prop/arrow/grid/letter the
 * full-size worker renders will need, then delegates to `buildAssetBundle` to
 * snapshot the caches as transferable ImageBitmaps for the worker pool.
 */
export function getCardAssetBundle(
  sequences: SequenceData[],
  opts: { leftPropType: PropType; rightPropType: PropType; theme: string; iconPaths?: string[] },
): Promise<AssetBundle> {
  return buildAssetBundle(sequences, opts, async (seqs, o) => {
    const composer = getImageComposer();
    const warmOptions: Partial<SequenceExportOptions> = {
      deckCard: { contentWidth: WARM_W, contentHeight: WARM_H },
      includeStartPosition: true,
      startPositionLayout: "row",
      addStepNumbers: true,
      addWord: true, // exercises the word/glyph path too
      stepSize: 300,
      stepScale: 1,
      scale: 1,
      rightVisible: true,
      leftVisible: true,
      addReversalSymbols: true,
      combinedGrids: false,
      leftPropTypeOverride: o.leftPropType,
      rightPropTypeOverride: o.rightPropType,
      visibilityOverrides: {
        showTKA: true,
        showTnD: false,
        showElemental: false,
        showPositions: false,
        showHandColorKey: true,
        showReversals: true,
        showNonRadialPoints: false,
        showGrid: true,
        printMode: true,
        darkMode: false,
        handPointVisibility: "all",
        leftPropType: o.leftPropType,
        rightPropType: o.rightPropType,
      },
    };
    // Render each sequence once at tiny size to populate the singleton svgCache
    // with every prop/arrow/grid/letter the full-size worker renders will need.
    for (const seq of seqs) {
      try {
        await composer.composeSequenceImage(seq, warmOptions);
      } catch (e) {
        console.warn("[getCardAssetBundle] warm render failed for", seq.word ?? seq.id, e);
      }
    }
  });
}
