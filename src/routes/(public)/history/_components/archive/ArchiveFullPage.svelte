<!--
  The full archive page. /history/draft always renders it; /history renders it
  only on a local dev server while the public address is withdrawn.
-->
<script lang="ts">
  import Seo from "#lib/shared/components/Seo.svelte";
  import PlayableArchive from "./PlayableArchive.svelte";
  import {
    ARCHIVE_ENTRIES,
    ARCHIVE_START_YEAR,
    ARCHIVE_END_YEAR,
  } from "./_lib/archive-ledger";
  import { ARCHIVE_INK } from "#lib/shared/landing/domain/page-surface.js";

  let { canonical }: { canonical: string } = $props();

  const TITLE = "Flow Arts History Archive: Who Wrote It Down";
  const DESCRIPTION = `${ARCHIVE_ENTRIES.length} sourced records of flow-arts notation systems, movement languages, teaching archives, and research from ${ARCHIVE_START_YEAR} to ${ARCHIVE_END_YEAR}.`;
</script>

<Seo
  title={TITLE}
  description={DESCRIPTION}
  {canonical}
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
