/**
 * Render-Parity Core — the shared render+hash+diff pipeline behind BOTH
 * rendering-parity surfaces:
 *
 *   - the manual browser page  (src/routes/test/step-migration-parity)
 *   - the automated wave gate  (tests/render-parity/render-parity.test.ts,
 *     vitest browser mode; npm run test:render-parity[:capture|:compare])
 *
 * One pipeline, two front-ends — the page and the CI gate cannot drift apart.
 *
 * PIPELINE_VERSION history:
 *   v1 (page-local, 2026-07-01): grid + glyphs only. Two blind spots, both
 *      confirmed empirically 2026-07-05:
 *        1. No PictographPreparer was wired, so `ensurePrepared` fell through
 *           and ARROWS + PROPS never rendered — the exact subsystem the
 *           StepData→Step migration endangers most.
 *        2. `buildPictograph` dropped `blueReversal`/`redReversal`, so
 *           reversal dots never rendered (canvas-2d-glyph-renderer keys off
 *           `pictograph.leftReversal`) — the D1/D4 corruption channel was
 *           invisible.
 *   v2 (this module): preparer wired (arrows + props render), reversal flags
 *      + betaSwapped/category carried onto the pictograph. Baselines captured
 *      under v1 are NOT comparable to v2 renders — both front-ends stamp
 *      `pipelineVersion` into their baselines and refuse cross-version compares.
 */
import pixelmatch from "pixelmatch";
import { Canvas2DDirectRenderer } from "$lib/shared/render/services/canvas-2d-direct-renderer";
import { pictographPreparer } from "$lib/shared/pictograph/shared/services/pictograph-preparer";
import { hydrate } from "$lib/shared/foundation/services/sequence-hydrator";
import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import type { Letter } from "$lib/shared/foundation/domain/models/letter";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";

export const PARITY_SIZE = 224;

/** Diff percentage at/under which a pixel delta is treated as noise floor. */
export const DRIFT_THRESHOLD = 0.05;

/** Bump whenever the render pipeline itself changes what it draws. */
export const PIPELINE_VERSION = 2;

/**
 * Build a step's renderable pictograph the way the app render paths do,
 * INCLUDING the step-level render extras the v1 page dropped: reversal flags
 * (drive the reversal-dot layer) and betaSwapped/category. PropType is a
 * viewer preference, fixed to STAFF for determinism.
 */
export function buildParityPictograph(
  seq: SequenceData,
  step: StepData,
  id: string
): PictographData {
  const propType = PropType.STAFF;
  const m = step.motions;
  const motions = m
    ? {
        left: m.left
          ? { ...m.left, propType: m.left.propType || propType }
          : undefined,
        right: m.right
          ? { ...m.right, propType: m.right.propType || propType }
          : undefined,
      }
    : {};
  return {
    id,
    letter: step.letter as Letter,
    startPlacement: step.startPlacement,
    endPlacement: step.endPlacement,
    gridMode: seq.gridMode || GridMode.DIAMOND,
    motions,
    // Step-level render extras — v1 dropped these (blind spots #2).
    leftReversal: step.leftReversal ?? false,
    rightReversal: step.rightReversal ?? false,
    betaSwapped: step.betaSwapped,
    category: step.category,
  } as PictographData;
}

export interface RenderedStep {
  /** `${seqIndex}:${stepIndex}` — stable across runs over the same input set. */
  key: string;
  word: string;
  stepIndex: number;
  letter: string;
  image: ImageData;
}

export interface RenderSetOptions {
  size?: number;
  onProgress?: (done: number, total: number) => void;
  /**
   * Negative-control injection point: applied to every step AFTER hydrate,
   * BEFORE rendering. The harness's teeth tests use this to prove a channel
   * (reversal dots, structural motion, arrow placement) is visible — a
   * mutation that produces zero drift means the harness is blind there.
   */
  mutateStep?: (
    step: StepData,
    seqIndex: number,
    stepIndex: number
  ) => StepData;
}

async function toImageData(
  canvas: OffscreenCanvas | HTMLCanvasElement,
  size: number
): Promise<ImageData> {
  const ctx = (canvas as HTMLCanvasElement).getContext("2d") as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;
  if (!ctx) throw new Error("no 2d context on rendered canvas");
  return ctx.getImageData(0, 0, size, size);
}

/**
 * Run the FULL pipeline (hydrate -> step -> PictographData -> prepare ->
 * Canvas2DDirectRenderer) over a frozen input set. This is the code under
 * test across a migration wave: frozen inputs guarantee identical source
 * data, so any pixel delta is the refactor's doing.
 */
export async function renderStepSet(
  inputs: SequenceData[],
  opts: RenderSetOptions = {}
): Promise<RenderedStep[]> {
  const size = opts.size ?? PARITY_SIZE;
  // Explicit preparer — this is what makes arrows + props render (v1 blind
  // spot #1). Cache cleared so a mutated re-render can't serve stale prepares.
  pictographPreparer.clearCache();
  const renderer = new Canvas2DDirectRenderer(pictographPreparer);
  await renderer.initialize();

  const hydrated = inputs.map((s) => hydrate(s) as SequenceData);
  const total = hydrated.reduce((n, s) => n + (s.steps?.length ?? 0), 0);
  let done = 0;
  const out: RenderedStep[] = [];
  for (let si = 0; si < hydrated.length; si++) {
    const seq = hydrated[si]!;
    const steps = seq.steps ?? [];
    for (let ti = 0; ti < steps.length; ti++) {
      let step = steps[ti]!;
      if (opts.mutateStep) step = opts.mutateStep(step, si, ti);
      const pictograph = buildParityPictograph(seq, step, `${seq.word}-${ti}`);
      const canvas = await renderer.renderPictograph(pictograph, {
        size,
        visibility: {
          showTKA: true,
          showReversals: true,
          showNonRadialPoints: false,
          darkMode: true,
          leftPropType: PropType.STAFF,
          rightPropType: PropType.STAFF,
        },
      });
      out.push({
        key: `${si}:${ti}`,
        word: seq.word ?? `seq-${si}`,
        stepIndex: ti,
        letter: (step.letter as string) ?? "?",
        image: await toImageData(canvas, size),
      });
      done++;
      opts.onProgress?.(done, total);
    }
  }
  return out;
}

