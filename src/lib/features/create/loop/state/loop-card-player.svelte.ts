import { getPictographArrivalPropMotionDurationMs } from "#lib/features/create/shared/workspace-panel/sequence-display/domain/pictograph-arrival-motion.js";
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";
import {
  motionDuration,
  reducedMotion,
  standardEasing,
} from "#lib/shared/transitions/motion.js";
import { DURATION } from "#lib/shared/transitions/transitions.js";
import type { RowChange } from "../domain/loop-families";
import {
  COPIES_DONE_MS,
  COPY_FLIGHT_MS,
  COPY_LEAD_MS,
  COPY_REST_MS,
  PERFORM_CLEAR_MS,
  PERFORM_LEAD_MS,
  PERFORM_MOVE_MS,
  PERFORM_STEP_MS,
} from "../domain/loop-timing";

/** How one square of the card is drawn right now. */
export interface CellVisual {
  /** In its place on the card; a square that isn't waits for a copy to land. */
  shown: boolean;
  props: boolean;
  arrow: number;
  /** 0..1 through its motion, or null when it is simply drawn. */
  progress: number | null;
}

/** A copy of one square on its way to another. */
export interface CellFlight {
  id: number;
  from: number;
  to: number;
  change: RowChange;
  ms: number;
}

export interface CopyRun {
  partLength: number;
  steps: readonly StepData[];
  changes: readonly RowChange[];
  /** A Rewound row plays its steps backwards, so each copy crosses over. */
  backwards: boolean;
  /** The square that was added to reach the ending, which plays first. */
  arriving: number | null;
}

/** A long LOOP copies its later rows faster; the idea has landed by then. */
const UNHURRIED_ROWS = 3;

/**
 * Plays the card: a new step arriving, the rows copying down, the whole LOOP
 * being performed. Anything the person does stops the run and the card rests
 * on its finished drawing.
 */
