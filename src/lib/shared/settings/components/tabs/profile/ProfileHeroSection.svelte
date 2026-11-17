<!-- The signed-in identity column inside Account settings. -->
<script lang="ts">
  import RobustAvatar from "../../../../components/avatar/RobustAvatar.svelte";
  import SignOutButton from "./SignOutButton.svelte";
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
    /** Phone frame: one short block (photo, names, email). Sign out is the
     *  frame's own bottom row there, so the hero leaves it out. */
    compact?: boolean;
  }

  let {
    user,
    onSignOut,
    disabled = false,
    onAvatarClick,
    pronouns,
    username,
    profileColor,
    compact = false,
  }: Props = $props();

  // Break opportunities only after "@" and before each dot of the domain, so a
  // long address wraps at its seams and never mid-word.
  const emailParts = $derived.by(() => {
    const email = user.email ?? "";
    const at = email.lastIndexOf("@");
    if (at < 0) return [email];
    const domain = email.slice(at + 1).split(".");
    return [
      email.slice(0, at + 1),
      ...domain.map((part, index) => (index === 0 ? part : `.${part}`)),
    ];
  });
</script>

<section
  class="identity-header"
  class:compact
  aria-label={t("settings_signed_in_account")}>
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
        <p class="profile-email ph-no-capture">
          {#each emailParts as part, index (index)}{#if index > 0}<wbr
              />{/if}{part}{/each}
        </p>
      {/if}
    </div>
  </div>

  {#if !disabled && !compact}
    <div class="session-row">
      <span class="session-status">
        <span class="session-dot" aria-hidden="true"></span>
        <span>{t("settings_signed_in")}</span>
      </span>
      <SignOutButton {onSignOut} />
    </div>
  {/if}
</section>

<style>
  .identity-header {
    display: flex;
    flex: 0 0 auto;
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
      transform var(--duration-fast) var(--ease-standard),
      box-shadow var(--duration-fast) var(--ease-standard);
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
    .avatar-wrapper.clickable {
      transition: none;
    }

    .avatar-wrapper.clickable:hover {
      transform: none;
    }
  }

  /* Phone frame: the hero is one short block so the boxes under it fit the
     screen. The kicker steps out and Sign out moves to the frame's bottom row,
     so photo, name and email take the whole width; the email wraps only at
     its seams (the <wbr>s after "@" and before each dot). */
  .identity-header.compact {
    width: 100%;
  }

  .compact .identity-kicker {
    display: none;
  }

  .compact .profile-info {
    flex: 1 1 auto;
  }

  .identity-header.compact .profile-hero {
    flex-direction: row;
    align-items: center;
    gap: 0.85em;
  }

  .compact .avatar-wrapper {
    width: 4em;
    height: 4em;
  }

  .compact .avatar-edit-badge {
    width: 1.7em;
    height: 1.7em;
  }

  .compact .profile-name {
    font-size: var(--font-size-xl);
  }

  .compact .profile-meta,
  .compact .profile-email {
    margin-top: 0.2em;
  }

  /* `break-word` only for a single segment wider than the line; it never
     changes the min-content size, so the seams win first. */
  .compact .profile-email {
    max-width: 100%;
    overflow: visible;
    overflow-wrap: break-word;
    white-space: normal;
  }
</style>
