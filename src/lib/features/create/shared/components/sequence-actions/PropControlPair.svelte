<!--
  PropControlPair.svelte

  Unified layout component for Left + Right prop controls.
  Provides consistent glass-morphism card styling for both props.
  Handles stacked (mobile) vs side-by-side (desktop) layout.
  Focused mode overlays both mounted cards and exposes one through a hand picker.

  Compact mode: Tighter padding and gaps for mobile screens.

  Usage:
    <PropControlPair stacked={isMobile} compact={isMobile}>
      {#snippet leftContent()} ... left controls ... {/snippet}
      {#snippet rightContent()} ... right controls ... {/snippet}
    </PropControlPair>
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import type { Snippet } from "svelte";
  import type { TargetHand } from "#lib/shared/create/domain/panel-types.js";

  interface Props {
    /** Stack cards vertically (mobile) vs side-by-side (desktop) */
    stacked?: boolean;
    /** Use compact styling with tighter padding/gaps */
    compact?: boolean;
    /** Give the prop name stronger hierarchy when a card contains field labels. */
    prominentLabels?: boolean;
    /** Show one mounted card at a time in narrow layouts */
    visibleHand?: TargetHand;
    /** Drop the Left/Right heading when a hand picker above already names it. */
    labelsHidden?: boolean;
    /**
     * Make each card a size container named "hand-card" so controls inside
     * can respond to the card's own width. Only for hosts that give the cards
     * a definite width; a shrink-wrapped card would collapse.
     */
    sizedCards?: boolean;
    /** Content for the left prop card */
    leftContent?: Snippet;
    /** Content for the right prop card */
    rightContent?: Snippet;
  }

  let {
    stacked = false,
    compact = false,
    prominentLabels = false,
    visibleHand = "both",
    labelsHidden = false,
    sizedCards = false,
    leftContent,
    rightContent,
  }: Props = $props();
</script>

<div
  class="prop-pair"
  class:stacked
  class:compact
  class:prominent-labels={prominentLabels}
  class:focused={visibleHand !== "both"}
  class:labels-hidden={labelsHidden}
  class:sized-cards={sizedCards}
>
  <div
    class="prop-card blue"
    class:inactive={visibleHand === "right"}
    inert={visibleHand === "right"}
  >
    <span class="prop-label">{t("create_ui_left")}</span>
    <div class="card-content">
      {@render leftContent?.()}
    </div>
  </div>
  <div
    class="prop-card red"
    class:inactive={visibleHand === "left"}
    inert={visibleHand === "left"}
  >
    <span class="prop-label">{t("create_ui_right")}</span>
    <div class="card-content">
      {@render rightContent?.()}
    </div>
  </div>
</div>

<style>
  /* ============================================================================
     PROP PAIR LAYOUT - Stacked (mobile) vs side-by-side (desktop)
     ============================================================================ */

  .prop-pair {
    display: flex;
    gap: 12px;
    /* Wide drawers show two compact cards centered rather than two cards
       stretched across the width; the cap lives in editor-layout.ts. */
    justify-content: center;
  }

  .prop-pair.stacked {
    flex-direction: column;
  }

  /* Both cards stay mounted in the same cell. The tallest card reserves the
     dock height, so switching hands never moves the preview above it. */
  .prop-pair.focused {
    display: grid;
    /* One column that fills the zone, so the lone card spans it like the
       hand picker above instead of shrinking to its stepper. */
    grid-template-columns: minmax(0, 1fr);
  }

  .prop-pair.focused .prop-card {
    grid-area: 1 / 1;
    width: 100%;
    min-width: 0;
    max-width: none;
  }

  /* With a Left | Right picker directly above, the card heading would say the
     same word twice; the tone of the card already carries the hand. */
  .prop-pair.labels-hidden .prop-label {
    display: none;
  }

  .prop-pair.sized-cards .prop-card {
    container: hand-card / inline-size;
  }

  .prop-pair.stacked .prop-card {
    max-width: none;
  }

  .prop-pair.focused .prop-card.inactive {
    opacity: 0;
    pointer-events: none;
  }

  /* Compact mode: tighter gaps */
  .prop-pair.compact {
    gap: 6px;
  }

  .prop-card {
    flex: 1 1 0;
    max-width: var(--max-hand-card-width, 320px);
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 14px;
    border-radius: 12px;
    border: 1px solid;
    transition:
      opacity var(--duration-fast) var(--ease-standard),
      background var(--duration-fast) var(--ease-standard),
      border-color var(--duration-fast) var(--ease-standard),
      box-shadow var(--duration-fast) var(--ease-standard);
  }

  /* Compact mode: tighter padding and gaps */
  .prop-pair.compact .prop-card {
    padding: 8px;
    gap: 6px;
    border-radius: 10px;
  }

  /* Blue - Indigo glass pane */
  .prop-card.blue {
    background: linear-gradient(
      135deg,
      rgba(var(--user-left-rgb, 59, 130, 246), 0.15) 0%,
      rgba(var(--user-left-rgb, 59, 130, 246), 0.05) 100%
    );
    border-color: rgba(var(--user-left-rgb, 59, 130, 246), 0.35);
  }

  /* Red - Rose glass pane */
  .prop-card.red {
    background: linear-gradient(
      135deg,
      rgba(var(--user-right-rgb, 239, 68, 68), 0.15) 0%,
      rgba(var(--user-right-rgb, 239, 68, 68), 0.05) 100%
    );
    border-color: rgba(var(--user-right-rgb, 239, 68, 68), 0.35);
  }

  .prop-label {
    font-size: 0.75rem;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.8);
    text-transform: uppercase;
    letter-spacing: 0.75px;
  }

  /* Start-placement cards have named fields beneath this heading. Giving the
     prop name the stronger tier keeps Left/Right above Location/Orientation in
     the reading order without changing the compact controls used elsewhere. */
  .prop-pair.prominent-labels .prop-label {
    color: var(--theme-text, #fff);
    font-size: clamp(var(--font-size-min, 14px), 1cqw, 1.125rem);
    letter-spacing: 0.06em;
  }

  /* Compact mode: smaller label */
  .prop-pair.compact .prop-label {
    font-size: var(--font-size-compact, 12px);
    letter-spacing: 0.5px;
  }

  .prop-pair.compact.prominent-labels .prop-label {
    font-size: var(--font-size-min, 14px);
    letter-spacing: 0.05em;
  }

  /* ============================================================================
     CARD CONTENT - Container for slotted controls
     Minimum height ensures consistent card size between different control types
     (turns controls have 2 rows, orientation has 1 row - both should look same)
     ============================================================================ */

  .card-content {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    /* Top-aligned so both hands' steppers share a row even when one card's
       content is taller; the card's own min-height keeps the pair level. */
    justify-content: flex-start;
    gap: 8px;
    /* Min height to accommodate turns controls (2 rows of buttons) */
    min-height: calc(var(--min-touch-target, 44px) * 2 + 8px);
  }

  /* Compact mode: single horizontal row layout for mobile
     Invert button + turns controls + prop icon all in one line */
  .prop-pair.compact .card-content {
    flex-direction: row;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: auto;
  }

  .prop-card.blue {
    --prop-color: var(--user-left-color, var(--semantic-info));
    --prop-color-rgb: var(--user-left-rgb, 59, 130, 246);
  }

  .prop-card.red {
    --prop-color: var(--user-right-color, var(--semantic-error));
    --prop-color-rgb: var(--user-right-rgb, 239, 68, 68);
  }

  @media (prefers-reduced-motion: reduce) {
    .prop-card {
      transition: none;
    }
  }
</style>
