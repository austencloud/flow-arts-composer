<script lang="ts">
  import { browser } from "$app/environment";
  import { onMount, tick } from "svelte";
  import { loopDetector } from "$lib/features/create/generate/circular/services/loop-detector";
  import { resolveLoopDisplay } from "$lib/features/loop-labeler/services/loop-display-resolver";
  import { initializeAppServices } from "$lib/shared/application/state/services.svelte";
  import { registerLibraryRepository } from "$lib/shared/composition-root/register-library-repository";
  import { configureShortCodeManager } from "$lib/shared/qr/get-short-code-manager";
  import { getBrowseLoader } from "$lib/shared/browse/get-browse-loader";
  import { registerLoopDetector } from "$lib/shared/create/get-loop-detector";
  import { registerLoopDisplayResolver } from "$lib/shared/loop-labeler/get-loop-display-resolver";
  import { createCollaborativeVideo } from "$lib/shared/video-collaboration/domain/collaborative-video";
  import { getSequenceVideosStore } from "$lib/shared/video-collaboration/state/sequence-videos-store.svelte";
  import SequenceViewerOrchestrator from "$lib/shared/sequence-viewer/components/SequenceViewerOrchestrator.svelte";
  import SequenceViewerShell from "$lib/shared/sequence-viewer/components/SequenceViewerShell.svelte";
  import {
    motionDuration,
    reducedMotion,
  } from "$lib/shared/transitions/motion";
  import { DURATION } from "$lib/shared/transitions/transitions";
  import {
    VIEWER_MODE_DISSOLVE_CLASS,
    VIEWER_MODE_DISSOLVE_DURATION,
  } from "$lib/shared/transitions/viewer-mode-dissolve";
  import { TRANSITION_REVIEW_SEQUENCE } from "../transition-review-fixture";
  import {
    isWorkspaceReplayCommand,
    orderedModePairs,
    type WorkspaceReplayCommand,
  } from "../workspace-review-replays";
  import type {
    InspectorLayerId,
    InspectorRevealSample,
    TunnelPaintSample,
    TransitionGeometrySample,
    TransitionGeometryTrace,
    TransitionTraceCommand,
    TransitionTracePhase,
  } from "../transition-geometry-trace";

  type ReplayCommand = TransitionTraceCommand;

  /**
   * How long the trace keeps sampling after the last mode step returns.
   *
   * `chooseMode` returns one emphasis after a commit, but the Card's contained
   * size stays pinned past the workspace allocation and is released on its own
   * clock. A trace that stopped when the last step returned ended before that
   * release, so an untransitioned size change landing after it was never
   * recorded.
   */
  const SETTLE_TAIL_MS = DURATION.emphasis * 2 + DURATION.normal + 200;
  type ReviewModeLabel =
    | "Side by Side"
    | "2D Animation"
    | "3D Animation"
    | "Card"
    | "Tunnel"
    | "Post Studio"
    | "Performances";
  type ReviewMode =
    | "split"
    | "animation"
    | "animation-3d"
    | "card"
    | "tunnel"
    | "post-studio"
    | "videos";

  interface ReplayMessage {
    source: "sequence-viewer-transition-review";
    action: "replay";
    command: ReplayCommand;
  }

  interface MotionMessage {
    source: "sequence-viewer-transition-review";
    action: "motion";
    preference: "full" | "reduce";
  }

  type ReviewMessage =
    | ReplayMessage
    | MotionMessage
    | {
        source: "sequence-viewer-transition-review";
        action: "status";
      };

  if (browser) {
    // This standalone frame can render before the root layout's deferred
    // composition import. Register the same QR dependency before Card mounts.
    configureShortCodeManager(getBrowseLoader());
    registerLibraryRepository();
    registerLoopDetector(loopDetector);
    registerLoopDisplayResolver(resolveLoopDisplay);
    getSequenceVideosStore(TRANSITION_REVIEW_SEQUENCE.id).add(
      createCollaborativeVideo(
        {
          id: "transition-review-performance",
          videoUrl: "/transition-review-performance.mp4",
          storagePath: "transition-review/performance.mp4",
          duration: 48,
          fileSize: 7_800_000,
          mimeType: "video/mp4",
          thumbnailUrl: "/images/austen-fire.webp",
          sequenceId: TRANSITION_REVIEW_SEQUENCE.id,
          sequenceName: TRANSITION_REVIEW_SEQUENCE.word,
          creatorId: "transition-review-performer",
          visibility: "public",
          description:
            "Fire performance footage staged for the workspace handoff review.",
        },
        "Austen"
      )
    );
  }

  let isMobile = $state(browser && window.innerWidth < 768);
  let replayVersion = 0;
  let metricsFrame = 0;
  let traceFrame = 0;
  let activeTrace: TransitionGeometryTrace | null = null;
  let traceStartedAt = 0;
  let tracePhase: TransitionTracePhase = "focus-2d";
  let nextElementIdentity = 1;
  const elementIdentities = new WeakMap<Element, number>();

  function report(
    status: "ready" | "running" | "complete" | "error",
    command?: ReplayCommand,
    detail?: string
  ): void {
    if (window.parent === window) return;
    window.parent.postMessage(
      {
        source: "sequence-viewer-transition-frame",
        status,
        command,
        detail,
      },
      window.location.origin
    );
  }

  function wait(milliseconds: number): Promise<void> {
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
  }

  function reportMetrics(): void {
    if (window.parent === window) return;
    const scrollingElement =
      document.scrollingElement ?? document.documentElement;
    const splitView = document.querySelector<HTMLElement>(".split-view");

    window.parent.postMessage(
      {
        source: "sequence-viewer-transition-frame",
        status: "metrics",
        metrics: {
          viewportWidth: document.documentElement.clientWidth,
          viewportHeight: document.documentElement.clientHeight,
          overflowX:
            scrollingElement.scrollWidth >
            document.documentElement.clientWidth + 1,
          overflowY:
            scrollingElement.scrollHeight >
            document.documentElement.clientHeight + 1,
          panelDirection: splitView?.dataset.panelDirection ?? null,
          outerPanelCount: document.querySelectorAll(
            ".viewer-and-export > .panel-group > .panel-wrapper"
          ).length,
          reducedMotion: reducedMotion(),
        },
      },
      window.location.origin
    );
  }

  function scheduleMetrics(): void {
    cancelAnimationFrame(metricsFrame);
    metricsFrame = requestAnimationFrame(() => {
      metricsFrame = requestAnimationFrame(reportMetrics);
    });
  }

  function elementSize(
    selector: string,
    direction: "horizontal" | "vertical"
  ): number {
    const element = document.querySelector<HTMLElement>(selector);
    if (!element) return 0;
    const bounds = element.getBoundingClientRect();
    return direction === "horizontal" ? bounds.width : bounds.height;
  }

  function elementOpacity(selector: string): number {
    let element = document.querySelector<HTMLElement>(selector);
    if (!element) return 0;
    let opacity = 1;
    while (element) {
      const style = getComputedStyle(element);
      if (style.visibility === "hidden" || style.display === "none") return 0;
      opacity *= Number.parseFloat(style.opacity) || 0;
      element = element.parentElement;
    }
    return opacity;
  }

  function elementBounds(selector: string): {
    width: number;
    height: number;
    left: number;
    top: number;
  } {
    const element = document.querySelector<HTMLElement>(selector);
    if (!element) return { width: 0, height: 0, left: 0, top: 0 };
    const bounds = element.getBoundingClientRect();
    return {
      width: bounds.width,
      height: bounds.height,
      left: bounds.left,
      top: bounds.top,
    };
  }

  /**
   * Sample one inspector layer's clip box against the panel composed inside it.
   * The layer is the animating track; the panel is the surface pinned at its
   * own destination width. Comparing the two is what reveals a cut-off label
   * column or an undrawn band, neither of which shows up in a width or drift
   * measurement taken on the panel alone.
   */
  /**
   * Alpha of an element's own painted fill, 0 when it paints none.
   *
   * The inspector surface can live on the layer or on the panel inside it, and
   * which one holds it decides whether a band the panel does not reach looks
   * the same as the rest of the track. Reading it rather than assuming it keeps
   * the trace honest if the surface moves again.
   */
  function elementSurfaceAlpha(selector: string): number {
    const element = document.querySelector<HTMLElement>(selector);
    if (!element) return 0;
    const fill = getComputedStyle(element).backgroundColor;
    if (!fill || fill === "transparent") return 0;
    const channels = fill.match(/[\d.]+/g);
    if (!channels) return 0;
    return channels.length > 3 ? Number.parseFloat(channels[3]) || 0 : 1;
  }

  function revealBounds(
    layerSelector: string,
    panelSelector: string
  ): InspectorRevealSample {
    const layer = elementBounds(layerSelector);
    const panel = elementBounds(panelSelector);
    return {
      layerLeft: layer.left,
      layerWidth: layer.width,
      panelLeft: panel.left,
      panelWidth: panel.width,
      opacity: layer.width > 0 ? elementOpacity(layerSelector) : 0,
      layerSurfaceAlpha: elementSurfaceAlpha(layerSelector),
      panelSurfaceAlpha: elementSurfaceAlpha(panelSelector),
    };
  }

  function elementFlexGrow(selector: string): number {
    const element = document.querySelector<HTMLElement>(selector);
    if (!element) return 0;
    return Number.parseFloat(getComputedStyle(element).flexGrow) || 0;
  }

  function transformedElementCount(selector: string): number {
    let count = 0;
    for (const element of document.querySelectorAll<HTMLElement>(selector)) {
      const transform = getComputedStyle(element).transform;
      if (transform === "none") continue;
      try {
        const matrix = new DOMMatrixReadOnly(transform);
        const visuallyMoved =
          Math.abs(matrix.m41) > 0.5 ||
          Math.abs(matrix.m42) > 0.5 ||
          Math.abs(matrix.m11 - 1) > 0.005 ||
          Math.abs(matrix.m12) > 0.005 ||
          Math.abs(matrix.m21) > 0.005 ||
          Math.abs(matrix.m22 - 1) > 0.005;
        if (visuallyMoved) count += 1;
      } catch {
        count += 1;
      }
    }
    return count;
  }

  function elementDataFlag(selector: string, name: string): boolean {
    const element = document.querySelector<HTMLElement>(selector);
    return element?.dataset[name] === "true";
  }

  function elementDataValue(selector: string, name: string): string | null {
    const element = document.querySelector<HTMLElement>(selector);
    return element?.dataset[name] ?? null;
  }

  function elementDataNumber(selector: string, name: string): number {
    const element = document.querySelector<HTMLElement>(selector);
    const value = Number(element?.dataset[name]);
    return Number.isFinite(value) ? value : 0;
  }

  function elementIdentity(selector: string): number {
    const element = document.querySelector(selector);
    if (!element) return 0;
    const existing = elementIdentities.get(element);
    if (existing) return existing;
    const identity = nextElementIdentity++;
    elementIdentities.set(element, identity);
    return identity;
  }

  function selectedViewerMode(): ReviewMode | null {
    const labels = {
      "Side by Side": "split",
      "2D Animation": "animation",
      "3D Animation": "animation-3d",
      Card: "card",
      Tunnel: "tunnel",
      Performances: "videos",
      "Post Studio": "post-studio",
    } as const;
    for (const button of document.querySelectorAll<HTMLButtonElement>(
      "button[aria-label]"
    )) {
      const label = button.getAttribute("aria-label");
      const selected =
        button.getAttribute("aria-pressed") === "true" ||
        button.getAttribute("aria-current") === "page" ||
        button.classList.contains("active");
      if (selected && label && label in labels) {
        return labels[label as keyof typeof labels];
      }
    }
    return null;
  }

  function expectedViewerMode(label: ReviewModeLabel): ReviewMode {
    if (label === "Side by Side") return "split";
    if (label === "2D Animation") return "animation";
    if (label === "3D Animation") return "animation-3d";
    if (label === "Tunnel") return "tunnel";
    if (label === "Performances") return "videos";
    if (label === "Post Studio") return "post-studio";
    return "card";
  }

  async function waitForModeCommit(
    label: ReviewModeLabel,
    version: number
  ): Promise<number> {
    const expected = expectedViewerMode(label);
    const startedAt = performance.now();
    while (version === replayVersion && selectedViewerMode() !== expected) {
      if (performance.now() - startedAt > DURATION.dramatic * 3) {
        throw new Error(`${label} did not commit within the motion gate.`);
      }
      await wait(16);
    }
    return Math.round((performance.now() - startedAt) * 10) / 10;
  }

  async function waitForMotionPresentation(
    surface: "2d" | "3d",
    version: number
  ): Promise<boolean> {
    const startedAt = performance.now();
    const selector = `[data-motion-surface="${surface}"][data-presented="true"]`;
    while (
      version === replayVersion &&
      !document.querySelector<HTMLElement>(selector)
    ) {
      if (performance.now() - startedAt > 20_000) {
        throw new Error(
          `${surface.toUpperCase()} did not present within the motion gate.`
        );
      }
      await wait(16);
    }
    return version === replayVersion;
  }

  async function waitFor3DReady(version: number): Promise<boolean> {
    const startedAt = performance.now();
    while (
      version === replayVersion &&
      !document.querySelector<HTMLElement>(
        '[data-motion-surface="3d"][data-scene-ready="true"]'
      )
    ) {
      if (performance.now() - startedAt > 20_000) {
        throw new Error(
          "3D did not produce a ready frame within the motion gate."
        );
      }
      await wait(16);
    }
    return version === replayVersion;
  }

  async function waitForPerformanceGallery(version: number): Promise<boolean> {
    const startedAt = performance.now();
    while (
      version === replayVersion &&
      !document.querySelector<HTMLElement>(
        '[data-performance-stage][data-performance-ready="true"]'
      )
    ) {
      if (performance.now() - startedAt > DURATION.dramatic * 3) {
        throw new Error("Performances did not present a ready stage.");
      }
      await wait(16);
    }
    return version === replayVersion;
  }

  function tunnelSurface(): HTMLElement | null {
    return document.querySelector<HTMLElement>(
      '[data-persistent-animator][data-presented="true"]:not([aria-hidden="true"])[data-renderer-mode="tunnel"]'
    );
  }

  function tunnelCanvas(): HTMLCanvasElement | null {
    return document.querySelector<HTMLCanvasElement>(
      '[data-persistent-animator][data-presented="true"]:not([aria-hidden="true"]) canvas[data-animation-layer="props"]'
    );
  }

  function setTunnelPaintCapture(active: boolean): void {
    const capture = document.documentElement;
    if (!active) {
      delete capture.dataset.captureTunnelPaint;
      return;
    }
    if (capture.dataset.captureTunnelPaint === "true") return;
    capture.dataset.captureTunnelPaint = "true";
    capture.dataset.tunnelPaintFrame = "0";
    capture.dataset.tunnelPaintedPropCount = "0";
    capture.dataset.tunnelPaintedPerceptiblePropCount = "0";
    capture.dataset.tunnelPaintedOpacityMean = "0.000";
    capture.dataset.tunnelFormationTrailCaptures = "0";
    capture.dataset.tunnelPaintHistory = "";
  }

  function readTunnelPaintHistory(): TunnelPaintSample[] {
    return (document.documentElement.dataset.tunnelPaintHistory ?? "")
      .split(";")
      .filter(Boolean)
      .map((entry) => {
        const [time, progress, painted, perceptible, mean] = entry
          .split(",")
          .map(Number);
        return {
          time: time ?? 0,
          progress: progress ?? 0,
          paintedPropCount: painted ?? 0,
          perceptiblePropCount: perceptible ?? 0,
          meanAlpha: mean ?? 0,
        };
      });
  }

  async function waitForTunnelPresentation(version: number): Promise<boolean> {
    const startedAt = performance.now();
    while (version === replayVersion) {
      const surface = tunnelSurface();
      const canvas = tunnelCanvas();
      const ready = canvas !== null && canvas.width > 0 && canvas.height > 0;
      if (surface && ready && Number(surface.dataset.tunnelBlend) >= 0.95) {
        return true;
      }
      if (performance.now() - startedAt > 20_000) {
        throw new Error("Tunnel did not present a ready canvas.");
      }
      await wait(16);
    }
    return false;
  }

  function sharedCanvasQuality() {
    const surface = document.querySelector<HTMLElement>(
      "[data-shared-animation-surface]"
    );
    const canvas = surface?.querySelector<HTMLCanvasElement>(
      'canvas[data-animation-layer="props"]'
    );
    const bar = document.querySelector<HTMLElement>(
      "[data-shared-studio-transport]"
    );
    let covered = false;
    if (surface && bar && !surface.closest("[inert]")) {
      const rect = bar.getBoundingClientRect();
      // Flying surfaces ignore pointer input. Temporarily include them in the
      // paint-order hit test, restoring before the browser paints or handles input.
      const targets = [surface, bar];
      const pointers = targets.map((node) => node.style.pointerEvents);
      try {
        targets.forEach((node) => (node.style.pointerEvents = "auto"));
        const top = document.elementFromPoint(
          rect.left + rect.width / 2,
          rect.top + rect.height / 2
        );
        covered = !!top && surface.contains(top) && !bar.contains(top);
      } finally {
        targets.forEach(
          (node, index) => (node.style.pointerEvents = pointers[index])
        );
      }
    }
    const size = canvas ? Math.min(canvas.clientWidth, canvas.clientHeight) : 0;
    const density =
      canvas && size > 0 && !surface?.closest("[inert]")
        ? canvas.width / (size * window.devicePixelRatio)
        : null;
    return { sharedTransportCovered: covered, sharedRasterDensity: density };
  }

  function captureGeometrySample(): void {
    if (!activeTrace) return;
    if (
      activeTrace.command === "tunnel-first" ||
      activeTrace.command === "tunnel-3d" ||
      activeTrace.command === "tunnel-interrupt"
    ) {
      // DualSourceCrossfade may replace the presented animator after the trace
      // begins. Arm whichever canvas owns this paint before reading it; the
      // renderer will publish on its next completed frame.
      setTunnelPaintCapture(true);
    }
    const splitView = document.querySelector<HTMLElement>(".split-view");
    const direction =
      splitView?.dataset.panelDirection === "vertical"
        ? "vertical"
        : "horizontal";
    const outerPanelGroup = document.querySelector<HTMLElement>(
      ".viewer-motion-stage-layer .panel-group"
    );
    const inspectorPanelSelector =
      '[data-panel-id="export-inspector"], [data-panel-id="export-inspector-stacked"]';

    const cardPanel = elementBounds(".preview-column");
    const inspectorPanel = elementBounds(inspectorPanelSelector);
    const cardRoot = elementBounds(".preview-column .choreo-card-root");
    const cardContent = elementBounds(".preview-column .preview-stack");
    const cardSettings = elementBounds(
      '[aria-label="Card settings"] .panel-center-inner'
    );
    // Content drift: the settings panels are persistent layers inside the
    // animating inspector track. Measuring the panel root (width/left) and its
    // first content block (top) proves whether a panel is composed at its own
    // destination width and revealed through PanelGroup's moving clip, or is
    // re-laying itself out on every frame while the seam travels.
    const cardSettingsPanel = elementBounds(
      ".card-settings-layer .export-panel"
    );
    const inspectorReveal: Record<InspectorLayerId, InspectorRevealSample> = {
      motion: revealBounds(".motion-settings-layer", ".export-panel.sidebar"),
      art: revealBounds(
        ".art-settings-layer",
        "[data-viewer-art-inspector-target] .art-settings-panel"
      ),
      card: revealBounds(
        ".card-settings-layer",
        ".card-settings-layer .export-panel"
      ),
      performance: revealBounds(
        ".performance-inspector-layer",
        ".performance-inspector-layer .performance-inspector"
      ),
    };
    const artSettingsPanel = elementBounds(
      "[data-viewer-art-inspector-target] .art-settings-panel"
    );
    const artSettingsContent = elementBounds(
      "[data-viewer-art-inspector-target] .sidebar-rail-layout"
    );
    const mandalaCanvas = document.querySelector<HTMLCanvasElement>(
      '.animation-column canvas[data-animation-layer="mandala"]'
    );
    const mandalaBounds = mandalaCanvas?.getBoundingClientRect();
    const mandalaBackingSize = mandalaCanvas
      ? Math.min(mandalaCanvas.width, mandalaCanvas.height) /
        Math.max(1, window.devicePixelRatio || 1)
      : 0;
    const mandalaDisplaySize = mandalaBounds
      ? Math.min(mandalaBounds.width, mandalaBounds.height)
      : 0;
    const activeTunnelSurface = tunnelSurface();
    const activeTunnelCanvas = tunnelCanvas();
    const stageLayer = elementBounds(".viewer-motion-content-layer");
    const performanceLayer = elementBounds(".performance-stage-layer");
    const performanceWorkspace = document.querySelector<HTMLElement>(
      ".performance-inspector-layer .performance-list-items"
    );
    const performanceLayoutColumns = performanceWorkspace
      ? getComputedStyle(performanceWorkspace)
          .gridTemplateColumns.trim()
          .split(/\s+/)
          .filter(Boolean).length
      : 0;
    const persistentAnimator =
      activeTunnelSurface ??
      document.querySelector<HTMLElement>(
        '[data-persistent-animator][data-presented="true"]:not([aria-hidden="true"])'
      );
    const tunnelBlend = Number(persistentAnimator?.dataset.tunnelBlend) || 0;
    const tunnelBounds = activeTunnelCanvas?.getBoundingClientRect();
    const tunnelCanvasReady = Boolean(
      activeTunnelCanvas &&
      activeTunnelCanvas.width > 0 &&
      activeTunnelCanvas.height > 0
    );
    const selectedMode = selectedViewerMode();
    const motion3DSurface = document.querySelector<HTMLElement>(
      '[data-motion-surface="3d"]'
    );
    const scenePreparation = document.querySelector<HTMLElement>(
      '[data-motion-surface="3d"][data-presented="true"] [data-scene-preparation]'
    );
    const scenePreparationProgress =
      scenePreparation?.dataset.scenePreparationProgress;
    const motion3DReady = motion3DSurface?.dataset.sceneReady === "true";
    const sample: TransitionGeometrySample = {
      time: Math.round((performance.now() - traceStartedAt) * 10) / 10,
      workspace: {
        studioOpacity: elementOpacity(".post-studio-pane"),
        practiceHeight: elementBounds(".practice-bar-rise").height,
        selectedButtons: Array.from(
          document.querySelectorAll<HTMLButtonElement>(
            '[aria-label="Sequence views"] button[aria-pressed="true"], [aria-label="Sequence views"] button[aria-current="page"]'
          )
        ).filter(
          (button) =>
            !button.closest('[inert], [aria-hidden="true"]') &&
            button.getClientRects().length > 0
        ).length,
        stageIdentity: elementIdentity(".viewer-stage-container"),
        sharedCanvasIdentity: elementIdentity(
          "[data-shared-animation-surface][data-surface-handoff] canvas"
        ),
        ...sharedCanvasQuality(),
        sharedInspectorIdentity: elementIdentity(
          "[data-shared-studio-inspector]"
        ),
        motionInspectorOpacity: elementOpacity(
          "[data-shared-studio-inspector]"
        ),
        cardInspectorOpacity: elementOpacity("[data-shared-card-inspector]"),
        sharedCardInspectorIdentity: elementIdentity(
          "[data-shared-card-inspector] .export-panel"
        ),
        selectedStudioHalf:
          document
            .querySelector(".region-surface[aria-pressed='true']")
            ?.getAttribute("aria-label") ?? null,
        sharedCardIdentity: elementIdentity(
          "[data-shared-studio-card] .choreo-card-root"
        ),
        sharedTransportIdentity: elementIdentity(
          "[data-shared-studio-transport] [aria-label='Playback transport']"
        ),
        sharedScrubberIdentity: elementIdentity(
          "[data-shared-studio-transport] [aria-label='Playback progress']"
        ),
        sharedPlayButtonIdentity: elementIdentity(
          "[data-shared-studio-transport] .pill-play"
        ),
        sharedSurfaces: Object.fromEntries(
          Object.entries({
            canvas:
              "[data-shared-animation-surface] .content-wrapper > .canvas-wrapper",
            inspector: "[data-shared-studio-inspector]",
            rail: "[data-shared-studio-inspector] [role='tablist']",
            editor: "[data-shared-studio-inspector] .panel-scroll",
            card: "[data-shared-studio-card]",
            transport: "[data-shared-studio-transport]",
            scrubber: "[data-shared-studio-transport] .pill-track",
            playButton: "[data-shared-studio-transport] .pill-play",
            phone: ".output-frame",
          }).map(([key, selector]) => [key, elementBounds(selector)])
        ),
        sharedCanvasInStudio: Boolean(
          document.querySelector(
            "[data-studio-animation-destination] [data-shared-animation-surface] canvas"
          )
        ),
        sharedInspectorInStudio: Boolean(
          document.querySelector(
            "[data-studio-inspector-destination] [data-shared-studio-inspector]"
          )
        ),
      },
      phase: tracePhase,
      direction,
      focusedPane: splitView?.dataset.focused || null,
      selectedMode,
      outerDirection: outerPanelGroup?.classList.contains("vertical")
        ? "vertical"
        : "horizontal",
      stageSize: elementSize('[data-panel-id="viewer-stage"]', direction),
      stageFlexGrow: elementFlexGrow('[data-panel-id="viewer-stage"]'),
      animationSize: elementSize('[data-panel-id="animation"]', direction),
      animationFlexGrow: elementFlexGrow('[data-panel-id="animation"]'),
      animationHidden: elementDataFlag(
        ".split-column.animation-column",
        "hidden"
      ),
      animationReadable: elementDataFlag(
        ".split-column.animation-column",
        "readable"
      ),
      mandalaBackingSize,
      mandalaDisplaySize,
      mandalaRasterScale:
        mandalaBackingSize > 0 ? mandalaDisplaySize / mandalaBackingSize : 0,
      mandalaDisplayWidth: mandalaBounds?.width ?? 0,
      mandalaDisplayHeight: mandalaBounds?.height ?? 0,
      mandalaMaximumRasterScale:
        mandalaBackingSize > 0 && mandalaBounds
          ? Math.max(mandalaBounds.width, mandalaBounds.height) /
            mandalaBackingSize
          : 0,
      cardSize: elementSize('[data-panel-id="preview"]', direction),
      cardFlexGrow: elementFlexGrow('[data-panel-id="preview"]'),
      cardHidden: elementDataFlag(".split-column.preview-column", "hidden"),
      cardReadable: elementDataFlag(".split-column.preview-column", "readable"),
      cardPanelWidth: cardPanel.width,
      cardPanelHeight: cardPanel.height,
      cardPanelCenterX: cardPanel.left + cardPanel.width / 2,
      cardPanelCenterY: cardPanel.top + cardPanel.height / 2,
      cardRootWidth: cardRoot.width,
      cardRootHeight: cardRoot.height,
      cardRootCenterY: cardRoot.top + cardRoot.height / 2,
      cardContentWidth: cardContent.width,
      cardContentHeight: cardContent.height,
      cardContentCenterX: cardContent.left + cardContent.width / 2,
      cardContentCenterY: cardContent.top + cardContent.height / 2,
      cardTransformedCellCount: transformedElementCount(
        ".preview-column .cell-flip-wrapper"
      ),
      cardColumns: elementDataNumber(
        ".preview-column .choreo-card-root",
        "layoutColumns"
      ),
      cardRows: elementDataNumber(
        ".preview-column .choreo-card-root",
        "layoutRows"
      ),
      cardContainSizeMotion: elementDataValue(
        ".preview-column .choreo-card-root",
        "containSizeMotion"
      ),
      cardAutoLayoutLocked: elementDataFlag(
        ".preview-column .choreo-card-root",
        "autoLayoutLocked"
      ),
      cardAutoLayoutLockColumns: elementDataNumber(
        ".preview-column .choreo-card-root",
        "autoLayoutLockColumns"
      ),
      cardAutoLayoutLockRows: elementDataNumber(
        ".preview-column .choreo-card-root",
        "autoLayoutLockRows"
      ),
      inspectorSize: elementSize(inspectorPanelSelector, direction),
      inspectorFlexGrow: elementFlexGrow(inspectorPanelSelector),
      inspectorIdentity: elementIdentity(inspectorPanelSelector),
      effectsInspectorOpacity: elementOpacity("[data-effects-inspector]"),
      cardEffectsSeamGap:
        cardPanel.width > 0 && inspectorPanel.width > 0
          ? direction === "horizontal"
            ? Math.abs(cardPanel.left + cardPanel.width - inspectorPanel.left)
            : Math.abs(cardPanel.top + cardPanel.height - inspectorPanel.top)
          : 0,
      desktopInspectorExpected: Boolean(
        document.querySelector(".viewer-and-export.desktop")
      ),
      cardSettingsWidth: cardSettings.width,
      cardSettingsHeight: cardSettings.height,
      cardSettingsCenterY: cardSettings.top + cardSettings.height / 2,
      cardSettingsOpacity: elementOpacity(".card-settings-layer"),
      cardIdentity: elementIdentity(".preview-column .choreo-card-root"),
      dissolveActive: document.documentElement.classList.contains(
        VIEWER_MODE_DISSOLVE_CLASS
      ),
      animationOpacity: elementOpacity(".split-column.animation-column"),
      cardOpacity: elementOpacity(".split-column.preview-column"),
      motion2DOpacity: elementOpacity('[data-motion-surface="2d"]'),
      motion3DOpacity: elementOpacity('[data-motion-surface="3d"]'),
      motion2DPresented: elementDataFlag(
        '[data-motion-surface="2d"]',
        "presented"
      ),
      motion3DPresented: elementDataFlag(
        '[data-motion-surface="3d"]',
        "presented"
      ),
      motion3DReady,
      motion3DPreparing: selectedMode === "animation-3d" && !motion3DReady,
      motion2DPreparationHeld: Boolean(
        document.querySelector('[data-3d-preparation-held="true"]')
      ),
      sceneCurtainVisible: Boolean(scenePreparation),
      scenePreparationProgress:
        scenePreparationProgress && scenePreparationProgress !== "indeterminate"
          ? Number(scenePreparationProgress)
          : null,
      scenePreparationLabel:
        scenePreparation?.dataset.scenePreparationLabel ?? null,
      tunnelOpacity: tunnelBlend,
      tunnelLayersReady:
        persistentAnimator?.dataset.tunnelLayersReady === "true",
      tunnelLayerCount:
        Number(persistentAnimator?.dataset.tunnelLayerCount) || 0,
      tunnelPreparedLayerCount:
        Number(persistentAnimator?.dataset.tunnelPreparedLayerCount) || 0,
      tunnelTextureRequested:
        Number(persistentAnimator?.dataset.tunnelTextureRequested) || 0,
      tunnelTextureLoaded:
        Number(persistentAnimator?.dataset.tunnelTextureLoaded) || 0,
      tunnelTexturesReady:
        persistentAnimator?.dataset.tunnelTexturesReady === "true",
      tunnelLayerOpacityMinimum:
        Number(persistentAnimator?.dataset.tunnelLayerOpacityMin) || 0,
      tunnelLayerOpacityMaximum:
        Number(persistentAnimator?.dataset.tunnelLayerOpacityMax) || 0,
      tunnelLayerOpacityMean:
        Number(persistentAnimator?.dataset.tunnelLayerOpacityMean) || 0,
      tunnelPerceptibleLayerCount:
        Number(persistentAnimator?.dataset.tunnelPerceptibleLayerCount) || 0,
      tunnelMovingLayerCount:
        Number(persistentAnimator?.dataset.tunnelMovingLayerCount) || 0,
      tunnelTrailSuppressedLayerCount:
        Number(persistentAnimator?.dataset.tunnelTrailSuppressedLayerCount) ||
        0,
      tunnelFormationPoseDrift:
        Number(persistentAnimator?.dataset.tunnelFormationPoseDrift) || 0,
      tunnelGridOpacity:
        Number(persistentAnimator?.dataset.tunnelGridOpacity) || 0,
      tunnelPaintFrame:
        Number(document.documentElement.dataset.tunnelPaintFrame) || 0,
      tunnelPaintedPropCount:
        Number(document.documentElement.dataset.tunnelPaintedPropCount) || 0,
      tunnelPaintedPerceptiblePropCount:
        Number(
          document.documentElement.dataset.tunnelPaintedPerceptiblePropCount
        ) || 0,
      tunnelPaintedOpacityMean:
        Number(document.documentElement.dataset.tunnelPaintedOpacityMean) || 0,
      tunnelFormationTrailCaptures:
        Number(document.documentElement.dataset.tunnelFormationTrailCaptures) ||
        0,
      tunnelPresented: Boolean(activeTunnelSurface) || tunnelBlend > 0,
      tunnelCanvasReady,
      animatorIdentity: elementIdentity("[data-persistent-animator]"),
      animatorCanvasCount: document.querySelectorAll(
        '[data-persistent-animator][data-presented="true"]:not([aria-hidden="true"]) canvas[data-animation-layer="props"]'
      ).length,
      activeArtSettingsCount: document.querySelectorAll(
        '[data-viewer-art-inspector-target] [data-active="true"][data-art-settings]'
      ).length,
      artSettingsOpacity: elementOpacity(".art-settings-layer"),
      artSettingsWidth: artSettingsPanel.width,
      artSettingsLeft: artSettingsPanel.left,
      inspectorReveal,
      artSettingsContentTop: artSettingsContent.top,
      cardSettingsLeft: cardSettingsPanel.left,
      cardSettingsContentTop: cardSettings.top,
      tunnelBackingWidth: activeTunnelCanvas
        ? activeTunnelCanvas.width / Math.max(1, window.devicePixelRatio || 1)
        : 0,
      tunnelBackingHeight: activeTunnelCanvas
        ? activeTunnelCanvas.height / Math.max(1, window.devicePixelRatio || 1)
        : 0,
      tunnelDisplayWidth: tunnelBounds?.width ?? 0,
      tunnelDisplayHeight: tunnelBounds?.height ?? 0,
      stageLayerOpacity: elementOpacity(".viewer-motion-content-layer"),
      performanceLayerOpacity: elementOpacity(".performance-stage-layer"),
      stageLayerIdentity: elementIdentity("[data-persistent-viewer-stage]"),
      performanceLayerIdentity: elementIdentity(".performance-stage-layer"),
      stageLayerActive: elementDataFlag(
        ".viewer-motion-content-layer",
        "active"
      ),
      performanceLayerActive: elementDataFlag(
        ".performance-stage-layer",
        "active"
      ),
      performanceGalleryReady:
        document
          .querySelector("[data-performance-stage]")
          ?.getAttribute("data-performance-ready") === "true",
      performanceLayoutColumns,
      performancePlayerCount: document.querySelectorAll(
        ".performance-stage-layer video.performance-player"
      ).length,
      stageLayerWidth: stageLayer.width,
      performanceLayerWidth: performanceLayer.width,
    };
    activeTrace.samples.push(sample);
    traceFrame = requestAnimationFrame(captureGeometrySample);
  }

  function beginGeometryTrace(
    command: ReplayCommand,
    phase: TransitionTracePhase
  ): void {
    cancelAnimationFrame(traceFrame);
    tracePhase = phase;
    traceStartedAt = performance.now();
    activeTrace = {
      command,
      duration: 0,
      samples: [],
      tunnelPaintSamples: [],
      modeCommits: [],
    };
    setTunnelPaintCapture(true);
    captureGeometrySample();
  }

  function setTracePhase(phase: TransitionTracePhase): void {
    tracePhase = phase;
  }

  function finishGeometryTrace(): void {
    if (!activeTrace) return;
    cancelAnimationFrame(traceFrame);
    captureGeometrySample();
    cancelAnimationFrame(traceFrame);
    activeTrace.duration =
      Math.round((performance.now() - traceStartedAt) * 10) / 10;
    activeTrace.tunnelPaintSamples = readTunnelPaintHistory();
    window.parent.postMessage(
      {
        source: "sequence-viewer-transition-frame",
        status: "trace",
        trace: activeTrace,
      },
      window.location.origin
    );
    setTunnelPaintCapture(false);
    activeTrace = null;
  }

  function applyMotionPreference(preference: "full" | "reduce"): void {
    if (preference === "reduce") {
      document.documentElement.dataset.motionPreference = "reduce";
    } else {
      delete document.documentElement.dataset.motionPreference;
    }
    scheduleMetrics();
  }

  function modeButton(label: string): HTMLButtonElement | undefined {
    return Array.from(
      document.querySelectorAll<HTMLButtonElement>("button[aria-label]")
    ).find(
      (button) =>
        button.getAttribute("aria-label") === label &&
        !button.closest('[inert], [aria-hidden="true"]') &&
        button.getClientRects().length > 0
    );
  }

  async function waitForControl(
    label: string,
    version: number
  ): Promise<HTMLButtonElement> {
    const started = performance.now();
    while (version === replayVersion) {
      const button = modeButton(label);
      if (button && !button.disabled) return button;
      if (performance.now() - started > 10_000) break;
      await wait(32);
    }
    throw new Error(
      `${label} is unavailable. This replay requires its production control at this viewport.`
    );
  }

  async function workspaceReplay(
    command: WorkspaceReplayCommand,
    version: number
  ): Promise<void> {
    const interrupted = command.endsWith("interrupt");
    const dwell = interrupted ? 90 : motionDuration(DURATION.emphasis) + 220;
    const source: ReviewModeLabel =
      command === "studio-3d"
        ? "3D Animation"
        : command === "practice-card" || command.startsWith("studio-card-")
          ? "Card"
          : "2D Animation";
    if (!(await chooseMode(source, version))) return;
    if (source === "3D Animation" && !(await waitFor3DReady(version))) return;

    if (command.startsWith("studio-card-")) {
      if (!(await chooseMode("Post Studio", version))) return;
      const halves = Array.from(
        document.querySelectorAll<HTMLButtonElement>(".region-surface")
      ).sort(
        (a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top
      );
      const selected =
        halves[command.endsWith("bottom") ? halves.length - 1 : 0];
      if (!selected) throw new Error("Studio has no selectable phone halves");
      selected.click();
      await wait(dwell);
      if (!(await chooseMode("Card", version))) return;
    }

    beginGeometryTrace(
      command,
      interrupted ? "workspace-interrupt" : "workspace-enter"
    );
    if (command.startsWith("studio-")) {
      for (let index = 0; index < (interrupted ? 3 : 1); index++) {
        if (!(await chooseMode("Post Studio", version, !interrupted))) return;
        await wait(dwell);
        setTracePhase("workspace-return");
        if (!(await chooseMode(source, version, !interrupted))) return;
      }
      if (source === "3D Animation") await waitFor3DReady(version);
    } else if (command.startsWith("inspector-")) {
      if (
        !modeButton("Hide export settings") &&
        !modeButton("Show export settings")
      ) {
        throw new Error(
          "This viewport uses the compact control dock. Select a desktop viewport to review the export inspector."
        );
      }
      // Normalize to open without changing any export options or starting an export.
      modeButton("Show export settings")?.click();
      await wait(dwell);
      for (let index = 0; index < (interrupted ? 3 : 1); index++) {
        (await waitForControl("Hide export settings", version)).click();
        await wait(dwell);
        setTracePhase("workspace-return");
        (await waitForControl("Show export settings", version)).click();
        await wait(dwell);
      }
    } else if (command.startsWith("practice-")) {
      for (let index = 0; index < (interrupted ? 3 : 1); index++) {
        (await waitForControl("Practice", version)).click();
        await wait(dwell);
        setTracePhase("workspace-return");
        (await waitForControl("Exit practice mode", version)).click();
        // A round trip is not complete if Practice silently leaves the user
        // in Side by Side instead of restoring the surface that opened it.
        await waitForModeCommit(source, version);
        await wait(dwell);
      }
    } else {
      const labels: ReviewModeLabel[] = [
        "Side by Side",
        "2D Animation",
        "3D Animation",
        "Card",
        "Tunnel",
        "Performances",
        "Post Studio",
      ];
      const available = labels.filter((label) => modeButton(label));
      const pairs = interrupted
        ? ([
            ["Tunnel", "Card"],
            ["Performances", "2D Animation"],
            ["Card", "2D Animation"],
          ] as [ReviewModeLabel, ReviewModeLabel][])
        : orderedModePairs(available);
      for (const [from, to] of pairs) {
        for (const label of [from, to]) {
          if (!(await chooseMode(label, version, !interrupted))) return;
          if (
            !interrupted &&
            label === "3D Animation" &&
            !(await waitFor3DReady(version))
          )
            return;
          if (
            !interrupted &&
            label === "Tunnel" &&
            !(await waitForTunnelPresentation(version))
          )
            return;
          if (
            !interrupted &&
            label === "Performances" &&
            !(await waitForPerformanceGallery(version))
          )
            return;
        }
      }
      await chooseMode("2D Animation", version);
    }
  }

  async function chooseMode(
    label: ReviewModeLabel,
    version: number,
    settle = true
  ): Promise<boolean> {
    if (version !== replayVersion) return false;
    const button = modeButton(label);
    if (!button) throw new Error(`${label} is not available in this viewport.`);

    button.click();
    await tick();
    const commitLatency = await waitForModeCommit(label, version);
    activeTrace?.modeCommits.push({
      mode: expectedViewerMode(label),
      latency: commitLatency,
    });
    await wait(
      settle
        ? reducedMotion()
          ? VIEWER_MODE_DISSOLVE_DURATION + 90
          : motionDuration(DURATION.emphasis) + 90
        : motionDuration(DURATION.emphasis * 0.38) + 30
    );
    scheduleMetrics();
    return version === replayVersion;
  }

  async function runReplay(command: ReplayCommand): Promise<void> {
    const version = ++replayVersion;
    const startedAt = performance.now();
    report("running", command);

    try {
      // Wait for the real viewer, not just the iframe's onMount handshake.
      if (modeButton("Exit practice mode")) {
        modeButton("Exit practice mode")?.click();
        await wait(motionDuration(DURATION.emphasis) + 220);
      }
      await waitForControl("2D Animation", version);
      if (isWorkspaceReplayCommand(command)) {
        await workspaceReplay(command, version);
      } else {
        if (command.startsWith("performances-")) {
          const openingMode =
            command === "performances-3d" ? "3D Animation" : "2D Animation";
          if (
            !(await chooseMode(
              openingMode,
              version,
              command !== "performances-3d"
            ))
          )
            return;
          if (command === "performances-3d") {
            if (!(await waitForMotionPresentation("3d", version))) return;
            if (!(await waitFor3DReady(version))) return;
            await wait(motionDuration(DURATION.emphasis) + 90);
          }
        } else if (command.startsWith("card-")) {
          if (!(await chooseMode("Card", version))) return;
        } else if (
          command === "2d" ||
          command === "card" ||
          command === "interrupt"
        ) {
          if (!(await chooseMode("Side by Side", version))) return;
        } else if (!(await chooseMode("2D Animation", version))) {
          return;
        }

        if (command === "2d") {
          beginGeometryTrace(command, "focus-2d");
          if (!(await chooseMode("2D Animation", version))) return;
          setTracePhase("return-split");
          if (!(await chooseMode("Side by Side", version))) return;
        } else if (command === "card") {
          beginGeometryTrace(command, "focus-card");
          if (!(await chooseMode("Card", version))) return;
          setTracePhase("return-split");
          if (!(await chooseMode("Side by Side", version))) return;
        } else if (command === "interrupt") {
          beginGeometryTrace(command, "interrupt-2d");
          if (!(await chooseMode("2D Animation", version, false))) return;
          setTracePhase("interrupt-split");
          if (!(await chooseMode("Side by Side", version, false))) return;
          setTracePhase("interrupt-card");
          if (!(await chooseMode("Card", version, false))) return;
          setTracePhase("interrupt-return");
          if (!(await chooseMode("Side by Side", version))) return;
        } else if (command === "3d-first") {
          beginGeometryTrace(command, "prepare-3d");
          if (!(await chooseMode("3D Animation", version, false))) return;
          if (!(await waitForMotionPresentation("3d", version))) return;
          if (!(await waitFor3DReady(version))) return;
          setTracePhase("show-3d");
          await wait(DURATION.emphasis + 90);
          setTracePhase("return-2d");
          if (!(await chooseMode("2D Animation", version))) return;
        } else if (command === "3d-repeat") {
          if (!(await chooseMode("3D Animation", version, false))) return;
          if (!(await waitForMotionPresentation("3d", version))) return;
          if (!(await waitFor3DReady(version))) return;
          await wait(DURATION.emphasis + 90);
          if (!(await chooseMode("2D Animation", version))) return;

          beginGeometryTrace(command, "repeat-3d");
          if (!(await chooseMode("3D Animation", version, false))) return;
          if (!(await waitForMotionPresentation("3d", version))) return;
          if (!(await waitFor3DReady(version))) return;
          await wait(DURATION.emphasis + 90);
          setTracePhase("return-2d");
          if (!(await chooseMode("2D Animation", version))) return;
        } else if (command === "3d-interrupt") {
          beginGeometryTrace(command, "interrupt-3d");
          if (!(await chooseMode("3D Animation", version, false))) return;
          await wait(motionDuration(DURATION.instant));
          setTracePhase("interrupt-2d-return");
          if (!(await chooseMode("2D Animation", version, false))) return;
          setTracePhase("interrupt-3d");
          if (!(await chooseMode("3D Animation", version, false))) return;
          await wait(motionDuration(DURATION.instant));
          setTracePhase("interrupt-2d-return");
          if (!(await chooseMode("2D Animation", version))) return;
        } else if (command === "tunnel-first") {
          beginGeometryTrace(command, "prepare-tunnel");
          if (!(await chooseMode("Tunnel", version, false))) return;
          if (!(await waitForTunnelPresentation(version))) return;
          setTracePhase("show-tunnel");
          await wait(motionDuration(DURATION.emphasis) + 90);
          setTracePhase("return-stage");
          if (!(await chooseMode("2D Animation", version))) return;
        } else if (command === "tunnel-3d") {
          if (!(await chooseMode("3D Animation", version, false))) return;
          if (!(await waitForMotionPresentation("3d", version))) return;
          if (!(await waitFor3DReady(version))) return;
          await wait(motionDuration(DURATION.emphasis) + 90);

          beginGeometryTrace(command, "prepare-tunnel-from-3d");
          if (!(await chooseMode("Tunnel", version, false))) return;
          if (!(await waitForTunnelPresentation(version))) return;
          setTracePhase("show-tunnel");
          await wait(motionDuration(DURATION.emphasis) + 90);
          setTracePhase("return-3d");
          if (!(await chooseMode("3D Animation", version, false))) return;
          if (!(await waitForMotionPresentation("3d", version))) return;
          if (!(await waitFor3DReady(version))) return;
          await wait(motionDuration(DURATION.emphasis) + 90);
        } else if (command === "card-2d") {
          beginGeometryTrace(command, "card-to-stage");
          if (!(await chooseMode("2D Animation", version))) return;
          setTracePhase("stage-to-card");
          if (!(await chooseMode("Card", version))) return;
        } else if (command === "card-3d") {
          beginGeometryTrace(command, "card-to-stage");
          if (!(await chooseMode("3D Animation", version, false))) return;
          if (!(await waitForMotionPresentation("3d", version))) return;
          if (!(await waitFor3DReady(version))) return;
          await wait(motionDuration(DURATION.emphasis) + 90);
          setTracePhase("stage-to-card");
          if (!(await chooseMode("Card", version))) return;
        } else if (command === "card-tunnel") {
          beginGeometryTrace(command, "card-to-stage");
          if (!(await chooseMode("Tunnel", version, false))) return;
          if (!(await waitForTunnelPresentation(version))) return;
          await wait(motionDuration(DURATION.emphasis) + 90);
          setTracePhase("stage-to-card");
          if (!(await chooseMode("Card", version))) return;
        } else if (command === "card-performances") {
          beginGeometryTrace(command, "card-to-performances");
          if (!(await chooseMode("Performances", version))) return;
          setTracePhase("performances-to-card");
          if (!(await chooseMode("Card", version))) return;
        } else if (command === "card-stage-interrupt") {
          beginGeometryTrace(command, "card-stage-interrupt");
          if (!(await chooseMode("2D Animation", version, false))) return;
          await wait(motionDuration(DURATION.instant));
          if (!(await chooseMode("Card", version, false))) return;
          if (!(await chooseMode("Tunnel", version, false))) return;
          await wait(motionDuration(DURATION.instant));
          if (!(await chooseMode("Card", version))) return;
        } else if (command === "performances-2d") {
          beginGeometryTrace(command, "stage-to-performances");
          if (!(await chooseMode("Performances", version, false))) return;
          if (!(await waitForPerformanceGallery(version))) return;
          await wait(motionDuration(DURATION.emphasis) + 90);
          setTracePhase("performances-to-stage");
          if (!(await chooseMode("2D Animation", version))) return;
        } else if (command === "performances-3d") {
          beginGeometryTrace(command, "stage-to-performances");
          if (!(await chooseMode("Performances", version, false))) return;
          if (!(await waitForPerformanceGallery(version))) return;
          await wait(motionDuration(DURATION.emphasis) + 90);
          setTracePhase("performances-to-stage");
          if (!(await chooseMode("3D Animation", version, false))) return;
          if (!(await waitForMotionPresentation("3d", version))) return;
          if (!(await waitFor3DReady(version))) return;
          await wait(motionDuration(DURATION.emphasis) + 90);
        } else if (command === "performances-interrupt") {
          beginGeometryTrace(command, "interrupt-performances");
          if (!(await chooseMode("Performances", version, false))) return;
          await wait(motionDuration(DURATION.instant));
          setTracePhase("interrupt-performance-stage");
          if (!(await chooseMode("2D Animation", version, false))) return;
          setTracePhase("interrupt-performances");
          if (!(await chooseMode("Performances", version, false))) return;
          await wait(motionDuration(DURATION.instant));
          setTracePhase("interrupt-performance-stage");
          if (!(await chooseMode("2D Animation", version))) return;
        } else {
          beginGeometryTrace(command, "interrupt-tunnel");
          if (!(await chooseMode("Tunnel", version, false))) return;
          await wait(motionDuration(DURATION.instant));
          setTracePhase("interrupt-stage");
          if (!(await chooseMode("2D Animation", version, false))) return;
          setTracePhase("interrupt-tunnel");
          if (!(await chooseMode("Tunnel", version, false))) return;
          await wait(motionDuration(DURATION.instant));
          setTracePhase("interrupt-stage");
          if (!(await chooseMode("2D Animation", version))) return;
        }
      }
      if (activeTrace && version === replayVersion) {
        setTracePhase("settle");
        await wait(SETTLE_TAIL_MS);
      }

      const elapsed = Math.round(performance.now() - startedAt);
      report(
        "complete",
        command,
        `Round trip complete in ${elapsed} ms${reducedMotion() ? " · reduced motion" : ""}.`
      );
      scheduleMetrics();
    } catch (error) {
      report(
        "error",
        command,
        error instanceof Error ? error.message : "Replay failed."
      );
    } finally {
      finishGeometryTrace();
    }
  }

  function isReviewMessage(value: unknown): value is ReviewMessage {
    if (!value || typeof value !== "object") return false;
    const message = value as Partial<ReviewMessage>;
    return (
      message.source === "sequence-viewer-transition-review" &&
      (message.action === "status" ||
        (message.action === "replay" &&
          (isWorkspaceReplayCommand(message.command) ||
            message.command === "2d" ||
            message.command === "card" ||
            message.command === "interrupt" ||
            message.command === "3d-first" ||
            message.command === "3d-repeat" ||
            message.command === "3d-interrupt" ||
            message.command === "tunnel-first" ||
            message.command === "tunnel-3d" ||
            message.command === "tunnel-interrupt" ||
            message.command === "card-2d" ||
            message.command === "card-3d" ||
            message.command === "card-tunnel" ||
            message.command === "card-performances" ||
            message.command === "card-stage-interrupt" ||
            message.command === "performances-2d" ||
            message.command === "performances-3d" ||
            message.command === "performances-interrupt")) ||
        (message.action === "motion" &&
          (message.preference === "full" || message.preference === "reduce")))
    );
  }

  onMount(() => {
    document.getElementById("app-loading")?.remove();
    void initializeAppServices();

    const updateMobile = () => (isMobile = window.innerWidth < 768);
    const announceReady = async () => {
      const version = replayVersion;
      try {
        await waitForControl("2D Animation", version);
        if (version !== replayVersion) return;
        report(activeTrace ? "running" : "ready");
        scheduleMetrics();
      } catch (error) {
        if (version === replayVersion)
          report(
            "error",
            undefined,
            error instanceof Error ? error.message : "Viewer could not start."
          );
      }
    };
    const handleMessage = (event: MessageEvent<unknown>) => {
      if (
        event.source !== window.parent ||
        event.origin !== window.location.origin ||
        !isReviewMessage(event.data)
      ) {
        return;
      }
      if (event.data.action === "replay") {
        void runReplay(event.data.command);
      } else if (event.data.action === "motion") {
        applyMotionPreference(event.data.preference);
      } else {
        void announceReady();
      }
    };

    updateMobile();
    applyMotionPreference("full");
    window.addEventListener("resize", updateMobile);
    window.addEventListener("message", handleMessage);
    const resizeObserver = new ResizeObserver(scheduleMetrics);
    resizeObserver.observe(document.documentElement);
    void announceReady();
    scheduleMetrics();

    return () => {
      replayVersion += 1;
      cancelAnimationFrame(metricsFrame);
      cancelAnimationFrame(traceFrame);
      resizeObserver.disconnect();
      delete document.documentElement.dataset.motionPreference;
      window.removeEventListener("resize", updateMobile);
      window.removeEventListener("message", handleMessage);
    };
  });
</script>

<main class="transition-review-frame">
  <SequenceViewerOrchestrator
    sequence={TRANSITION_REVIEW_SEQUENCE}
    {isMobile}
    forceGuest
    initialViewMode="split"
    initialViewerMode="split"
    initialBpm={84}
    onClose={() => {}}
  >
    {#snippet children(ctx)}
      <SequenceViewerShell
        reviewPostStudio
        {ctx}
        sequence={TRANSITION_REVIEW_SEQUENCE}
        analyticsSource="external_link"
        {isMobile}
        onClose={() => {}}
        startInSplit
        embedded
      />
    {/snippet}
  </SequenceViewerOrchestrator>
</main>

<style>
  :global(html),
  :global(body) {
    margin: 0;
    min-height: 100%;
    overflow: hidden;
    background: var(--theme-bg, #090b11);
  }

  .transition-review-frame {
    width: 100vw;
    height: 100vh;
    height: 100dvh;
    overflow: hidden;
    background: var(--theme-bg, #090b11);
    color: var(--theme-text, #f7f8fb);
  }
</style>
