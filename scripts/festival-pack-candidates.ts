// Build candidate 8-card festival sample packs from GENERATED LOOP sequences.
//
// Slot composition is Austen's (2026-08-11): 2 mirrored LOOPs (16 + 8 counts),
// 2 rotated LOOPs (16 + 8), 2 TnD teaching cards, and 2 compound LOOPs
// (mirrored/swapped + mirrored/inverted).
//
// Sequences are generated, not spelled: the letters are whatever the transition
// graph produces. What matters is that each card looks good and closes back to
// its home placement, which is what the LOOP transform guarantees.
//
// This file documents the retired pre-MCP generator used for the first
// comparison. Current evidence must be regenerated through the flow-arts MCP
// generate_sequence tool so domain generation and rendering keep one owner.
//
// Writes PNGs to docs/superpowers/specs/festival-sample-pack/evidence/cards/
// plus candidates.json for the contact-sheet builder.
import fs from "node:fs";
import path from "node:path";
import { ensureDataLoaded } from "../mcp-server-pkg/src/shared/server-context.js";
import {
  buildSequenceFromLetters,
  generateChainableSequence,
} from "../mcp-server-pkg/src/core/sequence-builder.js";
import {
  executeLOOP,
  isLOOPValidForPlacementPair,
} from "../mcp-server-pkg/src/core/loop/index.js";
import { renderSequenceToImage } from "../mcp-server-pkg/src/core/sequence-renderer.js";
import { ensureTransitionGraphInitialized } from "../mcp-server-pkg/src/core/letter-transition-graph.js";

const REPO = path.join(import.meta.dirname, "..");
const EVIDENCE = path.join(
  REPO,
  "docs/superpowers/specs/festival-sample-pack/evidence"
);
const CARDS = path.join(EVIDENCE, "cards");
const PACK_COUNT = Number(process.argv[2] ?? 5);

throw new Error(
  "Retired: regenerate festival candidates with flow-arts MCP generate_sequence."
);

// The two teaching cards are TnD (Timing and Direction) demonstrations, and
// TnD families live in the VARIATION choice, not the letters — the generator's
// default returns the wrong timing run. So they are transcribed verbatim from
// the canonical catalog rather than generated (memory: tnd-catalog-variation-
// authority; this shipped wrong once on 2026-08-04).
const TND_BASE_WORDS = JSON.parse(
  fs.readFileSync(
    path.join(REPO, "static/data/hero/tnd-base-words.json"),
    "utf8"
  )
) as TndEntry[];

type TndMotion = Record<string, unknown>;
type TndStep = {
  letter?: string;
  startPlacement: string;
  endPlacement: string;
  motions: { left: TndMotion; right: TndMotion };
};
type TndEntry = { id: string; steps: TndStep[] };

const TND_FAMILIES = [
  "split-same",
  "split-opp",
  "tog-same",
  "tog-opp",
  "quarter-same",
  "quarter-opp",
] as const;
type TndFamily = (typeof TND_FAMILIES)[number];

const TND_FAMILY_LABEL: Record<TndFamily, string> = {
  "split-same": "Split · Same",
  "split-opp": "Split · Opposite",
  "tog-same": "Together · Same",
  "tog-opp": "Together · Opposite",
  "quarter-same": "Quarter · Same",
  "quarter-opp": "Quarter · Opposite",
};

const PLACEMENT_GLYPH: Record<string, string> = {
  alpha: "α",
  beta: "β",
  gamma: "γ",
};

/** `tnd-quarter-opp-mpmp` -> `quarter-opp` */
function tndFamily(id: string): TndFamily {
  const family = id.replace(/^tnd-/, "").replace(/-[a-z]+$/, "");
  if (!(TND_FAMILIES as readonly string[]).includes(family)) {
    throw new Error(`Unknown TnD family in catalog id: ${id}`);
  }
  return family as TndFamily;
}

/**
 * Catalog steps use the app shape (motions.left/right, no start-placement step).
 * The renderer wants MCP shape (leftMotion/rightMotion, steps[0] = start pose).
 */
