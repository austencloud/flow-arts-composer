<!--
  /history — WITHDRAWN 2026-10-14.

  The archive names the practitioners whose work it records, and none of them
  have been asked yet. Until each record carries its author's say-so, the
  public address shows the shared "being rebuilt" note and the full archive
  lives unlisted at /history/draft, so a record can be shown to its author
  during outreach without being advertised.

  A local dev server still shows the full archive here, so the archive can be
  worked on in place; production builds prerender the note.

  To restore: render ArchiveFullPage here unconditionally, re-list /history in the
  sitemap, header, footer, launchpad tile, and FAQ, and drop the draft route.
-->
<script lang="ts">
  import { dev } from "$app/env";
  import "#lib/shared/landing/styles/public-editorial.css";
  import UnderConstruction from "#lib/shared/landing/components/UnderConstruction.svelte";
  import ArchiveFullPage from "./_components/archive/ArchiveFullPage.svelte";
</script>

<svelte:head>
  {#if !dev}
    <title>Flow Arts History | Being rebuilt</title>
    <meta
      name="description"
      content="The flow arts history archive is being rebuilt. Shape Engine and the prop notation page are still here."
    />
    <meta name="robots" content="noindex, follow" />
    <link rel="canonical" href="https://tkaflowarts.com/history" />
  {/if}
</svelte:head>

{#if dev}
  <ArchiveFullPage canonical="https://tkaflowarts.com/history" />
{:else}
  <UnderConstruction
    title="Flow Arts History"
    eyebrow="Being rebuilt"
    icon="fa-clock-rotate-left"
    note="The history archive is offline while it is rebuilt with the people whose work it records. Shape Engine and the prop notation page are still here."
    destinations={[
      {
        label: "Shape Engine",
        href: "/shape-engine",
        icon: "fa-diagram-project",
      },
      {
        label: "Prop notation",
        href: "/notation/props",
        icon: "fa-grip-lines-vertical",
      },
    ]}
  />
{/if}
