<script lang="ts">
  /**
   * Dodge Lab — step a performer clear of a prop while the hands stay on it.
   *
   * Preset (Letter A variation 3): LH (blue) staff on the WHEEL plane sweeps the
   * sagittal plane the torso occupies (impales); RH (red) staff on the WALL plane.
   * Dodge OFF shows the impale; Dodge ON runs the analytic VacatePlanner — the
   * body steps into the open quadrant, faces grid center, turns edge-on, and the
   * hands stay pinned. The side/aggression knob art-directs which way and how far.
   *
   * The clearance readout is authoritative — it runs the StanceSimulator at the
   * avatar's live stance against the prop swept volume.
   *
   * Sibling to Collision Lab; shares StanceSimulator but keeps its own <Canvas>
   * for the live per-frame loop (Collision Lab is static-pose).
   */
  import { Canvas, T } from "@threlte/core";
  import {
    type Object3D,
    Group,
    Mesh,
    PlaneGeometry,
    MeshBasicMaterial,
    CanvasTexture,
    GridHelper,
  } from "three";
  import { Plane } from "@austencloud/scene-3d";
  import {
    MotionType,
    RotationDirection,
    Orientation,
  } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
  import { GridLocation } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import OrbitControls from "#lib/shared/3d/components/OrbitControls.svelte";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import { createSelfLoadedRigBinding } from "#lib/features/stage/locomotion/motion-matching/self-loaded-rig-binding.js";
  import { MmLocomotionController } from "#lib/features/stage/locomotion/motion-matching/mm-locomotion-controller.js";
  import type { RigBinding } from "#lib/features/stage/locomotion/motion-matching/rig-binding.js";
  import type { MotionConfig3D } from "#lib/shared/3d/domain/models/motion-data-3d.js";
  import type { DodgePlan, DodgeKnob, DodgeSide } from "#lib/features/stage/locomotion/dodge/dodge-types.js";
  import DodgeDriver from "./DodgeDriver.svelte";

  // Letter A, variation 3 (alpha1 -> alpha3), from the Flow Arts Knowledge MCP:
  //   Blue: s -> w (pro, cw)   Red: n -> e (pro, cw)
  // One plane moved to WHEEL (blue/LH) so its prop sweeps the sagittal plane the
  // torso occupies (impales); red/RH stays on WALL. (orientation IN / 0 turns are
  // the base-shift defaults.) A letter/variation/plane picker is a later follow-up.
  const leftConfig: MotionConfig3D = {
    plane: Plane.WHEEL,
    startLocation: GridLocation.SOUTH,
    endLocation: GridLocation.WEST,
    motionType: MotionType.PRO,
    rotationDirection: RotationDirection.CLOCKWISE,
    turns: 0,
    startOrientation: Orientation.IN,
    endOrientation: Orientation.IN,
    pathShape: "arc",
  };
  const rightConfig: MotionConfig3D = {
    plane: Plane.WALL,
    startLocation: GridLocation.NORTH,
    endLocation: GridLocation.EAST,
    motionType: MotionType.PRO,
    rotationDirection: RotationDirection.CLOCKWISE,
    turns: 0,
    startOrientation: Orientation.IN,
    endOrientation: Orientation.IN,
    pathShape: "arc",
  };

  let rigRoot = $state<Object3D | null>(null);
  let rig = $state<RigBinding | null>(null);
  let controller = $state<MmLocomotionController | null>(null);
  let status = $state("Loading rig + clips…");

  let dodgeOn = $state(false);
  let clearanceM = $state(0);
  let plan = $state<DodgePlan | null>(null);
  let floorGroup = $state<Group | null>(null);

  // Art-direction knob: which way the body bails + how far. Feeds the analytic
  // VacatePlanner; no per-instance hand-tuning.
  let knob = $state<DodgeKnob>({ side: "auto", aggression: 0.6 });

  const SIDE_OPTIONS: { value: DodgeSide; label: string }[] = [
    { value: "auto", label: "Auto" },
    { value: "left", label: "Left" },
    { value: "right", label: "Right" },
  ];

  let didSetup = false;

  /** A flat floor label (number / compass letter) readable from a top-down view.
   *  The plane lies face-up (rotation.x = -π/2); seen from above with north away
   *  that maps the glyph's right edge to world +X and its top to world -Z, so the
   *  glyph renders rotated 180°. Pre-rotate the glyph 180° on the canvas (scale
   *  x AND y by -1) so it reads upright from a top-down, north-up view. */
  function makeFloorLabel(text: string, color: string, size: number, x: number, z: number): Mesh {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 128;
    const ctx = cv.getContext("2d")!;
    ctx.fillStyle = color;
    ctx.font = "bold 92px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.translate(cv.width, cv.height);
    ctx.scale(-1, -1);
    ctx.fillText(text, cv.width / 2, cv.height / 2);
    const tex = new CanvasTexture(cv);
    const m = new Mesh(
      new PlaneGeometry(size, size),
      new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
    );
    m.rotation.x = -Math.PI / 2; // lie flat on the floor, facing up
    m.position.set(x, 0.02, z);
    return m;
  }

  /** Numbered quadrant reference + N/E/S/W facing marks on the floor. Quadrants:
   *  1 = +X/+Z, 2 = -X/+Z, 3 = -X/-Z, 4 = +X/-Z. Cardinal axes follow the
   *  canonical FLOOR-plane mapping (plane-transforms.ts): N = +Z, S = -Z,
   *  E = -X, W = +X — so the rose reads clockwise N→E→S→W from above. */
  function buildFloorReference(): Group {
    const g = new Group();
    const grid = new GridHelper(4, 8, 0x55556a, 0x2c2c3a);
    grid.position.y = 0.005;
    g.add(grid);
    const quads: { n: string; x: number; z: number }[] = [
      { n: "1", x: 1.2, z: 1.2 },
      { n: "2", x: -1.2, z: 1.2 },
      { n: "3", x: -1.2, z: -1.2 },
      { n: "4", x: 1.2, z: -1.2 },
    ];
    for (const q of quads) g.add(makeFloorLabel(q.n, "#7dd3fc", 0.55, q.x, q.z));
    const comp: { t: string; x: number; z: number }[] = [
      { t: "N", x: 0, z: 2 },
      { t: "S", x: 0, z: -2 },
      { t: "E", x: -2, z: 0 },
      { t: "W", x: 2, z: 0 },
    ];
    for (const c of comp) g.add(makeFloorLabel(c.t, "#fbbf24", 0.4, c.x, c.z));
    return g;
  }

  async function setup() {
    try {
      const loaded = await createSelfLoadedRigBinding(
        "/animations/locomotion-pack/X%20Bot.glb",
        [
          { clipId: "idle", url: "/animations/locomotion-pack/idle.glb" },
          { clipId: "walk-forward", url: "/animations/locomotion-pack/walk-forward.glb" },
          { clipId: "turn-left", url: "/animations/locomotion-pack/turn-left.glb" },
          { clipId: "turn-right", url: "/animations/locomotion-pack/turn-right.glb" },
        ],
      );
      const ctrl = new MmLocomotionController(loaded);
      await ctrl.initialize();

      rigRoot = loaded.root;
      rig = loaded;
      controller = ctrl;
      status = "Ready";

      if (typeof window !== "undefined") {
        (window as unknown as { __dodgeController?: MmLocomotionController }).__dodgeController = ctrl;
        (window as unknown as { __dodgeRig?: RigBinding }).__dodgeRig = loaded;
      }
    } catch (err) {
      status = `Setup failed: ${err instanceof Error ? err.message : String(err)}`;
      console.error("[dodge] setup failed", err);
    }
  }

  $effect(() => {
    if (didSetup) return;
    didSetup = true;
    floorGroup = buildFloorReference();
    void setup();
  });

  function onClearance(c: number, p: DodgePlan | null) {
    clearanceM = c;
    plan = p;
  }

  function toggleDodge() {
    dodgeOn = !dodgeOn;
  }

  async function copyDiagnostic() {
    const payload = {
      leftConfig,
      rightConfig,
      knob,
      plan: plan && {
        knob: plan.knob,
        worstBodyDepth: plan.worstBodyDepth,
        feasible: plan.feasible,
        placement: plan.placement(0.5),
      },
      liveClearanceM: clearanceM,
      dodgeOn,
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      status = "Diagnostic copied";
    } catch {
      status = "Clipboard blocked — see console";
      console.log("[dodge] diagnostic", payload);
    }
  }

  const clearanceCm = $derived((clearanceM * 100).toFixed(1));
  // Within 1cm of the conservative collision shell counts as clear — a sub-cm
  // graze of the 12cm torso sphere means the prop is ~11cm off the actual spine.
  const cleared = $derived(clearanceM >= -0.01);
  const planFoot = $derived(plan ? plan.placement(0.5) : null);
