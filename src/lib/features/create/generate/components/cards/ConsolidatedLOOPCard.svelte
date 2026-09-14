<!--
ConsolidatedLOOPCard.svelte - Single LOOP card that absorbs toggle, type, and slice size
Shows "Off" when disabled, the LOOP type name plus its canonical component
icons when enabled. Click opens the expanded overlay.
-->
<script lang="ts">
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import type { HapticFeedback } from "$lib/shared/application/services/haptic-feedback";
  import {
    LOOPType,
    Period,
  } from "$lib/shared/foundation/domain/models/generation/circular-models";
  import { LOOPComponent } from "$lib/shared/foundation/domain/models/generation/generate-models";
  import { onMount, getContext } from "svelte";
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import type { PanelCoordinationState } from "$lib/shared/create/state/panel-coordination-state.svelte";
  import CardHeader from "./shared/CardHeader.svelte";
  import LOOPIconStrip from "$lib/shared/components/LOOPIconStrip.svelte";
  import { buildLoopCardDisplay, describeLoopRhythm } from "./loop-card-display";
  import type { ReflectionAxis } from "@tka/sequence-engine/loop";
  import type { HandRelationship } from "$lib/shared/create/domain/hand-relationship";

  let {
    loopEnabled,
    currentLOOPType,
    period,
    inversionInterval,
    inversionMode,
    reflectionAxis,
    handRelationship,
    onLOOPTypeChange,
    cardIndex = 0,
    headerFontSize = "9px",
  } = $props<{
    loopEnabled: boolean;
    currentLOOPType: LOOPType;
    /** Requested rotation period. Gated to halved for non-rotation LOOPs. */
    period?: Period | string;
    inversionInterval?: 2 | 4;
    inversionMode?: "expand" | "overlay";
    reflectionAxis?: ReflectionAxis;
    handRelationship?: HandRelationship;
    onLOOPTypeChange: (loopType: LOOPType) => void;
    cardIndex?: number;
    headerFontSize?: string;
  }>();

  let hapticService: HapticFeedback | null = $state(null);
  const panelState = getContext<PanelCoordinationState>("panelState");

  onMount(() => {
    hapticService = getHapticFeedback();
  });

  // Everything the icons need, resolved once. Period gating, axis
  // normalization and overlay grouping live in the pure module beside this
  // file so the glyphs can never contradict the label below.
  const display = $derived(
    buildLoopCardDisplay({
      loopEnabled,
      loopType: currentLOOPType,
      period,
      inversionInterval,
      inversionMode,
      reflectionAxis,
      handRelationship,
    })
  );

  // Selected components for the overlay. When the loop is OFF, the overlay
  // opens with nothing selected — the stale loopType (config keeps its last
  // value; there's no "none" LOOPType) must not pre-highlight a component.
  const selectedComponents = $derived(display.selectedComponents);

  // The exact text label stays alongside the axis-aware icon so combined
  // transformations remain readable without relying on color or glyphs alone.
  const displayValue = $derived.by(() => {
    if (!loopEnabled) return "Off";
    if (display.effectiveAxis) {
      const effectiveAxis: ReflectionAxis = display.effectiveAxis;
      const reflectionLabels: Record<ReflectionAxis, string> = {
        "north-south": t("generator_loop_mirrored"),
        "east-west": t("generator_loop_flipped"),
        "northeast-southwest": "NE-SW Reflection",
        "northwest-southeast": "NW-SE Reflection",
      };
      const parts = [reflectionLabels[effectiveAxis]];
      if (selectedComponents.has(LOOPComponent.ROTATED)) {
        parts.push(t("generator_loop_rotated"));
      }
      if (selectedComponents.has(LOOPComponent.SWAPPED)) {
        parts.push(t("generator_loop_swapped"));
      }
      if (selectedComponents.has(LOOPComponent.INVERTED)) {
        parts.push(t("generator_loop_inverted"));
      }
      return parts.join(" + ");
    }
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
  });

  // Combined labels run to ~45 characters ("NE-SW Reflection + Rotated +
  // Swapped + Inverted"). At the shared card text size those wrap to two full
  // lines and push the icon row past the card's edge, so the label steps down
  // by length onto the same ramp the Customize summary uses.
  const labelTier = $derived(
    displayValue.length > 32 ? "long" : displayValue.length > 18 ? "medium" : "short"
  );

  // Icon size tracks the card. A literal 16px reads as punctuation on a native
  // 4K card, and overwhelms the label on a phone.
  let cardHeight = $state(0);
  const iconSize = $derived(
    Math.min(24, Math.max(12, Math.round(cardHeight * 0.15)))
  );

  // The strip is hidden from the accessibility tree (this button already owns
  // the name), so the rhythm it encodes visually has to be spoken here.
  const rhythmDetail = $derived(loopEnabled ? describeLoopRhythm(display) : "");

  function handleClick() {
    hapticService?.trigger("selection");

    // Open the selection overlay. When OFF, selectedComponents is empty so the
    // grid opens fresh; picking a loop enables it (onLOOPTypeChange sets
    // loopEnabled), and backing out without picking leaves the loop off — no
    // pre-enable, no stale selection.
    panelState.openLOOPPanel(
      currentLOOPType,
      selectedComponents,
      onLOOPTypeChange
    );
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleClick();
    }
  }