function toMcpSteps(entry: TndEntry) {
  const first = entry.steps[0];
  if (!first) throw new Error(`TnD catalog entry ${entry.id} has no steps`);
  const startPlacement = first.startPlacement;
  const hold = (m: TndMotion, hand: "left" | "right") => ({
    ...m,
    hand,
    endLocation: m.startLocation,
    motionType: "static",
    rotationDirection: "noRotation",
    endOrientation: m.startOrientation,
    turns: 0,
  });
  const startStep = {
    letter: PLACEMENT_GLYPH[startPlacement.replace(/\d+$/, "")] ?? "α",
    variation: 0,
    stepNumber: 0,
    startPlacement: startPlacement,
    endPlacement: startPlacement,
    leftMotion: hold(first.motions.left, "left"),
    rightMotion: hold(first.motions.right, "right"),
  };
  const rest = entry.steps.map((s, i) => ({
    letter: s.letter ?? "",
    variation: 0,
    stepNumber: i + 1,
    startPlacement: s.startPlacement,
    endPlacement: s.endPlacement,
    leftMotion: { ...s.motions.left, hand: "left" },
    rightMotion: { ...s.motions.right, hand: "right" },
  }));
  return [startStep, ...rest];
}

const SLOTS = [
  {
    id: "mirrored-16",
    label: "Mirrored · 16",
    loop: "mirrored",
    period: "halved",
    seedLen: 8,
  },
  {
    id: "mirrored-8",
    label: "Mirrored · 8",
    loop: "mirrored",
    period: "halved",
    seedLen: 4,
  },
  {
    id: "rotated-16",
    label: "Rotated · 16 · Quartered",
    loop: "rotated",
    period: "quartered",
    seedLen: 4,
  },
  {
    id: "rotated-8",
    label: "Rotated · 8 · Halved",
    loop: "rotated",
    period: "halved",
    seedLen: 4,
  },
  // TnD teaching cards: canonical timing/direction demonstrations. One plain at
  // level 1, one with a single whole turn on every motion at level 2.
  {
    id: "tnd-a",
    label: "TnD",
    loop: null,
    period: null,
    seedLen: 4,
    tnd: true,
  },
  {
    id: "tnd-b",
    label: "TnD",
    loop: null,
    period: null,
    seedLen: 4,
    tnd: true,
  },
  {
    id: "mirrored_swapped-8",
    label: "Mirrored+Swapped · 8",
    loop: "mirrored_swapped",
    period: "halved",
    seedLen: 4,
  },
  {
    id: "mirrored_inverted-8",
    label: "Mirrored+Inverted · 8",
    loop: "mirrored_inverted",
    period: "halved",
    seedLen: 4,
  },
] as const;

const CLASSIC_START_PLACEMENTS = ["alpha1", "beta5", "gamma11"] as const;

const pictographs = ensureDataLoaded("diamond" as never);
// getLetterTransitionGraph() kicks off initialization without awaiting it, so
// early synchronous generate calls would otherwise see an empty letter graph.
await ensureTransitionGraphInitialized();

/**
 * A card reads better when it isn't the same letter over and over and when it
 * travels across the grid rather than sitting still. Rank candidates by
 * distinct letters first, then distinct placements visited.
 */
function prettiness(
  letters: string[],
  steps: { startPlacement?: string }[]
): number {
  const distinctLetters = new Set(letters).size;
  const placements = new Set(steps.map((s) => s.startPlacement).filter(Boolean));
  return distinctLetters * 10 + placements.size;
}

type Built = {
  letters: string[];
  steps: unknown[];
  word: string;
  score: number;
};

