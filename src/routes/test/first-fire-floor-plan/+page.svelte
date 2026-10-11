<script lang="ts">
  import { buildNominalFirstFireProcessionPlan } from "#lib/features/museum/data/first-fire-procession-plan.js";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import FirstFirePlanMap from "./FirstFirePlanMap.svelte";
  import {
    FIRST_FIRE_REVIEW_STAGES,
    type ReviewStage,
  } from "./first-fire-review";

  const plan = buildNominalFirstFireProcessionPlan();
  const roomWidth = plan.room.maxX - plan.room.minX;
  const roomDepth = plan.room.maxZ - plan.room.minZ;
  const totalTorchStems =
    plan.torchBudget.laneStems +
    plan.shrines.length * plan.torchBudget.perimeterStemsPerShrine;

  const stageOptions = FIRST_FIRE_REVIEW_STAGES.map((stage) => ({
    value: stage.value,
    label: stage.label,
    shortLabel: stage.shortLabel,
    tone: "accent" as const,
    id: `first-fire-stage-${stage.value}`,
    controls: "first-fire-stage-panel",
  }));

  let reviewStage = $state<ReviewStage>("overview");
  const activeStage = $derived(
    FIRST_FIRE_REVIEW_STAGES.find((stage) => stage.value === reviewStage) ??
      FIRST_FIRE_REVIEW_STAGES[0]!
  );
</script>

<svelte:head>
  <title>The First Fire floor-plan test</title>
  <meta
    name="description"
    content="Measured review plan for the First Fire Torch Procession."
  />
</svelte:head>

<main class="fire-plan-page">
  <header class="page-header">
    <div>
      <p class="eyebrow">Vulcan Cave spatial review</p>
      <h1>The First Fire</h1>
      <p class="intro">
        Measured floor-plan test for the torch procession. Select a beat to see
        what remains aflame, what drops to coals, and where Earth takes over.
      </p>
    </div>

    <div class="decision-lock" aria-label="Design status: locked">
      <span class="lock-light" aria-hidden="true"></span>
      <span>Design locked</span>
      <strong>60 × 30 m</strong>
    </div>
  </header>

  <section class="stage-control" aria-labelledby="review-stage-label">
    <div class="control-heading">
      <span id="review-stage-label">Review stage</span>
      <span>Fire state and route emphasis</span>
    </div>
    <SegmentedControl
      options={stageOptions}
      value={reviewStage}
      onchange={(value) => (reviewStage = value)}
      color="accent"
      semantics="tabs"
      ariaLabelledby="review-stage-label"
    />
  </section>

  <div class="review-shell">
    <section class="plan-card" aria-labelledby="plan-title">
      <div class="plan-heading">
        <div>
          <p class="panel-kicker">Measured contract</p>
          <h2 id="plan-title">Torch Procession floor plan</h2>
        </div>

        <ul class="legend" aria-label="Floor-plan legend">
          <li><span class="legend-line route"></span>Visitor route</li>
          <li><span class="legend-line fire"></span>Fire trench</li>
          <li><span class="legend-block rock"></span>Sightline rock</li>
          <li><span class="legend-line growth"></span>Earth growth</li>
        </ul>
      </div>

      <FirstFirePlanMap {plan} {reviewStage} />

      <p class="plan-caption">
        Coordinates, path widths, shrine radii, and occluders come directly from <code
          >first-fire-procession-plan.ts</code
        >. The test page adds no second geometry source.
      </p>
    </section>

    <aside
      id="first-fire-stage-panel"
      class="review-panel"
      role="tabpanel"
      aria-labelledby={`first-fire-stage-${reviewStage}`}
      tabindex="0"
    >
      <div class="stage-readout">
        <p class="panel-kicker">{activeStage.label}</p>
        <h2>{activeStage.heading}</h2>
        <p>{activeStage.description}</p>
        <strong>{activeStage.readout}</strong>
      </div>

      <dl class="plan-facts">
        <div>
          <dt>Clear interior</dt>
          <dd>{roomWidth} × {roomDepth} m</dd>
        </div>
        <div>
          <dt>Shrine orbit</dt>
          <dd>{Math.abs(plan.shrines[0]!.orbitSweepDegrees)}°</dd>
        </div>
        <div>
          <dt>Static stems</dt>
          <dd>{totalTorchStems}</dd>
        </div>
        <div>
          <dt>Detailed fire</dt>
          <dd>{plan.torchBudget.maximumDetailedShrines} shrine max</dd>
        </div>
      </dl>

      <section class="handoff-notes" aria-labelledby="handoff-title">
        <p class="panel-kicker">3D handoff</p>
        <h3 id="handoff-title">What the build must preserve</h3>
        <ul>
          <li>One authored route with no dead ends or hard lock behind.</li>
          <li>Three recessed habitats with no shared performance sightline.</li>
          <li>Two-metre-plus circulation outside every fire trench.</li>
          <li>Total red extinction before the green ring appears.</li>
        </ul>
      </section>
    </aside>
  </div>
