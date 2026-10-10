<!--
  AvatarGeneratorWizard.svelte

  Step-by-step avatar creation for compact screens (< 400px).
  Steps: Style -> Shade -> Prop -> Confirm
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { avatarGradientLabel } from "#lib/shared/settings/domain/avatar-gradient-labels.js";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import {
    PROP_TYPE_DISPLAY_REGISTRY,
    VARIANT_PROP_TYPES,
  } from "#lib/shared/pictograph/prop/domain/prop-type-display-registry.js";
  import {
    ALL_GRADIENTS,
    COLOR_FAMILIES,
  } from "#lib/shared/settings/domain/avatar-gradients.js";
  import type {
    PropOption,
    WizardStep,
  } from "#lib/shared/settings/domain/photo-picker-types.js";
  import { localizedPropName } from "../tabs/prop-type/localized-prop-name";

  interface Props {
    selectedGradientId: string;
    selectedProp: PropType;
    saving: boolean;
    onGradientChange: (gradientId: string) => void;
    onPropChange: (prop: PropType) => void;
    onSave: () => void;
    onBack: () => void;
  }

  let {
    selectedGradientId,
    selectedProp,
    saving,
    onGradientChange,
    onPropChange,
    onSave,
    onBack,
  }: Props = $props();

  let wizardStep = $state<WizardStep>("style");

  const NON_PROP_TYPES = new Set([PropType.HAND]);

  // Derived so the labels follow a language change.
  const PROPS = $derived<PropOption[]>(
    Object.entries(PROP_TYPE_DISPLAY_REGISTRY)
      .filter(([propType]) => {
        const pt = propType as PropType;
        return !VARIANT_PROP_TYPES.includes(pt) && !NON_PROP_TYPES.has(pt);
      })
      .map(([propType, info]) => ({
        id: propType as PropType,
        label: localizedPropName(propType as PropType),
        image: info.image,
      }))
  );

  const selectedGradient = $derived(
    ALL_GRADIENTS.find((g) => g.id === selectedGradientId) ?? ALL_GRADIENTS[0]!
  );

  const selectedFamilyId = $derived(selectedGradient.family);

  const familyGradients = $derived(
    ALL_GRADIENTS.filter((g) => g.family === selectedFamilyId)
  );

  const currentPropImage = $derived(
    PROPS.find((p) => p.id === selectedProp)?.image ?? ""
  );

  function wizardNext() {
    if (wizardStep === "style") wizardStep = "shade";
    else if (wizardStep === "shade") wizardStep = "prop";
    else if (wizardStep === "prop") wizardStep = "confirm";
  }

  function wizardGoTo(step: WizardStep) {
    wizardStep = step;
  }

  function handleBack() {
    if (wizardStep === "style") {
      onBack(); // Go back to options tab
    } else if (wizardStep === "shade") {
      wizardStep = "style";
    } else if (wizardStep === "prop") {
      wizardStep = "shade";
    } else if (wizardStep === "confirm") {
      wizardStep = "prop";
    }
  }

  function selectFamily(familyId: string) {
    const firstInFamily = ALL_GRADIENTS.find((g) => g.family === familyId);
    if (firstInFamily) {
      onGradientChange(firstInFamily.id);
      wizardNext();
    }
  }

  function selectGradient(gradientId: string) {
    onGradientChange(gradientId);
    wizardNext();
  }

  function selectProp(prop: PropType) {
    onPropChange(prop);
    wizardNext();
  }

  // Export for parent to control header
  export function getStep(): WizardStep {
    return wizardStep;
  }

  export function goBack() {
    handleBack();
  }
</script>

