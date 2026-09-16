<script lang="ts">
  import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
  import type {
    BridgeLetterInfo,
    RepairChoice,
    WordBridgeGap,
    WordBridgeQuestion,
  } from "../domain/word-bridge-questions";
  import { findExactPictographChain } from "../domain/word-bridge-questions";
  import BridgeLetterCard from "./BridgeLetterCard.svelte";

  let {
    question,
    selectedAnswer,
    isCorrect,
    focusGapIndex,
    pictographs,
  }: {
    question: WordBridgeQuestion;
    selectedAnswer: boolean | number | string;
    isCorrect: boolean;
    focusGapIndex: number | null;
    pictographs: ReadonlyMap<string, readonly PictographData[]>;
  } = $props();

  const focusGap = $derived.by((): WordBridgeGap => {
    if (question.task === "repair") return question.gap;
    return (
      question.analysis.gaps.find((gap) => gap.index === focusGapIndex) ??
      question.analysis.gaps.find((gap) => !gap.direct) ??
      question.analysis.gaps[0]!
    );
  });

  const selectedRepairChoice = $derived.by((): RepairChoice | null => {
    if (question.task !== "repair" || typeof selectedAnswer !== "string") {
      return null;
    }
    return (
      question.choices.find((choice) => choice.letter === selectedAnswer) ??
      null
    );
  });

  const explanationPath = $derived.by((): BridgeLetterInfo[] => {
    if (focusGap.direct) return [];
    if (question.task !== "repair") return focusGap.shortestBridgePath;

    if (selectedRepairChoice?.isCorrect) return [selectedRepairChoice];
    const firstAnswer = question.validBridges[0];
    return firstAnswer ? [firstAnswer] : [];
  });

  const chainLetters = $derived([
    focusGap.from,
    ...explanationPath.map((bridge) => bridge.letter),
    focusGap.to,
  ]);
  const chainPictographs = $derived(
    findExactPictographChain(chainLetters, pictographs)
  );

  function groupLabel(group: string): string {
    return group.charAt(0).toUpperCase() + group.slice(1);
  }

  const headline = $derived.by(() => {
    if (question.task === "validity") {
      return question.analysis.canRunAsWritten
        ? "Runs exactly as written"
        : `${question.analysis.requiredBridgeCount} ${question.analysis.requiredBridgeCount === 1 ? "bridge" : "bridges"} needed`;
    }

    if (question.task === "count") {
      return `${question.correctAnswer} ${question.correctAnswer === 1 ? "bridge" : "bridges"}`;
    }

    if (selectedRepairChoice?.isCorrect) {
      return `${selectedRepairChoice.letter} connects both sides`;
    }
    return selectedRepairChoice
      ? `${selectedRepairChoice.letter} leaves a mismatch`
      : "A bridge closes both sides";
  });

  const explanation = $derived.by(() => {
    if (question.task === "validity" && question.analysis.canRunAsWritten) {
      return "Every ending placement matches the next starting placement.";
    }

    if (question.task === "count") {
      if (question.correctAnswer === 0) {
        return "Every ending placement already matches the next starting placement.";
      }
      return "Add the numbers on the gap markers. Select one to inspect it.";
    }

    if (question.task === "repair" && selectedRepairChoice) {
      if (selectedRepairChoice.isCorrect) {
        return `${selectedRepairChoice.letter} starts at ${groupLabel(selectedRepairChoice.startPlacementGroup)} and ends at ${groupLabel(selectedRepairChoice.endPlacementGroup)}, matching both neighbors.`;
      }

      const failures: string[] = [];
      if (!selectedRepairChoice.leftConnects) {
        failures.push(
          `it starts at ${groupLabel(selectedRepairChoice.startPlacementGroup)}, not ${groupLabel(focusGap.fromEndPlacementGroup)}`
        );
      }
      if (!selectedRepairChoice.rightConnects) {
        failures.push(
          `it ends at ${groupLabel(selectedRepairChoice.endPlacementGroup)}, not ${groupLabel(focusGap.toStartPlacementGroup)}`
        );
      }
      return `${selectedRepairChoice.letter} misses because ${failures.join(" and ")}.`;
    }

    if (!focusGap.direct) {
      return `${focusGap.from} ends at ${groupLabel(focusGap.fromEndPlacementGroup)}, while ${focusGap.to} starts at ${groupLabel(focusGap.toStartPlacementGroup)}.`;
    }

    return `${focusGap.from} ends at ${groupLabel(focusGap.fromEndPlacementGroup)}, matching ${focusGap.to}'s starting group.`;
  });

  const alternateAnswers = $derived.by(() => {
    if (question.task !== "repair") return [];
    return question.validBridges
      .map((bridge) => bridge.letter)
      .filter((letter) => letter !== selectedAnswer);
  });

  function nodeDetail(index: number): string {
    if (index === 0) {
      return `Ends ${groupLabel(focusGap.fromEndPlacementGroup)}`;
    }
    if (index === chainLetters.length - 1) {
      return `Starts ${groupLabel(focusGap.toStartPlacementGroup)}`;
    }
    const bridge = explanationPath[index - 1]!;
    return `${groupLabel(bridge.startPlacementGroup)} to ${groupLabel(bridge.endPlacementGroup)}`;
  }
