<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  let { onBack }: { onBack: () => void } = $props();
</script>

<div class="profile-header">
  <button class="back-btn" onclick={onBack} aria-label={t("action_go_back")}>
    <i class="fas fa-arrow-left" aria-hidden="true"></i>
    <span class="back-text">{t("action_go_back")}</span>
  </button>
</div>

<style>
  .profile-header {
    display: flex;
    align-items: center;
    padding: 16px 20px;
    border-bottom: 1px solid var(--theme-stroke);
  }

  .back-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 16px;
    min-height: var(--min-touch-target);
    min-width: var(--min-touch-target);
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 8px;
    color: var(--theme-text, white);
    font-size: var(--font-size-sm);
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .back-btn:hover {
    background: var(--theme-card-hover-bg);
    border-color: var(--theme-stroke-strong);
  }

  .back-btn i {
    font-size: var(--font-size-sm);
  }

  @media (max-width: 768px) {
    .back-text {
      display: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .back-btn {
      transition: none;
    }
  }
</style>
