<!-- UserPresenceCard.svelte - Vertical user card with avatar-based color theming -->
<script lang="ts">
  import type { UserPresenceWithId } from "#lib/shared/presence/domain/models/presence-models.js";
  import { formatActivityTime, formatLocationLabel } from "#lib/shared/presence/domain/models/presence-models.js";
  import RobustAvatar from "#lib/shared/components/avatar/RobustAvatar.svelte";
  import {
    extractDominantColor,
    getCachedOrFallbackColor,
  } from "#lib/shared/foundation/utils/color-extractor.js";

  interface Props {
    user: UserPresenceWithId;
    isSelected?: boolean;
    onSelect: () => void;
  }

  let { user, isSelected = false, onSelect }: Props = $props();

  // Color extracted from avatar
  let cardColor = $state<string | null>(null);

  // Compute activity status display
  let isActive = $derived(user.activityStatus === "active");
  let locationLabel = $derived(formatLocationLabel(user.location));
  let lastActivity = $derived(user.lastActivity ?? user.lastSeen);
  let activityText = $derived(formatActivityTime(lastActivity, user.online));

  // Get the accent color - extracted or fallback
  let accentColor = $derived(
    cardColor ??
      getCachedOrFallbackColor(
        user.photoURL ?? undefined,
        user.displayName ?? "User"
      )
  );

  /**
   * Handle avatar image load - extract dominant color
   */
  async function handleAvatarLoad(imgElement: HTMLImageElement) {
    if (cardColor) return; // Already extracted
    try {
      const color = await extractDominantColor(
        user.photoURL ?? undefined,
        user.displayName ?? "User"
      );
      cardColor = color;
    } catch {
      // Use fallback
    }
  }
</script>

<button
  class="user-card"
  class:selected={isSelected}
  class:active={isActive}
  style="--card-accent: {accentColor}"
  onclick={onSelect}
