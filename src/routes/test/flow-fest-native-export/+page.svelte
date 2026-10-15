<script lang="ts">
  import { onMount, tick } from "svelte";
  import { Canvas, T } from "@threlte/core";
  import CanvasLifecycle from "#lib/shared/3d/components/CanvasLifecycle.svelte";
  import { DEPLOYED_CHARACTER_IDS } from "#lib/shared/3d/config/deployed-characters.js";
  import type { CharacterId } from "#lib/shared/3d/domain/character-model.js";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import {
    FLOW_FEST_PERFORMER_PROFILES,
    flowFestSequenceForPerformer,
    generateFlowFestPerformerPool,
    type FlowFestPerformerRole,
    type FlowFestPerformerSequencePool,
  } from "../flow-fest-sim/flow-fest-performer-sequences.js";
  import NativeCaptureScene from "./NativeCaptureScene.svelte";
  import NativeRideScene from "./NativeRideScene.svelte";

  const roles = Object.keys(
    FLOW_FEST_PERFORMER_PROFILES
  ) as FlowFestPerformerRole[];
  let pool = $state<FlowFestPerformerSequencePool | null>(null);
  let sequenceSnapshots = $state<Partial<Record<FlowFestPerformerRole, SequenceData>>>({});
  let character = $state<CharacterId>(DEPLOYED_CHARACTER_IDS[0]!);
  let role = $state<FlowFestPerformerRole>(roles[0]!);
  let sceneKey = $state(0);
  let readyKey = $state(-1);
  let scene = $state<NativeCaptureScene>();
  let rideScene = $state<NativeRideScene>();
  let mode = $state<"perform" | "ride">("perform");
  let busy = false;
  let status = $state("Generating production LOOP snapshot…");

  function sequenceForRole(nextRole: FlowFestPerformerRole): SequenceData {
    const snapshot = sequenceSnapshots[nextRole];
    if (snapshot) return snapshot;
    if (!pool) throw new Error("Production LOOP snapshot is unavailable");
    return flowFestSequenceForPerformer(pool, nextRole);
  }

  function setSequenceSnapshots(snapshots: Partial<Record<FlowFestPerformerRole, SequenceData>>): void {
    for (const nextRole of roles)
      if (!snapshots[nextRole]?.steps.length)
        throw new Error(`Missing preserved ${nextRole} sequence`);
    sequenceSnapshots = snapshots;
  }

  async function waitReady(key: number): Promise<void> {
    const deadline = performance.now() + 45_000;
    while (
      readyKey !== key ||
      (mode === "perform" ? !scene?.hasRenderedRig() : !rideScene)
    ) {
      if (performance.now() > deadline)
        throw new Error(`Rig ${character} did not become ready`);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  async function captureOne(
    nextCharacter: CharacterId,
    nextRole: FlowFestPerformerRole
  ) {
    if (busy) throw new Error("Capture already running");
    if (!pool || pool.sources.some((source) => source !== "generated"))
      throw new Error(
        "Production LOOP snapshot is unavailable; refusing placeholder motion"
      );
    if (
      !DEPLOYED_CHARACTER_IDS.includes(nextCharacter) ||
      !roles.includes(nextRole)
    )
      throw new Error("Unknown deployed rig or Flow Fest profile");
    busy = true;
    try {
      mode = "perform";
      character = nextCharacter;
      role = nextRole;
      sceneKey += 1;
      const key = sceneKey;
      status = `Loading ${character} / ${role}`;
      await tick();
      await waitReady(key);
      if (!scene) throw new Error("Performer capture scene is not mounted");
      scene.pauseAutoLoop();
      const sequence = sequenceForRole(role);
      const frames = [];
      for (let frame = 0; frame < sequence.steps.length * 30; frame += 1) {
        frames.push(await scene.sampleFrame(frame));
        if (frame % 30 === 0)
          status = `${character} / ${role}: ${frame}/${sequence.steps.length * 30}`;
      }
      status = `Captured ${character} / ${role}`;
      return {
        schema: "flow-fest-native-performance-v1",
        source: "LiveSequencePerformer3D production generator",
        character,
        role,
        propType: FLOW_FEST_PERFORMER_PROFILES[role].propType,
        effectId: FLOW_FEST_PERFORMER_PROFILES[role].effectId,
        fps: 30,
        scoreUnitsPerSecond: 1,
        scoreSteps: sequence.steps.length,
        sequence,
        coordinateSystem:
          "Three.js: meters, +Y up; bone TRS is local to parent; performer and prop TRS are world-space",
        propTransform:
          "correctionWorld includes post-IK grip correction; renderedMeshes records each actual final mesh world TRS, including intrinsic GLB orientation and scale",
        frames,
      };
    } finally {
      busy = false;
    }
  }

  async function captureRide(nextCharacter: CharacterId) {
    if (busy) throw new Error("Capture already running");
    if (!DEPLOYED_CHARACTER_IDS.includes(nextCharacter))
      throw new Error("Unknown deployed rig");
    busy = true;
    try {
      mode = "ride";
      character = nextCharacter;
      sceneKey += 1;
      const key = sceneKey;
      status = `Loading mounted ${character}`;
      await tick();
      await waitReady(key);
      if (!rideScene) throw new Error("Mounted capture scene is not mounted");
      rideScene.pauseAutoLoop();
      const frames = [];
      for (let frame = 0; frame < 30; frame += 1) {
        frames.push(await rideScene.sampleFrame(frame));
      }
      status = `Captured mounted ${character}`;
      return {
        schema: "flow-fest-native-mounted-v1",
        source: "Avatar3D + FlowFestEucMountedPoseRig production solver",
        character,
        fps: 30,
        coordinateSystem:
          "Three.js: meters, +Y up; bone TRS is local to parent; performer and pedal TRS are world-space",
        rideState:
          "neutral, stationary, level vehicle; live pedal anchors from flowFestEucPedalAnchorLocal",
        frames,
      };
    } finally {
      busy = false;
    }
  }

  onMount(() => {
    const api = {
      characters: DEPLOYED_CHARACTER_IDS,
      roles,
      captureOne,
      captureRide,
      setSequenceSnapshots,
      getStatus: () => status,
      isReady: () => pool !== null,
    };
    (
      window as Window & { flowFestNativeCapture?: typeof api }
    ).flowFestNativeCapture = api;
    void generateFlowFestPerformerPool({ count: 4 })
      .then((generated) => {
        pool = generated;
        status = generated.sources.every((source) => source === "generated")
          ? `Generated ${generated.generatedCount} production LOOPs`
          : "Generation failed; placeholder motion will not be exported";
      })
      .catch((error: unknown) => {
        status = `Generation failed: ${String(error)}`;
      });
    return () => {
      delete (window as Window & { flowFestNativeCapture?: typeof api })
        .flowFestNativeCapture;
    };
  });
</script>

<svelte:head><title>Flow Fest native motion capture</title></svelte:head>

<main>
  <h1>Flow Fest native motion capture</h1>
  <p>{status}</p>
  <div class="viewport">
    <Canvas>
      <CanvasLifecycle />
      <T.PerspectiveCamera makeDefault position={[0, 1.6, 5]} />
      <T.AmbientLight intensity={2} />
      {#if pool}
        {#key sceneKey}
          {#if mode === "ride"}
            <NativeRideScene
              bind:this={rideScene}
              {character}
              onReady={() => {
                readyKey = sceneKey;
              }}
            />
          {:else}
            <NativeCaptureScene
              bind:this={scene}
              {character}
              {role}
              sequence={sequenceForRole(role)}
              onReady={() => {
                readyKey = sceneKey;
              }}
            />
          {/if}
        {/key}
      {/if}
    </Canvas>
  </div>
</main>

<style>
  main {
    padding: 1rem;
    color: white;
    background: #101820;
    min-height: 100vh;
  }
  .viewport {
    width: 480px;
    height: 480px;
  }
</style>
