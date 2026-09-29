<script lang="ts">
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import { getViewer3DContext } from "$lib/shared/3d/context/viewer-3d-context";
  import { scale } from "svelte/transition";
  import { backOut, cubicOut } from "svelte/easing";

  const viewer = getViewer3DContext();
  const open = $derived(viewer.activePopover === "info");

  function toggle(e: MouseEvent) {
    e.stopPropagation();
    viewer.openPopover(open ? null : "info");
  }

  function openStageStub() {
    // Spec §8.4 - stub action until Stage ships.
    // No-op until Stage module is built.
  }
</script>

<div class="info-root">
  <button
    class="info-chip"
    onclick={toggle}
    aria-label={t("viewer_detail_about_this_destination")}
    aria-expanded={open}
    aria-haspopup="dialog"
  >
    <i class="fas fa-info"></i>
  </button>

  {#if open}
    <div
      class="info-popover"
      role="dialog"
      aria-label={t("viewer_detail_destination_explainer")}
      in:scale={{ duration: 220, start: 0.92, opacity: 0, easing: backOut }}
      out:scale={{ duration: 160, start: 0.95, opacity: 0, easing: cubicOut }}
    >
      <h3>{t("viewer_sequence_viewer")}</h3>
      <p>
        {t("viewer_detail_watch_one_sequence_performed_by_1_to_n_versions_of_you_each_with_their_own_effort_prop_and_effects_same_choreography_different_interpretations")}
      </p>
      <p class="aside">
        {t("viewer_detail_want_different_sequences_per_performer_with_timing_and_music")}
      </p>
      <PanelButton onclick={openStageStub}>{t("viewer_detail_open_in_stage")}</PanelButton>
    </div>
  {/if}
</div>

<style>
  .info-root {
    position: relative;
  }
  .info-chip {
    width: var(--min-touch-target);
    height: var(--min-touch-target);
    border-radius: 10px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    background: transparent;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.62));
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
  }
  .info-chip:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.06));
    color: rgba(255, 255, 255, 0.95);
  }
  .info-popover {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    width: 320px;
    padding: 16px 18px;
    background: rgba(20, 22, 32, 0.9);
    backdrop-filter: blur(22px) saturate(140%);
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.18));
    border-radius: 14px;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.55);
    color: rgba(255, 255, 255, 0.92);
    font-size: 13px;
    line-height: 1.55;
    z-index: 100;
  }
  .info-popover h3 {
    margin: 0 0 6px 0;
    font-size: 13px;
    font-weight: 700;
  }
  .info-popover p {
    margin: 0 0 8px 0;
  }
  .info-popover p.aside {
    color: rgba(255, 255, 255, 0.68);
    font-size: 12px;
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
  }
</style>
