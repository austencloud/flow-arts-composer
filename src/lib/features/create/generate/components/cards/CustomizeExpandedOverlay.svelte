<!--
CustomizeExpandedOverlay.svelte - Customize panel, one decision at a time.

A SettingsDrillPanel whose landing screen is CustomizeOverview: the Style
controls live on the landing screen itself, and the Start and End Placement
tiles preview their pickers with the real pictographs. Choosing a placement
tile gives that picker the whole panel. Single column at every size; see
SettingsDrillPanel's header for why the two-pane variant was removed.

Replaced an accordion that put start placement and end placement on the same
screen (end placement nested INSIDE start placement) and, because the expanded
section flex-shrank below its content against its own `overflow: hidden`,
clipped 415px of that content instead of scrolling.
Spec: docs/superpowers/specs/2026-08-02-customize-panel-drilldown-design.md
-->
<script lang="ts">
  import { t, tDynamic } from "#lib/shared/i18n/i18n.svelte.js";
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import type { HapticFeedback } from "#lib/shared/application/services/haptic-feedback.js";
  import { onMount, untrack } from "svelte";
  import type { StartEndOptions } from "#lib/shared/create/state/panel-coordination-state.svelte.js";
  import {
    recallCustomizeScreen,
    rememberCustomizeScreen,
  } from "#lib/shared/create/state/customize-overlay-hmr.js";
  import {
    GridMode,
    type GridPlacement,
  } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import {
    detectPresetFromBlocked,
    getAllowedPlacements,
    getAllPlacements,
    getBlockedPlacementsForPreset,
    StartPlacementPreset,
  } from "../../shared/domain/start-placement-presets";
  import SettingsDrillRow from "#lib/shared/ui/components/settings-drill/SettingsDrillRow.svelte";
  import SettingsDrillPanel, {
    type SettingsDrillItem,
  } from "#lib/shared/ui/components/settings-drill/SettingsDrillPanel.svelte";
  import MultiSelectPlacementPicker from "#lib/shared/components/placement-picker/MultiSelectPlacementPicker.svelte";
  import PropOrientationControl from "../../../shared/components/sequence-actions/PropOrientationControl.svelte";
  import { Orientation } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
  import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";
  import PictographContainer from "#lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import { getLetterBorderColorSafe } from "#lib/shared/pictograph/shared/utils/letter-border-utils.js";
  import {
    loadStartPlacementVariations,
    orientStartPlacementVariations,
  } from "#lib/shared/components/placement-picker/placement-variations.js";
  import { buildStartEndOptions } from "./customize-start-end-options";
  import {
    describeStyle,
    PRODUCTION_STYLE_BASELINE,
    type CustomizeStyleBaseline,
  } from "./customize-summary";
  import { GENERATE_DEFAULT_CONFIG } from "../../state/generate-config.svelte";
  import ConfirmDialog from "#lib/shared/foundation/ui/ConfirmDialog.svelte";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import GenerationSettingsOverlay from "./GenerationSettingsOverlay.svelte";
  import CustomizeOverview from "./CustomizeOverview.svelte";
  import GenerationStylePanel from "#lib/shared/create/components/GenerationStylePanel.svelte";
  import {
    clampStartOrientationToLevel,
    startOrientationsForLevel,
  } from "../../domain/level-orientation-policy";

  let {
    constraintPreset,
    handPathMode,
    motionTypeFilter,
    startEndOptions,
    level = 3,
    gridMode = GridMode.DIAMOND,
    isFreeformMode = true,
    styleBaseline = PRODUCTION_STYLE_BASELINE,
    onConstraintPresetChange,
    onHandPathModeChange,
    onMotionTypeFilterChange,
    onStartEndChange,
    onResetAll = null,
    onClose,
    entrance = "scale",
    titleId,
    active = true,
    session,
  } = $props<{
    constraintPreset: "smooth" | "mixed" | "choppy";
    handPathMode: "smooth" | "mixed" | "choppy";
    motionTypeFilter: "no-dash" | "prefer-dash" | null;
    startEndOptions: StartEndOptions | null;
    level?: number;
    gridMode?: GridMode;
    isFreeformMode?: boolean;
    styleBaseline?: CustomizeStyleBaseline;
    onConstraintPresetChange: (v: "smooth" | "mixed" | "choppy") => void;
    onHandPathModeChange: (v: "smooth" | "mixed" | "choppy") => void;
    onMotionTypeFilterChange: (v: "no-dash" | "mixed" | "prefer-dash") => void;
    onStartEndChange: ((options: StartEndOptions) => void) | null;
    onResetAll?: (() => void) | null;
    onClose: () => void;
    /** "none" when a host transition (the card morph) is already carrying the
     *  panel in; forwarded to GenerationSettingsOverlay, whose default "scale"
     *  is what CustomizeDrawer relies on for its own drawer-hosted entrance. */
    entrance?: "scale" | "none";
    /** Forwarded to GenerationSettingsOverlay's heading id, so a host stage's
     *  aria-labelledby points at the title this overlay actually renders. */
    titleId?: string;
    /** False while a host keeps this overlay built but hidden between opens
     *  (ExpandedCardStage). Going inactive returns to the root list. */
    active?: boolean;
    /** Changes on every open of a kept overlay; each new value while active
     *  reloads the local settings from the props, as a fresh mount would. */
    session?: unknown;
  }>();

  let hapticService: HapticFeedback | null = $state(null);
  const oriHeadingId = $props.id();

  onMount(() => {
    hapticService = getHapticFeedback();
  });

  // Always opens on the root list — picking WHICH factor to change is itself
  // the first decision, and the list shows all current values, so nothing
  // is buried the way it was when one accordion section was open at a time.
  // (The accordion's "remember the last open section" localStorage existed
  // because a collapsed section hid its value; the root list doesn't.)
  //
  // One exception, development only: a hot reload remounts this overlay, and
  // coming back to the root list every time an agent saves a file is no better
  // than being closed outright. recallCustomizeScreen returns null unless the
  // overlay was open a moment ago, so a genuine open still starts at the list.
  let selected = $state<string | null>(recallCustomizeScreen());

  $effect(() => {
    rememberCustomizeScreen(selected);
  });

  function handleSelect(_id: string | null) {
    hapticService?.trigger("selection");
  }

  // The overview tiles report a choice; the drill panel owns the push.
  function openScreen(id: string) {
    selected = id;
    handleSelect(id);
  }

  // ─── Local state for style (instant UI feedback) ───
  let localConstraintPreset = $state<"smooth" | "mixed" | "choppy">(
    untrack(() => constraintPreset)
  );
  let localHandPathMode = $state<"smooth" | "mixed" | "choppy">(
    untrack(() => handPathMode)
  );
  let localMotionTypeFilter = $state<"no-dash" | "prefer-dash" | null>(
    untrack(() => motionTypeFilter)
  );

  // ─── Local state for start placements (instant UI feedback) ───
  let localBlockedPlacements = $state<GridPlacement[]>(
    untrack(() => startEndOptions)?.blockedStartPlacements ?? []
  );
  // Allowed end placements. Empty = "Any", exactly like an empty
  // blockedStartPlacements means every start is allowed — the two pickers now
  // read the same way.
  let localEndPlacements = $state<GridPlacement[]>(
    untrack(() => startEndOptions)?.endPlacements ?? []
  );

  // ─── Local state for start orientation (blue + red, default In/In) ───
  let localLeftOri = $state<Orientation>(
    clampStartOrientationToLevel(
      untrack(() => startEndOptions)?.leftStartOrientation,
      level
    )
  );
  let localRightOri = $state<Orientation>(
    clampStartOrientationToLevel(
      untrack(() => startEndOptions)?.rightStartOrientation,
      level
    )
  );
  const availableStartOrientations = $derived(startOrientationsForLevel(level));

  // The Prop orientations screen draws one start position with the props as
  // chosen, the first one the start picker allows, so the screen keeps what
  // the grid beside the controls gave: the setting and its result together.
  // Loaded only once that screen is first opened.
  let oriVariations = $state<PictographData[]>([]);

  $effect(() => {
    if (selected !== "startOri" || oriVariations.length > 0) return;
    oriVariations = loadStartPlacementVariations(gridMode);
  });

  const oriPreview = $derived.by(() => {
    const blocked = new Set(localBlockedPlacements);
    const first =
      oriVariations.find(
        (v) => !blocked.has(v.startPlacement as GridPlacement)
      ) ?? oriVariations[0];
    if (!first) return null;
    return (
      orientStartPlacementVariations([first], localLeftOri, localRightOri)[0] ??
      null
    );
  });

  // A kept overlay is not remounted per open, so each open reloads what a
  // mount would have: the settings from the props, and the root list.
  let wasActive = untrack(() => active);
  let lastSession = untrack(() => session);
  $effect.pre(() => {
    const on = active;
    const current = session;
    untrack(() => {
      if (on && (!wasActive || current !== lastSession)) {
        loadFromProps();
      } else if (!on && wasActive) {
        selected = null;
        resetConfirmOpen = false;
      }
    });
    wasActive = on;
    lastSession = current;
  });

  function loadFromProps() {
    localConstraintPreset = constraintPreset;
    localHandPathMode = handPathMode;
    localMotionTypeFilter = motionTypeFilter;
    localBlockedPlacements = startEndOptions?.blockedStartPlacements ?? [];
    localEndPlacements = startEndOptions?.endPlacements ?? [];
    localLeftOri = clampStartOrientationToLevel(
      startEndOptions?.leftStartOrientation,
      level
    );
    localRightOri = clampStartOrientationToLevel(
      startEndOptions?.rightStartOrientation,
      level
    );
  }

  // Current preset (All / Classic 3 / Custom) derived from the blocked list.
  const currentPreset = $derived(
    detectPresetFromBlocked(localBlockedPlacements, gridMode)
  );

  // How many placements are enabled (for the row summary).
  const enabledCount = $derived(
    getAllowedPlacements(localBlockedPlacements, gridMode).length
  );

  // Classic 3 remains a useful shortcut, but Custom is a state, not an action.
  // The shared picker owns All and Choose one for both start and end screens.
  const startPlacementPresets = $derived([
    {
      id: "classic",
      label: t("create_deep_classic_three"),
      blockedPlacements: getBlockedPlacementsForPreset(
        StartPlacementPreset.CLASSIC,
        gridMode
      ),
    },
  ]);

  const startPosDisplay = $derived.by(() => {
    if (!startEndOptions) return t("shared_controls_any_position");
    if (currentPreset === StartPlacementPreset.ANY)
      return t("shared_controls_any_position");
    if (currentPreset === StartPlacementPreset.CLASSIC)
      return t("create_deep_classic_three");
    return t("create_deep_position_count", { count: enabledCount });
  });

  const endPosDisplay = $derived.by(() => {
    const n = localEndPlacements.length;
    if (n === 0) return t("shared_controls_any_position");
    if (n === 1) return String(localEndPlacements[0]);
    return t("create_deep_placement_count", { count: n });
  });

  // The shared picker speaks blocklist; end placements are an allowlist. Invert
  // at this seam so the primitive is reused unchanged (never-hand-roll) and
  // both placement screens look and behave identically: all cells bright = no
  // constraint, dim some = constrain to whatever stays bright.
  const endBlockedPlacements = $derived(
    localEndPlacements.length === 0
      ? []
      : getAllPlacements(gridMode).filter(
          (p) => !localEndPlacements.includes(p)
        )
  );

  function handleEndBlockedChange(blocked: GridPlacement[]) {
    if (!startEndOptions || !onStartEndChange) return;
    hapticService?.trigger("selection");
    const allowed = getAllowedPlacements(blocked, gridMode);
    // Everything enabled is the "Any" state, not a 16-way constraint. Storing
    // it as [] keeps the engine unconstrained and the row honest.
    localEndPlacements =
      allowed.length === getAllPlacements(gridMode).length ? [] : allowed;
    emitStartEndChange();
  }

  // The two screens behind the landing tiles. Style has no screen of its own:
  // its three controls sit on the landing tile. Start orientation lives under
  // Start Placement, where the picker is already drawing the props it
  // describes, instead of on a screen of its own.
  //
  // End Placement stays present and locked when LOOP owns it, so a user who
  // saw the setting once is not left with no explanation.
  const styleValue = $derived(
    describeStyle(
      localConstraintPreset,
      localHandPathMode,
      localMotionTypeFilter
    )
  );

  function orientationWord(ori: string): string {
    return tDynamic(
      ori === "in" || ori === "out"
        ? `create_ui_orientation_${ori}_short`
        : `create_action_orientation_${ori}_short`
    );
  }

  const orientationValue = $derived(
    `${t("create_ui_left")}: ${orientationWord(localLeftOri)} · ${t("create_ui_right")}: ${orientationWord(localRightOri)}`
  );

  // Style is a screen of its own only on a panel too small for its controls
  // beside the placements (CustomizeOverview's rows layout). Start orientation
  // is one only on a panel too small for it beside the start grid, where the
  // picker folds it to a row.
  const drillItems = $derived<SettingsDrillItem[]>([
    {
      id: "style",
      label: t("create_ui_style_label"),
      value: styleValue,
    },
    {
      id: "startPos",
      label: t("create_ui_start_placement_label"),
      value: startPosDisplay,
    },
    {
      id: "startOri",
      label: t("create_ui_prop_orientations"),
      value: orientationValue,
      parent: "startPos",
    },
    {
      id: "endPos",
      label: t("create_ui_end_placement_label"),
      value: endPosDisplay,
      disabled: !isFreeformMode,
      disabledReason: t("create_ui_set_by_loop"),
    },
  ]);

  function handlePropsChange(v: "smooth" | "mixed" | "choppy") {
    localConstraintPreset = v;
    onConstraintPresetChange(v);
  }

  function handleHandsChange(v: "smooth" | "mixed" | "choppy") {
    localHandPathMode = v;
    onHandPathModeChange(v);
  }

  function handleDashesChange(v: "no-dash" | "mixed" | "prefer-dash") {
    localMotionTypeFilter = v === "mixed" ? null : v;
    onMotionTypeFilterChange(v);
  }

  function handleClose() {
    hapticService?.trigger("selection");
    onClose();
  }

  // Reset every persisted generation setting. Confirmed first because there's
  // no undo: this overlay's props are a snapshot frozen at open time, so a
  // restore could reach the config but not the local mirrors below, and the
  // panel would sit there reading "Default" over restored values.
  let resetConfirmOpen = $state(false);

  function performResetAll() {
    resetConfirmOpen = false;
    if (!onResetAll) return;
    hapticService?.trigger("selection");
    onResetAll();
    localConstraintPreset = GENERATE_DEFAULT_CONFIG.constraintPreset;
    localHandPathMode = GENERATE_DEFAULT_CONFIG.handPathMode;
    localMotionTypeFilter = GENERATE_DEFAULT_CONFIG.motionTypeFilter;
    localBlockedPlacements = [];
    localEndPlacements = [];
    localLeftOri = Orientation.IN;
    localRightOri = Orientation.IN;
  }

  // Emit a COMPLETE, internally-consistent options object built from the
  // overlay's live local state. The engine's setOptions() does a full replace,
  // so emitting anything less (e.g. the frozen open-time snapshot + one field)
  // reverts every field the user isn't currently touching. See
  // buildStartEndOptions for the full rationale.
  function emitStartEndChange() {
    if (!startEndOptions || !onStartEndChange) return;
    onStartEndChange(
      buildStartEndOptions(startEndOptions, {
        blockedStartPlacements: localBlockedPlacements,
        endPlacements: localEndPlacements,
        leftStartOrientation: localLeftOri,
        rightStartOrientation: localRightOri,
      })
    );
  }

  // ─── Start Placement handlers ───
  function applyBlockedPlacements(blocked: GridPlacement[]) {
    if (!startEndOptions || !onStartEndChange) return;
    localBlockedPlacements = blocked;
    emitStartEndChange();
  }

  // Manual multi-select toggles from the shared grid primitive.
  function handleBlockedChange(blocked: GridPlacement[]) {
    applyBlockedPlacements(blocked);
  }

  // Start orientation per prop. Feeds the engine's left/rightStartOrientation
  // override so the generated sequence begins from the chosen orientation.
  function handleLeftOriChange(ori: string) {
    if (!startEndOptions || !onStartEndChange) return;
    hapticService?.trigger("selection");
    localLeftOri = ori as Orientation;
    emitStartEndChange();
  }

  function handleRightOriChange(ori: string) {
    if (!startEndOptions || !onStartEndChange) return;
    hapticService?.trigger("selection");
    localRightOri = ori as Orientation;
    emitStartEndChange();
  }
