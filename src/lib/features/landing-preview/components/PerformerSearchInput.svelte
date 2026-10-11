<!--
  PerformerSearchInput - Search users OR add external performers

  Allows searching for existing users in the system,
  or adding external performers by Instagram handle or name.
-->
<script lang="ts">
  import { onDestroy } from "svelte";
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import { searchUsers } from "#lib/shared/user-search/services/user-searcher.js";
  import RobustAvatar from "#lib/shared/components/avatar/RobustAvatar.svelte";
  import type { UserSearchResult } from "#lib/shared/user-search/services/types.js";
  import type { VideoPerformer } from "../types";

  interface Props {
    onSelect: (performer: VideoPerformer) => void;
    placeholder?: string;
    excludeUserIds?: string[];
    autofocus?: boolean;
  }

  let {
    onSelect,
    placeholder = "Search users or @instagram...",
    excludeUserIds = [],
    autofocus = false,
  }: Props = $props();

  let inputElement: HTMLInputElement | undefined = $state();
  let searchQuery = $state("");
  let searchResults = $state<UserSearchResult[]>([]);
  let isSearching = $state(false);
  let showResults = $state(false);
  let searchTimeout: number | null = null;

  // Detect if query is an Instagram handle
  const isInstagramQuery = $derived(searchQuery.trim().startsWith("@"));
  const instagramHandle = $derived(
    isInstagramQuery ? searchQuery.trim().slice(1).toLowerCase() : null
  );

  // Services
  const hapticService = getHapticFeedback();

  // Auto-focus when requested
  $effect(() => {
    if (autofocus && inputElement) {
      requestAnimationFrame(() => {
        inputElement?.focus();
      });
    }
  });

  async function handleSearchInput() {
    const q = searchQuery.trim();

    // For @ handles, don't search users - just show the "add external" option
    if (q.startsWith("@")) {
      searchResults = [];
      showResults = q.length > 1; // Show only if there's something after @
      return;
    }

    if (!q || q.length < 2) {
      searchResults = [];
      showResults = false;
      return;
    }

    // Debounce search
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }

    searchTimeout = window.setTimeout(async () => {
      isSearching = true;
      try {
        searchResults = await searchUsers(q, {
          excludeUserIds,
          limit: 10,
        });
        showResults = true;
      } catch (error) {
        console.error("Failed to search users:", error);
        searchResults = [];
      } finally {
        isSearching = false;
      }
    }, 300);
  }

  function handleSelectUser(user: UserSearchResult) {
    hapticService?.trigger("selection");
    onSelect({
      id: user.uid,
      displayName: user.displayName || user.username || "Unknown",
      isExternal: false,
    });
    resetState();
  }

  function handleAddExternal() {
    if (!instagramHandle) return;
    hapticService?.trigger("selection");

    // Generate a stable ID from the Instagram handle
    const externalId = `ig:${instagramHandle}`;

    onSelect({
      id: externalId,
      displayName: `@${instagramHandle}`,
      isExternal: true,
      instagramHandle: instagramHandle,
    });
    resetState();
  }

  function handleAddCustomName() {
    const name = searchQuery.trim();
    if (!name || name.startsWith("@")) return;
    hapticService?.trigger("selection");

    // Generate a stable ID from the name
    const externalId = `ext:${name.toLowerCase().replace(/\s+/g, "-")}`;

    onSelect({
      id: externalId,
      displayName: name,
      isExternal: true,
    });
    resetState();
  }

  function resetState() {
    searchQuery = "";
    searchResults = [];
    showResults = false;
  }

  // Cancel a pending debounced search if the component unmounts mid-flight,
  // so the callback can't fire on a destroyed component.
  onDestroy(() => {
    if (searchTimeout) {
      clearTimeout(searchTimeout);
      searchTimeout = null;
    }
  });

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      if (isInstagramQuery && instagramHandle) {
        handleAddExternal();
      } else if (searchResults.length === 0 && searchQuery.trim()) {
        handleAddCustomName();
      }
    }
  }
</script>

