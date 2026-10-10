<!--
GridPointTapQuiz - Interactive quiz for identifying grid points
Asks users to tap specific points on both Diamond and Box grids.
Provides instant visual feedback (correct = green glow, wrong = red shake).
-->
<script lang="ts">
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import { onDestroy } from "svelte";
  import type { HapticFeedback } from "$lib/shared/application/services/haptic-feedback";
  import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import GridSvg from "$lib/shared/pictograph/grid/components/GridSvg.svelte";

  let { onComplete } = $props<{
    onComplete?: () => void;
  }>();

  const hapticService = getHapticFeedback();

  let feedbackTimer: ReturnType<typeof setTimeout> | null = null;

  onDestroy(() => {
    if (feedbackTimer !== null) clearTimeout(feedbackTimer);
  });

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

  // Quiz questions configuration
  type PointType = "center" | "hand" | "outer";
  type GridType = "diamond" | "box";

  interface QuizQuestion {
    gridType: GridType;
    prompt: string;
    correctPointType: PointType;
    // For specific compass direction questions
    specificPoint?: string;
  }

  const QUESTIONS: QuizQuestion[] = [
    // Diamond mode questions
    {
      gridType: "diamond",
      prompt: "Tap the <strong>center point</strong>",
      correctPointType: "center",
    },
    {
      gridType: "diamond",
      prompt: "Tap a <strong>hand point</strong>",
      correctPointType: "hand",
    },
    {
      gridType: "diamond",
      prompt: "Tap an <strong>outer point</strong>",
      correctPointType: "outer",
    },
    // Box mode questions (compass directions)
    {
      gridType: "box",
      prompt: "Tap the <strong>NE</strong> outer point",
      correctPointType: "outer",
      specificPoint: "ne",
    },
    {
      gridType: "box",
      prompt: "Tap a <strong>hand point</strong>",
      correctPointType: "hand",
    },
    {
      gridType: "box",
      prompt: "Tap the <strong>SW</strong> outer point",
      correctPointType: "outer",
      specificPoint: "sw",
    },
  ];

  // Quiz state
  let currentQuestionIndex = $state(0);
  let feedbackState = $state<"none" | "correct" | "incorrect">("none");
  let feedbackPointId = $state<string | null>(null);

  // Derived values
  const currentQuestion = $derived(QUESTIONS[currentQuestionIndex]);
  const progress = $derived(currentQuestionIndex / QUESTIONS.length);
  const gridMode = $derived(
    currentQuestion?.gridType === "box" ? GridMode.BOX : GridMode.DIAMOND
  );

  // Point position data (matching GridSvg coordinate system, 950x950 viewBox)
  // These are the approximate centers of each point for click detection
  const POINT_POSITIONS = {
    // Center point
    center: { x: 475, y: 475, type: "center" as PointType },
    // Diamond mode hand points (between center and outer, on cardinal axes)
    n_hand: { x: 475, y: 305, type: "hand" as PointType },
    e_hand: { x: 645, y: 475, type: "hand" as PointType },
    s_hand: { x: 475, y: 645, type: "hand" as PointType },
    w_hand: { x: 305, y: 475, type: "hand" as PointType },
    // Diamond mode outer points (N, E, S, W)
    n_outer: { x: 475, y: 135, type: "outer" as PointType, compass: "n" },
    e_outer: { x: 815, y: 475, type: "outer" as PointType, compass: "e" },
    s_outer: { x: 475, y: 815, type: "outer" as PointType, compass: "s" },
    w_outer: { x: 135, y: 475, type: "outer" as PointType, compass: "w" },
    // Box mode hand points (between center and corners, on diagonals)
    ne_hand: { x: 595, y: 355, type: "hand" as PointType },
    se_hand: { x: 595, y: 595, type: "hand" as PointType },
    sw_hand: { x: 355, y: 595, type: "hand" as PointType },
    nw_hand: { x: 355, y: 355, type: "hand" as PointType },
    // Box mode outer points (NE, SE, SW, NW) - these are the diamond outer points rotated
    ne_outer: { x: 730, y: 220, type: "outer" as PointType, compass: "ne" },
    se_outer: { x: 730, y: 730, type: "outer" as PointType, compass: "se" },
    sw_outer: { x: 220, y: 730, type: "outer" as PointType, compass: "sw" },
    nw_outer: { x: 220, y: 220, type: "outer" as PointType, compass: "nw" },
  };

  // Get relevant points for current grid mode
  const currentPoints = $derived.by(() => {
    if (currentQuestion?.gridType === "box") {
      return {
        center: POINT_POSITIONS.center,
        ne_hand: POINT_POSITIONS.ne_hand,
        se_hand: POINT_POSITIONS.se_hand,
        sw_hand: POINT_POSITIONS.sw_hand,
        nw_hand: POINT_POSITIONS.nw_hand,
        ne_outer: POINT_POSITIONS.ne_outer,
        se_outer: POINT_POSITIONS.se_outer,
        sw_outer: POINT_POSITIONS.sw_outer,
        nw_outer: POINT_POSITIONS.nw_outer,
      };
    }
    return {
      center: POINT_POSITIONS.center,
      n_hand: POINT_POSITIONS.n_hand,
      e_hand: POINT_POSITIONS.e_hand,
      s_hand: POINT_POSITIONS.s_hand,
      w_hand: POINT_POSITIONS.w_hand,
      n_outer: POINT_POSITIONS.n_outer,
      e_outer: POINT_POSITIONS.e_outer,
      s_outer: POINT_POSITIONS.s_outer,
      w_outer: POINT_POSITIONS.w_outer,
    };
  });

  function handlePointClick(pointId: string) {
    if (feedbackState !== "none") return; // Ignore clicks during feedback

    const point = currentPoints[pointId as keyof typeof currentPoints];
    if (!point) return;

    const question = currentQuestion;
    if (!question) return;

    // Check if answer is correct
    let isCorrect = point.type === question.correctPointType;

    // For specific point questions (compass directions), check the exact point
    if (isCorrect && question.specificPoint) {
      const pointCompass = (point as { compass?: string }).compass;
      isCorrect = pointCompass === question.specificPoint;
    }

    // Show feedback
    feedbackPointId = pointId;
    feedbackState = isCorrect ? "correct" : "incorrect";
    hapticService?.trigger(isCorrect ? "success" : "error");

    // After feedback, advance or let user try again
    feedbackTimer = setTimeout(
      () => {
        feedbackTimer = null;
        feedbackState = "none";
        feedbackPointId = null;

        if (isCorrect) {
          if (currentQuestionIndex < QUESTIONS.length - 1) {
            currentQuestionIndex++;
          } else {
            // Quiz complete!
            onComplete?.();
          }
        }
        // If incorrect, stay on same question (user tries again)
      },
      isCorrect ? 600 : 400
    );
  }

  function getPointRadius(pointId: string): number {
    if (pointId === "center") return 35;
    if (pointId.includes("hand")) return 28;
    return 32; // outer points
  }
