<script lang="ts">
  import PictographRenderer from "$lib/shared/pictograph/shared/components/PictographRenderer.svelte";
  import { pictographPreparer } from "$lib/shared/pictograph/shared/services/pictograph-preparer";
  import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
  import type { PreparedPictographData } from "$lib/shared/pictograph/shared/domain/models/prepared-pictograph-data";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { describePictograph } from "$lib/shared/pictograph/shared/domain/utils/pictograph-description";
  import { getGuidePrintMode } from "../_data/guide-data-context";

  let {
    data,
    pngFallback,
    size = "md",
    label,
    bordered = false,
    showGrid = true,
    showArrows = true,
    propType,
    printMode = false,
    darkMode,
    /** Skip IntersectionObserver and render immediately - use for print/poster contexts. */
    eager = false,
    /** Optional layer toggles - default to this component's long-standing
     *  hardcoded values so every existing caller (which passes none of these)
     *  renders byte-identically. Only the interactive guide Codex page passes
     *  these explicitly, driven by its visibility controls. */
    showTKA = true,
    showTnD = false,
    showElemental = false,
    showPlacements = false,
    showReversals = false,
    showNonRadialPoints = false,
    /** Opt-in theme override for the reflow flow view. "dark" renders the
     *  pictograph dark (dark fill + light grid/props) instead of the print
     *  ink-on-white that getGuidePrintMode() otherwise forces; "light" keeps the
     *  white print look. Undefined = existing behavior (no other caller passes it). */
    forceTheme,
  }: {
    data?: PictographData | null;
    pngFallback?: string;
    size?: "sm" | "md" | "lg";
    label?: string;
    bordered?: boolean;
    showGrid?: boolean;
    showArrows?: boolean;
    propType?: PropType;
    printMode?: boolean;
    darkMode?: boolean;
    eager?: boolean;
    showTKA?: boolean;
    showTnD?: boolean;
    showElemental?: boolean;
    showPlacements?: boolean;
    showReversals?: boolean;
    showNonRadialPoints?: boolean;
    forceTheme?: "light" | "dark";
  } = $props();

  let prepared: PreparedPictographData | null = $state(null);
  let wrapperEl: HTMLElement | undefined = $state();
  let isVisible = $state(false);

  // On the /print route every pictograph must render up front (IntersectionObserver
  // never fires for off-screen cells in a long static document / headless print)
  // and on a light (ink-on-white) background instead of the default dark fill.
  const guidePrint = getGuidePrintMode();
  const eagerEffective = eager || guidePrint;
  // forceTheme="dark" wins over the print/guide-print white background so the
  // reflow flow view can render dark pictographs on the dark editorial theme.
  const printModeEffective = $derived(forceTheme === "dark" ? false : printMode || guidePrint);
  const darkModeEffective = $derived(forceTheme === "dark" ? true : darkMode);

  // Machine-readable notation for crawlers/AT - computed synchronously from raw
  // `data`, so it lands in the SSR/prerendered HTML even though the visual SVG
  // renders client-side (async prepare + IntersectionObserver). Without this the
  // 30+ pictographs on each indexable chapter page are empty, undescribed divs.
  const a11yLabel = $derived(data ? describePictograph(data) : (label ?? ""));
  const hasA11yLabel = $derived(!!a11yLabel && a11yLabel !== "Pictograph (empty)");

  $effect(() => {
    // Eager mode (print/poster): skip the IntersectionObserver and render immediately.
    if (eagerEffective) {
      isVisible = true;
      return;
    }
    if (!wrapperEl) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          isVisible = true;
          observer.disconnect();
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(wrapperEl);
    return () => observer.disconnect();
  });

  $effect(() => {
    if (!data || !isVisible) {
      prepared = null;
      return;
    }
    let cancelled = false;
    pictographPreparer
      .prepareSingle(data, {
        themeMode: forceTheme === "dark" ? "dark" : "light",
        ...(propType ? { leftPropType: propType, rightPropType: propType } : {}),
      })
      .then((result) => {
        if (cancelled) return;
        const prep = result._prepared;
        if (prep) {
          const tweakedArrows = showArrows
            ? { arrowPositions: prep.arrowPositions, arrowAssets: prep.arrowAssets, arrowMirroring: prep.arrowMirroring }
            : { arrowPositions: {}, arrowAssets: {}, arrowMirroring: {} };

          const tweakedPropAssets = { ...prep.propAssets };
          if (propType === PropType.HAND && tweakedPropAssets.right) {
            const [w] = tweakedPropAssets.right.viewBox.split(" ").map(Number);
            tweakedPropAssets.right = {
              ...tweakedPropAssets.right,
              imageSrc: `<g transform="translate(${w},0) scale(-1,1)">${tweakedPropAssets.right.imageSrc}</g>`,
            };
          }

          prepared = {
            ...result,
            _prepared: { ...prep, ...tweakedArrows, propAssets: tweakedPropAssets },
          };
        } else {
          prepared = result;
        }
      });
    return () => {
      cancelled = true;
    };
  });
</script>

<div
  bind:this={wrapperEl}
  class="guide-pictograph size-{size}"
  class:bordered
  role={hasA11yLabel ? "img" : undefined}
  aria-label={hasA11yLabel ? a11yLabel : undefined}
>
  <div class="pictograph-wrapper">
    {#if prepared}
      <PictographRenderer
        pictograph={prepared}
        {showGrid}
        printMode={printModeEffective}
        darkMode={darkModeEffective}
        {showTKA}
        {showReversals}
        {showTnD}
        {showElemental}
        {showPlacements}
        {showNonRadialPoints}
        leftMotionVisible={true}
        rightMotionVisible={true}
      />
    {:else if pngFallback}
      <img class="fallback-img" src={pngFallback} alt={label ?? "pictograph"} loading="lazy" />
      {#if import.meta.env.DEV}
        <span class="fallback-badge">PNG</span>
      {/if}
    {/if}
  </div>
  {#if label}
    <span class="pictograph-label">{label}</span>
  {/if}
</div>

<style>
  .guide-pictograph {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }

  .pictograph-wrapper {
    width: 100%;
    aspect-ratio: 1;
  }

  .guide-pictograph.size-sm .pictograph-wrapper {
    max-width: 140px;
  }

  .guide-pictograph.size-md .pictograph-wrapper {
    max-width: 200px;
  }

  .guide-pictograph.size-lg .pictograph-wrapper {
    max-width: 280px;
  }

  .guide-pictograph.bordered .pictograph-wrapper {
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 8px;
    overflow: hidden;
  }

  .pictograph-label {
    font-size: 0.8rem;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    text-align: center;
  }

  .fallback-img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .fallback-badge {
    position: absolute;
    top: 4px;
    right: 4px;
    font-size: 0.6rem;
    padding: 1px 4px;
    background: rgba(255, 165, 0, 0.8);
    border-radius: 3px;
    color: black;
    font-weight: 600;
  }
</style>
