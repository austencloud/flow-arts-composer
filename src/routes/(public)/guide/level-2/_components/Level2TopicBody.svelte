<script lang="ts">
  /**
   * The part of a Level-2 topic route that needs a hard remount on every
   * slug change: `setGuideData` (guide-data-context) is called once at
   * component init, and its value (turns.json vs double-turns.json) depends
   * on which chapter the topic belongs to. SvelteKit reuses the [slug]
   * +page.svelte instance across client-side navigations between sibling
   * slugs of the same dynamic route (no automatic remount), so a plain
   * top-level `setGuideData` call in +page.svelte would go stale the first
   * time a reader crosses from a "turns" topic to a "double-turns" one.
   * The parent wraps `<Level2TopicBody {meta} ...>` in `{#key meta.slug}`,
   * which destroys and recreates this component (and reruns this script,
   * and its setGuideData call) on every topic change — cheap, since these
   * are static content pages anyway.
   */
  import GuideCompanionHost from "../../_components/GuideCompanionHost.svelte";
  import { setGuideData } from "../../level-1/_data/guide-data-context";
  import type { GuideChapterData } from "../../level-1/_data/guide-types";
  import turnsData from "../_data/turns.json";
  import doubleTurnsData from "../_data/double-turns.json";
  import type { Level2TopicPage } from "../_data/level2-topic-manifest";

  let {
    meta,
    prev,
    next,
  }: {
    meta: Level2TopicPage;
    prev: Level2TopicPage | null;
    next: Level2TopicPage | null;
  } = $props();

  setGuideData(
    (meta.chapter === "double-turns" ? doubleTurnsData : turnsData) as unknown as GuideChapterData
  );
</script>

<GuideCompanionHost pageTitle={meta.h1} levelLabel="Level 2">
  <h1>{meta.h1}</h1>

  {#each meta.sections as Section (Section)}
    <Section />
  {/each}

  <nav class="topic-nav" aria-label="Level 2 guide navigation">
    {#if prev}
      <a class="nav-link prev" href="/guide/level-2/{prev.slug}">
        <span class="nav-dir">Previous</span><span class="nav-title">{prev.h1}</span>
      </a>
    {:else}
      <span class="nav-spacer"></span>
    {/if}
    <a class="nav-link hub" href="/guide/level-2/{meta.chapter}">Chapter overview</a>
    {#if next}
      <a class="nav-link next" href="/guide/level-2/{next.slug}">
        <span class="nav-dir">Next</span><span class="nav-title">{next.h1}</span>
      </a>
    {:else}
      <span class="nav-spacer"></span>
    {/if}
  </nav>
</GuideCompanionHost>

<style>
  /* Ink contract for this dark host — same rationale as turns/+page.svelte
     and double-turns/+page.svelte (P2, guide-shell parity spec): TurnStrip
     and SequenceShowcase read --ink/--ink-dim/--glyph-invert off the ambient
     .guide-content grid rather than falling back to hardcoded guesses. No
     light-mode branch: .guide-layout paints an unconditional dark background
     (guide.css:72-79). */
  :global(.guide-content) {
    --ink: #ececf2;
    --ink-dim: #a8a8b4;
    --glyph-invert: 1;
  }

  .topic-nav {
    max-width: 44rem;
    margin: 2rem auto 0;
    padding: 1.5rem 0 2rem;
    display: flex;
    align-items: stretch;
    justify-content: space-between;
    gap: 0.75rem;
    border-top: 1px solid oklch(0.4 0.03 270 / 0.35);
  }
  .nav-link {
    display: flex;
    flex-direction: column;
    justify-content: center;
    min-height: 44px;
    padding: 0.6rem 1.1rem;
    border-radius: 12px;
    border: 1px solid oklch(0.45 0.04 270 / 0.4);
    color: oklch(0.85 0.02 270);
    text-decoration: none;
    flex: 1 1 0;
    transition: background 120ms ease;
  }
  .nav-link:hover {
    background: oklch(0.24 0.03 270 / 0.5);
  }
  .nav-link.next {
    text-align: right;
  }
  .nav-link.hub {
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    font-weight: 650;
    background: #e8590c;
    color: #fff;
    border-color: transparent;
  }
  .nav-link.hub:hover {
    background: #d24e08;
  }
  .nav-dir {
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: oklch(0.6 0.02 270);
  }
  .nav-title {
    font-size: 0.98rem;
    font-weight: 600;
  }
  .nav-spacer {
    flex: 1 1 0;
  }

  @media (max-width: 44rem) {
    .topic-nav {
      flex-wrap: wrap;
    }
  }
</style>
