<!--
  ReleaseTourArrival - finishes a highlight's "Show me".

  Mounted once at the app root beside WhatsNewChecker. When a highlight's
  "Show me" sets a pending arrival and navigation leaves for its surface, this
  waits for the anchor the note named to mount, then scrolls to it, focuses it
  and pulses it. With no anchor, or one that has since gone, it shows the
  note's callout instead through the app's one dismissible message owner, the
  toast. Neither present: reaching the tab was the whole experience, and the
  state never held an arrival to begin with.
-->
<script lang="ts">
  import { releaseTourState } from "../state/release-tour-state.svelte";
  import {
    arriveAtReleaseAnchor,
    findReleaseAnchor,
  } from "../utils/release-anchor-arrival";
  import { showToast } from "#lib/shared/toast/state/toast-state.svelte.js";

  // A callout is read once, like the What's New toast it follows.
  const CALLOUT_TOAST_MS = 10_000;

  // The pulse outlives the effect run that started it: consuming the
  // arrival re-runs the effect, and that cleanup must not stop a pulse that
  // has only just begun. A newer arrival, or unmounting, stops it.
  let cancelPulse: (() => void) | null = null;

  $effect(() => {
    const arrival = releaseTourState.pending;
    if (!arrival) return;

    let cancelled = false;

    (async () => {
      const element = arrival.anchor
        ? await findReleaseAnchor(arrival.anchor)
        : null;
      if (cancelled) return;
      // Consume only now: a second "Show me" during the wait replaced the
      // pending arrival, and this run must not clear that newer one.
      if (releaseTourState.pending !== arrival) return;
      releaseTourState.consume();

      cancelPulse?.();
      cancelPulse = null;
      if (element) {
        cancelPulse = arriveAtReleaseAnchor(element);
      } else if (arrival.callout) {
        showToast({
          message: arrival.callout,
          type: "info",
          duration: CALLOUT_TOAST_MS,
          announcement: "polite",
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  });

  $effect(() => () => cancelPulse?.());
</script>
