<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import type {
    CatalogTakeSource,
    PostEditorState,
  } from "$lib/shared/media-composition/state/post-editor-state.svelte";
  import PostEditorAddMenu from "./PostEditorAddMenu.svelte";

  /**
   * The editor's actions: history, the cuts that work at the playhead,
   * adding things, the Tutorial preset and the render. Undo and Redo are the
   * app's Ctrl+Z targets, so the keys and the buttons always agree.
   */
  interface Props {
    editor: PostEditorState;
    catalog: readonly CatalogTakeSource[];
    canTapBeats: boolean;
    canExport: boolean;
    exporting: boolean;
    onAddDeviceVideo: () => void;
    onTapBeats: () => void;
    onTutorial: () => void;
    onExport: () => void;
  }

  let {
    editor,
    catalog,
    canTapBeats,
    canExport,
    exporting,
    onAddDeviceVideo,
    onTapBeats,
    onTutorial,
    onExport,
  }: Props = $props();
</script>

<div class="toolbar-host">
  <div class="toolbar" role="group" aria-label={t("post_editor_tools")}>
    <div class="group">
      <button
        type="button"
        class="post-editor-tool"
        data-undo-shortcut
        disabled={!editor.canUndo || exporting}
        onclick={editor.undo}
        aria-label={t("post_editor_undo")}
        title={t("post_editor_undo")}
      >
        <i class="fa-solid fa-rotate-left" aria-hidden="true"></i>
        <span class="post-editor-tool-label">{t("post_editor_undo")}</span>
      </button>
      <button
        type="button"
        class="post-editor-tool"
        data-redo-shortcut
        disabled={!editor.canRedo || exporting}
        onclick={editor.redo}
        aria-label={t("post_editor_redo")}
        title={t("post_editor_redo")}
      >
        <i class="fa-solid fa-rotate-right" aria-hidden="true"></i>
        <span class="post-editor-tool-label">{t("post_editor_redo")}</span>
      </button>
    </div>

    <div class="group">
      <button
        type="button"
        class="post-editor-tool"
        disabled={!editor.splitTarget || exporting}
        onclick={() => editor.splitAtPlayhead()}
        aria-label={t("post_editor_split")}
        aria-keyshortcuts="S"
        title={t("post_editor_split_hint")}
      >
        <i class="fa-solid fa-scissors" aria-hidden="true"></i>
        <span class="post-editor-tool-label">{t("post_editor_split")}</span>
      </button>
      <button
        type="button"
        class="post-editor-tool"
        disabled={!editor.selectionEditable || exporting}
        onclick={() => editor.duplicateSelected()}
        aria-label={t("post_editor_duplicate")}
        aria-keyshortcuts="Control+D"
        title={t("post_editor_duplicate")}
      >
        <i class="fa-solid fa-clone" aria-hidden="true"></i>
        <span class="post-editor-tool-label">{t("post_editor_duplicate")}</span>
      </button>
      <button
        type="button"
        class="post-editor-tool"
        disabled={!editor.selectionEditable || exporting}
        onclick={() => editor.deleteSelected()}
        aria-label={t("post_editor_delete")}
        aria-keyshortcuts="Delete"
        title={t("post_editor_delete")}
      >
        <i class="fa-solid fa-trash-can" aria-hidden="true"></i>
        <span class="post-editor-tool-label">{t("post_editor_delete")}</span>
      </button>
      <button
        type="button"
        class="post-editor-tool"
        disabled={!canTapBeats || exporting}
        onclick={onTapBeats}
        aria-label={t("post_editor_beats")}
        title={t("post_editor_beats_hint")}
      >
        <i class="fa-solid fa-drum" aria-hidden="true"></i>
        <span class="post-editor-tool-label">{t("post_editor_beats")}</span>
      </button>
    </div>

    <div class="group">
      <PostEditorAddMenu
        {editor}
        {catalog}
        disabled={exporting}
        {onAddDeviceVideo}
      />
      <button
        type="button"
        class="post-editor-tool"
        disabled={editor.takes.length === 0 || exporting}
        onclick={onTutorial}
        aria-label={t("post_editor_tutorial")}
        title={t("post_editor_tutorial_hint")}
      >
        <i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i>
        <span class="post-editor-tool-label">{t("post_editor_tutorial")}</span>
      </button>
      <button
        type="button"
        class="post-editor-tool primary"
        disabled={!canExport}
        aria-busy={exporting}
        onclick={onExport}
        aria-label={t("post_editor_export")}
        title={t("post_editor_export")}
      >
        <i
          class="fa-solid {exporting ? 'fa-spinner fa-spin' : 'fa-file-export'}"
          aria-hidden="true"
        ></i>
        <span class="post-editor-tool-label">{t("post_editor_export")}</span>
      </button>
    </div>
  </div>
</div>

<style>
  .toolbar-host {
    container: post-editor-toolbar / inline-size;
    min-width: 0;
  }

  .toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    min-width: 0;
  }

  .group {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
    min-width: 0;
  }

  :global(.post-editor-tool) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    box-sizing: border-box;
    min-width: var(--min-touch-target, 44px);
    min-height: var(--min-touch-target, 44px);
    padding: 0 0.75rem;
    border: 1px solid var(--theme-stroke, #484755);
    border-radius: 0.625rem;
    color: var(--theme-text, #fff);
    background: var(--theme-card-bg);
    font: inherit;
    font-size: 0.875rem;
    font-weight: 500;
    white-space: nowrap;
    cursor: pointer;
    transition:
      background-color var(--transition-normal),
      border-color var(--transition-normal);
  }

  @media (hover: hover) {
    :global(.post-editor-tool:hover:not(:disabled)) {
      border-color: var(--theme-stroke-strong, #6b6a7a);
      background: var(--theme-card-hover-bg);
    }
  }

  :global(.post-editor-tool:focus-visible) {
    outline: 2px solid var(--theme-accent, currentColor);
    outline-offset: 2px;
  }

  :global(.post-editor-tool:disabled) {
    cursor: not-allowed;
    opacity: 0.45;
  }

  :global(.post-editor-tool[data-state="open"]) {
    border-color: var(--theme-accent, #d4813a);
  }

  :global(.post-editor-tool.primary) {
    border-color: var(--theme-accent, #d4813a);
    color: var(--theme-text-on-accent, #fff);
    background: var(--theme-accent, #d4813a);
  }

  @media (hover: hover) {
    :global(.post-editor-tool.primary:hover:not(:disabled)) {
      border-color: var(--theme-accent, #d4813a);
      background: color-mix(in srgb, var(--theme-accent, #d4813a) 88%, #000);
    }
  }

  :global(.post-editor-tool i) {
    width: 1em;
    text-align: center;
  }

  /* Icons alone until the labels fit on one row; each button keeps its
     accessible name either way. */
  :global(.post-editor-tool-label) {
    display: none;
  }

  @container post-editor-toolbar (min-width: 52rem) {
    :global(.post-editor-tool-label) {
      display: inline;
    }
  }

  @media (forced-colors: active) {
    :global(.post-editor-tool),
    :global(.post-editor-tool.primary) {
      border: 1px solid ButtonText;
      color: ButtonText;
      background: ButtonFace;
      forced-color-adjust: auto;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    :global(.post-editor-tool) {
      transition: none;
    }
    :global(.post-editor-tool .fa-spin) {
      animation: none;
    }
  }
</style>
