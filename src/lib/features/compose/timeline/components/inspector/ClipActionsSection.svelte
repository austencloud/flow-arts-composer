<script lang="ts">
  /**
   * ClipActionsSection - Lock, mute, duplicate, and delete actions
   */
  import { t } from "#lib/shared/i18n/i18n.svelte.js";

  interface Props {
    locked: boolean;
    muted: boolean;
    onToggleLock: () => void;
    onToggleMute: () => void;
    onDuplicate: () => void;
    onDelete: () => void;
  }

  let {
    locked,
    muted,
    onToggleLock,
    onToggleMute,
    onDuplicate,
    onDelete,
  }: Props = $props();
</script>

<section class="section">
  <div class="section-header">
    <i class="fa-solid fa-bolt" aria-hidden="true"></i>
    <span>{t("clip_actions")}</span>
  </div>

  <div class="action-buttons">
    <button class="action-btn" class:active={locked} onclick={onToggleLock}>
      <i
        class="fa-solid {locked ? 'fa-lock' : 'fa-lock-open'}"
        aria-hidden="true"
      ></i>
      {locked ? t("clip_unlock") : t("clip_lock")}
    </button>

    <button class="action-btn" class:active={muted} onclick={onToggleMute}>
      <i
        class="fa-solid {muted ? 'fa-volume-xmark' : 'fa-volume-high'}"
        aria-hidden="true"
      ></i>
      {muted ? t("clip_unmute") : t("clip_mute")}
    </button>
  </div>

  <div class="action-buttons">
    <button class="action-btn" onclick={onDuplicate}>
      <i class="fa-solid fa-copy" aria-hidden="true"></i>
      {t("clip_duplicate")}
    </button>

    <button class="action-btn danger" onclick={onDelete}>
      <i class="fa-solid fa-trash" aria-hidden="true"></i>
      {t("clip_delete")}
    </button>
  </div>
</section>

<style>
  .section {
    margin-bottom: 20px;
  }

  .section-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-bottom: 8px;
    margin-bottom: 12px;
    border-bottom: 1px solid var(--theme-stroke);
    font-size: var(--font-size-compact);
    font-weight: 600;
    color: var(--theme-text);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .section-header i {
    font-size: var(--font-size-compact);
    opacity: 0.6;
  }

  .action-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: var(--min-touch-target, 48px); /* WCAG AAA touch target */
    padding: 8px 12px;
    background: var(--theme-card-bg, var(--theme-card-bg));
    border: 1px solid var(--theme-stroke, var(--theme-stroke));
    border-radius: 6px;
    font-size: var(--font-size-compact);
    color: var(--theme-text);
    cursor: pointer;
    transition: all var(--duration-fast) ease;
  }

  .action-btn:focus-visible {
    outline: 2px solid var(--theme-accent, rgba(139, 92, 246, 0.8));
    outline-offset: 2px;
  }

  .action-btn:hover {
    background: var(--theme-card-hover-bg);
  }

  .action-buttons {
    display: flex;
    gap: 8px;
    margin-bottom: 8px;
  }

  .action-btn.active {
    background: var(--theme-accent);
    border-color: var(--theme-accent);
    color: white;
  }

  .action-btn.danger:hover {
    background: rgba(255, 68, 68, 0.2);
    border-color: rgba(255, 68, 68, 0.4);
    color: #ff6b6b;
  }

  .action-btn i {
    font-size: var(--font-size-compact);
  }

  /* Accessibility: Respect user's motion preferences */
  @media (prefers-reduced-motion: reduce) {
    .action-btn {
      transition: none;
    }
  }
</style>
