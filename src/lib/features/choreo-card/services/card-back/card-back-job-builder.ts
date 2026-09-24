/**
 * card-back-job-builder.ts
 *
 * Assembles a `BackJob` (plain data + ImageBitmaps) from a SequenceData on the
 * MAIN THREAD. This is the entry point the renderer (P1.7) and the worker path
 * (Phase 2) call. Everything DOM/SVG/font-dependent — decorations, brand, URL,
 * difficulty badge, loop icons, glyphs, step count, start pictograph — is
 * rasterized to an ImageBitmap HERE. The downstream painter (P1.6) only does
 * gradient fills + a Path2D mandala + drawImage, so it needs no DOM.
 *
 * PROOF MODE: the print path uses getCardBackThemeVisuals(theme) ===
 * getProofModeVisuals(theme): white background gradient, decorationOpacity 0
 * (decorations HIDDEN → null), dark text (#111), single-stop linear-gradient
 * borders. This builder uses getCardBackThemeVisuals exactly as CardBack.svelte
 * does, so colors match.
 *
 * The mandala geometry calculator + the element rasterizers touch the DOM /
 * canvas (and the calculator is browser-only), so all of them are injectable
 * via the `deps` parameter — defaulting to the real implementations — for
 * jsdom-based unit testing.
 */

import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import { pairTipEnds } from "$lib/shared/pictograph/prop/domain/prop-tip-ends";
import { applyMandalaHandColors } from "$lib/shared/mandala/domain/mandala-palette";
import type { MandalaPaths, MandalaPalette } from "$lib/shared/mandala/domain/mandala-types";
import type { MandalaPathOptions } from "$lib/shared/mandala/services/types";
import {
  MANDALA_STANDARD_TIP_DX,
  DARK_MOTION_BLUE_STROKE,
  DARK_MOTION_BLUE_FILL,
  DARK_MOTION_RED_STROKE,
  DARK_MOTION_RED_FILL,
  DARK_MOTION_PURPLE_STROKE,
  DARK_MOTION_PURPLE_FILL,
  LIGHT_MOTION_BLUE_STROKE,
  LIGHT_MOTION_BLUE_FILL,
  LIGHT_MOTION_RED_STROKE,
  LIGHT_MOTION_RED_FILL,
  LIGHT_MOTION_PURPLE_STROKE,
  LIGHT_MOTION_PURPLE_FILL,
} from "$lib/shared/mandala/domain/mandala-constants";
import { calculate as calculateMandalaGeometry } from "$lib/shared/mandala/services/mandala-geometry-calculator";
import { renderMandalaToCanvas } from "$lib/shared/mandala/services/mandala-renderer";
import { LOOPComponent } from "$lib/shared/foundation/domain/models/generation/generate-models";
import { Period } from "$lib/shared/foundation/domain/models/generation/circular-models";
import { resolveLoopDisplay } from "$lib/features/loop-labeler/services/loop-display-resolver";
import {
  getReflectionIconTransform,
  type LOOPComponentId,
  type LoopReflectionAxis,
} from "@tka/render-composition";

import type { BackJob, PlacedBitmap, Placement } from "./back-job";
import { computeCardBackLayout, type CardBackLayout } from "./card-back-layout";
import { deriveCardBackData } from "../../components/card-back/card-back-data";
import { getCardBackThemeVisuals } from "../../components/card-back/card-back-theme-visuals";
import { parseLinearGradient } from "./gradient-parse";
import {
  rasterizeBrand,
  rasterizeUrl,
  rasterizeDifficultyBadge,
  rasterizeLoopIcon,
  LOOP_ICONS,
} from "./card-back-bitmaps-constant";
import {
  rasterizeTurnGlyph,
  rasterizeReversalGlyph,
  rasterizeStepCount,
  rasterizeStartPlacementPictograph,
  rasterizeLoopRow,
  type LoopRowCol,
} from "./card-back-bitmaps-percard";
import { rasterizeDecorations } from "./card-back-decorations-svg";
import { resolveCardBackAppearance } from "./card-back-appearance";

// Bleed: the BackJob bleedPx is 36 logical * scale 2 = 72 (see back-job.ts).
const DEFAULT_BLEED_PX = 72;

/**
 * Glow tuning (px, device space) for the Path2D mandala — emulates the SVG
 * `feGaussianBlur` glow + bloom filters that the DOM card back baked in. These
 * are scaled by the mandala box size relative to the 380-px reference the SVG
 * `stdDeviation`s were authored against, so the halo tracks render resolution.
 * The SVG used `stdDeviation=3` (glow) and `bloomBlur=4`.
 */
