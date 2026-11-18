<!--
  /lab/loop-words: what a LOOP is, on one screen, for a newcomer (dev only;
  +page.server.ts returns 404 elsewhere). A sentence, the step beside the same
  step under one LOOP type, the five types with a line each, and a small line.
  It tours the five types by itself; a tap on a row stays on that type.

  Exactly two players are ever mounted. The right one keeps its canvas and
  changes sequence only at the start of a play, while both rest on the start
  pose; its props glide to the new pose (the player's pose glide, via a fixed
  transitionKey). Every word lives in copy.json and is editable in place
  through the dev edit bar.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { browser, dev } from "$app/env";
  import LazyMount from "#lib/shared/components/LazyMount.svelte";
  import CopyText from "#lib/shared/copy-edit/CopyText.svelte";
  import { createPageCopy } from "#lib/shared/copy-edit/page-copy.svelte";
  import { Crossfade } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import { TYPE_ORDER, type TypeKind } from "./_data/loop-kinds";
  import { SHOWCASE_STEP, oneStepSequence } from "./_data/showcase-step";
  import {
    buildShowcaseTwins,
    isQuarterTurnOf,
    wrongTwins,
    type ShowcaseTwins,
  } from "./_data/showcase-twins";
  import { lineOf, passesOf, tourPasses, type Pass } from "./_data/tour";
  import { playAt, stepAt } from "./_components/clock";
  import Player from "./_components/Player.svelte";
  import TypeRow from "./_components/TypeRow.svelte";
  import copyJson from "./copy.json";

  const copy = createPageCopy({
    file: "src/routes/(public)/lab/loop-words/copy.json",
    initial: copyJson,
  });

  const base: SequenceData = oneStepSequence(SHOWCASE_STEP, "loop-words-step");
  let showcase = $state.raw<ShowcaseTwins | null>(null);
  let hasQuarter = $state(false);
  let twinsChecked = $state<"pending" | "ok" | "wrong">("pending");
  let still = $state(false);

  // One clock. `origin` is when the current run of plays began: page open,
  // then each tap that picks a type.
  let now = $state(0);
  let origin = $state(0);
  /** The type a tap picked; null while the page tours by itself. */
  let pinned = $state<TypeKind | null>(null);
  /** A tap during a move waits for the move to finish. */
  let pending: TypeKind | null = null;

  const at = $derived(playAt(now - origin, still));
  const passes = $derived(
    pinned ? passesOf(pinned, hasQuarter) : tourPasses(hasQuarter)
  );
  const pass = $derived(passes[at.index % passes.length]!);
  const step = $derived(stepAt(0, at.frac));
  const line = $derived(lineOf(pass.twin));

  function twinFor(built: ShowcaseTwins, p: Pass): SequenceData {
    if (p.twin === "quarter-turn") return built.quarter;
    const reflection = lineOf(p.twin);
    if (reflection) return built.lines[reflection];
    return built.types[p.kind];
  }
  const twin = $derived(showcase ? twinFor(showcase, pass) : null);

  function pick(kind: TypeKind): void {
    if (kind === pinned && pending === null) return;
    pending = kind;
    if (!playAt(performance.now() - origin, still).moving) applyPending(performance.now());
  }

  function applyPending(t: number): void {
    if (!pending) return;
    pinned = pending;
    pending = null;
    origin = t;
    now = t;
  }

  // Dev only: the copy edit bar floats over the bottom of the window, so the
  // page keeps that much room clear while the bar is there.
  let barSpace = $state(0);
  $effect(() => {
    if (!dev) return;
    let observer: ResizeObserver | null = null;
    const find = setInterval(() => {
      const bar = document.querySelector<HTMLElement>(".copy-edit-bar");
      if (!bar) return;
      clearInterval(find);
      observer = new ResizeObserver(() => {
        barSpace = bar.getBoundingClientRect().height + 16;
      });
      observer.observe(bar);
    }, 300);
    return () => {
      clearInterval(find);
      observer?.disconnect();
    };
  });

  onMount(() => {
    const query = matchMedia("(prefers-reduced-motion: reduce)");
    const readStill = () => {
      still =
        query.matches ||
        document.documentElement.dataset.motionPreference === "reduce";
    };
    readStill();
    query.addEventListener("change", readStill);

    let frame = 0;
    const tick = (t: number) => {
      if (pending && !playAt(t - origin, still).moving) applyPending(t);
      now = t;
      frame = requestAnimationFrame(tick);
    };
    origin = performance.now();
    frame = requestAnimationFrame(tick);

    void buildShowcaseTwins(base).then((built) => {
      const stepData = base.steps[0]!;
      const wrong = wrongTwins(stepData, built);
      if (wrong.length) {
        console.warn("loop-words: these twins are not their change", wrong);
      }
      twinsChecked = wrong.length ? "wrong" : "ok";
      hasQuarter = isQuarterTurnOf(stepData, built.quarter.steps[0]!);
      showcase = built;
      // The tour opens on its first type, from the start pose.
      if (!pinned) {
        origin = performance.now();
        now = origin;
      }
    });

    return () => {
      cancelAnimationFrame(frame);
      query.removeEventListener("change", readStill);
    };
  });
</script>

<svelte:head>
  <title>{copy.text["page-title"]}</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

