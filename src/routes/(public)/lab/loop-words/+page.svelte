<!--
  /lab/loop-words: LOOPs explained to a newcomer in ten screens, a draft for
  Austen to correct (dev only; +page.server.ts returns 404 elsewhere). Every
  word lives in copy.json and is editable in place through the dev edit bar.
  Every picture is the real animator or real pictographs, played from engine
  built LOOPs (_data/).
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { browser, dev } from "$app/env";
  import LazyMount from "#lib/shared/components/LazyMount.svelte";
  import { createPageCopy } from "#lib/shared/copy-edit/page-copy.svelte";
  import { Crossfade } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import {
    EXAMPLES,
    SHOWCASE_STEP,
    REFLECTION_AXES,
    TYPE_ORDER,
    oneStepSequence,
    type TypeKind,
  } from "./_data/loop-words-examples";
  import {
    buildShowcaseTwins,
    isTwinOf,
    reflectionLineOf,
    type ShowcaseTwins,
  } from "./_data/showcase-twins";
  import WhatScreen from "./_components/WhatScreen.svelte";
  import FiveScreen from "./_components/FiveScreen.svelte";
  import TypeScreen from "./_components/TypeScreen.svelte";
  import LinesScreen from "./_components/LinesScreen.svelte";
  import TimesScreen from "./_components/TimesScreen.svelte";
  import WordsScreen from "./_components/WordsScreen.svelte";
  import copyJson from "./copy.json";

  const copy = createPageCopy({
    file: "src/routes/(public)/lab/loop-words/copy.json",
    initial: copyJson,
  });

  type Screen =
    | { id: "what" }
    | { id: "five" }
    | { id: "type"; kind: TypeKind }
    | { id: "lines" }
    | { id: "times" }
    | { id: "words" };

  const SCREENS: Screen[] = [
    { id: "what" },
    { id: "five" },
    // The four reflection lines follow the Reflected screen.
    ...TYPE_ORDER.flatMap((kind): Screen[] =>
      kind === "reflected"
        ? [{ id: "type", kind }, { id: "lines" }]
        : [{ id: "type", kind }]
    ),
    { id: "times" },
    { id: "words" },
  ];

  let index = $state(0);
  let direction = $state<1 | -1>(1);
  const screen = $derived(SCREENS[index]!);

  function go(to: number): void {
    const next = Math.max(0, Math.min(SCREENS.length - 1, to));
    if (next === index) return;
    direction = next > index ? 1 : -1;
    index = next;
  }

  // One clock for the page. Each screen counts from when it appeared, so a
  // screen always opens on its first step.
  let now = $state(0);
  let shownAt = $state(0);
  $effect(() => {
    void index;
    shownAt = performance.now();
  });
  const elapsed = $derived(Math.max(0, now - shownAt));

  let still = $state(false);

  // Dev only: the copy edit bar floats over the bottom of the window, so the
  // page keeps that much room clear under the pager while the bar is there.
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

  // Screen 2's step, its five twins and its four reflections (Create's own
  // transforms), checked against the engine's pair algebra.
  const base: SequenceData = oneStepSequence(SHOWCASE_STEP, "loop-words-step");
  let showcase = $state<ShowcaseTwins | null>(null);
  const twins = $derived<Record<TypeKind, SequenceData> | null>(
    showcase?.types ?? null
  );
  let twinsChecked = $state<"pending" | "ok" | "wrong">("pending");

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
      now = t;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    void buildShowcaseTwins(base).then((built) => {
      const step = base.steps[0]!;
      const wrong: string[] = TYPE_ORDER.filter(
        (kind) => !isTwinOf(kind, step, built.types[kind].steps[0]!)
      );
      for (const axis of REFLECTION_AXES) {
        const twin = built.lines[axis]?.steps[0];
        if (!twin || reflectionLineOf(step, twin) !== axis) wrong.push(axis);
      }
      if (wrong.length) {
        console.warn("loop-words: these twins are not their change", wrong);
      }
      twinsChecked = wrong.length ? "wrong" : "ok";
      showcase = built;
    });

    return () => {
      cancelAnimationFrame(frame);
      query.removeEventListener("change", readStill);
    };
  });

  // Swipe: a mostly sideways drag of 40px or more turns the page.
  let downAt: { x: number; y: number } | null = null;
  function onPointerDown(event: PointerEvent): void {
    downAt = { x: event.clientX, y: event.clientY };
  }
  function onPointerUp(event: PointerEvent): void {
    if (!downAt) return;
    const dx = event.clientX - downAt.x;
    const dy = event.clientY - downAt.y;
    downAt = null;
    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
    go(index + (dx < 0 ? 1 : -1));
  }
  function onKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    if (target?.isContentEditable || target?.closest?.("input, textarea")) return;
    if (event.key === "ArrowRight") go(index + 1);
    if (event.key === "ArrowLeft") go(index - 1);
  }