/** Generate seeds until enough satisfy the slot's LOOP, then take the prettiest. */
function bestSeed(
  slot: (typeof SLOTS)[number],
  classicStartPlacement: (typeof CLASSIC_START_PLACEMENTS)[number],
  tries = 900
): Built | null {
  const exclude = ["α", "β", "γ"];
  const found: Built[] = [];
  for (let i = 0; i < tries && found.length < 40; i++) {
    const letters = generateChainableSequence(slot.seedLen, exclude);
    if (letters.length !== slot.seedLen) continue;
    const r = buildSequenceFromLetters(
      letters,
      pictographs,
      1,
      undefined,
      true
    );
    // steps[0] is the start-placement step, so an N-letter bridge-free build has N+1.
    if (!r.isValid || r.steps.length !== slot.seedLen + 1) continue;
    if (r.startPlacement !== classicStartPlacement) continue;
    if (slot.loop) {
      const pair = `${r.startPlacement},${r.endPlacement}`;
      if (
        !isLOOPValidForPlacementPair(
          slot.loop as never,
          pair,
          slot.period as never
        )
      )
        continue;
    }
    found.push({
      letters,
      steps: r.steps,
      word: r.word,
      score: prettiness(letters, r.steps),
    });
  }
  if (!found.length) return null;
  found.sort((a, b) => b.score - a.score);
  return found[0] ?? null;
}

type Card = {
  slot: string;
  label: string;
  word: string;
  counts: number;
  file: string;
  period?: "halved" | "quartered" | null;
  startPlacement?: string;
  endPlacement?: string;
};

async function makeTndCard(
  slot: (typeof SLOTS)[number],
  packIndex: number
): Promise<Card | null> {
  const familyIndex =
    (packIndex * 2 + (slot.id === "tnd-b" ? 1 : 0)) % TND_FAMILIES.length;
  const family = TND_FAMILIES[familyIndex];
  if (!family) throw new Error(`No TnD family at index ${familyIndex}`);
  const pool = TND_BASE_WORDS.filter((e) => tndFamily(e.id) === family);
  if (!pool.length) {
    process.stderr.write(`  no TnD entry: ${family}\n`);
    return null;
  }
  // Families cycle every 3 packs; advance the variation each time round so a
  // later pack teaching Split·Same shows BBBB rather than AAAA again.
  const cycle = Math.floor((packIndex * 2) / TND_FAMILIES.length);
  const entry = pool[cycle % pool.length];
  if (!entry) {
    process.stderr.write(`  no TnD entry: ${family}, cycle ${cycle}\n`);
    return null;
  }
  const steps = toMcpSteps(entry);
  const word = entry.steps.map((s) => s.letter ?? "").join("");
  const counts = steps.length - 1;

  // Each pack pairs one same-direction family with one opposite-direction
  // family. Card A is plain at level 1; card B adds one whole turn to every
  // motion at level 2. Uniform turns keep the treatment readable instead of
  // scattering different values across the four steps.
  const isTurned = slot.id === "tnd-b";
  const level = isTurned ? 2 : 1;
  const turns = isTurned ? 1 : 0;
  const uniform = {
    left: Array(counts).fill(turns),
    right: Array(counts).fill(turns),
  };

  const png = await renderSequenceToImage(steps as never, word, {
    cellSize: 260,
    level,
    showStepNumbers: true,
    showWord: true,
    darkMode: false,
    showReversals: true,
    turnAllocation: uniform,
  });

  const file = `pack${packIndex + 1}__${slot.id}.png`;
  fs.writeFileSync(path.join(CARDS, file), png);
  return {
    slot: slot.id,
    label: `TnD · ${TND_FAMILY_LABEL[family]} · ${isTurned ? "1 turn throughout" : "no turns"}`,
    word,
    counts,
    file,
  };
}

