<!--
  /learn/staff-spinning-choreography — GATED 2026-07-27.

  Production shows the shared review notice. Development renders the complete
  article from _components/StaffSpinningChoreographyDraft.svelte so it can be
  reviewed at its canonical URL.

  To un-gate after human review: replace this wrapper with the draft, remove the
  noindex head below, re-add the route to src/routes/sitemap.xml/+server.ts, and
  update the focused review-gate contract test.
-->
<script lang="ts">
  import { dev } from "$app/env";
  import UnderConstruction from "#lib/shared/landing/components/UnderConstruction.svelte";
  import StaffSpinningChoreographyDraft from "./_components/StaffSpinningChoreographyDraft.svelte";
</script>

<svelte:head>
  {#if !dev}
    <title>Learn Staff Choreography | The Kinetic Alphabet</title>
    <meta
      name="description"
      content="This staff choreography page is awaiting human review. The guide and Double Staff Codex are ready to use."
    />
    <meta name="robots" content="noindex, follow" />
  {/if}
</svelte:head>

{#if dev}
  <StaffSpinningChoreographyDraft />
{:else}
  <UnderConstruction
    title="Learn Staff Choreography"
    eyebrow="Awaiting human review"
    icon="fa-user-check"
    note="This page is waiting for human review before it goes live. The guide and Double Staff Codex are ready to use."
    destinations={[
      { label: "Open the guide", href: "/guide", icon: "fa-book-open" },
      {
        label: "Double Staff Codex",
        href: "/guide/codex",
        icon: "fa-graduation-cap",
      },
    ]}
  />
{/if}
