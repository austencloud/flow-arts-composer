<script lang="ts">
  let {
    saving,
    error,
    disk,
  }: {
    saving: boolean;
    error: string | null;
    disk: boolean;
  } = $props();
</script>

<span role={error ? "alert" : "status"} title={error ?? undefined} class:error>
  <i
    class="fa-solid {error
      ? 'fa-circle-exclamation'
      : saving
        ? 'fa-spinner fa-spin'
        : 'fa-circle-check'}"
    aria-hidden="true"
  ></i>
  {error
    ? "Save failed"
    : saving
      ? "Saving…"
      : disk
        ? "Saved to this computer"
        : "Saved in this browser"}
</span>

<style>
  span {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    min-width: 0;
    white-space: nowrap;
    color: var(--theme-text-muted, #b7b7c2);
    font-size: var(--font-size-compact, 0.75rem);
  }

  i {
    flex: none;
  }

  .error {
    color: var(--semantic-error, #ffb4b4);
  }

  @media (prefers-reduced-motion: reduce) {
    .fa-spin {
      animation: none;
    }
  }
</style>
