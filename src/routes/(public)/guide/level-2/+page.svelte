<script lang="ts">
  import Sentences from "../_components/Sentences.svelte";
  import { localHref } from "#lib/shared/i18n/localized-href.svelte.js";
  import LinkChip from "#lib/shared/ui/components/LinkChip.svelte";
  import GuideSeo from "../level-1/_components/GuideSeo.svelte";
  import { tDynamic } from "#lib/shared/i18n/i18n.svelte.js";
  import { onMount } from "svelte";
  import GuideScreens from "../_components/fit/GuideScreens.svelte";
  import {
    watchScreenTier,
    type ScreenTier,
  } from "../_components/fit/guide-screen-url";

  // One screen at a time (2026-10-24 fit pass): a large window shows the
  // intro and the chapters together; anything smaller gives each a screen.
  let tier = $state<ScreenTier>("large");
  onMount(() => watchScreenTier((v) => (tier = v)));
  const views = $derived(
    tier === "large"
      ? [{ label: "Level 2", intro: true, chapters: true }]
      : [
          { label: "Intro", intro: true, chapters: false },
          {
            label: tDynamic("guide_level2_chapters"),
            intro: false,
            chapters: true,
          },
        ]
  );
</script>

<GuideSeo
  kind="Course"
  title={tDynamic("guide_level2_seo_title")}
  description={tDynamic("guide_level2_seo_description")}
  path="/guide/level-2"
  breadcrumbs={[
    { name: "Home", path: "/" },
    { name: "Guide", path: "/guide" },
    { name: "Level 2", path: "/guide/level-2" },
  ]}
/>

<main class="landing">
  <GuideScreens
    title="The Kinetic Alphabet"
    kicker="Level 2"
    subtitle={tDynamic("guide_level2_subtitle")}
    labels={views.map((v) => v.label)}
    nextPage={{
      href: localHref("/guide/level-2/turns"),
      title: tDynamic("guide_level2_chapter1_title"),
    }}
    hubHref={localHref("/guide")}
  >
    {#snippet screen(n)}
      {@const view = views[n]}
      <div class="landing-body">
        {#if view?.intro}
          <p class="byline">{tDynamic("guide_level2_byline")}</p>
          <section class="intro">
            <p><Sentences text={tDynamic("guide_level2_intro")} /></p>
          </section>
        {/if}
        {#if view?.chapters}
          <nav class="toc" aria-label={tDynamic("guide_level2_toc")}>
            <h2>{tDynamic("guide_level2_chapters")}</h2>
            <ol>
              <li>
                <a href={localHref("/guide/level-2/turns")}>
                  <span class="copy">
                    <strong>{tDynamic("guide_level2_chapter1_title")}</strong>
                    <span>{tDynamic("guide_level2_chapter1_description")}</span>
                  </span>
                  <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
                </a>
              </li>
              <li>
                <a href={localHref("/guide/level-2/double-turns")}>
                  <span class="copy">
                    <strong>{tDynamic("guide_level2_chapter2_title")}</strong>
                    <span>{tDynamic("guide_level2_chapter2_description")}</span>
                  </span>
                  <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
                </a>
              </li>
            </ol>
          </nav>

          <section class="download">
            <LinkChip href="/guides/level-2.pdf" download
              ><i class="fa-solid fa-file-arrow-down" aria-hidden="true"></i>
              {tDynamic("guide_level2_download_pdf")}</LinkChip
            >
          </section>
        {/if}
      </div>
    {/snippet}
  </GuideScreens>
</main>

<style>
  /* The level-2 layout renders on the dark guide background, so the ink is
     always the light set. GuideScreens paints the title, subtitle and
     Back/Next. */
  .landing {
    --ink: #ececf2;
    --ink-dim: #a8a8b4;
    color: var(--ink);
  }
  :global(.guide-content > .landing) {
    grid-column: full;
  }
  .landing-body {
    max-width: 42rem;
    margin: 0 auto;
    text-align: center;
  }
  .byline {
    font-size: 0.95rem;
    color: oklch(0.58 0.02 270);
    margin: 0 0 1.25rem;
  }
  .intro {
    margin: 0 0 1.25rem;
  }
  .intro p {
    margin: 0;
    text-wrap: pretty;
  }
  .toc {
    text-align: left;
    margin: 0 0 1.25rem;
  }
  .toc h2 {
    text-align: center;
    margin: 0 0 0.75rem;
  }
  .toc ol {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .toc a {
    display: flex;
    align-items: center;
    gap: 1rem;
    min-height: 44px;
    padding: 1rem;
    background: oklch(0.18 0.02 270 / 0.6);
    border: 1px solid oklch(0.45 0.04 270 / 0.35);
    border-radius: 10px;
    text-decoration: none;
    color: inherit;
    transition:
      border-color var(--duration-fast) var(--ease-standard),
      background-color var(--duration-fast) var(--ease-standard);
  }
  .toc a:hover,
  .toc a:focus-visible {
    border-color: #4ea7e8;
    background: oklch(0.22 0.03 270 / 0.7);
  }
  .copy {
    flex: 1 1 auto;
    min-width: 0;
  }
  .copy strong {
    display: block;
  }
  .copy span {
    display: block;
    font-size: 0.9rem;
    color: oklch(0.68 0.02 270);
    margin-top: 0.25rem;
  }
  .toc i {
    color: oklch(0.68 0.02 270);
  }
  .download {
    display: flex;
    justify-content: center;
  }
</style>
