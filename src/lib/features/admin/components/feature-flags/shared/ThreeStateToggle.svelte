<script lang="ts">
  /**
   * ThreeStateToggle
   * A 3-state selector: Inherit | Grant | Deny
   * Core primitive for feature override management
   */

  import type { OverrideState } from "./feature-utils";

  interface Props {
    value: OverrideState;
    inheritLabel?: string;
    inheritResolvesTo?: boolean; // What "inherit" resolves to for visual hint
    disabled?: boolean;
    compact?: boolean;
    onchange: (state: OverrideState) => void;
  }

  let {
    value,
    inheritLabel = "Inherit",
    inheritResolvesTo,
    disabled = false,
    compact = false,
    onchange,
  }: Props = $props();

  const states: { id: OverrideState; icon: string; label: string }[] = $derived(
    [
      { id: "inherit", icon: "fa-link", label: inheritLabel },
      { id: "grant", icon: "fa-check", label: "Grant" },
      { id: "deny", icon: "fa-ban", label: "Deny" },
    ]
  );
</script>

<div class="three-state-toggle" class:compact class:disabled>
  {#each states as state}
    <button
      type="button"
      class="toggle-option"
      class:selected={value === state.id}
      class:inherit={state.id === "inherit"}
      class:grant={state.id === "grant"}
      class:deny={state.id === "deny"}
      class:resolves-granted={state.id === "inherit" &&
        inheritResolvesTo === true}
      class:resolves-denied={state.id === "inherit" &&
        inheritResolvesTo === false}
      {disabled}
      onclick={() => onchange(state.id)}
      aria-pressed={value === state.id}
      aria-label={compact ? state.label : undefined}
    >
      <i class="fas {state.icon}" aria-hidden="true"></i>
      {#if !compact}
        <span class="label">{state.label}</span>
      {/if}
      {#if state.id === "inherit" && inheritResolvesTo !== undefined && !compact}
        <span
          class="resolve-hint"
          class:granted={inheritResolvesTo}
          class:denied={!inheritResolvesTo}
        >
          {inheritResolvesTo ? "✓" : "✗"}
        </span>
      {/if}
    </button>
  {/each}
</div>

<style>
  .three-state-toggle {
    display: inline-flex;
    gap: 2px;
    padding: 3px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border-radius: 10px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .three-state-toggle.disabled {
    opacity: 0.5;
    pointer-events: none;
  }

  .toggle-option {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 10px 14px;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-size: var(--font-size-compact, 12px);
    font-weight: 500;
    cursor: pointer;
    transition:
      background var(--duration-fast) var(--ease-standard),
      border-color var(--duration-fast) var(--ease-standard),
      color var(--duration-fast) var(--ease-standard),
      opacity var(--duration-fast) var(--ease-standard),
      transform var(--duration-fast) var(--ease-standard),
      box-shadow var(--duration-fast) var(--ease-standard);
    min-height: 44px; /* Accessibility: touch target */
  }

  .compact .toggle-option {
    padding: 8px 10px;
    min-height: 40px; /* Compact but still accessible */
    gap: 4px;
  }

  .toggle-option:hover:not(:disabled) {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
    color: var(--theme-text, #ffffff);
  }

  .toggle-option:active:not(:disabled) {
    transform: scale(0.97);
  }

  /* Selected states */
  .toggle-option.selected.inherit {
    background: color-mix(
      in srgb,
      var(--theme-text-dim, #9ca3af) 20%,
      transparent
    );
    color: var(--theme-text-dim, #9ca3af);
  }

  .toggle-option.selected.inherit.resolves-granted {
    background: color-mix(
      in srgb,
      var(--semantic-success, #10b981) 15%,
      transparent
    );
    color: var(--semantic-success, #34d399);
  }

  .toggle-option.selected.inherit.resolves-denied {
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 10%,
      transparent
    );
    color: var(--semantic-error, #fca5a5);
  }

  .toggle-option.selected.grant {
    background: color-mix(
      in srgb,
      var(--semantic-success, #10b981) 20%,
      transparent
    );
    color: var(--semantic-success, #34d399);
    box-shadow: 0 0 0 1px
      color-mix(in srgb, var(--semantic-success, #10b981) 30%, transparent);
  }

  .toggle-option.selected.deny {
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 20%,
      transparent
    );
    color: var(--semantic-error, #f87171);
    box-shadow: 0 0 0 1px
      color-mix(in srgb, var(--semantic-error, #ef4444) 30%, transparent);
  }

  .toggle-option i {
    font-size: var(--font-size-sm, 14px);
  }

  .label {
    white-space: nowrap;
  }

  .resolve-hint {
    font-size: var(--font-size-compact, 12px);
    padding: 2px 5px;
    border-radius: 4px;
    font-weight: 600;
  }

  .resolve-hint.granted {
    background: color-mix(
      in srgb,
      var(--semantic-success, #10b981) 20%,
      transparent
    );
    color: var(--semantic-success, #34d399);
  }

  .resolve-hint.denied {
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 15%,
      transparent
    );
    color: var(--semantic-error, #fca5a5);
  }

  /* Responsive - stack vertically on very small screens */
  @media (max-width: 360px) {
    .three-state-toggle:not(.compact) {
      flex-direction: column;
    }

    .toggle-option {
      justify-content: flex-start;
    }
  }
</style>
