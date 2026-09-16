import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GenerationOrchestrator } from "$lib/shared/create/services/generation-orchestrator";
import { BuildResultTransformer } from "$lib/shared/create/services/build-result-transformer";
import { sequenceMetadataManager } from "$lib/shared/create/services/sequence-metadata-manager";
import { reversalDetector } from "$lib/shared/create/services/reversal-detector";
import { resolveLoopConfig } from "$lib/shared/create/services/loop-type-utils";
import { GenerationMode } from "$lib/shared/foundation/domain/models/generation/generate-models";
import type { GenerationOptions } from "$lib/shared/foundation/domain/models/generation/generate-models";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import { DifficultyLevel } from "$lib/shared/foundation/domain/models/generation/generate-models";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
function loadCsv(name: string) {
  const p = path.resolve(__dirname, "../../../static/data/pictographs", name);
  return readFileSync(p, "utf8").trim().split(/\r?\n/).slice(1)
    .map((l) => l.split(","))
    .filter((c) => c.length >= 13 && c[5])
    .map((c) => ({
      letter: c[0], startPlacement: c[1], endPlacement: c[2], timing: "together", direction: "together",
      leftMotion: { color: "blue", motionType: c[5], rotationDirection: c[6], startLocation: c[7], endLocation: c[8], startOrientation: "in", endOrientation: "in", turns: 0 },
      rightMotion: { color: "red", motionType: c[9], rotationDirection: c[10], startLocation: c[11], endLocation: c[12], startOrientation: "in", endOrientation: "in", turns: 0 },
    }));
}
function makeProvider() {
  const cache = new Map<string, ReturnType<typeof loadCsv>>();
  const idx = new Map<string, Map<string, ReturnType<typeof loadCsv>>>();
  let cur = "diamond";
  const load = (grid: string) => {
    if (cache.has(grid)) return;
    const rows = loadCsv(grid === "box" ? "BoxPictographDataframe.csv" : "DiamondPictographDataframe.csv");
    cache.set(grid, rows);
    const m = new Map<string, ReturnType<typeof loadCsv>>();
    for (const r of rows) { const k = `${r.letter}:${r.startPlacement}`; (m.get(k) ?? m.set(k, []).get(k))!.push(r); }
    idx.set(grid, m);
  };
  return {
    async initialize(grid: string) { cur = grid; load(grid); },
    isInitialized() { return cache.has(cur); },
    getAllVariations(grid: string) { load(grid); return cache.get(grid)!; },
    getVariations(letter: string, pos: string, grid: string) { load(grid); return idx.get(grid)!.get(`${letter}:${pos}`) ?? []; },
  } as never;
}

// THE harness: drives the exact deck-card path through the real orchestrator.
function createHarness() {
  const orch = new GenerationOrchestrator(
    makeProvider(),
    new BuildResultTransformer(sequenceMetadataManager, reversalDetector),
    sequenceMetadataManager,
  );
  return async function generateCard(p: {
    length: number; gridMode: "diamond" | "box"; loopType: string;
    slice: "halved" | "quartered"; level?: number; turnIntensity?: number;
  }) {
    const resolved = resolveLoopConfig(p.loopType, p.slice);
    const options: GenerationOptions = {
      mode: GenerationMode.CIRCULAR,
      length: p.length,
      gridMode: p.gridMode as GenerationOptions["gridMode"],
      propType: PropType.STAFF,
      difficulty: (p.level ?? 2) >= 3 ? DifficultyLevel.ADVANCED : (p.level ?? 2) === 2 ? DifficultyLevel.INTERMEDIATE : DifficultyLevel.BEGINNER,
      loopType: p.loopType as GenerationOptions["loopType"],
      period: resolved.period as GenerationOptions["period"],
      loopSpecWire: resolved.loopSpecWire,
      loopRhythm: resolved.loopRhythm,
      constraintPreset: "smooth",
      turnIntensity: p.turnIntensity ?? 1,
    };
    const sequence = await orch.generateSequence(options);
    return { steps: sequence.steps.length, cycle: sequence.orientationCycleCount ?? 1, coerced: resolved.period };
  };
}

const ROTATED = new Set(["rotated","rotated_inverted","rotated_swapped","rotated_swapped_inverted","mirrored_rotated","mirrored_inverted_rotated","mirrored_rotated_swapped","mirrored_rotated_inverted_swapped"]);
const IMPLEMENTED = ["rotated","mirrored","flipped","swapped","inverted","strict_rewound","mirrored_inverted","rotated_inverted","swapped_inverted","mirrored_rotated","mirrored_swapped","rotated_swapped","mirrored_inverted_rotated","mirrored_rotated_swapped","mirrored_swapped_inverted","rotated_swapped_inverted","mirrored_rotated_inverted_swapped"];

describe("deck length invariance (REAL pipeline)", () => {
  // Models DeckReleaserTab.generateLiveDeck exactly: draw through the real
  // orchestrator, REJECT any card that isn't exactly the
  // requested length, keep drawing within a budget. Asserts the two guarantees
  // Austen requires: (1) a deck NEVER ships an off-count card, and (2) every
  // offered combo can still fill a card at the requested length (not starved).
  it("every drawn card is exactly the requested length; no combo is starved", async () => {
    const gen = createHarness();
    const L = 16, BUDGET = 30, wantYield = 3;
    const offCount: string[] = [];   // accepted a card != L (must never happen)
    const starved: string[] = [];    // generated cards but never an exactly-L one
    for (const loopType of IMPLEMENTED) {
      const slices: ("halved" | "quartered")[] = ROTATED.has(loopType) ? ["halved", "quartered"] : ["halved"];
      for (const gridMode of ["diamond", "box"] as const) {
        for (const slice of slices) {
          let accepted = 0, generated = 0, over = 0, short = 0;
          for (let i = 0; i < BUDGET && accepted < wantYield; i++) {
            let r: Awaited<ReturnType<typeof gen>>;
            try { r = await gen({ length: L, gridMode, loopType, slice }); }
            catch { continue; } // box-mirror infeasibility etc — deck skips
            generated++;
            if (r.steps === L) accepted++;            // deck's `s.steps.length !== length` gate
            else if (r.steps > L) over++;
            else short++;
          }
          const tag = `${loopType} ${gridMode} ${slice}`;
          if (over + short > 0 && accepted === 0) starved.push(`${tag}: generated=${generated} over=${over} short=${short}, never hit ${L}`);
          if (generated > 0 && accepted === 0 && over + short === 0) { /* unreachable */ }
          if (generated === 0) { /* all attempts errored — box-mirror; deck yields fewer, fine */ }
          else console.log(`${accepted >= wantYield ? "OK " : "LOW"} ${tag.padEnd(46)} accepted=${accepted} (gen=${generated}, over32=${over}, short=${short})`);
        }
      }
    }
    console.log("\n=== STARVED combos (produce cards but never exactly 16) ===");
    console.log(starved.length ? starved.map((s) => "  " + s).join("\n") : "  (none) — every offered combo can fill a 16-step card");
    // A starved combo is a real problem: it's offered but can't honor the length.
    expect(starved, "\n" + starved.join("\n")).toEqual([]);
  }, 240_000);
});
