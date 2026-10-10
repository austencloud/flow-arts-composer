<!-- NoChangelogState - Empty state when no changelog exists -->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
</script>

<section class="no-changelog-section">
  <div class="no-changelog-content">
    <i class="fas fa-clipboard-list" aria-hidden="true"></i>
    <h3>{t("settings_no_changelog")}</h3>
    <p>{t("settings_no_changelog_details")}</p>
  </div>
</section>

<style>
  .no-changelog-section {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .no-changelog-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: 32px;
  }

  .no-changelog-content i {
    font-size: var(--font-size-3xl);
    color: var(--theme-stroke);
    margin-bottom: 16px;
  }

  .no-changelog-content h3 {
    margin: 0 0 8px 0;
    font-size: var(--font-size-base);
    font-weight: 600;
    color: var(--theme-text, var(--theme-text-dim));
  }

  .no-changelog-content p {
    margin: 0;
    font-size: var(--font-size-sm);
    color: var(--theme-text-dim, var(--theme-text-dim));
  }
</style>
