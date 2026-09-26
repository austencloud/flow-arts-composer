<script lang="ts">
  import GuideShell from "./_components/GuideShell.svelte";
  import { bodyPagesByGroup } from "./level-1/_data/guide-manifest";
  import { seoForSlug } from "./level-1/_data/guide-page-seo";
  import { tDynamic } from "$lib/shared/i18n/i18n.svelte.js";

  const firstTopic = bodyPagesByGroup()[0]?.entries[0]?.entry;
  const firstTopicHref = firstTopic
    ? `/guide/level-1/${firstTopic.id}`
    : "/guide/level-1";
  const firstTopicLabel = firstTopic
    ? seoForSlug(firstTopic.id, firstTopic.title).h1
    : "Level 1";
  const localizedFirstTopicLabel = $derived(
    firstTopic?.id === "the-grid"
      ? tDynamic("guide_hub_first_topic")
      : firstTopicLabel
  );

  const guideSections = [
    {
      key: "level1",
      href: firstTopicHref,
    },
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
      <header class="intro">
        <span class="kicker">{tDynamic("guide_hub_kicker")}</span>
        <h1>{tDynamic("guide_hub_title")}</h1>
        <p>{tDynamic("guide_hub_intro")}</p>
        <div class="intro-actions">
          <a class="primary-action" href={firstTopicHref}>
            {tDynamic("guide_hub_start_with", {
              topic: localizedFirstTopicLabel,
            })}
            <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
          </a>
          <a class="secondary-action" href="/learn/concepts">
            {tDynamic("guide_hub_interactive_lessons")}
          </a>
        </div>
      </header>

      <section class="section-index" aria-labelledby="section-index-heading">
        <h2 id="section-index-heading">
          {tDynamic("guide_hub_read_by_section")}
        </h2>

        <div class="section-list">
          {#each guideSections as section, index}
            <a class="section-row" href={section.href}>
              <span class="section-number" aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span class="section-copy">
                <strong>{tDynamic(`guide_hub_${section.key}_title`)}</strong>
                <span>{tDynamic(`guide_hub_${section.key}_description`)}</span>
              </span>
              <span class="section-action">
                {section.key === "level1"
                  ? tDynamic("guide_hub_start_with", {
                      topic: localizedFirstTopicLabel,
                    })
                  : tDynamic(`guide_hub_${section.key}_action`)}
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
    padding: clamp(3rem, 6vw, 5.5rem) clamp(1rem, 5vw, 5rem) 6rem;
    color: var(--guide-text);
    font-family: Inter, system-ui, sans-serif;
  }

  .guide-index {
    width: min(100%, 88rem);
    margin: 0 auto;
  }

  .kicker {
    display: block;
    margin-bottom: 0.85rem;
    color: color-mix(in srgb, var(--guide-accent) 82%, white);
    font-size: 0.75rem;
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  h1,
  h2 {
    margin: 0;
    color: var(--guide-text);
    text-wrap: balance;
  }

  .intro h1 {
    max-width: 15ch;
    margin: 0;
    padding: 0;
    font-size: clamp(2.75rem, 5.3vw, 5.5rem);
    font-weight: 780;
    line-height: 0.98;
    letter-spacing: -0.052em;
    text-align: left;
  }

  .intro > p {
    margin: 1.4rem 0 0;
    color: var(--guide-text-dim);
    font-size: clamp(1rem, 1.35vw, 1.18rem);
    line-height: 1.65;
    text-wrap: pretty;
  }

  .intro-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    margin-top: 2rem;
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
    padding: 0.75rem 1rem;
    border-color: var(--guide-stroke);
    background: var(--guide-card);
  }

  .secondary-action:hover,
  .pdf-action:hover {
    border-color: color-mix(in srgb, var(--guide-accent) 58%, transparent);
    background: color-mix(in srgb, var(--guide-accent) 9%, transparent);
  }

  .primary-action:focus-visible,
  .secondary-action:focus-visible,
  .section-row:focus-visible,
  .pdf-action:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--guide-accent) 72%, white);
    outline-offset: 3px;
  }

  .section-index {
    margin-top: clamp(4rem, 8vw, 7rem);
  }

  h2 {
    font-size: clamp(1.35rem, 2vw, 1.75rem);
    font-weight: 740;
    letter-spacing: -0.025em;
  }

  .section-list {
    margin-top: 1.25rem;
    border-top: 1px solid var(--guide-stroke);
  }

  .section-row {
    display: grid;
    grid-template-columns: 3.5rem minmax(0, 1fr) minmax(11rem, auto);
    gap: clamp(1rem, 3vw, 2.5rem);
    align-items: center;
    min-height: 7.25rem;
    padding: 1.2rem 0.75rem;
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

  .section-number {
    color: color-mix(in srgb, var(--guide-accent) 75%, white);
    font-size: 0.75rem;
    font-weight: 800;
    letter-spacing: 0.1em;
  }

  .section-copy {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 0.3rem;
  }

  .section-copy strong {
    font-size: clamp(1.1rem, 1.6vw, 1.35rem);
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
    font-size: 0.82rem;
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
    font-size: 0.86rem;
  }

  .pdf-action {
    flex: 0 0 auto;
    padding: 0.7rem 1rem;
    border-color: var(--guide-stroke);
    background: color-mix(in srgb, var(--guide-text) 4%, transparent);
  }

  @media (max-width: 760px) {
    .guide-hub {
      padding-top: 6.5rem;
    }

    .section-row {
      grid-template-columns: 2.25rem minmax(0, 1fr);
      gap: 0.75rem 1rem;
      min-height: 8.25rem;
      padding-inline: 0.25rem;
    }

    .section-action {
      grid-column: 2;
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

  @media (max-width: 480px) {
    .intro-actions {
      align-items: stretch;
      flex-direction: column;
    }

    .primary-action,
    .secondary-action {
      width: 100%;
    }

    .section-index {
      margin-top: 3.5rem;
    }
  }
</style>
