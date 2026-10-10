<!-- The signed-in identity column inside Account settings. -->
<script lang="ts">
  import RobustAvatar from "../../../../components/avatar/RobustAvatar.svelte";
  import type { User } from "firebase/auth";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";

  interface Props {
    user: User;
    onSignOut: () => void;
    disabled?: boolean;
    onAvatarClick?: () => void;
    pronouns?: string;
    username?: string;
    profileColor?: string;
  }

  let {
    user,
    onSignOut,
    disabled = false,
    onAvatarClick,
    pronouns,
    username,
    profileColor,
  }: Props = $props();
</script>

<section class="identity-header" aria-label={t("settings_signed_in_account")}>
  <p class="identity-kicker">
    <i class="fas fa-id-card" aria-hidden="true"></i>
    <span>{t("settings_account")}</span>
  </p>

  <div class="profile-hero">
    {#if onAvatarClick && !disabled}
      <button
        type="button"
        class="avatar-wrapper clickable"
        style:--profile-accent={profileColor}
        onclick={onAvatarClick}
        aria-label={t("settings_change_profile_photo")}
      >
        <RobustAvatar
          src={user.photoURL}
          name={user.displayName || user.email}
          alt={user.displayName || t("settings_user")}
          size="xl"
        />
        <span class="avatar-edit-badge">
          <i class="fas fa-camera" aria-hidden="true"></i>
        </span>
      </button>
    {:else}
      <div class="avatar-wrapper">
        <RobustAvatar
          src={user.photoURL}
          name={user.displayName || user.email}
          alt={user.displayName || t("settings_user")}
          size="xl"
        />
      </div>
    {/if}

    <div class="profile-info">
      <h1 class="profile-name">{user.displayName || t("settings_user")}</h1>
      {#if username || pronouns}
        <p class="profile-meta">
          {#if username}<span>@{username}</span>{/if}
          {#if username && pronouns}<span aria-hidden="true">·</span>{/if}
          {#if pronouns}<span>{pronouns}</span>{/if}
        </p>
      {/if}
      {#if user.email}
        <p class="profile-email">{user.email}</p>
      {/if}
    </div>
  </div>

  {#if !disabled}
    <div class="session-row">
      <span class="session-status">
        <span class="session-dot" aria-hidden="true"></span>
        <span>{t("settings_signed_in")}</span>
      </span>
      <button type="button" class="sign-out-btn" onclick={onSignOut}>
        <i class="fas fa-sign-out-alt" aria-hidden="true"></i>
        <span>{t("settings_sign_out")}</span>
      </button>
    </div>
  {/if}
</section>

<style>
  .identity-header {
    display: flex;
    height: 100%;
    min-width: 0;
    flex-direction: column;
    align-items: flex-start;
  }

  .identity-kicker {
    display: inline-flex;
    align-items: center;
    gap: 0.5em;
    margin: 0 0 1.25em;
    color: var(--theme-accent-text, var(--theme-accent));
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .identity-kicker i {
    font-size: var(--font-size-sm, 0.875rem);
  }

  .profile-hero {
    display: flex;
    width: 100%;
    min-width: 0;
    align-items: center;
    gap: clamp(1em, 2cqi, 1.5em);
  }

  .avatar-wrapper {
    position: relative;
    width: clamp(5em, 7cqi, 6em);
    height: clamp(5em, 7cqi, 6em);
    flex: 0 0 auto;
    overflow: visible;
    padding: 3px;
    border: 0;
    border-radius: 50%;
    background: linear-gradient(
      135deg,
      var(--profile-accent, var(--theme-accent)) 0%,
      color-mix(
          in srgb,
          var(--profile-accent, var(--theme-accent-strong)) 80%,
          black
        )
        100%
    );
    box-shadow: 0 0 2rem
      color-mix(
        in srgb,
        var(--profile-accent, var(--theme-accent)) 28%,
        transparent
      );
  }

  .avatar-wrapper.clickable {
    cursor: pointer;
    transition:
      transform var(--duration-fast) ease,
      box-shadow var(--duration-fast) ease;
  }

  .avatar-wrapper.clickable:hover {
    transform: translateY(-2px) scale(1.02);
    box-shadow: 0 0 2.4rem
      color-mix(
        in srgb,
        var(--profile-accent, var(--theme-accent)) 40%,
        transparent
      );
  }

  .avatar-wrapper.clickable:focus-visible {
    outline: 3px solid var(--theme-accent-text, var(--theme-accent));
    outline-offset: 4px;
  }

  .avatar-edit-badge {
    position: absolute;
    right: -0.1em;
    bottom: -0.1em;
    display: grid;
    width: 2em;
    height: 2em;
    place-items: center;
    border: 3px solid color-mix(in srgb, var(--theme-panel-bg) 55%, #070b10 45%);
    border-radius: 50%;
    color: white;
    background: var(--profile-accent, var(--theme-accent));
    font-size: var(--font-size-compact, 0.75rem);
  }

  .avatar-wrapper :global(.robust-avatar) {
    width: 100% !important;
    height: 100% !important;
    overflow: hidden;
    border-radius: 50%;
  }

  .avatar-wrapper :global(img),
  .avatar-wrapper :global(.avatar-fallback) {
    border-radius: 50%;
  }

  .profile-info {
    min-width: 0;
  }

  .profile-name {
    margin: 0;
    overflow-wrap: anywhere;
    color: var(--theme-text);
    font-family:
      -apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif;
    font-size: clamp(1.65em, 2.5cqi, 2.25em);
    font-weight: 780;
    line-height: 1.08;
    letter-spacing: -0.025em;
  }

  .profile-meta,
  .profile-email {
    margin: 0.45em 0 0;
    color: var(--theme-text-dim);
    font-size: max(0.875rem, var(--font-size-min));
    line-height: 1.4;
  }

  .profile-meta {
    display: flex;
    min-width: 0;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.4em;
    font-weight: 650;
  }

  .profile-email {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .session-row {
    display: flex;
    width: 100%;
    min-width: 0;
    align-items: center;
    justify-content: space-between;
    gap: 1em;
    margin-top: 1.5em;
    padding-top: 1.25em;
    border-top: 1px solid var(--theme-stroke);
  }

  .session-status {
    display: inline-flex;
    min-width: 0;
    align-items: center;
    gap: 0.55em;
    color: var(--theme-text-dim);
    font-size: max(0.875rem, var(--font-size-min));
    font-weight: 650;
  }

  .session-dot {
    width: 0.55em;
    height: 0.55em;
    flex: 0 0 auto;
    border-radius: 50%;
    background: var(--semantic-success);
    box-shadow: 0 0 0 0.25em
      color-mix(in srgb, var(--semantic-success) 12%, transparent);
  }

  .sign-out-btn {
    display: inline-flex;
    min-height: var(--min-touch-target, 44px);
    align-items: center;
    justify-content: center;
    gap: 0.55em;
    padding: 0.7em 1em;
    border: 1px solid var(--theme-stroke-strong, var(--theme-stroke));
    border-radius: 0.7em;
    color: var(--theme-text-dim);
    background: color-mix(in srgb, var(--theme-text) 5%, transparent);
    font-size: var(--font-size-sm, 0.875rem);
    font-weight: 700;
    cursor: pointer;
    transition:
      background var(--duration-fast) ease,
      border-color var(--duration-fast) ease,
      color var(--duration-fast) ease,
      transform var(--duration-fast) ease;
  }

  .sign-out-btn:hover {
    border-color: color-mix(in srgb, var(--semantic-error) 45%, transparent);
    color: color-mix(in srgb, var(--semantic-error) 85%, var(--theme-text));
    background: color-mix(in srgb, var(--semantic-error) 10%, transparent);
    transform: translateY(-1px);
  }

  .sign-out-btn:active {
    transform: scale(0.98);
  }

  .sign-out-btn:focus-visible {
    outline: 3px solid var(--theme-accent-text, var(--theme-accent));
    outline-offset: 2px;
  }

  @container profile-tab (min-width: 75rem) {
    .profile-hero {
      flex-direction: column;
      align-items: flex-start;
      gap: 1.5em;
      margin-block: auto;
    }
  }

  @container profile-tab (max-width: 32rem) {
    .identity-kicker {
      margin-bottom: 1rem;
    }

    .profile-hero {
      align-items: flex-start;
    }

    .avatar-wrapper {
      width: 4.5rem;
      height: 4.5rem;
    }

    .profile-name {
      font-size: 1.5rem;
    }

    .profile-email {
      max-width: 13rem;
    }
  }

  @container profile-tab (max-width: 24rem) {
    .profile-hero {
      flex-direction: column;
      align-items: flex-start;
    }

    .profile-email {
      max-width: 100%;
      white-space: normal;
      overflow-wrap: anywhere;
    }

    .session-row {
      align-items: flex-start;
      flex-direction: column;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .avatar-wrapper.clickable,
    .sign-out-btn {
      transition: none;
    }

    .avatar-wrapper.clickable:hover,
    .sign-out-btn:hover,
    .sign-out-btn:active {
      transform: none;
    }
  }
</style>
