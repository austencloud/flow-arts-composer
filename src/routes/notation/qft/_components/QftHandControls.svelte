<script lang="ts">
  import QftFlowerPicker from "#lib/shared/notation/qft/components/QftFlowerPicker.svelte";
  import { QFT_FLOWERS } from "#lib/shared/notation/qft/qft-app-selection.js";
  import { getQftAppContext } from "../_context/qft-app-context";
  import QftPresetControls from "./QftPresetControls.svelte";

  let {
    hand,
    tone,
    showPresets = true,
  }: {
    hand: "left" | "right";
    tone: "accent" | "blue" | "red";
    showPresets?: boolean;
  } = $props();

  const state = getQftAppContext();
  const selection = $derived(hand === "left" ? state.left : state.right);
  const flowerIndex = $derived(
    hand === "left" ? state.leftFlowerIndex : state.rightFlowerIndex
  );
  const label = $derived(
    tone === "accent"
      ? "Hand motion"
      : `${hand === "left" ? "Left" : "Right"} hand`
  );
  const toneColor = $derived(
    tone === "blue"
      ? "var(--prop-blue, #3575e2)"
      : tone === "red"
        ? "var(--prop-red, #ed1c24)"
        : "var(--theme-accent, #8b5cf6)"
  );
</script>

<section class="hand-controls" style:--hand-tone={toneColor}>
  <QftFlowerPicker
    {label}
    flowers={QFT_FLOWERS}
    value={flowerIndex}
    onchange={(index) => state.selectFlower(hand, index)}
    {tone}
  />

  <label class="radius-control" for={`qft-radius-${hand}`}>
    <span class="radius-label">
      <span>Hand path radius</span>
      <output>{selection.radius.toFixed(2)}</output>
    </span>
    <input
      id={`qft-radius-${hand}`}
      type="range"
      min="0"
      max="1.5"
      step="0.05"
      value={selection.radius}
      oninput={(event) =>
        state.setRadius(hand, Number(event.currentTarget.value))}
    />
  </label>

  {#if selection.source.kind === "custom"}
    <p class="restored-note">Restored from the previous Knobs session.</p>
  {/if}

  {#if showPresets}
    <QftPresetControls {hand} {tone} />
  {/if}
</section>

<style>
  .hand-controls {
    display: grid;
    gap: 0.85rem;
    min-width: 0;
    container-type: inline-size;
  }

  .radius-control {
    display: grid;
    gap: 0.45rem;
    padding: 0.75rem;
    border: 1px solid var(--theme-stroke, rgb(255 255 255 / 0.12));
    border-radius: var(--radius-2026-sm, 0.75rem);
    background: var(--theme-card-bg, rgb(0 0 0 / 0.2));
    color: var(--theme-text, #fff);
  }

  .radius-label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    font-size: var(--font-size-sm, 0.875rem);
    font-weight: 600;
  }

  output {
    min-width: 4ch;
    color: var(--hand-tone);
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  input[type="range"] {
    width: 100%;
    min-height: var(--min-touch-target, 44px);
    accent-color: var(--hand-tone);
    cursor: pointer;
  }

  .restored-note {
    margin: 0;
    padding: 0.65rem 0.75rem;
    border-left: 0.2rem solid var(--hand-tone);
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 0.75rem);
  }
</style>
