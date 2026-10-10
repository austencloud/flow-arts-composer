import { hydrateSequence } from "./sequence-render-hydrator";
import { applyVariationDescriptor, parseTurnUnit } from "./deck-variation";
import {
  updateSequenceData,
  type SequenceData,
} from "#lib/shared/foundation/domain/models/sequence-data.js";
import { hydrate as hydrateCompositionalSequence } from "#lib/shared/foundation/services/sequence-hydrator.js";
import { jsonCache } from "#lib/shared/pictograph/shared/services/simple-json-cache.js";
import type { FestivalSamplerCardManifest } from "./festival-sampler-manifest";
import { loadTndBaseWords } from "./tnd-base-word-snapshot";

/**
 * These three corpora are FETCHED, never imported.
 *
 * Together they are ~7.5 MB of JSON. A top-level `import` compiles all of it
 * into the deck-releaser chunk as a `JSON.parse` string literal, so every
 * visitor to that route paid the parse cost whether or not they opened the
 * festival sampler — and the two snapshots below are ALSO served out of
 * `static/`, so the bytes shipped twice.
 *
 * `jsonCache` dedups concurrent requests and caches the parsed result, so the
 * repeated `await`s below cost one network round trip per corpus per session.
 */
const PUBLIC_SNAPSHOT_URL = "/data/snapshots/public-sequences.json";
const PACK_LOCAL_SEQUENCES_URL =
  "/data/choreo-card/festival-sampler-sequences.json";

async function loadPublicDocuments(): Promise<Array<Record<string, unknown>>> {
  const snapshot = await jsonCache.get<{
    documents?: Array<Record<string, unknown>>;
  }>(PUBLIC_SNAPSHOT_URL);
  return snapshot.documents ?? [];
}

/**
 * Indexed by name because that is the only key a `catalog` card carries. Built
 * once per session and held alongside the cached JSON rather than rebuilt per
 * lookup — a 12k-entry Map rebuild per card is not free during a deck render.
 */
let tndSequencesByName: Map<string, SequenceData> | null = null;

async function loadTndSequences(): Promise<Map<string, SequenceData>> {
  if (tndSequencesByName) return tndSequencesByName;

  const sequences = await loadTndBaseWords();
  tndSequencesByName = new Map(
    sequences.map((sequence) => [sequence.name, sequence])
  );
  return tndSequencesByName;
}

async function loadPackLocalSequences(): Promise<
  Record<string, Record<string, unknown>>
> {
  const pack = await jsonCache.get<{
    records?: Record<string, Record<string, unknown>>;
  }>(PACK_LOCAL_SEQUENCES_URL);
  return pack.records ?? {};
}

async function findPublicSequence(
  card: FestivalSamplerCardManifest
): Promise<SequenceData> {
  const publicDocuments = await loadPublicDocuments();
  const indexed = publicDocuments.find(
    (sequence) =>
      sequence.id === card.id && sequence.sourceRef === card.sourceRef
  );
  if (!indexed) throw new Error(`Published sequence not found: ${card.name}`);

  const sequence = hydrateCompositionalSequence(hydrateSequence(indexed));
  if (sequence.steps.length === 0) {
    throw new Error(`Published sequence has no renderable steps: ${card.name}`);
  }
  return sequence;
}

export async function loadFestivalSamplerBaseSequence(
  card: FestivalSamplerCardManifest
): Promise<SequenceData> {
  if (card.source === "publicSequences") return findPublicSequence(card);

  if (card.source === "catalog") {
    const sequence = (await loadTndSequences()).get(card.name);
    if (!sequence) {
      throw new Error(`Festival sampler TnD source is missing: ${card.name}`);
    }
    return sequence;
  }

  const localSequenceRecords = await loadPackLocalSequences();
  const localRecord = localSequenceRecords[card.id ?? card.name];
  if (localRecord) return hydrateSequence(localRecord);

  throw new Error(`Festival sampler source is missing: ${card.name}`);
}