/** Hex SHA-256 of the raw RGBA buffer — pixel-exact fingerprint of a render. */
export async function hashImageData(img: ImageData): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    img.data as unknown as BufferSource
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface DiffResult {
  /** Changed pixels as a percentage of total, 3 decimal places. */
  percent: number;
  /** Present when percent > 0. */
  diffImage: ImageData | null;
}

export function diffImageData(a: ImageData, b: ImageData): DiffResult {
  if (a.width !== b.width || a.height !== b.height) {
    return { percent: 100, diffImage: null };
  }
  const { width, height } = a;
  const diffImg = new ImageData(width, height);
  const changed = pixelmatch(a.data, b.data, diffImg.data, width, height, {
    threshold: 0.1,
  });
  const total = width * height;
  const percent = total ? Math.round((changed / total) * 100000) / 1000 : 0;
  return { percent, diffImage: percent > 0 ? diffImg : null };
}

export function imageDataToPngDataUrl(img: ImageData): string {
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  c.getContext("2d")!.putImageData(img, 0, 0);
  return c.toDataURL("image/png");
}

export async function pngDataUrlToImageData(url: string): Promise<ImageData> {
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("failed to decode baseline png"));
    img.src = url;
  });
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, c.width, c.height);
}

// ─── Baseline manifest (serializable — the wave-gate on-disk format) ────────

export interface ParityManifestEntry {
  key: string;
  word: string;
  stepIndex: number;
  letter: string;
  hash: string;
  /** PNG data URL — kept so a later compare can pixel-diff, not just hash-diff. */
  png: string;
}

export interface ParityManifest {
  pipelineVersion: number;
  capturedAt: string;
  size: number;
  userAgent: string;
  sequences: number;
  entries: ParityManifestEntry[];
}

export async function buildManifest(
  rendered: RenderedStep[],
  sequences: number,
  size: number = PARITY_SIZE
): Promise<ParityManifest> {
  const entries: ParityManifestEntry[] = [];
  for (const r of rendered) {
    entries.push({
      key: r.key,
      word: r.word,
      stepIndex: r.stepIndex,
      letter: r.letter,
      hash: await hashImageData(r.image),
      png: imageDataToPngDataUrl(r.image),
    });
  }
  return {
    pipelineVersion: PIPELINE_VERSION,
    capturedAt: new Date().toISOString(),
    size,
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "?",
    sequences,
    entries,
  };
}

export interface DriftedEntry {
  key: string;
  word: string;
  stepIndex: number;
  letter: string;
  diffPercent: number;
  baselinePng: string;
  currentPng: string;
  diffPng: string;
}

export interface CompareResult {
  total: number;
  matched: number;
  /** Entries over DRIFT_THRESHOLD — real regressions. */
  drifted: DriftedEntry[];
  /** Worst diff percent seen anywhere (including sub-threshold noise). */
  worst: number;
  /** Baseline keys the current render set no longer produces. */
  missing: string[];
  /** Current keys absent from the baseline. */
  extra: string[];
}

/**
 * Hash-first compare of a fresh render set against a frozen manifest. Only
 * hash mismatches pay for a pixel-level diff (and get baseline/current/diff
 * PNGs for the drift report).
 */
export async function compareToManifest(
  manifest: ParityManifest,
  rendered: RenderedStep[]
): Promise<CompareResult> {
  if (manifest.pipelineVersion !== PIPELINE_VERSION) {
    throw new Error(
      `baseline pipelineVersion ${manifest.pipelineVersion} != current ${PIPELINE_VERSION} — recapture the baseline before comparing`
    );
  }
  const byKey = new Map(manifest.entries.map((e) => [e.key, e]));
  const seen = new Set<string>();
  const drifted: DriftedEntry[] = [];
  let matched = 0;
  let worst = 0;
  for (const r of rendered) {
    const base = byKey.get(r.key);
    if (!base) continue; // reported via `extra` below
    seen.add(r.key);
    const hash = await hashImageData(r.image);
    if (hash === base.hash) {
      matched++;
      continue;
    }
    const baseImg = await pngDataUrlToImageData(base.png);
    const d = diffImageData(baseImg, r.image);
    worst = Math.max(worst, d.percent);
    if (d.percent <= DRIFT_THRESHOLD) {
      matched++; // hash moved but pixels within noise floor
      continue;
    }
    drifted.push({
      key: r.key,
      word: r.word,
      stepIndex: r.stepIndex,
      letter: r.letter,
      diffPercent: d.percent,
      baselinePng: base.png,
      currentPng: imageDataToPngDataUrl(r.image),
      diffPng: d.diffImage ? imageDataToPngDataUrl(d.diffImage) : "",
    });
  }
  drifted.sort((a, b) => b.diffPercent - a.diffPercent);
  return {
    total: rendered.length,
    matched,
    drifted,
    worst,
    missing: manifest.entries.filter((e) => !seen.has(e.key)).map((e) => e.key),
    extra: rendered.filter((r) => !byKey.has(r.key)).map((r) => r.key),
  };
}
