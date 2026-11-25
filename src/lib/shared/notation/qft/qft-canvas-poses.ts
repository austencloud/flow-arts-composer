/**
 * QfT poses, in the shared animation canvas's terms.
 *
 * QfT measures everything in prop lengths: radius 1 puts the hand one poi
 * length from the body's centre, and the head is always one poi length from
 * the hand. The canvas measures a prop's position in hand-point units (150 of
 * its 950 viewBox) and draws the real poi sprite pivoted at the hand, with the
 * middle of its head CLUB_TIP_REACH along the sprite's +x axis.
 *
 * A poi's length runs to the far end of its head, not the middle of it. So one
 * prop length on the canvas is hand to head end, and a poi swung at radius 1
 * touches the body's centre with the end of its head (Austen, 2026-11-23).
 */
import { CLUB_TIP_REACH } from "#lib/shared/animation-engine/domain/types/prop-tip-points.js";
import type { PropState } from "#lib/shared/foundation/domain/types/prop-state.js";

/** The canvas's hand-point unit, in viewBox units (GRID_HALFWAY_POINT_OFFSET). */
export const CANVAS_HAND_UNIT = 150;

/** The canvas viewBox the notation overlay shares. */
export const CANVAS_VIEWBOX = 950;

/** The poi head's radius in the sprite, in viewBox units. */
export const POI_HEAD_RADIUS = 16.5;

/** One QfT prop length, in canvas viewBox units: hand to the head's far end. */
export const QFT_UNIT_IN_VIEWBOX = CLUB_TIP_REACH + POI_HEAD_RADIUS;

/** One QfT prop length, in PropState x/y units. */
export const QFT_TO_PROP_STATE = QFT_UNIT_IN_VIEWBOX / CANVAS_HAND_UNIT;

export interface QftPose {
  hand: { x: number; y: number };
  head: { x: number; y: number };
}

/**
 * The canvas pose for one QfT hand and its poi.
 *
 * QfT points are already in screen orientation (position 8 is up, y grows
 * down), which is the canvas's orientation too, so nothing flips.
 */
export function qftPropState(pose: QftPose): PropState {
  const x = pose.hand.x * QFT_TO_PROP_STATE;
  const y = pose.hand.y * QFT_TO_PROP_STATE;
  return {
    x,
    y,
    centerPathAngle: Math.atan2(y, x),
    staffRotationAngle: Math.atan2(
      pose.head.y - pose.hand.y,
      pose.head.x - pose.hand.x
    ),
  };
}