</script>

<div
  class="bridge-feedback"
  class:correct={isCorrect}
  class:incorrect={!isCorrect}
>
  <header class="feedback-heading">
    <span class="result-mark" aria-hidden="true">{isCorrect ? "✓" : "×"}</span>
    <div>
      <h3>{headline}</h3>
      <p>{explanation}</p>
    </div>
  </header>

  <div class="chain-scroll themed-scrollbar">
    <div class="pictograph-chain" aria-label="The connecting letter path">
      {#each chainLetters as letter, index (`${letter}-${index}`)}
        <BridgeLetterCard
          {letter}
          detail={nodeDetail(index)}
          pictograph={chainPictographs?.[index] ?? null}
          bridge={index > 0 && index < chainLetters.length - 1}
        />
        {#if index < chainLetters.length - 1}
          <span class="match-arrow" aria-label="Placements match">
            <span aria-hidden="true">→</span>
            <small>match</small>
          </span>
        {/if}
      {/each}
    </div>
  </div>

  {#if question.task === "repair" && alternateAnswers.length > 0}
    <p class="alternate-answer">
      {isCorrect ? "Also valid" : "Valid bridges"}: {alternateAnswers.join(
        ", "
      )}
    </p>
  {/if}
</div>

<style>
  .bridge-feedback {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: clamp(0.75rem, 2cqi, 1.25rem);
    width: 100%;
    min-height: 260px;
    padding: clamp(0.85rem, 2.5cqi, 1.4rem);
    border: 1px solid var(--theme-stroke);
    border-radius: clamp(14px, 2.5cqi, 22px);
    background:
      radial-gradient(
        circle at 50% 110%,
        color-mix(in srgb, var(--feedback-color) 13%, transparent),
        transparent 58%
      ),
      var(--theme-card-bg);
    --feedback-color: var(--semantic-error);
  }

  .bridge-feedback.correct {
    --feedback-color: var(--semantic-success);
  }

  .feedback-heading {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
  }

  .result-mark {
    display: grid;
    place-items: center;
    flex: 0 0 30px;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--feedback-color) 18%, transparent);
    color: var(--feedback-color);
    font-size: 1.1rem;
    font-weight: 900;
  }

  h3 {
    margin: 0;
    color: var(--theme-text);
    font-size: clamp(1rem, 3.2cqi, 1.45rem);
    line-height: 1.2;
  }

  .feedback-heading p {
    max-width: 62ch;
    margin: 0.3rem 0 0;
    color: var(--theme-text-dim);
    font-size: var(--font-size-min, 14px);
    line-height: 1.45;
  }

  .chain-scroll {
    width: 100%;
    overflow-x: auto;
    overscroll-behavior-inline: contain;
  }

  .pictograph-chain {
    display: flex;
    align-items: center;
    justify-content: safe center;
    width: max-content;
    min-width: 100%;
    padding: 0.2rem;
  }

  .match-arrow {
    display: flex;
    flex-direction: column;
    align-items: center;
    flex: 0 0 clamp(25px, 6cqi, 46px);
    color: var(--semantic-success);
    font-size: clamp(1rem, 4cqi, 1.6rem);
    font-weight: 800;
    line-height: 1;
  }

  .match-arrow small {
    margin-top: 0.15rem;
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .alternate-answer {
    margin: 0;
    color: var(--theme-text-dim);
    font-family: "JetBrains Mono", "Fira Code", "SF Mono", monospace;
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
    text-align: center;
  }

  @container (max-width: 340px) {
    .match-arrow {
      flex-basis: 20px;
      font-size: 1rem;
    }
  }
</style>
