<script lang="ts">
  import { page } from "$app/state";
  import VisitorReplayScreen from "#lib/features/admin/components/VisitorReplayScreen.svelte";

  const notificationId = $derived(page.url.searchParams.get("notification"));
</script>

<svelte:head>
  <title>Site visitor · Flow Arts Composer</title>
</svelte:head>

{#if notificationId}
  {#key notificationId}
    <VisitorReplayScreen {notificationId} />
  {/key}
{:else}
  <main class="missing">
    <p>No visit alert named.</p>
    <a href="/create?sheet=inbox&inboxTab=notifications"
      >Back to notifications</a
    >
  </main>
{/if}

<style>
  .missing {
    display: grid;
    min-height: 100dvh;
    place-content: center;
    justify-items: center;
    gap: 1rem;
    color: var(--theme-text, #f7f7fb);
    background: var(--theme-bg, #0f1015);
  }

  .missing a {
    color: var(--theme-accent);
  }
</style>
