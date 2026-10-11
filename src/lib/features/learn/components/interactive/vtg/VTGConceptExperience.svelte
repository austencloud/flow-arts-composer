<!--
VTGConceptExperience - Multi-page VTG (Velocity-Timing-Direction) learning experience
Teaches the 6 VTG modes: SS, TS, SO, TO, QS, QO
-->
<script lang="ts">
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import {
    VTG_MODES,
    type VTGMode,
  } from "../../../domain/constants/vtg-experience-data";
  import VTGIntroPage from "./vtg-experience/VTGIntroPage.svelte";
  import VTGModePage from "./vtg-experience/VTGModePage.svelte";
  import VTGQuizPage from "./vtg-experience/VTGQuizPage.svelte";
  import ExperienceProgressIndicator from "../ExperienceProgressIndicator.svelte";
  import { getExperiencePersistence } from "../../../state/experience-persistence.svelte";

  import type { ExperienceViewMode } from "../../../domain/types";

  let { onComplete, viewMode = "step" } = $props<{
    onComplete?: () => void;
    viewMode?: ExperienceViewMode;
  }>();

  // Note: Scroll mode not yet implemented for this experience
  // When viewMode === "scroll", falls back to step mode

  const hapticService = getHapticFeedback();

  // Persistence for HMR/refresh survival
  const persistence = getExperiencePersistence("vtg");

  let currentPage = $state(persistence.load().step || 1);
  const totalPages = 8; // Intro + 6 modes + Quiz

  function handleNext() {
    hapticService?.trigger("selection");
    if (currentPage < totalPages) {
      currentPage++;
      persistence.saveStep(currentPage);
    } else {
      handleComplete();
    }
  }

  function handleComplete() {
    persistence.reset();
    onComplete?.();
  }

  function handleQuizComplete() {
    hapticService?.trigger("success");
    handleComplete();
  }

  function getCurrentMode(): VTGMode | null {
    if (currentPage >= 2 && currentPage <= 7) {
      return VTG_MODES[currentPage - 2]!;
    }
    return null;
  }
</script>

<div class="vtg-experience">
  {#if currentPage === 1}
    <VTGIntroPage onNext={handleNext} />
  {:else if currentPage >= 2 && currentPage <= 7}
    {@const mode = getCurrentMode()}
    {#if mode}
      <VTGModePage {mode} isLastMode={currentPage === 7} onNext={handleNext} />
    {/if}
  {:else if currentPage === 8}
    <VTGQuizPage onComplete={handleQuizComplete} />
  {/if}

  <ExperienceProgressIndicator currentStep={currentPage} totalSteps={totalPages} />
</div>

<style>
  .vtg-experience {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 2rem;
    overflow-y: auto;
    overflow-x: hidden;
  }

  @media (max-width: 600px) {
    .vtg-experience {
      padding: 1rem;
    }
  }
</style>
