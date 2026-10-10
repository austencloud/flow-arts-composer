<script lang="ts">
  /**
   * Full side-panel presentation of the canonical scene environment picker.
   * The viewer state owns the choice; this component only gives it a heading
   * and panel treatment.
   */
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import SceneSelectorPopover from "../SceneSelectorPopover.svelte";
</script>

<section class="environment-panel">
  <header class="panel-header">
    <i class="fas fa-mountain-sun" aria-hidden="true"></i>
    <span>{t("viewer3d_environment")}</span>
  </header>
  <div class="environment-content">
    <SceneSelectorPopover />
  </div>
</section>

<style>
  .environment-panel {
    overflow: hidden;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 0.75rem;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
  }

  .panel-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    color: var(--theme-text, #fff);
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 600;
  }

  .panel-header i {
    opacity: 0.72;
  }

  .environment-content {
    padding: 0.75rem;
  }
</style>
