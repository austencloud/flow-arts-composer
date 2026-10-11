<script lang="ts">
  import PictographContainer from "#lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const formatter = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

  function pointStyle(point: { x: number; y: number }): string {
    return `left:${(point.x / 950) * 100}%;top:${(point.y / 950) * 100}%`;
  }

  function signed(value: number): string {
    return `${value >= 0 ? "+" : ""}${formatter.format(value)}`;
  }
</script>

<svelte:head>
  <title>Canonical Arrow Placement Frame</title>
</svelte:head>

<main class="proof-shell">
  <header class="proof-header">
    <div>
      <p class="eyebrow">Arrow placement proof</p>
      <h1>One frame. Five ugly cases.</h1>
      <p class="lede">
        The largest legacy box gap from each motion family in the retirement
        audit, replayed against the current 45° diamond result. The ring marks
        the calculated arrow point.
      </p>
    </div>
    <div
      class="proof-stat"
      aria-label={`${data.analyzedCandidateCount} default placement contexts measured`}
    >
      <strong>{data.analyzedCandidateCount}</strong>
      <span>legacy contexts audited</span>
    </div>
  </header>

  <section class="equation" aria-label="Canonical placement equation">
    <span>box arrow</span>
    <strong>=</strong>
    <span>box anchor</span>
    <strong>+</strong>
    <span>R<sub>45°</sub>(diamond adjustment)</span>
  </section>

  <section class="case-grid">
    {#each data.cases as item, index}
      <article class="case-card" data-motion={item.motionType}>
        <header class="case-head">
          <div class="case-rank">{String(index + 1).padStart(2, "0")}</div>
          <div class="case-title">
            <h2>{item.motionType}</h2>
            <code>{item.placementKey} · turns {item.turns}</code>
          </div>
          <div class="distance">
            <strong>{formatter.format(item.displacement)}</strong>
            <span>viewBox px apart</span>
          </div>
        </header>

        <div class="comparison">
          <section class="frame legacy-frame">
            <div class="frame-label">
              <span>Legacy box</span>
              <small>{item.rotationDirection}</small>
            </div>
            <div class="pictograph-stage">
              <PictographContainer
                pictographData={item.legacyPictograph}
                showRightMotion={false}
                showLeftMotion
                showTKA={false}
                disableTransitions
                leftPropTypeOverride={PropType.STAFF}
                rightPropTypeOverride={PropType.STAFF}
              />
              <span
                class="point-ring legacy-ring"
                style={pointStyle(item.legacyPoint)}
              ></span>
            </div>
            <div class="coords">
              <span>X {signed(item.legacyAdjustment.x)}</span>
              <span>Y {signed(item.legacyAdjustment.y)}</span>
            </div>
          </section>

          <div
            class="correction"
            aria-label={`Correction vector ${formatter.format(item.displacement)} pixels`}
          >
            <div class="correction-line"></div>
            <strong>{formatter.format(item.displacement)}</strong>
            <span>px correction</span>
          </div>

          <section class="frame canonical-frame">
            <div class="frame-label">
              <span>Canonical 45°</span>
              <small>diamond-owned</small>
            </div>
            <div class="pictograph-stage">
              <PictographContainer
                pictographData={item.canonicalPictograph}
                showRightMotion={false}
                showLeftMotion
                showTKA={false}
                disableTransitions
                leftPropTypeOverride={PropType.STAFF}
                rightPropTypeOverride={PropType.STAFF}
              />
              <span
                class="point-ring canonical-ring"
                style={pointStyle(item.canonicalPoint)}
              ></span>
            </div>
            <div class="coords">
              <span>X {signed(item.canonicalAdjustment.x)}</span>
              <span>Y {signed(item.canonicalAdjustment.y)}</span>
            </div>
          </section>
        </div>
      </article>
    {/each}
  </section>

  <footer class="proof-footer">
    <strong>The right column is the production path.</strong>
    <span
      >Diamond values are processed first, then the final vector rotates once.</span
    >
  </footer>
</main>

<style>
  :global(body) {
    margin: 0;
    background: #080b12;
  }

  .proof-shell {
    min-height: 100vh;
    padding: clamp(1rem, 2.5vw, 3rem);
    color: var(--theme-text, #f5f7fb);
    background:
      radial-gradient(
        circle at 18% 8%,
        rgba(92, 124, 250, 0.14),
        transparent 32rem
      ),
      radial-gradient(
        circle at 86% 4%,
        rgba(45, 212, 191, 0.1),
        transparent 30rem
      ),
      #080b12;
  }

  .proof-header {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 2rem;
    width: min(100%, var(--shell-w, min(1720px, 92vw)));
    margin: 0 auto 1.5rem;
  }

  .eyebrow {
    margin: 0 0 0.45rem;
    color: #7dd3fc;
    font-size: 0.78rem;
    font-weight: 800;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  h1 {
    margin: 0;
    font-size: clamp(2rem, 4vw, 4.5rem);
    line-height: 0.96;
    letter-spacing: -0.045em;
  }

  .lede {
    max-width: 62rem;
    margin: 1rem 0 0;
    color: var(--theme-text-dim, #aab2c3);
    font-size: clamp(1rem, 1.25vw, 1.3rem);
    line-height: 1.55;
  }

  .proof-stat {
    flex: 0 0 auto;
    min-width: 10rem;
    padding: 1rem 1.2rem;
    border: 1px solid rgba(125, 211, 252, 0.25);
    border-radius: 1rem;
    background: rgba(15, 23, 42, 0.78);
    text-align: right;
  }

  .proof-stat strong {
    display: block;
    color: #7dd3fc;
    font-size: 2rem;
    line-height: 1;
  }

  .proof-stat span {
    display: block;
    margin-top: 0.35rem;
    color: var(--theme-text-dim, #aab2c3);
    font-size: 0.78rem;
  }

  .equation {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: clamp(0.5rem, 1.4vw, 1.25rem);
    width: min(100%, var(--shell-w, min(1720px, 92vw)));
    margin: 0 auto 1.5rem;
    padding: 0.9rem 1.25rem;
    border: 1px solid rgba(148, 163, 184, 0.16);
    border-radius: 0.9rem;
    background: rgba(15, 23, 42, 0.55);
    color: #cbd5e1;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: clamp(0.78rem, 1vw, 1rem);
  }

  .equation strong {
    color: #2dd4bf;
  }

  .equation sub {
    font-size: max(0.8em, 12px);
  }

  .case-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1.25rem;
    width: min(100%, var(--shell-w, min(1720px, 92vw)));
    margin: 0 auto;
  }

  .case-card {
    overflow: hidden;
    border: 1px solid rgba(148, 163, 184, 0.18);
    border-radius: 1.25rem;
    background: rgba(12, 17, 29, 0.94);
    box-shadow: 0 1.5rem 4rem rgba(0, 0, 0, 0.22);
  }

  .case-card:first-child {
    grid-column: 1 / -1;
  }

  .case-head {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.9rem;
    padding: 1rem 1.15rem;
    border-bottom: 1px solid rgba(148, 163, 184, 0.14);
  }

  .case-rank {
    display: grid;
    width: 2.4rem;
    height: 2.4rem;
    place-items: center;
    border-radius: 0.7rem;
    background: rgba(125, 211, 252, 0.1);
    color: #7dd3fc;
    font-weight: 800;
  }

  .case-title h2 {
    margin: 0;
    font-size: 1rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .case-title code {
    display: block;
    overflow: hidden;
    margin-top: 0.25rem;
    color: var(--theme-text-dim, #aab2c3);
    font-size: 0.75rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .distance {
    text-align: right;
  }

  .distance strong {
    display: block;
    color: #fb7185;
    font-size: 1.4rem;
    line-height: 1;
  }

  .distance span {
    color: var(--theme-text-dim, #aab2c3);
    font-size: 0.75rem;
  }

  .comparison {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 5rem minmax(0, 1fr);
    align-items: center;
    gap: 0.5rem;
    padding: 1rem;
  }

  .frame {
    min-width: 0;
  }

  .frame-label,
  .coords {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .frame-label {
    margin-bottom: 0.55rem;
    font-size: 0.82rem;
    font-weight: 750;
  }

  .frame-label small,
  .coords {
    color: var(--theme-text-dim, #aab2c3);
    font-size: 0.75rem;
  }

  .pictograph-stage {
    position: relative;
    overflow: hidden;
    width: 100%;
    aspect-ratio: 1;
    border: 1px solid rgba(148, 163, 184, 0.14);
    border-radius: 0.9rem;
    background: #0b1020;
  }

  .pictograph-stage :global(.pictograph-container) {
    width: 100%;
    height: 100%;
  }

  .point-ring {
    position: absolute;
    width: 1.35rem;
    height: 1.35rem;
    border: 2px solid currentColor;
    border-radius: 999px;
    transform: translate(-50%, -50%);
    box-shadow:
      0 0 0 0.3rem rgba(8, 11, 18, 0.65),
      0 0 1.2rem currentColor;
    pointer-events: none;
  }

  .legacy-ring {
    color: #fb7185;
  }

  .canonical-ring {
    color: #2dd4bf;
  }

  .coords {
    margin-top: 0.55rem;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }

  .correction {
    display: flex;
    flex-direction: column;
    align-items: center;
    color: #fda4af;
    text-align: center;
  }

  .correction-line {
    width: 100%;
    height: 1px;
    margin-bottom: 0.55rem;
    background: linear-gradient(90deg, #fb7185, #facc15 50%, #2dd4bf);
  }

  .correction strong {
    font-size: 1rem;
  }

  .correction span {
    color: var(--theme-text-dim, #aab2c3);
    font-size: 0.75rem;
  }

  .proof-footer {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    width: min(100%, var(--shell-w, min(1720px, 92vw)));
    margin: 1.5rem auto 0;
    padding: 1rem 1.2rem;
    border: 1px solid rgba(45, 212, 191, 0.2);
    border-radius: 1rem;
    background: rgba(13, 45, 43, 0.36);
    color: #99f6e4;
    font-size: 0.9rem;
  }

  @media (min-width: 1680px) {
    .case-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .case-card:first-child {
      grid-column: span 2;
    }
  }

  @media (min-width: 2600px) {
    .proof-shell {
      font-size: 1.28rem;
    }

    h1 {
      font-size: 5.5rem;
    }

    .eyebrow {
      font-size: 1rem;
    }

    .lede {
      font-size: 1.5rem;
    }

    .proof-stat strong {
      font-size: 2.5rem;
    }

    .proof-stat span,
    .case-title code,
    .distance span,
    .frame-label small,
    .coords {
      font-size: 0.9rem;
    }

    .equation,
    .case-title h2,
    .frame-label,
    .correction strong,
    .proof-footer {
      font-size: 1.15rem;
    }

    .distance strong {
      font-size: 1.8rem;
    }
  }

  @media (max-width: 900px) {
    .proof-header,
    .proof-footer {
      align-items: stretch;
      flex-direction: column;
    }

    .proof-stat {
      text-align: left;
    }

    .case-grid {
      grid-template-columns: 1fr;
    }

    .case-card:first-child {
      grid-column: auto;
    }
  }

  @media (max-width: 560px) {
    .proof-shell {
      padding: 0.8rem;
    }

    .equation {
      flex-wrap: wrap;
    }

    .case-head {
      grid-template-columns: auto minmax(0, 1fr);
    }

    .distance {
      grid-column: 2;
      text-align: left;
    }

    .comparison {
      grid-template-columns: 1fr;
    }

    .correction {
      padding: 0.5rem 0;
    }
  }

  @media (max-height: 500px) and (min-width: 700px) {
    .proof-header {
      margin-bottom: 0.75rem;
    }

    .lede,
    .equation,
    .proof-stat {
      display: none;
    }

    .case-grid {
      grid-template-columns: repeat(5, minmax(17rem, 1fr));
      overflow-x: auto;
      padding-bottom: 0.5rem;
    }

    .case-card:first-child {
      grid-column: auto;
    }
  }
</style>
