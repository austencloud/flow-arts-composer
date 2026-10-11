<script lang="ts">
  import {
    Icon,
    faCircleCheck,
    faCircleExclamation,
    faSpinner,
  } from "@austencloud/video-editor/icons";

  const ELLIPSIS = String.fromCharCode(8230);
  const MIDDOT = String.fromCharCode(183);

  /**
   * Where the post last saved itself, and when. In a header row the text
   * keeps the width of its longest wording so the buttons beside it never
   * move. A narrow header keeps only the icon, and a phone-width one
   * leaves the state to the Save button.
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
        ? "Saving" + ELLIPSIS
        : time
          ? `${place} ${MIDDOT} ${time}`
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
  <Icon
    icon={error ? faCircleExclamation : saving ? faSpinner : faCircleCheck}
    spin={!error && saving}
  />
  <span class="label">
    {#if header}<span class="ghost" aria-hidden="true"
        >{place} &middot; 12:59 PM</span
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
    color: var(--ve-theme-text-muted, #b7b7c2);
    font-size: var(--ve-font-size-compact, 0.75rem);
  }

  .draft-status :global(.ve-icon) {
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
    color: var(--ve-semantic-error, #ffb4b4);
  }

  /* A narrow header keeps the icon; the words stay for screen readers. */
  @container post-editor-header (max-width: 46rem) {
    .header .label {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
    }
  }

  /* At phone width the Save button shows the state on its own. */
  @container post-editor-header (max-width: 30rem) {
    .header {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
    }
  }
</style>
