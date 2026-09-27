<!--
  ComposerTunnelDemo

  The Tunnel section's live embed: the real kaleidoscope renderer
  (TunnelArtView) multiplying the baked demo fixture across a ring.

  Follows TunnelDetailPreview's per-instance seam (the proven pattern for
  mounting the tunnel outside the sequence viewer): local TunnelViewController,
  local effects-config context with persist:false, stub playback. Unlike the
  collection preview we apply only defaults to the controller, so the global
  visibility/trail singletons are left untouched — but the controller DOES
  persist its view state to localStorage on config change, so that key is
  captured on mount and restored on destroy.

  This component statically imports the heavy tunnel stack — the page must
  mount it through LazyMount so none of it lands in the eager graph.
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte";
  import { MediaQuery } from "svelte/reactivity";
  import { onDestroy, type Snippet } from "svelte";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import TunnelArtView from "$lib/shared/sequence-viewer/tunnel/TunnelArtView.svelte";
  import type { ComposerPropAppearance } from "./composer-prop-appearance";
  import { TunnelViewController } from "$lib/shared/sequence-viewer/tunnel/tunnel-view-controller.svelte";
  import {
    loadTunnelViewState,
    saveTunnelViewState,
  } from "$lib/shared/sequence-viewer/tunnel/tunnel-view-state";
  import {
    MAX_IMAGES,
    MAX_IMAGES_RM,
    imageCount,
  } from "$lib/shared/sequence-viewer/tunnel/tunnel-config";
  import { createEffectsConfigState } from "$lib/shared/effects/state/effects-config-state.svelte";
  import { setEffectsConfigContext } from "$lib/shared/effects/state/effects-config-context";
  import {
    createSequenceData,
    type SequenceData,
  } from "$lib/shared/foundation/domain/models/sequence-data";
  import { simplifyRepeatedWord } from "$lib/shared/foundation/utils/word-simplifier";
  import type { ViewerPlaybackState } from "$lib/shared/sequence-viewer/domain/viewer-prop-groups";

  /**
   * `layout`:
   *   "square" (default) — the original centered square plus the Performers
   *     row. Any existing consumer renders exactly as before.
   *   "band" — a two-column composition: the square stage left (the renderer
   *     is square-only), a control column right.
   */
  let {
    sequence: sourceSequence,
    layout = "square",
    leftPropType = "staff",
    rightPropType = "staff",
    appearance,
    propControl,
  }: {
    sequence: SequenceData;
    layout?: "square" | "band";
    leftPropType?: string;
    rightPropType?: string;
    appearance?: ComposerPropAppearance;
    propControl?: Snippet;
  } = $props();

  const reduceMotion = new MediaQuery("(prefers-reduced-motion: reduce)");
  let playing = $state(!reduceMotion.current);
  let fold = $state(layout === "band" ? 8 : 4);

  /** Band-only arrangement — three points in the shipped TunnelConfig space. */
  type Arrangement = "ring" | "mirrored" | "canon";
  const ARRANGEMENTS: {
    value: Arrangement;
    label: string;
    mirror: boolean;
    staggerSteps: number;
  }[] = [
    { value: "ring", label: "Ring", mirror: false, staggerSteps: 0 },
    { value: "mirrored", label: "Mirrored", mirror: true, staggerSteps: 0 },
    { value: "canon", label: "Canon", mirror: false, staggerSteps: 1 },
  ];
  let arrangement = $state<Arrangement>("ring");
  const current = $derived(
    ARRANGEMENTS.find((a) => a.value === arrangement) ?? ARRANGEMENTS[0]!
  );

  $effect(() => {
    if (reduceMotion.current) playing = false;
  });

  /** The controller's live image budget (reduced motion tightens it). A combo
   *  that would exceed it is disabled, never silently clamped. */
  const budget = $derived(reduceMotion.current ? MAX_IMAGES_RM : MAX_IMAGES);
  const fits = (f: number, mirror: boolean) =>
    imageCount({
      fold: f,
      mirror,
      flip: false,
      invert: false,
      echo: false,
      staggerSteps: 0,
      speedOverrides: {},
    }) <= budget;

  const foldOptions = $derived(
    [2, 4, 8].map((f) => ({
      value: String(f),
      label: String(f),
      disabled: layout === "band" ? !fits(f, current.mirror) : false,
    }))
  );
  const arrangementOptions = $derived(
    ARRANGEMENTS.map((a) => ({
      value: a.value,
      label:
        a.value === "ring"
          ? t("composer_demo_ring")
          : a.value === "mirrored"
            ? t("composer_demo_mirrored")
            : t("composer_demo_canon"),
      disabled: !fits(fold, a.mirror),
    }))
  );

  const prevTunnelViewState = loadTunnelViewState();

  const effects = createEffectsConfigState(undefined, { persist: false });
  setEffectsConfigContext(effects);

  // Derived, not snapshotted. The controller reads it through `getSequence`,
  // and its own re-bake effect picks the new topology up, so the host can swap
  // the sequence without remounting the renderer.
  const sequence = $derived(
    createSequenceData({
      id: "composer-tunnel-demo",
      name: sourceSequence.word,
      word: sourceSequence.word,
      steps: sourceSequence.steps,
      gridMode: sourceSequence.gridMode,
    })
  );

  const controller = new TunnelViewController({ getSequence: () => sequence });
  controller.active = true;

  $effect(() => {
    controller.applyConfig({
      fold,
      mirror: layout === "band" ? current.mirror : false,
      flip: false,
      invert: false,
      echo: false,
      staggerSteps: layout === "band" ? current.staggerSteps : 0,
      speedOverrides: {},
    });
  });

  const playback = {
    animationState: { sequenceData: undefined },
  } as unknown as ViewerPlaybackState;

  onDestroy(() => {
    saveTunnelViewState(prevTunnelViewState);
  });
