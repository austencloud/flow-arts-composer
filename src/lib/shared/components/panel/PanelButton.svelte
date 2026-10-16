<script lang="ts">
  import type { Snippet } from "svelte";
  import { Button } from "@austencloud/ui";

  interface Props {
    variant?: "primary" | "secondary" | "quiet";
    href?: string;
    accentColor?: string;
    children: Snippet;
    onclick?: (event: MouseEvent) => void;
    disabled?: boolean;
    type?: "button" | "submit" | "reset";
    fullWidth?: boolean;
    ariaLabel?: string;
    title?: string;
    ref?: HTMLButtonElement | null;
    ariaBusy?: boolean;
    ariaExpanded?: boolean;
    ariaControls?: string;
    ariaPressed?: boolean;
    saveShortcut?: boolean;
  }

  let {
    variant = "secondary",
    href,
    accentColor,
    children,
    onclick,
    disabled = false,
    type = "button",
    fullWidth = false,
    ariaLabel,
    title,
    ref = $bindable(null),
    ariaBusy = false,
    ariaExpanded,
    ariaControls,
    ariaPressed,
    saveShortcut = false,
  }: Props = $props();

  const themeStyle = $derived(
    [
      `--ui-accent: ${accentColor ?? "var(--theme-accent)"}`,
      "--ui-on-accent: var(--theme-text-on-accent, white)",
      "--ui-surface: var(--theme-card-bg)",
      "--ui-surface-hover: var(--theme-card-hover-bg)",
      "--ui-stroke: var(--theme-stroke)",
      "--ui-text: var(--theme-text)",
      "--ui-focus: var(--theme-accent)",
      "--ui-motion-duration: var(--transition-normal, 180ms)",
      variant === "quiet"
        ? "--ui-quiet-bg: color-mix(in srgb, var(--theme-text) 4%, transparent)"
        : "",
    ].join("; "),
  );
</script>

<Button
  {variant}
  class="panel-btn panel-btn--{variant} {fullWidth ? 'panel-btn--full-width' : ''} {accentColor ? 'panel-btn--tinted' : ''}"
  {href}
  {children}
  {onclick}
  {disabled}
  {type}
  {fullWidth}
  {title}
  style={themeStyle}
  bind:ref
  aria-label={ariaLabel}
  aria-busy={ariaBusy}
  aria-expanded={ariaExpanded}
  aria-controls={ariaControls}
  aria-pressed={ariaPressed}
  data-save-shortcut={saveShortcut ? "" : undefined}
/>
