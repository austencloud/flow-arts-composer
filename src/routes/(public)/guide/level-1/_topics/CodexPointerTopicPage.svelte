<!--
  The Codex pages in the reader (2026-10-24 fit pass). Paper keeps the two
  printed Codex sheets (/print, /book); online the Codex is its own page, so
  the reader shows one screen that points there instead of a letter-sized
  sheet that overflowed every window.
-->
<script lang="ts">
  import { localHref } from "#lib/shared/i18n/localized-href.svelte.js";
  import { tDynamic } from "#lib/shared/i18n/i18n.svelte.js";
  import TopicScreens from "./TopicScreens.svelte";
  import type { TopicPageProps } from "./topic-pages";

  let { kicker, lessonHref, frame, title }: TopicPageProps = $props();
</script>

<TopicScreens
  title={title ?? "Codex"}
  {kicker}
  {lessonHref}
  {frame}
  labels={["Codex"]}
>
  {#snippet screen()}
    <div class="codex-pointer">
      <p class="lede">{tDynamic("guide_codex_intro")}</p>
      <a class="open" href={localHref("/codex")}>
        Open the Codex
        <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
      </a>
    </div>
  {/snippet}
</TopicScreens>

<style>
  .codex-pointer {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: calc(1.5rem * var(--fit, 1));
    text-align: center;
  }
  .lede {
    max-width: calc(32rem * var(--fit, 1));
    margin: 0;
    font-size: calc(1.15rem * var(--fit, 1));
    line-height: 1.5;
    text-wrap: balance;
  }
  .open {
    display: inline-flex;
    align-items: center;
    gap: 0.6rem;
    padding: calc(0.8rem * var(--fit, 1)) calc(1.4rem * var(--fit, 1));
    border: 1.5px solid color-mix(in oklab, var(--ink, #1a1a1a) 30%, transparent);
    border-radius: 999px;
    background: color-mix(in oklab, var(--ink, #1a1a1a) 8%, transparent);
    color: var(--ink, #1a1a1a);
    font-size: calc(1rem * var(--fit, 1));
    font-weight: 600;
    text-decoration: none;
    transition: background-color var(--duration-fast) var(--ease-standard);
  }
  .open:hover,
  .open:focus-visible {
    background: color-mix(in oklab, var(--ink, #1a1a1a) 16%, transparent);
  }
</style>
