<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";

  let {
    onBrowse,
    onCreateAccount,
    onBack,
  }: {
    onBrowse: () => void;
    onCreateAccount?: () => void;
    onBack?: () => void;
  } = $props();
</script>

<section class="library-empty" aria-labelledby="saved-work-title">
  {#if onBack}
    <header class="empty-navigation">
      <PanelButton onclick={onBack}>
        <i class="fas fa-arrow-left" aria-hidden="true"></i>
        {t("browse_ui_collections_tab")}
      </PanelButton>
    </header>
  {/if}

  <div class="empty-body">
    <div class="empty-content">
      <h2 id="saved-work-title">{t("browse_ui_your_saved_work")}</h2>
      <p class="empty-description">
        {t("browse_verified_library_empty_description")}
      </p>
      <div class="browse-action">
        <PanelButton variant="primary" onclick={onBrowse}>
          {t("browse_verified_browse_gallery")}
        </PanelButton>
      </div>

      {#if onCreateAccount}
        <div class="account-option">
          <p>
            {t(
              "browse_ui_want_your_collections_on_other_devices_create_a_free_account"
            )}
          </p>
          <PanelButton onclick={onCreateAccount}
            >{t("browse_ui_create_account")}</PanelButton
          >
        </div>
      {/if}
    </div>
  </div>
</section>

<style>
  .library-empty {
    container-type: size;
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    color: var(--theme-text);
    background: var(--theme-panel-bg);
  }

  .empty-navigation {
    flex: 0 0 auto;
    padding: 12px 16px;
  }

  .empty-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: grid;
    grid-template-rows: minmax(32px, 0.65fr) auto minmax(48px, 1fr);
    padding-inline: clamp(24px, 7cqw, 160px);
    scrollbar-gutter: stable;
  }

  .empty-content {
    grid-row: 2;
    width: min(100%, 60rem);
    margin-inline: auto;
  }

  h2 {
    margin: 0;
    font-size: clamp(36px, 4cqw, 76px);
    line-height: 1.08;
    font-weight: 700;
    letter-spacing: -0.035em;
    text-wrap: balance;
  }

  .empty-description {
    margin: clamp(20px, 2cqw, 32px) 0 0;
    max-width: 38ch;
    color: var(--theme-text-dim);
    font-size: clamp(18px, 1.4cqw, 26px);
    line-height: 1.55;
    text-wrap: pretty;
  }

  .browse-action {
    margin-top: clamp(28px, 3cqw, 48px);
  }

  .browse-action :global(.panel-btn) {
    min-height: clamp(48px, 3.5cqw, 64px);
    padding-inline: clamp(24px, 2cqw, 36px);
    font-size: clamp(16px, 1.15cqw, 22px);
  }

  .account-option {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 20px 32px;
    margin-top: clamp(36px, 4.5cqw, 72px);
    padding-top: clamp(20px, 2cqw, 32px);
    border-top: 1px solid var(--theme-stroke);
    max-width: 48rem;
  }

  .account-option p {
    flex: 1 1 22ch;
    max-width: 36ch;
    margin: 0;
    color: var(--theme-text-dim);
    font-size: clamp(14px, 1cqw, 18px);
    line-height: 1.5;
    text-wrap: pretty;
  }

  .account-option :global(.panel-btn) {
    flex: 0 0 auto;
    font-size: clamp(14px, 0.9cqw, 18px);
  }
</style>
