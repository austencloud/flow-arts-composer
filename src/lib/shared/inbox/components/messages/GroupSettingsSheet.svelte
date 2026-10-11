<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  /**
   * GroupSettingsSheet
   *
   * View and manage group conversation settings.
   * Admins can add/remove members, update name, and manage admin roles.
   * All members can view participants and leave the group.
   */

  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import { onMount } from "svelte";
  import type {
    Conversation,
    ParticipantInfo,
  } from "#lib/shared/messaging/domain/models/conversation-models.js";
  import { conversationService } from "#lib/shared/messaging/services/conversation-manager.js";
  import RobustAvatar from "#lib/shared/components/avatar/RobustAvatar.svelte";
  import UserSearchInput from "#lib/shared/user-search/UserSearchInput.svelte";
  import { authState } from "#lib/shared/auth/state/auth-state.svelte.js";
  import type { HapticFeedback } from "#lib/shared/application/services/haptic-feedback.js";
  import { getUserIdentityLabels } from "#lib/shared/community/domain/user-identity-labels.js";

  interface Props {
    conversation: Conversation;
    onClose: () => void;
    onGroupLeft: () => void;
  }

  let { conversation, onClose, onGroupLeft }: Props = $props();

  // UI state
  let isEditingName = $state(false);
  let editedName = $state("");
  let isSaving = $state(false);
  let isAddingMember = $state(false);
  let error = $state<string | null>(null);
  let confirmLeave = $state(false);

  // Search state for adding members
  let searchUserId = $state("");
  let searchUserDisplay = $state("");

  // Services
  let hapticService: HapticFeedback | undefined;

  // Current user
  const currentUserId = $derived(authState.user?.uid ?? "");

  // Check if current user is admin
  const isAdmin = $derived(
    conversation.groupMetadata?.adminIds.includes(currentUserId) ?? false
  );

  const groupName = $derived(
    conversation.groupMetadata?.name || t("inbox_ui_unnamed_group")
  );

  // Get participants as array with their info
  const participants = $derived.by(() => {
    const info: Array<ParticipantInfo & { isAdmin: boolean }> = [];
    for (const userId of conversation.participants) {
      const participantInfo = conversation.participantInfo[userId];
      if (participantInfo) {
        info.push({
          ...participantInfo,
          isAdmin:
            conversation.groupMetadata?.adminIds.includes(userId) ?? false,
        });
      }
    }
    // Sort: admins first, then alphabetically
    return info.sort((a, b) => {
      if (a.isAdmin && !b.isAdmin) return -1;
      if (!a.isAdmin && b.isAdmin) return 1;
      return getUserIdentityLabels(a).primary.localeCompare(
        getUserIdentityLabels(b).primary
      );
    });
  });

  // Exclude existing participants from search
  const excludeUserIds = $derived(conversation.participants);

  onMount(() => {
    hapticService = getHapticFeedback();
    editedName = groupName;
  });

  function startEditName() {
    editedName = groupName;
    isEditingName = true;
  }

  function cancelEditName() {
    isEditingName = false;
    editedName = groupName;
  }

  async function saveName() {
    if (!editedName.trim() || editedName.trim() === groupName) {
      cancelEditName();
      return;
    }

    isSaving = true;
    error = null;

    try {
      await conversationService.updateGroupMetadata(conversation.id, {
        name: editedName.trim(),
      });
      hapticService?.trigger("success");
      isEditingName = false;
    } catch (err) {
      console.error("[GroupSettings] Failed to update name:", err);
      error = err instanceof Error ? err.message : t("inbox_ui_failed_to_update_name");
      hapticService?.trigger("error");
    } finally {
      isSaving = false;
    }
  }

  async function handleAddMember(user: {
    uid: string;
    displayName: string;
    username?: string;
    photoURL?: string;
  }) {
    if (!isAdmin) return;

    isAddingMember = true;
    error = null;

    try {
      await conversationService.addGroupMember(conversation.id, user.uid);
      hapticService?.trigger("success");
      searchUserId = "";
      searchUserDisplay = "";
    } catch (err) {
      console.error("[GroupSettings] Failed to add member:", err);
      error = err instanceof Error ? err.message : t("inbox_ui_failed_to_add_member");
      hapticService?.trigger("error");
    } finally {
      isAddingMember = false;
    }
  }

  async function removeMember(userId: string) {
    if (!isAdmin || userId === currentUserId) return;

    error = null;

    try {
      await conversationService.removeGroupMember(conversation.id, userId);
      hapticService?.trigger("success");
    } catch (err) {
      console.error("[GroupSettings] Failed to remove member:", err);
      error = err instanceof Error ? err.message : t("inbox_ui_failed_to_remove_member");
      hapticService?.trigger("error");
    }
  }

  async function toggleAdmin(userId: string) {
    if (!isAdmin || userId === currentUserId) return;

    const isCurrentlyAdmin =
      conversation.groupMetadata?.adminIds.includes(userId) ?? false;
    error = null;

    try {
      await conversationService.setAdminStatus(
        conversation.id,
        userId,
        !isCurrentlyAdmin
      );
      hapticService?.trigger("success");
    } catch (err) {
      console.error("[GroupSettings] Failed to toggle admin:", err);
      error = err instanceof Error ? err.message : t("inbox_ui_failed_to_update_admin");
      hapticService?.trigger("error");
    }
  }

  async function leaveGroup() {
    error = null;

    try {
      await conversationService.leaveGroup(conversation.id);
      hapticService?.trigger("success");
      onGroupLeft();
    } catch (err) {
      console.error("[GroupSettings] Failed to leave group:", err);
      error = err instanceof Error ? err.message : t("inbox_ui_failed_to_leave_group");
      hapticService?.trigger("error");
      confirmLeave = false;
    }
  }