<div class="wizard-content">
  <!-- Progress indicator -->
  <div class="wizard-progress">
    <button
      class="progress-dot"
      class:active={wizardStep === "style"}
      class:completed={["shade", "prop", "confirm"].includes(wizardStep)}
      onclick={() => wizardGoTo("style")}
      aria-label={t("settings_avatar_style")}
    ></button>
    <div
      class="progress-line"
      class:filled={["shade", "prop", "confirm"].includes(wizardStep)}
    ></div>
    <button
      class="progress-dot"
      class:active={wizardStep === "shade"}
      class:completed={["prop", "confirm"].includes(wizardStep)}
      onclick={() => wizardGoTo("shade")}
      aria-label={t("settings_avatar_shade")}
    ></button>
    <div
      class="progress-line"
      class:filled={["prop", "confirm"].includes(wizardStep)}
    ></div>
    <button
      class="progress-dot"
      class:active={wizardStep === "prop"}
      class:completed={wizardStep === "confirm"}
      onclick={() => wizardGoTo("prop")}
      aria-label={t("settings_avatar_prop")}
    ></button>
    <div class="progress-line" class:filled={wizardStep === "confirm"}></div>
    <button
      class="progress-dot"
      class:active={wizardStep === "confirm"}
      onclick={() => wizardGoTo("confirm")}
      aria-label={t("settings_confirm")}
    ></button>
  </div>

  <!-- Step container with animation wrapper -->
  <div class="wizard-step-container">
    {#key wizardStep}
      <div class="wizard-step-animated">
        {#if wizardStep === "style"}
          <!-- Step 1: Style -->
          <div class="wizard-step">
            <p class="wizard-subtitle">{t("settings_avatar_vibe")}</p>
            <div class="wizard-options">
              {#each COLOR_FAMILIES as family}
                <button
                  class="wizard-option"
                  class:selected={selectedFamilyId === family.id}
                  onclick={() => selectFamily(family.id)}
                >
                  <div class="wizard-option-icon">
                    <i class="fas {family.icon}"></i>
                  </div>
                  <span>{avatarGradientLabel(family.name)}</span>
                </button>
              {/each}
            </div>
          </div>
        {:else if wizardStep === "shade"}
          <!-- Step 2: Shade -->
          <div class="wizard-step">
            <p class="wizard-subtitle">{t("settings_avatar_pick_shade")}</p>
            <div class="wizard-shades">
              {#each familyGradients as gradient}
                <button
                  class="wizard-shade"
                  class:selected={selectedGradientId === gradient.id}
                  onclick={() => selectGradient(gradient.id)}
                  style="background: {gradient.gradient};"
                >
                  <span class="shade-name"
                    >{avatarGradientLabel(gradient.name)}</span
                  >
                  {#if selectedGradientId === gradient.id}
                    <i class="fas fa-check"></i>
                  {/if}
                </button>
              {/each}
            </div>
          </div>
        {:else if wizardStep === "prop"}
          <!-- Step 3: Prop -->
          <div class="wizard-step">
            <p class="wizard-subtitle">{t("settings_avatar_choose_prop")}</p>
            <div class="wizard-props-scroll">
              <div
                class="wizard-props"
                role="radiogroup"
                aria-label={t("settings_avatar_select_prop")}
              >
                {#each PROPS as prop}
                  <button
                    class="wizard-prop"
                    class:selected={selectedProp === prop.id}
                    onclick={() => selectProp(prop.id)}
                    role="radio"
                    aria-checked={selectedProp === prop.id}
                    aria-label={prop.label}
                  >
                    <img src={prop.image} alt="" />
                    <span>{prop.label}</span>
                  </button>
                {/each}
              </div>
            </div>
          </div>
        {:else}
          <!-- Step 4: Confirm -->
          <div class="wizard-step wizard-confirm">
            <div
              class="wizard-preview"
              style="background: {selectedGradient.gradient};"
            >
              {#if currentPropImage}
                <img
                  src={currentPropImage}
                  alt={t("settings_avatar_prop")}
                  class="prop-silhouette"
                />
              {/if}
            </div>
            <p class="wizard-preview-label">
              {avatarGradientLabel(selectedGradient.name)}
            </p>

            <!-- Quick edit chips with labels -->
            <div class="quick-edit-section">
              <p class="quick-edit-label">{t("settings_avatar_tap_change")}</p>
              <div class="quick-edit-row">
                <button
                  class="quick-edit-chip"
                  onclick={() => wizardGoTo("style")}
                  aria-label={t("settings_avatar_change_style")}
                >
                  <i
                    class="fas {COLOR_FAMILIES.find(
                      (f) => f.id === selectedFamilyId
                    )?.icon}"
                  ></i>
                  <span class="chip-label">{t("settings_avatar_style")}</span>
                </button>
                <button
                  class="quick-edit-chip shade-chip"
                  onclick={() => wizardGoTo("shade")}
                  style="background: {selectedGradient.gradient};"
                  aria-label={t("settings_avatar_change_shade")}
                >
                  <span class="chip-label">{t("settings_avatar_shade")}</span>
                </button>
                <button
                  class="quick-edit-chip"
                  onclick={() => wizardGoTo("prop")}
                  aria-label={t("settings_avatar_change_prop")}
                >
                  <img src={currentPropImage} alt={t("settings_avatar_prop")} />
                  <span class="chip-label">{t("settings_avatar_prop")}</span>
                </button>
              </div>
            </div>

            <!-- Start Over button -->
            <button class="start-over-btn" onclick={() => wizardGoTo("style")}>
              <i class="fas fa-redo"></i>
              <span>{t("settings_avatar_start_over")}</span>
            </button>

            <button class="save-btn" onclick={onSave} disabled={saving}>
              {#if saving}
                <i class="fas fa-circle-notch fa-spin"></i>
                <span>{t("settings_avatar_saving")}</span>
              {:else}
                <i class="fas fa-check"></i>
                <span>{t("settings_avatar_use")}</span>
              {/if}
            </button>
          </div>
        {/if}
      </div>
    {/key}
  </div>
</div>

<style>
  .wizard-content {
    display: flex;
    flex-direction: column;
    height: 100%;
    gap: var(--spacing-sm, 10px);
    overflow: hidden;
  }

  /* Step container for animation */
  .wizard-step-container {
    flex: 1;
    position: relative;
    overflow: hidden;
    min-height: 0;
  }

  /* Animated step wrapper */
  .wizard-step-animated {
    animation: wizardFadeSlideIn 0.25s ease-out forwards;
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  @keyframes wizardFadeSlideIn {
    from {
      opacity: 0;
      transform: translateX(20px);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .wizard-step-animated {
      animation: none;
    }
  }

  /* Progress indicator */
  .wizard-progress {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0;
    padding: var(--spacing-xs, 4px) 0;
    flex-shrink: 0;
  }

  .progress-dot {
    /* WCAG AA touch target */
    width: var(--min-touch-target);
    height: var(--min-touch-target);
    min-width: var(--min-touch-target);
    min-height: var(--min-touch-target);
    /* Visual styling via pseudo-element */
    position: relative;
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 0;
    margin: 0 -18px; /* Overlap to keep dots visually close */
  }

  .progress-dot::after {
    content: "";
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.1));
    border: 2px solid var(--theme-stroke, rgba(255, 255, 255, 0.2));
    transition: all 0.2s ease;
  }

  .progress-dot.active::after {
    background: var(--theme-accent, #6366f1);
    border-color: var(--theme-accent, #6366f1);
    transform: translate(-50%, -50%) scale(1.2);
  }

  .progress-dot.completed::after {
    background: var(--theme-accent, #6366f1);
    border-color: var(--theme-accent, #6366f1);
  }

  .progress-line {
    width: 32px;
    height: 2px;
    background: var(--theme-stroke, rgba(255, 255, 255, 0.2));
    transition: background 0.2s ease;
  }

  .progress-line.filled {
    background: var(--theme-accent, #6366f1);
  }

  /* Wizard step container */
  .wizard-step {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--spacing-sm, 10px);
    min-height: 0;
    overflow: hidden;
  }

  .wizard-subtitle {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    margin: 0;
    text-align: center;
    flex-shrink: 0;
  }

  /* Style options (Step 1) */
  .wizard-options {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm, 10px);
    width: 100%;
    max-width: 280px;
  }

  .wizard-option {
    display: flex;
    align-items: center;
    gap: var(--spacing-md, 14px);
    padding: var(--spacing-md, 16px);
    min-height: 56px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 2px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--radius-md, 12px);
    color: var(--theme-text, #ffffff);
    font-size: var(--font-size-md, 16px);
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
    width: 100%;
  }

  .wizard-option:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
  }

  .wizard-option.selected {
    background: var(--theme-accent, #6366f1);
    border-color: var(--theme-accent, #6366f1);
  }

  .wizard-option-icon {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--font-size-lg, 18px);
  }

  /* Shade options (Step 2) */
  .wizard-shades {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm, 10px);
    width: 100%;
    max-width: 280px;
  }

  .wizard-shade {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--spacing-md, 16px) var(--spacing-lg, 20px);
    min-height: 56px;
    border: 2px solid transparent;
    border-radius: var(--radius-md, 12px);
    color: white;
    font-size: var(--font-size-md, 16px);
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
  }

  .wizard-shade:hover {
    transform: scale(1.02);
  }

  .wizard-shade.selected {
    border-color: white;
    box-shadow: 0 0 0 2px var(--theme-accent, #6366f1);
  }

  .shade-name {
    font-weight: 600;
  }

  /* Prop options (Step 3) */
  .wizard-props-scroll {
    flex: 1;
    overflow-y: auto;
    width: 100%;
    max-width: 320px;
    padding: var(--spacing-xs, 4px);
    /* Styled scrollbar */
    scrollbar-width: thin;
    scrollbar-color: var(--scrollbar-thumb, rgba(255, 255, 255, 0.2))
      transparent;
  }

  .wizard-props-scroll::-webkit-scrollbar {
    width: 6px;
  }

  .wizard-props-scroll::-webkit-scrollbar-track {
    background: transparent;
  }

  .wizard-props-scroll::-webkit-scrollbar-thumb {
    background: var(--scrollbar-thumb, rgba(255, 255, 255, 0.2));
    border-radius: 3px;
  }

  .wizard-props {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: var(--spacing-xs, 4px);
    width: 100%;
  }

  .wizard-prop {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: var(--min-touch-target);
    min-width: var(--min-touch-target);
    padding: var(--spacing-xs, 6px);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 2px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--radius-sm, 8px);
    color: var(--theme-text, #ffffff);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .wizard-prop:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
    border-color: var(--theme-stroke-strong);
  }

  .wizard-prop.selected {
    background: var(--theme-accent, #6366f1);
    border-color: var(--theme-accent, #6366f1);
  }

  .wizard-prop img {
    width: 28px;
    height: 28px;
    object-fit: contain;
    filter: brightness(0) invert(1);
  }

  .wizard-prop span {
    /* Hide labels in wizard mode - icon-only for space */
    display: none;
  }

  /* Confirm step (Step 4) */
  .wizard-confirm {
    justify-content: center;
  }

  .wizard-preview {
    width: 120px;
    height: 120px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    border: 3px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
  }

  .wizard-preview .prop-silhouette {
    width: 55%;
    height: 55%;
    object-fit: contain;
    filter: brightness(0) invert(1) opacity(0.9);
  }

  .wizard-preview-label {
    font-size: var(--font-size-sm, 14px);
    color: var(--theme-text-dim);
    margin: 0;
  }

  /* Quick edit section with label */
  .quick-edit-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--spacing-xs, 6px);
    margin-top: var(--spacing-sm, 8px);
  }

  .quick-edit-label {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    margin: 0;
  }

  .quick-edit-row {
    display: flex;
    gap: var(--spacing-sm, 10px);
  }

  .quick-edit-chip {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: var(--spacing-sm, 10px) var(--spacing-md, 14px);
    min-width: 60px;
    border-radius: var(--radius-md, 10px);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.08));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.15));
    cursor: pointer;
    transition: all 0.15s ease;
    color: var(--theme-text);
    font-size: var(--font-size-md, 16px);
  }

  .quick-edit-chip:hover {
    border-color: var(--theme-accent, #6366f1);
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.12));
  }

  .quick-edit-chip img {
    width: 24px;
    height: 24px;
    object-fit: contain;
    filter: brightness(0) invert(1);
  }

  .quick-edit-chip.shade-chip {
    /* Shade chip shows the gradient as background, needs white text */
    color: white;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
  }

  .chip-label {
    font-size: var(--font-size-compact, 11px);
    font-weight: 500;
  }

  /* Start over button */
  .start-over-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-xs, 6px);
    padding: var(--spacing-sm, 10px) var(--spacing-md, 16px);
    min-height: 44px;
    background: transparent;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.15));
    border-radius: var(--radius-md, 10px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-size: var(--font-size-sm, 13px);
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
    margin-top: var(--spacing-md, 12px);
  }

  .start-over-btn:hover {
    color: var(--theme-text);
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.25));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
  }

  .start-over-btn i {
    font-size: var(--font-size-compact, 12px);
  }

  .wizard-confirm .save-btn {
    margin-top: var(--spacing-sm, 8px);
    width: 100%;
    max-width: 280px;
  }

  /* Save button */
  .save-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-sm, 8px);
    padding: var(--spacing-md, 14px) var(--spacing-lg, 20px);
    min-height: var(--min-touch-target);
    max-width: 320px;
    width: 100%;
    margin-left: auto;
    margin-right: auto;
    background: var(--theme-accent, #6366f1);
    border: none;
    border-radius: var(--radius-md, 12px);
    color: white;
    font-size: var(--font-size-sm, 14px);
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .save-btn:hover:not(:disabled) {
    filter: brightness(1.1);
    transform: translateY(-1px);
  }

  .save-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  @media (prefers-reduced-motion: reduce) {
    .wizard-shade:hover,
    .save-btn:hover {
      transform: none;
    }
  }
</style>
