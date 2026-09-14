import type { DifficultyLevel, GradientStop } from "./types.js";

// Gelasio is bundled by the Composer and both MCP renderers, so the badge
// numeral remains the same when a card is generated away from this browser.
export const DIFFICULTY_FONT_FAMILY = "Gelasio, Georgia, serif";

export const DIFFICULTY_LEVELS: Record<number, DifficultyLevel> = {
  1: {
    cssBg:
      "radial-gradient(ellipse at top left, rgb(224,242,254) 0%, rgb(198,232,253) 30%, rgb(164,218,250) 70%, rgb(130,202,245) 100%)",
    stops: [
      { offset: 0, color: "rgb(224, 242, 254)" },
      { offset: 0.3, color: "rgb(198, 232, 253)" },
      { offset: 0.7, color: "rgb(164, 218, 250)" },
      { offset: 1, color: "rgb(130, 202, 245)" },
    ],
    border: "#000",
    text: "#000",
  },
  2: {
    cssBg:
      "linear-gradient(135deg, rgb(170,170,170) 0%, rgb(210,210,210) 15%, rgb(120,120,120) 30%, rgb(180,180,180) 40%, rgb(190,190,190) 55%, rgb(130,130,130) 75%, rgb(110,110,110) 100%)",
    stops: [
      { offset: 0, color: "rgb(170, 170, 170)" },
      { offset: 0.15, color: "rgb(210, 210, 210)" },
      { offset: 0.3, color: "rgb(120, 120, 120)" },
      { offset: 0.4, color: "rgb(180, 180, 180)" },
      { offset: 0.55, color: "rgb(190, 190, 190)" },
      { offset: 0.75, color: "rgb(130, 130, 130)" },
      { offset: 1, color: "rgb(110, 110, 110)" },
    ],
    border: "#000",
    text: "#000",
  },
  3: {
    cssBg:
      "radial-gradient(ellipse at top left, rgb(254,240,138) 0%, rgb(253,224,71) 20%, rgb(250,204,21) 40%, rgb(234,179,8) 60%, rgb(202,138,4) 80%, rgb(161,98,7) 100%)",
    stops: [
      { offset: 0, color: "rgb(254, 240, 138)" },
      { offset: 0.2, color: "rgb(253, 224, 71)" },
      { offset: 0.4, color: "rgb(250, 204, 21)" },
      { offset: 0.6, color: "rgb(234, 179, 8)" },
      { offset: 0.8, color: "rgb(202, 138, 4)" },
      { offset: 1, color: "rgb(161, 98, 7)" },
    ],
    border: "#000",
    text: "#000",
  },
  4: {
    cssBg:
      "linear-gradient(135deg, rgb(200,162,200) 0%, rgb(170,132,170) 30%, rgb(148,0,211) 60%, rgb(100,0,150) 100%)",
    stops: [
      { offset: 0, color: "rgb(200, 162, 200)" },
      { offset: 0.3, color: "rgb(170, 132, 170)" },
      { offset: 0.6, color: "rgb(148, 0, 211)" },
      { offset: 1, color: "rgb(100, 0, 150)" },
    ],
    border: "#000",
    text: "#000",
  },
  5: {
    cssBg:
      "linear-gradient(135deg, rgb(255,90,40) 0%, rgb(255,50,30) 30%, rgb(230,25,15) 60%, rgb(180,10,5) 100%)",
    stops: [
      { offset: 0, color: "rgb(255, 90, 40)" },
      { offset: 0.3, color: "rgb(255, 50, 30)" },
      { offset: 0.6, color: "rgb(230, 25, 15)" },
      { offset: 1, color: "rgb(180, 10, 5)" },
    ],
    border: "#000",
    text: "#000",
  },
};

export const DEFAULT_DIFFICULTY_STYLE: DifficultyLevel = DIFFICULTY_LEVELS[1]!;

export function applyGradientStops(
  gradient: CanvasGradient,
  stops: GradientStop[]
): CanvasGradient {
  for (const { offset, color } of stops) {
    gradient.addColorStop(offset, color);
  }
  return gradient;
}
