<script lang="ts">
  import boardUrl from "../../../../docs/superpowers/specs/earth-root-observatory/earth-root-observatory-gate1-amendment-board.svg?url";
  import {
    buildEarthRootObservatoryPlanForGrid,
    earthRootObservatoryFloorSightlineMargin,
    earthRootObservatoryMinimumRouteSeparation,
    earthRootObservatoryViewingSamples,
  } from "#lib/features/museum/data/earth-root-observatory-plan.js";
  import { buildVulcanCaveFloorPlan } from "#lib/features/museum/data/vulcan-cave-floor-plan.js";

  const cave = buildVulcanCaveFloorPlan();
  const plan = buildEarthRootObservatoryPlanForGrid(cave.grid);
  if (!plan) throw new Error("Earth Root Observatory plan is unavailable");

  const h = plan.performers.find((performer) => performer.id === "h")!;
  const i = plan.performers.find((performer) => performer.id === "i")!;

  function proofFor(performer: typeof h) {
    const samples = earthRootObservatoryViewingSamples(plan!, performer);
    return {
      sampleCount: samples.length,
      minimumFloorMargin: Math.min(
        ...samples.map((sample) =>
          earthRootObservatoryFloorSightlineMargin(plan!, sample, performer)
        )
      ),
      habitatGap:
        earthRootObservatoryMinimumRouteSeparation(plan!, performer.centre) -
        plan!.routeWidth / 2 -
        performer.habitatRadius,
    };
  }

  const hProof = proofFor(h);
  const iProof = proofFor(i);
  const habitatArea = plan.habitatMasses.reduce(
    (total, mass) => total + Math.PI * mass.radiusX * mass.radiusZ,
    0
  );
</script>

<svelte:head>
  <title>Earth Gate 1.1 amendment review</title>
  <meta
    name="description"
    content="Measured Earth Root Observatory sightline and habitat amendment."
  />
</svelte:head>

