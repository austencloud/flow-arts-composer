<!--
  OptionPickerControlsPopover.svelte

  Continuous compact layouts have no letter-type header, so their settings
  remain in this anchored popover. Sectioned swipe layouts render the same
  OptionPickerHeader inside their shared utility tray instead.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { Popover } from "bits-ui";
  import { flyFade } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import type { RotationDirection } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
  import {
    formatTurnValue,
    type TurnLevel,
    type TurnValue,
  } from "#lib/shared/create/services/level-turn-values.js";
  import OptionPickerHeader from "./OptionPickerHeader.svelte";
  import OptionPickerIconButton from "./OptionPickerIconButton.svelte";

  interface Props {
    showFilter: boolean;
    showTurnControls?: boolean;
    isContinuousOnly: boolean;
    optionAvailability?: { shownCount: number; hiddenCount: number };
    onToggleContinuous?: (value: boolean) => void;
    level: TurnLevel;
    onLevelChange: (level: TurnLevel) => void;
    leftTurns: TurnValue;
    rightTurns: TurnValue;
    leftRotation: RotationDirection;
    rightRotation: RotationDirection;
    onLeftChange: (value: TurnValue) => void;
    onRightChange: (value: TurnValue) => void;
    onLeftRotationChange: (dir: RotationDirection) => void;
    onRightRotationChange: (dir: RotationDirection) => void;
    open?: boolean;
    triggerDensity?: "standard" | "compact";
  }

  let {
    showFilter,
    showTurnControls = true,
    isContinuousOnly,
    optionAvailability,
    onToggleContinuous,
    level,
    onLevelChange,
    leftTurns,
    rightTurns,
    leftRotation,
    rightRotation,
    onLeftChange,
    onRightChange,
    onLeftRotationChange,
    onRightRotationChange,
    open = $bindable(false),
    triggerDensity = "standard",
  }: Props = $props();

  const modeLabel = $derived(
    isContinuousOnly ? t("create_option_continuous") : t("create_option_all")
  );
  const leftTurnLabel = $derived(formatTurnValue(leftTurns));
  const rightTurnLabel = $derived(formatTurnValue(rightTurns));

  const triggerLabel = $derived.by(() => {
    const details = [t("create_ui_option_settings")];
    if (showFilter)
      details.push(t("create_deep_showing_mode", { mode: modeLabel }));
    if (showTurnControls) {
      details.push(t("create_deep_level_number", { level }));
      details.push(t("create_deep_left_turns_value", { turns: leftTurnLabel }));
      details.push(
        t("create_deep_right_turns_value", { turns: rightTurnLabel })
      );
    }
    return details.join(". ");
  });
</script>

<Popover.Root bind:open>
  <Popover.Trigger>
    {#snippet child({ props })}
      <OptionPickerIconButton
        {...props}
        icon="fa-sliders"
        density={triggerDensity}
        active={open}
        aria-label={triggerLabel}
        title={t("create_ui_option_settings")}
      />
    {/snippet}
  </Popover.Trigger>

  <Popover.Portal>
    <Popover.Overlay
      class="option-settings-overlay"
      data-testid="option-settings-overlay"
    />

    <Popover.Content
      side="top"
      align="start"
      sideOffset={6}
      avoidCollisions={true}
      collisionPadding={8}
      forceMount
    >
      {#snippet child({ open: contentOpen, wrapperProps, props })}
        <div {...wrapperProps}>
          {#if contentOpen}
            <div
              {...props}
              class="controls-popover themed-scrollbar"
              role="dialog"
              aria-label={t("create_ui_option_settings")}
              transition:flyFade={{ y: 8, duration: DURATION.normal }}
            >
              <!-- Visible close: the trigger toggle / Escape / backdrop tap all
                   dismiss, but none is discoverable. An ✕ top-right is the
                   affordance an average user looks for first. Sticky so it stays
                   reachable while the Level 3 palette scrolls. -->
              <div class="popover-topbar">
                <button
                  type="button"
                  class="popover-close"
                  aria-label={t("create_ui_close_option_settings")}
                  title={t("action_close")}
                  onclick={() => (open = false)}
                >
                  <i class="fas fa-xmark" aria-hidden="true"></i>
                </button>
              </div>

              <OptionPickerHeader
                {optionAvailability}
                layout="compact"
                {showFilter}
                {showTurnControls}
                {isContinuousOnly}
                {onToggleContinuous}
                {level}
                {onLevelChange}
                {leftTurns}
                {rightTurns}
                {leftRotation}
                {rightRotation}
                {onLeftChange}
                {onRightChange}
                {onLeftRotationChange}
                {onRightRotationChange}
              />
            </div>
          {/if}
        </div>
      {/snippet}
    </Popover.Content>
  </Popover.Portal>
</Popover.Root>

<style>
  .controls-popover {
    width: min(
      32rem,
      var(--bits-popover-content-available-width, calc(100vw - 16px))
    );
    max-height: min(
      26rem,
      var(--bits-popover-content-available-height, calc(100dvh - 16px))
    );
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-gutter: stable;
    background: var(--theme-panel-bg, rgba(10, 18, 30, 0.98));
    border: 1px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    border-radius: var(--radius-xl, 16px);
    transform-origin: var(
      --bits-popover-content-transform-origin,
      bottom center
    );
    z-index: var(--z-dropdown, 1000);
  }

  /* Sticky close bar. Shares the panel wash so the palette scrolls under it. */
  .popover-topbar {
    position: sticky;
    top: 0;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    padding: 6px 6px 0;
    background: var(--theme-panel-bg, rgba(10, 18, 30, 0.98));
  }

  /* Reads as a button, not a bare glyph: subtle fill + border + hover. */
  .popover-close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
    padding: 0;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.14));
    border-radius: var(--radius-md, 10px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.72));
    cursor: pointer;
    transition:
      background var(--duration-fast, 150ms) ease,
      border-color var(--duration-fast, 150ms) ease,
      color var(--duration-fast, 150ms) ease;
    -webkit-tap-highlight-color: transparent;
  }

  .popover-close:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.12));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.24));
    color: var(--theme-text, #fff);
  }

  .popover-close:active {
    transform: scale(0.94);
  }

  .popover-close:focus-visible {
    outline: 2px solid var(--theme-accent, #22b8db);
    outline-offset: -2px;
  }

  .popover-close i {
    font-size: 1.05rem;
  }

  /* Portaling the veil with the panel lets it cover the workspace above the
     picker instead of being clipped to the option grid's own bounds. */
  :global(.option-settings-overlay) {
    position: fixed;
    inset: 0;
    z-index: calc(var(--z-dropdown, 1000) - 1);
    background: linear-gradient(
      to bottom,
      rgba(0, 0, 0, 0.48) 0%,
      rgba(0, 0, 0, 0.34) 52%,
      rgba(0, 0, 0, 0.24) 100%
    );
    opacity: 1;
    transition: opacity var(--duration-normal, 200ms) ease-out;
  }

  :global(.option-settings-overlay[data-starting-style]),
  :global(.option-settings-overlay[data-ending-style]) {
    opacity: 0;
  }

  @media (prefers-reduced-motion: reduce) {
    .popover-close {
      transition: none;
    }

    .popover-close:active {
      transform: none;
    }

    :global(.option-settings-overlay) {
      transition: none;
    }
  }
</style>