</script>

<GenerationSettingsOverlay
  title={t("create_ui_customize")}
  closeLabel={t("create_deep_close_customize")}
  onClose={handleClose}
  {entrance}
  {titleId}
>
  {#snippet actions()}
    {#if onResetAll}
      <PanelButton
        variant="quiet"
        ariaLabel={t(
          "create_ui_reset_all_generation_settings_to_their_defaults"
        )}
        onclick={() => {
          hapticService?.trigger("selection");
          resetConfirmOpen = true;
        }}
      >
        {t("settings_preset_reset_all")}
      </PanelButton>
    {/if}
  {/snippet}

  {#snippet children()}
    <SettingsDrillPanel
      items={drillItems}
      bind:selected
      onSelect={handleSelect}
    >
      {#snippet listContent()}
        <CustomizeOverview
          {gridMode}
          constraintPreset={localConstraintPreset}
          handPathMode={localHandPathMode}
          motionTypeFilter={localMotionTypeFilter}
          {styleBaseline}
          haptic={hapticService}
          onPropsChange={handlePropsChange}
          onHandsChange={handleHandsChange}
          onDashesChange={handleDashesChange}
          {styleValue}
          startBlocked={localBlockedPlacements}
          startValue={startPosDisplay}
          leftStartOrientation={localLeftOri}
          rightStartOrientation={localRightOri}
          endAllowed={localEndPlacements}
          endValue={endPosDisplay}
          endLocked={!isFreeformMode}
          onOpen={openScreen}
        />
      {/snippet}

      {#snippet detail(id)}
        {#if id === "style"}
          <GenerationStylePanel
            constraintPreset={localConstraintPreset}
            handPathMode={localHandPathMode}
            motionTypeFilter={localMotionTypeFilter}
            baseline={styleBaseline}
            haptic={hapticService}
            onPropsChange={handlePropsChange}
            onHandsChange={handleHandsChange}
            onDashesChange={handleDashesChange}
          />
        {:else if id === "startPos"}
          <div class="drill-fill grid-fill">
            <MultiSelectPlacementPicker
              layout="split"
              blockedPlacements={localBlockedPlacements}
              onBlockedChange={handleBlockedChange}
              leftStartOrientation={localLeftOri}
              rightStartOrientation={localRightOri}
              presets={startPlacementPresets}
              {gridMode}
            >
              <!-- Beside the picker where there is room: the props in the
                   grid redraw as these change, so the setting and its result
                   are visible at the same time. On a panel too small for both,
                   a row that opens them on a screen of their own. -->
              {#snippet aside()}
                {@render orientationControls(true)}
              {/snippet}
              {#snippet asideFolded()}
                <SettingsDrillRow
                  label={t("create_ui_prop_orientations")}
                  value={orientationValue}
                  onclick={() => openScreen("startOri")}
                />
              {/snippet}
            </MultiSelectPlacementPicker>
          </div>
        {:else if id === "startOri"}
          <div class="drill-fill ori-screen">
            <div class="ori-layout">
              <div class="ori-preview-box" aria-hidden="true">
                <div
                  class="ori-preview"
                  style:--letter-border-color={oriPreview
                    ? getLetterBorderColorSafe(oriPreview.letter)
                    : null}
                >
                  {#if oriPreview}
                    <PictographContainer pictographData={oriPreview} />
                  {/if}
                </div>
              </div>
              {@render orientationControls(false)}
            </div>
          </div>
        {:else if id === "endPos"}
          <div class="drill-fill grid-fill">
            <MultiSelectPlacementPicker
              layout="split"
              blockedPlacements={endBlockedPlacements}
              onBlockedChange={handleEndBlockedChange}
              leftStartOrientation={localLeftOri}
              rightStartOrientation={localRightOri}
              {gridMode}
            />
          </div>
        {/if}
      {/snippet}
    </SettingsDrillPanel>
  {/snippet}
</GenerationSettingsOverlay>

{#snippet orientationControls(withHeading: boolean)}
  <section
    class="ori-block"
    aria-labelledby={withHeading ? oriHeadingId : undefined}
  >
    {#if withHeading}
      <h5 class="ori-heading" id={oriHeadingId}>
        {t("create_ui_prop_orientations")}
      </h5>
    {/if}
    <div class="ori-hands">
      <div class="ori-row">
        <span class="ori-hand ori-blue">{t("create_ui_left")}</span>
        <PropOrientationControl
          hand="left"
          orientation={localLeftOri}
          allowedOrientations={availableStartOrientations}
          onOrientationChange={handleLeftOriChange}
        />
      </div>
      <div class="ori-row">
        <span class="ori-hand ori-red">{t("create_ui_right")}</span>
        <PropOrientationControl
          hand="right"
          orientation={localRightOri}
          allowedOrientations={availableStartOrientations}
          onOrientationChange={handleRightOriChange}
        />
      </div>
    </div>
  </section>
{/snippet}

<ConfirmDialog
  bind:isOpen={resetConfirmOpen}
  title={t("create_ui_reset_all_settings")}
  message={t("create_generate_reset_all_message")}
  confirmText={t("viewer_ui_reset")}
  cancelText={t("create_generate_keep_settings")}
  variant="danger"
  onConfirm={performResetAll}
  onCancel={() => (resetConfirmOpen = false)}
/>

<style>
  /* Full-height wrapper for the placement screens. The picker takes its whole
     box and fits itself to it (layout "split"); on a box too small even at
     the touch floor, it overflows into the drill body's scroller. */
  .grid-fill {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .grid-fill :global(.multi-select-grid) {
    flex: 1 1 0;
    min-height: 0;
  }

  /* The Prop orientations screen, on a panel too small for the controls beside
     the start grid: a start position drawn as large as the box allows, the
     controls under it, or beside it on a box wider than it is tall. */
  .ori-screen {
    container: ori-screen / size;
    display: flex;
    min-width: 0;
  }

  /* One level in: a container's own size query cannot restyle it. */
  .ori-layout {
    flex: 1 1 auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    min-width: 0;
  }

  .ori-preview-box {
    container-type: size;
    flex: 1 1 0;
    align-self: stretch;
    min-height: 6rem;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .ori-preview {
    width: min(100cqw, 100cqh);
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

  .ori-layout > .ori-block {
    flex: 0 0 auto;
    width: min(100%, 54rem);
  }

  @container ori-screen (min-aspect-ratio: 5 / 4) {
    .ori-layout {
      flex-direction: row;
      align-items: center;
      gap: 1.5rem;
    }

    .ori-preview-box {
      align-self: stretch;
      min-height: 0;
    }

    .ori-layout > .ori-block {
      width: min(40%, 26rem);
    }
  }

  .ori-block {
    container: ori-block / inline-size;
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
    padding: 0.875rem;
    border-radius: 0.875rem;
    background: color-mix(in srgb, var(--theme-text, white) 5%, transparent);
    border: 1px solid
      color-mix(in srgb, var(--theme-text, white) 10%, transparent);
  }

  .ori-heading {
    margin: 0 0 0.125rem;
    font-size: var(--font-size-sm, 0.875rem);
    font-weight: 600;
    color: var(--theme-text, white);
  }

  .ori-hands {
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
  }

  /* Wide enough for both hands on one line: half the height, which under a
     stacked grid is height the grid gets back. */
  @container ori-block (min-width: 34rem) {
    .ori-hands {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      column-gap: 1.5rem;
    }
  }

  /* Capped: four short labels are a compact control, and letting the row
     stretch across a wide pane parked the hand name a third of a pane away
     from the buttons it names. */
  .ori-row {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    max-width: 26rem;
  }

  /* Sized in ch to the longer word: at this weight "Right" ran past a 44px box
     and closed the gap to the control it names. */
  .ori-hand {
    flex-shrink: 0;
    width: 6ch;
    font-size: var(--font-size-sm, 0.875rem);
    font-weight: 700;
  }

  /* Left and Right, not Blue and Red: the tint already says which prop, so the
     word names the hand, the part a first-time reader cannot get by looking.
     Mixed toward the theme's own text color so the prop hue keeps its
     contrast on both the dark and the light panel. */
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
</style>
