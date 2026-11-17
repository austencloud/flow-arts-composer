<!--
  SentFileDropHost: drop a picture or video on the window to open it.

  Window listeners only, in the bubbling phase, so every screen's own drop
  zone handles the event first; a drop one of them took (defaultPrevented) is
  left alone. A file dropped anywhere else is claimed, so the browser never
  navigates away to show it, and handed to the one open path.

  While a drag that carries files is over the window and no drop zone has
  claimed it, a small pill near the bottom says what a drop does. It is out of
  flow and ignores the pointer, so nothing moves or is covered for input.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { flyFade } from "#lib/shared/transitions/motion.js";
  import {
    dragCarriesFiles,
    fileForWindowDrop,
    windowShouldClaim,
  } from "../domain/sent-file-drop";

  // dragenter/dragleave fire for every element crossed; the depth count says
  // whether the drag is still somewhere over the window.
  let depth = 0;
  let dragging = $state(false);
  let overDropZone = $state(false);
  let idleTimer: ReturnType<typeof setTimeout> | null = null;

  const pillVisible = $derived(dragging && !overDropZone);

  /** Escape, or a drag that leaves without a final dragleave, sends no event;
   *  dragover repeats while a drag is over the page, so its silence ends it. */
  const DRAG_IDLE_MS = 400;

  function endDrag() {
    depth = 0;
    dragging = false;
    overDropZone = false;
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = null;
  }

  function handleDragEnter(event: DragEvent) {
    if (!dragCarriesFiles(event)) return;
    depth += 1;
    dragging = true;
  }

  function handleDragLeave(event: DragEvent) {
    if (!dragCarriesFiles(event)) return;
    depth = Math.max(0, depth - 1);
    if (depth === 0) endDrag();
  }

  function handleDragOver(event: DragEvent) {
    if (!dragCarriesFiles(event)) return;
    dragging = true;
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(endDrag, DRAG_IDLE_MS);

    if (windowShouldClaim(event)) {
      // Allowing the drop here is what keeps the browser from opening the file.
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
      overDropZone = false;
    } else {
      overDropZone = true;
    }
  }

  function handleDrop(event: DragEvent) {
    const claim = windowShouldClaim(event);
    const file = fileForWindowDrop(event);
    endDrag();
    if (!claim) return;
    event.preventDefault();
    if (!file) return;
    void import("#lib/shared/share/services/open-sent-file.js").then(
      ({ openSentFile }) => openSentFile(file, "drop")
    );
  }

  $effect(() => () => {
    if (idleTimer) clearTimeout(idleTimer);
  });
</script>

<svelte:window
  ondragenter={handleDragEnter}
  ondragleave={handleDragLeave}
  ondragover={handleDragOver}
  ondrop={handleDrop}
/>

<div class="drop-pill-lane" aria-live="polite">
  {#if pillVisible}
    <div class="drop-pill" transition:flyFade={{ y: 12 }}>
      <i class="fas fa-folder-open" aria-hidden="true"></i>
      <span>{t("share_drop_to_open")}</span>
    </div>
  {/if}
</div>

<style>
  .drop-pill-lane {
    position: fixed;
    inset-inline: 0;
    bottom: calc(24px + env(safe-area-inset-bottom, 0px));
    z-index: var(--z-toast);
    display: flex;
    justify-content: center;
    padding-inline: 16px;
    pointer-events: none;
  }

  .drop-pill {
    display: flex;
    align-items: center;
    gap: 10px;
    max-width: 100%;
    box-sizing: border-box;
    padding: 10px 18px;
    border: 1px solid color-mix(in srgb, var(--theme-accent) 45%, transparent);
    border-radius: 999px;
    background: var(--theme-panel-bg);
    color: var(--theme-text);
    font-size: var(--font-size-sm, 14px);
    font-weight: 600;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  }

  .drop-pill i {
    color: var(--theme-accent);
  }
</style>
