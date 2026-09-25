/**
 * Tests for buildBackJob — the main-thread JOB BUILDER that assembles a BackJob
 * (plain data + ImageBitmaps) from a SequenceData.
 *
 * Real rasterization (modern-screenshot + createImageBitmap) and the mandala
 * geometry calculator (browser-only) do NOT run in vitest/jsdom, so every
 * rasterizer dependency + the geometry calculator is injected as a fake via the
 * `deps` parameter. The fakes return sentinel objects and record their args.
 * We assert the assembled BackJob shape: dimensions, parsed gradients, proof-
 * mode decorations === null, the placed-bitmap kinds + their layout placements,
 * the conditional start-pos pictograph, and one loop-icon per active component.
 *
 * The real visual/parity check happens in the browser harness (P1.7).
 */

import { describe, it, expect, vi } from "vitest";

// The rasterizer modules (card-back-bitmaps-constant / -percard) statically
// import these Svelte components, whose real subtrees (PictographRenderer →
// arrow/prop/grid services → firebase/protobufjs) crash vitest at import time
// (`util.Long.fromNumber is not a function`). buildBackJob imports those
// rasterizer modules statically, so we stub the heavy components to light
// identity objects — exactly as the percard rasterizer test does. The builder
// never invokes the real rasterizers here (they're injected as fakes via deps),
// so the stubbed components are never actually mounted.
vi.mock("../../../components/card-back/CardBackBrand.svelte", () => ({ default: {} }));
vi.mock("../../../components/card-back/CardBackUrl.svelte", () => ({ default: {} }));
vi.mock("../../../components/card-back/CardBackLoopIcon.svelte", () => ({ default: {} }));
vi.mock("../../../components/card-back/TurnPatternGlyph.svelte", () => ({ default: {} }));
vi.mock("../../../components/card-back/ReversalPatternGlyph.svelte", () => ({ default: {} }));
vi.mock("../../../components/card-back/StartPlacementPictograph.svelte", () => ({ default: {} }));
vi.mock("../../../components/card-back/CardBackStepCount.svelte", () => ({ default: {} }));

import { buildBackJob, type BuildBackJobDeps } from "../card-back-job-builder";
import type { MandalaPaths } from "$lib/shared/mandala/domain/mandala-types";
import { computeCardBackLayout } from "../card-back-layout";
import { deriveCardBackData } from "../../../components/card-back/card-back-data";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";

const WIDTH = 1644;
const HEIGHT = 2244;
const BLEED = 72;

/**
 * A sentinel ImageBitmap-ish; enough for placement assertions. Brand/url are now
 * anchored by the bitmap's own width/height (natural-height render), so the fake
 * carries explicit dimensions.
 */
function fakeBitmap(tag: string, w = 100, h = 50): ImageBitmap {
  return { __tag: tag, width: w, height: h, close: vi.fn() } as unknown as ImageBitmap;
}

const EMPTY_PATHS: MandalaPaths = { left: [], right: [], purple: [] };

/**
 * Build a fully-faked deps object. Each rasterizer returns a tagged sentinel so
 * we can assert WHICH bitmap landed in WHICH placement, and records its args.
 */
