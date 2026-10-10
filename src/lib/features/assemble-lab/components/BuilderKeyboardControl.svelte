<script lang="ts">
  import { Popover } from "bits-ui";
  import {
    HandSide,
    RotationDirection,
  } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
  import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import type { AssembleState } from "../state/assemble-state.svelte";
  import {
    ASSEMBLE_NUMPAD_POSITIONS,
    isAssembleKeyboardLocationAvailable,
  } from "../services/assemble-keyboard-handler";

  let { builderState }: { builderState: AssembleState } = $props();

  let guideOpen = $state(false);

  const handLabel = $derived(
    builderState.activeHand === HandSide.LEFT ? "Left hand" : "Right hand"
  );
  const rotationLabel = $derived(
    builderState.rotationDirection === RotationDirection.CLOCKWISE
      ? "CW"
      : "CCW"
  );
  const turnLabel = $derived(
    builderState.turnCount === -0.5
      ? "Float"
      : `${builderState.turnCount} turn${builderState.turnCount === 1 ? "" : "s"}`
  );
  const gridLabel = $derived.by(() => {
    switch (builderState.gridMode) {
      case GridMode.BOX:
        return "Box";
      case GridMode.SKEWED:
        return "Merged";
      default:
        return "Diamond";
    }
  });
  const guideHandColor = $derived(
    builderState.activeHand === HandSide.LEFT
      ? "var(--prop-blue, #2e8bf0)"
      : "var(--prop-red, #ed1c24)"
  );

  function toggleKeyboardMode(): void {
    const disabling = builderState.keyboardMode;
    builderState.toggleKeyboardMode();
    if (disabling) guideOpen = false;
  }
</script>

