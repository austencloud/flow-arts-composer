<script lang="ts">
  import GridModeCard from "#lib/features/create/generate/components/cards/GridModeCard.svelte";
  import LevelCard from "#lib/features/create/generate/components/cards/LevelCard.svelte";
  import TurnIntensityCard from "#lib/features/create/generate/components/cards/TurnIntensityCard.svelte";
  import {
    maxTurnIntensitiesForLevel,
    type TurnLevel,
  } from "#lib/shared/create/services/level-turn-values.js";
  import StepperCard from "#lib/shared/components/stepper-card/StepperCard.svelte";
  import { DifficultyLevel } from "#lib/shared/foundation/domain/models/generation/generate-models.js";
  import { GridMode } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import { getFuseContext } from "../context/fuse-context";
  import { FUSE_LENGTHS } from "../state/fuse-state.svelte";

  export type FuseRecipeBasicSection = "length" | "level" | "grid";

  let {
    section,
    presentation = "drawer",
  }: {
    section: FuseRecipeBasicSection;
    presentation?: "drawer" | "popover";
  } = $props();

  const { state: fuseState } = getFuseContext();
  const levelMap: Record<TurnLevel, DifficultyLevel> = {
    1: DifficultyLevel.BEGINNER,
    2: DifficultyLevel.INTERMEDIATE,
    3: DifficultyLevel.ADVANCED,
  };
  const reverseLevelMap: Record<DifficultyLevel, TurnLevel> = {
    [DifficultyLevel.BEGINNER]: 1,
    [DifficultyLevel.INTERMEDIATE]: 2,
    [DifficultyLevel.ADVANCED]: 3,
    [DifficultyLevel.SKEWED]: 3,
  };

  const disabled = $derived(
    fuseState.isLoadingLength ||
      fuseState.pendingSide !== null ||
      fuseState.isFusing
  );
  const lengthIndex = $derived(FUSE_LENGTHS.indexOf(fuseState.requestedLength));
  const allowedTurnIntensities = $derived(
    fuseState.generationLevel === 1
      ? [0]
      : [...maxTurnIntensitiesForLevel(fuseState.generationLevel)]
  );
  const displayedTurnIntensity = $derived(
    fuseState.generationLevel === 1 ? 0 : fuseState.maxTurnIntensity
  );
  const turnsVisible = $derived(
    section === "level" && fuseState.generationLevel > 1
  );
  const minimumLength = FUSE_LENGTHS[0]!;
  const maximumLength = FUSE_LENGTHS[FUSE_LENGTHS.length - 1]!;

  function changeLength(offset: -1 | 1): void {
    if (disabled) return;
    const nextIndex = Math.max(
      0,
      Math.min(FUSE_LENGTHS.length - 1, lengthIndex + offset)
    );
    const nextLength = FUSE_LENGTHS[nextIndex];
    if (nextLength !== undefined) void fuseState.setLength(nextLength);
  }

  function selectLevel(level: DifficultyLevel): void {
    if (disabled) return;
    fuseState.setGenerationLevel(reverseLevelMap[level]);
  }

  function selectTurnIntensity(value: number): void {
    if (disabled || fuseState.generationLevel === 1) return;
    fuseState.setMaxTurnIntensity(value);
  }

  function selectGridMode(value: GridMode): void {
    if (disabled) return;
    fuseState.setGridMode(value);
  }
</script>

<div
  class="recipe-basic-editor {presentation}"
  class:level-editor={section === "level"}
  class:turns-visible={turnsVisible}
  class:disabled
  inert={disabled}
  aria-busy={disabled}
