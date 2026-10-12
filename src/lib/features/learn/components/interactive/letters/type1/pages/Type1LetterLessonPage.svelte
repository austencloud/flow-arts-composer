<!--
Type1LetterLessonPage - Shared component for Prospin/Antispin/Hybrid letter lesson pages
Eliminates ~1000 lines of duplicated code across the three letter type pages
-->
<script lang="ts">
  import Type1LetterVisualizer from "../Type1LetterVisualizer.svelte";
  import {
    PROSPIN_LETTERS,
    ANTISPIN_LETTERS,
    HYBRID_LETTERS,
  } from "../domain/type1-letter-data";
  import type { Type1PageConfig } from "../domain/type1-page-config";
  import type { Type1LetterData } from "../type1-letter-data";

  interface Props {
    config: Type1PageConfig;
    currentLetter: Type1LetterData | undefined;
    letterIndex: number;
    onCycle: (direction: 1 | -1) => void;
    onSelectLetter: (index: number) => void;
    onNext: () => void;
    onPrevious: () => void;
    showFinalSummary?: boolean;
  }

  let {
    config,
    currentLetter,
    letterIndex,
    onCycle,
    onSelectLetter,
    onNext,
    onPrevious,
    showFinalSummary = false,
  }: Props = $props();

  interface TextSegment {
    text: string;
    bold: boolean;
  }

  function parseStrongTags(input: string): TextSegment[] {
    const segments: TextSegment[] = [];
    const parts = input.split(/(<strong>.*?<\/strong>)/g);
    for (const part of parts) {
      const match = part.match(/^<strong>(.*?)<\/strong>$/);
      if (match) {
        segments.push({ text: match[1] ?? "", bold: true });
      } else if (part) {
        segments.push({ text: part, bold: false });
      }
    }
    return segments;
  }
</script>

