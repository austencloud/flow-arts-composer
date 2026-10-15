/**
 * Mounts PropSvg with props a test can change together, the way a per-frame
 * motion renderer hands it a new angle and then hands control back.
 */
import { flushSync, mount, unmount } from "svelte";
import PropSvg from "#lib/shared/pictograph/prop/components/PropSvg.svelte";
import { HandSide } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import type { MotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import type { PropAssets } from "#lib/shared/pictograph/prop/domain/models/prop-assets.js";

export type PropSwapFrame = {
  assets: PropAssets;
  clickable?: boolean;
  hand?: HandSide;
  rotation: number;
  directPositioning: boolean;
  turns?: number;
  rotationDirection?: string;
};

export function mountPropSwap(target: HTMLElement, initial: PropSwapFrame) {
  const props = $state({ ...initial });
  const component = mount(PropSvg, {
    target,
    props: {
      get motionData() {
        return {
          hand: props.hand ?? HandSide.LEFT,
          propType: "hand",
          turns: props.turns ?? 0,
          rotationDirection: props.rotationDirection,
        } as unknown as MotionData;
      },
      get propAssets() {
        return props.assets;
      },
      isClickable: initial.clickable,
      onPropClick: () => {},
      get propPosition() {
        return { x: 475, y: 475, rotation: props.rotation };
      },
      get directPositioning() {
        return props.directPositioning;
      },
    },
  });
  flushSync();
  const prop = () => target.querySelector<SVGGElement>("g.prop-svg")!;
  return {
    /** Apply one frame's props in a single flush, as one render would. */
    set(next: Partial<PropSwapFrame>): void {
      Object.assign(props, next);
      flushSync();
    },
    rotation(): number {
      const match = (prop().getAttribute("style") ?? "").match(
        /rotate\(([-\d.e+]+)deg\)/
      );
      return Number(match?.[1]);
    },
    transitionsOff(): boolean {
      return prop().classList.contains("no-transition");
    },
    destroy(): void {
      unmount(component);
    },
  };
}
