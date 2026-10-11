<script lang="ts">
  import type { Snippet } from "svelte";
  import { useStrings } from "@austencloud/video-editor/strings";
  import type { VideoEditorState } from "@austencloud/video-editor";
  import {
    Icon,
    faRotateLeft,
    faRotateRight,
  } from "@austencloud/video-editor/icons";

  const t = useStrings();

  /**
   * History on the left, the post's actions on the right. Undo and Redo are
   * the app's Ctrl+Z and Ctrl+Y targets, so the keys and the buttons always
   * agree. The actions are absent when the page shows them in its own header.
   */
  interface Props {
    editor: VideoEditorState;
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
      <Icon icon={faRotateLeft} />
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
      <Icon icon={faRotateRight} />
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
    width: var(--ve-min-touch-target, 44px);
    height: var(--ve-min-touch-target, 44px);
    border: 1px solid var(--ve-theme-stroke, #484755);
    border-radius: 0.625rem;
    color: var(--ve-theme-text, #fff);
    background: var(--ve-theme-card-bg);
    cursor: pointer;
    transition:
      background-color var(--ve-transition-fast),
      border-color var(--ve-transition-fast);
  }

  @media (hover: hover) {
    .icon-button:hover:not(:disabled) {
      border-color: var(--ve-theme-stroke-strong, #6b6a7a);
      background: var(--ve-theme-card-hover-bg);
    }
  }

  .icon-button:focus-visible {
    outline: 2px solid var(--ve-theme-accent, currentColor);
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
