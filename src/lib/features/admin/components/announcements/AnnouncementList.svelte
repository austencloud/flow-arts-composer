<!--
  AnnouncementList - Display List of Announcements

  Shows all announcements with edit/delete actions.
-->
<script lang="ts">
  import type { Announcement } from "../../domain/models/announcement-models";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";

  interface Props {
    announcements: Announcement[];
    onEdit: (announcement: Announcement) => void;
    onDelete: (id: string) => void;
  }

  let { announcements, onEdit, onDelete }: Props = $props();

  function getSeverityColor(severity: Announcement["severity"]): string {
    switch (severity) {
      case "critical":
        return "var(--semantic-error)";
      case "warning":
        return "var(--semantic-warning)";
      case "info":
        return "var(--theme-accent, var(--theme-accent))";
    }
  }

  function formatDate(date: Date): string {
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }
</script>

<div class="announcement-list">
  {#if announcements.length === 0}
    <div class="empty-state">
      <i class="fas fa-bullhorn" aria-hidden="true"></i>
      <p>{t("admin_no_announcements")}</p>
      <span>{t("admin_create_first")}</span>
    </div>
  {:else}
    <div class="announcements-grid">
      {#each announcements as announcement (announcement.id)}
        <div class="announcement-card">
          <div class="card-header">
            <div class="header-left">
              <span
                class="severity-badge"
                style="background: {getSeverityColor(announcement.severity)};"
              >
                {announcement.severity}
              </span>
              {#if announcement.showAsModal}
                <span class="modal-badge">
                  <i class="fas fa-window-restore" aria-hidden="true"></i>
                  {t("admin_modal")}
                </span>
              {/if}
            </div>
            <div class="header-actions">
              <button
                class="action-button edit"
                onclick={() => onEdit(announcement)}
                aria-label={t("admin_edit_aria")}
              >
                <i class="fas fa-edit" aria-hidden="true"></i>
              </button>
              <button
                class="action-button delete"
                onclick={() => onDelete(announcement.id)}
                aria-label={t("admin_delete_aria")}
              >
                <i class="fas fa-trash" aria-hidden="true"></i>
              </button>
            </div>
          </div>

          <div class="card-content">
            <h3 class="announcement-title">{announcement.title}</h3>
            <p class="announcement-message">{announcement.message}</p>
          </div>

          <div class="card-footer">
            <div class="footer-info">
              <span class="target-audience">
                <i class="fas fa-users" aria-hidden="true"></i>
                {announcement.targetAudience}
              </span>
              <span class="created-date">
                <i class="fas fa-calendar" aria-hidden="true"></i>
                {formatDate(announcement.createdAt)}
              </span>
            </div>
            {#if announcement.expiresAt}
              <span class="expires-date">
                <i class="fas fa-clock" aria-hidden="true"></i>
                {t("admin_expires", { date: formatDate(announcement.expiresAt) })}
              </span>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .announcement-list {
    width: 100%;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 48px 24px;
    color: var(--theme-text-dim);
    text-align: center;
  }

  .empty-state i {
    font-size: var(--font-size-3xl);
    opacity: 0.5;
  }

  .empty-state p {
    font-size: var(--font-size-base);
    font-weight: 500;
    margin: 0;
  }

  .empty-state span {
    font-size: var(--font-size-sm);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
  }

  .announcements-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
    gap: 16px;
  }

  .announcement-card {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px;
    background: var(--theme-panel-bg, rgba(255, 255, 255, 0.03));
    border: 1px solid var(--theme-stroke);
    border-radius: 12px;
    transition: all var(--duration-normal) ease;
  }

  .announcement-card:hover {
    border-color: color-mix(
      in srgb,
      var(--theme-text, #ffffff) 20%,
      transparent
    );
    background: var(--theme-card-bg);
  }

  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .severity-badge {
    padding: 4px 12px;
    font-size: var(--font-size-compact);
    font-weight: 700;
    text-transform: uppercase;
    color: white;
    border-radius: 6px;
    letter-spacing: 0.5px;
  }

  .modal-badge {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    background: color-mix(
      in srgb,
      var(--theme-accent, var(--theme-accent)) 20%,
      transparent
    );
    border: 1px solid
      color-mix(
        in srgb,
        var(--theme-accent, var(--theme-accent)) 30%,
        transparent
      );
    border-radius: 6px;
    color: color-mix(
      in srgb,
      var(--theme-accent, var(--theme-accent)) 120%,
      white
    );
    font-size: var(--font-size-compact);
    font-weight: 600;
  }

  .header-actions {
    display: flex;
    gap: 8px;
  }

  .action-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--min-touch-target); /* WCAG AA touch target */
    height: var(--min-touch-target);
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 8px;
    color: var(--theme-text-dim);
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .action-button:hover {
    background: color-mix(in srgb, var(--theme-text, #ffffff) 10%, transparent);
    border-color: color-mix(
      in srgb,
      var(--theme-text, #ffffff) 20%,
      transparent
    );
  }

  .action-button.delete:hover {
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 20%,
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 40%,
      transparent
    );
    color: var(--semantic-error);
  }

  .action-button.edit:hover {
    background: color-mix(in srgb, var(--theme-accent) 20%, transparent);
    border-color: color-mix(
      in srgb,
      var(--theme-accent, var(--theme-accent)) 40%,
      transparent
    );
    color: color-mix(
      in srgb,
      var(--theme-accent, var(--theme-accent)) 120%,
      white
    );
  }

  .card-content {
    flex: 1;
  }

  .announcement-title {
    font-size: var(--font-size-base);
    font-weight: 600;
    color: var(--theme-text, rgba(255, 255, 255, 0.95));
    margin: 0 0 8px 0;
  }

  .announcement-message {
    font-size: var(--font-size-sm);
    color: var(--theme-text-dim);
    margin: 0;
    line-height: 1.5;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
  }

  .card-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: 12px;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
  }

  .footer-info {
    display: flex;
    gap: 16px;
  }

  .footer-info span,
  .expires-date {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim);
  }

  .footer-info i,
  .expires-date i {
    font-size: var(--font-size-compact);
  }

  .target-audience {
    text-transform: capitalize;
  }

  .expires-date {
    color: color-mix(
      in srgb,
      var(--semantic-warning, #fbbf24) 80%,
      transparent
    );
  }

  @media (max-width: 768px) {
    .announcements-grid {
      grid-template-columns: 1fr;
    }

    .card-footer {
      flex-direction: column;
      align-items: flex-start;
      gap: 8px;
    }
  }
</style>
