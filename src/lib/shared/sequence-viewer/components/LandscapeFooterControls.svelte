<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  interface Props {
    practiceActive?: boolean;
    onSave: () => void;
    onEdit: () => void;
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
  }

  let {
    practiceActive = false,
    onSave,
    onEdit,
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
  }: Props = $props();
</script>

<aside class="landscape-controls" aria-label={t("viewer_ui_sequence_actions")}>
  {#if onFavorite}
    <button
      type="button"
      class="landscape-btn"
      class:favorited={isFavorite}
      onclick={onFavorite}
      aria-label={isFavorite ? t("viewer_detail_remove_from_favorites") : t("viewer_detail_add_to_favorites")}
    >
      <i class="fas fa-heart" aria-hidden="true"></i>
    </button>
  {/if}
  {#if !isSaved}
    <button
      data-save-shortcut
      type="button"
      class="landscape-btn save"
      onclick={onSave}
      aria-label={t("browse_save")}
    >
      <i class="fas fa-floppy-disk" aria-hidden="true"></i>
    </button>
  {/if}
  <button
    type="button"
    class="landscape-btn edit"
    onclick={onEdit}
    aria-label={t("viewer_ui_remix")}
  >
    <i class="fas fa-pen-to-square" aria-hidden="true"></i>
  </button>
  {#if onVideoUpload}
    <button
      type="button"
      class="landscape-btn video"
      onclick={onVideoUpload}
      aria-label={t("viewer_ui_upload_video")}
    >
      <i class="fas fa-video" aria-hidden="true"></i>
      {#if videoCount && videoCount > 0}
        <span class="video-badge video-badge-sm">{videoCount}</span>
      {/if}
    </button>
  {/if}

  {#if onPracticeStart || onPracticeStop}
    <button
      type="button"
      class="landscape-btn"
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
    </button>
  {/if}

  {#if isOwned && isSaved}
    <button
      type="button"
      class="landscape-btn"
      onclick={isPublished ? onUnpublish : onPublish}
      aria-label={isPublished ? t("viewer_detail_make_private") : t("viewer_detail_make_public")}
    >
      <i
        class="fas {isPublished ? 'fa-eye-slash' : 'fa-eye'}"
        aria-hidden="true"
      ></i>
    </button>
    {#if onDeleteRequest}
      <button
        type="button"
        class="landscape-btn delete"
        onclick={onDeleteRequest}
        aria-label={t("viewer_ui_delete_sequence")}
      >
        <i class="fas fa-trash" aria-hidden="true"></i>
      </button>
    {/if}
  {/if}
</aside>

<style>
  .landscape-controls {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 6px 4px;
    padding-right: calc(4px + env(safe-area-inset-right, 0px));
    padding-bottom: calc(6px + env(safe-area-inset-bottom, 0px));
    width: 60px;
    height: 100%;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border-left: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    overflow-y: auto;
    overflow-x: hidden;
    scrollbar-width: none;
  }

  .landscape-controls::-webkit-scrollbar {
    display: none;
  }

  .landscape-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    min-height: 32px;
    height: 40px;
    border-radius: 10px;
    background: transparent;
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-size: 14px;
    cursor: pointer;
    flex-shrink: 1;
    -webkit-tap-highlight-color: transparent;
    transition: all var(--duration-fast, 150ms) ease;
  }

  .landscape-btn:active {
    transform: scale(0.9);
    transition-duration: 0ms;
  }

  .landscape-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }

  .landscape-btn.save {
    color: var(--semantic-success, #22c55e);
    border-color: color-mix(
      in srgb,
      var(--semantic-success, #22c55e) 25%,
      transparent
    );
  }
  .landscape-btn.edit {
    color: var(--semantic-warning, #f59e0b);
    border-color: color-mix(
      in srgb,
      var(--semantic-warning, #f59e0b) 25%,
      transparent
    );
  }
  .landscape-btn.delete {
    color: var(--semantic-error);
    border-color: color-mix(in srgb, var(--semantic-error) 25%, transparent);
  }
  .landscape-btn.favorited {
    color: var(--semantic-error);
    border-color: color-mix(in srgb, var(--semantic-error) 25%, transparent);
  }

  .landscape-btn.practice-active {
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

  .landscape-btn.video {
    position: relative;
  }

  .video-badge-sm {
    position: absolute;
    top: -2px;
    right: -2px;
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    border-radius: 8px;
    background: var(--theme-accent, #6366f1);
    color: #fff;
    font-size: 10px;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
  }

  @media (prefers-reduced-motion: reduce) {
    .landscape-btn {
      transition: none;
    }

    .landscape-btn:active {
      transform: none;
    }
  }
</style>
