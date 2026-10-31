<script lang="ts">
  /**
   * A world-space performer whose character, hands, props, and tip effects all
   * come from the production sequence stack.
   */
  import { onDestroy, untrack, type Snippet } from "svelte";
  import { useThrelte } from "@threlte/core";
  import { Vector3, type Object3D } from "three";
  import { resolveThrelteScene } from "#lib/shared/3d/scene-boot/threlte-handles.js";
  import {
    cmToUnits,
    PerformerRig,
    Plane,
    PlaneMode,
    userProportionsState,
  } from "@austencloud/scene-3d";
  import type {
    PropBuild,
    PropState3D,
    AvatarGripDiagnostics,
    AvatarPoseDiagnostics,
    CollisionEvent,
    ScheduledGaitTimingSample,
    TerminalStepPlan,
    TurnRequest,
    LocomotionGaitClock,
  } from "@austencloud/scene-3d";
  import type { CharacterId } from "#lib/shared/3d/domain/character-model.js";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import type { EffortId } from "#lib/shared/effort/domain/effort-types.js";
  import { getSceneUndoManager } from "#lib/shared/3d/undo/get-scene-undo-manager.js";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import {
    createCharacterInstanceState,
    makeStandaloneDeps,
  } from "#lib/shared/3d/state/character-instance-state.svelte.js";
  import { toScenePropType } from "#lib/shared/3d/domain/scene-prop-type.js";
  import { type StanceYawTrack } from "#lib/shared/3d/collision/stance-yaw-track.js";
  import type { HardBeatTrack } from "#lib/shared/3d/collision/hard-beat-displacement.js";
  import type { BodyClearanceTrack } from "#lib/shared/3d/collision/body-clearance.js";
  import type { BodyResponseTrack } from "#lib/shared/3d/collision/body-response.js";
  import {
    resolvePerformerContact,
    type BodyFacingHint,
    type BodyRootTurn,
  } from "#lib/shared/3d/domain/performer-contact-displacement.js";
  import { performerScoreClock } from "#lib/shared/3d/domain/performer-score-clock.js";
  import {
    fitStaffLengthForHug,
    measurePerformerReach,
    type PerformerReachMeasurements,
  } from "#lib/shared/3d/domain/performer-reach-measurements.js";
  import {
    DEFAULT_PERFORMER_HAND_DISTANCE,
    type PerformerHandDistance,
  } from "#lib/shared/3d/domain/performer-hand-distance.js";
  import {
    captureReachInputs,
    handDistanceBaseForRig,
    type CaptureReachInputPolicy,
  } from "#lib/shared/3d/domain/performer-orbit-fit.js";
  import { QualityTier } from "../effects/types";
  import { buildTipEffectMap } from "#lib/shared/animation-engine/domain/tip-effect-map.js";
  import EffectOrchestrator3D from "#lib/shared/3d/effects/EffectOrchestrator3D.svelte";
  import {
    lockStaffToPalm,
    propStateFollowingStaff,
  } from "#lib/shared/3d/domain/staff-palm-lock.js";
  import { findRenderedPropNodes } from "#lib/shared/3d/native-capture/native-capture.js";

  export interface AuthoredUpperBodyStance {
    yawRad: number;
    segments?: {
      spine1Rad: number;
      spine2Rad: number;
      headLagRad: number;
    } | null;
    pitchRad?: number;
  }

  interface Props {
    id: string;
    position: { x: number; y: number; z: number };
    facingAngle: number;
    characterId: CharacterId;
    capturePlane?: "wall" | "wheel" | "floor";
    leftPlane?: Plane;
    rightPlane?: Plane;
    beatPlaneOverrides?: ReadonlyMap<number, { left?: Plane; right?: Plane }>;
    effortId?: EffortId;
    propType: PropType;
    propBuild?: PropBuild;
    leftPropFlipped?: boolean;
    rightPropFlipped?: boolean;
    /**
     * What the props play. Null stands the body in its own idle with empty
     * hands (the rig falls back to the character's idle clip); a host whose
     * performer stops spinning between pieces passes null rather than
     * pausing, which would hold the arms out at the sequence's pose.
     */
    sequence: SequenceData | null;
    effectId: string;
    effectQualityTier?: "low" | "medium" | "high";
    phaseOffsetSteps?: number;
    playbackSpeed?: number;
    active?: boolean;
    weldGrip?: boolean;
    showEffects?: boolean;
    enableLocomotion?: boolean;
    enableFootPlanting?: boolean;
    /**
     * Travel, passed straight to PerformerRig. A host that walks the
     * performer (an exact-step plan from `beat-travel-plan.ts`) moves
     * `position` itself and says here how the feet should step. Omit them,
     * as every standing host does, and the performer stands.
     */
    isMoving?: boolean;
    /** Ground speed in m/s; scales the walk clip so the feet do not skate. */
    moveSpeed?: number;
    /** Travel direction in the performer's own frame: +z ahead, +x to their right. */
    moveDirection?: { x: number; z: number };
    gaitTimingSample?: ScheduledGaitTimingSample | null;
    terminalStepPlan?: TerminalStepPlan | null;
    /**
     * A host-scheduled stepping turn. Omit it and the rig derives its own
     * turns from per-beat plane changes; pass null to hold the facing.
     */
    turnRequest?: TurnRequest | null;
    /** Bump to drop the walk's locomotion history (PerformerRig). */
    locomotionResetKey?: number;
    /** The walk's gait clock each frame, for a host that times stops to footfalls. */
    onGaitClock?: (clock: LocomotionGaitClock) => void;
    /** The body's fade, 0 to 1 (PerformerRig's avatarOpacity). */
    bodyOpacity?: number;
    /**
     * Drive the props from a score instead of the performer's own clock:
     * one unit is one beat of the sequence, from the start of beat 1, and
     * wraps round the sequence. The performer plays at `playbackSpeed`
     * (beats per second; match it to the score) and seeks only when it has
     * drifted a fifth of a beat from the score. Omit it and the performer
     * plays on its own.
     */
    scoreBeat?: number | null;
    /**
     * Pin the prop to an explicit length in centimetres instead of the length
     * this body can hold inside its own hug. Omit it — every production host
     * does — and the body-derived fit stands. A comparison surface passes it
     * so one variable can be held still while the other sweeps.
     */
    propLengthCm?: number | null;
    /**
     * Effective hand orbit from a live performer. Omit it to use the fixed
     * base distance, which the rig scales for a joined grid.
     */
    handDistance?: PerformerHandDistance | null;
    /** Composer capture follows the live viewer's fixed orbit and stance inputs. */
    captureReachInputPolicy?: CaptureReachInputPolicy;
    /**
     * Scene markers drawn inside the rig's own root group, so they inherit the
     * performer's world position, ground offset, and facing instead of sitting
     * at the world origin. Hosts pass the same wrapper the sequence viewer
     * uses: a group at GRID_OFFSETS[planeMode] around Grid3D.
     */
    gridSlot?: Snippet;
    /**
     * "prop-authoritative" (the default) closes every finger onto the prop each
     * frame. A crowd host can pass "legacy" for performers seen from a
     * distance: the stock grip, at a small fraction of the cost.
     */
    contactMode?: "prop-authoritative" | "legacy";
    /**
     * Lock each staff to its palm after the arms solve. The hands still aim
     * at the full-grid grip; where an arm falls short, its staff comes in to
     * meet the palm by exactly the shortfall and keeps the grid's
     * orientation (staff-palm-lock.ts). Tip effects follow the moved staff.
     * Omit it and the staffs stay where the grid and the rig put them.
     */
    staffPalmLock?: boolean;
    /**
     * "captured" holds the body exactly where it is and skips its per-frame
     * pose work; a crowd host passes it for performers who are hidden or are
     * between their staggered updates. Omit it and the body poses every frame.
     */
    posePlayback?: "live" | "paused" | "captured";
    onReady?: () => void;
    onMotionReady?: () => void;
    onMotionError?: (message: string) => void;
    /**
     * The planned turn for the loaded sequence, handed out once it exists.
     * Only a lab that draws the curve needs this; the pose itself is already
     * resolved here, so nothing downstream re-plans from it.
     */
    onStanceTrack?: (track: StanceYawTrack | null) => void;
    /**
     * The hard-beat displacement planned for the loaded sequence, handed out
     * once it exists. Its `report` lists every displaced beat in metres.
     */
    onHardBeatTrack?: (track: HardBeatTrack | null) => void;
    /**
     * Move the body off the point its staffs isolate around (step 5 of
     * docs/architecture/performer-grid-styles.md): "shift" moves the hips and
     * keeps the feet planted, "step" carries the feet along. Omit it, as every
     * production host does, and the body stays where the clip puts it.
     */
    bodyClearance?: "shift" | "step" | null;
    /** The body's planned move for the loaded sequence, once it exists. */
    onBodyClearanceTrack?: (track: BodyClearanceTrack | null) => void;
    /**
     * Let the whole body answer its staffs: turn, shift, duck and step
     * (body-response.ts). Stage-only tonight: no production host sets it, and
     * it takes over `bodyClearance` where both are set.
     */
    bodyResponse?: boolean;
    /** The facing the body response leans toward; pass a stable function. */
    facingHint?: BodyFacingHint | null;
    /** The turn the host plays on the root under the body response, so the
     *  planted feet hold still in the world; pass a stable function. */
    rootTurn?: BodyRootTurn | null;
    /** The body response's plan for the loaded sequence, once it exists. */
    onBodyResponseTrack?: (track: BodyResponseTrack | null) => void;
    /** A study can author one pose directly while retaining this component's
     * production character, hand, grip, and IK ownership. */
    authoredUpperBodyStance?: AuthoredUpperBodyStance | null;
    /**
     * Replaces a hand's prop state after contact is resolved, with the
     * score time it was resolved for (one unit a beat). The hand reaches for
     * the returned state's position. The real poi page puts the hand where
     * its string sim says. Omit it, as every production host does, and the
     * props stay where the score puts them.
     */
    propStateOverride?: (
      side: "left" | "right",
      prop: PropState3D,
      scoreTime: number
    ) => PropState3D;
    /** False draws no prop meshes; the hands still hold where the props
     *  are. Defaults to true. */
    showProps?: boolean;
    onCollisionEvents?: (
      events: CollisionEvent[],
      diagnostics: AvatarPoseDiagnostics,
      /** With `staffPalmLock`, the rendered grips are the locked ones and
       *  `staffPalmLockShortfallM` says how far each staff moved. */
      gripDiagnostics: AvatarGripDiagnostics & {
        staffPalmLockShortfallM?: [number, number];
      }
    ) => void;
  }

  const props: Props = $props();
  const effectQualityTier = $derived(
    props.effectQualityTier === "low"
      ? QualityTier.LOW
      : props.effectQualityTier === "medium"
        ? QualityTier.MEDIUM
        : props.effectQualityTier === "high"
          ? QualityTier.HIGH
          : undefined
  );
  const tipEffectMap = $derived(buildTipEffectMap(props.effectId));
  const rigGroundOffset = $derived(
    props.position.y - userProportionsState.groundY
  );
  const performerState = createCharacterInstanceState(
    {
      id: props.id,
      positionX: props.position.x,
      positionZ: props.position.z,
      characterId: props.characterId,
      persistent: false,
    },
    makeStandaloneDeps()
  );
  // Measured off the rig's own skeleton the first frame the arm chains report
  // real lengths. Held rather than re-derived per frame so the prop length and
  // the hug lane stay stable while the arms move.
  let reachMeasurements = $state<PerformerReachMeasurements | null>(null);
  const captureInputs = $derived(
    captureReachInputs(
      props.captureReachInputPolicy ?? "measured",
      props.handDistance ?? DEFAULT_PERFORMER_HAND_DISTANCE,
      reachMeasurements
    )
  );
  const staffFit = $derived(
    reachMeasurements ? fitStaffLengthForHug(reachMeasurements) : null
  );
  // A body that cannot hold any supported staff keeps the global default
  // rather than rendering a nonsense prop; the fit result says so explicitly.
  const propLength = $derived.by(() => {
    const pinned = props.propLengthCm;
    const baseLength =
      pinned != null && Number.isFinite(pinned)
        ? cmToUnits(pinned)
        : staffFit?.fits
          ? cmToUnits(staffFit.recommendedStaffLengthCm)
          : userProportionsState.staffLength;
    return baseLength * performerState.gridScale;
  });
  export function capturePropVisibility(): [boolean, boolean] {
    return [performerState.showLeft, performerState.showRight];
  }

  export function captureEffectivePropLengthCm(): number {
    return propLength * 100;
  }

  const authoredStanceActive = $derived(props.authoredUpperBodyStance != null);
  // Staffs the hands cannot hold from this stance move toward them, radially
  // and in depth, and a seek clears the animator's contact history. A pose
  // authored by hand keeps the props where the score puts them.
  const contact = $derived(
    resolvePerformerContact(performerState, {
      displace: !authoredStanceActive,
      clearBody: props.bodyClearance != null,
      bodyResponse: props.bodyResponse === true,
      facingHint: props.facingHint ?? null,
      rootTurn: props.rootTurn ?? null,
      staffLengthM: propLength,
      measurements: captureInputs.measurements,
    })
  );
  const leftProp = $derived(
    props.propStateOverride && contact.leftProp
      ? props.propStateOverride(
          "left",
          contact.leftProp,
          performerScoreClock(performerState)
        )
      : contact.leftProp
  );
  const rightProp = $derived(
    props.propStateOverride && contact.rightProp
      ? props.propStateOverride(
          "right",
          contact.rightProp,
          performerScoreClock(performerState)
        )
      : contact.rightProp
  );
  const stanceTrack = $derived(contact.stanceTrack);
  const upperBodyStance = $derived(contact.stance);
  const renderedUpperBodyStance = $derived(
    props.authoredUpperBodyStance ?? {
      yawRad: upperBodyStance.yawRad,
      segments: upperBodyStance.segments,
      pitchRad: upperBodyStance.pitchRad,
    }
  );
  const hardBeatTrack = $derived(contact.track);
  const bodyClearanceTrack = $derived(contact.bodyTrack);
  let readyReported = false;
  let motionReadyReported = false;

  /** Deterministic capture seam: one score unit is one production beat. */
  export function seekScore(score: number): void {
    if (!Number.isFinite(score) || score < 0)
      throw new Error("Invalid performer score");
    const steps = props.sequence?.steps.length ?? 0;
    if (!steps) throw new Error("Cannot seek an empty performer sequence");
    const wrapped = score % steps;
    performerState.pause();
    performerState.goToStep(
      performerState.motionStepOffset + Math.floor(wrapped)
    );
    performerState.setProgress(wrapped - Math.floor(wrapped));
  }

  function captureReach(diagnostics: AvatarPoseDiagnostics): void {
    if (reachMeasurements) return;
    const measured = measurePerformerReach({
      leftUpperArmM: diagnostics.leftUpperArmLength,
      leftForearmM: diagnostics.leftForearmLength,
      rightUpperArmM: diagnostics.rightUpperArmLength,
      rightForearmM: diagnostics.rightForearmLength,
      shoulderWidthM: diagnostics.shoulderWidth,
    });
    if (measured) reachMeasurements = measured;
  }

  $effect(() => {
    const sequence = props.sequence;
    const capturePlane = props.capturePlane ?? "wall";
    const leftPlane = props.leftPlane;
    const rightPlane = props.rightPlane;
    const beatPlaneOverrides = props.beatPlaneOverrides;
    const effortId = props.effortId;
    untrack(() => {
      getSceneUndoManager().withoutUndo(() => {
        if (capturePlane === "wheel") {
          performerState.setPlaneMode(PlaneMode.DUAL_WHEEL);
        } else if (capturePlane === "floor") {
          performerState.setHandPlane("left", Plane.FLOOR);
          performerState.setHandPlane("right", Plane.FLOOR);
        } else {
          performerState.setPlaneMode(PlaneMode.WALL);
        }
        if (leftPlane) performerState.setHandPlane("left", leftPlane);
        if (rightPlane) performerState.setHandPlane("right", rightPlane);
      });
      if (!sequence) {
        if (performerState.isPlaying) performerState.pause();
        if (performerState.hasSequence) performerState.clearSequence();
        return;
      }
      performerState.loadSequence(sequence);
      performerState.clearStepPlaneOverrides();
      getSceneUndoManager().withoutUndo(() => {
        for (const [step, planes] of beatPlaneOverrides ?? []) {
          if (planes.left)
            performerState.setStepHandPlane(step, "left", planes.left);
          if (planes.right)
            performerState.setStepHandPlane(step, "right", planes.right);
        }
      });
      if (effortId) performerState.setEffort(effortId, { recordUndo: false });
      performerState.loop = true;
      performerState.speed = props.playbackSpeed ?? 1;
      if (props.active !== false && props.scoreBeat == null)
        performerState.play();
    });
  });

  $effect(() => {
    const score = props.scoreBeat;
    const sequence = props.sequence;
    if (score == null || !sequence?.steps.length) return;
    untrack(() => {
      // The performer runs on its own clock at `playbackSpeed` (beats per
      // second) and is only put back on the score when the two part by more
      // than a fifth of a beat: a new phrase, a pause, a tempo change. A seek
      // every frame would rebuild the contact track every frame.
      const steps = sequence.steps.length;
      const wrapped = ((score % steps) + steps) % steps;
      const here =
        performerState.currentStepIndex -
        performerState.motionStepOffset +
        performerState.progress;
      const apart = Math.abs(here - wrapped);
      if (Math.min(apart, steps - apart) > 0.2) {
        performerState.goToStep(
          performerState.motionStepOffset + Math.floor(wrapped)
        );
        performerState.setProgress(wrapped - Math.floor(wrapped));
      }
      if (props.active !== false) performerState.play();
      else if (performerState.isPlaying) performerState.pause();
    });
  });

  $effect(() => {
    const phase = props.phaseOffsetSteps;
    const sequence = props.sequence;
    untrack(() => {
      // A scored performer is placed by the score, not by a start phase.
      if (props.scoreBeat != null) return;
      if (phase == null) {
        performerState.goToStep(0);
      } else if (sequence && sequence.steps.length > 0) {
        const wrapped =
          ((phase % sequence.steps.length) + sequence.steps.length) %
          sequence.steps.length;
        // A live phase is motion-relative: 0.00 is the beginning of beat 1 and
        // 7.99 the end of beat 8. The state owner says where beat 1 lives,
        // because it reserves index 0 for a static start pose when one exists.
        performerState.goToStep(
          Math.floor(wrapped) + performerState.motionStepOffset
        );
        performerState.setProgress(wrapped - Math.floor(wrapped));
      }
    });
  });

  $effect(() => {
    const next = captureInputs.hands;
    const base = handDistanceBaseForRig(
      next,
      performerState.gridScale,
      props.handDistance != null
    );
    untrack(() => performerState.setHandDistance(base));
  });

  $effect(() => {
    const active = props.active !== false && props.sequence != null;
    const speed = props.playbackSpeed ?? 1;
    const scored = props.scoreBeat != null;
    untrack(() => {
      performerState.speed = speed;
      // A scored performer starts and stops with its score (above).
      if (scored) return;
      if (active) performerState.play();
      else performerState.pause();
    });
  });

  $effect(() => {
    const track = stanceTrack;
    props.onStanceTrack?.(track);
  });

  $effect(() => {
    const track = hardBeatTrack;
    props.onHardBeatTrack?.(track);
  });

  $effect(() => {
    const track = bodyClearanceTrack;
    props.onBodyClearanceTrack?.(track);
  });

  $effect(() => {
    const track = contact.bodyResponseTrack;
    props.onBodyResponseTrack?.(track);
  });

  // Staff palm lock. The rig hands its post-IK palm and grip measurement to
  // onCollisionEvents at the end of its frame, after its own contact lock and
  // before the frame renders, so moving the correction groups there changes
  // this frame's pixels and the next frame's rig resets them again.
  const threlteScene = resolveThrelteScene(useThrelte().scene);
  type LockSide = { anchor: Object3D; correction: Object3D };
  let lockNodes: [LockSide | null, LockSide | null] | null = null;
  let effectShift = $state.raw<[Vector3 | null, Vector3 | null]>([null, null]);
  const _lockPalm = new Vector3();
  const _lockGrip = new Vector3();
  const _lockLocal = new Vector3();

  function staffLockNodes(): [LockSide | null, LockSide | null] | null {
    const attached = (side: LockSide | null) =>
      !side ||
      (side.correction.parent === side.anchor && side.anchor.parent?.parent);
    if (lockNodes && lockNodes.every(attached) && lockNodes.some(Boolean))
      return lockNodes;
    const rig = threlteScene.getObjectByName(`PERFORMER_${props.id}`)?.parent;
    if (!rig) return null;
    const side = (name: string): LockSide | null => {
      const branch = rig.children.find((child) => child.name === name);
      if (!branch) return null;
      try {
        const { correction } = findRenderedPropNodes(branch, props.id);
        return correction.parent
          ? { anchor: correction.parent, correction }
          : null;
      } catch {
        // Props still loading: the branch has no mesh yet.
        return null;
      }
    };
    lockNodes = [side("PERFORMER_PROP_LEFT"), side("PERFORMER_PROP_RIGHT")];
    return lockNodes.some(Boolean) ? lockNodes : null;
  }

  function lockStaffs(grip: AvatarGripDiagnostics) {
    const nodes = staffLockNodes();
    const shortfallM: [number, number] = [0, 0];
    const rendered: [Vector3 | null, Vector3 | null] = [null, null];
    const shift: [Vector3 | null, Vector3 | null] = [null, null];
    (["left", "right"] as const).forEach((side, index) => {
      const node = nodes?.[index];
      const palm = side === "left" ? grip.leftPalm : grip.rightPalm;
      const before =
        side === "left" ? grip.renderedBlueGrip : grip.renderedRedGrip;
      if (!node || !palm || !before) return;
      shortfallM[index] = lockStaffToPalm(
        node.correction,
        _lockPalm.copy(palm),
        _lockGrip.copy(before)
      );
      // Measured back off the moved group, not assumed from the palm.
      rendered[index] = node.correction.getWorldPosition(new Vector3());
      // Tip effects place themselves from the prop state in the hand
      // branch's frame; carry them by the whole rendered offset.
      const branch = node.anchor.parent;
      if (branch)
        shift[index] = branch
          .worldToLocal(_lockLocal.copy(rendered[index]!))
          .sub(node.anchor.position)
          .clone();
    });
    const moved = (a: Vector3 | null, b: Vector3 | null) =>
      !a !== !b || (a && b && a.distanceToSquared(b) > 1e-6);
    if (
      props.showEffects !== false &&
      (moved(shift[0], effectShift[0]) || moved(shift[1], effectShift[1]))
    )
      effectShift = shift;
    return {
      ...grip,
      renderedBlueGrip: rendered[0] ?? grip.renderedBlueGrip,
      renderedRedGrip: rendered[1] ?? grip.renderedRedGrip,
      staffPalmLockShortfallM: shortfallM,
    };
  }

  function shiftedForEffects(
    prop: PropState3D | null | undefined,
    shift: Vector3 | null
  ): PropState3D | null {
    if (!prop) return null;
    return props.staffPalmLock ? propStateFollowingStaff(prop, shift) : prop;
  }

  onDestroy(() => performerState.destroy());
