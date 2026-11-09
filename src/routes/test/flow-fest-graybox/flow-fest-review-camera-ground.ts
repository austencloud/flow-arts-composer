/**
 * Puts a shared-viewpoint arrival on its feet.
 *
 * A review camera places the walking body at the camera's own height, which is
 * right for a frame copied while walking (the eye was already at standing
 * height) and wrong for one taken from above: the body appears in the sky and
 * falls onto the field. Austen, 2026-11-07: "every time I click on one of these
 * links, I'm flying up in the air, falling towards the ground... It doesn't
 * make any sense."
 *
 * So a camera that asks to stand on the ground keeps its spot on the map and
 * its heading, but the body goes to the terrain under it and the view is
 * re-aimed from that standing eye at the point the link was looking at. A body
 * a little above the terrain is left alone, because that is someone standing
 * on a deck or a stage when they copied the link.
 */

/** How far above the terrain a body may start and still count as standing. */
export const STANDING_TOLERANCE_METERS = 3;

/**
 * Steepest standing look, up or down. A link aimed straight down from the sky
 * would otherwise arrive staring at the grass between the player's feet.
 */
export const STANDING_PITCH_LIMIT_RADIANS = 0.6;

export interface ReviewArrivalInput {
  /** Body centre the camera alone would place. */
  body: { x: number; y: number; z: number };
  /** Body centre when standing on the terrain at the same x, z. */
  groundBodyY: number;
  /** How far the camera eye sits above the body centre. */
  eyeAboveBody: number;
  /** Camera eye position, as the link carried it. */
  cameraWorld: [number, number, number];
  /** Where the link was looking. */
  targetWorld: [number, number, number];
  /** Pitch the link carried. Positive looks down. */
  pitch: number;
}

export function standReviewArrivalOnGround(input: ReviewArrivalInput): {
  body: { x: number; y: number; z: number };
  pitch: number;
} {
  const heightAboveGround = input.body.y - input.groundBodyY;
  if (
    heightAboveGround >= 0 &&
    heightAboveGround <= STANDING_TOLERANCE_METERS
  ) {
    return { body: input.body, pitch: input.pitch };
  }
  const body = { ...input.body, y: input.groundBodyY };
  const eyeY = body.y + input.eyeAboveBody;
  const horizontal = Math.hypot(
    input.targetWorld[0] - input.cameraWorld[0],
    input.targetWorld[2] - input.cameraWorld[2]
  );
  const aimed = Math.atan2(eyeY - input.targetWorld[1], horizontal);
  const pitch = Math.max(
    -STANDING_PITCH_LIMIT_RADIANS,
    Math.min(STANDING_PITCH_LIMIT_RADIANS, aimed)
  );
  return { body, pitch };
}
