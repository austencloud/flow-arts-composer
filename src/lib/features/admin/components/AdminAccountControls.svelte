<script lang="ts">
  import type { UserRole } from "#lib/shared/auth/domain/models/user-role.js";
  import {
    ROLE_DISPLAY,
    ROLE_HIERARCHY,
  } from "#lib/shared/auth/domain/models/user-role.js";

  interface Props {
    role: UserRole;
    disabled: boolean;
    contributor: boolean;
    actionPending: boolean;
    contributorPending: boolean;
    onchangeRole: (role: UserRole) => void;
    oneditName: () => void;
    ontoggleContributor: () => void;
    onrequestDisabledChange: () => void;
    onrequestDelete: () => void;
  }

  let {
    role,
    disabled,
    contributor,
    actionPending,
    contributorPending,
    onchangeRole,
    oneditName,
    ontoggleContributor,
    onrequestDisabledChange,
    onrequestDelete,
  }: Props = $props();

  function roleColor(value: UserRole): string {
    return {
      user: "var(--theme-text-dim)",
      premium: "var(--semantic-warning)",
      tester: "var(--semantic-info)",
      admin: "var(--semantic-error)",
    }[value];
  }
</script>

<div class="control-group" role="group" aria-labelledby="role-label">
  <div class="group-heading">
    <div>
      <span id="role-label" class="control-label">Role</span>
      <p>Controls product access and administrative permissions.</p>
    </div>
    <span class="current-value" style="--role-color: {roleColor(role)}">
      {ROLE_DISPLAY[role].label}
    </span>
  </div>
  <div class="role-buttons">
    {#each ROLE_HIERARCHY as roleOption}
      <button
        class="role-btn"
        class:active={role === roleOption}
        disabled={actionPending}
        onclick={() => onchangeRole(roleOption)}
        style="--role-color: {roleColor(roleOption)}"
        aria-label="Set role to {ROLE_DISPLAY[roleOption].label}"
        aria-pressed={role === roleOption}
      >
        <i class="fas {ROLE_DISPLAY[roleOption].icon}" aria-hidden="true"></i>
        {ROLE_DISPLAY[roleOption].label}
        {#if role === roleOption}
          <i class="fas fa-check selected-check" aria-hidden="true"></i>
        {/if}
      </button>
    {/each}
  </div>
</div>

<div
  class="control-group"
  role="group"
  aria-labelledby="identity-actions-label"
>
  <div class="group-heading">
    <div>
      <span id="identity-actions-label" class="control-label"
        >Identity and access</span
      >
      <p>Update the public name or contributor directory access.</p>
    </div>
  </div>
  <div class="action-buttons identity-actions">
    <button
      class="action-btn"
      disabled={actionPending}
      onclick={oneditName}
      aria-label="Edit display name"
    >
      <span class="button-icon"
        ><i class="fas fa-pen" aria-hidden="true"></i></span
      >
      <span><strong>Edit name</strong><small>Public display name</small></span>
      <i class="fas fa-chevron-right trailing-icon" aria-hidden="true"></i>
    </button>

    <button
      class="action-btn"
      class:contributor-active={contributor}
      disabled={contributorPending}
      onclick={ontoggleContributor}
      aria-label={contributor
        ? "Remove contributor status"
        : "Add as contributor"}
    >
      <span class="button-icon">
        {#if contributorPending}
          <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
        {:else}
          <i
            class="fas {contributor ? 'fa-star' : 'fa-user-plus'}"
            aria-hidden="true"
          ></i>
        {/if}
      </span>
      <span>
        <strong>{contributor ? "Remove contributor" : "Add contributor"}</strong
        >
        <small
          >{contributor ? "Currently listed" : "Grant directory access"}</small
        >
      </span>
      <i class="fas fa-chevron-right trailing-icon" aria-hidden="true"></i>
    </button>
  </div>
</div>

<section class="danger-zone" aria-labelledby="danger-zone-label">
  <div class="group-heading danger-heading">
    <div>
      <span id="danger-zone-label" class="control-label">Danger zone</span>
      <p>These actions interrupt access or permanently remove the account.</p>
    </div>
  </div>
  <div class="action-buttons danger-actions">
    <button
      class="action-btn status-action"
      class:enable-action={disabled}
      disabled={actionPending}
      aria-label={disabled ? "Enable account" : "Disable account"}
      onclick={onrequestDisabledChange}
    >
      <span class="button-icon">
        <i
          class="fas {disabled ? 'fa-circle-check' : 'fa-ban'}"
          aria-hidden="true"
        ></i>
      </span>
      <span>
        <strong>{disabled ? "Enable account" : "Disable account"}</strong>
        <small
          >{disabled ? "Restore sign-in access" : "Block sign-in access"}</small
        >
      </span>
    </button>

    <button
      class="action-btn destructive"
      disabled={actionPending}
      aria-label="Delete user account"
      onclick={onrequestDelete}
    >
      <span class="button-icon"
        ><i class="fas fa-trash-can" aria-hidden="true"></i></span
      >
      <span
        ><strong>Delete user</strong><small>Permanent and irreversible</small
        ></span
      >
    </button>
  </div>
</section>

<style>
  .control-group {
    padding-bottom: 1.125rem;
    margin-bottom: 1.125rem;
    border-bottom: 1px solid var(--theme-stroke);
  }

  .group-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.75rem;
    margin-bottom: 0.75rem;
  }

  .control-label {
    color: var(--theme-text);
    font-size: var(--font-size-sm);
    font-weight: 650;
  }

  .group-heading p {
    margin: 0.2rem 0 0;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact);
    line-height: 1.4;
  }

  .current-value {
    flex: none;
    padding: 0.25rem 0.5rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--role-color) 14%, transparent);
    color: var(--role-color);
    font-size: var(--font-size-compact);
    font-weight: 650;
  }

  .role-buttons,
  .action-buttons {
    display: grid;
    gap: 0.625rem;
  }

  .role-buttons {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .role-btn,
  .action-btn {
    min-height: var(--min-touch-target, 44px);
    border: 1px solid var(--theme-stroke);
    border-radius: 0.625rem;
    background: var(--theme-panel-bg);
    color: var(--theme-text-dim);
    cursor: pointer;
    font: inherit;
    transition:
      background-color var(--duration-normal) ease,
      border-color var(--duration-normal) ease,
      color var(--duration-normal) ease;
  }

  .role-btn {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    padding: 0.625rem 0.875rem;
    font-size: var(--font-size-compact);
  }

  .selected-check {
    position: absolute;
    top: 0.4rem;
    right: 0.4rem;
    font-size: 0.625rem;
  }

  .role-btn.active {
    border-color: color-mix(in srgb, var(--role-color) 70%, transparent);
    background: color-mix(in srgb, var(--role-color) 15%, transparent);
    color: var(--role-color);
  }

  .action-btn {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.625rem;
    padding: 0.75rem;
    text-align: left;
  }

  .action-btn > span:not(.button-icon) {
    display: grid;
    gap: 0.15rem;
    min-width: 0;
  }

  .action-btn strong {
    color: var(--theme-text);
    font-size: var(--font-size-sm);
    font-weight: 600;
  }

  .action-btn small {
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact);
  }

  .button-icon {
    display: grid;
    place-items: center;
    width: 2rem;
    height: 2rem;
    border-radius: 0.5rem;
    background: var(--theme-card-hover-bg);
    color: var(--theme-accent);
  }

  .trailing-icon {
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact);
  }

  .contributor-active {
    border-color: color-mix(in srgb, var(--semantic-warning) 40%, transparent);
    background: color-mix(
      in srgb,
      var(--semantic-warning) 8%,
      var(--theme-panel-bg)
    );
  }

  .contributor-active .button-icon {
    background: color-mix(in srgb, var(--semantic-warning) 14%, transparent);
    color: var(--semantic-warning);
  }

  .danger-zone {
    padding: 0.875rem;
    border: 1px solid
      color-mix(in srgb, var(--semantic-error) 26%, var(--theme-stroke));
    border-radius: 0.75rem;
    background: color-mix(in srgb, var(--semantic-error) 4%, transparent);
  }

  .danger-heading .control-label {
    color: var(--semantic-error);
  }

  .status-action .button-icon,
  .destructive .button-icon {
    background: color-mix(in srgb, var(--semantic-error) 13%, transparent);
    color: var(--semantic-error);
  }

  .status-action.enable-action .button-icon {
    background: color-mix(in srgb, var(--semantic-success) 13%, transparent);
    color: var(--semantic-success);
  }

  .destructive {
    border-color: color-mix(in srgb, var(--semantic-error) 38%, transparent);
  }

  .destructive strong {
    color: var(--semantic-error);
  }

  @media (hover: hover) {
    .role-btn:hover:not(:disabled) {
      border-color: var(--role-color);
      background: color-mix(
        in srgb,
        var(--role-color) 10%,
        var(--theme-panel-bg)
      );
    }

    .action-btn:hover:not(:disabled) {
      border-color: var(--theme-stroke-strong);
      background: var(--theme-card-hover-bg);
    }

    .destructive:hover:not(:disabled) {
      border-color: var(--semantic-error);
      background: color-mix(
        in srgb,
        var(--semantic-error) 12%,
        var(--theme-panel-bg)
      );
    }
  }

  .role-btn:disabled,
  .action-btn:disabled {
    cursor: wait;
    opacity: 0.6;
  }

  .role-btn:focus-visible,
  .action-btn:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  @container (min-width: 30rem) {
    .role-buttons {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }

    .identity-actions,
    .danger-actions {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (min-width: 2600px) {
    .control-group {
      padding-bottom: 1.5rem;
      margin-bottom: 1.5rem;
    }

    .role-buttons,
    .action-buttons {
      gap: 0.875rem;
    }

    .action-btn {
      padding: 1rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .role-btn,
    .action-btn {
      transition: none;
    }
  }
</style>
