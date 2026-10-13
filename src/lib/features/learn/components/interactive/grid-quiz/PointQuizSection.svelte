<!--
PointQuizSection - Click on the correct grid point
-->
<script lang="ts">
  import { ALL_GRID_POINTS } from "../../../domain/constants/grid-constants";

  let {
    question,
    answerState,
    selectedAnswer,
    onPointClick,
  }: {
    question: { direction: string; id: number };
    answerState: "idle" | "correct" | "incorrect";
    selectedAnswer: string | null;
    onPointClick: (direction: string) => void;
  } = $props();

  const pointInfo = $derived(
    ALL_GRID_POINTS[question.direction as keyof typeof ALL_GRID_POINTS]
  );
</script>

<div class="quiz-section point-quiz">
  <h3 class="quiz-title">Find the point!</h3>
  <p class="quiz-subtitle">
    Click on the <strong>{question.direction}</strong> point
    {#if pointInfo}
      <span class="direction-hint">
        ({pointInfo.mode === "diamond"
          ? "Diamond grid"
          : pointInfo.mode === "box"
            ? "Box grid"
            : ""})
      </span>
    {/if}
  </p>

  <div class="grid-display interactive">
    <svg viewBox="0 0 100 100" class="quiz-grid clickable">
      <!-- All grid lines -->
      <line
        x1="50"
        y1="15"
        x2="50"
        y2="85"
        stroke="white"
        stroke-width="0.5"
        opacity="0.2"
      />
      <line
        x1="15"
        y1="50"
        x2="85"
        y2="50"
        stroke="white"
        stroke-width="0.5"
        opacity="0.2"
      />
      <line
        x1="25"
        y1="25"
        x2="75"
        y2="75"
        stroke="white"
        stroke-width="0.5"
        opacity="0.2"
      />
      <line
        x1="75"
        y1="25"
        x2="25"
        y2="75"
        stroke="white"
        stroke-width="0.5"
        opacity="0.2"
      />

      <!-- Clickable points -->
      {#each Object.entries(ALL_GRID_POINTS) as [dir, point]}
        {#if dir !== "center"}
          {@const isCorrect = dir === question.direction}
          {@const isSelected = selectedAnswer === dir}
          {@const showCorrect = answerState === "correct" && isSelected}
          {@const showIncorrect = answerState === "incorrect" && isSelected}
          {@const revealCorrect = answerState === "incorrect" && isCorrect}

          <g
            class="point-group"
            class:correct={showCorrect}
            class:incorrect={showIncorrect}
            class:reveal={revealCorrect}
            onclick={() => onPointClick(dir)}
            onkeydown={(e) =>
              (e.key === "Enter" || e.key === " ") && onPointClick(dir)}
            role="button"
            tabindex="0"
            aria-label="Point {dir}"
          >
            <!-- Hit area (larger, invisible) -->
            <circle
              cx={point.x}
              cy={point.y}
              r="10"
              fill="transparent"
              class="hit-area"
            />
            <!-- Glow effect -->
            {#if showCorrect || revealCorrect}
              <circle
                cx={point.x}
                cy={point.y}
                r="8"
                class="glow glow-correct"
                opacity="0.3"
              />
            {:else if showIncorrect}
              <circle
                cx={point.x}
                cy={point.y}
                r="8"
                class="glow glow-incorrect"
                opacity="0.3"
              />
            {/if}
            <!-- Main point -->
            <circle
              cx={point.x}
              cy={point.y}
              r="4"
              class="main-point"
              class:point-correct={showCorrect || revealCorrect}
              class:point-incorrect={showIncorrect}
              class:point-default={!showCorrect &&
                !revealCorrect &&
                !showIncorrect}
            />
            <!-- Label on reveal -->
            {#if showCorrect || revealCorrect}
              <text
                x={point.x}
                y={point.y - 8}
                text-anchor="middle"
                class="point-label"
                class:label-reveal={revealCorrect}
                font-size="6"
                font-weight="700"
              >
                {dir}
              </text>
            {/if}
          </g>
        {/if}
      {/each}

      <!-- Center point (not clickable) -->
      <circle cx="50" cy="50" r="3.5" class="center-glow" opacity="0.5" />
      <circle cx="50" cy="50" r="2.5" class="center-point" />
    </svg>
  </div>

  {#if answerState !== "idle"}
    <div
      class="feedback"
      class:correct={answerState === "correct"}
      class:incorrect={answerState === "incorrect"}
    >
      {#if answerState === "correct"}
        <span>Correct! That's the {question.direction} point.</span>
      {:else}
        <span
          >Not quite! The <strong>{question.direction}</strong> point is highlighted
          in green.</span
        >
      {/if}
    </div>
  {/if}
</div>

<style>
  .quiz-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.25rem;
    animation: fadeIn var(--duration-emphasis) var(--ease-standard);
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .quiz-title {
    font-size: 1.375rem;
    font-weight: 700;
    color: var(--theme-text);
    margin: 0;
    text-align: center;
  }

  .quiz-subtitle {
    font-size: 1rem;
    color: var(--theme-text-dim);
    margin: 0;
    text-align: center;
  }

  .direction-hint {
    font-size: 0.875rem;
    color: var(--theme-text-dim);
  }

  .grid-display {
    width: 100%;
    max-width: 280px;
    aspect-ratio: 1;
    padding: 1rem;
    background: var(--theme-card-bg);
    border-radius: 12px;
    border: 2px solid var(--theme-stroke);
  }

  .grid-display.interactive {
    border-color: var(--theme-accent);
  }

  .quiz-grid {
    width: 100%;
    height: 100%;
  }

  .quiz-grid.clickable {
    cursor: pointer;
  }

  .point-group {
    cursor: pointer;
    transition:
      transform var(--duration-normal) var(--ease-standard),
      filter var(--duration-normal) var(--ease-standard);
  }

  .point-group:hover .main-point {
    transform: scale(1.25);
    transform-origin: center;
    filter: brightness(1.2);
  }

  .point-group .hit-area {
    cursor: pointer;
  }

  .point-group.correct .main-point,
  .point-group.reveal .main-point {
    animation: correctPop var(--duration-dramatic) var(--ease-standard);
  }

  .point-group.incorrect .main-point {
    animation: shake var(--duration-dramatic) var(--ease-standard);
  }

  @keyframes correctPop {
    0% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.5);
    }
    100% {
      transform: scale(1);
    }
  }

  @keyframes shake {
    0%,
    100% {
      transform: translateX(0);
    }
    25% {
      transform: translateX(-3px);
    }
    75% {
      transform: translateX(3px);
    }
  }

  .point-label {
    animation: fadeIn var(--duration-emphasis) var(--ease-standard);
  }

  .glow {
    animation: pulse 1s ease infinite;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 0.3;
    }
    50% {
      opacity: 0.5;
    }
  }

  .feedback {
    padding: 0.875rem 1.25rem;
    border-radius: 10px;
    font-size: 0.9375rem;
    text-align: center;
    animation: slideUp var(--duration-emphasis) var(--ease-standard);
  }

  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .feedback.correct {
    background: color-mix(
      in srgb,
      var(--semantic-success, #50c878) 15%,
      transparent
    );
    border: 1px solid
      color-mix(in srgb, var(--semantic-success, #50c878) 30%, transparent);
    color: var(--semantic-success, #50c878);
  }

  .feedback.incorrect {
    background: color-mix(
      in srgb,
      var(--semantic-warning, #f59e0b) 15%,
      transparent
    );
    border: 1px solid
      color-mix(in srgb, var(--semantic-warning, #f59e0b) 30%, transparent);
    color: var(--semantic-warning, #f59e0b);
  }

  /* SVG point classes */
  .glow-correct {
    fill: var(--semantic-success, #50c878);
  }
  .glow-incorrect {
    fill: var(--semantic-error, #ef4444);
  }
  .point-correct {
    fill: var(--semantic-success, #50c878);
  }
  .point-incorrect {
    fill: var(--semantic-error, #ef4444);
  }
  .point-default {
    fill: white;
  }
  .point-label {
    fill: white;
  }
  .point-label.label-reveal {
    fill: var(--semantic-success, #50c878);
  }
  .center-glow,
  .center-point {
    fill: var(--semantic-warning, #ffd700);
  }

  @media (max-width: 500px) {
    .quiz-title {
      font-size: 1.25rem;
    }

    .grid-display {
      max-width: 240px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .quiz-section,
    .feedback,
    .point-group {
      animation: none;
      transition: none;
    }
  }
</style>
