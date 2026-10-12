<!--
  TnDCard: the timing-and-direction bento card. Two tiles, Hands and Props,
  each tinted with its mode's element: a small H or P tag, the element icon,
  the mode's words beneath. Free shows an empty dashed ring so it reads as a
  choice, not a gap. A hand mode the LOOP cannot keep shows its icon greyed
  under a LOOP tag. A link between the tiles says turns are matched.

  Each tile is its own button: a tap grows that tile, not the whole card, into
  TnDPanel through the card morph, showing only that tile's side. While the
  tapped tile is the morph source it carries `data-morph-source`, which
  view-transitions.css uses to name the tile in place of the card and to fly
  its icon into the panel's chosen option.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import type { HapticFeedback } from "#lib/shared/application/services/haptic-feedback.js";
  import { onMount, getContext, flushSync } from "svelte";
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
    level = 2,
    blockedHandModes = {},
    cardIndex = 0,
  } = $props<{
    handRelationship: TnDSelection;
    propRelationship: TnDSelection;
    matchHandTurns: boolean;
    level?: number;
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
      level,
    })
  );
  const turnsSuffix = $derived(
    display.turnsMatched ? t("create_deep_turns_matched_suffix") : ""
  );

  const tiles = $derived([
    {
      key: "hands" as const,
      tag: t("create_ui_hands").charAt(0),
      element: display.handBlockedElement ?? display.hands.element,
      blocked: display.handBlocked,
      words: describeCreateTnDSelection(handRelationship),
      ariaLabel: t("create_deep_tnd_hands_tile_aria", {
        value: `${describeCreateTnDSelection(handRelationship)}${display.handBlocked ? `, ${t("create_deep_off_with_loop")}` : ""}`,
        turns: turnsSuffix,
      }),
    },
    {
      key: "props" as const,
      tag: t("create_ui_props").charAt(0),
      element: display.props.element,
      blocked: false,
      words: describeCreateTnDSelection(propRelationship),
      ariaLabel: t("create_deep_tnd_props_tile_aria", {
        value: describeCreateTnDSelection(propRelationship),
        turns: turnsSuffix,
      }),
    },
  ]);

  /* The tile the panel grew from; it is also where the panel shrinks back to,
     so it stays set after the panel closes. Only marked while the panel is
     closed: once open, the panel owns the morph name. */
  let sourceSide = $state<"hands" | "props" | null>(null);

  function openSection(section: "hands" | "props") {
    hapticService?.trigger("selection");
    // The mark must be in the DOM before the transition snapshots the card.
    flushSync(() => (sourceSide = section));
    morphGenerateCard("tnd", () => panelState.openTnDPanel(section));
  }
</script>