function makeFakeDeps(overrides: Partial<BuildBackJobDeps> = {}): {
  deps: BuildBackJobDeps;
  calls: Record<string, unknown[][]>;
} {
  const calls: Record<string, unknown[][]> = {};
  const record = (name: string, args: unknown[]) => {
    (calls[name] ??= []).push(args);
  };

  const deps: BuildBackJobDeps = {
    rasterizeBrand: vi.fn(async (...a) => {
      record("brand", a);
      // Natural-height render: a wide, short content box.
      return fakeBitmap("brand", 1200, 180);
    }),
    rasterizeUrl: vi.fn(async (...a) => {
      record("url", a);
      return fakeBitmap("url", 400, 120);
    }),
    rasterizeDifficultyBadge: vi.fn(async (...a) => {
      record("badge", a);
      return fakeBitmap("badge");
    }),
    rasterizeLoopIcon: vi.fn(async (...a) => {
      record("loop", a);
      return fakeBitmap(`loop:${a[0]}`);
    }),
    rasterizeLoopRow: vi.fn(async (...a) => {
      record("loopRow", a);
      return fakeBitmap("loopRow", 800, 200);
    }),
    rasterizeTurnGlyph: vi.fn(async (...a) => {
      record("turn", a);
      return fakeBitmap("turn");
    }),
    rasterizeReversalGlyph: vi.fn(async (...a) => {
      record("reversal", a);
      return fakeBitmap("reversal");
    }),
    rasterizeStepCount: vi.fn(async (...a) => {
      record("step", a);
      return fakeBitmap("step");
    }),
    rasterizeStartPlacementPictograph: vi.fn(async (...a) => {
      record("startpos", a);
      return fakeBitmap("startpos");
    }),
    rasterizeDecorations: vi.fn(async (...a) => {
      record("deco", a);
      return fakeBitmap("deco");
    }),
    calculatePaths: vi.fn((...a) => {
      record("calc", a);
      return EMPTY_PATHS;
    }),
    renderMandala: vi.fn((...a) => {
      record("mandala", a);
      return fakeBitmap("mandala");
    }),
    ...overrides,
  };

  return { deps, calls };
}

/** Minimal sequence: 1 step (keeps the loop resolver on the stored-loopType
 *  path), with a stored loopType so loop components resolve deterministically. */
function makeSequence(extra: Partial<SequenceData> = {}): SequenceData {
  const step = {
    beat: 1,
    letter: "A",
    motions: {
      left: { motionType: "pro", turns: 0, rotationDirection: "cw" },
      right: { motionType: "pro", turns: 0, rotationDirection: "ccw" },
    },
  };
  return {
    name: "TEST",
    word: "TEST",
    steps: [step],
    loopType: "mirrored_swapped",
    ...extra,
  } as unknown as SequenceData;
}

