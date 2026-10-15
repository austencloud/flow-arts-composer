<!--
  Hand Motions, last stage: a short "which one is this?" round over the six
  combinations, in place of a board to read (audit 2026-10-14). The picture
  asked about plays its move on a loop, the hands gliding from their start
  points as the arrows draw in, so the learner sees the motion and the
  finished pictograph (Austen, 2026-10-15). Every tap answers on screen
  under the picture: a right name rings the picture, fills its cell and says
  so, then the next picture follows by itself; a wrong name marks its cell
  with a cross and shows that combination's own picture until the round's
  right answer, so the learner can compare. On a phone the board shows names
  only, so all six fit on screen under the picture; there the line under the
  picture carries the answer.
-->
<script lang="ts">
  import { onDestroy } from "svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { Crossfade, reducedMotion } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import HandCombinationBoard from "#lib/shared/guide-topics/HandCombinationBoard.svelte";
  import {
    HAND_COMBINATIONS,
    plainTopicText,
    type HandCombinationId,
  } from "#lib/shared/guide-topics/hand-motions-topic.js";
  import { combinationMove } from "#lib/shared/guide-topics/combination-playback.svelte.js";
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

  // Reading time for a right answer before the next picture.
  const HOLD_MS = 1600;
  // The loop: the move plays, the finished picture rests, then it replays.
  const PLAY_MS = 1100;
  const REST_MS = 1300;

  /** The unanswered combinations, shuffled once. */
  const order = HAND_COMBINATIONS.map((combination) => combination.id)
    .filter((id) => !answered.includes(id))
    .map((id) => ({ id, key: Math.random() }))
    .sort((a, b) => a.key - b.key)
    .map(({ id }) => id);

  let round = $state(0);
  let lit = $state<HandCombinationId | null>(null);
  let missed = $state<ReadonlySet<HandCombinationId>>(new Set());
  /** The answer line; `tap` restarts its entrance on every tap. */
  let verdict = $state<{ right: boolean; name: string; tap: number } | null>(
    null
  );
  let taps = 0;
  let holdTimer: ReturnType<typeof setTimeout> | undefined;

  const current = $derived(order[round] ?? null);
  const found = $derived(new Set(answered));
  const moves = new Map(
    HAND_COMBINATIONS.map((combination) => [
      combination.id,
      combinationMove(combination),
    ])
  );
  const names = new Map(
    HAND_COMBINATIONS.map((combination) => [
      combination.id,
      plainTopicText(combination.name),
    ])
  );

  // The picture asked about plays its move over and over until it is named;
  // once named it holds the finished picture. Reduced motion shows only the
  // finished picture.
  let progress = $state<number | null>(null);
  $effect(() => {
    if (!current || lit || reducedMotion()) return;
    const startedAt = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const elapsed = (now - startedAt) % (PLAY_MS + REST_MS);
      const linear = Math.min(1, elapsed / PLAY_MS);
      progress = 1 - Math.pow(1 - linear, 3);
      frame = requestAnimationFrame(tick);
    });
    return () => {
      cancelAnimationFrame(frame);
      progress = null;
    };
  });
  onDestroy(() => clearTimeout(holdTimer));

  function answer(id: HandCombinationId) {
    if (!current || lit) return;
    const name = names.get(id) ?? "";
    taps += 1;
    if (id !== current) {
      missed = new Set([...missed, id]);
      verdict = { right: false, name, tap: taps };
      onMiss?.();
      return;
    }
    lit = id;
    missed = new Set();
    verdict = { right: true, name, tap: taps };
    onAnswer(id);
    holdTimer = setTimeout(() => {
      lit = null;
      verdict = null;
      round += 1;
      if (round >= order.length) onFinish?.();
    }, HOLD_MS);
  }
</script>

