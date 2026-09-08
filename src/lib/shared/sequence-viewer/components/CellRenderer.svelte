<!--
  CellRenderer.svelte

  Renders individual pictograph cells with progressive loading, cross-fade
  dark mode transitions, step number overlays, and solo-mode annotations.
  Extracted from ChoreoCard.svelte - owns the cellContent snippet and
  per-cell visual presentation.
-->
<script lang="ts">
  import LiveCardPictograph from "./LiveCardPictograph.svelte";
  import { fade } from "svelte/transition";
  import ProgressRing from "$lib/shared/components/loading/ProgressRing.svelte";
  import type { MotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
  import { getScanCardCloudProbe } from "../scan-card-cloud-context";

  import type { ChoreoCardCell as CellData } from "$lib/shared/choreo-card/services/choreo-card-render-engine";

  interface Props {
    cell: CellData;
    showDurBadge: boolean;
    showStepNumbers: boolean;
    activeDarkMode: boolean;
    crossfadeActive: boolean;
    transitionMode: "crossfade" | "swap";
    isBrowseSoloMode: boolean;
    isMotionSoloMode: boolean;
    soloHand: "left" | "right" | undefined;
    stepNumFontSize: number;
    hasMixedDurations: boolean;
    formatDuration: (d: number) => string;
    getMotionSoloMotion: (cellIndex: number) => MotionData | undefined;
    formatSoloTurns: (turns: number | "fl" | undefined | null) => string;
    shortOrientation: (ori: string | undefined | null) => string | null;
  }

  const {
    cell,
    showDurBadge,
    showStepNumbers,
    activeDarkMode,
    crossfadeActive,
    transitionMode,
    isBrowseSoloMode,
    isMotionSoloMode,
    soloHand,
    stepNumFontSize,
    hasMixedDurations,
    formatDuration,
    getMotionSoloMotion,
    formatSoloTurns,
    shortOrientation,
  }: Props = $props();

  const isSwapMode = $derived(transitionMode === "swap");
  const scanUsesHtmlStepNumbers = getScanCardCloudProbe();
</script>

{#if cell.live}
  <LiveCardPictograph
    live={cell.live}
    darkMode={activeDarkMode}
    stepNumber={cell.index + 1}
    showStepNumber={showStepNumbers && !isMotionSoloMode && (!isBrowseSoloMode || cell.index === -1)}
  />
{:else if cell.renderFailed}
  <div class="cell-render-error" role="img" aria-label="Pictograph unavailable">
    <span aria-hidden="true">!</span>
  </div>
{:else if cell.isLoaded}
  {#if cell.fadeOutUrl}
    <img
      class="cell-image cell-fade-old"
      class:fading={crossfadeActive}
      class:swap-out={isSwapMode && crossfadeActive}
      src={cell.fadeOutUrl}
      alt=""
      draggable="false"
    />
  {/if}
  <img
    class="cell-image"
    class:cell-fade-new={!!cell.fadeOutUrl && !isSwapMode}
    class:cell-swap-new={!!cell.fadeOutUrl && isSwapMode}
    class:reveal={crossfadeActive}
    src={cell.imageUrl}
    alt={cell.label}
    draggable="false"
  />
{:else}
  <div class="cell-spinner-container">
    <ProgressRing percent={-1} size={20} strokeWidth={2} />
  </div>
{/if}

{#if cell.live || cell.isLoaded}
  <!-- Normal-mode step numbers are baked into the cell image (see
       step-number-compositor) so they dissolve in lockstep with the pictograph
       during crossfades. Scan cards skip that expensive bitmap rewrite and use
       the same positioned HTML number; motion-solo and start cells already use
       it everywhere. -->
  {#if showStepNumbers && ((scanUsesHtmlStepNumbers && !isBrowseSoloMode) || isMotionSoloMode || (!cell.live && cell.index === -1))}<span
      class="step-number-overlay"
      class:dark-mode={activeDarkMode}
      style="font-size: {stepNumFontSize}px;"
      transition:fade|local={{ duration: 150 }}>{cell.label}</span
    >{/if}
  {#if showDurBadge && hasMixedDurations && cell.duration !== 1}<span
      class="duration-badge"
      class:dark-mode={activeDarkMode}>{formatDuration(cell.duration)}</span
    >{/if}
  {#if isMotionSoloMode || (isBrowseSoloMode && showStepNumbers)}
    {@const soloMotion = getMotionSoloMotion(cell.index)}
    {#if soloMotion}
      <span
        class="solo-locations"
        class:browse={isBrowseSoloMode}
        class:dark-mode={activeDarkMode}
        transition:fade|local={{ duration: 150 }}
      >
        <span class="solo-loc-letter"
          >{(soloMotion.startLocation ?? "").toLowerCase()}</span
        >
        <img
          class="solo-loc-arrow"
          src="/images/arrow.svg"
          alt="to"
          aria-hidden="true"
          draggable="false"
        />
        <span class="solo-loc-letter"
          >{(soloMotion.endLocation ?? "").toLowerCase()}</span
        >
      </span>
      {@const turnsLabel = formatSoloTurns(soloMotion.turns)}
      {#if turnsLabel}
        <span
          class="solo-turn-number"
          class:dark-mode={activeDarkMode}
          style="color: {soloHand === 'left'
            ? 'var(--prop-blue, #2196f3)'
            : 'var(--prop-red, #f44336)'};"
          transition:fade|local={{ duration: 150 }}>{turnsLabel}</span
        >
      {/if}
      {#if isMotionSoloMode}
        {@const startOri = shortOrientation(soloMotion.startOrientation)}
        {@const endOri = shortOrientation(soloMotion.endOrientation)}
        {#if startOri && endOri}
          <span
            class="solo-orientation"
            class:dark-mode={activeDarkMode}
            transition:fade|local={{ duration: 150 }}
          >
            <span class="solo-ori-letter">{startOri}</span>
            <img
              class="solo-ori-arrow"
              src="/images/arrow.svg"
              alt="to"
              aria-hidden="true"
              draggable="false"
            />
            <span class="solo-ori-letter">{endOri}</span>
          </span>
        {/if}
      {/if}
    {/if}
  {/if}
{/if}

<style>
  .cell-image {
    display: block;
    width: 100%;
    height: 100%;
    /* Use 'cover' to fill the cell completely - images are rendered as squares
       so there should be no cropping. 'contain' was causing gaps when images
       had slightly different aspect ratios. */
    object-fit: cover;
    -webkit-user-drag: none;
    user-select: none;
  }

  .cell-render-error {
    display: grid;
    width: 100%;
    height: 100%;
    place-items: center;
    color: color-mix(in srgb, currentColor 62%, transparent);
    font:
      700 clamp(1rem, 10cqw, 2rem) / 1 Inter,
      sans-serif;
  }

  .cell-render-error span {
    display: grid;
    width: 1.5em;
    height: 1.5em;
    place-items: center;
    border: 1px solid currentColor;
    border-radius: 50%;
  }

  /* First paint: fade the freshly loaded pictograph in instead of popping.
     Scoped to :not(.cell-fade-old) ONLY — the persistent "new" img must keep a
     constant animation-name across a crossfade so a class change never restarts
     the pop-in. Excluding .cell-fade-new/.cell-swap-new here (as before) meant
     that clearing fadeOutUrl at crossfade cleanup flipped animation-name
     none→cellLoadIn on every cell at once, re-firing the pop-in — the whole grid
     "flashed out and in" AFTER the transition. The animation is a one-shot at
     mount (long finished before any crossfade), so it never fights the crossfade
     opacity; keeping its name on the element is what stops the restart. The old
     fade layer stays excluded so it doesn't pop-in on the way out. */
  .cell-image:not(.cell-fade-old) {
    animation: cellLoadIn var(--duration-fast, 150ms) ease;
  }
  @keyframes cellLoadIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  /* Cross-fade: old image fades out while new image fades in simultaneously.
     Both images are stacked in the same cell during the transition. */
  .cell-fade-old {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    z-index: 1;
    opacity: 1;
    transition: opacity 350ms ease;
    pointer-events: none;
  }

  .cell-fade-old.fading {
    opacity: 0;
  }

  .cell-image.cell-fade-new {
    opacity: 0;
  }

  .cell-image.cell-fade-new.reveal {
    opacity: 1;
    transition: opacity 350ms ease;
  }

  /* Sequential swap: old exits fully before new enters. No overlap. */
  .cell-fade-old.swap-out {
    opacity: 0;
    transition: opacity 150ms ease-out;
  }

  .cell-image.cell-swap-new {
    opacity: 0;
  }

  .cell-image.cell-swap-new.reveal {
    opacity: 1;
    transition: opacity 200ms ease-in 150ms;
  }

  /* HTML annotation overlays (start "Start" label, solo location/turn/orientation,
     duration badge) MUST paint above BOTH crossfade image layers. The old fade
     layer is `position:absolute; z-index:1`, which — being a positioned element
     with an explicit z-index — stacks above these auto-z-index absolute overlays
     regardless of DOM order. Without this, starting a crossfade instantly covered
     the "Start" text with the opaque outgoing image, so it popped out and back in
     as the layer faded. z-index:2 keeps the text on top for the whole transition. */
  .step-number-overlay,
  .duration-badge,
  .solo-locations,
  .solo-turn-number,
  .solo-orientation {
    z-index: 2;
  }

  /* Step number overlay - rendered as HTML instead of baked into blobs
     so identical pictographs at different steps share one cached image */
  .step-number-overlay {
    position: absolute;
    top: 5.3%;
    left: 5.3%;
    font-family: Georgia, serif;
    font-weight: bold;
    /* font-size set via inline style from stepNumFontSize (cellWidth-based)
       so wider duration cells get the same number size as square cells */
    line-height: 1;
    color: #231f20;
    pointer-events: none;
    user-select: none;
  }

  .step-number-overlay.dark-mode {
    color: #ffffff;
  }

  /* Duration badge - bottom-center, matches DurationGlyph.svelte positioning
     (y=890 in 950-unit viewBox = ~93.7% from top, centered horizontally) */
  .duration-badge {
    position: absolute;
    bottom: 2%;
    left: 50%;
    transform: translateX(-50%);
    font-family:
      Inter,
      "SF Pro Display",
      -apple-system,
      BlinkMacSystemFont,
      sans-serif;
    font-weight: 600;
    font-size: min(5.5cqw, 14px);
    line-height: 1;
    color: #231f20;
    pointer-events: none;
    user-select: none;
  }

  .duration-badge.dark-mode {
    color: #ffffff;
  }

  /* Motion-solo top-center locations - matches PositionGlyph composition.
     Canonical arrow dimensions from PositionGlyph: 88.9 × 34.8 * 0.75
     ≈ 66.675 × 26.1 units in a 950-unit pictograph viewBox, i.e.
     7.02cqw wide by 2.75cqw tall when 100cqw == cell width. We keep the
     same arrow SVG and size it identically so headers read consistently. */
  .solo-locations {
    position: absolute;
    top: 3.5%;
    left: 50%;
    transform: translateX(-50%);
    display: inline-flex;
    align-items: center;
    /* Wider breathing room around the arrow — round letters like "s" read as
       cramped against it at the tighter spacing. */
    gap: 1.15cqw;
    font-family: Cambria, "Hoefler Text", Georgia, serif;
    font-weight: 700;
    font-size: 7.9cqw; /* matches scaled letter height in PositionGlyph */
    line-height: 1;
    color: #231f20;
    pointer-events: none;
    user-select: none;
  }

  .solo-locations.dark-mode {
    color: #ffffff;
  }

  /* Browse-solo (single prop path preview): a single prop path is all about
     where it travels, so the start→end pair is the headline — bigger than the
     motion-solo header, and kept at the bottom where it started. The turn count
     keeps its conventional bottom-left corner; the pair is centered, so the two
     sit side by side without colliding. */
  .solo-locations.browse {
    top: auto;
    bottom: 4%;
    font-size: 9.2cqw;
    font-weight: 700;
    opacity: 0.92;
  }

  .solo-loc-letter {
    /* true lowercase, no small-caps */
    text-transform: lowercase;
    letter-spacing: 0.015em;
  }

  /* Shared arrow sizing - both header rows use the exact dimensions of
     the PositionGlyph's rendered arrow so the two look like siblings. The
     letters are lowercase, so their visual mass (x-height) sits BELOW the
     line's geometric middle; flex-centering leaves the arrow floating above
     them. Drop the arrow onto the lowercase optical center so the tail-to-head
     line reads as pointing from the middle of one letter to the middle of the
     next. Tune the em value if it drifts high/low. */
  .solo-loc-arrow,
  .solo-ori-arrow {
    width: 7.02cqw;
    height: auto; /* aspect ratio preserved at 88.9:34.8 */
    flex-shrink: 0;
    transform: translateY(0.1em);
  }

  :global(:root.dark) .solo-locations .solo-loc-arrow,
  .solo-locations.dark-mode .solo-loc-arrow,
  :global(:root.dark) .solo-orientation .solo-ori-arrow,
  .solo-orientation.dark-mode .solo-ori-arrow {
    filter: invert(0.92);
  }

  /* Motion-solo turn number - single colored digit where the TKA glyph's
     turns column sat. Kept small so it reads as a secondary annotation. */
  .solo-turn-number {
    position: absolute;
    left: 8%;
    bottom: 6%;
    font-family: Georgia, serif;
    font-weight: 700;
    font-size: min(10cqw, 28px);
    line-height: 1;
    pointer-events: none;
    user-select: none;
  }

  /* Motion-solo orientation annotation - bottom-center, below the
     southernmost outer grid dot. Not bold; shares the arrow size with
     the top locations row so both headers feel matched. */
  .solo-orientation {
    position: absolute;
    bottom: 3%;
    left: 50%;
    transform: translateX(-50%);
    display: inline-flex;
    align-items: center;
    gap: 0.7cqw;
    font-family: Cambria, "Hoefler Text", Georgia, serif;
    font-weight: 400;
    font-size: 7.9cqw;
    line-height: 1;
    color: #231f20;
    opacity: 0.85;
    pointer-events: none;
    user-select: none;
  }

  .solo-orientation.dark-mode {
    color: #ffffff;
  }

  .solo-ori-letter {
    text-transform: lowercase;
    letter-spacing: 0;
  }

  /* Per-cell loading spinner */
  .cell-spinner-container {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    aspect-ratio: 1;
  }

  /* Accessibility: Respect user's motion preferences (WCAG AAA) */
  @media (prefers-reduced-motion: reduce) {
    .cell-fade-old,
    .cell-image.cell-fade-new {
      transition: none;
    }
    .cell-image {
      animation: none;
    }
  }
</style>
