/**
 * State for the /test/sequence-combinator lab.
 *
 * One factory, two responsibilities: hold the two input cards (however they got
 * loaded) and hold the tunables the engine runs under. Everything the page
 * renders is either one of those or derived from the report the engine handed
 * back — the page itself owns no state.
 *
 * The engine seam is `getSequenceCombinator()`. `findCombinations` auto-wires
 * the ambient bridge vocabulary off the live pictograph dataset, so nothing
 * here builds a provider; the report's `ambientUnavailable` flag is what tells
 * the lab whether that wiring actually happened.
 *
 * Two structural decisions worth reading before editing:
 *
 *   1. **Cards live in `$state.raw`, outside the deep proxy.** A SequenceData is
 *      hundreds of nested step/motion fields; a `$state` proxy would hand the
 *      engine proxied objects and would make the Layer-0 `$derived` subscribe to
 *      every one of those fields (`reference_svelte5_state_proxy_identity`).
 *      Cards are replaced wholesale, never mutated in place, so `raw` is exactly
 *      right — and the UI-only fields (mode, error, textarea contents) stay in a
 *      separate proxied object where fine-grained reactivity is what you want.
 *   2. **Every input mutation bumps `runGeneration`.** The search is a 190-700ms
 *      await; without a generation stamp a run that started before the user
 *      swapped cards would land its report on top of the new pair and read as
 *      the answer to a question nobody asked.
 */

import { ALL_FIXTURE_LOOPS } from "$lib/shared/combination/domain/demo-fixtures";
import type {
  CombinationSearchReport,
  CombinatorOptions,
} from "$lib/shared/combination/domain/types";
import {
  DEFAULT_MAX_WORD_LENGTH,
  getSequenceCombinator,
} from "$lib/shared/combination/get-sequence-combinator";
import type { EnumerateResult } from "$lib/shared/combination/services/letter-calculus";
import { getSimilarityCalculator } from "$lib/shared/comparison/get-similarity-calculator";
import type { SimilarityReport } from "$lib/shared/comparison/services/types";
import { createStepData } from "$lib/shared/foundation/domain/factories/create-step-data";
import {
  createSequenceData,
  type SequenceData,
} from "$lib/shared/foundation/domain/models/sequence-data";
import { deriveWordFromBeats } from "$lib/shared/foundation/services/word-deriver";
import { simplifyRepeatedWord } from "$lib/shared/foundation/utils/word-simplifier";
import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";

export type SlotId = "A" | "B";

/** How a slot's card got there. `library` is the not-yet-wired picker. */
export type SlotInputMode = "fixture" | "json" | "library";

/**
 * The two measured search depths (2026-08-04, GGGG + HHHH).
 *
 * `default` is `COMBINATOR_DEFAULTS`: 4,096 raw walks / 200k nodes, ~190ms,
 * fully explored to length 5. `deep` is what it actually takes to reach the
 * eight-step "both whole cards" shapes the ranking exists to promote — the
 * harvest cap binds first at 4,096 and the node budget binds right behind it,
 * so both have to move together. ~700ms.
 */
export type DepthPreset = "default" | "deep";

const DEPTH_PRESETS: Record<
  DepthPreset,
  { readonly rawWalkCap: number; readonly searchBudget: number }
> = {
  default: { rawWalkCap: 4096, searchBudget: 200_000 },
  deep: { rawWalkCap: 16384, searchBudget: 2_000_000 },
};

/** The demo cards, keyed by the name the preset buttons show. */
export const FIXTURE_CARDS: ReadonlyMap<string, SequenceData> = new Map(
  ALL_FIXTURE_LOOPS.map(([name, sequence]) => [name, sequence])
);

/**
 * The preset button labels — the single source, derived from the same map the
 * loader reads. A second hand-written list is how a renamed fixture turns into
 * a button that silently does nothing.
 */
export const FIXTURE_NAMES: readonly string[] = [...FIXTURE_CARDS.keys()];

/** Longest word the Layer-0 preview enumerates, so the copy can say so. */
export { DEFAULT_MAX_WORD_LENGTH };

