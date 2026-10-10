<script lang="ts">
  interface Props {
    label: string;
    description: string;
    status: string;
    icon: string;
    statusIcon?: string;
    statusTone?: "on" | "off" | "action" | "warning";
    enabled?: boolean;
    switchChecked?: boolean;
    busy?: boolean;
    disabled?: boolean;
    ariaLabel: string;
    onToggle: () => void;
  }

  let {
    label,
    description,
    status,
    icon,
    statusIcon,
    statusTone = "off",
    enabled = false,
    switchChecked,
    busy = false,
    disabled = false,
    ariaLabel,
    onToggle,
  }: Props = $props();

  const resolvedStatusIcon = $derived(
    statusIcon ??
      (statusTone === "on"
        ? "fa-circle-check"
        : statusTone === "warning"
          ? "fa-triangle-exclamation"
          : statusTone === "action"
            ? "fa-arrow-right"
            : "fa-circle")
  );
</script>

<button
  type="button"
  class="channel-card"
  class:enabled
  class:action-state={statusTone === "action"}
  class:warning-state={statusTone === "warning"}
  role={switchChecked === undefined ? undefined : "switch"}
  aria-checked={switchChecked}
  onclick={onToggle}
  {disabled}
  aria-label={ariaLabel}
  aria-busy={busy}
>
  <span class="channel-icon" aria-hidden="true">
    <i class={`fas ${icon}`}></i>
  </span>

  <span class="channel-copy">
    <span class="channel-label">{label}</span>
    <span class="channel-description">{description}</span>
  </span>

  <span class="channel-state" aria-hidden="true">
    <i
      class={busy ? "fas fa-circle-notch fa-spin" : `fas ${resolvedStatusIcon}`}
    ></i>
    <span>{status}</span>
  </span>
</button>

<style>
  /* A row of the settings panel: no frame of its own, hairlines come from
     the list it sits in. */
  .channel-card {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.85em;
    width: 100%;
    min-height: 4.75em;
    padding: 0.85em var(--settings-row-inline, 1.15em);
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

  .channel-card:hover:not(:disabled) {
    background: var(--theme-card-hover-bg);
  }

  .channel-card:focus-visible {
    position: relative;
    z-index: 1;
    outline: 2px solid var(--theme-accent);
    outline-offset: -2px;
  }

  .channel-card:disabled {
    cursor: not-allowed;
    opacity: 0.58;
  }

  .channel-card[aria-busy="true"] {
    cursor: wait;
    opacity: 0.7;
  }

  .channel-card.enabled {
    background: color-mix(in srgb, var(--theme-accent) 12%, transparent);
  }

  .channel-icon {
    display: grid;
    width: 2.8em;
    height: 2.8em;
    place-items: center;
    border: 1px solid var(--theme-stroke);
    border-radius: 0.75em;
    color: var(--theme-text-dim);
    background: color-mix(in srgb, var(--theme-text) 5%, transparent);
  }

  .channel-card.enabled .channel-icon,
  .channel-card.action-state .channel-icon {
    border-color: color-mix(in srgb, var(--theme-accent) 24%, transparent);
    color: var(--theme-accent-text, var(--theme-accent));
    background: color-mix(in srgb, var(--theme-accent) 12%, transparent);
  }

  .channel-card.warning-state .channel-icon {
    border-color: color-mix(in srgb, var(--semantic-warning) 32%, transparent);
    color: var(--semantic-warning);
    background: color-mix(in srgb, var(--semantic-warning) 10%, transparent);
  }

  .channel-copy {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 0.25em;
  }

  .channel-label {
    color: var(--theme-text);
    font-size: max(0.9375rem, var(--font-size-base));
    font-weight: 725;
    line-height: 1.25;
  }

  .channel-description {
    overflow-wrap: anywhere;
    color: var(--theme-text-dim);
    font-size: max(0.75rem, var(--font-size-compact));
    line-height: 1.35;
  }

  .channel-state {
    display: flex;
    min-width: 4.25em;
    align-items: center;
    justify-content: flex-end;
    gap: 0.42em;
    color: var(--theme-text-dim);
    font-size: max(0.875rem, var(--font-size-sm));
    font-weight: 750;
    line-height: 1;
    text-align: right;
  }

  .channel-card.enabled .channel-state,
  .channel-card.action-state .channel-state {
    color: var(--theme-accent-text, var(--theme-accent));
  }

  .channel-card.warning-state .channel-state {
    color: var(--semantic-warning);
  }

  @container notification-preferences (max-width: 32rem) {
    .channel-card {
      gap: 0.65rem;
      min-height: 5.25rem;
    }

    .channel-icon {
      width: 2.5rem;
      height: 2.5rem;
    }

    .channel-state {
      min-width: 3.5rem;
      flex-direction: column;
      gap: 0.2rem;
      font-size: 0.75rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .channel-card {
      transition: none;
    }
  }
</style>
