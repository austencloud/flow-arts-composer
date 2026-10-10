<script lang="ts">
  import type { Snippet } from "svelte";
  import type { VideoEditorState } from "@austencloud/video-editor";
  import EditHistoryShortcutBridge from "$lib/shared/keyboard/components/EditHistoryShortcutBridge.svelte";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import { useTkaEditor } from "./tka-editor-context";

  /**
   * The bar over the timing mode: Back to editing, the take being mapped and
   * the save status. Its undo keys are the session's while the mode is open.
   */
  let {
    editor: _editor,
    draftStatus,
  }: { editor: VideoEditorState; draftStatus: Snippet } = $props();

  const tka = useTkaEditor();
  const session = tka.timing;
</script>

<div class="timing-toolbar">
  <EditHistoryShortcutBridge
    onUndo={session.undo}
    onRedo={session.redo}
    canUndo={session.canUndo}
    canRedo={session.canRedo}
  />
  <PanelButton onclick={session.exit} ariaLabel="Back to editing">
    <i class="fa-solid fa-arrow-left" aria-hidden="true"></i>
    <span class="back-label">Back to editing</span><span class="back-short"
      >Back</span
    >
  </PanelButton>
  <label class="take-picker">
    <span>Take</span>
    <select
      aria-label="Take to map"
      value={session.take?.id ?? ""}
      onchange={(event) => session.selectTake(event.currentTarget.value)}
    >
      {#each session.takes as take (take.id)}<option value={take.id}
          >{take.label}</option
        >{/each}
    </select>
  </label>
  <div class="timing-save">{@render draftStatus()}</div>
</div>

<style>
  .timing-toolbar {
    grid-area: top;
    display: flex;
    align-items: center;
    gap: 1rem;
    min-width: 0;
  }
  .take-picker {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    min-width: 0;
    color: var(--theme-text-dim, #aaa);
    font-size: var(--mapping-text-size, 0.875rem);
  }
  .take-picker select {
    min-width: 0;
    width: 18rem;
    max-width: 100%;
    min-height: 2.75rem;
    padding: 0.5rem 2rem 0.5rem 0.75rem;
    border: 1px solid var(--theme-stroke);
    border-radius: 0.5rem;
    color: var(--theme-text);
    background: var(--theme-panel-bg);
    font: inherit;
    text-overflow: ellipsis;
  }
  .take-picker select:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }
  .timing-save {
    margin-left: auto;
  }
  .back-short {
    display: none;
  }
  :global(.post-editor[data-layout="phone"]) .timing-toolbar {
    gap: 0.5rem;
  }
  :global(.post-editor[data-layout="phone"]) .take-picker {
    flex: 1;
  }
  :global(.post-editor[data-layout="phone"]) .take-picker select {
    width: 100%;
  }
  :global(.post-editor[data-layout="phone"]) .take-picker > span,
  :global(.post-editor[data-layout="phone"]) .timing-save,
  :global(.post-editor[data-layout="phone"]) .back-label {
    display: none;
  }
  :global(.post-editor[data-layout="phone"]) .back-short {
    display: inline;
  }
  :global(.post-editor[data-short-mapping="true"]) .take-picker {
    max-width: 26rem;
  }
</style>