/**
 * The four component weights, as the panel's sliders hold them.
 *
 * These are RAW slider values, not a normalized budget. `computeSimilarity`
 * takes a plain weighted sum with no division by the total (pinned in
 * `tests/unit/combination/analyzer-revival.test.ts`), so four sliders at 1.0
 * would produce an "overall score" of up to 4. Normalization happens at this
 * seam, once, before the calculator ever sees them — see `similarityOutcome`.
 */
export interface SimilarityWeights {
  word: number;
  motion: number;
  placement: number;
  structural: number;
}

/** `DEFAULT_OPTIONS` in `services/similarity-calculator.ts`, mirrored. */
const DEFAULT_SIMILARITY_WEIGHTS: SimilarityWeights = {
  word: 0.2,
  motion: 0.35,
  placement: 0.25,
  structural: 0.2,
};

export interface CardSlot {
  /** The loaded card, or null when the slot is empty. */
  readonly card: SequenceData | null;
  readonly mode: SlotInputMode;
  /** Which fixture is loaded, when `mode` is "fixture". */
  readonly fixtureName: string | null;
  /** Live textarea contents for the JSON path (kept across mode switches). */
  jsonText: string;
  /** Why the last load attempt failed. Empty when the slot is healthy. */
  readonly error: string;
  /** Display word — simplified, per `simplified-word-display`. */
  readonly displayWord: string;
}

export interface CombinatorLabState {
  readonly slotA: CardSlot;
  readonly slotB: CardSlot;
  readonly bothLoaded: boolean;

  // Tunables.
  depth: DepthPreset;
  maxResultLength: number;
  minBlockSize: number;
  maxResults: number;
  maxAmbientRun: number;
  allowMirror: boolean;
  allowRotation: boolean;
  allowHandSwap: boolean;
  exploreRotationFaithful: boolean;
  allowAmbient: boolean;
  wholeUnitsOnly: boolean;

  // Search lifecycle.
  readonly report: CombinationSearchReport | null;
  readonly running: boolean;
  readonly runError: string;
  readonly elapsedMs: number;
  /** Layer-0 preview for the currently loaded pair. Null until both are in. */
  readonly preview: EnumerateResult | null;
  /** Why the Layer-0 preview is null despite both cards being loaded. */
  readonly previewError: string;

  /** Live slider values. Mutate the fields directly; the report re-derives. */
  readonly similarityWeights: SimilarityWeights;
  /** Comparison report for the loaded pair. Null until both cards are in. */
  readonly similarityReport: SimilarityReport | null;
  /** Why the report is null despite both cards being loaded. */
  readonly similarityError: string;
  /** A caveat about a report that DID compute — empty when there is none. */
  readonly similarityNote: string;
  resetSimilarityWeights(): void;

  loadFixture(slot: SlotId, name: string): void;
  loadJson(slot: SlotId, text: string): void;
  clearSlot(slot: SlotId): void;
  swapSlots(): void;
  run(): Promise<void>;
}

/**
 * Structural check on pasted JSON.
 *
 * Deliberately shallow about CONTENT and strict about SHAPE: it verifies the
 * fields the engine actually walks on (both seam positions, both hands) and
 * then rebuilds every step through `createStepData` so the object that reaches
 * the renderer is a real StepData — minted id, placeholder motions where a hand
 * is absent, every optional field defaulted. Pasted JSON is caller data; taking
 * it into the app unrebuilt is how a half-populated step becomes a render
 * crash.
 *
 * It does NOT re-validate the pictograph against the dataframe. A lab that only
 * accepted canon material could not be used to find out what non-canon material
 * does, which is most of what a lab is for.
 */
