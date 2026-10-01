<script lang="ts">
  /**
   * Where the post last saved itself, and when. In a header row the text
   * keeps the width of its longest wording so the buttons beside it never
   * move, and a narrow header keeps only the icon.
   */
  let {
    saving,
    error,
    disk,
    savedAt = null,
    header = false,
  }: {
    saving: boolean;
    error: string | null;
    disk: boolean;
    /** When the last save finished, shown after the place. */
    savedAt?: number | null;
    header?: boolean;
  } = $props();

  const place = $derived(
    disk ? "Saved to this computer" : "Saved in this browser"
  );
  const time = $derived(
    savedAt === null
      ? null
      : new Date(savedAt).toLocaleTimeString([], {
          hour: "numeric",
          minute: "2-digit",
        })
  );
  const label = $derived(
    error
      ? "Save failed"
      : saving
        ? "Saving…"
        : time
          ? `${place} · ${time}`
          : place
  );
</script>

<span
  role={error ? "alert" : "status"}
  title={error ?? undefined}
  class="draft-status"
  class:error
  class:header
>
  <i
    class="fa-solid {error
      ? 'fa-circle-exclamation'
      : saving
        ? 'fa-spinner fa-spin'
        : 'fa-circle-check'}"
    aria-hidden="true"
  ></i>
  <span class="label">
    {#if header}<span class="ghost" aria-hidden="true">{place} · 12:59 PM</span
      >{/if}<span class="live">{label}</span>
  </span>
</span>

<style>
  .draft-status {
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

  .label {
    display: grid;
    min-width: 0;
    font-variant-numeric: tabular-nums;
  }

  .ghost,
  .live {
    grid-area: 1 / 1;
  }

  .ghost {
    visibility: hidden;
  }

  .header .label {
    justify-items: end;
  }

  .error {
    color: var(--semantic-error, #ffb4b4);
  }

  /* A narrow header keeps the icon; the words stay for screen readers. */
  @container post-editor-header (max-width: 52rem) {
    .header .label {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .fa-spin {
      animation: none;
    }
  }
</style>
