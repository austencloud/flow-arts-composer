import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GenerationOrchestrator } from "$lib/shared/create/services/generation-orchestrator";
import { BuildResultTransformer } from "$lib/shared/create/services/build-result-transformer";
import { sequenceMetadataManager } from "$lib/shared/create/services/sequence-metadata-manager";
import { reversalDetector } from "$lib/shared/create/services/reversal-detector";
import {
  resolveLoopConfig,
  parseLoopComponents,
  generateLOOPType,
} from "$lib/shared/create/services/loop-type-utils";
import { GenerationMode, DifficultyLevel } from "$lib/shared/foundation/domain/models/generation/generate-models";
import type { GenerationOptions } from "$lib/shared/foundation/domain/models/generation/generate-models";
import { ROTATED_LOOP_TYPES } from "$lib/shared/foundation/domain/models/generation/circular-models";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import {
  LOOP_PACKS,
  parseRecipe,
  recipeProblem,
  DECK_SIZE,
  type RecipeSlice,
  type LoopPackId,
} from "$lib/features/store/domain/loop-config";

// Order → deck fulfillment simulation (the "fire drill" in code).
//
// A paid shop order lands in Firestore `orders` carrying ONE of three LOOP
// config shapes in items[0] (written by handleMerchWebhook from Stripe
// metadata): a curated pack id, the three dials, or a Deck Architect recipe
// string. Fulfillment must decode that into per-slice draw settings and
// live-generate the cards through the SAME pipeline the Deck Releaser uses.
//
// This test walks all three shapes end to end with the real decode code and
// the real generation pipeline, proving every slice a buyer can order is
// actually producible at its exact requested length. Companion runbook:
// docs/reference/order-fulfillment-runbook.md

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
    async getAllVariationsForGrid(grid: string) { load(grid); return [...cache.get(grid)!]; },
    getVariations(letter: string, pos: string, grid: string) { load(grid); return idx.get(grid)!.get(`${letter}:${pos}`) ?? []; },
  } as never;
}

// ---------------------------------------------------------------------------
// Fixtures: the three order shapes exactly as handleMerchWebhook records them
// (items[0] fields from Stripe session metadata; unrelated fields omitted).
// ---------------------------------------------------------------------------

interface OrderItemFixture {
  productId: string;
  productName: string;
  propType?: string;
  loopPack?: string;
  loopRecipe?: string;
  loopLevel?: string;
  loopLength?: string;
  loopFlavor?: string;
  loopCustom?: string;
}

const ORDER_PACK: OrderItemFixture = {
  productId: "D6Ea11ALmrU9GB34qjPt",
  productName: "LOOP Deck",
  propType: "staff",
  loopPack: "mild",
};

const ORDER_DIALS: OrderItemFixture = {
  productId: "D6Ea11ALmrU9GB34qjPt",
  productName: "LOOP Deck",
  propType: "fan",
  loopLevel: "2",
  loopLength: "12",
  loopFlavor: "mirrored",
  loopCustom: JSON.stringify({ maxTurns: 1 }),
};

// Deck Architect: 4 slices spanning L2 turns, a compound flavor, an inverted
// compound, and an L3 slice — the hardest shapes a buyer can order today.
const ORDER_RECIPE: OrderItemFixture = {
  productId: "prod_UsFtOGytTY00MK",
  productName: "LOOP Deck — Deck Architect",
  propType: "staff",
  loopRecipe: "18:rotated:2:8:1;12:mirrored-swapped:1:8;12:swapped-inverted:2:8:1;12:rotated:3:12:2",
};

// ---------------------------------------------------------------------------
// Decode: order item → fulfillment slices. This IS the runbook's translation
// step, expressed against the real client constants (LOOP_PACKS, parseRecipe).
// ---------------------------------------------------------------------------

function decodeOrderToSlices(item: OrderItemFixture): RecipeSlice[] {
  if (item.loopPack) {
    const pack = LOOP_PACKS.find((p) => p.id === (item.loopPack as LoopPackId));
    if (!pack) throw new Error(`Unknown pack ${item.loopPack}`);
    return pack.slices.flatMap((s) =>
      Object.entries(s.lengths).map(([steps, count]) => ({
        count,
        flavor: s.flavor,
        level: s.level,
        steps: Number(steps),
        ...(s.maxTurns !== undefined ? { maxTurns: s.maxTurns } : {}),
      }))
    );
  }
  if (item.loopRecipe) return parseRecipe(item.loopRecipe);
  if (item.loopLevel && item.loopLength && item.loopFlavor) {
    const custom = item.loopCustom ? (JSON.parse(item.loopCustom) as { maxTurns?: number }) : {};
    const level = Number(item.loopLevel);
    return [{
      count: DECK_SIZE,
      flavor: item.loopFlavor as RecipeSlice["flavor"],
      level,
      steps: Number(item.loopLength),
      ...(level >= 2 ? { maxTurns: custom.maxTurns ?? 1 } : {}),
    }];
  }
  throw new Error("Order item carries no LOOP config");
}