<div class="performer-search" role="search">
  <div class="search-input-wrapper">
    <i class="fas fa-search search-icon" aria-hidden="true"></i>
    <input
      type="search"
      class="search-input"
      name="performer-search-query"
      bind:this={inputElement}
      bind:value={searchQuery}
      oninput={handleSearchInput}
      onkeydown={handleKeydown}
      {placeholder}
      autocomplete="off"
      aria-label="Search performers"
      data-1p-ignore
      data-lpignore="true"
      data-form-type="other"
    />
    {#if isSearching}
      <i class="fas fa-spinner fa-spin loading-icon" aria-hidden="true"></i>
    {/if}
  </div>

  <!-- Hint text -->
  <p class="search-hint">
    Search users, type @handle for Instagram, or enter a name
  </p>

  {#if showResults}
    <div class="search-results" role="listbox" aria-label="Search results">
      <!-- Instagram handle option -->
      {#if isInstagramQuery && instagramHandle}
        <button
          type="button"
          class="result-item external"
          onclick={handleAddExternal}
        >
          <div class="external-icon">
            <i class="fab fa-instagram" aria-hidden="true"></i>
          </div>
          <div class="result-info">
            <span class="result-name">@{instagramHandle}</span>
            <span class="result-email">Add as external performer</span>
          </div>
          <i class="fas fa-plus result-action" aria-hidden="true"></i>
        </button>
      {/if}

      <!-- User search results -->
      {#each searchResults as user (user.uid)}
        <button
          type="button"
          class="result-item"
          role="option"
          aria-selected="false"
          onclick={() => handleSelectUser(user)}
        >
          <RobustAvatar
            src={user.photoURL}
            name={user.displayName || user.username || "User"}
            alt=""
            customSize={36}
          />
          <div class="result-info">
            <span class="result-name">{user.displayName || "No name"}</span>
            <span class="result-username">@{user.username || user.uid.slice(0, 8)}</span>
          </div>
          <i class="fas fa-check result-action" aria-hidden="true"></i>
        </button>
      {/each}

      <!-- Add as custom name option (when no results and not @handle) -->
      {#if !isInstagramQuery && searchResults.length === 0 && searchQuery.trim().length >= 2}
        <button
          type="button"
          class="result-item external"
          onclick={handleAddCustomName}
        >
          <div class="external-icon">
            <i class="fas fa-user-plus" aria-hidden="true"></i>
          </div>
          <div class="result-info">
            <span class="result-name">{searchQuery.trim()}</span>
            <span class="result-email">Add as external performer</span>
          </div>
          <i class="fas fa-plus result-action" aria-hidden="true"></i>
        </button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .performer-search {
    position: relative;
    width: 100%;
  }

  .search-input-wrapper {
    position: relative;
    display: flex;
    align-items: center;
  }

  .search-icon {
    position: absolute;
    left: 16px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.75));
    font-size: var(--font-size-sm, 14px);
    pointer-events: none;
  }

  .loading-icon {
    position: absolute;
    right: 16px;
    color: var(--theme-text-dim);
    font-size: var(--font-size-sm, 14px);
  }

  .search-input {
    width: 100%;
    min-height: var(--min-touch-target, 48px);
    padding: 0 48px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 2px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 12px;
    color: var(--theme-text, #fff);
    font-size: var(--font-size-sm, 14px);
    transition: all 0.2s ease;
  }

  .search-input:focus {
    outline: none;
    border-color: var(--theme-accent, #6366f1);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--theme-accent, #6366f1) 20%, transparent);
  }

  .search-input::placeholder {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
  }

  .search-hint {
    margin: 8px 0 0;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
  }

  .search-results {
    margin-top: 8px;
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    border: 2px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 12px;
    overflow: hidden;
    max-height: 280px;
    overflow-y: auto;
  }

  .result-item {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: var(--min-touch-target, 48px);
    padding: 10px 16px;
    background: transparent;
    border: none;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.05));
    cursor: pointer;
    transition: all 0.15s ease;
    text-align: left;
    color: var(--theme-text, #fff);
  }

  .result-item:last-child {
    border-bottom: none;
  }

  .result-item:hover {
    background: color-mix(in srgb, var(--theme-accent, #6366f1) 15%, transparent);
  }

  .result-item.external {
    background: rgba(225, 48, 108, 0.08);
  }

  .result-item.external:hover {
    background: rgba(225, 48, 108, 0.15);
  }

  .external-icon {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888);
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-size: 16px;
    flex-shrink: 0;
  }

  .result-item.external:not(:first-child) .external-icon {
    background: var(--theme-accent, #6366f1);
  }

  .result-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    min-width: 0;
  }

  .result-name {
    color: var(--theme-text, rgba(255, 255, 255, 0.95));
    font-size: var(--font-size-sm, 14px);
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .result-email,
  .result-username {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    font-size: var(--font-size-compact, 12px);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .result-action {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
    font-size: var(--font-size-sm, 14px);
    opacity: 0;
    transition: opacity 0.15s ease;
    flex-shrink: 0;
  }

  .result-item:hover .result-action {
    opacity: 1;
    color: var(--theme-accent, #6366f1);
  }
</style>
