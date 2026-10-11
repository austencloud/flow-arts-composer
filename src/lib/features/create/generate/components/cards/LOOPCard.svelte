<!--
LOOPCard.svelte - Card for selecting LOOP type
Always opens selector panel when clicked
-->
<script lang="ts">
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import type { HapticFeedback } from "#lib/shared/application/services/haptic-feedback.js";
  import {
    LOOP_TYPE_LABELS,
    LOOPType,
  } from "#lib/shared/foundation/domain/models/generation/circular-models.js";
  import { parseLoopComponents } from "#lib/shared/create/services/loop-type-utils.js";
  import { onMount, getContext } from "svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import type { PanelCoordinationState } from "#lib/shared/create/state/panel-coordination-state.svelte.js";
  import BaseCard from "./BaseCard.svelte";

  let {
    currentLOOPType,
    onLOOPTypeChange,
    shadowColor = "30deg 75% 55%", // Orange shadow
    gridColumnSpan = 2,
    cardIndex = 0,
    headerFontSize = "9px",
  } = $props<{
    currentLOOPType: LOOPType;
    onLOOPTypeChange: (loopType: LOOPType) => void;
    shadowColor?: string;
    gridColumnSpan?: number;
    cardIndex?: number;
    headerFontSize?: string;
  }>();

  let hapticService: HapticFeedback;

  // Get panel coordination state from context (provided by CreateModule)
  const panelState = getContext<PanelCoordinationState>("panelState");

  onMount(() => {
    hapticService = getHapticFeedback();
  });

  // Get current selected components using service
  const selectedComponents = $derived(
    parseLoopComponents(currentLOOPType)
  );

  // Open LOOP panel via coordinator (renders at CreateModule level)
  function openExpanded() {
    hapticService?.trigger("selection");

    // Open the LOOP panel via coordinator - this renders at CreateModule level
    // so the backdrop will properly cover the workspace
    panelState.openLOOPPanel(
      currentLOOPType,
      selectedComponents,
      onLOOPTypeChange
    );
  }

  // Format LOOP type display using user-friendly translated labels
  const loopTypeDisplay = $derived(
    (() => {
      const typeMap: Record<LOOPType, string> = {
        [LOOPType.ROTATED]: t("generator_loop_rotated"),
        [LOOPType.MIRRORED]: t("generator_loop_mirrored"),
        [LOOPType.FLIPPED]: t("generator_loop_flipped"),
        [LOOPType.SWAPPED]: t("generator_loop_swapped"),
        [LOOPType.INVERTED]: t("generator_loop_inverted"),
        [LOOPType.SWAPPED_INVERTED]: t("generator_loop_swapped_inverted"),
        [LOOPType.MIRRORED_SWAPPED]: t("generator_loop_mirrored_swapped"),
        [LOOPType.ROTATED_INVERTED]: t("generator_loop_rotated_inverted"),
        [LOOPType.MIRRORED_INVERTED]: t("generator_loop_mirrored_inverted"),
        [LOOPType.ROTATED_SWAPPED]: t("generator_loop_rotated_swapped"),
        [LOOPType.MIRRORED_ROTATED]: t("generator_loop_mirrored_rotated"),
        [LOOPType.MIRRORED_INVERTED_ROTATED]: t("generator_loop_mir_comp_rot"),
        [LOOPType.MIRRORED_SWAPPED_INVERTED]: t("generator_loop_mirrored_swapped") + " + " + t("generator_loop_inverted"),
        [LOOPType.ROTATED_SWAPPED_INVERTED]: t("generator_loop_rotated_swapped") + " + " + t("generator_loop_inverted"),
        [LOOPType.MIRRORED_ROTATED_SWAPPED]: t("generator_loop_mirrored_rotated") + " + " + t("generator_loop_swapped"),
        [LOOPType.MIRRORED_ROTATED_INVERTED_SWAPPED]: t("generator_loop_all_four"),
        [LOOPType.STRICT_REWOUND]: t("generator_loop_rewound"),
      };
      // Fallback: strip "strict_" prefix and title-case for unmapped legacy values
      return typeMap[currentLOOPType as keyof typeof typeMap] ||
        currentLOOPType.replace(/^strict_/, "").split("_").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(" / ");
    })()
  );
</script>

<!-- LOOP card with animated gradient wrapper -->
<div
  class="loop-card-wrapper"
  style="grid-column: span {gridColumnSpan}; --card-index: {cardIndex};"
>
  <BaseCard
    title={t("generator_loop_type")}
    currentValue={loopTypeDisplay}
    color="transparent"
    {shadowColor}
    gridColumnSpan={1}
    {cardIndex}
    {headerFontSize}
    onClick={openExpanded}
  />
</div>

<!-- LOOP Selection Modal now renders at CreateModule level via LOOPCoordinator -->

<style>
  /* Animated LOOP Card - Flowing Gradient Wrapper */

  /* The wrapper has a distinctive accent-based gradient background */
  .loop-card-wrapper {
    /* Enable container queries to detect card width AND height */
    container-type: size;
    container-name: loop-card;

    position: relative;
    border-radius: 16px;
    overflow: visible; /* Allow hover effects to overflow and pop */

    /* Theme-aware gradient with accent color */
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--theme-accent-strong, #6366f1) 80%, var(--theme-card-bg)) 0%,
      color-mix(in srgb, var(--theme-accent, #818cf8) 60%, var(--theme-card-bg)) 50%,
      color-mix(in srgb, var(--theme-accent-strong, #6366f1) 70%, var(--theme-card-bg)) 100%
    );
    background-size: 200% 200%;

    /* Subtle animated shimmer */
    animation: accentShimmer 6s ease-in-out infinite;

    /* Accent border */
    border: 1px solid color-mix(in srgb, var(--theme-accent) 40%, transparent);
  }

  /* Subtle shimmer animation */
  @keyframes accentShimmer {
    0% {
      background-position: 0% 50%;
    }
    50% {
      background-position: 100% 50%;
    }
    100% {
      background-position: 0% 50%;
    }
  }

  /* The BaseCard inside is transparent to show the wrapper's background */
  /* Disable its entrance animation since the wrapper handles it */
  .loop-card-wrapper :global(.base-card) {
    background: transparent !important;
    box-shadow: none !important;
    border: none !important;
    /* Remove entrance animation - the wrapper handles it */
    animation: none !important;
  }

  /* Multi-component LOOP labels ("Mirrored / Inverted / Rotated") are wider than
     one line. BaseCard's default nowrap + card overflow:visible let the text
     spill past the card edges. Wrap and clip so every selected component stays
     inside the button. */
  .loop-card-wrapper :global(.base-card .card-value) {
    white-space: normal;
    overflow-wrap: anywhere;
    text-overflow: clip;
    overflow: hidden;
  }

  /* Maintain hover effects - only on hover-capable devices */
  @media (hover: hover) {
    .loop-card-wrapper:hover {
      transform: scale(1.02);
      border-color: color-mix(in srgb, var(--theme-accent) 60%, transparent);
      transition: all var(--duration-emphasis) cubic-bezier(0.4, 0, 0.2, 1);
    }
  }

  /* Respect user motion preferences */
  @media (prefers-reduced-motion: reduce) {
    .loop-card-wrapper :global(.base-card) {
      animation: none !important;
      background-position: 0% 50% !important;
    }
  }

  /* Accessibility: Respect user's motion preferences (WCAG AAA) */
  @media (prefers-reduced-motion: reduce) {
    .loop-card-wrapper {
      animation: none;
    }
  }
</style>
