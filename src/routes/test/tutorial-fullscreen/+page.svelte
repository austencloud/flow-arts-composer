<!--
  Test harness for the Create tutorial fullscreen-on-mobile change.
  Renders the REAL CreateTutorialWizard. Resize the viewport to <=900px
  (375 / 414) to see the edge-to-edge treatment. Walk pick-start -> add-step
  to verify pictograph tiles grow.
-->
<script lang="ts">
  import CreateTutorialWizard from "#lib/shared/onboarding/components/create-tutorial/CreateTutorialWizard.svelte";
  import { createTutorialState } from "#lib/shared/onboarding/state/create-tutorial-state.svelte.js";

  // Always start fresh at the first step. Pass ?step=N (0-3) to jump straight to
  // a step for isolated verification (e.g. ?step=3 lands on the Ready step).
  createTutorialState.reset();
  if (typeof window !== "undefined") {
    const jump = Number(new URLSearchParams(window.location.search).get("step"));
    if (Number.isFinite(jump)) {
      for (let i = 0; i < jump; i++) createTutorialState.advance();
    }
  }

  function handleComplete() {
    createTutorialState.reset();
  }
  function handleSkip() {
    createTutorialState.reset();
  }
</script>

<CreateTutorialWizard onComplete={handleComplete} onSkip={handleSkip} />
