<script lang="ts">
  /**
   * TunnelScene
   *
   * Mirrors: Tunnel. The tunnel is the real TunnelArtView, set up the way the
   * tunnel gallery's TunnelDetailPreview sets one up: its own effects,
   * visibility, and animation settings, and a controller that saves nothing.
   * The formation is Radial from TUNNEL_PRESETS, with the grid off and trails
   * off for good, so the canvas skips its GPU trail layer (trailOverlay), whose
   * WebGL2 setup costs a few hundred milliseconds at mount. TunnelArtView's
   * self-clock runs only while its playing prop is on, and that prop follows
   * this card's turn, so between turns the canvas is still.
   *
   * The dice is the one on the base performer's card in the Tunnel tool
   * (TunnelPerformerCard): the accent dice that gives that performer a new
   * sequence. The new sequence comes from drawMatrixRealization(), the
   * Firebase-free source behind the home hero, drawn in the background
   * between turns. When that source fails, the performer's sequence turns an
   * eighth instead, so the tunnel still redraws.
   *
   * Once the dice is pressed, the copies fold back into the one performer,
   * which dips out over its tile and comes back alone with its new sequence.
   * Its copies then bloom out around it with the viewer's own bloom
   * (TunnelArtView's copyReveal), so the turn shows that a tunnel is one
   * sequence copied around a ring (2026-10-10: the whole tile fading out and
   * back read as a reload). The tile behind the dip is the canvas's own
   * background color, so only the performer leaves.
   *
   * Finished picture: the redrawn tunnel, still. Before the first turn, the
   * demo sequence's tunnel.
   */
  import { onDestroy, tick } from "svelte";
  import { cubicOut } from "svelte/easing";
  import { Tween } from "svelte/motion";
  import {
    DARK_MODE_BACKGROUND,
    LIGHT_MODE_BACKGROUND,
  } from "#lib/shared/animation-engine/services/canvas2d/canvas-2d-application-manager.js";
  import { TrailMode } from "#lib/shared/animation-engine/domain/types/trail-types.js";
  import { createAnimationSettingsState } from "#lib/shared/animation-engine/state/animation-settings-state.svelte.js";
  import { AnimationVisibilityStateManager } from "#lib/shared/animation-engine/state/animation-visibility-state.svelte.js";
  import type { GhostState } from "#lib/shared/attract/services/attract-ghost.svelte.js";
  import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";
  import { setEffectsConfigContext } from "#lib/shared/effects/state/effects-config-context.js";
  import { createEffectsConfigState } from "#lib/shared/effects/state/effects-config-state.svelte.js";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import FontAwesomeIcon from "#lib/shared/foundation/ui/FontAwesomeIcon.svelte";
  import { DEFAULT_VIEWER_CUSTOM_COLORS } from "#lib/shared/sequence-viewer/domain/viewer-custom-colors.js";
  import { createViewerCustomColorState } from "#lib/shared/sequence-viewer/state/viewer-custom-colors-state.svelte.js";
  import TunnelArtView from "#lib/shared/sequence-viewer/tunnel/TunnelArtView.svelte";
  import { TunnelViewController } from "#lib/shared/sequence-viewer/tunnel/tunnel-view-controller.svelte.js";
  import { DEFAULT_TUNNEL_VIEW_STATE } from "#lib/shared/sequence-viewer/tunnel/tunnel-view-state.js";
  import MethodPreviewFinger from "./MethodPreviewFinger.svelte";
  import { cellCenter, tunnelLayout } from "./method-preview-compositions";
  import { DEMO_SEQUENCE } from "./method-preview-demo";
  import { createNextSequenceDraw } from "./method-preview-next-sequence";
  import {
    placeGhost,
    sceneGhost,
    tapAt,
    waitUntil,
    type SceneRun,
  } from "./method-preview-run";
  import { playSceneTurns } from "./method-preview-scene-turns.svelte";
  import type { MethodPreviewSceneProps } from "./method-preview-scenes";
  import {
    TUNNEL_PREVIEW_PRESET,
    TUNNEL_PREVIEW_TIMING,
    nextTunnelSequence,
  } from "./method-preview-tunnel";

  let {
    playing,
    turn,
    shape,
    width,
    height,
    accent,
    onready,
  }: MethodPreviewSceneProps = $props();

  // Per-instance state, as TunnelDetailPreview does: nothing here reads or
  // writes the viewer's saved settings. Trails are off in both owners, the
  // effects config (tip effects) and the animation settings (trail mode).
  const effects = createEffectsConfigState(
    { ...DEFAULT_EFFECTS_CONFIG, tipEffectMap: {}, activeEffect: "none" },
    { persist: false }
  );
  setEffectsConfigContext(effects);

  const visibility = new AnimationVisibilityStateManager({ ephemeral: true });
  visibility.setGridMode("none");

  const settings = createAnimationSettingsState({ ephemeral: true });
  settings.setTrailMode(TrailMode.OFF);

  let sequence = $state.raw<SequenceData>(DEMO_SEQUENCE);

  // Its own color state, so the controller neither takes colors staged for
  // the viewer nor saves any.
  const controller = new TunnelViewController({
    getSequence: () => sequence,
    initialViewState: DEFAULT_TUNNEL_VIEW_STATE,
    persistViewState: false,
    visibilityManager: visibility,
    customColorState: createViewerCustomColorState({
      ...DEFAULT_VIEWER_CUSTOM_COLORS,
    }),
  });
  controller.applyPreset(TUNNEL_PREVIEW_PRESET);
  controller.active = true;

  let root = $state<HTMLElement | null>(null);
  let pose = $state.raw<GhostState | null>(null);
  let canvasReady = $state(false);
  /** The performer dips out while it takes its new sequence. */
  let stageHidden = $state(false);
  /** How far the copies have bloomed in around the performer. */
  const copies = new Tween(1, { easing: cubicOut });
  /** The background the canvas paints, light or dark as it is drawn. */
  const canvasBackground = () =>
    visibility.isDarkMode() ? DARK_MODE_BACKGROUND : LIGHT_MODE_BACKGROUND;
  /** The canvas's own background, behind the performer while it dips. */
  let tileColor = $state(canvasBackground());
  /** Show the stage again once the tunnel has built and painted. */
  let revealWhenReady = $state(false);
  let step = $state(1);

  const layout = $derived(tunnelLayout(shape, width, height));

  let announced = false;
  /** The next turn's sequence, drawn in the background. */
  const nextSequenceDraw = createNextSequenceDraw({
    emptyWarning:
      "[method preview] Tunnel source returned no sequence; turning the current one",
    errorWarning: "[method preview] Tunnel could not draw a sequence",
  });

  onDestroy(() => {
    nextSequenceDraw.dispose();
  });

  // The card is ready once the first tunnel has built and painted.
  $effect(() => {
    if (announced || !canvasReady || !controller.layersReady) return;
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        announced = true;
        onready();
        nextSequenceDraw.request();
      });
    });
    return () => cancelAnimationFrame(frame);
  });

  // A hidden stage shows again two frames after its tunnel has built, so the
  // canvas has painted the new performers before anyone sees them.
  $effect(() => {
    if (!revealWhenReady || !canvasReady || !controller.layersReady) return;
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        revealWhenReady = false;
        stageHidden = false;
      });
    });
    return () => cancelAnimationFrame(frame);
  });

  // A sequence the tunnel cannot build gives way to the demo sequence.
  $effect(() => {
    const error = controller.buildError;
    if (error === null || sequence === DEMO_SEQUENCE) return;
    console.warn("[method preview] Tunnel could not build a sequence", error);
    sequence = DEMO_SEQUENCE;
  });

  function settle(): void {
    pose = null;
    if (stageHidden) revealWhenReady = true;
    void copies.set(1, { duration: 0 });
    nextSequenceDraw.request();
  }

  async function play(run: SceneRun): Promise<void> {
    const box = layout;
    if (!box) return;
    // Nothing is drawn ahead under reduced motion. Turns that come back
    // after it ask now, and turn the current sequence if the draw is late.
    nextSequenceDraw.request();
    const timing = TUNNEL_PREVIEW_TIMING;
    // The tunnel plays a moment before the finger comes in.
    if (!(await run.wait(timing.leadMs))) return;
    const finger = sceneGhost(run, () => root);
    pose = finger.ghost;
    const start = cellCenter(box.stage);
    placeGhost(finger, start.x, start.y);
    const dice = cellCenter(box.dice);
    if (!(await tapAt(finger, run, dice.x, dice.y))) return;
    // The copies fold back into the performer the dice belongs to.
    void copies.set(0, { duration: timing.foldMs });
    if (!(await run.wait(timing.foldMs))) return;
    // It dips out over its tile and takes its new sequence unseen.
    tileColor = canvasBackground();
    stageHidden = true;
    if (!(await run.wait(timing.fadeOutMs))) return;
    sequence = nextTunnelSequence(sequence, nextSequenceDraw.take());
    step = 1;
    // Let the controller start its rebuild, so the reveal waits for it.
    await tick();
    if (run.aborted) return;
    finger.ghost.visible = false;
    revealWhenReady = true;
    await waitUntil(run, () => !stageHidden, timing.buildWaitMs);
    if (run.aborted) return;
    if (!(await run.wait(timing.fadeInMs))) return;
    pose = null;
    // Its copies bloom out around it.
    void copies.set(1, { duration: timing.bloomMs });
    await run.wait(timing.bloomMs);
  }

  playSceneTurns(() => ({ playing, turn }), play, {
    root: () => root,
    settle,
  });
