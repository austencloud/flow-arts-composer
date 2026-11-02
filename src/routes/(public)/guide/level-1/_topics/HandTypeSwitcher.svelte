<!--
  The six hand combinations as one row of chips, the spine of the run of
  pages after Hand Motions (2026-10-31, direction A of the hand-motions frame
  mock-up). Each chip is a link to its combination's screen: its number, a
  small hands-only picture of the record's example, and its name in its
  letter-type colours. The combination on screen wears a full-colour border
  and a stronger wash, never a solid fill (2026-11-02, Austen: a filled chip
  put white and black in one name; the name in its colours is enough and
  leaves the colour to the page below); the rest wear a tinted border. The row sits under the kicker on all four
  pages at one size, and on a phone it pans sideways inside itself from
  chip 1, snapping to chip edges so no name is cut at its start, a soft fade
  at the side with more chips (2026-10-31, Austen's review: centring the
  current chip sliced its neighbours mid-word). It moves only as far as
  brings the current chip into view.

  A page whose screens are some of the chips (Dash, Dual-Dash and Static
  share one) switches to that screen in place when its chip is pressed,
  without leaving the page (2026-11-01).
-->
<script lang="ts">
  import { onMount } from "svelte";
  import PictographContainer from "#lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import { LETTER_TYPE_COLORS } from "#lib/shared/pictograph/shared/domain/constants/pictograph-constants.js";
  import {
    combinationPictographData,
    type HandCombinationId,
  } from "#lib/shared/guide-topics/hand-motions-topic.js";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { localHref } from "#lib/shared/i18n/localized-href.svelte.js";
  import { revealInRow } from "../../_components/fit/reveal-in-row";
  import CombinationName from "./CombinationName.svelte";
  import { inkOn, switcherEntries } from "./hand-type-switcher";

  let {
    current,
    darkMode,
    choose,
  }: {
    current: HandCombinationId | null;
    darkMode: boolean;
    /** Shows a chip's combination in place when it is on this page;
     *  returns false to let the chip open its page. */
    choose?: (id: HandCombinationId) => boolean;
  } = $props();

  function onChip(event: MouseEvent, id: HandCombinationId): void {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    if (choose?.(id)) event.preventDefault();
  }

  const entries = $derived(switcherEntries(localHref));
  const pictures = new Map(
    switcherEntries().map((e) => [
      e.combination.id,
      combinationPictographData(e.combination),
    ])
  );

  let row = $state<HTMLElement>();
  let moreLeft = $state(false);
  let moreRight = $state(false);

  function edges(): void {
    if (!row) return;
    const { scrollLeft, clientWidth, scrollWidth } = row;
    moreLeft = scrollLeft > 2;
    moreRight = scrollLeft + clientWidth < scrollWidth - 2;
  }

  // Pan the row only, and only as far as brings the current chip into
  // view; the page itself never scrolls.
  function showCurrent(): void {
    const chip = row?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!row || !chip) return;
    revealInRow(row, chip);
    edges();
  }

  onMount(() => {
    showCurrent();
    const observer = new ResizeObserver(edges);
    if (row) observer.observe(row);
    return () => observer.disconnect();
  });
  $effect(() => {
    void current;
    showCurrent();
  });
</script>

<nav
  class="hand-type-switcher"
  class:more-left={moreLeft}
  class:more-right={moreRight}
  class:light={!darkMode}
  aria-label={t("verified_level1_hand_motions_71")}
  bind:this={row}
  onscroll={edges}
