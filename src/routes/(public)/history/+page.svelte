<!--
  /history — WITHDRAWN 2026-10-14.

  The archive names the practitioners whose work it records, and none of them
  have been asked yet. Until each record carries its author's say-so, the
  public address shows the shared "being rebuilt" note and the full archive
  lives unlisted at /history/draft, so a record can be shown to its author
  during outreach without being advertised.

  To restore: move draft/+page.svelte back here, re-list /history in the
  sitemap, header, footer, launchpad tile, and FAQ, and drop the draft route.
-->
<script lang="ts">
  import "#lib/shared/landing/styles/public-editorial.css";
  import UnderConstruction from "#lib/shared/landing/components/UnderConstruction.svelte";
</script>

<svelte:head>
  <title>Flow Arts History | Being rebuilt</title>
  <meta
    name="description"
    content="The flow arts history archive is being rebuilt. The notation pages for each prop are still here."
  />
  <meta name="robots" content="noindex, follow" />
  <link rel="canonical" href="https://tkaflowarts.com/history" />
</svelte:head>

<UnderConstruction
  title="Flow Arts History"
  eyebrow="Being rebuilt"
  icon="fa-clock-rotate-left"
  note="The history archive is offline while it is rebuilt with the people whose work it records. The notation pages for each prop are still here."
  destinations={[
    {
      label: "Shape Engine",
      href: "/shape-engine",
      icon: "fa-diagram-project",
    },
    {
      label: "Staves",
      href: "/notation/staves",
      icon: "fa-grip-lines-vertical",
    },
    { label: "Poi", href: "/notation/poi", icon: "fa-circle-dot" },
    { label: "Fans", href: "/notation/fans", icon: "fa-fan" },
    { label: "Clubs", href: "/notation/clubs", icon: "fa-wine-bottle" },
    { label: "Buugeng", href: "/notation/buugeng", icon: "fa-yin-yang" },
  ]}
/>
