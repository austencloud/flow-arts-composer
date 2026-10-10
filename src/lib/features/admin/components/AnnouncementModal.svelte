<!--
  AnnouncementModal - Modal for Forced Announcement Display

  Shows important announcements that require user dismissal.
-->
<script lang="ts">
  import { authState } from "#lib/shared/auth/state/auth-state.svelte.js";
  import { dismissAnnouncement } from "#lib/features/admin/services/announcement-manager.js";
  import type { Announcement } from "../domain/models/announcement-models";
  import { handleModuleChange } from "#lib/shared/navigation-coordinator/navigation-coordinator.svelte.js";
  import { navigationState } from "#lib/shared/navigation/state/navigation-state.svelte.js";
  import type { ModuleId } from "#lib/shared/navigation/domain/types.js";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";

  interface Props {
    announcement: Announcement;
    onDismiss: () => void;
  }

  let { announcement, onDismiss }: Props = $props();

  // Check if URL is internal (starts with /)
  function isInternalUrl(url: string): boolean {
    return url.startsWith("/");
  }

  async function handleInternalNavigation(url: string) {
    // Parse the URL to extract module and tab
    // Expected format: /settings?tab=release-notes or /module?tab=tabname
    const [path, queryString] = url.split("?");
    const moduleId = (path ?? "").replace("/", "") as ModuleId;

    const params = new URLSearchParams(queryString || "");
    const tab = params.get("tab");

    // Navigate to module
    await handleModuleChange(moduleId);

    // Set tab if specified
    if (tab) {
      // Small delay to ensure module is loaded
      setTimeout(() => {
        navigationState.setActiveTab(tab);
      }, 100);
    }

    // Dismiss the announcement
    await handleDismiss();
  }

  async function handleDismiss() {
    if (!authState.user) return;

    try {
      await dismissAnnouncement(
        authState.user.uid,
        announcement.id
      );
      onDismiss();
    } catch (error) {
      console.error("Failed to dismiss announcement:", error);
      // Still dismiss locally even if Firebase fails
      onDismiss();
    }
  }

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

  function getSeverityIcon(severity: Announcement["severity"]): string {
    switch (severity) {
      case "critical":
        return "fa-exclamation-triangle";
      case "warning":
        return "fa-exclamation-circle";
      case "info":
        return "fa-info-circle";
    }
  }
</script>

<div
  class="modal-overlay"
  onclick={handleDismiss}
  onkeydown={(e) => e.key === "Escape" && handleDismiss()}
  role="button"
  tabindex="0"
  aria-label={t("admin_close_announcement")}
