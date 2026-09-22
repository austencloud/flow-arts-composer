<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { fade } from "svelte/transition";
  import MandalaPane from "./MandalaPane.svelte";
  import TunnelArtView from "../tunnel/TunnelArtView.svelte";
  import ArtSettingsPanel from "./ArtSettingsPanel.svelte";
  import ExportTakeover from "$lib/shared/video-export/components/ExportTakeover.svelte";
  import { toExportTakeoverPhase } from "$lib/shared/video-export/services/export-takeover-phase";
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import VideoPreviewPanel from "./VideoPreviewPanel.svelte";
  import { sequenceModalExporter } from "../services/sequence-modal-exporter.svelte";
  import { exportVideoFilename } from "../services/export-video-filename";
  import { shareOrDownloadBlob } from "$lib/shared/foundation/services/file-downloader";
  import { TunnelViewController } from "../tunnel/tunnel-view-controller.svelte";
  import {
    MandalaViewerController,
    type MandalaExportPhase,
  } from "../state/mandala-viewer-controller.svelte";
  import type { MandalaExportDelivery } from "../services/mandala-export-delivery";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import type { FanAppearance } from "$lib/shared/pictograph/prop/domain/fan-appearance";
  import type { ViewerPlaybackState } from "../domain/viewer-prop-groups";
  import type {
    PlaybackMode,
    StepPlaybackStepSize,
  } from "$lib/shared/animation-engine/state/animation-panel-state.svelte";
  import { getEffectsConfigContext } from "$lib/shared/effects/state/effects-config-context";
  import { getAnimationVisibilityManager } from "$lib/shared/animation-engine/state/animation-visibility-state.svelte";
  import { animationSettings } from "$lib/shared/animation-engine/state/animation-settings-state.svelte";
  import { settingsService } from "$lib/shared/settings/state/settings-state.svelte";
  import {
    captureTunnelSnapshot,
    type SnapshotDeps,
    type TunnelSavedCallback,
  } from "../tunnel/tunnel-snapshot";
  import { capturePosterFromContainer } from "../tunnel/tunnel-poster";
  import { tunnelCollectionState } from "$lib/features/tunnel-collection/state/tunnel-collection-state.svelte";
  import { TUNNEL_AUTO_EXPORT_INTENT_KEY } from "$lib/features/tunnel-collection/services/open-tunnel-in-viewer";
  import { refreshTunnelPoster } from "$lib/features/tunnel-collection/services/tunnel-poster-refresh";
  import { deriveTunnelName } from "$lib/shared/sequence-viewer/tunnel/tunnel-name";
  import { simplifyRepeatedWord } from "$lib/shared/foundation/utils/word-simplifier";
  import { toast } from "$lib/shared/toast/state/toast-state.svelte";
  import {
    exportDeliveryStage,
    mandalaStageForPhase,
    tunnelStagesForState,
    type ArtExportAnalyticsValue,
    type ArtExportEventSink,
    type ArtExportStage,
    type ArtExportType,
  } from "../domain/art-export-analytics";
  import {
    toggleTunnelPlayback,
    type TunnelPlaybackSource,
  } from "../domain/tunnel-playback";
  import { ExportAttemptGuard } from "../domain/export-attempt-guard";
  import type { ViewerActionSink } from "../domain/viewer-control-analytics";
  import {
    beginTunnelSaveAttempt,
    createTunnelSaveDedupeState,
    createTunnelSaveFingerprint,
    finishTunnelSaveAttempt,
  } from "../domain/tunnel-save-deduplication";
  import { reportPostHogLifecycleEvent } from "$lib/shared/analytics/services/posthog-lifecycle-reporter";
  import { authState } from "$lib/shared/auth/state/auth-state.svelte";
  import {
    primaryTunnelSourceSequenceId,
    type TunnelComposition,
    type TunnelSaveTarget,
  } from "../tunnel/tunnel-composition";
  import { getOptionalViewerInspectorHostContext } from "../context/viewer-inspector-host-context";
  import { getOptionalViewerTunnelStageContext } from "../context/viewer-tunnel-stage-context";
  import { reparentToInspector } from "./reparent-to-inspector";

  // Mandala is the static tip-path bloom; Tunnel is the live kaleidoscope. The
  // viewer's mode rail picks one — this pane renders the chosen view, fixed.
  type ArtType = ArtExportType;

  const {
    sequence,
    playback,
    artType,
    controller: providedController,
    active = true,
    shown,
    layout = "sidebar",
    sharedTunnelCanvas = false,
    leftPropType,
    rightPropType,
    bpm = 60,
    onBpmChange = () => {},
    playbackMode = "continuous",
    onPlaybackModeChange = () => {},
    onPlaybackToggle = () => {},
    onPropChange,
    fanAppearance,
    onFanAppearanceChange,
    onArtExport,
    onArtShare,
    artShareActive = false,
    onArtExportEvent,
    onArtSettingChange,
    onArtAction,
    tunnelComposition = null,
    tunnelSaveTarget = null,
    onTunnelCanvasReadyChange,
    onTunnelSaved,
  }: {
    sequence: SequenceData;
    playback: ViewerPlaybackState;
    /** Which art view this pane renders. The mode rail switches between Mandala
     *  and Tunnel now, so the pane no longer hosts an in-panel toggle. */
    artType: ArtType;
    controller?: TunnelViewController;
    /** False while a persistent art pane is parked behind another viewer mode. */
    active?: boolean;
    /**
     * Is this pane the one the user is actually looking at? Distinct from
     * `active`, which stays true on the main side for BOTH art panes so their
     * controllers keep running — so `active` cannot answer "which art is the
     * header's Share about." Defaults to `active` for hosts with one art pane.
     */
    shown?: boolean;
    /** "bottom" (mobile) swaps the right sidebar for a ControlDock floating over
     *  the art; "sidebar" (default, desktop) keeps the right rail. */
    layout?: "sidebar" | "bottom";
    /** The viewer's already-mounted AnimatorCanvas renders Tunnel in place. */
    sharedTunnelCanvas?: boolean;
    leftPropType?: string;
    rightPropType?: string;
    bpm?: number;
    onBpmChange?: (bpm: number) => void;
    playbackMode?: PlaybackMode;
    onPlaybackModeChange?: (mode: PlaybackMode) => void;
    onPlaybackToggle?: () => void;
    /** Change the art view's prop type (routes through the viewer's shared
     *  handlePropTypeChange). Surfaces the Props rail section in the tunnel. */
    onPropChange?: (propType: PropType) => void;
    fanAppearance?: FanAppearance;
    onFanAppearanceChange?: (appearance: FanAppearance) => void;
    /**
     * Resolved viewer export entry. When the type is "tunnel" the caller MUST
     * thread `additionalLayersForBeat` + the all-false `overlayOverrides`
     * through to the offscreen renderer (the kaleidoscope is pure visual). When
     * the type is "mandala" the caller drives the mandala's OWN export worker via
     * `mandalaController.startExport()` (a separate pipeline — never the shared
     * orchestrator). Omitted on surfaces (e.g. the QR landing page) that have no
     * live playback controller / canvas to drive a video export.
     */
    onArtExport?: (args: {
      artType: ArtType;
      controller: TunnelViewController;
      mandalaController: MandalaViewerController;
    }) => void;
    /**
     * Registers this art view as what the header's Share is currently about,
     * and withdraws it when the pane parks. The pane owns the two controllers,
     * so it hands them up rather than rendering a Share of its own: Share lives
     * in the header on every pane, and the pane's job is only to say what the
     * user is looking at. Austen (2026-08-11): "Let's keep Share in one
     * consistent place in the header always."
     */
    onArtShare?: (
      args: {
        artType: ArtType;
        controller: TunnelViewController;
        mandalaController: MandalaViewerController;
        capturePreview: () => string;
      } | null
    ) => void;
    /** The share sheet owns the current render; keep the inline preview out. */
    artShareActive?: boolean;
    onArtExportEvent?: ArtExportEventSink;
    onArtSettingChange?: (
      group: string,
      setting: string,
      previousValue: string | number | boolean | null,
      value: string | number | boolean | null,
      coalesce?: boolean,
      source?: string
    ) => void;
    onArtAction?: ViewerActionSink;
    tunnelComposition?: TunnelComposition | null;
    tunnelSaveTarget?: TunnelSaveTarget | null;
    onTunnelCanvasReadyChange?: (ready: boolean) => void;
    onTunnelSaved?: TunnelSavedCallback;
  } = $props();

  // The sequence viewer supplies its shell-owned controller so the persistent
  // Animator canvas and these controls always read the same tunnel state.
  // Standalone ArtPane callers retain the same behavior through this fallback.
  const controller =
    providedController ??
    new TunnelViewController({
      getSequence: () => playback.animationState.sequenceData ?? sequence,
      getComposition: () => tunnelComposition,
    });
  $effect(() => {
    if (!providedController) controller.active = artType === "tunnel";
  });
  const saveTunnelLabel = $derived(
    tunnelSaveTarget ? "Save tunnel changes" : "Save tunnel to Visuals"
  );
  const inspectorHost = getOptionalViewerInspectorHostContext();
  const tunnelStage = getOptionalViewerTunnelStageContext();
  const presented = $derived(shown ?? active);
  const externalInspectorTarget = $derived(
    layout === "sidebar" ? (inspectorHost?.target ?? null) : null
  );

  // The mandala controller is owned HERE (not inside MandalaPane) so the same
  // instance backs the in-pane dock/takeover AND the Art panel's Export button —
  // the orchestrator drives the mandala's own export worker via
  // mandalaController.startExport() (a pipeline separate from the shared video
  // export orchestrator).
  const mandalaController = new MandalaViewerController({
    getSequence: () => playback.animationState.sequenceData ?? sequence,
    getLeftPropType: () => leftPropType,
    getRightPropType: () => rightPropType,
    pathPolicy: getAnimationVisibilityManager(),
    customColorState: controller.customColorState,
  });

  // Effects config (grabbed at init — getContext must run during setup) + a ref
  // to the art body so "Save tunnel" can snapshot the live config and grab a
  // poster off the rendered canvas.
  const effectsForSave = getEffectsConfigContext();
  let artBodyEl = $state<HTMLDivElement | null>(null);

  // Playback display state read from the live panel state, so the rail's
  // Playback pane mirrors the 2D transport.
  const stepSize = $derived<StepPlaybackStepSize>(
    playback.animationState.stepPlaybackStepSize ?? 1
  );

  let tunnelAttemptActive = false;
  let tunnelDeliveryNeedsRetry = false;
  let previousTunnelExporting = false;
  let reportedTunnelError: string | null = null;
  let previousMandalaPhase: MandalaExportPhase = "idle";
  let previousMandalaDelivery: MandalaExportDelivery | null = null;
  const tunnelExportAttempt = new ExportAttemptGuard();
  const mandalaExportAttempt = new ExportAttemptGuard();
  let exportAttemptBusy = $state(false);
  let tunnelPlaying = $state(true);
  let tunnelSaveDedupeState = createTunnelSaveDedupeState();

  function handleTunnelPlaybackToggle(source: TunnelPlaybackSource): void {
    tunnelPlaying = toggleTunnelPlayback(
      tunnelPlaying,
      source,
      (previousValue, value, eventSource) =>
        onArtSettingChange?.(
          "art_tunnel",
          "playing",
          previousValue,
          value,
          false,
          `tunnel_${eventSource}`
        )
    );
  }

  function artExportConfig(): Record<string, ArtExportAnalyticsValue> {
    const common = {
      bpm,
      left_prop: leftPropType ?? null,
      right_prop: rightPropType ?? null,
    };
    if (artType === "tunnel") {
      return {
        ...common,
        fold: controller.fold,
        mirror: controller.mirror,
        flip: controller.flip,
        invert: controller.invert,
        echo: controller.echo,
        stagger_steps: controller.staggerSteps,
        speed_override_count: Object.keys(controller.speedOverrides).length,
        color_mode: controller.colorMode,
        left_prop_color:
          controller.colorMode === "custom"
            ? controller.customPropColors.left
            : null,
        right_prop_color:
          controller.colorMode === "custom"
            ? controller.customPropColors.right
            : null,
        grid_visible: controller.gridVisible,
        performer_count: controller.performerCount,
        preset: controller.activePresetId ?? "custom",
      };
    }
    return {
      ...common,
      path_shape: mandalaController.pathShape,
      rotation_degrees: mandalaController.rotation,
      speed: mandalaController.speed,
      depth: mandalaController.depth,
      color_mode: mandalaController.colorMode,
      color_preset: mandalaController.preset,
      line_weight: mandalaController.lineWeight,
      repetitions: mandalaController.exportReps,
      resolution: mandalaController.exportResolution,
      fps: mandalaController.exportFps,
    };
  }

  function emitArtExport(
    stage: ArtExportStage,
    properties: Record<string, ArtExportAnalyticsValue> = {}
  ): void {
    onArtExportEvent?.(artType, stage, {
      ...artExportConfig(),
      ...properties,
    });
  }

  function handleExport(stage: "requested" | "retry" = "requested") {
    const attempt =
      artType === "tunnel" ? tunnelExportAttempt : mandalaExportAttempt;
    if (attempt.begin() === null) return;
    exportAttemptBusy = true;
    if (artType === "tunnel") {
      tunnelAttemptActive = true;
      tunnelDeliveryNeedsRetry = false;
      reportedTunnelError = null;
    }
    emitArtExport(stage);
    if (!onArtExport) {
      finishArtExportAttempt("failed", { reason: "not_ready" });
      return;
    }
    onArtExport({ artType, controller, mandalaController });
  }

  /**
   * Tell the shell what the header's Share is about while this pane is up, and
   * take it back when it parks. Art panes stay mounted behind other viewer
   * modes, so an unregistered target would make a plain 2D share hand over a
   * mandala.
   */
  $effect(() => {
    if (!(shown ?? active)) {
      onArtShare?.(null);
      return;
    }
    onArtShare?.({
      artType,
      controller,
      mandalaController,
      // A tunnel is assembled from the prop, trail, and effect canvases that
      // are already on screen. Composite those live layers; do not create a
      // second renderer that could drift from its colors or effects.
      capturePreview: () =>
        artType === "tunnel"
          ? capturePosterFromContainer(
              sharedTunnelCanvas
                ? (tunnelStage?.canvas?.closest<HTMLElement>(
                    "[data-persistent-animator]"
                  ) ?? null)
                : artBodyEl,
              { size: 960 }
            )
          : "",
    });
    return () => onArtShare?.(null);
  });

  function finishArtExportAttempt(
    stage: "completed" | "failed" | "canceled",
    properties: Record<string, ArtExportAnalyticsValue> = {}
  ): boolean {
    const attempt =
      artType === "tunnel" ? tunnelExportAttempt : mandalaExportAttempt;
    const token = attempt.token;
    if (token === null || !attempt.finish(token)) return false;
    emitArtExport(stage, properties);
    exportAttemptBusy = false;
    if (artType === "tunnel") tunnelAttemptActive = false;
    return true;
  }

  function cancelMandalaExport(): void {
    finishArtExportAttempt("canceled", { user_initiated: true });
    mandalaController.cancelExport();
  }

  function retryMandalaExport(): void {
    handleExport("retry");
  }

  $effect(() => {
    const phase = mandalaController.exportPhase;
    const delivery = mandalaController.exportDelivery;
    const stage = mandalaStageForPhase(previousMandalaPhase, phase);
    const deliveryOwnsStage =
      delivery && (stage === "completed" || stage === "failed");
    if (artType === "mandala" && stage && !deliveryOwnsStage) {
      if (stage === "started" && mandalaExportAttempt.active) {
        emitArtExport(stage);
      } else if (stage === "failed") {
        finishArtExportAttempt("failed", { reason: "export_error" });
      } else if (stage === "completed") {
        finishArtExportAttempt("completed");
      }
    }
    if (
      artType === "mandala" &&
      delivery &&
      delivery !== previousMandalaDelivery
    ) {
      finishArtExportAttempt(delivery.outcome, {
        delivery_method: delivery.method,
        ...(delivery.outcome === "failed"
          ? { reason: "delivery_error" }
          : delivery.outcome === "canceled"
            ? { reason: "share_dismissed", user_initiated: false }
            : {}),
      });
    }
    previousMandalaPhase = phase;
    previousMandalaDelivery = delivery;
  });

  // Auto-export intent (collection page "Create video" button): consume the
  // session flag once, then fire the normal export path as soon as the live
  // playback controller + hydrated sequence exist. Poll (250ms, 15s cap) —
  // readiness spans the orchestrator's async service load, which has no single
  // reactive signal reachable from here.
  onMount(() => {
    if (artType !== "tunnel" || !onArtExport) return;
    let intent = false;
    try {
      intent = sessionStorage.getItem(TUNNEL_AUTO_EXPORT_INTENT_KEY) === "1";
      if (intent) sessionStorage.removeItem(TUNNEL_AUTO_EXPORT_INTENT_KEY);
    } catch {
      /* storage unavailable — no auto-export */
    }
    if (!intent) return;
    const started = performance.now();
    const timer = setInterval(() => {
      const ready =
        !playback.animationLoading &&
        !!playback.animationState.sequenceData &&
        !!playback.getPlaybackController?.();
      if (ready) {
        clearInterval(timer);
        // One settle frame so the engine finishes its first render before the
        // offscreen exporter clones its state.
        setTimeout(() => handleExport(), 400);
      } else if (performance.now() - started > 15_000) {
        clearInterval(timer); // give up silently; the manual Export still works
      }
    }, 250);
    return () => clearInterval(timer);
  });

  // Tunnel export drives the shared sequenceModalExporter (mandala uses its own
  // worker), so its progress + inline preview surface over the canvas here — the
  // Art pane has no Download-panel chrome of its own. Cancel maps to the
  // exporter's cancel.
  const exportState = $derived(sequenceModalExporter.state);
  const effectiveSeq = $derived(
    playback.animationState.sequenceData ?? sequence
  );

  // Map the shared exporter state onto ExportTakeover's phase via the shared
  // mapper — same premium blue→red ring as the mandala + animation exports.
  // tunnel-only (mandala has its own takeover).
  const takeover = $derived(
    toExportTakeoverPhase(exportState.progress, exportState.isExporting, {
      active: artType === "tunnel",
      error: exportState.error,
    })
  );
  // Stamp the look so variant exports of one sequence don't collide.
  const tunnelSuffix = $derived(`-tunnel-${controller.activeLook.id}`);

  $effect(() => {
    const exporting = exportState.isExporting;
    const error = exportState.error;
    if (artType === "tunnel" && tunnelAttemptActive) {
      const observation = tunnelStagesForState({
        previousExporting: previousTunnelExporting,
        exporting,
        error,
        reportedError: reportedTunnelError,
      });
      for (const stage of observation.stages) {
        if (stage === "started") emitArtExport(stage);
        else finishArtExportAttempt("failed", { reason: "export_error" });
      }
      reportedTunnelError = observation.reportedError;
    }
    previousTunnelExporting = exporting;
  });

  // Preview-first save: share sheet on mobile, download on desktop (the platform
  // gate lives in shareOrDownloadBlob). The blob is recovered from the preview's
  // object URL so the user picks where it lands instead of a blind auto-download.
  async function saveTunnelVideo() {
    const url = exportState.previewBlobUrl;
    if (!url) return;
    if (!tunnelExportAttempt.active) {
      if (tunnelExportAttempt.begin() === null) return;
      tunnelAttemptActive = true;
      exportAttemptBusy = true;
      emitArtExport("retry", { reason: "delivery_retry" });
      tunnelDeliveryNeedsRetry = false;
    }
    const attemptToken = tunnelExportAttempt.token;
    if (attemptToken === null) return;
    try {
      const blob = await (await fetch(url)).blob();
      const result = await shareOrDownloadBlob(
        blob,
        exportVideoFilename(effectiveSeq, tunnelSuffix),
        {
          title: "TKA Tunnel",
        }
      );
      if (!tunnelExportAttempt.isActive(attemptToken)) return;
      const deliveryStage = exportDeliveryStage(result);
      if (deliveryStage === "canceled") {
        finishArtExportAttempt("canceled", {
          reason: "share_dismissed",
          delivery_method: result.method,
          user_initiated: false,
        });
        tunnelDeliveryNeedsRetry = true;
        return;
      }
      if (deliveryStage === "failed") {
        finishArtExportAttempt("failed", {
          reason: "delivery_error",
          delivery_method: result.method,
        });
        tunnelDeliveryNeedsRetry = true;
        toast.error("Couldn't save the tunnel video");
        return;
      }
      finishArtExportAttempt(deliveryStage, { delivery_method: result.method });
      tunnelDeliveryNeedsRetry = false;
    } catch {
      if (tunnelExportAttempt.isActive(attemptToken)) {
        finishArtExportAttempt("failed", { reason: "delivery_error" });
        tunnelDeliveryNeedsRetry = true;
        toast.error("Couldn't save the tunnel video");
      }
    }
  }

  function dismissTunnelPreview(): void {
    if (tunnelExportAttempt.active) {
      finishArtExportAttempt("canceled", {
        reason: "preview_dismissed",
        user_initiated: true,
      });
    }
    tunnelDeliveryNeedsRetry = false;
    sequenceModalExporter.dismissPreview();
  }

  function cancelTunnelExport(): void {
    finishArtExportAttempt("canceled", { user_initiated: true });
    tunnelDeliveryNeedsRetry = false;
    sequenceModalExporter.cancel();
    sequenceModalExporter.clearError();
  }

  function retryTunnelExport(): void {
    sequenceModalExporter.clearError();
    handleExport("retry");
  }

  function abandonArtExport(reason: "mode_switch" | "component_destroy"): void {
    const attempt =
      artType === "tunnel" ? tunnelExportAttempt : mandalaExportAttempt;
    if (attempt.abandon() === null) return;
    emitArtExport("canceled", { reason, user_initiated: false });
    exportAttemptBusy = false;
    if (artType === "tunnel") {
      tunnelAttemptActive = false;
      tunnelDeliveryNeedsRetry = false;
      sequenceModalExporter.cancel();
      sequenceModalExporter.dismissPreview();
    } else {
      mandalaController.cancelExport();
    }
  }

  let wasActive = active;
  $effect(() => {
    if (wasActive && !active) abandonArtExport("mode_switch");
    wasActive = active;
  });

  onDestroy(() => abandonArtExport("component_destroy"));

  // Capture the live tunnel (config + effects + poster) into the collection.
  // ArtPane coordinates the controller and effects context, so both the
  // settings-panel button and canvas right-click route through one handler.
  async function handleSaveTunnel(
    source: "settings_panel" | "canvas_context_menu"
  ) {
    const seq = effectiveSeq;
    if (!seq || !effectsForSave) {
      onArtAction?.(
        "tunnel_save",
        { stage: "failed", source, reason: "not_ready" },
        { count: false }
      );
      return;
    }
    // Capture-only deps: real handles for everything captureTunnelSnapshot READS;
    // the apply-only members (settings.updateSettings, playback.*) are never
    // called on this path, so they are no-op stubs.
    const deps: SnapshotDeps = {
      controller,
      effects: effectsForSave,
      visibility: getAnimationVisibilityManager(),
      settings: {
        leftPropType: leftPropType ?? "staff",
        rightPropType: rightPropType ?? "staff",
        leftBuugengFlipped:
          settingsService.settings.leftBuugengFlipped ?? false,
        rightBuugengFlipped:
          settingsService.settings.rightBuugengFlipped ?? false,
        updateSettings: () => {},
      },
      animationSettings,
      playback: {
        handleBpmChange: () => {},
        handlePlaybackModeChange: () => {},
      },
      animationPanel: { playbackMode },
      getBpm: () => bpm,
    };
    const snapshot = captureTunnelSnapshot(deps);
    // Words are display/provenance text, not sequence identity. Keep the
    // readable stamp canonical while retaining an ID even when its source
    // sequence has no word.
    const sourceWord = simplifyRepeatedWord(seq.word ?? "").trim();
    const sourceSequenceId = primaryTunnelSourceSequenceId(
      tunnelComposition,
      seq.id
    );
    const fingerprint = createTunnelSaveFingerprint(
      seq,
      snapshot,
      tunnelComposition
    );
    const attempt = beginTunnelSaveAttempt(
      tunnelSaveDedupeState,
      fingerprint,
      Date.now()
    );
    tunnelSaveDedupeState = attempt.state;
    if (!attempt.accepted) return;

    onArtAction?.("tunnel_save", { stage: "requested", source });
    // Composite ALL stage layers (props + trails + effect overlays), not just the
    // first canvas, so the saved thumbnail matches the live look.
    const posterContainer = sharedTunnelCanvas
      ? (tunnelStage?.canvas?.closest<HTMLElement>(
          "[data-persistent-animator]"
        ) ?? null)
      : artBodyEl;
    const poster = capturePosterFromContainer(posterContainer);
    // The name describes the TUNNEL — cast, formation, props, effects, rates —
    // not just the sequence under it, so two tunnels built on one word are
    // still telling apart in the collection. An existing save target keeps the
    // name it already has; this only fills a blank. See tunnel-name.ts.
    const derivedName = deriveTunnelName({
      composition: tunnelComposition,
      snapshot,
      baseWord: seq.word || "",
    });
    const name =
      tunnelSaveTarget?.name ||
      derivedName ||
      `Tunnel #${tunnelCollectionState.count + 1}`;
    try {
      const savedComposition = tunnelComposition
        ? {
            ...tunnelComposition,
            formation: controller.config,
            updatedAt: Date.now(),
          }
        : null;
      const tunnelData = {
        name,
        steps: [...seq.steps],
        snapshot,
        poster,
        ...(savedComposition ? { composition: savedComposition } : {}),
        source: "viewer",
        // Lineage stamp: link back to the raw source sequence (spec:
        // 2026-07-12-art-in-library-design.md Unit 3).
        ...(sourceWord ? { sourceWord } : {}),
        ...(sourceSequenceId ? { sourceSequenceId } : {}),
      };
      const savedTunnel = tunnelSaveTarget
        ? await tunnelCollectionState.update(tunnelSaveTarget.id, tunnelData)
        : await tunnelCollectionState.add(tunnelData);
      if (!savedTunnel) {
        throw new Error(`Tunnel ${tunnelSaveTarget?.id ?? ""} was not found.`);
      }
      onTunnelSaved?.({
        target: { id: savedTunnel.id, name: savedTunnel.name },
        composition: savedComposition,
        snapshot,
      });
      tunnelSaveDedupeState = finishTunnelSaveAttempt(
        tunnelSaveDedupeState,
        fingerprint,
        "succeeded",
        Date.now()
      );
      // The frame above is whatever the stage was showing; the canonical poster
      // takes seconds to draw and is not worth making anyone wait for. Correct
      // it in the background now that the record is safely stored.
      void refreshTunnelPoster(savedTunnel);
      if (authState.isFullAccount) {
        try {
          await reportPostHogLifecycleEvent({
            event: "tunnel_save",
            properties: {
              tunnelId: savedTunnel.id,
              source,
              stepCount: seq.steps.length,
              durability: "cloud",
              ...(sourceSequenceId ? { sourceSequenceId } : {}),
            },
          });
        } catch (error) {
          console.warn(
            "[ArtPane] Could not deliver tunnel lifecycle event:",
            error
          );
        }
      }
      toast.success(
        tunnelSaveTarget
          ? "Tunnel choreography updated"
          : "Tunnel saved to your collection"
      );
      onArtAction?.(
        "tunnel_save",
        { stage: "completed", source },
        { count: false }
      );
    } catch (error) {
      tunnelSaveDedupeState = finishTunnelSaveAttempt(
        tunnelSaveDedupeState,
        fingerprint,
        "failed",
        Date.now()
      );
      // A failed account sync rolls the optimistic entry back. Keep this exact
      // content retryable and tell the user it did not reach their collection.
      console.warn("[ArtPane] Tunnel save failed to sync:", error);
      toast.error("Couldn't sync the tunnel to your account");
      onArtAction?.(
        "tunnel_save",
        { stage: "failed", source, reason: "sync_error" },
        { count: false }
      );
    }
  }

  $effect(() => {
    if (
      !sharedTunnelCanvas ||
      artType !== "tunnel" ||
      !presented ||
      !tunnelStage
    ) {
      return;
    }

    return tunnelStage.registerSaveAction({
      label: saveTunnelLabel,
      run: () => void handleSaveTunnel("canvas_context_menu"),
    });
  });
