<script lang="ts">
  /**
   * A row of figure cards that share a screen (the Staff Motions opener):
   * side by side, each under its own small title, with the row's question
   * (figureChoice) leading them: over them on a phone, before them on a
   * wide window. Each card carries its own answer button, in the guide's
   * accent, so the choice sits on the figure it names (2026-11-12, Austen:
   * grey A and B buttons centred under the words did not read as a quiz).
   *
   * Owns the row's turn coordinator when every card sets `playInTurn`, and
   * the question's state for the visit. The cards themselves are drawn by
   * FlowFrame's `card` snippet, which hands each one its turn and its
   * revealed cues.
   */
  import { onDestroy, onMount, tick, type Snippet } from "svelte";
  import { Crossfade } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import FigureChoice from "./FigureChoice.svelte";
  import GuideFigureButton from "./GuideFigureButton.svelte";
  import { FigureRowTurns } from "./figure-row-turns.svelte";
  import type { GuideBlock } from "../_data/guide-content-blocks";
  import type { FlowRenderItem } from "../_data/flow-render-items";
  import {
    choiceReducer,
    isChoiceEnabled,
    recallChoice,
    rememberChoice,
    type FigureChoiceEvent,
  } from "../_data/figure-choice-state";

  type ChoiceBlock = Extract<GuideBlock, { kind: "figureChoice" }>;
  export type FigureCardExtras = {
    turns: { row: FigureRowTurns; index: number } | null;
    thumbRingOn?: boolean;
  };

  let {
    row,
    choice = null,
    beside = false,
    card,
  }: {
    row: { item: FlowRenderItem; i: number }[];
    choice?: ChoiceBlock | null;
    /** The window's room puts the words beside the cards. */
    beside?: boolean;
    card: Snippet<[FlowRenderItem, FigureCardExtras]>;
  } = $props();

  const cards = $derived(
    row.map(({ item }) => (item.type === "showcase" ? item.card : null))
  );

  const reducedMotion =
    typeof window !== "undefined" &&
    "matchMedia" in window &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // The question's state, recalled for the visit.
  // svelte-ignore state_referenced_locally
  let state = $state(recallChoice(choice?.id ?? "", reducedMotion));
  function dispatch(event: FigureChoiceEvent) {
    state = choiceReducer(state, event);
    if (choice) rememberChoice(choice.id, state);
  }
  const answered = $derived(state.phase === "answered");

  // In turn only when every card asks for it.
  // svelte-ignore state_referenced_locally
  const inTurn = row.length > 1 && row.every(({ item }) => item.type === "showcase" && !!item.card.playInTurn);
  // svelte-ignore state_referenced_locally
  const turns = inTurn
    ? new FigureRowTurns({
        count: row.length,
        skipOpening: reducedMotion || state.played,
        onOpeningDone: () => dispatch({ type: "openingDone" }),
      })
    : null;
  onMount(() => {
    // Without a row to wait for, the question opens at once.
    if (!turns) dispatch({ type: "openingDone" });
  });
  onDestroy(() => turns?.dispose());

  let band = $state<HTMLElement | null>(null);

  async function choose(index: number) {
    if (!choice) return;
    const before = state.phase;
    dispatch({ type: "choose", index, answer: choice.answer });
    if (before === "open" && state.phase === "replaying") {
      if (turns) void turns.replayRow().then(() => dispatch({ type: "replayDone" }));
      else dispatch({ type: "replayDone" });
    }
    // The answer takes the question's place: focus follows it there.
    if (state.phase === "answered") {
      await tick();
      band?.querySelector<HTMLElement>(".stage-live .choice-answered")?.focus();
    }
  }
  // An answer button's verdict colour: right once answered, wrong once picked.
  const toneOf = (i: number) =>
    choice && answered && i === choice.answer
      ? "var(--semantic-success, #16a34a)"
      : state.wrong.includes(i)
        ? "var(--semantic-error, #dc2626)"
        : undefined;

  const titleOf = (c: (typeof cards)[number]) =>
    !c ? "" : c.blindTitle && choice && !answered ? c.blindTitle : (c.figureTitle ?? "");
  const longerOf = (c: (typeof cards)[number]) =>
    [c?.blindTitle ?? "", c?.figureTitle ?? ""].reduce((a, b) =>
      b.length > a.length ? b : a
    );
  const extrasFor = (index: number): FigureCardExtras => ({
    turns: turns ? { row: turns, index } : null,
    thumbRingOn: choice?.reveals?.thumbRing && answered ? true : undefined,
  });
