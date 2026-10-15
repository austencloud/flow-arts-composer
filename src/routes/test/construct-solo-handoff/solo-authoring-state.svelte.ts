import { setContext, getContext } from "svelte";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
import type { AuthoredHand } from "#lib/shared/foundation/domain/models/authored-hand.js";
import {
  GridMode,
  type GridLocation,
} from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import {
  Orientation,
  RotationDirection,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import {
  clampTurnToLevel,
  type TurnValue,
} from "#lib/shared/create/services/level-turn-values.js";
import { CommandStack } from "#lib/shared/history/command-stack.svelte";
import {
  appendSoloContinuation,
  createSoloContinuationOptions,
  createSoloStart,
  handName,
  otherHand,
  pairSoloReviewSequences,
} from "./construct-solo-proposal";

interface Draft {
  primaryHand: AuthoredHand;
  primary: SequenceData | null;
  partner: SequenceData | null;
  addingPartner: boolean;
  gridMode: GridMode;
}
interface Services {
  loadCatalog: (grid: GridMode) => Promise<PictographData[]>;
  deriveLetters: (sequence: SequenceData) => Promise<SequenceData>;
}

/** Test-page session only. It never reads or writes Construct persistence. */
export function createSoloAuthoringState(
  services: Services,
  initial: SequenceData
) {
  let draft = $state<Draft>({
    primaryHand: "left",
    primary: initial,
    partner: null,
    addingPartner: false,
    gridMode: initial.gridMode ?? GridMode.BOX,
  });
  let catalog = $state<PictographData[]>([]);
  let catalogGrid = $state<GridMode | null>(null);
  let loading = $state(false);
  let error = $state("");
  let busy = $state(false);
  let result = $state<SequenceData | null>(null);
  let level = $state(1);
  let turns = $state<TurnValue>(0);
  let direction = $state<RotationDirection>(RotationDirection.CLOCKWISE);
  let orientation = $state<Orientation>(Orientation.IN);
  let notice = $state(
    "Imported blue path. Choose a motion to continue it, or add red."
  );
  let revision = 0;
  let loadRevision = 0;
  const history = new CommandStack(128);
  const activeHand = $derived(
    draft.addingPartner ? otherHand(draft.primaryHand) : draft.primaryHand
  );
  const active = $derived(draft.addingPartner ? draft.partner : draft.primary);
  const targetLength = $derived(
    draft.addingPartner ? draft.primary!.steps.length : null
  );
  const complete = $derived(
    targetLength !== null && active?.steps.length === targetLength
  );
  const options = $derived(
    active && !complete && !loading && catalogGrid === draft.gridMode
      ? createSoloContinuationOptions(catalog, active, activeHand, {
          turns,
          direction,
        })
      : []
  );

  function apply(next: Draft, message: string) {
    draft = next;
    result = null;
    busy = false;
    error = "";
    notice = message;
    revision++;
  }
  function commit(next: Draft, message: string) {
    const before = draft;
    history.execute({
      label: message,
      execute: () => apply(next, message),
      undo: () => apply(before, "Undid: " + message),
    });
  }
  async function loadCatalog() {
    const request = ++loadRevision;
    if (catalogGrid === draft.gridMode && catalog.length) {
      loading = false;
      return;
    }
    const grid = draft.gridMode;
    loading = true;
    error = "";
    try {
      const loaded = await services.loadCatalog(grid);
      if (request !== loadRevision) return;
      if (!loaded.length)
        throw new Error("The motion catalog returned no choices.");
      catalog = loaded;
      catalogGrid = grid;
    } catch (cause) {
      if (request !== loadRevision) return;
      error =
        "Motion choices could not load. " +
        (cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (request === loadRevision) loading = false;
    }
  }
  return {
    get draft() {
      return draft;
    },
    get activeHand() {
      return activeHand;
    },
    get active() {
      return active;
    },
    get reference() {
      return draft.addingPartner ? draft.primary : null;
    },
    get targetLength() {
      return targetLength;
    },
    get complete() {
      return complete;
    },
    get options() {
      return options;
    },
    get loading() {
      return loading;
    },
    get error() {
      return error;
    },
    get busy() {
      return busy;
    },
    get result() {
      return result;
    },
    get notice() {
      return notice;
    },
    get level() {
      return level;
    },
    get turns() {
      return turns;
    },
    get orientation() {
      return orientation;
    },
    get direction() {
      return direction;
    },
    history,
    loadCatalog,
    setLevel(value: number) {
      level = value;
      turns = clampTurnToLevel(turns, level);
    },
    setTurns(value: TurnValue) {
      turns = clampTurnToLevel(value, level);
    },
    setDirection(value: RotationDirection) {
      direction = value;
    },
    setOrientation(value: Orientation) {
      orientation = value;
    },
    newSolo() {
      commit(
        {
          primaryHand: "left",
          primary: null,
          partner: null,
          addingPartner: false,
          gridMode: GridMode.DIAMOND,
        },
        "Started a new solo. Undo restores your previous work."
      );
      level = 1;
      turns = 0;
      orientation = Orientation.IN;
    },
    setHand(value: AuthoredHand) {
      if (!active && !draft.addingPartner)
        commit(
          { ...draft, primaryHand: value },
          "Building " + handName(value).toLowerCase() + "."
        );
    },
    setGrid(value: GridMode) {
      if (!active && !draft.addingPartner)
        commit(
          { ...draft, gridMode: value },
          "Changed starting grid to " + value + "."
        );
    },
    start(location: GridLocation) {
      if (active) return;
      const sequence = createSoloStart(
        activeHand,
        draft.gridMode,
        location,
        orientation
      );
      commit(
        { ...draft, [draft.addingPartner ? "partner" : "primary"]: sequence },
        handName(activeHand) + " start chosen. Choose step 1."
      );
    },
    append(option: StepData) {
      if (
        !active ||
        complete ||
        busy ||
        !options.some((candidate) => candidate.id === option.id)
      )
        return;
      const next = appendSoloContinuation(active, option);
      commit(
        { ...draft, [draft.addingPartner ? "partner" : "primary"]: next },
        "Added " +
          handName(activeHand).toLowerCase() +
          " step " +
          next.steps.length +
          "."
      );
    },
    addPartner() {
      if (!draft.primary?.steps.length || draft.addingPartner) return;
      commit(
        { ...draft, addingPartner: true },
        handName(draft.primaryHand) +
          " is fixed. Choose where " +
          handName(otherHand(draft.primaryHand)).toLowerCase() +
          " starts."
      );
      turns = 0;
      orientation = Orientation.IN;
    },
    async review() {
      if (!active?.steps.length || (draft.addingPartner && !complete) || busy)
        return;
      if (!draft.addingPartner) {
        result = active;
        notice = handName(activeHand) + " solo ready to review.";
        return;
      }
      const request = revision;
      busy = true;
      error = "";
      try {
        const blue =
          draft.primaryHand === "left" ? draft.primary! : draft.partner!;
        const red =
          draft.primaryHand === "right" ? draft.primary! : draft.partner!;
        const derived = await services.deriveLetters(
          pairSoloReviewSequences(blue, red)
        );
        if (request !== revision) return;
        result = {
          ...derived,
          stepPairings: derived.stepPairings?.map((pairing, i) => ({
            ...pairing,
            letter: derived.steps[i]?.letter ?? null,
          })),
        };
        notice =
          "Combined all " +
          derived.steps.length +
          " steps. Both paths are preserved.";
      } catch (cause) {
        if (request === revision)
          error =
            "Could not combine the paths. " +
            (cause instanceof Error ? cause.message : String(cause));
      } finally {
        if (request === revision) busy = false;
      }
    },
    resume() {
      result = null;
    },
  };
}

export type SoloAuthoringState = ReturnType<typeof createSoloAuthoringState>;
const CONTEXT = Symbol("solo-authoring-review");
export const setSoloAuthoringContext = (state: SoloAuthoringState) =>
  setContext(CONTEXT, state);
export const getSoloAuthoringContext = () =>
  getContext<SoloAuthoringState>(CONTEXT);
