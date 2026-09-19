<!--
  TnDCard: the timing-and-direction bento card. Two lines, Hands and Props,
  each the mode's words with its element icon when one is set. The card wears
  the hand element's accent, else the prop element's, else the neutral card
  surface. Click grows it into TnDPanel through the card morph.
-->
<script lang="ts">
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import type { HapticFeedback } from "$lib/shared/application/services/haptic-feedback";
  import { onMount, getContext } from "svelte";
  import type { PanelCoordinationState } from "$lib/shared/create/state/panel-coordination-state.svelte";
  import type { TnDSelection } from "$lib/shared/create/domain/hand-relationship";
  import type { VtgMode } from "$lib/shared/shape-matrix/services/shape-matrix-realizations";
  import CardHeader from "./shared/CardHeader.svelte";
  import { morphGenerateCard } from "../../shared/services/generate-card-morph";
  import { buildTnDCardDisplay } from "./tnd-card-display";

  let {
    handRelationship,
    propRelationship,
    matchHandTurns,
    blockedHandModes = {},
    cardIndex = 0,
    headerFontSize = "9px",
  } = $props<{
    handRelationship: TnDSelection;
    propRelationship: TnDSelection;
    matchHandTurns: boolean;
    blockedHandModes?: Partial<Record<VtgMode, string>>;
    cardIndex?: number;
    headerFontSize?: string;
  }>();

  let hapticService: HapticFeedback | null = $state(null);
  const panelState = getContext<PanelCoordinationState>("panelState");

  onMount(() => {
    hapticService = getHapticFeedback();
  });

  const display = $derived(
    buildTnDCardDisplay({
      handRelationship,
      propRelationship,
      matchHandTurns,
      blockedHandModes,
    })
  );

  // Icon size tracks the card, like the LOOP card's strip: a fixed 16px is
  // punctuation on a 4K card and crowds the words on a phone.
  let cardHeight = $state(0);
  const iconSize = $derived(
    Math.min(28, Math.max(14, Math.round(cardHeight * 0.2)))
  );

  function handleClick() {
    hapticService?.trigger("selection");
    morphGenerateCard("tnd", () => panelState.openTnDPanel());
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleClick();
    }
  }
</script>

<div
  class="tnd-card-wrapper"
  class:active={display.active}
  style="--card-index: {cardIndex}; --tnd-accent: {display.accent ??
    'var(--theme-accent, #818cf8)'}; --tnd-dark: {display.darkComplement ??
    'var(--theme-accent-strong, #6366f1)'};"
>
  <button
    class="tnd-card"
    class:active={display.active}
    bind:clientHeight={cardHeight}
    onclick={handleClick}
    onkeydown={handleKeydown}
    aria-label={display.ariaLabel}
  >
    <CardHeader title="Timing and direction" {headerFontSize} />
    <div class="tnd-body" aria-hidden="true">
      {#each [display.hands, display.props] as line (line.label)}
        <div
          class="tnd-line"
          class:blocked={line.label === "Hands" && display.handBlocked}
        >
          <span class="line-label">{line.label}</span>
          <span class="line-value">
            {#if line.element}
              <img
                class="line-icon"
                src={line.element.iconPath}
                alt=""
                style="width: {iconSize}px; height: {iconSize}px;"
              />
            {/if}
            <span class="line-words">{line.value}</span>
          </span>
        </div>
      {/each}
    </div>
  </button>
</div>

<style>
  .tnd-card-wrapper {
    container-type: size;
    container-name: tnd-card;
    position: relative;
    border-radius: 16px;
    overflow: visible;

    /* Both free: the same muted surface as the LOOP card when it is off. */
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

  /* Something set: the element's accent, shimmering like the LOOP card. */
  .tnd-card-wrapper.active {
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--tnd-dark) 80%, var(--theme-card-bg)) 0%,
      color-mix(in srgb, var(--tnd-accent) 60%, var(--theme-card-bg)) 50%,
      color-mix(in srgb, var(--tnd-dark) 70%, var(--theme-card-bg)) 100%
    );
    background-size: 200% 200%;
    animation: tndShimmer 6s ease-in-out infinite;
    box-shadow:
      0 2px 4px var(--theme-shadow),
      0 4px 12px color-mix(in srgb, var(--tnd-accent) 20%, transparent),
      inset 0 1px 0 var(--theme-stroke-strong);
    border: 1px solid color-mix(in srgb, var(--tnd-accent) 40%, transparent);
  }

  @keyframes tndShimmer {
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

  .tnd-card {
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

  /* Glossy sheen, as on the LOOP card. */
  .tnd-card::after {
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

  .tnd-card-wrapper :global(.card-header),
  .line-value,
  .line-label {
    text-shadow:
      0 1px 2px var(--theme-shadow),
      0 2px 4px color-mix(in srgb, var(--theme-shadow) 20%, transparent);
  }

  @media (hover: hover) {
    .tnd-card-wrapper:hover {
      transform: scale(1.02);
      filter: brightness(1.08);
    }
  }

  .tnd-card-wrapper:active {
    transform: scale(0.97);
    transition: transform var(--duration-instant) cubic-bezier(0.4, 0, 0.2, 1);
  }

  .tnd-body {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: clamp(2px, 1cqh, 6px);
    flex: 1;
    min-height: 0;
    width: 100%;
    z-index: 2;
  }

  .tnd-line {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: clamp(4px, 1.5cqw, 8px);
    min-width: 0;
  }

  .line-label {
    font-size: calc(var(--card-text-size) * 0.8);
    font-weight: var(--card-text-weight);
    letter-spacing: var(--card-text-spacing);
    color: color-mix(in srgb, white 75%, transparent);
    text-transform: uppercase;
  }

  .line-value {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
    font-size: var(--card-text-size);
    font-weight: var(--card-text-weight);
    letter-spacing: var(--card-text-spacing);
    color: white;
  }

  .line-words {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .line-icon {
    flex: none;
    filter: drop-shadow(0 1px 1px var(--theme-shadow));
  }

  .tnd-line.blocked .line-value {
    color: color-mix(in srgb, white 70%, transparent);
    font-style: italic;
  }

  /* Short cards drop the labels; the icons and words still say it all. */
  @container tnd-card (max-height: 72px) {
    .line-label {
      display: none;
    }
  }
</style>
