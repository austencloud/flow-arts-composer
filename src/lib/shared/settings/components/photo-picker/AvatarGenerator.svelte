<!--
  AvatarGenerator.svelte

  The "Create Avatar" UI: gradient style/shade selection + prop selection.
  Standard layout for larger screens (non-wizard mode).
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte";
  import { avatarGradientLabel } from "$lib/shared/settings/domain/avatar-gradient-labels";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import {
    PROP_TYPE_DISPLAY_REGISTRY,
    VARIANT_PROP_TYPES,
  } from "$lib/shared/pictograph/prop/domain/prop-type-display-registry";
  import {
    ALL_GRADIENTS,
    COLOR_FAMILIES,
    type GradientOption,
  } from "$lib/shared/settings/domain/avatar-gradients";
  import type { PropOption } from "$lib/shared/settings/domain/photo-picker-types";
  import { localizedPropName } from "../tabs/prop-type/localized-prop-name";

  interface Props {
    selectedGradientId: string;
    selectedProp: PropType;
    saving: boolean;
    onGradientChange: (gradientId: string) => void;
    onPropChange: (prop: PropType) => void;
    onSave: () => void;
    /** Compact horizontal layout for tabbed modal */
    compact?: boolean;
    /** Whether to use larger modal styling */
    isModal?: boolean;
  }

  let {
    selectedGradientId,
    selectedProp,
    saving,
    onGradientChange,
    onPropChange,
    onSave,
    compact = false,
    isModal = false,
  }: Props = $props();

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

  function selectFamily(familyId: string) {
    const firstInFamily = ALL_GRADIENTS.find((g) => g.family === familyId);
    if (firstInFamily) {
      onGradientChange(firstInFamily.id);
    }
  }

  function shuffle() {
    const options = familyGradients.filter((g) => g.id !== selectedGradientId);
    if (options.length > 0) {
      const randomIndex = Math.floor(Math.random() * options.length);
      onGradientChange(options[randomIndex]!.id);
    }
  }
</script>

