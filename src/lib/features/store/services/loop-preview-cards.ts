/**
 * Live preview cards for the LOOP configurator.
 *
 * The fan must DEMONSTRATE the dials. Enumerated catalogs only cover a slice
 * of the config space (Level 1 hands at 8 steps, plus rotated at 12/16), so
 * catalog sampling alone silently fell back to Level 1 eight-counts when the
 * buyer dialed Level 2 · 12 — the preview lied about the product.
 *
 * Now the preview runs the SAME engine fulfillment runs (generationOrchestrator,
 * CIRCULAR mode — see DeckReleaserTab.generateLiveDeck): when an enumerated
 * catalog exactly matches the dials we sample it (instant, and it IS the
 * printed pool), otherwise we live-generate real sequences at the dialed
 * level/length/turns. Hands are cached per dial key so toggling back is instant.
 *
 * Returns null on any failure — the caller falls back to the SKU covers.
 */

import {
  getCachedCatalogs,
  loadCatalogs,
  loadCatalogSequencesPage,
} from "#lib/features/choreo-card/services/catalog-loader.js";
import type { Catalog } from "#lib/features/choreo-card/domain/models/Catalog.js";
import type { CoverCard, Product } from "../domain/models/product";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type {
  LoopFlavor,
  LoopLength,
  LoopLevel,
  LoopPackId,
  RecipeSlice,
} from "../domain/loop-config";
import { DEFAULT_MAX_TURNS, loopPack } from "../domain/loop-config";
import { generateLOOPType, resolveLoopConfig } from "#lib/shared/create/services/loop-type-utils.js";
import { levelToDifficulty } from "#lib/shared/create/utils/config-mapper.js";
import { LOOPType } from "#lib/shared/foundation/domain/models/generation/circular-models.js";
import {
  GenerationMode,
  type GenerationOptions,
  type LOOPComponent,
} from "#lib/shared/foundation/domain/models/generation/generate-models.js";
import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";

const FAN_SIZE = 6;

let catalogsPromise: Promise<Catalog[]> | null = null;
async function getLoopCatalogs(): Promise<Catalog[]> {
  // localStorage warm copy first (families trimmed, but we only need the
  // scalar fields); cold path loads and re-primes that cache.
  const cached = getCachedCatalogs();
  if (cached?.length) return cached;
  catalogsPromise ??= loadCatalogs();
  return catalogsPromise;
}

/** Catalogs are an OPTIMIZATION (instant L1 sampling from the printed pool),
 *  never a requirement: shop visitors are signed out and Firestore denies
 *  them catalog reads. Any failure degrades to live generation. */
async function safeCatalogs(): Promise<Catalog[]> {
  try {
    return await getLoopCatalogs();
  } catch {
    catalogsPromise = null; // don't cache the rejection
    return [];
  }
}

// First fan-sized page of each catalog, fetched once per session — a variety
// hand (1 card) and a full flavor hand (6) share the same cached page.
const seqCache = new Map<string, Promise<SequenceData[]>>();
function sampleSequences(catalogId: string): Promise<SequenceData[]> {
  let hit = seqCache.get(catalogId);
  if (!hit) {
    hit = loadCatalogSequencesPage(catalogId, FAN_SIZE).then((r) => r.sequences);
    seqCache.set(catalogId, hit);
  }
  return hit;
}

/** Flavor slug ("mirrored-swapped") → catalog loopType ("mirrored_swapped"). */
const toCatalogLoopType = (f: LoopFlavor) => f.replace(/-/g, "_");

/** Catalog that matches the dials EXACTLY (level + step count) — the only
 *  kind the preview may sample; anything looser lies about the product. */
function exactCatalog(
  cats: Catalog[],
  flavor: LoopFlavor,
  level: number,
  wantSteps: number
): Catalog | null {
  const loopType = toCatalogLoopType(flavor);
  const candidates = cats.filter(
    (c) =>
      c.collection === "LOOPs" &&
      !c.asymmetric && // asymmetric enumerations store no sequences of their own
      c.loopType === loopType &&
      c.level === level &&
      c.stepCount === wantSteps
  );
  // Prefer the curated 54-card decks (the printed product), then the biggest pool.
  candidates.sort(
    (a, b) =>
      Number(b.id.includes("-c54")) - Number(a.id.includes("-c54")) ||
      b.totalSequences - a.totalSequences
  );
  return candidates[0] ?? null;
}

