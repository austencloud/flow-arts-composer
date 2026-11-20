/**
 * flight-grow-fade — `growFade` that does nothing, and reads nothing, when a
 * flight has set its duration to zero.
 *
 * A Matrix-to-stage flight snapshots the frame the panes change in, so every
 * control or frame that appears or leaves in that frame passes `duration: 0`
 * and lands at once. `growFade` still measures the node first (a computed
 * style and a bounding box), and inside the view transition's update callback
 * that read forces a style and layout pass over a page the flight is about to
 * lay out anyway: 20 ms at full speed on the tap's critical path. A
 * zero-length transition has no frames to measure for, so this returns the
 * empty transition without touching the node. Any other duration is the real
 * `growFade`, unchanged.
 */
import { growFade } from "@austencloud/motion";

export type GrowFadeParams = NonNullable<Parameters<typeof growFade>[1]>;

export function flightGrowFade(
  node: HTMLElement,
  params: GrowFadeParams = {}
): ReturnType<typeof growFade> {
  if (params.duration === 0) return { duration: 0 };
  return growFade(node, params);
}
