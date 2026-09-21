<!--
  ChoreoCard.svelte

  Renders a sequence preview with individually animated pictograph cells.
  Layout shell that composes extracted sub-components:
  - CardHeader (difficulty badge + LOOP glyph + word title)
  - CardGridLayout (grid section with cells, QR, mandalas)
  - CardFooter (notes and path metadata)
  - CellRenderer (per-cell images, overlays - used by CardGridLayout)

  Public facade for the card contract. Display semantics, responsive sizing,
  QR generation, render scheduling, and transition invalidation live in named
  state owners under shared/choreo-card.
-->
<script lang="ts">
  // Note: transition/animation imports (fade, fly, scale, flip, cubicOut) moved to
  // extracted sub-components (CardHeader, CardFooter, CardGridLayout, CellRenderer).
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { SequenceExportOptions } from "$lib/shared/render/domain/models/sequence-export-options";
  import type { ViewerCustomColorPair } from "../domain/viewer-custom-colors";
  import type { PreviewCellRenderOptions } from "../services/preview-cell-renderer";
  import type { ViewerPaneBox } from "./viewer-panel-layout";
  import { onDestroy, tick } from "svelte";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import type { authState as AuthStateModule } from "$lib/shared/auth/state/auth-state.svelte";
  import ContextMenu from "$lib/shared/components/context-menu/ContextMenu.svelte";
  import type { ContextMenuState } from "$lib/shared/components/context-menu/context-menu-types";
  import { featureFlagService } from "$lib/shared/auth/services/post-hog-feature-flag-service.svelte";
  import {
    getQRCodeGenerator,
    getUrlQRCodeGenerator,
  } from "$lib/shared/qr/get-qr-code-generator";
  import { resolveInfoCellDisplay } from "../services/info-cell-display";
  import { createStartPlacementFromBeatStart } from "$lib/shared/create/services/sequence-transforms";
  import { getVisibilityStateManager } from "$lib/shared/pictograph/shared/state/visibility-state.svelte";
  import { getSettings } from "$lib/shared/application/state/app-state.svelte";
  import { tryGetViewerVisibilityContext } from "../context/viewer-visibility-context";
  import { getScanCardCloudProbe } from "$lib/shared/sequence-viewer/scan-card-cloud-context";
  import { CANONICAL_CARD_VISIBILITY } from "$lib/shared/render/services/cloud-cell-key";
  import { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
  import type { HandLabeling } from "$lib/shared/video-collaboration/domain/hand-labeling";
  import { handLegendFor } from "../services/hand-legend";
  import { getMotionColor } from "$lib/shared/utils/svg-color-utils";

  import ProgressRing from "$lib/shared/components/loading/ProgressRing.svelte";
  import { getImageCompositionManager } from "$lib/shared/share/state/image-composition-state.svelte";
  import {
    getStepColumnsForLayout,
    pickBestFitLayout,
    type ResolvedAutoLayout,
  } from "$lib/shared/render/services/container-aware-layout";

  // Extracted sub-components
  import CardHeader, { HEADER_MOTION_MS } from "./CardHeader.svelte";
  import CardFooter from "./CardFooter.svelte";
  import CardGridLayout from "./CardGridLayout.svelte";

  // Extracted modules
  import { buildRenderOptions } from "$lib/shared/choreo-card/services/choreo-card-cell-pipeline";
  import {
    formatSoloTurns,
    shortOrientation,
    formatDuration,
  } from "$lib/shared/choreo-card/services/choreo-card-label-format";
  import { createChoreoCardLayoutState } from "$lib/shared/choreo-card/state/choreo-card-layout-state.svelte";
  import {
    createChoreoCardSizingState,
    getContainedCardHeight,
  } from "$lib/shared/choreo-card/state/choreo-card-sizing-state.svelte";
  import { createChoreoCardQrState } from "$lib/shared/choreo-card/state/choreo-card-qr-state.svelte";
  import { createChoreoCardDisplayState } from "$lib/shared/choreo-card/state/choreo-card-display-state.svelte";
  import { createChoreoCardRenderLifecycle } from "$lib/shared/choreo-card/state/choreo-card-render-lifecycle.svelte";
  import { createCrossfaderState } from "$lib/shared/choreo-card/state/crossfader-state.svelte";
  import {
    createChoreoCardRenderEngine,
    type ChoreoCardRenderModel,
  } from "$lib/shared/choreo-card/services/choreo-card-render-engine";
  import { composeMenu } from "$lib/shared/components/context-menu/compose-menu";
  import { buildCardMenuSection } from "$lib/shared/choreo-card/services/card-menu-section";
  import { buildPictographContextMenuItems } from "$lib/shared/pictograph/shared/components/context-menu/pictograph-context-menu-builder";

  // Eagerly initialize the singleton so its constructor (which mutates $state)
  // runs in the script block, not inside a $derived expression.
  const compositionManager = getImageCompositionManager();

  interface Props {
    sequence: SequenceData;
    // Visibility toggles
    showWord?: boolean;
    showStepNumbers?: boolean;
    /** Choose Start picker: step cells render as poses (grid and props only). */
    posePicker?: boolean;
    showDifficultyLevel?: boolean;
    includeStartPlacement?: boolean;
    showNotes?: boolean;
    showLoopGlyph?: boolean;
    showQRCode?: boolean;
    /** Reuse a published scan link without creating an account-owned code. */
    qrUrl?: string;
    /**
     * The sequence a scan opens. Defaults to `sequence`. A hand-labeled card
     * draws a derived sequence that has no record of its own, so the surface
     * passes the source here and the code keeps pointing at the real one.
     */
    qrSequence?: SequenceData;
    /** When true, fill empty col-0 cells with mandala visualizations */
    showMandala?: boolean;
    /** Render as hand path visualization (HAND props, float arrows, no TKA) */
    handPathMode?: boolean;
    /** Browse view mode for solo prop/hand filtering */
    browseViewMode?: import("$lib/shared/browse/domain/browse-view-mode").BrowseViewMode;
    // Settings
    darkMode?: boolean;
    /** Optional physical-card frame painted behind the canonical card content. */
    frameColors?: { readonly accent: string; readonly dark: string };
    /** Optional width-to-height ratio for a physical card presentation. */
    cardAspectRatio?: number;
    /** Plain-text artifact title for cards whose identity is not a TKA word. */
    customTitleText?: string;
    customNotesText?: string;
    /**
     * Set only beside performance footage. Draws the "which color is your
     * right hand" line in the footer. The caller is responsible for passing
     * the matching (mirrored and swapped, or canonical) sequence.
     */
    handLabeling?: HandLabeling | null;
    // Prop overrides
    leftPropType?: PropType;
    rightPropType?: PropType;
    primaryPropColors?: ViewerCustomColorPair;
    catDogModeEnabled?: boolean;
    // Step highlighting (for animation sync)
    highlightedStepIndex?: number | null; // 0-indexed step to highlight (null = none)
    showHighlight?: boolean; // Enable highlighting (default: false)
    // Click handler for step seeking
    onStepClick?: (stepIndex: number) => void; // 0-indexed step that was clicked
    // When provided, the QR's center play badge becomes clickable (interactive
    // viewer): click switches to the 2D animation view and starts playback.
    onQrPlayClick?: () => void;
    // When true, the start-placement cell is clickable too (seeks to start, index -1)
    clickableStart?: boolean;
    // Layout override
    columnCount?: number | null; // Override auto-calculated column count (null = auto)
    forceContain?: boolean; // Force contain mode even for long sequences (disables scroll)
    fitWidth?: boolean; // Always constrain by width (mobile export: let parent scroll for tall cards)
    // Render progress callback (loaded cells, total cells)
    onRenderProgress?: (loaded: number, total: number) => void;
    /** All cells and the QR have painted; a hidden host may reveal the card. */
    onReady?: () => void;
    /** All pictograph content has painted. Unlike onReady, this does not wait
     * for an optional QR request to settle. */
    onContentReady?: () => void;
    // Increment to force a full re-render (clears caches and re-renders all cells)
    rerenderTrigger?: number;
    // Suppress solo mode header ("Left Prop Path" / "Right Hand Path")
    hideSoloHeader?: boolean;
    // Right-click context menu callback
    onContextMenu?: (x: number, y: number) => void;
    // Per-instance override for start-placement layout (defaults to global user
    // setting via compositionManager). Embedded contexts (landing page,
    // marketing previews) need a fixed layout independent of viewer prefs.
    startPlacementLayoutOverride?: "row" | "column" | null;
    /** Holds a resolved Auto grid while a parent workspace changes geometry. */
    autoLayoutOverride?: ResolvedAutoLayout | null;
    /** Keeps contain sizing on the viewer's transition clock. */
    containSizeMotion?: "focus" | "return" | "restore" | null;
    /**
     * The box this Card's pane is heading toward while containSizeMotion is set.
     *
     * Without it the Card follows a container that is still opening and paints
     * itself at every size along the way. With it the Card renders at its
     * destination size for the whole structural change.
     */
    containMotionBox?: ViewerPaneBox | null;
    /** Reports the measured Auto winner so Download Card can reuse it for PNG export. */
    onAutoLayoutResolved?: (
      layout: ResolvedAutoLayout | null,
      width: number,
      height: number
    ) => void;
    /** Pins a portable card to its export snapshot instead of live viewer state. */
    visibilityOverrides?: SequenceExportOptions["visibilityOverrides"];
    /** Stable artifact presentation has no viewer controls, selection, or entrance motion. */
    exportPresentation?: boolean;
    /** The export snapshot's mandala policy, independent of the live animation panel. */
    mandalaPathShape?: SequenceExportOptions["mandalaPathShape"];
    /** Stable host bounds for Auto selection, separate from contained artwork. */
    layoutAvailableWidth?: number;
    layoutAvailableHeight?: number;
  }

  const {
    sequence,
    showWord = true,
    showStepNumbers = true,
    posePicker = false,
    showDifficultyLevel = true,
    includeStartPlacement = true,
    showNotes = true,
    showLoopGlyph = true,
    showQRCode = false,
    qrUrl,
    qrSequence,
    showMandala = false,
    handPathMode: requestedHandPathMode = false,
    browseViewMode,
    darkMode = false,
    frameColors,
    primaryPropColors,
    cardAspectRatio,
    customTitleText: requestedTitleText,
    customNotesText = "Created using Flow Arts Composer",
    handLabeling = null,
    leftPropType,
    rightPropType,
    catDogModeEnabled = false,
    highlightedStepIndex = null,
    showHighlight = false,
    onStepClick,
    onQrPlayClick,
    clickableStart = false,
    columnCount = null,
    forceContain = false,
    fitWidth = false,
    onRenderProgress,
    onReady,
    onContentReady,
    rerenderTrigger = 0,
    hideSoloHeader = false,
    onContextMenu,
    startPlacementLayoutOverride = null,
    autoLayoutOverride = null,
    containSizeMotion = null,
    containMotionBox = null,
    onAutoLayoutResolved,
    visibilityOverrides,
    exportPresentation = false,
    mandalaPathShape,
    layoutAvailableWidth,
    layoutAvailableHeight,
  }: Props = $props();

  // Auth-aware WITHOUT dragging Firebase onto pages that never need it.
  //
  // This card renders on the landing launchpad tile (LaunchpadTile.svelte,
  // media="choreo-card"), which passes showQRCode: false. A STATIC `authState`
  // import pulled the entire Firebase SDK — auth, app, firestore, database,
  // messaging, functions — into that first-paint path for signed-out visitors,
  // measured 2026-08-10 in a cold isolated context: firebase_auth at 1646ms
  // through firebase_functions at 3865ms, plus 6 identitytoolkit/firestore
  // round trips. SiteHeader.svelte already avoids this the same way and its
  // comment warns about exactly this import.
  //
  // The flag is only ever read to decide whether a QR code renders, so load the
  // real authState lazily and ONLY when a QR code is actually in play. Until it
  // resolves the answer is false — which is also the correct answer for the
  // signed-out visitor who dominates the landing path.
  let authApi = $state<typeof AuthStateModule | null>(null);
  let authLoadPromise: Promise<void> | null = null;
  let liveContentDomVersion = $state(0);
  let contentReadyScheduled = false;
  let contentReadyDisposed = false;
  onDestroy(() => {
    contentReadyDisposed = true;
  });
  function ensureAuthLoaded(): void {
    if (authLoadPromise) return;
    authLoadPromise = (async () => {
      const mod = await import("$lib/shared/auth/state/auth-state.svelte");
      authApi = mod.authState;
      // Idempotent; app-mode boot has normally already run it.
      await mod.authState.initialize();
    })();
  }
  $effect(() => {
    if (showQRCode && !qrUrl) ensureAuthLoaded();
  });
  $effect(() => {
    const stack = previewStackElement;
    if (!stack || !onContentReady) return;
    const observer = new MutationObserver(() => {
      liveContentDomVersion++;
    });
    observer.observe(stack, { childList: true, subtree: true });
    return () => observer.disconnect();
  });
  $effect(() => {
    void liveContentDomVersion;
    const ready = onContentReady;
    const stack = previewStackElement;
    const visibleCells = cells.filter(
      (cell) => includeStartPlacement || cell.index !== -1
    );
    // A Download Card uses the live SVG renderer so it can paint before the
    // PNG worker starts. Those cells become meaningful when their SVGs mount;
    // they do not need to wait for the bitmap lifecycle's isLoaded flag.
    const mountedLiveCells = stack
      ? stack.querySelectorAll(".live-pictograph svg[role='img']").length
      : 0;
    const expectedLiveCells = visibleCells.filter((cell) => cell.live).length;
    if (
      !ready ||
      !stack ||
      !containedWidth ||
      !containedHeight ||
      !visibleCells.length ||
      mountedLiveCells < expectedLiveCells ||
      !visibleCells.every(
        (cell) => cell.live || cell.isLoaded || cell.renderFailed
      ) ||
      contentReadyScheduled
    )
      return;
    // Contained geometry may continue settling by a fraction of a pixel after
    // the actual SVG card is visible. Do not cancel this meaningful-content
    // paint just because that separate sizing observer reports again.
    contentReadyScheduled = true;
    void (async () => {
      await tick();
      await Promise.allSettled(
        [...stack.querySelectorAll("img")].map((image) => image.decode())
      );
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      );
      if (!contentReadyDisposed) ready();
    })();
  });
  const isAuthenticated = $derived(authApi?.isAuthenticated ?? false);
  const canShowQRCode = $derived(isAuthenticated || !!qrUrl);

  // Long-press state for touch context menu
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;
  let longPressOrigin: { x: number; y: number } | null = null;
  let longPressFired = false;

  function cancelLongPress() {
    if (longPressTimer !== null) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    longPressOrigin = null;
  }

  // Constants
  // Render at high resolution for crisp display on 4K monitors
  // Images scale down cleanly on lower-resolution displays
  const CELL_SIZE = 240; // Match thumbnail pipeline (240px) for instant cache hits from gallery

  const renderModel = $state<ChoreoCardRenderModel>({
    cells: [],
    columns: 0,
    rows: 0,
    isLoading: true,
    isRefreshing: false,
    hasMixedDurations: false,
    durationRows: [],
    durationColCount: 0,
  });
  const cells = $derived(renderModel.cells);
  const columns = $derived(renderModel.columns);
  const rows = $derived(renderModel.rows);
  const isLoading = $derived(renderModel.isLoading);
  const isRefreshing = $derived(renderModel.isRefreshing);
  let prevEffectiveColumns = $state(0);
  let prevEffectiveRows = $state(0);
  const hasMixedDurations = $derived(renderModel.hasMixedDurations);
  // The PNG compositor uses a square grid and carries duration in its badge.
  // Keep the live export presentation on that same geometry without erasing
  // the source duration data CellRenderer needs for the badge.
  const useDurationLayout = $derived(hasMixedDurations && !exportPresentation);
  const durationRows = $derived(renderModel.durationRows);
  const durationColCount = $derived(renderModel.durationColCount);
  const crossfader = createCrossfaderState(() => darkMode);
  // Reactive aliases used by the template and internal functions
  const crossfadeActive = $derived(crossfader.crossfadeActive);
  const activeDarkMode = $derived(crossfader.activeDarkMode);

  // Container-based sizing for "contain" behavior
  let containerElement: HTMLDivElement | undefined = $state();
  const handPathMode = $derived(
    sequence.sequenceKind === "hand-path" || requestedHandPathMode
  );
  const customTitleText = $derived(
    requestedTitleText ??
      (sequence.sequenceKind === "hand-path"
        ? sequence.displayName || sequence.name
        : undefined)
  );

  let previewStackElement: HTMLDivElement | undefined = $state();

  let gridScrollRef: HTMLDivElement | undefined = $state();

  const vm = getVisibilityStateManager();
  const viewerVisibility = tryGetViewerVisibilityContext();
  const displayState = createChoreoCardDisplayState(
    () => ({
      sequence,
      browseViewMode,
      handPathMode,
      showWord,
      customTitleText,
      showDifficultyLevel,
      hideSoloHeader,
      showLoopGlyph,
      showNotes,
      showLeftMotion: viewerVisibility?.leftMotion ?? true,
      showRightMotion: viewerVisibility?.rightMotion ?? true,
      visibilityOverrides,
    }),
    vm
  );
  const showLeftMotion = $derived(displayState.showLeftMotion);
  const showRightMotion = $derived(displayState.showRightMotion);
  const allMotionsVisible = $derived(displayState.allMotionsVisible);
  const showTnD = $derived(displayState.showTnD);
  const showElemental = $derived(displayState.showElemental);
  const showPropTnD = $derived(displayState.showPropTnD);
  const showPlacements = $derived(displayState.showPlacements);
  const showHandColorKey = $derived(displayState.showHandColorKey);
  const showGrid = $derived(displayState.showGrid);
  const showNonRadial = $derived(displayState.showNonRadial);
  const handPointVis = $derived(displayState.handPointVis);
  const showTKA = $derived(displayState.showTKA);
  const showReversals = $derived(displayState.showReversals);
  const isBrowseSoloMode = $derived(displayState.isBrowseSoloMode);
  const isMotionSoloMode = $derived(displayState.isMotionSoloMode);
  const isSoloMode = $derived(displayState.isSoloMode);
  const soloHand = $derived(displayState.soloHand);
  const isHandsMode = $derived(displayState.isHandsMode);
  const difficultyLevel = $derived(displayState.difficultyLevel);
  const currentLevelStyle = $derived(displayState.currentLevelStyle);
  const loopComponents = $derived(displayState.loopComponents);
  const loopRotationPeriod = $derived(displayState.loopRotationPeriod);
  const loopInversionPeriod = $derived(displayState.loopInversionPeriod);
  const loopReflectionAxis = $derived(displayState.loopReflectionAxis);
  const loopOverlayComponents = $derived(displayState.loopOverlayComponents);
  const wordVisible = $derived(displayState.wordVisible);
  const effectiveShowDifficulty = $derived(
    displayState.effectiveShowDifficulty
  );
  const showHeader = $derived(displayState.showHeader);

  // The header folds in flow over HEADER_MOTION_MS, but the contain solve hands
  // the stack its new height in the very next commit. Left alone, the grid
  // gets squashed under the still-folding header and then snaps when it goes.
  // This flag rides the same DOM commit as the new dimensions (the sizeJump
  // pattern in choreo-card-sizing-state), so the stack's height transition
  // runs on the header's clock and the grid never changes size.
  let headerMotion = $state(false);
  let headerMotionTimer: ReturnType<typeof setTimeout> | null = null;
  let headerMotionSeen: boolean | null = null;
  $effect(() => {
    const next = showHeader;
    if (headerMotionSeen === null) {
      headerMotionSeen = next;
      return;
    }
    if (next === headerMotionSeen) return;
    headerMotionSeen = next;
    headerMotion = true;
    if (headerMotionTimer !== null) clearTimeout(headerMotionTimer);
    headerMotionTimer = setTimeout(() => {
      headerMotionTimer = null;
      headerMotion = false;
    }, HEADER_MOTION_MS);
  });
  const hasPathShapeMetadata = $derived(displayState.hasPathShapeMetadata);

  // Observe composition manager so per-step-count settings (start position
  // layout, column overrides) trigger layout re-derivation.
  let compositionVersion = $state(0);
  function onCompositionChanged(): void {
    compositionVersion++;
  }
  compositionManager.registerObserver(onCompositionChanged);
  onDestroy(() => {
    compositionManager.unregisterObserver(onCompositionChanged);
  });

  // One-spot info-cell resolution: when a card has a single empty info cell and
  // both QR + mandala are on, the user's per-length choice decides the cell.
  // resolveInfoCellDisplay is a no-op in every other case, so multi-cell cards
  // and marketing cards (mandala-only) are unaffected. The live Auto winner is
  // recomputed with the same pure picker used by layoutState; keeping this
  // independent avoids a cycle (effective QR/mandala visibility feeds the
  // mandala layout that layoutState owns).
  const effectiveInfoCell = $derived.by(() => {
    void compositionVersion;
    const sc = sequence?.steps?.length ?? 0;
    const compositionColumns =
      columnCount ?? compositionManager.getColumnCountForStepCount(sc);
    const automaticLayout =
      startPlacementLayoutOverride === null &&
      compositionColumns === null &&
      (forceContain || sc <= 16) &&
      containerRawWidth > 0 &&
      containerRawHeight > 0
        ? pickBestFitLayout({
            stepCount: sc,
            stepDurations: sequence.steps.map((step) => step.duration ?? 1),
            includeStartPlacement,
            containerWidth: containerRawWidth,
            containerHeight: containerRawHeight,
            showHeader,
            showFooter,
            showQRCode:
              sc > 1 &&
              (exportPresentation
                ? (visibilityOverrides?.showQRCode ?? false)
                : showQRCode && canShowQRCode),
          })
        : null;
    const spl =
      automaticLayout && automaticLayout.startPlacement !== "none"
        ? automaticLayout.startPlacement
        : (startPlacementLayoutOverride ??
          compositionManager.getStartPlacementLayoutForStepCount(sc));
    const infoCellColumns =
      compositionColumns ??
      (automaticLayout ? getStepColumnsForLayout(automaticLayout) : null);
    return resolveInfoCellDisplay({
      stepCount: sc,
      includeStartPlacement,
      startPlacementLayout: spl,
      columnCount: infoCellColumns,
      showQRCode,
      showMandala,
      infoCellChoice: compositionManager.getInfoCellChoiceForStepCount(sc),
      isAuthenticated,
      hasPublishedUrl: !!qrUrl,
    });
  });
  const effShowQRCode = $derived(
    exportPresentation
      ? (visibilityOverrides?.showQRCode ?? false)
      : effectiveInfoCell.showQRCode
  );
  const effShowMandala = $derived(
    exportPresentation
      ? (visibilityOverrides?.showMandala ?? false)
      : effectiveInfoCell.showMandala
  );

  // True only under a scan-origin /sequence route — cells use the cloud cache.
  const cloudProbeEnabled = getScanCardCloudProbe();
  const snapshotPrimaryPropColors = $derived(
    primaryPropColors !== undefined
      ? primaryPropColors
      : visibilityOverrides?.primaryPropColors !== undefined
        ? visibilityOverrides.primaryPropColors
        : undefined
  );
  const effectivePrimaryPropColors = $derived(
    cloudProbeEnabled
      ? null
      : exportPresentation
        ? (snapshotPrimaryPropColors ?? {
            left: getMotionColor(HandSide.LEFT, darkMode ? "dark" : "light"),
            right: getMotionColor(HandSide.RIGHT, darkMode ? "dark" : "light"),
          })
        : (snapshotPrimaryPropColors ?? getSettings().primaryPropColors)
  );
  const handLegend = $derived(
    handLabeling
      ? handLegendFor(
          handLabeling,
          effectivePrimaryPropColors?.right ??
            getMotionColor(HandSide.RIGHT, activeDarkMode ? "dark" : "light")
        )
      : null
  );
  const showFooter = $derived(displayState.showFooter || handLegend !== null);

  const qrState = createChoreoCardQrState(
    () => ({
      sequence: qrSequence ?? sequence,
      showQRCode: effShowQRCode,
      qrUrl,
      darkMode,
      isAuthenticated,
      leftPropType,
      rightPropType,
      browseViewMode,
    }),
    { getGenerator: getQRCodeGenerator, getUrlGenerator: getUrlQRCodeGenerator }
  );
  const qrDataUrl = $derived(qrState.dataUrl);
  const qrPending = $derived(qrState.pending);

  // Layout and DOM sizing are separate owners with a deliberate one-way loop:
  // raw container measurements feed layout; the resolved layout model then
  // determines the contained box and cell width.
  let layoutState: ReturnType<typeof createChoreoCardLayoutState>;
  const fixedCardAspectRatio = $derived(
    typeof cardAspectRatio === "number" &&
      Number.isFinite(cardAspectRatio) &&
      cardAspectRatio > 0
      ? cardAspectRatio
      : null
  );
  function activePreviewAspectRatio(): number {
    return fixedCardAspectRatio ?? layoutState.previewAspectRatio;
  }
  const sizingState = createChoreoCardSizingState(() => ({
    containerElement,
    previewStackElement,
    previewAspectRatio: activePreviewAspectRatio(),
    forceContain,
    needsScroll: layoutState.needsScroll,
    fitWidth,
    containSizeMotion,
    containMotionBox,
    containModel: layoutState.containModel,
    squareGridContain: fixedCardAspectRatio !== null,
    exactExportGeometry: exportPresentation,
    layoutContainerWidthOverride: layoutAvailableWidth,
    layoutContainerHeightOverride: layoutAvailableHeight,
  }));

  layoutState = createChoreoCardLayoutState(() => ({
    sequence,
    includeStartPlacement,
    columnCount,
    showHeader,
    showFooter,
    showQRCode: effShowQRCode,
    autoLayoutReservesQRCode:
      sequence.steps.length > 1 &&
      (exportPresentation
        ? (visibilityOverrides?.showQRCode ?? false)
        : showQRCode && canShowQRCode),
    showMandala: effShowMandala,
    forceContain,
    // These feed ONLY the mandala placement (which color fills the info cell).
    // In browse-solo the card shows a single prop, so the mandala must match
    // that hand — otherwise it fills with both. Motion-solo/normal unchanged.
    showLeftMotion: isBrowseSoloMode ? soloHand === "left" : showLeftMotion,
    showRightMotion: isBrowseSoloMode ? soloHand === "right" : showRightMotion,
    startPlacementLayoutOverride,
    compositionVersion,
    cellWidth: sizingState.cellWidth,
    hasMixedDurations: useDurationLayout,
    durationColCount,
    containerWidth: sizingState.layoutContainerWidth,
    containerHeight: sizingState.layoutContainerHeight,
    autoLayoutOverride,
  }));

  // Reactive aliases for values that move to the layout state factory.
  // Keeps downstream code and the template unchanged.
  const needsScroll = $derived(layoutState.needsScroll);
  const startPlacementLayout = $derived(layoutState.startPlacementLayout);
  const effectiveColumns = $derived(layoutState.effectiveColumns);
  const effectiveRows = $derived(layoutState.effectiveRows);
  const mandalaLayoutOverride = $derived(layoutState.mandalaLayoutOverride);
  const mandalaPlacements = $derived(layoutState.mandalaPlacements);
  const previewAspectRatio = $derived(activePreviewAspectRatio());
  const scaledHeaderHeight = $derived(layoutState.scaledHeaderHeight);
  const scaledFooterHeight = $derived(layoutState.scaledFooterHeight);
  const stepNumFontSize = $derived(layoutState.stepNumFontSize);
  const badgeSize = $derived(layoutState.badgeSize);
  const badgePadding = $derived(layoutState.badgePadding);
  const badgeNumberFontSize = $derived(layoutState.badgeNumberFontSize);
  const wordTitleFontSize = $derived(layoutState.wordTitleFontSize);
  const footerFontSize = $derived(layoutState.footerFontSize);
  const footerMargin = $derived(layoutState.footerMargin);
  const qrGridPlacement = $derived(layoutState.qrGridPlacement);
  const cellWidth = $derived(sizingState.cellWidth);
  const containedWidth = $derived(sizingState.containedWidth);
  const containedHeight = $derived(sizingState.containedHeight);

  $effect(() => {
    const ready = onReady;
    const stack = previewStackElement;
    if (
      !ready ||
      !stack ||
      !containedWidth ||
      !containedHeight ||
      !cells.length ||
      !cells
        .filter((cell) => includeStartPlacement || cell.index !== -1)
        .every((cell) => cell.isLoaded || cell.renderFailed) ||
      !qrState.settled
    )
      return;
    let cancelled = false;
    // Render progress means an image URL exists, not that the browser has drawn
    // it. Finish decoding and the native cell entrances behind the host's cover.
    void (async () => {
      await tick();
      await Promise.allSettled(
        [...stack.querySelectorAll("img")].map((image) => image.decode())
      );
      await Promise.allSettled(
        stack
          .getAnimations({ subtree: true })
          .filter(
            (animation) => animation.effect?.getTiming().iterations !== Infinity
          )
          .map((animation) => animation.finished)
      );
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      );
      if (!cancelled) ready();
    })();
    return () => {
      cancelled = true;
    };
  });
  const containerRawWidth = $derived(sizingState.containerWidth);
  const containerRawHeight = $derived(sizingState.containerHeight);
  const suppressFlip = $derived(sizingState.flipSuppressed);

  // Download Card has a real preview frame while the canvas compositor does
  // not. Publish the measured winner once per geometry change so the eventual
  // PNG uses these exact columns and start placement.
  let lastReportedAutoLayoutKey = "";
  $effect(() => {
    const report = onAutoLayoutResolved;
    if (!report) {
      lastReportedAutoLayoutKey = "";
      return;
    }
    const fit = layoutState.autoFit;
    // The callback must use the stable layout bounds, not the aspect-fitted
    // DOM box. Feeding that fitted box back into LiveExportCard's ratio makes
    // fractional chrome rounding continually resize its ResizeObserver.
    const measuredWidth = Math.round(sizingState.layoutContainerWidth);
    const measuredHeight = Math.round(
      getContainedCardHeight(measuredWidth, layoutState.containModel)
    );
    if (!(measuredWidth > 0 && measuredHeight > 0)) return;
    const key = fit
      ? `${sequence.steps.length}:${fit.cols}:${fit.rows}:${fit.startPlacement}:${fit.widthUnits ?? fit.cols}:${measuredWidth}x${measuredHeight}`
      : `${sequence.steps.length}:${effectiveColumns}:${effectiveRows}:${startPlacementLayout}:${showHeader ? 1 : 0}:${showFooter ? 1 : 0}:${measuredWidth}x${measuredHeight}`;
    if (key === lastReportedAutoLayoutKey) return;
    lastReportedAutoLayoutKey = key;
    report(
      fit ? { ...fit, stepCount: sequence.steps.length } : null,
      measuredWidth,
      measuredHeight
    );
  });

  // Filtered cells based on includeStartPlacement.
  const visibleCells = $derived.by(() => {
    if (includeStartPlacement) {
      return cells.filter((cell) => cell.index !== -1);
    }
    const cols = effectiveColumns || 4;
    return cells
      .filter((cell) => cell.index !== -1)
      .map((cell) => ({
        ...cell,
        gridColumn: (cell.index % cols) + 1,
        gridRow: Math.floor(cell.index / cols) + 1,
      }));
  });

  // When the grid structure changes (start-placement toggle inserts/removes a
  // row, column picker changes column count, layout row/column swap), skip the
  // flip animation so cells snap to their new positions while only the container
  // resize transition handles the visual smoothness. Without this, inserting the
  // start row makes the step rows FLIP-animate against the simultaneous container
  // resize at a different rate — rows overhang the start row and slide into place.
  $effect(() => {
    const cols = effectiveColumns;
    const rws = effectiveRows;
    const structureChanged =
      (prevEffectiveColumns > 0 && cols !== prevEffectiveColumns) ||
      (prevEffectiveRows > 0 && rws !== prevEffectiveRows);
    if (structureChanged) {
      sizingState.suppressFlipFor(300);
    }
    prevEffectiveColumns = cols;
    prevEffectiveRows = rws;
  });

  // Buugeng chirality is read from settings here rather than taken as a prop,
  // for the same reason PropSvg and the 2D animation canvas read it directly:
  // it is a global handedness preference, not a per-host override. Hosts that
  // override leftPropType/rightPropType are unaffected; chirality only applies
  // to buugeng-family props.
  const leftBuugengFlipped = $derived(
    visibilityOverrides?.leftBuugengFlipped ??
      getSettings().leftBuugengFlipped ??
      false
  );
  const rightBuugengFlipped = $derived(
    visibilityOverrides?.rightBuugengFlipped ??
      getSettings().rightBuugengFlipped ??
      false
  );

  /**
   * Build render options from current component state (delegates to extracted pure function)
   */
  function buildRenderOptionsFn(): PreviewCellRenderOptions {
    const baseOptions = buildRenderOptions({
      cellSize: CELL_SIZE,
      leftPropType,
      rightPropType,
      catDogModeEnabled,
      leftBuugengFlipped,
      rightBuugengFlipped,
      showNonRadial,
      showGrid,
      handPointVis,
      showTKA,
      showReversals,
      showTnD,
      showElemental,
      showPropTnD,
      showPlacements,
      showHandColorKey,
      isSoloMode,
      handPathMode,
      browseViewMode,
      showLeftMotion,
      showRightMotion,
    });

    return {
      ...baseOptions,
      fanAppearance: cloudProbeEnabled
        ? undefined
        : (visibilityOverrides?.fanAppearance ?? getSettings().fanAppearance),
      primaryPropColors: effectivePrimaryPropColors,
      // The compositor renders canonical blue/red cards in two layers, placing
      // grid points over props. A genuinely custom palette uses its direct
      // renderer, where grid sits below props instead.
      ...(exportPresentation && {
        gridPointsOnTop: !snapshotPrimaryPropColors,
      }),
      // A scan represents the printed card, not the scanner's personal export
      // toggles. Pin the same canonical visibility used when QR creation
      // verifies cloud assets; retain the sequence's participating hands.
      ...(cloudProbeEnabled &&
        !handPathMode && {
          ...CANONICAL_CARD_VISIBILITY,
          showLeftMotion,
          showRightMotion,
        }),
      // Scan cards keep numbers as the existing HTML overlay. Re-compositing
      // every cached blob through canvas made a warm phone pay a full
      // decode→draw→encode cycle per cell before it could paint.
      showStepNumbers: cloudProbeEnabled ? false : showStepNumbers,
      // Cloud tier: only the scan-origin /sequence host sets this (via scan-card-cloud
      // context), so a cold scanner downloads pre-rendered cells instead of
      // rasterizing. Unset everywhere else => local render path, no extra latency.
      probeCloud: cloudProbeEnabled,
      // Hand-path records embed motion data; their cells can be rendered locally
      // without requiring the prop catalog's prepublished cloud assets.
      cloudOnly: cloudProbeEnabled && !handPathMode,
    };
  }

  let renderLifecycle: ReturnType<typeof createChoreoCardRenderLifecycle>;
  const renderEngine = createChoreoCardRenderEngine(
    renderModel,
    () => ({
      sequence,
      livePictographs: !cloudProbeEnabled,
      renderOptions: buildRenderOptionsFn(),
      leftPropType,
      rightPropType,
      browseViewMode,
      showStepNumbers,
      includeStartPlacement,
      startPlacementLayout,
      mandalaLayoutOverride,
      effectiveColumns,
      effectiveRows,
      useDurationLayout,
      layoutWidthUnits: layoutState.containModel.cols,
      columnCount,
      darkMode,
      showQRCode: effShowQRCode,
      cloudProbeEnabled,
      isBrowseSoloMode,
      isMotionSoloMode,
      getSoloLocationLabel,
      onRenderProgress,
      onRenderSettled: () => renderLifecycle.markRenderSettled(),
    }),
    sizingState,
    crossfader
  );

  renderLifecycle = createChoreoCardRenderLifecycle(
    () => ({
      handPathMode,
      fanAppearance: cloudProbeEnabled
        ? undefined
        : (visibilityOverrides?.fanAppearance ?? getSettings().fanAppearance),
      primaryPropColors: effectivePrimaryPropColors,
      sequence,
      leftPropType,
      rightPropType,
      browseViewMode,
      catDogModeEnabled,
      leftBuugengFlipped,
      rightBuugengFlipped,
      showStepNumbers,
      showNonRadial,
      handPointVis,
      showTKA,
      showReversals,
      showTnD,
      showElemental,
      showPropTnD,
      showPlacements,
      showHandColorKey,
      showGrid,
      showLeftMotion,
      showRightMotion,
      includeStartPlacement,
      startPlacementLayout,
      effectiveColumns,
      columnCount,
      darkMode,
      rerenderTrigger,
      flipSuppressed: sizingState.flipSuppressed,
    }),
    renderModel,
    renderEngine,
    crossfader,
    sizingState
  );
  const flipDuration = $derived(
    fixedCardAspectRatio !== null ? 0 : renderLifecycle.flipDuration
  );

  /**
   * For solo mode, extract the end location of the kept color's motion
   * for a given step, used as the cell's alt/aria label. The visible start→end
   * annotation is composed from getMotionSoloMotion in CellRenderer.
   * Falls back to step number if no motion data.
   */
  function getSoloLocationLabel(stepIndex: number): string {
    if (!isSoloMode || !sequence.steps) return String(stepIndex + 1);
    const step = sequence.steps[stepIndex];
    if (!step?.motions) return String(stepIndex + 1);
    const motion = soloHand === "left" ? step.motions.left : step.motions.right;
    if (!motion?.endLocation) return String(stepIndex + 1);
    // Capitalize location abbreviation: "n" → "N", "ne" → "NE"
    return motion.endLocation.toUpperCase();
  }

  /**
   * Look up the visible motion for a given cell in either solo mode. Motion-solo
   * keeps the toggled-on hand; browse-solo keeps browseViewMode's hand. Both
   * render the same start→end + turns annotation. cellIndex === -1 is the start
   * position. Returns undefined when not solo or data is missing.
   */
  function getMotionSoloMotion(
    cellIndex: number
  ):
    | import("$lib/shared/pictograph/shared/domain/models/motion-data").MotionData
    | undefined {
    const hand = isMotionSoloMode
      ? showLeftMotion
        ? HandSide.LEFT
        : HandSide.RIGHT
      : isBrowseSoloMode
        ? soloHand === "left"
          ? HandSide.LEFT
          : HandSide.RIGHT
        : undefined;
    if (!hand) return undefined;
    if (cellIndex === -1) {
      const startData =
        sequence.startPlacement ??
        (sequence.steps?.[0]
          ? createStartPlacementFromBeatStart(sequence.steps[0])
          : undefined);
      return startData?.motions?.[hand] ?? undefined;
    }
    return sequence.steps?.[cellIndex]?.motions?.[hand] ?? undefined;
  }

  // Fallback context menu (when no onContextMenu prop is wired): additive
  // Pictograph section (cells live-follow the visibility manager) + Card
  // section (Re-render for everyone, image actions for admins).
  let contextMenuState: ContextMenuState = $state({ open: false });

  const contextMenuItems = $derived.by(() => {
    void displayState.visibilityVersion;
    return composeMenu([
      {
        header: "Pictograph",
        entries: buildPictographContextMenuItems({
          visibilityManager: vm,
          // Card step numbers read ImageComposition.addStepNumbers, not the
          // visibility manager — the toggle would lie here.
          includeStepNumbers: false,
        }),
      },
      {
        header: "Card",
        entries: buildCardMenuSection({
          sequenceForLibrarySave: sequence,
          onRerender: () => void renderEngine.forceRerenderAllCells(),
          isAdmin: featureFlagService.isAdmin,
          sequenceForImageActions: sequence,
        }),
      },
    ]);
  });

  function handleContextMenu(e: MouseEvent) {
    e.preventDefault();
    displayState.refreshVisibility();
    contextMenuState = { open: true, x: e.clientX, y: e.clientY };
  }

  function closeContextMenu() {
    contextMenuState = { open: false };
  }

  // Auto-scroll to keep highlighted step visible during playback.
  // Uses manual scrollTop instead of scrollIntoView() because scrollIntoView
  // scrolls ALL ancestor scroll containers - on the landing page this causes
  // the entire page to jump to the top when the sequence loops.
  $effect(() => {
    const stepIdx = highlightedStepIndex;
    if (!needsScroll || !gridScrollRef || stepIdx == null) return;

    const cell = gridScrollRef.querySelector(
      ".pictograph-cell.current"
    ) as HTMLElement | null;
    if (cell) {
      const containerRect = gridScrollRef.getBoundingClientRect();
      const cellRect = cell.getBoundingClientRect();

      const cellTop =
        cellRect.top - containerRect.top + gridScrollRef.scrollTop;
      const cellBottom = cellTop + cellRect.height;

      const visibleTop = gridScrollRef.scrollTop;
      const visibleBottom = visibleTop + containerRect.height;

      if (cellTop < visibleTop) {
        gridScrollRef.scrollTo({ top: cellTop, behavior: "smooth" });
      } else if (cellBottom > visibleBottom) {
        gridScrollRef.scrollTo({
          top: cellBottom - containerRect.height,
          behavior: "smooth",
        });
      }
    }
  });

  onDestroy(() => {
    cancelLongPress();
    if (headerMotionTimer !== null) clearTimeout(headerMotionTimer);
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="choreo-card-root"
  class:dark-mode={activeDarkMode}
  class:scroll-mode={needsScroll}
  class:force-contain={forceContain}
  class:export-presentation={exportPresentation}
  data-contain-size-motion={containSizeMotion}
  data-contain-size-jump={sizingState.sizeJump ? "true" : undefined}
  data-header-motion={headerMotion ? "true" : undefined}
  aria-busy={isRefreshing ? "true" : undefined}
  data-layout-columns={effectiveColumns}
  data-layout-rows={effectiveRows}
  data-preview-aspect={previewAspectRatio}
  data-auto-layout-locked={autoLayoutOverride ? "true" : "false"}
  data-auto-layout-lock-columns={autoLayoutOverride?.cols ?? 0}
  data-auto-layout-lock-rows={autoLayoutOverride?.rows ?? 0}
  bind:this={containerElement}
  oncontextmenu={(e: MouseEvent) => {
    e.preventDefault();
    if (exportPresentation) return;
    if (longPressFired) {
      longPressFired = false;
      return;
    }
    if (onContextMenu) {
      onContextMenu(e.clientX, e.clientY);
      return;
    }
    handleContextMenu(e);
  }}
  onpointerdown={(e: PointerEvent) => {
    if (
      exportPresentation ||
      e.button !== 0 ||
      e.pointerType === "mouse" ||
      !onContextMenu
    )
      return;
    longPressFired = false;
    const x = e.clientX;
    const y = e.clientY;
    longPressOrigin = { x, y };
    longPressTimer = setTimeout(() => {
      longPressTimer = null;
      longPressOrigin = null;
      longPressFired = true;
      onContextMenu(x, y);
    }, 500);
  }}
  onpointermove={(e: PointerEvent) => {
    if (longPressOrigin) {
      const dx = e.clientX - longPressOrigin.x;
      const dy = e.clientY - longPressOrigin.y;
      if (dx * dx + dy * dy > 100) cancelLongPress();
    }
  }}
  onpointerup={() => cancelLongPress()}
  onpointercancel={() => cancelLongPress()}
>
  {#if !exportPresentation && isRefreshing && cells.length > 0}
    <!-- The card keeps showing its previous images while it regenerates, so
         without this a toggle looks like a dead control. Absolutely positioned
         and pointer-events:none — it can never move or block the card. -->
    <div
      class="card-refreshing"
      role="status"
      aria-label="Updating card preview"
    >
      <ProgressRing percent={-1} size={16} strokeWidth={2} />
      <span>Updating</span>
    </div>
  {/if}
  {#if isLoading && cells.length === 0}
    <div class="loading-placeholder">
      <ProgressRing percent={-1} size={32} strokeWidth={3} />
    </div>
  {:else if cells.length > 0}
    <div
      class="preview-stack"
      class:scroll-mode={needsScroll}
      class:has-frame={!!frameColors}
      class:has-card-aspect={fixedCardAspectRatio !== null}
      style={needsScroll
        ? ""
        : `width: ${containedWidth ? `${containedWidth}px` : "auto"}; height: ${containedHeight ? `${containedHeight}px` : "auto"};${!containedWidth || !containedHeight || cellWidth < 1 ? " visibility: hidden;" : ""}`}
      style:--card-frame-accent={frameColors?.accent}
      style:--card-frame-dark={frameColors?.dark}
      style:--fixed-grid-width={fixedCardAspectRatio !== null
        ? `${cellWidth * effectiveColumns}px`
        : undefined}
      style:--fixed-grid-height={fixedCardAspectRatio !== null
        ? `${cellWidth * effectiveRows}px`
        : undefined}
      bind:this={previewStackElement}
    >
      <!-- Header section -->
      <CardHeader
        {sequence}
        {showHeader}
        {isBrowseSoloMode}
        {soloHand}
        {browseViewMode}
        {customTitleText}
        showDifficultyLevel={effectiveShowDifficulty}
        {difficultyLevel}
        {currentLevelStyle}
        {wordVisible}
        {showLoopGlyph}
        {loopComponents}
        {loopRotationPeriod}
        {loopInversionPeriod}
        {loopReflectionAxis}
        {loopOverlayComponents}
        {scaledHeaderHeight}
        {badgeSize}
        {badgePadding}
        {badgeNumberFontSize}
        {wordTitleFontSize}
        {activeDarkMode}
        {exportPresentation}
      />

      <!-- Grid section with individual pictograph cells -->
      <CardGridLayout
        {sequence}
        {exportPresentation}
        primaryPropColors={effectivePrimaryPropColors}
        {cells}
        {visibleCells}
        {effectiveColumns}
        {effectiveRows}
        {hasMixedDurations}
        {useDurationLayout}
        {durationRows}
        {durationColCount}
        {startPlacementLayout}
        {includeStartPlacement}
        {needsScroll}
        showHighlight={exportPresentation ? false : showHighlight}
        {highlightedStepIndex}
        showQRCode={effShowQRCode}
        {qrDataUrl}
        {qrPending}
        {qrGridPlacement}
        showMandala={effShowMandala}
        {mandalaPlacements}
        {flipDuration}
        {cellWidth}
        {activeDarkMode}
        {leftPropType}
        {rightPropType}
        onStepClick={exportPresentation ? undefined : onStepClick}
        onQrPlayClick={exportPresentation ? undefined : onQrPlayClick}
        clickableStart={exportPresentation ? false : clickableStart}
        onGridScrollRefChange={(el) => {
          gridScrollRef = el;
        }}
        {showStepNumbers}
        {posePicker}
        {crossfadeActive}
        transitionMode={crossfader.transitionMode}
        {isBrowseSoloMode}
        {isMotionSoloMode}
        {soloHand}
        {stepNumFontSize}
        {formatDuration}
        {getMotionSoloMotion}
        {formatSoloTurns}
        {shortOrientation}
        {mandalaPathShape}
      />

      <!-- Footer section -->
      <CardFooter
        {showFooter}
        showNotes={showNotes && handLegend === null}
        hasPathShapeMetadata={hasPathShapeMetadata && handLegend === null}
        {customNotesText}
        {scaledFooterHeight}
        {footerFontSize}
        {footerMargin}
        {activeDarkMode}
        {handLegend}
        {exportPresentation}
      />
    </div>
  {/if}
</div>

<ContextMenu
  menuState={contextMenuState}
  items={contextMenuItems}
  onClose={closeContextMenu}
/>

<style>
  .choreo-card-root {
    position: relative;
    /* Flexbox centering - child dimensions are calculated via JS */
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    min-height: 0;
    min-width: 0;
    overflow: hidden;
    box-sizing: border-box;
  }

  /* In scroll mode, the scroll container's own padding handles glow space.
     Fill the container edge-to-edge instead of centering with extra padding. */
  .choreo-card-root.scroll-mode {
    padding: 0;
    align-items: stretch;
    justify-content: stretch;
  }

  .choreo-card-root.force-contain {
    overflow: visible;
    /* Keep align-items: center (inherited from .choreo-card-root) so the
       content stays visually centered during the grid transition.
       flex-start was causing a 187px upward jump on the first frame. */
  }

  /* Downloads are a stable record of the current presentation. Viewer-only
     entrances, hover affordances, and selection animation would make it look
     different while the PNG is being prepared. */
  .choreo-card-root.export-presentation :global(*) {
    animation: none !important;
    transition: none !important;
  }

  .loading-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    background: var(--theme-card-bg);
  }

  /* Refresh pip. Absolute + pointer-events:none so it reserves no space and
     steals no clicks — the card behind it stays fully interactive. */
  .card-refreshing {
    position: absolute;
    top: 8px;
    right: 8px;
    z-index: 4;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border-radius: 999px;
    background: color-mix(
      in srgb,
      var(--theme-panel-bg, rgba(18, 18, 28, 0.96)) 88%,
      transparent
    );
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.75));
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    line-height: 1;
    pointer-events: none;
  }

  .preview-stack {
    display: flex;
    flex-direction: column;
    /* Dimensions are calculated via JS for true "contain" behavior.
       The container observer calculates optimal width/height that fills
       the available space while maintaining the content's aspect ratio. */
    /* Fallback to auto if JS hasn't calculated yet */
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .preview-stack.has-frame {
    box-sizing: border-box;
    padding: max(4px, 2%);
    background:
      linear-gradient(#f5f5f5 0 0) content-box,
      repeating-linear-gradient(
          135deg,
          var(--card-frame-accent) 0 0.45rem,
          var(--card-frame-dark) 0.45rem 0.9rem
        )
        padding-box;
  }

  .choreo-card-root.dark-mode .preview-stack.has-frame {
    background:
      linear-gradient(#000 0 0) content-box,
      repeating-linear-gradient(
          135deg,
          var(--card-frame-accent) 0 0.45rem,
          var(--card-frame-dark) 0.45rem 0.9rem
        )
        padding-box;
  }

  .preview-stack.has-card-aspect :global(.grid-section) {
    flex: 0 0 var(--fixed-grid-height);
    width: min(100%, var(--fixed-grid-width));
    align-self: center;
    margin-block: auto;
    grid-auto-rows: 1fr;
  }

  .preview-stack.has-card-aspect :global(.cell-flip-wrapper) {
    aspect-ratio: 1;
  }

  .preview-stack.has-card-aspect :global(.pictograph-cell) {
    height: 100%;
  }

  /* A header toggle: the stack resizes on the header's own fold clock
     (HEADER_MOTION_MS in CardHeader, same ease-out cubic) so the grid holds
     still while the header folds. The size-jump and pane-motion rules below
     take precedence when they apply. */
  .choreo-card-root[data-header-motion="true"] .preview-stack {
    transition:
      width 250ms cubic-bezier(0.33, 1, 0.68, 1),
      height 250ms cubic-bezier(0.33, 1, 0.68, 1);
  }

  /* The Card was never readable at its previous size, so there is nothing to
     animate from. Place it at the destination without a transition. */
  .choreo-card-root[data-contain-size-jump="true"] .preview-stack {
    transition: none;
  }

  .choreo-card-root[data-contain-size-motion="focus"] .preview-stack {
    transition:
      width var(--transition-dramatic),
      height var(--transition-dramatic);
  }

  .choreo-card-root[data-contain-size-motion="return"] .preview-stack {
    flex: 0 0 auto;
    transition:
      width var(--transition-emphasis),
      height var(--transition-emphasis);
  }

  .choreo-card-root[data-contain-size-motion="restore"] .preview-stack {
    flex: 0 0 auto;
    transition:
      width var(--transition-emphasis),
      height var(--transition-emphasis);
  }

  /* In scroll mode, fill the parent edge-to-edge instead of using
     JS-calculated contain dimensions */
  .preview-stack.scroll-mode {
    width: 100%;
    height: 100%;
    overflow: hidden;
  }

  /* Light mode needs stronger dimming since opacity against light bg is subtle.
     This rule targets child component elements from the parent context. */
  .choreo-card-root:not(.dark-mode) :global(.pictograph-cell.played) {
    opacity: 0.4;
  }

  /* Accessibility: Respect user's motion preferences (WCAG AAA) */
  @media (prefers-reduced-motion: reduce) {
    .preview-stack,
    .choreo-card-root[data-header-motion="true"] .preview-stack {
      transition: none;
    }
  }
</style>
