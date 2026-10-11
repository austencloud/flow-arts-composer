/**
 * Rendering-parity wave gate for the StepData→Step / MotionData→Motion
 * migration (and any hydrate/derivation/render refactor).
 *
 * Three modes, selected via RENDER_PARITY_MODE (cross-env in package.json):
 *
 *   self (default — `npm run test:render-parity`)
 *     Self-contained proof the harness works, no baseline needed:
 *       - corpus is non-vacuous (risk fixtures present, reversal steps present)
 *       - renderer is deterministic (drift will be signal, not noise)
 *       - capture→compare round-trip over the manifest format reports 0 drift
 *       - TEETH: a flipped reversal flag, a structural motion change, and a
 *         manual arrow nudge each produce detected drift. If any of these
 *         pass with zero drift, the harness is blind on that channel and the
 *         test FAILS. (The v1 page was blind on ALL THREE of these.)
 *
 *   capture (`npm run test:render-parity:capture`)
 *     Renders the full committed corpus and freezes the baseline manifest to
 *     tests/render-parity/.baseline/ (gitignored — local wave state).
 *
 *   compare (`npm run test:render-parity:compare`)
 *     Re-renders the same frozen corpus with CURRENT code and asserts zero
 *     pixel drift against the baseline. Drifted pictographs are written to
 *     tests/render-parity/.artifacts/ as baseline/current/diff PNG triplets.
 *
 * Wave workflow: capture at the pre-wave commit → apply the wave → compare.
 * The corpus fixture is committed, so both sides render identical inputs;
 * the only variable is the code.
 */
