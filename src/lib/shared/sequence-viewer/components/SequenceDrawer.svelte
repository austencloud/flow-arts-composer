<!--
  SequenceDrawer.svelte

  Unified drawer for viewing sequences in both browse and edit modes.

  Features:
  - Drawer UI with proper placement (bottom on mobile, right on desktop)
  - AnimationExportContext for edit mode
  - Consistent styling across modes
  - Respects layout mode for Create module integration

  Usage:
    <SequenceDrawer
      isOpen={true}
      sequence={sequence}
      mode="browse"
      isMobile={isMobile}
      ...props
    />
-->
<script lang="ts">
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { CollaborativeVideo } from "$lib/shared/video-collaboration/domain/collaborative-video";
  import type { MediaType, MediaFormat, ExportSettings } from "../domain/types";
  import type { VideoExportProgress } from "$lib/shared/compose/domain/video-export-types";
  import Drawer from "$lib/shared/foundation/ui/Drawer.svelte";
  import SequencePanel, { type PanelMode, type CreatorInfo } from "./SequencePanel.svelte";
  import { setAnimationExportContext } from "$lib/shared/export-panel/context/animation-export-context.svelte";

  let {
    // Drawer props
    isOpen = false,
    isMobile = false,
    drawerWidth = "min(600px, 90vw)",
    isNavVisible = true,
    respectLayoutMode = false,

    // SequencePanel props
    sequence,
    mode = "browse" as PanelMode,
    variations = [] as SequenceData[],
    variationIndex = 0,
    creatorInfo = null as CreatorInfo | null,
    isOwned = false,
    isFavorite = false,

    // Edit mode props
    initialMediaType = "image" as MediaType,
    showVisibilitySettings = false,
    isExporting = false,
    exportProgress = null as VideoExportProgress | null,
    selectedFormat = "animation" as "animation" | "static" | "performance",

    // Animation context props (edit mode only)
    animationSequenceData = null as SequenceData | null,
    isAnimationPlaying = false,
    animationCurrentBeat = 0,
    animationSpeed = 1,
    animationLeftPropState = null as any,
    animationRightPropState = null as any,
    isCircular = false,
    exportLoopCount = 1,
    isAnimationExporting = false,
    animationExportProgress = null as VideoExportProgress | null,
    animationServicesReady = false,
    animationLoading = false,
    playbackMode = "continuous" as "continuous" | "step",
    stepPlaybackPauseMs = 300,
    stepPlaybackStepSize = 1 as 1 | 0.5,
    leftMotionVisible = true,
    rightMotionVisible = true,
    isSideBySideLayout = false,

    // Callbacks
    onClose,
    onOpenChange,
    onVariationSelect,
    onFavorite,
    onFork,
    onEdit,
    onDelete,
    onInviteCollaborators,
    onAction,
    onExport,
    onSaveToLibrary,
    onFormatChange,
    onCancelExport,

    // Animation callbacks (edit mode only)
    onPlaybackToggle,
    onSpeedChange,
    onStepHalfBeatForward,
    onStepHalfBeatBackward,
    onStepFullBeatForward,
    onStepFullBeatBackward,
    onLoopCountChange,
    onCanvasReady,
    onExportVideo,
    onPlaybackModeChange,
    onStepPlaybackPauseMsChange,
    onStepPlaybackStepSizeChange,
    onToggleLeft,
    onToggleRight,
  }: {
    // Drawer props
    isOpen?: boolean;
    isMobile?: boolean;
    drawerWidth?: string;
    isNavVisible?: boolean;
    respectLayoutMode?: boolean;

    // SequencePanel props
    sequence: SequenceData;
    mode?: PanelMode;
    variations?: SequenceData[];
    variationIndex?: number;
    creatorInfo?: CreatorInfo | null;
    isOwned?: boolean;
    isFavorite?: boolean;

    // Edit mode props
    initialMediaType?: MediaType;
    showVisibilitySettings?: boolean;
    isExporting?: boolean;
    exportProgress?: VideoExportProgress | null;
    selectedFormat?: "animation" | "static" | "performance";

    // Animation context props
    animationSequenceData?: SequenceData | null;
    isAnimationPlaying?: boolean;
    animationCurrentBeat?: number;
    animationSpeed?: number;
    animationLeftPropState?: any;
    animationRightPropState?: any;
    isCircular?: boolean;
    exportLoopCount?: number;
    isAnimationExporting?: boolean;
    animationExportProgress?: VideoExportProgress | null;
    animationServicesReady?: boolean;
    animationLoading?: boolean;
    playbackMode?: "continuous" | "step";
    stepPlaybackPauseMs?: number;
    stepPlaybackStepSize?: 1 | 0.5;
    leftMotionVisible?: boolean;
    rightMotionVisible?: boolean;
    isSideBySideLayout?: boolean;

    // Callbacks
    onClose?: () => void;
    onOpenChange?: (open: boolean) => void;
    onVariationSelect?: (index: number, sequence: SequenceData) => void;
    onFavorite?: () => void;
    onFork?: () => void;
    onEdit?: () => void;
    onDelete?: () => void;
    onInviteCollaborators?: (video: CollaborativeVideo) => void;
    onAction?: (action: string, sequence: SequenceData) => void;
    onExport?: (format: MediaFormat, settings: ExportSettings) => void;
    onSaveToLibrary?: () => void;
    onFormatChange?: (format: "animation" | "static" | "performance") => void;
    onCancelExport?: () => void;

    // Animation callbacks
    onPlaybackToggle?: () => void;
    onSpeedChange?: (speed: number) => void;
    onStepHalfBeatForward?: () => void;
    onStepHalfBeatBackward?: () => void;
    onStepFullBeatForward?: () => void;
    onStepFullBeatBackward?: () => void;
    onLoopCountChange?: (count: number) => void;
    onCanvasReady?: (canvas: HTMLCanvasElement | null) => void;
    onExportVideo?: () => void;
    onPlaybackModeChange?: (mode: "continuous" | "step") => void;
    onStepPlaybackPauseMsChange?: (ms: number) => void;
    onStepPlaybackStepSizeChange?: (size: 1 | 0.5) => void;
    onToggleLeft?: () => void;
    onToggleRight?: () => void;
  } = $props();

  // IMPORTANT: setContext must be called during component initialization, not in effects.
  // Child components (AnimationPlayer) read context on mount, so it must exist immediately.
  // Using getters allows the context to return current reactive prop values when accessed.
  // Capture mode once: setContext requires synchronous init, mode won't change at runtime.
  // Read via getter to avoid state_referenced_locally warning.
  const getMode = () => mode;
  if (getMode() === "edit") {
    setAnimationExportContext({
      state: {
        get sequenceData() { return animationSequenceData; },
        get isPlaying() { return isAnimationPlaying; },
        get currentStep() { return animationCurrentBeat; },
        get speed() { return animationSpeed; },
        get leftPropState() { return animationLeftPropState; },
        get rightPropState() { return animationRightPropState; },
        get isCircular() { return isCircular; },
        get exportLoopCount() { return exportLoopCount; },
        get isExporting() { return isAnimationExporting; },
        get exportProgress() { return animationExportProgress; },
        get servicesReady() { return animationServicesReady; },
        get loading() { return animationLoading; },
        get playbackMode() { return playbackMode; },
        get stepPlaybackPauseMs() { return stepPlaybackPauseMs; },
        get stepPlaybackStepSize() { return stepPlaybackStepSize; },
        get leftMotionVisible() { return leftMotionVisible; },
        get rightMotionVisible() { return rightMotionVisible; },
        get isSideBySideLayout() { return isSideBySideLayout; },
        get selectedFormat() { return selectedFormat; },
      },
      actions: {
        onPlaybackToggle: () => onPlaybackToggle?.(),
        onSpeedChange: (speed: number) => onSpeedChange?.(speed),
        onStepHalfBeatForward: () => onStepHalfBeatForward?.(),
        onStepHalfBeatBackward: () => onStepHalfBeatBackward?.(),
        onStepFullBeatForward: () => onStepFullBeatForward?.(),
        onStepFullBeatBackward: () => onStepFullBeatBackward?.(),
        onLoopCountChange: (count: number) => onLoopCountChange?.(count),
        onCanvasReady: (canvas: HTMLCanvasElement | null) => onCanvasReady?.(canvas),
        onCancelExport: () => onCancelExport?.(),
        onExportVideo: () => onExportVideo?.(),
        onPlaybackModeChange: (m: "continuous" | "step") => onPlaybackModeChange?.(m),
        onStepPlaybackPauseMsChange: (ms: number) => onStepPlaybackPauseMsChange?.(ms),
        onStepPlaybackStepSizeChange: (size: 1 | 0.5) => onStepPlaybackStepSizeChange?.(size),
        onToggleLeft: () => onToggleLeft?.(),
        onToggleRight: () => onToggleRight?.(),
        onFormatChange: (format: "animation" | "static" | "performance") => onFormatChange?.(format),
      },
    });
  }

  function handleOpenChange(open: boolean) {
    if (!open && isOpen) {
      onClose?.();
    }
    onOpenChange?.(open);
  }

  // Single unified drawer class for all modes
  const drawerClass = "sequence-panel-drawer";
