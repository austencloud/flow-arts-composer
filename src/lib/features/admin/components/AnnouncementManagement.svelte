<!--
  AnnouncementManagement - Admin Interface for System Announcements

  Allows admins to create, edit, and manage system-wide announcements.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import {
    getAllAnnouncements,
    deleteAnnouncement,
  } from "#lib/features/admin/services/announcement-manager.js";
  import type { Announcement } from "../domain/models/announcement-models";
  import AnnouncementForm from "./announcements/AnnouncementForm.svelte";
  import AnnouncementList from "./announcements/AnnouncementList.svelte";
  import AdminModal from "#lib/shared/admin/components/AdminModal.svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";

  // State
  let announcements = $state<Announcement[]>([]);
  let selectedAnnouncement = $state<Announcement | null>(null);
  let isLoading = $state(true);
  let showForm = $state(false);

  // Delete confirmation modal state
  let showDeleteModal = $state(false);
  let pendingDeleteId = $state<string | null>(null);

  onMount(async () => {
    try {
      await loadAnnouncements();
    } catch (error) {
      console.error("Failed to initialize announcement service:", error);
    } finally {
      isLoading = false;
    }
  });

  async function loadAnnouncements() {
    try {
      isLoading = true;
      announcements = await getAllAnnouncements();
    } catch (error) {
      console.error("Failed to load announcements:", error);
    } finally {
      isLoading = false;
    }
  }

  function handleCreateNew() {
    selectedAnnouncement = null;
    showForm = true;
  }

  function handleEdit(announcement: Announcement) {
    selectedAnnouncement = announcement;
    showForm = true;
  }

  function handleDeleteRequest(announcementId: string) {
    pendingDeleteId = announcementId;
    showDeleteModal = true;
  }

  async function confirmDelete() {
    if (!pendingDeleteId) return;

    try {
      await deleteAnnouncement(pendingDeleteId);
      await loadAnnouncements();
    } catch (error) {
      console.error("Failed to delete announcement:", error);
    } finally {
      showDeleteModal = false;
      pendingDeleteId = null;
    }
  }

  function cancelDelete() {
    showDeleteModal = false;
    pendingDeleteId = null;
  }

  async function handleSave() {
    showForm = false;
    selectedAnnouncement = null;
    await loadAnnouncements();
  }

  function handleCancel() {
    showForm = false;
    selectedAnnouncement = null;
  }
</script>

<div class="announcement-management">
  {#if isLoading}
    <div class="loading-state">
      <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
      <p>{t("admin_loading_announcements")}</p>
    </div>
  {:else if showForm}
    <AnnouncementForm
      announcement={selectedAnnouncement}
      onSave={handleSave}
      onCancel={handleCancel}
    />
  {:else}
    <div class="management-header">
      <h2>{t("admin_system_announcements")}</h2>
      <button class="create-button" onclick={handleCreateNew}>
        <i class="fas fa-plus" aria-hidden="true"></i>
        {t("admin_create_announcement_btn")}
      </button>
    </div>

    <AnnouncementList
      {announcements}
      onEdit={handleEdit}
      onDelete={handleDeleteRequest}
    />
  {/if}
</div>

{#if showDeleteModal}
  <AdminModal
    title={t("admin_delete_announcement")}
    message={t("admin_confirm_delete_announcement")}
    variant="danger"
    confirmLabel={t("action_delete")}
    cancelLabel={t("action_cancel")}
    onConfirm={confirmDelete}
    onCancel={cancelDelete}
  />
{/if}

<style>
  .announcement-management {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 24px;
    overflow-y: auto;
  }

  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    padding: 48px;
    color: var(--theme-text-dim);
  }

  .loading-state i {
    font-size: var(--font-size-3xl);
  }

  .management-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 24px;
  }

  .management-header h2 {
    font-size: var(--font-size-2xl);
    font-weight: 600;
    color: var(--theme-text);
    margin: 0;
  }

  .create-button {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 20px;
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--theme-accent, var(--theme-accent)) 120%, white)
        0%,
      var(--theme-accent, var(--theme-accent)) 100%
    );
    border: none;
    border-radius: 10px;
    color: white;
    font-size: var(--font-size-sm);
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .create-button:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 16px
      color-mix(
        in srgb,
        var(--theme-accent, var(--theme-accent)) 40%,
        transparent
      );
  }

  .create-button:active {
    transform: translateY(0);
  }

  .announcement-management::-webkit-scrollbar {
    width: 8px;
  }

  .announcement-management::-webkit-scrollbar-track {
    background: var(--scrollbar-track);
    border-radius: 4px;
  }

  .announcement-management::-webkit-scrollbar-thumb {
    background: var(--scrollbar-thumb);
    border-radius: 4px;
  }

  .announcement-management::-webkit-scrollbar-thumb:hover {
    background: var(--scrollbar-thumb-hover);
  }

  @media (max-width: 640px) {
    .announcement-management {
      padding: 16px;
    }

    .management-header {
      flex-direction: column;
      align-items: stretch;
      gap: 12px;
    }

    .management-header h2 {
      font-size: var(--font-size-xl);
    }
  }
</style>
