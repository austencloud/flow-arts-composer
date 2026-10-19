<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { handleModuleHome } from "#lib/shared/navigation-coordinator/navigation-coordinator.svelte.js";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
</script>

<span class="back-to-browse">
  <PanelButton
    variant="secondary"
    onclick={() => handleModuleHome("browse", "workspace")}
  >
    <i class="fas fa-arrow-left" aria-hidden="true"></i>
    <span>{t("module_browse")}</span>
  </PanelButton>
</span>

<style>
  .back-to-browse {
    display: inline-flex;
    flex: 0 0 auto;
  }

  .back-to-browse :global(.panel-btn) {
    white-space: nowrap;
  }
</style>
