<!--
ConsolidatedLOOPCard.svelte - Single LOOP card that absorbs toggle, type, and slice size
Shows "Off" when disabled, the LOOP type name plus its canonical component
icons when enabled. Click opens the expanded overlay.
-->
<script lang="ts">
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import type { HapticFeedback } from "#lib/shared/application/services/haptic-feedback.js";
  import {
    LOOPType,
    Period,
  } from "#lib/shared/foundation/domain/models/generation/circular-models.js";
  import { LOOPComponent } from "#lib/shared/foundation/domain/models/generation/generate-models.js";
  import { onMount, getContext } from "svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import type { PanelCoordinationState } from "#lib/shared/create/state/panel-coordination-state.svelte.js";
  import CardHeader from "./shared/CardHeader.svelte";
  import LOOPIconStrip from "#lib/shared/components/LOOPIconStrip.svelte";
  import {
    buildLoopCardDisplay,
    describeLoopRhythm,
    fitLoopLabel,
    loopCardInnerWidth,
  } from "./loop-card-display";
  import { reflectionAxisName } from "../loop-component-presentation";
  import { REFLECTION_AXIS_DETAILS } from "./loop-expanded-overlay-model";
  import { morphGenerateCard } from "../../shared/services/generate-card-morph";
  import type { ReflectionAxis } from "@tka/sequence-engine/loop";
  import type { TnDSelection } from "#lib/shared/create/domain/hand-relationship.js";

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
    headerFontSize = "var(--font-size-compact, 12px)",
  } = $props<{
    loopEnabled: boolean;
    currentLOOPType: LOOPType;
    /** Requested rotation period. Gated to halved for non-rotation LOOPs. */
    period?: Period | string;
    inversionInterval?: 2 | 4;
    inversionMode?: "expand" | "overlay";
    reflectionAxis?: ReflectionAxis;
    handRelationship?: TnDSelection;
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
    if (!loopEnabled) return t("create_ui_off");
    if (display.effectiveAxis) {
      // One type on every axis: the icon below turns to the chosen line.
      const parts = [t("generator_loop_reflected")];
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
    // Reflected types never reach here; they always have an axis.
    const typeMap: Partial<Record<LOOPType, string>> = {
      [LOOPType.ROTATED]: t("generator_loop_rotated"),
      [LOOPType.SWAPPED]: t("generator_loop_swapped"),
      [LOOPType.INVERTED]: t("generator_loop_inverted"),
      [LOOPType.SWAPPED_INVERTED]: t("generator_loop_swapped_inverted"),
      [LOOPType.ROTATED_INVERTED]: t("generator_loop_rotated_inverted"),
      [LOOPType.ROTATED_SWAPPED]: t("generator_loop_rotated_swapped"),
      [LOOPType.ROTATED_SWAPPED_INVERTED]:
        t("generator_loop_rotated_swapped") +
        " + " +
        t("generator_loop_inverted"),
      [LOOPType.STRICT_REWOUND]: t("generator_loop_rewound"),
    };
    // Fallback: strip "strict_" prefix and title-case for unmapped legacy values
    return (
      typeMap[currentLOOPType as keyof typeof typeMap] ||
      currentLOOPType
        .replace(/^strict_/, "")
        .split("_")
        .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" / ")
    );
  });

  // Combined labels run to ~40 characters ("Reflected + Rotated + Swapped +
  // Inverted"). At the shared card text size those wrap to two full
  // lines and push the icon row past the card's edge, so the label steps down
  // by length onto the same ramp the Customize summary uses.
  const lengthTier = $derived(
    displayValue.length > 32
      ? "long"
      : displayValue.length > 18
        ? "medium"
        : "short"
  );
  // The longest translations (Russian runs to 52 characters) need a third line
  // on a narrow phone, so they also tighten their letters on a short card.
  const tightLabel = $derived(displayValue.length > 44);

  // Icon size tracks the card. A literal 16px reads as punctuation on a native
  // 4K card, and overwhelms the label on a phone.
  // Read from the resize observer rather than `bind:clientHeight`, which also
  // reads the height synchronously as the card mounts and forces a layout of
  // the whole half-built Generate panel. The observer reports before the first
  // paint, and the button has no border, so its border box is its client box.
  let cardBox = $state<readonly ResizeObserverSize[]>();
  const cardHeight = $derived(Math.round(cardBox?.[0]?.blockSize ?? 0));
  const cardWidth = $derived(cardBox?.[0]?.inlineSize ?? 0);

  // With a sequence built, a phone's card is 42 to 71px tall. The hidden line
  // below reports how wide the name is at the smallest type, and the card
  // shows the name whole or its icons in the name's place.
  let lineBox = $state<readonly ResizeObserverSize[]>();
  const lineWidth = $derived(lineBox?.[0]?.inlineSize ?? 0);
  const fit = $derived.by(() => {
    const fitted = fitLoopLabel({ cardWidth, cardHeight, lineWidth });
    return fitted === "icons" && display.iconComponents.size === 0
      ? "line"
      : fitted;
  });

  // On a short card the length tiers also have to fit their one line: 16px
  // for the short names and 13px for the medium ones, against 12px measured.
  const labelTier = $derived.by(() => {
    if (!fit) return lengthTier;
    if (fit !== "line") return "long";
    const inner = loopCardInnerWidth(cardWidth) - 1;
    if (lengthTier === "short" && lineWidth * 1.4 > inner) return "long";
    if (lengthTier === "medium" && lineWidth * 1.1 > inner) return "long";
    return lengthTier;
  });

  const iconSize = $derived(
    fit === "icons"
      ? Math.min(20, Math.max(12, cardHeight - 24))
      : Math.min(24, Math.max(12, Math.round(cardHeight * 0.15)))
  );

  // The strip is hidden from the accessibility tree (this button already owns
  // the name), so the rhythm it encodes visually has to be spoken here.
  const rhythmDetail = $derived.by(() => {
    if (!loopEnabled) return "";
    const rhythm = describeLoopRhythm(display);
    const labels: Record<string, string> = {
      "quartered rotation": t("create_deep_quartered_rotation"),
      "halved rotation": t("create_deep_halved_rotation"),
      "quartered inversion": t("create_deep_quartered_inversion"),
      "overlay inversion": t("create_deep_overlay_inversion"),
    };
    const spoken = rhythm
      .split(", ")
      .filter(Boolean)
      .map((part) => labels[part] ?? part);
    const axis = display.effectiveAxis;
    if (axis) {
      spoken.unshift(
        t("create_deep_axis_option_label", {
          axis: REFLECTION_AXIS_DETAILS[axis].axisLabel,
          name: reflectionAxisName(axis),
        })
      );
    }
    return spoken.join(", ");
  });

  function handleClick() {
    hapticService?.trigger("selection");

    // Open the selection overlay. When OFF, selectedComponents is empty so the
    // grid opens fresh; picking a loop enables it (onLOOPTypeChange sets
    // loopEnabled), and backing out without picking leaves the loop off — no
    // pre-enable, no stale selection.
    morphGenerateCard("loop", () =>
      panelState.openLOOPPanel(
        currentLOOPType,
        selectedComponents,
        onLOOPTypeChange
      )
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
  {#if loopEnabled}
    <span class="loop-shimmer" aria-hidden="true"></span>
  {/if}
  <button
    class="loop-consolidated-card"
    class:enabled={loopEnabled}
    bind:borderBoxSize={cardBox}
    onclick={handleClick}
    onkeydown={handleKeydown}
    aria-label={t("create_deep_loop_card_aria", {
      value: displayValue,
      rhythm: rhythmDetail ? `, ${rhythmDetail}` : "",
    })}
  >
    <CardHeader title="LOOP" {headerFontSize} />
    <!-- Label and icons center as one group, so this card's text lines up with
         the plain single-line text on the Customize card beside it. -->
    <div
      class="loop-body"
      class:tight={tightLabel}
      data-fit={cardHeight ? (fit ?? "full") : undefined}
    >
      <span class="line-probe" aria-hidden="true">
        <span class="line-probe-text" bind:borderBoxSize={lineBox}
          >{displayValue}</span
        >
      </span>
      <div class="card-value" data-label={labelTier}>{displayValue}</div>
      <!-- The row is always here, empty when the loop is off, so toggling
           can't move the label above it. The strip carries its own role="img"
           and label, which would duplicate this button's name — hide it. -->
      <div
        class="loop-icon-row"
        style="min-height: {iconSize}px;"
        aria-hidden="true"
      >
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
    transition:
      transform var(--duration-emphasis) var(--ease-standard),
      filter var(--duration-emphasis) var(--ease-standard);
  }

  /* On state: accent gradient with shimmer, drawn by .loop-shimmer. The
     transparent border keeps the on-state box size. */
  .loop-card-wrapper.enabled {
    background: none;
    box-shadow: none;
    border: 1px solid transparent;
  }

  /* The shimmer slides an oversized gradient by transform, which the
     compositor runs. Animating background-position repainted the card every
     frame, even while the screen sat idle. The layer covers the border box
     and clips to the card's corners. */
  .loop-shimmer {
    position: absolute;
    inset: -1px;
    border-radius: inherit;
    overflow: hidden;
    pointer-events: none;
  }

  /* 200% of the card in both axes, like the old background-size; a translate
     of -50% equals background-position 100%, and -25% equals 50%. */
  .loop-shimmer::before {
    content: "";
    position: absolute;
    top: 0;
    left: 0;
    width: 200%;
    height: 200%;
    background: linear-gradient(
      135deg,
      color-mix(
          in srgb,
          var(--theme-accent-strong, #6366f1) 80%,
          var(--theme-card-bg)
        )
        0%,
      color-mix(in srgb, var(--theme-accent, #818cf8) 60%, var(--theme-card-bg))
        50%,
      color-mix(
          in srgb,
          var(--theme-accent-strong, #6366f1) 70%,
          var(--theme-card-bg)
        )
        100%
    );
    animation: accentShimmer 6s ease-in-out infinite;
  }

  /* The border sits over the moving gradient, as it sat over the old
     animated background. */
  .loop-shimmer::after {
    content: "";
    position: absolute;
    inset: 0;
    border: 1px solid color-mix(in srgb, var(--theme-accent) 40%, transparent);
    border-radius: inherit;
  }

  @keyframes accentShimmer {
    0% {
      transform: translate(0, -25%);
    }
    50% {
      transform: translate(-50%, -25%);
    }
    100% {
      transform: translate(0, -25%);
    }
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

  @media (hover: hover) {
    .loop-card-wrapper:hover {
      transform: scale(1.02);
      filter: brightness(1.08);
    }
  }

  .loop-card-wrapper:active {
    transform: scale(0.97);
    transition: transform var(--duration-instant) var(--ease-standard);
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
    /* Multi-component labels ("Reflected + Rotated + Inverted") are wider than one
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

  /* Short cards: the combined name steps down to the smallest type and tighter
     lines, so all of it shows over two lines (three for the longest
     translations) with the icons under it. */
  @container loop-card (max-height: 104px) {
    .loop-body {
      gap: 1px;
    }

    .card-value[data-label="long"] {
      font-size: var(--font-size-compact, 12px);
      line-height: 1.2;
    }

    .tight .card-value {
      letter-spacing: -0.04em;
    }
  }

  /* Keeps descenders off the icons wherever three lines aren't needed. The
     settings panel zeroes the body's gap on short rows, so this is a margin. */
  @container loop-card (min-height: 73px) and (max-height: 104px) {
    .loop-body:not(.tight) .loop-icon-row {
      margin-top: 2px;
    }
  }

  @container loop-card (max-height: 88px) {
    .card-value[data-label="medium"] {
      font-size: 13px;
    }
  }

  /* Under 72px there is room for one line only. These cards are wide
     (sideways phones, short laptop windows), so the name fits on it. */
  @container loop-card (max-height: 72px) {
    .card-value {
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 1;
      line-clamp: 1;
    }
  }

  .loop-body[data-fit="lines"] .card-value {
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }

  /* The name and its icons trade places as the card grows and shrinks with
     the sequence above it; whichever arrives fades in. */
  .loop-body[data-fit="icons"] .card-value,
  .loop-body[data-fit="lines"] .loop-icon-row {
    display: none;
  }

  /* Alone, the icons carry the name, and the reflection's purple is lost on
     this purple card; they sit on the dark they have everywhere else. */
  .loop-body[data-fit="icons"] .loop-icon-row {
    width: auto;
    padding: 1px 10px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--theme-card-bg) 85%, transparent);
  }

  .card-value,
  .loop-icon-row {
    transition: opacity var(--duration-normal) var(--ease-standard);
  }

  /* The attribute lands after the first layout, so the page's first paint
     does not fade. */
  @starting-style {
    .loop-body[data-fit] .card-value,
    .loop-body[data-fit] .loop-icon-row {
      opacity: 0;
    }
  }

  /* One line of the name at the smallest type, for measuring only. */
  .line-probe {
    position: absolute;
    width: 0;
    height: 0;
    overflow: hidden;
    visibility: hidden;
    pointer-events: none;
  }

  .line-probe-text {
    display: inline-block;
    white-space: nowrap;
    font-size: var(--font-size-compact, 12px);
    font-weight: var(--card-text-weight);
    line-height: 1.2;
  }

  .tight .line-probe-text {
    letter-spacing: -0.04em;
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
      transition: none;
    }

    .card-value,
    .loop-icon-row {
      transition: none;
    }

    .loop-shimmer::before {
      animation: none;
    }
  }
</style>
