<script lang="ts">
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";

  let {
    saving,
    error,
    disk,
    onBackup,
    onRestore,
    onRetry,
  }: {
    saving: boolean;
    error: string | null;
    disk: boolean;
    onBackup: () => void;
    onRestore: () => void;
    onRetry: () => void;
  } = $props();
</script>

<div class="draft-status">
  <span
    role={error ? "alert" : "status"}
    title={error ?? undefined}
    class:error
  >
    {error
      ? "Save failed — download a backup"
      : saving
        ? "Saving…"
        : disk
          ? "Saved to this computer"
          : "Saved in this browser"}
  </span>
  {#if error && disk}
    <PanelButton onclick={onRetry}>Retry save</PanelButton>
  {/if}
  <PanelButton onclick={onBackup}>Save backup</PanelButton>
  <PanelButton onclick={onRestore}>Restore backup</PanelButton>
</div>

<style>
  .draft-status {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.5rem;
    min-width: 0;
    color: var(--theme-text-muted, #b7b7c2);
    font-size: var(--font-size-compact, 0.75rem);
  }

  .error {
    color: var(--semantic-error, #ffb4b4);
  }

  .draft-status > span {
    flex-basis: 100%;
  }
</style>
