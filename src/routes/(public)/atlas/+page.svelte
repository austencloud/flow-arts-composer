<!--
  /atlas — GATED 2026-08-30.

  Production shows the shared Coming Soon page. Development renders the full
  Kinetic Atlas at its canonical URL so work can continue without exposing it.

  To un-gate: restore KineticAtlasDraft as the page, remove the production
  noindex head below, re-list Atlas in the sitemap, and update the focused
  gate contract test.
-->
<script lang="ts">
  import "#lib/shared/landing/styles/public-editorial.css";
  import { dev } from "$app/env";
  import UnderConstruction from "#lib/shared/landing/components/UnderConstruction.svelte";
  import KineticAtlasDraft from "./_components/KineticAtlasDraft.svelte";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();
</script>

<svelte:head>
  {#if !dev}
    <title>The Kinetic Atlas | Coming Soon</title>
    <meta
      name="description"
      content="The Kinetic Atlas is being rebuilt. Use the Guide or interactive lessons in the meantime."
    />
    <meta name="robots" content="noindex, follow" />
    <link rel="canonical" href="https://tkaflowarts.com/atlas" />
  {/if}
</svelte:head>

{#if dev}
  <KineticAtlasDraft {data} />
{:else}
  <div style:view-transition-name="launchpad-glossary">
    <UnderConstruction
      title="The Kinetic Atlas"
      eyebrow="Coming soon"
      icon="fa-compass"
      note="The Atlas is being rebuilt. In the meantime, use the Guide or interactive lessons."
      destinations={[
        {
          label: "Interactive lessons",
          href: "/learn/concepts",
          icon: "fa-graduation-cap",
        },
        { label: "Read the Guide", href: "/guide", icon: "fa-book-open" },
      ]}
    />
  </div>
{/if}