export function createLoopCardPlayer() {
  let visuals = $state<CellVisual[]>([]);
  let flights = $state<CellFlight[]>([]);
  let running = $state(false);
  let run = 0;
  let flightId = 0;

  const resting = (): CellVisual => ({
    shown: true,
    props: true,
    arrow: 1,
    progress: null,
  });

  function rest(count: number): void {
    run++;
    running = false;
    flights = [];
    visuals = Array.from({ length: count }, resting);
  }

  /** Runs `frame` with 0..1 for `ms`. False when something else took over. */
  function play(
    mine: number,
    ms: number,
    frame?: (linear: number) => void
  ): Promise<boolean> {
    if (mine !== run) return Promise.resolve(false);
    return new Promise((resolve) => {
      const startedAt = performance.now();
      const draw = (now: number) => {
        if (mine !== run) return resolve(false);
        const linear = ms > 0 ? Math.min(1, (now - startedAt) / ms) : 1;
        frame?.(Math.max(0, linear));
        if (linear < 1) requestAnimationFrame(draw);
        else resolve(true);
      };
      requestAnimationFrame(draw);
    });
  }

  async function playArrival(
    mine: number,
    index: number,
    step: StepData
  ): Promise<boolean> {
    const visual = visuals[index];
    if (!visual) return false;
    if (reducedMotion()) {
      Object.assign(visual, resting());
      return mine === run;
    }
    Object.assign(visual, { shown: true, props: true, arrow: 0, progress: 0 });
    if (!(await play(mine, DURATION.dramatic))) return false;
    const moved = await play(
      mine,
      getPictographArrivalPropMotionDurationMs(step),
      (linear) => {
        visual.progress = standardEasing(linear);
        visual.arrow = Math.max(0, (linear - 0.6) / 0.4);
      }
    );
    if (moved) Object.assign(visual, resting());
    return moved;
  }

  /** The newest step pops in and plays. Resolves when it has settled. */
  async function arrive(index: number, step: StepData): Promise<boolean> {
    rest(index + 1);
    const mine = run;
    running = true;
    const done = await playArrival(mine, index, step);
    if (mine === run) running = false;
    return done;
  }

  async function copyRows(mine: number, copy: CopyRun): Promise<boolean> {
    const { partLength, steps, changes, backwards } = copy;
    for (const [rowIndex, change] of changes.entries()) {
      const row = rowIndex + 1;
      const ms =
        rowIndex < UNHURRIED_ROWS ? COPY_FLIGHT_MS : COPY_FLIGHT_MS / 2;
      flights = Array.from({ length: partLength }, (_, column) => {
        const source = backwards ? partLength - 1 - column : column;
        return {
          id: ++flightId,
          from: (row - 1) * partLength + source,
          to: row * partLength + column,
          change,
          ms,
        };
      }).filter((flight) => flight.to < steps.length);
      if (!(await play(mine, ms))) return false;
      // Each copy has become its step on the way down, so the real square
      // appears beneath it unseen. The copy then fades off it, and only the
      // step's letter is seen to arrive.
      for (const flight of flights) visuals[flight.to]!.shown = true;
      if (!(await play(mine, COPY_REST_MS))) return false;
      flights = [];
    }
    return true;
  }

  async function performSteps(mine: number): Promise<boolean> {
    for (const visual of visuals) visual.props = false;
    const cleared = await play(mine, PERFORM_CLEAR_MS, (linear) => {
      const left = Math.max(0, 1 - linear * 2);
      for (const visual of visuals) visual.arrow = left;
    });
    if (!cleared) return false;
    for (const visual of visuals) visual.progress = 0;

    const count = visuals.length;
    const total = PERFORM_LEAD_MS + count * PERFORM_STEP_MS;
    const performed = await play(mine, total, (linear) => {
      const now = linear * total - PERFORM_LEAD_MS;
      for (let index = 0; index < count; index++) {
        const visual = visuals[index]!;
        const since = now - index * PERFORM_STEP_MS;
        if (since < -PERFORM_LEAD_MS || visual.progress === null) continue;
        visual.props = true;
        const moved = Math.min(1, Math.max(0, since / PERFORM_MOVE_MS));
        visual.arrow = moved;
        visual.progress = moved < 1 ? standardEasing(moved) : null;
      }
    });
    if (performed)
      for (const visual of visuals) Object.assign(visual, resting());
    return performed;
  }

  /**
   * The LOOP being made: the steps already there, then each row copied down
   * from the one above, then the whole card performed from the top.
   */
  async function make(copy: CopyRun): Promise<boolean> {
    rest(copy.steps.length);
    if (reducedMotion()) return true;
    const mine = run;
    running = true;
    for (let i = copy.partLength; i < copy.steps.length; i++)
      visuals[i]!.shown = false;
    if (copy.arriving !== null) visuals[copy.arriving]!.shown = false;
    let alive = await play(mine, COPY_LEAD_MS);
    if (alive && copy.arriving !== null)
      alive = await playArrival(
        mine,
        copy.arriving,
        copy.steps[copy.arriving]!
      );
    alive = alive && (await copyRows(mine, copy));
    alive = alive && (await play(mine, COPIES_DONE_MS));
    alive = alive && (await performSteps(mine));
    if (mine === run) running = false;
    return alive;
  }

  /** The finished card performed again from the top. */
  async function perform(count: number): Promise<boolean> {
    rest(count);
    if (reducedMotion()) return true;
    const mine = run;
    running = true;
    const done = await performSteps(mine);
    if (mine === run) running = false;
    return done;
  }

  /** The explainer's own lesson, one beat at a time, on the same card. */
  function lesson(steps: readonly StepData[]) {
    run++;
    const mine = run;
    running = true;
    flights = [];
    visuals = steps.map(() => ({ ...resting(), shown: false }));
    return {
      wait: (ms: number) => play(mine, motionDuration(ms)),
      arrive: (index: number) => playArrival(mine, index, steps[index]!),
      copyRows: (copy: CopyRun) => copyRows(mine, copy),
      perform: () => performSteps(mine),
      alive: () => mine === run,
    };
  }

  function stop(): void {
    rest(visuals.length);
  }

  return {
    get visuals() {
      return visuals;
    },
    get flights() {
      return flights;
    },
    /** Something is playing; a tap anywhere would stop it. */
    get running() {
      return running;
    },
    rest,
    arrive,
    make,
    perform,
    lesson,
    stop,
    dispose() {
      run++;
      running = false;
    },
  };
}

export type LoopCardPlayer = ReturnType<typeof createLoopCardPlayer>;
