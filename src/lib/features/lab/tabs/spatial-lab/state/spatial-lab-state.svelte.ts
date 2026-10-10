import {
  computeTargetRotation,
  stepRotation,
  type Point2D,
} from "../services/body-rotation-solver";
import { getShoulderPosition, computeReachPercentage } from "../services/reach-calculator";
import { detectCrossing } from "../services/crossing-detector";
import { detectPlaneSplit } from "../services/plane-split-detector";
import type { ViewProjection } from "../services/projection";
import {
  BODY_CENTER,
  SHOULDER_DIST,
  MAX_REACH,
  BEHIND_THRESHOLD,
  MAX_ROTATION_SPEED,
  VIEW_TO_CAMERA,
  VIEW_TO_PLANE,
  type Preset,
} from "./spatial-lab-constants";
import { DEMO_SEQUENCES, type DemoSequence, type SequenceBeat } from "../services/demo-sequences";
import { diagnoseReachability, type ReachabilityDiagnosis } from "../services/reachability-taxonomy";
import { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
import { Plane } from "@austencloud/scene-3d";
import type { PropState3D } from "@austencloud/scene-3d";
import { LOCATION_ANGLES } from "#lib/shared/foundation/domain/math-constants.js";
import {
  gridLocationToPosition3D,
  calculatePropRotation,
} from "#lib/shared/3d/services/plane-coordinate-mapper.js";

export type LabMode = "sandbox" | "sequence";

const GRID_SCALE = 160;

function makePropState(location: GridLocation, plane: Plane): PropState3D {
  const angle = LOCATION_ANGLES[location] ?? 0;
  return {
    centerPathAngle: angle,
    staffRotationAngle: 0,
    plane,
    worldPosition: gridLocationToPosition3D(plane, location),
    worldRotation: calculatePropRotation(plane, 0),
  };
}

export class SpatialLabState {
  leftLocation = $state<GridLocation>(GridLocation.WEST);
  rightLocation = $state<GridLocation>(GridLocation.EAST);
  activePlane = $state<Plane>(Plane.WALL);
  bodyRotation = $state(0);
  bodyLocked = $state(false);
  showGrid = $state(true);
  showStage = $state(true);
  showLabels = $state(false);
  viewProjection = $state<ViewProjection>("wall");

  mode = $state<LabMode>("sandbox");
  activeSequence = $state<DemoSequence | null>(null);
  beatIndex = $state(0);
  playing = $state(false);
  playbackBpm = $state(60);
  private _playElapsed = 0;

  draggingSide = $state<"left" | "right" | null>(null);

  private _targetRotation = 0;

  leftPropState: PropState3D = $derived(makePropState(this.leftLocation, this.activePlane));
  rightPropState: PropState3D = $derived(makePropState(this.rightLocation, this.activePlane));

  cameraPreset = $derived(VIEW_TO_CAMERA[this.viewProjection] ?? "front");
  visiblePlanes = $derived(new Set([VIEW_TO_PLANE[this.viewProjection] ?? Plane.WALL]));

  private leftPos3D = $derived(this.leftPropState.worldPosition);
  private rightPos3D = $derived(this.rightPropState.worldPosition);

  private leftProp2D: Point2D = $derived({
    x: BODY_CENTER.x + this.leftPos3D.x * GRID_SCALE,
    y: BODY_CENTER.y - this.leftPos3D.y * GRID_SCALE,
  });

  private rightProp2D: Point2D = $derived({
    x: BODY_CENTER.x + this.rightPos3D.x * GRID_SCALE,
    y: BODY_CENTER.y - this.rightPos3D.y * GRID_SCALE,
  });

  private leftPropFloor: Point2D = $derived({
    x: BODY_CENTER.x + this.leftPos3D.x * GRID_SCALE,
    y: BODY_CENTER.y + this.leftPos3D.z * GRID_SCALE,
  });

  private rightPropFloor: Point2D = $derived({
    x: BODY_CENTER.x + this.rightPos3D.x * GRID_SCALE,
    y: BODY_CENTER.y + this.rightPos3D.z * GRID_SCALE,
  });

  leftShoulder = $derived(
    getShoulderPosition("left", this.bodyRotation, BODY_CENTER, SHOULDER_DIST),
  );

  rightShoulder = $derived(
    getShoulderPosition("right", this.bodyRotation, BODY_CENTER, SHOULDER_DIST),
  );

  planeSplitActive = $derived(
    detectPlaneSplit(this.leftPropFloor.y, this.rightPropFloor.y, BODY_CENTER.y, BEHIND_THRESHOLD),
  );

  crossing = $derived(
    detectCrossing(this.leftShoulder, this.leftProp2D, this.rightShoulder, this.rightProp2D),
  );

  leftReachPct = $derived(
    computeReachPercentage(this.leftShoulder, this.leftProp2D, MAX_REACH),
  );

  rightReachPct = $derived(
    computeReachPercentage(this.rightShoulder, this.rightProp2D, MAX_REACH),
  );

  leftReachable = $derived(this.leftReachPct <= 100);
  rightReachable = $derived(this.rightReachPct <= 100);

  leftDiagnosis: ReachabilityDiagnosis = $derived(
    diagnoseReachability(
      "left", this.leftProp2D, this.leftShoulder, this.rightShoulder,
      this.rightProp2D, BODY_CENTER, MAX_REACH, SHOULDER_DIST, BEHIND_THRESHOLD,
    ),
  );

  rightDiagnosis: ReachabilityDiagnosis = $derived(
    diagnoseReachability(
      "right", this.rightProp2D, this.rightShoulder, this.leftShoulder,
      this.leftProp2D, BODY_CENTER, MAX_REACH, SHOULDER_DIST, BEHIND_THRESHOLD,
    ),
  );

  facingAngle = $derived(this.bodyRotation * (Math.PI / 180));

  toggleBodyLock(): void {
    this.bodyLocked = !this.bodyLocked;
  }

  setView(view: ViewProjection): void {
    this.viewProjection = view;
    this.activePlane = VIEW_TO_PLANE[view] ?? Plane.WALL;
  }

  setLocation(side: "left" | "right", location: GridLocation): void {
    if (side === "left") this.leftLocation = location;
    else this.rightLocation = location;
  }

  applyPreset(preset: Preset): void {
    this.bodyLocked = false;
    this.leftLocation = preset.left;
    this.rightLocation = preset.right;
    this._syncBodyRotation();
  }

  readonly demoSequences = DEMO_SEQUENCES;

  currentBeat = $derived<SequenceBeat | null>(
    this.activeSequence ? this.activeSequence.beats[this.beatIndex] ?? null : null,
  );

  totalBeats = $derived(this.activeSequence?.beats.length ?? 0);

  loadSequence(seq: DemoSequence): void {
    this.mode = "sequence";
    this.activeSequence = seq;
    this.beatIndex = 0;
    this.playing = false;
    this._playElapsed = 0;
    this.bodyLocked = false;
    const first = seq.beats[0];
    if (first) this._applyBeat(first);
  }

  exitSequenceMode(): void {
    this.mode = "sandbox";
    this.activeSequence = null;
    this.playing = false;
    this.beatIndex = 0;
    this._playElapsed = 0;
  }

  setBeat(index: number): void {
    if (!this.activeSequence) return;
    const clamped = Math.max(0, Math.min(index, this.activeSequence.beats.length - 1));
    this.beatIndex = clamped;
    this._playElapsed = 0;
    const beat = this.activeSequence.beats[clamped];
    if (beat) this._applyBeat(beat);
  }

  togglePlayback(): void {
    this.playing = !this.playing;
    this._playElapsed = 0;
  }

  private _applyBeat(beat: SequenceBeat): void {
    this.leftLocation = beat.left;
    this.rightLocation = beat.right;
    if (beat.plane) this.activePlane = beat.plane;
    this._syncBodyRotation();
  }

  private _syncBodyRotation(): void {
    this._targetRotation =
      computeTargetRotation(this.leftPropFloor, this.rightPropFloor, BODY_CENTER, BEHIND_THRESHOLD) ??
      this.bodyRotation;
    this.bodyRotation = this._targetRotation;
  }

  tick(): void {
    if (this.playing && this.activeSequence) {
      this._playElapsed++;
      const framesPerBeat = Math.round(60 / (this.playbackBpm / 60));
      if (this._playElapsed >= framesPerBeat) {
        this._playElapsed = 0;
        const next = (this.beatIndex + 1) % this.activeSequence.beats.length;
        this.beatIndex = next;
        const nextBeat = this.activeSequence.beats[next];
        if (nextBeat) this._applyBeat(nextBeat);
      }
    }

    if (this.bodyLocked) return;

    const target = computeTargetRotation(
      this.leftPropFloor,
      this.rightPropFloor,
      BODY_CENTER,
      BEHIND_THRESHOLD,
    );

    if (target !== null) {
      this._targetRotation = target;
    }

    this.bodyRotation = stepRotation(
      this.bodyRotation,
      this._targetRotation,
      MAX_ROTATION_SPEED,
    );
  }
}

export function createSpatialLabState(): SpatialLabState {
  return new SpatialLabState();
}