const MANDALA_REF_SIZE = 380;
const GLOW_STDDEV = 3;
const BLOOM_STDDEV = 7;

/**
 * Render the card-back mandala via Path2D (renderMandalaToCanvas) + a canvas
 * `shadowBlur` glow, returning an ImageBitmap sized to the (square) layout box.
 *
 * This replaces the prior SVG → HTMLImageElement decode, which cost ~200ms per
 * card (65% of the whole back) because Chrome rasterizes the `feGaussianBlur`
 * glow/bloom filters on the main thread. The Path2D render draws the same
 * geometry in a few ms; the glow is reproduced with matching-color canvas
 * shadows tuned to parity against the old filtered output.
 */
function renderMandalaPath2D(
  paths: MandalaPaths,
  w: number,
  h: number,
  darkMode: boolean,
  primaryPropColors: { left: string; right: string } | null,
): ImageBitmap {
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d") as unknown as CanvasRenderingContext2D;
  const sizeScale = Math.min(w, h) / MANDALA_REF_SIZE;
  renderMandalaToCanvas(ctx, paths, {
    size: Math.min(w, h),
    style: "stroke",
    show: "both",
    palette: applyMandalaHandColors(
      darkMode ? DARK_MANDALA_PALETTE : LIGHT_MANDALA_PALETTE,
      primaryPropColors,
    ),
    strokeWidth: 2.5,
    tipDx: MANDALA_STANDARD_TIP_DX,
    offsetX: 0,
    offsetY: 0,
    glow: { blur: GLOW_STDDEV * sizeScale, bloomBlur: BLOOM_STDDEV * sizeScale },
  });
  return canvas.transferToImageBitmap();
}

/**
 * Canonical LOOP component display order — must match CardBack.svelte
 * LOOP_DISPLAY_ORDER (and card-back-layout.ts).
 */
const LOOP_DISPLAY_ORDER: LOOPComponent[] = [
  LOOPComponent.ROTATED,
  LOOPComponent.MIRRORED,
  LOOPComponent.FLIPPED,
  LOOPComponent.SWAPPED,
  LOOPComponent.INVERTED,
  LOOPComponent.REWOUND,
];

const DARK_MANDALA_PALETTE: MandalaPalette = {
  leftStroke: DARK_MOTION_BLUE_STROKE,
  leftFill: DARK_MOTION_BLUE_FILL,
  rightStroke: DARK_MOTION_RED_STROKE,
  rightFill: DARK_MOTION_RED_FILL,
  purpleStroke: DARK_MOTION_PURPLE_STROKE,
  purpleFill: DARK_MOTION_PURPLE_FILL,
};

const LIGHT_MANDALA_PALETTE: MandalaPalette = {
  leftStroke: LIGHT_MOTION_BLUE_STROKE,
  leftFill: LIGHT_MOTION_BLUE_FILL,
  rightStroke: LIGHT_MOTION_RED_STROKE,
  rightFill: LIGHT_MOTION_RED_FILL,
  purpleStroke: LIGHT_MOTION_PURPLE_STROKE,
  purpleFill: LIGHT_MOTION_PURPLE_FILL,
};

export interface BuildBackJobOptions {
  width: number;
  height: number;
  bleedPx: number;
  theme: string;
  /** Deck prop types, so the back's mini start-placement pictograph draws the
   *  real prop (fan/club/triad) instead of the renderer's staff default. */
  leftPropType?: PropType;
  rightPropType?: PropType;
  primaryPropColors?: { left: string; right: string } | null;
}

/**
 * Rasterizer + geometry dependencies, injectable for tests. Each defaults to
 * the real implementation. The calculator factory is invoked lazily inside
 * buildBackJob (it throws on the server), so a test that supplies its own
 * `calculatePaths` never triggers the browser-only guard.
 */