<div class="page">
  <h2>{config.title}</h2>

  <div class="motion-intro {config.theme}">
    <div class="motion-icon">
      <i class="fa-solid {config.icon}" aria-hidden="true"></i>
    </div>
    <p class="motion-summary">
      {#each parseStrongTags(config.motionSummary) as segment}{#if segment.bold}<strong
            >{segment.text}</strong
          >{:else}{segment.text}{/if}{/each}
    </p>
    <span class="motion-badge">{config.badge}</span>
  </div>

  <div class="explanation">
    <h3>{config.explanation.title}</h3>
    <ul>
      {#each config.explanation.points as point}
        <li>
          {#each parseStrongTags(point) as segment}{#if segment.bold}<strong
                >{segment.text}</strong
              >{:else}{segment.text}{/if}{/each}
        </li>
      {/each}
    </ul>
  </div>

  <div class="visualizer-section">
    {#if currentLetter}
      <Type1LetterVisualizer letterData={currentLetter} size="large" />
    {/if}

    <div class="nav-controls">
      <button
        class="nav-button"
        onclick={() => onCycle(-1)}
        disabled={letterIndex === 0}
        aria-label="Previous {config.ariaLabelPrefix} letter"
      >
        <i class="fa-solid fa-chevron-left" aria-hidden="true"></i>
      </button>
      <span class="nav-indicator">
        {letterIndex + 1} / {config.letters.length}
      </span>
      <button
        class="nav-button"
        onclick={() => onCycle(1)}
        disabled={letterIndex === config.letters.length - 1}
        aria-label="Next {config.ariaLabelPrefix} letter"
      >
        <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
      </button>
    </div>
  </div>

  <div class="letter-summary">
    <h3>{config.title}</h3>
    <div class="summary-letters">
      {#each config.letters as letterData, i}
        <button
          class="letter-chip"
          class:active={i === letterIndex}
          onclick={() => onSelectLetter(i)}
          aria-label="Select letter {letterData.letter}"
        >
          {letterData.letter}
        </button>
      {/each}
    </div>
  </div>

  {#if showFinalSummary}
    <div class="final-summary">
      <h3>Type 1 Letter Summary</h3>
      <div class="summary-grid">
        <div class="summary-card pro">
          <i class="fa-solid fa-rotate-right" aria-hidden="true"></i>
          <span class="card-label">Pro-Pro</span>
          <span class="card-letters">
            {PROSPIN_LETTERS.map((l) => l.letter).join(" ")}
          </span>
        </div>
        <div class="summary-card anti">
          <i class="fa-solid fa-rotate-left" aria-hidden="true"></i>
          <span class="card-label">Anti-Anti</span>
          <span class="card-letters">
            {ANTISPIN_LETTERS.map((l) => l.letter).join(" ")}
          </span>
        </div>
        <div class="summary-card hybrid">
          <i class="fa-solid fa-shuffle" aria-hidden="true"></i>
          <span class="card-label">Hybrid</span>
          <span class="card-letters">
            {HYBRID_LETTERS.map((l) => l.letter).join(" ")}
          </span>
        </div>
      </div>
    </div>
  {/if}

  <div class="button-row">
    <button class="prev-button" onclick={onPrevious}>
      <i class="fa-solid fa-arrow-left" aria-hidden="true"></i>
      Back
    </button>
    <button class="next-button" onclick={onNext}>
      {#if config.nextButtonIcon !== "fa-arrow-right"}
        <i class="fa-solid {config.nextButtonIcon}" aria-hidden="true"></i>
      {/if}
      {config.nextButtonText}
      {#if config.nextButtonIcon === "fa-arrow-right"}
        <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
      {/if}
    </button>
  </div>
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
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  /* Theme-specific header gradients */
  .page:has(.motion-intro.pro) h2 {
    background: linear-gradient(
      135deg,
      var(--theme-accent, #22d3ee) 0%,
      var(--theme-accent, #06b6d4) 100%
    );
  }

  .page:has(.motion-intro.anti) h2 {
    --anti-color: #a855f7;
    background: linear-gradient(135deg, var(--anti-color) 0%, #9333ea 100%);
  }

  .page:has(.motion-intro.hybrid) h2 {
    --anti-color: #a855f7;
    background: linear-gradient(
      135deg,
      var(--theme-accent, #22d3ee) 0%,
      var(--anti-color) 100%
    );
  }

  h3 {
    font-size: 1.125rem;
    font-weight: 600;
    color: white;
    margin: 0;
  }

  .motion-intro {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    padding: 1.5rem;
    border-radius: 16px;
  }

  .motion-intro.pro {
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--theme-accent, #22d3ee) 10%, transparent) 0%,
      color-mix(in srgb, var(--theme-accent, #22d3ee) 2%, transparent) 100%
    );
    border: 1px solid
      color-mix(in srgb, var(--theme-accent, #22d3ee) 20%, transparent);
  }

  .motion-intro.anti {
    --anti-color: #a855f7;
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--anti-color) 10%, transparent) 0%,
      color-mix(in srgb, var(--anti-color) 2%, transparent) 100%
    );
    border: 1px solid color-mix(in srgb, var(--anti-color) 20%, transparent);
  }

  .motion-intro.hybrid {
    --anti-color: #a855f7;
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--theme-accent, #22d3ee) 10%, transparent) 0%,
      color-mix(in srgb, var(--anti-color) 10%, transparent) 100%
    );
    border: 1px solid color-mix(in srgb, var(--anti-color) 20%, transparent);
  }

  .motion-icon {
    width: var(--min-touch-target);
    height: var(--min-touch-target);
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    font-size: 1.5rem;
  }

  .motion-intro.pro .motion-icon {
    background: color-mix(
      in srgb,
      var(--theme-accent, #22d3ee) 20%,
      transparent
    );
    color: var(--theme-accent, #22d3ee);
  }

  .motion-intro.anti .motion-icon {
    --anti-color: #a855f7;
    background: color-mix(in srgb, var(--anti-color) 20%, transparent);
    color: var(--anti-color);
  }

  .motion-intro.hybrid .motion-icon {
    --anti-color: #a855f7;
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--theme-accent, #22d3ee) 20%, transparent),
      color-mix(in srgb, var(--anti-color) 20%, transparent)
    );
    color: var(--anti-color);
  }

  .motion-summary {
    font-size: 1.25rem;
    font-weight: 500;
    color: var(--theme-text, rgba(255, 255, 255, 0.85));
    margin: 0;
    text-align: center;
  }

  .motion-badge {
    font-size: 0.75rem;
    font-weight: 700;
    padding: 0.25rem 0.75rem;
    border-radius: 12px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .motion-intro.pro .motion-badge {
    background: color-mix(
      in srgb,
      var(--theme-accent, #22d3ee) 20%,
      transparent
    );
    color: var(--theme-accent, #22d3ee);
  }

  .motion-intro.anti .motion-badge {
    --anti-color: #a855f7;
    background: color-mix(in srgb, var(--anti-color) 20%, transparent);
    color: var(--anti-color);
  }

  .motion-intro.hybrid .motion-badge {
    --anti-color: #a855f7;
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--theme-accent, #22d3ee) 20%, transparent),
      color-mix(in srgb, var(--anti-color) 20%, transparent)
    );
    color: var(--anti-color);
  }

  .explanation {
    padding: 1.25rem;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    border-radius: 12px;
  }

  .explanation ul {
    margin: 0.75rem 0 0 0;
    padding-left: 1.25rem;
  }

  .explanation li {
    font-size: 1rem;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.75));
    line-height: 1.6;
    margin-bottom: 0.5rem;
  }

  .explanation li:last-child {
    margin-bottom: 0;
  }

  .visualizer-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
  }

  .nav-controls {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .nav-button {
    width: var(--min-touch-target);
    height: var(--min-touch-target);
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke-strong);
    border-radius: 50%;
    color: white;
    cursor: pointer;
    transition:
      background var(--duration-normal) var(--ease-standard),
      border-color var(--duration-normal) var(--ease-standard),
      opacity var(--duration-normal) var(--ease-standard);
  }

  .nav-button:hover:not(:disabled) {
    background: var(--theme-stroke, rgba(255, 255, 255, 0.15));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.25));
  }

  .nav-button:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .nav-indicator {
    font-size: 0.875rem;
    color: var(--theme-text-dim);
    min-width: 60px;
    text-align: center;
  }

  .letter-summary {
    padding: 1rem;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    border-radius: 12px;
  }

  .summary-letters {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 0.75rem;
    justify-content: center;
  }

  .letter-chip {
    width: var(--min-touch-target);
    height: var(--min-touch-target);
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--theme-card-bg);
    border: 2px solid var(--theme-stroke-strong);
    border-radius: 8px;
    font-weight: 700;
    font-size: 1.125rem;
    color: var(--theme-text-dim);
    cursor: pointer;
    transition:
      background var(--duration-normal) var(--ease-standard),
      color var(--duration-normal) var(--ease-standard),
      border-color var(--duration-normal) var(--ease-standard);
  }

  .letter-chip:hover {
    background: var(--theme-stroke, rgba(255, 255, 255, 0.12));
    color: white;
  }

  .letter-chip.active {
    background: color-mix(
      in srgb,
      var(--theme-accent, #22d3ee) 20%,
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #22d3ee) 50%,
      transparent
    );
    color: var(--theme-accent, #22d3ee);
  }

  /* Final Summary Section (Hybrid page only) */
  .final-summary {
    padding: 1.25rem;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    border-radius: 12px;
  }

  .summary-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.75rem;
    margin-top: 1rem;
  }

  .summary-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding: 1rem 0.5rem;
    border-radius: 12px;
    text-align: center;
  }

  .summary-card i {
    font-size: 1.5rem;
  }

  .summary-card.pro {
    background: color-mix(
      in srgb,
      var(--theme-accent, #22d3ee) 10%,
      transparent
    );
    border: 1px solid
      color-mix(in srgb, var(--theme-accent, #22d3ee) 25%, transparent);
  }

  .summary-card.pro i,
  .summary-card.pro .card-label {
    color: var(--theme-accent, #22d3ee);
  }

  .summary-card.anti {
    --anti-color: #a855f7;
    background: color-mix(in srgb, var(--anti-color) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--anti-color) 25%, transparent);
  }

  .summary-card.anti i,
  .summary-card.anti .card-label {
    color: var(--anti-color, #a855f7);
  }

  .summary-card.hybrid {
    --anti-color: #a855f7;
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--theme-accent, #22d3ee) 10%, transparent),
      color-mix(in srgb, var(--anti-color) 10%, transparent)
    );
    border: 1px solid color-mix(in srgb, var(--anti-color) 25%, transparent);
  }

  .summary-card.hybrid i,
  .summary-card.hybrid .card-label {
    color: var(--anti-color, #a855f7);
  }

  .card-label {
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .card-letters {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--theme-text, rgba(255, 255, 255, 0.85));
    letter-spacing: 1px;
  }

  .button-row {
    display: flex;
    gap: 1rem;
    justify-content: center;
    margin-top: 1rem;
  }

  .next-button,
  .prev-button {
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
      border-color var(--duration-emphasis);
    min-height: var(--min-touch-target);
  }

  .next-button {
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--theme-accent, #22d3ee) 30%, transparent) 0%,
      color-mix(in srgb, var(--theme-accent, #06b6d4) 30%, transparent) 100%
    );
    border: 2px solid
      color-mix(in srgb, var(--theme-accent, #22d3ee) 50%, transparent);
    color: white;
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

  .prev-button {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    border: 2px solid var(--theme-stroke-strong);
    color: var(--theme-text, rgba(255, 255, 255, 0.8));
  }

  .prev-button:hover {
    background: var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.25));
  }

  @media (max-width: 600px) {
    h2 {
      font-size: 1.5rem;
    }

    .button-row {
      flex-direction: column;
    }

    .next-button,
    .prev-button {
      width: 100%;
    }

    .summary-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .page {
      animation: none;
    }
  }
</style>
