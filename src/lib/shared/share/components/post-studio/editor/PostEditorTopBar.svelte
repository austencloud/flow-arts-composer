<script lang="ts">
  import type { Snippet } from "svelte";
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import type { PostEditorState } from "$lib/shared/media-composition/state/post-editor-state.svelte";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";

  /**
   * History on the left, Export on the right. Undo and Redo are the app's
   * Ctrl+Z and Ctrl+Y targets, so the keys and the buttons always agree.
   * Export opens the Export panel, where the render starts. A screen that
   * ends in its own way, as Crop ends in Cancel and Done, puts its buttons
   * in Export's place.
   */
  interface Props {
    editor: PostEditorState;
    exporting: boolean;
    onExport: () => void;
    onImport?: () => void;
    trailing?: Snippet;
  }

  let { editor, exporting, onExport, onImport, trailing }: Props = $props();
</script>

<div class="top-bar">
  <div class="history">
    {#if onImport && !trailing}
      <button
        type="button"
        class="icon-button"
        disabled={exporting}
        onclick={onImport}
        aria-label="Import InShot project"
        title="Import InShot project"
      >
        <i class="fa-solid fa-file-import" aria-hidden="true"></i>
      </button>
    {/if}
    <button
      type="button"
      class="icon-button"
      data-undo-shortcut
      disabled={!editor.canUndo || exporting}
      onclick={editor.undo}
      aria-label={t("post_editor_undo")}
      aria-keyshortcuts="Control+Z"
      title={t("post_editor_undo")}
    >
      <i class="fa-solid fa-rotate-left" aria-hidden="true"></i>
    </button>
    <button
      type="button"
      class="icon-button"
      data-redo-shortcut
      disabled={!editor.canRedo || exporting}
      onclick={editor.redo}
      aria-label={t("post_editor_redo")}
      aria-keyshortcuts="Control+Y"
      title={t("post_editor_redo")}
    >
      <i class="fa-solid fa-rotate-right" aria-hidden="true"></i>
    </button>
  </div>
  {#if trailing}
    {@render trailing()}
  {:else}
    <PanelButton
      variant="primary"
      onclick={onExport}
      disabled={exporting}
      ariaBusy={exporting}
    >
      <i
        class="fa-solid {exporting ? 'fa-spinner fa-spin' : 'fa-file-export'}"
        aria-hidden="true"
      ></i>
      {t("post_editor_export")}
    </PanelButton>
  {/if}
</div>

<style>
  .top-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    min-width: 0;
  }

  .history {
    display: flex;
    gap: 0.375rem;
  }

  .icon-button {
    display: grid;
    place-items: center;
    width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
    border: 1px solid var(--theme-stroke, #484755);
    border-radius: 0.625rem;
    color: var(--theme-text, #fff);
    background: var(--theme-card-bg);
    cursor: pointer;
    transition:
      background-color var(--transition-fast),
      border-color var(--transition-fast);
  }

  @media (hover: hover) {
    .icon-button:hover:not(:disabled) {
      border-color: var(--theme-stroke-strong, #6b6a7a);
      background: var(--theme-card-hover-bg);
    }
  }

  .icon-button:focus-visible {
    outline: 2px solid var(--theme-accent, currentColor);
    outline-offset: 2px;
  }

  .icon-button:disabled {
    cursor: not-allowed;
    opacity: 0.4;
  }

  @media (forced-colors: active) {
    .icon-button {
      border-color: ButtonText;
      color: ButtonText;
      background: ButtonFace;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .icon-button {
      transition: none;
    }

    .fa-spin {
      animation: none;
    }
  }
</style>