</script>

<div class="group-settings">
  <div class="header">
    <button
      type="button"
      class="back-btn"
      onclick={onClose}
      aria-label={t("inbox_ui_close_settings")}
    >
      <i class="fas fa-arrow-left" aria-hidden="true"></i>
    </button>
    <h2>{t("inbox_ui_group_settings")}</h2>
  </div>

  {#if error}
    <div class="error-banner" role="alert">
      <i class="fas fa-exclamation-circle" aria-hidden="true"></i>
      <span>{error}</span>
    </div>
  {/if}

  <!-- Group Name Section -->
  <div class="section">
    <div class="section-header">
      <span class="section-label">{t("inbox_ui_group_name")}</span>
      {#if isAdmin && !isEditingName}
        <button type="button" class="edit-btn" onclick={startEditName}>
          <i class="fas fa-pencil-alt" aria-hidden="true"></i>
          {t("inbox_ui_edit")}
        </button>
      {/if}
    </div>

    {#if isEditingName}
      <div class="edit-name-form">
        <input
          type="text"
          bind:value={editedName}
          maxlength={100}
          class="name-input"
          disabled={isSaving}
        />
        <div class="edit-actions">
          <button
            type="button"
            class="btn-secondary"
            onclick={cancelEditName}
            disabled={isSaving}
          >
            {t("inbox_ui_cancel")}
          </button>
          <button
            type="button"
            class="btn-primary"
            onclick={saveName}
            disabled={isSaving || !editedName.trim()}
          >
            {#if isSaving}
              <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
            {:else}
              {t("inbox_ui_save")}
            {/if}
          </button>
        </div>
      </div>
    {:else}
      <p class="group-name-display">{groupName}</p>
    {/if}
  </div>

  <!-- Members Section -->
  <div class="section">
    <div class="section-header">
      <span class="section-label">
        {t("inbox_members", { count: participants.length })}
      </span>
    </div>

    <!-- Add Member (admin only) -->
    {#if isAdmin}
      <div class="add-member-section">
        <UserSearchInput
          selectedUserId={searchUserId}
          selectedUserDisplay={searchUserDisplay}
          onSelect={handleAddMember}
          placeholder={t("inbox_ui_add_member_by_username_or_name")}
          inlineResults={true}
          {excludeUserIds}
        />
        {#if isAddingMember}
          <div class="adding-indicator">
            <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
            {t("inbox_ui_adding")}
          </div>
        {/if}
      </div>
    {/if}

    <!-- Member List -->
    <div class="member-list">
      {#each participants as member (member.userId)}
        {@const identity = getUserIdentityLabels(member)}
        <div class="member-row">
          <RobustAvatar
            src={member.avatar}
            name={identity.primary}
            alt=""
            customSize={40}
          />
          <div class="member-info">
            <span class="member-name">
              {identity.primary}
              {#if member.userId === currentUserId}
                <span class="you-badge">{t("inbox_ui__you")}</span>
              {/if}
            </span>
            {#if identity.secondary}
              <span class="member-account-name">{identity.secondary}</span>
            {/if}
            {#if member.isAdmin}
              <span class="admin-badge">{t("inbox_ui_admin")}</span>
            {/if}
          </div>

          <!-- Admin controls -->
          {#if isAdmin && member.userId !== currentUserId}
            <div class="member-actions">
              <button
                type="button"
                class="action-btn"
                onclick={() => toggleAdmin(member.userId)}
                title={member.isAdmin ? t("inbox_ui_remove_admin") : t("inbox_ui_make_admin")}
              >
                <i
                  class="fas {member.isAdmin ? 'fa-user-shield' : 'fa-shield'}"
                  aria-hidden="true"
                ></i>
              </button>
              <button
                type="button"
                class="action-btn danger"
                onclick={() => removeMember(member.userId)}
                title={t("inbox_ui_remove_from_group")}
              >
                <i class="fas fa-user-minus" aria-hidden="true"></i>
              </button>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  </div>

  <!-- Leave Group Section -->
  <div class="section danger-section">
    {#if confirmLeave}
      <div class="confirm-leave">
        <p>{t("inbox_ui_are_you_sure_you_want_to_leave_this_group")}</p>
        <div class="confirm-actions">
          <button
            type="button"
            class="btn-secondary"
            onclick={() => (confirmLeave = false)}
          >
            {t("inbox_ui_cancel")}
          </button>
          <button type="button" class="btn-danger" onclick={leaveGroup}>
            {t("inbox_ui_leave_group")}
          </button>
        </div>
      </div>
    {:else}
      <button
        type="button"
        class="leave-btn"
        onclick={() => (confirmLeave = true)}
      >
        <i class="fas fa-sign-out-alt" aria-hidden="true"></i>
        {t("inbox_ui_leave_group")}
      </button>
    {/if}
  </div>
</div>

<style>
  .group-settings {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow-y: auto;
  }

  .header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px;
    border-bottom: 1px solid var(--theme-stroke);
  }

  .back-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    padding: 0;
    background: transparent;
    border: none;
    border-radius: 50%;
    color: var(--theme-text);
    cursor: pointer;
    transition: background var(--duration-normal) ease;
  }

  .back-btn:hover {
    background: var(--theme-card-bg);
  }

  .header h2 {
    margin: 0;
    font-size: var(--font-size-lg);
    font-weight: 600;
    color: var(--theme-text);
  }

  .error-banner {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 16px;
    padding: 12px 16px;
    background: color-mix(in srgb, var(--semantic-error) 15%, transparent);
    border: 1px solid var(--semantic-error);
    border-radius: 8px;
    color: var(--semantic-error);
    font-size: var(--font-size-sm);
  }

  .section {
    padding: 16px;
    border-bottom: 1px solid var(--theme-stroke);
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
  }

  .section-label {
    font-size: var(--font-size-compact);
    font-weight: 600;
    color: var(--theme-text-dim);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .edit-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    background: transparent;
    border: 1px solid var(--theme-stroke);
    border-radius: 6px;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact);
    cursor: pointer;
    transition:
      border-color 0.2s ease,
      color 0.2s ease;
  }

  .edit-btn:hover {
    border-color: var(--theme-accent);
    color: var(--theme-accent);
  }

  .group-name-display {
    margin: 0;
    font-size: var(--font-size-base);
    font-weight: 500;
    color: var(--theme-text);
  }

  .edit-name-form {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .name-input {
    width: 100%;
    padding: 12px 16px;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 10px;
    color: var(--theme-text);
    font-size: var(--font-size-sm);
  }

  .name-input:focus {
    outline: none;
    border-color: var(--theme-accent);
  }

  .edit-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }

  .btn-secondary,
  .btn-primary {
    padding: 8px 16px;
    border: none;
    border-radius: 6px;
    font-size: var(--font-size-sm);
    font-weight: 500;
    cursor: pointer;
    transition: filter var(--duration-normal) ease;
  }

  .btn-secondary {
    background: var(--theme-card-bg);
    color: var(--theme-text);
  }

  .btn-primary {
    background: var(--theme-accent);
    color: white;
  }

  .btn-primary:disabled,
  .btn-secondary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .add-member-section {
    margin-bottom: 16px;
  }

  .adding-indicator {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
    padding: 8px;
    color: var(--theme-text-dim);
    font-size: var(--font-size-sm);
  }

  .member-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .member-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    border-radius: 10px;
    transition: background var(--duration-normal) ease;
  }

  .member-row:hover {
    background: var(--theme-card-bg);
  }

  .member-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .member-name {
    font-size: var(--font-size-sm);
    font-weight: 500;
    color: var(--theme-text);
  }

  .member-account-name {
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact);
  }

  .you-badge {
    font-weight: normal;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact);
  }

  .admin-badge {
    display: inline-block;
    padding: 2px 8px;
    background: color-mix(in srgb, var(--theme-accent) 20%, transparent);
    border-radius: 4px;
    color: var(--theme-accent);
    font-size: var(--font-size-compact);
    font-weight: 500;
    width: fit-content;
  }

  .member-actions {
    display: flex;
    gap: 4px;
    opacity: 0;
    transition: opacity var(--duration-normal) ease;
  }

  .member-row:hover .member-actions {
    opacity: 1;
  }

  .action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    background: transparent;
    border: 1px solid var(--theme-stroke);
    border-radius: 6px;
    color: var(--theme-text-dim);
    cursor: pointer;
    transition:
      background 0.2s ease,
      border-color 0.2s ease,
      color 0.2s ease;
  }

  .action-btn:hover {
    background: var(--theme-card-bg);
    border-color: var(--theme-accent);
    color: var(--theme-accent);
  }

  .action-btn.danger:hover {
    border-color: var(--semantic-error);
    color: var(--semantic-error);
  }

  .danger-section {
    margin-top: auto;
    border-bottom: none;
  }

  .leave-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    padding: 14px;
    background: transparent;
    border: 1px solid var(--semantic-error);
    border-radius: 10px;
    color: var(--semantic-error);
    font-size: var(--font-size-sm);
    font-weight: 500;
    cursor: pointer;
    transition:
      background 0.2s ease,
      transform 0.15s ease;
  }

  .leave-btn:hover {
    background: color-mix(in srgb, var(--semantic-error) 10%, transparent);
  }

  .leave-btn:active {
    transform: scale(0.98);
  }

  .confirm-leave {
    text-align: center;
  }

  .confirm-leave p {
    margin: 0 0 16px;
    font-size: var(--font-size-sm);
    color: var(--theme-text);
  }

  .confirm-actions {
    display: flex;
    gap: 12px;
    justify-content: center;
  }

  .btn-danger {
    padding: 10px 20px;
    background: var(--semantic-error);
    border: none;
    border-radius: 8px;
    color: white;
    font-size: var(--font-size-sm);
    font-weight: 500;
    cursor: pointer;
    transition: filter var(--duration-normal) ease;
  }

  .btn-danger:hover {
    filter: brightness(1.1);
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .back-btn,
    .edit-btn,
    .action-btn,
    .leave-btn,
    .member-actions {
      transition: none !important;
    }
  }
</style>