</script>

<div
  style:--sheet-width={respectLayoutMode ? undefined : drawerWidth}
  style:--drawer-width={respectLayoutMode ? undefined : drawerWidth}
  class:nav-visible={isMobile && isNavVisible}
>
  <Drawer
    {isOpen}
    placement={isMobile ? "bottom" : "right"}
    {respectLayoutMode}
    class="{drawerClass} {isMobile && isNavVisible ? 'with-nav-offset' : ''}"
    showHandle={false}
    closeOnBackdrop={false}
    backdropClass={!isMobile ? "transparent-backdrop" : isMobile && isNavVisible ? "nav-offset-backdrop" : ""}
    trapFocus={isMobile && !isNavVisible}
    focusContainerOnOpen
    setInertOnSiblings={isMobile && !isNavVisible}
    onOpenChange={handleOpenChange}
  >
    {#if sequence}
      <div class="drawer-content-wrapper">
        <SequencePanel
          {sequence}
          {mode}
          {variations}
          {variationIndex}
          {creatorInfo}
          {isOwned}
          {isFavorite}
          {initialMediaType}
          {showVisibilitySettings}
          {isExporting}
          {exportProgress}
          {selectedFormat}
          onClose={onClose}
          {onVariationSelect}
          {onFavorite}
          {onFork}
          {onEdit}
          {onDelete}
          {onInviteCollaborators}
          {onAction}
          {onExport}
          {onSaveToLibrary}
          {onFormatChange}
          {onCancelExport}
        />
      </div>
    {/if}
  </Drawer>
</div>

<style>
  .drawer-content-wrapper {
    position: absolute;
    inset: 0;
    overflow-y: auto;
    overflow-x: hidden;
  }

  /* Desktop right drawer styling (without side-by-side layout).
     Routed through Drawer.css --sheet-* API; top/height dropped as redundant
     (match the right-placement defaults). */
  :global(.sequence-panel-drawer.drawer-content[data-placement="right"]:not(.side-by-side-layout)) {
    --sheet-width: var(--drawer-width, min(600px, 90vw));
    --sheet-transition:
      transform 350ms cubic-bezier(0.32, 0.72, 0, 1),
      opacity 350ms cubic-bezier(0.32, 0.72, 0, 1),
      width 300ms cubic-bezier(0.4, 0, 0.2, 1);
    --sheet-bg: color-mix(in srgb, var(--theme-panel-bg) 70%, transparent);
    --sheet-filter: blur(20px);
    --sheet-border: none;
    --sheet-radius-large: 0;
  }

  /* Desktop right drawer with side-by-side layout - use tracked panel dimensions */
  :global(.sequence-panel-drawer.drawer-content[data-placement="right"].side-by-side-layout) {
    --sheet-bg: color-mix(in srgb, var(--theme-panel-bg) 70%, transparent);
    --sheet-filter: blur(20px);
    --sheet-border: none;
    --sheet-radius-large: 0;
    /* Let Drawer.css handle positioning via --create-panel-* variables */
  }

  /* Subtle vertical grip indicator on left edge */
  :global(.sequence-panel-drawer.drawer-content[data-placement="right"]::before) {
    content: "";
    position: absolute;
    left: 8px;
    top: 50%;
    transform: translateY(-50%);
    width: 4px;
    height: var(--min-touch-target, 48px);
    background: linear-gradient(
      to bottom,
      transparent 0%,
      var(--theme-stroke-strong) 10%,
      var(--theme-stroke-strong) 90%,
      transparent 100%
    );
    border-radius: 2px;
    opacity: 0.6;
    transition: opacity var(--duration-normal) ease;
  }

  :global(.sequence-panel-drawer.drawer-content[data-placement="right"]:hover::before) {
    opacity: 1;
  }

  /* Transparent backdrop for desktop. backdrop-filter:none dropped (overlay has
     no backdrop-filter by default); background/pointer-events via --sheet-* API. */
  :global(.drawer-overlay.transparent-backdrop) {
    --sheet-backdrop-bg: transparent;
    --sheet-backdrop-pointer-events: none;
  }

  /* Mobile full-height bottom sheet. height:100dvh overrides the bottom-sheet
     min-height:50vh default to force a full-height sheet; corners via --sheet-*. */
  :global(.sequence-panel-drawer.drawer-content[data-placement="bottom"]) {
    --sheet-max-height: 100dvh;
    --sheet-border-radius-top-left: 16px;
    --sheet-border-radius-top-right: 16px;
    height: 100vh;
    height: 100dvh;
  }

  /* Mobile: Offset when bottom navigation visible. max-height via --sheet-*;
     bottom/height have no --sheet-* var and out-specify Drawer.css base. */
  :global(.sequence-panel-drawer.with-nav-offset.drawer-content[data-placement="bottom"]) {
    --sheet-max-height: calc(100dvh - var(--primary-nav-height, 64px));
    bottom: var(--primary-nav-height, 64px);
    height: calc(100vh - var(--primary-nav-height, 64px));
    height: calc(100dvh - var(--primary-nav-height, 64px));
  }

  /* Mobile: Offset backdrop for nav clicks. No --sheet-* var for inset
     positioning; consumer selector out-specifies Drawer.css .drawer-overlay. */
  :global(.drawer-overlay.nav-offset-backdrop) {
    inset: unset;
    top: 0;
    left: 0;
    right: 0;
    bottom: var(--primary-nav-height, 64px);
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    :global(.sequence-panel-drawer.drawer-content) {
      --sheet-transition: none;
    }
  }
</style>