/** Frame styling carried over from the flavor SKU's curated covers, so the
 *  sampled cards keep the flavor's accent identity. */
function accentFrom(sku: Product | undefined): Omit<CoverCard, "sequence"> {
  const c = sku?.coverCards?.[0];
  if (!c) return {};
  return {
    accentColor: c.accentColor,
    darkComplement: c.darkComplement,
    tintOpacity: c.tintOpacity,
    footerCenter: c.footerCenter,
  };
}

/* ── live generation ─────────────────────────────────────────────────────────
   One engine call per card, dials mapped exactly the way fulfillment maps them
   (DeckReleaserTab.generateLiveDeck): CIRCULAR mode, difficulty from level,
   LOOPType from the flavor's component set, turn ceiling from the dial. */

interface HandDials {
  flavor: LoopFlavor;
  level: number;
  steps: number;
  maxTurns: number;
  propType: PropType;
}

// Generated hands keyed by their full dial set — dialing away and back is free.
const liveCache = new Map<string, Promise<SequenceData[]>>();

function liveHand(dials: HandDials, n: number, offset = 0): Promise<SequenceData[]> {
  // Offset in the key so repeated identical slots (a pack hand dealing four
  // 8-counts) each generate their own card instead of sharing one.
  const key = `${dials.flavor}|${dials.level}|${dials.steps}|${dials.maxTurns}|${dials.propType}|${n}|${offset}`;
  let hit = liveCache.get(key);
  if (!hit) {
    hit = generateHand(dials, n).catch((e) => {
      liveCache.delete(key); // don't cache a failure
      throw e;
    });
    liveCache.set(key, hit);
  }
  return hit;
}

async function generateHand(dials: HandDials, n: number): Promise<SequenceData[]> {
  const components = new Set(dials.flavor.split("-") as unknown as LOOPComponent[]);
  const loopType = generateLOOPType(components);
  if (!loopType) return [];

  // Same seam fulfillment uses; dynamic so the shop route doesn't pull the
  // whole generation engine into its initial chunk.
  const { generationOrchestrator } = await import(
    "#lib/shared/create/services/generation-orchestrator.js"
  );

  // Rotated quartered is the printed-deck canon; combos seed halved. Route
  // through resolveLoopConfig so the preview gets the compositional wire spec
  // (true expander multiplier) — otherwise mirror+rotated previews overshoot to
  // 2× the requested length, misrepresenting the printed card.
  const resolvedLoop = resolveLoopConfig(
    loopType,
    loopType === LOOPType.ROTATED ? "quartered" : "halved",
  );
  const options: GenerationOptions = {
    mode: GenerationMode.CIRCULAR,
    length: dials.steps,
    gridMode: "diamond" as GenerationOptions["gridMode"],
    propType: dials.propType,
    difficulty: levelToDifficulty(dials.level),
    loopType,
    period: resolvedLoop.period as GenerationOptions["period"],
    loopSpecWire: resolvedLoop.loopSpecWire,
    loopRhythm: resolvedLoop.loopRhythm,
    constraintPreset: "smooth",
    turnIntensity: dials.level >= 2 ? dials.maxTurns : 0,
  };

  const out: SequenceData[] = [];
  const seenWords = new Set<string>();
  // Engine is unseeded — each call yields a fresh sequence. A few extra
  // attempts absorb duplicate words so the fan isn't twins.
  const maxAttempts = n * 3;
  for (let i = 0; i < maxAttempts && out.length < n; i++) {
    try {
      const s = await generationOrchestrator.generateSequence(options);
      const word = s.word ?? `#${i}`;
      if (seenWords.has(word)) continue;
      seenWords.add(word);
      out.push(s);
    } catch (e) {
      console.warn("[loopPreviewCards] live generation attempt failed:", e);
    }
  }
  return out;
}

/** One hand of n cards honoring the dials: exact catalog when one exists at
 *  Level 1 defaults (instant, printed pool), live generation for everything
 *  else — Level 2+ always generates so the turn ceiling shows on the cards. */
