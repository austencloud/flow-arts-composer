<script lang="ts">
  /**
   * Global "copy this view" key handler, dev builds only. The root layout
   * mounts it behind `{#if dev}`, so bare U does nothing on the live site.
   *
   * Mounted once in the root layout so U works on every route. Austen pressed
   * the key on /browse/gallery and nothing happened, because the first
   * version of this lived on one dev route - which is not what "when I see
   * something in the app" means.
   *
   * A 3D scene that has registered a view source contributes its camera pose
   * and a frame. Everywhere else this captures the page: URL, viewport, scroll,
   * and whatever sits under the cursor.
   */
  import { onMount } from "svelte";
  import { toast } from "#lib/shared/toast/state/toast-state.svelte.js";
  import {
    captureCurrentView,
    isViewCaptureKeypress,
    trackPointer,
  } from "#lib/shared/review/view-capture.js";

  let busy = false;

  function handleKeydown(event: KeyboardEvent) {
    if (busy || !isViewCaptureKeypress(event)) return;
    // A page can have its own use for U: the poi reversal review marks a
    // verdict "unsure" with it. That page claims the press with
    // preventDefault, so wait until every listener has seen it and step aside
    // if one did. This handler must not call preventDefault itself, or it
    // would always find the press claimed.
    setTimeout(() => {
      if (!event.defaultPrevented) void copyView();
    });
  }

  async function copyView() {
    if (busy) return;
    busy = true;
    try {
      const capture = await captureCurrentView();
      const failed = "frameError" in capture ? capture.frameError : undefined;
      toast.success(
        capture.delivery === "console"
          ? "View recorded in the browser console; clipboard was unavailable"
          : failed
            ? `View copied (no frame: ${failed})`
            : "View copied - paste to Claude",
        failed ? 5000 : 2500
      );
    } catch (error) {
      toast.error(
        `Copy view failed: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      busy = false;
    }
  }

  onMount(() => {
    // Passive: this only records coordinates so the capture knows what the
    // cursor was over.
    const onMove = (event: PointerEvent) => trackPointer(event);
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  });
</script>

<svelte:window onkeydown={handleKeydown} />
