import type {
  PlaybackMode,
  StepPlaybackStepSize,
} from "#lib/shared/animation-engine/state/animation-panel-state.svelte.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import type { FanAppearance } from "#lib/shared/pictograph/prop/domain/fan-appearance.js";
import type { ViewerPlaybackState } from "../../domain/viewer-prop-groups";
import type { MandalaViewerController } from "../../state/mandala-viewer-controller.svelte";
import type { TunnelViewController } from "../../tunnel/tunnel-view-controller.svelte";

export type ArtType = "mandala" | "tunnel";
export type ArtSettingValue = string | number | boolean | null;
export type ArtSettingChangeHandler = (
  group: string,
  setting: string,
  previousValue: ArtSettingValue,
  value: ArtSettingValue,
  coalesce?: boolean,
  source?: string
) => void;

export interface ArtSettingsPanelProps {
  /**
   * Optional because the panel steers controllers, not the sequence — hosts
   * without a viewer transport (Post Studio's inspector) have no playback
   * object to hand it, and inventing one for a field nothing reads is worse
   * than leaving it out.
   */
  sequence?: SequenceData;
  playback?: ViewerPlaybackState;
  controller: TunnelViewController;
  mandalaController: MandalaViewerController;
  artType: ArtType;
  layout?: "sidebar" | "bottom";
  /** Renders the art on its own. Ignored when `showExport` is false. */
  onExport: () => void;
  /**
   * False where the art is one layer of something bigger and that bigger thing
   * owns the render — a mandala MP4 is not the post it sits in.
   */
  showExport?: boolean;
  /**
   * False where the host already names the panel directly above it. In the
   * viewer's sidebar the card's own label distinguishes it from its siblings;
   * in Post Studio the inspector heading says "Mandala" 40px higher, and the
   * card repeating it costs a band of the rail to say nothing.
   */
  showTitle?: boolean;
  onSaveTunnel?: () => void;
  saveTunnelLabel?: string;
  bpm?: number;
  playbackMode?: PlaybackMode;
  stepSize?: StepPlaybackStepSize;
  isPlaying?: boolean;
  onBpmChange?: (bpm: number) => void;
  onPlaybackModeChange?: (mode: PlaybackMode) => void;
  onStepSizeChange?: (size: StepPlaybackStepSize) => void;
  onPlaybackToggle?: () => void;
  leftPropType?: string | null;
  rightPropType?: string | null;
  onPropChange?: (propType: PropType) => void;
  fanAppearance?: FanAppearance;
  onFanAppearanceChange?: (appearance: FanAppearance) => void;
  onArtSettingChange?: ArtSettingChangeHandler;
  exporting?: boolean;
}
