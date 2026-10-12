<!--
SettingsDrillRow.svelte — one row of a SettingsDrillPanel root list.

Setting name on top, its current value below, chevron on the right. Tapping
drills into that setting's detail screen.

Two lines rather than label-left/value-right: values here run from "Any" to
"Props: Choppy · Hands: Smooth · Dashes: High", and the long one does not fit
beside its label in a ~560px column. On its own line it gets the row's full
width at every size.

No ghost sizer needed (no-layout-shift.md): the row's height comes from two
fixed-size text lines and the value is clipped to one line, so no value can
change the row's box or move the rows below it.
-->
<script lang="ts">
  let {
    label,
    value,
    disabled = false,
    disabledReason = "",
    onclick,
  }: {
    label: string;
    value: string;
    disabled?: boolean;
    disabledReason?: string;
    onclick: () => void;
  } = $props();
</script>

<button
  class="drill-row"
  class:is-disabled={disabled}
  type="button"
  onclick={() => onclick()}
>
  <span class="row-text">
    <span class="row-label">{label}</span>
    {#if disabled}
      <span class="row-reason">{disabledReason}</span>
    {:else}
      <span class="row-value">{value}</span>
    {/if}
  </span>

  {#if disabled}
    <span class="row-lock" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path
          d="M12 17a2 2 0 002-2v-2a2 2 0 00-4 0v2a2 2 0 002 2zm6-9h-1V6a5 5 0 00-10 0v2H6a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V10a2 2 0 00-2-2zM8.9 6a3.1 3.1 0 016.2 0v2H8.9V6z"
        />
      </svg>
    </span>
  {:else}
    <svg
      class="row-chevron"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      aria-hidden="true"
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  {/if}
</button>

<style>
  .drill-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    min-height: var(--min-touch-target);
    padding: 0.875rem 1rem;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    border-radius: 0.75rem;
    color: white;
    font-family: inherit;
    text-align: left;
    cursor: pointer;
    transition:
      background var(--duration-normal) var(--ease-standard),
      border-color var(--duration-normal) var(--ease-standard);
  }

  .drill-row:hover:not(.is-disabled) {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.1));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
  }

  .drill-row:active:not(.is-disabled) {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.14));
  }

  .drill-row.is-disabled {
    cursor: default;
    opacity: 0.55;
  }

  .row-text {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .row-label {
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: rgba(255, 255, 255, 0.5);
  }

  /* One line, clipped. A value can never change the row's height, so it can
     never move the rows below it. */
  .row-value,
  .row-reason {
    font-size: var(--font-size-sm, 14px);
    font-weight: 600;
    color: rgba(255, 255, 255, 0.92);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .row-reason {
    font-weight: 500;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
  }

  .row-lock {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    border-radius: 50%;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.1));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
  }

  .row-lock svg {
    width: 0.875rem;
    height: 0.875rem;
  }

  .row-chevron {
    flex: 0 0 auto;
    width: 1rem;
    height: 1rem;
    opacity: 0.45;
  }

  @media (prefers-reduced-motion: reduce) {
    .drill-row {
      transition: none;
    }
  }
</style>