</script>

<div
  class="scene"
  bind:this={root}
  style:--accent={accent}
  style:--fade-out="{TUNNEL_PREVIEW_TIMING.fadeOutMs}ms"
  style:--fade-in="{TUNNEL_PREVIEW_TIMING.fadeInMs}ms"
  data-stage={stageHidden ? "hidden" : "shown"}
>
  {#if layout}
    <div
      class="tunnel"
      style:left="{layout.stage.x}px"
      style:top="{layout.stage.y}px"
      style:width="{layout.stage.size}px"
      style:height="{layout.stage.size}px"
      style:--tile={tileColor}
    >
      <div class="art">
        <TunnelArtView
          decorative
          trailOverlay={false}
          {sequence}
          {controller}
          animationSettingsState={settings}
          visibilityManager={visibility}
          {playing}
          bind:currentStep={step}
          stageFit="contain"
          copyReveal={copies.current}
          onCanvasReady={(canvas) => (canvasReady = canvas !== null)}
        />
      </div>
    </div>
    <span
      class="dice"
      class:pressed={pose?.pressed ?? false}
      style:left="{layout.dice.x}px"
      style:top="{layout.dice.y}px"
      style:width="{layout.dice.size}px"
      style:height="{layout.dice.size}px"
      style:font-size="{Math.round(layout.dice.size * 0.5)}px"
    >
      <FontAwesomeIcon icon="dice" style="solid" ariaHidden />
    </span>
  {/if}
  <MethodPreviewFinger {pose} />
</div>

<style>
  .scene {
    position: relative;
    width: 100%;
    height: 100%;
  }

  /* The tunnel's own dark tile, rounded like the tunnel gallery's stage. Its
     backdrop is the canvas's background, so the tile stays while the
     performer dips. */
  .tunnel {
    position: absolute;
    overflow: hidden;
    border-radius: 12%;
    background: var(--tile);
  }

  .art {
    position: absolute;
    inset: 0;
    transition: opacity var(--fade-in, 200ms) ease-out;
  }

  .scene[data-stage="hidden"] .art {
    opacity: 0;
    transition: opacity var(--fade-out, 150ms) ease-in;
  }

  /* The performer card's dice (TunnelPerformerCard's primary PanelButton):
     the theme accent and its glyph. */
  .dice {
    position: absolute;
    display: grid;
    place-items: center;
    border-radius: 22%;
    color: var(--theme-text-on-accent, #fff);
    background: var(--theme-accent, var(--accent));
    box-shadow: 0 2px 6px
      color-mix(in srgb, var(--theme-accent, var(--accent)) 40%, transparent);
    transition: transform 140ms cubic-bezier(0.4, 0, 0.2, 1);
  }

  .dice.pressed {
    transform: scale(0.9);
  }
</style>
