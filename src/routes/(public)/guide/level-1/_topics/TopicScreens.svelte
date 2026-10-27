<!--
  The one-screen frame every Guide topic page shares (2026-10-24 fit pass):
  GuideScreens with the page's title and kicker, the lesson link above the
  first screen, and Back, Next and All guides from the host. Each topic page
  says how its teaching splits into screens; the page never scrolls.
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import LinkChip from "#lib/shared/ui/components/LinkChip.svelte";
  import GuideScreens from "../../_components/fit/GuideScreens.svelte";
  import type { TopicFrame } from "./topic-pages";

  let {
    title,
    kicker,
    lessonHref,
    frame,
    labels,
    screen,
  }: {
    title: string;
    kicker?: string;
    lessonHref: string | null;
    frame?: TopicFrame;
    labels: string[];
    screen: Snippet<[number]>;
  } = $props();
</script>

<div class="topic-screens">
  <GuideScreens
    {title}
    {kicker}
    {labels}
    prevPage={frame?.prevPage ?? null}
    nextPage={frame?.nextPage ?? null}
    hubHref={frame?.hubHref ?? "/guide"}
    lead={lessonHref ? lessonLink : undefined}
    {screen}
  />
</div>

{#snippet lessonLink()}
  <span class="lesson-link">
    <LinkChip href={lessonHref ?? ""}
      ><i class="fa-solid fa-graduation-cap" aria-hidden="true"></i>
      Learn this interactively</LinkChip
    >
  </span>
{/snippet}

<style>
  .topic-screens {
    font-family: Inter, system-ui, sans-serif;
    color: var(--ink, #1a1a1a);
  }
  /* The guide's global .guide-content type rules (centered title, fixed
     dark-theme colors) would otherwise reach into the page. These keep it
     on the host's --ink palette in both themes; :where keeps them below
     each page's own class rules. */
  .topic-screens :global(:where(p, li, ul)) {
    color: var(--ink, #1a1a1a);
    font-weight: 400;
  }
  .topic-screens :global(strong) {
    color: inherit;
    font-weight: 700;
  }
  /* LinkChip reads the app's theme variables; point them at this page's
     palette. */
  .lesson-link {
    --theme-text: var(--ink, #1a1a1a);
    --theme-accent: #647ff1;
  }
</style>