async function handCards(
  cats: Catalog[],
  dials: HandDials,
  n: number,
  sku: Product | undefined,
  offset = 0
): Promise<CoverCard[]> {
  const accent = accentFrom(sku);
  // Catalogs are turn-blind, so only Level 1 (no turns by definition) may
  // sample one — and only at the exact step count.
  if (dials.level === 1) {
    const catalog = exactCatalog(cats, dials.flavor, 1, dials.steps);
    if (catalog) {
      const seqs = await sampleSequences(catalog.id);
      if (seqs.length) {
        // Offset staggers WHICH sequence each flavor leads with — flavor
        // catalogs share words (same doc ids), so offset 0 deals near-twins.
        const start = offset % seqs.length;
        const picked = [...seqs.slice(start), ...seqs.slice(0, start)].slice(0, n);
        return picked.map((sequence) => ({ sequence, ...accent }));
      }
    }
  }
  const seqs = await liveHand(dials, n, offset);
  return seqs.map((sequence) => ({ sequence, ...accent }));
}

/* ── Deck Architect previews ────────────────────────────────────────────────
   Slice rows show one live sample each; the hero fan samples 6 slots across
   the recipe proportionally to slice counts. Same handCards seam (exact
   catalog at L1, live generation elsewhere), same caches. */

/** One sample card demonstrating a slice's dials. Null on failure. */
export async function recipeSliceCard(
  slice: RecipeSlice,
  propType: PropType,
  sku: Product | undefined,
  offset = 0
): Promise<CoverCard | null> {
  try {
    const cats = await safeCatalogs();
    const cards = await handCards(
      cats,
      {
        flavor: slice.flavor,
        level: slice.level,
        steps: slice.steps,
        maxTurns: slice.maxTurns ?? DEFAULT_MAX_TURNS,
        propType,
      },
      1,
      sku,
      offset
    );
    return cards[0] ?? null;
  } catch (e) {
    console.warn("[recipeSliceCard] sample failed:", e);
    return null;
  }
}

/** Hero fan for a whole recipe: FAN_SIZE slots allocated across slices
 *  proportionally to their counts (every slice gets at least one slot while
 *  slots remain). */
export async function recipePreviewCards(
  slices: RecipeSlice[],
  propType: PropType,
  skuByFlavor: ReadonlyMap<LoopFlavor, Product>
): Promise<CoverCard[] | null> {
  if (slices.length === 0) return null;
  try {
    const cats = await safeCatalogs();
    const total = slices.reduce((n, s) => n + s.count, 0) || 1;
    // One slot per slice first (recipe order), remainder to the biggest slices.
    const slots: { slice: RecipeSlice; offset: number }[] = [];
    for (const slice of slices.slice(0, FAN_SIZE)) slots.push({ slice, offset: 0 });
    const byWeight = [...slices].sort((a, b) => b.count - a.count);
    let i = 0;
    while (slots.length < FAN_SIZE) {
      const slice = byWeight[i % byWeight.length]!;
      // Round-robin over the heaviest slices, bounded by proportion.
      if (slots.filter((s) => s.slice === slice).length <= (slice.count / total) * FAN_SIZE) {
        slots.push({ slice, offset: slots.filter((s) => s.slice === slice).length });
      }
      i++;
      if (i > FAN_SIZE * 4) {
        // Proportions exhausted (tiny recipes) — fill from the top.
        slots.push({ slice: byWeight[0]!, offset: slots.length });
      }
    }
    // Serial, like the variety hand — live hands share one engine.
    const cards: CoverCard[] = [];
    for (const { slice, offset } of slots.slice(0, FAN_SIZE)) {
      const card = await recipeSliceCardWithCats(cats, slice, propType, skuByFlavor.get(slice.flavor), offset);
      if (card) cards.push(card);
    }
    return cards.length ? cards : null;
  } catch (e) {
    console.warn("[recipePreviewCards] falling back:", e);
    return null;
  }
}

async function recipeSliceCardWithCats(
  cats: Catalog[],
  slice: RecipeSlice,
  propType: PropType,
  sku: Product | undefined,
  offset: number
): Promise<CoverCard | null> {
  const cards = await handCards(
    cats,
    {
      flavor: slice.flavor,
      level: slice.level,
      steps: slice.steps,
      maxTurns: slice.maxTurns ?? DEFAULT_MAX_TURNS,
      propType,
    },
    1,
    sku,
    offset
  );
  return cards[0] ?? null;
}