<main class="review-page">
  <header class="review-header">
    <div>
      <p class="kicker">Earth · Gate 1.1 · ready for review</p>
      <h1>Sightlines and habitat</h1>
      <p class="lede">
        The shell, tree, route, G, and final overlook stay fixed. Red marks show
        the rejected H and I positions. Their solid stages are the measured
        replacement.
      </p>
    </div>
    <a class="board-link" href={boardUrl} target="_blank" rel="noreferrer">
      Open the full evidence board
    </a>
  </header>

  <section class="metrics" aria-label="Amendment measurements">
    <article class="metric h-metric">
      <span>H stage</span>
      <strong>2.6 → 4.2 m</strong>
      <p>
        {hProof.sampleCount}/7 moving rays clear. Feet stay
        {hProof.minimumFloorMargin.toFixed(2)} m above the ledge line.
      </p>
    </article>
    <article class="metric i-metric">
      <span>I stage</span>
      <strong>3.0 → 4.1 m</strong>
      <p>
        {iProof.sampleCount}/7 moving rays clear. Feet stay
        {iProof.minimumFloorMargin.toFixed(2)} m above the ledge line.
      </p>
    </article>
    <article class="metric habitat-metric">
      <span>Habitat reservation</span>
      <strong>{habitatArea.toFixed(1)} m²</strong>
      <p>Five root, fern, and moss fields replace the empty basin.</p>
    </article>
    <article class="metric unchanged-metric">
      <span>Unchanged</span>
      <strong>G · tree · route</strong>
      <p>The seven-stop experience and final 75° ensemble remain intact.</p>
    </article>
  </section>

  <figure class="artifact plan-artifact">
    <figcaption>
      <span>Plan amendment</span>
      <strong>Walk clockwise. Read G, then H, then I.</strong>
    </figcaption>
    <svg
      viewBox="40 100 1160 780"
      role="img"
      aria-label="Amended Earth top-down floor plan"
      preserveAspectRatio="xMidYMid meet"
    >
      <image href={boardUrl} x="0" y="0" width="2000" height="1320" />
    </svg>
  </figure>

  <div class="proof-grid">
    <figure class="artifact">
      <figcaption>
        <span>Vertical proof</span>
        <strong>The foot rays clear the route lip.</strong>
      </figcaption>
      <svg
        viewBox="1200 100 780 430"
        role="img"
        aria-label="Room height and local ledge cutaways"
        preserveAspectRatio="xMidYMid meet"
      >
        <image href={boardUrl} x="0" y="0" width="2000" height="1320" />
      </svg>
    </figure>

    <figure class="artifact">
      <figcaption>
        <span>Motion relationship</span>
        <strong>The G, H, and I environmental reading does not change.</strong>
      </figcaption>
      <svg
        viewBox="1200 525 780 365"
        role="img"
        aria-label="Performance to environment translation"
        preserveAspectRatio="xMidYMid meet"
      >
        <image href={boardUrl} x="0" y="0" width="2000" height="1320" />
      </svg>
    </figure>
  </div>

  <section class="route-section">
    <div class="section-heading">
      <p class="kicker">Experience order</p>
      <h2>What happens from Fire to Air</h2>
    </div>
    <ol class="route-grid">
      {#each plan.stops as stop}
        <li>
          <span class="stop-number">{stop.number}</span>
          <div>
            <strong>{stop.title}</strong>
            <p>{stop.focus}</p>
            <small>{stop.response}</small>
          </div>
        </li>
      {/each}
    </ol>
  </section>

  <footer>
    Blender remains frozen until this amendment passes. The shared G avatar
    body-follow correction remains a separate Gate 2 requirement.
  </footer>
</main>

<style>
  :global(body) {
    margin: 0;
    background: #09100c;
  }

  .review-page {
    --settings-shell-w: var(--shell-w, min(108rem, 94vw));
    --theme-page-bg: #09100c;
    --theme-panel-bg: #111b14;
    --theme-card-bg: #172319;
    --theme-stroke: rgba(190, 218, 176, 0.17);
    --theme-text: #f2f0e7;
    --theme-text-dim: #aebaa9;
    --semantic-route: #8fca7d;
    --semantic-h: #d6b66d;
    --semantic-i: #8dbdd7;
    --semantic-rejected: #d67566;
    container-type: inline-size;
    box-sizing: border-box;
    min-block-size: 100vh;
    padding: clamp(1rem, 2.5vw, 3rem);
    color: var(--theme-text);
    background:
      radial-gradient(circle at 22% 4%, rgba(85, 127, 67, 0.2), transparent 28rem),
      var(--theme-page-bg);
    font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  }

  .review-page > * {
    inline-size: min(100%, var(--settings-shell-w));
    margin-inline: auto;
  }

  .review-header {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 1.5rem;
    margin-block-end: clamp(1rem, 2vw, 2rem);
  }

  .review-header div {
    max-inline-size: 62rem;
  }

  .kicker,
  .review-header h1,
  .review-header p,
  .metric p,
  .section-heading h2,
  .section-heading p,
  .route-grid p,
  .route-grid small,
  footer {
    margin: 0;
  }

  .kicker,
  .metric span,
  figcaption span {
    color: var(--semantic-route);
    font-size: max(0.75rem, 12px);
    font-weight: 760;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .review-header h1,
  .section-heading h2 {
    font-family: Georgia, "Times New Roman", serif;
    font-weight: 540;
  }

  .review-header h1 {
    margin-block: 0.2rem 0.45rem;
    font-size: clamp(2rem, 5cqw, 5rem);
    line-height: 0.95;
  }

  .lede {
    color: var(--theme-text-dim);
    font-size: clamp(0.95rem, 1.25cqw, 1.3rem);
    line-height: 1.5;
  }

  .board-link {
    flex: 0 0 auto;
    min-block-size: 44px;
    padding: 0.8rem 1rem;
    border: 1px solid rgba(143, 202, 125, 0.48);
    border-radius: 999px;
    color: #eaf4df;
    background: rgba(56, 92, 48, 0.55);
    font-size: max(0.88rem, 14px);
    font-weight: 700;
    text-decoration: none;
  }

  .board-link:hover,
  .board-link:focus-visible {
    border-color: var(--semantic-route);
    background: rgba(75, 120, 62, 0.7);
    outline: none;
  }

  .metrics {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.75rem;
    margin-block-end: clamp(1rem, 2vw, 2rem);
  }

  .metric,
  .artifact,
  .route-section,
  footer {
    border: 1px solid var(--theme-stroke);
    background: var(--theme-card-bg);
  }

  .metric {
    display: grid;
    gap: 0.35rem;
    min-block-size: 8.5rem;
    padding: clamp(0.9rem, 1.5cqw, 1.5rem);
    border-radius: 1rem;
  }

  .h-metric span {
    color: var(--semantic-h);
  }

  .i-metric span {
    color: var(--semantic-i);
  }

  .metric strong {
    align-self: end;
    font-family: Georgia, "Times New Roman", serif;
    font-size: clamp(1.5rem, 2.2cqw, 2.5rem);
    font-weight: 540;
  }

  .metric p {
    color: var(--theme-text-dim);
    font-size: max(0.88rem, 14px);
    line-height: 1.45;
  }

  .artifact {
    overflow: hidden;
    margin-block: 0 1rem;
    border-radius: 1.2rem;
  }

  .artifact figcaption {
    display: grid;
    gap: 0.2rem;
    padding: 0.9rem 1rem;
    border-block-end: 1px solid var(--theme-stroke);
  }

  .artifact figcaption strong {
    font-family: Georgia, "Times New Roman", serif;
    font-size: clamp(1rem, 1.4cqw, 1.45rem);
    font-weight: 540;
  }

  .artifact svg {
    display: block;
    inline-size: 100%;
    block-size: auto;
    background: #101512;
  }

  .proof-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 1rem;
  }

  .route-section {
    margin-block-start: 1rem;
    padding: clamp(1rem, 2cqw, 2rem);
    border-radius: 1.2rem;
  }

  .section-heading {
    margin-block-end: 1rem;
  }

  .section-heading h2 {
    margin-block-start: 0.2rem;
    font-size: clamp(1.5rem, 2.5cqw, 2.75rem);
  }

  .route-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.75rem;
    padding: 0;
    margin: 0;
    list-style: none;
  }

  .route-grid li {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.75rem;
    min-block-size: 8rem;
    padding: 0.85rem;
    border: 1px solid var(--theme-stroke);
    border-radius: 0.85rem;
    background: var(--theme-panel-bg);
  }

  .route-grid li div {
    display: grid;
    align-content: start;
    gap: 0.3rem;
  }

  .stop-number {
    display: grid;
    place-items: center;
    inline-size: 2.25rem;
    block-size: 2.25rem;
    border-radius: 50%;
    color: #0d160e;
    background: var(--semantic-route);
    font-weight: 800;
  }

  .route-grid strong {
    font-family: Georgia, "Times New Roman", serif;
    font-size: 1.05rem;
    font-weight: 550;
  }

  .route-grid p {
    color: var(--theme-text);
    font-size: max(0.88rem, 14px);
    line-height: 1.35;
  }

  .route-grid small {
    color: var(--theme-text-dim);
    font-size: max(0.75rem, 12px);
    line-height: 1.35;
  }

  footer {
    margin-block-top: 1rem;
    padding: 0.9rem 1rem;
    border-radius: 0.85rem;
    color: #d99a8e;
    font-size: max(0.82rem, 13px);
    line-height: 1.45;
  }

  @container (min-width: 44rem) {
    .metrics,
    .proof-grid,
    .route-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @container (min-width: 80rem) {
    .metrics,
    .route-grid {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }

  @container (min-width: 110rem) {
    .route-grid {
      grid-template-columns: repeat(7, minmax(0, 1fr));
    }
  }

  @media (max-width: 42rem) {
    .review-header {
      align-items: stretch;
      flex-direction: column;
    }

    .board-link {
      align-self: start;
    }
  }
</style>
