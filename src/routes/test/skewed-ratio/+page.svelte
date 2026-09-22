<!--
  3:4 skewed-arc flower, as real TKA pictographs.

  A beat normally moves a hand 90 degrees. One TKA turn is 180 degrees of
  prop rotation. On a hand arc of alpha degrees with t pro turns:

    prop/hand = 1 + 180t/alpha

  alpha = 135 (a skewed arc), t = 0.25 turns: prop/hand = 1 + 45/135 = 4/3,
  hand:prop 3:4. Eight beats of 135-degree pro arcs at 0.25 turns each close
  the loop: 1080 degrees of hand travel (3 hand circles) against 1440 degrees
  of prop travel (4 circles), orientation returning to its start after
  8 x 45 = 360 degrees.

  The 8 pictographs below are real SkewedPictographDataframe.csv rows (see
  beats.ts) chained end-to-start for both hands, with orientation carried
  forward by the production calculateEndOrientation. The flower is drawn by
  the Theory (QfT) shape engine, which draws any rational hand:prop ratio
  directly, see flower.ts for why the Matrix's own turn axis can't.
-->
<script lang="ts">
  import PictographContainer from "$lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import {
    buildSkewedRatioBeats,
    verifyChain,
    checkOrientationClosure,
    ARC_DEGREES,
    TURNS_PER_BEAT,
  } from "./beats";
  import {
    buildFlowerPoints,
    flowerPathData,
    measurePetals,
    FLOWER_RATIO,
    FLOWER_PETALS,
    HAND_RADIUS,
    STAFF_TIP_REACH,
  } from "./flower";

  const chain = verifyChain();
  const beats = buildSkewedRatioBeats();
  const closure = checkOrientationClosure(beats);

  const flowerPoints = buildFlowerPoints();
  const flowerPath = flowerPathData(flowerPoints);
  const measuredPetals = measurePetals(flowerPoints);

  const VIEW_HALF = HAND_RADIUS + STAFF_TIP_REACH + 12;
</script>

<div class="page">
  <h1>3:4 skewed-arc flower</h1>

  <section class="arithmetic">
    <p class="line">prop/hand = 1 + 180t/&alpha;</p>
    <p class="line">
      &alpha; = {ARC_DEGREES}&deg;, t = {TURNS_PER_BEAT} &rarr; prop/hand = 1 + 45/135
      = 4/3 &rarr; hand:prop 3:4
    </p>
    <p class="line">
      8 beats &times; {ARC_DEGREES}&deg; = 1080&deg; hand travel (3 hand
      circles)
    </p>
    <p class="line">prop travels 1440&deg; (4 circles) in the same 8 beats</p>
    <p class="line">
      per-beat pro orientation offset = 180t = 45&deg;; 8 &times; 45&deg; =
      360&deg;, orientation closes
    </p>
  </section>

  <section class="checks">
    <p class:ok={chain.ok} class:bad={!chain.ok}>
      Chain check (8 real CSV rows, end = next start, both hands):
      {chain.ok ? "closes" : `broken: ${chain.breaks.join("; ")}`}
    </p>
    <p class:ok={closure.closes} class:bad={!closure.closes}>
      Orientation closure (calculateEndOrientation, chained across 8 beats):
      {closure.closes
        ? `closes, blue ${closure.blueStart} -> ... -> ${closure.blueEnd}`
        : `does not close, blue ${closure.blueStart} vs ${closure.blueEnd}, red ${closure.redStart} vs ${closure.redEnd}`}
    </p>
  </section>

  <section class="beats">
    {#each beats as beat (beat.index)}
      <div class="beat">
        <div class="pictograph-box">
          <PictographContainer pictographData={beat.pictograph} />
        </div>
        <p class="caption">{beat.caption}</p>
      </div>
    {/each}
  </section>

  <section class="flower">
    <h2>The flower</h2>
    <p>
      prop:hand ratio {FLOWER_RATIO.propRotations}:{FLOWER_RATIO.handCycles},
      formula petals (pro) = {FLOWER_PETALS}, measured from the traced path = {measuredPetals}
    </p>
    <svg
      viewBox="{-VIEW_HALF} {-VIEW_HALF} {VIEW_HALF * 2} {VIEW_HALF * 2}"
      class="flower-svg"
      role="img"
      aria-label="Flower traced by the 3:4 skewed-arc sequence"
    >
      <circle cx="0" cy="0" r={HAND_RADIUS} class="hand-circle" />
      <path d={flowerPath} class="flower-path" />
      <circle cx="0" cy="0" r="3" class="center-dot" />
    </svg>
  </section>
</div>

<style>
  .page {
    min-height: 100vh;
    padding: 24px;
    max-width: 1200px;
    margin: 0 auto;
    font-family: system-ui, sans-serif;
  }

  h1 {
    margin: 0 0 16px;
  }

  h2 {
    margin: 0 0 8px;
  }

  .arithmetic {
    margin-bottom: 16px;
    padding: 12px 16px;
    border: 1px solid var(--theme-stroke, #444);
    border-radius: 8px;
  }

  .line {
    margin: 4px 0;
    font-family: ui-monospace, monospace;
  }

  .checks {
    margin-bottom: 24px;
  }

  .checks p {
    margin: 4px 0;
    font-family: ui-monospace, monospace;
    font-size: 0.9rem;
  }

  .ok {
    color: var(--semantic-success, #2a2);
  }

  .bad {
    color: var(--semantic-danger, #c22);
  }

  .beats {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 16px;
    margin-bottom: 32px;
  }

  .beat {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
  }

  .pictograph-box {
    width: 180px;
    height: 180px;
  }

  .caption {
    margin: 6px 0 0;
    font-size: 0.8rem;
  }

  .flower {
    margin-top: 16px;
  }

  .flower-svg {
    width: 360px;
    height: 360px;
    border: 1px solid var(--theme-stroke, #444);
    border-radius: 8px;
  }

  .hand-circle {
    fill: none;
    stroke: currentColor;
    stroke-opacity: 0.2;
    stroke-width: 1;
  }

  .flower-path {
    fill: none;
    stroke: #a855f7;
    stroke-width: 2;
  }

  .center-dot {
    fill: currentColor;
    fill-opacity: 0.4;
  }

  @media (max-width: 900px) {
    .beats {
      grid-template-columns: repeat(2, 1fr);
    }
  }
</style>
