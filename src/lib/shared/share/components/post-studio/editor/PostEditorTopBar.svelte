<script lang="ts">
  import type { Snippet } from "svelte";
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import type { PostEditorState } from "$lib/shared/media-composition/state/post-editor-state.svelte";

  /**
   * History on the left, the post's actions on the right. Undo and Redo are
   * the app's Ctrl+Z and Ctrl+Y targets, so the keys and the buttons always
   * agree. The actions are absent when the page shows them in its own header.
   */
  interface Props {
    editor: PostEditorState;
    exporting: boolean;
    actions?: Snippet;
    draftStatus?: Snippet;
  }

  let { editor, exporting, actions, draftStatus }: Props = $props();
</script>

<div class="top-bar">
  <div class="history">
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
  {#if draftStatus}
    <div class="draft-save">{@render draftStatus()}</div>
  {/if}
  {#if actions}
    <div class="end-actions">{@render actions()}</div>
  {/if}
</div>

<style>
  .top-bar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
  }

  .history {
    display: flex;
    flex-shrink: 0;
    gap: 0.375rem;
  }

  .end-actions {
    display: flex;
    flex-shrink: 0;
    margin-left: auto;
  }

  .draft-save {
    display: flex;
    flex-wrap: wrap;
    flex: 1 1 auto;
    min-width: 0;
  }

  @container post-top-bar (max-width: 28rem) {
    .top-bar {
      flex-wrap: wrap;
    }

    .draft-save {
      order: 1;
      flex-basis: 100%;
    }

    .end-actions {
      margin-left: auto;
    }
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
  }
</style>
