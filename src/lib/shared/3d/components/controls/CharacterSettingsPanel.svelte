<script lang="ts">
  /**
   * CharacterSettingsPanel
   *
   * Side panel section for character visibility and selection.
   * - Toggle character visibility
   * - Select from available character models
   */

  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { type CharacterId } from "#lib/shared/3d/domain/character-model.js";
  import { DEPLOYED_CHARACTER_DEFINITIONS } from "#lib/shared/3d/config/deployed-characters.js";

  interface Props {
    /** Whether the character is visible */
    showFigure: boolean;
    /** Currently selected character ID */
    characterId: CharacterId;
    /** Callbacks */
    onToggle: () => void;
    onCharacterChange: (id: CharacterId) => void;
  }

  let { showFigure, characterId, onToggle, onCharacterChange }: Props =
    $props();
</script>

<div class="character-panel">
  <!-- Visibility toggle row -->
  <div class="visibility-row">
    <span class="visibility-label">{t("character_show")}</span>
    <button
      class="visibility-toggle"
      class:active={showFigure}
      onclick={onToggle}
      aria-label={showFigure ? t("character_hidden") : t("character_show")}
      title={showFigure ? t("character_hidden") : t("character_show")}
    >
      <i
        class="fas"
        class:fa-eye={showFigure}
        class:fa-eye-slash={!showFigure}
        aria-hidden="true"
      ></i>
    </button>
  </div>

  {#if showFigure}
    <div
      class="character-grid"
      role="radiogroup"
      aria-label={t("character_settings")}
    >
      {#each DEPLOYED_CHARACTER_DEFINITIONS as character}
        <button
          class="character-card"
          class:selected={characterId === character.id}
          role="radio"
          aria-checked={characterId === character.id}
          onclick={() => onCharacterChange(character.id)}
          aria-label={character.name}
          title={character.description}
        >
          <i class="fas {character.icon ?? 'fa-user'}" aria-hidden="true"></i>
          <span class="character-name">{character.name}</span>
        </button>
      {/each}
    </div>
  {:else}
    <div class="hidden-state">
      <span>{t("character_hidden")}</span>
    </div>
  {/if}
</div>

<style>
  .character-panel {
    padding: 0.875rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .visibility-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .visibility-label {
    font-size: var(--font-size-sm, 14px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
  }

  .visibility-toggle {
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 8px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    cursor: pointer;
    transition:
      background var(--transition-fast),
      border-color var(--transition-fast),
      color var(--transition-fast);
  }

  .visibility-toggle:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
    color: var(--theme-text, #ffffff);
  }

  .visibility-toggle.active {
    background: color-mix(in srgb, var(--theme-accent) 20%, transparent);
    border-color: color-mix(in srgb, var(--theme-accent) 30%, transparent);
    color: var(--theme-accent);
  }

  .character-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.5rem;
  }

  .character-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.375rem;
    padding: 0.625rem 0.5rem;
    min-height: 64px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 2px solid transparent;
    border-radius: 10px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    cursor: pointer;
    transition:
      background var(--transition-fast),
      border-color var(--transition-fast),
      color var(--transition-fast);
  }

  .character-card:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
    color: var(--theme-text, #ffffff);
  }

  .character-card.selected {
    background: color-mix(in srgb, var(--theme-accent) 15%, transparent);
    border-color: color-mix(in srgb, var(--theme-accent) 40%, transparent);
    color: var(--theme-accent);
  }

  .character-card i {
    font-size: 1.125rem;
  }

  .character-name {
    font-size: var(--font-size-compact, 12px);
    font-weight: 500;
    text-align: center;
    line-height: 1.2;
  }

  .hidden-state {
    padding: 0.5rem;
    text-align: center;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    font-size: var(--font-size-sm, 14px);
  }

  @media (max-width: 400px) {
    .character-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }
</style>
