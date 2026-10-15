import type { GooIntent } from "../domain/effects-config";

/**
 * How each palette behaves, not only how it is colored: Mercury is chrome
 * and snaps short, Ritual strings less, Acid glows, Spirit evaporates and
 * drifts. The sim and the drawing read this instead of checking palette
 * names.
 */
export interface GooLook2D {
  /** 0..1: chrome shading instead of a colored liquid. */
  metal: number;
  /** 0..1+: light the liquid gives off around itself. */
  glow: number;
  /** Per second: how fast drops evaporate. 0 = never. */
  evaporate: number;
  /** 0..1: how far a thread pulls out before it breaks, against Classic. */
  string: number;
  /** Share of gravity it falls under; ectoplasm drifts down slowly. */
  gravity: number;
}

const LOOKS: Record<Exclude<GooIntent["palette"], "custom">, GooLook2D> = {
  classic: {
    metal: 0,
    glow: 0,
    evaporate: 0,
    string: 1,
    gravity: 1,
  },
  mercury: {
    metal: 1,
    glow: 0,
    evaporate: 0,
    string: 0.2,
    gravity: 1,
  },
  acid: {
    metal: 0,
    glow: 0.7,
    evaporate: 0,
    string: 1,
    gravity: 1,
  },
  blood: {
    metal: 0,
    glow: 0,
    evaporate: 0,
    string: 0.55,
    gravity: 1,
  },
  spirit: {
    metal: 0,
    glow: 1.1,
    evaporate: 0.9,
    string: 0.8,
    gravity: 0.4,
  },
};

export function resolveGooLook2D(palette: GooIntent["palette"]): GooLook2D {
  return palette === "custom" ? LOOKS.classic : LOOKS[palette];
}