>
  <div
    class="modal-content"
    onclick={(e) => e.stopPropagation()}
    onkeydown={(e) => e.stopPropagation()}
    role="dialog"
    aria-modal="true"
    tabindex="-1"
  >
    <div
      class="modal-header"
      style="--severity-color: {getSeverityColor(announcement.severity)};"
    >
      <div class="header-icon">
        <i
          class="fas {getSeverityIcon(announcement.severity)}"
          aria-hidden="true"
        ></i>
      </div>
      <button class="close-button" onclick={handleDismiss} aria-label={t("common_close")}>
        <i class="fas fa-times" aria-hidden="true"></i>
      </button>
    </div>
    <div class="modal-body">
      <span
        class="severity-badge"
        style="background: {getSeverityColor(announcement.severity)};"
      >
        {announcement.severity}
      </span>
      <h2 class="announcement-title">{announcement.title}</h2>
      <p class="announcement-message">{announcement.message}</p>
    </div>

    <div class="modal-footer">
      {#if announcement.actionUrl}
        {#if isInternalUrl(announcement.actionUrl)}
          <button
            class="action-button secondary"
            onclick={() => handleInternalNavigation(announcement.actionUrl!)}
          >
            {announcement.actionLabel || t("admin_learn_more")}
            <i class="fas fa-arrow-right" aria-hidden="true"></i>
          </button>
        {:else}
          <a
            href={announcement.actionUrl}
            class="action-button secondary"
            target="_blank"
            rel="noopener noreferrer"
          >
            {announcement.actionLabel || t("admin_learn_more")}
            <i class="fas fa-external-link-alt" aria-hidden="true"></i>
          </a>
        {/if}
      {/if}
      <button class="action-button primary" onclick={handleDismiss}>
        <i class="fas fa-check" aria-hidden="true"></i>
        {t("admin_got_it")}
      </button>
    </div>
  </div>
</div>

<style>
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.8);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: var(--z-modal);
    padding: 20px;
    animation: fadeIn var(--duration-normal) ease-out;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .modal-content {
    max-width: 600px;
    width: 100%;
    max-height: calc(100vh - 40px); /* Leave room for padding */
    display: flex;
    flex-direction: column;
    background: var(--theme-panel-bg);
    border: 1px solid var(--theme-stroke-strong, var(--theme-stroke-strong));
    border-radius: 20px;
    overflow: hidden;
    animation: slideUp var(--duration-emphasis) ease-out;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  }

  @keyframes slideUp {
    from {
      transform: translateY(20px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  .modal-header {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 32px 20px;
    flex-shrink: 0; /* Don't shrink header */
    background: linear-gradient(
      135deg,
      rgba(var(--severity-color, 99 102 241), 0.2) 0%,
      rgba(var(--severity-color, 99 102 241), 0.1) 100%
    );
    border-bottom: 1px solid var(--theme-stroke, var(--theme-stroke));
  }

  .header-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 64px;
    height: 64px;
    background: var(--theme-card-hover-bg);
    border-radius: 50%;
    color: var(--theme-text, var(--theme-text));
    font-size: var(--font-size-3xl);
  }

  .close-button {
    position: absolute;
    top: 16px;
    right: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--min-touch-target); /* WCAG AA touch target */
    height: var(--min-touch-target);
    background: var(--theme-card-bg, var(--theme-card-bg));
    border: 1px solid var(--theme-stroke, var(--theme-stroke));
    border-radius: 8px;
    color: var(--theme-text, var(--theme-text-dim));
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .close-button:hover {
    background: var(--theme-card-hover-bg);
    color: var(--theme-text);
  }

  .modal-body {
    padding: 32px 24px;
    flex: 1 1 auto; /* Take remaining space */
    overflow-y: auto; /* Scroll when content overflows */
    min-height: 0; /* Required for flex overflow */
  }

  .severity-badge {
    display: inline-block;
    padding: 6px 14px;
    font-size: var(--font-size-compact);
    font-weight: 700;
    text-transform: uppercase;
    color: white;
    border-radius: 6px;
    letter-spacing: 0.5px;
    margin-bottom: 16px;
  }

  .announcement-title {
    font-size: var(--font-size-2xl);
    font-weight: 700;
    color: var(--theme-text);
    margin: 0 0 16px 0;
    line-height: 1.3;
  }

  .announcement-message {
    font-size: var(--font-size-sm);
    color: var(--theme-text);
    line-height: 1.7;
    margin: 0;
    white-space: pre-wrap;
  }

  .modal-footer {
    display: flex;
    gap: 12px;
    padding: 20px 24px;
    border-top: 1px solid var(--theme-stroke);
    flex-shrink: 0; /* Don't shrink footer - keep buttons visible */
  }

  .action-button {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 14px 24px;
    border-radius: 12px;
    font-size: var(--font-size-sm);
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
    text-decoration: none;
  }

  .action-button.primary {
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--theme-accent, var(--theme-accent)) 120%, white)
        0%,
      var(--theme-accent, var(--theme-accent)) 100%
    );
    border: none;
    color: white;
  }

  .action-button.primary:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 20px
      color-mix(
        in srgb,
        var(--theme-accent, var(--theme-accent)) 40%,
        transparent
      );
  }

  .action-button.secondary {
    background: var(--theme-card-bg, var(--theme-card-bg));
    border: 1px solid var(--theme-stroke, var(--theme-stroke));
    color: var(--theme-text, var(--theme-text));
  }

  .action-button.secondary:hover {
    background: var(--theme-card-hover-bg);
    border-color: var(--theme-stroke-strong);
  }

  .action-button:active {
    transform: translateY(0);
  }

  @media (max-width: 640px) {
    .modal-content {
      border-radius: 16px;
    }

    .modal-header {
      padding: 16px;
    }

    .header-icon {
      width: 44px;
      height: 44px;
      font-size: var(--font-size-xl);
    }

    .modal-body {
      padding: 16px;
    }

    .announcement-title {
      font-size: var(--font-size-xl);
    }

    .announcement-message {
      font-size: var(--font-size-sm);
    }

    .modal-footer {
      /* Keep buttons side-by-side on mobile to save vertical space */
      padding: 16px;
      gap: 8px;
    }

    .action-button {
      padding: 12px 16px;
      font-size: var(--font-size-sm);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .modal-overlay,
    .modal-content {
      animation: none;
    }

    .action-button:hover {
      transform: none;
    }
  }
</style>
