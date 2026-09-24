/**
 * AUTO-WRITTEN by /test/prop-3d-studio/sprites. Do not edit by hand.
 *
 * Every prop whose 2D "3D model" look has a captured sprite pair under
 * static/images/props/appearances/model/<prop>-{blue,red}.svg. The box is the
 * same pictograph box PROP_DIMENSIONS already uses for that prop, so tip
 * points, trails, and mandala reach are unchanged by the look.
 */
export interface PropModelSpriteBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface PropModelSpriteEntry {
  readonly width: number;
  readonly height: number;
  /** Uniform scale (2D units per meter) that fit the 3D model into the box. */
  readonly fit: number;
  /** ISO timestamp of the capture that wrote the sprite pair. */
  readonly capturedAt: string;
  /**
   * Where the prop paints inside the grip-centred box, in box units. A
   * one-sided prop fills only half its box; picker tiles crop to this.
   */
  readonly bounds?: PropModelSpriteBounds;
}

export const PROP_MODEL_SPRITES: Readonly<
  Record<string, PropModelSpriteEntry>
> = {
  "bigbuugeng": { width: 600, height: 293.1, fit: 516.351, capturedAt: "2026-09-06T06:26:06.971Z", bounds: { x: 0, y: 35.7, width: 600, height: 221.5 } },
  "bigchicken": { width: 252.8, height: 44.4, fit: 251.44, capturedAt: "2026-09-06T06:26:14.374Z", bounds: { x: 20, y: 0, width: 217.3, height: 43.2 } },
  "bigclub": { width: 252, height: 65, fit: 178.774, capturedAt: "2026-09-06T06:26:00.822Z", bounds: { x: 0, y: 22.4, width: 130.2, height: 20.2 } },
  "bigcontactball": { width: 600, height: 300, fit: 2142.857, capturedAt: "2026-09-06T06:25:46.203Z", bounds: { x: 150, y: 0, width: 300, height: 300 } },
  "bigdoublecontactball": { width: 600, height: 300, fit: 1863.354, capturedAt: "2026-09-06T06:25:48.388Z", bounds: { x: 5.3, y: 0, width: 589.5, height: 300 } },
  "bigdoublestar": { width: 600, height: 300, fit: 418.134, capturedAt: "2026-09-06T06:25:42.021Z", bounds: { x: 0, y: 9.4, width: 600, height: 281.3 } },
  "bigeightrings": { width: 600, height: 309.5, fit: 459.71, capturedAt: "2026-09-06T06:25:44.174Z", bounds: { x: 12.3, y: 0, width: 575.4, height: 309.4 } },
  "bighoop": { width: 600, height: 300, fit: 456.024, capturedAt: "2026-09-18T07:42:01.380Z", bounds: { x: 1.2, y: 0, width: 305.9, height: 300 } },
  "bigstaff": { width: 600, height: 54.5, fit: 245.605, capturedAt: "2026-09-06T06:25:55.898Z", bounds: { x: 190.4, y: 0, width: 219.1, height: 54.5 } },
  "bigtorch": { width: 402, height: 57.3, fit: 280.185, capturedAt: "2026-09-06T06:25:51.572Z", bounds: { x: 0, y: 18.5, width: 206.1, height: 20.4 } },
  "bigtriad": { width: 600, height: 523.5, fit: 494.087, capturedAt: "2026-09-06T06:26:02.950Z", bounds: { x: 4.7, y: 1.2, width: 452.9, height: 520.9 } },
  "buugeng": { width: 262.6, height: 135.9, fit: 316.386, capturedAt: "2026-09-06T06:26:05.972Z", bounds: { x: 0, y: 19, width: 262.6, height: 98 } },
  "capsule_baton": { width: 252.8, height: 40, fit: 292.728, capturedAt: "2026-09-06T06:25:57.804Z", bounds: { x: 0, y: 14.8, width: 252.8, height: 10.4 } },
  "chicken": { width: 325, height: 30.3, fit: 284.973, capturedAt: "2026-09-06T06:26:13.250Z", bounds: { x: 22.9, y: 0, width: 148.5, height: 29.5 } },
  "club": { width: 258.67, height: 34.17, fit: 256.908, capturedAt: "2026-09-06T06:25:59.820Z", bounds: { x: 0, y: 6.8, width: 133.6, height: 20.5 } },
  "contactball": { width: 300, height: 150, fit: 1500, capturedAt: "2026-09-06T06:25:45.191Z", bounds: { x: 75, y: 0, width: 150, height: 150 } },
  "doublecontactball": { width: 300, height: 150, fit: 1304.348, capturedAt: "2026-09-06T06:25:47.308Z", bounds: { x: 2.6, y: 0, width: 294.7, height: 150 } },
  "doublestar": { width: 300, height: 150, fit: 292.693, capturedAt: "2026-09-06T06:25:40.921Z", bounds: { x: 0, y: 4.7, width: 300, height: 140.6 } },
  "eightrings": { width: 257.3, height: 137.1, fit: 285.095, capturedAt: "2026-09-06T06:25:43.099Z", bounds: { x: 1.3, y: 0, width: 254.8, height: 137.2 } },
  "fire_double_staff": { width: 252.8, height: 24, fit: 280.889, capturedAt: "2026-09-06T06:25:58.818Z", bounds: { x: 0, y: 4.4, width: 252.8, height: 15.1 } },
  "guitar": { width: 595, height: 170, fit: 535.318, capturedAt: "2026-09-06T06:25:38.744Z", bounds: { x: 98.2, y: 0, width: 435.8, height: 170.2 } },
  "minihoop": { width: 257.9, height: 138.2, fit: 275.65, capturedAt: "2026-09-18T07:41:31.732Z", bounds: { x: 0, y: 4.3, width: 133, height: 129.7 } },
  "poi": { width: 291.67, height: 38, fit: 297.357, capturedAt: "2026-09-06T06:25:52.543Z", bounds: { x: 0, y: 6, width: 159.2, height: 25.9 } },
  "quiad": { width: 250, height: 250, fit: 303.476, capturedAt: "2026-09-06T06:25:49.486Z", bounds: { x: 0, y: 0, width: 250, height: 250 } },
  "simple_staff": { width: 252.8, height: 77.8, fit: 284.492, capturedAt: "2026-09-06T06:25:54.943Z", bounds: { x: 0, y: 7.2, width: 252.8, height: 63.4 } },
  "staff": { width: 252.8, height: 77.8, fit: 284.492, capturedAt: "2026-09-06T06:25:53.960Z", bounds: { x: 0, y: 7.2, width: 252.8, height: 63.4 } },
  "staff_v2": { width: 250, height: 40.5, fit: 182.514, capturedAt: "2026-09-06T06:25:56.834Z", bounds: { x: 43.7, y: 0, width: 162.4, height: 40.5 } },
  "sword": { width: 572.3, height: 64, fit: 414.915, capturedAt: "2026-09-06T06:26:11.101Z", bounds: { x: 64.8, y: 0, width: 358.8, height: 64.3 } },
  "torch": { width: 360, height: 35.7, fit: 351.276, capturedAt: "2026-09-06T06:25:50.531Z", bounds: { x: 0, y: 8.8, width: 185.3, height: 18.3 } },
  "triad": { width: 258.67, height: 227.818, fit: 301.025, capturedAt: "2026-09-06T06:26:01.885Z", bounds: { x: 1, y: 0.5, width: 196.8, height: 226.8 } },
  "triangle": { width: 283.3, height: 162.17, fit: 227.754, capturedAt: "2026-09-18T07:42:24.353Z", bounds: { x: 24.3, y: 14.9, width: 120.6, height: 132.2 } },
  "triangle_side": { width: 283.3, height: 162.17, fit: 227.754, capturedAt: "2026-09-18T07:42:28.085Z", bounds: { x: 23.8, y: 14.9, width: 121.2, height: 132.2 } },
  "trigeng": { width: 250, height: 236.7, fit: 413.476, capturedAt: "2026-09-06T06:26:08.042Z", bounds: { x: 1.7, y: 0, width: 211.9, height: 231.7 } },
  "triquetra": { width: 290.3, height: 169.6, fit: 285.474, capturedAt: "2026-09-06T06:26:09.074Z", bounds: { x: 1.4, y: 0, width: 155.4, height: 169.5 } },
  "triquetra2": { width: 300, height: 175.32, fit: 279.826, capturedAt: "2026-09-06T06:26:10.108Z", bounds: { x: 0, y: 4.4, width: 154.1, height: 166.4 } },
  "ukulele": { width: 350, height: 71.5, fit: 339.657, capturedAt: "2026-09-06T06:25:39.840Z", bounds: { x: 169.9, y: 6.5, width: 180.1, height: 58.4 } },
};
