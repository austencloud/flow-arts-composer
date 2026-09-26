<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import type { ExperienceViewMode } from "../../../domain/types";
  import TimingDirectionExperience from "./TimingDirectionExperience.svelte";
  import { ALPHA_BETA_MODES } from "./pictograph-foundation-content";

  let {
    onComplete,
    onBack,
    viewMode = "step",
  } = $props<{
    onComplete?: () => void;
    onBack?: () => void;
    viewMode?: ExperienceViewMode;
  }>();

  let experience = $state<TimingDirectionExperience | null>(null);

  export function handleBack(): void {
    experience?.handleBack();
  }
</script>

<TimingDirectionExperience
  bind:this={experience}
  conceptId="dual-shifts-alpha-beta"
  title={t("learn_ui_alpha_beta_time_direction")}
  modes={ALPHA_BETA_MODES}
  {onComplete}
  {onBack}
  {viewMode}
/>
