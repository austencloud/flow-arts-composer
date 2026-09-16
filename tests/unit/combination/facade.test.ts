/**
 * The public seam — `getSequenceCombinator()` — and the runtime ambient
 * provider that finally connects the engine to the real pictograph dataset.
 *
 * Every earlier ambient test drove hand-built stub providers over the
 * fixtures. This suite is where the stubs come off: the provider asks the
 * app's own `motionQueryHandler` what starts at a seam, and the facade wires
 * that into `findCombinations` without the caller naming it. So the money test
 * here is AAAA + HHHH with NO provider argument at all — alpha world and beta
 * world, bridged by whatever Φ/Ψ material the dataframe actually contains.
 */

import { beforeAll, describe, expect, it, vi } from "vitest";

import {
  __resetForTests,
  getSequenceCombinator,
} from "$lib/shared/combination/get-sequence-combinator";
import { createRuntimeAmbientProvider } from "$lib/shared/combination/services/runtime-ambient-provider";
import { findCombinations } from "$lib/shared/combination/services/sequence-combinator";
import type { AmbientOptionProvider } from "$lib/shared/combination/domain/types";
import {
  ambientLetterSet,
  rosterConfirmedBases,
} from "$lib/shared/combination/domain/base-sequence-registry";
import { placementLabelsMatchLocations } from "$lib/shared/combination/services/placement-groups";
import { createStepData } from "$lib/shared/foundation/domain/factories/create-step-data";
import { Letter } from "$lib/shared/foundation/domain/models/letter";
import {
  GridMode,
  GridPlacement,
} from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import { motionQueryHandler } from "$lib/shared/pictograph/shared/services/motion-query-handler";

import { AAAA_CCW, GGGG_CW, HHHH_CCW } from "./fixtures";
import { loadPictographDatasetForTests } from "./pictograph-dataset";

beforeAll(async () => {
  await loadPictographDatasetForTests();
}, 60_000);

describe("getSequenceCombinator", () => {
  it("exposes both entry points and previews words drawing on BOTH cards", () => {
    const combinator = getSequenceCombinator();
    expect(typeof combinator.findCombinations).toBe("function");
    expect(typeof combinator.candidateWords).toBe("function");

    const preview = combinator.candidateWords(GGGG_CW, HHHH_CCW);

    // GGGG simplifies to "G", HHHH to "H" — the two ingredient display names.
    expect(preview.words.length).toBeGreaterThan(0);
    for (const candidate of preview.words) {
      expect(candidate.ingredients).toContain("G");
      expect(candidate.ingredients).toContain("H");
    }

    // The smallest thing a beta-pro card and a beta-anti card can spell.
    const gh = preview.words.find((w) => w.word === "GH");
    expect(gh).toBeDefined();
    expect(gh!.letters).toEqual([Letter.G, Letter.H]);

    // Flags are the enumerator's, unmodified — the filter runs after it. At
    // the defaults (length <=5, cap 4,000 vs a complete set of 3,916) the
    // sweep finishes, so the preview can honestly claim it looked everywhere.
    expect(preview.resultsTruncated).toBe(false);
    expect(preview.budgetExhausted).toBe(false);
    expect(preview.searchComplete).toBe(true);
  });

  it("sweeps the whole length-5 space at the defaults, on every pair shape", () => {
    const combinator = getSequenceCombinator();
    const pairs: Array<[string, typeof GGGG_CW, typeof GGGG_CW]> = [
      ["GGGG+HHHH", GGGG_CW, HHHH_CCW],
      ["AAAA+HHHH", AAAA_CCW, HHHH_CCW],
      ["GGGG+GGGG", GGGG_CW, GGGG_CW],
    ];

    for (const [label, a, b] of pairs) {
      const preview = combinator.candidateWords(a, b);
      expect(
        preview.searchComplete,
        `${label} truncated at the default cap`
      ).toBe(true);
      expect(preview.words.length).toBeGreaterThan(0);
    }
  });

  it("handles the same card twice (ingredients are identified by index)", () => {
    const preview = getSequenceCombinator().candidateWords(GGGG_CW, GGGG_CW);

    expect(preview.words.length).toBeGreaterThan(0);
    // Duplicate display names are disambiguated by the enumerator: the second
    // occurrence becomes "G (2)". Both must appear or the filter dropped it.
    for (const candidate of preview.words) {
      expect(candidate.ingredients).toContain("G");
      expect(candidate.ingredients).toContain("G (2)");
    }
    expect(preview.words.some((w) => w.word === "G")).toBe(true);
  });
});

