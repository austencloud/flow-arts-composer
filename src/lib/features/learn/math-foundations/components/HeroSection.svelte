<script lang="ts">
  /**
   * HeroSection - Introduction to mathematical foundations
   */
  import { CORE_PATTERN } from "../domain/content";
  import "./triad-palette.css";
</script>

<section class="hero mf-triad-scope">
  <div class="container">
    <h1>Mathematical Foundations</h1>
    <p class="subtitle">The recurring patterns that underpin TKA's structure</p>

    <div class="core-pattern">
      <h2>{CORE_PATTERN.subtitle}</h2>
      <p class="description">
        Throughout The Kinetic Alphabet, a single mathematical pattern repeats at multiple levels:
      </p>

      <div class="diagram">
        <div class="diagram-row">
          <div class="element thesis">
            <span class="label">Thesis</span>
          </div>
          <div class="connector">
            <span class="arrow">←</span>
            <span class="text">opposites</span>
            <span class="arrow">→</span>
          </div>
          <div class="element antithesis">
            <span class="label">Antithesis</span>
          </div>
        </div>

        <div class="diagram-arrows">
          <span class="down-arrow">↘</span>
          <span class="down-arrow">↙</span>
        </div>

        <div class="element synthesis">
          <span class="label">Synthesis</span>
          <span class="sublabel">(contains both)</span>
        </div>
      </div>

      <div class="key-insight">
        <p>
          The third element is often <strong>twice as large</strong> and has
          <strong>two internal halves</strong> that mirror the original opposition.
        </p>
      </div>
    </div>
  </div>
</section>

<style>
  .hero {
    padding: 100px 24px 80px;
    text-align: center;
  }

  .container {
    max-width: 800px;
    margin: 0 auto;
  }

  h1 {
    font-size: clamp(2.5rem, 6vw, 4rem);
    font-weight: 700;
    margin-bottom: 0.5rem;
    background: linear-gradient(
      135deg,
      var(--theme-text, #fff) 0%,
      color-mix(in srgb, var(--theme-text, #fff) 70%, transparent) 100%
    );
    -webkit-text-fill-color: transparent;
  }

  /* Its own rule: in one rule with the var() shorthand above, replays lose that shorthand. */
  h1 {
    -webkit-background-clip: text;
    background-clip: text;
  }

  .subtitle {
    font-size: clamp(1rem, 2.5vw, 1.25rem);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    margin-bottom: 3rem;
  }

  .core-pattern {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 24px;
    padding: 40px;
  }

  .core-pattern h2 {
    font-size: 1.5rem;
    margin-bottom: 12px;
    color: var(--theme-text, #fff);
  }

  .description {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    margin-bottom: 32px;
    font-size: 1.0625rem;
    line-height: 1.6;
  }

  .diagram {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    margin-bottom: 28px;
  }

  .diagram-row {
    display: flex;
    align-items: center;
    gap: 20px;
  }

  .element {
    padding: 16px 28px;
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }

  .element .label {
    font-weight: 600;
    font-size: 1.125rem;
  }

  .element .sublabel {
    font-size: 0.8125rem;
    opacity: 0.7;
  }

  .thesis {
    background: color-mix(in srgb, var(--mf-thesis) 15%, transparent);
    border: 1px solid color-mix(in srgb, var(--mf-thesis) 30%, transparent);
    color: var(--mf-thesis-light);
  }

  .antithesis {
    background: color-mix(in srgb, var(--mf-antithesis) 15%, transparent);
    border: 1px solid color-mix(in srgb, var(--mf-antithesis) 30%, transparent);
    color: var(--mf-antithesis-light);
  }

  .synthesis {
    background: color-mix(in srgb, var(--mf-synthesis) 15%, transparent);
    border: 1px solid color-mix(in srgb, var(--mf-synthesis) 30%, transparent);
    color: var(--mf-synthesis-light);
    padding: 20px 40px;
  }

  .connector {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
    font-size: 0.875rem;
  }

  .arrow {
    font-size: 1.25rem;
  }

  .diagram-arrows {
    display: flex;
    gap: 120px;
    font-size: 1.5rem;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.3));
  }

  .down-arrow {
    opacity: 0.6;
  }

  .key-insight {
    background: color-mix(in srgb, var(--mf-thesis) 8%, transparent);
    border: 1px solid color-mix(in srgb, var(--mf-thesis) 15%, transparent);
    border-radius: 12px;
    padding: 20px;
  }

  .key-insight p {
    margin: 0;
    color: var(--theme-text, #fff);
    line-height: 1.6;
  }

  @media (max-width: 600px) {
    .core-pattern {
      padding: 28px 20px;
    }

    .diagram-row {
      flex-direction: column;
      gap: 12px;
    }

    .connector {
      transform: rotate(90deg);
    }

    .diagram-arrows {
      gap: 60px;
    }
  }
</style>