</script>

<svelte:head>
  <title>{copy.text["page-title"]}</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<svelte:window onkeydown={onKeydown} />

<main
  class="loop-words"
  data-twins={twinsChecked}
  data-screen={index + 1}
  style:--bar-space={`${barSpace}px`}
>
  <div
    class="stage"
    role="presentation"
    onpointerdown={onPointerDown}
    onpointerup={onPointerUp}
    onpointercancel={() => (downAt = null)}
  >
    <Crossfade
      key={index}
      fill
      mode="swap"
      motion="step"
      {direction}
      duration={still ? 0 : DURATION.normal}
      label={`${index + 1} / ${SCREENS.length}`}
    >
      <div class="screen-box">
        {#if browser}
          {#if screen.id === "what"}
            <WhatScreen {copy} example={EXAMPLES.rotated} {elapsed} {still} />
          {:else if screen.id === "five"}
            <FiveScreen {copy} {base} {twins} {elapsed} {still} />
          {:else if screen.id === "type"}
            <TypeScreen
              {copy}
              kind={screen.kind}
              example={EXAMPLES[screen.kind]}
              {elapsed}
              {still}
            />
          {:else if screen.id === "lines"}
            <LinesScreen
              {copy}
              lines={showcase?.lines ?? null}
              {elapsed}
              {still}
            />
          {:else if screen.id === "times"}
            <TimesScreen {copy} example={EXAMPLES.quartered} {elapsed} {still} />
          {:else}
            <WordsScreen {copy} {twins} {elapsed} {still} />
          {/if}
        {/if}
      </div>
    </Crossfade>
  </div>

  <nav class="pager">
    <button
      type="button"
      class="turn"
      aria-label={copy.text["pager-previous"]}
      disabled={index === 0}
      onclick={() => go(index - 1)}
    >
      <i class="fas fa-chevron-left" aria-hidden="true"></i>
    </button>
    <p class="mark" aria-live="polite">{index + 1} / {SCREENS.length}</p>
    <button
      type="button"
      class="turn"
      aria-label={copy.text["pager-next"]}
      disabled={index === SCREENS.length - 1}
      onclick={() => go(index + 1)}
    >
      <i class="fas fa-chevron-right" aria-hidden="true"></i>
    </button>
  </nav>
</main>

{#if dev}
  <LazyMount
    loader={() => import("#lib/shared/copy-edit/CopyEditBar.svelte")}
    active={dev}
    debugName="copy edit bar"
  />
{/if}

<style>
  /* The page never scrolls: it is exactly the window, and each screen fits
     the space between the top and the pager. */
  :global(html:has(.loop-words)),
  :global(body:has(.loop-words)) {
    overflow: hidden;
  }

  .loop-words {
    position: fixed;
    inset: 0;
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto;
    max-width: 40rem;
    margin-inline: auto;
    padding: max(1rem, env(safe-area-inset-top)) 1rem
      calc(max(0.5rem, env(safe-area-inset-bottom)) + var(--bar-space, 0px));
    background: var(--gradient-cosmic, #0d1020);
    color: var(--theme-text, #fff);
    overflow: hidden;
  }

  .stage {
    position: relative;
    min-height: 0;
    touch-action: none;
    user-select: none;
  }

  .screen-box {
    height: 100%;
  }

  .pager {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: 0.5rem;
  }

  .turn {
    width: var(--alt-touch-target, 36px);
    height: var(--alt-touch-target, 36px);
    display: grid;
    place-items: center;
    border: 1px solid var(--theme-stroke, rgb(255 255 255 / 0.18));
    border-radius: 999px;
    background: var(--theme-card-bg, rgb(255 255 255 / 0.06));
    color: inherit;
    font-size: var(--font-size-sm);
    cursor: pointer;
    transition: opacity var(--duration-fast) var(--ease-standard);
  }

  .turn:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .turn:focus-visible {
    outline: 2px solid var(--theme-accent, #7aa2ff);
    outline-offset: 2px;
  }

  .mark {
    margin: 0;
    font-size: var(--font-size-sm);
    font-variant-numeric: tabular-nums;
    color: var(--theme-text-dim, rgb(255 255 255 / 0.72));
  }

  @media (prefers-reduced-motion: reduce) {
    .turn {
      transition: none;
    }
  }
</style>
