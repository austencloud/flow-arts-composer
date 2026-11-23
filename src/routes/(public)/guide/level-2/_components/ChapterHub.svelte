<!--
  A Level 2 chapter's front page (/guide/level-2/turns, /double-turns) on
  one screen (2026-10-24 fit pass): the chapter's intro over one pressable
  box per topic. A phone keeps each box to the topic's name so the list
  fits; a wider window adds its opening line.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import Sentences from "../../_components/Sentences.svelte";
  import GuideScreens from "../../_components/fit/GuideScreens.svelte";
  import {
    watchScreenTier,
    type ScreenTier,
  } from "../../_components/fit/guide-screen-url";
  import { localHref } from "#lib/shared/i18n/localized-href.svelte.js";
  import { tDynamic } from "#lib/shared/i18n/i18n.svelte.js";
  import { localizedLevel2Topic } from "../_data/localize-level2-topic";
  import type { Level2TopicPage } from "../_data/level2-topic-routes";
  import HubPictograph from "../../_components/HubPictograph.svelte";
  import TwoHandStrip from "./TwoHandStrip.svelte";
  import { TOPIC_THUMBS } from "../_data/glyph-examples";
  import { TYPE1_A } from "../_data/type-strips";

  let {
    title,
    intro,
    listLabel,
    topics,
  }: {
    title: string;
    intro: string;
    listLabel: string;
    topics: readonly Level2TopicPage[];
  } = $props();

  let tier = $state<ScreenTier>("large");
  // The shortest phones have no height for the player stage: the intro shows
  // the strip's frames alone there.
  let short = $state(false);
  // The window's size decides how many rows one screen holds.
  let viewport = $state({ w: 1280, h: 800 });
  onMount(() => {
    const mq = window.matchMedia("(max-height: 640px)");
    short = mq.matches;
    mq.onchange = () => (short = mq.matches);
    const measure = () =>
      (viewport = { w: window.innerWidth, h: window.innerHeight });
    measure();
    window.addEventListener("resize", measure);
    const stop = watchScreenTier((v) => (tier = v));
    return () => {
      window.removeEventListener("resize", measure);
      stop();
    };
  });

  // A row is a picture at least 88px wide (the Guide front page's size) with
  // its label beside it, so a phone cannot hold the whole list: it runs over
  // as many screens as it needs, labelled "(2)", "(3)" like the front page.
  const ROW_PX = 116;
  const CHROME_PX = 205;
  const INTRO_PX = 90;
  const columns = $derived(
    Math.max(1, Math.floor((Math.min(viewport.w - 32, 1024) + 8) / 392))
  );
  const rowsPerScreen = $derived(
    Math.max(
      1,
      Math.floor(
        (viewport.h -
          CHROME_PX -
          (columns > 1 ? 60 : 0) -
          (tier === "large" ? INTRO_PX : 0)) /
          ROW_PX
      ) * columns
    )
  );
  const listScreens = $derived(Math.max(1, Math.ceil(topics.length / rowsPerScreen)));
  // Rows are shared out evenly (3, 2, 2), so no screen holds one stray row.
  const pages = $derived.by(() => {
    const base = Math.floor(topics.length / listScreens);
    const extra = topics.length % listScreens;
    let at = 0;
    return Array.from({ length: listScreens }, (_, i) => {
      const size = base + (i < extra ? 1 : 0);
      const rows = topics.slice(at, at + size);
      at += size;
      return rows;
    });
  });

  const first = $derived(topics[0]);
  // The intro screen's strip: A-One for 1-Turns, the same A with two turns on
  // the blue hand for 2-Turns.
  const twoTurns = $derived(first?.chapter === "double-turns");
  const strip = $derived(
    twoTurns
      ? { ...TYPE1_A, word: "A-Two", left: { ...TYPE1_A.left, turns: 2 } }
      : TYPE1_A
  );
  // Below a large window the intro gets its own screen and the topics the
  // next.
  const views = $derived(
    tier !== "large"
      ? [
          { label: tDynamic("guide_screen_intro"), intro: true, rows: [] as typeof topics },
          ...pages.map((rows, i) => ({
            label: i === 0 ? listLabel : `${listLabel} (${i + 1})`,
            intro: false,
            rows,
          })),
        ]
      : pages.map((rows, i) => ({
          label: i === 0 ? listLabel : `${listLabel} (${i + 1})`,
          intro: i === 0,
          rows,
        }))
  );
