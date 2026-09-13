<script lang="ts">
  import { withSavedProps } from "$lib/shared/foundation/services/prop-viewing";
  import {
    captureActivePropConfig,
    resolveRecordedPropConfig,
  } from "$lib/shared/foundation/services/recorded-prop-intent";
  import { getLibraryRepository } from "$lib/shared/library/get-library-repository";
  import { loadByIdentifier } from "$lib/shared/sequence-viewer/services/sequence-data-provider";
  import { loadSequencesByIds } from "$lib/features/choreo-card/services/catalog-loader";
  import type { SequenceRouteMeta } from "./sequence-seo";
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import { browser } from "$app/environment";
  import { mutateCurrentUrl } from "$lib/shared/navigation/services/url-state";
  import { onMount, onDestroy } from "svelte";
  import {
    configureShortCodeManager,
    getShortCodeManager,
  } from "$lib/shared/qr/get-short-code-manager";
  import type { ShortCodeSequenceLoader } from "$lib/shared/qr/services/short-code-manager";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import { hydrateSequence } from "$lib/shared/navigation/services/sequence-hydrator";
  import { loopDetector } from "$lib/features/create/generate/circular/services/loop-detector";
  import { registerLoopDetector } from "$lib/shared/create/get-loop-detector";
  import { registerLoopDisplayResolver } from "$lib/shared/loop-labeler/get-loop-display-resolver";
  import { resolveLoopDisplay } from "$lib/features/loop-labeler/services/loop-display-resolver";
  import {
    parsePropsFromURL,
    parseSequenceRouteId,
    decodeSequenceWithCompression,
  } from "$lib/shared/navigation/services/sequence-encoder";
  import { decodeViewMode } from "$lib/shared/browse/domain/browse-view-mode";
  import { getPublicSequenceHashMatcher } from "$lib/shared/sequence-viewer/get-public-sequence-hash-matcher";
  import { initializeAppServices } from "$lib/shared/application/state/services.svelte";
  import { getImageCompositionManager } from "$lib/shared/share/state/image-composition-state.svelte";
  import {
    consumeSequenceRouteHandoff,
    type SequenceRouteHandoff,
  } from "$lib/shared/coordinators/sequence-handoff.svelte";
  import SequenceViewerOrchestrator from "$lib/shared/sequence-viewer/components/SequenceViewerOrchestrator.svelte";
  import type { OrchestratorContext } from "$lib/shared/sequence-viewer/domain/viewer-orchestrator-context";
  import SequenceViewerShell from "$lib/shared/sequence-viewer/components/SequenceViewerShell.svelte";
  import { authDrawerState } from "$lib/shared/auth/state/auth-drawer-state.svelte";
  import { initialViewerModeForUrl } from "$lib/shared/sequence-viewer/services/viewer-modes";

  import {
    getIabBannerVisible,
    getIabBannerHeight,
    IAB_BANNER_HEIGHT,
  } from "$lib/shared/auth/state/iab-banner-state.svelte";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import LoadingGate from "$lib/shared/components/loading/LoadingGate.svelte";
  import { settingsService } from "$lib/shared/settings/state/settings-state.svelte";
  import { registerLibraryRepository } from "$lib/shared/composition-root/register-library-repository";
  import {
    beginScanVisit,
    captureScanEvent,
    captureScanExport,
    endScanViewerSession,
    refreshScanSessionAttribution,
    updateScanAttribution,
  } from "$lib/shared/analytics/scan-analytics";
  import { initPostHog } from "$lib/shared/analytics/services/posthog";
  import {
    authState,
    initializeAuthListener,
  } from "$lib/shared/auth/state/auth-state.svelte";
  import { getInAppBrowserDetector } from "$lib/shared/auth/get-in-app-browser-detector";
  import { buildScanAppHandoffHref } from "$lib/shared/qr/services/scan-app-handoff";
  import { readScanSequenceCode } from "$lib/shared/qr/services/scan-sequence-handoff";
  import { setScanCardCloudProbe } from "$lib/shared/sequence-viewer/scan-card-cloud-context";
  import {
    initialScanPlaybackBpm,
    saveScanPlaybackBpm,
  } from "$lib/shared/sequence-viewer/services/scan-playback-tempo";
  import {
    guideTargetForLetter,
    GUIDE_CODEX_SLUG,
  } from "../../(public)/guide/level-1/_data/guide-content-index";
  import { setGuideScanIntent } from "../../(public)/guide/level-1/_data/guide-scan-intent";

  // This standalone route never mounts MainApplication's composition root, so
  // nothing registered the library repository
  // or the visual save coordinator. SequenceViewerShell's Save then threw
  // "Visual sequence saving has not been registered" on the first tap, and the
  // shell's saved/owner sync threw on getLibraryRepository() for signed-in
  // viewers. Register during component init, before the descendant viewer
  // mounts, so the first saved-state sync cannot race route bootstrap.
  // Re-registering is idempotent - app mode supplies the same factories.
  if (browser) registerLibraryRepository();

  interface Props {
    data: {
      meta: SequenceRouteMeta;
    };
  }

  const { data }: Props = $props();

  // Route params
  const sequenceId = $derived(page.params.id);
  const scanOriginCode = readScanSequenceCode(
    page.params.id,
    page.url.searchParams
  );
  const isDemo = page.url.searchParams.get("demo") === "1";
  const scanAnalyticsCode = isDemo ? null : scanOriginCode;

  // Scan-origin cards keep the cloud pictograph path after /q hands off. This
  // context must exist before the descendant orchestrator mounts.
  if (scanOriginCode) setScanCardCloudProbe(true);

  // URL params for state restoration
  const urlViewMode = $derived(
    page.url.searchParams.get("view") as "animation" | "image" | "split" | null
  );
  const urlBpm = $derived(
    parseInt(page.url.searchParams.get("bpm") || "") || null
  );
  const urlTime = $derived(
    parseInt(page.url.searchParams.get("t") || "") || null
  );

  // URL metadata params (from share URLs)
  const urlWord = $derived(page.url.searchParams.get("word"));
  const urlCreator = $derived(page.url.searchParams.get("creator"));
  const urlNotes = $derived(page.url.searchParams.get("notes"));
  const urlDarkMode = $derived(page.url.searchParams.get("dark"));
  const urlDifficulty = $derived(page.url.searchParams.get("difficulty"));
  const urlBirthday = $derived(page.url.searchParams.get("birthday"));

  // URL render mode param (2D/3D)
  const urlRenderMode = $derived(
    page.url.searchParams.get("render") as "2d" | "3d" | null
  );

  // URL prop params (from QR codes with prop info)
  const urlLeftProp = $derived(page.url.searchParams.get("bp"));
  const urlRightProp = $derived(page.url.searchParams.get("rp"));

  // URL view mode param (from QR codes with browse view mode).
  // NOT the viewer mode. `vm` here is the printed-card BROWSE view mode
  // (`short-code-manager.ts` writes `vm=hsb`), decoded below into hand-path and
  // per-prop visibility. The viewer's own URL-state session carries
  // `ViewerMode` on `pane` and never reads, writes, or removes `vm` (see
  // SequenceViewerOrchestrator). Do not "unify" them — this plumbing is not
  // redundant.
  const urlViewModeParam = $derived(page.url.searchParams.get("vm"));
  const decodedBrowseViewMode = $derived(
    urlViewModeParam ? decodeViewMode(urlViewModeParam) : null
  );
  const urlHandPathMode = $derived(decodedBrowseViewMode?.subject === "hands");
  const urlInitialLeftVisible = $derived(
    decodedBrowseViewMode?.granularity === "solo"
      ? decodedBrowseViewMode.hand === "left"
      : true
  );
  const urlInitialRightVisible = $derived(
    decodedBrowseViewMode?.granularity === "solo"
      ? decodedBrowseViewMode.hand === "right"
      : true
  );

  // Guest preview mode - forces unauthenticated view for debugging shared link UX
  const forceGuest = $derived(page.url.searchParams.get("guest") === "1");

  // Sequence loading state
  let sequence = $state<SequenceData | null>(null);
  /** The route id, when it resolved as a short code. Share reuses it. */
  let resolvedShortCode = $state<string | null>(null);
  let isLoading = $state(true);
  let loadError = $state<string | null>(null);
  let handoffData = $state<SequenceRouteHandoff | null>(null);

  // IAB banner padding. The measured height is what the banner actually
  // occupies — its second copy line wraps to two or three lines on a phone, so
  // the 56px constant undershoots. It stays as the pre-measurement fallback.
  const iabBannerShowing = $derived(getIabBannerVisible());
  const iabBannerHeight = $derived(getIabBannerHeight());

  // Mobile detection
  let isMobile = $state(false);
  let scanInitialBpm = $state(60);
  let scanResolutionReported = false;

  const scanOpenAppHref = $derived(
    scanOriginCode
      ? buildScanAppHandoffHref(scanOriginCode, page.url.searchParams, {
          android:
            browser && getInAppBrowserDetector().getPlatform() === "android",
          origin: page.url.origin,
        })
      : "/browse/gallery"
  );

  // Track if orchestrator needs to restore time from URL after init
  let pendingTimeRestore = $state<number | null>(null);

  // Cleanup
  let resizeCleanup: (() => void) | null = null;

  onMount(async () => {
    // The root layout only imports composition-root in app mode, so this
    // standalone route never got the short-code registration and
    // getShortCodeManager() threw on EVERY id that is not an inline blob —
    // short codes, library doc ids, sync-room ids all dead-ended at "Failed to
    // load sequence". Wire the one registration this route consumes, the way
    // /q/[code] wires the three its bare layout skips. Resolution reads the
    // short-code doc directly; it never needs the public gallery loader.
    // Only when nothing else configured it — in app mode the composition root
    // supplies the real browse loader and must win (same guard the store's
    // hero-scan-code uses).
    try {
      getShortCodeManager();
    } catch {
      configureShortCodeManager({
        loadFullSequenceData: async () => null,
      } satisfies ShortCodeSequenceLoader);
    }

    // Without MainApplication's composition root, the
    // animation playback path's getLoopDetector() throws and the whole
    // animation/3D view dead-ends at "Animation data not available"; the
    // loop display resolver degrades silently, dropping LOOP labels.
    // Registering is idempotent — app mode re-registers the same singletons.
    registerLoopDetector(loopDetector);
    registerLoopDisplayResolver(resolveLoopDisplay);

    // Non-blocking: settings sync happens in background.
    // Don't block the viewer on service initialization.
    initializeAppServices().catch(() => {});

    if (scanAnalyticsCode) {
      void initPostHog().catch(() => {});
      beginScanVisit(scanAnalyticsCode, {
        sequenceWord: data.meta.word,
        deckName: data.meta.deckName,
        isAuthenticated: () => authState.isAuthenticated,
      });
      void initializeAuthListener();
    }

    // Mobile detection
    const checkMobile = () => {
      isMobile = window.innerWidth < 768;
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    resizeCleanup = () => window.removeEventListener("resize", checkMobile);

    // Start sequence loading immediately - don't wait for services
    void initializeRoute();
  });

  onDestroy(() => {
    resizeCleanup?.();
    if (scanAnalyticsCode) endScanViewerSession("route_unmount");
  });

  $effect(() => {
    void authState.isAuthenticated;
    if (scanAnalyticsCode) refreshScanSessionAttribution();
  });

  /** Apply URL metadata params to a decoded sequence (fills in data lost during encoding). */
  function applyUrlMetadata(seq: SequenceData): SequenceData {
    // Build a mutable updates object and cast to Partial<SequenceData>
    // since updateSequenceData uses spread which bypasses readonly
    const updates: Record<string, unknown> = {};

    if (urlWord && !seq.word) updates.word = urlWord;
    if (urlCreator && !seq.ownerDisplayName)
      updates.ownerDisplayName = urlCreator;
    if (urlDifficulty && !seq.difficultyLevel)
      updates.difficultyLevel = urlDifficulty;

    if (urlNotes) {
      updates.metadata = { ...seq.metadata, notes: urlNotes };
    }

    if (urlBirthday && !seq.birthday) {
      // Parse YYYYMMDD back into a Date - restore to birthday (original creation date),
      // not createdAt (when added to library), so the field round-trips correctly
      const y = urlBirthday.slice(0, 4);
      const m = urlBirthday.slice(4, 6);
      const d = urlBirthday.slice(6, 8);
      const date = new Date(`${y}-${m}-${d}`);
      if (!isNaN(date.getTime())) {
        updates.birthday = date;
      }
    }

    if (Object.keys(updates).length === 0) return seq;
    return { ...seq, ...updates } as SequenceData;
  }

  // Link props belong to this presentation, never to the visitor's settings.
  function applyUrlPropPreferences() {
    if (!sequence || (!urlLeftProp && !urlRightProp)) return;
    const parsed = parsePropsFromURL(page.url.searchParams);
    const saved =
      resolveRecordedPropConfig(sequence) ??
      captureActivePropConfig(settingsService.settings);
    sequence = withSavedProps(
      sequence,
      captureActivePropConfig({
        ...saved,
        leftPropType: (parsed.leftPropType as PropType) || saved.leftPropType,
        rightPropType:
          (parsed.rightPropType as PropType) || saved.rightPropType,
      })
    );
  }

  function reportScanResolutionSuccess(resolved: SequenceData): void {
    if (!scanAnalyticsCode || scanResolutionReported) return;
    scanResolutionReported = true;
    scanInitialBpm = initialScanPlaybackBpm(scanAnalyticsCode, resolved);

    const props = parsePropsFromURL(page.url.searchParams);
    updateScanAttribution({
      sequenceWord:
        resolved.word || resolved.displayName || resolved.name || null,
      deckName: data.meta.deckName,
      leftProp: props.leftPropType ? String(props.leftPropType) : null,
      rightProp: props.rightPropType ? String(props.rightPropType) : null,
    });
    captureScanEvent("qr_scan_resolution", {
      outcome: "success",
      category: "resolved",
      stage: "ready",
    });
  }

  function reportScanResolutionFailure(): void {
    if (!scanAnalyticsCode || scanResolutionReported) return;
    scanResolutionReported = true;
    captureScanEvent("qr_scan_resolution", {
      outcome: "failure",
      category: navigator.onLine ? "not_found" : "offline",
      stage: "load",
    });
  }

  function handleScanBpmChange(bpm: number): void {
    if (scanOriginCode) saveScanPlaybackBpm(scanOriginCode, bpm);
  }

  function requestGatedScanExport(
    ctx: OrchestratorContext,
    kind: "video" | "card"
  ): void {
    if (!authState.isFullAccount) {
      captureScanExport(kind, "gated", { source: "sequence_route" });
    }
    ctx.invokeGatedAction("download", () => void ctx.handleExport());
  }

  function resumeGatedScanExport(ctx: OrchestratorContext): void {
    void ctx.handleExport();
  }

  function seeInGuide(): void {
    if (!sequence) return;
    const label =
      sequence.steps?.length === 1 ? (sequence.word ?? "").trim() : "";
    const target = label ? guideTargetForLetter(label) : null;
    if (target?.cellKey) {
      setGuideScanIntent({ slug: target.slug, cellKey: target.cellKey });
      void goto(`/learn/guide/${target.slug}`);
      return;
    }

    setGuideScanIntent({ slug: GUIDE_CODEX_SLUG, sequence });
    void goto(`/learn/guide/${GUIDE_CODEX_SLUG}`);
  }

  /**
   * Fire-and-forget: compute encoderHash, query publicSequences, enrich viewer.
   * If it fails (offline, no match, error), the viewer works fine from URL data alone.
   */
  async function matchPublicRecord(seq: SequenceData) {
    try {
      const matcher = getPublicSequenceHashMatcher();
      const result = await matcher.findPublicMatch(seq);

      if (result.matched && result.publicRecord) {
        const pub = result.publicRecord;
        sequence = {
          ...seq,
          ownerId: pub.ownerId,
          ownerDisplayName: pub.ownerDisplayName,
          intendedProp: seq.intendedProp,
          creatorIntent: pub.creatorIntent ?? undefined,
          word: seq.word || pub.word,
          name: seq.name === "Shared Sequence" ? pub.name : seq.name,
        } as SequenceData;
      }
    } catch {
      // Silent failure - progressive enhancement only
    }
  }

  async function loadReleasedCatalogSequence(id: string): Promise<boolean> {
    const catalogId = data.meta.catalogId;
    if (data.meta.source !== "catalog" || !catalogId) return false;

    try {
      const [catalogSequence] = await loadSequencesByIds(catalogId, [id]);
      if (!catalogSequence) return false;

      sequence = await hydrateSequence(applyUrlMetadata(catalogSequence), {
        loopDetector,
      });
      applyUrlPropPreferences();
      isLoading = false;
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Route bootstrap with a guaranteed floor.
   *
   * Every failure used to have to be caught by the branch that produced it, and
   * one wasn't: route-id parsing threw `URIError` on any legacy QR payload whose
   * base45 body contains a `%`, escaped every branch below, and left `isLoading`
   * true forever - a spinner with no error card, no recovery links, and no scan
   * failure telemetry. A resolution that cannot finish must still end the load.
   */
  async function initializeRoute() {
    try {
      await resolveRouteSequence();
    } catch (err) {
      console.error("[SequenceRoute] Route bootstrap failed:", err);
      if (!sequence) {
        loadError = "Invalid sequence URL";
        isLoading = false;
      }
    }

    // Store pending time restore from URL (orchestrator will handle after animation init)
    if (urlTime) {
      pendingTimeRestore = urlTime;
    }

    if (sequence && !loadError) reportScanResolutionSuccess(sequence);
    else if (loadError) reportScanResolutionFailure();
  }

  async function resolveRouteSequence() {
    // Try handoff data first (from Browse gallery)
    handoffData = consumeSequenceRouteHandoff();

    if (handoffData?.sequence) {
      sequence = handoffData.sequence;
      // Apply URL prop preferences even when using handoff (QR might have props)
      applyUrlPropPreferences();
      isLoading = false;
    } else if (sequenceId) {
      const parsed = parseSequenceRouteId(sequenceId);

      if (parsed.encoded) {
        try {
          let decoded = decodeSequenceWithCompression(parsed.encoded);

          decoded = await hydrateSequence(decoded, {
            loopDetector,
          });

          sequence = applyUrlMetadata(decoded);

          // Apply URL dark mode preference before the orchestrator mounts
          if (urlDarkMode !== null) {
            const imageComposition = getImageCompositionManager();
            imageComposition.setDarkMode(urlDarkMode === "1");
          }

          // Apply URL prop preferences (from QR codes with embedded prop info)
          applyUrlPropPreferences();

          isLoading = false;

          // Background: try to match against public library for attribution
          void matchPublicRecord(sequence!);
        } catch (err) {
          console.error(
            "[SequenceRoute] Failed to decode sequence from URL:",
            err
          );
          loadError = "Invalid sequence URL";
          isLoading = false;
        }
      } else if (parsed.inlineQr) {
        // A legacy self-contained QR payload. The short-code manager owns that
        // envelope (`q1:`/`r1:`/`raw:`) and decodes it with the radio off.
        await loadSequenceFromId(parsed.inlineQr);
      } else if (parsed.legacyId) {
        const loadedFromCatalog = await loadReleasedCatalogSequence(
          parsed.legacyId
        );
        if (!loadedFromCatalog) {
          await loadSequenceFromId(parsed.legacyId);
        }
      } else {
        loadError = "No sequence data in URL";
        isLoading = false;
      }
    } else {
      loadError = "No sequence ID provided";
      isLoading = false;
    }
  }

  async function loadSequenceFromId(id: string) {
    isLoading = true;
    loadError = null;
    resolvedShortCode = null;

    try {
      // A self-contained `s~` payload goes straight to the short-code manager:
      // its inline branch is the one decoder that understands the QR envelope
      // and it resolves offline, before any network leg. The pre-step that used
      // to sit here handed the payload to the URL decoder instead, which either
      // threw (`q1:`/`r1:`) or, for a `raw:` envelope, read `s~raw:iiSS` as the
      // header and returned a plausible but wrong sequence.
      const shortCodeManager = getShortCodeManager();
      let resolvedSequence = await shortCodeManager.resolveShortCode(id);
      if (resolvedSequence) resolvedShortCode = id;

      if (!resolvedSequence) {
        resolvedSequence = await loadByIdentifier(id);
      }

      // Try user's Firestore library (e.g. sync room IDs are Firestore doc IDs)
      if (!resolvedSequence) {
        try {
          const libraryRepo = getLibraryRepository();
          resolvedSequence = await libraryRepo.getSequence(id);
        } catch {
          // Library lookup failed (not logged in, etc.)
        }
      }

      if (!resolvedSequence) {
        loadError =
          "It may have been deleted by the owner while you were browsing the feed.";
        isLoading = false;
        return;
      }

      sequence = await hydrateSequence(resolvedSequence, {
        loopDetector,
      });
      // Apply URL prop preferences (from QR codes with embedded prop info)
      applyUrlPropPreferences();
      isLoading = false;
    } catch (err) {
      console.error("[SequenceRoute] Failed to load sequence:", err);
      loadError = "Failed to load sequence";
      isLoading = false;
    }
  }

  // ============================================================================
  // NAVIGATION
  // ============================================================================

  function handleClose(reason?: "navigate") {
    if (isDemo || reason === "navigate") return;
    if (handoffData?.returnPath) {
      void goto(handoffData.returnPath);
      return;
    }
    if (browser && window.history.length > 1) {
      window.history.back();
      return;
    }
    void goto("/browse/gallery");
  }

  function updateUrlParam(key: string, value: string) {
    if (!browser) return;
    mutateCurrentUrl((url) => {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    });
  }
</script>

{#if isLoading}
  <div class="sequence-route-page">
    <div class="loading-container">
      <LoadingGate variant="card" message="Loading sequence..." />
    </div>
  </div>
{:else if loadError || !sequence}
  <div class="sequence-route-page">
    <div class="error-container">
      <div class="error-card">
        <i class="fas fa-exclamation-circle error-icon" aria-hidden="true"></i>
        <h1>This sequence isn't available</h1>
        <p>
          {loadError ||
            "The link may be broken, or the sequence was deleted by its owner."}
        </p>
        <div class="recovery-actions">
          <a class="recovery-button" href="/browse/gallery">
            <i class="fas fa-compass" aria-hidden="true"></i>
            Browse Sequences
          </a>
          <a class="recovery-button ghost" href="/create">
            <i class="fas fa-pen" aria-hidden="true"></i>
            Create Your Own
          </a>
        </div>
      </div>
    </div>
  </div>
{:else}
  <SequenceViewerOrchestrator
    {sequence}
    {isMobile}
    {forceGuest}
    initialBpm={urlBpm ||
      (scanOriginCode ? scanInitialBpm : handoffData?.playbackState?.bpm || 60)}
    initialStep={handoffData?.playbackState?.currentStep || 0}
    initialViewMode={urlViewMode || undefined}
    initialRenderMode={urlRenderMode || (scanOriginCode ? "2d" : undefined)}
    initialViewerMode={initialViewerModeForUrl(
      !!scanOriginCode,
      page.url.searchParams.get("pane"),
      urlRenderMode
    )}
    deferInteractiveStartup={!!scanOriginCode}
    initialActiveEffect={scanOriginCode ? "trails" : undefined}
    handPathMode={urlHandPathMode}
    initialLeftVisible={urlInitialLeftVisible}
    initialRightVisible={urlInitialRightVisible}
    onClose={handleClose}
    onUrlParamChange={updateUrlParam}
    onBpmChange={scanOriginCode ? handleScanBpmChange : undefined}
    onGatedDownload={scanOriginCode ? resumeGatedScanExport : undefined}
    shortCode={resolvedShortCode}
  >
    {#snippet children(ctx)}
      <main
        class="sequence-route-page"
        data-fullscreen={ctx.isFullscreen}
        style:padding-bottom={iabBannerShowing
          ? `${iabBannerHeight || IAB_BANNER_HEIGHT}px`
          : undefined}
      >
        <SequenceViewerShell
          {ctx}
          {sequence}
          analyticsSource={scanOriginCode ? "qr" : "external_link"}
          {isMobile}
          startInCardThenSplit={!!scanOriginCode}
          embedded={isDemo}
          onClose={handleClose}
          navigation={{
            label: handoffData?.returnLabel
              ? `Back to ${handoffData.returnLabel}`
              : "Back",
          }}
          openAppHref={scanOpenAppHref}
          onAccountSignIn={scanOriginCode ? ctx.openSignInPrompt : undefined}
          guideAction={scanOriginCode
            ? { label: "See it in the Guide", onSelect: seeInGuide }
            : null}
          exportOverrides={scanOriginCode
            ? {
                onVideoExport: () => requestGatedScanExport(ctx, "video"),
                onCardExport: () => requestGatedScanExport(ctx, "card"),
                videoBusy: ctx.isExporting,
                videoProgress: ctx.exportProgress,
                cardBusy: ctx.isExporting,
              }
            : undefined}
          showFullscreenControls
        />
      </main>
    {/snippet}
  </SequenceViewerOrchestrator>
{/if}

<!-- The take-it-home export gate (ensureFullAccountForExport) opens this drawer
     through authDrawerState. MainApplication mounts it for the in-app viewer;
     this standalone route has no shell, so without its own mount a guest
     clicking Record Scene or Share saw nothing happen at all. -->
{#if !authState.isFullAccount}
  {#await import("$lib/shared/auth/components/AuthModal.svelte") then mod}
    <mod.default
      open={authDrawerState.open}
      initialMode={authDrawerState.initialMode}
      reason={authDrawerState.reason}
      onClose={() => authDrawerState.hide()}
    />
  {/await}
{/if}

<style>
  .sequence-route-page {
    /* One shared clock for the practice push (matches the drawer host). */
    --ws-dur: 300ms;
    --ws-ease: cubic-bezier(0.2, 0, 0, 1);
    display: flex;
    flex-direction: column;
    height: 100vh;
    height: 100dvh;
    overflow: hidden;
  }

  /* Loading state */
  .loading-container {
    flex: 1;
    position: relative;
  }

  /* Error state */
  .error-container {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
  }

  .error-card {
    text-align: center;
    padding: 2rem;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 1rem;
    max-width: 400px;
  }

  .error-icon {
    font-size: 48px;
    color: var(--semantic-error, #ef4444);
    margin-bottom: 1rem;
  }

  .error-card h1 {
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--theme-text, #ffffff);
    margin: 0 0 0.5rem 0;
  }

  .error-card p {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    margin: 0 0 1.5rem 0;
    font-size: var(--font-size-sm, 14px);
  }

  .recovery-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.5rem;
  }

  .recovery-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    min-height: var(--min-touch-target);
    padding: 0.75rem 1.25rem;
    background: var(--theme-accent, #f43f5e);
    color: white;
    border: none;
    border-radius: 0.5rem;
    font-weight: 600;
    font-size: var(--font-size-sm, 14px);
    text-decoration: none;
    cursor: pointer;
    transition: filter var(--duration-normal, 200ms) ease;
  }

  .recovery-button.ghost {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    border: 1px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.18));
    color: var(--theme-text, #ffffff);
  }

  .recovery-button:hover {
    filter: brightness(1.1);
  }

  .recovery-button:focus-visible {
    outline: 2px solid var(--theme-accent, #f43f5e);
    outline-offset: 2px;
  }
</style>
