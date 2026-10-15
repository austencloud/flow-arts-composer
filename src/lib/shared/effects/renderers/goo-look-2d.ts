import type { GooIntent } from "../domain/effects-config";

/**
 * How each palette behaves, not only how it is colored: Mercury beads up and
 * rolls without wetting the glass, Ritual clings and leaves dark runs, Acid
 * glows, Spirit evaporates. The sims and the drawing read this instead of
 * checking palette names.
 */
export interface GooLook2D {
  /** 0..1: chrome shading instead of a colored liquid. */
  metal: number;
  /** 0..1+: light the liquid gives off around itself. */
  glow: number;
  /** Per second: how fast drops and splats evaporate. 0 = never. */
  evaporate: number;
  /** 0..2: how much liquid a run leaves behind on the glass. */
  wetting: number;
  /** 0..2: how hard a splat holds to the glass before it runs. */
  grip: number;
  /** Seconds a still bead on the glass takes to dry away. */
  dryTime: number;
  /** 0..1: how ragged a fresh splat lands before it pulls round. */
  splash: number;
  /** 0..1: how readily a thin thread breaks into beads. */
  beading: number;
  /** 0..1: overall opacity of the liquid. */
  opacity: number;
  /** 0..1: how far a thread pulls out before it breaks, against Classic. */
  string: number;
}

const LOOKS: Record<Exclude<GooIntent["palette"], "custom">, GooLook2D> = {
  classic: {
    metal: 0,
    glow: 0,
    evaporate: 0,
    wetting: 1,
    grip: 0.8,
    dryTime: 18,
    splash: 0.8,
    beading: 0.35,
    opacity: 0.94,
    string: 1,
  },
  mercury: {
    metal: 1,
    glow: 0,
    evaporate: 0,
    wetting: 0,
    grip: 0.2,
    dryTime: 40,
    splash: 0.15,
    beading: 1,
    opacity: 1,
    string: 0.2,
  },
  acid: {
    metal: 0,
    glow: 0.7,
    evaporate: 0,
    wetting: 1.1,
    grip: 0.7,
    dryTime: 14,
    splash: 0.9,
    beading: 0.4,
    opacity: 0.92,
    string: 1,
  },
  blood: {
    metal: 0,
    glow: 0,
    evaporate: 0,
    wetting: 1.7,
    grip: 0.75,
    dryTime: 45,
    splash: 1,
    beading: 0.2,
    opacity: 0.97,
    string: 0.55,
  },
  spirit: {
    metal: 0,
    glow: 1.1,
    evaporate: 0.9,
    wetting: 0.6,
    grip: 0.6,
    dryTime: 2.5,
    splash: 0.6,
    beading: 0.5,
    opacity: 0.72,
    string: 0.8,
  },
};

export function resolveGooLook2D(palette: GooIntent["palette"]): GooLook2D {
  return palette === "custom" ? LOOKS.classic : LOOKS[palette];
}
