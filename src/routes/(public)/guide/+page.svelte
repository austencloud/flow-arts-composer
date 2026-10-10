<script lang="ts">
  import GuideShell from "./_components/GuideShell.svelte";
  import HubHeroBuild from "./_components/HubHeroBuild.svelte";
  import HubPictograph from "./_components/HubPictograph.svelte";
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

  // Level 1 lives in the stages above; the list carries the rest.
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
      key: "prospin",
      href: "/guide/prospin-and-inspin",
    },
    {
      key: "codex",
      href: "/guide/codex",
    },
    {
      key: "motion_paths",
      href: "/guide/motion-paths",
    },
  ] as const;
</script>

<svelte:head>
  <title>{tDynamic("guide_hub_seo_title")}</title>
  <meta name="description" content={tDynamic("guide_hub_seo_description")} />
  <link rel="canonical" href="https://tkaflowarts.com/guide" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://tkaflowarts.com/guide" />
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
  <main class="guide-hub guide-page-route">
    <div class="guide-index" style:view-transition-name="launchpad-guide">
      <header class="hero">
        <div class="hero-copy">
          <h1>{tDynamic("guide_hub_title")}</h1>
          <p class="lead">{tDynamic("guide_welcome_what")}</p>
          <div class="intro-actions">
            <a class="primary-action" href={firstLessonHref}>
              {tDynamic("guide_hub_start_lesson")}
              <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
            </a>
            <a class="secondary-action" href={firstTopicHref}>
              {tDynamic("guide_hub_read_guide")}
            </a>
          </div>
        </div>
        <div class="hero-art">
          <HubHeroBuild />
        </div>
      </header>

      <section class="level-one" aria-labelledby="level-one-heading">
        <h2 id="level-one-heading">{tDynamic("guide_hub_level1_title")}</h2>
        <p class="section-lead">{tDynamic("guide_welcome_pictographs")}</p>
        <ol class="stages">
          {#each levelOne as stage, index (stage.group)}
            <li class="stage" class:word-stage={stage.group === "1.2"}>
              <a href={stage.href}>
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
                  <span class="stage-number">{index + 1}</span>
                  <strong>{stage.title}</strong>
                  <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
                </span>
              </a>
            </li>
          {/each}
        </ol>
      </section>

      <section class="section-index" aria-labelledby="section-index-heading">
        <h2 id="section-index-heading">
          {tDynamic("guide_hub_read_by_section")}
        </h2>

        <div class="section-list">
          {#each guideSections as section (section.key)}
            <a class="section-row" href={section.href}>
              <span class="section-copy">
                <strong>{tDynamic(`guide_hub_${section.key}_title`)}</strong>
                <span>{tDynamic(`guide_hub_${section.key}_description`)}</span>
              </span>
              <span class="section-action">
                {tDynamic(`guide_hub_${section.key}_action`)}
                <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
              </span>
            </a>
          {/each}
        </div>
      </section>

      <aside class="pdf-strip" aria-labelledby="pdf-heading">
        <div class="pdf-copy">
          <span>{tDynamic("guide_hub_printable")}</span>
          <strong id="pdf-heading">{tDynamic("guide_hub_pdf_title")}</strong>
          <p>{tDynamic("guide_hub_pdf_description")}</p>
        </div>
        <a class="pdf-action" href="/guides/level-1.pdf" download>
          <i class="fa-solid fa-file-arrow-down" aria-hidden="true"></i>
          {tDynamic("guide_hub_download_pdf")}
        </a>
      </aside>
    </div>
  </main>
</GuideShell>

<style>
  .guide-hub {
    --guide-accent: var(--theme-accent, #7c9cff);
    --guide-text: var(--theme-text, #f6f4ff);
    --guide-text-dim: var(--theme-text-dim, rgba(236, 233, 245, 0.68));
    --guide-stroke: var(--theme-stroke, rgba(255, 255, 255, 0.12));
    --guide-card: var(--theme-card-bg, rgba(255, 255, 255, 0.035));
    width: 100%;
    min-height: calc(100vh - 64px);
    padding: clamp(2.5rem, 5vw, 4.5rem) clamp(1rem, 5vw, 5rem) 6rem;
    color: var(--guide-text);
    font-family: Inter, system-ui, sans-serif;
  }

  .guide-index {
    width: min(100%, 76rem);
    margin: 0 auto;
  }

  h1,
  h2 {
    margin: 0;
    color: var(--guide-text);
    text-wrap: balance;
  }

  /* Show, then tell: the welcome and the way in on the left, a pictograph
     drawing itself on the right, so the eye reads the words and then the
     picture they describe. */
  .hero {
    display: grid;
    grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
    gap: clamp(2rem, 5vw, 5rem);
    align-items: center;
  }

  /* Flex, not grid: the guide's global h1 rule sets a named grid-column
     that would open a second implicit column here. */
  .hero-copy {
    display: flex;
    min-width: 0;
    flex-direction: column;
    align-items: flex-start;
  }

  /* The site's page-title voice: the Fraunces italic of the landing
     wordmark and the other public pages. */
  .hero h1 {
    margin: 0;
    padding: 0;
    font-family: var(--page-title-font, "Fraunces", Georgia, serif);
    font-style: italic;
    font-weight: 700;
    font-variation-settings:
      "opsz" 144,
      "wght" 700,
      "SOFT" 0,
      "WONK" 1;
    font-size: clamp(2.6rem, 1.4rem + 3.4vw, 5rem);
    line-height: 1.04;
    letter-spacing: -0.015em;
    text-align: start;
  }

  .lead {
    max-width: 36rem;
    margin: 1.4rem 0 0;
    color: var(--guide-text-dim);
    font-size: clamp(1.05rem, 1.35vw, 1.2rem);
    line-height: 1.65;
    text-wrap: pretty;
  }

  .intro-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    margin-top: 2rem;
  }

  /* Square, and never taller than a landscape phone allows. */
  .hero-art {
    width: min(100%, 32rem, 70svh);
    justify-self: center;
    border-radius: 16px;
    overflow: hidden;
  }

  .primary-action,
  .secondary-action,
  .pdf-action {
    display: inline-flex;
    min-height: 3.25rem;
    align-items: center;
    justify-content: center;
    gap: 0.7rem;
    border: 1px solid transparent;
    border-radius: 12px;
    color: var(--guide-text);
    font-size: 0.9rem;
    font-weight: 750;
    text-decoration: none;
    transition:
      border-color var(--transition-fast),
      background-color var(--transition-fast),
      color var(--transition-fast);
  }

  .primary-action {
    padding: 0.75rem 1.1rem;
    background: var(--guide-accent);
    color: var(--theme-bg, #0b1020);
  }

  .primary-action:hover {
    background: color-mix(in srgb, var(--guide-accent) 84%, white);
  }

  .secondary-action {
    padding: 0.75rem 1.1rem;
    border-color: color-mix(in srgb, var(--guide-text) 30%, transparent);
    background: color-mix(in srgb, var(--guide-text) 5%, transparent);
  }

  .secondary-action:hover,
  .pdf-action:hover {
    border-color: color-mix(in srgb, var(--guide-accent) 58%, transparent);
    background: color-mix(in srgb, var(--guide-accent) 9%, transparent);
  }

  .primary-action:focus-visible,
  .secondary-action:focus-visible,
  .stage a:focus-visible,
  .section-row:focus-visible,
  .pdf-action:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--guide-accent) 72%, white);
    outline-offset: 3px;
  }

  h2 {
    font-size: clamp(1.35rem, 2vw, 1.75rem);
    font-weight: 740;
    letter-spacing: -0.025em;
  }

  /* Level 1: the pictographs paragraph, then its three stages as pictures.
     The word is four pictographs, so it gets four times the width and every
     pictograph on the row is the same size. */
  .level-one {
    margin-top: clamp(4rem, 8vw, 7rem);
  }

  .section-lead {
    max-width: 44rem;
    margin: 0.85rem 0 0;
    color: var(--guide-text-dim);
    font-size: clamp(1rem, 1.2vw, 1.1rem);
    line-height: 1.65;
    text-wrap: pretty;
  }

  .stages {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 4fr);
    gap: clamp(1rem, 2.4vw, 2rem);
    margin: 2rem 0 0;
    padding: 0;
    list-style: none;
  }

  .stage a {
    display: flex;
    height: 100%;
    flex-direction: column;
    gap: 0.85rem;
    border-radius: 14px;
    color: var(--guide-text);
    text-decoration: none;
  }

  .stage-art {
    display: grid;
    align-content: center;
    border: 1px solid var(--guide-stroke);
    border-radius: 14px;
    overflow: hidden;
    transition: border-color var(--transition-fast);
  }

  .word-stage .stage-art {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 1px;
    background: var(--guide-stroke);
  }

  .stage a:hover .stage-art {
    border-color: var(--guide-accent);
  }

  .stage-label {
    display: flex;
    align-items: baseline;
    gap: 0.65rem;
    min-height: 2.75rem;
    font-size: 1.05rem;
  }

  .stage-label i {
    flex: 0 0 auto;
    color: color-mix(in srgb, var(--guide-accent) 76%, white);
    font-size: 0.9rem;
  }

  .stage-number {
    display: inline-grid;
    flex: 0 0 auto;
    place-items: center;
    width: 1.75rem;
    height: 1.75rem;
    border-radius: 50%;
    background: color-mix(in srgb, var(--guide-accent) 22%, transparent);
    font-size: 0.875rem;
    font-weight: 700;
  }

  .section-index {
    margin-top: clamp(4rem, 8vw, 6rem);
  }

  .section-list {
    margin-top: 1rem;
    border-top: 1px solid var(--guide-stroke);
  }

  .section-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: clamp(1rem, 3vw, 2.5rem);
    align-items: center;
    padding: 1rem 0.75rem;
    border-bottom: 1px solid var(--guide-stroke);
    color: var(--guide-text);
    text-decoration: none;
    transition:
      border-color var(--transition-fast),
      background-color var(--transition-fast);
  }

  .section-row:hover {
    border-color: color-mix(in srgb, var(--guide-accent) 48%, transparent);
    background: color-mix(in srgb, var(--guide-accent) 6%, transparent);
  }

  .section-copy {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 0.25rem;
  }

  .section-copy strong {
    font-size: 1.1rem;
    letter-spacing: -0.015em;
  }

  .section-copy > span {
    color: var(--guide-text-dim);
    font-size: 0.9rem;
    line-height: 1.5;
  }

  .section-action {
    display: flex;
    min-height: 2.75rem;
    align-items: center;
    justify-content: flex-end;
    gap: 0.75rem;
    color: color-mix(in srgb, var(--guide-accent) 76%, white);
    font-size: 0.875rem;
    font-weight: 750;
    text-align: right;
  }

  .pdf-strip {
    display: flex;
    gap: 2rem;
    align-items: center;
    justify-content: space-between;
    margin-top: 2.5rem;
    padding: clamp(1.25rem, 3vw, 1.75rem);
    border: 1px solid var(--guide-stroke);
    border-radius: 16px;
    background: var(--guide-card);
  }

  .pdf-copy {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    column-gap: 0.8rem;
    align-items: baseline;
  }

  .pdf-copy > span {
    grid-column: 1 / -1;
    margin-bottom: 0.25rem;
    color: color-mix(in srgb, var(--guide-accent) 75%, white);
    font-size: 0.75rem;
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .pdf-copy strong {
    font-size: 1.05rem;
  }

  .pdf-copy p {
    margin: 0;
    color: var(--guide-text-dim);
    font-size: 0.875rem;
  }

  .pdf-action {
    flex: 0 0 auto;
    padding: 0.7rem 1rem;
    border-color: var(--guide-stroke);
    background: color-mix(in srgb, var(--guide-text) 4%, transparent);
  }

  @media (max-width: 760px) {
    /* The layout already starts below the fixed Guide contents button. */
    .guide-hub {
      padding-top: 2rem;
    }

    .hero {
      grid-template-columns: minmax(0, 1fr);
      gap: 2.25rem;
    }

    .hero-art {
      width: min(100%, 24rem);
    }

    .section-row {
      grid-template-columns: minmax(0, 1fr);
      gap: 0.5rem;
      padding-inline: 0.25rem;
    }

    .section-action {
      justify-content: flex-start;
      text-align: left;
    }

    .pdf-strip {
      align-items: stretch;
      flex-direction: column;
      gap: 1.25rem;
    }

    .pdf-copy {
      grid-template-columns: 1fr;
      gap: 0.25rem;
    }

    .pdf-action {
      width: 100%;
    }
  }

  /* Narrow screens: the two single pictographs side by side, the word as a
     two-by-two block under them, every pictograph still the same size. */
  @media (max-width: 900px) {
    .stages {
      max-width: 30rem;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .word-stage {
      grid-column: 1 / -1;
    }

    .word-stage .stage-art {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 480px) {
    .intro-actions {
      width: 100%;
      align-items: stretch;
      flex-direction: column;
    }

    .primary-action,
    .secondary-action {
      width: 100%;
    }
  }
</style>
