<script lang="ts">
  /**
   * LetterTriadSection - Displays A/B/C letter pattern with real pictographs
   *
   * Shows the thesis (Pro+Pro), antithesis (Anti+Anti), synthesis (Pro+Anti) pattern.
   */
  import PictographContainer from "#lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import {
    LETTER_TRIAD,
    createLetterAPictograph,
    createLetterBPictograph,
    createLetterCPictograph,
  } from "../domain/content";
  import "./triad-palette.css";

  // Create real pictograph data
  const pictographs = {
    A: createLetterAPictograph(),
    B: createLetterBPictograph(),
    C: createLetterCPictograph(),
  };
</script>

<section class="letter-triad mf-triad-scope">
  <div class="container">
    <h2>Level 2: Letter Motion Types</h2>
    <p class="section-intro">
      Most Type 1 letters follow the same pattern in groups of three
      (Quarter-Same is the exception, with four). Here are the first three
      letters showing the <strong>thesis → antithesis → synthesis</strong> structure.
    </p>

    <div class="triad-grid">
      {#each LETTER_TRIAD as item}
        {@const patternClass = item.pattern}
        <div class="letter-card {patternClass}">
          <div class="card-header">
            <span class="letter">{item.label}</span>
            <span class="pattern-badge">{item.patternLabel}</span>
          </div>

          <div class="pictograph-wrapper">
            <PictographContainer
              pictographData={pictographs[
                item.label as keyof typeof pictographs
              ]}
              showTKA={true}
              showReversals={false}
              disableTransitions={true}
            />
          </div>

          <div class="motion-breakdown">
            <div class="motion blue">
              <span class="hand">Left:</span>
              <span class="type">{item.leftMotion}</span>
            </div>
            <div class="motion red">
              <span class="hand">Right:</span>
              <span class="type">{item.rightMotion}</span>
            </div>
          </div>

          <p class="description">{item.description}</p>
        </div>
      {/each}
    </div>

    <div class="pattern-explanation">
      <h3>The Pattern Continues</h3>
      <div class="continuation">
        <div class="triad-group">
          <span class="letters">D, E, F</span>
          <span class="structure">Pro+Pro → Anti+Anti → Hybrid</span>
        </div>
        <div class="triad-group">
          <span class="letters">G, H, I</span>
          <span class="structure">Pro+Pro → Anti+Anti → Hybrid</span>
        </div>
        <div class="triad-group">
          <span class="letters">J, K, L</span>
          <span class="structure">Pro+Pro → Anti+Anti → Hybrid</span>
        </div>
        <span class="ellipsis">...</span>
      </div>
      <p class="insight-text">
        The entire Type 1 alphabet follows this triadic structure. Once you
        recognize the pattern, you can predict the third letter's behavior from
        knowing the first two.
      </p>
    </div>
  </div>
</section>

<style>
  .letter-triad {
    padding: 80px 24px;
    background: linear-gradient(
      180deg,
      transparent 0%,
      color-mix(in srgb, var(--mf-thesis) 3%, transparent) 100%
    );
  }

  .container {
    max-width: 1000px;
    margin: 0 auto;
  }

  h2 {
    font-size: clamp(1.75rem, 4vw, 2.5rem);
    margin-bottom: 1rem;
    text-align: center;
    font-weight: 600;
    line-height: 1.2;
    color: var(--theme-text, #fff);
  }

  .section-intro {
    text-align: center;
    font-size: 1.125rem;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    max-width: 650px;
    margin: 0 auto 2.5rem;
    line-height: 1.6;
  }

  .triad-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 24px;
    margin-bottom: 3rem;
  }

  .letter-card {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 20px;
    padding: 24px;
    transition: all var(--duration-normal) ease;
  }

  .letter-card:hover {
    border-color: var(--card-accent);
    transform: translateY(-4px);
  }

  .letter-card.thesis {
    --card-accent: var(--mf-thesis);
  }

  .letter-card.antithesis {
    --card-accent: var(--mf-antithesis);
  }

  .letter-card.synthesis {
    --card-accent: var(--mf-synthesis);
  }

  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
  }

  .letter {
    font-size: 2.5rem;
    font-weight: 700;
    color: var(--card-accent);
  }

  .pattern-badge {
    font-size: 0.8125rem;
    padding: 6px 12px;
    border-radius: 20px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    color: var(--card-accent);
    font-weight: 500;
  }

  .pictograph-wrapper {
    width: 100%;
    aspect-ratio: 1;
    border-radius: 12px;
    overflow: hidden;
    margin-bottom: 16px;
    background: var(--theme-panel-bg, rgba(10, 10, 15, 0.5));
  }

  .motion-breakdown {
    display: flex;
    gap: 16px;
    margin-bottom: 12px;
  }

  .motion {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.875rem;
  }

  .motion.blue .hand {
    color: var(--prop-blue, #4a90d9);
  }

  .motion.red .hand {
    color: var(--prop-red, #d94a4a);
  }

  .motion .type {
    color: var(--theme-text, #fff);
    font-weight: 500;
    text-transform: capitalize;
  }

  .description {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-size: 0.875rem;
    line-height: 1.5;
    margin: 0;
  }

  /* Pattern Explanation */
  .pattern-explanation {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.02));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 20px;
    padding: 32px;
    text-align: center;
  }

  .pattern-explanation h3 {
    font-size: 1.25rem;
    margin-bottom: 20px;
    color: var(--theme-text, #fff);
  }

  .continuation {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 24px;
    flex-wrap: wrap;
    margin-bottom: 20px;
  }

  .triad-group {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 16px 24px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    border-radius: 12px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
  }

  .letters {
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--theme-text, #fff);
    margin-bottom: 4px;
  }

  .structure {
    font-size: 0.75rem;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
  }

  .ellipsis {
    font-size: 1.5rem;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
  }

  .insight-text {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    font-size: 1rem;
    line-height: 1.6;
    max-width: 600px;
    margin: 0 auto;
  }

  @media (max-width: 900px) {
    .triad-grid {
      grid-template-columns: 1fr;
      max-width: 400px;
      margin-left: auto;
      margin-right: auto;
    }
  }

  @media (max-width: 600px) {
    .continuation {
      flex-direction: column;
      gap: 12px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .letter-card {
      transition: none;
    }
    .letter-card:hover {
      transform: none;
    }
  }
</style>
