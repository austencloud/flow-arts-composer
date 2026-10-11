<!--
  SequenceViewerHelpModal.svelte

  Help modal explaining sequence viewer controls.
  Shows when user taps the help button in the sequence viewer header.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import BaseModal from "#lib/shared/foundation/ui/modal/BaseModal.svelte";
  import ModalHeader from "#lib/shared/foundation/ui/modal/ModalHeader.svelte";
  import ModalFooter from "#lib/shared/foundation/ui/modal/ModalFooter.svelte";
  import HelpSection from "#lib/shared/components/help/HelpSection.svelte";

  interface Props {
    show: boolean;
    onClose: () => void;
  }

  let { show = $bindable(), onClose }: Props = $props();

  // Control close with animation
  function handleClose() {
    show = false;
    setTimeout(onClose, 250);
  }

  // Use feature-view theme variable for viewing/export contexts
  const accentColor = "var(--feature-view, #06b6d4)";
</script>

<BaseModal
  bind:open={show}
  size="fit"
  animation="pop"
  onclose={handleClose}
  labelledBy="sequence-viewer-help-title"
  class="sequence-viewer-help-modal"
>
  {#snippet header()}
    <ModalHeader
      title={t("viewer_sequence_viewer")}
      subtitle={t("viewer_help_subtitle")}
      icon="fa-eye"
      iconColor={accentColor}
      onClose={handleClose}
      id="sequence-viewer-help-title"
    />
  {/snippet}

  <div class="help-content">
    <div class="help-grid">
      <HelpSection icon="fa-image" title={t("viewer_help_image_mode")} {accentColor}>
        <p>{t("viewer_help_image_description")}</p>
        <ul>
          <li>
            <strong>{t("viewer_help_toggle_options")}</strong> – {t("viewer_help_toggle_description")}
          </li>
          <li><strong>{t("viewer_help_dark_light")}</strong> – {t("viewer_help_background_description")}</li>
        </ul>
      </HelpSection>

      <HelpSection icon="fa-play-circle" title={t("viewer_help_animation_mode")} {accentColor}>
        <p>{t("viewer_help_animation_description")}</p>
        <ul>
          <li><strong>{t("viewer_help_play_pause")}</strong> – {t("viewer_help_playback_description")}</li>
          <li>
            <strong>{t("viewer_ui_speed")}</strong> – {t("viewer_help_speed_description")}
          </li>
          <li>
            <strong>{t("viewer_ui_loop")}</strong> – {t("viewer_help_loop_description")}
          </li>
        </ul>
      </HelpSection>

      <HelpSection icon="fa-download" title={t("viewer_help_export")} {accentColor}>
        <p>{t("viewer_help_export_description")}</p>
        <ul>
          <li><strong>{t("viewer_help_image")}</strong> – {t("viewer_help_download_png")}</li>
          <li>
            <strong>{t("viewer_ui_animation")}</strong> – {t("viewer_help_export_video")}
          </li>
          <li><strong>{t("browse_copy")}</strong> – {t("viewer_help_copy_image")}</li>
        </ul>
      </HelpSection>

      <HelpSection icon="fa-lightbulb" title={t("viewer_help_tip")} variant="tip">
        <p>
          {t("viewer_help_tip_description")}
        </p>
      </HelpSection>
    </div>
  </div>

  {#snippet footer()}
    <ModalFooter>
      <button class="secondary" onclick={handleClose}>{t("viewer_help_got_it")}</button>
    </ModalFooter>
  {/snippet}
</BaseModal>

<style>
  /* Override modal width for widescreen - utilize horizontal space */
  :global(.sequence-viewer-help-modal) {
    width: min(680px, 90vw) !important;
  }

  .help-content {
    padding: 20px;
  }

  /* Responsive grid: 2x2 on desktop, single column on mobile */
  .help-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    grid-auto-rows: min-content;
    align-items: start;
    gap: 16px;
  }

  /* Mobile: single column */
  @media (max-width: 600px) {
    :global(.sequence-viewer-help-modal) {
      width: calc(100% - 32px) !important;
    }

    .help-grid {
      grid-template-columns: 1fr;
    }

    .help-content {
      padding: 16px;
    }
  }
</style>
