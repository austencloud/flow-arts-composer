<!--
  TransformSection.svelte

  Flat 2×3 grid of transform buttons matching the v4 mockup.
  No Apply To selector, no rotation strip, no hotkey badges.
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import type { CellEditorPanelState } from "../state/cell-editor-panel-state.svelte";
  import type { TransformType } from "$lib/shared/animation-engine/domain/compose-types";

  let {
    panelState,
    onTransform,
  }: {
    panelState: CellEditorPanelState;
    onTransform: (type: TransformType) => void;
  } = $props();

  const row1: { type: TransformType; label: string; icon: string }[] = [
    { type: "mirror", label: "Mirror", icon: "fa-left-right" },
    { type: "flip", label: "Flip", icon: "fa-arrows-up-down" },
    { type: "rotate45R", label: "Rotate", icon: "fa-rotate" },
  ];

  const row2: { type: TransformType; label: string; icon: string }[] = [
    { type: "swapHands", label: "Swap", icon: "fa-shuffle" },
    { type: "rewind", label: "Rewind", icon: "fa-backward" },
    { type: "shiftStart", label: "Shift", icon: "fa-forward" },
  ];
</script>

<div class="transform-section">
  <span class="section-header">TRANSFORM</span>

  <div
    class="btn-row"
    role="group"
    aria-label={t("compose_ui_transform_row_1")}
  >
    {#each row1 as btn}
      <button class="transform-btn" onclick={() => onTransform(btn.type)}>
        <i class="fas {btn.icon}" aria-hidden="true"></i>
        {btn.label}
      </button>
    {/each}
  </div>

  <div
    class="btn-row"
    role="group"
    aria-label={t("compose_ui_transform_row_2")}
  >
    {#each row2 as btn}
      <button class="transform-btn" onclick={() => onTransform(btn.type)}>
        <i class="fas {btn.icon}" aria-hidden="true"></i>
        {btn.label}
      </button>
    {/each}
  </div>
</div>

<style>
  .transform-section {
    display: flex;
    flex-direction: column;
    gap: 6px;
    animation: slideDown 180ms ease-out;
  }

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-6px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .section-header {
    font-size: 13px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: rgba(255, 255, 255, 0.7);
  }

  .btn-row {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .transform-btn {
    flex: 1;
    min-height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    padding: 6px 8px;
    border-radius: 8px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    color: rgba(255, 255, 255, 0.75);
    font-size: 12px;
    cursor: pointer;
    transition:
      background 150ms ease,
      border-color 150ms ease;
  }

  .transform-btn i {
    font-size: 11px;
  }

  .transform-btn:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
    border-color: var(--theme-stroke, rgba(255, 255, 255, 0.15));
  }

  .transform-btn:active {
    transform: scale(0.97);
  }

  @media (prefers-reduced-motion: reduce) {
    .transform-section {
      animation: none;
    }

    .transform-btn {
      transition: none;
    }

    .transform-btn:active {
      transform: none;
    }
  }
</style>
