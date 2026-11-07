<!--
  The Codex pages in the reader (2026-10-24 fit pass). Paper keeps the two
  printed Codex sheets (/print, /book); online the Codex is its own page, so
  the reader shows one screen that points there instead of a letter-sized
  sheet that overflowed every window.
-->
<script lang="ts">
  import { localHref } from "#lib/shared/i18n/localized-href.svelte.js";
  import { tDynamic } from "#lib/shared/i18n/i18n.svelte.js";
  import LinkChip from "#lib/shared/ui/components/LinkChip.svelte";
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
      <LinkChip href={localHref("/codex")}>Open the Codex</LinkChip>
    </div>
  {/snippet}
</TopicScreens>

<style>
  /* A sentence and a link: type roles at every window, centred in the frame.
     The sentence wraps only when the window runs out of width. */
  .codex-pointer {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.5rem;
    text-align: center;
  }
  .lede {
    margin: 0;
    font-size: var(--font-size-lg, 1.125rem);
    line-height: 1.5;
    text-wrap: balance;
  }
</style>