</script>

<div class="quiz-container">
  <!-- Progress indicator -->
  <div class="progress-bar">
    <div class="progress-fill" style="width: {progress * 100}%"></div>
  </div>
  <div class="progress-text">
    {currentQuestionIndex + 1} / {QUESTIONS.length}
  </div>

  <!-- Question prompt -->
  <div class="prompt">
    {#each parseStrongTags(currentQuestion?.prompt ?? "") as segment}{#if segment.bold}<strong>{segment.text}</strong>{:else}{segment.text}{/if}{/each}
  </div>

  <!-- Grid with clickable points -->
  <div
    class="grid-wrapper"
    class:feedback-correct={feedbackState === "correct"}
  >
    <svg viewBox="0 0 950 950" class="quiz-grid">
      <!-- White background -->
      <rect width="950" height="950" fill="white" rx="8" />

      <!-- Actual grid from GridSvg -->
      <GridSvg {gridMode} />

      <!-- Clickable overlay points -->
      <g class="click-targets">
        {#each Object.entries(currentPoints) as [pointId, point]}
          {@const isFeedbackTarget = feedbackPointId === pointId}
          <circle
            cx={point.x}
            cy={point.y}
            r={getPointRadius(pointId)}
            class="click-target"
            class:correct={isFeedbackTarget && feedbackState === "correct"}
            class:incorrect={isFeedbackTarget && feedbackState === "incorrect"}
            onclick={() => handlePointClick(pointId)}
            onkeydown={(e) =>
              (e.key === "Enter" || e.key === " ") && handlePointClick(pointId)}
            role="button"
            tabindex="0"
            aria-label="Grid point"
          />
        {/each}
      </g>
    </svg>
  </div>

  <!-- Mode indicator -->
  <div class="mode-badge" class:box={currentQuestion?.gridType === "box"}>
    {currentQuestion?.gridType === "box" ? "Box Mode" : "Diamond Mode"}
  </div>
</div>

<style>
  .quiz-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--spacing-md, 1rem);
    width: 100%;
  }

  /* Progress bar */
  .progress-bar {
    width: 100%;
    height: 6px;
    background: var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 3px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: var(--theme-accent);
    border-radius: 3px;
    transition: width var(--duration-dramatic) cubic-bezier(0.22, 1, 0.36, 1);
  }

  .progress-text {
    font-size: 0.875rem;
    color: var(--theme-text-dim);
    font-weight: 600;
  }

  /* Question prompt */
  .prompt {
    font-size: 1.25rem;
    line-height: 1.4;
    color: white;
    text-align: center;
    min-height: 2em;
  }

  .prompt :global(strong) {
    color: var(--theme-accent, #a78bfa);
    font-weight: 700;
  }

  /* Grid wrapper */
  .grid-wrapper {
    width: 100%;
    max-width: 360px;
    border-radius: 12px;
    overflow: hidden;
    transition: box-shadow var(--duration-emphasis) ease;
  }

  .quiz-grid {
    width: 100%;
    height: auto;
    display: block;
  }

  /* Click targets - invisible but clickable */
  .click-target {
    fill: transparent;
    cursor: pointer;
    transition:
      fill 0.2s ease,
      stroke 0.2s ease;
  }

  .click-target:hover {
    fill: color-mix(in srgb, var(--theme-accent) 15%, transparent);
  }

  .click-target:focus {
    outline: none;
    fill: color-mix(in srgb, var(--theme-accent) 20%, transparent);
  }

  /* Correct feedback - green glow */
  .click-target.correct {
    fill: color-mix(in srgb, var(--semantic-success, #22c55e) 40%, transparent);
    animation: correct-pulse 0.6s ease;
  }

  @keyframes correct-pulse {
    0% {
      fill: color-mix(in srgb, var(--semantic-success, #22c55e) 60%, transparent);
    }
    100% {
      fill: color-mix(in srgb, var(--semantic-success, #22c55e) 30%, transparent);
    }
  }

  /* Incorrect feedback - red shake */
  .click-target.incorrect {
    fill: color-mix(in srgb, var(--semantic-error, #ef4444) 40%, transparent);
    animation: incorrect-shake var(--duration-dramatic) ease;
  }

  @keyframes incorrect-shake {
    0%,
    100% {
      transform: translateX(0);
    }
    20% {
      transform: translateX(-4px);
    }
    40% {
      transform: translateX(4px);
    }
    60% {
      transform: translateX(-4px);
    }
    80% {
      transform: translateX(4px);
    }
  }

  /* Mode badge */
  .mode-badge {
    padding: 0.5rem 1rem;
    border-radius: 8px;
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
    letter-spacing: 0.5px;
    background: color-mix(in srgb, var(--prop-blue, #4a9eff) 20%, transparent);
    color: var(--prop-blue, #4a9eff);
    border: 2px solid color-mix(in srgb, var(--prop-blue, #4a9eff) 30%, transparent);
    transition: all var(--duration-emphasis) ease;
  }

  .mode-badge.box {
    background: color-mix(in srgb, var(--prop-red, #ff4a9e) 20%, transparent);
    color: var(--prop-red, #ff4a9e);
    border-color: color-mix(in srgb, var(--prop-red, #ff4a9e) 30%, transparent);
  }

  /* Responsive */
  @media (max-width: 480px) {
    .grid-wrapper {
      max-width: 300px;
    }

    .prompt {
      font-size: 1.1rem;
    }
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .progress-fill {
      transition: none;
    }

    .click-target.correct,
    .click-target.incorrect {
      animation: none;
    }
  }
</style>
