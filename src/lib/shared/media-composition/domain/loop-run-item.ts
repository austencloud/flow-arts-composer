import {
  addOverlayItem,
  finiteOr,
  POST_BOX,
  type EditContext,
  type NewOverlaySpec,
  type PostBox,
  type PostProject,
} from "@austencloud/video-editor/core";
import {
  LOOP_RUN_CHANGES,
  LOOP_RUN_COLOURS,
  LOOP_RUN_LAYOUTS,
  LoopRunSettingsSchema,
  loopRunDefaultEvents,
  loopRunLength,
  type LoopRunChange,
  type LoopRunBadge,
  type LoopRunEvent,
  type LoopRunLayout,
  type LoopRunSequenceSnapshot,
  type LoopRunSettings,
} from "./loop-run";
import { engineStepsOf, sequenceFromEngineSteps, type EngineStep } from "./loop-run-sequence";

/** A new LOOP run, as the CLI and the Add menu describe it. */
export interface LoopRunInit {
  /** The engine's step list (start position first), or a sequence snapshot. */
  steps?: unknown;
  sequence?: LoopRunSequenceSnapshot;
  name?: string;
  change: LoopRunChange;
  layout?: LoopRunLayout;
  seed?: number;
  colour?: string;
  events?: LoopRunEvent[];
  badges?: LoopRunBadge[];
  /** Room kept clear of pictures at each edge, as shares of the clip's height and width. */
  room?: LoopRunSettings["room"];
  /** A faint grid in each place a step has not reached yet. */
  waitingGrids?: boolean;
  /** How far the reflection line runs past the outer tiles' centres, as a share of a tile. */
  lineReach?: number;
  /** The start position shows from the first frame, where the card puts it. */
  startAlways?: boolean;
  /** `false` leaves the start position out of the card. */
  cardStart?: boolean;
  /** In pairs, the gaps between the columns and between the rows, as shares of a tile. */
  pairsGap?: LoopRunSettings["pairsGap"];
  /** One kind of tile: square, one faint hairline, empty frames for places not reached yet. */
  plainTiles?: boolean;
  at?: number;
  duration?: number;
  box?: PostBox;
}

/** The layout a change starts in when none is named: rotated round a ring, the rest in pairs. */
export function loopRunDefaultLayout(change: LoopRunChange): LoopRunLayout {
  return change === "rotated" ? "ring" : "pairs";
}

/** How long a run lasts when no length is given: its last moment, then a short hold. */
const HOLD_SECONDS = 0.6;

/** The overlay spec for a new LOOP run, refusing values that break its schema. */
export function loopRunOverlaySpec(init: LoopRunInit): NewOverlaySpec {
  if (!LOOP_RUN_CHANGES.includes(init.change))
    throw new Error(`change must be one of ${LOOP_RUN_CHANGES.join(", ")}.`);
  if (init.layout !== undefined && !LOOP_RUN_LAYOUTS.includes(init.layout))
    throw new Error(`layout must be one of ${LOOP_RUN_LAYOUTS.join(", ")}.`);
  let sequence = init.sequence;
  if (!sequence) {
    if (init.steps === undefined) throw new Error("A LOOP run needs its steps or a sequence.");
    const steps: EngineStep[] = engineStepsOf(init.steps);
    const name = init.name?.trim() || "LOOP";
    sequence = { id: `loop-${name}`, name, sequence: sequenceFromEngineSteps(steps, { name, id: `loop-${name}` }) };
  }
  const stepCount = sequence.sequence.steps.length;
  const seed = init.seed ?? seedOf(init.steps, stepCount);
  const layout = init.layout ?? loopRunDefaultLayout(init.change);
  const parsed = LoopRunSettingsSchema.safeParse({
    seed,
    change: init.change,
    layout,
    colour: init.colour ?? LOOP_RUN_COLOURS[init.change],
    events: init.events ?? loopRunDefaultEvents(init.change, layout, stepCount, seed),
    ...(init.badges ? { badges: init.badges } : {}),
    ...(init.room ? { room: init.room } : {}),
    ...(init.waitingGrids !== undefined ? { waitingGrids: init.waitingGrids } : {}),
    ...(init.lineReach !== undefined ? { lineReach: init.lineReach } : {}),
    ...(init.startAlways !== undefined ? { startAlways: init.startAlways } : {}),
    ...(init.cardStart !== undefined ? { cardStart: init.cardStart } : {}),
    ...(init.pairsGap ? { pairsGap: init.pairsGap } : {}),
    ...(init.plainTiles !== undefined ? { plainTiles: init.plainTiles } : {}),
  });
  if (!parsed.success)
    throw new Error(`The LOOP run's play is not valid: ${parsed.error.issues.map((issue) => `${issue.path.join(".")} ${issue.message}`).join("; ")}`);
  const settings: LoopRunSettings = parsed.data;
  const length = loopRunLength(settings, stepCount) + HOLD_SECONDS;
  return {
    kind: "loop",
    at: Math.max(0, finiteOr(init.at ?? 0, 0)),
    duration: Math.max(0.1, finiteOr(init.duration ?? length, length)),
    box: { ...(init.box ?? POST_BOX.full) },
    fill: false,
    loop: { sequence, ...settings },
  };
}

/** The seed's length from the engine file's own note of its repetitions, else half the steps. */
function seedOf(json: unknown, steps: number): number {
  const reps = (json as { meta?: { reps?: unknown } } | undefined)?.meta?.reps;
  if (typeof reps === "number" && reps >= 1 && steps % reps === 0) return steps / reps;
  return Math.max(1, Math.floor(steps / 2));
}

/** Adds the LOOP run `loopRunOverlaySpec` describes. */
export function addLoopRunItem(
  project: PostProject,
  ctx: EditContext,
  init: LoopRunInit
): { project: PostProject; itemId: string } | null {
  return addOverlayItem(project, loopRunOverlaySpec(init), ctx);
}