import { describe, it, expect } from "vitest";
import { commands } from "vitest/browser";
import {
  renderStepSet,
  hashImageData,
  buildManifest,
  compareToManifest,
  DRIFT_THRESHOLD,
  PIPELINE_VERSION,
  type ParityManifest,
  type RenderedStep,
} from "#lib/shared/render/parity/render-parity-core.js";
import { hydrate } from "#lib/shared/foundation/services/sequence-hydrator.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
import type { MotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import corpusJson from "./fixtures/render-parity-corpus.json";

declare const __RENDER_PARITY_MODE__: string;

const MODE = (__RENDER_PARITY_MODE__ || "self") as
  | "self"
  | "capture"
  | "compare";
const BASELINE_PATH =
  "tests/render-parity/.baseline/render-parity-manifest.json";
const ARTIFACTS_DIR = "tests/render-parity/.artifacts";

const corpus = corpusJson.sequences as unknown as SequenceData[];

/** Small deterministic subset for the self-contained tests (speed). */
function selfSubset(): SequenceData[] {
  const risk = corpus.filter((s) => (s.word ?? "").includes("__RISKFX_"));
  const real = corpus
    .filter((s) => !(s.word ?? "").includes("__RISKFX_"))
    .slice(0, 4);
  return [...real, ...risk];
}

async function hashAll(rendered: RenderedStep[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const r of rendered) out.set(r.key, await hashImageData(r.image));
  return out;
}

function countHashDiffs(
  a: Map<string, string>,
  b: Map<string, string>
): number {
  let n = 0;
  for (const [k, v] of a) if (b.get(k) !== v) n++;
  return n;
}

function dataUrlToBase64(url: string): string {
  return url.slice(url.indexOf(",") + 1);
}

describe.runIf(MODE === "self")(
  "render-parity harness (self-contained proof)",
  () => {
    // Rendered once, shared across the self tests (the baseline of every check).
    let baseline: RenderedStep[];
    let baselineHashes: Map<string, string>;

    it("corpus is non-vacuous: risk fixtures + reversal-bearing steps present", () => {
      const words = corpus.map((s) => s.word ?? "");
      expect(words.some((w) => w.includes("__RISKFX_COMP"))).toBe(true);
      expect(words.some((w) => w.includes("__RISKFX_INLINE"))).toBe(true);

      // The reversal-dot channel is only guarded if real reversal flags render.
      let reversalSteps = 0;
      for (const seq of selfSubset()) {
        const h = hydrate(seq) as SequenceData;
        for (const s of h.steps ?? []) {
          if (s.leftReversal || s.rightReversal) reversalSteps++;
        }
      }
      expect(reversalSteps).toBeGreaterThan(0);
    });

    it("renders the subset and is deterministic across passes", async () => {
      const subset = selfSubset();

      // Guard the preparer path: if prepareSingle throws, the renderer silently
      // falls back to unprepared (no arrows/props) with only a console.warn —
      // exactly the v1 blindness. Make that loud.
      const originalWarn = console.warn;
      const prepareFailures: string[] = [];
      console.warn = (...args: unknown[]) => {
        const msg = args.map(String).join(" ");
        if (msg.includes("Failed to prepare pictograph"))
          prepareFailures.push(msg);
        originalWarn.apply(console, args as []);
      };
      try {
        baseline = await renderStepSet(subset);
      } finally {
        console.warn = originalWarn;
      }
      expect(
        prepareFailures,
        "PictographPreparer must succeed — fallback renders no arrows/props"
      ).toEqual([]);
      expect(baseline.length).toBeGreaterThan(20);

      // Guard against blank output: every render must contain non-background
      // content (grid + glyphs + props/arrows), not just the fill color.
      const bg = { r: 0x0a, g: 0x0a, b: 0x0f };
      for (const r of baseline.slice(0, 5)) {
        let content = 0;
        const d = r.image.data;
        for (let i = 0; i < d.length; i += 4) {
          if (d[i] !== bg.r || d[i + 1] !== bg.g || d[i + 2] !== bg.b)
            content++;
        }
        const ratio = content / (r.image.width * r.image.height);
        expect(
          ratio,
          `render ${r.key} (${r.word}) looks blank`
        ).toBeGreaterThan(0.02);
      }

      baselineHashes = await hashAll(baseline);
      const second = await renderStepSet(subset);
      const secondHashes = await hashAll(second);
      const diffs = countHashDiffs(baselineHashes, secondHashes);
      expect(
        diffs,
        "renderer must be deterministic — parity drift must be signal"
      ).toBe(0);
    });

    it("manifest capture→compare round-trip reports zero drift on identical code", async () => {
      const manifest = await buildManifest(baseline, selfSubset().length);
      expect(manifest.pipelineVersion).toBe(PIPELINE_VERSION);
      // Serialize + reparse — exercises the exact on-disk format the wave gate uses.
      const reparsed = JSON.parse(JSON.stringify(manifest)) as ParityManifest;
      const second = await renderStepSet(selfSubset());
      const result = await compareToManifest(reparsed, second);
      expect(result.drifted, "identical code must produce zero drift").toEqual(
        []
      );
      expect(result.missing).toEqual([]);
      expect(result.extra).toEqual([]);
      expect(result.matched).toBe(result.total);
    });

    it("TEETH: a flipped reversal flag produces detected drift", async () => {
      const mutated = await renderStepSet(selfSubset(), {
        mutateStep: (step) =>
          ({
            ...step,
            leftReversal: !step.leftReversal,
            rightReversal: !step.rightReversal,
          }) as StepData,
      });
      const diffs = countHashDiffs(baselineHashes, await hashAll(mutated));
      expect(
        diffs,
        "reversal-flag flip rendered identically — harness is BLIND to the reversal-dot channel"
      ).toBeGreaterThan(0);
    });

    it("TEETH: a structural motion change produces detected drift", async () => {
      const mutated = await renderStepSet(selfSubset(), {
        mutateStep: (step) => {
          const blue = step.motions?.blue;
          if (!blue) return step;
          const turns = typeof blue.turns === "number" ? blue.turns + 1 : 1;
          return {
            ...step,
            motions: {
              ...step.motions,
              blue: { ...blue, turns } as MotionData,
            },
          } as StepData;
        },
      });
      const diffs = countHashDiffs(baselineHashes, await hashAll(mutated));
      expect(
        diffs,
        "turns mutation rendered identically — harness is BLIND to structural motion changes"
      ).toBeGreaterThan(0);
    });

    it("TEETH: a manual arrow nudge produces detected drift", async () => {
      const mutated = await renderStepSet(selfSubset(), {
        mutateStep: (step) => {
          const blue = step.motions?.blue;
          if (!blue) return step;
          return {
            ...step,
            motions: {
              ...step.motions,
              blue: {
                ...blue,
                arrowPlacementData: {
                  ...blue.arrowPlacementData,
                  manualAdjustmentX:
                    (blue.arrowPlacementData?.manualAdjustmentX ?? 0) + 60,
                  manualAdjustmentY:
                    (blue.arrowPlacementData?.manualAdjustmentY ?? 0) + 60,
                },
              } as MotionData,
            },
          } as StepData;
        },
      });
      const diffs = countHashDiffs(baselineHashes, await hashAll(mutated));
      expect(
        diffs,
        "manual arrow nudge rendered identically — arrows are NOT rendering (preparer unwired?) or authored placement is dropped"
      ).toBeGreaterThan(0);
    });
  }
);

describe.runIf(MODE === "capture")("render-parity baseline capture", () => {
  it("freezes the full-corpus baseline manifest", async () => {
    const rendered = await renderStepSet(corpus, {
      onProgress: (done, total) => {
        if (done % 50 === 0) console.log(`  render ${done}/${total}`);
      },
    });
    expect(rendered.length).toBeGreaterThan(300);
    const manifest = await buildManifest(rendered, corpus.length);
    await commands.writeFile(BASELINE_PATH, JSON.stringify(manifest));
    console.log(
      `BASELINE CAPTURED: ${manifest.entries.length} pictographs from ${corpus.length} sequences (pipeline v${manifest.pipelineVersion}) -> ${BASELINE_PATH}`
    );
    console.log(
      "Now apply the migration wave, then run test:render-parity:compare."
    );
  });
});

describe.runIf(MODE === "compare")(
  "render-parity compare vs frozen baseline",
  () => {
    it("current code renders the frozen corpus pixel-identically", async () => {
      let raw: string;
      try {
        raw = await commands.readFile(BASELINE_PATH);
      } catch {
        throw new Error(
          `No baseline at ${BASELINE_PATH}. Run test:render-parity:capture at the pre-wave commit first.`
        );
      }
      const manifest = JSON.parse(raw) as ParityManifest;
      const rendered = await renderStepSet(corpus, {
        onProgress: (done, total) => {
          if (done % 50 === 0) console.log(`  render ${done}/${total}`);
        },
      });
      const result = await compareToManifest(manifest, rendered);

      if (result.drifted.length > 0) {
        for (const d of result.drifted) {
          const safe = `${d.word}-step${d.stepIndex + 1}`.replace(
            /[^\w-]/g,
            "_"
          );
          await commands.writeFile(
            `${ARTIFACTS_DIR}/${safe}-baseline.png`,
            dataUrlToBase64(d.baselinePng),
            "base64"
          );
          await commands.writeFile(
            `${ARTIFACTS_DIR}/${safe}-current.png`,
            dataUrlToBase64(d.currentPng),
            "base64"
          );
          if (d.diffPng) {
            await commands.writeFile(
              `${ARTIFACTS_DIR}/${safe}-diff.png`,
              dataUrlToBase64(d.diffPng),
              "base64"
            );
          }
        }
        console.log(
          `DRIFT: ${result.drifted.length}/${result.total} pictographs changed (worst ${result.worst}%). Triplets -> ${ARTIFACTS_DIR}/`
        );
        for (const d of result.drifted.slice(0, 10)) {
          console.log(
            `  ${d.word} step ${d.stepIndex + 1} (${d.letter}): ${d.diffPercent}%`
          );
        }
      } else {
        console.log(
          `PARITY: ${result.total} pictographs, 0 drifted (worst sub-threshold diff ${result.worst}% <= ${DRIFT_THRESHOLD}%).`
        );
      }

      expect(
        result.missing,
        "baseline keys the current code no longer renders"
      ).toEqual([]);
      expect(
        result.drifted.map(
          (d) => `${d.word} step ${d.stepIndex + 1}: ${d.diffPercent}%`
        ),
        "pixel drift vs frozen baseline — the wave changed rendering"
      ).toEqual([]);
    });
  }
);
