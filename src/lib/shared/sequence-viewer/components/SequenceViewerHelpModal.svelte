<!--
  SequenceViewerHelpModal.svelte

  Help modal explaining sequence viewer controls.
  Shows when user taps the help button in the sequence viewer header.
-->
<script lang="ts">
  import BaseModal from "$lib/shared/foundation/ui/modal/BaseModal.svelte";
  import ModalHeader from "$lib/shared/foundation/ui/modal/ModalHeader.svelte";
  import ModalFooter from "$lib/shared/foundation/ui/modal/ModalFooter.svelte";
  import HelpSection from "$lib/shared/components/help/HelpSection.svelte";

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
      title="Sequence Viewer"
      subtitle="Preview and export your sequence"
      icon="fa-eye"
      iconColor={accentColor}
      onClose={handleClose}
      id="sequence-viewer-help-title"
    />
  {/snippet}

  <div class="help-content">
    <div class="help-grid">
      <HelpSection icon="fa-image" title="Image Mode" {accentColor}>
        <p>View your sequence as a static image showing all steps at once.</p>
        <ul>
          <li><strong>Toggle options</strong> - Show/hide step numbers, word, grid</li>
          <li><strong>Dark/light</strong> - Switch background for export</li>
        </ul>
      </HelpSection>

      <HelpSection icon="fa-play-circle" title="Animation Mode" {accentColor}>
        <p>Watch your sequence animate with smooth prop movements.</p>
        <ul>
          <li><strong>Play/Pause</strong> - Control playback</li>
          <li><strong>Speed</strong> - Adjust animation speed (0.5x - 2x)</li>
          <li><strong>Loop</strong> - Set how many times to repeat</li>
        </ul>
      </HelpSection>

      <HelpSection icon="fa-download" title="Export" {accentColor}>
        <p>Save or share your sequence in different formats.</p>
        <ul>
          <li><strong>Image</strong> - Download as PNG</li>
          <li><strong>Animation</strong> - Export as a video</li>
          <li><strong>Copy</strong> - Copy image to clipboard</li>
        </ul>
      </HelpSection>

      <HelpSection icon="fa-lightbulb" title="Tip" variant="tip">
        <p>
          Use the toggle chips below the preview to customize what elements appear
          in your export (step numbers, grid, word label).
        </p>
      </HelpSection>
    </div>
  </div>

  {#snippet footer()}
    <ModalFooter>
      <button class="secondary" onclick={handleClose}>Got it</button>
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
