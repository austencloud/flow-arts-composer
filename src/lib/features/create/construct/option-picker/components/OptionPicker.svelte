<!--
OptionPicker.svelte - Main option picker orchestrator

Single responsibility: Coordinate option loading, preparation, and selection.
Delegates all rendering to child components.
-->
<script lang="ts">
  import { getOptionFilter } from "$lib/features/create/construct/option-picker/get-option-filter";
  import { getOptionLoader } from "$lib/features/create/construct/option-picker/get-option-loader";
  import { organizePictographs } from "$lib/features/create/construct/option-picker/services/option-organizer";
  import { getOptionSorter } from "$lib/features/create/construct/option-picker/get-option-sorter";
  import { getDarkModeProvider } from "$lib/shared/animation-engine/get-dark-mode-provider";
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import type { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
  import { onMount } from "svelte";
  import { getSettings } from "$lib/shared/application/state/app-state.svelte";
  import { pictographPreparer } from "$lib/shared/pictograph/shared/services/pictograph-preparer";
  import { applyPendingTurnsToOption } from "$lib/shared/create/services/apply-turns-to-motion";
  import {
    clampTurnToLevel,
    levelForTurns,
    type TurnLevel,
    type TurnValue,
  } from "$lib/shared/create/services/level-turn-values";
  import { filterDirectionContinuousOptions } from "$lib/features/create/construct/option-picker/services/reversal-checker";
  import { RotationDirection } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
  import { createPersistenceHelper } from "$lib/shared/state/utils/persistent-state";
  import { calculateDeviceAwareSize } from "../services/option-grid-fit-calculator";

  import { createOptionPickerState } from "../state/option-picker-state.svelte";
  import { applyPoiLegalComposerFilter } from "$lib/features/levels/poi-lab/services/apply-poi-legal-filter";
  import type { OptionLoader } from "$lib/features/create/construct/option-picker/services/option-loader";
  import type { OptionSorter } from "$lib/features/create/construct/option-picker/services/option-sorter";
  import type {
    OrganizedSection,
    SortMethod,
  } from "$lib/features/create/construct/option-picker/domain/option-picker-types";
  import type {
    DeviceAwareSizingParams,
    DeviceAwareSizingResult,
  } from "../services/types";
  import type { PreparedPictographData } from "$lib/shared/pictograph/option/prepared-pictograph-data";
  import type { PictographPreparer } from "../services/pictograph-preparer";
  import type { HapticFeedback } from "$lib/shared/application/services/haptic-feedback";
  import type { DarkModeProvider } from "$lib/shared/animation-engine/services/dark-mode-provider";
  import OptionPickerContent from "./OptionPickerContent.svelte";
  import { tryGetCreateModuleContext } from "$lib/features/create/shared/context/create-module-context";
  import { setOptionAuditionContext } from "../context/option-audition-context";
  import { buildAppendedOptionSequence } from "../services/build-appended-option-sequence";
  import { bootProfiler } from "$lib/shared/analytics/boot-profiler";

  // Props
  interface Props {
    currentSequence: PictographData[];
    currentGridMode: GridMode;
    onOptionSelected: (option: PictographData) => void | Promise<void>;
    isContinuousOnly?: boolean;
    onToggleContinuous?: (value: boolean) => void;
    isSideBySideLayout?: () => boolean;
    /** Optional predicate to further filter options (e.g., loop-only for tutorials) */
    filterPredicate?: (option: PictographData) => boolean;
    /** Hide the All/Continuous filter UI (e.g. simplified tutorial grid) */
    hideFilters?: boolean;
    /** Explicit prop types for demo/preview rendering (bypasses global
     *  settings) — same convention as StepCell/PictographContainer. Also feeds
     *  the poi-legality gate, so a surface pinned to a non-poi prop is never
     *  emptied by a user's poi setting. */
    leftPropTypeOverride?: PropType;
    rightPropTypeOverride?: PropType;
    /** Explicit pending turns (bypasses the sticky localStorage turns). Same
     *  bypass convention as the prop overrides: an embedded/demo surface pins
     *  its own turns so a user's sticky Create-tab turns never leak in. */
    leftTurnsOverride?: number | "fl";
    rightTurnsOverride?: number | "fl";
    /** Suppress first-use interaction teaching in embedded documentation. */
    showInteractionHint?: boolean;
  }

  const {
    currentSequence,
    currentGridMode,
    onOptionSelected,
    isContinuousOnly = false,
    onToggleContinuous,
    isSideBySideLayout = () => false,
    filterPredicate,
    hideFilters = false,
    leftPropTypeOverride = undefined,
    rightPropTypeOverride = undefined,
    leftTurnsOverride = undefined,
    rightTurnsOverride = undefined,
    showInteractionHint = true,
  }: Props = $props();

  const createContext = tryGetCreateModuleContext();
  setOptionAuditionContext({
    start: handleAuditionStart,
    end: handleAuditionEnd,
  });

  // State
  let pickerState = $state<ReturnType<typeof createOptionPickerState> | null>(
    null
  );
  let preparedOptions = $state<PreparedPictographData[]>([]);
  let optionAvailability = $state({ shownCount: 0, hiddenCount: 0 });
  let isReady = $state(false);
  let isSelecting = $state(false);
  let initError = $state<string | null>(null);

  // The grid can only speak truthfully once a load has resolved. Before that,
  // an empty `preparedOptions` would render as "no pictographs match these
  // settings" — a confident wrong answer about data we never fetched. Only the
  // first fill is gated: on later refilters we keep showing the current tiles
  // rather than blinking a spinner between them.
  const isAwaitingFirstOptions = $derived(
    preparedOptions.length === 0 &&
      (pickerState?.state === "idle" || pickerState?.state === "loading")
  );

  // Internal continuous filter state - initialize with default
  let internalContinuousOnly = $state(false);

  // Sticky pending turns applied to every option (persist across selections AND
  // across reloads — survives HMR / full refresh via localStorage).
  interface PendingTurnsState {
    leftTurns: TurnValue;
    rightTurns: TurnValue;
    leftRotation: RotationDirection;
    rightRotation: RotationDirection;
    /** Working level — decides which turn buttons the header offers. */
    level?: TurnLevel;
  }
  const pendingTurnsPersistence = createPersistenceHelper<PendingTurnsState>({
    key: "tka-option-picker-pending-turns",
    defaultValue: {
      leftTurns: 0,
      rightTurns: 0,
      leftRotation: RotationDirection.CLOCKWISE,
      rightRotation: RotationDirection.CLOCKWISE,
      level: 2,
    },
  });
  const loadedTurns = pendingTurnsPersistence.load();

  let leftTurns = $state<TurnValue>(loadedTurns.leftTurns);
  let rightTurns = $state<TurnValue>(loadedTurns.rightTurns);
  // Turns persisted before the level selector existed carry no level — infer the
  // lowest level that still permits them, so nobody's sticky turns get clamped
  // away on first load. Floor at 2 so the turn buttons are reachable by default.
  let level = $state<TurnLevel>(
    loadedTurns.level ??
      (Math.max(
        2,
        levelForTurns(loadedTurns.leftTurns, loadedTurns.rightTurns)
      ) as TurnLevel)
  );
  // Chosen spin direction for dash/static hands with turns (one bit per hand,
  // set via the turns-bar toggle — no per-tile fan-out). Shifts ignore these.
  let leftRotation = $state<RotationDirection>(loadedTurns.leftRotation);
  let rightRotation = $state<RotationDirection>(loadedTurns.rightRotation);

  // An override pins the hand's turns; otherwise the sticky internal state runs.
  const effectiveLeftTurns = $derived(leftTurnsOverride ?? leftTurns);
  const effectiveRightTurns = $derived(rightTurnsOverride ?? rightTurns);
  const turnControlsEditable = $derived(
    leftTurnsOverride === undefined && rightTurnsOverride === undefined
  );

  // Persist every change so the picker reopens with the same sticky turns.
  // Overridden surfaces never write — their pinned turns aren't the user's.
  $effect(() => {
    if (leftTurnsOverride !== undefined || rightTurnsOverride !== undefined)
      return;
    pendingTurnsPersistence.setupAutoSave({
      leftTurns,
      rightTurns,
      leftRotation,
      rightRotation,
      level,
    });
  });

  function handleLeftTurnsChange(value: TurnValue) {
    leftTurns = value;
  }
  function handleRightTurnsChange(value: TurnValue) {
    rightTurns = value;
  }
  // Dropping a level snaps both hands into that level's palette (a float or a
  // half turn can't survive a move to Level 2) — the same clamp the Generate
  // panel applies when a level change invalidates the current value.
  function handleLevelChange(next: TurnLevel) {
    level = next;
    leftTurns = clampTurnToLevel(leftTurns, next);
    rightTurns = clampTurnToLevel(rightTurns, next);
  }
  function handleLeftRotationChange(dir: RotationDirection) {
    leftRotation = dir;
  }
  function handleRightRotationChange(dir: RotationDirection) {
    rightRotation = dir;
  }

  // Apply sticky turns to each option, then prepare for rendering.
  async function prepareWithTurns(filtered: PictographData[]): Promise<{
    options: PreparedPictographData[];
    availability: { shownCount: number; hiddenCount: number };
  }> {
    const span = bootProfiler.startSpan("construct:prepare");
    try {
      // One tile per option: apply the chosen per-hand spin direction to dash/static
      // hands rather than fanning out CW/CCW tiles (keeps the grid scannable).
      const noTurns = effectiveLeftTurns === 0 && effectiveRightTurns === 0;
      let turned = noTurns
        ? filtered
        : filtered.map((o) =>
            applyPendingTurnsToOption(
              o,
              effectiveLeftTurns,
              effectiveRightTurns,
              leftRotation,
              rightRotation
            )
          );

      // When Continuous is on, drop any dash/static option whose chosen spin
      // direction reverses against the established direction. Direction-only (not
      // full getReversalCount) so the turns>1 magnitude heuristic doesn't nuke
      // every option at 2+ turns.
      const directionResult =
        !noTurns && internalContinuousOnly && currentSequence.length >= 2
          ? filterDirectionContinuousOptions(turned, currentSequence)
          : { options: turned, totalCount: turned.length, hiddenCount: 0 };
      turned = directionResult.options;

      const s = getSettings();
      const options = await preparer!.prepareBatch(turned, {
        themeMode: darkMode ? "dark" : "light",
        fanAppearance: s.fanAppearance,
        leftBuugengFlipped: s.leftBuugengFlipped,
        rightBuugengFlipped: s.rightBuugengFlipped,
        leftPropType: leftPropTypeOverride ?? s.leftPropType,
        rightPropType: rightPropTypeOverride ?? s.rightPropType,
      });
      span("ok", { candidates: turned.length, options: options.length });
      bootProfiler.milestone("construct:options-prepared", {
        options: options.length,
      });
      return {
        options,
        availability: {
          shownCount: options.length,
          hiddenCount: directionResult.hiddenCount,
        },
      };
    } catch (error) {
      span("error");
      throw error;
    }
  }

  // Single effect: always push the prop value to both internal state and pickerState
  $effect(() => {
    internalContinuousOnly = isContinuousOnly;
    if (pickerState) {
      pickerState.setContinuousOnly(isContinuousOnly);
    }
  });

  // Services
  let preparer: PictographPreparer | null = null;
  let hapticService = $state<HapticFeedback | null>(null);
  let sizerService = $state<
    ((params: DeviceAwareSizingParams) => DeviceAwareSizingResult) | null
  >(null);
  let organizerService = $state<
    | ((
        pictographs: PictographData[],
        sortMethod: SortMethod
      ) => OrganizedSection[])
    | null
  >(null);

  // Dark Mode tracking - needed to re-prepare props when theme changes
  let darkMode = $state(false);
  let darkModeProvider: DarkModeProvider | null = null;

  // Handle continuous toggle - updates internal state and notifies parent
  function handleToggleContinuous(value: boolean) {
    internalContinuousOnly = value;
    if (pickerState) {
      pickerState.setContinuousOnly(value);
    }
    onToggleContinuous?.(value);
  }

  function handleAuditionStart(option: PictographData): boolean {
    if (!createContext || isSelecting) return false;

    const baseSequence =
      createContext.CreateModuleState.sequenceState.getCurrentSequence();
    if (!baseSequence) return false;

    const activatedAt = performance.now();
    const application = buildAppendedOptionSequence(baseSequence, option, {
      onRecoverableError: (stage, error) => {
        console.warn(
          `OptionPicker: ${stage} calculation failed during audition`,
          error
        );
      },
    });

    hapticService?.trigger("selection");
    createContext.panelState.enterOptionAudition({
      sequence: application.sequence,
      sourceSequenceRevision:
        createContext.CreateModuleState.sequenceState.currentSequenceRevision,
      stepNumber: application.stepNumber,
      activatedAt,
    });
    return true;
  }

  function handleAuditionEnd() {
    createContext?.panelState.exitOptionAudition();
  }

  function handleSlotClicked(typeSection: string, slotIndex: number) {
    pickerState?.recordClickSlot(typeSection, slotIndex);
  }

  // Load options when sequence changes
  $effect(() => {
    if (!pickerState || !isReady) return;

    if (currentSequence.length > 0) {
      pickerState.loadOptions(currentSequence, currentGridMode);
    } else {
      pickerState.reset();
    }
  });

  // Prepare options when filtered options change, Dark Mode changes, or prop type changes
  // Dark Mode affects prop colors which are baked in during preparation
  // Prop type settings determine which prop SVGs to render
  $effect(() => {
    if (!pickerState || !preparer) {
      preparedOptions = [];
      optionAvailability = { shownCount: 0, hiddenCount: 0 };
      return;
    }

    // Access filteredOptions and state (reactive) - tracks when options or filters change
    let filtered = pickerState.filteredOptions;
    const currentState = pickerState.state;
    // Apply external filter predicate if provided (e.g., loop-only for tutorials)
    const _filterPredicate = filterPredicate;
    if (_filterPredicate) {
      filtered = filtered.filter(_filterPredicate);
    }
    // Include darkMode as dependency - prop colors need re-preparation when theme changes
    const _darkMode = darkMode;
    // Include prop type settings as dependencies - re-prepare when prop type changes (P button)
    const settings = getSettings();
    const _leftPropType = settings.leftPropType;
    const _rightPropType = settings.rightPropType;

    // Skip until a load has actually resolved. "loading" is mid-flight;
    // "idle" is before the first load was even dispatched — in both cases an
    // empty option list says nothing about whether options exist, so holding
    // the previous frame beats flashing a false "no matches" state.
    if (currentState === "loading" || currentState === "idle") {
      return;
    }

    if (filtered.length === 0) {
      // Loading returns above, so an empty ready state is authoritative. Clear
      // stale tiles instead of offering an option from the prior filter state.
      preparedOptions = [];
      optionAvailability = { shownCount: 0, hiddenCount: 0 };
      isSelecting = false;
      return;
    }

    // Track effective turns + spin directions so a change re-renders the options
    const _leftTurns = effectiveLeftTurns;
    const _rightTurns = effectiveRightTurns;
    const _leftRotation = leftRotation;
    const _rightRotation = rightRotation;
    void _leftTurns;
    void _rightTurns;
    void _leftRotation;
    void _rightRotation;

    prepareWithTurns(filtered).then((frame) => {
      preparedOptions = frame.options;
      optionAvailability = frame.availability;
      isSelecting = false;
    });
  });

  // (Continuous sync handled by single effect above)

  // Handle option selection - run load+prepare as a direct async pipeline
  // in parallel with the step grid animation. Bypasses the reactive hops
  // (parent updates sequence → prop flows back → load effect → prepare effect)
  // which would serialize the two animations.
  function handleSelect(option: PreparedPictographData) {
    if (!pickerState || isSelecting) return;

    hapticService?.trigger("selection");
    isSelecting = true;

    // Notify parent first (triggers step grid animation synchronously)
    onOptionSelected(option);

    // When a filterPredicate is provided (e.g., tutorial loop filter), skip the fast
    // path and let the reactive $effect handle reloading. The predicate may change
    // based on the parent's state update from onOptionSelected, and the fast path
    // would capture the stale predicate value.
    if (filterPredicate) {
      isSelecting = false;
      return;
    }

    // Run load → prepare as one async pipeline, concurrent with step grid animation
    const nextSequence = [...currentSequence, option as PictographData];
    (async () => {
      try {
        await pickerState!.loadOptions(nextSequence, currentGridMode);
        // Immediately prepare - don't wait for reactive effect scheduling
        let filtered = pickerState!.filteredOptions;
        // Apply external filter predicate if provided (e.g., loop-only for tutorials)
        if (filterPredicate) {
          filtered = filtered.filter(filterPredicate);
        }
        if (preparer && filtered.length > 0) {
          const frame = await prepareWithTurns(filtered);
          preparedOptions = frame.options;
          optionAvailability = frame.availability;
        } else if (filtered.length === 0) {
          preparedOptions = [];
          optionAvailability = { shownCount: 0, hiddenCount: 0 };
        }
      } finally {
        isSelecting = false;
      }
    })();
  }

  // Initialize services - extracted so the error UI can retry
  let darkModeUnsubscribe: (() => void) | null = null;

  function initialize() {
    initError = null;

    // Drop any subscription from a previous attempt before re-subscribing
    darkModeUnsubscribe?.();
    darkModeUnsubscribe = null;

    try {
      const loader = getOptionLoader();
      const filter = getOptionFilter();
      const sorter = getOptionSorter();

      organizerService = organizePictographs;
      sizerService = calculateDeviceAwareSize;
      preparer = pictographPreparer as PictographPreparer;
      hapticService = getHapticFeedback();

      // Subscribe to Dark Mode changes for prop color updates
      try {
        darkModeProvider = getDarkModeProvider();
        darkModeUnsubscribe = darkModeProvider.subscribe((value) => {
          darkMode = value;
        });
      } catch {
        // Provider not available yet, will default to false
      }

      pickerState = createOptionPickerState({
        optionLoader: loader,
        filterService: filter,
        optionSorter: sorter,
        poiFilter: (opts, previous) =>
          applyPoiLegalComposerFilter(opts, previous, {
            leftPropType: leftPropTypeOverride,
            rightPropType: rightPropTypeOverride,
          }),
      });

      // Initialize with the prop value BEFORE marking ready
      // This ensures filtering is applied when options first load
      if (isContinuousOnly) {
        pickerState.setContinuousOnly(isContinuousOnly);
        internalContinuousOnly = isContinuousOnly;
      }

      isReady = true;
    } catch (error) {
      console.error("Failed to initialize option picker:", error);
      initError =
        error instanceof Error
          ? error.message
          : "Failed to initialize option picker";
    }
  }

  // Retry a failed option load - clears the error and reloads the current sequence
  function retryLoadOptions() {
    pickerState?.clearError();
    if (currentSequence.length > 0) {
      pickerState?.loadOptions(currentSequence, currentGridMode);
    }
  }

  onMount(() => {
    initialize();

    return () => {
      handleAuditionEnd();
      if (darkModeUnsubscribe) {
        darkModeUnsubscribe();
      }
    };
  });
</script>

{#if initError}
  <div class="error" role="alert">
    <p>Couldn't start the option picker: {initError}</p>
    <button onclick={initialize}>Retry</button>
  </div>
{:else if !isReady || isAwaitingFirstOptions}
  <div class="loading">Loading options...</div>
{:else if pickerState?.error}
  <div class="error" role="alert">
    <p>Error: {pickerState.error}</p>
    <button onclick={retryLoadOptions}>Retry</button>
  </div>
{:else}
  <OptionPickerContent
    options={preparedOptions}
    {optionAvailability}
    {organizerService}
    {sizerService}
    onSelect={handleSelect}
    isContinuousOnly={internalContinuousOnly}
    onToggleContinuous={handleToggleContinuous}
    {isSideBySideLayout}
    {hideFilters}
    {turnControlsEditable}
    {currentSequence}
    onSlotClicked={handleSlotClicked}
    lastClickedSlot={pickerState?.lastClickedSlot ?? null}
    leftTurns={effectiveLeftTurns}
    rightTurns={effectiveRightTurns}
    {level}
    onLevelChange={handleLevelChange}
    {leftRotation}
    {rightRotation}
    onLeftTurnsChange={handleLeftTurnsChange}
    onRightTurnsChange={handleRightTurnsChange}
    onLeftRotationChange={handleLeftRotationChange}
    onRightRotationChange={handleRightRotationChange}
    {showInteractionHint}
  />
{/if}

<style>
  .loading,
  .error {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    padding: 1rem;
    text-align: center;
    color: var(--text-muted);
  }

  .error button {
    margin-top: 0.5rem;
    min-height: var(--min-touch-target, 48px); /* WCAG AAA touch target */
    padding: 0.5rem 1.5rem;
    background: var(--theme-accent, var(--primary-color));
    color: white;
    border: none;
    border-radius: var(--border-radius, 8px);
    cursor: pointer;
    font-size: var(--font-size-min, 14px);
    font-weight: 500;
    transition: opacity var(--duration-normal) ease;
  }

  .error button:hover {
    opacity: 0.9;
  }

  .error button:focus-visible {
    outline: 2px solid white;
    outline-offset: 2px;
  }

  /* Accessibility: Respect user's motion preferences */
  @media (prefers-reduced-motion: reduce) {
    .error button {
      transition: none;
    }
  }
</style>
