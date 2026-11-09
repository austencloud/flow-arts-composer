import { BackgroundType } from "@austencloud/backgrounds";
import { STAGE } from "@austencloud/scene-3d/worker";

export interface StageCoordinateFrame {
  performerAnchorY: number;
  nativeSurfaceY: number;
  environmentYOffset: number;
}

/**
 * Performer rigs live in one world frame. Environments move to meet this
 * anchor, so changing the scenery cannot move a performance that is already
 * playing.
 */
export const CANONICAL_PERFORMER_ANCHOR_Y = STAGE.STAGE_DECK_HEIGHT;

/**
 * Height of the surface that currently supports the performer in each scene's
 * authored local coordinates. These values used to move the performer itself.
 */
export function getNativeStageSurfaceY(
  backgroundType: BackgroundType,
  stageEnabled: boolean
): number {
  switch (backgroundType) {
    // Every scene that renders the canonical <Stage3D> belongs on this branch.
    // Its native performer surface is the deck top, not the terrain underneath
    // it. Declaring the terrain, or an older platform height, offsets the whole
    // scene by the difference and leaves the performer's feet in the planks.
    case BackgroundType.FOREST:
    case BackgroundType.AUTUMN:
    case BackgroundType.BLOSSOM:
      return STAGE.STAGE_DECK_HEIGHT;
    case BackgroundType.COSMIC:
      return 0.4;
    case BackgroundType.WINTER:
      return 0.45;
    case BackgroundType.OCEAN:
      return stageEnabled ? 2.5 : 1.5;
    case BackgroundType.EMBER:
      return 0.5;
    case BackgroundType.PRIDE:
      return 0.4;
    case BackgroundType.CELESTIAL:
      // Olive Cloudbreak owns a raised dry terrace. Moving the environment by
      // this authored surface height keeps every performer's feet on its top.
      return 0.225;
    case BackgroundType.VOID:
      return 0.35;
    default:
      return 0;
  }
}

export function getStageCoordinateFrame(
  backgroundType: BackgroundType,
  stageEnabled: boolean
): StageCoordinateFrame {
  return stageCoordinateFrameForSurface(
    getNativeStageSurfaceY(backgroundType, stageEnabled)
  );
}

/** The frame for a scene whose performer surface sits at `nativeSurfaceY`. */
export function stageCoordinateFrameForSurface(
  nativeSurfaceY: number
): StageCoordinateFrame {
  return {
    performerAnchorY: CANONICAL_PERFORMER_ANCHOR_Y,
    nativeSurfaceY,
    environmentYOffset: CANONICAL_PERFORMER_ANCHOR_Y - nativeSurfaceY,
  };
}

export function isRenderable3DEnvironment(
  backgroundType: BackgroundType
): boolean {
  switch (backgroundType) {
    case BackgroundType.FOREST:
    case BackgroundType.AUTUMN:
    case BackgroundType.COSMIC:
    case BackgroundType.WINTER:
    case BackgroundType.OCEAN:
    case BackgroundType.EMBER:
    case BackgroundType.BLOSSOM:
    case BackgroundType.PRIDE:
    case BackgroundType.CELESTIAL:
    case BackgroundType.VOID:
      return true;
    default:
      return false;
  }
}
