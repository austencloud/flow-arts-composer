<!--
  Physical-scan ingress.

  /q owns attribution and the one physical scan write. Once the code resolves,
  it caches the sequence and replaces itself with /sequence/[id], the canonical
  standalone viewer. Viewer chrome must never return to this route.
-->
<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { onDestroy, onMount } from "svelte";
  import { loopDetector } from "$lib/features/create/generate/circular/services/loop-detector";
  import {
    beginScanVisit,
    captureScanEvent,
    endScanViewerSession,
    updateScanAttribution,
  } from "$lib/shared/analytics/scan-analytics";
  import { scanPropProperties } from "$lib/shared/analytics/scan-prop-attribution";
  import {
    scanResolutionFailureCategory,
    type ScanResolutionFailureCategory,
  } from "$lib/shared/analytics/scan-resolution-analytics";
  import { markScan } from "$lib/shared/analytics/scan-perf";
  import { initPostHog } from "$lib/shared/analytics/services/posthog";
  import { getDeviceId } from "$lib/shared/auth/services/device-id-service";
  import {
    authState,
    initializeAuthListener,
  } from "$lib/shared/auth/state/auth-state.svelte";
  import { saveSequenceRouteHandoff } from "$lib/shared/coordinators/sequence-handoff.svelte";
  import { registerLoopDetector } from "$lib/shared/create/get-loop-detector";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import {
    clearModuleChunkRecoveryGuard,
    handleHMRInit,
  } from "$lib/shared/hmr-helper";
  import { registerLoopDisplayResolver } from "$lib/shared/loop-labeler/get-loop-display-resolver";
  import { resolveLoopDisplay } from "$lib/features/loop-labeler/services/loop-display-resolver";
  import {
    isInlineEncoded,
    parsePropsFromURL,
  } from "$lib/shared/navigation/services/sequence-encoder";
  import { hydrateSequence } from "$lib/shared/navigation/services/sequence-hydrator";
  import {
    readScanPhysicalCardId,
    recordCardScanAfterAuth,
  } from "$lib/shared/qr/services/card-scan-ingest";
  import { resolveScanPropConfig } from "$lib/shared/qr/services/scan-prop-resolver";
  import { buildScanSequenceDestination } from "$lib/shared/qr/services/scan-sequence-handoff";
  import {
    ShortCodeManager,
    type ShortCodeData,
    type ShortCodeSequenceLoader,
  } from "$lib/shared/qr/services/short-code-manager";
  import { isFirstScanRouteVisit } from "$lib/shared/qr/utils/scan-detection";

  interface Props {
    data: {
      geo: {
        country: string | null;
        city: string | null;
        lat: number | null;
        lng: number | null;
      };
      meta: {
        word: string | null;
        payloadKind: "word" | "solo";
        authoredHand: "left" | "right" | null;
        creator: string | null;
        thumbnailUrl: string | null;
        deckId: string | null;
        deckName: string | null;
        leftPropType: string | null;
        rightPropType: string | null;
      };
      record: ShortCodeData | null;
      preparedSequence: SequenceData | null;
      preparedPropConfig: {
        leftPropType: import("$lib/shared/pictograph/prop/domain/enums/prop-type").PropType;
        rightPropType: import("$lib/shared/pictograph/prop/domain/enums/prop-type").PropType;
        catDogMode: boolean;
      } | null;
    };
    onViewerReady?: () => void;
  }

  const { data, onViewerReady }: Props = $props();
  const shortCode = $derived(page.params.code);
  const isDemo = $derived(page.url.searchParams.get("demo") === "1");

  type IngressState = { kind: "loading" } | { kind: "error"; message: string };

  let ingressState = $state<IngressState>({ kind: "loading" });
  let failedWhileOffline = $state(false);
  let failureCategory = $state<ScanResolutionFailureCategory | null>(null);
  let handoffInProgress = false;

  const stubBrowseLoader = {
    loadFullSequenceData: async () => null,
  } satisfies ShortCodeSequenceLoader;
  const shortCodeManager = new ShortCodeManager(stubBrowseLoader);

  function reportFailure(
    message: string,
    category: ScanResolutionFailureCategory,
    stage: "bootstrap" | "resolve" | "load"
  ): void {
    failureCategory = category;
    captureScanEvent("qr_scan_resolution", {
      outcome: "failure",
      category,
      stage,
    });
    ingressState = { kind: "error", message };
    onViewerReady?.();
  }

  function reportRecoveryAction(
    action: "retry" | "auto_retry_online" | "browse" | "create"
  ): void {
    captureScanEvent("qr_resolution_action", {
      action,
      category: failureCategory,
    });
  }

  function handleBackOnline(): void {
    if (ingressState.kind !== "error" || !failedWhileOffline) return;
    reportRecoveryAction("auto_retry_online");
    location.reload();
  }

  onDestroy(() => {
    if (!handoffInProgress && !isDemo) {
      endScanViewerSession("route_unmount");
    }
  });

  onMount(async () => {
    markScan("start");
    handleHMRInit();
    registerLoopDetector(loopDetector);
    registerLoopDisplayResolver(resolveLoopDisplay);

    if (!shortCode) {
      reportFailure("No short code provided", "missing_code", "bootstrap");
      return;
    }

    if (!isDemo) {
      void initPostHog().catch(() => {});
      beginScanVisit(shortCode, {
        sequenceWord: data.meta.word,
        deckId: data.meta.deckId,
        deckName: data.meta.deckName,
        leftProp: data.meta.leftPropType,
        rightProp: data.meta.rightPropType,
        isAuthenticated: () => authState.isAuthenticated,
      });
      void initializeAuthListener();
    }

    try {
      markScan("shortcode-resolve-start");
      const resolution = data.preparedSequence
        ? { sequence: data.preparedSequence, record: data.record }
        : await shortCodeManager.resolveShortCodeWithRecord(
            shortCode,
            data.record
          );
      markScan("shortcode-resolved");

      let sequence = resolution.sequence;
      if (!sequence) {
        failedWhileOffline = !navigator.onLine;
        reportFailure(
          "Sequence not found",
          scanResolutionFailureCategory({
            hasShortCode: true,
            online: navigator.onLine,
            sequenceMissing: true,
          }),
          "resolve"
        );
        return;
      }

      if (!data.preparedSequence) {
        sequence = await hydrateSequence(sequence, { loopDetector });
      }
      markScan("hydrated");

      const record = resolution.record;
      const propConfig =
        data.preparedPropConfig ??
        resolveScanPropConfig(
          sequence,
          parsePropsFromURL(page.url.searchParams),
          record
        );
      const word = sequence.word || sequence.displayName || sequence.name;
      updateScanAttribution({
        sequenceWord: word || null,
        deckId: record?.deckId ?? data.meta.deckId,
        deckName: record?.deckName ?? data.meta.deckName,
        leftProp: String(propConfig.leftPropType),
        rightProp: String(propConfig.rightPropType),
      });

      const { physicalCardId, pidState } = readScanPhysicalCardId(
        page.url.searchParams
      );
      const shouldRecordScan =
        !isDemo &&
        !isInlineEncoded(shortCode) &&
        isFirstScanRouteVisit(shortCode, physicalCardId);

      if (shouldRecordScan) {
        const scanKind = physicalCardId ? "serialized" : "legacy";
        captureScanEvent("card_scanned", {
          country: data.geo.country,
          city: data.geo.city,
          scan_kind: scanKind,
          physical_card_id: physicalCardId,
          pid_state: pidState,
          ...scanPropProperties(
            propConfig.leftPropType,
            propConfig.rightPropType
          ),
        });

        // Not awaited: the ingest waits for auth to attribute a signed-in
        // scanner, and that wait must never hold the viewer handoff below.
        void recordCardScanAfterAuth(
          { shortCode, physicalCardId, deviceId: getDeviceId() },
          initializeAuthListener
        ).then((result) => {
          captureScanEvent("card_scan_ingest", {
            scan_kind: scanKind,
            physical_card_id: physicalCardId,
            outcome: result.outcome,
            ...(result.outcome === "failed"
              ? { status: result.status, error_code: result.code }
              : {}),
          });
        });
      }

      saveSequenceRouteHandoff({
        sequence,
        returnPath: `/browse/gallery?from=scan&code=${encodeURIComponent(shortCode)}`,
        returnLabel: "Browse",
      });

      const destination = buildScanSequenceDestination(
        shortCode,
        page.url.searchParams,
        propConfig
      );
      clearModuleChunkRecoveryGuard();
      handoffInProgress = true;
      await goto(destination, { replaceState: true });
    } catch (error) {
      handoffInProgress = false;
      failedWhileOffline = !navigator.onLine;
      reportFailure(
        error instanceof Error ? error.message : "Failed to load sequence",
        scanResolutionFailureCategory({
          hasShortCode: !!shortCode,
          online: navigator.onLine,
        }),
        "load"
      );
    }
  });