>
  <!-- Avatar with presence indicator -->
  <div class="avatar-container">
    <div class="avatar-ring">
      <RobustAvatar
        src={user.photoURL}
        alt={user.displayName ?? "User"}
        name={user.displayName}
        customSize={56}
        onload={handleAvatarLoad}
      />
    </div>
    <span class="presence-dot" class:active={isActive}>
      <span class="sr-only">{isActive ? "Online" : "Offline"}</span>
    </span>
  </div>

  <!-- User info -->
  <div class="info">
    <span class="name">{user.displayName ?? "Unknown"}</span>
    <span class="email">{user.email ?? ""}</span>
    <span class="geo" class:empty={!locationLabel}>
      {#if locationLabel}
        <i class="fas fa-earth-americas" aria-hidden="true"></i>
        {locationLabel}
      {/if}
    </span>
  </div>

  <!-- Status section -->
  <div class="status-section">
    {#if isActive && user.currentModule}
      <span class="location">
        <i class="fas fa-location-dot" aria-hidden="true"></i>
        {user.currentModule}{user.currentTab ? ` / ${user.currentTab}` : ""}
      </span>
    {:else}
      <span class="activity-status">
        {activityText}
      </span>
    {/if}
  </div>

  <!-- Device indicator -->
  <div class="device-badge">
    {#if user.device === "mobile"}
      <i class="fas fa-mobile-screen" aria-hidden="true"></i>
    {:else if user.device === "tablet"}
      <i class="fas fa-tablet-screen-button" aria-hidden="true"></i>
    {:else}
      <i class="fas fa-desktop" aria-hidden="true"></i>
    {/if}
  </div>
</button>

<style>
  .user-card {
    /* Dynamic color from avatar */
    --card-accent: var(--theme-accent-strong);
    --card-accent-light: color-mix(in srgb, var(--card-accent) 80%, #fff);
    --card-accent-glow: color-mix(in srgb, var(--card-accent) 25%, transparent);

    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 16px;
    /* Soft gradient fill using extracted color */
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--card-accent) 10%, rgba(255, 255, 255, 0.03)) 0%,
      color-mix(in srgb, var(--card-accent) 5%, rgba(255, 255, 255, 0.02)) 100%
    );
    border: 1px solid color-mix(in srgb, var(--card-accent) 18%, transparent);
    border-radius: 14px;
    transition:
      background 0.3s ease,
      border-color 0.3s ease,
      box-shadow 0.2s ease,
      transform 0.2s ease;
    cursor: pointer;
    text-align: center;
  }

  .user-card:hover {
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--card-accent) 16%, var(--theme-card-bg)) 0%,
      color-mix(in srgb, var(--card-accent) 10%, rgba(255, 255, 255, 0.03)) 100%
    );
    border-color: color-mix(in srgb, var(--card-accent) 40%, transparent);
    transform: translateY(-2px);
    box-shadow:
      0 8px 24px var(--card-accent-glow),
      0 4px 12px rgba(0, 0, 0, 0.15);
  }

  .user-card:focus-visible {
    outline: 2px solid var(--card-accent);
    outline-offset: 2px;
  }

  .user-card.selected {
    border-color: var(--card-accent);
    box-shadow:
      0 0 0 2px var(--card-accent-glow),
      0 8px 24px var(--card-accent-glow);
  }

  /* Active user gets green accent on presence dot */
  .user-card.active {
    border-top: 3px solid var(--semantic-success);
  }

  /* Avatar with colored ring */
  .avatar-container {
    position: relative;
  }

  .avatar-ring {
    padding: 3px;
    background: linear-gradient(
      135deg,
      var(--card-accent) 0%,
      var(--card-accent-light) 100%
    );
    border-radius: 50%;
    transition: background var(--duration-emphasis) ease;
  }

  .avatar-ring :global(.robust-avatar) {
    border: 2px solid rgba(0, 0, 0, 0.3);
  }

  .presence-dot {
    position: absolute;
    bottom: 2px;
    right: 2px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--theme-text-dim);
    border: 2px solid rgba(0, 0, 0, 0.4);
    z-index: 1;
  }

  .presence-dot.active {
    background: var(--semantic-success);
    box-shadow: 0 0 8px var(--semantic-success);
  }

  /* Screen reader only - visually hidden but accessible */
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    width: 100%;
  }

  .name {
    font-weight: 600;
    font-size: var(--font-size-sm);
    color: var(--theme-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .email {
    font-size: var(--font-size-compact); /* Supplementary metadata */
    color: var(--theme-text-secondary, var(--theme-text-dim));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .geo {
    min-height: 16px; /* reserved so cards without location are the same height */
    font-size: var(--font-size-compact);
    color: var(--theme-text-secondary, var(--theme-text-dim));
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }

  .geo.empty {
    /* keep the reserved height even with no content */
    visibility: hidden;
  }

  .geo i {
    font-size: var(--font-size-compact);
  }

  .status-section {
    min-height: 20px;
  }

  .location {
    font-size: var(--font-size-compact);
    color: var(--semantic-success);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
  }

  .location i {
    font-size: var(--font-size-compact);
  }

  .activity-status {
    font-size: var(--font-size-compact);
    color: var(--theme-text-secondary, var(--theme-text-dim));
  }

  .device-badge {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 6px;
    background: color-mix(in srgb, var(--card-accent) 15%, transparent);
    color: var(--card-accent);
    font-size: var(--font-size-compact);
    transition: background var(--duration-normal) ease;
  }

  .user-card:hover .device-badge {
    background: color-mix(in srgb, var(--card-accent) 25%, transparent);
  }

  /* Mobile adjustments */
  @media (max-width: 640px) {
    .user-card {
      padding: 12px;
      gap: 8px;
      border-radius: 12px;
    }

    .avatar-ring {
      padding: 2px;
    }

    .name {
      font-size: var(--font-size-min); /* Essential text */
    }

    .email {
      font-size: var(--font-size-compact); /* Supplementary minimum */
    }

    .device-badge {
      width: 24px;
      height: 24px;
      font-size: var(--font-size-compact); /* Icon only, not text */
    }
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .user-card {
      transition: none;
    }

    .user-card:hover {
      transform: none;
    }
  }
</style>