describe("createRuntimeAmbientProvider", () => {
  it("answers a bare seam with real dataset steps, ambient-filtered", async () => {
    const provider = createRuntimeAmbientProvider(GridMode.DIAMOND);
    const options = await provider.optionsAt(GridPlacement.BETA5);
    const eligible = ambientLetterSet();

    expect(options.length).toBeGreaterThan(0);
    for (const step of options) {
      expect(step.startPlacement).toBe(GridPlacement.BETA5);
      expect(step.letter).not.toBeNull();
      expect(eligible.has(step.letter!)).toBe(true);
      expect(placementLabelsMatchLocations(step)).toBe(true);
    }

    // Second call is served from the per-seam cache, identically.
    const again = await provider.optionsAt(GridPlacement.BETA5);
    expect(again).toBe(options);
  });

  it("rejects nothing on the real dataset — the label gate never fires", async () => {
    // Watch-item from the Task-9 review: the engine drops provider material
    // whose placement labels disagree with its own motion locations, warning
    // ONCE. If the shipped dataframe ever disagreed, legitimate bridges would
    // vanish almost silently. Sweep it and pin the count at zero.
    let failures = 0;
    let rows = 0;
    for (const gridMode of [GridMode.DIAMOND, GridMode.BOX]) {
      const all = await motionQueryHandler.queryMotions({ gridMode });
      for (const pictograph of all) {
        rows++;
        if (!placementLabelsMatchLocations(createStepData({ ...pictograph }))) {
          failures++;
        }
      }
    }

    expect(rows).toBeGreaterThan(1000);
    expect(failures).toBe(0);
  }, 60_000);

  it("counts what it rejected, so a silent drop is observable", async () => {
    const provider = createRuntimeAmbientProvider(GridMode.DIAMOND);
    await provider.optionsAt(GridPlacement.BETA5);

    expect(provider.stats.seamsQueried).toBe(1);
    expect(provider.stats.optionsOffered).toBeGreaterThan(0);
    expect(provider.stats.labelMismatches).toBe(0);
    expect(provider.stats.fallbackRelays).toBe(0);
    expect(provider.stats.optionsKept).toBeGreaterThan(0);
  });

  it("counts the handler's no-match fallback apart from real rejections", async () => {
    // Nothing in the DIAMOND dataframe starts at a skewed-mode placement, so
    // the handler relays its whole row set. That is an EMPTY seam, not 576
    // suspect candidates — it must not inflate seamMismatches.
    const provider = createRuntimeAmbientProvider(GridMode.DIAMOND);
    const options = await provider.optionsAt(GridPlacement.ZETA1);

    expect(options).toEqual([]);
    expect(provider.stats.fallbackRelays).toBe(1);
    expect(provider.stats.seamMismatches).toBe(0);
    expect(provider.stats.labelMismatches).toBe(0);
  });
});

