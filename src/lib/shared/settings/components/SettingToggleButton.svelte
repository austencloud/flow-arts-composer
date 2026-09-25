<!--
  SettingToggleButton — canonical binary setting control.

  The whole row is the target. A circle/check mark and visible state word make
  the result explicit without borrowing the sliding switch treatment from a
  particular operating system.
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte";
  interface Props {
    label: string;
    description?: string;
    checked?: boolean;
    busy?: boolean;
    disabled?: boolean;
    onToggle: (event: MouseEvent) => void;
    onLabel?: string;
    offLabel?: string;
    ariaLabel?: string;
    surface?: "plain" | "card" | "inset";
    density?: "compact" | "comfortable";
  }

  let {
    label,
    description,
    checked = false,
    busy = false,
    disabled = false,
    onToggle,
    onLabel,
    offLabel,
    ariaLabel,
    surface = "plain",
    density = "comfortable",
  }: Props = $props();

  const stateLabel = $derived(checked ? (onLabel ?? t("settings_on")) : (offLabel ?? t("settings_off")));
</script>

<button
  type="button"
  class="setting-toggle"
  class:active={checked}
  class:card-surface={surface !== "plain"}
  class:inset-surface={surface === "inset"}
  class:compact={density === "compact"}
  role="switch"
  aria-checked={checked}
  aria-label={ariaLabel ?? label}
  aria-busy={busy}
  {disabled}
  onclick={onToggle}
>
  <span class="state-mark" aria-hidden="true">
    <i
      class={busy
        ? "fas fa-circle-notch fa-spin"
        : checked
          ? "fas fa-circle-check"
          : "far fa-circle"}
    ></i>
  </span>

  <span class="setting-copy">
    <span class="setting-label">{label}</span>
    {#if description}
      <span class="setting-description">{description}</span>
    {/if}
  </span>

  <span class="state-word" aria-hidden="true">{stateLabel}</span>
</button>

<style>
  .setting-toggle {
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
    transition:
      background var(--duration-fast) ease,
      border-color var(--duration-fast) ease,
      color var(--duration-fast) ease;
    -webkit-tap-highlight-color: transparent;
  }

  .setting-toggle.card-surface {
    border: 1px solid var(--theme-stroke);
    border-radius: 0.75em;
    background: var(--theme-card-bg);
  }

  .setting-toggle.inset-surface {
    background: var(--surface-inset, var(--theme-card-bg));
  }

  .setting-toggle.compact {
    min-height: var(--min-touch-target);
    padding-block: 0.35em;
  }

  .setting-toggle.compact .state-mark {
    width: 1.7em;
    height: 1.7em;
  }

  .setting-toggle:hover:not(:disabled) {
    background: var(--theme-card-hover-bg);
  }

  .setting-toggle.active {
    background: color-mix(
      in srgb,
      var(--theme-accent) 12%,
      var(--theme-card-bg)
    );
  }

  .setting-toggle.card-surface.active {
    border-color: color-mix(
      in srgb,
      var(--theme-accent) 62%,
      var(--theme-stroke)
    );
  }

  .setting-toggle:focus-visible {
    position: relative;
    z-index: 1;
    outline: 2px solid var(--theme-accent);
    outline-offset: -2px;
  }

  .setting-toggle:disabled {
    cursor: not-allowed;
    opacity: 0.48;
  }

  .setting-toggle[aria-busy="true"] {
    cursor: wait;
    opacity: 0.68;
  }

  .state-mark {
    display: grid;
    width: 2em;
    height: 2em;
    place-items: center;
    border-radius: 50%;
    color: var(--theme-text-dim);
    background: color-mix(in srgb, var(--theme-text) 4%, transparent);
    font-size: max(1rem, var(--font-size-base));
    transition:
      color var(--duration-fast) ease,
      background var(--duration-fast) ease,
      transform var(--duration-fast) ease;
  }

  .setting-toggle.active .state-mark {
    color: var(--theme-text-on-accent, #fff);
    background: color-mix(
      in srgb,
      var(--theme-accent) 82%,
      var(--theme-card-bg)
    );
  }

  .setting-toggle:active:not(:disabled) .state-mark {
    transform: scale(0.92);
  }

  .setting-copy {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 0.18em;
  }

  .setting-label {
    color: var(--theme-text);
    font-size: max(0.875rem, var(--font-size-sm));
    font-weight: 675;
    line-height: 1.25;
  }

  .setting-description {
    color: var(--theme-text-dim);
    font-size: max(0.75rem, var(--font-size-compact));
    line-height: 1.38;
  }

  .state-word {
    min-width: 2.25em;
    color: var(--theme-text-dim);
    font-size: max(0.875rem, var(--font-size-sm));
    font-weight: 750;
    line-height: 1;
    text-align: right;
  }

  .setting-toggle.active .state-word {
    color: var(--theme-accent-text, var(--theme-accent));
  }

  @media (prefers-reduced-motion: reduce) {
    .setting-toggle,
    .state-mark {
      transition: none;
    }
  }

  @media (prefers-contrast: more) {
    .setting-toggle.card-surface {
      border-width: 2px;
    }
  }
</style>
