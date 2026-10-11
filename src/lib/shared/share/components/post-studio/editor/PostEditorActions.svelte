<script lang="ts">
  import type { Snippet } from "svelte";
  import { useStrings } from "@austencloud/video-editor/strings";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import OverflowMenu from "$lib/shared/ui/components/OverflowMenu.svelte";
  import {
    Icon,
    faDiamond,
    faDownload,
    faFileExport,
    faFileImport,
    faRightLeft,
    faRotate,
    faSpinner,
    faTriangleExclamation,
    faUpload,
  } from "@austencloud/video-editor/icons";

  const t = useStrings();

  /**
   * More actions, then Export. Export opens the Export panel, where the
   * render starts. A screen that ends in its own way, as Crop ends in Cancel
   * and Done, puts its buttons in Export's place. The editor shows these in
   * its own top bar, or in a header row the page gives it.
   */
  interface Props {
    exporting: boolean;
    onExport: () => void;
    onImport?: () => void;
    onImportDifferences?: () => void;
    onMirror?: () => void;
    mirrored?: boolean;
    onBackup?: () => void;
    onRestore?: () => void;
    onClearPostKeyframes?: () => void;
    clearableKeyframes?: number;
    onRetry?: () => void;
    canRetry?: boolean;
    trailing?: Snippet;
    /** Another screen, such as timing, has the editor; nothing here acts. */
    locked?: boolean;
  }

  let {
    exporting,
    onExport,
    onImport,
    onImportDifferences,
    onMirror,
    mirrored = false,
    onBackup,
    onRestore,
    onClearPostKeyframes,
    clearableKeyframes = 0,
    onRetry,
    canRetry = false,
    trailing,
    locked = false,
  }: Props = $props();

  const moreActions = $derived([
    ...(onClearPostKeyframes
      ? [
          {
            label: t("post_keyframe_remove_all_post"),
            icon: faDiamond,
            action: onClearPostKeyframes,
            disabled: clearableKeyframes === 0,
          },
        ]
      : []),
    ...(!trailing && onImport
      ? [
          {
            label: "Import InShot project",
            icon: faFileImport,
            action: onImport,
            disabled: exporting,
          },
        ]
      : []),
    ...(onImportDifferences
      ? [
          {
            label: "View InShot differences",
            icon: faTriangleExclamation,
            action: onImportDifferences,
          },
        ]
      : []),
    ...(!trailing && onMirror
      ? [
          {
            label: mirrored ? "Unmirror post" : "Mirror whole post",
            icon: faRightLeft,
            action: onMirror,
            disabled: exporting,
          },
        ]
      : []),
    ...(canRetry && onRetry
      ? [{ label: "Retry save", icon: faRotate, action: onRetry }]
      : []),
    ...(onBackup
      ? [
          {
            label: "Save backup",
            icon: faDownload,
            action: onBackup,
          },
        ]
      : []),
    ...(onRestore
      ? [
          {
            label: "Restore backup",
            icon: faUpload,
            action: onRestore,
          },
        ]
      : []),
  ]);
</script>

<div class="end-actions">
  <OverflowMenu
    items={moreActions}
    disabled={locked}
    placement="bottom"
    ariaLabel="More post actions"
  />
  {#if trailing}
    {@render trailing()}
  {:else}
    <PanelButton
      variant="primary"
      onclick={onExport}
      disabled={exporting || locked}
      ariaBusy={exporting}
      ariaLabel={t("post_editor_export")}
    >
      <Icon icon={exporting ? faSpinner : faFileExport} spin={exporting} />
      <span class="export-label">{t("post_editor_export")}</span>
    </PanelButton>
  {/if}
</div>

<style>
  .end-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
    white-space: nowrap;
  }

  /* A phone-width header keeps Export's icon; its name stays on the button. */
  @container post-editor-header (max-width: 30rem) {
    .export-label {
      display: none;
    }
  }
</style>