{#snippet stepCaption()}<CopyText {copy} key="pair-step" />{/snippet}

{#snippet twinCaption()}
  <!-- Every name sits in the same cell, hidden, so the caption is always as
       wide as the longest one and nothing moves when it changes. -->
  <span class="caption-slot">
    {#each TYPE_ORDER as kind (kind)}
      <span class="caption-ghost" aria-hidden="true">{copy.text[`name-${kind}`]}</span>
    {/each}
    <span class="caption-live">
      <Crossfade key={pass.kind} duration={DURATION.normal} mode="crossfade">
        <CopyText {copy} key={`name-${pass.kind}`} />
      </Crossfade>
    </span>
  </span>
{/snippet}

<main
  class="loop-words"
  data-twins={twinsChecked}
  data-active={pass.kind}
  data-twin={pass.twin}
  style:--bar-space={`${barSpace}px`}
>
  <div class="band">
    <h1 class="title"><CopyText {copy} key="what-title" /></h1>
    <p class="sentence"><CopyText {copy} key="what-line" /></p>

    <div class="pair-box">
      <div class="pair">
        {#if browser}
          <Player
            sequence={base}
            {step}
            moving={at.moving}
            {line}
            label={copy.text["pair-step"] ?? ""}
            caption={stepCaption}
          />
          <Player
            sequence={twin}
            {step}
            moving={at.moving}
            {line}
            transitionKey="loop-words-twin"
            label={copy.text[`name-${pass.kind}`] ?? pass.kind}
            caption={twinCaption}
          />
        {/if}
      </div>
    </div>

    <div class="rows">
      {#each TYPE_ORDER as kind (kind)}
        <TypeRow {copy} {kind} active={pass.kind === kind} onpick={pick} />
      {/each}
    </div>

    <p class="small"><CopyText {copy} key="what-small" /></p>
  </div>
</main>

{#if dev}
  <LazyMount
    loader={() => import("#lib/shared/copy-edit/CopyEditBar.svelte")}
    active={dev}
    debugName="copy edit bar"
  />
{/if}

<style>
  /* The page never scrolls: it is exactly the window. The pair takes every
     pixel the words do not need. */
  :global(html:has(.loop-words)),
  :global(body:has(.loop-words)) {
    overflow: hidden;
  }

  .loop-words {
    container: loop-words / size;
    position: fixed;
    inset: 0;
    display: grid;
    padding: max(1rem, var(--safe-top)) 1rem
      calc(max(1rem, env(safe-area-inset-bottom)) + var(--bar-space, 0px));
    background: var(--gradient-cosmic, #0d1020);
    color: var(--theme-text, #fff);
    overflow: hidden;
  }

  /* Upright: the words above and below the pair, one column. The pair grows
     to the two largest squares the width allows (--pair-max) and no further;
     height left over goes to the rows, so no hole opens around the pair. */
  .band {
    --pair-max: calc(
      (min(100cqw, var(--shell-w, 100cqw)) - 0.75rem) / 2 + 1.5rem
    );
    --side-cap: max(30rem, 40cqh);
    justify-self: center;
    width: min(100%, var(--shell-w, 100%));
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows:
      auto auto minmax(0, var(--pair-max)) minmax(min-content, 1fr)
      auto;
    grid-template-areas: "title" "sentence" "pair" "rows" "small";
    row-gap: 0.5rem;
  }

  /* Sideways phones and wide windows: the pair on the left, the words beside
     it, the two centred as one group. A nearly square window (the Fold
     unfolded with the edit bar up) stays upright, where the pair is larger.
     On a large monitor each square stops at --side-cap, so the words are not
     left as a footnote beside two giant pictures. */
  @container loop-words (min-aspect-ratio: 4 / 3) {
    .band {
      grid-template-columns:
        minmax(0, calc(2 * var(--side-cap) + 0.75rem))
        minmax(0, 27.5rem);
      justify-content: center;
      grid-template-rows: minmax(0, 1fr) auto auto auto auto minmax(0, 1fr);
      grid-template-areas:
        "pair ."
        "pair title"
        "pair sentence"
        "pair rows"
        "pair small"
        "pair .";
      column-gap: 1.5rem;
    }
  }

  .title {
    grid-area: title;
    margin: 0;
    font-size: var(--font-size-xl);
    font-weight: 700;
    line-height: 1.2;
  }

  .sentence {
    grid-area: sentence;
    margin: 0;
    font-size: var(--font-size-base);
    line-height: 1.35;
  }

  .pair-box {
    grid-area: pair;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    container-type: size;
  }

  /* Two squares side by side, as large as the box allows. A caption takes
     about 1.5rem under each. */
  .pair {
    --pair-gap: 0.75rem;
    --side: max(
      0px,
      min(
        calc((100cqw - var(--pair-gap)) / 2),
        calc(100cqh - 1.5rem)
      )
    );
    display: grid;
    grid-template-columns: repeat(2, var(--side));
    gap: var(--pair-gap);
  }

  .caption-slot {
    display: inline-grid;
  }

  .caption-ghost,
  .caption-live {
    grid-area: 1 / 1;
  }

  .caption-ghost {
    visibility: hidden;
  }

  .rows {
    grid-area: rows;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    column-gap: 0.75rem;
    row-gap: 0.125rem;
  }

  .small {
    grid-area: small;
    margin: 0;
    font-size: var(--font-size-sm);
    line-height: 1.3;
    color: var(--theme-text-dim, rgb(255 255 255 / 0.72));
  }
</style>
