<script lang="ts">
  /**
   * The words of a figureChoice block (presentation only; the rules live in
   * figure-choice-state.ts, and the row with its answer buttons in
   * FigureCardRow).
   *
   * The question leads the row, over the cards, in larger type than the
   * body, so a reader knows from the first look that they are being asked
   * something, and what to watch for while the figures play (2026-11-12,
   * Austen: under the cards, the question did not read as one). Each card
   * carries its own answer button.
   *
   * Two states share one reserved cell, sized for the taller of them, so
   * nothing around the block moves when it changes:
   *   - asking: the lead (or, after a wrong pick, the "look again" note in
   *     its place) and the question;
   *   - answered: the answer and the line that follows it.
   *
   * Words keep the guide's type roles and never read --fit.
   */
  import { Crossfade } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import type { GuideBlock } from "../_data/guide-content-blocks";
  import type { FigureChoiceState } from "../_data/figure-choice-state";

  type ChoiceBlock = Extract<GuideBlock, { kind: "figureChoice" }>;

  let {
    block,
    state: choice,
  }: {
    block: ChoiceBlock;
    state: FigureChoiceState;
  } = $props();

  const answered = $derived(choice.phase === "answered");
  // The line over the question: the lead, or the wrong note once one is wrong.
  const prompt = $derived(
    choice.wrong.length > 0 ? "wrong" : block.lead ? "lead" : "none"
  );
  // What a screen reader hears when the state changes.
  const announced = $derived(
    answered
      ? [block.right, block.after].filter(Boolean).join(" ")
      : choice.wrong.length > 0
        ? block.wrong
        : ""
  );
</script>

{#snippet asking(live: boolean)}
  <div class="choice-state">
    <div class="prompt-slot">
      {#if block.lead}
        <p class="choice-p choice-lead sizer" aria-hidden="true">{block.lead}</p>
      {/if}
      <p class="choice-p sizer" aria-hidden="true">{block.wrong}</p>
      {#if live}
        <div class="prompt-live">
          <Crossfade key={prompt} duration={DURATION.normal} fill>
            {#if prompt === "wrong"}
              <p class="choice-p choice-wrong">{block.wrong}</p>
            {:else if prompt === "lead"}
              <p class="choice-p choice-lead">{block.lead}</p>
            {/if}
          </Crossfade>
        </div>
      {/if}
    </div>
    <p class="choice-question" id={live ? `choice-q-${block.id}` : undefined}>
      {block.question}
    </p>
  </div>
{/snippet}

{#snippet answer(live: boolean)}
  <div class="choice-state choice-answered" tabindex={live ? -1 : undefined}>
    <p class="choice-p choice-right">{block.right}</p>
    {#if block.after}<p class="choice-p choice-after">{block.after}</p>{/if}
  </div>
{/snippet}

<div class="figure-choice">
  <div class="choice-stage">
    <!-- Sizers: the cell is as tall as the taller state. -->
    <div class="sizer" aria-hidden="true">{@render asking(false)}</div>
    <div class="sizer" aria-hidden="true">{@render answer(false)}</div>
    <div class="stage-live">
      <Crossfade key={answered} duration={DURATION.normal} fill>
        {#if answered}
          {@render answer(true)}
        {:else}
          {@render asking(true)}
        {/if}
      </Crossfade>
    </div>
  </div>
  <p class="sr-only" aria-live="polite">{announced}</p>
</div>

<style>
  .figure-choice {
    min-width: 0;
  }
  .choice-stage,
  .prompt-slot {
    display: grid;
  }
  .choice-stage > *,
  .prompt-slot > * {
    grid-area: 1 / 1;
    min-width: 0;
  }
  .sizer {
    visibility: hidden;
  }
  .stage-live,
  .prompt-live {
    position: relative;
  }
  .choice-state {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 0.2rem;
    block-size: 100%;
  }
  .choice-answered {
    gap: 0.3rem;
    outline: none;
  }
  /* FlowFrame's body words (.flow-p), which its scoped styles cannot
     reach inside this component. */
  .choice-p {
    font-family: "Cormorant Garamond", Georgia, serif;
    color: var(--ink, #1a1a1a);
    font-size: var(--font-size-xl, 1.25rem);
    font-weight: 500;
    /* Tighter leading than a paragraph's: these are one-line prompts, and
       the phone screen's room goes to the cards. */
    line-height: 1.25;
    margin: 0;
    text-align: center;
    text-wrap: balance;
  }
  /* The setup line sits back so the question leads. */
  .choice-lead {
    color: var(--ink-dim, #555);
  }
  /* The question: between the body and the screen's heading (.flow-h2), so
     it reads as the point of the screen. */
  .choice-question {
    font-family: "Cormorant Garamond", Georgia, serif;
    color: var(--ink, #1a1a1a);
    font-size: var(--font-size-2xl, 1.5rem);
    font-weight: 700;
    line-height: 1.15;
    margin: 0;
    text-align: center;
    text-wrap: balance;
  }
  .choice-right {
    font-weight: 600;
  }
  .choice-after {
    opacity: 0.85;
  }
</style>
