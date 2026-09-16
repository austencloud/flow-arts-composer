import type { AnimationPanelState } from "$lib/shared/animation-engine/state/animation-panel-state.svelte";
import type { Letter } from "$lib/shared/foundation/domain/models/letter";
import type { StartPlacementData } from "$lib/shared/foundation/domain/models/start-placement-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import type { FanAppearance } from "$lib/shared/pictograph/prop/domain/fan-appearance";

export interface ViewerPlaybackState {
  animationState: AnimationPanelState;
  animationLoading: boolean;
  currentStep: number;
  isPlaying: boolean;
  currentLetter: Letter | null;
  currentStepData: StartPlacementData | StepData | null;
  highlightedStepIndex: number | null;
  /** Live AnimationPlaybackController handle, once the orchestrator has wired
   *  one. Optional — standalone hosts (e.g. the tunnel collection's detail
   *  preview) build this state without a controller. Used as the readiness
   *  signal for the auto-export intent (ArtPane). */
  getPlaybackController?: () => unknown;
}

export interface ImageCompositionProps {
  showWord: boolean;
  showStepNumbers: boolean;
  showDifficulty: boolean;
  showStartPos: boolean;
  showNotes: boolean;
  customNotesText: string;
  showQRCode: boolean;
  showMandala?: boolean;
  showLoopGlyph?: boolean;
  handPathMode?: boolean;
  darkMode: boolean;
  columnCount: number | null;
  forceContain: boolean;
}

export interface PropRenderingProps {
  leftPropType?: PropType;
  rightPropType?: PropType;
  catDogModeEnabled?: boolean;
  fanAppearance?: FanAppearance;
}

export interface ViewerLayoutState {
  isFullscreen: boolean;
  fullscreenStackVertical: boolean;
  isMobile: boolean;
  isLandscapeMobile?: boolean;
  focusedPane: "animation" | "image" | "video-upload" | null;
  /** When true, suppress pane close buttons (during export mode) */
  suppressCloseButton?: boolean;
}
