<script lang="ts">
  /**
   * Walk lab
   *
   * One performer, one floor, and every way of walking across it, so the thing
   * the eye is complaining about can be reproduced on demand instead of caught
   * in passing in the middle of a film.
   *
   * The rig is the shipping one: PerformerRig with locomotion and foot
   * planting on, the same component the sequence viewer and the film director
   * mount. The only thing the lab supplies is where to go, which is the one
   * input a scene normally buries inside choreography.
   *
   * The instrument beside it is the gait probe, which samples the pose after
   * the whole pipeline has written it and says what the legs actually did.
   * Its teleport row is the one to read first: a joint arriving somewhere in a
   * single frame instead of travelling there is the shape of the complaint,
   * and the strip underneath lines each one up against what the feet were
   * doing at that moment.
   */

  import { onDestroy, onMount, untrack } from "svelte";
  import { browser } from "$app/env";
  import { afterNavigate, goto } from "$app/navigation";
  import * as THREE from "three";
  import { Canvas, T } from "@threlte/core";
  import type CameraControls from "camera-controls";
  import {
    Plane,
    PlaneMode,
    PerformerRig,
    userProportionsState,
    type AvatarId,
    type LateralGait,
    type LocomotionGaitClock,
    type ScheduledGaitTimingSample,
    type TerminalStepPlan,
  } from "@austencloud/scene-3d";
  import OrbitControls from "#lib/shared/3d/components/OrbitControls.svelte";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import {
    createCharacterInstanceState,
    makeStandaloneDeps,
  } from "#lib/shared/3d/state/character-instance-state.svelte.js";
  import GaitProbe from "#lib/shared/3d/diagnostics/gait/GaitProbe.svelte";
  import GaitOverlay from "#lib/shared/3d/diagnostics/gait/GaitOverlay.svelte";
  import type { GaitManeuverProfile } from "#lib/shared/3d/diagnostics/gait/gait-verdicts.js";
  import { gaitProbeState } from "#lib/shared/3d/diagnostics/gait/gait-probe-state.svelte.js";
  import {
    WALK_PATTERNS,
    walkPattern,
  } from "#lib/shared/3d/diagnostics/gait/walk-patterns.js";
  import {
    createDestinationWalkPlan,
    createTerminalStepPlan,
  } from "#lib/shared/3d/locomotion/destination-walk-plan.js";
  import {
    MAX_EXACT_STEPS,
    MIN_EXACT_STEPS,
    exactStepRange as supportedExactStepRange,
  } from "#lib/shared/3d/locomotion/straight-travel-constraints.js";
  import {
    createCountedGaitTimingPlan,
    type CountedGaitSchedule,
  } from "#lib/shared/3d/locomotion/gait-timing-plan.js";
  import WalkDriver from "./WalkDriver.svelte";
  import type { ManualInput, WalkState } from "./walk-command";

  const MANUAL = "manual";
  const EXACT_MARK = "exact-mark";
  const TEMPO_OPTIONS = [90, 120, 150] as const;
  function exactStepRange(distance: number): { min: number; max: number } {
    return (
      supportedExactStepRange(distance) ?? {
        min: MIN_EXACT_STEPS,
        max: MAX_EXACT_STEPS,
      }
    );
  }

  function clampExactSteps(distance: number, steps: number): number {
    const range = exactStepRange(distance);
    return Math.min(range.max, Math.max(range.min, Math.round(steps)));
  }

  /** The rig draws no grid here, so no plane is visible on it. */
  const NO_PLANES = new Set<Plane>();

  const PATTERN_OPTIONS = [
    {
      value: EXACT_MARK,
      label: "Exact mark",
      ariaLabel: "Exact mark: reach a destination on the requested footfall",
    },
    ...WALK_PATTERNS.map((pattern) => ({
      value: pattern.id,
      label: pattern.label,
      ariaLabel: `${pattern.label}: ${pattern.hunts}`,
    })),
    {
      value: MANUAL,
      label: "Drive it",
      ariaLabel: "Drive the performer with the keyboard",
    },
  ];

  /**
   * Rigs worth switching between.
   *
   * Leg length and hip width are what the retarget scales its foot goals by,
   * so the rigs that disagree most about those are the ones that catch a
   * scaling mistake. These three span the shipped range.
   */
  const AVATAR_OPTIONS: { value: AvatarId; label: string }[] = [
    { value: "ch01" as AvatarId, label: "ch01" },
    { value: "ch12" as AvatarId, label: "ch12" },
    { value: "ch44" as AvatarId, label: "ch44" },
    { value: "remy" as AvatarId, label: "Remy" },
    { value: "x-bot" as AvatarId, label: "X-Bot" },
  ];

  /**
   * Where to stand to see it.
   *
   * `height` is what the camera looks at, not where it sits: the ankle view
   * has to aim at the floor or the feet leave the bottom of the frame the
   * moment the body is centred.
   */
  interface Vantage {
    id: string;
    label: string;
    eye: [number, number, number];
    height: number;
  }

  const VANTAGES: Vantage[] = [
    { id: "side", label: "Side", eye: [3.4, 1.5, 0], height: 0.95 },
    { id: "front", label: "Front", eye: [0, 1.5, 3.4], height: 0.95 },
    {
      id: "quarter",
      label: "Three-quarter",
      eye: [2.6, 1.9, 2.6],
      height: 0.95,
    },
    { id: "ankles", label: "Ankles", eye: [1.15, 0.32, 1.15], height: 0.12 },
    { id: "top", label: "Overhead", eye: [0, 6, 0.01], height: 0 },
  ];

  /**
   * The whole setup lives in the query string.
   *
   * A gait fault that only shows up on one pattern at one speed on one rig is
   * a thing to send someone, and the probe's buffer only holds the last thirty
   * seconds - so the reliable way to measure one case is to arrive already on
   * it rather than to switch and wait for the previous pattern to age out.
   */
  const params = browser
    ? new URLSearchParams(window.location.search)
    : new URLSearchParams();
  const asked = (key: string, fallback: string) => params.get(key) ?? fallback;

  let patternId = $state(
    params.get("pattern") === EXACT_MARK
      ? EXACT_MARK
      : WALK_PATTERNS.some((p) => p.id === params.get("pattern"))
        ? params.get("pattern")!
        : WALK_PATTERNS[0]!.id
  );
  // X-Bot by default: a pale untextured mannequin. The costumed rigs render
  // as dark silhouettes under any lighting that keeps the floor readable, and
  // an ankle you cannot see is the one thing this page cannot afford.
  let avatarId = $state<AvatarId>(asked("rig", "x-bot") as AvatarId);
  let speed = $state(Number(asked("speed", "1")) || 1);
  let markDistance = $state(
    Math.min(8, Math.max(2, Number(asked("distance", "4")) || 4))
  );
  let markSteps = $state(
    clampExactSteps(markDistance, Math.round(Number(asked("steps", "6")) || 6))
  );
  const askedTempo = Number(asked("bpm", "120"));
  let tempoBpm = $state(
    TEMPO_OPTIONS.includes(askedTempo as (typeof TEMPO_OPTIONS)[number])
      ? askedTempo
      : 120
  );
  let timingSchedule = $state<CountedGaitSchedule>(
    asked("schedule", "even") === "hold-middle" ? "hold-middle" : "even"
  );
  let departureBeat = $state(
    Math.min(4, Math.max(0, Math.round(Number(asked("departure", "1")) || 0)))
  );
  // A scored departure is armed, never auto-fired while its rig is still
  // loading. Free-running diagnostic patterns keep their historical autoplay.
  let running = $state(patternId !== EXACT_MARK);
  let follow = $state(true);
  /**
   * The foot planter, on a switch.
   *
   * It locks a stance foot to a world position and solves the leg to reach it.
   * That is the half of the system most likely to be the source of a snap, and
   * a lab that cannot turn a suspect off can only ever describe the symptom.
   */
  let planting = $state(asked("plant", "on") !== "off");
  // Validated, not trusted: an unrecognised id used to fall through to the
  // first vantage while the address bar still claimed another one, so a
  // screenshot and the link that was supposed to reproduce it disagreed.
  let vantageId = $state(
    VANTAGES.some((v) => v.id === params.get("camera"))
      ? params.get("camera")!
      : "side"
  );
  let resetNonce = $state(0);
  let compactProbe = $state(false);

  const isExactMark = $derived(patternId === EXACT_MARK);
  const exactSteps = $derived(exactStepRange(markDistance));
  const pattern = $derived(
    walkPattern(isExactMark ? WALK_PATTERNS[0]!.id : patternId)
  );
  const isManual = $derived(patternId === MANUAL);
  const lateralGait: LateralGait = $derived(
    patternId === "grapevine" ? "grapevine" : "sidestep"
  );
  const destinationPlan = $derived(
    isExactMark
      ? createDestinationWalkPlan({
          from: { x: 0, z: 0 },
          to: { x: 0, z: markDistance },
          steps: markSteps,
          cadence: tempoBpm / 60,
        })
      : null
  );
  const gaitTimingPlan = $derived(
    isExactMark
      ? createCountedGaitTimingPlan({
          id: `walk-lab-score-${resetNonce}`,
          steps: markSteps,
          tempoBpm,
          departureBeat,
          schedule: timingSchedule,
        })
      : null
  );
  const vantage = $derived(
    VANTAGES.find((v) => v.id === vantageId) ?? VANTAGES[0]!
  );

  let walk = $state<WalkState>({
    t: 0,
    x: 0,
    z: 0,
    facing: 0,
    isMoving: false,
    speed: 0,
    direction: { x: 0, z: 1 },
    phase: "standing",
    travelled: 0,
    turnRequest: null,
    terminalStepPlan: null,
  });
  let gaitClock = $state<LocomotionGaitClock | null>(null);
  /**
   * Which clips the pose is actually made of. The animator crosses from the
   * walk set to the run set over a band derived from the two clips' own
   * measured speeds, so the honest readout is a blend percentage rather than a
   * label that flips at some threshold.
   */
  const gaitTierLabel = $derived.by(() => {
    const tier = gaitClock?.tier ?? 0;
    if (tier <= 0.01) return "walk";
    if (tier >= 0.99) return "run";
    return `blend ${(tier * 100).toFixed(0)}%`;
  });
  /**
   * Which set of human norms the probe grades against.
   *
   * The first three come from the pattern, because a pivot or a grapevine is
   * that maneuver at any speed. Running is not: it is a property of how fast
   * the body is actually going, so it comes from the animator's own tier
   * rather than from a pattern name. Half is the crossover because that is
   * where the pose stops being mostly walk clips and starts being mostly run
   * ones - and the profile has to follow the pose, since the whole point is
   * grading what is on screen.
   */
  const gaitManeuver = $derived<GaitManeuverProfile>(
    patternId === "pivot"
      ? "turn-in-place"
      : patternId === "sidestep"
        ? "lateral"
        : patternId === "grapevine"
          ? "crossover"
          : (gaitClock?.tier ?? 0) >= 0.5
            ? "run"
            : "walk"
  );
  let gaitTimingSample = $state<ScheduledGaitTimingSample | null>(null);
  let departureGaitStep = $state<number | null>(null);
  const destinationTerminalStepPlan = $derived<TerminalStepPlan | null>(
    destinationPlan && departureGaitStep !== null
      ? createTerminalStepPlan(
          destinationPlan,
          departureGaitStep,
          `walk-lab-${resetNonce}`,
          Math.atan2(destinationPlan.direction.x, destinationPlan.direction.z),
          gaitTimingPlan?.id
        )
      : null
  );
  const activeTerminalStepPlan = $derived(
    destinationTerminalStepPlan ?? walk.terminalStepPlan ?? null
  );
  const exactMarkArrived = $derived(
    isExactMark && walk.completedSteps === markSteps
  );

  // The rig re-reads position and facing every frame, so these are plain
  // objects rebuilt per frame rather than a proxy the rig would re-subscribe
  // to on every field.
  const rigPosition = $derived({ x: walk.x, z: walk.z });

  /**
   * Stand the performer on the floor.
   *
   * The rig's origin is the SHOULDER line - Avatar3D sinks its mesh by
   * `groundY` so the prop planes are centred on the shoulders. Leaving this
   * at its default buries the character up to the neck, and the gait readout
   * keeps reporting healthy numbers the whole time because it measures joints
   * relative to the pelvis and never asks where the floor is.
   */
  const groundOffset = $derived(-userProportionsState.groundY);

  let avatarState = $state<ReturnType<typeof createCharacterInstanceState> | null>(
    null
  );
  try {
    avatarState = createCharacterInstanceState(
      {
        id: "walk-lab-performer",
        positionX: 0,
        positionZ: 0,
        persistent: false,
      },
      makeStandaloneDeps()
    );
  } catch (error) {
    console.warn("[WalkLab] avatar state failed to initialise:", error);
  }

  // ── Keyboard driving ────────────────────────────────────────────────
  const held = new Set<string>();
  let manualInput = $state<ManualInput | null>(null);

  function readHeld(): ManualInput {
    const axis = (positive: string[], negative: string[]) =>
      (positive.some((k) => held.has(k)) ? 1 : 0) -
      (negative.some((k) => held.has(k)) ? 1 : 0);
    return {
      forward: axis(["w", "arrowup"], ["s", "arrowdown"]),
      right: axis(["d"], ["a"]),
      turn: axis(["arrowleft"], ["arrowright"]),
    };
  }

  function onKey(event: KeyboardEvent, down: boolean): void {
    const key = event.key.toLowerCase();
    if (key === " " && down) {
      running = !running;
      event.preventDefault();
      return;
    }
    if (!isManual) return;
    if (down) held.add(key);
    else held.delete(key);
    manualInput = readHeld();
  }

  $effect(() => {
    manualInput = isManual ? readHeld() : null;
    if (!isManual) held.clear();
  });

  // ── Camera ──────────────────────────────────────────────────────────
  let controls = $state<CameraControls | null>(null);

  /** The colour the floor fades into, and the foot of the backdrop. */
  const BACKDROP = "#0b0e15";

  /**
   * A studio backdrop, as a one-pixel-wide gradient.
   *
   * A flat scene colour leaves everything above the floor as a black void,
   * which reads as a missing render rather than as a room. The bottom of the
   * ramp matches the fog so the floor runs out into it without a seam.
   */
  function makeBackdrop(): THREE.Texture {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 256;
    const ctx = canvas.getContext("2d")!;
    const ramp = ctx.createLinearGradient(0, 0, 0, 256);
    ramp.addColorStop(0, "#1b2436");
    ramp.addColorStop(0.55, "#121826");
    ramp.addColorStop(1, BACKDROP);
    ctx.fillStyle = ramp;
    ctx.fillRect(0, 0, 1, 256);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  const backdrop = makeBackdrop();

  /**
   * Put the camera on the vantage, relative to wherever the character is.
   *
   * Both the eye and the target are pinned, rather than moving the target and
   * letting camera-controls carry the eye along by its stored offset. That
   * offset drifts the moment anything else touches the camera, and a follow
   * rig whose distance quietly grows turns the character into a speck without
   * ever looking broken. Following is a locked rig; turn it off to orbit.
   */
  function frame(x: number, z: number, animate: boolean): void {
    const [ex, ey, ez] = vantage.eye;
    controls?.setLookAt(x + ex, ey, z + ez, x, vantage.height, z, animate);
  }

  // Re-aim whenever the vantage changes; following alone only moves the
  // target, which would leave a newly chosen angle unapplied.
  $effect(() => {
    void vantageId;
    void follow;
    // Untracked: this effect exists to re-aim when the vantage changes, and it
    // animates. Letting it see the walker's position would re-run it every
    // frame, and an ease restarted sixty times a second never arrives - the
    // camera trails further and further behind until the character is a speck.
    const at = untrack(() => (follow ? [walk.x, walk.z] : [0, 0]));
    frame(at[0]!, at[1]!, true);
  });

  // Keep the address bar on the current case, so the link in the bar is
  // always the link that reproduces what is on screen. `onMount` can still
  // beat SvelteKit's router during a direct page load, so the navigation
  // lifecycle is the point that earns permission to update its history.
  let routed = $state(false);

  afterNavigate(() => {
    routed = true;
  });

  $effect(() => {
    const next = new URLSearchParams({
      pattern: patternId,
      rig: String(avatarId),
      speed: speed.toFixed(2),
      distance: markDistance.toFixed(2),
      steps: String(markSteps),
      camera: vantageId,
      plant: planting ? "on" : "off",
      bpm: String(tempoBpm),
      schedule: timingSchedule,
      departure: String(departureBeat),
    });
    if (routed) goto(`?${next}`, { shallow: true, replace: true });
  });

  /**
   * What is actually in the scene, from the console.
   *
   * The readout measures joints, so it keeps reporting sensible numbers while
   * the mesh those joints drive is invisible or collapsed - which is exactly
   * the case that costs the most time to diagnose from a screenshot. This
   * reports the two halves separately: where the camera is, and what every
   * skinned mesh's world bounds and bone count actually are.
   */
  function inspect(): unknown {
    const camera = controls?.camera;
    if (!camera) return { controls: false };

    const eye = new THREE.Vector3();
    const at = new THREE.Vector3();
    controls!.getPosition(eye);
    controls!.getTarget(at);

    let root: THREE.Object3D = camera;
    while (root.parent) root = root.parent;

    const round = (v: THREE.Vector3) => [
      +v.x.toFixed(3),
      +v.y.toFixed(3),
      +v.z.toFixed(3),
    ];
    const precise = (v: THREE.Vector3) => [
      +v.x.toFixed(6),
      +v.y.toFixed(6),
      +v.z.toFixed(6),
    ];
    // Box3.setFromObject reads the bind-pose geometry through the node's own
    // matrix, so on a skinned mesh it reports a T-pose that is nowhere near
    // what is on screen. Bone world positions are the only honest answer.
    const where = new THREE.Vector3();
    const of = (bone: THREE.Object3D | undefined) =>
      bone ? precise(bone.getWorldPosition(where)) : null;
    const named = (bones: THREE.Bone[], suffix: string) =>
      bones.find((b) => b.name.endsWith(suffix));

    const meshes: unknown[] = [];
    let bones = 0;
    root.traverse((node) => {
      if ((node as THREE.Bone).isBone) bones++;
      const mesh = node as THREE.SkinnedMesh;
      if (!mesh.isSkinnedMesh) return;
      const rigged = mesh.skeleton?.bones ?? [];
      meshes.push({
        name: mesh.name || "(unnamed)",
        visible: mesh.visible,
        bones: rigged.length,
        node: round(mesh.getWorldPosition(where)),
        hips: of(named(rigged, "Hips")),
        leftFoot: of(named(rigged, "LeftFoot")),
        leftToe: of(named(rigged, "LeftToeBase")),
        rightFoot: of(named(rigged, "RightFoot")),
        rightToe: of(named(rigged, "RightToeBase")),
        head: of(named(rigged, "Head")),
      });
    });

    return {
      eye: round(eye),
      target: round(at),
      walk: {
        x: +walk.x.toFixed(6),
        z: +walk.z.toFixed(6),
        phase: walk.phase,
        completedSteps: walk.completedSteps ?? null,
        plannedSteps: walk.plannedSteps ?? null,
        endpointError: +(walk.endpointError ?? 0).toFixed(6),
        timing: walk.timing ?? null,
      },
      gaitClock,
      heightCm: userProportionsState.heightCm,
      groundY: +userProportionsState.groundY.toFixed(3),
      groundOffset: +groundOffset.toFixed(3),
      bonesInScene: bones,
      meshes,
    };
  }

  onMount(() => {
    (window as unknown as { __walkLab?: () => unknown }).__walkLab = inspect;
    gaitProbeState.enable();
    (
      window as unknown as { __tkaLoadProgress?: (p: number) => void }
    ).__tkaLoadProgress?.(100);
  });

  onMount(() => {
    const query = window.matchMedia("(max-width: 1024px), (max-height: 600px)");
    const update = () => (compactProbe = query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  });

  onDestroy(() => {
    gaitProbeState.disable();
  });

  const facingDegrees = $derived(
    ((((walk.facing * 180) / Math.PI) % 360) + 360) % 360
  );
  const localHeading = $derived(
    ((((Math.atan2(walk.direction.x, walk.direction.z) * 180) / Math.PI) %
      360) +
      360) %
      360
  );
</script>

<svelte:head>
  <title>Walk lab</title>
  <meta
    name="description"
    content="One performer walking every way there is, measured frame by frame."
  />
</svelte:head>

<svelte:window
  onkeydown={(e) => onKey(e, true)}
  onkeyup={(e) => onKey(e, false)}
/>

<main
  class="lab walk-lab"
  data-terminal-status={gaitClock?.terminal?.status ?? "none"}
  data-terminal-foot={gaitClock?.terminal?.foot ?? "none"}
  data-terminal-distance={activeTerminalStepPlan?.remainingDistance ?? -1}
  data-terminal-start-step={activeTerminalStepPlan?.startAtGaitStep ?? -1}
  data-gait-step={gaitClock?.step ?? -1}
  data-gait-distance-step={gaitClock?.distanceStep ?? -1}
  data-gait-cadence={gaitClock?.cadence ?? -1}
  data-gait-tier={gaitClock?.tier ?? -1}
>
  <div class="stage">
    <Canvas shadows>
      <T.PerspectiveCamera makeDefault position={[3.4, 1.5, 0]} fov={45}>
        <OrbitControls
          bind:ref={controls}
          minDistance={0.4}
          maxDistance={18}
          maxPolarAngle={Math.PI / 2}
        />
      </T.PerspectiveCamera>

      <T is={backdrop} attach="background" />
      <!-- Far enough out that the grid stays readable, near enough that the
           floor's own edge never shows as a horizon line. -->
      <T.Fog attach="fog" args={[BACKDROP, 14, 42]} />

      <T.HemisphereLight
        intensity={0.9}
        groundColor="#20242e"
        skyColor="#c8d6f0"
      />
      <T.DirectionalLight
        position={[4, 7, 3]}
        intensity={2.4}
        castShadow
        shadow.mapSize.width={2048}
        shadow.mapSize.height={2048}
        shadow.camera.left={-8}
        shadow.camera.right={8}
        shadow.camera.top={8}
        shadow.camera.bottom={-8}
        shadow.bias={-0.0005}
      />
      <!-- Opposite the key, so the leg on the far side is still a leg rather
           than a silhouette. Ankles are the thing being watched here. -->
      <T.DirectionalLight position={[-5, 3, -4]} intensity={0.6} />

      <T.Mesh rotation.x={-Math.PI / 2} receiveShadow>
        <T.PlaneGeometry args={[60, 60]} />
        <T.MeshStandardMaterial color="#161a24" roughness={0.95} />
      </T.Mesh>
      <!-- A metre grid, so a step length is readable off the floor without
           waiting for the instrument to average one. -->
      <T.GridHelper args={[40, 40, "#3d4a63", "#232a38"]} position.y={0.002} />

      {#if avatarState}
        <!-- Keyed: swapping the model on a live rig leaves the old skeleton
             bound and the new mesh either collapsed or invisible. A remount
             costs a reload of one GLB and is the only way the picker works. -->
        {#key avatarId}
          <PerformerRig
            position={rigPosition}
            {groundOffset}
            facingAngle={walk.facing}
            planeMode={PlaneMode.WALL}
            {avatarState}
            {avatarId}
            showGrid={false}
            showProps={false}
            showEffects={false}
            visiblePlanes={NO_PLANES}
            enableLocomotion={true}
            enableFootPlanting={planting}
            isMoving={walk.isMoving}
            moveSpeed={walk.speed}
            moveDirection={walk.direction}
            {lateralGait}
            turnRequestOverride={walk.turnRequest ?? null}
            terminalStepPlan={activeTerminalStepPlan}
            {gaitTimingSample}
            locomotionResetKey={resetNonce}
            onGaitClock={(clock) => (gaitClock = clock)}
          />
        {/key}
      {/if}

      <WalkDriver
        {pattern}
        {speed}
        {running}
        manual={manualInput}
        {destinationPlan}
        {gaitTimingPlan}
        {gaitClock}
        {resetNonce}
        onDepartureStep={(step) => (departureGaitStep = step)}
        onGaitTimingSample={(sample) => (gaitTimingSample = sample)}
        onState={(state) => {
          walk = state;
          // Straight to the controls rather than through a reactive `target`
          // prop: that path animates every set, so re-aiming at 60fps restarts
          // the ease every frame and the camera never arrives. Untransitioned
          // here, camera-controls keeps the spherical offset, which is a
          // follow cam that can still be orbited by hand.
          if (follow) frame(state.x, state.z, false);
        }}
      />

      <GaitProbe
        capacity={1800}
        recording={!isExactMark || !exactMarkArrived}
        resetKey={resetNonce}
        reportMode={isExactMark ? "latest-travel" : "buffer"}
        arrivalWindowSeconds={isExactMark ? 0.85 : 0}
      />
    </Canvas>

    <div class="hud" aria-live="off">
      <p class="hud-phase">{walk.phase}</p>
      <p class="hud-hunts">
        {isManual
          ? "WASD to travel, arrows to turn"
          : isExactMark
            ? `${markDistance.toFixed(1)} metres in exactly ${markSteps} authored steps`
            : pattern.hunts}
      </p>
      {#if gaitTimingPlan}
        <p class="timing-score">
          Counts
          {gaitTimingPlan.footfalls
            .map((footfall) => footfall.plantBeat)
            .join(" · ")}
        </p>
      {/if}
      <dl class="hud-grid">
        <div>
          <dt>speed</dt>
          <dd>{walk.speed.toFixed(2)} m/s</dd>
        </div>
        <div>
          <dt>facing</dt>
          <dd>{facingDegrees.toFixed(0)}&deg;</dd>
        </div>
        {#if isExactMark}
          <div>
            <dt>step length</dt>
            <dd>{((destinationPlan?.stepLength ?? 0) * 100).toFixed(1)} cm</dd>
          </div>
        {:else}
          <div>
            <dt>travel</dt>
            <dd>{localHeading.toFixed(0)}&deg; local</dd>
          </div>
        {/if}
        <div>
          <dt>covered</dt>
          <dd>{walk.travelled.toFixed(1)} m</dd>
        </div>
        <div>
          <dt>gait</dt>
          <dd>{gaitTierLabel}</dd>
        </div>
        {#if isExactMark}
          <div>
            <dt>authored steps</dt>
            <dd>{(walk.completedSteps ?? 0).toFixed(2)} / {markSteps}</dd>
          </div>
          <div>
            <dt>mark error</dt>
            <dd>
              {((walk.endpointError ?? markDistance) * 100).toFixed(1)} cm
            </dd>
          </div>
          <div>
            <dt>next plant</dt>
            <dd>
              {walk.timing?.nextPlantBeat === null
                ? "settling"
                : (walk.timing?.nextPlantBeat ??
                  gaitTimingPlan?.footfalls[0]?.plantBeat)}
            </dd>
          </div>
          <div>
            <dt>timing error</dt>
            <dd>
              {walk.timing?.latestErrorMilliseconds === null ||
              walk.timing?.latestErrorMilliseconds === undefined
                ? "waiting"
                : `${walk.timing.latestErrorMilliseconds >= 0 ? "+" : ""}${walk.timing.latestErrorMilliseconds.toFixed(0)} ms`}
            </dd>
          </div>
          <div>
            <dt>worst timing</dt>
            <dd>{(walk.timing?.maxErrorMilliseconds ?? 0).toFixed(0)} ms</dd>
          </div>
        {/if}
      </dl>
    </div>

    {#key compactProbe}
      <GaitOverlay
        collapsed={compactProbe}
        showArrival={isExactMark}
        maneuver={gaitManeuver}
      />
    {/key}
  </div>

  <div class="deck">
    <div class="row patterns">
      <SegmentedControl
        options={PATTERN_OPTIONS}
        value={patternId}
        onchange={(value) => {
          patternId = value;
          running = value !== EXACT_MARK;
          resetNonce += 1;
        }}
        size="sm"
        ariaLabel="Way of walking"
      />
    </div>

    <div class="row settings">
      {#if isExactMark}
        <label class="slider">
          <span class="slider-label">Destination</span>
          <input
            type="range"
            min="2"
            max="8"
            step="0.25"
            value={markDistance}
            onchange={(event) => {
              const distance = Number(event.currentTarget.value);
              markDistance = distance;
              markSteps = clampExactSteps(distance, markSteps);
              running = false;
              resetNonce += 1;
            }}
            aria-label="Destination distance in metres"
          />
          <output>{markDistance.toFixed(2)} m</output>
        </label>

        <label class="slider">
          <span class="slider-label">Exact steps</span>
          <input
            type="range"
            min={exactSteps.min}
            max={exactSteps.max}
            step="1"
            value={markSteps}
            onchange={(event) => {
              markSteps = Number(event.currentTarget.value);
              running = false;
              resetNonce += 1;
            }}
            aria-label="Exact authored step count"
          />
          <output>{markSteps}</output>
        </label>

        <div class="group">
          <span class="group-label" id="walk-lab-tempo">Tempo</span>
          <SegmentedControl
            options={TEMPO_OPTIONS.map((tempo) => ({
              value: String(tempo),
              label: `${tempo}`,
              ariaLabel: `${tempo} beats per minute`,
            }))}
            value={String(tempoBpm)}
            onchange={(value) => {
              tempoBpm = Number(value);
              running = false;
              resetNonce += 1;
            }}
            size="sm"
            ariaLabelledby="walk-lab-tempo"
          />
        </div>

        <div class="group">
          <span class="group-label" id="walk-lab-rhythm">Rhythm</span>
          <SegmentedControl
            options={[
              { value: "even", label: "Even" },
              {
                value: "hold-middle",
                label: "Held middle",
                ariaLabel: "Hold one extra count in the middle",
              },
            ]}
            value={timingSchedule}
            onchange={(value) => {
              timingSchedule = value as CountedGaitSchedule;
              running = false;
              resetNonce += 1;
            }}
            size="sm"
            ariaLabelledby="walk-lab-rhythm"
          />
        </div>

        <div class="group">
          <span class="group-label" id="walk-lab-departure">Depart</span>
          <SegmentedControl
            options={[0, 1, 2, 4].map((beat) => ({
              value: String(beat),
              label: String(beat),
              ariaLabel: `Depart on count ${beat}`,
            }))}
            value={String(departureBeat)}
            onchange={(value) => {
              departureBeat = Number(value);
              running = false;
              resetNonce += 1;
            }}
            size="sm"
            ariaLabelledby="walk-lab-departure"
          />
        </div>
      {:else}
        <label class="slider">
          <span class="slider-label">Speed</span>
          <!-- The top of the range has to clear the run tier's crossover
               (the walk clip's 1.52 m/s x 1.15, up to the run clip's 3.10 m/s
               x 0.8) or this page cannot show the gait it is here to judge.
               4 m/s puts the far end squarely in a run. -->
          <input
            type="range"
            min="0.15"
            max="4"
            step="0.05"
            bind:value={speed}
            aria-label="Commanded ground speed in metres per second"
          />
          <output>{speed.toFixed(2)} m/s</output>
        </label>
      {/if}

      <div class="group">
        <span class="group-label" id="walk-lab-rig">Rig</span>
        <SegmentedControl
          options={AVATAR_OPTIONS}
          value={avatarId}
          onchange={(value) => {
            avatarId = value;
            gaitClock = null;
            if (isExactMark) running = false;
            resetNonce += 1;
          }}
          size="sm"
          ariaLabelledby="walk-lab-rig"
        />
      </div>

      <div class="group">
        <span class="group-label" id="walk-lab-planting">Planting</span>
        <SegmentedControl
          options={[
            { value: "on", label: "On" },
            { value: "off", label: "Off" },
          ]}
          value={planting ? "on" : "off"}
          onchange={(value) => (planting = value === "on")}
          size="sm"
          ariaLabelledby="walk-lab-planting"
        />
      </div>

      <div class="group">
        <span class="group-label" id="walk-lab-camera">Camera</span>
        <SegmentedControl
          options={VANTAGES.map((v) => ({
            value: v.id,
            label: v.label,
            shortLabel:
              v.id === "quarter"
                ? "3/4"
                : v.id === "overhead"
                  ? "Top"
                  : v.label,
          }))}
          value={vantageId}
          onchange={(value) => (vantageId = value)}
          size="sm"
          ariaLabelledby="walk-lab-camera"
        />
      </div>

      <div class="actions">
        <button
          type="button"
          class="action primary"
          aria-pressed={running}
          onclick={() => (running = !running)}
        >
          {running ? "Pause" : "Play"}
        </button>
        <button
          type="button"
          class="action"
          aria-pressed={follow}
          onclick={() => (follow = !follow)}
        >
          {follow ? "Following" : "Fixed camera"}
        </button>
        <button
          type="button"
          class="action"
          onclick={() => {
            if (isExactMark) running = false;
            resetNonce += 1;
            frame(0, 0, true);
          }}
        >
          Recentre
        </button>
      </div>
    </div>
  </div>
</main>

<style>
  /*
   * Every measure below is in rem, so this one rule is the whole 4K story:
   * the root grows continuously from 1680 to 3840 and the readout, the deck
   * and the pattern bar grow with it in lockstep. Scoped with :has so it
   * cannot follow the stylesheet out of this route.
   */
  :global(html:has(.walk-lab)) {
    font-size: clamp(16px, calc(16px + (100vw - 1680px) * 8 / 2160), 24px);
  }

  .lab {
    position: fixed;
    inset: 0;
    display: grid;
    grid-template-rows: 1fr auto;
    background: #0a0d14;
    color: #e8edf5;
    font-family:
      system-ui,
      -apple-system,
      sans-serif;
  }

  .stage {
    position: relative;
    min-height: 0;
    overflow: hidden;
  }

  .hud {
    position: absolute;
    top: 1rem;
    left: 1rem;
    max-width: 22rem;
    padding: 0.75rem 1rem;
    border-radius: 0.75rem;
    background: rgba(10, 13, 20, 0.78);
    border: 1px solid rgba(255, 255, 255, 0.09);
    backdrop-filter: blur(8px);
    pointer-events: none;
  }

  .hud-phase {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 650;
    letter-spacing: -0.01em;
  }

  .hud-hunts {
    margin: 0.15rem 0 0.6rem;
    font-size: 0.8125rem;
    line-height: 1.35;
    color: #97a3b6;
  }

  .timing-score {
    margin: -0.25rem 0 0.65rem;
    color: #77b7ff;
    font-size: 0.75rem;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.025em;
  }

  .hud-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.35rem 1rem;
    margin: 0;
  }

  .hud-grid dt {
    font-size: 0.6875rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #7b879a;
  }

  .hud-grid dd {
    margin: 0;
    font-size: 0.9375rem;
    /* The numbers change every frame; without this the labels beside them
       shuffle sideways all the way through a walk. */
    font-variant-numeric: tabular-nums;
  }

  .deck {
    display: flex;
    flex-direction: column;
    /* A grid item's automatic minimum is its content, and the pattern strip
       is deliberately wider than a phone. Without this the deck drags the
       whole shell out past the viewport instead of letting the strip
       scroll inside it. */
    min-width: 0;
    gap: 0.6rem;
    padding: 0.85rem 1.1rem 1rem;
    background: #0d111a;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }

  .row {
    display: flex;
    align-items: center;
    gap: 1.25rem;
  }

  /* Eleven ways of walking do not fit a phone, and dropping some of them
     would take the seam-hunting patterns off the small screen first. */
  .patterns {
    /* `safe` matters here: a plain centred flex container that overflows
       spills past BOTH edges, and the half hidden off the left cannot be
       scrolled back into view. Safe centring falls back to flex-start the
       moment the strip stops fitting. */
    justify-content: safe center;
    overflow-x: auto;
    /* Without this the strip refuses to shrink below its content, so the
       whole deck grows past the viewport and the PAGE scrolls sideways
       instead of the strip. */
    min-width: 0;
    padding-bottom: 0.15rem;
  }

  /* SegmentedControl is `width: 100%` by default, which on a 3840 screen
     spreads eleven short words into a progress bar. Sized to its labels and
     centred instead, it stays a picker at every width and still scrolls
     rather than shrinking when the screen is narrower than the words. */
  .patterns :global(> *) {
    flex: 0 0 auto;
    width: auto;
    min-width: max-content;
  }

  /* The options divide the control's width evenly and the indicator is
     positioned on that assumption, so every option is floored at the width
     of the longest label - "Forward, then backward", 8.2rem of text inside
     1.4rem of padding. Below that they clip their own words. */
  .patterns :global(button) {
    min-width: 9.75rem;
    white-space: nowrap;
  }

  .settings {
    flex-wrap: wrap;
    gap: 0.85rem 1.5rem;
  }

  .group,
  .slider {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }

  .group-label,
  .slider-label {
    font-size: 0.6875rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #7b879a;
  }

  .slider input {
    width: 11rem;
    accent-color: #5ea9ff;
  }

  .slider output {
    min-width: 5.5ch;
    font-size: 0.875rem;
    font-variant-numeric: tabular-nums;
  }

  .actions {
    display: flex;
    gap: 0.5rem;
    margin-left: auto;
  }

  .action {
    min-height: 44px;
    padding: 0 1.1rem;
    border-radius: 0.6rem;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(255, 255, 255, 0.05);
    color: #e8edf5;
    font-size: 0.875rem;
    font-weight: 560;
    cursor: pointer;
  }

  .action:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  .action.primary {
    background: #2f6fd0;
    border-color: #2f6fd0;
  }

  .action.primary:hover {
    background: #3a80e8;
  }

  /*
   * A folded phone in landscape is 412px tall. The deck costs the same
   * ~200px there as it does on a desktop, which left the walker in a 200px
   * letterbox - the one thing this page exists to look at, squeezed into
   * half the screen. Floating the controls gives the stage the whole
   * viewport to frame the character in, and the tighter spacing keeps the
   * part they cover down to a strip.
   */
  @media (max-height: 560px) {
    .lab {
      grid-template-rows: 1fr;
    }

    .deck {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      gap: 0.35rem;
      padding: 0.5rem 0.75rem 0.6rem;
      background: rgba(13, 17, 26, 0.86);
      backdrop-filter: blur(10px);
    }

    .settings {
      gap: 0.4rem 1rem;
    }

    .row {
      gap: 0.75rem;
    }

    /* Same problem from the other end: the panel is anchored to the top of a
       stage the deck now floats over, so every field it gains grows it down
       toward the controls. Three columns hold the travelling readout to two
       rows instead of three, which is what keeps it clear of them. */
    .hud-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 0.3rem 0.75rem;
    }

    /* The readout anchors to the bottom of the stage, and the stage is now
       the whole viewport, so it would sit under the floating controls.
       Lifted clear of them, measured against the deck at this size. */
    .stage :global(.gait-overlay) {
      bottom: 13rem;
      max-height: calc(100% - 14rem);
    }
  }

  :global(body) {
    margin: 0;
    background: #0a0d14;
  }
</style>