</script>

<main class="chapter-hub">
  <GuideScreens
    {title}
    kicker={tDynamic("guide_hub_level2_title")}
    labels={views.map((v) => v.label)}
    prevPage={{
      href: localHref("/guide/level-2"),
      title: tDynamic("guide_hub_level2_title"),
    }}
    nextPage={first
      ? {
          href: localHref(`/guide/level-2/${first.slug}`),
          title: localizedLevel2Topic(first, "h1"),
        }
      : null}
    hubHref={localHref("/guide")}
  >
    {#snippet screen(n)}
      {@const view = views[n]}
      <div class="hub-body" class:brief={tier === "small"}>
        {#if view?.intro}
          <p class="intro"><Sentences text={intro} /></p>
          {#if tier !== "large"}
            <div class="intro-strip">
            <TwoHandStrip
              id={`hub-${strip.word}`}
              word={strip.word}
              caption=""
              stripOnly={short}
              left={strip.left}
              right={strip.right}
            />
            </div>
          {/if}
        {/if}
        {#if view && view.rows.length > 0}
        <nav class="topic-list" aria-label={listLabel}>
          <ol>
            {#each view.rows as topic (topic.slug)}
              <li>
                <a href={localHref(`/guide/level-2/${topic.slug}`)}>
                  <span class="thumb" aria-hidden="true">
                    <HubPictograph pictographData={TOPIC_THUMBS[topic.slug]} />
                  </span>
                  <span class="copy">
                    <strong>{localizedLevel2Topic(topic, "h1")}</strong>
                    <span class="desc"
                      >{localizedLevel2Topic(topic, "description")}</span
                    >
                  </span>
                  <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
                </a>
              </li>
            {/each}
          </ol>
        </nav>
        {/if}
      </div>
    {/snippet}
  </GuideScreens>
</main>

<style>
  .chapter-hub {
    --ink: #ececf2;
    --ink-dim: #a8a8b4;
    color: var(--ink);
  }
  :global(.guide-content > .chapter-hub) {
    grid-column: full;
  }
  .hub-body {
    max-width: 64rem;
    margin: 0 auto;
  }
  .intro {
    max-width: 44rem;
    text-align: center;
    margin: 0 auto 1.25rem;
    text-wrap: balance;
  }
  .topic-list ol {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 24rem), 1fr));
    gap: 0.5rem;
  }
  .topic-list a {
    height: 100%;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: 1rem;
    min-height: 44px;
    padding: 0.55rem 1rem;
    background: oklch(0.18 0.02 270 / 0.6);
    border: 1px solid oklch(0.45 0.04 270 / 0.35);
    border-radius: 10px;
    text-decoration: none;
    color: inherit;
    transition:
      border-color var(--duration-fast) var(--ease-standard),
      background-color var(--duration-fast) var(--ease-standard);
  }
  .topic-list a:hover,
  .topic-list a:focus-visible {
    border-color: #4ea7e8;
    background: oklch(0.22 0.03 270 / 0.7);
  }
  .intro-strip :global(.showcase-wrap) {
    margin: 0.4rem 0 0;
    padding: 0;
  }
  .thumb {
    flex: none;
    width: 5.5rem;
    height: 5.5rem;
    border-radius: 10px;
    overflow: hidden;
    background: oklch(0.12 0.02 270 / 0.7);
  }
  .copy {
    flex: 1 1 auto;
    min-width: 0;
  }
  .topic-list strong {
    display: block;
    color: oklch(0.9 0.02 270);
  }
  .desc {
    display: block;
    font-size: 0.9rem;
    line-height: 1.35;
    color: oklch(0.68 0.02 270);
    margin-top: 0.15rem;
  }
  .brief .desc {
    display: none;
  }
  .brief .topic-list ol {
    gap: 0.45rem;
  }
  .brief .topic-list a {
    padding-block: 0.5rem;
  }
  .topic-list i {
    color: oklch(0.68 0.02 270);
  }
</style>