<div class="keyboard-control" style:--numpad-color={guideHandColor}>
  <button
    type="button"
    class="mode-button"
    class:active={builderState.keyboardMode}
    aria-pressed={builderState.keyboardMode}
    aria-label={builderState.keyboardMode
      ? "Turn off numpad building"
      : "Turn on numpad building"}
    onclick={toggleKeyboardMode}
  >
    <span class="mode-icon" aria-hidden="true">
      <i class="fas fa-keyboard"></i>
    </span>
    <span>Numpad</span>
    <span class="mode-state">{builderState.keyboardMode ? "On" : "Off"}</span>
  </button>

  <Popover.Root bind:open={guideOpen}>
    <Popover.Trigger>
      {#snippet child({ props })}
        <button
          {...props}
          type="button"
          class="guide-button"
          class:open={guideOpen}
          aria-label="Show numpad key map"
          title="Numpad key map"
        >
          <span>Keys</span>
          <i class="fas fa-chevron-down" aria-hidden="true"></i>
        </button>
      {/snippet}
    </Popover.Trigger>
    <Popover.Portal>
      <Popover.Content
        side="bottom"
        align="end"
        sideOffset={8}
        collisionPadding={12}
        class="keyboard-guide-panel"
        aria-label="Numpad key map"
        style={`--numpad-color: ${guideHandColor};`}
      >
        <div class="guide-heading">
          <div class="guide-title">
            <span class="guide-icon" aria-hidden="true">
              <i class="fas fa-keyboard"></i>
            </span>
            <div>
              <strong>Numpad map</strong>
              <span>Numbers pick points. The outer keys shape the move.</span>
            </div>
          </div>
          <div
            class="current-settings"
            aria-label={`Current settings: ${handLabel}, ${rotationLabel}, ${turnLabel}`}
          >
            <strong>{handLabel}</strong>
            <span>{rotationLabel}</span>
            <span>{turnLabel}</span>
          </div>
        </div>

        <div class="numpad-deck">
          <div class="numpad-board" aria-label="Physical numpad layout">
            <div class="board-mark" aria-hidden="true">
              <span>NUM</span>
              <strong>{gridLabel}</strong>
            </div>

            <kbd
              class="keycap action-key slash-key"
              aria-label="Slash: orientation"
            >
              <strong>/</strong><span>Orientation</span>
            </kbd>
            <kbd
              class="keycap action-key multiply-key"
              aria-label="Asterisk: direction"
            >
              <strong>*</strong><span>Direction</span>
            </kbd>
            <kbd
              class="keycap action-key minus-key"
              aria-label="Minus: decrease turns"
            >
              <strong>-</strong><span>Turn</span>
            </kbd>

            {#each ASSEMBLE_NUMPAD_POSITIONS as position}
              {@const available = isAssembleKeyboardLocationAvailable(
                position.location,
                builderState.gridMode,
                builderState.showCenter
              )}
              <kbd
                class="keycap position-key"
                class:unavailable={!available}
                style={`grid-area: key${position.key}`}
                aria-disabled={!available}
                aria-label={`${position.key}: ${position.label}${available ? "" : ", unavailable"}`}
              >
                <strong>{position.key}</strong>
                <span>{position.label}</span>
              </kbd>
            {/each}

            <kbd
              class="keycap action-key plus-key"
              aria-label="Plus: increase turns"
            >
              <strong>+</strong><span>Turn</span>
            </kbd>
            <kbd
              class="keycap action-key zero-key"
              aria-label="Zero: switch hand"
            >
              <strong>0</strong><span>Switch hand</span>
            </kbd>
            <kbd
              class="keycap action-key decimal-key"
              aria-label="Decimal: undo"
            >
              <strong>.</strong><span>Undo</span>
            </kbd>
            <kbd
              class="keycap action-key enter-key"
              aria-label="Enter: complete hand"
            >
              <strong>Enter</strong><span>Finish hand</span>
            </kbd>
          </div>
        </div>

        <p class="guide-foot">
          Bright number keys match the points available on the {gridLabel.toLowerCase()}
          grid.
        </p>
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>
</div>

<style>
  .keyboard-control {
    display: flex;
    align-items: stretch;
    gap: 6px;
  }

  .mode-button,
  .guide-button {
    min-height: var(--min-touch-target, 44px);
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--theme-card-bg, #181b27) 88%, white 4%),
      color-mix(in srgb, var(--theme-card-bg, #181b27) 88%, black 8%)
    );
    color: var(
      --assemble-text-secondary,
      color-mix(in srgb, var(--theme-text, #fff) 84%, transparent)
    );
    cursor: pointer;
    transition:
      background var(--duration-fast, 150ms) ease,
      border-color var(--duration-fast, 150ms) ease,
      box-shadow var(--duration-fast, 150ms) ease,
      color var(--duration-fast, 150ms) ease,
      transform var(--duration-fast, 150ms) ease;
  }

  .mode-button {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 8px 5px 6px;
    border-radius: var(--settings-radius-md, 12px);
    font-size: var(--font-size-min, 14px);
    font-weight: 700;
  }

  .mode-button.active {
    border-color: color-mix(in srgb, var(--numpad-color) 56%, transparent);
    background: linear-gradient(
      135deg,
      color-mix(
        in srgb,
        var(--numpad-color) 24%,
        var(--theme-card-bg, #181b27)
      ),
      color-mix(in srgb, var(--numpad-color) 8%, var(--theme-card-bg, #181b27))
    );
    color: var(--theme-text, #fff);
  }

  .mode-icon {
    display: grid;
    width: 30px;
    height: 30px;
    place-items: center;
    border: 1px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.16));
    border-radius: 8px;
    background: rgba(0, 0, 0, 0.28);
    box-shadow: inset 0 -2px 0 rgba(0, 0, 0, 0.22);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.7));
  }

  .active .mode-icon {
    border-color: color-mix(in srgb, var(--numpad-color) 62%, transparent);
    color: var(--numpad-color);
  }

  .mode-state {
    min-width: 32px;
    padding: 3px 6px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 7px;
    background: rgba(0, 0, 0, 0.35);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
  }

  .active .mode-state {
    border-color: color-mix(in srgb, var(--numpad-color) 44%, transparent);
    background: color-mix(in srgb, var(--numpad-color) 18%, transparent);
    color: var(--numpad-color);
  }

  .guide-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    min-width: var(--min-touch-target, 44px);
    padding: 0 10px;
    border-radius: var(--settings-radius-md, 12px);
    font-size: var(--font-size-min, 14px);
    font-weight: 700;
  }

  .guide-button i {
    font-size: 11px;
    transition: transform var(--duration-fast, 150ms) ease;
  }

  .guide-button.open {
    border-color: color-mix(in srgb, var(--numpad-color) 44%, transparent);
    color: var(--theme-text, #fff);
  }

  .guide-button.open i {
    transform: rotate(180deg);
  }

  .mode-button:hover,
  .guide-button:hover {
    border-color: color-mix(in srgb, var(--numpad-color) 38%, transparent);
    background: color-mix(
      in srgb,
      var(--numpad-color) 10%,
      var(--theme-card-hover-bg, #202432)
    );
    color: var(--theme-text, #fff);
  }

  .mode-button:active,
  .guide-button:active {
    transform: translateY(1px);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
  }

  .mode-button:focus-visible,
  .guide-button:focus-visible {
    outline: 2px solid var(--theme-text, #fff);
    outline-offset: 2px;
  }

  :global(.keyboard-guide-panel) {
    position: relative;
    width: min(560px, calc(100vw - 24px));
    padding: 16px;
    overflow: hidden;
    border: 1px solid color-mix(in srgb, var(--numpad-color) 34%, transparent);
    border-radius: var(--settings-radius-lg, 18px);
    background:
      linear-gradient(
        135deg,
        color-mix(in srgb, var(--numpad-color) 13%, transparent),
        transparent 42%
      ),
      color-mix(in srgb, var(--theme-panel-bg, #111520) 94%, transparent);
    backdrop-filter: blur(22px) saturate(1.18);
    color: var(--theme-text, #fff);
    z-index: var(--z-dropdown, 100);
    animation: keyboard-guide-in var(--duration-normal, 200ms)
      var(--ease-out, cubic-bezier(0.22, 1, 0.36, 1));
  }

  :global(.keyboard-guide-panel)::before {
    position: absolute;
    top: 0;
    right: 18px;
    left: 18px;
    height: 2px;
    border-radius: 999px;
    background: linear-gradient(
      90deg,
      transparent,
      var(--numpad-color),
      transparent
    );
    content: "";
    opacity: 0.72;
  }

  .guide-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 1px 1px 13px;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .guide-title {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 10px;
  }

  .guide-title > div {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 2px;
  }

  .guide-icon {
    display: grid;
    width: 38px;
    height: 38px;
    flex: 0 0 38px;
    place-items: center;
    border: 1px solid color-mix(in srgb, var(--numpad-color) 48%, transparent);
    border-radius: 11px;
    background: color-mix(in srgb, var(--numpad-color) 14%, transparent);
    box-shadow: 0 0 20px
      color-mix(in srgb, var(--numpad-color) 14%, transparent);
    color: var(--numpad-color);
  }

  .guide-heading strong {
    font-size: 16px;
  }

  .guide-title span,
  .guide-foot {
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.62));
    font-size: var(--font-size-compact, 12px);
  }

  .current-settings {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 8px;
    padding: 7px 9px;
    border: 1px solid color-mix(in srgb, var(--numpad-color) 28%, transparent);
    border-radius: 10px;
    background: rgba(0, 0, 0, 0.24);
    font-variant-numeric: tabular-nums;
    font-size: var(--font-size-compact, 12px);
  }

  .current-settings strong {
    color: var(--numpad-color);
  }

  .current-settings span {
    position: relative;
    padding-left: 9px;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.68));
  }

  .current-settings span::before {
    position: absolute;
    top: 50%;
    left: 0;
    width: 1px;
    height: 14px;
    background: var(--theme-stroke, rgba(255, 255, 255, 0.12));
    content: "";
    transform: translateY(-50%);
  }

  .numpad-deck {
    margin-top: 14px;
    padding: 10px;
    border: 1px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.14));
    border-radius: 15px;
    background: rgba(0, 0, 0, 0.42);
    box-shadow:
      inset 0 2px 12px rgba(0, 0, 0, 0.34),
      inset 0 1px 0 rgba(255, 255, 255, 0.04);
  }

  .numpad-board {
    display: grid;
    grid-template-areas:
      "mark slash multiply minus"
      "key7 key8 key9 plus"
      "key4 key5 key6 plus"
      "key1 key2 key3 enter"
      "zero zero decimal enter";
    grid-template-columns: repeat(4, minmax(0, 1fr));
    grid-template-rows: repeat(5, minmax(46px, auto));
    gap: 7px;
  }

  .board-mark {
    display: flex;
    grid-area: mark;
    min-width: 0;
    flex-direction: column;
    justify-content: center;
    padding: 4px 9px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.48));
    line-height: 1.1;
  }

  .board-mark span {
    font-family: var(--font-mono, monospace);
    font-size: var(--font-size-compact, 12px);
    font-weight: 800;
    letter-spacing: 0.12em;
  }

  .board-mark strong {
    overflow: hidden;
    color: var(--numpad-color);
    font-size: var(--font-size-min, 14px);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .keycap {
    display: flex;
    min-width: 0;
    min-height: 46px;
    padding: 6px 8px 8px;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1px;
    box-sizing: border-box;
    border: 1px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.16));
    border-radius: 9px;
    background: linear-gradient(
      180deg,
      color-mix(in srgb, var(--theme-card-bg, #1c202c) 92%, white 4%),
      color-mix(in srgb, var(--theme-card-bg, #1c202c) 88%, black 12%)
    );
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.08),
      0 3px 0 rgba(0, 0, 0, 0.36);
    color: var(--theme-text, #fff);
    font-family: inherit;
    text-align: center;
  }

  .keycap strong {
    font-family: var(--font-mono, monospace);
    font-size: 17px;
    line-height: 1;
  }

  .keycap span {
    overflow: hidden;
    max-width: 100%;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.62));
    font-size: var(--font-size-compact, 12px);
    line-height: 1.15;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .position-key {
    border-color: color-mix(in srgb, var(--numpad-color) 56%, transparent);
    background: linear-gradient(
      180deg,
      color-mix(
        in srgb,
        var(--numpad-color) 20%,
        var(--theme-card-bg, #1c202c)
      ),
      color-mix(in srgb, var(--numpad-color) 8%, var(--theme-card-bg, #1c202c))
    );
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.12),
      0 3px 0 rgba(0, 0, 0, 0.38),
      0 0 14px color-mix(in srgb, var(--numpad-color) 10%, transparent);
  }

  .position-key strong {
    color: var(--numpad-color);
  }

  .position-key.unavailable {
    border-color: var(--theme-stroke, rgba(255, 255, 255, 0.08));
    background: rgba(0, 0, 0, 0.28);
    box-shadow: inset 0 1px 4px rgba(0, 0, 0, 0.24);
    opacity: 0.24;
  }

  .position-key.unavailable strong {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.42));
  }

  .slash-key {
    grid-area: slash;
  }

  .multiply-key {
    grid-area: multiply;
  }

  .minus-key {
    grid-area: minus;
  }

  .plus-key {
    grid-area: plus;
  }

  .zero-key {
    grid-area: zero;
    flex-direction: row;
    gap: 8px;
  }

  .decimal-key {
    grid-area: decimal;
  }

  .enter-key {
    grid-area: enter;
  }

  .plus-key,
  .enter-key {
    background: linear-gradient(
      180deg,
      color-mix(
        in srgb,
        var(--numpad-color) 13%,
        var(--theme-card-bg, #1c202c)
      ),
      color-mix(in srgb, var(--numpad-color) 5%, var(--theme-card-bg, #1c202c))
    );
  }

  .guide-foot {
    margin: 10px 2px 0;
    line-height: 1.35;
    text-align: center;
  }

  @keyframes keyboard-guide-in {
    from {
      opacity: 0;
      scale: 0.97;
      translate: 0 -6px;
    }
  }

  @media (hover: none), (pointer: coarse) {
    .keyboard-control {
      display: none;
    }
  }

  @media (max-width: 560px) {
    .guide-heading {
      align-items: flex-start;
      flex-direction: column;
    }

    .current-settings {
      align-self: stretch;
      justify-content: center;
    }

    .numpad-deck {
      padding: 7px;
    }

    .numpad-board {
      gap: 5px;
    }

    .keycap {
      padding-inline: 4px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .mode-button,
    .guide-button,
    .guide-button i {
      transition: none;
    }

    :global(.keyboard-guide-panel) {
      animation: none;
    }
  }
</style>