</script>

<div class="page">
  <Canvas>
    <T.PerspectiveCamera makeDefault position={[2.4, 1.6, 3.2]} fov={50}>
      <OrbitControls enableDamping target={[0, 1, 0]} maxPolarAngle={Math.PI / 2} />
    </T.PerspectiveCamera>

    <T.AmbientLight intensity={0.6} />
    <T.DirectionalLight position={[5, 10, 5]} intensity={1.1} />
    <T.DirectionalLight position={[-5, 5, -5]} intensity={0.3} />

    <T.Mesh rotation.x={-Math.PI / 2} receiveShadow>
      <T.PlaneGeometry args={[20, 20]} />
      <T.MeshStandardMaterial color="#2a2a33" />
    </T.Mesh>

    {#if floorGroup}
      <T is={floorGroup} />
    {/if}

    {#if rigRoot}
      <T is={rigRoot} />
    {/if}

    <DodgeDriver
      {controller}
      {rig}
      {leftConfig}
      {rightConfig}
      {dodgeOn}
      {knob}
      {onClearance}
    />
  </Canvas>

  <div class="panel">
    <h1>Prop Dodge</h1>
    <p class="status">{status}</p>

    <button
      type="button"
      class="toggle"
      class:on={dodgeOn}
      aria-pressed={dodgeOn}
      onclick={toggleDodge}
      disabled={!controller}
    >
      <span class="dot" class:on={dodgeOn}></span>
      Dodge {dodgeOn ? "ON" : "OFF"}
    </button>

    {#if dodgeOn}
      <div class="knob">
        <span class="slabel">Dodge side</span>
        <SegmentedControl
          options={SIDE_OPTIONS}
          value={knob.side}
          size="sm"
          color="accent"
          onchange={(v) => (knob = { ...knob, side: v })}
        />
        <label class="slider">
          <span class="slabel">Aggression <b>{(knob.aggression * 100).toFixed(0)}%</b></span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={knob.aggression}
            oninput={(e) => (knob = { ...knob, aggression: +e.currentTarget.value })}
          />
        </label>
      </div>
    {/if}

    <div class="readout" class:clear={cleared} class:hit={!cleared}>
      <span class="readout-label">Body clearance</span>
      <span class="readout-value">{clearanceM > 0 ? "+" : ""}{clearanceCm} cm</span>
      <span class="readout-state">{cleared ? "clear" : "IMPALED"}</span>
    </div>

    {#if planFoot}
      <p class="solved">
        step ({planFoot.footOffsetX.toFixed(2)}, {planFoot.footOffsetZ.toFixed(2)})
        · yaw {((planFoot.rootYawRad * 180) / Math.PI).toFixed(0)}°
        · twist {((planFoot.torsoTwistRad * 180) / Math.PI).toFixed(0)}°
        · {plan?.feasible ? "feasible" : "best-effort"}
      </p>
    {/if}

    <button type="button" class="action" onclick={copyDiagnostic} disabled={!plan}>
      Copy Diagnostic
    </button>
  </div>
</div>

<style>
  .page {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: #14141c;
  }

  .panel {
    position: absolute;
    top: 1rem;
    left: 1rem;
    z-index: 10;
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
    width: 19rem;
    max-width: calc(100vw - 2rem);
    padding: 1rem 1.1rem;
    border-radius: 12px;
    background: rgba(18, 18, 26, 0.78);
    backdrop-filter: blur(8px);
    border: 1px solid rgba(255, 255, 255, 0.08);
    color: #e8e8f0;
  }

  .panel h1 {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 600;
  }

  .status {
    margin: 0;
    font-size: 0.8rem;
    opacity: 0.7;
    font-variant-numeric: tabular-nums;
  }

  .toggle {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    min-height: 44px;
    padding: 0.55rem 0.9rem;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(255, 255, 255, 0.06);
    color: #e8e8f0;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 120ms ease;
  }

  .toggle.on {
    background: rgba(34, 197, 94, 0.18);
    border-color: rgba(34, 197, 94, 0.5);
  }

  .toggle:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #555;
    transition: background 120ms ease;
  }

  .dot.on {
    background: #22c55e;
  }

  .knob {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.2rem 0;
  }

  .readout {
    display: grid;
    grid-template-columns: 1fr auto;
    grid-template-areas: "label state" "value value";
    gap: 0.15rem 0.5rem;
    padding: 0.6rem 0.75rem;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .readout.clear {
    background: rgba(34, 197, 94, 0.1);
  }

  .readout.hit {
    background: rgba(239, 68, 68, 0.12);
  }

  .readout-label {
    grid-area: label;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    opacity: 0.6;
  }

  .readout-state {
    grid-area: state;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.04em;
  }

  .readout.clear .readout-state {
    color: #22c55e;
  }

  .readout.hit .readout-state {
    color: #ef4444;
  }

  .readout-value {
    grid-area: value;
    font-size: 1.3rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    /* Reserve width for the widest value (-99.9 cm) so the sign flip does not
       shift the row — see no-layout-shift rule. */
    min-width: 6ch;
  }

  .solved {
    margin: 0;
    font-size: 0.72rem;
    opacity: 0.7;
    font-variant-numeric: tabular-nums;
  }

  .slider {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .slabel {
    display: flex;
    justify-content: space-between;
    font-size: 0.72rem;
    opacity: 0.8;
  }

  .slabel b {
    color: #7dd3fc;
    font-variant-numeric: tabular-nums;
  }

  .slider input[type="range"] {
    width: 100%;
    accent-color: #22c55e;
  }

  .action {
    min-height: 44px;
    padding: 0.55rem 0.9rem;
    border-radius: 8px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(255, 255, 255, 0.06);
    color: #e8e8f0;
    font-size: 0.85rem;
    font-weight: 500;
    cursor: pointer;
    transition: background 120ms ease;
  }

  .action:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.12);
  }

  .action:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>