/** Slice → the Deck Releaser draw settings an operator would enter. */
function sliceToDrawSettings(s: RecipeSlice) {
  const loopType = generateLOOPType(parseLoopComponents(s.flavor));
  if (!loopType) throw new Error(`Flavor ${s.flavor} maps to no implemented LOOPType`);
  // Rotated-family slices print as mandalas → quartered; everything else is
  // halved (resolveLoopConfig coerces quartered→halved for period-2 types anyway).
  const slice: "halved" | "quartered" =
    ROTATED_LOOP_TYPES.has(loopType) && s.steps % 4 === 0 ? "quartered" : "halved";
  return { loopType: loopType as string, slice, level: s.level, length: s.steps, turnIntensity: s.maxTurns ?? 0, totalCards: s.count };
}

describe("shop order → deck fulfillment simulation (REAL decode + REAL pipeline)", () => {
  it("decodes all three order shapes into valid 54-card slice plans", () => {
    for (const [label, item] of [
      ["pack:mild", ORDER_PACK],
      ["dials", ORDER_DIALS],
      ["architect", ORDER_RECIPE],
    ] as const) {
      const slices = decodeOrderToSlices(item);
      const total = slices.reduce((n, s) => n + s.count, 0);
      expect(total, `${label} slice counts must sum to a full deck`).toBe(DECK_SIZE);
      for (const s of slices) expect(sliceToDrawSettings(s).loopType).toBeTruthy();
    }
    // The architect fixture must be a recipe a buyer could actually submit.
    expect(recipeProblem(parseRecipe(ORDER_RECIPE.loopRecipe!))).toBeNull();
    // Every curated pack (not just the ordered one) must decode to a full deck.
    for (const pack of LOOP_PACKS) {
      const total = pack.slices.flatMap((s) => Object.values(s.lengths)).reduce((a, b) => a + b, 0);
      expect(total, `pack ${pack.id} must total ${DECK_SIZE}`).toBe(DECK_SIZE);
    }
  });

  // Models DeckReleaserTab.generateLiveDeck per slice: draw through the real
  // orchestrator, REJECT off-length cards, keep drawing
  // within a budget. A slice that never yields an exact-length card means the
  // shop sold a deck fulfillment cannot produce — the one failure that matters.
  it("every slice of every order shape live-generates at its exact length", async () => {
    const orch = new GenerationOrchestrator(
      makeProvider(),
      new BuildResultTransformer(sequenceMetadataManager, reversalDetector),
      sequenceMetadataManager,
    );
    const WANT = 2, BUDGET = 15;
    const failures: string[] = [];

    for (const [label, item] of [
      ["pack:mild", ORDER_PACK],
      ["dials", ORDER_DIALS],
      ["architect", ORDER_RECIPE],
    ] as const) {
      for (const s of decodeOrderToSlices(item)) {
        const d = sliceToDrawSettings(s);
        const resolved = resolveLoopConfig(d.loopType, d.slice);
        const options: GenerationOptions = {
          mode: GenerationMode.CIRCULAR,
          length: d.length,
          gridMode: "diamond",
          propType: PropType.STAFF,
          difficulty: d.level >= 3 ? DifficultyLevel.ADVANCED : d.level === 2 ? DifficultyLevel.INTERMEDIATE : DifficultyLevel.BEGINNER,
          loopType: d.loopType as GenerationOptions["loopType"],
          period: resolved.period as GenerationOptions["period"],
          loopSpecWire: resolved.loopSpecWire,
          loopRhythm: resolved.loopRhythm,
          constraintPreset: "smooth",
          turnIntensity: d.turnIntensity,
        };
        let accepted = 0, attempts = 0;
        while (accepted < WANT && attempts < BUDGET) {
          attempts++;
          try {
            const sequence = await orch.generateSequence(options);
            if (sequence.steps.length === d.length) accepted++;
          } catch {
            continue; // releaser skips failed attempts the same way
          }
        }
        const tag = `${label} → ${d.totalCards}× ${d.loopType} L${d.level} ${d.length}-step ${d.slice}${d.turnIntensity ? ` ≤${d.turnIntensity}T` : ""}`;
        console.log(`${accepted >= WANT ? "OK " : "FAIL"} ${tag} (accepted=${accepted}/${attempts} attempts)`);
        if (accepted === 0) failures.push(tag);
      }
    }
    expect(failures, `unfulfillable slices:\n${failures.join("\n")}`).toEqual([]);
  }, 300_000);
});
