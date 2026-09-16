<script lang="ts">
  import { setContext } from "svelte";
  import { createConstructTutorialState } from "../state/construct-tutorial-state.svelte";
  import ConstructTutorialGuide from "./ConstructTutorialGuide.svelte";

  let { atPictographStep = false, atPlayStep = false } = $props<{
    atPictographStep?: boolean;
    atPlayStep?: boolean;
  }>();

  const constructTutorialState = createConstructTutorialState();
  constructTutorialState.start();

  if (atPictographStep || atPlayStep) {
    constructTutorialState.recordStartPlacement("α1");
  }

  if (atPlayStep) {
    constructTutorialState.recordOptionApplied({
      letter: "A",
      stepNumber: 1,
    });
  }

  setContext("createModule", { constructTutorialState });
</script>

<div class="harness">
  <ConstructTutorialGuide />
</div>

<style>
  .harness {
    width: min(600px, 100%);
    container-type: inline-size;
    --min-touch-target: 44px;
    --theme-panel-bg: #ffffff;
    --theme-card-bg: #f3f4f6;
    --theme-card-hover-bg: #e5e7eb;
    --theme-stroke: #9ca3af;
    --theme-stroke-strong: #6b7280;
    --theme-text: #111827;
    --theme-text-dim: #4b5563;
    --theme-accent: #6d28d9;
  }
</style>
