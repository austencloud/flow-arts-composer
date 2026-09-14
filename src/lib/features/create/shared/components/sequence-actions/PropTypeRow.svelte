<!--
  PropTypeRow.svelte

  Per-color prop-type selector + Buugeng chirality toggle. Extracted verbatim
  from TurnsEditMode so the single-step turns controls can be composed per-color
  (into the shared blue/red frame used by both single and batch editing) without
  duplicating the markup/logic. TurnsEditMode renders the same output via this.

  Compact mode: icon-only prop button (mobile). Full mode: labeled button.
-->
<script lang="ts">
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { isBuugengFamilyProp } from "$lib/shared/pictograph/prop/domain/enums/prop-classification";
  import { getPropTypeDisplayInfo } from "$lib/shared/settings/components/tabs/prop-type/prop-type-registry";
  import {
    getSettings,
    updateSettings,
  } from "$lib/shared/application/state/app-state.svelte";

  interface Props {
    hand: "left" | "right";
    compact?: boolean;
    onOpenPropSheet?: (hand: "left" | "right") => void;
  }

  let { hand, compact = false, onOpenPropSheet }: Props = $props();

  const tone = $derived(hand === "left" ? "blue" : "red");

  const settings = $derived(getSettings());
  const propType = $derived(
    hand === "left"
      ? (settings.leftPropType ?? PropType.STAFF)
      : (settings.rightPropType ?? PropType.STAFF)
  );
  const isBuugeng = $derived(isBuugengFamilyProp(propType));
  const flipped = $derived(
    hand === "left"
      ? (settings.leftBuugengFlipped ?? false)
      : (settings.rightBuugengFlipped ?? false)
  );
  const displayInfo = $derived(getPropTypeDisplayInfo(propType));

  function toggleChirality() {
    if (hand === "left") {
      updateSettings({ leftBuugengFlipped: !flipped });
    } else {
      updateSettings({ rightBuugengFlipped: !flipped });
    }
  }
</script>