async function makeCard(
  slot: (typeof SLOTS)[number],
  packIndex: number
): Promise<Card | null> {
  if ("tnd" in slot && slot.tnd) return makeTndCard(slot, packIndex);

  const classicStartPlacement =
    CLASSIC_START_PLACEMENTS[
      (packIndex + SLOTS.findIndex((candidate) => candidate.id === slot.id)) %
        CLASSIC_START_PLACEMENTS.length
    ]!;

  // Long seeds under a strict LOOP (mirrored 16) are rare in random search,
  // so keep widening the net rather than dropping the slot from the pack.
  let seed = bestSeed(slot, classicStartPlacement);
  for (let retry = 0; !seed && retry < 6; retry++)
    seed = bestSeed(slot, classicStartPlacement, 4000);
  if (!seed) {
    process.stderr.write(`  no seed: ${slot.id}\n`);
    return null;
  }

  let steps = seed.steps as never[];
  let displayWord = seed.word;
  let derivedBeatIndices: number[] = [];
  let loopComponents: string[] = [];

  if (slot.loop) {
    const res = executeLOOP(
      steps,
      seed.word,
      slot.loop as never,
      slot.period as never,
      pictographs
    );
    if (!res.success) {
      process.stderr.write(`  loop failed: ${slot.id} — ${res.error}\n`);
      return null;
    }
    steps = res.steps as never[];
    displayWord = res.loopWord;
    derivedBeatIndices = res.derivedBeatIndices;
    loopComponents = slot.loop.split("_");
  }

  const counts = steps.length - 1;
  // TnD slots returned above, so everything reaching here is a level 1 LOOP.
  const png = await renderSequenceToImage(steps, displayWord, {
    cellSize: 260,
    level: 1,
    showStepNumbers: true,
    showWord: true,
    darkMode: false,
    showReversals: true,
    turnAllocation: undefined,
    loopComponents: loopComponents as never,
    derivedBeatIndices,
    seedWord: slot.loop ? seed.word : undefined,
  });

  const file = `pack${packIndex + 1}__${slot.id}.png`;
  fs.writeFileSync(path.join(CARDS, file), png);
  return {
    slot: slot.id,
    label: slot.label,
    word: displayWord,
    counts,
    file,
    period: slot.period,
    startPlacement: classicStartPlacement,
    endPlacement: classicStartPlacement,
  };
}

fs.rmSync(CARDS, { recursive: true, force: true });
fs.mkdirSync(CARDS, { recursive: true });

const lists: Card[][] = [];
for (let p = 0; p < PACK_COUNT; p++) {
  const pack: Card[] = [];
  for (const slot of SLOTS) {
    const card = await makeCard(slot, p);
    if (card) pack.push(card);
  }
  process.stderr.write(`pack ${p + 1}: ${pack.length}/${SLOTS.length} cards\n`);
  lists.push(pack);
}

// Ten pack slots cannot show 22 catalog entries, so render the whole TnD
// catalog separately in both treatments. That is where T/U/V, NQNQ/OROR and
// the gamma9 set (PMPM/QNQN/RORO) are visible for picking.
const catalog: Card[] = [];
for (const entry of TND_BASE_WORDS) {
  const family = tndFamily(entry.id);
  const steps = toMcpSteps(entry);
  const word = entry.steps.map((s) => s.letter ?? "").join("");
  const counts = steps.length - 1;
  for (const turned of [false, true]) {
    const png = await renderSequenceToImage(steps as never, word, {
      cellSize: 260,
      level: turned ? 2 : 1,
      showStepNumbers: true,
      showWord: true,
      darkMode: false,
      showReversals: true,
      turnAllocation: {
        left: Array(counts).fill(turned ? 1 : 0),
        right: Array(counts).fill(turned ? 1 : 0),
      },
    });
    const file = `catalog__${entry.id}__${turned ? "1turn" : "plain"}.png`;
    fs.writeFileSync(path.join(CARDS, file), png);
    catalog.push({
      slot: entry.id,
      label: `${TND_FAMILY_LABEL[family]} · ${turned ? "1 turn throughout" : "no turns"}`,
      word,
      counts,
      file,
    });
  }
}

fs.writeFileSync(
  path.join(EVIDENCE, "candidates.json"),
  JSON.stringify({ lists, catalog }, null, 2)
);
console.log(
  `${lists.length} packs, ${lists.flat().length} cards, ${catalog.length} catalog cards`
);
