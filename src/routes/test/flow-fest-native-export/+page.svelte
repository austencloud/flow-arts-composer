<script lang="ts">
  import { onMount, tick } from "svelte";
  import { Canvas, T } from "@threlte/core";
  import CanvasLifecycle from "#lib/shared/3d/components/CanvasLifecycle.svelte";
  import { DEPLOYED_CHARACTER_IDS } from "#lib/shared/3d/config/deployed-characters.js";
  import {
    sha256,
    stableStringify,
  } from "../../../../unreal/Shared/Tools/capture-provenance.mjs";
  import {
    createRuntimeMotionBundle,
    runtimeMotionTiming,
    runtimeMotionSampleTime,
    sourceGlbJson,
  } from "../../../../unreal/Shared/Tools/runtime-motion-bundle.mjs";
  import { nativePropVariants } from "../../../../unreal/Shared/Tools/native-prop-catalog.mjs";
  import type { CharacterId } from "#lib/shared/3d/domain/character-model.js";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import { decodePerformanceTransfer } from "#lib/shared/3d/services/performance-transfer.js";
  import { PropType, type PropBuild } from "@austencloud/scene-3d";
  import {
    FLOW_FEST_PERFORMER_PROFILES,
    flowFestSequenceForPerformer,
    generateFlowFestPerformerPool,
    type FlowFestPerformerRole,
    type FlowFestPerformerSequencePool,
  } from "../flow-fest-sim/flow-fest-performer-sequences.js";
  import NativeCaptureScene from "#lib/shared/3d/native-capture/NativeCaptureScene.svelte";
  import NativeRideScene from "./NativeRideScene.svelte";
  import { captureWarmupTimes, normalizeCaptureSequence } from "./capture-score-time.js";
  import { rebuildPhraseSequence } from "#lib/features/flow-fest-sim/domain/flow-fest-phrase-sequence.js";
  import type { PhraseLibraryEntry } from "#lib/features/flow-fest-sim/domain/flow-fest-phrase-library.js";

  const roles = Object.keys(
    FLOW_FEST_PERFORMER_PROFILES
  ) as FlowFestPerformerRole[];
  const families: PropType[] = Object.values(PropType).filter(
    (prop) => prop !== PropType.HAND
  );
  // Catalog rows from the untyped .mjs; build fields carry PropBuild values.
  type NativePropVariant = Partial<PropBuild> & { id: string; leftFlipped?: boolean; rightFlipped?: boolean };
  const portableProps = families.flatMap(family => (nativePropVariants(family) as NativePropVariant[]).map(variant => ({
    ...variant, family, propId: `${family}:${variant.id}`,
  })));
  type Variant = "A" | "B";
  type CapturePlane = "wall" | "wheel" | "floor";
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
  let scoreInput = $state("");
  let selectedCharacter = $state<CharacterId>(DEPLOYED_CHARACTER_IDS[0]!);
  let selectedProp = $state("staff:default");
  let captureBuild = $state<PropBuild>();
  let captureLeftFlipped = $state(false);
  let captureRightFlipped = $state(false);
  let selectedEffect = $state<"fire" | "led">("led");
  let shouldLoop = $state(true);
  let selectedCapturePlane = $state<CapturePlane>("wall");
  let capturePlane = $state<CapturePlane>("wall");
  let exportBusy = $state(false);
  let exportError = $state("");
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
  let buildReceipt: {
    schema: string;
    id: string;
    sourceCommit: string;
    sourceSHA256: string;
    outputSHA256: string;
  } | null = null;

  async function verifiedBuild() {
    if (buildReceipt) return buildReceipt;
    const response = await fetch("/native-capture-build.json", {
      cache: "no-store",
    });
    if (!response.ok)
      throw new Error(
        "Native capture requires a fingerprinted static build. Build with native-capture.vite.config.mjs and use native-capture-static-runner.mjs."
      );
    const receipt = await response.json();
    if (
      receipt.schema !== "tka-native-capture-build-v1" ||
      !/^[a-f0-9]{64}$/.test(receipt.id)
    )
      throw new Error("Invalid native capture build receipt");
    buildReceipt = receipt;
    return receipt;
  }

  async function assetSHA256(path: string): Promise<string> {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`Capture asset unavailable: ${path}`);
    return sha256(await response.arrayBuffer());
  }

  async function captureProvenance(sequence: SequenceData, frameCount: number) {
    if (!scene) throw new Error("Performer capture scene is not mounted");
    const build = await verifiedBuild();
    const settings = scene.captureSettings();
    return {
      schema: "tka-performance-capture-v1",
      build: {
        id: build.id,
        sourceCommit: build.sourceCommit,
        sourceSHA256: build.sourceSHA256,
        outputSHA256: build.outputSHA256,
      },
      sequenceSHA256: await sha256(stableStringify(sequence)),
      rig: {
        characterId: character,
        sourcePath: settings.rigPath,
        sourceSHA256: await assetSHA256(settings.rigPath),
      },
      props: {
        family: propType,
        buildSHA256: build.outputSHA256,
        assets: await Promise.all(
          settings.propPaths.map(async (path: string) => ({
            path,
            sha256: await assetSHA256(path),
          }))
        ),
      },
      motionOptions: settings.motionOptions,
      clock: {
        fps: 30,
        frameCount,
        ...(runtimeMotionTiming(sequence).durationSeconds === frameCount / 30 ? {} : {
          durationSeconds: runtimeMotionTiming(sequence).durationSeconds,
        }),
        scoreUnitsPerSecond: 1,
        loopClosure: "first-frame-at-duration",
      },
    };
  }

  async function inspectCapture(
    nextCharacter: CharacterId,
    nextRole: string,
    nextSequence: SequenceData,
    nextPropType: PropType,
    nextEffectId: "fire" | "led"
  ) {
    nextSequence = normalizeCaptureSequence(nextSequence);
    if (busy) throw new Error("Capture already running");
    mode = "perform";
    character = nextCharacter;
    role = nextRole;
    customSequence = nextSequence;
    propType = nextPropType;
    effectId = nextEffectId;
    sceneKey += 1;
    const key = sceneKey;
    await tick();
    await waitReady(key);
    return captureProvenance(nextSequence, captureFrameCount(nextSequence));
  }

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
    return runtimeMotionTiming(sequence).frameCount;
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
    nextEffectId: "fire" | "led",
    nextCapturePlane: CapturePlane = "wall"
  ) {
    nextSequence = normalizeCaptureSequence(nextSequence);
    if (!Array.isArray(nextSequence?.steps) || !nextSequence.steps.length || nextSequence.steps.length > 1024)
      throw new Error("Capture needs 1–1024 timed steps");
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
      capturePlane = nextCapturePlane;
      sceneKey += 1;
      const key = sceneKey;
      status = `Loading ${character} / ${role}`;
      await tick();
      await waitReady(key);
      if (!scene) throw new Error("Performer capture scene is not mounted");
      scene.pauseAutoLoop();
      const { durationSeconds } = runtimeMotionTiming(nextSequence);
      await scene.settleCapturePose(
        captureWarmupTimes(shouldLoop, durationSeconds, frameCount), durationSeconds);
      const provenance = await captureProvenance(nextSequence, frameCount);
      const frames = [];
      for (let frame = 0; frame < frameCount; frame += 1) {
        frames.push(await scene.sampleFrame(frame, false,
          runtimeMotionSampleTime(frame, durationSeconds, frameCount)));
        if (frame % 30 === 0)
          status = `${character} / ${role}: ${frame}/${frameCount}`;
      }
      scene.renderPreview();
      status = `Captured ${character} / ${role}`;
      return {
        schema: "flow-fest-native-performance-v1",
        captureRevision: "monotonic-dynamic-grip-v5",
        source: "LiveSequencePerformer3D production generator",
        character,
        role,
        propType: nextPropType,
        effectId: nextEffectId,
        fps: 30,
        scoreUnitsPerSecond: 1,
        scoreSteps: nextSequence.steps.length,
        sequence: nextSequence,
        provenance,
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
    if (sequence.steps.length !== 16 || captureFrameCount(sequence) !== 480)
      throw new Error("Family capture requires a 16-step, 480-frame LOOP");
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
    nextEffectId: "fire" | "led",
    nextCapturePlane: CapturePlane = "wall"
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
      nextEffectId,
      nextCapturePlane
    );
  }

  async function captureRuntimeSequence(
    nextCharacter: CharacterId,
    sequence: SequenceData,
    nextPropType: PropType,
    nextEffectId: "fire" | "led",
    loop: boolean,
    nativePropId?: string,
    nextCapturePlane: CapturePlane = "wall"
  ) {
    if (!["wall", "wheel", "floor"].includes(nextCapturePlane))
      throw new Error("Unknown capture plane");
    const selected = portableProps.find(option => option.propId === (nativePropId ?? `${nextPropType}:default`));
    if (nativePropId && (!selected || selected.family !== nextPropType))
      throw new Error("Unknown native prop variant");
    captureBuild = selected ? {
      finish: selected.finish ?? "fire", fanBuild: selected.fanBuild ?? "pictograph",
      fanFrameColor: selected.fanFrameColor ?? "black", fanCover: selected.fanCover ?? "bare",
      triangleGrip: selected.triangleGrip ?? "corner",
    } : undefined;
    captureLeftFlipped = selected?.leftFlipped ?? false;
    captureRightFlipped = selected?.rightFlipped ?? false;
    const capture = await captureSequence(
      nextCharacter, "RuntimeMotion", sequence, nextPropType, nextEffectId, nextCapturePlane
    );
    if (loop) return { ...capture, nativePropId: selected?.propId ?? nextPropType };
    if (!scene) throw new Error("Runtime capture scene is not mounted");
    const terminalFrame = await scene.sampleFrame(capture.frames.length, true,
      runtimeMotionTiming(capture.sequence).durationSeconds);
    scene.renderPreview();
    return {
      ...capture,
      nativePropId: selected?.propId ?? nextPropType,
      terminalFrame,
    };
  }

  // Phrase stage: one phrase library entry, rebuilt the way both engines read it,
  // captured as a looping runtime motion in the phrase's plane.
  async function capturePhrase(
    nextCharacter: CharacterId,
    entry: PhraseLibraryEntry,
    nextPropType: PropType,
    nextEffectId: "fire" | "led",
    nextCapturePlane: CapturePlane,
    secondsPerStep: number
  ) {
    if (!(secondsPerStep > 0 && secondsPerStep <= 4)) throw new Error("Phrase capture needs 0-4 seconds per step");
    const rebuilt = rebuildPhraseSequence(entry);
    if (rebuilt.steps.length !== entry.beats)
      throw new Error(`Phrase ${entry.id} rebuilt to ${rebuilt.steps.length} steps, expected ${entry.beats}`);
    // One step per beat at the schedule's tempo, so the clip plays at rate 1.
    const sequence = { ...rebuilt, steps: rebuilt.steps.map(step => ({ ...step, duration: secondsPerStep })) };
    return captureRuntimeSequence(nextCharacter, sequence, nextPropType, nextEffectId, true,
      `${nextPropType}:default`, nextCapturePlane);
  }

  async function exportPastedScore() {
    if (exportBusy) return;
    exportBusy = true;
    exportError = "";
    try {
      const pasted = JSON.parse(scoreInput);
      const sequence = normalizeCaptureSequence((pasted?.schema === "tka-performance-transfer-v1"
        ? (await decodePerformanceTransfer(scoreInput)).sequence
        : pasted?.sequence ?? pasted) as SequenceData);
      if (!Array.isArray(sequence?.steps) || !sequence.steps.length || sequence.steps.length > 1024)
        throw new Error("Paste a score with 1–1024 steps");
      captureFrameCount(sequence);
      const selected = portableProps.find(option => option.propId === selectedProp)!;
      const capture = await captureRuntimeSequence(
        selectedCharacter, sequence, selected.family, selectedEffect, shouldLoop, selected.propId,
        selectedCapturePlane
      );
      const rigPath = capture.provenance.rig.sourcePath;
      const response = await fetch(rigPath);
      if (!response.ok) throw new Error(`Source rig unavailable: ${rigPath}`);
      const sourceGlb = sourceGlbJson(await response.arrayBuffer());
      const bundle = await createRuntimeMotionBundle(capture, {
        sourceGlb,
        sourceRigSHA256: capture.provenance.rig.sourceSHA256,
        loop: shouldLoop,
      });
      const fileName = `${selectedCharacter}_${bundle.sequenceSHA256.slice(0, 16)}${selectedCapturePlane === "wall" ? "" : `_${selectedCapturePlane}`}.motion.json`;
      const url = URL.createObjectURL(new Blob([JSON.stringify(bundle)], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      status = `Downloaded ${fileName}`;
    } catch (error) {
      exportError = error instanceof Error ? error.message : String(error);
    } finally {
      exportBusy = false;
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
      families,
      captureOne,
      captureFamily,
      captureSequence,
      captureRuntimeSequence,
      capturePhrase,
      inspectCapture,
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
  {#if customMode}
    <section class="portable-export" aria-label="Portable motion export">
      <h2>Export a score for Flow Fest</h2>
      <p>Paste a Composer score or copied transfer, choose its performer and prop, then download a motion file to load in the game.</p>
      <label for="motion-score">Composer score JSON</label>
      <textarea id="motion-score" bind:value={scoreInput} rows="7" spellcheck="false" placeholder={'{"steps":[…]}'}></textarea>
      <div class="export-options">
        <label>Performer
          <select bind:value={selectedCharacter}>
            {#each DEPLOYED_CHARACTER_IDS as id}<option value={id}>{id}</option>{/each}
          </select>
        </label>
        <label>Prop
          <select bind:value={selectedProp}>
            {#each portableProps as prop}<option value={prop.propId}>{prop.propId}</option>{/each}
          </select>
        </label>
        <label>Effect
          <select bind:value={selectedEffect}>
            <option value="led">LED</option><option value="fire">Fire</option>
          </select>
        </label>
        <label>Default plane
          <select bind:value={selectedCapturePlane}>
            <option value="wall">Wall</option><option value="wheel">Wheel</option><option value="floor">Floor</option>
          </select>
        </label>
        <label class="loop-option"><input type="checkbox" bind:checked={shouldLoop} /> Loop</label>
      </div>
      <button type="button" disabled={exportBusy || !scoreInput.trim()} onclick={exportPastedScore}>
        {exportBusy ? "Capturing motion…" : "Download motion file"}
      </button>
      {#if exportError}<p class="export-error" role="alert">{exportError}</p>{/if}
    </section>
  {/if}
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
              propBuild={captureBuild}
              leftFlipped={captureLeftFlipped}
              rightFlipped={captureRightFlipped}
              sequence={sequenceForCaptureRole(role)}
              {capturePlane}
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
    color: var(--theme-text, #f1f5f9);
    background: var(--theme-panel-bg, #101820);
    min-height: 100vh;
    box-sizing: border-box;
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    font-size: max(var(--font-size-min, 14px), 1rem);
    line-height: 1.5;
  }
  .viewport {
    width: 480px;
    max-width: 100%;
    aspect-ratio: 1;
    overflow: hidden;
  }
  .viewport :global(canvas) {
    width: 100% !important;
    height: 100% !important;
  }
  .portable-export {
    max-width: 48rem;
    margin: 1rem 0;
    padding: 1rem;
    background: var(--theme-card-bg, #1c2b35);
    border: 1px solid var(--theme-stroke, #587182);
    border-radius: .75rem;
  }
  .portable-export h2 { margin-top: 0; }
  .portable-export textarea { width: 100%; box-sizing: border-box; }
  .portable-export :is(textarea, select, button) {
    color: inherit;
    background: var(--theme-panel-bg, #101820);
    border: 1px solid var(--theme-stroke, #587182);
    border-radius: .375rem;
    font: inherit;
    padding: .5rem .625rem;
    max-width: 100%;
  }
  .portable-export :is(textarea, select, button, input):focus-visible {
    outline: 3px solid var(--theme-accent, #8cd8ff);
    outline-offset: 3px;
  }
  .portable-export textarea { resize: vertical; }
  .portable-export select { min-height: 2.75rem; }
  .export-options { display: flex; flex-wrap: wrap; gap: 1rem; margin: 1rem 0; align-items: end; }
  .export-options label { display: grid; gap: .3rem; min-width: 0; max-width: 100%; }
  .export-options .loop-option { display: flex; align-items: center; min-height: 2.75rem; cursor: pointer; }
  .loop-option input { width: 1.25rem; height: 1.25rem; accent-color: var(--theme-accent, #8cd8ff); }
  .portable-export button { min-height: 2.75rem; padding: .5rem 1rem; }
  .portable-export button:enabled { cursor: pointer; }
  .portable-export button:disabled { opacity: .6; }
  .portable-export button:enabled:hover { border-color: var(--theme-accent, #8cd8ff); }
  .export-error { color: var(--semantic-error, #ffb6ab); }
</style>
