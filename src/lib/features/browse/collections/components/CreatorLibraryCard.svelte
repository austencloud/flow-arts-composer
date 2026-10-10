<!--
CreatorLibraryCard - Shows a creator's profile with their content preview

Displays:
- Creator avatar, name, stats
- Tabbed content: Sequences | Collections | Compositions (coming soon)
- Sequence thumbnails inline
- "View Profile" link to full profile
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import type {
    CreatorLibraryData,
    CreatorContentTab,
  } from "../state/collections-browse-state.svelte";

  import { isGoogleAvatarUrl } from "$lib/shared/foundation/utils/google-avatar";

  const {
    data,
    isExpanded = false,
    activeTab = "gallery",
    onExpand,
    onCollapse,
    onTabChange,
    onViewProfile,
    onSequenceClick,
  } = $props<{
    data: CreatorLibraryData;
    isExpanded?: boolean;
    activeTab?: CreatorContentTab;
    onExpand?: () => void;
    onCollapse?: () => void;
    onTabChange?: (tab: CreatorContentTab) => void;
    onViewProfile?: () => void;
    onSequenceClick?: (sequenceId: string) => void;
  }>();

  const { profile, publicCollections, previewSequences, publicSequenceCount } =
    $derived(data);

  // Content counts
  const sequenceCount = $derived(publicSequenceCount);
  const collectionCount = $derived(publicCollections.length);
  const compositionCount = $derived(0); // Coming soon

  // Has any content to show
  const hasContent = $derived(sequenceCount > 0 || collectionCount > 0);

  function handleCardClick() {
    if (!isExpanded && onExpand) {
      onExpand();
    }
  }

  function handleTabClick(tab: CreatorContentTab, e: MouseEvent) {
    e.stopPropagation();
    onTabChange?.(tab);
  }
</script>

<div
  class="creator-library-card"
  class:expanded={isExpanded}
  class:has-content={hasContent}
  role="article"
  aria-label={`${profile.displayName}'s library`}
