<!--
  /history/draft — the full archive, unlisted while /history is withdrawn
  (see ../+page.svelte). Nothing links here. Share a record address
  (#archive-record-<id>) with its author during outreach.
-->
<script lang="ts">
  import Seo from "#lib/shared/components/Seo.svelte";
  import PlayableArchive from "../_components/archive/PlayableArchive.svelte";
  import {
    ARCHIVE_ENTRIES,
    ARCHIVE_START_YEAR,
    ARCHIVE_END_YEAR,
  } from "../_components/archive/_lib/archive-ledger";
  import { ARCHIVE_INK } from "#lib/shared/landing/domain/page-surface.js";

  const TITLE = "Flow Arts History Archive: Who Wrote It Down";
  const DESCRIPTION = `${ARCHIVE_ENTRIES.length} sourced records of flow-arts notation systems, movement languages, teaching archives, and research from ${ARCHIVE_START_YEAR} to ${ARCHIVE_END_YEAR}.`;
  const URL = "https://tkaflowarts.com/history/draft";
</script>

<Seo
  title={TITLE}
  description={DESCRIPTION}
  canonical={URL}
  ogType="article"
  noindex
/>

<div class="playable-viewport" style:background={ARCHIVE_INK}>
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
