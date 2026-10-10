<script lang="ts">
  import Seo from "#lib/shared/components/Seo.svelte";
  import PlayableArchive from "./_components/archive/PlayableArchive.svelte";
  import {
    ARCHIVE_ENTRIES,
    ARCHIVE_START_YEAR,
    ARCHIVE_END_YEAR,
  } from "./_components/archive/_lib/archive-ledger";
  import { archiveStructuredWorks } from "./_components/archive/_lib/archive-presentation";
  import { ARCHIVE_INK } from "#lib/shared/landing/domain/page-surface.js";

  const TITLE = "Flow Arts History Archive: Who Wrote It Down";
  const DESCRIPTION = `${ARCHIVE_ENTRIES.length} sourced records of flow-arts notation systems, movement languages, teaching archives, and research from ${ARCHIVE_START_YEAR} to ${ARCHIVE_END_YEAR}.`;
  const URL = "https://tkaflowarts.com/history";

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline: "Flow arts history",
        description: DESCRIPTION,
        mainEntityOfPage: URL,
        author: { "@type": "Person", name: "Austen Cloud" },
        about: archiveStructuredWorks(ARCHIVE_ENTRIES),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Home",
            item: "https://tkaflowarts.com/",
          },
          {
            "@type": "ListItem",
            position: 2,
            name: "Flow Arts History",
            item: URL,
          },
        ],
      },
    ],
  };
</script>

<Seo title={TITLE} description={DESCRIPTION} canonical={URL} ogType="article">
  {@html `<script type="application/ld+json">${JSON.stringify(jsonLd)}<\/script>`}
</Seo>

<div
  class="playable-viewport"
  style:view-transition-name="launchpad-history"
  style:background={ARCHIVE_INK}
>
  <PlayableArchive />
</div>

<style>
  .playable-viewport {
    min-height: 100dvh;
    padding-top: var(--marketing-header-h, 64px);
    box-sizing: border-box;
    color: var(--theme-text);
  }
</style>
