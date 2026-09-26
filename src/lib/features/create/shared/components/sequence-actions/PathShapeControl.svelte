<!--
  PathShapeControl.svelte

  Per-hand path shape override control. Shows three shape buttons + reset.
  When no override is set, all buttons are deselected and a hint shows the global setting.
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import type { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
  import type { PathShapeValue } from "../../services/step-operations/path-shape-handler";
  import { getAnimationVisibilityManager } from "$lib/shared/animation-engine/state/animation-visibility-state.svelte";

  interface Props {
    leftPathShape: PathShapeValue | undefined;
    rightPathShape: PathShapeValue | undefined;
    compact?: boolean;
    onPathShapeChange: (color: HandSide, shape: PathShapeValue) => void;
    onPathShapeClear: (color: HandSide) => void;
  }

  let {
    leftPathShape,
    rightPathShape,
    compact = false,
    onPathShapeChange,
    onPathShapeClear,
  }: Props = $props();

  const shapes: PathShapeValue[] = ["arc", "linear", "concave"];

  const globalHint = $derived.by(() => {
    const vm = getAnimationVisibilityManager();
    if (vm.getMotionAwarePaths()) return "Motion-Aware";
    const s = vm.getPathShape();
    return s.charAt(0).toUpperCase() + s.slice(1);
  });
</script>

<div class="path-shape-control" class:compact>
  <span class="section-label">{t("create_ui_path_shape")}</span>

  {#each [{ label: "LEFT", hand: "left" as HandSide, current: leftPathShape, cssClass: "blue" }, { label: "RIGHT", hand: "right" as HandSide, current: rightPathShape, cssClass: "red" }] as hand}
    <div class="hand-row">
      <span class="hand-label {hand.cssClass}">{hand.label}</span>
      <div class="shape-buttons">
        {#each shapes as shape}
          <button
            class="shape-btn"
            class:active={hand.current === shape}
            class:blue-active={hand.current === shape &&
              hand.cssClass === "blue"}
            class:red-active={hand.current === shape && hand.cssClass === "red"}
            aria-pressed={hand.current === shape}
            aria-label="{hand.label} path shape: {shape}"
            onclick={() => onPathShapeChange(hand.hand, shape)}
          >
            {shape.charAt(0).toUpperCase() + shape.slice(1)}
          </button>
        {/each}
        <button
          class="shape-btn reset"
          disabled={hand.current === undefined}
          aria-label="Reset {hand.label} path shape to global"
          onclick={() => onPathShapeClear(hand.hand)}
        >
          <i class="fas fa-rotate-left" aria-hidden="true"></i>
        </button>
      </div>
      {#if hand.current === undefined}
        <span class="global-hint">Global: {globalHint}</span>
      {/if}
    </div>
  {/each}
</div>

<style>
  .path-shape-control {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 14px;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .path-shape-control.compact {
    gap: 6px;
    padding: 8px;
  }

  .section-label {
    font-size: 0.75rem;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.8);
    text-transform: uppercase;
    letter-spacing: 0.75px;
    text-align: center;
  }

  .path-shape-control.compact .section-label {
    font-size: 0.65rem;
    letter-spacing: 0.5px;
  }

  .hand-row {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }

  .hand-label {
    font-size: 0.65rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .hand-label.blue {
    color: #448aff;
  }
  .hand-label.red {
    color: #ff5252;
  }

  .shape-buttons {
    display: flex;
    gap: 4px;
  }

  .shape-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 6px 10px;
    border-radius: 8px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.15));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    color: rgba(255, 255, 255, 0.5);
    font-size: 0.7rem;
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-fast, 150ms) ease;
    min-height: var(--min-touch-target, 44px);
    min-width: var(--min-touch-target, 44px);
  }

  .shape-btn:hover:not(:disabled) {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.1));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.25));
    color: rgba(255, 255, 255, 0.8);
  }

  .shape-btn.active {
    color: white;
  }

  .shape-btn.blue-active {
    background: rgba(68, 138, 255, 0.25);
    border-color: rgba(68, 138, 255, 0.5);
  }

  .shape-btn.red-active {
    background: rgba(255, 82, 82, 0.25);
    border-color: rgba(255, 82, 82, 0.5);
  }

  .shape-btn.reset {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border-color: var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .shape-btn.reset:hover:not(:disabled) {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
  }

  .shape-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .global-hint {
    font-size: 0.6rem;
    color: rgba(255, 255, 255, 0.35);
    font-style: italic;
  }

  @media (prefers-reduced-motion: reduce) {
    .shape-btn {
      transition: none;
    }
  }
</style>