</script>

<div
  class="art-pane"
  class:dock-mode={layout === "bottom"}
  class:external-inspector={externalInspectorTarget !== null}
  class:shared-tunnel-canvas={sharedTunnelCanvas && artType === "tunnel"}
>
  <div class="art-body" bind:this={artBodyEl}>
    {#if artType === "mandala"}
      <!-- controlsPlacement="external": the mandala's controls live in the Art
           sidebar now, so suppress the bottom dock. -->
      <MandalaPane
        ctrl={mandalaController}
        controlsPlacement="external"
        {sequence}
        {leftPropType}
        {rightPropType}
        exportTakeoverSuppressed={artShareActive}
        onExportCancel={cancelMandalaExport}
        onExportRetry={retryMandalaExport}
      />
    {:else if !sharedTunnelCanvas}
      <TunnelArtView
        {sequence}
        {playback}
        {controller}
        {bpm}
        {leftPropType}
        {rightPropType}
        onSaveTunnel={() => void handleSaveTunnel("canvas_context_menu")}
        {saveTunnelLabel}
        playing={tunnelPlaying}
        onPlayingChange={() => handleTunnelPlaybackToggle("canvas")}
        onCanvasReady={(canvas) => onTunnelCanvasReadyChange?.(canvas !== null)}
      />
    {/if}

    {#if artType === "tunnel" && exportState.previewBlobUrl && !exportState.isExporting && !artShareActive}
      <!-- Preview-first: the rendered kaleidoscope plays inline; the user saves
           (download on desktop / share sheet on mobile) or dismisses. Nothing
           hit disk automatically. -->
      <div class="preview-overlay" transition:fade={{ duration: 180 }}>
        <VideoPreviewPanel
          blobUrl={exportState.previewBlobUrl}
          saveLabel="Save"
          onRedownload={() => void saveTunnelVideo()}
          onDismiss={dismissTunnelPreview}
        />
      </div>
    {:else if takeover.phase !== "idle" && !artShareActive}
      <!-- The shared premium ring overlay (same as the mandala export). The live
           kaleidoscope keeps playing, dimmed + blurred, behind the ring. -->
      <ExportTakeover
        phase={takeover.phase}
        progress={exportState.progress?.progress ?? 0}
        phaseLabel={takeover.labelKey ? t(takeover.labelKey) : ""}
        error={exportState.error}
        onCancel={cancelTunnelExport}
        onRetry={retryTunnelExport}
      />
    {/if}
  </div>

  <div
    class="art-settings-host"
    class:external={externalInspectorTarget !== null}
    data-art-settings={artType}
    data-active={presented}
    inert={!presented || undefined}
    aria-hidden={!presented}
    use:reparentToInspector={externalInspectorTarget}
  >
    <ArtSettingsPanel
      {sequence}
      {playback}
      {controller}
      {mandalaController}
      {artType}
      {layout}
      onExport={handleExport}
      onSaveTunnel={() => void handleSaveTunnel("settings_panel")}
      {saveTunnelLabel}
      {bpm}
      {playbackMode}
      {stepSize}
      isPlaying={sharedTunnelCanvas && artType === "tunnel"
        ? playback.isPlaying
        : artType === "tunnel"
          ? tunnelPlaying
          : playback.isPlaying}
      {onBpmChange}
      {onPlaybackModeChange}
      onStepSizeChange={() => {}}
      onPlaybackToggle={sharedTunnelCanvas && artType === "tunnel"
        ? onPlaybackToggle
        : artType === "tunnel"
          ? () => handleTunnelPlaybackToggle("sidebar")
          : onPlaybackToggle}
      leftPropType={leftPropType ?? null}
      rightPropType={rightPropType ?? null}
      {onPropChange}
      {fanAppearance}
      {onFanAppearanceChange}
      {onArtSettingChange}
      exporting={exportAttemptBusy}
    />
  </div>
</div>

<style>
  .art-pane {
    position: absolute;
    inset: 0;
    display: flex;
    gap: clamp(8px, 2cqw, 16px);
    overflow: hidden;
    background: #000;
    padding: clamp(8px, 2cqw, 16px);
    box-sizing: border-box;
    container-type: inline-size;
  }
  .art-pane.external-inspector,
  .art-pane.shared-tunnel-canvas {
    gap: 0;
    padding: 0;
  }
  .art-pane.shared-tunnel-canvas {
    background: transparent;
    pointer-events: none;
  }
  .art-pane.shared-tunnel-canvas .preview-overlay,
  .art-pane.shared-tunnel-canvas :global(.export-takeover) {
    pointer-events: auto;
  }
  .art-settings-host {
    display: flex;
    height: 100%;
    flex: 0 0 auto;
    min-width: 0;
  }
  .art-settings-host.external {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    transition:
      opacity var(--transition-normal),
      visibility 0s linear var(--duration-normal);
  }
  .art-settings-host.external[data-active="true"] {
    opacity: 1;
    visibility: visible;
    pointer-events: auto;
    transition:
      opacity var(--transition-normal),
      visibility 0s linear 0s;
  }
  .art-settings-host.external :global(.art-settings-panel) {
    width: 100%;
    min-width: 0;
    max-width: none;
    border: 0;
    border-radius: 0;
  }
  /* Dock mode (mobile): the settings become a flow ControlDock at the bottom
     (overlay dropped), and the art shrinks above it — the same lift the card
     export uses — instead of the dock floating over and covering the art.
     Full-bleed art, no sidebar gap/padding. */
  .art-pane.dock-mode {
    flex-direction: column;
    gap: 0;
    padding: 0;
  }
  .art-pane.dock-mode .art-settings-host {
    width: 100%;
    height: auto;
  }
  /* The shared Tunnel pane is a transparent companion over AnimatorCanvas. Its
     art body deliberately ignores input so canvas gestures still reach the
     persistent animator, but the mobile settings dock is a real control surface
     and must opt back in. Keep it one compact transport row above the animator's
     playback bar so the two interactive rows never paint on top of each other. */
  .art-pane.shared-tunnel-canvas.dock-mode .art-settings-host {
    --settings-viewer-transport-offset: calc(
      var(--min-touch-target, 44px) + 17px
    );

    margin-block-end: var(--settings-viewer-transport-offset);
    pointer-events: auto;
  }
  .art-body {
    position: relative;
    flex: 1 1 auto;
    min-width: 0;
    height: 100%;
    overflow: hidden;
  }
  /* In the column, flex drives the height; the fixed 100% would ignore the dock
     below and let the canvas cover it. */
  .art-pane.dock-mode .art-body {
    height: auto;
    min-height: 0;
  }
  .art-pane.shared-tunnel-canvas .art-body {
    pointer-events: none;
  }

  :global(:root[data-motion-preference="reduce"]) .art-settings-host.external {
    transition-duration: 0ms, 0s;
  }

  /* Inline export preview floated over the canvas. Dim + blur the kaleidoscope
     behind it so the result reads as the focus. */
  .preview-overlay {
    position: absolute;
    inset: 0;
    z-index: 11;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: clamp(8px, 3cqw, 20px);
    background: rgba(0, 0, 0, 0.72);
    backdrop-filter: blur(4px);
    border-radius: inherit;
    overflow: auto;
  }

  /* Adapt the shared VideoPreviewPanel (authored as a sidebar-bottom panel) into
     a floating card here — round all corners, drop the top-divider seam, cap the
     width, and lift it off the dimmed backdrop. */
  .preview-overlay :global(.preview-panel) {
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: 16px;
    max-width: min(440px, 100%);
    width: 100%;
    box-shadow: 0 18px 50px rgba(0, 0, 0, 0.5);
  }

  /* On narrow viewports the rail stacks under the canvas so the art still has
     room to breathe rather than being crushed beside a 240px sidebar. */
  /* Legacy narrow-sidebar stack — only when NOT in dock mode. In dock mode the
     controls become a ControlDock floating over a full-bleed art body, so the
     art keeps the whole pane. */
  @container (max-width: 620px) {
    .art-pane:not(.dock-mode) {
      flex-direction: column;
    }
    .art-pane:not(.dock-mode) .art-body {
      flex: 1 1 55%;
      min-height: 0;
    }
    /* Claim a real share of the column. With height:auto the panel collapsed to
       ~3px: its inner `.sidebar-main` is flex:1 and needs a DEFINED parent height
       to fill, so an auto-height panel + a flex-fill child resolves to zero and
       the canvas ate the whole pane. A flex-basis gives sidebar-main height to
       fill; the sections scroll internally past it. */
    .art-pane :global(.art-settings-panel) {
      width: 100%;
      min-width: 0;
      flex: 0 0 45%;
      min-height: 0;
    }
  }
</style>
