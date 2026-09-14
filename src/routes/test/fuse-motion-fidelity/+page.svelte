<script lang="ts">
  import PictographContainer from "$lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { buildFuseMotionProofCases } from "./fuse-motion-fidelity-fixtures";

  const proofCases = buildFuseMotionProofCases();
  let readyCases = $state<string[]>([]);

  const passedChecks = $derived(
    proofCases.reduce(
      (total, proof) =>
        total + proof.checks.filter((item) => item.passes).length,
      0
    )
  );
  const totalChecks = $derived(
    proofCases.reduce((total, proof) => total + proof.checks.length, 0)
  );

  function markReady(id: string): void {
    if (!readyCases.includes(id)) readyCases = [...readyCases, id];
  }
</script>

<svelte:head>
  <title>Fuse motion fidelity proof</title>
</svelte:head>

<main
  class="proof-shell"
  data-testid="fuse-motion-fidelity-proof"
  data-ready-count={readyCases.length}
  data-total-cases={proofCases.length}
  data-passed-checks={passedChecks}
  data-total-checks={totalChecks}
>
  <header class="proof-header">
    <div>
      <p class="eyebrow">Fuse verification harness</p>
      <h1>Motion fields reach the real renderer</h1>
      <p class="lede">
        Every frame below comes from <code>fuseSequences</code> and renders
        through the production <code>PictographContainer</code>. The labels
        compare fixed expectations with the returned sequence and motion data.
      </p>
    </div>
    <div
      class="proof-status"
      class:ready={readyCases.length === proofCases.length}
    >
      <strong>{readyCases.length}/{proofCases.length}</strong>
      <span>pictographs ready</span>
      <small>{passedChecks}/{totalChecks} data checks pass</small>
    </div>
  </header>

  <section class="case-grid" aria-label="Fused motion proof cases">
    {#each proofCases as proof (proof.id)}
      {@const step = proof.sequence.steps[proof.stepIndex]}
      {@const passes = proof.checks.every((item) => item.passes)}
      <article
        class="case-card"
        data-testid={`fuse-case-${proof.id}`}
        data-expected-grid={proof.expectedGridMode}
        data-actual-grid={proof.sequence.gridMode}
        data-pass={passes}
        data-render-ready={readyCases.includes(proof.id)}
      >
        <header class="case-header">
          <div>
            <p>{proof.id}</p>
            <h2>{proof.title}</h2>
          </div>
          <span class:pass={passes}>{passes ? "Pass" : "Mismatch"}</span>
        </header>

        <p class="case-detail">{proof.detail}</p>

        <div class="pictograph-stage" data-testid={`fuse-render-${proof.id}`}>
          {#if step}
            <PictographContainer
              pictographData={step}
              gridMode={proof.sequence.gridMode}
              showGrid={true}
              showTKA={false}
              showReversals={false}
              showNonRadialPoints={true}
              showPositions={false}
              showHandPoints={true}
              showLeftMotion={true}
              showRightMotion={true}
              disableTransitions={true}
              disableContentTransitions={true}
              darkMode={true}
              stepNumberOverride={false}
              leftPropTypeOverride={PropType.STAFF}
              rightPropTypeOverride={PropType.STAFF}
              onReady={() => markReady(proof.id)}
            />
          {/if}
        </div>

        <div class="grid-result">
          <span>Expected <strong>{proof.expectedGridMode}</strong></span>
          <span>Actual <strong>{proof.sequence.gridMode}</strong></span>
        </div>

        <dl class="check-list">
          {#each proof.checks as item (item.label)}
            <div class:failed={!item.passes}>
              <dt>{item.label}</dt>
              <dd>
                <span>{item.actual}</span>
                <small>expected {item.expected}</small>
              </dd>
            </div>
          {/each}
        </dl>
      </article>
    {/each}
  </section>
</main>

<style>
  :global(body) {
    margin: 0;
    background: #080b12;
  }

  .proof-shell {
    min-height: 100vh;
    padding: clamp(1rem, 3vw, 3rem);
    color: var(--theme-text, #f5f7fb);
    background: var(--theme-bg, #080b12);
  }

  .proof-header {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 2rem;
    width: min(100%, 92rem);
    margin: 0 auto 2rem;
  }

  .eyebrow,
  .case-header p {
    margin: 0 0 0.4rem;
    color: var(--theme-accent, #7dd3fc);
    font-size: 0.75rem;
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  h1,
  h2,
  p {
    margin-top: 0;
  }

  h1 {
    margin-bottom: 0.8rem;
    font-size: clamp(2rem, 4vw, 4rem);
    line-height: 1;
    letter-spacing: -0.04em;
  }

  .lede {
    max-width: 54rem;
    margin-bottom: 0;
    color: var(--theme-text-dim, #aab2c3);
    font-size: 1rem;
    line-height: 1.55;
  }

  code,
  .check-list {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }

  .proof-status {
    flex: 0 0 auto;
    min-width: 10rem;
    padding: 1rem;
    border: 1px solid var(--theme-stroke, #334155);
    border-radius: 0.75rem;
    background: var(--theme-panel-bg, #111827);
    text-align: right;
  }

  .proof-status strong,
  .proof-status span,
  .proof-status small {
    display: block;
  }

  .proof-status strong {
    color: var(--theme-accent, #7dd3fc);
    font-size: 2rem;
    line-height: 1;
  }

  .proof-status span {
    margin-top: 0.35rem;
    font-size: 0.875rem;
  }

  .proof-status small {
    margin-top: 0.55rem;
    color: var(--theme-text-dim, #aab2c3);
    font-size: 0.75rem;
  }

  .proof-status.ready {
    box-shadow: inset 0 0 0 2px var(--semantic-success, #34d399);
  }

  .case-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 19rem), 1fr));
    gap: 1rem;
    width: min(100%, 92rem);
    margin: 0 auto;
  }

  .case-card {
    display: flex;
    min-width: 0;
    flex-direction: column;
    padding: 1rem;
    border: 1px solid var(--theme-stroke, #334155);
    border-radius: 0.75rem;
    background: var(--theme-card-bg, #111827);
  }

  .case-header {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: 1rem;
  }

  .case-header h2 {
    margin-bottom: 0;
    font-size: 1.15rem;
  }

  .case-header > span {
    padding: 0.3rem 0.55rem;
    border: 1px solid var(--theme-stroke, #334155);
    border-radius: 0.4rem;
    color: var(--semantic-error, #f87171);
    font-size: 0.75rem;
    font-weight: 800;
  }

  .case-header > span.pass {
    color: var(--semantic-success, #34d399);
  }

  .case-detail {
    min-height: 4.7em;
    margin: 0.75rem 0;
    color: var(--theme-text-dim, #aab2c3);
    font-size: 0.875rem;
    line-height: 1.5;
  }

  .pictograph-stage {
    width: min(100%, 18rem);
    aspect-ratio: 1;
    align-self: center;
    overflow: hidden;
    border: 1px solid var(--theme-stroke, #334155);
    border-radius: 0.65rem;
    background: #0a0a0f;
  }

  .grid-result {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
    margin-top: 0.75rem;
  }

  .grid-result span {
    padding: 0.55rem;
    border-radius: 0.4rem;
    background: var(--theme-panel-bg, #0f172a);
    color: var(--theme-text-dim, #aab2c3);
    font-size: 0.75rem;
  }

  .grid-result strong {
    display: block;
    margin-top: 0.2rem;
    color: var(--theme-text, #f5f7fb);
    font-size: 0.875rem;
  }

  .check-list {
    display: grid;
    gap: 0.35rem;
    margin: 0.75rem 0 0;
    font-size: 0.75rem;
  }

  .check-list div {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0.75rem;
    padding: 0.45rem 0;
    border-bottom: 1px solid var(--theme-stroke, #334155);
  }

  .check-list div:last-child {
    border-bottom: 0;
  }

  .check-list div.failed {
    color: var(--semantic-error, #f87171);
  }

  dt,
  dd {
    margin: 0;
  }

  dd {
    text-align: right;
  }

  dd span,
  dd small {
    display: block;
  }

  dd small {
    color: var(--theme-text-dim, #aab2c3);
    font-size: 0.75rem;
  }

  @media (max-width: 42rem) {
    .proof-header {
      align-items: stretch;
      flex-direction: column;
      gap: 1rem;
    }

    .proof-status {
      text-align: left;
    }

    .case-detail {
      min-height: 0;
    }
  }
</style>
