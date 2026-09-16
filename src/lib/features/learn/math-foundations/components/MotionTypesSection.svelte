<script lang="ts">
  /**
   * MotionTypesSection - Displays the STATIC/DASH/SHIFT triadic pattern
   * and the orientation behavior pairing (PRO/STATIC vs ANTI/DASH)
   */
  import { MOTION_TYPE_TRIAD, ORIENTATION_PAIRINGS } from "../domain/content";
  import "./triad-palette.css";
</script>

<section class="motion-types mf-triad-scope">
  <div class="container">
    <h2>Level 3: Motion Types & Orientation</h2>
    <p class="section-intro">
      The movement types follow the same pattern. And there's a hidden pairing
      in how motion types affect <strong>orientation</strong>.
    </p>

    <!-- Movement Intensity Triad -->
    <div class="subsection">
      <h3>Movement Intensity: Another Triad</h3>
      <p class="subsection-intro">
        Just as placements split into Alpha/Beta/Gamma, movement intensity splits into three types:
      </p>

      <div class="triad-grid">
        {#each MOTION_TYPE_TRIAD as item}
          {@const patternClass = item.pattern}
          <div class="motion-card {patternClass}">
            <div class="card-header">
              <span class="motion-label">{item.label}</span>
              <span class="pattern-badge">{item.patternLabel}</span>
            </div>

            <div class="intensity-bar">
              <div
                class="intensity-fill"
                style="width: {item.intensity === 'Minimal' ? '15%' : item.intensity === 'Maximum' ? '100%' : '50%'}"
              ></div>
              <span class="intensity-label">{item.intensity}</span>
            </div>

            <p class="description">{item.description}</p>

            {#if item.variations}
              <div class="variations-badge">
                {item.variations} variations
              </div>
            {/if}
          </div>
        {/each}
      </div>

      <div class="pattern-visual">
        <div class="pattern-row">
          <div class="pattern-item antithesis">
            <span class="label">Static (1)</span>
            <span class="sublabel">No movement</span>
          </div>
          <span class="operator">+</span>
          <div class="pattern-item thesis">
            <span class="label">Dash (1)</span>
            <span class="sublabel">Full movement</span>
          </div>
          <span class="operator">=</span>
          <div class="pattern-item synthesis">
            <span class="label">Shift (2)</span>
            <span class="sublabel">Two variations</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Orientation Pairing -->
    <div class="subsection">
      <h3>Orientation Behavior: Hidden Pairs</h3>
      <p class="subsection-intro">
        Motion types secretly pair up based on how they affect orientation with zero turns:
      </p>

      <div class="orientation-grid">
        {#each ORIENTATION_PAIRINGS as pairing}
          <div class="pairing-card" style="--accent: {pairing.color}">
            <div class="pairing-header">
              <span class="family-name">{pairing.family}</span>
              <div class="members">
                {#each pairing.members as member, i}
                  <span class="member">{member}</span>
                  {#if i < pairing.members.length - 1}
                    <span class="plus">+</span>
                  {/if}
                {/each}
              </div>
            </div>
            <div class="behavior">{pairing.behavior}</div>
            <p class="description">{pairing.description}</p>
          </div>
        {/each}
      </div>

      <!-- The 4 Orientations -->
      <div class="orientations-display">
        <h4>The Four Orientations (Two Opposing Pairs)</h4>
        <div class="orientation-pairs">
          <div class="pair radial">
            <span class="pair-label">Radial</span>
            <div class="pair-items">
              <span class="ori-item">IN</span>
              <span class="toggle">↔</span>
              <span class="ori-item">OUT</span>
            </div>
          </div>
          <div class="pair non-radial">
            <span class="pair-label">Non-Radial</span>
            <div class="pair-items">
              <span class="ori-item">CLOCK</span>
              <span class="toggle">↔</span>
              <span class="ori-item">COUNTER</span>
            </div>
          </div>
        </div>
        <p class="orientation-note">
          When orientation "swaps," it toggles within its pair: IN↔OUT or CLOCK↔COUNTER
        </p>
      </div>
    </div>

    <!-- Connection to Base-4 -->
    <div class="base-four-insight">
      <h3>The Base-4 Structure</h3>
      <p>
        Notice the pattern: <strong>4</strong> orientations, <strong>4</strong> primary motion types,
        placements that combine as <strong>8 + 8 = 16</strong> (multiples of 4).
        TKA operates in something akin to <strong>base-4</strong>, where the fundamental unit
        is the quartet rather than the decimal ten.
      </p>
    </div>
  </div>
</section>

<style>
  .motion-types {
    padding: 80px 24px;
    background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--mf-antithesis) 3%, transparent) 0%,
      transparent 100%
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
    margin: 0 auto 3rem;
    line-height: 1.6;
  }

  .subsection {
    margin-bottom: 3rem;
  }

  h3 {
    font-size: 1.375rem;
    margin-bottom: 0.75rem;
    color: var(--theme-text, #fff);
    text-align: center;
  }

  h4 {
    font-size: 1.125rem;
    margin-bottom: 1rem;
    color: var(--theme-text, #fff);
    text-align: center;
  }

  .subsection-intro {
    text-align: center;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    margin-bottom: 1.5rem;
    font-size: 1rem;
  }

  /* Motion Type Cards */
  .triad-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 20px;
    margin-bottom: 2rem;
  }

  .motion-card {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 16px;
    padding: 20px;
    transition: all var(--duration-normal) ease;
  }

  .motion-card:hover {
    border-color: var(--card-accent);
    transform: translateY(-2px);
  }

  .motion-card.thesis {
    --card-accent: var(--mf-thesis);
  }

  .motion-card.antithesis {
    --card-accent: var(--mf-antithesis);
  }

  .motion-card.synthesis {
    --card-accent: var(--mf-synthesis);
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }

  .motion-label {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--card-accent);
  }

  .pattern-badge {
    font-size: 0.75rem;
    padding: 4px 10px;
    border-radius: 12px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    color: var(--card-accent);
    font-weight: 500;
  }

  .intensity-bar {
    height: 8px;
    background: var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 4px;
    margin-bottom: 12px;
    position: relative;
    overflow: hidden;
  }

  .intensity-fill {
    height: 100%;
    background: var(--card-accent);
    border-radius: 4px;
    transition: width var(--duration-emphasis) ease;
  }

  .intensity-label {
    position: absolute;
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
    font-size: var(--font-size-compact, 0.75rem);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .motion-card .description {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-size: 0.875rem;
    line-height: 1.5;
    margin: 0;
  }

  .variations-badge {
    margin-top: 12px;
    display: inline-block;
    padding: 4px 12px;
    background: color-mix(in srgb, var(--mf-synthesis) 15%, transparent);
    border: 1px solid color-mix(in srgb, var(--mf-synthesis) 30%, transparent);
    border-radius: 12px;
    font-size: 0.8125rem;
    color: var(--mf-synthesis-light);
    font-weight: 500;
  }

  /* Pattern Visual */
  .pattern-visual {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.02));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 16px;
    padding: 24px;
  }

  .pattern-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 16px;
    flex-wrap: wrap;
  }

  .pattern-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 16px 24px;
    border-radius: 12px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .pattern-item .label {
    font-weight: 600;
    color: var(--theme-text, #fff);
    font-size: 1rem;
  }

  .pattern-item .sublabel {
    font-size: 0.75rem;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    margin-top: 4px;
  }

  .pattern-item.thesis {
    border-color: color-mix(in srgb, var(--mf-thesis) 30%, transparent);
  }

  .pattern-item.thesis .label {
    color: var(--mf-thesis-light);
  }

  .pattern-item.antithesis {
    border-color: color-mix(in srgb, var(--mf-antithesis) 30%, transparent);
  }

  .pattern-item.antithesis .label {
    color: var(--mf-antithesis-light);
  }

  .pattern-item.synthesis {
    border-color: color-mix(in srgb, var(--mf-synthesis) 30%, transparent);
    padding: 20px 32px;
  }

  .pattern-item.synthesis .label {
    color: var(--mf-synthesis-light);
    font-size: 1.125rem;
  }

  .operator {
    font-size: 1.5rem;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
    font-weight: 300;
  }

  /* Orientation Pairing */
  .orientation-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 20px;
    margin-bottom: 2rem;
  }

  .pairing-card {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 16px;
    padding: 24px;
    transition: all var(--duration-normal) ease;
  }

  .pairing-card:hover {
    border-color: var(--accent);
  }

  .pairing-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }

  .family-name {
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--accent);
  }

  .members {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .member {
    padding: 4px 12px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    border-radius: 8px;
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--theme-text, #fff);
  }

  .plus {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
  }

  .behavior {
    font-size: 0.9375rem;
    color: var(--accent);
    font-weight: 500;
    margin-bottom: 8px;
  }

  .pairing-card .description {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-size: 0.875rem;
    line-height: 1.5;
    margin: 0;
  }

  /* Orientations Display */
  .orientations-display {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.02));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 16px;
    padding: 24px;
    text-align: center;
  }

  .orientation-pairs {
    display: flex;
    justify-content: center;
    gap: 40px;
    margin-bottom: 16px;
  }

  .pair {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }

  .pair-label {
    font-size: 0.8125rem;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .pair-items {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .ori-item {
    padding: 8px 16px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
    border-radius: 8px;
    font-weight: 600;
    font-size: 0.9375rem;
  }

  .pair.radial .ori-item {
    color: var(--mf-thesis-light);
    border: 1px solid color-mix(in srgb, var(--mf-thesis) 30%, transparent);
  }

  .pair.non-radial .ori-item {
    color: var(--mf-antithesis-light);
    border: 1px solid color-mix(in srgb, var(--mf-antithesis) 30%, transparent);
  }

  .toggle {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
    font-size: 1.25rem;
  }

  .orientation-note {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-size: 0.875rem;
    margin: 0;
  }

  /* Base-4 Insight */
  .base-four-insight {
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--mf-thesis) 8%, transparent) 0%,
      color-mix(in srgb, var(--mf-antithesis) 8%, transparent) 50%,
      color-mix(in srgb, var(--mf-synthesis) 8%, transparent) 100%
    );
    border: 1px solid color-mix(in srgb, var(--mf-thesis) 15%, transparent);
    border-radius: 20px;
    padding: 28px;
    text-align: center;
  }

  .base-four-insight h3 {
    margin-bottom: 12px;
  }

  .base-four-insight p {
    color: var(--theme-text, #fff);
    font-size: 1.0625rem;
    line-height: 1.7;
    margin: 0;
    max-width: 700px;
    margin: 0 auto;
  }

  @media (max-width: 768px) {
    .triad-grid {
      grid-template-columns: 1fr;
      max-width: 400px;
      margin-left: auto;
      margin-right: auto;
    }

    .orientation-grid {
      grid-template-columns: 1fr;
    }

    .orientation-pairs {
      flex-direction: column;
      gap: 20px;
    }

    .pattern-row {
      gap: 12px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .motion-card {
      transition: none;
    }
    .motion-card:hover {
      transform: none;
    }
  }
</style>
