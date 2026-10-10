<script lang="ts">
  import type {
    ModuleDefinition,
    Section,
  } from "#lib/shared/navigation/domain/types.js";

  let {
    module,
    sections,
    currentModule,
    currentSection,
    moduleHomeActive = false,
    onSelect,
  }: {
    module: ModuleDefinition;
    sections: Section[];
    currentModule: string;
    currentSection: string;
    moduleHomeActive?: boolean;
    onSelect: (sectionId?: string) => void | Promise<void>;
  } = $props();

  function isActive(sectionId: string): boolean {
    return (
      currentModule === module.id &&
      !moduleHomeActive &&
      currentSection === sectionId
    );
  }
</script>

<nav class="destination-list" aria-label={`${module.label} destinations`}>
  {#if module.home}
    <button
      type="button"
      class="destination-button home-destination"
      class:active={currentModule === module.id && moduleHomeActive}
      style:--destination-color={module.color}
      aria-current={currentModule === module.id && moduleHomeActive
        ? "page"
        : undefined}
      onclick={() => onSelect()}
    >
      <span class="destination-icon" aria-hidden="true">
        {@html module.home.icon ?? module.icon}
      </span>
      <span class="destination-copy">
        <strong>{module.home.optionLabel ?? module.home.label}</strong>
        {#if module.home.description}
          <small>{module.home.description}</small>
        {/if}
      </span>
      <i class="fas fa-arrow-right destination-arrow" aria-hidden="true"></i>
    </button>
  {/if}

  {#each sections as section (section.id)}
    <button
      type="button"
      class="destination-button"
      class:active={isActive(section.id)}
      style:--destination-color={section.color ?? module.color}
      disabled={section.disabled}
      aria-current={isActive(section.id) ? "page" : undefined}
      onclick={() => onSelect(section.id)}
    >
      <span
        class="destination-icon"
        style:--destination-color={section.color ?? module.color}
        aria-hidden="true"
      >
        {@html section.icon}
      </span>
      <span class="destination-copy">
        <strong>{section.label}</strong>
        {#if section.description}
          <small>{section.description}</small>
        {/if}
      </span>
      <i class="fas fa-arrow-right destination-arrow" aria-hidden="true"></i>
    </button>
  {/each}
</nav>

<style>
  .destination-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    width: min(100%, 42rem);
    margin: 0 auto;
    padding: 0.25rem;
  }

  .destination-button {
    width: 100%;
    min-height: var(--min-touch-target);
    display: grid;
    grid-template-columns: var(--min-touch-target) minmax(0, 1fr) 1.25rem;
    align-items: center;
    gap: 0.75rem;
    padding: 0.65rem 0.75rem;
    border: 1px solid var(--theme-stroke);
    border-radius: 0.75rem;
    background: var(--theme-card-bg);
    color: var(--theme-text);
    cursor: pointer;
    text-align: left;
    transition:
      background-color var(--transition-normal),
      border-color var(--transition-normal);
  }

  .destination-button:hover:not(:disabled) {
    background: var(--theme-card-hover-bg);
    border-color: var(--theme-stroke-strong);
  }

  .destination-button:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .destination-button.active {
    border-color: color-mix(
      in srgb,
      var(--destination-color, var(--theme-accent)) 55%,
      var(--theme-stroke)
    );
    background: color-mix(
      in srgb,
      var(--destination-color, var(--theme-accent)) 13%,
      var(--theme-card-bg)
    );
  }

  .destination-button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .destination-icon {
    --destination-color: var(--module-color, var(--theme-accent));

    width: var(--min-touch-target);
    height: var(--min-touch-target);
    display: grid;
    place-items: center;
    border-radius: 0.65rem;
    background: color-mix(in srgb, var(--destination-color) 14%, transparent);
    color: var(--destination-color);
    font-size: var(--font-size-lg);
  }

  .destination-copy {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .destination-copy strong {
    font-size: var(--font-size-min);
    font-weight: 650;
  }

  .destination-copy small {
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact);
    line-height: 1.35;
  }

  .destination-arrow {
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact);
    text-align: center;
  }

  @media (prefers-reduced-motion: reduce) {
    .destination-button {
      transition: none;
    }
  }
</style>