export interface BuildBackJobDeps {
  rasterizeBrand: typeof rasterizeBrand;
  rasterizeUrl: typeof rasterizeUrl;
  rasterizeDifficultyBadge: typeof rasterizeDifficultyBadge;
  rasterizeLoopIcon: typeof rasterizeLoopIcon;
  rasterizeLoopRow: typeof rasterizeLoopRow;
  rasterizeTurnGlyph: typeof rasterizeTurnGlyph;
  rasterizeReversalGlyph: typeof rasterizeReversalGlyph;
  rasterizeStepCount: typeof rasterizeStepCount;
  rasterizeStartPlacementPictograph: typeof rasterizeStartPlacementPictograph;
  rasterizeDecorations: typeof rasterizeDecorations;
  /** Produce mandala geometry. Mirrors SequenceMandala's calculator.calculate call. */
  calculatePaths: (
    steps: SequenceData["steps"],
    leftPropType: string | undefined,
    rightPropType: string | undefined,
    pathOptions: MandalaPathOptions | undefined,
    tipOverride: { dx: number; dy: number },
  ) => MandalaPaths;
  /**
   * Render the mandala to an ImageBitmap at the given (square) box size via
   * Path2D + canvas glow. Defaults to the real OffscreenCanvas-backed impl;
   * injectable for tests (jsdom has no OffscreenCanvas / transferToImageBitmap).
   */
  renderMandala: (
    paths: MandalaPaths,
    w: number,
    h: number,
    darkMode: boolean,
    primaryPropColors: { left: string; right: string } | null,
  ) => ImageBitmap;
}

const realDeps: BuildBackJobDeps = {
  rasterizeBrand,
  rasterizeUrl,
  rasterizeDifficultyBadge,
  rasterizeLoopIcon,
  rasterizeLoopRow,
  rasterizeTurnGlyph,
  rasterizeReversalGlyph,
  rasterizeStepCount,
  rasterizeStartPlacementPictograph,
  rasterizeDecorations,
  calculatePaths: (steps, left, right, pathOptions, tipOverride) =>
    calculateMandalaGeometry(
      (steps ?? []) as never,
      left,
      right,
      pathOptions,
      tipOverride,
    ),
  renderMandala: renderMandalaPath2D,
};

/**
 * Anchor the TOP-anchored brand bitmap by its NATURAL size. The .brand-slot is
 * `top:3.2cqi; left:0; right:0` flex-column centered, so the bitmap's top edge
 * sits 3.2cqi below the content-box top and it is horizontally centered in the
 * content box. The draw rect = the bitmap's own width × height (1:1, no scale).
 */
function anchorBrand(
  bmp: ImageBitmap,
  a: CardBackLayout["anchors"],
): Placement {
  const w = bmp.width;
  const h = bmp.height;
  return {
    x: a.ox + (a.innerWidth - w) / 2,
    y: a.oy + a.brandTopCqi * a.cqiEff,
    w,
    h,
  };
}

/**
 * Anchor the BOTTOM-anchored url bitmap by its NATURAL size. The .url-slot is
 * `bottom:2.8cqi; left:0; right:0` flex-column centered, so the bitmap's BOTTOM
 * edge sits 2.8cqi above the content-box bottom and it is horizontally centered.
 * The draw rect = the bitmap's own width × height (1:1, no scale).
 */
function anchorUrl(
  bmp: ImageBitmap,
  a: CardBackLayout["anchors"],
): Placement {
  const w = bmp.width;
  const h = bmp.height;
  return {
    x: a.ox + (a.innerWidth - w) / 2,
    y: a.oy + a.innerHeight - a.urlBottomCqi * a.cqiEff - h,
    w,
    h,
  };
}

/**
 * Build a `BackJob` for `sequence` at `opts` dimensions/theme.
 *
 * @param sequence The sequence to render the card back for.
 * @param opts     width/height in px (e.g. 1644×2244), bleedPx, theme name.
 * @param deps     Injectable rasterizer/geometry deps (defaults to real impls).
 */
