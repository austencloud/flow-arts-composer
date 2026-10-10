<script lang="ts">
  /**
   * RoleBadge
   * Displays a user role with icon and color
   */

  import type { UserRole } from "#lib/shared/auth/domain/models/user-role.js";
  import { getRoleColor, getRoleIcon, getRoleLabel } from "./feature-utils";

  interface Props {
    role: UserRole;
    showLabel?: boolean;
    size?: "sm" | "md" | "lg";
    interactive?: boolean;
    selected?: boolean;
    onclick?: () => void;
  }

  let {
    role,
    showLabel = true,
    size = "md",
    interactive = false,
    selected = false,
    onclick,
  }: Props = $props();

  const color = $derived(getRoleColor(role));
  const icon = $derived(getRoleIcon(role));
  const label = $derived(getRoleLabel(role));
</script>

{#if interactive}
  <button
    type="button"
    class="role-badge interactive {size}"
    class:selected
    style="--role-color: {color}"
    {onclick}
  >
    <i class="fas {icon}" aria-hidden="true"></i>
    {#if showLabel}
      <span>{label}</span>
    {/if}
  </button>
{:else}
  <span
    class="role-badge {size}"
    style="--role-color: {color}"
    title={label}
  >
    <i class="fas {icon}" aria-hidden="true"></i>
    {#if showLabel}
      <span>{label}</span>
    {/if}
  </span>
{/if}

<style>
  .role-badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 4px 10px;
    border-radius: 6px;
    background: color-mix(in srgb, var(--role-color) 15%, transparent);
    color: var(--role-color);
    font-weight: 500;
    white-space: nowrap;
    border: none;
  }

  .role-badge.sm {
    padding: 2px 6px;
    font-size: var(--font-size-compact, 12px);
    gap: 3px;
  }

  .role-badge.sm i {
    font-size: 10px;
  }

  .role-badge.md {
    font-size: var(--font-size-compact, 12px);
  }

  .role-badge.md i {
    font-size: 12px;
  }

  .role-badge.lg {
    padding: 8px 14px;
    font-size: var(--font-size-sm, 14px);
  }

  .role-badge.lg i {
    font-size: 14px;
  }

  .role-badge.interactive {
    cursor: pointer;
    transition: all var(--duration-fast) ease;
    border: 1.5px solid transparent;
  }

  .role-badge.interactive:hover {
    background: color-mix(in srgb, var(--role-color) 25%, transparent);
    border-color: color-mix(in srgb, var(--role-color) 30%, transparent);
  }

  .role-badge.interactive:active {
    transform: scale(0.97);
  }

  .role-badge.interactive.selected {
    background: color-mix(in srgb, var(--role-color) 30%, transparent);
    border-color: var(--role-color);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--role-color) 20%, transparent);
  }
</style>
