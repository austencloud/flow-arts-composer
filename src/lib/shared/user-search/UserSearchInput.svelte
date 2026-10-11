<!--
  UserSearchInput - Shared user search with autocomplete

  Reusable component for searching users by name or email.
  Uses UserSearcher service for efficient Firestore queries.

  The typing/debounce/keyboard/ARIA behavior lives in AsyncSuggestionCombobox.
  This component contributes the user-shaped parts: the Firestore query, the
  avatar row, and the wording of the empty state.
-->
<script lang="ts">
  import AsyncSuggestionCombobox from "#lib/shared/ui/components/AsyncSuggestionCombobox.svelte";
  import { searchUsers as searchUsersService } from "./services/user-searcher";
  import RobustAvatar from "#lib/shared/components/avatar/RobustAvatar.svelte";
  import type { UserSearchResult } from "./services/types";

  type UserResult = UserSearchResult;

  interface Props {
    selectedUserId?: string;
    selectedUserDisplay?: string;
    onSelect: (user: UserResult) => void;
    placeholder?: string;
    disabled?: boolean;
    useFixedPosition?: boolean;
    inlineResults?: boolean;
    excludeUserIds?: string[];
    autofocus?: boolean;
  }

  let {
    selectedUserId = "",
    selectedUserDisplay = "",
    onSelect,
    placeholder = "Search by name or email...",
    disabled = false,
    useFixedPosition = false,
    inlineResults = false,
    excludeUserIds = [],
    autofocus = false,
  }: Props = $props();

  async function searchUsers(queryText: string): Promise<UserResult[]> {
    return searchUsersService(queryText, {
      excludeUserIds,
      limit: 10,
    });
  }
</script>

<AsyncSuggestionCombobox
  search={searchUsers}
  getKey={(user: UserResult) => user.uid}
  getLabel={(user: UserResult) => user.displayName || user.username || ""}
  isSelected={(user: UserResult) => user.uid === selectedUserId}
  {onSelect}
  {placeholder}
  {disabled}
  {useFixedPosition}
  {inlineResults}
  {autofocus}
  selectedLabel={selectedUserDisplay}
  name="user-search-query"
  ariaLabel="Search users"
  emptyMessage="No users found"
  announceCount={(count: number) =>
    `${count} user${count === 1 ? "" : "s"} found`}
>
  {#snippet row(user: UserResult, state: { active: boolean; selected: boolean })}
    <span class="result-avatar">
      <RobustAvatar
        src={user.photoURL}
        name={user.displayName || user.username || "User"}
        alt=""
        customSize={36}
      />
    </span>
    <div class="result-info">
      <span class="result-name">{user.displayName || "No name"}</span>
      <span class="result-username">@{user.username || user.uid.slice(0, 8)}</span
      >
    </div>
    <i
      class="fas fa-check result-check"
      class:lit={state.active || state.selected}
      aria-hidden="true"
    ></i>
  {/snippet}

  {#snippet empty()}
    <i class="fas fa-user-slash" aria-hidden="true"></i>
    No users found
  {/snippet}
</AsyncSuggestionCombobox>

<style>
  .result-avatar {
    display: flex;
    flex-shrink: 0;
  }

  .result-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    min-width: 0;
  }

  .result-name {
    color: rgba(255, 255, 255, 0.95);
    font-size: var(--font-size-sm);
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .result-username {
    color: rgba(255, 255, 255, 0.75);
    font-size: var(--font-size-compact);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .result-check {
    color: var(--theme-text-dim); /* Improved contrast for WCAG AAA */
    font-size: var(--font-size-sm);
    opacity: 0;
    transition: opacity var(--duration-fast) ease;
    flex-shrink: 0;
  }

  /* Hover is covered too: the combobox marks the hovered row active. */
  .result-check.lit {
    opacity: 1;
    color: var(--theme-accent, var(--theme-accent));
  }
</style>