export async function buildBackJob(
  sequence: SequenceData,
  opts: BuildBackJobOptions,
  deps: Partial<BuildBackJobDeps> = {},
): Promise<BackJob> {
  const d = { ...realDeps, ...deps };
  const appearance = resolveCardBackAppearance(opts);

  // 1) Derive shared data + theme visuals (proof mode in the print path).
  const data = deriveCardBackData(sequence);
  const visuals = getCardBackThemeVisuals(opts.theme);

  // 2) Layout boxes from the CSS-equivalent cqi positions. cqi resolves against
  //    the border-frame content-box (inset by `borderWidth` cqi padding), matching
  //    CardBack.svelte's `container-type: inline-size` on `.border-frame`.
  const layout = computeCardBackLayout(data, {
    width: opts.width,
    height: opts.height,
    borderWidthCqi: visuals.borderWidth ?? 2,
  });

  // 3) Parse the proof-mode single-layer gradients.
  const borderGradient = parseLinearGradient(visuals.borderGradient);
  const bgGradient = parseLinearGradient(visuals.background);

  // 4) Dark-mode flag — matches CardBack.svelte `isDarkTheme`
  //    (proof mode sets textColor "#111111" → light).
  const darkMode = !visuals.textColor || visuals.textColor === "#ffffff";

  // 5) Mandala — mirror SequenceMandala's geometry and colors. The bitmap
  //    still uses Path2D with a canvas glow while the static DOM card uses SVG
  //    filters; browser parity checks measure any remaining raster difference.
  //    CardBack.svelte mounts SequenceMandala with size=380,
  //    style="stroke", show="both", pathShape="arc", no strokeWidth [→ 2.5],
  //    no tipDx [→ MANDALA_STANDARD_TIP_DX], darkMode={isDarkTheme}):
  //      - pathShape "arc"  → no pathShape key. Motion-aware ("hybrid",
  //        motionAware: true — anti traces concave petals) is the parked
  //        end-state (feedback 2mHuY6Au, deferred 2026-07-09); when flipping,
  //        change CardBack.svelte's pathShape AND this pathOptions together.
  //      - tip dx is the standard tip (no animation, no override)
  //    Prop-aware: a single-ended prop (club) traces ONE tip, not the staff's
  //    two. Without this every back drew the double-staff locus regardless of
  //    the prop the card is rendered with.
  const tipEnds = pairTipEnds(appearance.leftPropType, appearance.rightPropType);
  const pathOptions: MandalaPathOptions | undefined =
    tipEnds === 1 ? { tipEnds: 1 } : undefined;
  const mandalaPaths = d.calculatePaths(
    sequence.steps,
    appearance.leftPropType,
    appearance.rightPropType,
    pathOptions,
    { dx: MANDALA_STANDARD_TIP_DX, dy: 0 },
  );

  // Render the mandala geometry directly via Path2D at the (square) layout box
  // size, with a canvas glow emulating the SVG feGaussianBlur halo. This fills
  // the box exactly — matching the old .mandala-anchor (72cqi square) — without
  // the ~200ms SVG-filter decode the prior path paid.
  const mandalaW = Math.round(layout.mandala.w);
  const mandalaH = Math.round(layout.mandala.h);
  const mandalaBitmap = d.renderMandala(
    mandalaPaths, mandalaW, mandalaH, darkMode, appearance.primaryPropColors,
  );
  const mandala: BackJob["mandala"] = {
    bitmap: mandalaBitmap,
    placement: layout.mandala,
  };

  // 6) Decorations: hidden in proof mode (decorationOpacity 0) → null.
  const decorationOpacity = visuals.decorationOpacity ?? 1;
  let decorations: BackJob["decorations"] = null;
  if (decorationOpacity !== 0) {
    const decoBitmap = await d.rasterizeDecorations(opts.theme, opts.width, opts.height);
    decorations = decoBitmap ? { bitmap: decoBitmap, opacity: decorationOpacity } : null;
  }

  // 7) Pre-rasterize + place every element. Independent rasterizations run
  //    concurrently; results are placed into their layout boxes.
  const activeLoop = LOOP_DISPLAY_ORDER.filter((c) => data.loopComponents.has(c));
  const loopDisplay = resolveLoopDisplay(sequence);
  const reflectionLabels: Record<LoopReflectionAxis, string> = {
    "north-south": "Mirrored",
    "east-west": "Flipped",
    "northeast-southwest": "NE-SW Reflection",
    "northwest-southeast": "NW-SE Reflection",
  };

  const hasStartPos = !!sequence.startPlacement;

  // Per-card render context: border-aware cqi basis + the proof text colors the
  // live card sets on `.back` (so bare-mounted glyphs / pictograph borders don't
  // fall back to near-white and vanish on the white proof background).
  const a = layout.anchors;
  const perCardCtx = {
    containerWidth: a.innerWidth,
    cqi: a.cqiEff,
    textMutedColor: visuals.textMutedColor ?? "rgba(0, 0, 0, 0.55)",
    textColor: visuals.textColor ?? "#111111",
  };

  // Build the loop columns (icon kind + color + label) for the whole row, mirroring
  // CardBack.svelte node-selection exactly:
  //   ROTATED  → always quartered (fa-arrows-spin).
  //   INVERTED → quartered (checkerboard) only when inversionPeriod === QUARTERED.
  //   SWAPPED  → fa-shuffle (kind "swap", rendered monochrome in its brand color).
  const loopCols: LoopRowCol[] = activeLoop.map((comp) => {
    const meta = LOOP_ICONS[comp];
    const reflection = getReflectionIconTransform(
      comp as LOOPComponentId,
      loopDisplay.reflectionAxis
    );
    const color = meta?.color ?? "#ffffff";
    const label = reflection
      ? reflectionLabels[reflection.axis]
      : meta?.label ?? "";
    if (comp === LOOPComponent.SWAPPED) return { kind: "swap", color, label };
    if (comp === LOOPComponent.INVERTED && loopDisplay.inversionPeriod === Period.QUARTERED)
      return { kind: "checkerboard", color, label };
    if (comp === LOOPComponent.ROTATED) return { kind: "fa", fa: "fas fa-arrows-spin", color, label };
    if (reflection) {
      return {
        kind: "fa",
        fa: "fas fa-left-right",
        color,
        label,
        rotationDegrees: reflection.rotationDegrees,
        iconScale: reflection.scale,
      };
    }
    return { kind: "fa", fa: meta?.fa ?? "", color, label };
  });

  const [
    brandBmp,
    urlBmp,
    badgeBmp,
    turnBmp,
    reversalBmp,
    stepCountBmp,
    startPosBmp,
    loopRowBmp,
  ] = await Promise.all([
    d.rasterizeBrand(opts.theme),
    d.rasterizeUrl(opts.theme),
    d.rasterizeDifficultyBadge(data.level.number, opts.theme),
    d.rasterizeTurnGlyph(data.turnGlyphEntries, perCardCtx),
    d.rasterizeReversalGlyph(data.reversalSequence, data.reversalPeriod, perCardCtx),
    d.rasterizeStepCount(data.stepCount, perCardCtx),
    hasStartPos
      ? d.rasterizeStartPlacementPictograph(
          sequence.startPlacement,
          darkMode,
          perCardCtx,
          appearance.leftPropType,
          appearance.rightPropType,
          appearance.primaryPropColors,
        )
      : Promise.resolve(null),
    loopCols.length > 0
      ? d.rasterizeLoopRow(loopCols, perCardCtx, opts.theme)
      : Promise.resolve(null),
  ]);

  // Brand + url are rendered at NATURAL height (no crop), so anchor them by the
  // bitmap's own size: brand top-anchored at 3.2cqi, url bottom-anchored at
  // 2.8cqi, both horizontally centered in the content box. The PlacedBitmap
  // placement IS the 1:1 draw rect (w/h = bitmap's natural size).
  const bitmaps: PlacedBitmap[] = [
    { kind: "brand", bitmap: brandBmp, placement: anchorBrand(brandBmp, layout.anchors) },
    { kind: "url-ornament", bitmap: urlBmp, placement: anchorUrl(urlBmp, layout.anchors) },
    { kind: "difficulty-badge", bitmap: badgeBmp, placement: layout.levelBadge },
    { kind: "turn-glyph", bitmap: turnBmp, placement: layout.topLeftGlyph },
    { kind: "reversal-glyph", bitmap: reversalBmp, placement: layout.topRightGlyph },
    { kind: "step-count", bitmap: stepCountBmp, placement: layout.stepCount },
  ];

  if (startPosBmp) {
    bitmaps.push({
      kind: "start-placement-pictograph",
      bitmap: startPosBmp,
      placement: layout.startPos,
    });
  }

  // Loop row: one centered bitmap (full inner width × natural height), bottom
  // edge at 28cqi above the content-box bottom (CardBack `.loop-row { bottom:28cqi }`).
  if (loopRowBmp) {
    const a2 = layout.anchors;
    bitmaps.push({
      kind: "loop-icon",
      bitmap: loopRowBmp,
      placement: {
        x: a2.ox,
        y: a2.oy + a2.innerHeight - 28 * a2.cqiEff - loopRowBmp.height,
        w: loopRowBmp.width,
        h: loopRowBmp.height,
      },
    });
  }

  // 8) Assemble.
  return {
    width: opts.width,
    height: opts.height,
    bleedPx: opts.bleedPx ?? DEFAULT_BLEED_PX,
    // Visible colored-border inset = the border-frame content-box origin from the
    // layout (borderWidthCqi → px). The raster fills the light bg from here in, so
    // the gradient border width tracks the content inset exactly (no drift).
    borderPx: layout.anchors.ox,
    borderGradient,
    bgGradient,
    decorations,
    mandala,
    bitmaps,
  };
}
