<script lang="ts">
  import { onMount, tick } from "svelte";
  import { Canvas, T } from "@threlte/core";
  import CanvasLifecycle from "#lib/shared/3d/components/CanvasLifecycle.svelte";
  import { DEPLOYED_CHARACTER_IDS } from "#lib/shared/3d/config/deployed-characters.js";
  import type { CharacterId } from "#lib/shared/3d/domain/character-model.js";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import { PropType } from "@austencloud/scene-3d";
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
  const families = Object.values(PropType).filter(
    (prop) => prop !== PropType.HAND
  );
  type Variant = "A" | "B";
  type CaptureRole = string;
  const familyKey = (
    family: PropType,
    variant: Variant
  ): `family-${PropType}-${Variant}` => `family-${family}-${variant}`;
  let pool = $state<FlowFestPerformerSequencePool | null>(null);
  let sequenceSnapshots = $state<
    Partial<Record<FlowFestPerformerRole, SequenceData>>
  >({});
  let familySnapshots = $state<Record<string, SequenceData>>({});
  let customSequence = $state<SequenceData | null>(null);
  let customMode = $state(false);
  let character = $state<CharacterId>(DEPLOYED_CHARACTER_IDS[0]!);
  let role = $state<CaptureRole>(roles[0]!);
  let propType = $state<PropType>(
    FLOW_FEST_PERFORMER_PROFILES[roles[0]!].propType as unknown as PropType
  );
  let effectId = $state<"fire" | "led">(
    FLOW_FEST_PERFORMER_PROFILES[roles[0]!].effectId
  );
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

  function sequenceForCaptureRole(nextRole: CaptureRole): SequenceData {
    if (customSequence && nextRole === role) return customSequence;
    if (nextRole.startsWith("family-")) return familySnapshots[nextRole]!;
    return sequenceForRole(nextRole as FlowFestPerformerRole);
  }

  function captureFrameCount(sequence: SequenceData): number {
    if (!sequence?.steps?.length)
      throw new Error("Authored sequence has no steps");
    const scoreUnits = sequence.steps.reduce((total, step) => {
      if (!Number.isFinite(step.duration) || step.duration <= 0)
        throw new Error("Authored sequence has an invalid step duration");
      return total + step.duration;
    }, 0);
    const exactFrames = scoreUnits * 30;
    const frameCount = Math.round(exactFrames);
    if (
      !Number.isSafeInteger(frameCount) ||
      frameCount <= 0 ||
      Math.abs(exactFrames - frameCount) > 1e-6
    )
      throw new Error(
        "Authored sequence duration must resolve to whole 30 fps frames"
      );
    return frameCount;
  }

  function setSequenceSnapshots(
    snapshots: Partial<Record<FlowFestPerformerRole, SequenceData>>
  ): void {
    for (const nextRole of roles)
      if (!snapshots[nextRole]?.steps.length)
        throw new Error(`Missing preserved ${nextRole} sequence`);
    sequenceSnapshots = snapshots;
  }

  function setFamilySequenceSnapshots(
    snapshots: Record<string, SequenceData>
  ): void {
    for (const [key, sequence] of Object.entries(snapshots)) {
      if (!sequence?.steps?.length || sequence.steps.length !== 16)
        throw new Error(`Invalid preserved 16-step LOOP for ${key}`);
    }
    familySnapshots = { ...familySnapshots, ...snapshots };
  }

  async function prepareFamily(
    family: PropType,
    variant: Variant
  ): Promise<SequenceData> {
    if (!families.includes(family) || (variant !== "A" && variant !== "B"))
      throw new Error("Unknown physical prop family or variant");
    const key = familyKey(family, variant);
    if (familySnapshots[key]) return familySnapshots[key];
    const generated = await generateFlowFestPerformerPool({ count: 1 });
    if (
      generated.generatedCount !== 1 ||
      generated.loops[0]?.steps.length !== 16
    )
      throw new Error(
        `Production 16-step LOOP generation failed for ${key}: ${generated.notes.join("; ")}`
      );
    familySnapshots = { ...familySnapshots, [key]: generated.loops[0] };
    return generated.loops[0]!;
  }

  function getFamilySequenceSnapshots(): Record<string, SequenceData> {
    return familySnapshots;
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

  async function capturePerformance(
    nextCharacter: CharacterId,
    nextRole: string,
    nextSequence: SequenceData,
    nextPropType: PropType,
    nextEffectId: "fire" | "led"
  ) {
    if (busy) throw new Error("Capture already running");
    if (!DEPLOYED_CHARACTER_IDS.includes(nextCharacter))
      throw new Error("Unknown deployed rig or Flow Fest profile");
    const frameCount = captureFrameCount(nextSequence);
    busy = true;
    try {
      mode = "perform";
      character = nextCharacter;
      role = nextRole;
      customSequence = nextSequence;
      propType = nextPropType;
      effectId = nextEffectId;
      sceneKey += 1;
      const key = sceneKey;
      status = `Loading ${character} / ${role}`;
      await tick();
      await waitReady(key);
      if (!scene) throw new Error("Performer capture scene is not mounted");
      scene.pauseAutoLoop();
      await scene.settleCapturePose();
      const frames = [];
      for (let frame = 0; frame < frameCount; frame += 1) {
        frames.push(await scene.sampleFrame(frame));
        if (frame % 30 === 0)
          status = `${character} / ${role}: ${frame}/${frameCount}`;
      }
      status = `Captured ${character} / ${role}`;
      return {
        schema: "flow-fest-native-performance-v1",
        captureRevision: "clock-isolated-body-v3",
        source: "LiveSequencePerformer3D production generator",
        character,
        role,
        propType: nextPropType,
        effectId: nextEffectId,
        fps: 30,
        scoreUnitsPerSecond: 1,
        scoreSteps: nextSequence.steps.length,
        sequence: nextSequence,
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

  async function captureOne(
    nextCharacter: CharacterId,
    nextRole: FlowFestPerformerRole
  ) {
    if (!pool || pool.sources.some((source) => source !== "generated"))
      throw new Error(
        "Production LOOP snapshot is unavailable; refusing placeholder motion"
      );
    if (!roles.includes(nextRole)) throw new Error("Unknown Flow Fest profile");
    const profile = FLOW_FEST_PERFORMER_PROFILES[nextRole];
    if (
      sequenceForRole(nextRole).steps.length !== 16 ||
      captureFrameCount(sequenceForRole(nextRole)) !== 480
    )
      throw new Error("Flow Fest profile requires 480 frames");
    return capturePerformance(
      nextCharacter,
      nextRole,
      sequenceForRole(nextRole),
      profile.propType as unknown as PropType,
      profile.effectId
    );
  }

  async function captureFamily(
    nextCharacter: CharacterId,
    family: PropType,
    variant: Variant
  ) {
    if (!families.includes(family) || (variant !== "A" && variant !== "B"))
      throw new Error("Unknown physical prop family or variant");
    const sequence = await prepareFamily(family, variant);
    if (captureFrameCount(sequence) !== 480)
      throw new Error("Family capture requires 480 frames");
    const effect: "fire" | "led" =
      family.includes("fire") ||
      family.includes("torch") ||
      family === PropType.POI
        ? "fire"
        : "led";
    return capturePerformance(
      nextCharacter,
      familyKey(family, variant),
      sequence,
      family,
      effect
    );
  }

  async function captureSequence(
    nextCharacter: CharacterId,
    profile: string,
    sequence: SequenceData,
    nextPropType: PropType,
    nextEffectId: "fire" | "led"
  ) {
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(profile))
      throw new Error("Invalid authored performance profile");
    if (!families.includes(nextPropType))
      throw new Error("Unknown physical prop type");
    if (nextEffectId !== "fire" && nextEffectId !== "led")
      throw new Error("Unknown effect type");
    return capturePerformance(
      nextCharacter,
      profile,
      sequence,
      nextPropType,
      nextEffectId
    );
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
      families,
      captureOne,
      captureFamily,
      captureSequence,
      captureRide,
      setSequenceSnapshots,
      prepareFamily,
      setFamilySequenceSnapshots,
      getFamilySequenceSnapshots,
      getStatus: () => status,
      isReady: () => customMode || pool !== null,
    };
    (
      window as Window & { flowFestNativeCapture?: typeof api }
    ).flowFestNativeCapture = api;
    const params = new URLSearchParams(window.location.search);
    customMode = params.has("custom");
    if (customMode) {
      status = "Ready for authored sequence capture";
      return () => {
        delete (window as Window & { flowFestNativeCapture?: typeof api })
          .flowFestNativeCapture;
      };
    }
    const familyCapture = params.has("family");
    void generateFlowFestPerformerPool({ count: familyCapture ? 1 : 4 })
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
      {#if pool || customSequence}
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
              {propType}
              {effectId}
              sequence={sequenceForCaptureRole(role)}
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
