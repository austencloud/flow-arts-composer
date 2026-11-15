<!--
StartPlacementChooser.svelte - Generate > Customize > Start Placement.

Two pickers and one big picture, in place of sixteen small toggles: a mode
(Any, Pick one, Custom), where the hands start (apart, together, adjacent),
and how the props point, with one start drawn as large as the box allows.
Custom swaps the picture and the hand picker for the sixteen-cell grid.

The stored setting is unchanged: a blocklist of start placements plus the two
start orientations, handed back through the host's callbacks. The rules that
turn taps into a blocklist live in start-placement-chooser.ts.

Composes SegmentedControl, PictographContainer, PropOrientationControl,
PanelButton and MultiSelectPlacementPicker (with its mode chips off).
-->
<script lang="ts">
  import { onMount, type Snippet } from "svelte";
  import { t, tDynamic } from "#lib/shared/i18n/i18n.svelte.js";
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import type { HapticFeedback } from "#lib/shared/application/services/haptic-feedback.js";
  import type {
    GridLocation,
    GridMode,
    GridPlacement,
  } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import type { Orientation } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
  import { gridCoordinates } from "#lib/shared/pictograph/grid/domain/constants/grid-coordinates.js";
  import { parseCoordinates } from "#lib/shared/pictograph/grid/utils/grid-coordinate-utils.js";
  import PictographContainer from "#lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import { getLetterBorderColorSafe } from "#lib/shared/pictograph/shared/utils/letter-border-utils.js";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import MultiSelectPlacementPicker from "#lib/shared/components/placement-picker/MultiSelectPlacementPicker.svelte";
  import {
    loadStartPlacementVariations,
    orientStartPlacementVariations,
  } from "#lib/shared/components/placement-picker/placement-variations.js";
  import { Crossfade } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import PropOrientationControl from "../../../shared/components/sequence-actions/PropOrientationControl.svelte";
  import {
    PLACEMENT_KINDS,
    changeKind,
    choicesFromVariations,
    handPoints,
    leaveCustom,
    modeFromBlocked,
    moveLeftHandTo,
    pickOnly,
    shownChoice,
    shownMode,
    stepWithinKind,
    type PlacementKind,
    type StartMode,
  } from "./start-placement-chooser";

  interface PlacementPreset {
    id: string;
    label: string;
    blockedPlacements: GridPlacement[];
  }

  let {
    gridMode,
    blockedPlacements,
    leftStartOrientation,
    rightStartOrientation,
    availableOrientations,
    presets = [],
    onBlockedChange,
    onLeftOrientationChange,
    onRightOrientationChange,
    customAside,
    customAsideFolded,
  } = $props<{
    gridMode: GridMode;
    blockedPlacements: GridPlacement[];
    leftStartOrientation: Orientation;
    rightStartOrientation: Orientation;
    availableOrientations: readonly string[];
    /** Named shortcuts for the Custom grid (Classic 3). */
    presets?: PlacementPreset[];
    onBlockedChange: (blocked: GridPlacement[]) => void;
    onLeftOrientationChange: (orientation: string) => void;
    onRightOrientationChange: (orientation: string) => void;
    /** Props point beside the Custom grid where there is room. */
    customAside?: Snippet;
    /** The same, folded to a row that opens its own screen (phones). */
    customAsideFolded?: Snippet;
  }>();

  let haptic: HapticFeedback | null = null;
  onMount(() => {
    haptic = getHapticFeedback() ?? null;
  });

  const handsLabelId = $props.id();
  const propsLabelId = `${handsLabelId}-props`;

  const variations = $derived(loadStartPlacementVariations(gridMode));
  const choices = $derived(choicesFromVariations(variations));

  // Custom while the data still reads Any or one: the grid shows, and the
  // setting changes only when a cell is tapped. Cleared when the grid mode
  // changes, because the placements themselves change.
  let customRequested = $state(false);
  $effect(() => {
    void gridMode;
    customRequested = false;
  });

  const dataMode = $derived(modeFromBlocked(choices, blockedPlacements));
  const mode = $derived(shownMode(dataMode, customRequested));
  const current = $derived(shownChoice(choices, blockedPlacements));
  const selected = $derived(dataMode === "one" ? current : null);

  const picture = $derived.by(() => {
    if (!current) return null;
    const variation = variations.find(
      (v: (typeof variations)[number]) => v.startPlacement === current.placement
    );
    if (!variation) return null;
    return (
      orientStartPlacementVariations(
        [variation],
        leftStartOrientation,
        rightStartOrientation
      )[0] ?? null
    );
  });

  const modeOptions = $derived([
    { value: "any" as const, label: t("shared_controls_any_position") },
    { value: "one" as const, label: t("create_start_mode_pick_one") },
    { value: "custom" as const, label: t("compose_custom") },
  ]);

  const KIND_LABEL_KEY: Record<PlacementKind, string> = {
    apart: "create_start_hands_apart",
    together: "create_start_hands_together",
    adjacent: "create_start_hands_adjacent",
  };

  const kindOptions = $derived(
    PLACEMENT_KINDS.map((kind) => ({
      value: kind,
      label: tDynamic(KIND_LABEL_KEY[kind]),
    }))
  );

  // "none" matches no option, which the shared control draws as nothing
  // selected: in Any no kind is chosen yet.
  const kindValue = $derived<PlacementKind | "none">(
    selected ? selected.kind : "none"
  );

  const LOCATION_WORD: Record<string, string> = {
    n: "north",
    e: "east",
    s: "south",
    w: "west",
    ne: "northeast",
    se: "southeast",
    sw: "southwest",
    nw: "northwest",
  };

  // The grid's hand points, as percentages of the 950-unit pictograph, so the
  // tap targets sit over the points at any picture size.
  const points = $derived.by(() => {
    const table = (
      gridCoordinates as Record<
        string,
        { hand_points: { normal: Record<string, string> } } | undefined
      >
    )[gridMode];
    if (!table) return [];
    return handPoints(choices).flatMap((location) => {
      const raw =
        table.hand_points.normal[`${location}_${gridMode}_hand_point`];
      const at = raw ? parseCoordinates(raw) : null;
      return at
        ? [{ location, x: (at.x / 950) * 100, y: (at.y / 950) * 100 }]
        : [];
    });
  });

  // In the wide arrangement the mode control sits over the top end of the
  // Custom grid's box. The picker keeps that corner clear for its choices and
  // lets the grid start at the top; measured, since the control's size comes
  // from its labels.
  let modeRow = $state<HTMLElement | null>(null);
  let customEl = $state<HTMLElement | null>(null);
  let reserve = $state<{ width: number; height: number } | undefined>();

  function measureReserve() {
    const control = modeRow?.firstElementChild;
    if (!control || !customEl) return;
    const c = control.getBoundingClientRect();
    const box = customEl.getBoundingClientRect();
    const gap = parseFloat(getComputedStyle(modeRow!.parentElement!).rowGap);
    const next =
      c.bottom > box.top + 1
        ? {
            width: Math.ceil(box.right - c.left),
            height: Math.ceil(c.bottom - box.top + (gap || 0)),
          }
        : undefined;
    if (next?.width !== reserve?.width || next?.height !== reserve?.height)
      reserve = next;
  }

  $effect(() => {
    if (!modeRow || !customEl) return;
    const observer = new ResizeObserver(() => measureReserve());
    observer.observe(modeRow);
    observer.observe(customEl);
    return () => observer.disconnect();
  });

  function apply(blocked: GridPlacement[]) {
    haptic?.trigger("selection");
    onBlockedChange(blocked);
  }

  function handleMode(next: StartMode) {
    if (next === "custom") {
      haptic?.trigger("selection");
      customRequested = true;
      return;
    }
    customRequested = false;
    if (next === "any") {
      if (dataMode === "any") return;
      apply([]);
      return;
    }
    if (dataMode === "one") return;
    apply(leaveCustom(choices, blockedPlacements, "one"));
  }

  function handleKind(kind: PlacementKind | "none") {
    if (kind === "none") return;
    const target = changeKind(choices, selected?.placement ?? null, kind);
    if (target) apply(pickOnly(choices, target));
  }

  function step(delta: number) {
    if (!selected) return;
    apply(
      pickOnly(choices, stepWithinKind(choices, selected.placement, delta))
    );
  }

  function tapPoint(location: GridLocation) {
    if (!selected) return;
    const target = moveLeftHandTo(choices, selected.placement, location);
    if (target === selected.placement) return;
    apply(pickOnly(choices, target));
  }