<div class="tnd-card-wrapper" style="--card-index: {cardIndex};">
  <div class="tnd-card">
    {#each tiles as tile (tile.key)}
      <button
        type="button"
        class="tnd-tile"
        class:set={tile.element && !tile.blocked}
        class:blocked={tile.blocked}
        style:--tile-accent={tile.element?.accentColor}
        style:--tile-dark={tile.element?.darkComplement}
        data-morph-source={(!panelState?.isTnDPanelOpen &&
          sourceSide === tile.key) ||
          undefined}
        onclick={() => openSection(tile.key)}
        aria-label={tile.ariaLabel}
      >
        <span class="tile-tag" aria-hidden="true">{tile.tag}</span>
        <span class="tile-icon-slot" aria-hidden="true">
          {#if tile.element}
            <img class="tile-icon" src={tile.element.iconPath} alt="" />
            {#if tile.blocked}
              <span class="loop-badge">LOOP</span>
            {/if}
          {:else}
            <span class="free-ring"></span>
          {/if}
        </span>
        <span class="tile-words" aria-hidden="true">{tile.words}</span>
      </button>
    {/each}

    {#if display.turnsMatched}
      <span class="turns-link" aria-hidden="true">
        <i class="fas fa-link"></i>
      </span>
    {/if}
  </div>
</div>

<style>
  .tnd-card-wrapper {
    container-type: size;
    container-name: tnd-card;
    position: relative;
    border-radius: 16px;
    overflow: visible;

    /* A quiet frame; the tiles carry the color. */
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--theme-card-bg) 78%, #44403c) 0%,
      color-mix(in srgb, var(--theme-card-bg) 70%, #292524) 100%
    );
    box-shadow:
      0 0 0 1px rgba(0, 0, 0, 0.12),
      0 1px 2px rgba(0, 0, 0, 0.15),
      0 2px 4px rgba(0, 0, 0, 0.1),
      inset 0 1px 0 var(--theme-stroke);
  }

  .tnd-card {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: clamp(4px, 2.5cqw, 10px);
    width: 100%;
    height: 100%;
    padding: clamp(4px, 2.5cqw, 10px);
  }

  .tnd-tile {
    position: relative;
    display: grid;
    /* Tag, icon, words on fixed rows so the two tiles always line up. */
    grid-template-rows: auto minmax(0, 1fr) auto;
    justify-items: center;
    align-items: center;
    gap: clamp(1px, 2cqh, 6px);
    min-width: 0;
    min-height: 0;
    padding: clamp(4px, 4cqh, 10px) clamp(4px, 2cqw, 8px);
    border-radius: 12px;
    border: 1px solid color-mix(in srgb, white 12%, transparent);
    background: color-mix(in srgb, white 5%, transparent);
    color: white;
    font-family: inherit;
    text-align: center;
    cursor: pointer;
    overflow: hidden;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
    transition:
      transform var(--duration-instant, 120ms) cubic-bezier(0.4, 0, 0.2, 1),
      filter var(--duration-instant, 120ms) ease;
  }

  /* A mode is set: the tile wears its element, with a glossy top light. */
  .tnd-tile.set {
    border-color: color-mix(in srgb, var(--tile-accent) 55%, transparent);
    background:
      linear-gradient(
        180deg,
        color-mix(in srgb, white 14%, transparent) 0%,
        transparent 55%
      ),
      linear-gradient(
        150deg,
        color-mix(in srgb, var(--tile-accent) 55%, transparent) 0%,
        color-mix(in srgb, var(--tile-dark) 70%, transparent) 100%
      );
  }

  .tnd-tile.blocked {
    border-style: dashed;
    border-color: color-mix(in srgb, white 25%, transparent);
  }

  @media (hover: hover) {
    .tnd-tile:hover {
      filter: brightness(1.12);
    }
  }

  .tnd-tile:active {
    transform: scale(0.96);
  }

  .tnd-tile:focus-visible {
    outline: 2px solid white;
    outline-offset: 2px;
  }

  .tile-tag {
    min-width: 1.6em;
    padding: 0.15em 0.5em;
    border-radius: 999px;
    background: color-mix(in srgb, black 28%, transparent);
    font-size: calc(var(--card-text-size) * 0.6);
    font-weight: 800;
    letter-spacing: 0.06em;
    line-height: 1.1;
    color: color-mix(in srgb, white 88%, transparent);
  }

  /* The icon is sized by whichever side of the tile runs out first. */
  .tile-icon-slot {
    position: relative;
    display: grid;
    place-items: center;
    width: clamp(20px, min(48cqh, 36cqw), 96px);
    height: clamp(20px, min(48cqh, 36cqw), 96px);
    min-height: 0;
  }

  .tile-icon {
    width: 100%;
    height: 100%;
    object-fit: contain;
    filter: drop-shadow(0 3px 6px rgba(0, 0, 0, 0.35));
  }

  .tnd-tile.blocked .tile-icon {
    filter: grayscale(1) brightness(0.8);
    opacity: 0.55;
  }

  .loop-badge {
    position: absolute;
    bottom: -2px;
    left: 50%;
    transform: translateX(-50%);
    padding: 0.1em 0.45em;
    border-radius: 6px;
    background: #f97316;
    color: white;
    font-size: clamp(8px, calc(var(--card-text-size) * 0.45), 12px);
    font-weight: 800;
    letter-spacing: 0.04em;
    line-height: 1.2;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
  }

  /* Free: an empty ring where the icon would be. */
  .free-ring {
    width: 78%;
    height: 78%;
    border-radius: 50%;
    border: 2px dashed color-mix(in srgb, white 40%, transparent);
  }

  .tile-words {
    max-width: 100%;
    font-size: calc(var(--card-text-size) * 0.62);
    font-weight: var(--card-text-weight);
    letter-spacing: var(--card-text-spacing);
    line-height: 1.15;
    color: color-mix(in srgb, white 92%, transparent);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    overflow-wrap: anywhere;
  }

  .tnd-tile.blocked .tile-words {
    color: color-mix(in srgb, white 65%, transparent);
    font-style: italic;
  }

  /* Matched turns: a small link riding the seam between the tiles. */
  .turns-link {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    display: grid;
    place-items: center;
    width: clamp(16px, 14cqh, 26px);
    height: clamp(16px, 14cqh, 26px);
    border-radius: 50%;
    background: color-mix(in srgb, var(--theme-card-bg) 60%, #1c1917);
    border: 1px solid color-mix(in srgb, white 30%, transparent);
    color: white;
    font-size: clamp(8px, 7cqh, 13px);
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
    pointer-events: none;
    z-index: 2;
  }

  /* A short card drops the words and sets the tag beside the icon; the icon
     and ring carry the mode. */
  @container tnd-card (max-height: 96px) {
    .tnd-tile {
      grid-template-rows: minmax(0, 1fr);
      grid-auto-flow: column;
      justify-content: center;
      gap: clamp(3px, 3cqw, 8px);
      padding: 2px 4px;
    }

    .tile-words {
      display: none;
    }

    .tile-tag {
      font-size: calc(var(--card-text-size) * 0.55);
    }

    .tile-icon-slot {
      width: clamp(16px, 62cqh, 52px);
      height: clamp(16px, 62cqh, 52px);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .tnd-tile {
      transition: none;
    }

    .tnd-tile:active {
      transform: none;
    }
  }
</style>
