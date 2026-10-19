<!--
  SequenceViewerDrawerHost.svelte

  App host for the sequence viewer: a full-height bottom Drawer bound to the
  sequence-overlay state, with ?v= short-code bootstrap. ALL viewer chrome
  (header, rail, split pane, export panels, practice workstation) lives in
  SequenceViewerShell — shared verbatim with the /sequence route so the two
  surfaces are identical by construction. Host-only concerns here: the Drawer
  shell, overlay open/close/dismiss routing, and URL bootstrap.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { onMount, tick, untrack, type ComponentProps } from "svelte";
  import type SequenceViewerDrawerContent from "./SequenceViewerDrawerContent.svelte";
  import { afterNavigate, goto } from "$app/navigation";
  import Drawer from "#lib/shared/foundation/ui/Drawer.svelte";
  import LazyMount from "#lib/shared/components/LazyMount.svelte";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import ScanSequenceLoader from "./ScanSequenceLoader.svelte";
  import { loadSequenceViewerContent } from "../services/prefetch-sequence-viewer";
  import {
    getSequenceOverlayState,
    closeSequenceOverlay,
    openSequenceOverlay,
  } from "../state/sequence-viewer-overlay-state.svelte";
  import {
    canAdoptPrewarm,
    isPrewarmedContent,
    getSequenceViewerPrewarm,
    type SequenceViewerPrewarm,
  } from "../state/viewer-prewarm.svelte";
  import { getShortCodeManager } from "#lib/shared/qr/get-short-code-manager.js";
  import { resolveScanPropConfig } from "#lib/shared/qr/services/scan-prop-resolver.js";
  import {
    fetchPhysicalCardProps,
    physicalCardIdNeedingProps,
  } from "#lib/shared/qr/services/physical-card-props.js";
  import { isNative } from "#lib/shared/platform/services/platform-detector.js";
  import { APP_DOMAIN } from "../../../../config/domains";
  import { authState } from "#lib/shared/auth/state/auth-state.svelte.js";
  import { updateSettings } from "#lib/shared/application/state/app-state.svelte.js";
  import { parsePropsFromURL } from "#lib/shared/navigation/services/sequence-encoder.js";
  import { hydrateSequence } from "#lib/shared/navigation/services/sequence-hydrator.js";
  import { getLoopDetector } from "#lib/shared/create/get-loop-detector.js";
  import {
    isShallowGoto,
    removeCurrentUrlParams,
  } from "#lib/shared/navigation/services/url-state.js";
  import { getGlyphCache } from "#lib/shared/render/get-glyph-cache.js";
  import { simplifyRepeatedWord } from "#lib/shared/foundation/utils/word-simplifier.js";
  import { getSequenceMotionProfile } from "#lib/shared/foundation/services/sequence-motion-profile.js";
  import { getScanLoaderBaseLetters } from "../services/scan-sequence-loader";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import {
    createDestinationFade,
    motionDuration,
  } from "#lib/shared/transitions/motion.js";
  import {
    clearNativeScanViewerReady,
    isNativeScanViewerTransitionPending,
    markNativeScanLoadingSurfaceReady,
    markNativeScanTransitionStage,
    markNativeScanViewerFailed,
    markNativeScanViewerReady,
    subscribeNativeScanViewerTransition,
  } from "#lib/shared/platform/services/native-scan-viewer-readiness.js";

  const overlay = getSequenceOverlayState();

  let isMobileWidth = $state(true);

  $effect(() => {
    if (typeof window !== "undefined") {
      const check = () => {
        isMobileWidth = window.innerWidth < 768;
      };
      check();
      window.addEventListener("resize", check);
      return () => window.removeEventListener("resize", check);
    }
    return undefined;
  });

  let drawerOpen = $state(false);
  let requestedCode = $state<string | null>(null);
  let resolvingCode = $state<string | null>(null);
  let playbackReleased = $state(true);
  let nativeLoadingCode = $state<string | null>(null);
  let nativeLoadingWord = $state("");
  let nativeGlyphsReady = $state(false);
  let nativeLoadingProgress = $state(0);
  let nativeLoaderSurface = $state<HTMLDivElement | null>(null);

  // Mounting the viewer and drawing its first frame is a quarter second to a
  // second of main-thread work. Holding the slide for it made every open
  // wait, and waiting for the slide to end left the sheet black for about a
  // second. The drawer now slides at once and the viewer builds while the
  // compositor runs the slide, then fades in once it has drawn, capped so a
  // slow first draw still shows. The native scan loader covers its own wait,
  // so its viewer mounts and shows straight away.
  const VIEWER_REVEAL_CAP_MS = 600;
  let viewerStage = $state<HTMLDivElement | null>(null);
  let viewerLayer = $state<HTMLDivElement | null>(null);
  let viewerMountAllowed = $state(false);
  let viewerRevealed = $state(true);
  let revealCapTimer: ReturnType<typeof setTimeout> | null = null;
  let openedSession = -1;

  function revealViewer() {
    if (revealCapTimer !== null) {
      clearTimeout(revealCapTimer);
      revealCapTimer = null;
    }
    if (viewerRevealed) return;
    viewerRevealed = true;
    layerFade?.play();
  }

  let layerFade: ReturnType<typeof createDestinationFade> | null = null;
  $effect(() => {
    if (!viewerLayer) return;
    const fade = createDestinationFade(viewerLayer, {
      from: 0,
      duration: DURATION.normal,
    });
    layerFade = fade;
    return () => {
      fade.destroy();
      if (layerFade === fade) layerFade = null;
    };
  });

  // A surface that knows what its View button opens (Create) names it, and
  // the viewer for it is built here, hidden and paused, once the page has
  // been quiet for a moment. The tap then slides up a viewer that is already
  // drawn. Only the shared playback engine waits for the tap: claiming it
  // stops whatever else is playing. An edit to the same sequence reaches the
  // hidden viewer as an ordinary update; another sequence rebuilds it.
  const PREWARM_QUIET_MS = 1000;
  const prewarm = $derived(getSequenceViewerPrewarm());
  let dormantPrewarm = $state.raw<SequenceViewerPrewarm | null>(null);
  let dormantKey = $state(-1);
  let cardReadyKey: number | null = null;

  function whenIdle(run: () => void): () => void {
    let idleId: number | null = null;
    const timer = setTimeout(() => {
      if (typeof requestIdleCallback === "function") {
        idleId = requestIdleCallback(run, { timeout: 2000 });
      } else {
        run();
      }
    }, PREWARM_QUIET_MS);
    return () => {
      clearTimeout(timer);
      if (idleId !== null) cancelIdleCallback(idleId);
    };
  }

  $effect(() => {
    const next = prewarm;
    // Tracked, so dropping the hidden viewer at a close schedules the next.
    if (drawerOpen || overlay.isOpen || next === dormantPrewarm) return;
    if (!next) {
      dormantPrewarm = null;
      return;
    }
    return whenIdle(() => {
      const built = dormantPrewarm;
      if (
        !built ||
        !next.sequence.id ||
        built.sequence.id !== next.sequence.id
      ) {
        dormantKey -= 1;
      }
      dormantPrewarm = next;
    });
  });

  // Decided once per open: the hidden viewer becomes the open one when the
  // open asks for what it was built with.
  const adopted = $derived.by(() => {
    void overlay.sessionKey;
    if (!overlay.isOpen) return false;
    return untrack(
      () =>
        dormantPrewarm !== null &&
        nativeLoadingCode === null &&
        canAdoptPrewarm(dormantPrewarm, overlay)
    );
  });
  // dormantPrewarm is read first on purpose. With overlay.sequence first, the
  // value stayed false after a close (Svelte 5.57), so no viewer was rebuilt.
  const viewerDormant = $derived(
    dormantPrewarm !== null && overlay.sequence === null
  );
  // dormantKey is read first for the same reason. Read only inside the
  // branch, it kept its old value after a close (Svelte 5.57): the hidden
  // viewer was rebuilt under the old key, and the next tap's new key threw
  // that build away and built the whole viewer again before the slide.
  const viewerKey = $derived.by(() => {
    const key = dormantKey;
    return adopted || overlay.sequence === null ? key : overlay.sessionKey;
  });

  function handleCardReady() {
    cardReadyKey = viewerKey;
  }

  function allowViewerMount() {
    if (viewerMountAllowed) return;
    viewerMountAllowed = true;
    if (!viewerRevealed) {
      revealCapTimer = setTimeout(revealViewer, VIEWER_REVEAL_CAP_MS);
    }
  }

  $effect(() => {
    const open = overlay.isOpen || nativeLoadingCode !== null;
    const session = overlay.sessionKey;
    untrack(() => {
      if (open && !drawerOpen) {
        // A new open, or the same viewer reopened while it slid away.
        cancelPendingDismiss();
        if (session !== openedSession) {
          const covered = nativeLoadingCode !== null;
          viewerMountAllowed = covered;
          viewerRevealed = covered;
          if (adopted) {
            // Shown at once when its card had drawn for this very sequence;
            // otherwise it fades in when ready, as a fresh viewer would. It
            // still wakes at the slide's start, below, so claiming playback
            // cannot hold the slide back.
            viewerRevealed =
              cardReadyKey === dormantKey &&
              dormantPrewarm !== null &&
              isPrewarmedContent(dormantPrewarm, overlay.sequence);
          }
        }
      }
      if (open) openedSession = session;
      drawerOpen = open;
    });
  });

  // The mount runs once the slide has started: by then the slide belongs to
  // the compositor, so building the viewer cannot hold it back. Measured in one trace, the slide dropped one frame while the viewer
  // built against three when it waited, and the viewer showed about half a
  // second sooner. Mounting before the slide starts would delay the start.
  // The fallback covers a slide that never starts (hidden tab); reduced
  // motion has none.
  $effect(() => {
    if (!drawerOpen || viewerMountAllowed || !viewerStage) return;
    const dialog = viewerStage.closest("dialog");
    const slideMs = motionDuration(DURATION.dramatic);
    if (!dialog || slideMs === 0) {
      queueMicrotask(allowViewerMount);
      return;
    }
    // transitionstart can fire before the slide's first frame is committed;
    // work run straight from it held that frame back about 300 ms in two of
    // five reopens. The transition's ready promise settles once it has started.
    let cancelled = false;
    const onStart = (event: TransitionEvent) => {
      if (event.target !== dialog || event.propertyName !== "transform") return;
      const slide = dialog
        .getAnimations()
        .find(
          (animation) =>
            animation instanceof CSSTransition &&
            animation.transitionProperty === "transform"
        );
      if (!slide) {
        allowViewerMount();
        return;
      }
      void slide.ready.then(
        () => {
          if (!cancelled) allowViewerMount();
        },
        () => {}
      );
    };
    dialog.addEventListener("transitionstart", onStart);
    const fallback = setTimeout(
      allowViewerMount,
      slideMs + motionDuration(DURATION.emphasis)
    );
    return () => {
      cancelled = true;
      dialog.removeEventListener("transitionstart", onStart);
      clearTimeout(fallback);
    };
  });

  // Closing unmounts the whole viewer and rewrites the address bar. Run inside
  // the drawer's close, that froze the release for about 700 ms and the sheet
  // vanished without sliding. The sheet now slides away first and the viewer
  // tears down once it is off-screen.
  let cancelPendingDismiss: () => void = () => {};

  function dismissAfterSlide() {
    cancelPendingDismiss();
    const dialog = viewerStage?.closest("dialog") ?? null;
    const session = overlay.sessionKey;
    const finish = () => {
      cancelPendingDismiss();
      if (drawerOpen || overlay.sessionKey !== session) return;
      finishDismiss();
    };
    const onEnd = (event: TransitionEvent) => {
      if (event.target === dialog && event.propertyName === "transform") {
        finish();
      }
    };
    dialog?.addEventListener("transitionend", onEnd);
    // Fallback for a slide that never runs (reduced motion, hidden tab).
    const timer = setTimeout(
      finish,
      motionDuration(DURATION.dramatic + DURATION.instant)
    );
    cancelPendingDismiss = () => {
      dialog?.removeEventListener("transitionend", onEnd);
      clearTimeout(timer);
      cancelPendingDismiss = () => {};
    };
  }

  onMount(() => () => {
    cancelPendingDismiss();
    if (revealCapTimer !== null) clearTimeout(revealCapTimer);
  });

  async function afterNextPaint(): Promise<void> {
    await tick();
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  }

  function loaderVisibilityDetails(): Record<
    string,
    string | number | boolean | null
  > {
    const surface = nativeLoaderSurface;
    const drawer = surface?.closest("dialog");
    if (!surface) {
      return {
        elementPresent: false,
        drawerState: drawer?.dataset.state ?? null,
        viewportCoverage: 0,
      };
    }

    const rect = surface.getBoundingClientRect();
    const visibleWidth = Math.max(
      0,
      Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0)
    );
    const visibleHeight = Math.max(
      0,
      Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0)
    );
    const viewportArea = Math.max(1, window.innerWidth * window.innerHeight);
    const drawerStyle = drawer ? getComputedStyle(drawer) : null;

    return {
      elementPresent: true,
      drawerState: drawer?.dataset.state ?? null,
      viewportCoverage:
        Math.round((visibleWidth * visibleHeight * 1000) / viewportArea) / 10,
      surfaceTop: Math.round(rect.top),
      surfaceBottom: Math.round(rect.bottom),
      viewportHeight: window.innerHeight,
      drawerTransform: drawerStyle?.transform ?? null,
      drawerOpacity: drawerStyle?.opacity ?? null,
    };
  }

  function watchLoaderVisibility(code: string): void {
    const startedAt = performance.now();
    const inspect = () => {
      if (nativeLoadingCode !== code) return;

      const details = loaderVisibilityDetails();
      if (Number(details.viewportCoverage) >= 99) {
        markNativeScanTransitionStage(code, "loader-visible", details);
        return;
      }

      if (performance.now() - startedAt < 5_000) requestAnimationFrame(inspect);
    };
    requestAnimationFrame(inspect);
  }

  function clearNativeLoader(code?: string): void {
    if (code && nativeLoadingCode !== code) return;
    nativeLoadingCode = null;
    nativeLoadingWord = "";
    nativeGlyphsReady = false;
    nativeLoadingProgress = 0;
  }

  function showNativeLoader(code: string): void {
    if (nativeLoadingCode === code) return;
    nativeLoadingCode = code;
    nativeLoadingWord = "";
    nativeGlyphsReady = false;
    nativeLoadingProgress = 8;
    playbackReleased = false;
    markNativeScanTransitionStage(code, "loader-state-created");
    watchLoaderVisibility(code);

    void afterNextPaint().then(() => {
      if (nativeLoadingCode === code) {
        markNativeScanTransitionStage(
          code,
          "loader-dom-painted",
          loaderVisibilityDetails()
        );
        markNativeScanLoadingSurfaceReady(code);
      }
    });
  }

  function handlePopState(event: PopStateEvent) {
    if (overlay.isOpen) {
      closeSequenceOverlay();
    }
  }

  onMount(() => {
    window.addEventListener("popstate", handlePopState);
    const unsubscribeNativeTransition = subscribeNativeScanViewerTransition(
      ({ code, phase }) => {
        if (phase === "started") {
          showNativeLoader(code);
          return;
        }

        playbackReleased = true;
        if (phase === "failed") {
          clearNativeLoader(code);
        } else {
          markNativeScanTransitionStage(code, "playback-released");
        }
      }
    );
    // MainApplication imports this host after the route has already finished
    // on a cold Capacitor launch. afterNavigate cannot replay that completed
    // navigation, so read the live URL once when the host joins the page.
    requestedCode = new URL(window.location.href).searchParams.get("v");
    if (requestedCode && isNativeScanViewerTransitionPending(requestedCode)) {
      showNativeLoader(requestedCode);
    }
    return () => {
      window.removeEventListener("popstate", handlePopState);
      unsubscribeNativeTransition();
    };
  });

  // The host stays mounted while someone moves around the app. A QR scan can
  // therefore arrive long after its first URL check, so every completed app
  // navigation gets a chance to hand off a new sequence code.
  afterNavigate((navigation) => {
    if (isShallowGoto(navigation)) return;
    requestedCode = navigation.to?.url.searchParams.get("v") ?? null;
  });

  $effect(() => {
    const loading = authState.loading;
    const code = requestedCode;
    const activeResolution = resolvingCode;
    if (loading || !code || activeResolution) return;

    resolvingCode = code;
    void bootstrapFromCode(code).finally(() => {
      if (requestedCode === code) requestedCode = null;
      resolvingCode = null;
    });
  });

  async function bootstrapFromCode(code: string) {
    if (typeof window === "undefined") return;
    let openedSuccessfully = false;
    let failureReason: string | null = null;
    try {
      // A serialized card's link names only code + pid; its props live on the
      // physical card record. Fetch them alongside the shortcode, not after.
      const physicalCardId = physicalCardIdNeedingProps(
        code,
        new URL(window.location.href).searchParams
      );
      const physicalCardPropsLookup = physicalCardId
        ? fetchPhysicalCardProps(code, physicalCardId, {
            // The app's bundle is local, so the lookup goes to the site.
            origin: isNative() ? APP_DOMAIN : "",
          })
        : Promise.resolve(null);

      markNativeScanTransitionStage(code, "shortcode-resolve-start");
      const manager = getShortCodeManager();
      const { sequence: resolved, record } =
        await manager.resolveShortCodeWithRecord(code);
      if (!resolved) {
        stripInvalidV(code);
        return;
      }
      markNativeScanTransitionStage(code, "shortcode-resolved");

      if (nativeLoadingCode === code) {
        const rawWord =
          resolved.word || resolved.displayName || resolved.name || "";
        nativeLoadingWord =
          getSequenceMotionProfile(resolved).kind === "solo"
            ? ""
            : simplifyRepeatedWord(rawWord);
        nativeLoadingProgress = 35;

        const baseLetters = getScanLoaderBaseLetters(nativeLoadingWord);
        if (baseLetters.length > 0) {
          markNativeScanTransitionStage(code, "glyph-load-start", {
            glyphCount: baseLetters.length,
          });
          void getGlyphCache()
            .loadGlyphsByLetter(baseLetters)
            .then(() => {
              if (nativeLoadingCode === code) {
                nativeGlyphsReady = true;
                markNativeScanTransitionStage(code, "glyphs-ready");
              }
            })
            .catch(() => {
              /* Keep the animated dots if a glyph asset is unavailable. */
            });
        }
      }

      const stillMatches =
        new URL(window.location.href).searchParams.get("v") === code;
      if (!stillMatches) return;

      markNativeScanTransitionStage(code, "hydrate-start");
      const hydrated = await hydrateSequence(resolved, {
        loopDetector: getLoopDetector(),
      });
      markNativeScanTransitionStage(code, "hydrate-complete");

      if (nativeLoadingCode === code) nativeLoadingProgress = 72;

      if (new URL(window.location.href).searchParams.get("v") !== code) return;

      const currentUrl = new URL(window.location.href);
      const propConfig = resolveScanPropConfig(
        hydrated,
        parsePropsFromURL(currentUrl.searchParams),
        await physicalCardPropsLookup,
        record
      );
      await updateSettings({
        leftPropType: propConfig.leftPropType,
        rightPropType: propConfig.rightPropType,
        catDogMode: propConfig.catDogMode,
      });
      markNativeScanTransitionStage(code, "settings-applied");

      if (nativeLoadingCode === code) nativeLoadingProgress = 88;

      playbackReleased = !isNativeScanViewerTransitionPending(code);

      openSequenceOverlay(hydrated, {
        analyticsSource: "qr",
        fromUrl: true,
        shortCode: code,
        skipHistoryPush: true,
        playOnOpen: true,
      });
      markNativeScanTransitionStage(code, "viewer-overlay-opened");
      if (nativeLoadingCode === code) nativeLoadingProgress = 94;
      openedSuccessfully = true;
    } catch (error) {
      failureReason = error instanceof Error ? error.message : String(error);
      console.warn(
        "[SequenceViewerDrawerHost] Failed to bootstrap from ?v= code:",
        error
      );
    } finally {
      if (!openedSuccessfully) {
        markNativeScanViewerFailed(
          code,
          failureReason ? { reason: failureReason } : undefined
        );
        stripInvalidV(code);
      }
    }
  }

  function stripInvalidV(code: string) {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("v") !== code) return;
    removeCurrentUrlParams(["v"]);
  }

  function handleDismiss(reason?: "navigate") {
    // A plain close slides the drawer away; its close callback finishes the
    // dismissal once the viewer is off-screen.
    if (reason !== "navigate" && drawerOpen) {
      drawerOpen = false;
      return;
    }
    finishDismiss(reason);
  }

  function finishDismiss(reason?: "navigate") {
    const path = overlay.dismissPath;
    const wasOpen = overlay.isOpen;
    const wasFromUrl = overlay.openedFromUrl;

    clearNativeScanViewerReady();
    clearNativeLoader();
    if (dormantPrewarm) {
      // The open replaced or became the hidden viewer, and the opened one
      // holds the playback engine and this session's state. The next hidden
      // one is built fresh once the page is idle, not as the sheet leaves.
      dormantPrewarm = null;
      dormantKey -= 1;
    }
    closeSequenceOverlay();
    // The next open's viewer starts asleep. Left set, the next tap handed the
    // hidden viewer a wake before the open effect could clear it, and it built
    // its playback engine and canvases before the slide could start.
    viewerMountAllowed = false;

    // Remix and Compose choose their own destination. A queued Back would
    // otherwise undo that navigation after the workspace has opened.
    if (reason === "navigate") return;

    if (path) {
      goto(path, { replace: true });
    } else if (wasOpen && !wasFromUrl) {
      window.history.back();
    }
  }

  function handleDrawerClose() {
    if (overlay.isOpen) dismissAfterSlide();
    else finishDismiss();
  }

  function handleViewerContentStatus(
    status: "loading" | "loaded" | "error"
  ): void {
    if (status !== "error") return;

    // The native loader intentionally covers the viewer and makes its drawer
    // nondismissible until the viewer reports ready. A failed lazy chunk can
    // never reach that callback, so release the cover here and let LazyMount's
    // retry UI remain available over the still-open sequence.
    const code = nativeLoadingCode;
    if (!code) return;

    markNativeScanViewerFailed(code, {
      reason: "sequence-viewer-content-load-failed",
    });
    clearNativeLoader(code);
  }

  async function handleViewerReady() {
    if (viewerDormant) return;
    revealViewer();
    const code = overlay.activeShortCode;
    if (code) {
      if (nativeLoadingCode === code) {
        markNativeScanTransitionStage(code, "animation-surface-ready");
        nativeLoadingProgress = 100;
        await afterNextPaint();
        markNativeScanTransitionStage(
          code,
          "loader-complete-painted",
          loaderVisibilityDetails()
        );
        clearNativeLoader(code);
        await afterNextPaint();
        markNativeScanTransitionStage(code, "loader-removed-painted");
      }
      markNativeScanViewerReady(code);
    } else {
      clearNativeScanViewerReady();
    }
  }
