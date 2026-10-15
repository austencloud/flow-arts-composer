import { DURATION, EASE_STANDARD_OUT } from "@austencloud/motion";

// Each mounted glyph owns its animation; sharing it would cancel other glyphs.
export function createPlacementPulse() {
  let animation: Animation | null = null;

  function destroy() {
    animation?.cancel();
    animation = null;
  }

  return {
    play(target: SVGGElement | null, reducedMotion: boolean) {
      destroy();
      if (reducedMotion || !target || typeof target.animate !== "function")
        return;

      animation = target.animate(
        [
          { transform: "scale(1)" },
          { transform: "scale(0.91)" },
          { transform: "scale(1)" },
        ],
        { duration: DURATION.dramatic, easing: EASE_STANDARD_OUT }
      );
    },
    destroy,
  };
}
