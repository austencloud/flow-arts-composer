<!--
  PropCycleControl.svelte

  Shared three-part control used for discrete prop values: previous, current,
  and next. Color is inherited from the surrounding PropControlPair card.
-->
<script lang="ts">
  interface Props {
    valueLabel: string;
    previousLabel: string;
    nextLabel: string;
    selectLabel: string;
    iconClass?: string;
    active?: boolean;
    disabled?: boolean;
    compact?: boolean;
    onPrevious: () => void;
    onNext: () => void;
    onSelect: () => void;
  }

  let {
    valueLabel,
    previousLabel,
    nextLabel,
    selectLabel,
    iconClass,
    active,
    disabled = false,
    compact = false,
    onPrevious,
    onNext,
    onSelect,
  }: Props = $props();

  function activate(event: MouseEvent, callback: () => void) {
    event.stopPropagation();
    callback();
  }
</script>

<div class="cycle-control" class:compact>
  <button
    type="button"
    class="arrow-button"
    aria-label={previousLabel}
    {disabled}
    onclick={(event) => activate(event, onPrevious)}
  >
    <i class="fas fa-chevron-left" aria-hidden="true"></i>
  </button>

  <button
    type="button"
    class="value-button"
    class:active={active === true}
    aria-label={selectLabel}
    aria-pressed={active}
    {disabled}
    onclick={(event) => activate(event, onSelect)}
  >
    {#if iconClass}
      <i class="fas {iconClass}" aria-hidden="true"></i>
    {/if}
    <span>{valueLabel}</span>
  </button>

  <button
    type="button"
    class="arrow-button"
    aria-label={nextLabel}
    {disabled}
    onclick={(event) => activate(event, onNext)}
  >
    <i class="fas fa-chevron-right" aria-hidden="true"></i>
  </button>
</div>

<style>
  .cycle-control {
    display: grid;
    grid-template-columns: var(
      --prop-cycle-columns,
      var(--min-touch-target, 44px) minmax(76px, 1fr)
        var(--min-touch-target, 44px)
    );
    align-items: center;
    gap: var(--prop-cycle-gap, 8px);
    width: 100%;
  }

  .cycle-control.compact {
    grid-template-columns: var(
      --prop-cycle-compact-columns,
      var(--min-touch-target, 44px) minmax(64px, 1fr)
        var(--min-touch-target, 44px)
    );
    gap: var(--prop-cycle-compact-gap, 6px);
  }

  button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
    border: 1px solid rgba(var(--prop-color-rgb, 59, 130, 246), 0.4);
    border-radius: 10px;
    background: rgba(var(--prop-color-rgb, 59, 130, 246), 0.18);
    color: color-mix(in srgb, var(--prop-color, #60a5fa) 64%, white);
    cursor: pointer;
    transition:
      background var(--duration-fast) var(--ease-standard),
      border-color var(--duration-fast) var(--ease-standard),
      box-shadow var(--duration-fast) var(--ease-standard),
      color var(--duration-fast) var(--ease-standard),
      transform var(--duration-fast) var(--ease-standard);
  }

  button:hover:not(:disabled) {
    border-color: rgba(var(--prop-color-rgb, 59, 130, 246), 0.65);
    background: rgba(var(--prop-color-rgb, 59, 130, 246), 0.3);
    color: var(--theme-text, #fff);
    box-shadow: 0 2px 10px rgba(var(--prop-color-rgb, 59, 130, 246), 0.24);
  }

  button:active:not(:disabled) {
    transform: scale(0.96);
  }

  button:focus-visible {
    outline: 2px solid var(--theme-accent, #8b6cff);
    outline-offset: 2px;
  }

  button:disabled {
    cursor: not-allowed;
    opacity: 0.42;
  }

  .arrow-button i {
    font-size: 1rem;
  }

  .value-button {
    gap: var(--prop-cycle-value-gap, 8px);
    width: 100%;
    padding-inline: var(--prop-cycle-value-padding, 12px);
    background: rgba(var(--prop-color-rgb, 59, 130, 246), 0.13);
  }

  .value-button i {
    font-size: 1.15rem;
  }

  .value-button span {
    min-width: 0;
    overflow: hidden;
    font-size: var(--font-size-min, 14px);
    font-weight: 700;
    letter-spacing: 0.04em;
    text-overflow: ellipsis;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .value-button.active {
    border-color: rgba(var(--prop-color-rgb, 59, 130, 246), 0.9);
    background: rgba(var(--prop-color-rgb, 59, 130, 246), 0.34);
    color: var(--theme-text, #fff);
    box-shadow:
      0 0 0 2px rgba(var(--prop-color-rgb, 59, 130, 246), 0.28),
      0 3px 12px rgba(var(--prop-color-rgb, 59, 130, 246), 0.24);
  }

  @container step-editor (min-width: 64em) and (min-height: 560px) {
    .cycle-control {
      grid-template-columns: 3.25rem minmax(88px, 1fr) 3.25rem;
    }

    button {
      height: 3.25rem;
    }

    .value-button span {
      font-size: 1rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    button {
      transition: none;
    }

    button:active:not(:disabled) {
      transform: none;
    }
  }
</style>