export interface PreviewDials {
  /** Curated pack — when set, the fan deals the pack's preview hand and the
   *  dial fields below are ignored. */
  pack?: LoopPackId | null;
  level: LoopLevel;
  length: LoopLength;
  flavor: LoopFlavor;
  maxTurns: number;
  propType: PropType;
  excluded: ReadonlySet<LoopFlavor>;
  skuByFlavor: ReadonlyMap<LoopFlavor, Product>;
}

/** SKU-backed flavors — the variety grab bag draws from these. */
const VARIETY_POOL: readonly LoopFlavor[] = [
  "rotated",
  "mirrored",
  "swapped",
  "inverted",
  "mirrored-swapped",
  "mirrored-inverted",
  "mirrored-swapped-inverted",
];

export async function loopPreviewCards({
  pack,
  level,
  length,
  flavor,
  maxTurns,
  propType,
  excluded,
  skuByFlavor,
}: PreviewDials): Promise<CoverCard[] | null> {
  try {
    const cats = await safeCatalogs();

    if (pack) {
      // Pack fan = the recipe's representative hand, one card per slot.
      // Slots vary per index even when dials repeat (offset staggers the
      // catalog page so the Mild fan isn't four twins).
      const slots = loopPack(pack).previewHand;
      const hands = await Promise.all(
        slots.map((s, i) =>
          handCards(
            cats,
            {
              flavor: s.flavor,
              level: s.level,
              steps: s.steps,
              maxTurns: s.maxTurns ?? DEFAULT_MAX_TURNS,
              propType,
            },
            1,
            skuByFlavor.get(s.flavor),
            i
          )
        )
      );
      const cards = hands.flat();
      return cards.length ? cards.slice(0, FAN_SIZE) : null;
    }
    const steps = length === "mix" ? 8 : Number(length);
    const turns = maxTurns || DEFAULT_MAX_TURNS;
    const hand = (f: LoopFlavor, lvl: number, n: number, offset = 0) =>
      handCards(
        cats,
        { flavor: f, level: lvl, steps, maxTurns: turns, propType },
        n,
        skuByFlavor.get(f),
        offset
      );

    if (flavor !== "variety") {
      if (level === "mix") {
        // "Mostly Level 1. A few cards that bite."
        const [l1, l2] = await Promise.all([hand(flavor, 1, FAN_SIZE), hand(flavor, 2, 2)]);
        if (l1.length === 0) return null;
        if (l2.length === 0) return l1;
        // Tuck the bite cards into the middle of the hand.
        const mixed = [...l1.slice(0, FAN_SIZE - l2.length)];
        if (l2[0]) mixed.splice(2, 0, l2[0]);
        if (l2[1]) mixed.splice(4, 0, l2[1]);
        return mixed.slice(0, FAN_SIZE);
      }
      const cards = await hand(flavor, Number(level), FAN_SIZE);
      return cards.length ? cards : null;
    }

    // Variety: one card per grab-bag flavor (exclusions honored), rotated
    // leading — each generated at the dialed level/length/turns.
    const pool = VARIETY_POOL.filter((f) => !excluded.has(f));
    if (pool.length === 0) return null;
    const perFlavorLevel = level === "mix" ? 1 : Number(level);
    const hands: CoverCard[][] = [];
    // Sequential, not Promise.all — live hands share one engine, and serial
    // keeps the first cards arriving instead of thrashing.
    for (let i = 0; i < pool.length && hands.flat().length < FAN_SIZE; i++) {
      const f = pool[i]!;
      hands.push(await hand(f, perFlavorLevel, 1, i));
    }
    const cards = hands.flat();
    if (level === "mix") {
      // Swap one card for an L2 rotated bite when the pool has one.
      const bite = await hand("rotated", 2, 1);
      if (bite[0] && cards.length > 2) cards.splice(2, 1, bite[0]);
    }
    return cards.length ? cards.slice(0, FAN_SIZE) : null;
  } catch (e) {
    console.warn("[loopPreviewCards] falling back to SKU covers:", e);
    return null;
  }
}