describe("auto-wired ambient search", () => {
  it("bridges AAAA and HHHH with no provider argument", async () => {
    const started = performance.now();
    const report = await getSequenceCombinator().findCombinations(
      AAAA_CCW,
      HHHH_CCW
    );
    const elapsedMs = performance.now() - started;
    console.log(
      `[facade] AAAA+HHHH auto-wired: ${report.results.length} results in ${Math.round(elapsedMs)}ms`
    );

    // The two cards share no seam, so this is only reachable through ambient
    // material the dataset supplied — and reachable it must be.
    expect(report.impossible).toBe(false);
    expect(report.ambientRunCap).toBeGreaterThan(0);

    const bridged = report.results.filter((r) => r.usedAmbient);
    expect(bridged.length).toBeGreaterThan(0);

    const rosterWords = new Set(rosterConfirmedBases().map((b) => b.word));
    for (const result of bridged) {
      expect(result.ambientWords.length).toBeGreaterThan(0);
      for (const word of result.ambientWords) {
        expect(rosterWords.has(word)).toBe(true);
      }
    }
  }, 120_000);

  it("still returns pure-card results first for two cards that already meet", async () => {
    const report = await getSequenceCombinator().findCombinations(
      GGGG_CW,
      HHHH_CCW
    );

    expect(report.results.length).toBeGreaterThan(0);
    expect(report.results[0]!.usedAmbient).toBe(false);
    expect(report.impossible).toBe(false);
  }, 120_000);

  it("reports a healthy pool and an attached provider", async () => {
    const report = await getSequenceCombinator().findCombinations(
      AAAA_CCW,
      HHHH_CCW
    );

    expect(report.poolIncomplete).toBe(false);
    expect(report.ambientUnavailable).toBe(false);
  }, 120_000);

  it("flags poolIncomplete when the provider fails, instead of proving anything", async () => {
    const broken: AmbientOptionProvider = {
      optionsAt() {
        return Promise.reject(new Error("dataset is down"));
      },
    };

    const report = await findCombinations(AAAA_CCW, HHHH_CCW, {
      ambientProvider: broken,
    });

    expect(report.poolIncomplete).toBe(true);
    // A subset graph can only manufacture a false theorem.
    expect(report.impossible).toBe(false);
    // The engine itself never attempts an auto-wire.
    expect(report.ambientUnavailable).toBe(false);
  }, 120_000);

  it("flags ambientUnavailable when the dataset cannot answer", async () => {
    // The dataset is loaded for this suite, so starve it deliberately: an
    // empty handler is exactly what an un-hydrated app or a latched failed
    // load looks like from here.
    __resetForTests();
    const starved = vi
      .spyOn(motionQueryHandler, "queryMotions")
      .mockResolvedValue([]);

    try {
      const report = await getSequenceCombinator().findCombinations(
        AAAA_CCW,
        HHHH_CCW
      );

      expect(report.ambientUnavailable).toBe(true);
      expect(report.ambientRunCap).toBe(0);
      // No bridges, so the two worlds genuinely do not meet — but a UI must
      // not print that flatly while `ambientUnavailable` is set.
      expect(report.impossible).toBe(true);
    } finally {
      starved.mockRestore();
      __resetForTests();
    }
  }, 120_000);

  it("exposes the auto-wired provider's counters, per grid mode", async () => {
    __resetForTests();
    const combinator = getSequenceCombinator();

    expect(combinator.ambientStats()).toBeNull();

    await combinator.findCombinations(AAAA_CCW, HHHH_CCW);

    const stats = combinator.ambientStats();
    expect(stats).not.toBeNull();
    expect(stats!.seamsQueried).toBeGreaterThan(0);
    expect(stats!.optionsKept).toBeGreaterThan(0);
    expect(stats!.labelMismatches).toBe(0);

    // A snapshot does not move under the caller.
    const before = stats!.seamsQueried;
    await combinator.findCombinations(GGGG_CW, HHHH_CCW);
    expect(stats!.seamsQueried).toBe(before);
    expect(combinator.ambientStats()!.seamsQueried).toBeGreaterThanOrEqual(
      before
    );

    // No search has run in box mode, so no provider exists for it.
    expect(combinator.ambientStats(GridMode.BOX)).toBeNull();
  }, 240_000);

  it("is deterministic across runs of the whole auto-wired pipeline", async () => {
    const combinator = getSequenceCombinator();
    const first = await combinator.findCombinations(AAAA_CCW, HHHH_CCW);
    const second = await combinator.findCombinations(AAAA_CCW, HHHH_CCW);

    expect(second.results.map((r) => r.derivation)).toEqual(
      first.results.map((r) => r.derivation)
    );
    expect(second.results.map((r) => r.canonicalHash)).toEqual(
      first.results.map((r) => r.canonicalHash)
    );
    expect(second.searchedToLength).toBe(first.searchedToLength);
    expect(second.impossible).toBe(first.impossible);
  }, 240_000);
});
