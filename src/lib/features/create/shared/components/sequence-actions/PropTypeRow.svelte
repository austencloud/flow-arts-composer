<!--
  PropTypeRow.svelte

  Per-color prop-type selector + Buugeng chirality toggle. Extracted verbatim
  from TurnsEditMode so the single-step turns controls can be composed per-color
  (into the shared blue/red frame used by both single and batch editing) without
  duplicating the markup/logic. TurnsEditMode renders the same output via this.

  Compact mode: icon-only prop button (mobile). Full mode: labeled button.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { handLabel } from "./control-labels";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import { isBuugengFamilyProp } from "#lib/shared/pictograph/prop/domain/enums/prop-classification.js";
  import { getPropTypeDisplayInfo } from "#lib/shared/settings/components/tabs/prop-type/prop-type-registry.js";
  import { getSettings } from "#lib/shared/application/state/app-state.svelte.js";
  import ChiralityToggle from "./ChiralityToggle.svelte";

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
  const displayInfo = $derived(getPropTypeDisplayInfo(propType));
</script>

<div class="prop-type-row {tone}" class:compact>
  {#if compact}
    <!-- Icon-only button for compact mode -->
    <button
      class="prop-icon-btn"
      onclick={() => onOpenPropSheet?.(hand)}
      aria-label={t("create_controls_change_prop", {
        hand: handLabel(hand),
        prop: displayInfo.label,
      })}
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
      aria-label={t("create_controls_change_prop", {
        hand: handLabel(hand),
        prop: displayInfo.label,
      })}
    >
      <span
        role="img"
        aria-label={displayInfo.label}
        class="prop-icon"
        style:mask-image={`url("${displayInfo.image}")`}
      ></span>
      <span class="prop-name">{displayInfo.label}</span>
      <i class="fas fa-chevron-right" aria-hidden="true"></i>
    </button>
  {/if}
  {#if isBuugeng}
    <ChiralityToggle {hand} {compact} />
  {/if}
</div>

<style>
  .prop-icon,
  .prop-icon-sm {
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
    transition:
      background var(--duration-fast) var(--ease-standard),
      border-color var(--duration-fast) var(--ease-standard);
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
    transition:
      background var(--duration-fast) var(--ease-standard),
      border-color var(--duration-fast) var(--ease-standard);
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

  @media (prefers-reduced-motion: reduce) {
    .prop-type-btn,
    .prop-icon-btn {
      transition: none;
    }
  }
</style>
