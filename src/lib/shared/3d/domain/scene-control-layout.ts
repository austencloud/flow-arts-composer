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
const DOCK_MIN_WIDTH = 1680;
const PANEL_MIN_WIDTH = 520;
const PANEL_MAX_WIDTH = 1100;
const PANEL_WIDTH_FRACTION = 0.32;
const RAIL_AND_SEAM_WIDTH = 92;
/** What a short window's second rail column adds (one button and its gap). */
export const RAIL_SECOND_COLUMN_WIDTH = 56;
const MIN_DOCKED_STAGE_WIDTH = 960;

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

  const dockFits =
    workspaceWidth >= DOCK_MIN_WIDTH &&
    workspaceWidth - panelWidth - railAndSeam >= MIN_DOCKED_STAGE_WIDTH;

  if (!dockFits) {
    return { presentation: "overlay", panelWidth, reservedWidth: 0 };
  }

  // Short editors should float over the stage. Reserving their entire column
  // would leave a large dead rectangle below a few rows of controls.
  if (inspectorOpen && !inspectorUsesDock) {
    return { presentation: "overlay", panelWidth, reservedWidth: 0 };
  }

  return {
    presentation: "docked",
    panelWidth,
    reservedWidth: inspectorOpen ? panelWidth + railAndSeam : 0,
  };
}