</script>

<svelte:window ononline={handleBackOnline} />

{#if ingressState.kind === "error"}
  <section class="error-state" aria-labelledby="scan-error-title">
    <div class="error-card">
      <i class="fas fa-circle-exclamation" aria-hidden="true"></i>
      <h1 id="scan-error-title">
        {failedWhileOffline
          ? "You're offline"
          : "This sequence isn't available"}
      </h1>
      <p>
        {failedWhileOffline
          ? "This code needs a connection. It will retry when you're back online."
          : ingressState.message}
      </p>
      <div class="actions">
        <button
          type="button"
          onclick={() => {
            reportRecoveryAction("retry");
            location.reload();
          }}
        >
          <i class="fas fa-rotate-right" aria-hidden="true"></i>
          Try Again
        </button>
        <a
          href="/browse/gallery"
          onclick={() => reportRecoveryAction("browse")}
        >
          <i class="fas fa-compass" aria-hidden="true"></i>
          Browse Sequences
        </a>
        <a
          class="secondary"
          href="/create"
          onclick={() => reportRecoveryAction("create")}
        >
          <i class="fas fa-pen" aria-hidden="true"></i>
          Create Your Own
        </a>
      </div>
    </div>
  </section>
{/if}

<style>
  .error-state {
    position: fixed;
    inset: 0;
    display: grid;
    place-items: center;
    padding: clamp(1rem, 4vw, 2rem);
    background: #0f0f1a;
    color: white;
  }

  .error-card {
    display: grid;
    justify-items: center;
    width: min(100%, 30rem);
    padding: clamp(1.5rem, 5vw, 2.5rem);
    text-align: center;
    background: rgba(5, 5, 12, 0.88);
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 1.25rem;
    box-shadow: 0 1.25rem 4rem rgba(0, 0, 0, 0.42);
  }

  .error-card > i {
    margin-bottom: 1rem;
    font-size: 2.5rem;
    color: #f87171;
  }

  h1 {
    margin: 0;
    font-size: clamp(1.4rem, 4vw, 2rem);
  }

  p {
    margin: 0.75rem 0 1.5rem;
    color: rgba(255, 255, 255, 0.72);
    line-height: 1.55;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.625rem;
  }

  button,
  a {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 2.75rem;
    gap: 0.5rem;
    padding: 0.7rem 1rem;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 0.7rem;
    background: linear-gradient(#343442, #20202a);
    box-shadow:
      inset 0 1px rgba(255, 255, 255, 0.12),
      0 0.25rem 0.6rem rgba(0, 0, 0, 0.3);
    color: white;
    font: inherit;
    font-weight: 700;
    text-decoration: none;
    cursor: pointer;
  }

  button:hover,
  a:hover {
    border-color: rgba(255, 255, 255, 0.38);
    background: linear-gradient(#404052, #282834);
  }

  button:focus-visible,
  a:focus-visible {
    outline: 3px solid #a78bfa;
    outline-offset: 3px;
  }

  a.secondary {
    background: rgba(255, 255, 255, 0.04);
    box-shadow: none;
  }
</style>
