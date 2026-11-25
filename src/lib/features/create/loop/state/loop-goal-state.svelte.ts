import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
import { untrack } from "svelte";
import { LOOP_FAMILIES, type LoopFamily } from "../domain/loop-families";
import type {
  LoopStepWorkshop,
  MadeLoop,
} from "../services/loop-step-workshop";
import type { LoopTabMemory } from "../services/loop-tab-memory";

/**
 * Where the person is with the LOOP they chose:
 * - "start": no start yet;
 * - "steps": the steps don't end where this LOOP can repeat from;
 * - "ready": they do, and Make will add the repeat;
 * - "made": the grid holds a LOOP made here.
 */
export type LoopStage = "start" | "steps" | "ready" | "made";

/** What fills the space under the LOOP bar. */
export type LoopView = "tools" | "watch" | "compare";

/** Construct's own sequence, which the LOOP tab works on. */
export interface LoopSequenceSource {
  readonly sequence: SequenceData | null;
  /** Puts a sequence in place as one edit that Undo takes back. */
  apply(next: SequenceData): void;
  /** Puts a sequence in place of the last one; Undo still skips past both. */
  replace(next: SequenceData): void;
}

export interface LoopGoalDeps {
  workshop: LoopStepWorkshop;
  memory: LoopTabMemory;
  source: LoopSequenceSource;
  /** Says out loud that something the person asked for could not be done. */
  onFailure: (what: "make", error: unknown) => void;
}

/** One kind of LOOP over the same steps; nothing made when they don't close. */
export interface ComparedLoop {
  family: LoopFamily;
  made: MadeLoop | null;
}

/** A LOOP made here, and how the grid looked the moment it was made. */
interface Standing {
  made: MadeLoop;
  key: string;
  closed: boolean;
}

/**
 * The LOOP goal that sits on top of Construct: which kind of LOOP the person
 * is after, whether their steps can become it, and making it when they ask.
 */