<div class="quiz-stage">
  <div
    class="mystery"
    class:right={verdict?.right}
    class:wrong={verdict && !verdict.right}
  >
    {#key verdict && !verdict.right ? verdict.tap : 0}
      <div class="shake">
        <Crossfade key={current ?? "done"} duration={DURATION.emphasis}>
          {#if current}
            {@const move = moves.get(current)}
            {#if move}
              {@const playing = progress !== null && move.start !== null}
              <div
                class="mystery-picture"
                role="img"
                aria-label={t("learn_motion_quiz_picture")}
              >
                <PictographContainer
                  pictographData={move.data}
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
                  motionStep={playing ? move.step : null}
                  motionStartData={playing ? move.start : null}
                  motionProgress={playing ? progress : null}
                  arrowOpacity={playing ? (progress ?? 1) : 1}
                />
              </div>
            {/if}
          {/if}
        </Crossfade>
      </div>
    {/key}
    {#if verdict?.right}
      <i class="fa-solid fa-check mystery-check" aria-hidden="true"></i>
    {/if}
  </div>
  <p class="verdict" aria-live="polite">
    {#if verdict}
      {#key verdict.tap}
        <span class="verdict-line" class:right={verdict.right}>
          <i
            class="fa-solid"
            class:fa-circle-check={verdict.right}
            class:fa-circle-xmark={!verdict.right}
            aria-hidden="true"
          ></i>
          {verdict.right
            ? t("learn_motion_quiz_hit", { name: verdict.name })
            : t("learn_motion_quiz_miss", { name: verdict.name })}
        </span>
      {/key}
    {/if}
  </p>
  <HandCombinationBoard
    {found}
    {lit}
    {missed}
    namesOnlyWhenNarrow
    label={t("learn_motion_quiz_board")}
    onHint={answer}
  />
</div>

<style>
  .quiz-stage {
    display: grid;
    justify-items: center;
    gap: clamp(0.75rem, calc(2 * var(--lesson-vh, 1svh)), 1.5rem);
    width: 100%;
  }

  .mystery {
    position: relative;
    width: var(--quiz-picture);
    aspect-ratio: 1;
    border-radius: 0.75rem;
    transition: box-shadow var(--transition-normal);
  }

  .shake {
    width: 100%;
    height: 100%;
  }

  /* A right answer rings the picture and glows; a wrong one shakes it. */
  .mystery.right {
    box-shadow:
      0 0 0 2px var(--semantic-success),
      0 0 1.75rem color-mix(in srgb, var(--semantic-success) 45%, transparent);
  }

  .mystery.wrong .shake {
    animation: shake var(--duration-dramatic, 350ms) var(--ease-standard, ease);
  }

  .mystery-picture {
    width: 100%;
    height: 100%;
    border: 1px solid color-mix(in srgb, currentColor 16%, transparent);
    border-radius: 0.75rem;
    background: color-mix(in srgb, currentColor 5%, transparent);
    overflow: hidden;
  }

  .mystery-check {
    position: absolute;
    top: -0.9rem;
    right: -0.9rem;
    display: grid;
    place-items: center;
    width: 2.25rem;
    aspect-ratio: 1;
    border-radius: 50%;
    background: var(--semantic-success);
    color: white;
    font-size: 1.05rem;
    box-shadow: 0 0.25rem 0.75rem rgb(0 0 0 / 0.35);
    animation: check-pop var(--duration-dramatic, 350ms)
      cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  /* One line under the picture, reserved so an answer moves nothing. */
  .verdict {
    display: grid;
    place-items: center;
    min-height: 1.6em;
    margin: 0;
    font-size: clamp(1rem, 1.6vw, 1.15rem);
    font-weight: 600;
    text-align: center;
  }

  .verdict-line {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    animation: verdict-in var(--duration-normal, 200ms)
      var(--ease-standard, ease);
  }

  .verdict-line i {
    color: var(--semantic-error);
  }

  .verdict-line.right i {
    color: var(--semantic-success);
  }

  @keyframes shake {
    20%,
    60% {
      translate: -0.4rem 0;
    }
    40%,
    80% {
      translate: 0.4rem 0;
    }
  }

  @keyframes check-pop {
    from {
      scale: 0.4;
      opacity: 0;
    }
  }

  @keyframes verdict-in {
    from {
      opacity: 0;
      translate: 0 0.35rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .mystery.wrong .shake,
    .mystery-check,
    .verdict-line {
      animation: none;
    }
  }
</style>
