<script lang="ts">
  import { Canvas, T } from "@threlte/core";
  import { onMount, tick } from "svelte";
  import type CameraControls from "camera-controls";
  import { Vector3, WebGLRenderer } from "three";
  import {
    safeSessionStorageGet,
    safeSessionStorageSet,
  } from "$lib/shared/foundation/services/storage-manager";
  import OrbitControls from "$lib/shared/3d/components/OrbitControls.svelte";
  import TransportControls from "$lib/shared/animation-engine/components/controls/TransportControls.svelte";
  import FilterChipBase from "$lib/shared/browse/components/filter-chips/FilterChipBase.svelte";
  import { DEFAULT_LAB_CHARACTER_ID } from "../_lab-kit/lab-characters";
  import {
    solveInspectionShot,
    INSPECTION_FOV_DEG,
    type InspectionShot,
  } from "../_lab-kit/inspection-shot";
  import ReachStage from "./ReachStage.svelte";
  import {
    captureIsolationSnapshot,
    DEFAULT_TORSO_POSE_KEYFRAMES,
    ISOLATION_SEQUENCE,
    ISOLATION_STEP_COUNT,
    restoreIsolationSnapshot,
    torsoYawAtKeyframes,
    upsertTorsoKeyframe,
    wrapIsolationPhase,
    type IsolationSnapshot,
    type TorsoKeyframe,
  } from "./isolation-loop";

  interface ReferenceFrame extends IsolationSnapshot {
    id: number;
    camera: InspectionShot;
  }
  const points = ["S", "E", "N", "W"];
  const referenceStorageKey = "tka-isolation-left-references-v1";
  let playing = $state(true);
  let ready = $state(false);
  let phase = $state(0);
  let torsoKeyframes = $state<TorsoKeyframe[]>(
    DEFAULT_TORSO_POSE_KEYFRAMES.map((key) => ({ ...key }))
  );
  let snapshots = $state<ReferenceFrame[]>([]);
  let capturing = $state(false);
  let referenceId = 0;
  let stage: HTMLElement;
  let width = $state(0);
  let height = $state(0);
  let cameraControls = $state<CameraControls | null>(null);
  const torsoYaw = $derived(torsoYawAtKeyframes(phase, torsoKeyframes));
  const turnDegrees = $derived(Math.round((torsoYaw * 180) / Math.PI));
  const shot = $derived(
    solveInspectionShot(
      {
        center: [0, 1.3, 0.15],
        halfWidth: 1.15,
        halfHeight: 1.35,
        halfDepth: 0.3,
      },
      {
        aspectRatio: width / Math.max(height, 1),
        azimuthDeg: 0,
        elevationDeg: 0,
        padding: 1.06,
      }
    )
  );

  $effect(() => {
    if (width > 0 && height > 0 && cameraControls)
      void cameraControls.setLookAt(...shot.position, ...shot.target, false);
  });
  function seek(next: number) {
    playing = false;
    phase = wrapIsolationPhase(next);
  }
  function editTorso(degrees: number) {
    playing = false;
    torsoKeyframes = upsertTorsoKeyframe(
      torsoKeyframes,
      phase,
      (degrees * Math.PI) / 180
    );
  }
  async function saveSnapshot() {
    if (!ready || capturing || !cameraControls) return;
    playing = false;
    capturing = true;
    try {
      // Let the paused phase reach the renderer before recording its pixels.
      await tick();
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      );
      const canvas = stage.querySelector("canvas");
      if (!canvas) return;
      const thumbnail = document.createElement("canvas");
      thumbnail.width = Math.min(640, canvas.width);
      thumbnail.height = Math.round(
        (thumbnail.width * canvas.height) / canvas.width
      );
      const context = thumbnail.getContext("2d");
      if (!context) return;
      context.drawImage(canvas, 0, 0, thumbnail.width, thumbnail.height);
      snapshots = [
        ...snapshots,
        {
          ...captureIsolationSnapshot(
            thumbnail.toDataURL("image/webp", 0.85),
            phase,
            torsoKeyframes
          ),
          id: ++referenceId,
          camera: {
            position: cameraControls.getPosition(new Vector3()).toArray(),
            target: cameraControls.getTarget(new Vector3()).toArray(),
          },
        },
      ];
      safeSessionStorageSet(referenceStorageKey, snapshots);
    } finally {
      capturing = false;
    }
  }
  function restoreSnapshot(snapshot: ReferenceFrame) {
    const restored = restoreIsolationSnapshot(snapshot);
    phase = restored.phase;
    torsoKeyframes = restored.torsoKeyframes;
    playing = false;
    void cameraControls?.setLookAt(
      ...snapshot.camera.position,
      ...snapshot.camera.target,
      false
    );
  }
  onMount(() => {
    const saved = safeSessionStorageGet<ReferenceFrame[]>(referenceStorageKey);
    if (Array.isArray(saved)) {
      snapshots = saved.filter(
        (frame) =>
          frame &&
          Number.isFinite(frame.phase) &&
          Number.isFinite(frame.id) &&
          typeof frame.image === "string" &&
          frame.image.startsWith("data:image/") &&
          Array.isArray(frame.torsoKeyframes) &&
          frame.torsoKeyframes.every(
            (key) => Number.isFinite(key.phase) && Number.isFinite(key.yaw)
          ) &&
          frame.camera?.position?.length === 3 &&
          frame.camera?.target?.length === 3 &&
          [...frame.camera.position, ...frame.camera.target].every(
            Number.isFinite
          )
      );
      referenceId = Math.max(0, ...snapshots.map((frame) => frame.id));
    }
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => {
      if (media.matches) playing = false;
    };
    sync();
    media.addEventListener("change", sync);
    let last = performance.now();
    let request = 0;
    const advance = (now: number) => {
      if (playing && ready)
        phase = wrapIsolationPhase(
          phase + Math.min((now - last) / 1000, 0.1) * 0.32
        );
      last = now;
      request = requestAnimationFrame(advance);
    };
    request = requestAnimationFrame(advance);
    return () => {
      cancelAnimationFrame(request);
      media.removeEventListener("change", sync);
    };
  });
