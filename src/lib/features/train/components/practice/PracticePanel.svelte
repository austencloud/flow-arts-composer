<!--
  PracticePanel.svelte - Practice Tab Container

  Always shows the training workspace (camera + beat grid) immediately.
  Sequence selection is integrated into the workspace UI for non-disruptive flow.
-->
<script lang="ts">
  import { getTrainPracticeState } from "../../state/train-practice-state.svelte";
  import TrainModePanel from "../TrainModePanel.svelte";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

  const practiceState = getTrainPracticeState();

  function handleSequenceSelect(sequence: SequenceData) {
    practiceState.setLastSequence(sequence);
  }

  function handleSequenceClear() {
    practiceState.clearLastSequence();
  }

  function handleSessionComplete() {
    // Add to recent sequences when training session completes
    if (practiceState.lastSequenceData) {
      practiceState.addToRecentSequences(practiceState.lastSequenceData);
    }
  }
</script>

<div class="practice-panel">
  <!-- Main Content: Always show training workspace -->
  <div class="practice-content">
    <TrainModePanel
      sequence={practiceState.lastSequenceData}
      practiceMode={practiceState.currentMode}
      modeConfig={practiceState.getCurrentModeConfig()}
      onSequenceSelect={handleSequenceSelect}
      onSequenceClear={handleSequenceClear}
      onSessionComplete={handleSessionComplete}
    />
  </div>
</div>

<style>
  .practice-panel {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    background: transparent;
    container-type: size;
    container-name: practice-panel;
  }

  .practice-content {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
</style>
