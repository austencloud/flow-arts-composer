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
  import { onMount, tick } from "svelte";
  import { localHref } from "#lib/shared/i18n/localized-href.svelte.js";
  import { mutateCurrentUrl } from "#lib/shared/navigation/services/url-state.js";
  import GuideCompanionHost from "../../_components/GuideCompanionHost.svelte";
  import GuideScreens from "../../_components/fit/GuideScreens.svelte";
  import {
    SCREEN_PARAM,
    watchScreenTier,
    type ScreenTier,
  } from "../../_components/fit/guide-screen-url";
  import { setGuideData } from "../../level-1/_data/guide-data-context";
  import type { GuideChapterData } from "../../level-1/_data/guide-types";
  import turnsData from "../_data/turns.json";
  import doubleTurnsData from "../_data/double-turns.json";
  import { localizedLevel2Topic } from "../_data/localize-level2-topic";
  import type { Level2TopicPage } from "../_data/level2-topic-routes";
  import { LEVEL2_TOPIC_SECTIONS } from "../_data/level2-topic-sections";
  import {
    readSectionUnits,
    showOnlyUnits,
    splitSections,
    SPLIT_RULES,
    type SectionUnit,
  } from "../_data/section-screens";
  import { t, tDynamic } from "#lib/shared/i18n/i18n.svelte.js";

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
    (meta.chapter === "double-turns"
      ? doubleTurnsData
      : turnsData) as unknown as GuideChapterData
  );

  const sections = $derived(LEVEL2_TOPIC_SECTIONS[meta.slug] ?? []);
  const kicker = $derived(
    `Level 2 · ${tDynamic(
      meta.chapter === "double-turns"
        ? "guide_level2_chapter2_title"
        : "guide_level2_chapter1_title"
    )}`
  );

  // One screen at a time (2026-10-24 fit pass). Before the page is live,
  // each section is one screen, so the prerendered page keeps every word.
  // Once live, the page reads its sections' blocks from a hidden copy and
  // splits them for the window (section-screens.ts).
  let tier = $state<ScreenTier>("large");
  let units = $state<SectionUnit[] | null>(null);
  let titles = $state<string[]>([]);
  let censusEl = $state<HTMLDivElement>();
  let censusing = $state(false);
  const screens = $derived(
    units ? splitSections(units, titles, SPLIT_RULES[tier]) : null
  );
  const labels = $derived(
    screens
      ? screens.map((s) => s.label)
      : sections.map((_, n) => `${n + 1}`)
  );

  onMount(() => {
    const stop = watchScreenTier((v) => (tier = v));
    censusing = true;
    void tick().then(() => {
      const found = Array.from(
        censusEl?.querySelectorAll(":scope > .guide-section") ?? []
      );
      titles = found.map((el) => el.querySelector("h2")?.textContent?.trim() ?? "");
      const read = readSectionUnits(found);
      // A link to one of the page's sections opens its first screen.
      const hash = decodeURIComponent(window.location.hash.slice(1));
      const target = found.findIndex((el) => el.id === hash);
      if (target > 0) {
        const first = splitSections(read, titles, SPLIT_RULES[tier]).findIndex(
          (s) => s.section === target
        );
        if (first > 0)
          mutateCurrentUrl(
            (url) => url.searchParams.set(SCREEN_PARAM, String(first + 1)),
            { mode: "replace" }
          );
      }
      units = read;
      censusing = false;
    });
    return stop;
  });

  function only(node: HTMLElement, paths: readonly string[] | null) {
    const apply = (list: readonly string[] | null) => {
      const section = node.querySelector(":scope > .guide-section");
      if (section && list) showOnlyUnits(section, list);
    };
    apply(paths);
    return { update: apply };
  }
</script>

<GuideCompanionHost
  pageTitle={localizedLevel2Topic(meta, "h1")}
  levelLabel={t("guide_l2_level_label")}
>
  <main class="l2-route">
    <GuideScreens
      title={localizedLevel2Topic(meta, "h1")}
      {kicker}
      {labels}
      prevPage={prev
        ? {
            href: localHref(`/guide/level-2/${prev.slug}`),
            title: localizedLevel2Topic(prev, "h1"),
          }
        : null}
      nextPage={next
        ? {
            href: localHref(`/guide/level-2/${next.slug}`),
            title: localizedLevel2Topic(next, "h1"),
          }
        : null}
      hubHref={localHref(`/guide/level-2/${meta.chapter}`)}
      hubLabel={t("guide_l2_chapter_overview")}
    >
      {#snippet screen(n)}
        {@const sc = screens?.[n]}
        {@const Section = sections[sc ? sc.section : n]}
        {#if Section}
          <div class="l2-screen" use:only={sc?.paths ?? null}>
            <Section />
          </div>
        {/if}
      {/snippet}
    </GuideScreens>
  </main>

  {#if censusing}
    <div class="census" bind:this={censusEl} aria-hidden="true" inert>
      {#each sections as Section, k (k)}
        <Section />
      {/each}
    </div>
  {/if}
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

  .l2-route {
    --ink: #ececf2;
    --ink-dim: #a8a8b4;
    --glyph-invert: 1;
    color: var(--ink);
  }
  :global(.guide-content > .l2-route) {
    grid-column: full;
  }
  /* A section's blocks that belong to other screens stay out of layout. */
  .l2-screen :global([hidden]) {
    display: none !important;
  }
  /* On a screen the section is plain content: no scrolling card, no
     scroll-driven reveal, and no page grid to hang its tracks on. */
  .l2-screen :global(.guide-section) {
    display: block;
    margin: 0;
    padding: 0;
    background: none;
    border: 0;
    box-shadow: none;
    backdrop-filter: none;
    animation: none;
  }
  .l2-screen :global(.guide-section > *) {
    max-width: 44rem;
    margin-inline: auto;
    padding-inline: 0;
  }
  .l2-screen :global(.guide-section > h2) {
    margin-top: 0;
  }
  .l2-screen :global(.guide-section > .showcase-wrap) {
    max-width: 76rem;
    margin-block: calc(1.25rem * min(var(--fit, 1), 1));
  }
  .census {
    display: none;
  }
</style>
