<script lang="ts">
  import type { VideoEditorState } from "@austencloud/video-editor";
  import ChoreoCard from "#lib/shared/sequence-viewer/components/ChoreoCard.svelte";
  import {
    clampDisplayedBeatNumber,
    displayedBeatNumber,
  } from "#lib/shared/animation-engine/services/step-calculator.js";
  import { postCardHighlightedStepIndex } from "./post-card-highlight";
  import { tkaEditorOf } from "./tka-editor-context";

  /**
   * The post's sequence beside the preview while editing, its step lit as
   * the playhead reaches it, so the choreography stays in view next to the
   * video it becomes.
   */
  let { editor }: { editor: VideoEditorState } = $props();

  const facts = $derived(tkaEditorOf(editor));
  const sequence = $derived(facts?.sequence ?? null);
  const options = $derived(facts?.cardRenderOptions ?? null);

  /** The step on screen now; null while no sequence layer is showing. */
  const highlightedStepIndex = $derived.by(() => {
    const steps = sequence?.steps.length ?? 0;
    if (!steps) return null;
    const layer = editor.frameLayers.find(
      (it) =>
        it.displayedBeatNumber !== undefined ||
        it.sequencePosition !== undefined
    );
    if (!layer) return null;
    const beat =
      layer.displayedBeatNumber ??
      displayedBeatNumber(layer.sequencePosition ?? 0, false);
    return postCardHighlightedStepIndex(clampDisplayedBeatNumber(beat, steps));
  });
</script>

{#if sequence}
  <div class="sequence-aside" aria-label="Sequence">
    <div class="card">
      <ChoreoCard
        {sequence}
        {highlightedStepIndex}
        showHighlight={highlightedStepIndex !== null}
        darkMode
        showWord
        showStepNumbers
        showDifficultyLevel={false}
        includeStartPlacement={options?.includeStartPlacement ?? true}
        showLoopGlyph={options?.showLoopGlyph ?? true}
        leftPropType={options?.leftPropTypeOverride ??
          options?.propTypeOverride}
        rightPropType={options?.rightPropTypeOverride ??
          options?.propTypeOverride}
        forceContain
        fitWidth
      />
    </div>
  </div>
{/if}

<style>
  .sequence-aside {
    display: grid;
    align-items: center;
    width: 100%;
    height: 100%;
    min-height: 0;
  }

  .card {
    max-height: 100%;
    min-height: 0;
    overflow: hidden;
    border: 1px solid var(--ve-theme-stroke, rgba(255, 255, 255, 0.08));
    border-radius: 0.75rem;
    background: #08080c;
  }
</style>
