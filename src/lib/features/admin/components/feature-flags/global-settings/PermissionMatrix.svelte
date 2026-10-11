<script lang="ts">
  /**
   * PermissionMatrix
   * Matrix view showing Features x Roles with inline editing
   * Modules are collapsible to show/hide their tabs
   */

  import type { FeatureFlagConfig } from "#lib/shared/auth/domain/models/feature-flag.js";
  import type { UserRole } from "#lib/shared/auth/domain/models/user-role.js";
  import { ROLE_HIERARCHY, ROLE_DISPLAY } from "#lib/shared/auth/domain/models/user-role.js";
  import { featureFlagService, featureFlagState } from "#lib/shared/auth/services/post-hog-feature-flag-service.svelte.js";
  import { toast } from "#lib/shared/toast/state/toast-state.svelte.js";
  import {
    buildFeatureHierarchy,
    getFeatureIconAndColor,
    getRoleColor,
  } from "../shared/feature-utils";
  import { authedFetch } from "#lib/shared/auth/services/authed-fetch.js";
  import AdminSearchBox from "#lib/shared/admin/components/AdminSearchBox.svelte";
  import MatrixRow from "./MatrixRow.svelte";
  import ModuleQuickBar from "./ModuleQuickBar.svelte";

  interface Props {
    onError: (message: string) => void;
  }

  let { onError }: Props = $props();

  let searchQuery = $state("");
  let savingFlags = $state<Set<string>>(new Set());
  let migrating = $state(false);
  let migrationResult = $state<{ migrated: number; total: number } | null>(null);

  async function migrateDeactivatedFlags() {
    migrating = true;
    migrationResult = null;
    try {
      const response = await authedFetch("/api/admin/feature-flags", {
        method: "POST",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const reason =
          errorData.firebaseCode === "auth/id-token-expired" || response.status === 401
            ? "Session expired — sign in again"
            : errorData.message || `HTTP ${response.status}`;
        throw new Error(reason);
      }

      const result = await response.json();
      migrationResult = { migrated: result.migrated, total: result.total };

      if (result.migrated > 0) {
        toast.success(`Migrated ${result.migrated} deactivated flag(s) to 0% rollout`);
      } else {
        toast.success("No deactivated flags found. All flags are healthy.");
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      toast.error(`Migration failed: ${msg}`);
      onError(`Migration failed: ${msg}`);
    } finally {
      migrating = false;
    }
  }

  // Get flags from service - explicitly track flagsVersion for reactivity
  // when flags are changed from ModuleQuickToggle (Manage Modules modal)
  const featureFlags = $derived.by(() => {
    const _version = featureFlagState.flagsVersion;
    return featureFlagService.featureConfigs;
  });

  // Build hierarchy and filter
  const hierarchy = $derived(buildFeatureHierarchy(featureFlags));

  const filteredModules = $derived.by(() => {
    if (!searchQuery.trim()) return hierarchy.modules;
    const q = searchQuery.toLowerCase();
    return hierarchy.modules.filter((m) => {
      const moduleMatches =
        m.module.name.toLowerCase().includes(q) ||
        m.module.description.toLowerCase().includes(q);
      const tabMatches = m.tabs.some(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q)
      );
      return moduleMatches || tabMatches;
    });
  });

  const filteredCapabilities = $derived.by(() => {
    if (!searchQuery.trim()) return hierarchy.capabilities;
    const q = searchQuery.toLowerCase();
    return hierarchy.capabilities.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q)
    );
  });

  async function updateFlag(
    flag: FeatureFlagConfig,
    updates: Partial<Pick<FeatureFlagConfig, "minimumRole" | "enabled">>
  ) {
    savingFlags = new Set([...savingFlags, flag.id]);
    try {
      const result = await featureFlagService.updateGlobalFeatureFlag(flag.id, updates);

      // Show success toast based on action type
      if (result.action === "created") {
        // New flag created - show with dashboard link
        const message = result.dashboardUrl
          ? `${flag.name} created. View in PostHog →`
          : `${flag.name} created with 100% rollout`;
        toast.success(message, 4000);

        // Open PostHog dashboard if available (optional - could make this a click action)
        // PostHog dashboard URL available in result.dashboardUrl if needed
      } else if (result.action === "updated") {
        // Existing flag toggled
        const newState = updates.enabled ? "enabled" : "disabled";
        toast.success(`${flag.name} ${newState}`, 2000);
      } else if (result.action === "role_updated") {
        // Role changed
        toast.success(`${flag.name} role updated to ${updates.minimumRole}`, 2000);
      }
    } catch (error) {
      console.error("Failed to update flag:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      toast.error(`Failed to update ${flag.name}: ${errorMessage}`);
      onError(`Failed to update ${flag.name}`);
    } finally {
      savingFlags = new Set([...savingFlags].filter((id) => id !== flag.id));
    }
  }

  function handleRoleClick(flag: FeatureFlagConfig, role: UserRole) {
    updateFlag(flag, { minimumRole: role });
  }

  function handleEnabledToggle(flag: FeatureFlagConfig) {
    updateFlag(flag, { enabled: !flag.enabled });
  }

  // Core modules that cannot be disabled
  const coreModuleIds = ["module:admin", "module:settings"];
</script>

<div class="permission-matrix">
  <div class="matrix-header">
    <div class="header-content">
      <h3>Permission Matrix</h3>
      <p>Use chips above to toggle modules. Click role cells below to set minimum access level for tabs.</p>
    </div>
    <div class="header-actions">
      <div class="search-box">
        <AdminSearchBox
          value={searchQuery}
          placeholder="Filter features..."
          oninput={(e) => (searchQuery = (e.target as HTMLInputElement).value)}
        />
      </div>
      <button
        class="migrate-btn"
        onclick={migrateDeactivatedFlags}
        disabled={migrating}
        title="Fix deactivated PostHog flags by reactivating them with 0% rollout"
      >
        {#if migrating}
          <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
          Migrating...
        {:else}
          <i class="fas fa-wrench" aria-hidden="true"></i>
          Fix Flags
        {/if}
      </button>
    </div>
  </div>

  <!-- Quick toggle bar for modules (excludes core modules that can't be disabled) -->
  <ModuleQuickBar
    modules={filteredModules.map(m => m.module).filter(m => !coreModuleIds.includes(m.id))}
    {savingFlags}
    onToggle={handleEnabledToggle}
  />

  <div class="matrix-container themed-scrollbar">
    <!-- Role headers -->
    <div class="matrix-row header-row">
      <div class="feature-cell header-cell">Tab</div>
      {#each ROLE_HIERARCHY as role}
        <div class="role-cell header-cell" style="--role-color: {getRoleColor(role)}">
          <i class="fas {ROLE_DISPLAY[role].icon}" aria-hidden="true"></i>
          <span>{ROLE_DISPLAY[role].label}</span>
        </div>
      {/each}
      <div class="toggle-cell header-cell">Enabled</div>
    </div>

    <!-- Modules with their tabs (always expanded) -->
    {#each filteredModules as { module, tabs }}
      {@const moduleStyle = getFeatureIconAndColor(module.id)}
      {@const hasTabs = tabs.length > 0}

      {#if hasTabs}
        <div class="module-group" class:disabled={!module.enabled} style="--module-color: {moduleStyle.color}">
          <div class="module-header">
            <div class="module-icon" style="background: {moduleStyle.color}25; color: {moduleStyle.color}">
              <i class="fas {moduleStyle.icon}" aria-hidden="true"></i>
            </div>
            <span class="module-name">{module.name}</span>
          </div>

          <div class="tabs-container">
            {#each tabs as tab}
              <MatrixRow
                flag={tab}
                parentRole={module.minimumRole}
                saving={savingFlags.has(tab.id)}
                toggleLocked={tab.id === "tab:admin:flags"}
                toggleLockedReason="Cannot disable Feature Flags tab while using it"
                onRoleClick={(role) => handleRoleClick(tab, role)}
                onToggle={() => handleEnabledToggle(tab)}
              />
            {/each}
          </div>
        </div>
      {/if}
    {/each}

    <!-- Capabilities section -->
    {#if filteredCapabilities.length > 0}
      <div class="section-divider">
        <span><i class="fas fa-wand-magic-sparkles" aria-hidden="true"></i> Capabilities</span>
      </div>
      {#each filteredCapabilities as capability}
        <MatrixRow
          flag={capability}
          saving={savingFlags.has(capability.id)}
          onRoleClick={(role) => handleRoleClick(capability, role)}
          onToggle={() => handleEnabledToggle(capability)}
        />
      {/each}
    {/if}
  </div>
</div>

<style>
  .permission-matrix {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  .matrix-header {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
  }

  @media (min-width: 600px) {
    .matrix-header {
      flex-direction: row;
      align-items: flex-start;
      justify-content: space-between;
      padding: 20px 24px;
    }
  }

  .header-content h3 {
    margin: 0 0 4px 0;
    font-size: var(--font-size-lg, 18px);
    font-weight: 600;
    color: var(--theme-text, #ffffff);
  }

  .header-content p {
    margin: 0;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
  }

  .header-actions {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  @media (min-width: 500px) {
    .header-actions {
      flex-direction: row;
      align-items: center;
    }
  }

  .search-box {
    min-width: 280px;
  }

  .migrate-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    min-height: var(--min-touch-target, 48px);
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 24px;
    background: transparent;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-size: var(--font-size-compact, 12px);
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.15s ease;
  }

  .migrate-btn:hover:not(:disabled) {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.06));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.15));
    color: var(--theme-text, #ffffff);
  }

  .migrate-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Override AdminSearchBox to match pill style */
  .search-box :global(.admin-search-box) {
    border-radius: 24px;
    min-height: var(--min-touch-target, 48px);
  }

  .search-box :global(.search-input) {
    border-radius: 24px;
  }

  .matrix-container {
    flex: 1;
    overflow: auto;
    padding: 12px;
  }

  @media (min-width: 600px) {
    .matrix-container {
      padding: 16px 24px;
    }
  }

  .matrix-row {
    display: grid;
    /* 6 columns: icon/Tab | USER | PREM | TEST | ADMIN | toggle */
    grid-template-columns: 40px repeat(4, 1fr) 48px;
    gap: 4px;
    align-items: center;
    min-height: 44px;
    padding: 0 8px;
  }

  @media (min-width: 700px) {
    .matrix-row {
      grid-template-columns: 1fr repeat(4, 80px) 64px;
      gap: 8px;
      padding: 0 12px;
    }
  }

  .matrix-row.header-row {
    position: sticky;
    top: 0;
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    z-index: 10;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    padding-bottom: 8px;
    margin-bottom: 8px;
  }

  .header-cell {
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    text-align: center;
    padding: 8px 4px;
  }

  .header-cell.feature-cell {
    text-align: left;
    visibility: hidden; /* Hidden on mobile, just show icon column */
  }

  @media (min-width: 700px) {
    .header-cell.feature-cell {
      visibility: visible;
    }
  }

  .role-cell.header-cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    color: var(--role-color);
  }

  .role-cell.header-cell i {
    font-size: var(--font-size-sm, 14px);
  }

  .role-cell.header-cell span {
    font-size: var(--font-size-compact, 12px);
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  @media (max-width: 500px) {
    .role-cell.header-cell span {
      display: none;
    }
  }

  .section-divider {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 16px 0 8px;
    margin-top: 8px;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
  }

  .section-divider span {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: var(--font-size-sm, 14px);
    font-weight: 600;
    color: #f59e0b;
  }

  /* Module groups */
  .module-group {
    border-radius: 12px;
    margin-bottom: 12px;
    overflow: hidden;
    border-left: 3px solid var(--module-color, var(--theme-stroke));
    background: color-mix(in srgb, var(--module-color) 8%, rgba(0, 0, 0, 0.4));
  }

  .module-group.disabled {
    opacity: 0.5;
  }

  .module-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 16px;
    border-bottom: 1px solid color-mix(in srgb, var(--module-color) 20%, transparent);
    background: color-mix(in srgb, var(--module-color) 12%, transparent);
  }

  .module-header .module-icon {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    font-size: 13px;
    flex-shrink: 0;
  }

  .module-header .module-name {
    font-size: var(--font-size-sm, 14px);
    font-weight: 600;
    color: var(--theme-text, #ffffff);
  }

  .tabs-container {
    padding: 8px 4px 12px 4px;
  }
</style>
