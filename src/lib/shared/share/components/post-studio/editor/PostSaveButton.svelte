<script lang="ts">
  import Crossfade from "$lib/shared/components/Crossfade.svelte";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import { DURATION } from "$lib/shared/transitions/transitions";

  /**
   * Saves the post now. Edits already save themselves; this is the button
   * that says so, answers Ctrl+S, and reads Saved once the save lands.
   */
  let {
    status,
    onSave,
    disabled = false,
  }: {
    status: "idle" | "saving" | "saved" | "failed";
    onSave: () => void;
    disabled?: boolean;
  } = $props();

  const LABELS = {
    idle: "Save",
    saving: "Saving…",
    saved: "Saved",
    failed: "Retry save",
  } as const;
  const ICONS = {
    idle: "fa-floppy-disk",
    saving: "fa-spinner fa-spin",
    saved: "fa-check",
    failed: "fa-circle-exclamation",
  } as const;
</script>

<PanelButton
  saveShortcut
  onclick={onSave}
  disabled={disabled || status === "saving"}
  ariaBusy={status === "saving"}
>
  <span
    class="save"
    class:saved={status === "saved"}
    class:failed={status === "failed"}
  >
    <Crossfade key={status} duration={DURATION.fast}>
      <i class="fa-solid {ICONS[status]}" aria-hidden="true"></i>
    </Crossfade>
    <span class="label">
      {#each Object.values(LABELS) as word (word)}<span
          class="ghost"
          aria-hidden="true">{word}</span
        >{/each}<span class="live">{LABELS[status]}</span>
    </span>
  </span>
</PanelButton>

<style>
  .save {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    transition: color var(--transition-fast);
  }

  .saved {
    color: var(--theme-success, #86efac);
  }

  .failed {
    color: var(--semantic-error, #ffb4b4);
  }

  .label {
    display: grid;
    justify-items: start;
  }

  .ghost,
  .live {
    grid-area: 1 / 1;
  }

  .ghost {
    visibility: hidden;
  }

  @media (prefers-reduced-motion: reduce) {
    .save {
      transition: none;
    }

    .fa-spin {
      animation: none;
    }
  }
</style>
