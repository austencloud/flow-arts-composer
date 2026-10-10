<!--
  SequenceTransformActions.svelte

  Canonical grid of sequence transform, pattern, and edit actions.
  Supports help mode where clicking buttons shows educational content instead of applying transforms.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import type { SequenceActionId } from "#lib/shared/create/domain/sequence-action-types.js";
  import SwapIcon from "#lib/shared/icons/SwapIcon.svelte";

  interface Props {
    hasSequence: boolean;
    hasSelection: boolean;
    isTransforming: boolean;
    canExtend?: boolean;
    isExtending?: boolean;
    canShiftStart?: boolean;
    /** Disable swap button (only works when both hands are selected) */
    swapDisabled?: boolean;
    showEditInConstructor: boolean;
    /** True when panel is desktop side-panel (2 cols), false for mobile bottom drawer (3 cols) */
    isDesktopPanel?: boolean;
    /** True to use compact horizontal layout (icon left, text right) for very small screens */
    compactMode?: boolean;
    /** Content-sized transform row, with rotation presented as two joined halves. */
    toolbar?: boolean;
    actionSubject?: string;
    /** True when help mode is active - buttons show help instead of applying transforms/patterns */
    helpMode?: boolean;
    /** Degrees applied by each spatial rotation action. */
    rotationDegrees?: 45 | 90;
    /** Include the increment in compact button labels when descriptions are hidden. */
    showRotationDegreesInLabel?: boolean;
    desktopColumns?: 2 | 3;
    /** Other sequence surfaces provide only the callbacks that are valid in
        their context; absent callbacks remove those tiles. */
    secondarySectionLabel?: string;
    /** Compact surfaces can place Choose Start beside the geometric transforms
        instead of creating a sparse secondary row. */
    shiftStartPlacement?: "secondary" | "transform";
    onReset?: () => void;
    /** Guest-gated Patterns section: tiles stay tappable but show a lock and
        route to sign-up (the parent supplies gated handlers). */
    patternsLocked?: boolean;
    /** Callback when an action is selected in help mode */
    onHelpSelect?: (actionId: SequenceActionId) => void;
    onTurns?: () => void;
    onMirror: () => void;
    onFlip?: () => void;
    onInvert?: () => void;
    onRotateCW?: () => void;
    onRotateCCW?: () => void;
    onSwap?: () => void;
    onRewind?: () => void;
    onTurnPattern?: () => void;
    onRotationDirection?: () => void;
    onDuration?: () => void;
    onExtend?: () => void;
    onShiftStart?: () => void;
    onEditInConstructor?: () => void;
    /** Opens the Grid join page. Without it the Grid section is absent. */
    onGridJoin?: () => void;
  }

  let {
    hasSequence,
    hasSelection = false,
    isTransforming,
    canExtend = false,
    isExtending = false,
    canShiftStart = false,
    swapDisabled = false,
    showEditInConstructor,
    isDesktopPanel = false,
    compactMode = false,
    toolbar = false,
    actionSubject = t("viewer_ui_sequence"),
    helpMode = false,
    rotationDegrees = 45,
    showRotationDegreesInLabel = false,
    desktopColumns = 2,
    secondarySectionLabel = t("create_transform_patterns"),
    shiftStartPlacement = "secondary",
    onReset,
    patternsLocked = false,
    onHelpSelect,
    onTurns,
    onMirror,
    onFlip,
    onInvert,
    onRotateCW,
    onRotateCCW,
    onSwap,
    onRewind,
    onTurnPattern,
    onRotationDirection,
    onDuration,
    onExtend,
    onShiftStart,
    onEditInConstructor,
    onGridJoin,
  }: Props = $props();

  // In help mode, clicking any action button shows help instead of applying
  function handleActionClick(
    actionId: SequenceActionId,
    normalAction: () => void
  ) {
    if (helpMode && onHelpSelect) {
      onHelpSelect(actionId);
    } else {
      normalAction();
    }
  }

  const disabled = $derived(isTransforming || isExtending || !hasSequence);
  const hasPatternTools = $derived(
    !!(onTurnPattern || onRotationDirection || onDuration || onExtend)
  );
  const hasSecondaryActions = $derived(
    !!(
      hasPatternTools ||
      (onShiftStart && shiftStartPlacement === "secondary") ||
      onRewind ||
      onReset
    )
  );
  const hasEditActions = $derived(
    !!(onTurns || (showEditInConstructor && onEditInConstructor))
  );

  // Button height + icon + label all scale together off the panel's height via
  // container-query units (see Approach A in the CSS). No row-stretching flex:
  // that decoupling — elastic rows wrapping fixed-size content — was the bug
  // that left giant buttons hugging tiny centered content on tall panels.
</script>