>
  {#if section === "length"}
    <div class="card-wrapper">
      <StepperCard
        title="Length"
        currentValue={fuseState.requestedLength}
        minValue={minimumLength}
        maxValue={maximumLength}
        onIncrement={() => changeLength(1)}
        onDecrement={() => changeLength(-1)}
        formatValue={(value) => String(value)}
        subtitle="steps"
        appearance="quiet"
        gridColumnSpan={3}
        headerFontSize="var(--recipe-editor-title-size)"
      />
    </div>
  {:else if section === "level"}
    <div class="card-wrapper level-card-slot">
      <LevelCard
        currentLevel={levelMap[fuseState.generationLevel]}
        onLevelChange={selectLevel}
        appearance="quiet"
        gridColumnSpan={3}
        headerFontSize="var(--recipe-editor-title-size)"
      />
    </div>

    <div
      class="card-wrapper turn-intensity-slot"
      class:visible={turnsVisible}
      aria-hidden={!turnsVisible}
      inert={!turnsVisible}
    >
      <TurnIntensityCard
        currentIntensity={displayedTurnIntensity}
        allowedValues={allowedTurnIntensities}
        onIntensityChange={selectTurnIntensity}
        appearance="quiet"
        gridColumnSpan={3}
        headerFontSize="var(--recipe-editor-title-size)"
      />
    </div>
  {:else}
    <div class="card-wrapper">
      <GridModeCard
        currentMode={fuseState.gridMode}
        onModeChange={selectGridMode}
        appearance="quiet"
        gridColumnSpan={3}
        headerFontSize="var(--recipe-editor-title-size)"
      />
    </div>
  {/if}
</div>

<style>
  .recipe-basic-editor {
    --recipe-editor-title-size: var(--font-size-min, 14px);
    --card-text-size: clamp(1.4rem, 5cqh, 2.2rem);
    --card-text-weight: 750;
    --card-text-spacing: 0;
    --card-text-shadow: none;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--settings-spacing-md, 14px);
    width: 100%;
    min-width: 0;
  }

  .recipe-basic-editor.level-editor {
    --level-card-gap: var(--settings-spacing-md, 14px);
    grid-template-columns: repeat(2, minmax(0, 1fr));
    column-gap: var(--level-card-gap);
  }

  .level-card-slot {
    z-index: 1;
    transform: translateX(calc(50% + (var(--level-card-gap) / 2)));
    transition: transform var(--duration-emphasis) var(--ease-spring);
  }

  .level-editor.turns-visible .level-card-slot {
    transform: translateX(0);
  }

  .card-wrapper {
    container: generate-card / size;
    display: flex;
    min-width: 0;
    min-height: 11rem;
  }

  .card-wrapper > :global(*) {
    flex: 1;
    min-width: 0;
    min-height: 0;
  }

  .turn-intensity-slot {
    visibility: hidden;
    overflow: clip;
    opacity: 0;
    transform: translateX(-0.75rem) scale(0.96);
    transform-origin: left center;
    pointer-events: none;
    transition:
      opacity var(--duration-fast) ease,
      transform var(--duration-emphasis) var(--ease-spring),
      visibility 0s linear var(--duration-emphasis);
  }

  .turn-intensity-slot.visible {
    visibility: visible;
    opacity: 1;
    transform: translateX(0) scale(1);
    pointer-events: auto;
    transition-delay: var(--duration-instant), 0ms, 0ms;
  }

  /* Basic editors are content-sized. The drill shell may be very tall, but a
     single setting should never expand to impersonate a full workspace. */
  @media (min-width: 561px) {
    .recipe-basic-editor.drawer {
      align-self: start;
    }

    .drawer .card-wrapper {
      height: clamp(11rem, 22vh, 15rem);
    }
  }

  .popover {
    --recipe-editor-title-size: var(--font-size-min, 14px);
    --card-text-size: clamp(1.35rem, 4cqh, 2rem);
  }

  .popover .card-wrapper {
    min-height: 12rem;
  }

  .disabled {
    opacity: 0.58;
  }

  @media (max-width: 560px) {
    .recipe-basic-editor.level-editor,
    .recipe-basic-editor.level-editor.turns-visible {
      grid-template-columns: minmax(0, 1fr);
    }

    .level-card-slot,
    .level-editor.turns-visible .level-card-slot {
      transform: none;
    }

    .recipe-basic-editor.level-editor {
      grid-template-rows: auto 0fr;
      row-gap: 0;
      transition:
        grid-template-rows var(--duration-emphasis) var(--ease-spring),
        row-gap var(--duration-emphasis) var(--ease-spring);
    }

    .recipe-basic-editor.level-editor.turns-visible {
      grid-template-rows: auto 1fr;
      row-gap: var(--settings-spacing-md, 14px);
    }

    .level-editor .turn-intensity-slot {
      min-height: 0;
      transform: translateY(-0.5rem) scale(0.98);
      transform-origin: center top;
      transition:
        min-height var(--duration-emphasis) var(--ease-spring),
        opacity var(--duration-fast) ease,
        transform var(--duration-emphasis) var(--ease-spring),
        visibility 0s linear var(--duration-emphasis);
    }

    .level-editor .turn-intensity-slot.visible {
      min-height: 10rem;
      transform: translateY(0) scale(1);
      transition-delay: 0ms, var(--duration-instant), 0ms, 0ms;
    }

    .card-wrapper {
      min-height: 10rem;
    }
  }

  @media (min-width: 2600px) and (min-height: 1400px) {
    .popover {
      --recipe-editor-title-size: 1rem;
      --card-text-size: 2.25rem;
    }

    .popover .card-wrapper {
      min-height: 15rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .recipe-basic-editor.level-editor,
    .level-card-slot,
    .turn-intensity-slot,
    .level-editor .turn-intensity-slot {
      transition-duration: 0ms;
      transition-delay: 0ms;
    }
  }
</style>