</script>

<PerformerRig
  contactMode={props.contactMode ?? "prop-authoritative"}
  posePlayback={props.posePlayback ?? "live"}
  position={{ x: props.position.x, z: props.position.z }}
  facingAngle={props.facingAngle}
  planeMode={performerState.planeMode}
  avatarState={performerState}
  avatarId={props.characterId}
  showGrid={props.gridSlot != null}
  visiblePlanes={new Set([
    performerState.effectiveLeftPlane,
    performerState.effectiveRightPlane,
  ])}
  bluePropType={toScenePropType(props.propType)}
  redPropType={toScenePropType(props.propType)}
  propBuild={props.propBuild}
  bluePropFlipped={props.leftPropFlipped ?? false}
  redPropFlipped={props.rightPropFlipped ?? false}
  bluePropState={leftProp}
  redPropState={rightProp}
  pairSeparation={!contact.planned}
  contactResetKey={contact.resetKey}
  groundOffset={rigGroundOffset}
  enableLocomotion={props.enableLocomotion ?? true}
  enableFootPlanting={props.enableFootPlanting ?? true}
  isMoving={props.isMoving ?? false}
  moveSpeed={props.moveSpeed ?? 0}
  moveDirection={props.moveDirection}
  gaitTimingSample={props.gaitTimingSample ?? null}
  terminalStepPlan={props.terminalStepPlan ?? null}
  turnRequestOverride={props.turnRequest}
  locomotionResetKey={props.locomotionResetKey ?? 0}
  onGaitClock={props.onGaitClock}
  avatarOpacity={props.bodyOpacity ?? 1}
  weldGrip={props.weldGrip ?? false}
  {propLength}
  propScale={performerState.gridScale}
  headDodge={true}
  stanceYaw={renderedUpperBodyStance.yawRad}
  stanceSegments={renderedUpperBodyStance.segments ?? null}
  spinePitchOffset={renderedUpperBodyStance.pitchRad ?? 0}
  blueHandDepthOffset={authoredStanceActive
    ? 0
    : upperBodyStance.leftDepthOffsetM}
  redHandDepthOffset={authoredStanceActive
    ? 0
    : upperBodyStance.rightDepthOffsetM}
  bodyOffset={props.bodyResponse || props.bodyClearance
    ? contact.bodyOffset
    : null}
  bodyOffsetPlantFeet={props.bodyResponse || props.bodyClearance !== "step"}
  {...{
    // `bodyFeet` arrives with the pending scene-3d patch
    // (patches/@austencloud__scene-3d@0.1.6.patch); spread so this compiles
    // against the committed patch until then.
    bodyFeet: contact.bodyFeet,
  } as object}
  retainHiddenProps={true}
  bluePropVisible={performerState.showLeft}
  redPropVisible={performerState.showRight}
  showEffects={props.showEffects ?? true}
  showProps={props.showProps ?? true}
  {tipEffectMap}
  isPlaying={props.scoreBeat != null
    ? props.active !== false
    : performerState.isPlaying}
  onCollisionEvents={(events, diagnostics, gripDiagnostics) => {
    captureReach(diagnostics);
    if (!props.staffPalmLock) {
      props.onCollisionEvents?.(events, diagnostics, gripDiagnostics);
      return;
    }
    // Lock before handing the grips on: the lock moves the staffs whether or
    // not anyone listens, and an optional call would skip its arguments.
    const lockedGrips = lockStaffs(gripDiagnostics);
    props.onCollisionEvents?.(events, diagnostics, lockedGrips);
  }}
  gridSlot={props.gridSlot}
  onAvatarSwapped={() => {
    // Arm lengths belong to a body. A swapped character carries a different
    // skeleton, so the held measurement — and the prop length derived from
    // it — has to be taken again against the rig that just loaded.
    reachMeasurements = null;
    if (!readyReported) {
      readyReported = true;
      props.onReady?.();
    }
  }}
  onAvatarMotionReady={(_avatarId, error) => {
    if (motionReadyReported) return;
    if (error) {
      props.onMotionError?.(error);
      return;
    }
    motionReadyReported = true;
    props.onMotionReady?.();
  }}
>
  {#snippet effectsSlot({
    bluePropState,
    redPropState,
    blueHandPos,
    redHandPos,
    isPlaying,
    staffHalfLength,
    effectsParentRef,
  })}
    {#if props.showEffects !== false}
      <EffectOrchestrator3D
        leftPropState={performerState.showLeft
          ? shiftedForEffects(bluePropState, effectShift[0])
          : null}
        rightPropState={performerState.showRight
          ? shiftedForEffects(redPropState, effectShift[1])
          : null}
        leftPropType={toScenePropType(props.propType)}
        rightPropType={toScenePropType(props.propType)}
        {isPlaying}
        {staffHalfLength}
        propScale={performerState.gridScale}
        {tipEffectMap}
        leftHandPos={blueHandPos}
        rightHandPos={redHandPos}
        {effectsParentRef}
        currentStep={performerState.currentStepIndex + performerState.progress}
        totalSteps={performerState.totalSteps}
        seamlesslyLoopable={performerState.isCircular}
        qualityTierOverride={effectQualityTier}
      />
    {/if}
  {/snippet}
</PerformerRig>
