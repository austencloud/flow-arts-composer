<!--
FuseRecipeForm.svelte - one hand's settings for new paths, every choice visible.

One ChoiceRow per setting, in three groups. Style is GenerationStylePanel, so
Fuse and Generate keep one set of words and choices; the other rows are the
same row. The rows share the height they are given (fuse-recipe-form-fit.ts).
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import GenerationStylePanel from "#lib/shared/create/components/GenerationStylePanel.svelte";
  import { DEFAULT_GENERATION_STYLE } from "#lib/shared/create/domain/generation-style.js";
  import { maxTurnIntensitiesForLevel } from "#lib/shared/create/services/level-turn-values.js";
  import { MAX_AVAILABLE_LEVEL } from "#lib/shared/create/utils/config-mapper.js";
  import { startOrientationsForLevel } from "#lib/features/create/generate/domain/level-orientation-policy.js";
  import {
    GridLocation,
    GridMode,
  } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import {
    Orientation,
    type Orientation as OrientationValue,
  } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
  import ChoiceRow from "#lib/shared/ui/components/ChoiceRow.svelte";
  import {
    FUSE_RECIPE_GROUPS,
    type FuseRecipeGroup,
  } from "../domain/fuse-recipe-destination";
  import { FUSE_RECIPE_GROUP_LABELS } from "../domain/fuse-recipe-summaries";
  import {
    FUSE_RECIPE_COLUMN_GAP,
    FUSE_RECIPE_GROUP_ROWS,
    FUSE_RECIPE_NAME_COLUMN,
    FUSE_RECIPE_SIDE_BY_SIDE_ROWS,
    type FuseRecipeFormLayout,
  } from "../services/fuse-recipe-form-fit";
  import type { SoloLoopTraversalDirection } from "../services/solo-loop-generator";
  import {
    FUSE_LENGTHS,
    type FuseHandRecipeControls,
    type FuseLength,
  } from "../state/fuse-state.svelte";

  let {
    recipe,
    layout,
    groups = FUSE_RECIPE_GROUPS,
    phone = false,
  }: {
    /** The one hand whose settings for new paths this edits. */
    recipe: FuseHandRecipeControls;
    layout: FuseRecipeFormLayout;
    groups?: readonly FuseRecipeGroup[];
    phone?: boolean;
  } = $props();

  const uid = $props.id();

  type AnyOr<T extends string> = "random" | T;

  // These read the current language, so they are derived rather than fixed
  // when the form is first built.
  const DIAMOND_POINTS = $derived([
    { value: GridLocation.NORTH, label: t("fuse_form_north"), shortLabel: "N" },
    { value: GridLocation.EAST, label: t("fuse_form_east"), shortLabel: "E" },
    { value: GridLocation.SOUTH, label: t("fuse_form_south"), shortLabel: "S" },
    { value: GridLocation.WEST, label: t("fuse_form_west"), shortLabel: "W" },
  ]);
  const BOX_POINTS = $derived([
    {
      value: GridLocation.NORTHEAST,
      label: t("fuse_form_northeast"),
      shortLabel: "NE",
    },
    {
      value: GridLocation.SOUTHEAST,
      label: t("fuse_form_southeast"),
      shortLabel: "SE",
    },
    {
      value: GridLocation.SOUTHWEST,
      label: t("fuse_form_southwest"),
      shortLabel: "SW",
    },
    {
      value: GridLocation.NORTHWEST,
      label: t("fuse_form_northwest"),
      shortLabel: "NW",
    },
  ]);
  const ORIENTATIONS = $derived([
    { value: Orientation.IN, label: t("fuse_form_orient_in") },
    { value: Orientation.OUT, label: t("fuse_form_orient_out") },
    { value: Orientation.CLOCK, label: t("fuse_form_orient_clock") },
    { value: Orientation.COUNTER, label: t("fuse_form_orient_counter") },
  ]);
  const ANY = $derived({ value: "random" as const, label: t("fuse_any") });
  const LEVEL_HINTS = $derived<Record<string, string>>({
    "1": t("fuse_form_hint_level_1"),
    "2": t("fuse_form_hint_level_2"),
    "3": t("fuse_form_hint_level_3"),
  });
  const GRID_HINTS = $derived<Record<string, string>>({
    [GridMode.DIAMOND]: t("fuse_form_hint_grid_diamond"),
    [GridMode.BOX]: t("fuse_form_hint_grid_box"),
  });
  const TRAVEL_HINTS = $derived<
    Record<AnyOr<SoloLoopTraversalDirection>, string>
  >({
    random: t("fuse_form_hint_travel_any"),
    clockwise: t("fuse_form_hint_travel_cw"),
    counterclockwise: t("fuse_form_hint_travel_ccw"),
  });
  const lengthOptions = $derived(
    FUSE_LENGTHS.map((length) => ({
      value: String(length),
      label: String(length),
      ariaLabel: t("fuse_steps_count", { count: length }),
    }))
  );
  const levelOptions = $derived(
    Array.from({ length: MAX_AVAILABLE_LEVEL }, (_, i) => ({
      value: String(i + 1),
      label: String(i + 1),
      ariaLabel: t("fuse_level_number", { level: i + 1 }),
    }))
  );
  const gridOptions = $derived([
    { value: GridMode.DIAMOND as string, label: t("fuse_grid_diamond") },
    { value: GridMode.BOX as string, label: t("fuse_grid_box") },
  ]);
  const travelOptions = $derived<
    {
      value: AnyOr<SoloLoopTraversalDirection>;
      label: string;
      shortLabel?: string;
    }[]
  >([
    ANY,
    {
      value: "clockwise",
      label: t("fuse_form_clockwise"),
      shortLabel: t("fuse_travel_cw"),
    },
    {
      value: "counterclockwise",
      label: t("fuse_form_counterclockwise"),
      shortLabel: t("fuse_travel_ccw"),
    },
  ]);
  const turnOptions = $derived(
    maxTurnIntensitiesForLevel(recipe.generationLevel).map((turns) => ({
      value: String(turns),
      label: String(turns),
      ariaLabel:
        turns === 1
          ? t("fuse_form_turn_one_aria")
          : t("fuse_form_turns_other_aria", { count: turns }),
    }))
  );
  const pointOptions = $derived<
    {
      value: AnyOr<GridLocation>;
      label: string;
      shortLabel?: string;
    }[]
  >([ANY, ...(recipe.gridMode === GridMode.BOX ? BOX_POINTS : DIAMOND_POINTS)]);
  const orientationOptions = $derived<
    { value: AnyOr<OrientationValue>; label: string }[]
  >([
    ANY,
    ...ORIENTATIONS.filter((option) =>
      startOrientationsForLevel(recipe.generationLevel).includes(option.value)
    ),
  ]);

  const row = $derived({
    arrangement: layout.arrangement,
    showHint: layout.hints,
    phone,
  });

  function orNull<T extends string>(value: AnyOr<T>): T | null {
    return value === "random" ? null : value;
  }
