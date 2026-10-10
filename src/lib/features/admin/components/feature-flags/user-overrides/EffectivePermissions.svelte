<script lang="ts">
  /**
   * EffectivePermissions
   * Live preview of what the user will be able to access
   * Updates in real-time as overrides change
   */

  import type {
    FeatureFlagConfig,
    FeatureId,
  } from "#lib/shared/auth/domain/models/feature-flag.js";
  import type { UserRole } from "#lib/shared/auth/domain/models/user-role.js";
  import {
    type OverrideState,
    calculateEffectiveAccess,
    buildOverridesFromStates,
    getFeatureIconAndColor,
  } from "../shared/feature-utils";

  interface Props {
    featureFlags: FeatureFlagConfig[];
    userRole: UserRole;
    overrideStates: Map<FeatureId, OverrideState>;
  }

  let { featureFlags, userRole, overrideStates }: Props = $props();

  // Calculate effective access for all features
  const effectiveAccess = $derived(() => {
    const overrides = buildOverridesFromStates(overrideStates);
    const accessible: FeatureFlagConfig[] = [];
    const blocked: FeatureFlagConfig[] = [];

    for (const flag of featureFlags) {
      // Only show modules and capabilities in summary (not individual tabs)
      if (flag.category === "tab") continue;

      const access = calculateEffectiveAccess(flag, userRole, overrides);
      if (access.hasAccess) {
        accessible.push(flag);
      } else {
        blocked.push(flag);
      }
    }

    return { accessible, blocked };
  });

  let showAll = $state(false);
  const displayLimit = 8;
</script>

<div class="effective-permissions">
  <div class="permissions-header">
    <h4>
      <i class="fas fa-eye" aria-hidden="true"></i>
      Effective Access Preview
    </h4>
    <span class="access-summary">
      {effectiveAccess().accessible.length} accessible,
      {effectiveAccess().blocked.length} blocked
    </span>
  </div>

  <div class="permissions-content">
    <!-- Accessible features -->
    <div class="permission-group accessible">
      <div class="group-label">
        <i class="fas fa-check-circle" aria-hidden="true"></i>
        Can Access
      </div>
      <div class="feature-chips">
        {#each effectiveAccess().accessible.slice(0, showAll ? undefined : displayLimit) as flag}
          {@const style = getFeatureIconAndColor(flag.id)}
          <span class="feature-chip" style="--chip-color: {style.color}">
            <i class="fas {style.icon}" aria-hidden="true"></i>
            {flag.name}
          </span>
        {/each}
        {#if !showAll && effectiveAccess().accessible.length > displayLimit}
          <button
            type="button"
            class="show-more"
            onclick={() => (showAll = true)}
          >
            +{effectiveAccess().accessible.length - displayLimit} more
          </button>
        {/if}
        {#if effectiveAccess().accessible.length === 0}
          <span class="no-features">No features accessible</span>
        {/if}
      </div>
    </div>

    <!-- Blocked features -->
    <div class="permission-group blocked">
      <div class="group-label">
        <i class="fas fa-times-circle" aria-hidden="true"></i>
        Blocked
      </div>
      <div class="feature-chips">
        {#each effectiveAccess().blocked.slice(0, showAll ? undefined : displayLimit) as flag}
          {@const style = getFeatureIconAndColor(flag.id)}
          <span class="feature-chip blocked" style="--chip-color: {style.color}">
            <i class="fas {style.icon}" aria-hidden="true"></i>
            {flag.name}
          </span>
        {/each}
        {#if !showAll && effectiveAccess().blocked.length > displayLimit}
          <button
            type="button"
            class="show-more"
            onclick={() => (showAll = true)}
          >
            +{effectiveAccess().blocked.length - displayLimit} more
          </button>
        {/if}
        {#if effectiveAccess().blocked.length === 0}
          <span class="no-features all-access">Full access to everything!</span>
        {/if}
      </div>
    </div>
  </div>
</div>

<style>
  .effective-permissions {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    border-radius: 12px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    overflow: hidden;
  }

  .permissions-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 14px;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
  }

  .permissions-header h4 {
    margin: 0;
    font-size: var(--font-size-sm, 14px);
    font-weight: 600;
    color: var(--theme-text, #ffffff);
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .permissions-header h4 i {
    color: #3b82f6;
  }

  .access-summary {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
  }

  .permissions-content {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px 14px;
  }

  .permission-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .group-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
  }

  .permission-group.accessible .group-label {
    color: #34d399;
  }

  .permission-group.blocked .group-label {
    color: #f87171;
  }

  .feature-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .feature-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 4px 10px;
    border-radius: 6px;
    background: color-mix(in srgb, var(--chip-color, #6b7280) 12%, transparent);
    color: var(--chip-color, #6b7280);
    font-size: var(--font-size-compact, 12px);
    font-weight: 500;
  }

  .feature-chip.blocked {
    opacity: 0.5;
    text-decoration: line-through;
  }

  .feature-chip i {
    font-size: 10px;
  }

  .show-more {
    padding: 4px 10px;
    border: 1px dashed var(--theme-stroke, rgba(255, 255, 255, 0.2));
    border-radius: 6px;
    background: transparent;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    font-size: var(--font-size-compact, 12px);
    cursor: pointer;
    transition: all var(--duration-fast) ease;
  }

  .show-more:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.06));
    color: var(--theme-text, #ffffff);
  }

  .no-features {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
    font-style: italic;
  }

  .no-features.all-access {
    color: #34d399;
    font-style: normal;
    font-weight: 500;
  }
</style>
