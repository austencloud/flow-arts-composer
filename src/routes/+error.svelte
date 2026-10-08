<script lang="ts">
  import { page } from "$app/state";
  import ErrorScreen from "$lib/shared/foundation/ui/ErrorScreen.svelte";
  import { t } from "$lib/shared/i18n/i18n.svelte.js";

  function handleRetry() {
    window.location.reload();
  }

  const notFound = $derived(page.status === 404);

  const errorMessage = $derived(
    page.error?.message ?? "Something went wrong"
  );
</script>

<svelte:head>
  {#if notFound}
    <title>{t("error_page_not_found")}</title>
  {/if}
</svelte:head>

<ErrorScreen
  error={errorMessage}
  title={notFound ? t("error_page_not_found") : undefined}
  onRetry={notFound ? undefined : handleRetry}
/>
