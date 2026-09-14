<script lang="ts">
  import type { ExperienceViewMode } from "../../../domain/types";
  import MotionsConceptExperience from "./MotionsConceptExperience.svelte";

  let {
    viewMode = "step",
    onComplete,
    onBack,
  } = $props<{
    viewMode?: ExperienceViewMode;
    onComplete?: (nextConceptId?: string) => void;
    onBack?: () => void;
  }>();

  let lesson: MotionsConceptExperience | undefined = $state();

  export function handleBack(): void {
    lesson?.handleBack();
  }
</script>

<MotionsConceptExperience
  bind:this={lesson}
  timingDirectionOnly
  {viewMode}
  {onComplete}
  {onBack}
/>
