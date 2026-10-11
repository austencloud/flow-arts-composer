<!--
ScanCardSheet.svelte

File physical cards into this collection. A Drawer (bottom sheet on mobile,
right panel on desktop) holds a rear-camera viewfinder; every TKA card QR
that enters the frame is resolved and added to the collection — haptic +
toast per card, running count in the header. Continuous: hold the sheet
open and work through the whole stack.

Cards resolve identity-first (resolveForImport): a card backed by a real
sequence doc is added as a reference; a card whose data lives only in its
shortcode record (printed deck cards) is saved under the normal public default
to My Library first, then filed. Either way the user sees one behavior:
scan → added. There is no rejection state — every printed card exists in
the system by construction.

Filing scans deliberately write NO scan analytics (scanCount/scanEvents
mean "card discovered in the wild"; filing your own deck would pollute
the geo dashboard).
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { onMount, onDestroy } from "svelte";
  import { fly } from "svelte/transition";
  import Drawer from "#lib/shared/foundation/ui/Drawer.svelte";
  import { CameraManager } from "#lib/shared/train/services/camera-manager.js";
  import {
    createTkaQrDetector,
    type TkaQrDetector,
  } from "#lib/shared/qr/services/tka-qr-detector.js";
  import { extractScanCode } from "#lib/shared/qr/services/extract-scan-code.js";
  import {
    padQrBox,
    frameBoxToScreenRect,
    type FrameBox,
  } from "#lib/shared/qr/services/scan-capture-geometry.js";
  import { getQRCodeGenerator } from "#lib/shared/qr/get-qr-code-generator.js";
  import { getAppCanonicalURL } from "../../../../../config/domains";
  import { getShortCodeManager } from "#lib/shared/qr/get-short-code-manager.js";
  import { getLibraryRepository } from "#lib/shared/library/get-library-repository.js";
  import { getLibrarySaveService } from "#lib/features/library/get-library-save-service.js";
  import {
    addSequenceToCollection,
    removeSequenceFromCollection,
  } from "#lib/shared/library/services/collection-manager.js";
  import { collectionsState } from "#lib/features/library/state/collections-state.svelte.js";
  import { LIBRARY_LIMITS } from "#lib/shared/library/data/firestore-paths.js";
  import { LibraryError } from "#lib/shared/library/domain/library-error.js";
  import { authState } from "#lib/shared/auth/state/auth-state.svelte.js";
  import { toast } from "#lib/shared/toast/state/toast-state.svelte.js";
  import { browseScrollState } from "#lib/shared/browse/state/browse-scroll-state.svelte.js";
  import { responsiveLayoutManager } from "#lib/shared/create/services/responsive-layout-manager.js";
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import { postSaveActivation } from "#lib/shared/onboarding/state/post-save-activation-state.svelte.js";

  let {
    collectionId,
    onClose,
  }: {
    collectionId: string;
    onClose: () => void;
  } = $props();

  $effect(() => {
    collectionsState.ensureStarted();
  });

  const target = $derived(
    collectionsState.collections.find((c) => c.id === collectionId) ?? null
  );

  // Drawer plumbing — AddSequencesSheet's exact pattern.
  let drawerOpen = $state(false);
  let isSideBySide = $state(false);
  let layoutUnsubscribe: (() => void) | null = null;
  const placement = $derived(isSideBySide ? "right" : "bottom");

  const CLOSE_ANIMATION_MS = 300;
  // A dedicated flag rather than checking drawerOpen: if the drawer reports
  // closed before the opening rAF has even flipped drawerOpen true (rapid
  // open/close), a drawerOpen check would skip onClose and strand the sheet
  // mounted-but-invisible — the Scan button would go dead until remount.
  let closing = false;
  function requestClose() {
    if (closing) return;
    closing = true;
    drawerOpen = false;
    setTimeout(onClose, CLOSE_ANIMATION_MS);
  }

  // Camera + detection.
  const camera = new CameraManager();
  let detector: TkaQrDetector | null = null;
  let videoHost = $state<HTMLDivElement | null>(null);
  let cameraError = $state<string | null>(null);
  let cameraReady = $state(false);

  // Desktop handoff: a desktop usually has no camera worth pointing at a
  // printed card, so the right-side placement leads with a QR that hands the
  // scan job to the user's phone. The phone opens this same collection with
  // the scanner running; cards it files appear in the desktop grid live
  // (the detail view's collection subscription — nothing extra needed here).
  let cameraChosen = $state(false);
  const handoffMode = $derived(placement === "right" && !cameraChosen);
  const handoffUrl = getAppCanonicalURL(
    `browse/library/${encodeURIComponent(collectionId)}?scan=1`
  );
  let handoffQrDataUrl = $state<string | null>(null);
  let handoffQrFailed = $state(false);
  // Count cards the phone adds while the handoff panel is up: baseline the
  // collection size when we first see it, then show the live delta.
  let handoffBaseline = $state<number | null>(null);
  const phoneAddedCount = $derived(
    handoffBaseline === null
      ? 0
      : Math.max(
          0,
          (target?.sequenceCount ?? handoffBaseline) - handoffBaseline
        )
  );

  // Session bookkeeping.
  let addedCount = $state(0);
  const seen = new Set<string>();
  let processing = false; // one hit at a time; also pauses detection ticks
  let scanTimer: ReturnType<typeof setInterval> | null = null;
  const SCAN_INTERVAL_MS = 200;
  // The camera starts on demand, not on mount: immediately on phones (bottom
  // placement), only after "use this computer's camera" on desktop.
  let cameraStartRequested = false;

  function requestCameraStart() {
    if (cameraStartRequested) return;
    cameraStartRequested = true;
    void startCamera();
  }

  async function startCamera() {
    cameraError = null;
    cameraReady = false;
    try {
      // 1280×720: dense QR modules need more pixels than the 640 default.
      await camera.initialize({
        facingMode: "environment",
        width: 1280,
        height: 720,
      });
      await camera.start();
      const video = camera.getVideoElement();
      if (video && videoHost) {
        video.classList.add("viewfinder-video");
        videoHost.replaceChildren(video);
      }
      cameraReady = true;
    } catch (err) {
      // CameraManager maps NotAllowedError/NotFoundError/NotReadableError
      // to user-readable messages already.
      cameraError =
        err instanceof Error ? err.message : t("browse_verified_camera_access_failed");
    }
  }

  async function tick() {
    if (processing || cameraError || !camera.isActive || !detector) return;
    const frame = camera.captureFrame();
    if (!frame) return;
    processing = true;
    try {
      const detections = await detector.detect(frame);
      for (const detection of detections) {
        const code = extractScanCode(detection.rawValue);
        if (code) {
          await handleHit(code, frame, detection.boundingBox);
          break; // one card per frame
        }
      }
    } catch {
      // Per-frame decode noise — keep scanning.
    } finally {
      processing = false;
    }
  }

  async function handleHit(code: string, frame: ImageData, box: FrameBox) {
    if (seen.has(code)) return;
    seen.add(code);

    try {
      const resolution = await getShortCodeManager().resolveForImport(
        code,
        authState.effectiveUserId ?? null
      );
      if (!resolution) {
        seen.delete(code); // re-aiming retries
        toast.error(t("browse_verified_card_read_failed"));
        return;
      }

      const word =
        resolution.sequence.word || resolution.sequence.name || t("browse_verified_sequence");
      let targetId = resolution.sequence.id;
      let createdLibraryId: string | null = null;

      if (!resolution.docBacked) {
        // No referenceable doc behind this card (printed deck cards):
        // save it to My Library under the normal public default, then
        // file it. The community-length gate still protects short cards.
        try {
          // Durable save (Dexie + Firestore) so a guest's imported printed
          // card actually lands in their Dexie-only library. The core
          // service surfaces ALREADY_EXISTS synchronously (a hasMatchingContent
          // pre-check that runs BEFORE the Dexie write), so the duplicate-card
          // dedupe in the catch below still fires and no duplicate row is
          // written. See SP1 — Durable-Save Unification.
          const saved = await getLibrarySaveService().saveSequence(
            resolution.sequence,
            {
              name: word,
              visibility: "public",
              tags: [],
              notes: "",
              analyticsSource: "scan_import",
            }
          );
          targetId = saved.sequenceId;
          createdLibraryId = saved.sequenceId;

          // SP3 Part B: root-level fire (no panel to close here) — a
          // scanned printed card is a genuine "first save" moment for a
          // guest, same as the Create/viewer paths.
          if (saved.persisted) {
            postSaveActivation.onGuestSaveSucceeded(saved.sequenceId);
          }
        } catch (err) {
          if (err instanceof LibraryError && err.code === "ALREADY_EXISTS") {
            // Identical content already lives in the library under another
            // id (e.g. two different printed cards of the same sequence).
            // We can't cheaply recover that id — tell the user instead of
            // importing a duplicate.
            toast.info(t("browse_verified_already_in_library", { word }));
            return;
          }
          throw err;
        }
      }

      if (collectionsState.isIn(targetId, collectionId)) {
        toast.info(t("browse_verified_already_in_collection", {
          word,
          collection: target?.name ?? t("browse_verified_this_collection"),
        }));
        return;
      }

      if (
        target &&
        target.sequenceCount >= LIBRARY_LIMITS.MAX_SEQUENCES_PER_COLLECTION
      ) {
        toast.error(t("browse_verified_collection_full", {
          name: target.name,
          count: LIBRARY_LIMITS.MAX_SEQUENCES_PER_COLLECTION,
        }));
        return;
      }

      await addSequenceToCollection(collectionId, targetId);
      addedCount += 1;
      getHapticFeedback()?.trigger("selection");
      // The capture celebration + undo tray ARE the confirmation — a
      // success toast on top would be double-speak.
      celebrate(frame, box, {
        code,
        word,
        sequenceId: targetId,
        createdLibraryId,
      });
    } catch (err) {
      seen.delete(code);
      if (err instanceof LibraryError && err.code === "GUEST_CAP") return;
      console.error("[ScanCard] add failed:", err);
      toast.error(t("browse_verified_card_add_failed"));
    }
  }

  // ── Capture celebration ──────────────────────────────────────────
  // The recognized QR's own pixels lift out of the viewfinder and fly into
  // the "N cards added" counter, which pops to catch them. The chip is a
  // throwaway body-level element (WAAPI, removed on finish) so the drawer's
  // transform/overflow can't clip or misplace it.
  let counterEl = $state<HTMLElement | null>(null);
  const reducedMotion =
    typeof window !== "undefined" &&
    !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  function cropChip(frame: ImageData, box: FrameBox): string | null {
    const padded = padQrBox(box, frame.width, frame.height);
    if (!padded) return null;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = padded.width;
      canvas.height = padded.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      // Negative offsets shift the frame so only the padded QR region
      // lands on the canvas.
      ctx.putImageData(frame, -padded.x, -padded.y);
      return canvas.toDataURL("image/png");
    } catch {
      return null;
    }
  }

  function launchChip(src: string, frame: ImageData, box: FrameBox) {
    if (reducedMotion || !videoHost || !counterEl) return;
    const padded = padQrBox(box, frame.width, frame.height) ?? box;
    const hostRect = videoHost.getBoundingClientRect();
    const from = frameBoxToScreenRect(padded, frame.width, frame.height, {
      left: hostRect.left,
      top: hostRect.top,
      width: hostRect.width,
      height: hostRect.height,
    });
    if (!from) return;
    const targetRect = counterEl.getBoundingClientRect();

    const img = document.createElement("img");
    img.src = src;
    img.alt = "";
    img.setAttribute("aria-hidden", "true");
    img.style.cssText =
      `position:fixed; left:${from.left}px; top:${from.top}px; ` +
      `width:${from.width}px; height:${from.height}px; z-index:1000; ` +
      `border-radius:12px; pointer-events:none; will-change:transform,opacity;`;
    document.body.appendChild(img);

    const dx =
      targetRect.left + targetRect.width / 2 - (from.left + from.width / 2);
    const dy =
      targetRect.top + targetRect.height / 2 - (from.top + from.height / 2);
    const endScale = Math.max(0.05, 30 / Math.max(from.width, 1));
    const glow = "0 0 0 3px rgba(255,255,255,0.9), 0 8px 32px rgba(0,0,0,0.5)";

    const animation = img.animate(
      [
        // Pop: the chip "snaps" out of the frame with a flash ring…
        { transform: "scale(0.85)", opacity: 0, boxShadow: "none", offset: 0 },
        { transform: "scale(1.1)", opacity: 1, boxShadow: glow, offset: 0.2 },
        { transform: "scale(1)", opacity: 1, boxShadow: glow, offset: 0.36 },
        // …then arcs up into the counter, shrinking as it files itself.
        {
          transform: `translate(${dx * 0.25}px, ${dy * 0.6}px) scale(${(1 + endScale) / 2})`,
          opacity: 0.9,
          boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
          offset: 0.7,
        },
        {
          transform: `translate(${dx}px, ${dy}px) scale(${endScale})`,
          opacity: 0,
          boxShadow: "none",
          offset: 1,
        },
      ],
      {
        duration: 950,
        easing: "cubic-bezier(0.3, 0.7, 0.25, 1)",
        fill: "forwards",
      }
    );
    const cleanup = () => img.remove();
    animation.onfinish = cleanup;
    animation.oncancel = cleanup;

    // The counter pops to "catch" the chip, timed to its arrival.
    counterEl.animate(
      [
        { transform: "scale(1)", offset: 0 },
        { transform: "scale(1)", offset: 0.75 },
        { transform: "scale(1.25)", offset: 0.85 },
        { transform: "scale(1)", offset: 1 },
      ],
      { duration: 1050, easing: "cubic-bezier(0.34, 1.56, 0.64, 1)" }
    );
  }

  // ── Undo tray ────────────────────────────────────────────────────
  // Continuous filing must stay hands-free, so there's no confirm step —
  // instead the last scan lingers in a tray with a remove button. Undo
  // takes the card back out of the collection AND deletes the private
  // library copy the scan created (when it created one), so it's a true
  // takeback, not a half-undo.
  interface LastScan {
    id: number;
    code: string;
    word: string;
    chipSrc: string | null;
    sequenceId: string;
    createdLibraryId: string | null;
  }

  let lastScan = $state<LastScan | null>(null);
  let undoBusy = $state(false);
  let trayTimer: ReturnType<typeof setTimeout> | null = null;
  let scanSeq = 0;
  const TRAY_DISMISS_MS = 6000;

  function celebrate(
    frame: ImageData,
    box: FrameBox,
    scan: {
      code: string;
      word: string;
      sequenceId: string;
      createdLibraryId: string | null;
    }
  ) {
    const chipSrc = cropChip(frame, box);
    if (chipSrc) launchChip(chipSrc, frame, box);

    if (trayTimer) clearTimeout(trayTimer);
    lastScan = { id: ++scanSeq, chipSrc, ...scan };
    trayTimer = setTimeout(() => {
      lastScan = null;
      trayTimer = null;
    }, TRAY_DISMISS_MS);
  }

  async function undoLastScan() {
    const scan = lastScan;
    if (!scan || undoBusy) return;
    undoBusy = true;
    try {
      await removeSequenceFromCollection(collectionId, scan.sequenceId);
      if (scan.createdLibraryId) {
        await getLibraryRepository().deleteSequence(scan.createdLibraryId);
        // SP1 routes the printed-card import through the durable
        // LibrarySaveService, which writes a Dexie row. The repository
        // delete above only removes the Firestore doc, so the local row
        // must be removed too — guests read their library from Dexie, and
        // an orphaned row would make the "removed" card reappear on reload.
        const { deleteSequence: deleteLocalSequence } =
          await import("#lib/shared/persistence/services/dexie-persistence-service.js");
        await deleteLocalSequence(scan.createdLibraryId);
      }
      // Let the same card scan again — the undo was deliberate, but so is
      // holding the card back up.
      seen.delete(scan.code);
      addedCount = Math.max(0, addedCount - 1);
      if (trayTimer) clearTimeout(trayTimer);
      trayTimer = null;
      lastScan = null;
      getHapticFeedback()?.trigger("selection");
      toast.info(t("browse_verified_card_removed", { word: scan.word }));
    } catch (err) {
      console.error("[ScanCard] undo failed:", err);
      toast.error(t("browse_verified_card_remove_failed"));
    } finally {
      undoBusy = false;
    }
  }

  onMount(() => {
    isSideBySide = responsiveLayoutManager.shouldUseSideBySideLayout();
    layoutUnsubscribe = responsiveLayoutManager.onLayoutChange(() => {
      isSideBySide = responsiveLayoutManager.shouldUseSideBySideLayout();
    });

    // Focus mode: picking through a physical stack, chrome is noise.
    browseScrollState.hideUI();

    detector = createTkaQrDetector();
    scanTimer = setInterval(() => void tick(), SCAN_INTERVAL_MS);

    requestAnimationFrame(() => {
      drawerOpen = true;
    });

    return () => {
      if (scanTimer) clearInterval(scanTimer);
      if (trayTimer) clearTimeout(trayTimer);
      camera.stop(); // release the camera the moment the sheet goes
      browseScrollState.showUI();
    };
  });

  // Phones scan directly: bottom placement starts the camera immediately
  // (also covers a desktop window resized down to the mobile layout).
  $effect(() => {
    if (placement === "bottom") requestCameraStart();
  });

  // Desktop handoff panel: render the QR once. If generation fails we fall
  // back to showing the link itself, so the handoff still works.
  $effect(() => {
    if (!handoffMode || handoffQrDataUrl || handoffQrFailed) return;
    getQRCodeGenerator()
      .generateForUrl(handoffUrl, { size: 480, margin: 2 })
      .then((result) => {
        handoffQrDataUrl = result.dataUrl;
      })
      .catch((err) => {
        console.error("[ScanCard] handoff QR generation failed:", err);
        handoffQrFailed = true;
      });
  });

  // Baseline the collection size the first time we see it in handoff mode,
  // so the "added from your phone" counter starts at zero.
  $effect(() => {
    if (handoffMode && handoffBaseline === null && target) {
      handoffBaseline = target.sequenceCount;
    }
  });

  onDestroy(() => layoutUnsubscribe?.());

  function countLabel(n: number): string {
    return t(n === 1 ? "browse_verified_one_card_added" : "browse_verified_cards_added", { count: n });
  }
