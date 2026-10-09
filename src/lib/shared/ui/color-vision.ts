// How a color looks to someone with full red-blindness (protanopia) or
// green-blindness (deuteranopia), the two kinds that fold reds and greens
// together; about one man in twelve has some degree of one. Blue-yellow
// blindness is rare and leaves a cool hue apart from a warm one, so it is left
// out. The prop color dice uses this to keep its two hands apart for everyone.
// Severity-1 matrices from Machado, Oliveira & Fernandes, "A Physiologically-
// based Model for Simulation of Color Vision Deficiency" (IEEE TVCG, 2009),
// applied to light-linear sRGB.
import {
  hexToLinearSrgb,
  hexToOklch,
  linearSrgbToHex,
  oklabDistance,
} from "./oklch";

export type ColorVision = "protan" | "deutan";

const SIMULATION: Record<ColorVision, readonly (readonly number[])[]> = {
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
};

export function simulateColorVision(hex: string, vision: ColorVision): string {
  const [r, g, b] = hexToLinearSrgb(hex);
  return linearSrgbToHex(
    SIMULATION[vision].map((row) => row[0]! * r + row[1]! * g + row[2]! * b)
  );
}

/**
 * The Oklab distance between two colors as the least of typical, red-blind
 * and green-blind eyes see it.
 */
export function colorVisionDistance(a: string, b: string): number {
  const distance = (x: string, y: string) =>
    oklabDistance(hexToOklch(x), hexToOklch(y));
  return Math.min(
    distance(a, b),
    ...(["protan", "deutan"] as const).map((vision) =>
      distance(simulateColorVision(a, vision), simulateColorVision(b, vision))
    )
  );
}