export function createLoopGoalState({
  workshop,
  memory,
  source,
  onFailure,
}: LoopGoalDeps) {
  let chosen = $state<LoopFamily>(memory.loadFamily() ?? "rotated");
  let view = $state<LoopView>("tools");
  // The person asked to see only the steps that close this LOOP.
  let closing = $state(false);
  let prepared = $state.raw<MadeLoop | null>(null);
  let preparedKey = $state("");
  let preparing = $state(false);
  // Every LOOP made here, by the steps it is made of, so Undo, Redo and a
  // change of kind all land on a LOOP the tab still knows.
  let known = $state.raw<ReadonlyMap<string, Standing>>(new Map());
  // "Add more steps" puts a LOOP back to being steps until it changes.
  let dismissed = $state("");
  let listed = $state.raw<readonly PictographData[]>([]);
  let compared = $state.raw<readonly ComparedLoop[]>([]);
  let explaining = $state(!memory.hasSeenExplainer());
  let prepareRun = 0;
  let compareRun = 0;
  let chooseRun = 0;

  const sequence = $derived(source.sequence);
  const key = $derived(sequenceKey(sequence));
  const ids = $derived(stepIdsKey(sequence));
  const stepCount = $derived(sequence?.steps.length ?? 0);
  const hasStart = $derived(hasStartPose(sequence));

  const madeHere = $derived(known.get(ids) ?? null);
  const standing = $derived(dismissed === ids ? null : madeHere);
  const family = $derived(standing?.made.family ?? chosen);
  // Described from the grid as it is now, so a turn changed by hand shows in
  // the film too.
  const made = $derived(
    standing && sequence
      ? workshop.describe(
          standing.made.family,
          standing.made.variant,
          sequence,
          standing.made.seed
        )
      : null
  );
  const broken = $derived(
    standing !== null &&
      standing.closed &&
      sequence !== null &&
      !workshop.closes(sequence)
  );

  const variant = $derived(
    sequence && stepCount > 0 && !standing
      ? workshop.variantAt(sequence, family)
      : null
  );
  const settled = $derived(preparedKey === `${family} ${key}`);
  // Make can put the repeat in place this instant.
  const ready = $derived(settled && prepared !== null);
  // The steps end in the right place. Until the engine has finished them
  // they count as ready, so the line doesn't flicker on every step; the rare
  // run the engine can't close falls back to building.
  const stage = $derived<LoopStage>(
    standing
      ? "made"
      : variant && !(settled && prepared === null)
        ? "ready"
        : hasStart
          ? "steps"
          : "start"
  );

  // Going backwards works from anywhere, so no step is special.
  const marks = $derived(family !== "rewound" && hasStart && !standing);

  const isMarked = (option: PictographData): boolean =>
    marks &&
    sequence !== null &&
    workshop.follows(sequence, option) &&
    workshop.closesWith(sequence, family, option);

  // The list loads after the step lands. Until it belongs to the new step the
  // last answer stands, so the line changes once.
  let lastNoneClose = false;
  const noneClose = $derived.by(() => {
    const current = sequence;
    if (!marks || !current) return (lastNoneClose = false);
    const options = listed.filter((option) =>
      workshop.follows(current, option)
    );
    if (options.length === 0) return lastNoneClose;
    return (lastNoneClose = !options.some(isMarked));
  });

  // A LOOP made before the page was reloaded is still a LOOP.
  let recalled = memory.loadMade();
  $effect.pre(() => {
    const current = sequence;
    if (!recalled || !current || recalled.ids !== ids) return;
    const record = recalled;
    recalled = null;
    const seed: SequenceData = {
      ...current,
      steps: current.steps.slice(0, record.partLength),
      isCircular: false,
      loopType: null,
    };
    untrack(() =>
      remember(
        workshop.describe(record.family, record.variant, current, seed),
        current
      )
    );
  });

  // Finish the LOOP quietly in the background whenever the steps could close,
  // so Make shows only for steps the engine really completes and puts the
  // repeat in place at once.
  $effect(() => {
    const current = sequence;
    const next = family;
    const wanted = `${next} ${key}`;
    const run = ++prepareRun;
    if (!current || !variant || preparedKey === wanted) {
      preparing = false;
      return;
    }
    preparing = true;
    void workshop
      .make(current, next)
      .then((result) => {
        if (run !== prepareRun) return;
        prepared = result;
        preparedKey = wanted;
      })
      .catch(() => {
        if (run !== prepareRun) return;
        prepared = null;
        preparedKey = wanted;
      })
      .finally(() => {
        if (run === prepareRun) preparing = false;
      });
  });

  // Once the steps can close, or none can be picked to close them, the
  // narrowed list has done its job.
  $effect(() => {
    if (closing && (stage !== "steps" || noneClose)) closing = false;
  });

  // The film plays a LOOP that stands on the grid.
  $effect(() => {
    if (view === "watch" && !standing) view = "tools";
  });

  /** Only the steps that end where this LOOP can repeat from. */
  const filter = $derived.by(() => {
    if (!closing || stage !== "steps" || !sequence) return undefined;
    const current = sequence;
    const goal = family;
    return (option: PictographData) =>
      workshop.closesWith(current, goal, option);
  });

  /** The repeat as it will stand under the steps, once the engine has it. */
  const nextPart = $derived.by((): readonly StepData[] | null =>
    stage === "ready" && ready && prepared
      ? prepared.sequence.steps.slice(stepCount, stepCount * 2)
      : null
  );

  /** The steps the standing LOOP repeats, with their turns as they are now. */
  function seedNow(): SequenceData | null {
    if (!standing || !sequence) return sequence;
    return {
      ...standing.made.seed,
      startPlacement: sequence.startPlacement,
      startingPlacement: sequence.startingPlacement,
      steps: sequence.steps.slice(0, standing.made.partLength),
    };
  }

  function remember(result: MadeLoop, onGrid: SequenceData): void {
    const madeIds = stepIdsKey(onGrid);
    known = new Map(known).set(madeIds, {
      made: result,
      key: sequenceKey(onGrid),
      closed: workshop.closes(onGrid),
    });
    memory.saveMade({
      ids: madeIds,
      family: result.family,
      variant: result.variant,
      partLength: result.partLength,
    });
  }

  /** Puts a finished LOOP on the grid. False when the grid refused it. */
  function place(result: MadeLoop, how: "apply" | "replace"): boolean {
    try {
      source[how](result.sequence);
    } catch (error) {
      onFailure("make", error);
      return false;
    }
    remember(result, source.sequence ?? result.sequence);
    // Undo comes back to these steps, and the same repeat is still waiting.
    prepared = result;
    preparedKey = `${result.family} ${sequenceKey(result.seed)}`;
    dismissed = "";
    return true;
  }

  function make(): void {
    if (stage === "steps") {
      closing = marks && !noneClose;
      return;
    }
    if (stage !== "ready" || !ready || !prepared) return;
    place(prepared, "apply");
  }

  function pick(next: LoopFamily): void {
    chosen = next;
    memory.saveFamily(next);
    if (view === "compare") view = "tools";
  }

  /** Swaps one kind of LOOP for another over the same steps. */
  function swapIn(result: MadeLoop, untouched: boolean): void {
    if (place(result, untouched ? "replace" : "apply")) pick(result.family);
  }

  async function chooseFamily(next: LoopFamily): Promise<void> {
    const run = ++chooseRun;
    const from = standing;
    const seed = seedNow();
    if (!from || !seed) return pick(next);
    if (next === from.made.family) return pick(next);
    const before = key;
    const untouched = before === from.key;
    const result = await workshop.make(seed, next).catch(() => null);
    if (run !== chooseRun || key !== before) return;
    if (result) return swapIn(result, untouched);
    // These steps can't make that LOOP yet, so they come back to be built on.
    try {
      if (untouched) source.replace(seed);
      else source.apply(seed);
    } catch (error) {
      return onFailure("make", error);
    }
    pick(next);
  }

  async function compareAll(): Promise<void> {
    const seed = seedNow();
    if (!seed || seed.steps.length === 0) return;
    const run = ++compareRun;
    const all = await Promise.all(
      LOOP_FAMILIES.map(async ({ id }) => ({
        family: id,
        made: await workshop.make(seed, id).catch((error: unknown) => {
          console.error("[LOOP tab]", error);
          return null;
        }),
      }))
    );
    if (run !== compareRun) return;
    compared = all;
    view = "compare";
  }

  return {
    get family() {
      return family;
    },
    get view() {
      return view;
    },
    get stage() {
      return stage;
    },
    get variant() {
      return made?.variant ?? variant;
    },
    get stepCount() {
      return stepCount;
    },
    /** Make would wait: the engine is still finishing these steps. */
    get preparing() {
      return stage === "ready" && (preparing || !ready);
    },
    /** Only the closing steps are showing. */
    get closing() {
      return closing;
    },
    get filter() {
      return filter;
    },
    /** Steps that close this LOOP carry its mark. */
    get marks() {
      return marks;
    },
    isMarked,
    /** The step list says which steps it is showing. */
    noteListed(options: readonly PictographData[]) {
      listed = options;
    },
    /** Nothing in the list closes this LOOP from here. */
    get noneClose() {
      return noneClose;
    },
    get nextPart() {
      return nextPart;
    },
    get made() {
      return made;
    },
    /** A change by hand stopped the LOOP from coming back to its start. */
    get broken() {
      return broken;
    },
    /** A LOOP made here is on the grid and the person is adding to it. */
    get setAside() {
      return madeHere !== null && standing === null;
    },
    get compared() {
      return compared;
    },
    get explaining() {
      return explaining;
    },
    make,
    chooseFamily,
    compareAll,
    /** Picks one of the five side by side and goes back to the steps. */
    showLoop({ family: next, made: result }: ComparedLoop) {
      if (!result) return void chooseFamily(next);
      const from = standing;
      if (!from || from.made.family === result.family) {
        return pick(result.family);
      }
      chooseRun++;
      swapIn(result, key === from.key);
    },
    showAllSteps() {
      closing = false;
    },
    addMore() {
      dismissed = ids;
    },
    backToMade() {
      dismissed = "";
    },
    watch() {
      if (standing) view = "watch";
    },
    backToTools() {
      compareRun++;
      view = "tools";
    },
    openExplainer() {
      explaining = true;
    },
    closeExplainer() {
      explaining = false;
      memory.markExplainerSeen();
    },
  };
}

