<!--
  Hand Motions, last stage: a short "which one is this?" round over the six
  combinations, in place of a board to read (audit 2026-10-14). One
  combination's picture shows above the board's six names; tapping its name
  fills that cell and the next picture follows by itself, with no Next
  between rounds. A wrong tap shows that name's own picture for a moment, so
  the learner sees how it differs, and the round waits for the right one.
  On a phone the board shows names only, so all six fit on screen under the
  picture; there a wrong tap rings the name without its picture.
-->
<script lang="ts">
  import { onDestroy } from "svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { Crossfade } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import HandCombinationBoard from "#lib/shared/guide-topics/HandCombinationBoard.svelte";
  import {
    HAND_COMBINATIONS,
    combinationPictographData,
    plainTopicText,
    type HandCombinationId,
  } from "#lib/shared/guide-topics/hand-motions-topic.js";
  import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import PictographContainer from "#lib/shared/pictograph/shared/components/PictographContainer.svelte";

  interface Props {
    /** The combinations named so far. */
    answered: readonly HandCombinationId[];
    onAnswer: (id: HandCombinationId) => void;
    onMiss?: () => void;
    /** After the last one has had its moment. */
    onFinish?: () => void;
  }

  let { answered, onAnswer, onMiss, onFinish }: Props = $props();

  // Reading time for a filled cell before the next picture.
  const HOLD_MS = 900;
  const PEEK_MS = 1400;

  /** The unanswered combinations, shuffled once. */
  const order = HAND_COMBINATIONS.map((combination) => combination.id)
    .filter((id) => !answered.includes(id))
    .map((id) => ({ id, key: Math.random() }))
    .sort((a, b) => a.key - b.key)
    .map(({ id }) => id);

  let round = $state(0);
  let lit = $state<HandCombinationId | null>(null);
  let peek = $state<HandCombinationId | null>(null);
  let announcement = $state("");
  let holdTimer: ReturnType<typeof setTimeout> | undefined;
  let peekTimer: ReturnType<typeof setTimeout> | undefined;
  onDestroy(() => {
    clearTimeout(holdTimer);
    clearTimeout(peekTimer);
  });

  const current = $derived(order[round] ?? null);
  const found = $derived(new Set(answered));
  const pictures = new Map(
    HAND_COMBINATIONS.map((combination) => [
      combination.id,
      combinationPictographData(combination),
    ])
  );
  const names = new Map(
    HAND_COMBINATIONS.map((combination) => [
      combination.id,
      plainTopicText(combination.name),
    ])
  );

  function answer(id: HandCombinationId) {
    if (!current || lit) return;
    const name = names.get(id) ?? "";
    if (id !== current) {
      clearTimeout(peekTimer);
      peek = id;
      announcement = t("learn_motion_quiz_miss", { name });
      peekTimer = setTimeout(() => (peek = null), PEEK_MS);
      onMiss?.();
      return;
    }
    clearTimeout(peekTimer);
    peek = null;
    lit = id;
    announcement = name;
    onAnswer(id);
    holdTimer = setTimeout(() => {
      lit = null;
      round += 1;
      if (round >= order.length) onFinish?.();
    }, HOLD_MS);
  }
</script>

<div class="quiz-stage">
  <div class="mystery">
    <Crossfade key={current ?? "done"} duration={DURATION.emphasis}>
      {#if current}
        {@const data = pictures.get(current)}
        {#if data}
          <div
            class="mystery-picture"
            role="img"
            aria-label={t("learn_motion_quiz_picture")}
          >
            <PictographContainer
              pictographData={data}
              gridMode={GridMode.DIAMOND}
              leftPropTypeOverride={PropType.HAND}
              rightPropTypeOverride={PropType.HAND}
              showTKA={false}
              showPlacements={false}
              showReversals={false}
              showTnD={false}
              showElemental={false}
              showNonRadialPoints={false}
              stepNumberOverride={false}
            />
          </div>
        {/if}
      {/if}
    </Crossfade>
  </div>
  <HandCombinationBoard
    {found}
    {lit}
    {peek}
    namesOnlyWhenNarrow
    label={t("learn_motion_quiz_board")}
    onHint={answer}
  />
  <span class="sr-only" aria-live="polite">{announcement}</span>
</div>

<style>
  .quiz-stage {
    display: grid;
    justify-items: center;
    gap: clamp(0.75rem, calc(2 * var(--lesson-vh, 1svh)), 1.5rem);
    width: 100%;
  }

  .mystery {
    width: var(--quiz-picture);
    aspect-ratio: 1;
  }

  .mystery-picture {
    width: 100%;
    height: 100%;
    border: 1px solid color-mix(in srgb, currentColor 16%, transparent);
    border-radius: 0.75rem;
    background: color-mix(in srgb, currentColor 5%, transparent);
    overflow: hidden;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>
