<!--
  FuseRecipeRail — the whole Fuse recipe as one row of the app's setting cards.

  Every slot here is a quiet appearance of a card from the Generate bento, not
  a Fuse-local imitation. Fuse owns the wiring and arrangement; the shared
  cards own interaction, accessibility, and responsive behavior.

  The cards share one width. Turns grows its track from zero above level 1;
  Linked rule controls live directly below this rail.
-->
<script lang="ts">
  import GridModeCard from "$lib/features/create/generate/components/cards/GridModeCard.svelte";
  import LevelCard from "$lib/features/create/generate/components/cards/LevelCard.svelte";
  import ToggleCard from "$lib/features/create/generate/components/cards/ToggleCard.svelte";
  import TurnIntensityCard from "$lib/features/create/generate/components/cards/TurnIntensityCard.svelte";
  import StepperCard from "$lib/shared/components/stepper-card/StepperCard.svelte";
  import {
    maxTurnIntensitiesForLevel,
    type TurnLevel,
  } from "$lib/shared/create/services/level-turn-values";
  import { DifficultyLevel } from "$lib/shared/foundation/domain/models/generation/generate-models";
  import type { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import { getFuseContext } from "../context/fuse-context";
  import type { FuseRecipeDestination } from "../domain/fuse-recipe-destination";
  import type { FuseRecipeSummaries } from "../domain/fuse-recipe-summaries";
  import { FUSE_LENGTHS, type FuseMode } from "../state/fuse-state.svelte";
  import FuseRecipePopover from "./FuseRecipePopover.svelte";

  let {
    summaries,
    disabled = false,
    activeSetting = null,
    onSettingOpenChange,
    onModeChange,
  }: {
    summaries: FuseRecipeSummaries;
    disabled?: boolean;
    activeSetting?: FuseRecipeDestination | null;
    onSettingOpenChange: (
      destination: FuseRecipeDestination,
      open: boolean
    ) => void;
    onModeChange: (mode: FuseMode) => void;
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

  const minimumLength = FUSE_LENGTHS[0]!;
  const maximumLength = FUSE_LENGTHS[FUSE_LENGTHS.length - 1]!;
  const lengthIndex = $derived(FUSE_LENGTHS.indexOf(fuseState.requestedLength));
  // Level 1 has no turns to cap, so the ceiling has nothing to say and the card
  // is not there. Above it the ceiling is a real second decision.
  const turnsVisible = $derived(fuseState.generationLevel > 1);
  const allowedTurnIntensities = $derived(
    fuseState.generationLevel === 1
      ? [0]
      : [...maxTurnIntensitiesForLevel(fuseState.generationLevel)]
  );
  const displayedTurnIntensity = $derived(
    fuseState.generationLevel === 1 ? 0 : fuseState.maxTurnIntensity
  );
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

  function selectGridMode(value: GridMode): void {
    if (disabled) return;
    fuseState.setGridMode(value);
  }

  function selectTurnIntensity(value: number): void {
    if (disabled || fuseState.generationLevel === 1) return;
    fuseState.setMaxTurnIntensity(value);
  }
</script>

<div
  class="recipe-rail"
  class:turns={turnsVisible}
  class:disabled
  inert={disabled}
  aria-busy={disabled}
  aria-label="Fuse recipe"
>
  <div class="card-slot">
    <StepperCard
      title="Length"
      currentValue={fuseState.requestedLength}
      minValue={minimumLength}
      maxValue={maximumLength}
      onIncrement={() => changeLength(1)}
      onDecrement={() => changeLength(-1)}
      formatValue={(value: number) => String(value)}
      subtitle="steps"
      appearance="quiet"
      gridColumnSpan={1}
      headerFontSize="var(--rail-card-title-size)"
    />
  </div>

  <div class="card-slot">
    <LevelCard
      currentLevel={levelMap[fuseState.generationLevel]}
      onLevelChange={selectLevel}
      appearance="quiet"
      gridColumnSpan={1}
      headerFontSize="var(--rail-card-title-size)"
    />
  </div>

  <div
    class="card-slot swing-slot"
    class:visible={turnsVisible}
    aria-hidden={!turnsVisible}
    inert={!turnsVisible}
  >
    <TurnIntensityCard
      currentIntensity={displayedTurnIntensity}
      allowedValues={allowedTurnIntensities}
      onIntensityChange={selectTurnIntensity}
      appearance="quiet"
      gridColumnSpan={1}
      headerFontSize="var(--rail-card-title-size)"
    />
  </div>

  <div class="card-slot">
    <GridModeCard
      currentMode={fuseState.gridMode}
      onModeChange={selectGridMode}
      appearance="quiet"
      gridColumnSpan={1}
      headerFontSize="var(--rail-card-title-size)"
    />
  </div>

  <div class="card-slot">
    <FuseRecipePopover
      destination="style"
      title="Style"
      summary={summaries.style}
      width="36rem"
      open={activeSetting === "style"}
      headerFontSize="var(--rail-card-title-size)"
      onOpenChange={(open) => onSettingOpenChange("style", open)}
    />
  </div>

  <div class="card-slot">
    <FuseRecipePopover
      destination="starting"
      title="Starting"
      summary={summaries.starting}
      width="54rem"
      open={activeSetting === "starting"}
      headerFontSize="var(--rail-card-title-size)"
      onOpenChange={(open) => onSettingOpenChange("starting", open)}
    />
  </div>

  <!-- Pairing is the one recipe decision that changes what the whole tab is, so
       it shows both of its answers at once rather than naming the current one. -->
  <div class="card-slot">
    <ToggleCard
      title="Pairing"
      option1={{ value: "shuffle" as FuseMode, label: "Separate" }}
      option2={{ value: "symmetry" as FuseMode, label: "Linked" }}
      activeOption={fuseState.mode}
      onToggle={onModeChange}
      appearance="quiet"
      gridColumnSpan={1}
      headerFontSize="var(--rail-card-title-size)"
    />
  </div>
</div>

<style>
  /* Hidden until the header has room to lay the recipe out flat; below that the
     same settings are reached through the recipe button. */
  .recipe-rail {
    display: none;
  }

  .card-slot {
    container: generate-card / size;
    display: flex;
    min-width: 0;
    min-height: 0;
  }

  .card-slot > :global(*) {
    flex: 1;
    min-width: 0;
    min-height: 0;
  }

  /* An open popover holds its card distinct, so the row identifies the active
     editor without reintroducing the Generate screen's colored card glow. */
  .card-slot :global(.base-card[data-state="open"]) {
    border-color: var(--theme-stroke-strong);
    background: var(--theme-card-hover-bg);
  }

  .swing-slot {
    overflow: clip;
    opacity: 0;
    transition: opacity var(--duration-emphasis, 280ms)
      var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1));
  }

  .swing-slot.visible {
    opacity: 1;
  }

  .disabled {
    opacity: 0.58;
  }

  @container fuse (min-width: 1680px) and (min-height: 900px) {
    .recipe-rail {
      order: 2;
      display: grid;
      /* A stable track list lets Turns expand without shifting abruptly. */
      grid-template-columns:
        minmax(0, 1fr) minmax(0, 1fr) minmax(0, 0fr) minmax(0, 1fr)
        minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr);
      /* Tall enough that the cards are read rather than deciphered. Below
         95px ToggleCard shrinks its icons to 12px and lays its options out
         side by side; below 65px it drops its title outright. At 84px — what
         this was while the header title held a row of its own — Grid and
         Pairing were both in that first band. */
      grid-auto-rows: 7.5rem;
      gap: 8px;
      /* Shares the header's one row with the title: no basis of its own, so
         it takes whatever the title leaves. Keep it in this shorthand — a
         bare `flex-basis` earlier in the block gets reset by this
         declaration. */
      flex: 1 1 0;
      max-width: 200rem;
      min-width: 0;
      /* The card text scales off each card's own box, so one declaration here
         keeps all seven reading at the same size. */
      --rail-card-title-size: var(--font-size-compact, 12px);
      --card-text-size: clamp(0.9rem, 18cqh, 1.25rem);
      --card-text-weight: 750;
      --card-text-spacing: 0;
      --card-text-shadow: none;
      transition: grid-template-columns var(--duration-emphasis, 280ms)
        var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1));
    }

    .recipe-rail.turns {
      grid-template-columns:
        minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)
        minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr);
    }
  }

  @container fuse (min-width: 2600px) and (min-height: 1400px) {
    .recipe-rail {
      grid-auto-rows: 9rem;
      gap: 12px;
      --rail-card-title-size: var(--font-size-min, 14px);
      --card-text-size: clamp(1.05rem, 17cqh, 1.5rem);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .recipe-rail,
    .swing-slot {
      transition-duration: 0ms;
      transition-delay: 0ms;
    }
  }
</style>
