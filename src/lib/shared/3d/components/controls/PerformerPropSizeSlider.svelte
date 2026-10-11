<script lang="ts">
  import { inchesToCm } from "@austencloud/scene-3d";
  import type { CharacterInstanceState } from "../../state/character-instance-state.svelte";
  import {
    reportViewerControlChange,
    type ViewerControlSink,
  } from "#lib/shared/sequence-viewer/domain/viewer-control-analytics.js";

  interface Props {
    performer: CharacterInstanceState;
    mixed?: boolean;
    onSizeChange?: (cm: number) => void;
    onSettingChange?: ViewerControlSink;
  }
  let {
    performer,
    mixed = false,
    onSizeChange,
    onSettingChange,
  }: Props = $props();

  const currentCm = $derived(
    (performer.staffLength * 100) / performer.gridScale
  );
  const displayInches = $derived(Math.round(currentCm / 2.54));
  const joined = $derived(performer.gridScale < 1);

  function handleInput(e: Event) {
    const cm = Number((e.currentTarget as HTMLInputElement).value);
    const previous = currentCm;
    if (onSizeChange) {
      onSizeChange(cm);
    } else {
      performer.setStaffLengthCm(cm);
    }
    reportViewerControlChange(
      onSettingChange,
      "viewer_3d_performer",
      "prop_size_cm",
      previous,
      cm,
      { coalesce: true }
    );
  }
</script>

<div class="prop-size">
  <div class="size-header">
    <span class="size-label">{joined ? "Base prop size" : "Prop size"}</span>
    <span class="size-value">{mixed ? "Mixed" : `${displayInches} in`}</span>
  </div>
  <input
    type="range"
    class="size-slider"
    min={inchesToCm(24)}
    max={inchesToCm(60)}
    step="1"
    value={currentCm}
    oninput={handleInput}
    aria-label={joined ? "Base prop size" : "Prop size"}
  />
  {#if joined && !mixed}
    <span class="size-label">
      Joined grids use {Math.round(performer.gridScale * 100)}% of this size.
    </span>
  {/if}
</div>

<style>
  .prop-size {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .size-header {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .size-label {
    font-size: 14px;
    font-weight: 600;
    color: var(--theme-text-dim);
  }
  .size-value {
    font-size: 14px;
    font-weight: 700;
    color: var(--theme-accent-text);
    font-variant-numeric: tabular-nums;
    margin-left: auto;
  }
  .size-slider {
    width: 100%;
    height: 44px;
    appearance: none;
    background: transparent;
    outline: none;
    cursor: pointer;
    transition: background 180ms;
  }
  .size-slider:hover {
    background: transparent;
  }
  .size-slider::-webkit-slider-runnable-track {
    height: 6px;
    border-radius: 3px;
    background: var(--theme-stroke-strong);
  }
  .size-slider::-webkit-slider-thumb {
    appearance: none;
    width: 22px;
    height: 22px;
    margin-top: -8px;
    border-radius: 50%;
    background: var(--theme-accent);
    border: 2.5px solid var(--surface-darker);
    cursor: pointer;
    box-shadow: 0 0 10px
      color-mix(in srgb, var(--theme-accent) 35%, transparent);
    transition:
      box-shadow 180ms,
      transform 180ms;
  }
  .size-slider::-webkit-slider-thumb:hover {
    box-shadow: 0 0 16px
      color-mix(in srgb, var(--theme-accent) 55%, transparent);
    transform: scale(1.1);
  }
  .size-slider::-moz-range-thumb {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: var(--theme-accent);
    border: 2.5px solid var(--surface-darker);
    cursor: pointer;
    box-shadow: 0 0 10px
      color-mix(in srgb, var(--theme-accent) 35%, transparent);
  }
  .size-slider::-moz-range-track {
    height: 6px;
    border-radius: 3px;
    background: var(--theme-stroke-strong);
  }
  .size-slider:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }
</style>
