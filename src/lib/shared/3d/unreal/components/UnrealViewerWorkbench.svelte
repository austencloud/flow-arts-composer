<script lang="ts">
  import { onMount } from "svelte";
  import { Plane } from "@austencloud/scene-3d";
  import Viewer3DFullscreen from "../../components/Viewer3DFullscreen.svelte";
  import SceneChromeButton from "../../components/controls/SceneChromeButton.svelte";
  import SpeedControlBar from "../../components/controls/SpeedControlBar.svelte";
  import { createViewer3DState } from "../../state/viewer-3d-state.svelte";
  import { setViewer3DContext } from "../../context/viewer-3d-context";
  import { createFullscreenController } from "#lib/shared/fullscreen/state/fullscreen-controller.svelte.js";
  import { createNativeViewerConnection } from "../state/native-viewer-connection.svelte";
  import { attachSceneUndoKeyboard } from "../../undo/scene-undo-keyboard";
  import UnrealViewerSurface from "./UnrealViewerSurface.svelte";

  const connection = createNativeViewerConnection();
  const viewer = createViewer3DState(
    {
      environmentId: "void",
      defaultProp: "staff",
      selectedPerformerIndices: [0],
      performers: [
        {
          characterId: "ch01",
          position: { x: 0, z: 0 },
          facingAngle: 0,
          customLeftPlane: Plane.WALL,
          customRightPlane: Plane.WALL,
          settings: {
            prop: "staff",
            effortId: null,
            effect: null,
            staffLengthCm: null,
          },
        },
      ],
    },
    { maxPerformers: 1 }
  );
  setViewer3DContext(viewer);
  let announcement = $state("");
  const fullscreen = createFullscreenController({
    getHapticService: () => null,
    announce: (message) => {
      announcement = message;
    },
  });
  let mounted = $state(false);
  const playing = $derived(connection.state?.playback.status === "playing");
  const ready = $derived(connection.status === "ready");

  function playback(action: "pause" | "resume" | "restart") {
    void connection
      .command("playback", { action })
      .catch((cause: Error) => connection.report(cause.message));
  }

  function rate(bpm: number) {
    void connection
      .command("playback", { action: "rate", rate: bpm / 60 })
      .catch((cause: Error) => connection.report(cause.message));
  }

  onMount(() => {
    viewer.enter3D(null);
    mounted = true;
    const detachUndo = attachSceneUndoKeyboard(
      viewer.sceneUndo,
      (description) => (announcement = `Undid: ${description}`),
      (description) => (announcement = `Redid: ${description}`)
    );
    return () => {
      detachUndo();
      viewer.dispose();
    };
  });
</script>

