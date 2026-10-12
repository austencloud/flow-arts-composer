<!--
Type1IntroPage - Introduction page for Type 1 (Dual-Shift) letters lesson
Page 1 of 5: Overview of Type 1 letters and motion patterns
-->
<script lang="ts">
  import { TYPE1_ALPHABET } from "../domain/type1-letter-data";

  let { onNext }: { onNext: () => void } = $props();
</script>

<div class="page">
  <h2>Type 1: Dual-Shift Letters</h2>

  <div class="intro-section">
    <div class="intro-icon">
      <i class="fa-solid fa-arrows-rotate" aria-hidden="true"></i>
    </div>
    <p class="intro-text">
      Type 1 letters are called <strong>"Dual-Shift"</strong> because
      <strong>both hands move</strong> from one grid position to an adjacent position.
    </p>
  </div>

  <div class="key-concept">
    <h3>The Key Pattern</h3>
    <p>Every Type 1 letter follows a simple pattern:</p>

    <div class="pattern-grid">
      <div class="pattern-item pro">
        <span class="pattern-label">Pro-Pro</span>
        <span class="pattern-letters">A, D, G, J, M, P, S</span>
        <span class="pattern-desc"
          >Both hands spin the same direction as motion</span
        >
      </div>
      <div class="pattern-item anti">
        <span class="pattern-label">Anti-Anti</span>
        <span class="pattern-letters">B, E, H, K, N, Q, T</span>
        <span class="pattern-desc">Both hands spin opposite to motion</span>
      </div>
      <div class="pattern-item hybrid">
        <span class="pattern-label">Hybrid</span>
        <span class="pattern-letters">C, F, I, L, O, R, U, V</span>
        <span class="pattern-desc">Hands spin in different directions</span>
      </div>
    </div>
  </div>

  <div class="alphabet-preview">
    <h3>The Type 1 Alphabet (A-V)</h3>
    <div class="letter-row">
      {#each TYPE1_ALPHABET.split("") as letter}
        <span class="preview-letter">{letter}</span>
      {/each}
    </div>
    <p class="note">22 letters total - the foundation of TKA!</p>
  </div>

  <button class="next-button" onclick={onNext}>
    Learn Prospin Letters
    <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
  </button>
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    max-width: 700px;
    margin: 0 auto;
    width: 100%;
    animation: slideInUp var(--duration-dramatic) var(--ease-standard);
  }

  @keyframes slideInUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  h2 {
    font-size: 1.875rem;
    font-weight: 700;
    color: white;
    margin: 0;
    text-align: center;
    background: linear-gradient(
      135deg,
      var(--theme-accent, #22d3ee) 0%,
      var(--theme-accent, #06b6d4) 100%
    );
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  h3 {
    font-size: 1.125rem;
    font-weight: 600;
    color: white;
    margin: 0;
  }

  p {
    font-size: 1.125rem;
    line-height: 1.7;
    color: var(--theme-text, rgba(255, 255, 255, 0.85));
    margin: 0;
    text-align: center;
  }

  .intro-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    padding: 1.5rem;
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--theme-accent, #22d3ee) 10%, transparent) 0%,
      color-mix(in srgb, var(--theme-accent, #22d3ee) 2%, transparent) 100%
    );
    border: 1px solid
      color-mix(in srgb, var(--theme-accent, #22d3ee) 20%, transparent);
    border-radius: 16px;
  }

  .intro-icon {
    width: 64px;
    height: 64px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: color-mix(
      in srgb,
      var(--theme-accent, #22d3ee) 20%,
      transparent
    );
    border-radius: 50%;
    color: var(--theme-accent, #22d3ee);
    font-size: 1.75rem;
  }

  .intro-text {
    font-size: 1.125rem;
    text-align: center;
  }

  .key-concept {
    padding: 1.25rem;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    border-radius: 12px;
  }

  .pattern-grid {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-top: 1rem;
  }

  .pattern-item {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 1rem;
    border-radius: 10px;
  }

  .pattern-item.pro {
    background: color-mix(
      in srgb,
      var(--theme-accent, #22d3ee) 10%,
      transparent
    );
    border: 1px solid
      color-mix(in srgb, var(--theme-accent, #22d3ee) 25%, transparent);
  }

  .pattern-item.anti {
    --anti-color: #a855f7;
    background: color-mix(in srgb, var(--anti-color) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--anti-color) 25%, transparent);
  }

  .pattern-item.hybrid {
    --anti-color: #a855f7;
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--theme-accent, #22d3ee) 10%, transparent),
      color-mix(in srgb, var(--anti-color) 10%, transparent)
    );
    border: 1px solid color-mix(in srgb, var(--anti-color) 25%, transparent);
  }

  .pattern-label {
    font-weight: 700;
    font-size: 0.9375rem;
  }

  .pattern-item.pro .pattern-label {
    color: var(--theme-accent, #22d3ee);
  }
  .pattern-item.anti .pattern-label {
    color: var(--anti-color, #a855f7);
  }
  .pattern-item.hybrid .pattern-label {
    color: var(--anti-color, #a855f7);
  }

  .pattern-letters {
    font-size: 1.25rem;
    font-weight: 600;
    color: white;
    letter-spacing: 2px;
  }

  .pattern-desc {
    font-size: 0.8125rem;
    color: var(--theme-text-dim);
  }

  .alphabet-preview {
    padding: 1.25rem;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    border-radius: 12px;
    text-align: center;
  }

  .letter-row {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.5rem;
    margin-top: 1rem;
  }

  .preview-letter {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke-strong);
    border-radius: 6px;
    font-weight: 700;
    font-size: 1rem;
    color: white;
  }

  .note {
    font-size: 0.875rem !important;
    color: var(--theme-text-dim) !important;
    margin-top: 0.75rem !important;
  }

  .next-button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.625rem;
    padding: 1rem 2rem;
    border-radius: 12px;
    font-size: 1rem;
    font-weight: 700;
    cursor: pointer;
    transition:
      background var(--duration-emphasis),
      border-color var(--duration-emphasis),
      transform var(--duration-emphasis);
    min-height: var(--min-touch-target);
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--theme-accent, #22d3ee) 30%, transparent) 0%,
      color-mix(in srgb, var(--theme-accent, #06b6d4) 30%, transparent) 100%
    );
    border: 2px solid
      color-mix(in srgb, var(--theme-accent, #22d3ee) 50%, transparent);
    color: var(--theme-text, white);
  }

  .next-button:hover {
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--theme-accent, #22d3ee) 40%, transparent) 0%,
      color-mix(in srgb, var(--theme-accent, #06b6d4) 40%, transparent) 100%
    );
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #22d3ee) 80%,
      transparent
    );
    transform: translateY(-2px);
  }

  @media (max-width: 600px) {
    h2 {
      font-size: 1.5rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .page {
      animation: none;
    }
  }
</style>
