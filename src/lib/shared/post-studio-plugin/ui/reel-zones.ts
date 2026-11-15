/**
 * Where a Reel's own parts sit on a 1080 by 1920 frame, in frame pixels.
 * Plain data so the picture and its test read the same numbers.
 *
 * Measured on one real phone, 2026-11-12 and 13: buttons, friendBubbles,
 * captionBlock.
 * Estimated, not measured: header.
 * From third-party size guides, not measured: feedWindow (what the home feed
 * keeps when it shows a Reel cropped to 4:5).
 * The phone's screen also crops about 38 px off each side (sideCrop).
 */
export interface Zone {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export const REEL_FRAME = { width: 1080, height: 1920 } as const;

export const REEL_ZONES = {
  header: { x0: 0, x1: 1080, y0: 0, y1: 140 },
  buttons: { x0: 915, x1: 1080, y0: 830, y1: 1750 },
  friendBubbles: { x0: 80, x1: 680, y0: 1370, y1: 1630 },
  captionBlock: { x0: 0, x1: 1080, y0: 1630, y1: 1920 },
  feedWindow: { x0: 0, x1: 1080, y0: 285, y1: 1635 },
} as const satisfies Record<string, Zone>;

export const REEL_SIDE_CROP = 38;
