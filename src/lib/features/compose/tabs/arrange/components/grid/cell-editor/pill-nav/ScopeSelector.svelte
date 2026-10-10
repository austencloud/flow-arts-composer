<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import type { PillId } from "#lib/shared/animation-panel/pill-nav/pill-types.js";
  import {
    type ScopeLevel,
    PILL_SCOPE_CONFIG,
  } from "../state/cell-editor-panel-state.svelte";

  let {
    activePill,
    scopeLevel,
    layerCount = 1,
    echoActive = false,
    onScopeChange,
  }: {
    activePill: PillId;
    scopeLevel: ScopeLevel;
    layerCount?: number;
    echoActive?: boolean;
    onScopeChange: (scope: ScopeLevel) => void;
  } = $props();

  const pillConfig = $derived(
    PILL_SCOPE_CONFIG.find((p) => p.id === activePill)!
  );
  const availableScopes = $derived.by(() => {
    let scopes = pillConfig.scopes;
    if (layerCount <= 1) scopes = scopes.filter((s) => s !== "layer");
    if (echoActive) scopes = scopes.filter((s) => s !== "tip");
    return scopes;
  });
  const hasScopes = $derived(availableScopes.length > 0);

  const SCOPE_ICONS: Record<ScopeLevel, string> = {
    grid: "fa-grid",
    cell: "fa-border-all",
    layer: "fa-layer-group",
    hand: "fa-hand",
    tip: "fa-circle-plus",
  };

  const SCOPE_LABELS: Record<ScopeLevel, string> = {
    grid: "Grid",
    cell: "Cell",
    layer: "Layer",
    hand: "Hand",
    tip: "Tip",
  };
</script>

{#if hasScopes}
  <div class="scope-row">
    <span class="scope-label">{t("compose_ui_scope")}</span>
    <div
      class="scope-segments"
      role="radiogroup"
      aria-label={t("compose_ui_scope_level")}
    >
      {#each availableScopes as scope (scope)}
        <button
          class="scope-seg"
          class:active={scopeLevel === scope}
          role="radio"
          aria-checked={scopeLevel === scope}
          onclick={() => onScopeChange(scope)}
        >
          <i class="fas {SCOPE_ICONS[scope]}" aria-hidden="true"></i>
          {SCOPE_LABELS[scope]}
        </button>
      {/each}
    </div>
  </div>
{/if}

<style>
  .scope-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .scope-label {
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: rgba(255, 255, 255, 0.7);
    flex-shrink: 0;
  }

  .scope-segments {
    display: flex;
    flex: 1;
    background: var(--surface-idle, rgba(255, 255, 255, 0.03));
    border: 1px solid var(--stroke-idle, rgba(255, 255, 255, 0.06));
    border-radius: 8px;
    overflow: hidden;
  }

  .scope-seg {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    min-height: 44px;
    padding: 6px 4px;
    font-size: 12px;
    color: rgba(255, 255, 255, 0.7);
    border-right: 1px solid var(--stroke-idle, rgba(255, 255, 255, 0.06));
    cursor: pointer;
    transition:
      background 150ms ease,
      color 150ms ease;
  }

  .scope-seg:last-child {
    border-right: none;
  }

  .scope-seg.active {
    background: color-mix(
      in srgb,
      var(--theme-accent, #8b5cf6) 15%,
      transparent
    );
    color: var(--theme-accent, #8b5cf6);
    box-shadow: inset 0 -2px 0 var(--theme-accent, #a855f7);
  }

  .scope-seg i {
    font-size: 12px;
  }

  @media (prefers-reduced-motion: reduce) {
    .scope-seg {
      transition: none;
    }
  }
</style>
