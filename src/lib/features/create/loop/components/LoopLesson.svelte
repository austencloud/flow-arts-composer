<!-- LoopLesson - what a LOOP is, played on a small card one line at a time. -->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { Crossfade, reducedMotion } from "#lib/shared/transitions/motion.js";
  import { onMount } from "svelte";
  import { getLoopBuilderContext } from "../context/loop-builder-context";
  import { madeLayout } from "../domain/loop-card-layout";
  import { loopFamily } from "../domain/loop-families";
  import {
    EXPLAINER_LINE_MS,
    EXPLAINER_MATCH_MS,
    EXPLAINER_REST_MS,
    LESSON_OPENING_MS,
  } from "../domain/loop-timing";
  import { loadLessonExample } from "../services/loop-lesson-example";
  import type { MadeLoop } from "../services/loop-step-workshop";
  import { createLoopCardPlayer } from "../state/loop-card-player.svelte";
  import LoopCard from "./LoopCard.svelte";

  const { workshop } = getLoopBuilderContext();
  const player = createLoopCardPlayer();

  const LINES = [
    "create_loop_explain_1",
    "create_loop_explain_2",
    "create_loop_explain_3",
    "create_loop_explain_4",
  ] as const;

  let example = $state.raw<MadeLoop | null>(null);
  let line = $state(0);
  let match = $state<number | null>(null);
  let width = $state(0);
  let height = $state(0);

  const layout = $derived(
    example
      ? madeLayout(
          { width, height },
          example.sequence.steps.length,
          example.partLength
        )
      : null
  );

  onMount(() => {
    let open = true;
    void loadLessonExample(workshop).then((loaded) => {
      if (!open || !loaded) return;
      player.rest(0);
      example = loaded;
      void teach(loaded, () => open);
    });
    return () => {
      open = false;
      player.dispose();
    };
  });

  async function teach(loop: MadeLoop, isOpen: () => boolean): Promise<void> {
    const { steps } = loop.sequence;
    const part = loop.partLength;
    while (isOpen()) {
      if (reducedMotion()) {
        player.rest(steps.length);
        for (line = 0; line < LINES.length && isOpen(); line++) {
          match = line === 1 ? part - 1 : null;
          await new Promise((done) => setTimeout(done, EXPLAINER_LINE_MS));
        }
        continue;
      }
      const lesson = player.lesson(steps);
      line = 0;
      match = null;
      await lesson.wait(LESSON_OPENING_MS);
      for (let index = 0; index < part; index++) await lesson.arrive(index);
      if (!lesson.alive()) return;
      line = 1;
      match = part - 1;
      await lesson.wait(EXPLAINER_MATCH_MS);
      if (!lesson.alive()) return;
      match = null;
      line = 2;
      await lesson.copyRows({
        partLength: part,
        steps,
        changes: loop.changes,
        backwards: false,
        arriving: null,
      });
      if (!lesson.alive()) return;
      line = 3;
      await lesson.perform();
      await lesson.wait(EXPLAINER_REST_MS);
      if (!lesson.alive()) return;
    }
  }
</script>

<div class="lesson">
  <div class="mini" bind:clientWidth={width} bind:clientHeight={height}>
    {#if example && layout && width > 0}
      <LoopCard
        start={example.sequence.startPlacement ?? null}
        steps={example.sequence.steps}
        {layout}
        {player}
        ink={loopFamily("rotated").ink}
        {match}
        frames
        letters={false}
      />
    {/if}
  </div>
  <div class="line" aria-live="polite">
    <Crossfade key={line} mode="swap">
      <p>{t(LINES[Math.min(line, LINES.length - 1)]!)}</p>
    </Crossfade>
  </div>
</div>

<style>
  .lesson {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    height: 100%;
    min-height: 0;
  }

  .mini {
    position: relative;
    flex: 1;
    min-height: 0;
  }

  .line {
    display: flex;
    justify-content: center;
  }

  p {
    margin: 0;
    font-size: var(--loop-lesson-line, var(--font-size-base, 16px));
    font-weight: 600;
    line-height: 1.75rem;
    text-align: center;
    text-wrap: balance;
  }
</style>
