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
  import { localizedLevel2Topic } from "../_data/localize-level2-topic";
  import type { Level2TopicPage } from "../_data/level2-topic-routes";

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
  onMount(() => watchScreenTier((v) => (tier = v)));

  const first = $derived(topics[0]);
  // Below a large window the intro gets its own screen and the topics the
  // next.
  const views = $derived(
    tier !== "large"
      ? [
          { label: "Intro", intro: true, list: false },
          { label: listLabel, intro: false, list: true },
        ]
      : [{ label: listLabel, intro: true, list: true }]
  );
</script>

<main class="chapter-hub">
  <GuideScreens
    {title}
    kicker="Level 2"
    labels={views.map((v) => v.label)}
    prevPage={{
      href: localHref("/guide/level-2"),
      title: "Level 2",
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
        {/if}
        {#if view?.list}
        <nav class="topic-list" aria-label={listLabel}>
          <ol>
            {#each topics as topic (topic.slug)}
              <li>
                <a href={localHref(`/guide/level-2/${topic.slug}`)}>
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
