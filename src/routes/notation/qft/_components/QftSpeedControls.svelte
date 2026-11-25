<!--
  Playing speed, measured against the slowest a real poi could be swung through
  these moves. 100% is that speed; below it a real string would go slack
  (Austen, 2026-11-23: play it as fast as it must be, "and then you can slow
  down from there").
-->
<script lang="ts">
  import ValueSlider from "#lib/shared/ui/components/ValueSlider.svelte";
  import {
    MAX_POI_LENGTH,
    MAX_SPEED,
    MIN_POI_LENGTH,
    MIN_SPEED,
  } from "#lib/shared/notation/qft/qft-session.js";
  import { getQftAppContext } from "../_context/qft-app-context";

  /** The wide screen keeps speed by the transport and the poi in the panel. */
  let { part = "all" }: { part?: "all" | "speed" | "poi" } = $props();

  const app = getQftAppContext();

  const percent = (value: number) => `${Math.round(value * 100)}%`;
  const centimetres = (value: number) => `${Math.round(value * 100)} cm`;
  const seconds = (value: number) =>
    `${value < 1 ? value.toFixed(2) : value.toFixed(1)} s`;

  const allSlack = $derived(
    app.pace.slack.length === (app.handCount === "two" ? 2 : 1)
  );
  const handWord = (hand: "left" | "right") =>
    hand === "left" ? "Blue" : "Red";

  const reading = $derived.by(() => {
    if (allSlack) return "No real speed for this";
    if (Math.abs(app.speed - 1) < 0.005) return "The slowest a real poi can go";
    return app.speed < 1
      ? "Slower than a real poi can go"
      : "Faster than it has to go";
  });

  const slackNote = $derived.by(() => {
    if (app.pace.slack.length === 0) return null;
    if (app.handCount === "one") {
      return "On this path the string goes slack at any speed.";
    }
    const who =
      app.pace.slack.length === 2
        ? "both strings go"
        : `${handWord(app.pace.slack[0]!).toLowerCase()}'s string goes`;
    return `On this path ${who} slack at any speed.`;
  });
</script>

<section class="speed" class:bar={part === "speed"}>
  {#if part !== "poi"}
    <ValueSlider
      label="Speed"
      value={app.speed}
      min={MIN_SPEED}
      max={MAX_SPEED}
      step={0.05}
      origin={1}
      marks={[1]}
      onmark={(mark) => app.setSpeed(mark)}
      markLabel={() => "Back to real speed"}
      format={percent}
      fromTyped={(typed) => typed / 100}
      onchange={(value) => app.setSpeed(value)}
    />
  {/if}
  {#if part !== "speed"}
    <ValueSlider
      label="Poi length"
      value={app.poiLength}
      min={MIN_POI_LENGTH}
      max={MAX_POI_LENGTH}
      step={0.05}
      format={centimetres}
      fromTyped={(typed) => typed / 100}
      onchange={(value) => app.setPoiLength(value)}
    />
  {/if}
  {#if part !== "poi"}
    <p class="reading">
      <strong>{seconds(app.roundSeconds)} a round</strong>
      <span>{reading}</span>
    </p>
  {/if}
  {#if part !== "speed"}
    <p class="note">
      {#if slackNote}{slackNote}{/if}
      {#if app.handCount === "two" && app.pace.setBy}
        {handWord(app.pace.setBy)} sets the speed for both hands.
      {/if}
    </p>
  {/if}
</section>

<style>
  .speed {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 0.35rem;
    min-width: 0;
  }

  .bar {
    gap: 0;
    width: 100%;
    max-width: 24rem;
    margin-left: auto;
  }

  p {
    margin: 0;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 0.75rem);
    line-height: 1.35;
  }

  .reading {
    display: flex;
    flex-wrap: wrap;
    gap: 0 0.6rem;
    font-variant-numeric: tabular-nums;
  }

  .reading strong {
    color: var(--theme-text, #fff);
    font-weight: 650;
  }

  /* Kept even when empty, so a new move does not shift what is below. */
  .note {
    min-height: 1.35em;
  }
</style>
