<!--
  MandalaDetailPreview.svelte — a live redraw of a published mandala
  (Browse Phase 5A).

  The public payload carries geometry, not pixels: a mandala's image is a pure
  function of its steps, so the guest view renders it with the real
  SequenceMandala renderer rather than blowing up the Storage poster. The poster
  exists for the list grid and for link unfurls; here the artwork is live and
  scales to the viewport.

  Autoplaying motion needs a user-reachable pause (WCAG 2.2.2), and the
  undulation is off entirely under prefers-reduced-motion.
-->
<script lang="ts">
  import SequenceMandala from "#lib/shared/mandala/components/SequenceMandala.svelte";
  import type { MandalaPublicPayload } from "#lib/features/mandala/tabs/collection/domain/mandala-public-revision.js";

  const { payload }: { payload: MandalaPublicPayload } = $props();

  // Same undulation envelope the Mandala module meditates with.
  const ANIMATE_MIN = 0;
  const ANIMATE_MAX = 250;
  const BASE_PERIOD = 5;

  let reducedMotion = $state(
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false
  );

  $effect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = (e: MediaQueryListEvent) => {
      reducedMotion = e.matches;
    };
    reducedMotion = mql.matches;
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  });

  let playing = $state(true);
  const animating = $derived(playing && !reducedMotion);

  // The stage reserves a square box up front, so the mandala arriving never
  // reflows the detail shell (no-layout-shift.md).
  let stageEl = $state<HTMLElement | null>(null);
  let stageSize = $state(320);

  $effect(() => {
    if (!stageEl) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        stageSize = Math.max(160, Math.min(width, height));
      }
    });
    ro.observe(stageEl);
    return () => ro.disconnect();
  });

  const sequence = $derived({ steps: payload.steps });
</script>

<div class="mandala-preview">
  <div class="mandala-stage" bind:this={stageEl}>
    <SequenceMandala
      {sequence}
      size={stageSize}
      show={payload.variant}
      leftPropType={payload.leftPropType}
      rightPropType={payload.rightPropType}
      pathShape={payload.pathShape ?? "arc"}
      animate={animating}
      animateMin={ANIMATE_MIN}
      animateMax={ANIMATE_MAX}
      animatePeriod={BASE_PERIOD}
      animateEasing="sine"
      animateRotation={reducedMotion ? 0 : 90}
    />
  </div>

  <div class="preview-footer">
    {#if payload.sourceWord}
      <span class="source-word">{payload.sourceWord}</span>
    {:else}
      <span class="source-word placeholder" aria-hidden="true"></span>
    {/if}
    {#if !reducedMotion}
      <button
        type="button"
        class="motion-btn"
        aria-pressed={playing}
        onclick={() => (playing = !playing)}
      >
        <i
          class="fas {playing ? 'fa-pause' : 'fa-play'}"
          aria-hidden="true"
        ></i>
        <span>{playing ? "Pause motion" : "Play motion"}</span>
      </button>
    {/if}
  </div>
</div>

<style>
  .mandala-preview {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    width: 100%;
    height: 100%;
    min-height: 0;
  }

  .mandala-stage {
    display: flex;
    flex: 1;
    min-height: 0;
    width: 100%;
    aspect-ratio: 1;
    max-height: 100%;
    align-items: center;
    justify-content: center;
  }

  .preview-footer {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 16px;
    flex-wrap: wrap;
    min-height: 48px;
  }

  .source-word {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.62));
    font-size: var(--font-size-min, 14px);
    letter-spacing: 0.04em;
  }

  /* Reserves the row height whether or not a source word exists, so the
     footer never jumps between mandalas. */
  .source-word.placeholder {
    min-width: 1px;
  }

  .motion-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 44px;
    padding: 8px 16px;
    border: 1px solid
      color-mix(in srgb, var(--theme-accent, #22d3ee) 45%, transparent);
    border-radius: 10px;
    background: transparent;
    color: var(--theme-accent-text, var(--theme-accent, #22d3ee));
    font-size: var(--font-size-compact, 12px);
    font-weight: 650;
    cursor: pointer;
  }

  @media (hover: hover) {
    .motion-btn:hover {
      background: color-mix(
        in srgb,
        var(--theme-accent, #22d3ee) 12%,
        transparent
      );
    }
  }

  .motion-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #22d3ee);
    outline-offset: 2px;
  }
</style>
