<script lang="ts">
  import GuideShell from "./_components/GuideShell.svelte";
  import { bodyPagesByGroup } from "./level-1/_data/guide-manifest";
  import { seoForSlug } from "./level-1/_data/guide-page-seo";

  const firstTopic = bodyPagesByGroup()[0]?.entries[0]?.entry;
  const firstTopicHref = firstTopic
    ? `/guide/level-1/${firstTopic.id}`
    : "/guide/level-1";
  const firstTopicLabel = firstTopic
    ? seoForSlug(firstTopic.id, firstTopic.title).h1
    : "Level 1";

  const guideSections = [
    {
      title: "Level 1",
      description: "The grid, positions, motions, letters, and words.",
      href: firstTopicHref,
      action: `Start with ${firstTopicLabel}`,
    },
    {
      title: "Level 2",
      description: "Turns, transitions, and intermediate notation.",
      href: "/guide/level-2/turns",
      action: "Read Level 2",
    },
    {
      title: "Ratios",
      description: "Translate spin ratios into TKA turns and flower petals.",
      href: "/guide/ratios",
      action: "Translate ratios",
    },
    {
      title: "The Codex",
      description: "Every published Kinetic Alphabet letter.",
      href: "/guide/codex",
      action: "Open the Codex",
    },
    {
      title: "Motion paths",
      description: "Compare hand paths and the mandalas they draw.",
      href: "/guide/motion-paths",
      action: "Compare motion paths",
    },
  ] as const;
</script>

<svelte:head>
  <title>The Kinetic Alphabet Guide | Flow Arts Notation</title>
  <meta
    name="description"
    content="Read the Kinetic Alphabet Guide, from Level 1 foundations through Level 2 turns and transitions, or open the complete letter Codex."
  />
  <link rel="canonical" href="https://tkaflowarts.com/guide" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://tkaflowarts.com/guide" />
  <meta property="og:title" content="The Kinetic Alphabet Guide" />
  <meta
    property="og:description"
    content="Read Level 1, continue with Level 2, or open the Kinetic Alphabet Codex."
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
  <meta name="twitter:title" content="The Kinetic Alphabet Guide" />
  <meta
    name="twitter:description"
    content="Read Level 1, continue with Level 2, or open the Kinetic Alphabet Codex."
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
        <span class="kicker">Written reference</span>
        <h1>The Kinetic Alphabet Guide</h1>
        <p>
          Start with Level 1. Level 2 covers turns and transitions. The Codex is
          the full letter reference.
        </p>
        <div class="intro-actions">
          <a class="primary-action" href={firstTopicHref}>
            Start with {firstTopicLabel}
            <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
          </a>
          <a class="secondary-action" href="/learn/concepts">
            Interactive lessons
          </a>
        </div>
      </header>

      <section class="section-index" aria-labelledby="section-index-heading">
        <h2 id="section-index-heading">Read by section</h2>

        <div class="section-list">
          {#each guideSections as section, index}
            <a class="section-row" href={section.href}>
              <span class="section-number" aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span class="section-copy">
                <strong>{section.title}</strong>
                <span>{section.description}</span>
              </span>
              <span class="section-action">
                {section.action}
                <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
              </span>
            </a>
          {/each}
        </div>
      </section>

      <aside class="pdf-strip" aria-labelledby="pdf-heading">
        <div class="pdf-copy">
          <span>Printable</span>
          <strong id="pdf-heading">Level 1 PDF</strong>
          <p>The Level 1 guide in its book layout.</p>
        </div>
        <a class="pdf-action" href="/guides/level-1.pdf" download>
          <i class="fa-solid fa-file-arrow-down" aria-hidden="true"></i>
          Download PDF
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

  .intro {
    max-width: 60rem;
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
    max-width: 46rem;
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