</script>

<Drawer
  isOpen={drawerOpen}
  {placement}
  closeOnBackdrop={true}
  closeOnEscape={true}
  dismissible={true}
  showHandle={placement === "bottom"}
  ariaLabel={t("browse_verified_scan_cards")}
  class="scan-card-drawer"
  onOpenChange={(open) => {
    if (!open) requestClose();
  }}
>
  <div class="sheet-content">
    <header class="panel-header">
      <div class="header-text">
        <h2 class="panel-title">{t("browse_verified_scan_into", { collection: target?.name ?? t("browse_verified_this_collection") })}</h2>
        <span class="panel-count" bind:this={counterEl}
          >{countLabel(addedCount)}</span
        >
      </div>
      <button type="button" class="done-btn" onclick={requestClose}>
        <i class="fas fa-check" aria-hidden="true"></i>
        <span>{t("train_filter_done")}</span>
      </button>
    </header>

    {#if handoffMode}
      <div class="handoff-panel">
        <div class="qr-box">
          {#if handoffQrDataUrl}
            <img
              class="handoff-qr"
              src={handoffQrDataUrl}
              alt={t("browse_verified_handoff_qr_alt")}
            />
          {:else if handoffQrFailed}
            <p class="handoff-link-fallback">
              {t("browse_verified_open_on_phone")}
              <span class="handoff-url">{handoffUrl}</span>
            </p>
          {/if}
        </div>
        <p class="handoff-copy">
          {t("browse_verified_handoff_copy")}
        </p>
        <p class="phone-count" aria-live="polite">
          {t(phoneAddedCount === 1 ? "browse_verified_one_card_from_phone" : "browse_verified_cards_from_phone", { count: phoneAddedCount })}
        </p>
        <button
          type="button"
          class="camera-fallback-btn"
          onclick={() => {
            cameraChosen = true;
            requestCameraStart();
          }}
        >
          <i class="fas fa-camera" aria-hidden="true"></i>
          <span>{t("browse_verified_use_computer_camera")}</span>
        </button>
      </div>
    {:else}
      <div class="viewfinder">
        {#if cameraError}
          <div class="camera-error" role="alert">
            <i class="fas fa-video-slash" aria-hidden="true"></i>
            <p>{cameraError}</p>
            <button
              type="button"
              class="retry-btn"
              onclick={() => void startCamera()}
            >
              <i class="fas fa-rotate-right" aria-hidden="true"></i>
              <span>{t("browse_ui_try_again")}</span>
            </button>
          </div>
        {:else}
          <div class="video-host" bind:this={videoHost}></div>
          {#if !cameraReady}
            <div class="camera-starting" role="status">
              <i class="fas fa-camera" aria-hidden="true"></i>
              <p>{t("browse_verified_starting_camera")}</p>
            </div>
          {/if}
          {#if lastScan}
            <!-- Both the tray and the hint are absolute overlays in the same
						     slot, so swapping them moves nothing else. -->
            <div
              class="undo-tray"
              transition:fly={{ y: 14, duration: reducedMotion ? 0 : 220 }}
            >
              {#if lastScan.chipSrc}
                <img class="tray-chip" src={lastScan.chipSrc} alt="" />
              {/if}
              <span class="tray-text">{t("browse_verified_word_added", { word: lastScan.word })}</span>
              <button
                data-undo-shortcut
                data-undo-shortcut-label={t("browse_verified_add_word", { word: lastScan.word })}
                type="button"
                class="tray-undo"
                onclick={() => void undoLastScan()}
                disabled={undoBusy}
                aria-label={t("browse_verified_remove_word", { word: lastScan.word })}
              >
                <i class="fas fa-xmark" aria-hidden="true"></i>
              </button>
            </div>
          {:else}
            <p class="scan-hint">{t("browse_verified_point_at_qr")}</p>
          {/if}
        {/if}
      </div>
    {/if}
  </div>
</Drawer>

<style>
  :global(.scan-card-drawer[data-placement="bottom"]) {
    height: 80dvh;
    --sheet-max-height: 80dvh;
  }

  :global(.scan-card-drawer[data-placement="right"]) {
    --sheet-width: min(480px, 94vw);
  }

  .sheet-content {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 16px 12px;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    flex-shrink: 0;
  }

  .header-text {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }

  .panel-title {
    margin: 0;
    font-size: var(--font-size-lg, 18px);
    font-weight: 700;
    color: var(--theme-text, white);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .panel-count {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.65));
    font-variant-numeric: tabular-nums;
    /* The catch-pop scales this element; grow from the text's left edge so
		   the pulse never nudges neighbors. */
    display: inline-block;
    transform-origin: left center;
    width: fit-content;
  }

  .done-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 44px;
    padding: 0 18px;
    flex-shrink: 0;
    border: 1px solid color-mix(in srgb, var(--theme-accent) 45%, transparent);
    border-radius: 12px;
    background: color-mix(in srgb, var(--theme-accent) 22%, transparent);
    color: var(--theme-text, white);
    font-size: var(--font-size-sm, 14px);
    font-weight: 600;
    cursor: pointer;
    transition: background var(--duration-fast, 150ms) ease;
  }

  .done-btn:hover {
    background: color-mix(in srgb, var(--theme-accent) 34%, transparent);
  }

  .done-btn:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .viewfinder {
    position: relative;
    flex: 1;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: black;
    overflow: hidden;
  }

  .video-host {
    position: absolute;
    inset: 0;
  }

  .video-host :global(.viewfinder-video) {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .scan-hint {
    position: absolute;
    bottom: 16px;
    left: 50%;
    transform: translateX(-50%);
    margin: 0;
    padding: 8px 16px;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.55);
    color: white;
    font-size: var(--font-size-sm, 14px);
    white-space: nowrap;
    pointer-events: none;
  }

  /* ── Undo tray: the last scan lingers here with a takeback ─────── */

  .undo-tray {
    position: absolute;
    bottom: 12px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 10px;
    max-width: calc(100% - 24px);
    padding: 6px 6px 6px 8px;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.72);
    backdrop-filter: blur(8px);
    border: 1px solid rgba(255, 255, 255, 0.14);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  }

  .tray-chip {
    width: 40px;
    height: 40px;
    flex-shrink: 0;
    border-radius: 10px;
    object-fit: cover;
    background: white;
  }

  .tray-text {
    color: white;
    font-size: var(--font-size-sm, 14px);
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }

  .tray-undo {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    flex-shrink: 0;
    border: none;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.12);
    color: white;
    font-size: 16px;
    cursor: pointer;
    transition: background var(--duration-fast, 150ms) ease;
  }

  .tray-undo:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.22);
  }

  .tray-undo:disabled {
    opacity: 0.5;
    cursor: wait;
  }

  .tray-undo:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .camera-starting,
  .camera-error {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 24px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    text-align: center;
  }

  .camera-starting i,
  .camera-error i {
    font-size: 28px;
    opacity: 0.6;
  }

  .camera-starting p,
  .camera-error p {
    margin: 0;
    max-width: 320px;
    font-size: var(--font-size-sm, 14px);
    line-height: 1.5;
  }

  .retry-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 44px;
    padding: 0 18px;
    margin-top: 4px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.15));
    border-radius: 12px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    color: var(--theme-text, white);
    font-size: var(--font-size-sm, 14px);
    font-weight: 600;
    cursor: pointer;
  }

  .retry-btn:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .handoff-panel {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 14px;
    padding: 24px;
    overflow-y: auto;
  }

  /* Fixed box: the QR decodes async, and the panel must not reflow when it
	   lands (no-layout-shift). White backing keeps the QR scannable on any
	   theme background. */
  .qr-box {
    width: 240px;
    height: 240px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 16px;
    background: white;
    padding: 12px;
  }

  .handoff-qr {
    width: 100%;
    height: 100%;
    display: block;
  }

  .handoff-link-fallback {
    margin: 0;
    color: #1a1a2e;
    font-size: var(--font-size-compact, 12px);
    text-align: center;
    overflow-wrap: anywhere;
  }

  .handoff-url {
    display: block;
    margin-top: 6px;
    font-weight: 600;
    user-select: all;
  }

  .handoff-copy {
    margin: 0;
    max-width: 320px;
    color: var(--theme-text, white);
    font-size: var(--font-size-sm, 14px);
    line-height: 1.5;
    text-align: center;
  }

  .phone-count {
    margin: 0;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.65));
    font-size: var(--font-size-compact, 12px);
    font-variant-numeric: tabular-nums;
  }

  .camera-fallback-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 44px;
    padding: 0 18px;
    margin-top: 8px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.15));
    border-radius: 12px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    color: var(--theme-text, white);
    font-size: var(--font-size-sm, 14px);
    font-weight: 600;
    cursor: pointer;
  }

  .camera-fallback-btn:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .done-btn {
      transition: none;
    }
  }
</style>
