<script lang="ts">
  /**
   * Animation3DSidePanel - Collapsible sidebar for 3D animation
   *
   * Contains: sequence loader, beat info, effects, environment, character settings.
   * Sections are collapsible to avoid content overflow.
   */

  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import type { CharacterId } from "#lib/shared/3d/domain/character-model.js";
  import EffectsSettingsPanel from "../controls/EffectsSettingsPanel.svelte";
  import EnvironmentSettingsPanel from "../controls/EnvironmentSettingsPanel.svelte";
  import CharacterSettingsPanel from "../controls/CharacterSettingsPanel.svelte";
  import ProportionsPanel from "./ProportionsPanel.svelte";

  interface Props {
    /** Whether panel is collapsed */
    collapsed?: boolean;
    /** Whether a sequence is loaded */
    hasSequence: boolean;
    /** Current beat index */
    currentStepIndex: number;
    /** Total steps */
    totalSteps: number;
    /** Whether the character is visible */
    showFigure: boolean;
    /** Selected character ID */
    characterId: CharacterId;

    // Callbacks
    onLoadSequence: () => void;
    onToggleFigure: () => void;
    onCharacterChange: (id: CharacterId) => void;
  }

  let {
    collapsed = false,
    hasSequence,
    currentStepIndex,
    totalSteps,
    showFigure,
    characterId,
    onLoadSequence,
    onToggleFigure,
    onCharacterChange,
  }: Props = $props();

  // Section expansion state - Character expanded by default, others collapsed
  let expandedSections = $state<Set<string>>(new Set(["character"]));
</script>

