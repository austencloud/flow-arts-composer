<script lang="ts">
  import SequenceTransformActions from "#lib/shared/create/components/SequenceTransformActions.svelte";
  import type { PostSequenceAction } from "#lib/shared/media-composition/domain/post-project.js";
  import {
    pressSequenceAction,
    resetSequenceActions,
  } from "#lib/shared/media-composition/domain/post-sequence-actions.js";
  import type { PostEditorState } from "#lib/shared/media-composition/state/post-editor-state.svelte.js";

  /**
   * Mirror, flip, turn, or swap the post's notation without touching its
   * footage or the saved sequence. Each press is one edit, so undo takes it
   * back; lining the notation up with the clips stays the author's call.
   */
  let {
    editor,
    locked,
    busy,
  }: {
    editor: PostEditorState;
    locked: boolean;
    /** The changed notation is still being prepared. */
    busy: boolean;
  } = $props();

  const NAMES: Record<PostSequenceAction, string> = {
    mirror: "Mirror",
    flip: "Flip",
    "rotate-left": "Rotate left",
    "rotate-right": "Rotate right",
    swap: "Swap colors",
  };

  const actions = $derived(editor.project.sequenceActions ?? []);

  function press(action: PostSequenceAction) {
    editor.edit((project, ctx) => pressSequenceAction(project, action, ctx));
  }

  function reset() {
    editor.edit((project, ctx) => resetSequenceActions(project, ctx));
  }
</script>

<SequenceTransformActions
  hasSequence={!locked}
  hasSelection={false}
  isTransforming={busy}
  showEditInConstructor={false}
  toolbar
  rotationDegrees={90}
  showRotationDegreesInLabel
  actionSubject="this post's sequence"
  onMirror={() => press("mirror")}
  onFlip={() => press("flip")}
  onRotateCCW={() => press("rotate-left")}
  onRotateCW={() => press("rotate-right")}
  onSwap={() => press("swap")}
  onReset={actions.length ? reset : undefined}
/>
<p class="hint" aria-live="polite">
  {actions.length
    ? `Applied: ${actions.map((action) => NAMES[action]).join(", ")}.`
    : "Nothing applied."}
</p>
<p class="hint">
  Changes this post's animation, moves, and card. The saved sequence stays as it
  is, and the video keeps its own Mirror and Rotate under Crop.
</p>

<style>
  .hint {
    margin: 0;
    color: var(--theme-text-secondary, #aaa);
    font-size: 0.875rem;
    line-height: 1.4;
  }
</style>
