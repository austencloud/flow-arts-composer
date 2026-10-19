<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { handleModuleHome } from "#lib/shared/navigation-coordinator/navigation-coordinator.svelte.js";
</script>

<button
  type="button"
  class="back-to-browse"
  onclick={() => handleModuleHome("browse", "workspace")}
>
  <i class="fas fa-arrow-left" aria-hidden="true"></i>
  <span>{t("module_browse")}</span>
</button>

<style>
  .back-to-browse {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    gap: 7px;
    min-height: 44px;
    padding: 0 13px;
    border: 1px solid var(--theme-stroke);
    border-radius: 999px;
    background: var(--theme-card-bg);
    color: var(--theme-text);
    font: inherit;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
  }

  .back-to-browse:hover {
    background: var(--theme-card-hover-bg);
  }

  .back-to-browse:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }
</style>