</script>

<div class="start-chooser">
  <div class="chooser-layout">
    <div class="mode-row" bind:this={modeRow}>
      <SegmentedControl
        options={modeOptions}
        value={mode}
        onchange={handleMode}
        color="accent"
        density="compact"
        semantics="radiogroup"
        ariaLabel={t("create_ui_start_placement_label")}
      />
    </div>

    <div class="body">
      <Crossfade
        key={mode === "custom" ? "custom" : "pick"}
        duration={DURATION.normal}
        fill
      >
        {#if mode === "custom"}
          <div class="custom" bind:this={customEl}>
            <MultiSelectPlacementPicker
              layout="split"
              modeChips={false}
              {blockedPlacements}
              {onBlockedChange}
              {leftStartOrientation}
              {rightStartOrientation}
              {presets}
              {gridMode}
              aside={customAside}
              asideFolded={customAsideFolded}
              {reserve}
            />
          </div>
        {:else}
          <div class="pick">
            <div class="picture-cell">
              <div
                class="picture"
                style:--letter-border-color={picture
                  ? getLetterBorderColorSafe(picture.letter)
                  : null}
              >
                {#if picture}
                  <PictographContainer pictographData={picture} />
                {/if}
                {#if selected}
                  {#each points as point (point.location)}
                    <button
                      type="button"
                      class="hand-point"
                      style:left="{point.x}%"
                      style:top="{point.y}%"
                      aria-pressed={selected.left === point.location}
                      aria-label={t("create_start_left_hand_to", {
                        point: tDynamic(
                          `learn_trace_location_${LOCATION_WORD[point.location] ?? "center"}`
                        ),
                      })}
                      onclick={() => tapPoint(point.location)}
                    ></button>
                  {/each}
                {/if}
              </div>
            </div>
            <div class="stepper prev">
              <PanelButton
                variant="quiet"
                ariaLabel={t("create_start_previous")}
                disabled={!selected}
                onclick={() => step(-1)}
              >
                <i class="fas fa-chevron-left" aria-hidden="true"></i>
              </PanelButton>
            </div>
            <div class="stepper next">
              <PanelButton
                variant="quiet"
                ariaLabel={t("create_start_next")}
                disabled={!selected}
                onclick={() => step(1)}
              >
                <i class="fas fa-chevron-right" aria-hidden="true"></i>
              </PanelButton>
            </div>

            <p class="status" aria-live="polite">
              {selected
                ? t("create_start_status_one")
                : t("shared_placement_all_enabled", { total: choices.length })}
            </p>

            <div class="group hands">
              <span class="label" id={handsLabelId}
                >{t("create_start_hands_label")}</span
              >
              <SegmentedControl
                options={kindOptions}
                value={kindValue}
                onchange={handleKind}
                color="accent"
                density="compact"
                semantics="radiogroup"
                ariaLabelledby={handsLabelId}
              />
            </div>

            <div
              class="group props"
              role="group"
              aria-labelledby={propsLabelId}
            >
              <span class="label" id={propsLabelId}
                >{t("create_start_props_label")}</span
              >
              <div class="ori-rows">
                <div class="ori-row">
                  <span class="ori-hand ori-blue">{t("create_ui_left")}</span>
                  <PropOrientationControl
                    hand="left"
                    orientation={leftStartOrientation}
                    allowedOrientations={availableOrientations}
                    onOrientationChange={onLeftOrientationChange}
                    compact
                  />
                </div>
                <div class="ori-row">
                  <span class="ori-hand ori-red">{t("create_ui_right")}</span>
                  <PropOrientationControl
                    hand="right"
                    orientation={rightStartOrientation}
                    allowedOrientations={availableOrientations}
                    onOrientationChange={onRightOrientationChange}
                    compact
                  />
                </div>
              </div>
            </div>
          </div>
        {/if}
      </Crossfade>
    </div>
  </div>
</div>

<style>
  /* Phone budget (stacked): mode 36, picture, stepper and status row 36,
     label 16 + 4 + hands 36, label 16 + 4 + two orientation rows 36 + 8 + 36,
     with four 8px gaps between rows. Everything but the picture comes to
     260px; the picture takes the rest, square, up to the box's width. */
  /* The size container. Its own box cannot answer its queries, so the layout
     lives one level in. */
  .start-chooser {
    container: start-chooser / size;
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
    display: flex;
  }

  .chooser-layout {
    --chooser-control: var(--alt-touch-target, 36px);
    --chooser-gap: 0.5rem;
    --chooser-column: min(22rem, 45%);
    --chooser-column-gap: 1.5rem;
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto minmax(0, 1fr);
    gap: var(--chooser-gap);
  }

  .mode-row {
    grid-row: 1;
    grid-column: 1;
    min-width: 0;
  }

  .body {
    grid-row: 2;
    grid-column: 1;
    position: relative;
    min-height: 0;
    min-width: 0;
  }

  /* The shared control draws every size at 44px; with its own 3px padding
     and 1px border this comes to the 36px phone control (layout law), the
     same override SavePreviewSwitch uses. */
  .mode-row :global(.segment),
  .pick :global(.segment) {
    min-height: calc(var(--chooser-control) - 8px);
    padding-block: 0;
  }

  /* The orientation rows' icon and word side by side, so a row is 36px. */
  .pick :global(.orientation-option) {
    flex-direction: row;
    min-height: 0;
    gap: 0.375rem;
  }

  .pick :global(.orientation-option i) {
    font-size: var(--font-size-sm);
  }

  /* Stacked: the picture across the whole width, the turn stepper flanking
     the status line under it, then hands and props. */
  .pick {
    height: 100%;
    display: grid;
    grid-template-columns:
      var(--chooser-control) minmax(0, 1fr)
      var(--chooser-control);
    grid-template-rows: minmax(0, 1fr) var(--chooser-control) auto auto;
    grid-template-areas:
      "picture picture picture"
      "prev status next"
      "hands hands hands"
      "props props props";
    gap: var(--chooser-gap);
    min-width: 0;
  }

  /* The picture's cell is the size container its square reads. */
  .picture-cell {
    grid-area: picture;
    container-type: size;
    min-height: 0;
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* Square, as large as the cell allows, never above 26rem on a phone. */
  .picture {
    --picture-cap: 26rem;
    position: relative;
    flex: 0 0 auto;
    width: min(100cqh, 100cqw, var(--picture-cap));
    aspect-ratio: 1;
    border-radius: 0.75rem;
    overflow: hidden;
    border: 2px solid
      var(
        --letter-border-color,
        color-mix(in srgb, var(--theme-text, white) 14%, transparent)
      );
    background: color-mix(in srgb, var(--theme-text, white) 4%, transparent);
  }

  .picture :global(.pictograph-container) {
    width: 100%;
    height: 100%;
  }

  /* Invisible 44px targets over the grid's hand points. */
  .hand-point {
    position: absolute;
    width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
    translate: -50% -50%;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: transparent;
    cursor: pointer;
  }

  .hand-point:focus-visible {
    outline: 3px solid var(--theme-accent, #8b6cff);
    outline-offset: -3px;
  }

  .stepper {
    display: flex;
    align-self: center;
  }

  .stepper.prev {
    grid-area: prev;
  }

  .stepper.next {
    grid-area: next;
  }

  .stepper :global(.panel-btn) {
    width: var(--chooser-control);
    min-width: var(--chooser-control);
    height: var(--chooser-control);
    min-height: var(--chooser-control);
    padding: 0;
  }

  .status {
    grid-area: status;
    align-self: center;
    min-width: 0;
    margin: 0;
    min-height: 1rem;
    font-size: var(--font-size-compact, 0.75rem);
    line-height: 1rem;
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
  }

  .hands {
    grid-area: hands;
  }

  .props {
    grid-area: props;
  }

  .group {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-width: 0;
  }

  .label {
    font-size: var(--font-size-compact, 0.75rem);
    line-height: 1rem;
    font-weight: 600;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
  }

  .ori-rows {
    display: flex;
    flex-direction: column;
    gap: var(--chooser-gap);
  }

  .ori-row {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    min-width: 0;
  }

  .ori-row :global(.orientation-control) {
    max-width: none;
  }

  .ori-hand {
    flex-shrink: 0;
    width: 6ch;
    font-size: var(--font-size-sm, 0.875rem);
    font-weight: 700;
  }

  .ori-blue {
    color: color-mix(
      in srgb,
      var(--dm-motion-blue, #3575e2) 60%,
      var(--theme-text, white)
    );
  }

  .ori-red {
    color: color-mix(
      in srgb,
      var(--dm-motion-red, #ed1c24) 70%,
      var(--theme-text, white)
    );
  }

  .custom {
    height: 100%;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .custom :global(.multi-select-grid) {
    flex: 1 1 0;
    min-height: 0;
  }

  /* A box under 25rem tall would leave the picture small: tighter gaps hand
     it 14px back. Fixed parts come to 246px here. */
  @container start-chooser (max-height: 25rem) {
    .chooser-layout {
      --chooser-gap: 0.375rem;
    }

    .group {
      gap: 0.125rem;
    }
  }

  /* Wide panel: the picture on the left filling the height, the mode, hands
     and props in a column on the right. The body spans the whole box so the
     Custom grid keeps its width; the column leaves the mode's row free. */
  @container start-chooser (min-width: 34rem) and (min-aspect-ratio: 1 / 1) {
    .chooser-layout {
      grid-template-columns: minmax(0, 1fr) var(--chooser-column);
      column-gap: var(--chooser-column-gap);
    }

    .mode-row {
      grid-column: 2;
      grid-row: 1;
      z-index: 1;
    }

    .body {
      grid-column: 1 / -1;
      grid-row: 1 / -1;
    }

    /* Steppers back at the picture's sides. The spacer track makes the gap
       before the column the layout's column gap, so the column lines up
       with the mode control above it. */
    .pick {
      grid-template-columns:
        var(--chooser-control) minmax(0, 1fr) var(--chooser-control)
        calc(var(--chooser-column-gap) - 2 * var(--chooser-gap))
        var(--chooser-column);
      grid-template-rows: var(--chooser-control) auto auto auto minmax(0, 1fr);
      grid-template-areas:
        "prev picture next . ."
        "prev picture next . status"
        "prev picture next . hands"
        "prev picture next . props"
        "prev picture next . .";
      column-gap: var(--chooser-gap);
      row-gap: 0.75rem;
    }

    .picture {
      --picture-cap: 32rem;
    }

    .status {
      text-align: start;
    }
  }
</style>