</script>

<svelte:head><title>Isolation loop · TKA lab</title></svelte:head>
<main class="lab">
  <section
    class="stage"
    bind:this={stage}
    bind:clientWidth={width}
    bind:clientHeight={height}
    aria-label="Single-hand staff isolation"
    aria-busy={!ready}
  >
    <Canvas
      shadows
      createRenderer={(canvas) =>
        new WebGLRenderer({
          canvas,
          alpha: true,
          antialias: true,
          preserveDrawingBuffer: true,
        })}
    >
      <T.PerspectiveCamera
        makeDefault
        position={shot.position}
        fov={INSPECTION_FOV_DEG}
      >
        <OrbitControls
          bind:ref={cameraControls}
          enablePan={false}
          rightDragAction="rotate"
          target={shot.target}
          minDistance={1.5}
          maxDistance={12}
        />
      </T.PerspectiveCamera>
      <ReachStage
        id="single-hand-isolation"
        {phase}
        active={false}
        {torsoYaw}
        sequence={ISOLATION_SEQUENCE}
        characterId={DEFAULT_LAB_CHARACTER_ID}
        onReady={() => (ready = true)}
      />
    </Canvas>
    {#if !ready}<span class="loading" role="status">Loading performer…</span
      >{/if}
    {#if snapshots.length}
      <div class="references" aria-label="Reference snapshots">
        {#each snapshots as snapshot, index (snapshot.id)}
          <button
            class="snapshot"
            type="button"
            aria-label={`Restore snapshot ${index + 1}`}
            onclick={() => restoreSnapshot(snapshot)}
          >
            <img src={snapshot.image} alt={`Reference ${index + 1}`} /><span
              >{snapshot.phase.toFixed(2)}</span
            >
          </button>
        {/each}
      </div>
    {/if}
  </section>
  <div class="controls" role="group" aria-label="Isolation controls">
    <div class="transport">
      <TransportControls
        isPlaying={playing && ready}
        disabled={!ready}
        onPlaybackToggle={() => (playing = !playing)}
      />
    </div>
    <div class="points" role="group" aria-label="Hand position">
      {#each points as marker, index}<FilterChipBase
          label={marker}
          labelScale="readable"
          mode="action"
          size="sm"
          onclick={() => seek(index)}
        />{/each}
    </div>
    <label class="scrub phase"
      ><span>Position</span><input
        aria-label="Sequence position"
        type="range"
        min="0"
        max={ISOLATION_STEP_COUNT}
        step="0.01"
        value={phase}
        oninput={(event) => seek(Number(event.currentTarget.value))}
      /></label
    >
    <label class="scrub turn"
      ><span>Torso</span><input
        aria-label="Torso turn"
        type="range"
        min="-70"
        max="70"
        step="1"
        value={turnDegrees}
        oninput={(event) => editTorso(Number(event.currentTarget.value))}
      /><output>{turnDegrees}°</output></label
    >
    <FilterChipBase
      label="Snapshot"
      labelScale="readable"
      icon="fa-solid fa-camera"
      mode="action"
      size="sm"
      disabled={!ready || capturing}
      onclick={saveSnapshot}
    />
  </div>
</main>

<style>
  .lab {
    height: 100dvh;
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto;
    background: var(--theme-page-bg, #101217);
    color: var(--theme-text, #fff);
  }
  .stage {
    position: relative;
    min-height: 0;
    overflow: hidden;
  }
  .stage :global(canvas) {
    display: block;
    width: 100%;
    height: 100%;
  }
  .controls {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    flex-wrap: wrap;
    padding: 0.75rem;
    background: var(--theme-panel-bg, #1b1f27);
  }
  .transport {
    flex: 0 0 48px;
  }
  .points {
    display: flex;
    gap: 0.25rem;
  }
  .scrub {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 14px;
  }
  .scrub input {
    accent-color: var(--theme-accent, #6e9cff);
    min-width: 0;
    width: 100%;
    height: 32px;
    cursor: pointer;
  }
  .phase {
    flex: 1 1 180px;
    max-width: 360px;
  }
  .turn {
    flex: 1 1 220px;
    max-width: 360px;
  }
  output {
    min-width: 4ch;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .references {
    position: absolute;
    bottom: 12px;
    left: 12px;
    right: 12px;
    display: flex;
    gap: 8px;
    overflow-x: auto;
    pointer-events: none;
  }
  .snapshot {
    flex: 0 0 96px;
    position: relative;
    height: 76px;
    padding: 0;
    border: 1px solid var(--theme-stroke, #4c5566);
    border-radius: 6px;
    background: var(--theme-panel-bg, #1b1f27);
    color: inherit;
    cursor: pointer;
    pointer-events: auto;
  }
  .snapshot img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
  }
  .snapshot span {
    position: absolute;
    bottom: 2px;
    right: 4px;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }
  .snapshot:focus-visible,
  input:focus-visible {
    outline: 2px solid var(--theme-accent, #6e9cff);
    outline-offset: 2px;
  }
  .loading {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-size: 14px;
  }
  @media (max-width: 600px) {
    .controls {
      gap: 0.5rem;
    }
    .phase {
      order: 2;
      flex-basis: 100%;
      max-width: none;
    }
    .turn {
      order: 3;
      flex-basis: 100%;
      max-width: none;
    }
    .scrub > span {
      min-width: 54px;
    }
  }
</style>