<aside class="side-panel" class:collapsed>
  <!-- Load Sequence Button -->
  <div class="load-section">
    <button class="load-btn" onclick={onLoadSequence} aria-label="Load sequence">
      <i class="fas fa-folder-open" aria-hidden="true"></i>
      {t("action_load")}
    </button>
  </div>

  <!-- Sequence Info -->
  {#if hasSequence}
    <div class="sequence-header">
      <span class="mode-label">Step {currentStepIndex + 1} of {totalSteps}</span
      >
    </div>
  {:else}
    <div class="empty-state">
      <i class="fas fa-film" aria-hidden="true"></i>
      <p>{t("empty_load_sequence")}</p>
    </div>
  {/if}

  <!-- Scrollable Content with Collapsible Sections -->
  <div class="panel-scroll">
    <!-- Character Section -->
    <section class="collapsible-section">
      <button
        class="section-header"
        onclick={() => {
          const next = new Set(expandedSections);
          next.has("character")
            ? next.delete("character")
            : next.add("character");
          expandedSections = next;
        }}
        aria-expanded={expandedSections.has("character")}
        aria-label={expandedSections.has("character") ? "Collapse character settings" : "Expand character settings"}
      >
        <i class="fas fa-person" aria-hidden="true"></i>
        <span>{t("character_settings")}</span>
        <i
          class="fas fa-chevron-down chevron"
          class:rotated={!expandedSections.has("character")}
          aria-hidden="true"
        ></i>
      </button>
      {#if expandedSections.has("character")}
        <div class="section-content">
          <CharacterSettingsPanel
            {showFigure}
            {characterId}
            onToggle={onToggleFigure}
            {onCharacterChange}
          />
        </div>
      {/if}
    </section>

    <!-- Proportions Section -->
    <section class="collapsible-section">
      <button
        class="section-header"
        onclick={() => {
          const next = new Set(expandedSections);
          next.has("proportions")
            ? next.delete("proportions")
            : next.add("proportions");
          expandedSections = next;
        }}
        aria-expanded={expandedSections.has("proportions")}
        aria-label={expandedSections.has("proportions") ? "Collapse proportions" : "Expand proportions"}
      >
        <i class="fas fa-ruler-vertical" aria-hidden="true"></i>
        <span>{t("character_proportions")}</span>
        <i
          class="fas fa-chevron-down chevron"
          class:rotated={!expandedSections.has("proportions")}
          aria-hidden="true"
        ></i>
      </button>
      {#if expandedSections.has("proportions")}
        <div class="section-content">
          <ProportionsPanel compact />
        </div>
      {/if}
    </section>

    <!-- Environment Section -->
    <section class="collapsible-section">
      <button
        class="section-header"
        onclick={() => {
          const next = new Set(expandedSections);
          next.has("environment")
            ? next.delete("environment")
            : next.add("environment");
          expandedSections = next;
        }}
        aria-expanded={expandedSections.has("environment")}
        aria-label={expandedSections.has("environment") ? "Collapse environment settings" : "Expand environment settings"}
      >
        <i class="fas fa-mountain-sun" aria-hidden="true"></i>
        <span>{t("viewer3d_environment")}</span>
        <i
          class="fas fa-chevron-down chevron"
          class:rotated={!expandedSections.has("environment")}
          aria-hidden="true"
        ></i>
      </button>
      {#if expandedSections.has("environment")}
        <div class="section-content">
          <EnvironmentSettingsPanel />
        </div>
      {/if}
    </section>

    <!-- Effects Section -->
    <section class="collapsible-section">
      <button
        class="section-header"
        onclick={() => {
          const next = new Set(expandedSections);
          next.has("effects") ? next.delete("effects") : next.add("effects");
          expandedSections = next;
        }}
        aria-expanded={expandedSections.has("effects")}
        aria-label={expandedSections.has("effects") ? "Collapse effects settings" : "Expand effects settings"}
      >
        <i class="fas fa-wand-magic-sparkles" aria-hidden="true"></i>
        <span>{t("viewer3d_effects")}</span>
        <i
          class="fas fa-chevron-down chevron"
          class:rotated={!expandedSections.has("effects")}
          aria-hidden="true"
        ></i>
      </button>
      {#if expandedSections.has("effects")}
        <div class="section-content">
          <EffectsSettingsPanel />
        </div>
      {/if}
    </section>

  </div>
</aside>

<style>
  .side-panel {
    width: 420px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    background: var(--theme-panel-bg);
    border-left: 1px solid var(--theme-stroke);
    transition:
      width 0.3s ease,
      opacity 0.3s ease;
  }

  .side-panel.collapsed {
    width: 0;
    opacity: 0;
    overflow: hidden;
  }

  .load-section {
    padding: 1rem;
    border-bottom: 1px solid var(--theme-stroke);
  }

  .load-btn {
    width: 100%;
    min-height: var(--min-touch-target);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    background: var(--theme-accent, var(--theme-accent-strong));
    border: none;
    border-radius: 12px;
    color: white;
    font-size: var(--font-size-sm, 0.875rem);
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-fast);
  }

  .load-btn:hover {
    background: var(--theme-accent-strong, #7c3aed);
    transform: translateY(-1px);
  }

  .load-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #8b5cf6);
    outline-offset: 2px;
  }

  .load-btn:active {
    transform: translateY(0);
  }

  .sequence-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem;
    background: var(--theme-card-bg);
    border-bottom: 1px solid var(--theme-stroke);
  }

  .mode-label {
    font-size: var(--font-size-compact, 0.75rem);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--theme-text-dim, var(--theme-text-dim));
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    padding: 2rem 1rem;
    color: var(--theme-text-dim);
    text-align: center;
  }

  .empty-state i {
    font-size: 2rem;
    opacity: 0.5;
  }

  .empty-state p {
    margin: 0;
    font-size: var(--font-size-sm, 0.875rem);
  }

  .panel-scroll {
    flex: 1;
    overflow-y: auto;
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  /* Collapsible Sections */
  .collapsible-section {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 12px;
    overflow: hidden;
  }

  .section-header {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.625rem;
    padding: 0.875rem 1rem;
    background: transparent;
    border: none;
    color: var(--theme-text, #ffffff);
    font-size: var(--font-size-sm, 14px);
    font-weight: 500;
    cursor: pointer;
    transition: background var(--duration-fast) ease;
  }

  .section-header:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.06));
  }

  .section-header:focus-visible {
    outline: 2px solid var(--theme-accent, #8b5cf6);
    outline-offset: -2px;
  }

  .section-header i:first-child {
    opacity: 0.7;
    width: 1rem;
    text-align: center;
  }

  .section-header span {
    flex: 1;
    text-align: left;
  }

  .section-header .chevron {
    font-size: 0.75rem;
    opacity: 0.5;
    transition: transform var(--duration-normal) ease;
  }

  .section-header .chevron.rotated {
    transform: rotate(-90deg);
  }

  .section-content {
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
  }

  @media (max-width: 1024px) {
    .side-panel {
      width: 380px;
    }
  }

  @media (max-width: 800px) {
    .side-panel {
      width: 360px;
    }
  }

  @media (max-width: 600px) {
    .side-panel {
      width: 100%;
      max-height: 50vh;
      border-left: none;
      border-top: 1px solid var(--theme-stroke);
    }

    .side-panel.collapsed {
      max-height: 0;
      width: 100%;
    }
  }
</style>
