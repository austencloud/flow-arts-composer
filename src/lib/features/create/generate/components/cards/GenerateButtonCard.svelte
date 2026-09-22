<!--
GenerateButtonCard.svelte - Generate button as a card in the grid
Always renders as a pure button. Word input is now in WordInputCard.
-->
<script lang="ts">
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { onMount } from "svelte";
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import type { UIGenerationConfig } from "../../state/generate-config.svelte";
  import type { StartEndOptions } from "$lib/shared/create/state/panel-coordination-state.svelte";
  import FontAwesomeIcon from "$lib/shared/foundation/ui/FontAwesomeIcon.svelte";
  import type { HapticFeedback } from "$lib/shared/application/services/haptic-feedback";
  import { uiConfigToGenerationOptions } from "$lib/shared/create/utils/config-mapper";
  import type { GenerationOptions } from "$lib/shared/foundation/domain/models/generation/generate-models";
  import type { StartFeasibilityResult } from "$lib/shared/create/domain/start-feasibility";

  let {
    isGenerating,
    hasSettingsChanged = false,
    onGenerateClicked,
    config,
    startEndOptions = null,
    suspendPulse = false,
    startFeasibility = null,
  } = $props<{
    isGenerating: boolean;
    hasSettingsChanged?: boolean;
    onGenerateClicked: (options: GenerationOptions) => Promise<void>;
    config: UIGenerationConfig;
    startEndOptions?: StartEndOptions | null;
    suspendPulse?: boolean;
    startFeasibility?: StartFeasibilityResult | null;
  }>();

  const noValidStart = $derived(startFeasibility?.feasible === false);
  const isDisabled = $derived(isGenerating || noValidStart);

  let buttonLabel = $derived(
    isGenerating
      ? t("generator_button_generating")
      : noValidStart
        ? "No valid start"
      : hasSettingsChanged
        ? t("generator_button_regenerate")
        : t("generator_button")
  );

  let buttonIcon = $derived(
    hasSettingsChanged && !isGenerating ? "arrows-rotate" : "dice"
  );

  let hapticService: HapticFeedback | null = $state(null);
  let buttonElement: HTMLButtonElement | undefined = $state();
  let wasPulseSuspended = false;

  $effect.pre(() => {
    if (!suspendPulse) {
      wasPulseSuspended = false;
      return;
    }

    if (wasPulseSuspended || !buttonElement) return;

    const liveTransform = getComputedStyle(buttonElement).transform;
    buttonElement.style.setProperty(
      "--generate-pulse-settle-from",
      liveTransform === "none" ? "scale(1)" : liveTransform
    );
    wasPulseSuspended = true;
  });

  onMount(() => {
    hapticService = getHapticFeedback();
  });

  async function handleClick() {
    if (isDisabled) return;
    hapticService?.trigger("selection");
    const generationOptions = uiConfigToGenerationOptions(
      config,
      PropType.FAN,
      startEndOptions
    );
    await onGenerateClicked(generationOptions);
  }
</script>

<button
  bind:this={buttonElement}
  class="generate-button-card"
  class:dirty={hasSettingsChanged && !isGenerating}
  class:pulse-suspended={suspendPulse}
  onclick={handleClick}
  disabled={isDisabled}
  type="button"
  aria-label={buttonLabel}
  title={noValidStart ? startFeasibility?.reason : undefined}
  data-ghost="safe"
  data-ghost-kind="generate"
  data-ghost-label="Generate"
>
  <div class="button-content">
    <FontAwesomeIcon icon={buttonIcon} style="solid" />
    <span>{buttonLabel}</span>
  </div>
</button>