function parseCard(text: string, slot: SlotId): SequenceData {
  const trimmed = text.trim();
  if (trimmed.length === 0) throw new Error("Nothing pasted.");

  let raw: unknown;
  try {
    raw = JSON.parse(trimmed);
  } catch (cause) {
    throw new Error(
      `Not valid JSON: ${cause instanceof Error ? cause.message : String(cause)}`
    );
  }

  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error(
      "Expected a sequence object, not an array or a bare value."
    );
  }

  const candidate = raw as Partial<SequenceData>;
  const rawSteps = candidate.steps;
  if (!Array.isArray(rawSteps) || rawSteps.length === 0) {
    throw new Error("Expected a non-empty `steps` array.");
  }

  const steps = rawSteps.map((step, index) => {
    const label = `step ${index + 1}`;
    if (typeof step !== "object" || step === null) {
      throw new Error(`${label} is not an object.`);
    }
    if (!step.startPlacement || !step.endPlacement) {
      throw new Error(
        `${label} is missing startPlacement/endPlacement — the engine walks on seams.`
      );
    }
    if (!step.motions?.left || !step.motions?.right) {
      throw new Error(`${label} is missing a blue or red motion.`);
    }
    // Rebuilt, never passed through. A duplicated step in the paste (a common
    // hand-edit) would otherwise carry a duplicate id straight into the render
    // tree; here it gets its own object, and the strips key on position anyway.
    return createStepData({ ...step, stepNumber: index + 1 });
  });

  const word =
    typeof candidate.word === "string" && candidate.word.length > 0
      ? candidate.word
      : deriveWordFromBeats(steps);

  return createSequenceData({
    ...candidate,
    id: candidate.id ?? `pasted-${slot}-${Date.now()}`,
    name: candidate.name ?? word,
    word,
    steps,
    gridMode: candidate.gridMode ?? GridMode.DIAMOND,
  });
}

/** The per-slot fields that genuinely want fine-grained reactivity. */
interface SlotChrome {
  mode: SlotInputMode;
  fixtureName: string | null;
  jsonText: string;
  error: string;
}

function emptyChrome(): SlotChrome {
  return { mode: "fixture", fixtureName: null, jsonText: "", error: "" };
}

