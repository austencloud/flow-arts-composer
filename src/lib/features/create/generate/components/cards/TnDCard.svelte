<!--
  TnDCard: the timing-and-direction bento card. Two columns, Hands and Props,
  each a small H or P over the mode's element icon, the mode's words beneath.
  The icons say what the card is, so it carries no title. The card wears the
  hand element's accent, else the prop element's, else the neutral card
  surface. Click grows it into TnDPanel through the card morph.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import type { HapticFeedback } from "#lib/shared/application/services/haptic-feedback.js";
  import { onMount, getContext } from "svelte";
  import type { PanelCoordinationState } from "#lib/shared/create/state/panel-coordination-state.svelte.js";
  import type { TnDSelection } from "#lib/shared/create/domain/hand-relationship.js";
  import type { VtgMode } from "#lib/shared/shape-matrix/services/shape-matrix-realizations.js";
  import { morphGenerateCard } from "../../shared/services/generate-card-morph";
  import { buildTnDCardDisplay } from "./tnd-card-display";
  import { describeCreateTnDSelection } from "./tnd-presentation";

  let {
    handRelationship,
    propRelationship,
    matchHandTurns,
    blockedHandModes = {},
    cardIndex = 0,
  } = $props<{
    handRelationship: TnDSelection;
    propRelationship: TnDSelection;
    matchHandTurns: boolean;
    blockedHandModes?: Partial<Record<VtgMode, string>>;
    cardIndex?: number;
    /** Kept for the bento's shared card props; the card has no title. */
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
  const handValue = $derived(
    `${describeCreateTnDSelection(handRelationship)}${display.handBlocked ? `, ${t("create_deep_off_with_loop")}` : ""}`
  );
  const propValue = $derived(describeCreateTnDSelection(propRelationship));
  const ariaLabel = $derived(
    t("create_deep_tnd_card_aria", {
      hands: handValue,
      props: propValue,
      turns: matchHandTurns ? t("create_deep_turns_matched_suffix") : "",
    })
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
    onclick={handleClick}
    onkeydown={handleKeydown}
    aria-label={ariaLabel}
  >
    <div class="tnd-body" aria-hidden="true">
      {#each [display.hands, display.props] as line (line.label)}
        {@const isHands = line.label === "Hands"}
        <div
          class="tnd-col"
          class:blocked={isHands && display.handBlocked}
          class:no-icon={!line.element}
        >
          <span class="col-letter"
            >{(isHands ? t("create_ui_hands") : t("create_ui_props")).charAt(
              0
            )}</span
          >
          {#if line.element}
            <img class="col-icon" src={line.element.iconPath} alt="" />
          {/if}
          <span class="col-words">{isHands ? handValue : propValue}</span>
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
    box-shadow: none;
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
    align-items: stretch;
    justify-content: center;
    gap: clamp(6px, 4cqw, 24px);
    flex: 1;
    min-height: 0;
    width: 100%;
    z-index: 2;
  }

  .tnd-col {
    flex: 1 1 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: clamp(2px, 2cqh, 8px);
    min-width: 0;
  }

  .col-letter {
    font-size: calc(var(--card-text-size) * 0.65);
    font-weight: 800;
    letter-spacing: 0.08em;
    line-height: 1;
    color: color-mix(in srgb, white 70%, transparent);
    text-transform: uppercase;
  }

  /* Big enough to read the element at a glance, sized by whichever side of
     the card runs out first. */
  .col-icon {
    flex: none;
    width: clamp(20px, min(38cqh, 30cqw), 72px);
    height: clamp(20px, min(38cqh, 30cqw), 72px);
    object-fit: contain;
    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
  }

  .col-words {
    max-width: 100%;
    font-size: calc(var(--card-text-size) * 0.62);
    font-weight: var(--card-text-weight);
    letter-spacing: var(--card-text-spacing);
    line-height: 1.15;
    color: color-mix(in srgb, white 90%, transparent);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    overflow-wrap: anywhere;
  }

  /* Free, or off with the LOOP: no icon, so the words take its place. */
  .tnd-col.no-icon .col-words {
    font-size: calc(var(--card-text-size) * 0.8);
  }

  .tnd-col.blocked .col-words {
    color: color-mix(in srgb, white 70%, transparent);
    font-style: italic;
  }

  /* A short card drops the words under an icon; the icon carries the mode. */
  @container tnd-card (max-height: 96px) {
    .tnd-col:not(.no-icon) .col-words {
      display: none;
    }

    .col-icon {
      width: clamp(18px, 50cqh, 48px);
      height: clamp(18px, 50cqh, 48px);
    }
  }
</style>