</main>

<style>
  :global(body) {
    margin: 0;
    background: #070606;
  }

  .fire-plan-page {
    --theme-accent: #ea580c;
    --theme-card-bg: rgba(255, 245, 235, 0.055);
    --theme-stroke: rgba(255, 226, 196, 0.16);
    --theme-text: #fff7ed;
    --theme-text-dim: #cdbcae;
    --theme-text-on-accent: #160804;
    --min-touch-target: 44px;
    min-block-size: 100dvh;
    padding: clamp(1rem, 2.6vw, 3.5rem);
    overflow: hidden;
    background:
      radial-gradient(
        circle at 15% 0%,
        rgba(194, 65, 12, 0.2),
        transparent 34%
      ),
      radial-gradient(
        circle at 88% 82%,
        rgba(20, 83, 45, 0.13),
        transparent 32%
      ),
      linear-gradient(145deg, #0b0908 0%, #080706 48%, #040505 100%);
    color: var(--theme-text);
    font-family:
      Inter,
      ui-sans-serif,
      system-ui,
      -apple-system,
      BlinkMacSystemFont,
      "Segoe UI",
      sans-serif;
  }

  .page-header {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 2rem;
    padding-block-end: clamp(1.25rem, 2vw, 2.25rem);
  }

  .page-header > div:first-child {
    min-inline-size: 0;
  }

  .eyebrow,
  .panel-kicker {
    margin: 0;
    color: #fb923c;
    font-size: clamp(0.75rem, 0.7vw, 0.92rem);
    font-weight: 760;
    letter-spacing: 0.13em;
    text-transform: uppercase;
  }

  h1,
  h2,
  h3,
  p {
    margin-block-start: 0;
  }

  h1 {
    margin-block: 0.32rem 0.65rem;
    font-family: Georgia, "Times New Roman", serif;
    font-size: clamp(2.6rem, 5vw, 6.2rem);
    font-weight: 540;
    letter-spacing: -0.045em;
    line-height: 0.92;
    text-wrap: balance;
  }

  .intro {
    max-inline-size: 52rem;
    margin-block-end: 0;
    color: #d6c9be;
    font-size: clamp(1rem, 1.15vw, 1.3rem);
    line-height: 1.6;
  }

  .decision-lock {
    display: grid;
    grid-template-columns: auto auto;
    align-items: center;
    flex: 0 0 auto;
    gap: 0.3rem 0.65rem;
    min-inline-size: 11.5rem;
    padding: 0.85rem 1rem;
    border: 1px solid rgba(251, 146, 60, 0.26);
    border-radius: 0.85rem;
    background: rgba(67, 20, 7, 0.22);
    box-shadow: inset 0 1px rgba(255, 255, 255, 0.04);
    font-size: 0.82rem;
  }

  .decision-lock strong {
    grid-column: 2;
    color: #ffedd5;
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
  }

  .lock-light {
    grid-row: 1 / span 2;
    inline-size: 0.72rem;
    aspect-ratio: 1;
    border-radius: 50%;
    background: #f97316;
    box-shadow: 0 0 1rem rgba(249, 115, 22, 0.72);
  }

  .stage-control {
    display: grid;
    grid-template-columns: minmax(10rem, 0.45fr) minmax(0, 1.55fr);
    align-items: center;
    gap: clamp(1rem, 2vw, 2rem);
    margin-block-end: clamp(1rem, 1.6vw, 1.6rem);
    padding: 0.7rem;
    border: 1px solid var(--theme-stroke);
    border-radius: 0.8rem;
    background: rgba(0, 0, 0, 0.2);
  }

  .control-heading {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    padding-inline-start: 0.35rem;
  }

  .control-heading span:first-child {
    color: #fff7ed;
    font-size: 0.88rem;
    font-weight: 720;
  }

  .control-heading span:last-child {
    color: #a89484;
    font-size: 0.75rem;
  }

  .review-shell {
    display: grid;
    grid-template-columns: minmax(0, 3fr) minmax(20rem, 1fr);
    align-items: stretch;
    gap: clamp(1rem, 1.6vw, 1.6rem);
  }

  .plan-card,
  .review-panel {
    min-inline-size: 0;
    border: 1px solid var(--theme-stroke);
    border-radius: clamp(0.85rem, 1.2vw, 1.35rem);
    background: rgba(15, 12, 10, 0.8);
    box-shadow:
      0 1.5rem 4rem rgba(0, 0, 0, 0.28),
      inset 0 1px rgba(255, 255, 255, 0.035);
  }

  .plan-card {
    padding: clamp(0.85rem, 1.5vw, 1.5rem);
    container-type: inline-size;
  }

  .plan-heading {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 1.25rem;
    margin-block-end: 1rem;
  }

  .plan-heading h2,
  .review-panel h2 {
    margin-block: 0.28rem 0;
    color: #fff8f0;
    font-family: Georgia, "Times New Roman", serif;
    font-size: clamp(1.45rem, 2.15vw, 2.45rem);
    font-weight: 540;
    line-height: 1.08;
    text-wrap: balance;
  }

  .legend {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 0.48rem 1rem;
    margin: 0;
    padding: 0;
    color: #baa99c;
    font-size: 0.72rem;
    list-style: none;
  }

  .legend li {
    display: inline-flex;
    align-items: center;
    gap: 0.38rem;
  }

  .legend-line,
  .legend-block {
    display: inline-block;
    flex: 0 0 auto;
  }

  .legend-line {
    inline-size: 1.35rem;
    block-size: 0.18rem;
    border-radius: 99rem;
  }

  .legend-line.route {
    background: #f7d08a;
  }

  .legend-line.fire {
    background: #ef4a23;
    box-shadow: 0 0 0.35rem rgba(239, 74, 35, 0.55);
  }

  .legend-line.growth {
    background: #65a30d;
  }

  .legend-block.rock {
    inline-size: 0.82rem;
    block-size: 0.62rem;
    border: 1px solid #725548;
    background: #2b211d;
  }

  .plan-caption {
    margin: 0.8rem 0 0;
    color: #a89484;
    font-size: 0.76rem;
    line-height: 1.5;
  }

  .plan-caption code {
    color: #edc9aa;
  }

  .review-panel {
    display: flex;
    flex-direction: column;
    min-block-size: 0;
    padding: clamp(1.15rem, 2vw, 2rem);
  }

  .review-panel:focus-visible {
    outline: 2px solid #fb923c;
    outline-offset: 3px;
  }

  .stage-readout {
    min-block-size: 16.5rem;
  }

  .stage-readout > p:not(.panel-kicker) {
    margin-block: 1rem 1.15rem;
    color: #cfc1b5;
    font-size: clamp(0.94rem, 0.9vw, 1.08rem);
    line-height: 1.65;
  }

  .stage-readout > strong {
    display: block;
    padding-inline-start: 0.85rem;
    border-inline-start: 2px solid #f97316;
    color: #ffddbd;
    font-size: 0.86rem;
    line-height: 1.5;
  }

  .plan-facts {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0;
    margin: 0;
    border-block: 1px solid var(--theme-stroke);
  }

  .plan-facts div {
    min-inline-size: 0;
    padding: 0.9rem 0.25rem;
  }

  .plan-facts div:nth-child(odd) {
    border-inline-end: 1px solid var(--theme-stroke);
  }

  .plan-facts dt {
    margin-block-end: 0.25rem;
    color: #9f8d7e;
    font-size: 0.7rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .plan-facts dd {
    margin: 0;
    color: #fff0df;
    font-size: 0.98rem;
    font-weight: 720;
    font-variant-numeric: tabular-nums;
  }

  .handoff-notes {
    margin-block-start: auto;
    padding-block-start: 1.4rem;
  }

  .handoff-notes h3 {
    margin-block: 0.3rem 0.8rem;
    color: #f7ede5;
    font-size: 1rem;
  }

  .handoff-notes ul {
    display: grid;
    gap: 0.52rem;
    margin: 0;
    padding-inline-start: 1.15rem;
    color: #baa99c;
    font-size: 0.82rem;
    line-height: 1.48;
  }

  .handoff-notes li::marker {
    color: #f97316;
  }

  @container (width < 52rem) {
    .plan-heading {
      align-items: start;
      flex-direction: column;
    }

    .legend {
      justify-content: flex-start;
    }
  }

  @media (min-width: 1680px) {
    .review-shell {
      grid-template-columns: minmax(0, 3.25fr) minmax(24rem, 1fr);
    }

    .stage-readout {
      min-block-size: 19rem;
    }

    .review-panel {
      font-size: 1.08rem;
    }
  }

  @media (max-width: 72rem) {
    .review-shell {
      grid-template-columns: 1fr;
    }

    .review-panel {
      display: grid;
      grid-template-columns: minmax(0, 1.25fr) minmax(18rem, 0.75fr);
      gap: 1.5rem;
    }

    .stage-readout {
      min-block-size: 0;
    }

    .plan-facts {
      align-self: start;
    }

    .handoff-notes {
      grid-column: 1 / -1;
      margin-block-start: 0;
      padding-block-start: 0;
    }
  }

  @media (max-width: 48rem) {
    .fire-plan-page {
      padding: 1rem;
    }

    .page-header {
      align-items: start;
      flex-direction: column;
      gap: 1rem;
    }

    .decision-lock {
      inline-size: 100%;
    }

    .stage-control {
      grid-template-columns: 1fr;
      gap: 0.65rem;
    }

    .review-panel {
      display: flex;
    }

    .plan-facts {
      margin-block-start: 1.25rem;
    }

    .handoff-notes {
      padding-block-start: 1.35rem;
    }
  }
</style>