function stablePatternHash(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

type FestivalTurnSymbol = "B" | "R" | "X" | "·";

export interface FestivalTurnPatternPreset {
  id: string;
  label: string;
  symbols: readonly FestivalTurnSymbol[];
  minSequenceLength: 4 | 8 | 16;
}

/**
 * A deliberately small rhythm vocabulary. Four-step cards only receive the
 * strict core. Eight- and sixteen-step cards progressively unlock more room.
 */
export const FESTIVAL_TURN_PATTERN_PRESETS = [
  {
    id: "together-block",
    label: "Together block",
    symbols: ["X", "X", "·", "·"],
    minSequenceLength: 4,
  },
  {
    id: "together-pulse",
    label: "Together pulse",
    symbols: ["X", "·", "X", "·"],
    minSequenceLength: 4,
  },
  {
    id: "split-blocks",
    label: "Split blocks",
    symbols: ["B", "B", "R", "R"],
    minSequenceLength: 4,
  },
  {
    id: "alternating-hands",
    label: "Alternating hands",
    symbols: ["B", "R", "B", "R"],
    minSequenceLength: 4,
  },
  {
    id: "offbeat-together",
    label: "Offbeat together",
    symbols: ["·", "X", "·", "·"],
    minSequenceLength: 8,
  },
  {
    id: "spaced-handoff",
    label: "Spaced handoff",
    symbols: ["B", "·", "R", "·"],
    minSequenceLength: 8,
  },
  {
    id: "trade-then-accent",
    label: "Trade, then accent",
    symbols: ["B", "R", "X", "·"],
    minSequenceLength: 8,
  },
  {
    id: "bookended-trade",
    label: "Bookended trade",
    symbols: ["B", "·", "R", "X"],
    minSequenceLength: 8,
  },
  {
    id: "adjacent-handoff",
    label: "Adjacent handoff",
    symbols: ["B", "R", "·", "·"],
    minSequenceLength: 16,
  },
  {
    id: "accent-then-trade",
    label: "Accent, then trade",
    symbols: ["X", "·", "B", "R"],
    minSequenceLength: 16,
  },
  {
    id: "dense-handoff",
    label: "Dense handoff",
    symbols: ["X", "X", "B", "R"],
    minSequenceLength: 16,
  },
  {
    id: "cross-accent",
    label: "Cross accent",
    symbols: ["B", "X", "R", "X"],
    minSequenceLength: 16,
  },
] as const satisfies readonly FestivalTurnPatternPreset[];

export type FestivalTurnPatternId =
  (typeof FESTIVAL_TURN_PATTERN_PRESETS)[number]["id"];

function turnPairForSymbol(
  symbol: FestivalTurnSymbol,
  intensity: 0.5 | 1
): string {
  if (symbol === "B") return `${intensity}|0`;
  if (symbol === "R") return `0|${intensity}`;
  if (symbol === "X") return `${intensity}|${intensity}`;
  return "0|0";
}

export function buildFestivalTurnPattern(
  preset: FestivalTurnPatternPreset,
  unitLength: number,
  intensity: 0.5 | 1
): string {
  if (
    unitLength < preset.symbols.length ||
    unitLength % preset.symbols.length !== 0
  ) {
    throw new Error(
      `${preset.label} cannot fill a ${unitLength}-step structural unit.`
    );
  }
  return Array.from({ length: unitLength }, (_, index) =>
    turnPairForSymbol(preset.symbols[index % preset.symbols.length]!, intensity)
  ).join("-");
}

function festivalTurnUnitLength(
  card: FestivalSamplerCardManifest,
  base: SequenceData
): number {
  const period = card.source === "catalog" ? 1 : Number(card.period ?? 1);
  return base.steps.length / period;
}

function hasCleanFestivalTurnResult(
  sequence: SequenceData,
  turnIntensity: number
): boolean {
  const turns = sequence.steps.flatMap((step) => [
    step.motions?.left?.turns,
    step.motions?.right?.turns,
  ]);
  return (
    turns.some((turn) => turn === turnIntensity) &&
    turns.some((turn) => turn === 0) &&
    turns.every(
      (turn) => typeof turn === "number" && turn >= 0 && turn <= turnIntensity
    )
  );
}

/** Pick a deterministic structural pattern that preserves loop closure. */
export interface FestivalSamplerTurnAssignment {
  id: FestivalTurnPatternId;
  pattern: string;
}

export function findCompatibleFestivalSamplerTurnAssignment(
  card: FestivalSamplerCardManifest,
  base: SequenceData,
  seed = [card.source, card.sourceRef, card.id, card.name, card.slot].join("|")
): FestivalSamplerTurnAssignment {
  const turnIntensity = card.turnIntensity ?? 0;
  if (turnIntensity !== 1 && turnIntensity !== 0.5) {
    throw new Error(
      `Festival sampler cannot choose a pattern for turn intensity ${turnIntensity}: ${card.name}`
    );
  }
  const unitLength = festivalTurnUnitLength(card, base);
  const sequenceLength = card.sequenceLength ?? base.steps.length;
  const candidates = FESTIVAL_TURN_PATTERN_PRESETS.filter(
    (preset) => sequenceLength >= preset.minSequenceLength
  )
    .map((preset) => ({
      preset,
      turnPattern: buildFestivalTurnPattern(preset, unitLength, turnIntensity),
    }))
    .sort(
      (left, right) =>
        stablePatternHash(`${seed}|${left.preset.id}`) -
          stablePatternHash(`${seed}|${right.preset.id}`) ||
        left.preset.id.localeCompare(right.preset.id)
    );
  if (candidates.length === 0) {
    throw new Error(
      `Festival sampler has no structural turn patterns for ${unitLength} steps: ${card.name}`
    );
  }
  for (const { preset, turnPattern } of candidates) {
    const applied = applyVariationDescriptor(base, { turnPattern }, []);
    if (
      applied.turnLoopClosed &&
      hasCleanFestivalTurnResult(applied.sequence, turnIntensity)
    ) {
      return { id: preset.id, pattern: turnPattern };
    }
  }
  throw new Error(
    `Festival sampler found no loop-closing ${turnIntensity}-turn pattern for ${card.name}`
  );
}

export function findCompatibleFestivalSamplerTurnPattern(
  card: FestivalSamplerCardManifest,
  base: SequenceData,
  seed?: string
): string {
  return findCompatibleFestivalSamplerTurnAssignment(card, base, seed).pattern;
}

export function applyFestivalSamplerTurnAssignment(
  card: FestivalSamplerCardManifest,
  base: SequenceData
): SequenceData {
  const turnIntensity = card.turnIntensity ?? 0;
  if (turnIntensity === 0) {
    return updateSequenceData(base, { level: 1 });
  }
  const frozenTurnIntensity: 1 | 0.5 | null =
    turnIntensity === 1 ? 1 : turnIntensity === 0.5 ? 0.5 : null;
  const recipe =
    frozenTurnIntensity === 1
      ? { level: 2 }
      : frozenTurnIntensity === 0.5
        ? { level: 3 }
        : null;
  if (frozenTurnIntensity === null || !recipe || !card.turnPattern) {
    throw new Error(
      `Festival sampler received an unsupported frozen turn assignment: ${card.turnPattern ?? "none"} at intensity ${turnIntensity} for ${card.name}`
    );
  }
  const unit = parseTurnUnit(card.turnPattern);
  const expectedUnitLength = festivalTurnUnitLength(card, base);
  const unitTurns = unit.flatMap((entry) => [entry.left, entry.right]);
  const frozenPreset = card.turnPatternId
    ? FESTIVAL_TURN_PATTERN_PRESETS.find(
        (preset) => preset.id === card.turnPatternId
      )
    : null;
  const sequenceLength = card.sequenceLength ?? base.steps.length;
  const frozenPatternMatches = frozenPreset
    ? sequenceLength >= frozenPreset.minSequenceLength &&
      buildFestivalTurnPattern(
        frozenPreset,
        expectedUnitLength,
        frozenTurnIntensity
      ) === card.turnPattern
    : true;
  if (
    unit.length !== expectedUnitLength ||
    !frozenPatternMatches ||
    !unitTurns.some((turn) => turn === turnIntensity) ||
    !unitTurns.some((turn) => turn === 0) ||
    unitTurns.some((turn) => turn !== 0 && turn !== turnIntensity)
  ) {
    throw new Error(
      `Festival sampler turn pattern is not valid for the ${expectedUnitLength}-step structural unit, ${sequenceLength}-step card, and ${turnIntensity}-turn cap: ${card.name}`
    );
  }

  const applied = applyVariationDescriptor(
    base,
    { turnPattern: card.turnPattern },
    []
  );
  if (!applied.turnLoopClosed) {
    throw new Error(
      `Festival sampler turn assignment breaks loop closure: ${card.name}`
    );
  }
  if (!hasCleanFestivalTurnResult(applied.sequence, turnIntensity)) {
    throw new Error(
      `Festival sampler turn assignment was not applied cleanly: ${card.name}`
    );
  }
  return updateSequenceData(applied.sequence, { level: recipe.level });
}

export async function resolveFestivalSamplerCardSequence(
  card: FestivalSamplerCardManifest
): Promise<SequenceData> {
  const base = await loadFestivalSamplerBaseSequence(card);
  return applyFestivalSamplerTurnAssignment(card, base);
}