{#if compact}
  <!-- Horizontal layout for tabbed modal: avatar left, controls right -->
  <div class="tabbed-layout">
    <div class="avatar-column">
      <div
        class="avatar-preview generated large"
        style="background: {selectedGradient.gradient};"
      >
        {#if currentPropImage}
          <img src={currentPropImage} alt={t("settings_avatar_prop")} class="prop-silhouette" />
        {/if}
      </div>
      <span class="gradient-name"
        >{avatarGradientLabel(selectedGradient.name)}</span
      >
      <button class="save-btn compact" onclick={onSave} disabled={saving}>
        {#if saving}
          <i class="fas fa-circle-notch fa-spin"></i>
          <span>{t("settings_avatar_saving")}</span>
        {:else}
          <i class="fas fa-check"></i>
          <span>{t("settings_avatar_use")}</span>
        {/if}
      </button>
    </div>

    <div class="controls-column">
      <div class="section">
        <h4 class="section-label">{t("settings_avatar_style")}</h4>
        <div class="family-row compact">
          {#each COLOR_FAMILIES as family}
            <button
              class="family-chip compact"
              class:selected={selectedFamilyId === family.id}
              onclick={() => selectFamily(family.id)}
              title={avatarGradientLabel(family.name)}
            >
              <i class="fas {family.icon}"></i>
              <span class="family-label"
                >{avatarGradientLabel(family.name)}</span
              >
            </button>
          {/each}
        </div>
      </div>

      <div class="section">
        <div class="section-header">
          <h4 class="section-label">{t("settings_avatar_shade")}</h4>
          <button
            class="shuffle-btn compact"
            onclick={shuffle}
            title={t("settings_avatar_random_shade")}
            aria-label={t("settings_avatar_random_shade")}
          >
            <i class="fas fa-random" aria-hidden="true"></i>
          </button>
        </div>
        <div class="gradient-row">
          {#each familyGradients as gradient}
            <button
              class="gradient-swatch compact"
              class:selected={selectedGradientId === gradient.id}
              onclick={() => onGradientChange(gradient.id)}
              title={avatarGradientLabel(gradient.name)}
              aria-label={avatarGradientLabel(gradient.name)}
              aria-pressed={selectedGradientId === gradient.id}
              style="background: {gradient.gradient};"
            >
              {#if selectedGradientId === gradient.id}
                <i class="fas fa-check"></i>
              {/if}
            </button>
          {/each}
        </div>
      </div>

      <div class="section">
        <h4 class="section-label">{t("settings_avatar_prop")}</h4>
        <div class="prop-row compact">
          {#each PROPS as prop}
            <button
              class="prop-btn compact"
              class:selected={selectedProp === prop.id}
              onclick={() => onPropChange(prop.id)}
              title={prop.label}
            >
              <img src={prop.image} alt={prop.label} />
            </button>
          {/each}
        </div>
      </div>
    </div>
  </div>
{:else}
  <!-- Standard vertical layout -->
  <div class="standard-layout" class:modal-style={isModal}>
    <!-- Panel Header with preview -->
    <div class="panel-header">
      <div
        class="avatar-preview generated"
        style="background: {selectedGradient.gradient};"
      >
        {#if currentPropImage}
          <img src={currentPropImage} alt={t("settings_avatar_prop")} class="prop-silhouette" />
        {/if}
      </div>
      <span class="gradient-name"
        >{avatarGradientLabel(selectedGradient.name)}</span
      >
      <h3 class="panel-title">{t("settings_create_avatar")}</h3>
    </div>

    <div class="generate-content">
      <!-- Style & Shade -->
      <div class="section">
        <h4 class="section-label">{t("settings_avatar_style")}</h4>
        <div class="family-row">
          {#each COLOR_FAMILIES as family}
            <button
              class="family-chip"
              class:selected={selectedFamilyId === family.id}
              onclick={() => selectFamily(family.id)}
              title={avatarGradientLabel(family.name)}
            >
              <i class="fas {family.icon}"></i>
              <span class="family-label"
                >{avatarGradientLabel(family.name)}</span
              >
            </button>
          {/each}
        </div>
      </div>

      <div class="section">
        <div class="section-header">
          <h4 class="section-label">{t("settings_avatar_shade")}</h4>
          <button
            class="shuffle-btn"
            onclick={shuffle}
            title={t("settings_avatar_random_shade")}
            aria-label={t("settings_avatar_random_shade")}
          >
            <i class="fas fa-random" aria-hidden="true"></i>
          </button>
        </div>
        <div class="gradient-row">
          {#each familyGradients as gradient}
            <button
              class="gradient-swatch"
              class:selected={selectedGradientId === gradient.id}
              onclick={() => onGradientChange(gradient.id)}
              title={avatarGradientLabel(gradient.name)}
              aria-label={avatarGradientLabel(gradient.name)}
              aria-pressed={selectedGradientId === gradient.id}
              style="background: {gradient.gradient};"
            >
              {#if selectedGradientId === gradient.id}
                <i class="fas fa-check"></i>
              {/if}
            </button>
          {/each}
        </div>
      </div>

      <!-- Prop Selection -->
      <div class="section">
        <h4 class="section-label">{t("settings_avatar_prop")}</h4>
        <div class="prop-row">
          {#each PROPS as prop}
            <button
              class="prop-btn"
              class:selected={selectedProp === prop.id}
              onclick={() => onPropChange(prop.id)}
              title={prop.label}
            >
              <img src={prop.image} alt={prop.label} />
            </button>
          {/each}
        </div>
      </div>

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
  </div>
{/if}

<style>
  /* ═══════════════════════════════════════════════════════════════════
     STANDARD VERTICAL LAYOUT
     ═══════════════════════════════════════════════════════════════════ */

  .standard-layout {
    display: flex;
    flex-direction: column;
  }

  .panel-header {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--spacing-sm, 12px);
    margin-bottom: var(--spacing-lg, 20px);
  }

  .panel-title {
    font-size: var(--font-size-sm, 14px);
    font-weight: 600;
    margin: 0;
    color: var(--theme-text-dim);
  }

  .avatar-preview {
    width: 80px;
    height: 80px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4);
    border: 2px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
  }

  .prop-silhouette {
    width: 55%;
    height: 55%;
    object-fit: contain;
    filter: brightness(0) invert(1) opacity(0.9);
  }

  .gradient-name {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim);
  }

  .generate-content {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg, 20px);
  }

  /* Modal overrides */
  .modal-style .avatar-preview {
    width: 96px;
    height: 96px;
  }

  .modal-style .gradient-swatch {
    width: 60px;
    height: 60px;
  }

  .modal-style .prop-btn {
    width: 60px;
    height: 60px;
  }

  /* ═══════════════════════════════════════════════════════════════════
     TABBED HORIZONTAL LAYOUT
     ═══════════════════════════════════════════════════════════════════ */

  .tabbed-layout {
    display: flex;
    gap: var(--spacing-lg, 24px);
    align-items: flex-start;
    height: 100%;
  }

  .avatar-column {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--spacing-sm, 10px);
    flex-shrink: 0;
    padding-top: var(--spacing-md, 16px);
  }

  .avatar-column .avatar-preview.large {
    width: 120px;
    height: 120px;
  }

  .avatar-column .save-btn.compact {
    margin-top: var(--spacing-sm, 8px);
    padding: var(--spacing-sm, 10px) var(--spacing-md, 16px);
    font-size: var(--font-size-sm, 13px);
    white-space: nowrap;
  }

  .controls-column {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md, 14px);
    min-width: 0;
  }

  /* ═══════════════════════════════════════════════════════════════════
     SHARED CONTROLS
     ═══════════════════════════════════════════════════════════════════ */

  .section {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm, 10px);
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .section-label {
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    margin: 0;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  /* Family chips */
  .family-row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-sm, 10px);
    justify-content: flex-start;
  }

  .family-row.compact {
    gap: var(--spacing-xs, 6px);
  }

  .family-chip {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-xs, 6px);
    padding: var(--spacing-sm, 10px) var(--spacing-md, 16px);
    min-height: var(--min-touch-target);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 24px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-size: var(--font-size-sm, 14px);
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s ease;
    white-space: nowrap;
  }

  .family-chip.compact {
    padding: var(--spacing-xs, 6px) var(--spacing-sm, 10px);
    min-height: 36px;
    font-size: var(--font-size-compact, 12px);
  }

  .family-chip.compact i {
    font-size: var(--font-size-compact, 12px);
  }

  .family-chip:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
    color: var(--theme-text);
  }

  .family-chip.selected {
    background: var(--theme-accent, #6366f1);
    border-color: var(--theme-accent, #6366f1);
    color: white;
  }

  .family-chip i {
    font-size: var(--font-size-sm, 14px);
  }

  /* Gradient swatches */
  .gradient-row {
    display: flex;
    gap: var(--spacing-sm, 10px);
    flex-wrap: wrap;
  }

  .gradient-swatch {
    width: 52px;
    height: 52px;
    border-radius: var(--radius-md, 12px);
    border: 2px solid transparent;
    cursor: pointer;
    transition: all 0.15s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-size: var(--font-size-md, 16px);
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
  }

  .gradient-swatch.compact {
    width: 40px;
    height: 40px;
  }

  .gradient-swatch:hover {
    transform: scale(1.05);
  }

  .gradient-swatch.selected {
    border-color: white;
    box-shadow: 0 0 0 3px var(--theme-accent, #6366f1);
  }

  /* Shuffle button */
  .shuffle-btn {
    width: 36px;
    height: 36px;
    min-width: var(--min-touch-target);
    min-height: var(--min-touch-target);
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--radius-sm, 8px);
    color: var(--theme-text, #ffffff);
    font-size: var(--font-size-compact, 12px);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .shuffle-btn.compact {
    width: 32px;
    height: 32px;
    min-width: 36px;
    min-height: 36px;
  }

  .shuffle-btn:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
  }

  /* Prop buttons */
  .prop-row {
    display: flex;
    gap: var(--spacing-sm, 8px);
    flex-wrap: wrap;
  }

  .prop-row.compact {
    gap: var(--spacing-xs, 6px);
  }

  .prop-btn {
    width: 52px;
    height: 52px;
    padding: var(--spacing-xs, 8px);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--radius-sm, 8px);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .prop-btn.compact {
    width: 40px;
    height: 40px;
    padding: var(--spacing-xs, 6px);
  }

  .prop-btn:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
    border-color: var(--theme-stroke-strong);
  }

  .prop-btn.selected {
    background: var(--theme-accent, #6366f1);
    border-color: var(--theme-accent, #6366f1);
  }

  .prop-btn img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    filter: brightness(0) invert(1);
  }

  /* Save button - uses global theme accent, not gradient-derived color */
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
    margin-top: var(--spacing-sm, 8px);
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
    .gradient-swatch:hover,
    .save-btn:hover {
      transform: none;
    }
  }
</style>