{#if mounted}
  <Viewer3DFullscreen
    sequenceData={null}
    currentStep={0}
    isPlaying={playing}
    bpm={(connection.state?.playback.rate ?? 1) * 60}
    word={null}
    renderEmptyScene
    hideCanvasOverlays
    allowSaveScene={false}
    onPlaybackToggle={() => playback(playing ? "pause" : "resume")}
    onBpmChange={rate}
    immersive={fullscreen.immersive}
    onToggleImmersive={(host) => fullscreen.toggleImmersive(host)}
    sceneControlsBottomOffset="max(1rem, env(safe-area-inset-bottom))"
  >
    {#snippet surface()}<UnrealViewerSurface {connection} />{/snippet}
    {#snippet hudActions()}
      <SceneChromeButton
        icon={playing ? "fa-pause" : "fa-play"}
        label={playing ? "Pause performer" : "Play performer"}
        tooltipSide="bottom"
        disabled={!ready}
        onclick={() => playback(playing ? "pause" : "resume")}
      />
      <SceneChromeButton
        icon="fa-rotate-left"
        label="Restart practice loop"
        tooltipSide="bottom"
        disabled={!ready}
        onclick={() => playback("restart")}
      />
      <SceneChromeButton
        icon="fa-plug"
        label="Reconnect Unreal viewer"
        tooltipSide="bottom"
        onclick={() => connection.reconnect()}
      />
    {/snippet}
    {#snippet overlayChildren()}
      {#if !ready}
        <div class="connection-panel" role="status">
          <h1>
            {connection.status === "connecting"
              ? "Connecting to Unreal"
              : "Unreal viewer disconnected"}
          </h1>
          <p>
            {connection.status === "connecting"
              ? "Waiting for the local performer stream."
              : "Start the local viewer host, then reconnect."}
          </p>
          {#if connection.error}
            <p class="connection-error" role="alert">{connection.error}</p>
          {/if}
          {#if connection.status === "disconnected"}
            <button class="retry" onclick={() => connection.reconnect()}
              >Reconnect</button
            >
          {/if}
        </div>
      {/if}
      {#if connection.needsPlay}
        <button class="start-video" onclick={() => connection.play()}
          >Show live scene</button
        >
      {/if}
      {#if ready}
        <div class="scene-caption">
          <div class="caption-title">
            <span class:live={ready} class="status-dot" aria-hidden="true"
            ></span><strong
              >{connection.state?.playback.preparedClip?.title ??
                "Unreal studio"}</strong
            ><span class="renderer-label">Unreal</span>
          </div>
          <p class="scene-capabilities">
            One performer · staff &amp; fan · camera &amp; placement
          </p>
          <div class="playback-rate">
            <span>Speed</span>
            <SpeedControlBar
              value={connection.state?.playback.rate ?? 1}
              speeds={[0.5, 1, 1.5]}
              disabled={!ready}
              onchange={(speed) => rate(speed * 60)}
            />
          </div>
          <p class="scope">
            Prepared practice animation. Other scene settings and Composer
            scores are not connected yet.
          </p>
          {#if connection.error}
            <p class="connection-error" role="alert">{connection.error}</p>
          {/if}
        </div>
      {/if}
    {/snippet}
  </Viewer3DFullscreen>
{/if}
<span class="sr-only" aria-live="polite">{announcement}</span>

<style>
  .scene-caption {
    position: absolute;
    bottom: max(1rem, env(safe-area-inset-bottom));
    left: 1rem;
    max-width: min(36rem, calc(100vw - 6rem));
    padding: 0.75rem 1rem;
    color: var(--theme-text, #fff);
    background: var(--theme-panel-bg, #0c0e16);
    border: 1px solid var(--theme-stroke, #323641);
    border-radius: var(--radius-lg, 0.75rem);
    pointer-events: auto;
  }
  .caption-title {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }
  .caption-title strong {
    font-size: 0.95rem;
  }
  .playback-rate {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-top: 0.5rem;
    font-size: var(--font-size-sm, 0.875rem);
  }
  .renderer-label {
    margin-left: auto;
    font-size: 0.75rem;
    color: var(--theme-text-dim, #b4bac7);
  }
  .status-dot {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
    background: #9198a5;
  }
  .status-dot.live {
    background: #71c39a;
  }
  p {
    margin: 0.35rem 0 0;
    line-height: 1.4;
    font-size: 0.8rem;
  }
  .scope {
    color: var(--theme-text-dim, #b4bac7);
  }
  .connection-error {
    color: #ffbead;
  }
  .connection-panel {
    position: absolute;
    top: 40%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(28rem, calc(100vw - 7rem));
    text-align: center;
    pointer-events: auto;
    color: var(--theme-text, #fff);
  }
  h1 {
    font-size: clamp(1.2rem, 3vw, 1.8rem);
    margin: 0 0 0.5rem;
  }
  .retry,
  .start-video {
    min-height: 44px;
    padding: 0.65rem 1.2rem;
    color: var(--theme-text, #fff);
    background: var(--theme-panel-bg, #171d2b);
    border: 1px solid var(--theme-stroke-strong, #717c94);
    border-radius: var(--radius-md, 0.5rem);
    cursor: pointer;
  }
  .retry {
    margin-top: 1rem;
  }
  .start-video {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    pointer-events: auto;
  }
  button:focus-visible {
    outline: 2px solid var(--theme-accent, #4a9eff);
    outline-offset: 3px;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  @media (max-width: 767px),
    (max-height: 500px),
    (max-width: 1099px) and (max-height: 543px) {
    .scene-caption {
      max-width: min(28rem, calc(100vw - 2rem));
      bottom: calc(max(1rem, env(safe-area-inset-bottom)) + 4.75rem);
      padding: 0.6rem 0.75rem;
    }
    .scene-capabilities {
      display: none;
    }
    .scene-caption p {
      font-size: 0.75rem;
    }
  }
</style>
