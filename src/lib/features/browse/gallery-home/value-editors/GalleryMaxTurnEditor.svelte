<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import { Slider } from "bits-ui";
  import { BrowseFilterType } from "$lib/shared/persistence/domain/enums/filtering-enums";
  import type {
    GalleryValueHeadSnippet,
    GalleryWorkspaceProps,
  } from "../gallery-workspace-types";

  type Props = Pick<
    GalleryWorkspaceProps,
    | "catalog"
    | "section"
    | "adaptiveValueLayout"
    | "isValueApplied"
    | "onPickExclusiveValue"
    | "onApply"
  > & { valueHead: GalleryValueHeadSnippet };

  let {
    catalog,
    section,
    adaptiveValueLayout,
    isValueApplied,
    onPickExclusiveValue,
    onApply,
    valueHead,
  }: Props = $props();

  const NO_TURN_LIMIT = $derived(
    (catalog.maxTurnIntensityValues.at(-1)?.value ?? 3) + 0.5
  );
  const maxTurnStops = $derived([
    ...catalog.maxTurnIntensityValues.map((value) => value.value),
    NO_TURN_LIMIT,
  ]);
  const noLimitChoice = $derived({
    value: NO_TURN_LIMIT,
    label: "No limit",
    count: catalog.maxTurnIntensityCount,
  });
  let pendingMaxTurn = $state(Number.NaN);
  const atNoLimit = $derived(pendingMaxTurn === NO_TURN_LIMIT);
  const selectedMaxTurn = $derived(
    atNoLimit
      ? noLimitChoice
      : (catalog.maxTurnIntensityValues.find(
          (value) => value.value === pendingMaxTurn
        ) ?? noLimitChoice)
  );
  // A limit already in the rule wins, so re-entering this editor shows what is
  // actually applied; with nothing applied the thumb sits at "No limit".
  const appliedMaxTurn = $derived(
    isValueApplied
      ? catalog.maxTurnIntensityValues.find((value) =>
          isValueApplied(BrowseFilterType.MAX_TURN_INTENSITY, value.value)
        )?.value
      : undefined
  );
  $effect(() => {
    const known =
      pendingMaxTurn === NO_TURN_LIMIT ||
      catalog.maxTurnIntensityValues.some((v) => v.value === pendingMaxTurn);
    if (catalog.maxTurnIntensityValues.length > 0 && !known) {
      pendingMaxTurn = appliedMaxTurn ?? NO_TURN_LIMIT;
    }
  });
  $effect(() => {
    if (section === "max_turn_intensity") {
      pendingMaxTurn = appliedMaxTurn ?? NO_TURN_LIMIT;
    }
  });

  /** The slider IS the commit — dragging it applies the limit live. Fires only
   * on user interaction, so the applied→pending sync above cannot loop. */
  function commitMaxTurn(next: number) {
    const clearing = next === NO_TURN_LIMIT;
    const choice = clearing
      ? undefined
      : catalog.maxTurnIntensityValues.find((v) => v.value === next);
    if (!clearing && !choice) return;
    if ((choice?.value ?? undefined) === appliedMaxTurn) return;
    const previous =
      appliedMaxTurn !== undefined
        ? catalog.maxTurnIntensityValues.find((v) => v.value === appliedMaxTurn)
        : undefined;
    onPickExclusiveValue(
      BrowseFilterType.MAX_TURN_INTENSITY,
      choice ? choice.value : null,
      choice ? choice.label : "No limit",
      previous ? { value: previous.value, label: previous.label } : undefined
    );
  }
</script>

<div class="drill-screen screen-max-turns">
  {@render valueHead("Set a turn limit")}
  {#if adaptiveValueLayout}
    <!-- Bits Slider normalizes an invalid initial value to its minimum and
         reports that as a change. Wait for our applied/no-limit sync so merely
         opening this editor cannot commit the first stop. -->
    {#if Number.isFinite(pendingMaxTurn) && selectedMaxTurn}
      <div class="turn-picker">
        <div class="turn-summary" aria-live="polite">
          <span class="turn-limit" class:turn-limit-any={atNoLimit}>
            {atNoLimit ? "Any" : `≤${selectedMaxTurn.value}`}
          </span>
          <span class="turn-unit">turns</span>
          <span class="turn-count">{selectedMaxTurn.count} matches</span>
        </div>

        <div class="turn-slider-shell">
          <Slider.Root
            type="single"
            min={maxTurnStops[0]}
            max={maxTurnStops.at(-1)}
            step={maxTurnStops}
            bind:value={pendingMaxTurn}
            onValueChange={commitMaxTurn}
            class="turn-slider-root"
            trackPadding={3}
          >
            {#snippet children({ tickItems })}
              <span class="turn-slider-track">
                <Slider.Range class="turn-slider-range" />
              </span>
              {#each tickItems as { index, value } (value)}
                <Slider.Tick {index} class="turn-slider-tick" />
                <Slider.TickLabel
                  {index}
                  position="bottom"
                  class="turn-slider-label"
                >
                  {value === NO_TURN_LIMIT ? "Any" : `≤${value}`}
                </Slider.TickLabel>
              {/each}
              <Slider.Thumb
                index={0}
                class="turn-slider-thumb"
                aria-label={t("browse_ui_maximum_turn_intensity")}
                aria-valuetext={atNoLimit
                  ? `No turn limit, ${selectedMaxTurn.count} matches`
                  : `At most ${selectedMaxTurn.value} turns, ${selectedMaxTurn.count} matches`}
              />
            {/snippet}
          </Slider.Root>
        </div>
      </div>
    {/if}
  {:else}
    <div class="value-list">
      {#each catalog.maxTurnIntensityValues as v (v.value)}
        <button
          class="length-row monument"
          type="button"
          onclick={() =>
            onApply(BrowseFilterType.MAX_TURN_INTENSITY, v.value, v.label)}
        >
          <span class="value-numeral small">≤{v.value}</span>
          <span class="value-main">
            <span class="value-label muted">max turns</span>
            <span class="density-bar">
              <span
                class="density-fill"
                style:width="{(v.count / catalog.maxTurnIntensityCount) * 100}%"
              ></span>
            </span>
          </span>
          <span class="value-count">{v.count}</span>
        </button>
      {/each}
    </div>
  {/if}
</div>