{#snippet lockBadge()}
  {#if patternsLocked && !helpMode}
    <div class="lock-badge" aria-hidden="true">
      <i class="fas fa-lock" aria-hidden="true"></i>
    </div>
  {/if}
{/snippet}

{#snippet shiftStartButton()}
  <button
    class="grid-btn shift-start"
    class:unavailable={!canShiftStart && !helpMode}
    class:help-active={helpMode}
    class:locked={patternsLocked && !helpMode}
    onclick={() =>
      onShiftStart && handleActionClick("shift-start", onShiftStart)}
    disabled={(!hasSequence || isTransforming || !canShiftStart) && !helpMode}
    aria-label={helpMode
      ? t("create_transform_learn_choose_start")
      : patternsLocked
        ? t("create_transform_choose_start_locked")
        : t("create_transform_choose_start_aria")}
  >
    {@render lockBadge()}
    <div class="btn-icon">
      <i class="fas fa-forward" aria-hidden="true"></i>
    </div>
    <div class="btn-text">
      <span class="btn-label">{t("create_transform_choose_start")}</span>
      <span class="btn-desc">{t("create_transform_pick_start_pose")}</span>
    </div>
  </button>
{/snippet}

<div
  class="actions-container"
  class:disabled
  class:desktop={isDesktopPanel}
  class:three-column={isDesktopPanel && desktopColumns === 3}
  class:mobile={!isDesktopPanel && !toolbar}
  class:toolbar
  class:compact={compactMode}
  class:help-mode={helpMode}
>
  <!-- TRANSFORM Section -->
  <section class="section transform-section">
    <span class="section-label">{t("create_transform_heading")}</span>
    <div class="section-grid">
      <button
        class="grid-btn mirror"
        class:help-active={helpMode}
        onclick={() => handleActionClick("mirror", onMirror)}
        data-ghost={disabled || helpMode ? undefined : "safe"}
        data-ghost-kind="transform"
        data-ghost-label={t("create_ui_mirror")}
        disabled={disabled && !helpMode}
        aria-label={helpMode
          ? t("create_transform_learn_mirror")
          : t("create_transform_mirror_aria", { subject: actionSubject })}
      >
        <div class="btn-icon">
          <i class="fas fa-left-right" aria-hidden="true"></i>
        </div>
        <div class="btn-text">
          <span class="btn-label">{t("create_ui_mirror")}</span>
          <span class="btn-desc">{t("create_transform_mirror_desc")}</span>
        </div>
      </button>
      {#if onFlip}
        <button
          class="grid-btn flip"
          class:help-active={helpMode}
          onclick={() => handleActionClick("flip", onFlip)}
          data-ghost={disabled || helpMode ? undefined : "safe"}
          data-ghost-kind="transform"
          data-ghost-label={t("create_transform_flip")}
          disabled={disabled && !helpMode}
          aria-label={helpMode
            ? t("create_transform_learn_flip")
            : t("create_transform_flip_aria", { subject: actionSubject })}
        >
          <div class="btn-icon">
            <i class="fas fa-up-down" aria-hidden="true"></i>
          </div>
          <div class="btn-text">
            <span class="btn-label">{t("create_transform_flip")}</span>
            <span class="btn-desc">{t("create_transform_flip_desc")}</span>
          </div>
        </button>
      {/if}
      {#if onSwap}
        <button
          class="grid-btn swap"
          class:unavailable={swapDisabled && !helpMode}
          class:help-active={helpMode}
          onclick={() => handleActionClick("swap", onSwap)}
          data-ghost={disabled || helpMode ? undefined : "safe"}
          data-ghost-kind="transform"
          data-ghost-label={t("create_transform_swap")}
          disabled={(disabled || swapDisabled) && !helpMode}
          aria-label={helpMode
            ? t("create_transform_learn_swap")
            : swapDisabled
              ? t("create_transform_swap_requires_both")
              : t("create_transform_swap_aria", { subject: actionSubject })}
        >
          <div class="btn-icon swap-icon-host">
            <SwapIcon size="1em" monochrome={toolbar} />
          </div>
          <div class="btn-text">
            <span class="btn-label">{t("create_transform_swap")}</span>
            <span class="btn-desc"
              >{swapDisabled ? t("create_transform_needs_both_hands") : t("create_transform_switch_hands")}</span
            >
          </div>
        </button>
      {/if}
      {#if onInvert}
        <button
          class="grid-btn invert"
          class:help-active={helpMode}
          onclick={() => handleActionClick("invert", onInvert)}
          data-ghost={disabled || helpMode ? undefined : "safe"}
          data-ghost-kind="transform"
          data-ghost-label={t("create_transform_invert")}
          disabled={disabled && !helpMode}
          aria-label={helpMode
            ? t("create_transform_learn_invert")
            : t("create_transform_invert_aria")}
        >
          <div class="btn-icon">
            <i class="fas fa-repeat" aria-hidden="true"></i>
          </div>
          <div class="btn-text">
            <span class="btn-label">{t("create_transform_invert")}</span>
            <span class="btn-desc">{t("create_transform_reverse_turns")}</span>
          </div>
        </button>
      {/if}
      {#if onRotateCW && onRotateCCW}
        <div class="rotation-pair">
          <button
            class="grid-btn rotate-ccw"
            title={toolbar ? t("create_transform_rotate_left_title", { degrees: rotationDegrees }) : undefined}
            class:help-active={helpMode}
            onclick={() => handleActionClick("rotate", onRotateCCW)}
            data-ghost={disabled || helpMode ? undefined : "safe"}
            data-ghost-kind="transform"
            data-ghost-label={t("create_action_rotate_left_short")}
            disabled={disabled && !helpMode}
            aria-label={helpMode
              ? t("create_transform_learn_rotate")
              : t("create_transform_rotate_left_aria", { subject: actionSubject, degrees: rotationDegrees })}
          >
            <div class="btn-icon">
              <i class="fas fa-rotate-left" aria-hidden="true"></i>
            </div>
            <div class="btn-text">
              <span class="btn-label">
                {showRotationDegreesInLabel
                  ? `${rotationDegrees}° L`
                  : t("create_transform_rotate_left")}
              </span>
              <span class="btn-desc">{t("create_transform_pivot_degrees", { degrees: rotationDegrees })}</span>
            </div>
          </button>
          <button
            class="grid-btn rotate-cw"
            title={toolbar ? t("create_transform_rotate_right_title", { degrees: rotationDegrees }) : undefined}
            class:help-active={helpMode}
            onclick={() => handleActionClick("rotate", onRotateCW)}
            data-ghost={disabled || helpMode ? undefined : "safe"}
            data-ghost-kind="transform"
            data-ghost-label={t("create_action_rotate_right_short")}
            disabled={disabled && !helpMode}
            aria-label={helpMode
              ? t("create_transform_learn_rotate")
              : t("create_transform_rotate_right_aria", { subject: actionSubject, degrees: rotationDegrees })}
          >
            <div class="btn-icon">
              <i class="fas fa-rotate-right" aria-hidden="true"></i>
            </div>
            <div class="btn-text">
              <span class="btn-label">
                {showRotationDegreesInLabel
                  ? `${rotationDegrees}° R`
                  : t("create_transform_rotate_right")}
              </span>
              <span class="btn-desc">{t("create_transform_pivot_degrees", { degrees: rotationDegrees })}</span>
            </div>
          </button>
        </div>
      {/if}
      {#if onShiftStart && shiftStartPlacement === "transform"}
        {@render shiftStartButton()}
      {/if}
    </div>
  </section>

  <!-- PATTERNS Section -->
  {#if hasSecondaryActions}
    <section
      class="section patterns-section"
      class:source-section={!hasPatternTools}
    >
      <span class="section-label">{secondarySectionLabel}</span>
      <div class="section-grid">
        {#if onTurnPattern}
          <button
            class="grid-btn turn-pattern"
            class:help-active={helpMode}
            class:locked={patternsLocked && !helpMode}
            onclick={() => handleActionClick("turn-pattern", onTurnPattern)}
            disabled={!hasSequence && !helpMode}
            aria-label={helpMode
              ? t("create_transform_learn_turn_pattern")
              : patternsLocked
                ? t("create_transform_turn_pattern_locked")
                : t("create_transform_turn_pattern_aria")}
          >
            {@render lockBadge()}
            <div class="btn-icon">
              <i class="fas fa-wand-magic-sparkles" aria-hidden="true"></i>
            </div>
            <div class="btn-text">
              <span class="btn-label">{t("create_transform_turn_pattern")}</span>
              <span class="btn-desc">{t("create_transform_apply_patterns")}</span>
            </div>
          </button>
        {/if}
        {#if onRotationDirection}
          <button
            class="grid-btn direction"
            class:help-active={helpMode}
            class:locked={patternsLocked && !helpMode}
            onclick={() => handleActionClick("direction", onRotationDirection)}
            disabled={!hasSequence && !helpMode}
            aria-label={helpMode
              ? t("create_transform_learn_direction")
              : patternsLocked
                ? t("create_transform_direction_locked")
                : t("create_transform_direction_aria")}
          >
            {@render lockBadge()}
            <div class="btn-icon">
              <i class="fas fa-compass" aria-hidden="true"></i>
            </div>
            <div class="btn-text">
              <span class="btn-label">{t("create_transform_direction")}</span>
              <span class="btn-desc">{t("create_transform_direction_desc")}</span>
            </div>
          </button>
        {/if}
        {#if onDuration}
          <button
            class="grid-btn duration"
            class:help-active={helpMode}
            class:locked={patternsLocked && !helpMode}
            onclick={() => handleActionClick("duration", onDuration)}
            disabled={!hasSequence && !helpMode}
            aria-label={helpMode
              ? t("create_transform_learn_duration")
              : patternsLocked
                ? t("create_transform_duration_locked")
                : t("create_transform_duration_aria")}
          >
            {@render lockBadge()}
            <div class="btn-icon">
              <i class="fas fa-stopwatch" aria-hidden="true"></i>
            </div>
            <div class="btn-text">
              <span class="btn-label">{t("clip_duration")}</span>
              <span class="btn-desc">{t("create_ui_step_timing")}</span>
            </div>
          </button>
        {/if}
        {#if onExtend && canExtend}
          <button
            class="grid-btn extend"
            class:help-active={helpMode}
            class:locked={patternsLocked && !helpMode}
            onclick={() => handleActionClick("extend", onExtend)}
            disabled={(!hasSequence || isExtending) && !helpMode}
            data-ghost={!hasSequence ||
            isExtending ||
            helpMode ||
            patternsLocked
              ? undefined
              : "safe"}
            data-ghost-kind="extend"
            data-ghost-label={t("create_transform_extend")}
            aria-label={helpMode
              ? t("create_transform_learn_extend")
              : patternsLocked
                ? t("create_transform_extend_locked")
                : isExtending
                  ? t("create_transform_extending")
                  : t("create_transform_extend_aria")}
          >
            {@render lockBadge()}
            <div class="btn-icon">
              {#if isExtending}
                <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
              {:else}
                <i class="fas fa-circle-check" aria-hidden="true"></i>
              {/if}
            </div>
            <div class="btn-text">
              <span class="btn-label">{isExtending ? "..." : t("create_transform_extend")}</span>
              <span class="btn-desc">{t("create_transform_complete_to_start")}</span>
            </div>
          </button>
        {/if}
        {#if onShiftStart && shiftStartPlacement === "secondary"}
          {@render shiftStartButton()}
        {/if}
        {#if onRewind}
          <button
            class="grid-btn rewind"
            class:help-active={helpMode}
            class:locked={patternsLocked && !helpMode}
            onclick={() => handleActionClick("rewind", onRewind)}
            disabled={disabled && !helpMode}
            aria-label={helpMode
              ? t("create_transform_learn_rewind")
              : patternsLocked
                ? t("create_transform_rewind_locked")
                : t("create_transform_rewind_aria")}
          >
            {@render lockBadge()}
            <div class="btn-icon">
              <i class="fas fa-backward" aria-hidden="true"></i>
            </div>
            <div class="btn-text">
              <span class="btn-label">{t("create_transform_rewind")}</span>
              <span class="btn-desc">{t("create_transform_rewind_desc")}</span>
            </div>
          </button>
        {/if}
        {#if onReset}
          <button
            class="grid-btn reset"
            onclick={onReset}
            {disabled}
            aria-label={t("create_transform_reset_aria")}
          >
            <div class="btn-icon">
              <i class="fas fa-arrow-rotate-left" aria-hidden="true"></i>
            </div>
            <div class="btn-text">
              <span class="btn-label">{t("create_ui_reset")}</span>
              <span class="btn-desc">{t("create_transform_original_path")}</span>
            </div>
          </button>
        {/if}
      </div>
    </section>
  {/if}

  <!-- GRID and EDIT share the last row on the desktop panel, so the Grid
       section costs no extra tile row. Elsewhere the row wrapper is
       display: contents and the sections stack as before. -->
  <div class="tail-row">
  {#if onGridJoin}
    <section class="section grid-section" class:help-dimmed={helpMode}>
      <span class="section-label">{t("create_transform_grid")}</span>
      <div class="section-grid">
        <button
          class="grid-btn grid-join"
          onclick={onGridJoin}
          disabled={!hasSequence}
        >
          <div class="btn-icon">
            <i class="fas fa-border-all" aria-hidden="true"></i>
          </div>
          <div class="btn-text">
            <span class="btn-label">{t("animation_menu_grid_join")}</span>
          </div>
        </button>
      </div>
    </section>
  {/if}

  <!-- EDIT Section - dimmed in help mode since these don't have help content -->
  {#if hasEditActions}
    <section class="section edit-section" class:help-dimmed={helpMode}>
      <span class="section-label">{t("viewer_edit")}</span>
      <div class="section-grid">
        {#if onTurns}
          <button
            class="grid-btn edit-turns"
            class:highlighted={hasSelection}
            onclick={onTurns}
            disabled={!hasSelection}
            aria-label={hasSelection
              ? t("create_transform_edit_turns_aria")
              : t("create_transform_edit_turns_disabled_aria")}
          >
            <div class="btn-icon">
              <i class="fas fa-sliders-h" aria-hidden="true"></i>
            </div>
            <div class="btn-text">
              <span class="btn-label">{t("create_transform_edit_turns")}</span>
              <span class="btn-desc"
                >{hasSelection ? t("create_transform_adjust_rotation") : t("create_transform_select_step_first")}</span
              >
            </div>
          </button>
        {/if}
        {#if showEditInConstructor && onEditInConstructor}
          <button
            class="grid-btn construct"
            onclick={onEditInConstructor}
            disabled={!hasSequence}
            data-testid="edit-in-construct"
            aria-label={t("create_transform_edit_construct_aria")}
          >
            <div class="btn-icon">
              <i class="fas fa-pen-to-square" aria-hidden="true"></i>
            </div>
            <div class="btn-text">
              <span class="btn-label">{t("create_transform_edit_in_construct")}</span>
              <span class="btn-desc">{t("create_transform_full_editor")}</span>
            </div>
          </button>
        {/if}
      </div>
    </section>
  {/if}
  </div>
</div>

<style>
  .tail-row {
    display: contents;
  }

  .rotation-pair {
    display: contents;
  }

  .actions-container.toolbar {
    height: auto;
    overflow: visible;
  }

  .toolbar .section-label {
    display: none;
  }

  .toolbar .section-grid {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.75rem;
  }

  .toolbar .grid-btn {
    justify-content: center;
    padding: 0.5rem 0.75rem;
    height: auto;
  }

  .toolbar .btn-label {
    font-size: 1rem;
  }

  .toolbar .grid-btn[class] {
    background: color-mix(
      in srgb,
      rgb(var(--btn-color)) 14%,
      var(--sheet-bg-solid)
    );
    border-color: color-mix(
      in srgb,
      rgb(var(--btn-color)) 45%,
      var(--sheet-bg-solid)
    );
  }

  .toolbar .grid-btn[class]:hover:not(:disabled) {
    background: color-mix(
      in srgb,
      rgb(var(--btn-color)) 24%,
      var(--sheet-bg-solid)
    );
    border-color: rgb(var(--btn-color));
    box-shadow: none;
  }

  .toolbar .grid-btn[class] .btn-icon {
    color: white;
    background: none;
  }

  .toolbar .rotation-pair .btn-text {
    display: none;
  }

  .toolbar .rotation-pair .grid-btn {
    min-width: 3.5rem;
  }

  .toolbar .rotation-pair {
    display: flex;
    gap: 0;
  }

  .toolbar .rotate-ccw {
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
  }

  .toolbar .rotate-cw {
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
    margin-left: -1px;
  }

  .toolbar .grid-btn:focus-visible {
    position: relative;
    z-index: 1;
    outline: 2px solid var(--theme-accent);
    outline-offset: 3px;
  }

  @media (min-width: 2400px) {
    .toolbar .btn-label {
      font-size: 1.25rem;
    }

    .toolbar .btn-icon {
      width: 40px;
      height: 40px;
      font-size: 1.25rem;
    }
  }

  .actions-container {
    --button-row-height: 1fr;
    display: flex;
    flex-direction: column;
    gap: 6px;
    height: 100%;
    overflow: hidden;
  }

  .actions-container.disabled {
    opacity: 0.4;
    pointer-events: none;
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-height: 0;
  }

  .section-label {
    font-size: var(--font-size-compact);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: rgba(255, 255, 255, 0.35);
    padding-left: 4px;
    flex-shrink: 0;
  }

  .section-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    grid-auto-rows: minmax(0, 1fr);
    gap: 4px;
    flex: 1;
    min-height: 0;
  }

  /* ===== MOBILE MODE: 3 columns, compact buttons ===== */
  .actions-container.mobile .section-grid {
    grid-template-columns: repeat(3, 1fr);
    gap: 4px;
  }

  /* Desktop: horizontal layout (icon left, label right) for compact rows */
  .grid-btn {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: flex-start;
    gap: 8px;
    padding: 6px 10px;
    border-radius: 8px;
    cursor: pointer;
    transition: all var(--duration-fast) ease;
    text-align: left;
    min-height: var(--min-touch-target, 44px);
    height: 100%;
  }

  .grid-btn:disabled {
    cursor: not-allowed;
    opacity: 0.4;
  }

  /* Guest-locked: muted like the LOOP grid's locked cards, but stays
     interactive — the tap routes to sign-up (LOOPComponentButton precedent). */
  .grid-btn.locked {
    position: relative;
    opacity: 0.55;
    filter: saturate(0.55);
  }

  .lock-badge {
    position: absolute;
    top: 6px;
    right: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: rgba(20, 20, 35, 0.85);
    color: rgba(255, 255, 255, 0.85);
    font-size: 11px;
    pointer-events: none;
  }

  .grid-btn:active:not(:disabled) {
    transform: scale(0.97);
    transition-duration: 50ms;
  }

  .btn-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 8px;
    font-size: 0.9rem;
    flex-shrink: 0;
    color: white;
  }

  .btn-text {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 1px;
    min-width: 0;
  }

  .btn-label {
    font-size: var(--font-size-sm, 14px);
    font-weight: 600;
    color: rgba(255, 255, 255, 0.95);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }

  .btn-desc {
    display: none;
  }

  /* Mobile mode: vertical column layout with smaller icons */
  .actions-container.mobile .grid-btn {
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 8px 4px;
    gap: 4px;
  }
  .actions-container.mobile .btn-icon {
    width: 36px;
    height: 36px;
    font-size: var(--font-size-base);
  }
  .actions-container.mobile .btn-text {
    align-items: center;
  }
  .actions-container.mobile .btn-label {
    font-size: var(--font-size-compact, 12px);
  }

  /* ===================================================================
     APP-NATIVE TILES (desktop side panel)
     Icon-over-label tile in the app's own mobile button language:
       • chrome from MandalaControlDock .dock-btn (12px radius, translucent
         resting bg, hover-lift, accent border)
       • glyph from NavButton .nav-icon (per-color gradient clipped to the
         icon text + active glow) — the color lives IN the glyph, no chip
     Per-action color is the existing --btn-color triplet. Tint baked at the
     "50" setting Austen approved (resting bg 0.08, border 0.225 of the
     action color). Auto-fit columns: a wide panel gains columns instead of
     stretching two fat rows; a max-height cap stops a sparse section (Edit)
     from ballooning its tiles into a void.
     =================================================================== */
  .actions-container.desktop {
    height: auto;
    min-height: 100%;
    /* The parent (.controls-content) is a flex column scroller; without this
       it flex-shrinks the stack to its own height and the unshrinkable tiles
       spill across section boundaries and overlap. Content-height + parent
       scroll is the only safe fallback. */
    flex-shrink: 0;
    overflow: visible;
    /* Center the whole stack in the scroll area so leftover height splits
       evenly top/bottom (intentional) instead of dumping at the bottom. When
       content is taller than the panel there's no free space, so this no-ops
       and the parent scrolls from the top — no clipping. */
    justify-content: center;
    gap: clamp(12px, 2.4cqh, 24px);
    /* Cap + center the stack so an ultra-wide panel (e.g. the fullscreen
       modal) reads as an intentional centered block instead of sprawling six
       thin tiles across one row with a vertical void below. Below the cap
       (narrow side docks) this no-ops and the grid fills the panel. */
    width: 100%;
    max-width: clamp(480px, 78cqw, 880px);
    margin-inline: auto;
    /* Clear the drawer's left drag-handle (it overlays the panel edge and was
       clipping the "Patterns" label) and keep symmetric breathing room. */
    padding-inline: clamp(16px, 2.6cqw, 30px);
  }
  .actions-container.desktop .section {
    gap: clamp(6px, 1.2cqh, 12px);
    /* Sections never shrink below their grid content — a squeezed section
       lets tiles (min-height floor) overflow into the next section. */
    flex-shrink: 0;
  }
  .actions-container.desktop .section-label {
    font-size: clamp(0.62rem, 1.4cqh, 0.72rem);
    opacity: 0.7;
  }
  /* Column count steps by panel width so a section of N actions wraps into a
     balanced block rather than one thin row. 2 cols narrow → 3 cols once
     there's room. With 6 transform/pattern actions that's 3 rows → 2 rows; a
     7th+ action just adds a row (grid-auto-flow: row). The max-width cap above
     keeps it at 3 cols + centered on ultra-wide panels (no 5–6 col sprawl). */
  .actions-container.desktop .section-grid {
    flex: none;
    grid-template-columns: repeat(2, 1fr);
    grid-auto-rows: auto;
    gap: clamp(8px, 1.6cqh, 13px);
  }
  @container (min-width: 560px) {
    .actions-container.desktop .section-grid {
      grid-template-columns: repeat(3, 1fr);
    }
  }
  .actions-container.desktop.three-column .section-grid {
    grid-template-columns: repeat(3, 1fr);
  }
  .actions-container.desktop .grid-btn {
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    gap: clamp(7px, 1.5cqh, 12px);
    height: auto;
    aspect-ratio: 1 / 0.84;
    min-height: 88px;
    /* Height budget is row-count-aware. The default (2-col) tier stacks SEVEN
       tile rows (3 transform + 3 patterns + 1 edit); labels, section gaps, and
       grid gaps eat ~21cqh, leaving (100 - 21) / 7 ≈ 11.28cqh per row. The
       3-col tier (5 rows) restores 17cqh below. */
    max-height: clamp(96px, 11.25cqh, 152px);
    /* Grid items with an aspect-ratio default to start-alignment, so the
       capped height transfers to a narrow width and strands each tile at the
       left of its column. Stretch fills the column; max-height still rules. */
    justify-self: stretch;
    padding: clamp(8px, 1.6cqh, 14px);
    border-radius: 12px;
    background: color-mix(
      in srgb,
      rgba(var(--btn-color), 0.08) 100%,
      var(--theme-card-bg, rgba(255, 255, 255, 0.04))
    );
    border: 1px solid
      color-mix(
        in srgb,
        rgba(var(--btn-color), 0.225) 100%,
        var(--theme-stroke, rgba(255, 255, 255, 0.1))
      );
  }
  /* 3 cols = 5 tile rows (2+2+1), so each row earns a bigger height slice:
     (100 - 21) / 5 ≈ 15.8cqh, held at 15.5 for slack. justify-self reverts
     to the pre-existing wide-tier alignment. This block must sit AFTER the
     base .grid-btn rule — same specificity, so source order decides the
     cascade inside the matching container query. */
  @container (min-width: 560px) {
    .actions-container.desktop .grid-btn {
      max-height: clamp(108px, 15.5cqh, 152px);
      justify-self: normal;
    }
  }
  .actions-container.desktop.three-column .grid-btn {
    max-height: clamp(108px, 15.5cqh, 152px);
    justify-self: normal;
  }
  .actions-container.desktop .grid-btn:hover:not(:disabled) {
    background: color-mix(
      in srgb,
      rgba(var(--btn-color), 0.19) 100%,
      var(--theme-card-bg, rgba(255, 255, 255, 0.04))
    );
    border-color: color-mix(
      in srgb,
      rgba(var(--btn-color), 0.55) 100%,
      var(--theme-stroke, rgba(255, 255, 255, 0.1))
    );
    transform: translateY(-2px);
    box-shadow: 0 8px 22px -14px rgba(var(--btn-color), 0.9);
  }
  /* No icon chip on desktop — the glyph itself carries the color. */
  .actions-container.desktop .grid-btn .btn-icon {
    width: auto;
    height: auto;
    border-radius: 0;
    background: transparent;
  }
  /* NavButton glyph technique: gradient clipped to the icon text + glow. */
  .actions-container.desktop .grid-btn .btn-icon i {
    font-size: clamp(22px, 5.2cqh, 38px);
    line-height: 1;
    background: linear-gradient(
      150deg,
      rgb(var(--btn-color)),
      color-mix(in srgb, rgb(var(--btn-color)) 55%, white)
    );
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    filter: drop-shadow(0 0 6px rgba(var(--btn-color), 0.35));
    transition: filter 200ms ease;
  }
  .actions-container.desktop .grid-btn:hover:not(:disabled) .btn-icon i {
    filter: drop-shadow(0 0 10px rgba(var(--btn-color), 0.6)) brightness(1.05);
  }
  /* Swap keeps its meaningful blue/red bicolor SVG — just scaled to match. */
  .actions-container.desktop .swap-icon-host {
    font-size: clamp(22px, 5.2cqh, 38px);
  }
  .actions-container.desktop .swap-icon-host :global(svg) {
    width: 1em;
    height: 1em;
    filter: drop-shadow(0 0 5px rgba(var(--btn-color), 0.3));
  }
  .actions-container.desktop .btn-text {
    align-items: center;
    text-align: center;
  }
  .actions-container.desktop .btn-label {
    font-size: clamp(11px, 1.7cqh, 13.5px);
    font-weight: 600;
    color: rgba(255, 255, 255, 0.92);
    white-space: normal;
    overflow: visible;
  }
  /* Sparse Edit section (1–2 tiles): center them at tile width instead of
     stretching across the panel, so the row reads intentional rather than a
     lonely left-aligned tile with a wide gap. Transform/Patterns keep their
     edge-to-edge auto-fit fill. */
  .actions-container.desktop .edit-section .section-grid {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
  }
  .actions-container.desktop .edit-section .grid-btn {
    flex: 0 1 clamp(140px, 30cqw, 264px);
  }
  /* Grid beside Edit: each section sizes to its tiles and the pair is
     centered, like the sparse Edit row was on its own. */
  .actions-container.desktop .tail-row {
    display: flex;
    justify-content: center;
    gap: clamp(12px, 2.4cqw, 24px);
    flex-shrink: 0;
  }
  .actions-container.desktop .tail-row .section {
    flex: 0 1 auto;
    min-width: 0;
  }
  .actions-container.desktop .grid-section .section-grid {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
  }
  .actions-container.desktop .tail-row .grid-btn {
    flex: 0 1 clamp(112px, 24cqw, 220px);
  }
  .actions-container.desktop .source-section .section-grid {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
  }
  .actions-container.desktop .source-section .grid-btn {
    flex: 0 1 clamp(140px, 30cqw, 264px);
  }

  .grid-btn.mirror {
    --btn-color: 139, 92, 246;
  } /* Purple */
  .grid-btn.flip {
    --btn-color: 99, 102, 241;
  } /* Indigo */
  .grid-btn.swap {
    --btn-color: 16, 185, 129;
  } /* Emerald */
  .grid-btn.invert {
    --btn-color: 245, 158, 11;
  } /* Amber */
  .grid-btn.rotate-ccw,
  .grid-btn.rotate-cw {
    --btn-color: 249, 115, 22;
  } /* Orange */
  .grid-btn.rewind {
    --btn-color: 244, 63, 94;
  } /* Rose */
  .grid-btn.reset {
    --btn-color: 100, 116, 139;
  } /* Slate */
  .grid-btn.turn-pattern {
    --btn-color: 20, 184, 166;
  } /* Teal */
  .grid-btn.direction {
    --btn-color: 14, 165, 233;
  } /* Sky */
  .grid-btn.duration {
    --btn-color: 251, 146, 60;
  } /* Orange-400 */
  .grid-btn.extend {
    --btn-color: 34, 197, 94;
  } /* Green */
  .grid-btn.shift-start {
    --btn-color: 6, 182, 212;
  } /* Cyan */
  .grid-btn.edit-turns {
    --btn-color: 59, 130, 246;
  } /* Blue */
  .grid-btn.construct {
    --btn-color: 124, 58, 237;
  } /* Violet */
  .grid-btn.grid-join {
    --btn-color: 217, 70, 239;
  } /* Fuchsia */

  .grid-btn[class] {
    background: linear-gradient(
      135deg,
      rgba(var(--btn-color), 0.15),
      rgba(var(--btn-color), 0.05)
    );
    border: 1px solid rgba(var(--btn-color), 0.3);
  }

  .grid-btn[class]:hover:not(:disabled) {
    background: linear-gradient(
      135deg,
      rgba(var(--btn-color), 0.25),
      rgba(var(--btn-color), 0.1)
    );
    border-color: rgba(var(--btn-color), 0.5);
    box-shadow: 0 4px 16px rgba(var(--btn-color), 0.2);
  }

  .grid-btn[class] .btn-icon {
    background: rgb(var(--btn-color));
  }

  /* Shift Start unavailable */
  .grid-btn.shift-start.unavailable {
    --btn-color: 100, 100, 100;
    opacity: 0.5;
  }
  .grid-btn.shift-start.unavailable .btn-icon {
    background: rgba(100, 100, 100, 0.4);
  }

  /* Swap unavailable (single-hand mode) */
  .grid-btn.swap.unavailable {
    --btn-color: 100, 100, 100;
    opacity: 0.5;
  }
  .grid-btn.swap.unavailable .btn-icon {
    background: rgba(100, 100, 100, 0.4);
  }

  /* Edit Turns highlighted (beat selected) */
  .grid-btn.edit-turns.highlighted {
    background: linear-gradient(
      135deg,
      rgba(var(--btn-color), 0.25),
      rgba(var(--btn-color), 0.12)
    );
    border: 2px solid rgba(var(--btn-color), 0.6);
    box-shadow: 0 0 16px rgba(var(--btn-color), 0.2);
  }
  .grid-btn.edit-turns.highlighted:hover:not(:disabled) {
    background: linear-gradient(
      135deg,
      rgba(var(--btn-color), 0.35),
      rgba(var(--btn-color), 0.18)
    );
    border-color: rgba(var(--btn-color), 0.8);
  }

  @media (prefers-reduced-motion: reduce) {
    .grid-btn {
      transition: none;
    }
    .grid-btn:active:not(:disabled) {
      transform: none;
    }
  }

  .actions-container.help-mode {
    /* Override disabled state - all buttons are interactive in help mode */
    opacity: 1;
    pointer-events: auto;
  }

  /* ===== HELP MODE ACTIVE STATE - Subtle highlight ===== */
  .grid-btn.help-active {
    opacity: 1;
    cursor: help;
    border-color: rgba(59, 130, 246, 0.5);
    box-shadow: 0 0 8px rgba(59, 130, 246, 0.3);
  }

  /* Dim sections without help content in help mode */
  .section.help-dimmed {
    opacity: 0.3;
    pointer-events: none;
  }

  /* ===== COMPACT MODE: Even tighter for very narrow mobile ===== */
  .actions-container.compact .btn-icon {
    width: 26px;
    height: 26px;
    font-size: var(--font-size-compact);
    border-radius: 6px;
  }

  .actions-container.compact .grid-btn {
    padding: 4px 6px;
    gap: 4px;
  }

  .actions-container.compact .btn-label {
    font-size: 0.7rem;
  }
</style>