describe("buildBackJob", () => {
  it("returns a BackJob with the requested dimensions and bleed", async () => {
    const { deps } = makeFakeDeps();
    const job = await buildBackJob(
      makeSequence(),
      { width: WIDTH, height: HEIGHT, bleedPx: BLEED, theme: "cosmic" },
      deps,
    );
    expect(job.width).toBe(1644);
    expect(job.height).toBe(2244);
    expect(job.bleedPx).toBe(72);
  });

  it("parses proof-mode background + border gradients into GradientSpecs", async () => {
    const { deps } = makeFakeDeps();
    const job = await buildBackJob(
      makeSequence(),
      { width: WIDTH, height: HEIGHT, bleedPx: BLEED, theme: "cosmic" },
      deps,
    );
    // Proof-mode background is the white single-layer gradient.
    expect(job.bgGradient.type).toBe("linear");
    expect(job.bgGradient.angleDeg).toBe(180);
    expect(job.bgGradient.stops[0]).toEqual({ offset: 0, color: "#ffffff" });
    // Border is the proof-mode single linear-gradient (135deg start).
    expect(job.borderGradient.type).toBe("linear");
    expect(job.borderGradient.angleDeg).toBe(135);
    expect(job.borderGradient.stops.length).toBeGreaterThan(1);
  });

  it("sets decorations to null in proof mode (decorationOpacity 0)", async () => {
    const { deps, calls } = makeFakeDeps();
    const job = await buildBackJob(
      makeSequence(),
      { width: WIDTH, height: HEIGHT, bleedPx: BLEED, theme: "cosmic" },
      deps,
    );
    expect(job.decorations).toBeNull();
    // Proof mode hides decorations → rasterizeDecorations must NOT be called.
    expect(calls.deco).toBeUndefined();
  });

  it("renders the mandala via Path2D and places it at its (square) layout box", async () => {
    const { deps, calls } = makeFakeDeps();
    const seq = makeSequence();
    const data = deriveCardBackData(seq);
    const layout = computeCardBackLayout(data, {
      width: WIDTH,
      height: HEIGHT,
      borderWidthCqi: 8.759, // proof-mode borderWidth for "cosmic" (matches builder via getProofModeVisuals)
    });
    const job = await buildBackJob(
      seq,
      { width: WIDTH, height: HEIGHT, bleedPx: BLEED, theme: "cosmic" },
      deps,
    );

    // The mandala arrives as a pre-rendered bitmap placed at the layout box.
    expect(job.mandala).not.toBeNull();
    expect((job.mandala!.bitmap as unknown as { __tag: string }).__tag).toBe("mandala");
    expect(job.mandala!.placement).toEqual(layout.mandala);

    // renderMandala was called with (paths, w, h, darkMode) — the Path2D path,
    // not an SVG string. Sized to the square layout box in pixels.
    const args = calls.mandala![0]!;
    expect(typeof args[0]).toBe("object"); // MandalaPaths, not an SVG string
    expect(args[1]).toBe(Math.round(layout.mandala.w));
    expect(args[2]).toBe(Math.round(layout.mandala.h));
    expect(typeof args[3]).toBe("boolean"); // darkMode flag
  });

  it("staff default: arc → undefined pathOptions (two tips), standard tip dx", async () => {
    const { deps, calls } = makeFakeDeps();
    await buildBackJob(
      makeSequence(),
      { width: WIDTH, height: HEIGHT, bleedPx: BLEED, theme: "cosmic" },
      deps,
    );
    const args = calls.calc![0]!;
    // (steps, bluePropType, redPropType, pathOptions, tipOverride)
    expect(args[1]).toBe(PropType.STAFF);
    expect(args[2]).toBe(PropType.STAFF);
    expect(args[3]).toBeUndefined(); // no prop → staff → two tips (arc default; motion-aware parked)
    expect(args[4]).toEqual({ dx: 120, dy: 0 });
  });

  it("single-ended prop (club) traces ONE tip: pathOptions { tipEnds: 1 }", async () => {
    const { deps, calls } = makeFakeDeps();
    await buildBackJob(
      makeSequence(),
      {
        width: WIDTH,
        height: HEIGHT,
        bleedPx: BLEED,
        theme: "cosmic",
        leftPropType: PropType.CLUB,
        rightPropType: PropType.CLUB,
      },
      deps,
    );
    const args = calls.calc![0]!;
    expect(args[1]).toBe(PropType.CLUB); // prop types forwarded
    expect(args[2]).toBe(PropType.CLUB);
    expect(args[3]).toEqual({ tipEnds: 1 }); // one tip, not the staff's two
    expect(args[4]).toEqual({ dx: 120, dy: 0 });
  });

  it("keeps a two-ended prop and custom hand colors in the mandala and start pictograph", async () => {
    const { deps, calls } = makeFakeDeps();
    const colors = { left: "#7442c8", right: "#a84fd4" };
    await buildBackJob(
      makeSequence({ startPlacement: { letter: "A", motions: {} } as never }),
      {
        width: WIDTH,
        height: HEIGHT,
        bleedPx: BLEED,
        theme: "cosmic",
        leftPropType: PropType.STAFF,
        rightPropType: PropType.STAFF,
        primaryPropColors: colors,
      },
      deps,
    );
    expect(calls.calc![0]![3]).toBeUndefined();
    expect(calls.mandala![0]![4]).toEqual(colors);
    expect(calls.startpos![0]!.slice(3)).toEqual([PropType.STAFF, PropType.STAFF, colors]);
  });

  it("places the constant + per-card element bitmaps at their layout boxes", async () => {
    const { deps } = makeFakeDeps();
    const seq = makeSequence();
    const data = deriveCardBackData(seq);
    const layout = computeCardBackLayout(data, {
      width: WIDTH,
      height: HEIGHT,
      borderWidthCqi: 8.759, // proof-mode borderWidth for "cosmic" (matches builder via getProofModeVisuals)
    });
    const job = await buildBackJob(
      seq,
      { width: WIDTH, height: HEIGHT, bleedPx: BLEED, theme: "cosmic" },
      deps,
    );

    const byKind = (k: string) => job.bitmaps.filter((b) => b.kind === k);

    const a = layout.anchors;

    // Brand: NATURAL-height bitmap (1200×180), top-anchored at 3.2cqi, centered.
    expect(byKind("brand")).toHaveLength(1);
    const brandP = byKind("brand")[0]!.placement;
    expect(brandP.w).toBe(1200);
    expect(brandP.h).toBe(180);
    expect(brandP.x).toBeCloseTo(a.ox + (a.innerWidth - 1200) / 2, 6);
    expect(brandP.y).toBeCloseTo(a.oy + a.brandTopCqi * a.cqiEff, 6);

    // URL: NATURAL-height bitmap (400×120), bottom-anchored at 2.8cqi, centered.
    const urlP = byKind("url-ornament")[0]!.placement;
    expect(urlP.w).toBe(400);
    expect(urlP.h).toBe(120);
    expect(urlP.x).toBeCloseTo(a.ox + (a.innerWidth - 400) / 2, 6);
    // bottom edge sits 2.8cqi above the content-box bottom
    expect(urlP.y + urlP.h).toBeCloseTo(a.oy + a.innerHeight - a.urlBottomCqi * a.cqiEff, 6);

    expect(byKind("difficulty-badge")[0]!.placement).toEqual(layout.levelBadge);
    expect(byKind("turn-glyph")[0]!.placement).toEqual(layout.topLeftGlyph);
    expect(byKind("reversal-glyph")[0]!.placement).toEqual(layout.topRightGlyph);
    expect(byKind("step-count")[0]!.placement).toEqual(layout.stepCount);
  });

  it("includes a start-placement-pictograph only when the sequence has a startPlacement", async () => {
    const { deps: depsNo } = makeFakeDeps();
    const jobNoStart = await buildBackJob(
      makeSequence(),
      { width: WIDTH, height: HEIGHT, bleedPx: BLEED, theme: "cosmic" },
      depsNo,
    );
    expect(jobNoStart.bitmaps.some((b) => b.kind === "start-placement-pictograph")).toBe(false);

    const { deps: depsYes } = makeFakeDeps();
    const seqStart = makeSequence({
      startPlacement: { letter: "A", motions: {} } as never,
    });
    const data = deriveCardBackData(seqStart);
    const layout = computeCardBackLayout(data, {
      width: WIDTH,
      height: HEIGHT,
      borderWidthCqi: 8.759, // proof-mode borderWidth for "cosmic" (matches builder via getProofModeVisuals)
    });
    const jobStart = await buildBackJob(
      seqStart,
      { width: WIDTH, height: HEIGHT, bleedPx: BLEED, theme: "cosmic" },
      depsYes,
    );
    const startBitmaps = jobStart.bitmaps.filter((b) => b.kind === "start-placement-pictograph");
    expect(startBitmaps).toHaveLength(1);
    expect(startBitmaps[0]!.placement).toEqual(layout.startPos);
  });

  it("emits one centered loop-row bitmap with columns for the active components", async () => {
    const { deps, calls } = makeFakeDeps();
    const seq = makeSequence(); // mirrored_swapped → MIRRORED + SWAPPED
    const job = await buildBackJob(
      seq,
      { width: WIDTH, height: HEIGHT, bleedPx: BLEED, theme: "cosmic" },
      deps,
    );

    // Exactly one loop-icon bitmap (the whole row), not one per component.
    const loopBitmaps = job.bitmaps.filter((b) => b.kind === "loop-icon");
    expect(loopBitmaps).toHaveLength(1);

    // rasterizeLoopRow received cols for the active components (each with a label).
    const cols = calls.loopRow![0]![0] as { label: string }[];
    expect(cols.length).toBeGreaterThan(0);
    for (const c of cols) expect(c.label).toBeTruthy();

    // Row bitmap spans the full content-box width, centered.
    const a = job.bitmaps.find((b) => b.kind === "loop-icon")!;
    const borderPx = 8.759 * (WIDTH / 100);
    expect(a.placement.x).toBeCloseTo(borderPx, 0); // x = content-box origin (ox)
  });

  it("forwards the proof-mode muted text color into the step-count rasterizer", async () => {
    const { deps, calls } = makeFakeDeps();
    await buildBackJob(
      makeSequence(),
      { width: WIDTH, height: HEIGHT, bleedPx: BLEED, theme: "cosmic" },
      deps,
    );
    // rasterizeStepCount(count, ctx) — ctx carries the proof muted color
    const args = calls.step![0]!;
    expect((args[1] as { textMutedColor: string }).textMutedColor).toBe("rgba(0, 0, 0, 0.55)");
  });
});
