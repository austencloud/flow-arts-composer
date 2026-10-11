/**
 * Mounts PropSvg with props a test can change together, the way a per-frame
 * motion renderer hands it a new angle and then hands control back.
 */
import { flushSync, mount, unmount } from "svelte";
import PropSvg from "#lib/shared/pictograph/prop/components/PropSvg.svelte";
import { HandSide } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import type { MotionData } from "#lib/shared/pictograph/shared/domain/models/motion-data.js";
import type { PropAssets } from "#lib/shared/pictograph/prop/domain/models/prop-assets.js";

export type PropSvgFrame = {
  rotation: number;
  directPositioning: boolean;
  turns?: number;
  rotationDirection?: string;
};

const ASSETS: PropAssets = {
  imageSrc: "<rect width='10' height='10' />",
  viewBox: "0 0 10 10",
  center: { x: 5, y: 5 },
};

export function mountPropSvg(target: HTMLElement, initial: PropSvgFrame) {
  const props = $state({ ...initial });
  const component = mount(PropSvg, {
    target,
    props: {
      get motionData() {
        return {
          hand: HandSide.LEFT,
          turns: props.turns ?? 0,
          rotationDirection: props.rotationDirection,
        } as unknown as MotionData;
      },
      propAssets: ASSETS,
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
    set(next: Partial<PropSvgFrame>): void {
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
