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
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
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
  import SettingsDrillPanel, {
    type SettingsDrillItem,
  } from "#lib/shared/ui/components/settings-drill/SettingsDrillPanel.svelte";
  import MultiSelectPlacementPicker from "#lib/shared/components/placement-picker/MultiSelectPlacementPicker.svelte";
  import PropOrientationControl from "../../../shared/components/sequence-actions/PropOrientationControl.svelte";
  import { Orientation } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
  import { buildStartEndOptions } from "./customize-start-end-options";
  import {
    PRODUCTION_STYLE_BASELINE,
    type CustomizeStyleBaseline,
  } from "./customize-summary";
  import { GENERATE_DEFAULT_CONFIG } from "../../state/generate-config.svelte";
  import ConfirmDialog from "#lib/shared/foundation/ui/ConfirmDialog.svelte";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import GenerationSettingsOverlay from "./GenerationSettingsOverlay.svelte";
  import CustomizeOverview from "./CustomizeOverview.svelte";
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
  const drillItems = $derived<SettingsDrillItem[]>([
    {
      id: "startPos",
      label: t("create_ui_start_placement_label"),
      value: startPosDisplay,
    },
    {
      id: "endPos",
      label: t("create_ui_end_placement_label"),
      value: endPosDisplay,
      disabled: !isFreeformMode,
      disabledReason: t("create_ui_set_by_loop"),
    },
  ]);

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
          onPropsChange={(v) => {
            localConstraintPreset = v;
            onConstraintPresetChange(v);
          }}
          onHandsChange={(v) => {
            localHandPathMode = v;
            onHandPathModeChange(v);
          }}
          onDashesChange={(v) => {
            localMotionTypeFilter = v === "mixed" ? null : v;
            onMotionTypeFilterChange(v);
          }}
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
        {#if id === "startPos"}
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
              <!-- Beside the picker, not on a screen of its own: the props in
                   the grid redraw as these change, so the setting and its
                   result are visible at the same time. -->
              {#snippet aside()}
                <section class="ori-block" aria-labelledby={oriHeadingId}>
                  <h5 class="ori-heading" id={oriHeadingId}>
                    {t("create_ui_prop_orientations")}
                  </h5>
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
                </section>
              {/snippet}
            </MultiSelectPlacementPicker>
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
  /* Full-height wrapper for the placement screens. It is a size container so
     the picker can fit its square grid to the height the pane actually has. */
  .grid-fill {
    container-type: size;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  /* The two sizes the picker's grid may take, measured against this wrapper.
     Stacked (narrow panes), chips and the status line sit above the grid, so
     the square is the height minus that band. The 20rem floor keeps a cell
     legible on a 412px-tall window; below it the body scrolls instead, since
     a readable cell you scroll to beats a smudge you do not. Side by side
     (wide panes), the controls move beside the grid, so it may use nearly the
     whole height. */
  .grid-fill :global(.multi-select-grid) {
    --placement-grid-size: min(100%, max(20rem, calc(100cqh - 8.5rem)));
    --placement-grid-split-size: max(18rem, calc(100cqh - 1rem));
    flex: 0 0 auto;
    min-height: 0;
  }

  .ori-block {
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