>
  {#each entries as { combination, number, href } (combination.id)}
    {@const [first, second] = LETTER_TYPE_COLORS[combination.letterType]}
    {@const on = combination.id === current}
    <a
      class="chip"
      class:on
      {href}
      aria-current={on ? "page" : undefined}
      onclick={(event) => onChip(event, combination.id)}
      style:--c1={inkOn(first, darkMode)}
      style:--c2={inkOn(second, darkMode)}
    >
      <span class="n">{number}</span>
      <span class="picture" aria-hidden="true">
        <PictographContainer
          pictographData={pictures.get(combination.id) ?? null}
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
          transparentBackground
          {darkMode}
        />
      </span>
      <CombinationName {combination} {darkMode} />
    </a>
  {/each}
</nav>

<style>
  /* One row that centres when it fits and pans sideways inside itself when
     it does not, like the screen pills; the page never scrolls sideways. */
  .hand-type-switcher {
    display: flex;
    gap: 0.5rem;
    justify-content: safe center;
    width: 100%;
    max-width: 100%;
    min-width: 0;
    padding: 0.2rem 0.25rem 0.3rem;
    overflow-x: auto;
    overscroll-behavior-x: contain;
    scrollbar-width: none;
    box-sizing: border-box;
    scroll-snap-type: x proximity;
    scroll-padding-inline: 0.25rem;
  }
  .more-right {
    mask-image: linear-gradient(
      to right,
      #000 calc(100% - 2.5rem),
      transparent
    );
  }
  .more-left {
    mask-image: linear-gradient(to left, #000 calc(100% - 2.5rem), transparent);
  }
  .more-left.more-right {
    mask-image: linear-gradient(
      to right,
      transparent,
      #000 2.5rem,
      #000 calc(100% - 2.5rem),
      transparent
    );
  }
  /* On a phone the row starts at chip 1 rather than centring. */
  @media (max-width: 1023.98px) {
    .hand-type-switcher {
      justify-content: flex-start;
    }
  }
  .hand-type-switcher::-webkit-scrollbar {
    display: none;
  }
  .chip {
    --ink-plate: var(--guide-plate, #fbfaf7);
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    gap: 0.5em;
    min-height: 44px;
    padding: 0.3em 1em 0.3em 0.4em;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--c1) 55%, transparent);
    background: color-mix(in srgb, var(--c1) 10%, transparent);
    color: var(--ink, #1a1a1a);
    font-family: Inter, system-ui, sans-serif;
    font-size: 0.9rem;
    font-weight: 650;
    text-decoration: none;
    white-space: nowrap;
    scroll-snap-align: start;
    transition:
      background var(--duration-fast) var(--ease-standard),
      border-color var(--duration-fast) var(--ease-standard);
  }
  .chip:hover {
    background: color-mix(in srgb, var(--c1) 20%, transparent);
  }
  /* On the light page a faint wash reads as pastel and loses the colour
     code; the chips there wear a stronger one and a full border. */
  .light .chip:not(.on) {
    border-color: color-mix(in srgb, var(--c1) 80%, transparent);
    background: color-mix(in srgb, var(--c1) 18%, transparent);
  }
  .light .chip:not(.on):hover {
    background: color-mix(in srgb, var(--c1) 28%, transparent);
  }
  .chip:focus-visible {
    outline: 2px solid var(--c1);
    outline-offset: 2px;
  }
  /* The combination on screen: its colour as a full border, a ring just
     inside it and a stronger wash; the name keeps its own colours. */
  .chip.on {
    border-color: var(--c1);
    background: color-mix(in srgb, var(--c1) 22%, transparent);
    box-shadow: inset 0 0 0 1px var(--c1);
  }
  /* The light page's other chips already wear an 18% wash. */
  .light .chip.on {
    background: color-mix(in srgb, var(--c1) 34%, transparent);
  }
  .n {
    display: inline-grid;
    place-items: center;
    min-width: 1.6em;
    height: 1.6em;
    border-radius: 999px;
    background: color-mix(in srgb, var(--c1) 22%, transparent);
    font-size: 0.85em;
    font-variant-numeric: tabular-nums;
  }
  .on .n {
    background: var(--c1);
    color: var(--ink-plate);
  }
  /* The picture sits on a disc of the page's canvas, so its hands and
     arrows read on any wash. The disc appears with the drawing:
     until the pictograph has drawn, the chip shows only its own wash, never
     a blank dark disc. */
  .picture {
    width: 1.9rem;
    height: 1.9rem;
    flex: none;
    overflow: hidden;
    border-radius: 999px;
    background: transparent;
    transition: background var(--duration-fast) var(--ease-standard);
  }
  .picture:has(:global([data-pictograph-render-ready="true"])) {
    background: var(--ink-plate);
  }
  .picture :global(.pictograph-container) {
    width: 100%;
    height: 100%;
  }
</style>
