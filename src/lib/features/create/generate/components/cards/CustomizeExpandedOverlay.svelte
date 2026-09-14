<!--
CustomizeExpandedOverlay.svelte - Customize panel, one decision at a time.

A SettingsDrillPanel over Style, Start Position, End Position, and Hand
Relationship.
The root list shows each one's current value; choosing a row
gives that setting the whole panel. Single column at every size — see
SettingsDrillPanel's header for why the two-pane variant was removed.

Replaced an accordion that put start position and end position on the same
screen (end position nested INSIDE start position) and, because the expanded
section flex-shrank below its content against its own `overflow: hidden`,
clipped 415px of that content instead of scrolling.
Spec: docs/superpowers/specs/2026-08-02-customize-panel-drilldown-design.md
-->
<script lang="ts">
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import type { HapticFeedback } from "$lib/shared/application/services/haptic-feedback";
  import { onMount, untrack } from "svelte";
  import type { StartEndOptions } from "$lib/shared/create/state/panel-coordination-state.svelte";
  import {
    recallCustomizeScreen,
    rememberCustomizeScreen,
  } from "$lib/shared/create/state/customize-overlay-hmr";
  import {
    GridMode,
    type GridPosition,
  } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import {
    detectPresetFromBlocked,
    getAllowedPositions,
    getAllPositions,
    getBlockedPositionsForPreset,
    StartPositionPreset,
  } from "../../shared/domain/start-position-presets";
  import GenerationStylePanel from "$lib/shared/create/components/GenerationStylePanel.svelte";
  import HandRelationshipPanel from "./HandRelationshipPanel.svelte";
  import {
    describeHandRelationship,
    type HandRelationship,
  } from "$lib/shared/create/domain/hand-relationship";
  import SettingsDrillPanel, {
    type SettingsDrillItem,
  } from "$lib/shared/ui/components/settings-drill/SettingsDrillPanel.svelte";
  import MultiSelectPositionPicker from "$lib/shared/components/position-picker/MultiSelectPositionPicker.svelte";
  import PropOrientationControl from "../../../shared/components/sequence-actions/PropOrientationControl.svelte";
  import { Orientation } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
  import { buildStartEndOptions } from "./customize-start-end-options";
  import {
    buildCustomizeSummary,
    PRODUCTION_STYLE_BASELINE,
    type CustomizeStyleBaseline,
  } from "./customize-summary";
  import { GENERATE_DEFAULT_CONFIG } from "../../state/generate-config.svelte";
  import ConfirmDialog from "$lib/shared/foundation/ui/ConfirmDialog.svelte";
  import GenerationSettingsOverlay from "./GenerationSettingsOverlay.svelte";
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
    handRelationship = "free",
    handRelationshipInverted = false,
    matchHandTurns = false,
    onHandRelationshipChange = null,
    onHandRelationshipInvertedChange = null,
    onMatchHandTurnsChange = null,
    onStartEndChange,
    onResetAll = null,
    onClose,
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
    handRelationship?: HandRelationship;
    handRelationshipInverted?: boolean;
    matchHandTurns?: boolean;
    onHandRelationshipChange?: ((v: HandRelationship) => void) | null;
    onHandRelationshipInvertedChange?: ((v: boolean) => void) | null;
    onMatchHandTurnsChange?: ((v: boolean) => void) | null;
    onStartEndChange: ((options: StartEndOptions) => void) | null;
    onResetAll?: (() => void) | null;
    onClose: () => void;
  }>();

  let hapticService: HapticFeedback | null = $state(null);

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

  // ─── Local state for the hand relationship (instant UI feedback) ───
  let localHandRelationship = $state<HandRelationship>(
    untrack(() => handRelationship)
  );
  let localHandRelationshipInverted = $state<boolean>(
    untrack(() => handRelationshipInverted)
  );
  let localMatchHandTurns = $state<boolean>(untrack(() => matchHandTurns));

  // ─── Local state for start positions (instant UI feedback) ───
  let localBlockedPositions = $state<GridPosition[]>(
    untrack(() => startEndOptions)?.blockedStartPositions ?? []
  );
  // Allowed end positions. Empty = "Any", exactly like an empty
  // blockedStartPositions means every start is allowed — the two pickers now
  // read the same way.
  let localEndPositions = $state<GridPosition[]>(
    untrack(() => startEndOptions)?.endPositions ?? []
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
    detectPresetFromBlocked(localBlockedPositions, gridMode)
  );

  // How many positions are enabled (for the row summary).
  const enabledCount = $derived(
    getAllowedPositions(localBlockedPositions, gridMode).length
  );

  // Classic 3 remains a useful shortcut, but Custom is a state, not an action.
  // The shared picker owns All and Choose one for both start and end screens.
  const startPositionPresets = $derived([
    {
      id: "classic",
      label: "Classic 3",
      blockedPositions: getBlockedPositionsForPreset(
        StartPositionPreset.CLASSIC,
        gridMode
      ),
    },
  ]);

  const startPosDisplay = $derived.by(() => {
    if (!startEndOptions) return "Any";
    if (currentPreset === StartPositionPreset.ANY) return "Any";
    if (currentPreset === StartPositionPreset.CLASSIC) return "Classic 3";
    return enabledCount === 1 ? "1 pos" : `${enabledCount} pos`;
  });

  const endPosDisplay = $derived.by(() => {
    const n = localEndPositions.length;
    if (n === 0) return "Any";
    if (n === 1) return String(localEndPositions[0]);
    return `${n} positions`;
  });

  // The shared picker speaks blocklist; end positions are an allowlist. Invert
  // at this seam so the primitive is reused unchanged (never-hand-roll) and
  // both position screens look and behave identically: all cells bright = no
  // constraint, dim some = constrain to whatever stays bright.
  const endBlockedPositions = $derived(
    localEndPositions.length === 0
      ? []
      : getAllPositions(gridMode).filter((p) => !localEndPositions.includes(p))
  );

  function handleEndBlockedChange(blocked: GridPosition[]) {
    if (!startEndOptions || !onStartEndChange) return;
    hapticService?.trigger("selection");
    const allowed = getAllowedPositions(blocked, gridMode);
    // Everything enabled is the "Any" state, not a 16-way constraint. Storing
    // it as [] keeps the engine unconstrained and the row honest.
    localEndPositions =
      allowed.length === getAllPositions(gridMode).length ? [] : allowed;
    emitStartEndChange();
  }

  // Names the axes that differ instead of saying "Custom". The bare word left
  // the collapsed card ("Props: Mixed") looking like it had singled out one of
  // three axes at random, when Props was simply the only one off its default.
  // Same resolver the card uses, so the two can't disagree.
  const styleSummary = $derived.by(() => {
    const { isDefault, facts } = buildCustomizeSummary(
      {
        constraintPreset: localConstraintPreset,
        handPathMode: localHandPathMode,
        motionTypeFilter: localMotionTypeFilter,
        startEndOptions: null,
      },
      styleBaseline
    );
    return isDefault ? "Default" : facts.join(" · ");
  });

  // The three rows. Start orientation used to be a fourth, which asked the user
  // to set where the props start in one place and which way they point in
  // another — the same decision, split in two. It now lives under Start
  // Position, where the picker is already drawing the props it describes.
  //
  // End Position stays present and locked when LOOP owns it — dropping the row
  // would change the list length and move the row below it, and leave a user
  // who saw the setting once with no explanation.
  //
  // Hand Relationship appears only on surfaces that pass a change handler;
  // the public Composer demo does not offer it.
  const drillItems = $derived<SettingsDrillItem[]>([
    { id: "style", label: "Style", value: styleSummary },
    { id: "startPos", label: "Start Position", value: startPosDisplay },
    {
      id: "endPos",
      label: "End Position",
      value: endPosDisplay,
      disabled: !isFreeformMode,
      disabledReason: "Set by LOOP",
    },
    ...(onHandRelationshipChange
      ? [
          {
            id: "hands",
            label: "Hand Relationship",
            value: describeHandRelationship(
              localHandRelationship,
              localHandRelationshipInverted,
              localMatchHandTurns
            ),
          },
        ]
      : []),
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
    localHandRelationship = GENERATE_DEFAULT_CONFIG.handRelationship;
    localHandRelationshipInverted =
      GENERATE_DEFAULT_CONFIG.handRelationshipInverted;
    localMatchHandTurns = GENERATE_DEFAULT_CONFIG.matchHandTurns;
    localBlockedPositions = [];
    localEndPositions = [];
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
        blockedStartPositions: localBlockedPositions,
        endPositions: localEndPositions,
        leftStartOrientation: localLeftOri,
        rightStartOrientation: localRightOri,
      })
    );
  }

  // ─── Start Position handlers ───
  function applyBlockedPositions(blocked: GridPosition[]) {
    if (!startEndOptions || !onStartEndChange) return;
    localBlockedPositions = blocked;
    emitStartEndChange();
  }

  // Manual multi-select toggles from the shared grid primitive.
  function handleBlockedChange(blocked: GridPosition[]) {
    applyBlockedPositions(blocked);
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
  title="Customize"
  closeLabel="Close customize panel"
  onClose={handleClose}
>
  {#snippet actions()}
    {#if onResetAll}
      <button
        class="reset-button"
        onclick={() => {
          hapticService?.trigger("selection");
          resetConfirmOpen = true;
        }}
        aria-label="Reset all generation settings to their defaults"
      >
        Reset all
      </button>
    {/if}
  {/snippet}

  {#snippet children()}
    <SettingsDrillPanel
      items={drillItems}
      bind:selected
      onSelect={handleSelect}
    >
      {#snippet listHeader()}
        <!-- These settings persist across sessions, which is what made a saved
             Choppy props value look like a broken generator. Say so up front. -->
        <p class="overlay-note">
          These settings stick until you change them again.
        </p>
      {/snippet}

      {#snippet detail(id)}
        {#if id === "style"}
          <div class="drill-fill spread">
            <GenerationStylePanel
              constraintPreset={localConstraintPreset}
              handPathMode={localHandPathMode}
              motionTypeFilter={localMotionTypeFilter}
              baseline={styleBaseline}
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
            />
          </div>
        {:else if id === "startPos"}
          <div class="drill-fill grid-fill">
            <MultiSelectPositionPicker
              blockedPositions={localBlockedPositions}
              onBlockedChange={handleBlockedChange}
              leftStartOrientation={localLeftOri}
              rightStartOrientation={localRightOri}
              presets={startPositionPresets}
              {gridMode}
            />
            <!-- Under the picker, not on a screen of its own: the props above
                 redraw as these change, so the setting and its result are
                 visible at the same time. -->
            <div class="ori-block">
              <div class="ori-row">
                <span class="ori-color-label ori-blue">Left</span>
                <PropOrientationControl
                  hand="left"
                  orientation={localLeftOri}
                  allowedOrientations={availableStartOrientations}
                  onOrientationChange={handleLeftOriChange}
                />
              </div>
              <div class="ori-row">
                <span class="ori-color-label ori-red">Right</span>
                <PropOrientationControl
                  hand="right"
                  orientation={localRightOri}
                  allowedOrientations={availableStartOrientations}
                  onOrientationChange={handleRightOriChange}
                />
              </div>
            </div>
          </div>
        {:else if id === "endPos"}
          <div class="drill-fill grid-fill">
            <MultiSelectPositionPicker
              blockedPositions={endBlockedPositions}
              onBlockedChange={handleEndBlockedChange}
              leftStartOrientation={localLeftOri}
              rightStartOrientation={localRightOri}
              {gridMode}
            />
          </div>
        {:else if id === "hands"}
          <div class="drill-fill spread">
            <HandRelationshipPanel
              relationship={localHandRelationship}
              inverted={localHandRelationshipInverted}
              haptic={hapticService}
              onRelationshipChange={(v) => {
                localHandRelationship = v;
                onHandRelationshipChange?.(v);
              }}
              onInvertedChange={(v) => {
                localHandRelationshipInverted = v;
                onHandRelationshipInvertedChange?.(v);
              }}
              matchTurns={localMatchHandTurns}
              turnsAvailable={level >= 2}
              onMatchTurnsChange={(v) => {
                localMatchHandTurns = v;
                onMatchHandTurnsChange?.(v);
              }}
            />
          </div>
        {/if}
      {/snippet}
    </SettingsDrillPanel>
  {/snippet}
</GenerationSettingsOverlay>

<ConfirmDialog
  bind:isOpen={resetConfirmOpen}
  title="Reset all settings?"
  message="Style, hand relationship, start positions, level, length and LOOP settings all go back to their defaults. This can't be undone."
  confirmText="Reset"
  cancelText="Keep"
  variant="danger"
  onConfirm={performResetAll}
  onCancel={() => (resetConfirmOpen = false)}
/>

<style>
  /* A real button, not a text link — it's a standalone action. */
  .reset-button {
    flex-shrink: 0;
    min-height: var(--min-touch-target);
    padding: 0 14px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.1));
    border: 1px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    border-radius: 8px;
    color: var(--theme-text, white);
    font-family: inherit;
    font-size: var(--font-size-sm, 14px);
    font-weight: 600;
    white-space: nowrap;
    cursor: pointer;
    transition:
      background var(--duration-normal) ease,
      border-color var(--duration-normal) ease;
  }

  .reset-button:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.15));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.3));
  }

  .reset-button:focus-visible {
    outline: 2px solid var(--customize-accent);
    outline-offset: 2px;
  }

  .overlay-note {
    margin: 0 0 8px;
    flex-shrink: 0;
    font-size: var(--font-size-compact, 12px);
    color: rgba(255, 255, 255, 0.55);
  }

  /* `spread` distributes a short form down the pane instead of leaving it
     stacked at the top with 700px of nothing under it. `grid-fill` lets a
     pictograph grid grow into the height it has. Both are the sibling
     drawers' pattern: full-height box, content spread to fill it. */
  /* Top-aligned, normal gaps. Spreading these across a full-height pane was
     tried and reverted: at 1315px the three Style axes ended up 275px apart
     and stopped reading as one group. A form's rows belong together; the
     leftover height is the panel's problem, not theirs. */
  .spread {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .spread :global(.style-panel) {
    flex: 0 0 auto;
    justify-content: flex-start;
  }

  /* A 4x4 grid of square cells is as tall as it is wide, so the panel's WIDTH
     caps it and it cannot consume the leftover height of a full-height column.
     Every attempt to make it try was worse: centering it stranded the preset
     control 396px above it, and stretching the rows would letterbox a square
     pictograph inside a tall cell. So the grid takes all the width it can,
     sits directly under its control, and the remainder stays empty — the same
     leftover every sibling drawer in this slot has. `cqh` still caps it by
     height on short panes so it never overflows into a scroll it doesn't need. */
  .grid-fill {
    container-type: size;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  /* The reserve is whatever the picker puts ABOVE its grid, so the square grid
     plus that chrome still fits the wrapper's height. MultiSelectPositionPicker
     has a quick-action toolbar and one-line status row; PositionPickerGrid has
     a full-height "Any" button. Under-reserving here cost a 16px scroll on a
     375px phone. */
  .grid-fill {
    --grid-reserve: 7rem;
  }

  .grid-fill :global(.position-picker-grid) {
    --grid-reserve: 5.25rem;
  }

  /* Fit the height when there is height to fit, but never below a legible
     cell. Without the 20rem floor a 412px-tall window squeezed cells to
     exactly 44px — the touch floor, and a pictograph at that size is a smudge.
     Below the floor the grid keeps its size and the body scrolls, which is the
     right trade: a readable cell you scroll to beats an unreadable one you
     don't. */
  .grid-fill :global(.variations-grid) {
    width: min(100%, max(20rem, calc(100cqh - var(--grid-reserve))));
    margin-inline: auto;
  }

  .grid-fill :global(.position-picker-grid),
  .grid-fill :global(.multi-select-grid) {
    flex: 0 0 auto;
    min-height: 0;
  }

  /* Sits under the position grid, which already claimed the width it wants.
     The top margin is what separates "where the props start" from "which way
     they point" now that both live on one screen. */
  .ori-block {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 14px;
  }

  /* Capped: four short labels are a compact control, and letting the row
     stretch to a wide detail pane parked the Blue/Red label a third of a pane
     away from the buttons it names. */
  .ori-row {
    display: flex;
    align-items: center;
    gap: 10px;
    max-width: 26rem;
  }

  /* Sized in ch to the longer word rather than to the 44px that fit "Blue" —
     at 700 weight "Right" ran past its own box and closed the gap to the
     control it names. */
  .ori-color-label {
    flex-shrink: 0;
    width: 6ch;
    font-size: var(--font-size-sm, 14px);
    font-weight: 700;
    letter-spacing: 0.3px;
  }

  /* Left and Right, not Blue and Red: the tint already says which prop, so the
     word would be restating the colour. Naming the hand instead is the part a
     first-time reader cannot get from looking. Blue is the left hand, red the
     right — the same convention the Actions panel's APPLY TO row uses.

     Lightened off the raw prop colors: #3b82f6 as text on the panel's dark
     blue gradient was barely readable. Keeps the prop identity, wins the
     contrast. */
  .ori-blue {
    color: color-mix(in srgb, var(--prop-blue, #3b82f6) 55%, white);
  }

  .ori-red {
    color: color-mix(in srgb, var(--prop-red, #ef4444) 75%, white);
  }

  @media (prefers-reduced-motion: reduce) {
    .reset-button {
      transition: none;
    }
  }
</style>
