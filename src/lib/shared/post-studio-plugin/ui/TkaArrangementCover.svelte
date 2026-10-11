<script lang="ts">
  import type { VideoEditorState } from "@austencloud/video-editor";
  import { findItem } from "@austencloud/video-editor/core";
  import type { ArrangementSnapshot } from "#lib/shared/media-composition/domain/arrangement.js";
  import { setArrangementSnapshot } from "#lib/shared/media-composition/domain/post-project-edits.js";
  import type { ArrangementEditorComponent } from "#lib/shared/composition-root/arrangement-editor.js";
  import { useTkaEditor } from "./tka-editor-context";

  /**
   * The arrangement editor over the whole workspace while the arrangement
   * mode is on. Apply writes the grid back as one undo step; Cancel leaves
   * the item as it was. When the item goes away, the mode ends.
   */
  let { editor }: { editor: VideoEditorState } = $props();
  const tka = useTkaEditor();

  let ArrangementEditor = $state.raw<ArrangementEditorComponent | null>(null);

  const item = $derived.by(() => {
    const id = tka.editingArrangementId;
    const found = id ? findItem(editor.project, id)?.item : null;
    return found?.kind === "arrangement" ? found : null;
  });

  $effect(() => {
    if (!item) tka.editArrangement(null);
  });

  $effect(() => {
    if (!item || ArrangementEditor) return;
    void import("#lib/shared/composition-root/arrangement-editor.js")
      .then((module) => module.loadArrangementEditor())
      .then((component) => (ArrangementEditor = component));
  });

  function apply(snapshot: ArrangementSnapshot): void {
    const target = item;
    if (target && !editor.isLocked(target.id)) {
      editor.edit((project, context) =>
        setArrangementSnapshot(project, target.id, snapshot, context)
      );
    }
    tka.editArrangement(null);
  }
</script>

{#if item}
  <div class="arrangement-workspace">
    {#if ArrangementEditor}
      <ArrangementEditor
        snapshot={item.snapshot}
        active={tka.active}
        onapply={apply}
        oncancel={() => tka.editArrangement(null)}
        title={item.label ?? "Arrangement"}
      />
    {:else}
      <p>Opening arrangement…</p>
    {/if}
  </div>
{/if}

<style>
  .arrangement-workspace {
    min-height: 0;
    height: 100%;
    width: 100%;
  }

  .arrangement-workspace > p {
    margin: auto;
    padding: 1rem;
    color: var(--theme-text-secondary, #aaa);
  }
</style>
