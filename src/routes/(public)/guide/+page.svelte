<script lang="ts">
  import GuideShell from "./_components/GuideShell.svelte";
  import HubHeroBuild from "./_components/HubHeroBuild.svelte";
  import HubPictograph from "./_components/HubPictograph.svelte";
  import GuideScreens from "./_components/fit/GuideScreens.svelte";
  import DifficultyBadge from "#lib/shared/components/DifficultyBadge.svelte";
  import {
    GROUP_TITLES,
    bodyPagesByGroup,
  } from "./level-1/_data/guide-manifest";
  import { THE_GRID_ALPHA3 } from "./level-1/_data/the-grid-pictograph";
  import { aabbWordSteps } from "./level-1/_data/aabb-word";
  import { bakeReversals } from "./level-1/_data/guide-sequence-adapter";
  import { getAvailableConcepts } from "#lib/features/learn/domain/concept-experience-registry.js";
  import {
    buildConceptPath,
    buildConceptStartPath,
  } from "#lib/features/learn/domain/concept-routes.js";
  import { Orientation } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
  import { tDynamic } from "#lib/shared/i18n/i18n.svelte.js";
  import { page } from "$app/state";
  import LocaleAlternates from "#lib/shared/components/LocaleAlternates.svelte";
  import { localHref } from "#lib/shared/i18n/localized-href.svelte.js";
  import {
    localizePath,
    splitLocalePath,
  } from "#lib/shared/i18n/seo-locales.js";

  const hubUrl = $derived(
    `https://tkaflowarts.com${localizePath("/guide", splitLocalePath(page.url.pathname).locale)}`
  );

  const firstTopic = bodyPagesByGroup()[0]?.entries[0]?.entry;
  const firstTopicHref = firstTopic
    ? `/guide/level-1/${firstTopic.id}`
    : "/guide/level-1";

  // Lesson first (approved 2026-10-10): the primary action opens the first
  // published lesson from its first step; reading the written guide is the
  // second choice.
  const firstLessonId = getAvailableConcepts()[0]?.id;
  const firstLessonHref = firstLessonId
    ? buildConceptStartPath(firstLessonId)
    : buildConceptPath();

  // Show, then tell (2026-10-10): Level 1's three stages, each with a real
  // picture of what it teaches. The word is the Words page's own AABB.
  const [, ...aabb] = aabbWordSteps(
    "guide-hub-word",
    Orientation.IN,
    Orientation.IN
  );
  const word = bakeReversals(aabb);
  const levelOne = bodyPagesByGroup().map((bucket) => ({
    group: bucket.group,
    title: GROUP_TITLES[bucket.group],
    href: `/guide/level-1/${bucket.entries[0]?.entry.id ?? ""}`,
  }));

  // The front page drills down like every guide page (2026-10-24 fit pass):
  // the way in, Level 1's three stages, then everything else. The window is
  // the page and it never scrolls.
  const screenLabels = $derived([
    "Start",
    tDynamic("guide_hub_level1_title"),
    tDynamic("guide_hub_read_by_section"),
  ]);
  const nextPage = firstTopic
    ? { href: localHref(firstTopicHref), title: firstTopic.title }
    : null;

  // Level 1 lives in its stages; the list carries the rest.
  const guideSections = [
    {
      key: "level2",
      href: "/guide/level-2/turns",
    },
    {
      key: "ratios",
      href: "/guide/ratios",
    },
    {
      key: "codex",
      href: "/codex",
    },
    {
      key: "motion_paths",
      href: "/guide/motion-paths",
    },
    {
      key: "zans_diamond",
      href: "/guide/zans-diamond",
    },
  ] as const;
</script>

<svelte:head>
  <title>{tDynamic("guide_hub_seo_title")}</title>
  <meta name="description" content={tDynamic("guide_hub_seo_description")} />
  <link rel="canonical" href={hubUrl} />
  <LocaleAlternates path="/guide" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content={hubUrl} />
  <meta property="og:title" content={tDynamic("guide_hub_title")} />
  <meta
    property="og:description"
    content={tDynamic("guide_hub_social_description")}
  />
  <meta property="og:site_name" content="The Kinetic Alphabet" />
  <meta
    property="og:image"
    content="https://tkaflowarts.com/branding/og-image.png"
  />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="The Kinetic Alphabet" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:site" content="@tkaflowarts" />
  <meta name="twitter:title" content={tDynamic("guide_hub_title")} />
  <meta
    name="twitter:description"
    content={tDynamic("guide_hub_social_description")}
  />
  <meta
    name="twitter:image"
    content="https://tkaflowarts.com/branding/og-image.png"
  />