</script>

<div class="card-row-band" class:beside={beside && !!choice} bind:this={band}>
  {#if choice}
    <FigureChoice block={choice} {state} />
  {/if}
  <div
    class="figure-row"
    role={choice ? "group" : undefined}
    aria-labelledby={choice ? `choice-q-${choice.id}` : undefined}
  >
    {#each row as { item, i }, n (i)}
      {@const c = cards[n]}
      <div class="figure-slot">
        {#if c?.figureTitle || c?.blindTitle}
          <h3 class="figure-title">
            <!-- One box for both titles, sized for the longer word. -->
            <span class="title-box">
              <span class="title-sizer" aria-hidden="true">{longerOf(c)}</span>
              <span class="title-live">
                <Crossfade key={titleOf(c)} duration={DURATION.normal}>
                  {titleOf(c)}
                </Crossfade>
              </span>
            </span>
          </h3>
        {/if}
        {@render card(item, extrasFor(n))}
        {#if choice}
          <div class="answer-slot">
            <GuideFigureButton
              size="answer"
              label={c?.blindTitle ?? ""}
              tone={toneOf(n)}
              disabled={!isChoiceEnabled(state, n)}
              waiting
              onclick={() => choose(n)}
            />
          </div>
        {/if}
      </div>
    {/each}
  </div>
</div>

<style>
  .card-row-band {
    display: flex;
    flex-direction: column;
    align-items: center;
    /* Air between the question and the cards it asks about. */
    gap: clamp(0.6rem, 2.2vh, 1.4rem);
  }
  .card-row-band.beside {
    flex-direction: row;
    justify-content: center;
    align-items: center;
    gap: clamp(1rem, 4cqw, 3rem);
  }
  .card-row-band.beside {
    --choice-room: calc(20rem + clamp(1rem, 4cqw, 3rem));
  }
  .card-row-band.beside :global(.figure-choice) {
    flex: 0 1 20rem;
  }
  .card-row-band:not(.beside) :global(.figure-choice) {
    width: 100%;
    max-width: 34rem;
  }
  .figure-row {
    --pair-gap: clamp(1rem, 6cqw, 4rem);
    display: flex;
    justify-content: center;
    align-items: flex-end;
    gap: var(--pair-gap);
  }
  .figure-slot {
    --card-w: 100cqw;
    flex: none;
    width: min(
      calc(14rem * var(--fit, 1)),
      calc((100cqw - var(--pair-gap) - var(--choice-room, 0px)) / 2)
    );
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  /* FlowFrame's small heading (.flow-h3), which its scoped styles cannot
     reach inside this component. */
  .figure-title {
    font-family: "Cormorant Garamond", Georgia, serif;
    color: var(--ink, #1a1a1a);
    font-size: var(--font-size-xl, 1.25rem);
    font-weight: 650;
    line-height: 1.1;
    text-align: center;
    margin: 0 0 0.1rem;
  }
  .title-box {
    display: inline-grid;
  }
  .title-sizer,
  .title-live {
    grid-area: 1 / 1;
    text-align: center;
  }
  .title-sizer {
    visibility: hidden;
  }
  .answer-slot {
    display: flex;
    justify-content: center;
    margin-block-start: clamp(0.35rem, 1.2vh, 0.6rem);
  }
</style>
