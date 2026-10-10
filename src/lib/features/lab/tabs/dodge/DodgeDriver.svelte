<script lang="ts">
  /**
   * DodgeDriver — Threlte child that drives the prop-dodge slice each frame.
   *
   * IMPERATIVE by design: the staff meshes are plain Object3Ds mutated directly
   * in the useTask loop (exactly how MmLocomotionController mutates bones), and
   * the dodge is PLANNED ONCE (per knob) behind a plain boolean guard. There is
   * NO $effect, NO $derived, and NO per-frame $state in this component. Binding
   * reactive $state to <T> props and rewriting it every frame feeds Threlte's
   * invalidate -> render -> task -> invalidate cycle synchronously, which Svelte
   * reports as effect_update_depth_exceeded (an infinite loop that hangs the
   * page). Keeping the per-frame path reactivity-free makes that impossible.
   *
   * The body placement comes from the analytic VacatePlanner (planDodge): a
   * deterministic stance (step into the open quadrant, face center, edge-on
   * twist, reach-bounded back-off). No per-frame optimizer, so no jitter. The
   * existing two-bone arm IK pins both hands to the staves every frame.
   */
  import { T, useTask } from "@threlte/core";
  import {
    Euler,
    Mesh,
    CylinderGeometry,
    Matrix4,
    MeshStandardMaterial,
    SphereGeometry,
    Quaternion,
    Vector3,
    type Bone,
  } from "three";
  import type { MmLocomotionController } from "#lib/features/stage/locomotion/motion-matching/mm-locomotion-controller.js";
  import type { RigBinding, LegChain } from "#lib/features/stage/locomotion/motion-matching/rig-binding.js";
  import { solveLegIK } from "#lib/shared/3d/services/hinge-constrained-leg-ik-solver.js";
  import { computeKneeHingeAxis } from "#lib/shared/3d/services/knee-hinge-axis-calibrator.js";
  import { calculatePropState } from "#lib/shared/3d/services/prop-state-interpolator.js";
  import { buildSweptVolume } from "#lib/features/stage/locomotion/dodge/swept-volume-builder.js";
  import { planDodge } from "#lib/features/stage/locomotion/dodge/dodge-orchestrator.js";
  import {
    StanceSimulator,
    restPoseFromHeight,
  } from "#lib/features/lab/tabs/collision-lab/services/stance-simulator.js";
  import type { SimPropTarget, RestPoseGeometry, SimResult } from "#lib/features/lab/tabs/collision-lab/services/types.js";
  import type { StancePose } from "#lib/features/lab/tabs/collision-lab/domain/types.js";
  import type { DodgePlan, DodgeKnob, BodyPlacement } from "#lib/features/stage/locomotion/dodge/dodge-types.js";
  import type { MotionConfig3D } from "#lib/shared/3d/domain/models/motion-data-3d.js";

  let {
    controller,
    rig,
    leftConfig,
    rightConfig,
    dodgeOn,
    knob,
    onClearance,
  }: {
    controller: MmLocomotionController | null;
    rig: RigBinding | null;
    leftConfig: MotionConfig3D;
    rightConfig: MotionConfig3D;
    dodgeOn: boolean;
    knob: DodgeKnob;
    onClearance: (clearanceM: number, plan: DodgePlan | null) => void;
  } = $props();

  const LOOP_SEC = 2.5;
  const STAFF_HORIZONTAL_QUAT = new Quaternion().setFromEuler(new Euler(0, 0, Math.PI / 2));

  // Imperative meshes — mutated each frame, NEVER bound to reactive $state.
  const leftStaff = new Mesh(
    new CylinderGeometry(0.02, 0.02, 0.86, 12),
    new MeshStandardMaterial({ color: "#3b82f6" })
  );
  const rightStaff = new Mesh(
    new CylinderGeometry(0.02, 0.02, 0.86, 12),
    new MeshStandardMaterial({ color: "#ef4444" })
  );
  // Marker for the planned foot spot (debug aid; not interactive).
  const footSphere = new Mesh(
    new SphereGeometry(0.05, 12, 12),
    new MeshStandardMaterial({ color: "#22c55e", transparent: true, opacity: 0.7 })
  );
  footSphere.visible = false;

  // Plain (non-reactive) state. None of this triggers Svelte reactivity.
  let shoulderY = 0;
  let restFacing = 0;
  let leftSweep: SimPropTarget[] = [];
  let rightSweep: SimPropTarget[] = [];
  let sim: StanceSimulator | null = null;
  let spineBone: Bone | null = null;
  let measuredBody: RestPoseGeometry | null = null;
  let plan: DodgePlan | null = null;
  let planKey = "";
  let lastTx = NaN;
  let lastTz = NaN;
  let lastTyaw = NaN;
  let progress = 0;
  let didSolve = false;
  let clearanceFrames = 0;

  // Arm IK chains (shoulder->elbow->hand) + per-elbow hinge axes. Built once.
  let leftArm: LegChain | null = null;
  let rightArm: LegChain | null = null;
  let leftElbowHinge: Vector3 | null = null;
  let rightElbowHinge: Vector3 | null = null;

  const _q = new Quaternion();
  const _pitchQ = new Quaternion();
  const _pitchAxis = new Vector3(1, 0, 0);
  const _twistQ = new Quaternion();
  const _twistAxis = new Vector3(0, 1, 0);
  const _up = new Vector3(0, 1, 0);
  const _grip = new Vector3();
  const _staffAxis = new Vector3();
  const _pole = new Vector3();
  const _qHandBefore = new Quaternion();
  const _qHandParent = new Quaternion();
  const _shL = new Vector3();
  const _shR = new Vector3();
  // Wrist-to-staff grip alignment scratch + the hand's local grip axis.
  const HAND_GRIP_LOCAL_AXIS = new Vector3(0, 1, 0);
  const _localGripWorld = new Vector3();
  const _alignQ = new Quaternion();
  const _targetHandWorld = new Quaternion();

  // Reach = a STEP toward the under-reach prop (feet follow the prop, body stays
  // balanced) plus a modest residual lean. The step does most of the reaching so
  // the spine never folds over stationary feet.
  const STEP_FRACTION = 0.8; // fraction of the reach shortfall closed by stepping
  const STEP_CAP = 0.6; // max auto-step (m) toward a prop
  const LEAN_GAIN = 2.0;
  const MAX_LEAN = 0.5; // ~29 deg residual lean for what the step leaves

  interface ReachAssist {
    stepX: number;
    stepZ: number;
    pitch: number;
  }

  /** Compute the reach assist at the BASE stance (bx,bz) — not the stepped
   *  position, so it is a stable function of base + props. Steps the feet toward
   *  whichever prop is hardest to reach, then leans for the residual. */
  function computeReach(bx: number, bz: number): ReachAssist {
    const none: ReachAssist = { stepX: 0, stepZ: 0, pitch: 0 };
    if (!leftArm || !rightArm || !rig) return none;
    const reach = (leftArm.upperLength + leftArm.lowerLength) * 0.99;
    const root = rig.root.position;
    leftArm.root.getWorldPosition(_shL);
    rightArm.root.getWorldPosition(_shR);
    // Shift shoulders from the current root back to the BASE root in XZ.
    _shL.x += bx - root.x;
    _shL.z += bz - root.z;
    _shR.x += bx - root.x;
    _shR.z += bz - root.z;
    const dL = _shL.distanceTo(leftStaff.position);
    const dR = _shR.distanceTo(rightStaff.position);
    const deficit = Math.max(dL, dR) - reach;
    if (deficit <= 0.001) return none;
    // Step toward the harder-to-reach prop (in XZ), from that shoulder.
    const worstSh = dL >= dR ? _shL : _shR;
    const worstGrip = dL >= dR ? leftStaff.position : rightStaff.position;
    let dx = worstGrip.x - worstSh.x;
    let dz = worstGrip.z - worstSh.z;
    const len = Math.hypot(dx, dz) || 1;
    const stepDist = Math.min(deficit * STEP_FRACTION, STEP_CAP);
    const stepX = (dx / len) * stepDist;
    const stepZ = (dz / len) * stepDist;
    const residual = Math.max(0, deficit - stepDist);
    const pitch = Math.min(residual * LEAN_GAIN, MAX_LEAN);
    return { stepX, stepZ, pitch };
  }

  /** Build a two-bone arm chain (Arm->ForeArm->Hand) from bind-pose offsets,
   *  matching the LegChain shape solveLegIK consumes (the elbow is a hinge like
   *  the knee). Bone local positions are bind-pose constants, so this is valid
   *  whether or not the rig is currently posed. */
  function buildArmChain(side: "Left" | "Right", r: RigBinding): LegChain | null {
    const arm = r.getBone(`${side}Arm`);
    const fore = r.getBone(`${side}ForeArm`);
    const hand = r.getBone(`${side}Hand`);
    if (!arm || !fore || !hand) return null;
    // Lengths MUST be world distances (meters). The X Bot skeleton is authored
    // at ~100x scale with the root scaled down, so bone.position (local) is in
    // the wrong units; world distances between joints are the real bone lengths.
    r.root.updateMatrixWorld(true);
    const a = new Vector3();
    const b = new Vector3();
    const c = new Vector3();
    arm.getWorldPosition(a);
    fore.getWorldPosition(b);
    hand.getWorldPosition(c);
    const upperLength = a.distanceTo(b);
    const lowerLength = b.distanceTo(c);
    return {
      root: arm,
      middle: fore,
      effector: hand,
      totalLength: upperLength + lowerLength,
      upperLength,
      lowerLength,
      rootRestDir: fore.position.clone().normalize(),
      middleRestDir: hand.position.clone().normalize(),
    };
  }

  /** Pin one hand to a world target (the prop grip) via the hinge two-bone IK,
   *  reaching from the CURRENT (dodged) shoulder. footForward aligns the hand to
   *  the staff; the pole biases the elbow outward + down. */
  function solveArm(chain: LegChain, hinge: Vector3, staff: Mesh, isLeft: boolean): void {
    _grip.copy(staff.position);
    _staffAxis.set(0, 1, 0).applyQuaternion(staff.quaternion).normalize();
    _pole.set(isLeft ? -1 : 1, -1, 0).normalize();
    const hand = chain.effector;
    solveLegIK({
      chain,
      footTarget: _grip,
      groundNormal: _up,
      footForward: _staffAxis,
      kneeHingeAxis: hinge,
      poleDirection: _pole,
      weight: 1,
    });
    // Pin POSITION via the IK, then ALIGN the grip to the staff: solveLegIK's
    // final block forces a ground-basis foot orientation that does not match the
    // Mixamo hand. Instead, rotate the hand's local grip axis onto the world
    // staff axis so the staff reads held, not floating. HAND_GRIP_LOCAL_AXIS is
    // the hand bone's local axis that runs along a gripped staff (Mixamo hands
    // grip along local +Y; calibrate visually if the grip reads rolled).
    hand.getWorldQuaternion(_qHandBefore);
    _localGripWorld.copy(HAND_GRIP_LOCAL_AXIS).applyQuaternion(_qHandBefore).normalize();
    _alignQ.setFromUnitVectors(_localGripWorld, _staffAxis);
    _targetHandWorld.copy(_alignQ).multiply(_qHandBefore);
    if (hand.parent) {
      hand.parent.getWorldQuaternion(_qHandParent);
      hand.quaternion.copy(_qHandParent.invert()).multiply(_targetHandWorld);
    } else {
      hand.quaternion.copy(_targetHandWorld);
    }
    hand.updateMatrixWorld(true);
  }

  function readShoulderY(r: RigBinding): number {
    // Use the arm-attachment joints (LeftArm/RightArm), not the clavicles, so the
    // prop-grip anchor matches the body model's shoulder line exactly.
    const ls = r.getBone("LeftArm");
    const rs = r.getBone("RightArm");
    const v = new Vector3();
    let sum = 0;
    let n = 0;
    if (ls) { ls.getWorldPosition(v); sum += v.y; n++; }
    if (rs) { rs.getWorldPosition(v); sum += v.y; n++; }
    if (n === 0) {
      const neck = r.getBone("Neck");
      if (neck) { neck.getWorldPosition(v); return v.y; }
      return 1.4;
    }
    return sum / n;
  }

  /** Measure a StanceSimulator body model from the REAL rig: real shoulder width,
   *  arm reach, and torso heights — not idealized anthropometrics.
   *
   *  CRITICAL: measure in ROOT-LOCAL space, never world. The rig is already
   *  translated + turned by the locomotion controller by the time the solve
   *  fires, so a WORLD-space read contaminates every coordinate with the root
   *  transform. Root-local strips it, so the measurement is deterministic. */
  function measureRigBody(r: RigBinding): RestPoseGeometry | null {
    const get = (n: string) => r.getBone(n);
    const hips = get("Hips"), s1 = get("Spine1"), s2 = get("Spine2"),
      neck = get("Neck"), head = get("Head"),
      la = get("LeftArm"), ra = get("RightArm"),
      lf = get("LeftForeArm"), lh = get("LeftHand"),
      rf = get("RightForeArm"), rh = get("RightHand");
    if (!hips || !s1 || !s2 || !neck || !head || !la || !ra || !lf || !lh || !rf || !rh) return null;
    r.root.updateMatrixWorld(true);
    const toLocal = new Matrix4().copy(r.root.matrixWorld).invert();
    const L = (b: typeof hips) => b.getWorldPosition(new Vector3()).applyMatrix4(toLocal);
    const lHips = L(hips), lS1 = L(s1), lS2 = L(s2), lNeck = L(neck), lHead = L(head);
    const lLa = L(la), lRa = L(ra), lLf = L(lf), lLh = L(lh), lRf = L(rf), lRh = L(rh);
    const shoulderYLocal = (lLa.y + lRa.y) / 2;
    const halfWidth = Math.abs(lLa.x - lRa.x) / 2;
    const upper = (lLa.distanceTo(lLf) + lRa.distanceTo(lRf)) / 2;
    const lower = (lLf.distanceTo(lLh) + lRf.distanceTo(lRh)) / 2;
    return {
      hipsY: lHips.y - shoulderYLocal,
      spine1: new Vector3(0, lS1.y - shoulderYLocal, 0),
      spine2: new Vector3(0, lS2.y - shoulderYLocal, 0),
      neck: new Vector3(0, lNeck.y - shoulderYLocal, 0),
      head: new Vector3(0, lHead.y - shoulderYLocal, 0),
      leftShoulder: new Vector3(-halfWidth, 0, 0),
      rightShoulder: new Vector3(halfWidth, 0, 0),
      upperArmLength: upper,
      forearmLength: lower,
      footHalfWidth: 0.1,
      headRadius: 0.09,
      torsoRadius: 0.12,
      // Oriented-slab torso half-axes — REQUIRED for the twist DOF to mean
      // anything. Wide across the shoulders, thin front-to-back; the thin axis
      // is what the edge-on turn presents to the staff.
      torsoHalfWidth: 0.14,
      torsoHalfDepth: 0.095,
      torsoHalfHeight: 0.12,
      armRadius: 0.04,
    };
  }

  /** One-time rig setup + the first plan, the first frame the rig is ready. */
  function ensureSolved(): void {
    if (didSolve || !rig || !controller) return;
    didSolve = true;
    shoulderY = readShoulderY(rig);
    restFacing = controller.state.facing;
    spineBone = rig.getBone("Spine");
    leftArm = buildArmChain("Left", rig);
    rightArm = buildArmChain("Right", rig);
    leftElbowHinge = leftArm ? computeKneeHingeAxis(leftArm.rootRestDir, leftArm.middleRestDir) : null;
    rightElbowHinge = rightArm ? computeKneeHingeAxis(rightArm.rootRestDir, rightArm.middleRestDir) : null;
    leftSweep = buildSweptVolume(leftConfig, 24).samples;
    rightSweep = buildSweptVolume(rightConfig, 24).samples;
    // Body model measured from the REAL rig (real handedness + reach), shared by
    // the plan and the live clearance readout so both match the actual avatar.
    measuredBody = measureRigBody(rig) ?? restPoseFromHeight(1.8);
    sim = new StanceSimulator(measuredBody);
    replan();

    if (typeof window !== "undefined") {
      (window as unknown as { __dodgeBody?: RestPoseGeometry }).__dodgeBody = measuredBody;
      (window as unknown as { __dodgeClearance?: () => number }).__dodgeClearance = liveClearance;
      (window as unknown as { __dodgeHandGap?: () => { left: number; right: number } }).__dodgeHandGap =
        () => ({
          left: leftArm ? leftArm.effector.getWorldPosition(new Vector3()).distanceTo(leftStaff.position) : -1,
          right: rightArm ? rightArm.effector.getWorldPosition(new Vector3()).distanceTo(rightStaff.position) : -1,
        });
      (window as unknown as { __dodgeLive?: () => unknown }).__dodgeLive = () => {
        if (!rig || !leftArm || !rightArm) return null;
        const v = (o: { getWorldPosition: (t: Vector3) => Vector3 }) => o.getWorldPosition(new Vector3());
        const shL = v(leftArm.root), shR = v(rightArm.root);
        const haL = v(leftArm.effector), haR = v(rightArm.effector);
        const lenL = leftArm.upperLength + leftArm.lowerLength;
        const lenR = rightArm.upperLength + rightArm.lowerLength;
        return {
          rootPos: { x: rig.root.position.x, y: rig.root.position.y, z: rig.root.position.z },
          facing: controller?.state.facing, restFacing,
          placement: plan ? plan.placement(progress) : null,
          extL: +(shL.distanceTo(haL) / lenL).toFixed(3),
          extR: +(shR.distanceTo(haR) / lenR).toFixed(3),
          handToStaffL: +haL.distanceTo(leftStaff.position).toFixed(3),
          handToStaffR: +haR.distanceTo(rightStaff.position).toFixed(3),
        };
      };
      (window as unknown as { __dodgeEval?: (x: number, z: number, yawDeg: number, pitchRad?: number, twistDeg?: number) => unknown }).__dodgeEval =
        (x: number, z: number, yawDeg: number, pitchRad = 0, twistDeg = 0) => {
          if (!sim) return null;
          const s: StancePose = { footOffsetX: x, footOffsetZ: z, rootYawRad: (yawDeg * Math.PI) / 180, spinePitchRad: pitchRad, torsoTwistRad: (twistDeg * Math.PI) / 180 };
          const r = sim.evaluateSweep(s, leftSweep, rightSweep);
          let body = 0;
          for (const c of r.collisions) {
            if (c.zone === "prop-through-torso" || c.zone === "prop-through-head") body = Math.max(body, c.depth);
          }
          return { feasible: r.feasible, reachLeft: r.reachShortfall.left, reachRight: r.reachShortfall.right, body, bal: r.balanceMargin };
        };
    }
  }

  /** Re-run the analytic plan when the knob changes (selection-time, cheap). */
  function replan(): void {
    if (!measuredBody) return;
    const key = `${knob.side}:${knob.aggression}`;
    if (plan && key === planKey) return;
    plan = planDodge(leftConfig, rightConfig, 1.8, 24, measuredBody, knob);
    planKey = key;
    const p = plan.placement(0.5);
    footSphere.position.set(p.footOffsetX, 0.02, p.footOffsetZ);
    footSphere.visible = true;
    if (typeof window !== "undefined") {
      (window as unknown as { __dodgePlan?: DodgePlan }).__dodgePlan = plan;
    }
  }

  /** Place a staff mesh from the prop state on its plane (imperative, no state). */
  function placeStaff(staff: Mesh, config: MotionConfig3D, p: number): void {
    const s = calculatePropState(config, p);
    staff.position.set(
      s.worldPosition.x,
      shoulderY + s.worldPosition.y,
      s.worldPosition.z + 0.3
    );
    _q.copy(s.worldRotation).multiply(STAFF_HORIZONTAL_QUAT);
    staff.quaternion.copy(_q);
  }

  /** Current avatar stance in the solver frame (origin at the rest pose). Spine
   *  pitch + torso twist come from the analytic plan so the clearance HUD
   *  reflects the real edge-on body, not an untwisted one. */
  function liveStance(): StancePose {
    const root = rig?.root;
    const facing = controller?.state.facing ?? restFacing;
    const placement: BodyPlacement | null = dodgeOn && plan ? plan.placement(progress) : null;
    return {
      footOffsetX: root ? root.position.x : 0,
      footOffsetZ: root ? root.position.z : 0,
      rootYawRad: facing - restFacing,
      spinePitchRad: placement ? placement.spinePitchRad : 0,
      torsoTwistRad: placement ? placement.torsoTwistRad : 0,
    };
  }

  /** Worst body penetration at the live stance, as a signed clearance (m).
   *  Negative = the prop intrudes into torso/head; >= 0 = cleared. */
  function liveClearance(): number {
    if (!sim || leftSweep.length === 0) return 0;
    const r: SimResult = sim.evaluateSweep(liveStance(), leftSweep, rightSweep);
    const torso = r.collisions.find((c) => c.zone === "prop-through-torso");
    const head = r.collisions.find((c) => c.zone === "prop-through-head");
    const depth = Math.max(torso?.depth ?? 0, head?.depth ?? 0);
    return -depth;
  }

  useTask((delta) => {
    if (!controller || !rig) return;
    ensureSolved();
    replan(); // cheap; no-ops unless the knob changed
    const dt = Math.min(delta, 1 / 15);

    // Place the staves first (fixed world choreography; they do NOT follow the
    // body), so the reach computation sees this frame's grips.
    progress = (progress + dt / LOOP_SEC) % 1;
    placeStaff(leftStaff, leftConfig, progress);
    placeStaff(rightStaff, rightConfig, progress);

    // Base stance from the analytic plan (deterministic, held — no jitter).
    // Neutral when the dodge is off.
    let bx = 0, bz = 0, byaw = 0, btwist = 0;
    if (dodgeOn && plan) {
      const st = plan.placement(progress);
      bx = st.footOffsetX;
      bz = st.footOffsetZ;
      byaw = st.rootYawRad;
      btwist = st.torsoTwistRad;
    }

    // Reach = a modest lean PLUS a coupled foot-step, so the WHOLE body (feet
    // included) moves to reach the props and stays balanced.
    const reach = computeReach(bx, bz);
    const reachPitch = reach.pitch + (dodgeOn && plan ? plan.placement(progress).spinePitchRad : 0);
    const tx = bx + reach.stepX;
    const tz = bz + reach.stepZ;
    const tyaw = byaw;

    // Position target may move every frame. Facing is re-issued only when it
    // shifts beyond a small epsilon: setTargetFacing resets the turn-cross
    // detector, so calling it every frame would break the turn.
    if (tx !== lastTx || tz !== lastTz) {
      controller.setTargetPosition(tx, tz);
      lastTx = tx;
      lastTz = tz;
    }
    if (Number.isNaN(lastTyaw) || Math.abs(tyaw - lastTyaw) > 0.02) {
      controller.setTargetFacing(tyaw);
      lastTyaw = tyaw;
    }

    controller.update(dt);

    // Torso twist (turn the chest edge-on) then residual forward lean — both
    // layered on the locomotion clip pose the controller just wrote to the spine
    // this frame, so they don't accumulate. Then pin each hand to its grip.
    if (spineBone && (Math.abs(btwist) > 0.001 || reachPitch > 0.001)) {
      if (Math.abs(btwist) > 0.001) {
        _twistQ.setFromAxisAngle(_twistAxis, btwist);
        spineBone.quaternion.multiply(_twistQ);
      }
      if (reachPitch > 0.001) {
        _pitchQ.setFromAxisAngle(_pitchAxis, reachPitch);
        spineBone.quaternion.multiply(_pitchQ);
      }
      spineBone.updateMatrixWorld(true);
    }
    if (leftArm && leftElbowHinge) solveArm(leftArm, leftElbowHinge, leftStaff, true);
    if (rightArm && rightElbowHinge) solveArm(rightArm, rightElbowHinge, rightStaff, false);

    // Report clearance to the page at ~6/sec, not every frame.
    if (++clearanceFrames >= 10) {
      clearanceFrames = 0;
      onClearance(liveClearance(), plan);
    }
  });
</script>

<T is={leftStaff} />
<T is={rightStaff} />
<T is={footSphere} />
