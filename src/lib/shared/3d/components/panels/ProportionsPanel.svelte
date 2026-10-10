<script lang="ts">
  /**
   * ProportionsPanel Component
   *
   * UI for users to input their height and staff length.
   * Updates the 3D scene in real-time to match their proportions.
   */

  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { userProportionsState } from "@austencloud/scene-3d";
  import {
    COMMON_HEIGHTS,
    COMMON_STAFF_LENGTHS,
  } from "@austencloud/scene-3d";

  interface Props {
    compact?: boolean;
  }

  let { compact = false }: Props = $props();

  // Local state for custom input mode
  let useCustomHeight = $state(false);
  let useCustomStaff = $state(false);
  let customHeightFeet = $state(6);
  let customHeightInches = $state(3);
  let customStaffInches = $state(34);

  // Handle height preset selection
  function selectHeightPreset(heightCm: number) {
    useCustomHeight = false;
    userProportionsState.setHeightCm(heightCm);
  }

  // Handle staff preset selection
  function selectStaffPreset(lengthCm: number) {
    useCustomStaff = false;
    userProportionsState.setStaffLengthCm(lengthCm);
  }

  function applyCustomHeight() {
    userProportionsState.setHeightFeetInches(
      customHeightFeet,
      customHeightInches
    );
  }

  function applyCustomStaff() {
    userProportionsState.setStaffLengthInches(customStaffInches);
  }
</script>

<div class="proportions-panel" class:compact>
  <h3>{t("character_proportions")}</h3>

  <section class="input-section">
    <span class="section-label">{t("character_body_type")}</span>
    <div class="current-value">{userProportionsState.heightDisplay}</div>

    {#if !useCustomHeight}
      <div class="presets">
        {#each Object.entries(COMMON_HEIGHTS) as [label, cm]}
          <button
            class="preset-btn"
            class:active={Math.abs(userProportionsState.heightCm - cm) < 1}
            onclick={() => selectHeightPreset(cm)}
            aria-label={`Height preset: ${label}`}
            aria-pressed={Math.abs(userProportionsState.heightCm - cm) < 1}
          >
            {label}
          </button>
        {/each}
        <button
          class="preset-btn custom-btn"
          onclick={() => (useCustomHeight = true)}
          aria-label="Enter custom height"
        >
          Custom
        </button>
      </div>
    {:else}
      <div class="custom-input">
        <div class="input-row">
          <input
            type="number"
            bind:value={customHeightFeet}
            min="4"
            max="7"
            class="num-input"
          />
          <span>ft</span>
          <input
            type="number"
            bind:value={customHeightInches}
            min="0"
            max="11"
            class="num-input"
          />
          <span>in</span>
        </div>
        <div class="btn-row">
          <button class="apply-btn" onclick={applyCustomHeight} aria-label="Apply custom height">Apply</button>
          <button class="cancel-btn" onclick={() => (useCustomHeight = false)} aria-label="Cancel custom height"
            >Cancel</button
          >
        </div>
      </div>
    {/if}
  </section>

  <section class="input-section">
    <span class="section-label">{t("character_skin_tone")}</span>
    <div class="current-value">{userProportionsState.staffLengthDisplay}</div>

    {#if !useCustomStaff}
      <div class="presets">
        {#each Object.entries(COMMON_STAFF_LENGTHS) as [label, cm]}
          <button
            class="preset-btn"
            class:active={Math.abs(userProportionsState.staffLengthCm - cm) < 1}
            onclick={() => selectStaffPreset(cm)}
            aria-label={`Staff length preset: ${label}`}
            aria-pressed={Math.abs(userProportionsState.staffLengthCm - cm) < 1}
          >
            {label}
          </button>
        {/each}
        <button
          class="preset-btn custom-btn"
          onclick={() => (useCustomStaff = true)}
          aria-label="Enter custom staff length"
        >
          Custom
        </button>
      </div>
    {:else}
      <div class="custom-input">
        <div class="input-row">
          <input
            type="number"
            bind:value={customStaffInches}
            min="24"
            max="72"
            class="num-input wide"
          />
          <span>inches</span>
        </div>
        <div class="btn-row">
          <button class="apply-btn" onclick={applyCustomStaff} aria-label="Apply custom staff length">Apply</button>
          <button class="cancel-btn" onclick={() => (useCustomStaff = false)} aria-label="Cancel custom staff length"
            >Cancel</button
          >
        </div>
      </div>
    {/if}
  </section>

  {#if !compact}
    <section class="info-section">
      <div class="info-row">
        <span class="info-label">Arm reach:</span>
        <span class="info-value"
          >{Math.round(userProportionsState.dimensions.armReachCm)} cm</span
        >
      </div>
      <div class="info-row">
        <span class="info-label">Grid radius:</span>
        <span class="info-value"
          >{Math.round(userProportionsState.outerPointRadius / 2)} cm</span
        >
      </div>
    </section>
  {/if}
</div>

<style>
  .proportions-panel {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1rem;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border-radius: 12px;
    color: var(--theme-text, white);
  }

  .proportions-panel.compact {
    padding: 0.75rem;
    gap: 0.75rem;
  }

  h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--theme-text-strong, white);
  }

  .input-section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .section-label {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.6));
  }

  .current-value {
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--theme-accent, #60a5fa);
  }

  .compact .current-value {
    font-size: 1.125rem;
  }

  .presets {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
  }

  .preset-btn {
    padding: 0.375rem 0.625rem;
    font-size: 0.75rem;
    background: var(--theme-bg-elevated, rgba(255, 255, 255, 0.08));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 6px;
    color: var(--theme-text, white);
    cursor: pointer;
    transition: all var(--duration-fast) ease;
  }

  .preset-btn:hover {
    background: var(--theme-bg-hover, rgba(255, 255, 255, 0.12));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
  }

  .preset-btn.active {
    background: var(--theme-accent, #60a5fa);
    border-color: var(--theme-accent, #60a5fa);
    color: white;
  }

  .preset-btn.custom-btn {
    border-style: dashed;
  }

  .custom-input {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .input-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .num-input {
    width: 3rem;
    padding: 0.375rem 0.5rem;
    font-size: 0.875rem;
    background: var(--theme-bg-elevated, rgba(255, 255, 255, 0.08));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 6px;
    color: white;
    text-align: center;
  }

  .num-input.wide {
    width: 4rem;
  }

  .num-input:focus {
    outline: none;
    border-color: var(--theme-accent, #60a5fa);
  }

  .btn-row {
    display: flex;
    gap: 0.5rem;
  }

  .apply-btn,
  .cancel-btn {
    flex: 1;
    padding: 0.375rem 0.75rem;
    font-size: 0.75rem;
    border-radius: 6px;
    cursor: pointer;
    transition: all var(--duration-fast) ease;
  }

  .apply-btn {
    background: var(--theme-accent, #60a5fa);
    border: none;
    color: white;
  }

  .apply-btn:hover {
    filter: brightness(1.1);
  }

  .cancel-btn {
    background: transparent;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.6));
  }

  .cancel-btn:hover {
    background: var(--theme-bg-hover, rgba(255, 255, 255, 0.08));
  }

  .info-section {
    padding-top: 0.5rem;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .info-row {
    display: flex;
    justify-content: space-between;
    font-size: 0.75rem;
  }

  .info-label {
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.6));
  }

  .info-value {
    color: var(--theme-text, white);
  }
</style>
