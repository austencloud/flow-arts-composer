<!--
  KeyboardKeyDisplay.svelte

  Realistic 3D keyboard key visualization with platform-aware symbols.
  Displays a key combo as individual keycaps with depth and styling.
-->
<script lang="ts">
  import { keyboardShortcutState } from "../../state/keyboard-shortcut-state.svelte";
  import {
    parseKeyCombo,
    formatKeyForDisplay,
  } from "../../utils/key-combo-utils";
  import type {
    KeyModifier,
    ParsedKeyCombo,
  } from "../../domain/types/keyboard-types";

  let {
    keyCombo = "",
    parsed = undefined as ParsedKeyCombo | undefined,
    size = "default" as "small" | "default" | "large",
    pressable = false,
  }: {
    keyCombo?: string;
    parsed?: ParsedKeyCombo;
    size?: "small" | "default" | "large";
    pressable?: boolean;
  } = $props();

  const isMac = keyboardShortcutState.isMac;

  // Parse the key combo if not provided as parsed
  const resolvedParsed = $derived(parsed ?? parseKeyCombo(keyCombo));

  // Order modifiers consistently
  const modifierOrder: KeyModifier[] = ["ctrl", "alt", "shift", "meta"];
  const sortedModifiers = $derived(
    [...resolvedParsed.modifiers].sort(
      (a, b) => modifierOrder.indexOf(a) - modifierOrder.indexOf(b)
    )
  );
  const isQuestionMarkCombo = $derived(
    resolvedParsed.key === "/" &&
      sortedModifiers.length === 1 &&
      sortedModifiers[0] === "shift"
  );
  const displayModifiers = $derived(
    isQuestionMarkCombo ? [] : sortedModifiers
  );
  const displayKey = $derived(isQuestionMarkCombo ? "?" : resolvedParsed.key);

  // Format modifier for display
  function formatModifier(mod: KeyModifier): string {
    if (isMac) {
      switch (mod) {
        case "ctrl":
          return "⌃";
        case "alt":
          return "⌥";
        case "shift":
          return "⇧";
        case "meta":
          return "⌘";
        default:
          return mod;
      }
    } else {
      switch (mod) {
        case "ctrl":
          return "Ctrl";
        case "alt":
          return "Alt";
        case "shift":
          return "Shift";
        case "meta":
          return "Win";
        default:
          return mod;
      }
    }
  }

  // Check if key is a wide key
  function isWideKey(key: string): boolean {
    return ["Space", "Enter", "Tab", "Backspace", "Delete"].includes(key);
  }
</script>

<div
  class="key-combo"
  class:small={size === "small"}
  class:large={size === "large"}
>
  {#each displayModifiers as mod, i}
    <kbd class="kbd modifier" class:pressable>{formatModifier(mod)}</kbd>
    {#if !isMac}
      <span class="separator">+</span>
    {/if}
  {/each}
  {#if displayKey}
    <kbd
      class="kbd main-key"
      class:wide={isWideKey(displayKey)}
      class:pressable
    >
      {formatKeyForDisplay(displayKey, isMac)}
    </kbd>
  {/if}
</div>

<style>
  .key-combo {
    display: inline-flex;
    align-items: center;
    gap: 3px;
  }

  .separator {
    color: var(--theme-text-dim);
    font-size: 0.7em;
    margin: 0 1px;
    font-weight: 500;
  }

  /* Compact keyboard key styling */
  .kbd {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 28px;
    height: 28px;
    padding: 0 8px;

    /* Subtle glass effect */
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-bottom: none;
    border-radius: 6px;

    /* Text styling */
    font-family:
      ui-monospace, "SF Mono", "Menlo", "Monaco", "Cascadia Code", monospace;
    font-size: var(--font-size-compact);
    font-weight: 600;
    color: var(--theme-text);
    text-transform: uppercase;
    letter-spacing: 0.3px;
    white-space: nowrap;

    transition: all var(--duration-fast) ease;
  }

  /* Modifier keys - theme accent tint */
  .kbd.modifier {
    background: color-mix(
      in srgb,
      var(--theme-accent-strong, var(--theme-accent-strong)) 15%,
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--theme-accent-strong, var(--theme-accent-strong)) 25%,
      transparent
    );
    color: var(--theme-accent-strong);
  }

  /* Wide keys (Space, Enter, etc.) */
  .kbd.wide {
    min-width: 44px;
    padding: 0 10px;
  }

  /* Pressable key hover/active states */
  .kbd.pressable {
    cursor: pointer;
  }

  .kbd.pressable:hover {
    transform: translateY(-2px);
    border-color: var(--theme-stroke-strong);
  }

  .kbd.pressable:active {
    transform: translateY(1px);
    border-bottom-width: 1px;
  }

  /* Size variants */
  .key-combo.small .kbd {
    min-width: 22px;
    height: 22px;
    padding: 0 6px;
    font-size: var(--font-size-compact);
    border-radius: 5px;
    border-bottom-width: 2px;
    font-weight: 600;
  }

  .key-combo.small .separator {
    font-size: 0.6em;
  }

  .key-combo.small .kbd.wide {
    min-width: 42px;
    padding: 0 9px;
  }

  .key-combo.large .kbd {
    min-width: 38px;
    height: 38px;
    padding: 0 14px;
    font-size: var(--font-size-sm);
    border-radius: 9px;
    border-bottom-width: 4px;
  }

  .key-combo.large .kbd.wide {
    min-width: 76px;
    padding: 0 18px;
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .kbd {
      transition: none;
    }

    .kbd.pressable:hover,
    .kbd.pressable:active {
      transform: none;
    }
  }
</style>