export function createCombinatorLabState(): CombinatorLabState {
  // Split deliberately: chrome is proxied ($state), cards are not ($state.raw).
  const chrome = $state<Record<SlotId, SlotChrome>>({
    A: emptyChrome(),
    B: emptyChrome(),
  });
  let cardA = $state.raw<SequenceData | null>(null);
  let cardB = $state.raw<SequenceData | null>(null);

  const cardOf = (id: SlotId) => (id === "A" ? cardA : cardB);
  function setCard(id: SlotId, value: SequenceData | null): void {
    if (id === "A") cardA = value;
    else cardB = value;
  }

  let depth = $state<DepthPreset>("default");
  let maxResultLength = $state(16);
  let minBlockSize = $state(1);
  let maxResults = $state(24);
  let maxAmbientRun = $state(2);
  let allowMirror = $state(true);
  let allowRotation = $state(true);
  let allowHandSwap = $state(true);
  let exploreRotationFaithful = $state(true);
  let allowAmbient = $state(true);
  let wholeUnitsOnly = $state(false);

  // Proxied, unlike the cards: four numbers a slider writes one at a time is
  // exactly the case fine-grained reactivity is for.
  const similarityWeights = $state<SimilarityWeights>({
    ...DEFAULT_SIMILARITY_WEIGHTS,
  });

  let report = $state<CombinationSearchReport | null>(null);
  let running = $state(false);
  let runError = $state("");
  let elapsedMs = $state(0);

  /**
   * Re-entrancy guard. A plain local rather than `running`, because `running`
   * is reactive state a caller could in principle be reading mid-update, and
   * the guard has to be true the instant `run` is entered.
   */
  let inFlight = false;

  /**
   * Bumped by every mutation that changes what a search would be ABOUT. A run
   * compares the value it captured on entry against this before writing
   * anything; a mismatch means its answer is about a pair that no longer exists
   * and gets dropped on the floor.
   */
  let runGeneration = 0;

  /** Every input mutator calls this instead of clearing `report` by hand. */
  function invalidateRun(): void {
    report = null;
    runGeneration++;
  }

  const previewOutcome = $derived.by<{
    words: EnumerateResult | null;
    error: string;
  }>(() => {
    if (!cardA || !cardB) return { words: null, error: "" };
    try {
      return {
        words: getSequenceCombinator().candidateWords(cardA, cardB),
        error: "",
      };
    } catch (cause) {
      // Layer 0 is a preview, not a gate — a card it cannot read (a seam label
      // outside the alpha/beta/gamma families) must not take the page down. It
      // must not vanish silently either: say so on the page AND in the console,
      // because a blank preview panel looks identical to "no candidates".
      console.warn(
        "[sequence-combinator lab] candidateWords failed for the loaded pair",
        cause
      );
      return {
        words: null,
        error: cause instanceof Error ? cause.message : String(cause),
      };
    }
  });

  /**
   * The comparison panel's data source.
   *
   * Same shape as `previewOutcome` and for the same reason: `computeSimilarity`
   * reaches into every step's motions and throws on a hand-less step, and a
   * card the calculator cannot read must not take the page down with it.
   *
   * The weights are normalized HERE rather than passed through raw. The
   * calculator multiplies and sums without dividing, so raw sliders summing to
   * 2.4 would report a 140% "overall score" — a number with no meaning on a
   * bar. Dividing by the total keeps the reported score a genuine 0-1 blend of
   * the four components, which is what the bars and the near-duplicate
   * threshold both assume.
   */
  const similarityOutcome = $derived.by<{
    report: SimilarityReport | null;
    error: string;
    note: string;
  }>(() => {
    if (!cardA || !cardB) return { report: null, error: "", note: "" };

    const total =
      similarityWeights.word +
      similarityWeights.motion +
      similarityWeights.placement +
      similarityWeights.structural;

    // All four at zero is a shrug, not an error. Falling back to an even blend
    // keeps the panel rendering: nulling the report here would collapse roughly
    // ten rem of bars, chips and the per-step row the instant the last slider
    // hits zero, and shove everything below it up the page. The note says which
    // weights are actually in force so the number is not silently a lie.
    const evenBlend = total <= 0;
    const divisor = evenBlend ? 4 : total;
    const weightOf = (value: number) => (evenBlend ? 1 : value) / divisor;

    try {
      return {
        report: getSimilarityCalculator().computeSimilarity(cardA, cardB, {
          wordWeight: weightOf(similarityWeights.word),
          motionWeight: weightOf(similarityWeights.motion),
          placementWeight: weightOf(similarityWeights.placement),
          structuralWeight: weightOf(similarityWeights.structural),
        }),
        error: "",
        note: evenBlend
          ? "Every slider is at zero, so this is an even blend — 0.25 each."
          : "",
      };
    } catch (cause) {
      console.warn(
        "[sequence-combinator lab] computeSimilarity failed for the loaded pair",
        cause
      );
      return {
        report: null,
        error: cause instanceof Error ? cause.message : String(cause),
        note: "",
      };
    }
  });

  function slotView(id: SlotId): CardSlot {
    return {
      get card() {
        return cardOf(id);
      },
      get mode() {
        return chrome[id].mode;
      },
      get fixtureName() {
        return chrome[id].fixtureName;
      },
      get jsonText() {
        return chrome[id].jsonText;
      },
      set jsonText(value: string) {
        chrome[id].jsonText = value;
      },
      get error() {
        return chrome[id].error;
      },
      get displayWord() {
        return simplifyRepeatedWord(cardOf(id)?.word ?? "");
      },
    };
  }

  const viewA = slotView("A");
  const viewB = slotView("B");

  function options(): CombinatorOptions {
    return {
      ...DEPTH_PRESETS[depth],
      minBlockSize,
      maxResultLength,
      maxResults,
      maxAmbientRun,
      allowMirror,
      allowRotation,
      allowHandSwap,
      exploreRotationFaithful,
      allowAmbient,
      wholeUnitsOnly,
    };
  }

  return {
    slotA: viewA,
    slotB: viewB,
    get bothLoaded() {
      return cardA !== null && cardB !== null;
    },

    get depth() {
      return depth;
    },
    set depth(value: DepthPreset) {
      depth = value;
    },
    get maxResultLength() {
      return maxResultLength;
    },
    set maxResultLength(value: number) {
      maxResultLength = value;
    },
    get minBlockSize() {
      return minBlockSize;
    },
    set minBlockSize(value: number) {
      minBlockSize = value;
    },
    get maxResults() {
      return maxResults;
    },
    set maxResults(value: number) {
      maxResults = value;
    },
    get maxAmbientRun() {
      return maxAmbientRun;
    },
    set maxAmbientRun(value: number) {
      maxAmbientRun = value;
    },
    get allowMirror() {
      return allowMirror;
    },
    set allowMirror(value: boolean) {
      allowMirror = value;
    },
    get allowRotation() {
      return allowRotation;
    },
    set allowRotation(value: boolean) {
      allowRotation = value;
    },
    get allowHandSwap() {
      return allowHandSwap;
    },
    set allowHandSwap(value: boolean) {
      allowHandSwap = value;
    },
    get exploreRotationFaithful() {
      return exploreRotationFaithful;
    },
    set exploreRotationFaithful(value: boolean) {
      exploreRotationFaithful = value;
    },
    get allowAmbient() {
      return allowAmbient;
    },
    set allowAmbient(value: boolean) {
      allowAmbient = value;
    },
    get wholeUnitsOnly() {
      return wholeUnitsOnly;
    },
    set wholeUnitsOnly(value: boolean) {
      wholeUnitsOnly = value;
    },

    get report() {
      return report;
    },
    get running() {
      return running;
    },
    get runError() {
      return runError;
    },
    get elapsedMs() {
      return elapsedMs;
    },
    get preview() {
      return previewOutcome.words;
    },
    get previewError() {
      return previewOutcome.error;
    },

    similarityWeights,
    get similarityReport() {
      return similarityOutcome.report;
    },
    get similarityError() {
      return similarityOutcome.error;
    },
    get similarityNote() {
      return similarityOutcome.note;
    },
    resetSimilarityWeights() {
      Object.assign(similarityWeights, DEFAULT_SIMILARITY_WEIGHTS);
    },

    loadFixture(slot, name) {
      const card = FIXTURE_CARDS.get(name);
      if (!card) {
        chrome[slot].error = `No demo card named "${name}".`;
        return;
      }
      setCard(slot, card);
      chrome[slot].mode = "fixture";
      chrome[slot].fixtureName = name;
      chrome[slot].error = "";
      invalidateRun();
    },

    loadJson(slot, text) {
      chrome[slot].jsonText = text;
      try {
        setCard(slot, parseCard(text, slot));
        chrome[slot].mode = "json";
        chrome[slot].fixtureName = null;
        chrome[slot].error = "";
      } catch (cause) {
        setCard(slot, null);
        chrome[slot].error =
          cause instanceof Error ? cause.message : String(cause);
      }
      // Bumped on BOTH paths: a failed paste empties the slot, which invalidates
      // any run in flight just as surely as a successful one.
      invalidateRun();
    },

    clearSlot(slot) {
      setCard(slot, null);
      chrome[slot].fixtureName = null;
      chrome[slot].error = "";
      invalidateRun();
    },

    swapSlots() {
      const heldCard = cardA;
      cardA = cardB;
      cardB = heldCard;
      const heldChrome = chrome.A;
      chrome.A = chrome.B;
      chrome.B = heldChrome;
      invalidateRun();
    },

    async run() {
      if (inFlight) return;
      const a = cardA;
      const b = cardB;
      if (!a || !b) return;

      inFlight = true;
      running = true;
      runError = "";
      const generation = ++runGeneration;

      // Yield a real frame before the search starts. `findCombinations` awaits,
      // but only on already-resolved promises, so it runs as one uninterrupted
      // 190-700ms block on the main thread — a microtask-only await never lets
      // the browser paint, and "Searching…" would appear only after the search
      // had already finished. A macrotask does.
      await new Promise((resolve) => setTimeout(resolve, 0));

      const startedAt = performance.now();
      try {
        const next = await getSequenceCombinator().findCombinations(
          a,
          b,
          options()
        );
        if (generation !== runGeneration) return;
        report = next;
      } catch (cause) {
        if (generation !== runGeneration) return;
        report = null;
        runError = cause instanceof Error ? cause.message : String(cause);
      } finally {
        // The timing belongs to the run that produced the visible report, so it
        // is generation-guarded like the report. The lifecycle flags are not —
        // they describe THIS call, and leaving them set would lock the button.
        if (generation === runGeneration) {
          elapsedMs = Math.round(performance.now() - startedAt);
        }
        running = false;
        inFlight = false;
      }
    },
  };
}
