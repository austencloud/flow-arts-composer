<!--
  TutorialStepStub - test-only stand-in for the 4 real tutorial step
  components (PickStartPlacementStep / AddStepTutorialStep / PlaySequenceStep /
  ReadyStep), used ONLY by CreateTutorialWizard.svelte.test.ts.

  The real steps embed live Create-module pickers/players (Firestore-backed
  state, AnimatorCanvas, 3D pipelines) that are heavy and orthogonal to what
  the wizard-chrome test covers (dialog role, focus trap, touch targets) —
  same rationale as GameShellTestHarness.svelte for the play arcade. Renders
  a single focusable control so Tab-containment assertions have something to
  land on.
-->
<script lang="ts">
  interface Props {
    onAdvance: () => void;
  }

  const { onAdvance }: Props = $props();
</script>

<div class="tutorial-step">
  <div class="step-header">
    <h1 id="tutorial-step-title" class="title">Stub step</h1>
  </div>
  <button onclick={onAdvance}>Stub advance</button>
</div>