<style>
  .generate-button-card {
    width: 100%;
    height: 100%;
    border: none;

    background: linear-gradient(
      135deg,
      color-mix(
          in srgb,
          var(--semantic-success, var(--semantic-success)) 85%,
          #065f46
        )
        0%,
      var(--semantic-success, var(--semantic-success)) 25%,
      color-mix(
          in srgb,
          var(--semantic-success, var(--semantic-success)) 100%,
          #a7f3d0
        )
        50%,
      var(--semantic-success, var(--semantic-success)) 75%,
      color-mix(
          in srgb,
          var(--semantic-success, var(--semantic-success)) 85%,
          #065f46
        )
        100%
    );

    animation:
      meshGradientFlow 8s ease infinite,
      subtlePulse 2s ease-in-out infinite;

    color: var(--theme-text, white);
    border-radius: 20px;

    font-size: var(--card-text-size);
    font-weight: var(--card-text-weight);
    letter-spacing: var(--card-text-spacing);
    text-shadow: var(--card-text-shadow);

    cursor: pointer;
    transition: all var(--duration-emphasis) cubic-bezier(0.4, 0, 0.2, 1);
    display: flex;
    align-items: center;
    justify-content: center;

    box-shadow:
      0 4px 12px
        color-mix(
          in srgb,
          var(--semantic-success, var(--semantic-success)) 40%,
          transparent
        ),
      0 2px 6px var(--theme-shadow),
      inset 0 1px 0 var(--theme-stroke-strong),
      inset 0 -1px 0 var(--theme-shadow);
  }

  .generate-button-card:focus-visible {
    outline: 2px solid var(--theme-text, white);
    outline-offset: 2px;
  }

  .generate-button-card.dirty {
    box-shadow:
      0 0 0 3px var(--semantic-warning, #f59e0b),
      0 4px 12px
        color-mix(
          in srgb,
          var(--semantic-success, var(--semantic-success)) 40%,
          transparent
        ),
      0 2px 6px var(--theme-shadow),
      inset 0 1px 0 var(--theme-stroke-strong),
      inset 0 -1px 0 var(--theme-shadow);
  }

  .button-content {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    gap: 0.5em;
  }

  .generate-button-card:hover:not(:disabled) {
    filter: brightness(1.2) saturate(1.15);
    transform: scale(1.02);

    box-shadow:
      0 8px 20px
        color-mix(
          in srgb,
          var(--semantic-success, var(--semantic-success)) 60%,
          transparent
        ),
      0 4px 12px var(--theme-shadow),
      inset 0 1px 0 var(--theme-stroke-strong),
      inset 0 -1px 0 var(--theme-shadow);

    text-shadow:
      0 2px 6px rgba(0, 0, 0, 0.6),
      0 0 25px color-mix(in srgb, var(--theme-text) 40%, transparent);

    animation-duration: 6s, 1.5s;
  }

  .generate-button-card.pulse-suspended:not(:disabled) {
    animation:
      meshGradientFlow 8s ease infinite,
      settlePulse var(--duration-emphasis) var(--ease-out) both;
  }

  .generate-button-card:active:not(:disabled) {
    transform: scale(0.98);
    transition: all var(--duration-instant) ease;
  }

  button.generate-button-card:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    animation: none;
    filter: grayscale(0.5);
  }

  /* Mobile: Disable hover effects */
  @media (max-width: 768px) {
    .generate-button-card:hover:not(:disabled) {
      transform: none;
      filter: none;
    }

    .generate-button-card:focus:not(:disabled) {
      transform: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .generate-button-card {
      animation: none;
    }
  }

  @keyframes meshGradientFlow {
    0%,
    100% {
      background-position: 0% 50%;
    }
    25% {
      background-position: 50% 100%;
    }
    50% {
      background-position: 100% 50%;
    }
    75% {
      background-position: 50% 0%;
    }
  }

  @keyframes subtlePulse {
    0%,
    100% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.015);
    }
  }

  @keyframes settlePulse {
    from {
      transform: var(--generate-pulse-settle-from, scale(1));
    }

    to {
      transform: scale(1);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .generate-button-card {
      animation: none;
    }

    .generate-button-card:hover:not(:disabled) {
      animation: none;
    }
  }
</style>
