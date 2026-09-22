import type { ScanAnalyticsValue } from "$lib/shared/analytics/scan-analytics";
import { scanPropProperties } from "$lib/shared/analytics/scan-prop-attribution";
import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import type { ShareActionMenuItem } from "$lib/shared/share/domain/models/share-action-menu";
import type { TempoPracticeConfig } from "./tempo-practice-orchestrator";

const DEFAULT_RAIL_WIDTH = 180;
const MIN_RAIL_WIDTH = 72;
const MAX_RAIL_WIDTH = 300;
export const VIEWER_INSPECTOR_HANDLE_SIZE = 8;
export const VIEWER_STAGE_MIN_WIDTH = 600;

export type ViewerInspectorProfile =
  | "card"
  | "motion"
  | "art"
  | "performance"
  | "share";

const INSPECTOR_LAYOUTS: Record<
  ViewerInspectorProfile,
  { defaultWidth: number; minWidth: number; maxWidth: number }
> = {
  card: { defaultWidth: 480, minWidth: 420, maxWidth: 840 },
  motion: { defaultWidth: 560, minWidth: 520, maxWidth: 1200 },
  art: { defaultWidth: 480, minWidth: 440, maxWidth: 1000 },
  // Performances lists takes in a column beside a landscape video, so its
  // inspector is deliberately narrower than the effects inspector. The gap
  // between the two defaults is what makes the stage/inspector seam travel
  // when the viewer switches between Motion and Performances.
  performance: { defaultWidth: 400, minWidth: 360, maxWidth: 900 },
  // The share panel keeps the live stage and takes the inspector's place. It
  // is a row of actions over a recipient list (an avatar and a name each), so
  // the column is the narrowest of the set; the stage keeps whatever view the
  // rail has selected.
  share: { defaultWidth: 400, minWidth: 340, maxWidth: 720 },
};

export function viewerInspectorConstraints(profile: ViewerInspectorProfile): {
  minWidth: number;
  maxWidth: number;
} {
  const { minWidth, maxWidth } = INSPECTOR_LAYOUTS[profile];
  return { minWidth, maxWidth };
}

export function resolveExportSidebarMinWidth(
  persistedRailWidth: string | null,
  profile: ViewerInspectorProfile = "motion"
): number {
  let railWidth = DEFAULT_RAIL_WIDTH;
  if (persistedRailWidth) {
    const parsed = Number.parseInt(persistedRailWidth, 10);
    if (parsed >= MIN_RAIL_WIDTH && parsed <= MAX_RAIL_WIDTH) {
      railWidth = parsed;
    }
  }

  return (
    railWidth +
    INSPECTOR_LAYOUTS[profile].defaultWidth +
    VIEWER_INSPECTOR_HANDLE_SIZE +
    VIEWER_STAGE_MIN_WIDTH
  );
}

export function buildViewerShareActions(
  linkCopied: boolean
): ShareActionMenuItem[] {
  return [
    {
      id: "share-sequence",
      label: "Share Sequence…",
      icon: "fa-share-nodes",
      section: "share",
    },
    {
      id: "send-sequence",
      label: "Send in Flow Arts Composer",
      icon: "fa-paper-plane",
      section: "share",
    },
    {
      id: "copy-link",
      label: linkCopied ? "Copied" : "Copy Link",
      icon: linkCopied ? "fa-check" : "fa-link",
      section: "share",
      tone: linkCopied ? "success" : "default",
      closeOnSelect: false,
    },
  ];
}

export interface VideoExportAnalyticsInput {
  fps: number;
  loopCount: number;
  resolution: string | number;
  includeStartPlacement: boolean;
  includeEndHold: boolean;
  renderMode: string;
  playbackMode: string;
  leftPropType: PropType | undefined;
  rightPropType: PropType | undefined;
}

export function buildVideoExportAnalyticsConfig(
  input: VideoExportAnalyticsInput
): Record<string, ScanAnalyticsValue> {
  return {
    fps: input.fps,
    loop_count: input.loopCount,
    resolution: String(input.resolution),
    include_start_position: input.includeStartPlacement,
    include_end_hold: input.includeEndHold,
    render_mode: input.renderMode,
    playback_mode: input.playbackMode,
    ...scanPropProperties(input.leftPropType, input.rightPropType),
  };
}

export interface CardExportAnalyticsInput {
  stepCount: number;
  darkMode: boolean;
  includeStartPlacement: boolean;
  handPath: boolean;
  leftPropType: PropType | undefined;
  rightPropType: PropType | undefined;
}

export function buildCardExportAnalyticsConfig(
  input: CardExportAnalyticsInput
): Record<string, ScanAnalyticsValue> {
  return {
    step_count: input.stepCount,
    dark_mode: input.darkMode,
    include_start_position: input.includeStartPlacement,
    hand_path: input.handPath,
    ...scanPropProperties(input.leftPropType, input.rightPropType),
  };
}

export function buildPracticeConfigProperties(
  config: Partial<TempoPracticeConfig>
): Record<string, ScanAnalyticsValue> {
  return {
    start_bpm: config.startBpm ?? null,
    max_bpm: config.maxBpm ?? null,
    increment: config.increment ?? null,
    rounds_per_level: config.roundsPerLevel ?? null,
    target_enabled: config.targetEnabled ?? null,
    target_bpm: config.targetBpm ?? null,
  };
}