</script>

{#snippet stage()}
  <div class="stage">
    <div
      class="art"
      role="img"
      aria-label="Live tunnel performance of {simplifyRepeatedWord(
        sequence.word
      )}, multiplied across {fold} copies{layout === 'band'
        ? `, ${current.label.toLowerCase()} arrangement`
        : ''}"
    >
      <TunnelArtView
        {sequence}
        {playback}
        {controller}
        bpm={60}
        {leftPropType}
        {rightPropType}
        {...appearance}
        bind:playing
      />
    </div>
    <button
      type="button"
      class="pause-toggle"
      aria-label={playing ? "Pause preview" : "Play preview"}
      onclick={() => (playing = !playing)}
    >
      <i class="fas {playing ? 'fa-pause' : 'fa-play'}" aria-hidden="true"></i>
    </button>
  </div>
{/snippet}

{#snippet performers()}
  <SegmentedControl
    options={foldOptions}
    value={String(fold)}
    onchange={(v) => (fold = Number(v))}
    ariaLabel={t("composer_demo_tunnel_performers")}
    color="accent"
    size="md"
  />
{/snippet}

{#if layout === "band"}
  <div class="tunnel-demo band">
    <div class="band-stage">
      {@render stage()}
    </div>
    <div class="band-controls">
      <h3 class="band-title">Tunnel</h3>
      <p class="band-caption">{t("composer_demo_tunnel_caption")}</p>
      <div class="band-prop-control">{@render propControl?.()}</div>
      <div class="control-row">
        <span class="control-label">{t("composer_demo_performers")}</span>
        {@render performers()}
      </div>
      <div class="control-row">
        <span class="control-label">{t("composer_demo_arrangement")}</span>
        <SegmentedControl
          options={arrangementOptions}
          value={arrangement}
          onchange={(v) => (arrangement = v as Arrangement)}
          ariaLabel={t("composer_demo_tunnel_arrangement")}
          color="accent"
          size="md"
        />
      </div>
    </div>
  </div>
{:else}
  <div class="tunnel-demo">
    {@render stage()}

    <div class="fold-row">
      <span class="control-label">{t("composer_demo_performers")}</span>
      {@render performers()}
    </div>
  </div>
{/if}

<style>
  /* Spacing to the prose above is owned by the host's duo grid gap. */
  .stage {
    position: relative;
    aspect-ratio: 1;
    max-width: min(30rem, 100%);
    margin-inline: auto;
    background: #000;
    border-radius: 18px;
    overflow: hidden;
    border: 1px solid oklch(0.4 0.04 270 / 0.18);
  }
  .art {
    position: absolute;
    inset: 0;
  }
  /* Ultrawide: the duo column has the room — the kaleidoscope becomes a
     near-viewport moment (height-keyed, so it scales with the screen).
     Keep in sync with the page's .sk-stage-square placeholder. */
  @media (min-width: 1680px) {
    .stage {
      max-width: min(72vh, 100%);
    }
  }

  .pause-toggle {
    position: absolute;
    right: 12px;
    bottom: 12px;
    width: max(var(--min-touch-target, 48px), 48px);
    height: max(var(--min-touch-target, 48px), 48px);
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.55);
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: rgba(255, 255, 255, 0.85);
    font-size: 14px;
    cursor: pointer;
    backdrop-filter: blur(4px);
  }
  .pause-toggle:hover {
    background: rgba(0, 0, 0, 0.75);
    color: #fff;
  }
  .pause-toggle:focus-visible {
    outline: 2px solid var(--theme-accent, #8b8cff);
    outline-offset: 3px;
  }

  /* Deterministic footprint: capped width, one-line labels, so the row is
     always exactly one 52px control tall — the page's tunnel skeleton
     reserves this exact height (no-layout-shift). */
  .fold-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.55rem;
    margin-top: 1rem;
    width: min(100%, 22rem);
    margin-inline: auto;
  }
  .control-label {
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: oklch(0.74 0.018 270);
  }

  .fold-row :global(.segment),
  .control-row :global(.segment) {
    min-height: max(var(--min-touch-target, 48px), 48px);
  }

  /* Band: square stage left, control column right. The renderer is square-only,
     so the stage keeps aspect-ratio 1 and is height-keyed. */
  .tunnel-demo.band {
    display: grid;
    /* The stage track is sized here, not on .band-stage: a percentage width
       inside an `auto` track is cyclic and resolves to zero. */
    grid-template-columns: minmax(0, min(46rem, 62vh)) minmax(16rem, 30rem);
    gap: clamp(1.5rem, 4vw, 3rem);
    align-items: center;
    justify-content: center;
  }
  .band-stage {
    width: 100%;
    min-width: 0;
  }
  .tunnel-demo.band .stage {
    max-width: 100%;
  }
  .band-controls {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    max-width: 30rem;
    width: 100%;
  }
  .band-prop-control {
    align-self: flex-start;
  }
  .band-title {
    margin: 0;
    font-size: var(--font-size-lg, 1.25rem);
    font-weight: 700;
    letter-spacing: 0.01em;
  }
  /* Deterministic footprint: fixed label column and fixed row height, so the
     row never moves when the selected value changes (no-layout-shift). */
  .control-row {
    display: grid;
    grid-template-columns: 7.5rem minmax(0, 1fr);
    align-items: center;
    gap: 0.75rem;
    min-height: max(var(--min-touch-target, 48px), 48px);
  }

  @media (max-width: 959.98px) {
    .tunnel-demo.band {
      grid-template-columns: minmax(0, 1fr);
    }
    .band-stage {
      width: min(46rem, 62vh, 100%);
      margin-inline: auto;
    }
    .band-controls {
      align-items: center;
      text-align: center;
      margin-inline: auto;
    }
    .band-prop-control {
      align-self: center;
    }
    /* Stacked: the control keeps a real track, not its intrinsic width,
       so three short labels never collapse into 29px segments. */
    .control-row {
      grid-template-columns: 7.5rem minmax(14rem, 22rem);
      justify-content: center;
    }
  }

  /* Phone width: the label sits above its control so three segments never
     press against the frame edge. */
  @media (max-width: 30rem) {
    .control-row {
      grid-template-columns: 1fr;
      justify-items: center;
      row-gap: 0.4rem;
    }
  }
</style>