</script>

{#snippet viewerContentPlaceholder()}
  <div class="viewer-content-state" role="status" aria-live="polite">
    <span>{t("viewer_ui_loading_viewer")}</span>
    <PanelButton variant="secondary" onclick={() => handleDismiss()}>
      {t("viewer_ui_close_viewer")}
    </PanelButton>
  </div>
{/snippet}

{#snippet viewerContentError(_error: unknown, retry: () => void)}
  <div class="viewer-content-state viewer-content-error" role="alert">
    <p>{t("viewer_ui_load_failed")}</p>
    <PanelButton variant="secondary" onclick={retry}
      >{t("viewer_ui_try_again")}</PanelButton
    >
    <PanelButton variant="secondary" onclick={() => handleDismiss()}>
      {t("viewer_ui_close_viewer")}
    </PanelButton>
  </div>
{/snippet}

<Drawer
  bind:isOpen={drawerOpen}
  keepMounted
  placement="bottom"
  onclose={handleDrawerClose}
  showHandle={false}
  focusContainerOnOpen
  dismissible={nativeLoadingCode === null}
  closeOnBackdrop={nativeLoadingCode === null}
  closeOnEscape={nativeLoadingCode === null}
  ariaLabel={t("viewer_detail_sequence_viewer")}
  class="sequence-viewer-drawer"
>
  <div class="viewer-stage" bind:this={viewerStage}>
    <div
      class="viewer-layer"
      class:awaiting-reveal={!viewerRevealed}
      bind:this={viewerLayer}
    >
      <LazyMount
        loader={loadSequenceViewerContent}
        active={(overlay.sequence !== null &&
          (viewerMountAllowed || adopted)) ||
          viewerDormant}
        placeholder={overlay.sequence && viewerMountAllowed
          ? viewerContentPlaceholder
          : undefined}
        error={overlay.sequence ? viewerContentError : undefined}
        debugName="sequence viewer"
        onStatusChange={handleViewerContentStatus}
        props={viewerDormant && dormantPrewarm
          ? ({
              sequence: dormantPrewarm.sequence,
              sessionKey: viewerKey,
              isMobile: isMobileWidth,
              collectionPropType: null,
              initialBpm: 60,
              initialPlaybackMode: "continuous",
              initialStep: 0,
              initialViewMode: dormantPrewarm.initialViewMode,
              initialViewerMode: undefined,
              handPathMode: false,
              playOnOpen: dormantPrewarm.playOnOpen,
              playbackReleased: false,
              dormant: true,
              onCardReady: handleCardReady,
              onReadyForReveal: handleViewerReady,
              onClose: handleDismiss,
              shortCode: null,
              analyticsSource: dormantPrewarm.analyticsSource,
              shareOnOpen: false,
              saveOnOpen: false,
              tunnelComposition: null,
              tunnelSaveTarget: null,
              onTunnelSaved: null,
            } satisfies ComponentProps<typeof SequenceViewerDrawerContent>)
          : ({
              sequence: overlay.sequence,
              sessionKey: viewerKey,
              isMobile: isMobileWidth,
              collectionPropType: overlay.collectionPropType,
              initialBpm: overlay.initialBpm,
              initialPlaybackMode: overlay.initialPlaybackMode,
              initialStep: overlay.initialStep,
              initialViewMode: overlay.initialViewMode,
              initialViewerMode: overlay.initialViewerMode,
              handPathMode: overlay.handPathMode,
              playOnOpen: overlay.playOnOpen,
              playbackReleased,
              // A getter, so the viewer reads the wake at the slide's start
              // itself. As a plain value it kept the open's first value (Svelte
              // 5.57), and the woken viewer stayed asleep.
              get dormant() {
                return adopted && !viewerMountAllowed;
              },
              onCardReady: handleCardReady,
              onReadyForReveal: handleViewerReady,
              onClose: handleDismiss,
              shortCode: overlay.activeShortCode,
              analyticsSource: overlay.analyticsSource,
              shareOnOpen: overlay.shareOnOpen,
              saveOnOpen: overlay.saveOnOpen,
              tunnelComposition: overlay.tunnelComposition,
              tunnelSaveTarget: overlay.tunnelSaveTarget,
              onTunnelSaved: overlay.onTunnelSaved,
            } satisfies ComponentProps<typeof SequenceViewerDrawerContent>)}
      />
    </div>

    {#if nativeLoadingCode}
      <div class="native-loader-surface" bind:this={nativeLoaderSurface}>
        <ScanSequenceLoader
          word={nativeLoadingWord}
          glyphsReady={nativeGlyphsReady}
          progress={nativeLoadingProgress}
          fill
        />
      </div>
    {/if}
  </div>
</Drawer>

<style>
  /* Routed through the Drawer.css --sheet-* API; the direct border-top-*-radius
     overrides are redundant (the radius vars already drive those corners). */
  :global(.sequence-viewer-drawer) {
    /* The theme panel color is translucent, so the loading and error states
       showed the Create workspace underneath. Resolve it against the solid
       sheet base so the viewer always sits on a matte surface. */
    --sheet-bg:
      linear-gradient(var(--theme-panel-bg), var(--theme-panel-bg)),
      var(--sheet-bg-solid, #0a0a14);
    --sheet-filter: none;
    --sheet-border-radius-top-left: 0px;
    --sheet-border-radius-top-right: 0px;
    /* Full screen through the drawer's own height API. A single "100%" snap
       point used to give this height, but the drawer reads its only snap
       point as closed, so every tap inside the viewer shut it. */
    --sheet-min-height: 100dvh;
  }

  /* The drawer stays mounted so a viewer can be built in it before it opens.
     Closed, it keeps its full layout below the screen, invisible and out of
     the tab order, so that viewer measures and draws at its real size. */
  :global(dialog.sequence-viewer-drawer:not([open])) {
    display: flex;
    visibility: hidden;
  }

  .viewer-stage {
    position: relative;
    flex: 1;
    width: 100%;
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }

  .viewer-layer {
    width: 100%;
    height: 100%;
  }

  .viewer-layer.awaiting-reveal {
    opacity: 0;
  }

  .viewer-content-state {
    display: grid;
    place-items: center;
    align-content: center;
    gap: var(--space-3, 0.75rem);
    width: 100%;
    height: 100%;
    min-height: 0;
    padding: var(--space-6, 1.5rem);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.72));
    text-align: center;
  }

  .viewer-content-error {
    color: var(--theme-text, rgba(255, 255, 255, 0.95));
  }

  .viewer-content-error p {
    margin: 0;
  }

  .native-loader-surface {
    position: absolute;
    inset: 0;
    z-index: 2;
  }
</style>
