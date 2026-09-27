<script lang="ts">
  /**
   * Global "copy this view" key handler. Dev builds only - the root layout
   * mounts this behind an `{#if dev}` so a real visitor's build never loads
   * it and bare U never does anything on the live site.
   *
   * Mounted once in the root layout so U works on every route. Austen pressed
   * the key on /browse/gallery and nothing happened, because the first
   * version of this lived on one dev route - which is not what "when I see
   * something in the app" means. It used to be bound to P, but bare P is also
   * the prop-picker drawer's own shortcut, so every press of P silently
   * overwrote the clipboard with a debug capture on top of opening the
   * drawer. U collides with nothing else registered in the app.
   *
   * A 3D scene that has registered a view source contributes its camera pose
   * and a frame. Everywhere else this captures the page: URL, viewport, scroll,
   * and whatever sits under the cursor.
   */
  import { onMount } from "svelte";
  import { toast } from "$lib/shared/toast/state/toast-state.svelte";
  import {
    captureCurrentView,
    isViewCaptureKeypress,
    trackPointer,
  } from "$lib/shared/review/view-capture";

  let busy = false;

  async function handleKeydown(event: KeyboardEvent) {
    if (busy || !isViewCaptureKeypress(event)) return;

    event.preventDefault();
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
