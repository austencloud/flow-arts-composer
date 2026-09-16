<!--
  ChoreoCard.svelte - Card front for Choreo Cards

  Displays a sequence thumbnail using PropAwareThumbnail with Firebase caching.
  The front is the "reading" face: word, level, LOOP icons, pictographs, footer.
-->
<script lang="ts">
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { HapticFeedback } from "$lib/shared/application/services/haptic-feedback";
  import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { onMount } from "svelte";
  import PropAwareThumbnail from "$lib/shared/browse/components/PropAwareThumbnail.svelte";
  import { settingsService } from "$lib/shared/settings/state/settings-state.svelte";
  import VisualSequenceSaveContextMenuHost from "$lib/shared/library/components/VisualSequenceSaveContextMenuHost.svelte";

  interface Props {
    sequence: SequenceData;
    printMode?: boolean;
    showQRCodes?: boolean;
    // Visibility settings
    handPointsVisible?: boolean;
    showGrid?: boolean;
    showTKA?: boolean;
    showWord?: boolean;
    includeStartPlacement?: boolean;
    /** "row" = start position as top row, "column" = start position as left column */
    startPlacementLayout?: "row" | "column";
    /** Render as hand path card: HAND props, float arrows, no TKA/reversals */
    handPathMode?: boolean;
    /** Use 5:7 playing card layout for physical card export (different from printMode) */
    cardMode?: boolean;
    /** Override the light/paper render. Unset → printMode/cardMode decide (light for
     *  paper). `false` forces a DARK card even in cardMode — the guide's card stages
     *  sit on the dark editorial column and must match the canvas above them. */
    lightMode?: boolean;
    /** Show the notes footer line (FireDrums banner / custom notes) */
    showNotes?: boolean;
    /** Show the LOOP transform icon strip in the card header */
    showLoopGlyph?: boolean;
    /** Override the notes text in the card footer (e.g. TnD description) */
    customNotesText?: string;
    /** Pre-rendered image URL - displays this instead of rendering via PropAwareThumbnail */
    preRenderedImageUrl?: string | null;
    /** Render immediately when the card is already visible inside a modal. */
    eager?: boolean;
    /** Show mandala fills in empty grid cells */
    showMandala?: boolean;
    /** Force a prop family for both hands (default: the user's global setting).
     *  Embedded contexts like the guide need a fixed prop type per page —
     *  STAFF for letter/word/LOOP pages, HAND for motion pages — independent of
     *  whatever the viewer has selected. */
    leftPropType?: PropType;
    rightPropType?: PropType;
    onSelect?: (sequence: SequenceData) => void;
    onContextMenu?: (x: number, y: number, rerender: () => void) => void;
  }

  let {
    sequence,
    printMode = false,
    showQRCodes = true,
    handPointsVisible = true,
    showGrid = true,
    showTKA = true,
    showWord = true,
    includeStartPlacement = true,
    startPlacementLayout = "row",
    handPathMode = false,
    cardMode = false,
    lightMode: lightModeProp,
    showNotes = true,
    showLoopGlyph = true,
    customNotesText = "🔥 FireDrums 2026 🔥",
    preRenderedImageUrl: preRenderedImageUrlProp,
    eager = false,
    showMandala = false,
    leftPropType,
    rightPropType,
    onSelect,
    onContextMenu,
  }: Props = $props();

  // Local override so re-render can clear the pre-rendered URL
  let preRenderedCleared = $state(false);
  const usePreRendered = $derived(
    !!preRenderedImageUrlProp && !preRenderedCleared
  );

  let hapticService: HapticFeedback;
  let thumbnailRef: PropAwareThumbnail | undefined = $state();
  let saveMenuHost: VisualSequenceSaveContextMenuHost | undefined = $state();

  export function rerender(): void {
    preRenderedCleared = true;
    thumbnailRef?.forceRerender();
  }

  onMount(() => {
    hapticService = getHapticFeedback();
  });

  // Light/paper render: an explicit override wins; otherwise printMode/cardMode
  // force light (both target paper).
  const effectiveLightMode = $derived(lightModeProp ?? (printMode || cardMode));

  // Prop family: an explicit override (guide pages pass a fixed STAFF/HAND) wins
  // over the user's global setting.
  const propSettings = $derived({
    leftPropType: leftPropType ?? settingsService.settings.leftPropType,
    rightPropType: rightPropType ?? settingsService.settings.rightPropType,
    catDogMode: settingsService.settings.catDogMode,
  });

  // Build visibility settings for thumbnail render
  const visibilitySettings = $derived({
    showTKA: handPathMode ? false : showTKA,
    showReversals: handPathMode ? false : true,
    showGrid,
    showNonRadialPoints: false, // Off by default for cleaner choreo cards
    handPointVisibility: handPointsVisible
      ? ("all" as const)
      : ("active" as const),
    showQRCode: showQRCodes,
    handPathMode,
    showMandala,
  });

  function handleClick() {
    hapticService?.trigger("selection");
    onSelect?.(sequence);
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleClick();
    }
  }

  function handleContextMenu(event: MouseEvent) {
    event.preventDefault();
    if (onContextMenu) {
      onContextMenu(event.clientX, event.clientY, rerender);
      return;
    }
    saveMenuHost?.openContextMenu(event.clientX, event.clientY);
  }