>
  <!-- Header: Avatar + Info + Actions -->
  <div
    class="card-header"
    onclick={handleCardClick}
    role="button"
    tabindex="0"
    aria-expanded={isExpanded}
    aria-controls="creator-library-content-{profile.userId}"
    onkeydown={(e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleCardClick();
      }
    }}
  >
    <!-- Avatar -->
    <div class="avatar">
      {#if profile.avatar}
        <img
          src={profile.avatar}
          alt={profile.displayName}
          crossorigin={isGoogleAvatarUrl(profile.avatar)
            ? undefined
            : "anonymous"}
          referrerpolicy="no-referrer"
          onerror={(e) => {
            const img = e.currentTarget as HTMLImageElement;
            img.style.display = "none";
            const fallback = img.nextElementSibling as HTMLElement;
            if (fallback) fallback.style.display = "flex";
          }}
        />
        <div class="avatar-fallback" style="display: none;" aria-hidden="true">
          <i class="fas fa-user" aria-hidden="true"></i>
        </div>
      {:else}
        <div class="avatar-fallback" aria-hidden="true">
          <i class="fas fa-user" aria-hidden="true"></i>
        </div>
      {/if}
    </div>

    <!-- Creator Info -->
    <div class="creator-info">
      <h3 class="display-name">{profile.displayName}</h3>
      <p class="username">@{profile.username}</p>
      <div class="stats">
        <span class="stat" title={t("tab_browse_sequences")}>
          <i class="fas fa-list" aria-hidden="true"></i>
          {sequenceCount}
        </span>
        <span class="stat" title={t("tab_library_collections")}>
          <i class="fas fa-folder" aria-hidden="true"></i>
          {collectionCount}
        </span>
        <span class="stat" title={t("browse_ui_followers")}>
          <i class="fas fa-users" aria-hidden="true"></i>
          {profile.followerCount}
        </span>
      </div>
    </div>

    <!-- View Profile Button -->
    <button
      type="button"
      class="view-profile-btn"
      onclick={(e) => {
        e.stopPropagation();
        onViewProfile?.();
      }}
      aria-label={t("browse_ui_view_full_profile")}
    >
      <i class="fas fa-user-circle" aria-hidden="true"></i>
      <span>{t("browse_ui_profile")}</span>
    </button>
  </div>

  <!-- Content Area (always visible, expands on click) -->
  {#if hasContent}
    <div class="content-area" id="creator-library-content-{profile.userId}">
      <!-- Content Tabs -->
      <div
        class="content-tabs"
        role="tablist"
        aria-label={t("browse_ui_creator_content_tabs")}
      >
        <button
          type="button"
          role="tab"
          id="tab-sequences-{profile.userId}"
          class="tab"
          class:active={activeTab === "gallery"}
          aria-selected={activeTab === "gallery"}
          aria-controls="panel-sequences-{profile.userId}"
          tabindex={activeTab === "gallery" ? 0 : -1}
          onclick={(e) => handleTabClick("gallery", e)}
        >
          {t("tab_library_sequences")}
          <span class="count">{sequenceCount}</span>
        </button>
        <button
          type="button"
          role="tab"
          id="tab-collections-{profile.userId}"
          class="tab"
          class:active={activeTab === "collections"}
          aria-selected={activeTab === "collections"}
          aria-controls="panel-collections-{profile.userId}"
          tabindex={activeTab === "collections" ? 0 : -1}
          onclick={(e) => handleTabClick("collections", e)}
        >
          {t("tab_library_collections")}
          <span class="count">{collectionCount}</span>
        </button>
        <button
          type="button"
          role="tab"
          id="tab-compositions-{profile.userId}"
          class="tab disabled"
          disabled
          aria-selected={false}
          aria-disabled="true"
          tabindex={-1}
          title={t("browse_ui_coming_soon")}
        >
          {t("browse_verified_compositions")}
          <span class="count">0</span>
        </button>
      </div>

      <!-- Tab Content -->
      <div
        class="tab-content"
        role="tabpanel"
        id="panel-{activeTab}-{profile.userId}"
        aria-labelledby="tab-{activeTab}-{profile.userId}"
      >
        {#if activeTab === "gallery"}
          {#if previewSequences.length > 0}
            <div class="sequence-grid">
              {#each previewSequences as sequence (sequence.id)}
                <button
                  type="button"
                  class="sequence-thumbnail"
                  onclick={(e) => {
                    e.stopPropagation();
                    onSequenceClick?.(sequence.id);
                  }}
                  aria-label={sequence.name || sequence.word}
                >
                  {#if sequence.thumbnails?.[0]}
                    <img
                      src={sequence.thumbnails[0]}
                      alt={sequence.name || sequence.word}
                    />
                  {:else}
                    <div class="thumbnail-placeholder">
                      <i class="fas fa-image" aria-hidden="true"></i>
                    </div>
                  {/if}
                  <span class="sequence-name"
                    >{sequence.word || sequence.name}</span
                  >
                </button>
              {/each}
              {#if sequenceCount > previewSequences.length}
                <button
                  type="button"
                  class="see-all-btn"
                  onclick={(e) => {
                    e.stopPropagation();
                    onViewProfile?.();
                  }}
                >
                  <span class="see-all-count"
                    >+{sequenceCount - previewSequences.length}</span
                  >
                  <span class="see-all-text">{t("browse_ui_see_all")}</span>
                </button>
              {/if}
            </div>
          {:else}
            <p class="empty-message">
              {t("browse_ui_no_public_sequences_yet")}
            </p>
          {/if}
        {:else if activeTab === "collections"}
          {#if publicCollections.length > 0}
            <div class="collection-list">
              {#each publicCollections as collection (collection.id)}
                <div class="collection-item">
                  <i
                    class={collection.icon || "fas fa-folder"}
                    style="color: {collection.color || 'inherit'}"
                  ></i>
                  <span class="collection-name">{collection.name}</span>
                  <span class="collection-count"
                    >{collection.sequenceCount}</span
                  >
                </div>
              {/each}
            </div>
          {:else}
            <p class="empty-message">{t("browse_ui_no_public_collections")}</p>
          {/if}
        {/if}
      </div>
    </div>
  {:else}
    <div class="no-content">
      <p>{t("browse_ui_no_public_content_yet")}</p>
    </div>
  {/if}
</div>

<style>
  .creator-library-card {
    display: flex;
    flex-direction: column;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 16px;
    overflow: hidden;
    transition: all var(--duration-normal) ease;
  }

  .creator-library-card:hover {
    background: var(--theme-card-hover-bg);
    border-color: var(--theme-stroke-strong);
  }

  .creator-library-card.has-content {
    cursor: default;
  }

  /* Header */
  .card-header {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 16px;
    background: transparent;
    border: none;
    width: 100%;
    text-align: left;
    cursor: pointer;
    transition: background var(--duration-normal) ease;
  }

  .card-header:hover {
    background: color-mix(in srgb, var(--theme-text, white) 2%, transparent);
  }

  /* Avatar */
  .avatar {
    width: var(--min-touch-target);
    height: var(--min-touch-target);
    flex-shrink: 0;
  }

  .avatar img,
  .avatar-fallback {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    object-fit: cover;
  }

  .avatar-fallback {
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--theme-card-hover-bg);
    border: 2px solid var(--theme-stroke-strong);
  }

  .avatar-fallback i {
    font-size: var(--font-size-2xl);
    color: var(--theme-text-dim);
  }

  /* Creator info */
  .creator-info {
    flex: 1;
    min-width: 0;
  }

  .display-name {
    margin: 0;
    font-size: var(--font-size-base);
    font-weight: 600;
    color: var(--theme-text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .username {
    margin: 2px 0 0 0;
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim, var(--theme-text-dim));
  }

  .stats {
    display: flex;
    gap: 12px;
    margin-top: 6px;
  }

  .stat {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim, var(--theme-text-dim));
  }

  .stat i {
    font-size: var(--font-size-compact);
  }

  /* View profile button */
  .view-profile-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    background: var(--theme-card-bg, var(--theme-card-bg));
    border: 1px solid var(--theme-stroke);
    border-radius: 8px;
    color: var(--theme-text-dim, var(--theme-text-dim));
    font-size: var(--font-size-compact);
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .view-profile-btn:hover {
    background: var(--theme-card-hover-bg);
    color: var(--theme-text, white);
  }

  .view-profile-btn span {
    display: none;
  }

  /* Content area */
  .content-area {
    border-top: 1px solid var(--theme-stroke);
  }

  /* Content tabs */
  .content-tabs {
    display: flex;
    gap: 4px;
    padding: 8px 16px;
    background: rgba(0, 0, 0, 0.1);
  }

  .tab {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    background: transparent;
    border: none;
    border-radius: 6px;
    color: var(--theme-text-dim, var(--theme-text-dim));
    font-size: var(--font-size-compact);
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-fast) ease;
  }

  .tab:hover:not(.disabled) {
    background: color-mix(in srgb, var(--theme-text, white) 6%, transparent);
    color: var(--theme-text, white);
  }

  .tab.active {
    background: var(--theme-card-hover-bg);
    color: var(--theme-text, white);
  }

  .tab.disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .tab .count {
    padding: 2px 6px;
    background: var(--theme-card-hover-bg);
    border-radius: 10px;
    font-size: var(--font-size-compact);
  }

  /* Tab content */
  .tab-content {
    padding: 12px 16px 16px;
  }

  /* Sequence grid */
  .sequence-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
    gap: 8px;
  }

  .sequence-thumbnail {
    position: relative;
    aspect-ratio: 1;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 8px;
    overflow: hidden;
    cursor: pointer;
    transition: all var(--duration-fast) ease;
  }

  .sequence-thumbnail:hover {
    border-color: var(--theme-stroke-strong);
    transform: scale(1.02);
  }

  .sequence-thumbnail img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .thumbnail-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--theme-text-dim);
  }

  .sequence-name {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    padding: 4px 6px;
    background: linear-gradient(transparent, rgba(0, 0, 0, 0.8));
    font-size: var(--font-size-compact);
    color: var(--theme-text, white);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* See all button */
  .see-all-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    aspect-ratio: 1;
    background: color-mix(in srgb, var(--theme-accent) 15%, transparent);
    border: 1px dashed color-mix(in srgb, var(--theme-accent) 40%, transparent);
    border-radius: 8px;
    color: var(--theme-accent);
    cursor: pointer;
    transition: all var(--duration-fast) ease;
  }

  .see-all-btn:hover {
    background: color-mix(in srgb, var(--theme-accent) 25%, transparent);
    border-color: color-mix(in srgb, var(--theme-accent) 60%, transparent);
  }

  .see-all-count {
    font-size: var(--font-size-base);
    font-weight: 600;
  }

  .see-all-text {
    font-size: var(--font-size-compact);
  }

  /* Collection list */
  .collection-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .collection-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    background: var(--theme-card-bg);
    border-radius: 8px;
  }

  .collection-item i {
    font-size: var(--font-size-sm);
  }

  .collection-name {
    flex: 1;
    font-size: var(--font-size-compact);
    color: var(--theme-text, white);
  }

  .collection-count {
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim, var(--theme-text-dim));
  }

  /* Empty/no content states */
  .empty-message,
  .no-content {
    text-align: center;
    padding: 20px;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact);
  }

  .no-content {
    border-top: 1px solid var(--theme-stroke);
  }

  /* Responsive */
  @media (min-width: 640px) {
    .view-profile-btn span {
      display: inline;
    }

    .sequence-grid {
      grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
    }
  }
</style>
