export type SceneControlTool =
  | "performer"
  | "formation"
  | "camera"
  | "scene"
  | "presets"
  | "dev";

/**
 * One rail entry a host contributes, for a surface the viewer itself has no
 * concept of. Deliberately not a `SceneControlTool`: the inspector's union
 * stays closed, and the host renders its own panel in the same column. The
 * Film Director's capability panel is the first, because what it edits — the
 * film document — exists in no other host.
 */
export interface SceneControlHostTool {
  id: string;
  label: string;
  icon: string;
}

export type SceneControlPresentation = "compact" | "overlay" | "docked";

export interface SceneControlLayout {
  presentation: SceneControlPresentation;
  panelWidth: number;
  reservedWidth: number;
}

const COMPACT_WIDTH = 768;
const COMPACT_HEIGHT = 544;
const COMPACT_LANDSCAPE_WIDTH = 1100;
const CRITICALLY_SHALLOW_HEIGHT = 500;
const PANEL_MIN_WIDTH = 520;
const PANEL_MAX_WIDTH = 1100;
const PANEL_WIDTH_FRACTION = 0.32;
const RAIL_AND_SEAM_WIDTH = 92;
/** What a short window's second rail column adds (one button and its gap). */
export const RAIL_SECOND_COLUMN_WIDTH = 56;
/** A panel in its own column gives up width before the stage drops below this. */
const COMFORTABLE_STAGE_WIDTH = 480;
/** The narrowest a panel in its own column gets. */
const DOCKED_PANEL_FLOOR_WIDTH = 360;
/** A stage narrower than this cannot show a performer, so the panel floats. */
const MIN_USABLE_STAGE_WIDTH = 300;
/** An upright phone. The camera never frames a stage as narrower than this. */
const NARROWEST_FRAMING_ASPECT = 9 / 16;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function sceneInspectorPanelWidth(workspaceWidth: number): number {
  if (!Number.isFinite(workspaceWidth) || workspaceWidth <= 0) {
    return PANEL_MIN_WIDTH;
  }

  return Math.round(
    clamp(
      workspaceWidth * PANEL_WIDTH_FRACTION,
      PANEL_MIN_WIDTH,
      PANEL_MAX_WIDTH
    )
  );
}

/**
 * The width of a panel that takes its own column beside the stage, or null
 * when no column fits.
 *
 * A panel drawn over the stage hides the performer it edits: on a half-width
 * desktop window the full panel covers more than half of the scene. So the
 * column narrows first, down to its floor, to leave the performer a stage to
 * stand in. Only when even that leaves no usable stage does the panel float.
 */
function dockedPanelWidth(
  workspaceWidth: number,
  railAndSeam: number
): number | null {
  const roomBesideStage =
    workspaceWidth - railAndSeam - COMFORTABLE_STAGE_WIDTH;
  const width = Math.max(
    DOCKED_PANEL_FLOOR_WIDTH,
    Math.min(sceneInspectorPanelWidth(workspaceWidth), roomBesideStage)
  );
  const stageWidth = workspaceWidth - width - railAndSeam;
  return stageWidth >= MIN_USABLE_STAGE_WIDTH ? width : null;
}

/**
 * The shape the camera frames the cast for, given the stage a panel leaves.
 *
 * Fitting a tall sliver exactly backs the camera so far out that the cast is
 * small and the venue's front edge rises into the picture. Below an upright
 * phone's shape the fit stops following the stage: the cast keeps its size and
 * gives up the empty margin at its sides instead.
 */
export function sceneStageFramingAspect(
  stageWidth: number,
  stageHeight: number
): number {
  const aspect = stageWidth / stageHeight;
  if (!Number.isFinite(aspect) || aspect <= 0) return 1;
  return Math.max(NARROWEST_FRAMING_ASPECT, aspect);
}

/** What the camera frames when a docked panel resizes the stage. */
export type SceneStageSubject = "cast" | "bodies";

/**
 * The stage frames the whole cast, prop reach included, except while the
 * docked panel is choosing a character: the body is then what is being judged,
 * so it stands as large as the stage allows. A phone sheet or a floating panel
 * covers the stage instead of resizing it, and the view stays where it is.
 */
export function sceneStageSubject(
  dockIsOpen: boolean,
  activeTool: SceneControlTool | null,
  performerTab: string
): SceneStageSubject {
  return dockIsOpen && activeTool === "performer" && performerTab === "character"
    ? "bodies"
    : "cast";
}

/** Bars drawn over the stage's top and bottom edges, as shares of its height. */
export interface StageBars {
  top: number;
  bottom: number;
}

/** A bar may claim this much of the stage at most; the picture keeps the rest. */
const MAX_STAGE_BAR_SHARE = 0.3;

/**
 * How much of the stage the bars over it cover: the performer bar (and its
 * hint) from the top, the transport's reserve from the bottom. The camera
 * keeps the bodies between them.
 */
export function stageBarShares(
  stageHeight: number,
  topBarBottomPx: number,
  bottomBarPx: number
): StageBars {
  if (!Number.isFinite(stageHeight) || stageHeight <= 0) {
    return { top: 0, bottom: 0 };
  }
  const share = (px: number): number =>
    Number.isFinite(px) && px > 0
      ? Math.min(px / stageHeight, MAX_STAGE_BAR_SHARE)
      : 0;
  return { top: share(topBarBottomPx), bottom: share(bottomBarPx) };
}

export function resolveSceneControlLayout(
  workspaceWidth: number,
  workspaceHeight: number,
  inspectorOpen: boolean,
  inspectorUsesDock = inspectorOpen,
  railExtraWidth = 0
): SceneControlLayout {
  const railAndSeam = RAIL_AND_SEAM_WIDTH + railExtraWidth;
  const panelWidth = sceneInspectorPanelWidth(workspaceWidth);

  if (
    workspaceWidth > 0 &&
    workspaceHeight > 0 &&
    (workspaceHeight <= CRITICALLY_SHALLOW_HEIGHT ||
      workspaceWidth < COMPACT_WIDTH ||
      (workspaceWidth < COMPACT_LANDSCAPE_WIDTH &&
        workspaceHeight < COMPACT_HEIGHT))
  ) {
    return { presentation: "compact", panelWidth, reservedWidth: 0 };
  }

  const dockedWidth = dockedPanelWidth(workspaceWidth, railAndSeam);

  if (dockedWidth === null) {
    return { presentation: "overlay", panelWidth, reservedWidth: 0 };
  }

  // Short editors should float over the stage. Reserving their entire column
  // would leave a large dead rectangle below a few rows of controls.
  if (inspectorOpen && !inspectorUsesDock) {
    return { presentation: "overlay", panelWidth, reservedWidth: 0 };
  }

  return {
    presentation: "docked",
    panelWidth: dockedWidth,
    reservedWidth: inspectorOpen ? dockedWidth + railAndSeam : 0,
  };
}
