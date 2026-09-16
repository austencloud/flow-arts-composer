<!--
  StepMappingView.svelte

  Wraps the canonical StepMapEditor with the selected sequence context. The
  parent decides whether the result is local or belongs to a saved TKA video.
-->
<script lang="ts">
  import type { StepMap } from "$lib/shared/video-collaboration/domain/collaborative-video";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import StepMapEditor from "$lib/shared/sequence-viewer/components/step-mapping/StepMapEditor.svelte";
  import TKAWordGlyph from "$lib/shared/choreo-card/components/TKAWordGlyph.svelte";
  import { simplifyRepeatedWord } from "$lib/shared/foundation/utils/word-simplifier";

  interface Props {
    videoUrl: string;
    videoDuration: number;
    stepCount: number;
    sequence: SequenceData;
    existingStepMap: StepMap | null;
    /** Keys the editor's autosaved draft; see StepMapEditor. */
    draftKey?: string;
    onSave: (beatMap: StepMap) => void | Promise<void>;
    onBack: () => void;
  }

  const {
    videoUrl,
    videoDuration,
    stepCount,
    sequence,
    existingStepMap,
    draftKey,
    onSave,
    onBack,
  }: Props = $props();

  // Default BPM - user can adjust later in the synced preview
  const defaultBpm = 60;

  // A LOOP repeats its word by construction; the smallest form is the one to
  // show. See .claude/rules/simplified-word-display.md.
  const displayWord = $derived(
    sequence.word ? simplifyRepeatedWord(sequence.word) : ""
  );

  async function handleEditorSave(beatMap: StepMap): Promise<void> {
    await onSave(beatMap);
  }
</script>

<div class="step-mapping-view">
  <div class="mapping-header">
    <button class="back-btn" onclick={onBack} type="button">
      <i class="fas fa-arrow-left" aria-hidden="true"></i>
      Back
    </button>
    <span class="mapping-title">
      Mapping:
      <strong>
        {#if displayWord}
          <TKAWordGlyph word={displayWord} height={16} darkMode />
        {:else}
          {sequence.name ?? "Untitled"}
        {/if}
      </strong>
      ({stepCount} steps)
    </span>
  </div>

  <div class="editor-container">
    <StepMapEditor
      {videoUrl}
      {videoDuration}
      steps={sequence.steps}
      startPlacement={sequence.startPlacement ?? sequence.startingPlacement}
      bpm={defaultBpm}
      initialStepMap={existingStepMap ?? undefined}
      {draftKey}
      onSave={handleEditorSave}
      onClose={onBack}
    />
  </div>
</div>

<style>
  .step-mapping-view {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .mapping-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 16px;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    flex-shrink: 0;
  }

  .back-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 6px;
    background: transparent;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.6));
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    cursor: pointer;
  }

  .back-btn:hover {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text, #ffffff);
  }

  .mapping-title {
    font-size: var(--font-size-min, 14px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.6));
  }

  .mapping-title strong {
    color: var(--theme-text, #ffffff);
  }

  .editor-container {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  @media (prefers-reduced-motion: reduce) {
    .back-btn {
      transition: none !important;
    }
  }
</style>
