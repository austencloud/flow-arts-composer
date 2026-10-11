import type { SceneEnvironmentId } from "#lib/shared/3d/environments/domain/scene-environment.js";

export interface StageChoreography {
  id: string;
  name: string;
  bpm: number;
  stageWidth: number;
  stageDepth: number;
  environmentId: SceneEnvironmentId;
  performers: Performer[];
  formations: Formation[];
  /** Used when opening older Stage projects that predate performer clip lanes. */
  sharedSequenceId: string | null;
}

export interface Performer {
  id: string;
  index: number;
  label: string;
  color: string;
  sequenceClips: StageSequenceClip[];
}

/**
 * A sequence arranged on one performer's lane. Stage time is expressed in
 * beats, so clips remain musically stable when the project BPM changes.
 */
export interface StageSequenceClip {
  id: string;
  sequenceId: string;
  /**
   * A name the author typed for this clip. Left unset, the clip shows the name
   * of the sequence it plays, which is what a lane needs to say by default.
   */
  label?: string;
  startBeat: number;
  durationBeats: number;
  sourceBeatCount: number;
  loop: boolean;
}

export interface Formation {
  id: string;
  label?: string;
  atBeat: number;
  transitionBeats: number;
  spots: Record<string, FormationSpot>;
  presetId?: FormationPresetId;
}

export interface FormationSpot {
  x: number;
  z: number;
  facingAngle?: number;
  walkStyle: WalkStyle;
  easing: EasingType;
  /**
   * Performer-specific travel into this destination.
   *
   * Older documents omit this and inherit the formation's global transition
   * window. Keeping the intent on the destination spot means timing follows
   * the same performer and set that already own position, facing, and pacing.
   */
  travel?: StageTravelTiming;
}

export interface StageTravelTiming {
  departureBeat: number;
  arrivalBeat: number;
  /** Omitted means Stage chooses a supported count for the available window. */
  stepCount?: number;
}

export type WalkStyle = "crab" | "direct";
export type EasingType = "linear" | "easeIn" | "easeOut" | "easeInOut";

export type FormationPresetId =
  | "line"
  | "triangle"
  | "diamond"
  | "circle"
  | "v-shape"
  | "grid"
  | "grid-2x2"
  | "stagger"
  | "cluster"
  | "diagonal"
  | "solo"
  | "tunnel-stack"
  | "back-to-back"
  | "facing-each-other"
  | "stage-lr"
  | "side-by-side"
  | "custom";

export const PERFORMER_LABELS = [
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
] as const;

export const PERFORMER_COLORS = [
  "#ff6b6b",
  "#4ecdc4",
  "#ffe66d",
  "#a06cd5",
  "#ff9a76",
  "#6bcf7f",
  "#7eb8da",
  "#e87ea1",
] as const;

export const DEFAULT_STAGE_WIDTH = 10;
export const DEFAULT_STAGE_DEPTH = 8;
export const DEFAULT_BPM = 120;
/**
 * Three, because the opening document is a triangle that turns inside out, and
 * a triangle takes three. A fourth performer lands on the formation's own mean
 * depth, where the closing move leaves them standing still while everyone else
 * walks — the one shape that makes the demo read as nothing happening.
 */
export const DEFAULT_PERFORMER_COUNT = 3;

/**
 * The sequence a fresh Stage document opens on, and the catalog it lives in.
 *
 * These sit in the domain layer rather than beside the loader because the
 * loader reaches Firestore: importing it just to read a string pulls the whole
 * data provider into anything that touches a Stage document, tests included.
 */
export const DEFAULT_STAGE_SEQUENCE_ID = "tnd-quarter-opp-mpmp";
export const DEFAULT_STAGE_SEQUENCE_CATALOG = "/data/hero/tnd-base-words.json";
