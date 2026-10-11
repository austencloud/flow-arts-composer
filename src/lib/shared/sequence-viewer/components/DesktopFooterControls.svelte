<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  interface Props {
    practiceActive?: boolean;
    onSave: () => void;
    onEdit: () => void;
    onExportVideo?: () => void;
    onExportImage?: () => void;
    onPracticeStart?: () => void;
    onPracticeStop?: () => void;
    isOwned?: boolean;
    onDeleteRequest?: () => void;
    onVideoUpload?: () => void;
    videoCount?: number;
    isSaved?: boolean;
    isPublished?: boolean;
    isFavorite?: boolean;
    onFavorite?: () => void;
    onPublish?: () => void;
    onUnpublish?: () => void;
    onCopyLink?: () => void;
    linkCopied?: boolean;
  }

  let {
    practiceActive = false,
    onSave,
    onEdit,
    onExportVideo,
    onExportImage,
    onPracticeStart,
    onPracticeStop,
    isOwned = false,
    onDeleteRequest,
    onVideoUpload,
    videoCount,
    isSaved = true,
    isPublished = true,
    isFavorite = false,
    onFavorite,
    onPublish,
    onUnpublish,
    onCopyLink,
    linkCopied = false,
  }: Props = $props();
</script>

<div class="desktop-row">
  <div class="actions-section">
    {#if onFavorite}
      <button
        type="button"
        class="action-btn"
        class:favorited={isFavorite}
        onclick={onFavorite}
        aria-label={isFavorite ? t("viewer_detail_remove_from_favorites") : t("viewer_detail_add_to_favorites")}
      >
        <i class="fas fa-heart" aria-hidden="true"></i>
        <span>{isFavorite ? "Favorited" : "Favorite"}</span>
      </button>
    {/if}

    {#if onCopyLink}
      <button
        type="button"
        class="action-btn"
        class:copied={linkCopied}
        onclick={onCopyLink}
        aria-label={linkCopied ? t("viewer_detail_link_copied") : t("viewer_detail_copy_shareable_link")}
      >
        <i class="fas {linkCopied ? 'fa-check' : 'fa-link'}" aria-hidden="true"
        ></i>
        <span>{linkCopied ? "Copied" : t("viewer_detail_copy_link")}</span>
      </button>
    {/if}

    {#if !isSaved}
      <button
        data-save-shortcut
        type="button"
        class="action-btn save"
        onclick={onSave}
        aria-label={t("viewer_ui_save_sequence")}
      >
        <i class="fas fa-floppy-disk" aria-hidden="true"></i>
        <span>{t("browse_save")}</span>
      </button>
    {/if}

    <button
      type="button"
      class="action-btn edit"
      onclick={onEdit}
      aria-label={t("viewer_ui_remix")}
    >
      <i class="fas fa-pen-to-square" aria-hidden="true"></i>
      <span>{t("viewer_ui_remix")}</span>
    </button>
    {#if onVideoUpload}
      <button
        type="button"
        class="action-btn video"
        onclick={onVideoUpload}
        aria-label={t("viewer_ui_upload_video")}
      >
        <i class="fas fa-video" aria-hidden="true"></i>
        <span>{t("viewer_detail_video")}</span>
        {#if videoCount && videoCount > 0}
          <span class="video-badge">{videoCount}</span>
        {/if}
      </button>
    {/if}

    {#if onPracticeStart || onPracticeStop}
      <button
        type="button"
        class="action-btn"
        class:practice-active={practiceActive}
        onclick={() =>
          practiceActive ? onPracticeStop?.() : onPracticeStart?.()}
        aria-label={practiceActive ? t("viewer_detail_stop_practice") : "Practice"}
        aria-pressed={practiceActive}
      >
        <i
          class="fas {practiceActive ? 'fa-stop' : 'fa-signal'}"
          aria-hidden="true"
        ></i>
        <span>{practiceActive ? "Stop" : "Practice"}</span>
      </button>
    {/if}

    {#if isOwned && isSaved}
      <button
        type="button"
        class="action-btn"
        onclick={isPublished ? onUnpublish : onPublish}
        aria-label={isPublished ? t("viewer_detail_make_private") : t("viewer_detail_make_public")}
      >
        <i
          class="fas {isPublished ? 'fa-eye-slash' : 'fa-eye'}"
          aria-hidden="true"
        ></i>
        <span>{isPublished ? t("viewer_detail_make_private") : t("viewer_detail_make_public")}</span>
      </button>
      {#if onDeleteRequest}
        <button
          type="button"
          class="action-btn delete"
          onclick={onDeleteRequest}
          aria-label={t("viewer_ui_delete_sequence")}
        >
          <i class="fas fa-trash" aria-hidden="true"></i>
          <span>{t("action_delete")}</span>
        </button>
      {/if}
    {/if}
  </div>
</div>

<style>
  .desktop-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
  }

  .actions-section {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    justify-content: center;
  }

  .action-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    min-width: 68px;
    height: var(--min-touch-target);
    padding: 6px 16px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 12px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-fast, 150ms) ease;
    -webkit-tap-highlight-color: transparent;
  }

  .action-btn i {
    font-size: 16px;
  }

  .action-btn span {
    font-size: var(--font-size-compact, 12px);
    white-space: nowrap;
  }

  .action-btn:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.15));
    color: var(--theme-text, white);
  }

  .action-btn:active {
    transform: scale(0.9);
    transition-duration: 0ms;
  }

  .action-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }

  .action-btn.save {
    background: color-mix(
      in srgb,
      var(--semantic-success, #22c55e) 10%,
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--semantic-success, #22c55e) 25%,
      transparent
    );
    color: var(--semantic-success, #22c55e);
  }

  .action-btn.save:hover {
    background: color-mix(
      in srgb,
      var(--semantic-success, #22c55e) 20%,
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--semantic-success, #22c55e) 40%,
      transparent
    );
  }

  .action-btn.edit {
    background: color-mix(
      in srgb,
      var(--semantic-warning, #f59e0b) 10%,
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--semantic-warning, #f59e0b) 25%,
      transparent
    );
    color: var(--semantic-warning, #f59e0b);
  }

  .action-btn.edit:hover {
    background: color-mix(
      in srgb,
      var(--semantic-warning, #f59e0b) 20%,
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--semantic-warning, #f59e0b) 40%,
      transparent
    );
  }

  .action-btn.delete {
    background: color-mix(in srgb, var(--semantic-error) 10%, transparent);
    border-color: color-mix(in srgb, var(--semantic-error) 25%, transparent);
    color: var(--semantic-error);
  }

  .action-btn.delete:hover {
    background: color-mix(in srgb, var(--semantic-error) 20%, transparent);
    border-color: color-mix(in srgb, var(--semantic-error) 40%, transparent);
  }

  .action-btn.favorited {
    color: var(--semantic-error);
    border-color: color-mix(in srgb, var(--semantic-error) 30%, transparent);
  }

  .action-btn.favorited:hover {
    background: color-mix(in srgb, var(--semantic-error) 15%, transparent);
  }

  .action-btn.copied {
    color: var(--semantic-success, #22c55e);
    border-color: color-mix(
      in srgb,
      var(--semantic-success, #22c55e) 25%,
      transparent
    );
  }

  .action-btn.practice-active {
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 15%,
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 40%,
      transparent
    );
    color: var(--semantic-error, #f87171);
    box-shadow: 0 0 12px
      color-mix(in srgb, var(--semantic-error, #ef4444) 20%, transparent);
  }

  .action-btn.video {
    position: relative;
  }

  .video-badge {
    position: absolute;
    top: -4px;
    right: -4px;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border-radius: 9px;
    background: var(--theme-accent, #6366f1);
    color: #fff;
    font-size: 11px;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
  }

  @media (prefers-reduced-motion: reduce) {
    .action-btn {
      transition: none;
    }

    .action-btn:active {
      transform: none;
    }
  }
</style>