</script>

<div
  class="recipe-form"
  class:side-by-side={layout.sideBySide}
  class:headed={layout.headings}
  style:--fuse-name-column="{FUSE_RECIPE_NAME_COLUMN}px"
  style:--fuse-column-gap="{FUSE_RECIPE_COLUMN_GAP}px"
>
  {#each groups as group (group)}
    <section
      class="recipe-group {group}"
      style:flex-grow={layout.sideBySide
        ? FUSE_RECIPE_SIDE_BY_SIDE_ROWS[group]
        : FUSE_RECIPE_GROUP_ROWS[group]}
      aria-labelledby={layout.headings ? `${uid}-${group}` : undefined}
      aria-label={layout.headings ? undefined : FUSE_RECIPE_GROUP_LABELS[group]}
    >
      {#if layout.headings}
        <h4 class="group-name" id="{uid}-{group}">
          {FUSE_RECIPE_GROUP_LABELS[group]}
        </h4>
      {/if}
      {#if group === "path"}
        <ChoiceRow
          {...row}
          arrangement={layout.lengthAbove ? "above" : row.arrangement}
          label={t("fuse_recipe_fact_length")}
          hint={t("fuse_form_hint_length")}
          options={lengthOptions}
          value={String(recipe.requestedLength)}
          onchange={(value) => recipe.setLength(Number(value) as FuseLength)}
        />
        <ChoiceRow
          {...row}
          label={t("fuse_recipe_fact_level")}
          hint={LEVEL_HINTS[recipe.generationLevel] ?? ""}
          hints={Object.values(LEVEL_HINTS)}
          options={levelOptions}
          value={String(recipe.generationLevel)}
          onchange={(value) => recipe.setGenerationLevel(Number(value))}
        />
        <ChoiceRow
          {...row}
          label={t("fuse_recipe_fact_max_turns")}
          hint={t("fuse_form_hint_max_turns")}
          options={turnOptions}
          value={String(recipe.maxTurnIntensity)}
          onchange={(value) => recipe.setMaxTurnIntensity(Number(value))}
          swapKey={recipe.generationLevel}
          empty={t("fuse_form_no_turns_level_1")}
        />
        <ChoiceRow
          {...row}
          label={t("fuse_recipe_fact_grid")}
          hint={GRID_HINTS[recipe.gridMode] ?? ""}
          hints={Object.values(GRID_HINTS)}
          options={gridOptions}
          value={recipe.gridMode as string}
          onchange={(value) => recipe.setGridMode(value as GridMode)}
        />
      {:else if group === "style"}
        <GenerationStylePanel
          arrangement="rows"
          {row}
          constraintPreset={recipe.constraintPreset}
          handPathMode={recipe.handPathMode}
          motionTypeFilter={recipe.motionTypeFilter}
          baseline={DEFAULT_GENERATION_STYLE}
          haptic={null}
          onPropsChange={recipe.setConstraintPreset}
          onHandsChange={recipe.setHandPathMode}
          onDashesChange={(value) =>
            recipe.setMotionTypeFilter(value === "mixed" ? null : value)}
        />
      {:else}
        <ChoiceRow
          {...row}
          label={t("fuse_recipe_fact_start_point")}
          hint={t("fuse_form_hint_start_point")}
          options={pointOptions}
          value={recipe.startLocation ?? "random"}
          onchange={(value) => recipe.setStartLocation(orNull(value))}
          swapKey={recipe.gridMode}
        />
        <ChoiceRow
          {...row}
          label={t("fuse_recipe_fact_orientation")}
          hint={t("fuse_form_hint_orientation")}
          options={orientationOptions}
          value={recipe.startOrientation ?? "random"}
          onchange={(value) => recipe.setStartOrientation(orNull(value))}
          swapKey={orientationOptions.length}
          fitLabels={true}
        />
        <ChoiceRow
          {...row}
          label={t("fuse_recipe_fact_travel")}
          hint={TRAVEL_HINTS[recipe.traversalDirection ?? "random"]}
          hints={Object.values(TRAVEL_HINTS)}
          options={travelOptions}
          value={recipe.traversalDirection ?? "random"}
          onchange={(value) => recipe.setTraversalDirection(orNull(value))}
        />
      {/if}
    </section>
  {/each}
</div>

<style>
  .recipe-form {
    --choice-name-column: var(--fuse-name-column);
    --choice-column-gap: var(--fuse-column-gap);
    container: fuse-recipe-form / inline-size;
    display: flex;
    flex-direction: column;
    gap: 13px;
    width: 100%;
    height: 100%;
    min-width: 0;
  }

  .recipe-group {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }

  /* The line between two groups stands in the gap, so every row keeps the
     same share of the height. */
  .recipe-group + .recipe-group {
    position: relative;
  }

  .recipe-group + .recipe-group::before {
    position: absolute;
    top: -7px;
    right: 0;
    left: 0;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    content: "";
  }

  .group-name {
    flex: 0 0 auto;
    margin: 0;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    font-size: var(--font-size-base, 16px);
    font-weight: 600;
    line-height: 24px;
  }

  .recipe-group > :global(.choice-row) {
    flex: 1 1 auto;
  }

  /* Every setting keeps its name above its control, so the settings line up
     across as well as down. */
  .side-by-side .recipe-group {
    display: grid;
    grid-auto-rows: 1fr;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    column-gap: 16px;
  }

  .side-by-side.headed .recipe-group {
    grid-template-rows: auto;
  }

  .side-by-side .group-name {
    grid-column: 1 / -1;
  }

  .side-by-side .recipe-group.style {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  /* Five points, five orientations (the longer words), three ways round. */
  .side-by-side .recipe-group.start {
    grid-template-columns: minmax(0, 5fr) minmax(0, 5.3fr) minmax(0, 3.05fr);
  }

  @container fuse-recipe-form (min-width: 576px) {
    .recipe-group {
      --choice-name-column: minmax(0, 1fr);
      --choice-control-column: minmax(21rem, 1.35fr);
      --choice-column-gap: 1.5rem;
    }
  }
</style>