</script>

<div
  class="loop-card-wrapper"
  class:enabled={loopEnabled}
  style="--card-index: {cardIndex};"
>
  <button
    class="loop-consolidated-card"
    class:enabled={loopEnabled}
    bind:clientHeight={cardHeight}
    onclick={handleClick}
    onkeydown={handleKeydown}
    aria-label="LOOP: {displayValue}{rhythmDetail ? `, ${rhythmDetail}` : ''}. Click to configure."
  >
    <CardHeader title="LOOP" {headerFontSize} />
    <!-- Label and icons center as one group, so this card's text lines up with
         the plain single-line text on the Customize card beside it. -->
    <div class="loop-body">
      <div class="card-value" data-label={labelTier}>{displayValue}</div>
      <!-- The row is always here, empty when the loop is off, so toggling
           can't move the label above it. The strip carries its own role="img"
           and label, which would duplicate this button's name — hide it. -->
      <div class="loop-icon-row" style="min-height: {iconSize}px;" aria-hidden="true">
        {#if display.iconComponents.size > 0}
          <LOOPIconStrip
            activeComponents={display.iconComponents}
            overlayComponents={display.overlayComponents}
            rotationPeriod={display.rotationPeriod}
            inversionPeriod={display.inversionPeriod}
            reflectionAxis={display.effectiveAxis ?? undefined}
            size={iconSize}
            showFreeformWhenEmpty={false}
          />
        {/if}
      </div>
    </div>
  </button>
</div>

<style>
  .loop-card-wrapper {
    container-type: size;
    container-name: loop-card;
    position: relative;
    border-radius: 16px;
    overflow: visible;

    /* Off state: muted background */
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--theme-card-bg) 70%, #78716c) 0%,
      color-mix(in srgb, var(--theme-card-bg) 60%, #57534e) 100%
    );
    box-shadow:
      0 0 0 1px rgba(0, 0, 0, 0.12),
      0 1px 2px rgba(0, 0, 0, 0.15),
      0 2px 4px rgba(0, 0, 0, 0.1),
      inset 0 1px 0 var(--theme-stroke);
    transition: all var(--duration-emphasis) cubic-bezier(0.4, 0, 0.2, 1);
  }

  /* On state: accent gradient with shimmer */
  .loop-card-wrapper.enabled {
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--theme-accent-strong, #6366f1) 80%, var(--theme-card-bg)) 0%,
      color-mix(in srgb, var(--theme-accent, #818cf8) 60%, var(--theme-card-bg)) 50%,
      color-mix(in srgb, var(--theme-accent-strong, #6366f1) 70%, var(--theme-card-bg)) 100%
    );
    background-size: 200% 200%;
    animation: accentShimmer 6s ease-in-out infinite;
    box-shadow:
      0 2px 4px var(--theme-shadow),
      0 4px 12px color-mix(in srgb, var(--theme-accent) 20%, transparent),
      inset 0 1px 0 var(--theme-stroke-strong);
    border: 1px solid color-mix(in srgb, var(--theme-accent) 40%, transparent);
  }

  @keyframes accentShimmer {
    0% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
  }

  .loop-consolidated-card {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    height: 100%;
    min-height: 0;
    min-width: 0;
    padding: clamp(6px, 2cqh, 12px) clamp(4px, 1.5cqw, 8px);
    border-radius: 16px;
    background: transparent;
    border: none;
    color: white;
    text-align: center;
    cursor: pointer;
    font-family: inherit;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
  }

  /* Glossy sheen */
  .loop-consolidated-card::after {
    content: "";
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 60%;
    background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--theme-text) 20%, transparent) 0%,
      color-mix(in srgb, var(--theme-text) 10%, transparent) 40%,
      transparent 70%
    );
    border-radius: 16px 16px 0 0;
    pointer-events: none;
    z-index: 1;
  }

  .loop-consolidated-card.enabled::after {
    background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--theme-text) 30%, transparent) 0%,
      color-mix(in srgb, var(--theme-text) 15%, transparent) 40%,
      color-mix(in srgb, var(--theme-text) 5%, transparent) 70%,
      transparent 100%
    );
  }

  /* Text readable over both states */
  .loop-card-wrapper :global(.card-header),
  .card-value {
    text-shadow:
      0 1px 2px var(--theme-shadow),
      0 2px 4px color-mix(in srgb, var(--theme-shadow) 20%, transparent);
  }

  @media (hover: hover) {
    .loop-card-wrapper:hover {
      transform: scale(1.02);
      filter: brightness(1.08);
    }
    .loop-card-wrapper.enabled:hover {
      box-shadow:
        0 2px 4px var(--theme-shadow),
        0 6px 16px color-mix(in srgb, var(--theme-accent) 30%, transparent),
        0 12px 24px color-mix(in srgb, var(--theme-accent) 15%, transparent),
        inset 0 1px 0 var(--theme-stroke-strong);
    }
  }

  .loop-card-wrapper:active {
    transform: scale(0.97);
    transition: transform var(--duration-instant) cubic-bezier(0.4, 0, 0.2, 1);
  }

  .card-value {
    font-size: var(--card-text-size);
    font-weight: var(--card-text-weight);
    letter-spacing: var(--card-text-spacing);
    color: white;
    text-align: center;
    line-height: 1.1;
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    /* Multi-component labels ("Mirrored / Inverted / Rotated") are wider than one
       line. nowrap + the wrapper's overflow:visible let them spill past the card
       edges (see screenshot). Wrap and clip to the card so every selected
       component stays inside the button. */
    white-space: normal;
    overflow-wrap: anywhere;
    overflow: hidden;
    width: 100%;
    margin: clamp(2px, 0.5cqh, 4px) 0;
    position: relative;
    z-index: 2;
  }

  /* The whole flexible middle band: label + reserved icon row, centered as a
     unit. .card-value's own flex:1 would push the icons to the card's bottom
     edge and lift the label off centre. */
  .loop-body {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: clamp(2px, 1cqh, 6px);
    flex: 1;
    min-height: 0;
    width: 100%;
  }

  /* 1.1 leading is tighter than this font's ink box, so overflow:hidden was
     shaving the descenders. 1.35 clears them; the body has the room. */
  .loop-body .card-value {
    flex: 0 1 auto;
    min-height: 0;
    margin: 0;
    line-height: 1.35;
  }

  /* Same two fractions as the Customize summary's stacked rows, and for the
     same reason: the desktop card grid is capped at 750px, so a card-width
     ramp would stop growing while every sibling card's value kept scaling. */
  .card-value[data-label="medium"] {
    font-size: clamp(
      15px,
      calc(var(--card-text-size, clamp(16px, 2.2vmin, 30px)) * 0.62),
      22px
    );
    letter-spacing: 0;
  }

  .card-value[data-label="long"] {
    font-size: clamp(
      13px,
      calc(var(--card-text-size, clamp(16px, 2.2vmin, 30px)) * 0.5),
      16px
    );
    letter-spacing: 0;
  }

  /* At 375x667 this card is 64px tall and the label band is ~17px — the full
     46-character combined label cannot fit at any readable size. Step the type
     down and clamp to a single line so it ends in an ellipsis instead of a
     sliced-off glyph. The label leads with the reflection axis, which is the
     one thing the icons cannot encode; the icons carry the components, and the
     exact text stays in the accessible name and the drawer. */
  @container loop-card (max-height: 88px) {
    .loop-body {
      gap: 1px;
    }

    .card-value[data-label="medium"] {
      font-size: 13px;
    }

    .card-value[data-label="long"] {
      font-size: 11px;
    }

    .card-value {
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 1;
      line-clamp: 1;
    }
  }

  /* Reserved icon row. flex-shrink:0 keeps its height even when a long
     multi-component label wants the space. */
  .loop-icon-row {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 100%;
    position: relative;
    z-index: 2;
  }

  .loop-consolidated-card:focus-visible {
    outline: 2px solid var(--theme-stroke-strong);
    outline-offset: 3px;
  }

  @media (prefers-reduced-motion: reduce) {
    .loop-card-wrapper {
      animation: none;
      transition: none;
    }
  }
</style>
