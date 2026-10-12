<script lang="ts">
  /**
   * ParamPanel
   *
   * Collapsible section wrapper for a group of scene params.
   * Optionally shows a pill-switch toggle when `enabled` is provided.
   */

  import { untrack, type Snippet } from "svelte";

  interface Props {
    title: string;
    defaultOpen?: boolean;
    enabled?: boolean;
    onToggle?: (v: boolean) => void;
    children: Snippet;
  }

  let {
    title,
    defaultOpen = true,
    enabled = undefined,
    onToggle,
    children,
  }: Props = $props();

  let open = $state(untrack(() => defaultOpen));

  const hasToggle = $derived(enabled !== undefined);
  const isEnabled = $derived(enabled ?? true);
</script>

<div
  class="param-panel"
  class:open={open && isEnabled}
  class:disabled={!isEnabled}
>
  <div class="panel-header">
    <button
      class="header-label"
      onclick={() => {
        if (isEnabled) open = !open;
      }}
      disabled={!isEnabled}
    >
      {#if isEnabled}
        <span class="chevron" class:rotated={open}>▸</span>
      {/if}
      <span class="title">{title}</span>
    </button>

    {#if hasToggle}
      <button
        class="toggle-pill"
        class:on={isEnabled}
        aria-pressed={isEnabled}
        aria-label="Toggle {title}"
        onclick={() => onToggle?.(!isEnabled)}
      >
        <span class="toggle-knob"></span>
      </button>
    {/if}
  </div>
  {#if open && isEnabled}
    <div class="panel-body">
      {@render children()}
    </div>
  {/if}
</div>

<style>
  .param-panel {
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
  }

  .param-panel.disabled {
    opacity: 0.4;
  }

  .panel-header {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 10px 0;
  }

  .header-label {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    background: none;
    border: none;
    color: var(--theme-text, white);
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    cursor: pointer;
    text-align: left;
    padding: 0;
    min-height: 0;
    min-width: 0;
  }

  .header-label:disabled {
    cursor: default;
  }

  .header-label:not(:disabled):hover .title {
    color: var(--theme-accent, #38bdf8);
  }

  .chevron {
    display: inline-block;
    font-size: 10px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    transition: transform var(--duration-fast) var(--ease-standard);
  }

  .chevron.rotated {
    transform: rotate(90deg);
  }

  .title {
    flex: 1;
    transition: color var(--duration-fast) var(--ease-standard);
  }

  .toggle-pill {
    position: relative;
    width: 32px;
    height: 18px;
    min-height: 0;
    min-width: 0;
    border-radius: 9px;
    border: none;
    background: rgba(255, 255, 255, 0.12);
    cursor: pointer;
    transition: background var(--duration-fast) var(--ease-standard);
    flex-shrink: 0;
    padding: 0;
  }

  .toggle-pill.on {
    background: var(--theme-accent, #38bdf8);
  }

  .toggle-knob {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: white;
    transition: transform var(--duration-fast) var(--ease-standard);
  }

  .toggle-pill.on .toggle-knob {
    transform: translateX(14px);
  }

  .toggle-pill:focus-visible {
    outline: 2px solid var(--theme-accent, #38bdf8);
    outline-offset: 2px;
  }

  .panel-body {
    padding: 4px 0 12px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
</style>