</svelte:head>

<GuideShell>
  <main
    class="guide-hub guide-page-route"
    style:view-transition-name="launchpad-guide"
  >
    <GuideScreens
      title={tDynamic("guide_hub_title")}
      labels={screenLabels}
      {nextPage}
    >
      {#snippet screen(n)}
        {#if n === 0}
          <section class="hero" aria-label={screenLabels[0]}>
            <div class="hero-copy">
              <p class="lead">{tDynamic("guide_hub_lead")}</p>
              <div class="intro-actions">
                <a class="primary-action" href={firstLessonHref}>
                  {tDynamic("guide_hub_start_lesson")}
                  <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
                </a>
                <a class="secondary-action" href={localHref(firstTopicHref)}>
                  {tDynamic("guide_hub_read_guide")}
                </a>
              </div>
            </div>
            <div class="hero-art">
              <HubHeroBuild />
            </div>
          </section>
        {:else if n === 1}
          <section class="level-one" aria-labelledby="level-one-heading">
            <h2 id="level-one-heading" class="level-heading">
              <DifficultyBadge level={1} size="1.4em" />
              {tDynamic("guide_hub_level1_title")}
            </h2>
            <p class="section-lead">{tDynamic("guide_welcome_pictographs")}</p>
            <ol class="stages">
              {#each levelOne as stage (stage.group)}
                <li class="stage" class:word-stage={stage.group === "1.2"}>
                  <a href={localHref(stage.href)}>
                    <span class="stage-art" aria-hidden="true">
                      {#if stage.group === "1.0"}
                        <HubPictograph
                          pictographData={THE_GRID_ALPHA3}
                          hands
                          showTKA={false}
                        />
                      {:else if stage.group === "1.1"}
                        <HubPictograph pictographData={word[2]} />
                      {:else}
                        {#each word as step (step.id)}
                          <HubPictograph pictographData={step} showReversals />
                        {/each}
                      {/if}
                    </span>
                    <span class="stage-label">
                      <span class="stage-number">{stage.group}</span>
                      <strong>{stage.title}</strong>
                      <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
                    </span>
                  </a>
                </li>
              {/each}
            </ol>
          </section>
        {:else}
          <section class="section-index" aria-labelledby="section-index-heading">
            <h2 id="section-index-heading">
              {tDynamic("guide_hub_read_by_section")}
            </h2>
            <div class="section-list">
              {#each guideSections as section (section.key)}
                <a class="section-row" href={localHref(section.href)}>
                  <span class="section-copy">
                    <strong>
                      {#if section.key === "level2"}
                        <DifficultyBadge level={2} size="1.3em" />
                      {/if}
                      {tDynamic(`guide_hub_${section.key}_title`)}
                    </strong>
                    <span>{tDynamic(`guide_hub_${section.key}_description`)}</span>
                  </span>
                  <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
                </a>
              {/each}
              <a class="section-row" href="/guides/level-1.pdf" download>
                <span class="section-copy">
                  <strong>
                    <i class="fa-solid fa-file-arrow-down" aria-hidden="true"></i>
                    {tDynamic("guide_hub_pdf_title")}
                  </strong>
                  <span class="pdf-description"
                    >{tDynamic("guide_hub_pdf_description")}</span
                  >
                </span>
                <span class="pdf-action">{tDynamic("guide_hub_download_pdf")}</span>
              </a>
            </div>
          </section>
        {/if}
      {/snippet}
    </GuideScreens>
  </main>
</GuideShell>

<style>
  .guide-hub {
    --guide-accent: var(--theme-accent, #7c9cff);
    --ink: var(--theme-text, #f6f4ff);
    --ink-dim: var(--theme-text-dim, rgba(236, 233, 245, 0.68));
    --guide-stroke: var(--theme-stroke, rgba(255, 255, 255, 0.12));
    --guide-card: var(--theme-card-bg, rgba(255, 255, 255, 0.035));
    grid-column: full;
    width: 100%;
    min-width: 0;
    color: var(--ink);
    font-family: Inter, system-ui, sans-serif;
  }

  h2 {
    margin: 0;
    color: var(--ink);
    font-size: clamp(1.3rem, 1rem + 1vw, 1.75rem);
    font-weight: 740;
    letter-spacing: -0.02em;
    text-align: center;
    text-wrap: balance;
  }

  .level-heading {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5em;
  }

  /* Start: the welcome and the way in beside a pictograph drawing itself.
     Only the picture grows with the window (--fit); the words keep their
     size. */
  .hero {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: clamp(1rem, 4vw, 5rem);
  }
  .hero-copy {
    display: flex;
    flex: 1 1 22rem;
    max-width: 36rem;
    min-width: 0;
    flex-direction: column;
    align-items: flex-start;
  }
  .lead {
    margin: 0;
    color: var(--ink-dim);
    font-size: clamp(1rem, 0.9rem + 0.4vw, 1.25rem);
    line-height: 1.6;
    text-wrap: pretty;
  }
  .intro-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    margin-top: clamp(1rem, 3vh, 2rem);
  }
  .hero-art {
    flex: 0 0 auto;
    width: min(100%, calc(22rem * var(--fit, 1)));
    border-radius: 16px;
    overflow: hidden;
  }

  .primary-action,
  .secondary-action,
  .pdf-action {
    display: inline-flex;
    min-height: 3rem;
    align-items: center;
    justify-content: center;
    gap: 0.7rem;
    border: 1px solid transparent;
    border-radius: 12px;
    color: var(--ink);
    font-size: 0.95rem;
    font-weight: 750;
    text-decoration: none;
    transition:
      border-color var(--duration-fast) var(--ease-standard),
      background-color var(--duration-fast) var(--ease-standard);
  }
  .primary-action {
    padding: 0.7rem 1.1rem;
    background: var(--guide-accent);
    color: var(--theme-bg, #0b1020);
  }
  .primary-action:hover {
    background: color-mix(in srgb, var(--guide-accent) 84%, white);
  }
  .secondary-action {
    padding: 0.7rem 1.1rem;
    border-color: color-mix(in srgb, var(--ink) 30%, transparent);
    background: color-mix(in srgb, var(--ink) 5%, transparent);
  }
  .secondary-action:hover {
    border-color: color-mix(in srgb, var(--guide-accent) 58%, transparent);
    background: color-mix(in srgb, var(--guide-accent) 9%, transparent);
  }
  .primary-action:focus-visible,
  .secondary-action:focus-visible,
  .stage a:focus-visible,
  .section-row:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--guide-accent) 72%, white);
    outline-offset: 3px;
  }

  /* Level 1: why pictographs come first, then its three stages as three
     equal boxes. The word's four pictographs share their square as a
     two-by-two block, read left to right, top to bottom. */
  .level-one {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    justify-items: center;
    gap: clamp(0.5rem, 1.5vh, 1.25rem);
  }
  .section-lead {
    max-width: 44rem;
    margin: 0;
    text-align: center;
    color: var(--ink-dim);
    font-size: clamp(1rem, 0.9rem + 0.3vw, 1.15rem);
    line-height: 1.55;
    text-wrap: pretty;
  }
  .stages {
    --stage-gap: clamp(0.75rem, 2vw, 2rem);
    display: flex;
    justify-content: center;
    gap: var(--stage-gap);
    width: 100%;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .stage {
    min-width: 0;
    width: calc(13rem * var(--fit, 1));
    max-width: calc((100% - 2 * var(--stage-gap)) / 3);
  }
  .stage a {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    padding: 0.6rem;
    border: 1px solid var(--guide-stroke);
    border-radius: 16px;
    background: var(--guide-card);
    color: var(--ink);
    text-decoration: none;
    transition:
      border-color var(--duration-fast) var(--ease-standard),
      background-color var(--duration-fast) var(--ease-standard);
  }
  .stage a:hover {
    border-color: var(--guide-accent);
    background: color-mix(in srgb, var(--guide-accent) 8%, transparent);
  }
  .stage-art {
    display: grid;
    align-content: center;
    border-radius: 12px;
    overflow: hidden;
  }
  .word-stage .stage-art {
    aspect-ratio: 1;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1px;
    background: var(--guide-stroke);
  }
  .stage-label {
    display: flex;
    align-items: baseline;
    gap: 0.6rem;
    font-size: 1.05rem;
  }
  .stage-label strong {
    flex: 1 1 auto;
    min-width: 0;
  }
  .stage-label i,
  .section-row > i {
    flex: 0 0 auto;
    color: color-mix(in srgb, var(--guide-accent) 76%, white);
    font-size: 0.9rem;
  }
  /* Stages carry their book numbers (1.0, 1.1, 1.2), the same as the
     sidebar, so they don't read as Levels 1-3. */
  .stage-number {
    flex: 0 0 auto;
    color: var(--ink-dim);
    font-size: 0.95rem;
    font-style: italic;
    font-variant-numeric: tabular-nums;
  }

  /* More guides: every other part of the guide as a box, and the printable
     book last. */
  .section-index {
    display: grid;
    gap: clamp(0.5rem, 1.5vh, 1.25rem);
    width: min(100%, 76rem);
    margin: 0 auto;
  }
  .section-list {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 21rem), 1fr));
    gap: clamp(0.5rem, 1vw, 1rem);
  }
  .section-row {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: clamp(0.6rem, 1.4vh, 1.1rem) 1rem;
    border: 1px solid var(--guide-stroke);
    border-radius: 14px;
    background: var(--guide-card);
    color: var(--ink);
    text-decoration: none;
    transition:
      border-color var(--duration-fast) var(--ease-standard),
      background-color var(--duration-fast) var(--ease-standard);
  }
  .section-row:hover {
    border-color: color-mix(in srgb, var(--guide-accent) 60%, transparent);
    background: color-mix(in srgb, var(--guide-accent) 8%, transparent);
  }
  .section-copy {
    display: flex;
    flex: 1 1 auto;
    min-width: 0;
    flex-direction: column;
    gap: 0.2rem;
  }
  .section-copy strong {
    display: flex;
    align-items: center;
    gap: 0.5em;
    font-size: 1.05rem;
    letter-spacing: -0.01em;
  }
  .section-copy > span {
    color: var(--ink-dim);
    font-size: 0.9rem;
    line-height: 1.4;
  }
  .pdf-action {
    flex: 0 0 auto;
    min-height: 2.5rem;
    padding: 0.4rem 0.9rem;
    border-color: var(--guide-stroke);
    background: color-mix(in srgb, var(--ink) 4%, transparent);
    font-size: 0.85rem;
  }

  /* Narrow windows: the buttons fill the column and each stage sits in a
     row, its square beside its name, so the word's pictographs stay
     readable. */
  @media (max-width: 600px) {
    .hero {
      flex-direction: column;
      flex-wrap: nowrap;
      gap: 1rem;
    }
    .hero-copy {
      flex: 0 0 auto;
      align-items: center;
    }
    .lead {
      text-align: center;
    }
    .intro-actions {
      width: 100%;
      flex-direction: column;
    }
    .primary-action,
    .secondary-action {
      width: 100%;
    }
    .stages {
      flex-direction: column;
      align-items: stretch;
      gap: 0.6rem;
    }
    .stage {
      width: 100%;
      max-width: none;
    }
    .stage a {
      flex-direction: row;
      align-items: center;
      gap: 0.85rem;
    }
    .stage-art {
      flex: 0 0 auto;
      width: calc(5.5rem * var(--fit, 1));
    }
    .stage-label {
      flex: 1 1 auto;
      align-items: center;
    }
    .section-copy > span {
      font-size: 0.85rem;
      line-height: 1.3;
    }
  }

  /* Smaller windows: the pill already names the screen, so its heading steps
     aside for screen readers only, and the rows tighten so all six fit. */
  @media (max-width: 959.98px), (max-height: 800px) {
    .section-index > h2 {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
    .section-list {
      gap: 0.45rem;
    }
    .section-row {
      padding: 0.5rem 0.85rem;
    }
    .section-copy {
      gap: 0.1rem;
    }
    .section-copy strong {
      font-size: 1rem;
    }
    .pdf-description {
      display: none;
    }
  }
</style>