export type LoopGoalState = ReturnType<typeof createLoopGoalState>;

function startPose(sequence: SequenceData | null) {
  return sequence?.startPlacement ?? sequence?.startingPlacement ?? null;
}

function hasStartPose(sequence: SequenceData | null): boolean {
  const start = startPose(sequence);
  return start !== null && !("isBlank" in start && start.isBlank);
}

/**
 * Tells one arrangement of steps from another, turns included, so the tab
 * knows when a LOOP it made still has the turns it was made with.
 */
export function sequenceKey(sequence: SequenceData | null): string {
  if (!sequence) return "";
  const steps = sequence.steps.map((step) => {
    const left = step.motions?.left;
    const right = step.motions?.right;
    return [
      step.id,
      step.letter,
      step.duration ?? 1,
      left?.turns,
      left?.startOrientation,
      right?.turns,
      right?.startOrientation,
    ].join(":");
  });
  return [startPose(sequence)?.endPlacement ?? "", ...steps].join(",");
}

/**
 * Which steps these are, whatever their turns. Changing a turn on a LOOP
 * leaves it the same LOOP; adding, removing or replacing a step does not.
 */
export function stepIdsKey(sequence: SequenceData | null): string {
  if (!sequence || sequence.steps.length === 0) return "";
  return [
    startPose(sequence)?.endPlacement ?? "",
    ...sequence.steps.map((step) => step.id),
  ].join(",");
}