</script>

<button
  class="choreo-card"
  class:print-mode={printMode}
  onclick={handleClick}
  onkeydown={handleKeyDown}
  oncontextmenu={handleContextMenu}
  aria-label="View sequence {sequence.name}"
  type="button"
>
  <div class="card-content">
    {#if usePreRendered}
      <img
        class="pre-rendered-image"
        src={preRenderedImageUrlProp}
        alt="Preview of {sequence.name}"
        draggable="false"
      />
    {:else}
      <PropAwareThumbnail
        bind:this={thumbnailRef}
        {sequence}
        leftPropType={propSettings.leftPropType}
        rightPropType={propSettings.rightPropType}
        catDogModeEnabled={propSettings.catDogMode}
        lightMode={effectiveLightMode}
        variant="wordcard"
        addWord={showWord}
        addDifficultyLevel={true}
        {includeStartPlacement}
        {startPlacementLayout}
        {showNotes}
        {showLoopGlyph}
        visibility={visibilitySettings}
        {eager}
        {cardMode}
        {customNotesText}
      />
    {/if}
  </div>
</button>

<VisualSequenceSaveContextMenuHost
  bind:this={saveMenuHost}
  {sequence}
  intent={{
    leftPropType: propSettings.leftPropType,
    rightPropType: propSettings.rightPropType,
    catDogModeEnabled: propSettings.catDogMode,
  }}
/>

<style>
  /* Print-mode semantic tokens for choreo cards (light mode for paper) */
  .choreo-card {
    --print-bg: #ffffff;
    --print-border: #000000;
    --print-text: #333333;
    --print-text-dim: #666666;
    --print-text-muted: #999999;
    --print-spinner-track: #e0e0e0;
    --print-error-bg: #ffeeee;
    --print-error-text: #cc0000;

    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%; /* Fill grid cell */
    padding: 0;
    background: var(--print-bg);
    border: 2px solid var(--theme-stroke, #999999);
    border-radius: 0;
    overflow: hidden;
    cursor: pointer;
    transition: all var(--duration-fast) ease;
  }

  .choreo-card:hover {
    box-shadow: var(--shadow-card, 0 4px 12px rgba(0, 0, 0, 0.15));
  }

  .choreo-card:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }

  .pre-rendered-image {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  /* PropAwareThumbnail scales to fit within the card cell */
  .choreo-card :global(.prop-thumbnail) {
    width: 100%;
    height: 100%;
    background: var(--print-bg);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* Direct child only — the rendered thumbnail <img>. A bare descendant
     selector here also caught the loading placeholder's TKAWordGlyph <img>
     (nested inside .placeholder-glyph), where height:100% beat its height="24"
     attribute and blew the word glyph up to fill the whole card. */
  .choreo-card :global(.prop-thumbnail > img) {
    width: 100%;
    height: 100%;
    object-fit: contain; /* Scale down to fit, maintain aspect ratio */
  }

  /* Light-mode loading placeholder for choreo cards */
  .choreo-card :global(.loading-placeholder),
  .choreo-card :global(.error-placeholder),
  .choreo-card :global(.empty-placeholder) {
    background: var(--print-bg);
    color: var(--print-text-dim);
  }

  .choreo-card :global(.spinner) {
    border-color: var(--print-spinner-track);
    border-top-color: var(--print-text-dim);
  }

  .choreo-card :global(.loading-status) {
    color: var(--print-text-dim);
  }

  .choreo-card :global(.error-icon) {
    background: var(--print-error-bg);
    color: var(--print-error-text);
  }

  .choreo-card :global(.letter) {
    color: var(--print-text-muted);
  }

  /* Card content wrapper */
  .card-content {
    position: relative;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  @media (prefers-reduced-motion: reduce) {
    .choreo-card {
      transition: none;
    }
  }
</style>
