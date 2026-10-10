<script lang="ts">
  /**
   * MatrixRow
   * A single row in the permission matrix (for tabs)
   */

  import type { FeatureFlagConfig } from "#lib/shared/auth/domain/models/feature-flag.js";
  import type { UserRole } from "#lib/shared/auth/domain/models/user-role.js";
  import { ROLE_HIERARCHY, hasRolePrivilege } from "#lib/shared/auth/domain/models/user-role.js";
  import { getFeatureIconAndColor, getRoleColor } from "../shared/feature-utils";

  interface Props {
    flag: FeatureFlagConfig;
    parentRole?: UserRole;
    saving?: boolean;
    toggleLocked?: boolean;
    toggleLockedReason?: string;
    onRoleClick: (role: UserRole) => void;
    onToggle: () => void;
  }

  let {
    flag,
    parentRole,
    saving = false,
    toggleLocked = false,
    toggleLockedReason,
    onRoleClick,
    onToggle,
  }: Props = $props();

  const style = $derived(getFeatureIconAndColor(flag.id));

  // Effective minimum role (can't be lower than parent)
  const effectiveMinRole = $derived(() => {
    if (!parentRole) return flag.minimumRole;
    const parentIndex = ROLE_HIERARCHY.indexOf(parentRole);
    const flagIndex = ROLE_HIERARCHY.indexOf(flag.minimumRole);
    return flagIndex >= parentIndex ? flag.minimumRole : parentRole;
  });

  // Check if a role cell should be shown as "has access"
  function roleHasAccess(role: UserRole): boolean {
    return hasRolePrivilege(role, effectiveMinRole());
  }

  // Check if a role is the minimum required
  function isMinimumRole(role: UserRole): boolean {
    return role === effectiveMinRole();
  }

  // Check if role is lower than parent's requirement (grayed out)
  function isBelowParent(role: UserRole): boolean {
    if (!parentRole) return false;
    return !hasRolePrivilege(role, parentRole);
  }
</script>

