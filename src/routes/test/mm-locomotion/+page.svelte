<script lang="ts">
  /**
   * Motion-Matching Locomotion Harness (Path C)
   *
   * Minimal Threlte scene that mounts the self-loaded rig binding (avatar GLB +
   * locomotion clips), drives MmLocomotionController from a useTask loop (in the
   * MmDriver child), and exposes facing/step-back controls. Deliberately does
   * NOT use the package Viewer3DScene — this is the standalone runtime-
   * verification surface for the motion-matching controller.
   */
  import { Canvas, T } from "@threlte/core";
  import type { Object3D } from "three";
  import OrbitControls from "#lib/shared/3d/components/OrbitControls.svelte";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import { createSelfLoadedRigBinding } from "#lib/features/stage/locomotion/motion-matching/self-loaded-rig-binding.js";
  import { MmLocomotionController } from "#lib/features/stage/locomotion/motion-matching/mm-locomotion-controller.js";
  import MmDriver from "./MmDriver.svelte";

  // The rig root Object3D, set once the async load + controller init resolves.
  let rigRoot = $state<Object3D | null>(null);
  let controller = $state<MmLocomotionController | null>(null);
  let status = $state("Loading rig + clips…");

  // Facing options (degrees). Values are strings because SegmentedControl is
  // generic over `T extends string`.
  type FacingValue = "-90" | "-45" | "0" | "45" | "90";
  const facingOptions: { value: FacingValue; label: string }[] = [
    { value: "-90", label: "−90°" },
    { value: "-45", label: "−45°" },
    { value: "0", label: "0°" },
    { value: "45", label: "+45°" },
    { value: "90", label: "+90°" },
  ];
  let selectedFacing = $state<FacingValue>("0");

  let didSetup = false;

  async function setup() {
    try {
      const rig = await createSelfLoadedRigBinding(
        "/animations/locomotion-pack/X%20Bot.glb",
        [
          { clipId: "idle", url: "/animations/locomotion-pack/idle.glb" },
          { clipId: "walk-forward", url: "/animations/locomotion-pack/walk-forward.glb" },
          { clipId: "turn-left", url: "/animations/locomotion-pack/turn-left.glb" },
          { clipId: "turn-right", url: "/animations/locomotion-pack/turn-right.glb" },
        ],
      );
      const ctrl = new MmLocomotionController(rig);
      await ctrl.initialize();

      rigRoot = rig.root;
      controller = ctrl;
      status = "Ready";

      // test-only: exposed for DevTools verification in later tasks.
      if (typeof window !== "undefined") {
        (window as unknown as { __mmController?: MmLocomotionController }).__mmController = ctrl;
        (window as unknown as { __mmRig?: typeof rig }).__mmRig = rig;
      }
    } catch (err) {
      status = `Setup failed: ${err instanceof Error ? err.message : String(err)}`;
      console.error("[mm-locomotion] setup failed", err);
    }
  }

  $effect(() => {
    if (didSetup) return;
    didSetup = true;
    void setup();
  });

  function onFacingChange(value: FacingValue) {
    selectedFacing = value;
    const deg = Number(value);
    controller?.setTargetFacing((deg * Math.PI) / 180);
  }

  function onStepBack() {
    controller?.stepBackToOrigin();
  }
</script>

<svelte:head>
  <title>MM Locomotion Harness</title>
</svelte:head>

<div class="page">
  <Canvas>
    <T.PerspectiveCamera makeDefault position={[0, 1.6, 3.5]} fov={50}>
      <OrbitControls enableDamping target={[0, 1, 0]} maxPolarAngle={Math.PI / 2} />
    </T.PerspectiveCamera>

    <T.AmbientLight intensity={0.6} />
    <T.DirectionalLight position={[5, 10, 5]} intensity={1.1} />
    <T.DirectionalLight position={[-5, 5, -5]} intensity={0.3} />

    <!-- Ground plane: PlaneGeometry rotated -90° about X, neutral material. -->
    <T.Mesh rotation.x={-Math.PI / 2} receiveShadow>
      <T.PlaneGeometry args={[20, 20]} />
      <T.MeshStandardMaterial color="#2a2a33" />
    </T.Mesh>

    <!-- Render the loaded rig root (an existing THREE.Object3D) directly. -->
    {#if rigRoot}
      <T is={rigRoot} />
    {/if}

    <!-- Drive the controller from inside the Canvas so useTask has context. -->
    <MmDriver {controller} />
  </Canvas>

  <div class="panel">
    <h1>MM Locomotion</h1>
    <p class="status">{status}</p>

    <div class="field">
      <span class="field-label">Target facing</span>
      <SegmentedControl
        options={facingOptions}
        value={selectedFacing}
        onchange={onFacingChange}
        color="accent"
        size="sm"
      />
    </div>

    <button type="button" class="action" onclick={onStepBack} disabled={!controller}>
      Step back to origin
    </button>
  </div>
</div>

<style>
  .page {
    position: relative;
    width: 100%;
    height: 100vh;
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
    gap: 0.85rem;
    width: 18rem;
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

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .field-label {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    opacity: 0.6;
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
