<!--
  MandalaDetailPreview.svelte — a live redraw of a published mandala
  (Browse Phase 5A).

  The public payload carries geometry, not pixels: a mandala's image is a pure
  function of its steps, so the guest view renders it with the real
  SequenceMandala renderer rather than blowing up the Storage poster. The poster
  exists for the list grid and for link unfurls; here the artwork is live and
  scales to the box it is given.

  It fills its host's box and draws the mandala as the largest square that fits
  inside it, so it is never wider than the box. The host owns the pause control
  (autoplaying motion needs a user-reachable pause, WCAG 2.2.2) and passes
  `playing`; the undulation is off entirely under prefers-reduced-motion.
-->
<script lang="ts">
  import SequenceMandala from "#lib/shared/mandala/components/SequenceMandala.svelte";
  import { savedMandalaPalette } from "#lib/shared/mandala/domain/mandala-palette.js";
  import type { MandalaPublicPayload } from "#lib/features/mandala/tabs/collection/domain/mandala-public-revision.js";

  let {
    payload,
    playing = true,
    onReady,
  }: {
    payload: MandalaPublicPayload;
    playing?: boolean;
    /** The first frame is on screen. */
    onReady?: () => void;
  } = $props();

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

  const animating = $derived(playing && !reducedMotion);

  // The stage reserves its box up front, so the mandala arriving never
  // reflows its host (no-layout-shift.md). The mandala is the largest square
  // that fits inside that box.
  let stageEl = $state<HTMLElement | null>(null);
  let stageSize = $state(0);

  $effect(() => {
    if (!stageEl) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        stageSize = Math.floor(Math.min(width, height));
      }
    });
    ro.observe(stageEl);
    return () => ro.disconnect();
  });

  // Ready once a real size has been drawn and painted: two frames, so a host
  // that fades this in never fades up an empty box.
  let readySent = false;
  $effect(() => {
    if (readySent || stageSize <= 0 || !onReady) return;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        readySent = true;
        onReady();
      });
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  });

  const sequence = $derived({ steps: payload.steps });
  // The maker's colors, the same as the poster that opened this page.
  const palette = $derived(savedMandalaPalette(payload.colors));
</script>

<div class="mandala-stage" bind:this={stageEl}>
  {#if stageSize > 0}
    <SequenceMandala
      {sequence}
      size={stageSize}
      show={payload.variant}
      leftPropType={payload.leftPropType}
      rightPropType={payload.rightPropType}
      pathShape={payload.pathShape ?? "arc"}
      {palette}
      animate={animating}
      animateMin={ANIMATE_MIN}
      animateMax={ANIMATE_MAX}
      animatePeriod={BASE_PERIOD}
      animateEasing="sine"
      animateRotation={reducedMotion ? 0 : 90}
    />
  {/if}
</div>

<style>
  .mandala-stage {
    display: flex;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }
</style>