<div class="matrix-row" class:saving class:disabled={!flag.enabled}>
  <!-- Feature info -->
  <div class="feature-cell">
    <div class="feature-icon" style="background: {style.color}18; color: {style.color}">
      <i class="fas {style.icon}" aria-hidden="true"></i>
    </div>
    <span class="feature-name">{flag.name}</span>
  </div>

  <!-- Role cells -->
  {#each ROLE_HIERARCHY as role}
    {@const hasAccess = roleHasAccess(role)}
    {@const isMin = isMinimumRole(role)}
    {@const belowParent = isBelowParent(role)}
    <button
      type="button"
      class="role-cell"
      class:has-access={hasAccess}
      class:is-minimum={isMin}
      class:below-parent={belowParent}
      style="--role-color: {getRoleColor(role)}"
      disabled={saving || belowParent}
      onclick={() => onRoleClick(role)}
      title={belowParent
        ? `Requires ${parentRole} from parent module`
        : isMin
          ? `Minimum role: ${role}`
          : hasAccess
            ? `${role} has access`
            : `Click to set minimum to ${role}`}
      aria-label="{role} role: {hasAccess ? 'has access' : 'no access'}{isMin ? ' (minimum required)' : ''}"
    >
      {#if hasAccess}
        <i class="fas fa-check" aria-hidden="true"></i>
      {:else}
        <i class="fas fa-minus" aria-hidden="true"></i>
      {/if}
    </button>
  {/each}

  <!-- Enable toggle -->
  <div class="toggle-cell">
    <button
      type="button"
      class="enable-toggle"
      class:enabled={flag.enabled}
      class:locked={toggleLocked}
      disabled={saving || toggleLocked}
      onclick={onToggle}
      title={toggleLocked
        ? toggleLockedReason ?? "This feature cannot be disabled"
        : flag.enabled ? "Click to disable" : "Click to enable"}
      aria-label="{flag.name} is {flag.enabled ? 'enabled' : 'disabled'}.{toggleLocked ? ' Cannot be toggled.' : ' Click to toggle.'}"
      aria-pressed={flag.enabled}
    >
      {#if toggleLocked}
        <i class="fas fa-lock" aria-hidden="true"></i>
      {:else}
        <i class="fas {flag.enabled ? 'fa-toggle-on' : 'fa-toggle-off'}" aria-hidden="true"></i>
      {/if}
    </button>
  </div>

  {#if saving}
    <div class="saving-indicator">
      <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
    </div>
  {/if}
</div>

<style>
  .matrix-row {
    display: grid;
    /* 6 columns: icon | USER | PREM | TEST | ADMIN | toggle */
    grid-template-columns: 40px repeat(4, 1fr) var(--min-touch-target);
    gap: 4px;
    align-items: center;
    min-height: var(--min-touch-target);
    padding: 6px 8px;
    border-radius: 8px;
    position: relative;
    transition: background var(--duration-fast) ease;
  }

  @media (min-width: 700px) {
    .matrix-row {
      grid-template-columns: 1fr repeat(4, 80px) 64px;
      gap: 8px;
      padding: 6px 12px;
    }
  }

  .matrix-row:hover {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
  }

  .matrix-row.disabled {
    opacity: 0.5;
  }

  .matrix-row.saving {
    pointer-events: none;
  }

  .feature-cell {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .feature-icon {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    font-size: 12px;
    flex-shrink: 0;
  }

  .feature-name {
    font-size: var(--font-size-sm, 14px);
    font-weight: 500;
    color: var(--theme-text, #ffffff);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    display: none; /* Hidden on mobile - icon only */
  }

  @media (min-width: 700px) {
    .feature-name {
      display: block;
    }
  }

  .role-cell {
    width: 100%;
    min-height: 44px; /* Accessibility: touch target */
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1.5px solid transparent;
    border-radius: 8px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.3));
    cursor: pointer;
    transition: all var(--duration-fast) ease;
    font-size: var(--font-size-compact, 12px);
  }

  .role-cell:hover:not(:disabled) {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.06));
    border-color: var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .role-cell.has-access {
    background: color-mix(in srgb, var(--role-color) 12%, transparent);
    color: var(--role-color);
  }

  .role-cell.has-access:hover:not(:disabled) {
    background: color-mix(in srgb, var(--role-color) 20%, transparent);
  }

  .role-cell.is-minimum {
    border-color: var(--role-color);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--role-color) 20%, transparent);
  }

  .role-cell.below-parent {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .role-cell:disabled {
    cursor: not-allowed;
  }

  .toggle-cell {
    display: flex;
    justify-content: center;
  }

  .enable-toggle {
    width: 44px;
    min-height: 44px; /* Accessibility: touch target */
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 8px;
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 15%,
      transparent
    );
    color: var(--semantic-error, #f87171);
    font-size: 18px;
    cursor: pointer;
    transition: all var(--duration-fast) ease;
  }

  .enable-toggle:hover:not(:disabled) {
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 25%,
      transparent
    );
  }

  .enable-toggle.enabled {
    background: color-mix(
      in srgb,
      var(--semantic-success, #10b981) 15%,
      transparent
    );
    color: var(--semantic-success, #34d399);
  }

  .enable-toggle.enabled:hover:not(:disabled) {
    background: color-mix(
      in srgb,
      var(--semantic-success, #10b981) 25%,
      transparent
    );
  }

  .enable-toggle:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .enable-toggle.locked {
    background: color-mix(
      in srgb,
      var(--theme-text-dim, #9ca3af) 15%,
      transparent
    );
    color: var(--theme-text-dim, #9ca3af);
  }

  .saving-indicator {
    position: absolute;
    right: -28px;
    color: var(--theme-accent, #6366f1);
    font-size: 14px;
  }
</style>