<div class="prop-type-row {tone}" class:compact>
  {#if compact}
    <!-- Icon-only button for compact mode -->
    <button
      class="prop-icon-btn"
      onclick={() => onOpenPropSheet?.(hand)}
      aria-label="Change {hand} prop type: {displayInfo.label}"
    >
      <span
        role="img"
        aria-label={displayInfo.label}
        style:mask-image={`url("${displayInfo.image}")`}
        class="prop-icon-sm"
      ></span>
    </button>
  {:else}
    <!-- Full button with label -->
    <button
      class="prop-type-btn"
      onclick={() => onOpenPropSheet?.(hand)}
      aria-label="Change {hand} prop type"
    >
      <span role="img" aria-label={displayInfo.label} class="prop-icon"
        style:mask-image={`url("${displayInfo.image}")`}></span>
      <span class="prop-name">{displayInfo.label}</span>
      <i class="fas fa-chevron-right" aria-hidden="true"></i>
    </button>
  {/if}
  {#if isBuugeng}
    <!--
      The one-click per-color path. The full chirality picker now lives in the
      prop sheet this row opens (BentoPropGrid's chirality row), but keeping
      this shortcut saves a sheet open for the flip you make most often.
      aria-pressed and the visible word replace what used to be a title
      attribute and an unlabelled icon.
    -->
    <button
      class="chirality-btn"
      class:compact
      class:flipped
      onclick={toggleChirality}
      aria-label="{hand} buugeng chirality: {flipped ? 'B' : 'A'}"
      aria-pressed={flipped}
    >
      <i class="fas fa-arrows-left-right" aria-hidden="true"></i>
      {#if !compact}
        <!--
          Ghost-sizer: both values occupy the same grid cell so the cell is as
          wide as the wider of them and the row never shifts on toggle
          (.claude/rules/no-layout-shift.md). A and B are near-identical widths
          today, but the sizer is what keeps that a fact about the font rather
          than something the layout depends on.
        -->
        <span class="chirality-word">
          <span class="sizer" aria-hidden="true">B</span>
          <span class="sizer" aria-hidden="true">A</span>
          <span class="live">{flipped ? "B" : "A"}</span>
        </span>
      {/if}
    </button>
  {/if}
</div>

<style>
  .prop-icon, .prop-icon-sm {
    display: inline-block;
    flex-shrink: 0;
    mask-size: contain;
    mask-position: center;
    mask-repeat: no-repeat;
    background: var(--prop-color, var(--dm-motion-blue));
  }


  .prop-type-row {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    margin-top: 4px;
    padding-top: 8px;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  /* Compact mode: inline with turns row, no divider */
  .prop-type-row.compact {
    gap: 4px;
    margin-top: 0;
    padding-top: 0;
    border-top: none;
    width: auto;
    justify-content: center;
  }

  .prop-type-btn {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border-radius: 8px;
    border: 1px solid;
    cursor: pointer;
    font-size: var(--font-size-compact, 12px);
    font-weight: 500;
    transition: all var(--duration-fast) ease;
  }

  .prop-type-btn .prop-icon {
    width: 20px;
    height: 20px;
    object-fit: contain;
  }

  .prop-type-btn .prop-name {
    flex: 1;
    text-align: left;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .prop-type-btn .fa-chevron-right {
    font-size: 0.65rem;
    opacity: 0.5;
  }

  /* Blue prop type button */
  .prop-type-row.blue .prop-type-btn {
    background: rgba(var(--user-left-rgb, 59, 130, 246), 0.15);
    border-color: rgba(var(--user-left-rgb, 59, 130, 246), 0.3);
    color: rgba(255, 255, 255, 0.9);
  }

  .prop-type-row.blue .prop-type-btn:hover {
    background: rgba(var(--user-left-rgb, 59, 130, 246), 0.25);
    border-color: rgba(var(--user-left-rgb, 59, 130, 246), 0.5);
  }

  /* Red prop type button */
  .prop-type-row.red .prop-type-btn {
    background: rgba(var(--user-right-rgb, 239, 68, 68), 0.15);
    border-color: rgba(var(--user-right-rgb, 239, 68, 68), 0.3);
    color: rgba(255, 255, 255, 0.9);
  }

  .prop-type-row.red .prop-type-btn:hover {
    background: rgba(var(--user-right-rgb, 239, 68, 68), 0.25);
    border-color: rgba(var(--user-right-rgb, 239, 68, 68), 0.5);
  }

  /* ============================================================================
     COMPACT ICON-ONLY PROP BUTTON - Small icon button for mobile
     ============================================================================ */

  .prop-icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
    border-radius: 8px;
    border: 1px solid;
    cursor: pointer;
    transition: all var(--duration-fast) ease;
    padding: 4px;
  }

  .prop-icon-sm {
    width: 24px;
    height: 24px;
    object-fit: contain;
  }

  /* Blue icon button */
  .prop-type-row.blue .prop-icon-btn {
    background: rgba(var(--user-left-rgb, 59, 130, 246), 0.15);
    border-color: rgba(var(--user-left-rgb, 59, 130, 246), 0.3);
  }

  .prop-type-row.blue .prop-icon-btn:hover {
    background: rgba(var(--user-left-rgb, 59, 130, 246), 0.25);
    border-color: rgba(var(--user-left-rgb, 59, 130, 246), 0.5);
  }

  /* Red icon button */
  .prop-type-row.red .prop-icon-btn {
    background: rgba(var(--user-right-rgb, 239, 68, 68), 0.15);
    border-color: rgba(var(--user-right-rgb, 239, 68, 68), 0.3);
  }

  .prop-type-row.red .prop-icon-btn:hover {
    background: rgba(var(--user-right-rgb, 239, 68, 68), 0.25);
    border-color: rgba(var(--user-right-rgb, 239, 68, 68), 0.5);
  }


  .chirality-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-width: 36px;
    padding: 0 8px;
    height: 36px;
    border-radius: 8px;
    border: 1px solid;
    cursor: pointer;
    font-size: 0.85rem;
    transition: all var(--duration-fast) ease;
    flex-shrink: 0;
  }

  .chirality-word {
    display: inline-grid;
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
  }

  .chirality-word .sizer,
  .chirality-word .live {
    grid-area: 1 / 1;
    white-space: nowrap;
  }

  .chirality-word .sizer {
    visibility: hidden;
  }

  /* Compact chirality button */
  .chirality-btn.compact {
    padding: 0;
    width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
    font-size: var(--font-size-compact, 12px);
    border-radius: 8px;
  }

  /* Blue chirality button */
  .prop-type-row.blue .chirality-btn {
    background: rgba(var(--user-left-rgb, 59, 130, 246), 0.15);
    border-color: rgba(var(--user-left-rgb, 59, 130, 246), 0.3);
    color: rgba(var(--user-left-rgb, 59, 130, 246), 0.7);
  }

  .prop-type-row.blue .chirality-btn:hover {
    background: rgba(var(--user-left-rgb, 59, 130, 246), 0.25);
    border-color: rgba(var(--user-left-rgb, 59, 130, 246), 0.5);
    color: var(--user-left-color, var(--semantic-info));
  }

  .prop-type-row.blue .chirality-btn.flipped {
    background: rgba(var(--user-left-rgb, 59, 130, 246), 0.3);
    border-color: rgba(var(--user-left-rgb, 59, 130, 246), 0.6);
    color: var(--user-left-color, var(--semantic-info));
    box-shadow: 0 2px 8px rgba(var(--user-left-rgb, 59, 130, 246), 0.25);
  }

  /* Red chirality button */
  .prop-type-row.red .chirality-btn {
    background: rgba(var(--user-right-rgb, 239, 68, 68), 0.15);
    border-color: rgba(var(--user-right-rgb, 239, 68, 68), 0.3);
    color: rgba(var(--user-right-rgb, 239, 68, 68), 0.7);
  }

  .prop-type-row.red .chirality-btn:hover {
    background: rgba(var(--user-right-rgb, 239, 68, 68), 0.25);
    border-color: rgba(var(--user-right-rgb, 239, 68, 68), 0.5);
    color: var(--user-right-color, var(--semantic-error));
  }

  .prop-type-row.red .chirality-btn.flipped {
    background: rgba(var(--user-right-rgb, 239, 68, 68), 0.3);
    border-color: rgba(var(--user-right-rgb, 239, 68, 68), 0.6);
    color: var(--user-right-color, var(--semantic-error));
    box-shadow: 0 2px 8px rgba(var(--user-right-rgb, 239, 68, 68), 0.25);
  }

  @media (prefers-reduced-motion: reduce) {
    .prop-type-btn,
    .prop-icon-btn,
    .chirality-btn {
      transition: none;
    }
  }
</style>
