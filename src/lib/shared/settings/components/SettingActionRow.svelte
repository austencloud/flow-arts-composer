<!--
  SettingActionRow — a settings row that does something when pressed: opens
  another settings page or starts a guide.

  The whole row is the target, laid out like SettingToggleButton so action rows
  and switches line up in one list. The trailing word ("Replay") or chevron
  says what the press does.
-->
<script lang="ts">
  interface Props {
    icon: string;
    label: string;
    description?: string;
    /** Short verb shown at the end of the row, e.g. "Replay". */
    actionLabel?: string;
    /** Shows a chevron: the row opens another page. */
    opensPage?: boolean;
    ariaLabel?: string;
    busy?: boolean;
    disabled?: boolean;
    onclick: (event: MouseEvent) => void;
  }

  let {
    icon,
    label,
    description,
    actionLabel,
    opensPage = false,
    ariaLabel,
    busy = false,
    disabled = false,
    onclick,
  }: Props = $props();
</script>

<button
  type="button"
  class="setting-action"
  aria-label={ariaLabel}
  aria-busy={busy}
  {disabled}
  {onclick}
>
  <span class="action-mark" aria-hidden="true">
    <i class={busy ? "fas fa-circle-notch fa-spin" : icon}></i>
  </span>

  <span class="action-copy">
    <span class="action-label">{label}</span>
    {#if description}
      <span class="action-description">{description}</span>
    {/if}
  </span>

  {#if actionLabel || opensPage}
    <span class="action-end" aria-hidden="true">
      {#if actionLabel}<span>{actionLabel}</span>{/if}
      {#if opensPage}<i class="fas fa-chevron-right"></i>{/if}
    </span>
  {/if}
</button>

<style>
  .setting-action {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.8em;
    width: 100%;
    min-height: 4.25em;
    padding: 0.72em 0.9em;
    border: 0;
    border-radius: 0;
    color: var(--theme-text);
    background: transparent;
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition: background var(--duration-fast) ease;
    -webkit-tap-highlight-color: transparent;
  }

  .setting-action:hover:not(:disabled) {
    background: var(--theme-card-hover-bg);
  }

  .setting-action:focus-visible {
    position: relative;
    z-index: 1;
    outline: 2px solid var(--theme-accent);
    outline-offset: -2px;
  }

  .setting-action:disabled {
    cursor: not-allowed;
    opacity: 0.48;
  }

  .setting-action[aria-busy="true"] {
    cursor: wait;
    opacity: 0.68;
  }

  .action-mark {
    display: grid;
    width: 2em;
    height: 2em;
    place-items: center;
    border-radius: 50%;
    color: var(--theme-text-dim);
    background: color-mix(in srgb, var(--theme-text) 4%, transparent);
    font-size: max(1rem, var(--font-size-base));
    transition: transform var(--duration-fast) ease;
  }

  .setting-action:active:not(:disabled) .action-mark {
    transform: scale(0.92);
  }

  .action-copy {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 0.18em;
  }

  .action-label {
    color: var(--theme-text);
    font-size: max(0.875rem, var(--font-size-sm));
    font-weight: 675;
    line-height: 1.25;
  }

  .action-description {
    color: var(--theme-text-dim);
    font-size: max(0.75rem, var(--font-size-compact));
    line-height: 1.38;
    font-variant-numeric: tabular-nums;
  }

  .action-end {
    display: inline-flex;
    align-items: center;
    gap: 0.55em;
    color: var(--theme-text-dim);
    font-size: max(0.875rem, var(--font-size-sm));
    font-weight: 750;
    line-height: 1;
    white-space: nowrap;
  }

  .setting-action:hover:not(:disabled) .action-end {
    color: var(--theme-accent-text, var(--theme-accent));
  }

  @media (prefers-reduced-motion: reduce) {
    .setting-action,
    .action-mark {
      transition: none;
    }
  }
</style>
