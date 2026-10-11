<!--
  AdminToolbarMobile - Mobile bottom sheet admin tools

  Swipeable bottom sheet with quick access chips, user search,
  and action cards in a grid layout.
-->
<script lang="ts">
  import { fly } from "svelte/transition";
  import UserSearchInput from "#lib/shared/user-search/UserSearchInput.svelte";
  import RobustAvatar from "#lib/shared/components/avatar/RobustAvatar.svelte";
  import { createSwipeDismiss } from "#lib/shared/foundation/ui/gestures/create-swipe-dismiss.svelte.js";
  import type { QuickAccessUser } from "../services/types";
  import type { PreviewUserProfile } from "../state/user-preview-state.svelte";

  interface Props {
    quickAccessUsers: QuickAccessUser[];
    previewProfile: PreviewUserProfile | null;
    isUserPreview: boolean;
    isSearchOpen: boolean;
    isLoading: boolean;
    introResetMessage: string | null;
    isCurrentUserInQuickAccess: boolean;
    onSelectUser: (user: {
      uid: string;
      displayName: string;
      username?: string;
      photoURL?: string;
    }) => void;
    onRemoveFromQuickAccess: (uid: string) => void;
    onAddToQuickAccess: () => void;
    onClearPreview: () => void;
    onToggleSearch: () => void;
    onPreviewFirstRun: () => void;
    onPreviewCreateTutorial: () => void;
    onClearCloudThumbnails: () => void;
    isClearingThumbnails: boolean;
    onWarmGallery: () => void;
    isWarming: boolean;
    onClearLocalCache: () => void;
    isClearingLocalCache: boolean;
    onClearTikaCache: () => void;
    isClearingTikaCache: boolean;
    onShowPwaBanner: () => void;
    onClose: () => void;
  }

  let {
    quickAccessUsers,
    previewProfile,
    isUserPreview,
    isSearchOpen,
    isLoading,
    introResetMessage,
    isCurrentUserInQuickAccess,
    onSelectUser,
    onRemoveFromQuickAccess,
    onAddToQuickAccess,
    onClearPreview,
    onToggleSearch,
    onPreviewFirstRun,
    onPreviewCreateTutorial,
    onClearCloudThumbnails,
    isClearingThumbnails,
    onWarmGallery,
    isWarming,
    onClearLocalCache,
    isClearingLocalCache,
    onClearTikaCache,
    isClearingTikaCache,
    onShowPwaBanner,
    onClose,
  }: Props = $props();

  // Swipe-to-dismiss gesture - auto-attaches non-passive touch listeners
  const swipe = createSwipeDismiss({
    threshold: 100,
    onDismiss: () => onClose(),
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="mobile-backdrop"
  onclick={onClose}
  onkeydown={(e) => {
    if (e.key === "Escape") onClose();
  }}
  transition:fly={{ duration: 200, opacity: 0 }}
></div>

<div
  class="mobile-sheet"
  bind:this={swipe.element}
  transition:fly={{ y: 300, duration: 250 }}
>
  <!-- Handle bar - visual hint for swipe -->
  <div class="sheet-handle"></div>

  <!-- Header -->
  <div class="sheet-header">
    <div class="sheet-title">
      <i class="fas fa-shield-alt" aria-hidden="true"></i>
      <span>Admin Tools</span>
    </div>
    <button
      type="button"
      class="sheet-close"
      onclick={onClose}
      aria-label="Close admin tools"
    >
      <i class="fas fa-times" aria-hidden="true"></i>
    </button>
  </div>

  <!-- Quick Access Chips - Always visible, horizontal scroll -->
  <div class="sheet-section">
    <div class="section-label">Quick Access</div>
    <div class="mobile-chips-row">
      {#each quickAccessUsers as user (user.uid)}
        <div
          class="mobile-chip"
          class:active={previewProfile?.uid === user.uid}
          role="button"
          tabindex="0"
          onclick={() => onSelectUser(user)}
          onkeydown={(e) => {
            if (e.key === "Enter" || e.key === " ") onSelectUser(user);
          }}
        >
          <RobustAvatar
            src={user.photoURL}
            name={user.displayName}
            customSize={36}
            alt=""
          />
          <span class="mobile-chip-name">{user.displayName}</span>
          <button
            type="button"
            class="mobile-chip-remove"
            onclick={(e) => {
              e.stopPropagation();
              onRemoveFromQuickAccess(user.uid);
            }}
            aria-label="Remove {user.displayName}"
          >
            <i class="fas fa-times" aria-hidden="true"></i>
          </button>
        </div>
      {/each}

      <!-- Search button to add users -->
      <button
        type="button"
        class="mobile-search-btn"
        class:active={isSearchOpen}
        onclick={onToggleSearch}
      >
        <i class="fas fa-search" aria-hidden="true"></i>
        <span>Find User</span>
      </button>
    </div>

    <!-- Search input (expandable) -->
    {#if isSearchOpen}
      <div class="mobile-search-panel">
        <UserSearchInput
          onSelect={onSelectUser}
          selectedUserId={previewProfile?.uid || ""}
          selectedUserDisplay={previewProfile?.displayName ||
            previewProfile?.email ||
            ""}
          placeholder="Search users to preview..."
          disabled={isLoading}
          autofocus={true}
        />
      </div>
    {/if}
  </div>

  <!-- Actions Grid -->
  <div class="sheet-section">
    <div class="section-label">Debug Actions</div>
    <div class="actions-grid">
      <button type="button" class="action-card" onclick={onPreviewFirstRun}>
        <i class="fas fa-wand-magic-sparkles" aria-hidden="true"></i>
        <span>First Run Wizard</span>
      </button>

      <button type="button" class="action-card" onclick={onPreviewCreateTutorial}>
        <i class="fas fa-graduation-cap" aria-hidden="true"></i>
        <span>Create Tutorial</span>
      </button>

      <button type="button" class="action-card" onclick={onShowPwaBanner}>
        <i class="fas fa-mobile-screen" aria-hidden="true"></i>
        <span>Show PWA Banner</span>
      </button>

      <button type="button" class="action-card" onclick={onWarmGallery}>
        {#if isWarming}
          <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
          <span>Stop warming</span>
        {:else}
          <i class="fas fa-fire" aria-hidden="true"></i>
          <span>Warm Gallery (lean)</span>
        {/if}
      </button>

      <a href="/tools/warm-thumbnails" class="action-card">
        <i class="fas fa-sliders" aria-hidden="true"></i>
        <span>Warm Gallery (full)…</span>
      </a>

      <button
        type="button"
        class="action-card danger"
        onclick={onClearCloudThumbnails}
        disabled={isClearingThumbnails}
      >
        {#if isClearingThumbnails}
          <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
          <span>Clearing...</span>
        {:else}
          <i class="fas fa-cloud-arrow-down" aria-hidden="true"></i>
          <span>Clear Cloud Thumbnails</span>
        {/if}
      </button>

      <button
        type="button"
        class="action-card danger"
        onclick={onClearLocalCache}
        disabled={isClearingLocalCache}
      >
        {#if isClearingLocalCache}
          <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
          <span>Clearing...</span>
        {:else}
          <i class="fas fa-database" aria-hidden="true"></i>
          <span>Clear Pictograph Cache</span>
        {/if}
      </button>

      <button
        type="button"
        class="action-card danger"
        onclick={onClearTikaCache}
        disabled={isClearingTikaCache}
      >
        {#if isClearingTikaCache}
          <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
          <span>Clearing...</span>
        {:else}
          <i class="fas fa-robot" aria-hidden="true"></i>
          <span>Clear TIKA Cache</span>
        {/if}
      </button>

      {#if isUserPreview && previewProfile && !isCurrentUserInQuickAccess}
        <button type="button" class="action-card" onclick={onAddToQuickAccess}>
          <i class="fas fa-bookmark" aria-hidden="true"></i>
          <span>Save to Quick Access</span>
        </button>
      {/if}
    </div>
  </div>

  <!-- Toast -->
  {#if introResetMessage}
    <div class="mobile-toast">
      <i class="fas fa-check" aria-hidden="true"></i>
      {introResetMessage}
    </div>
  {/if}
</div>

<style>
  .mobile-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.6);
    z-index: var(--z-debug);
  }

  .mobile-sheet {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: calc(var(--z-debug) + 1);
    background: linear-gradient(
      180deg,
      rgba(20, 20, 30, 0.98) 0%,
      rgba(15, 15, 25, 0.99) 100%
    );
    border-top-left-radius: 20px;
    border-top-right-radius: 20px;
    box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.5);
    max-height: 80vh;
    overflow-y: auto;
    padding-bottom: max(16px, env(safe-area-inset-bottom));
  }

  .sheet-handle {
    width: 40px;
    height: 4px;
    background: rgba(255, 255, 255, 0.3);
    border-radius: 2px;
    margin: 12px auto 8px;
  }

  .sheet-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 16px 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    gap: 12px;
  }

  .sheet-title {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: var(--font-size-lg);
    font-weight: 600;
    color: var(--semantic-info);
  }

  .sheet-title i {
    font-size: var(--font-size-xl);
  }

  .sheet-close {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    min-width: 44px;
    min-height: 44px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 50%;
    color: var(--theme-text-dim);
    font-size: var(--font-size-lg);
    cursor: pointer;
    transition: all var(--duration-fast);
    flex-shrink: 0;
  }

  .sheet-close:active {
    background: rgba(239, 68, 68, 0.2);
    color: var(--semantic-error);
  }

  .sheet-section {
    padding: 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  }

  .sheet-section:last-of-type {
    border-bottom: none;
  }

  .section-label {
    font-size: var(--font-size-compact);
    font-weight: 600;
    color: var(--theme-text-dim);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 12px;
  }

  .mobile-chips-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }

  .mobile-chip {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 52px;
    min-height: 52px;
    padding: 0 12px 0 8px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 26px;
    color: var(--theme-text);
    font-size: var(--font-size-sm);
    cursor: pointer;
    transition: all var(--duration-fast);
    flex-shrink: 0;
  }

  .mobile-chip:active {
    background: rgba(255, 255, 255, 0.12);
    border-color: rgba(255, 255, 255, 0.25);
  }

  .mobile-chip.active {
    background: rgba(59, 130, 246, 0.3);
    border-color: var(--semantic-info);
  }

  .mobile-chip-name {
    max-width: 100px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mobile-chip-remove {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    background: transparent;
    border: none;
    border-radius: 50%;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact);
    cursor: pointer;
    transition: all var(--duration-fast);
  }

  .mobile-chip-remove:active {
    background: rgba(239, 68, 68, 0.3);
    color: white;
  }

  .mobile-search-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 52px;
    min-height: 52px;
    padding: 0 16px;
    background: rgba(59, 130, 246, 0.15);
    border: 1px solid rgba(59, 130, 246, 0.3);
    border-radius: 26px;
    color: #93c5fd;
    font-size: var(--font-size-sm);
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-fast);
    flex-shrink: 0;
  }

  .mobile-search-btn:active {
    background: rgba(59, 130, 246, 0.25);
  }

  .mobile-search-btn.active {
    background: rgba(59, 130, 246, 0.3);
    border-color: var(--semantic-info);
  }

  .mobile-search-btn i {
    font-size: var(--font-size-base);
  }

  .mobile-search-panel {
    margin-top: 12px;
  }

  .actions-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
  }

  .action-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 20px 16px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 16px;
    color: var(--theme-text);
    font-size: var(--font-size-sm);
    text-align: center;
    cursor: pointer;
    transition: all var(--duration-fast);
  }

  .action-card:active:not(:disabled) {
    background: rgba(139, 92, 246, 0.2);
    border-color: rgba(139, 92, 246, 0.4);
  }

  .action-card:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .action-card i {
    font-size: 24px;
    color: var(--theme-accent);
  }

  .action-card span {
    line-height: 1.3;
  }

  .action-card.danger {
    border-color: rgba(239, 68, 68, 0.3);
  }

  .action-card.danger i {
    color: #ef4444;
  }

  .action-card.danger:active:not(:disabled) {
    background: rgba(239, 68, 68, 0.2);
    border-color: rgba(239, 68, 68, 0.4);
  }

  .mobile-toast {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    margin: 12px 16px;
    padding: 12px 16px;
    background: rgba(34, 197, 94, 0.2);
    border: 1px solid rgba(34, 197, 94, 0.4);
    border-radius: 12px;
    color: #86efac;
    font-size: var(--font-size-sm);
    font-weight: 500;
    animation: fadeIn var(--duration-normal) ease;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  /* Accessibility: Respect user's motion preferences (WCAG AAA) */
  @media (prefers-reduced-motion: reduce) {
    .mobile-toast {
      animation: none;
    }
  }
</style>
