/**
 * Pictograph render module for the CLI.
 *
 * This file is loaded through Vite's SSR module loader by
 * scripts/pictograph-cli.ts, never directly by tsx. That is what lets it
 * import the app's real render pipeline through `$lib`: the SvelteKit plugin
 * resolves the aliases and virtual modules ($app/*, $env/*, import.meta.env)
 * and compiles the rune-based .svelte.ts state files the pipeline depends on.
 *
 * It uses the same singletons the app uses (pictographPreparer wired into a
 * Canvas2DDirectRenderer), so the PNGs match what the app draws. The launcher
 * installs the Node globals the pipeline expects (fetch for /images and /data,
 * a canvas factory, Image, DOMParser) before loading this module.
 */

import fs from "node:fs";
import path from "node:path";
import { Canvas2DDirectRenderer } from "$lib/shared/render/services/canvas-2d-direct-renderer";
import { pictographPreparer } from "$lib/shared/pictograph/shared/services/pictograph-preparer";
import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
import type { MotionDataInput } from "$lib/shared/pictograph/shared/domain/models/motion-data";

export interface RenderPictographOptions {
  /** Project root; the CSV and static assets are resolved against it. */
  projectRoot: string;
  /** Directory the PNG is written into. Created if missing. */
  outputDir: string;
  /** Restrict the CSV row to this start placement (with endPos). */
  startPos?: string;
  /** Restrict the CSV row to this end placement (with startPos). */
  endPos?: string;
  themeMode?: "light" | "dark";
  /** Canvas size in pixels. Default 950 (the pictograph viewBox). */
  size?: number;
}

export interface RenderPictographResult {
  outputPath: string;
  width: number;
  height: number;
}

const CSV_RELATIVE_PATH = path.join(
  "static",
  "data",
  "pictographs",
  "DiamondPictographDataframe.csv"
);

let renderer: Canvas2DDirectRenderer | null = null;

async function getRenderer(): Promise<Canvas2DDirectRenderer> {
  if (!renderer) {
    // Explicit preparer: without it ensurePrepared falls through and arrows
    // and props never render (same wiring as render-parity-core.ts).
    renderer = new Canvas2DDirectRenderer(pictographPreparer);
    await renderer.initialize();
  }
  return renderer;
}

function loadPictographData(
  projectRoot: string,
  letter: string,
  startPos?: string,
  endPos?: string
): PictographData {
  const csvPath = path.join(projectRoot, CSV_RELATIVE_PATH);
  const lines = fs.readFileSync(csvPath, "utf-8").split(/\r?\n/);
  const headers = (lines[0] ?? "").split(",").map((h) => h.trim());
  const col = (row: string[], name: string): string => {
    const index = headers.indexOf(name);
    if (index === -1) {
      throw new Error(`CSV column "${name}" not found in ${csvPath}`);
    }
    return row[index] ?? "";
  };

  let row: string[] | null = null;
  for (let i = 1; i < lines.length; i++) {
    const r = (lines[i] ?? "").split(",").map((v) => v.trim());
    if (r[0] !== letter) continue;
    if (startPos && endPos) {
      if (col(r, "startPlacement") !== startPos) continue;
      if (col(r, "endPlacement") !== endPos) continue;
    }
    row = r;
    break;
  }

  if (!row) {
    const placement = startPos ? ` (${startPos} to ${endPos})` : "";
    throw new Error(`No data found for letter ${letter}${placement}`);
  }

  // The CSV already holds abbreviated locations (n, e, s, w, ne, ...), which
  // are the GridLocation values, so they pass through untouched.
  const motion = (hand: HandSide, prefix: "blue" | "red") => {
    const rotationDirection = col(row, `${prefix}RotationDirection`);
    return createMotionData({
      hand,
      motionType: col(row, `${prefix}MotionType`),
      rotationDirection,
      startLocation: col(row, `${prefix}StartLocation`),
      endLocation: col(row, `${prefix}EndLocation`),
      startOrientation: "in",
      endOrientation: "in",
      turns: rotationDirection === "noRotation" ? 0 : 1,
      propType: PropType.STAFF,
    } as MotionDataInput);
  };

  return {
    id: `pictograph-${letter}`,
    letter,
    startPlacement: col(row, "startPlacement"),
    endPlacement: col(row, "endPlacement"),
    motions: {
      left: motion(HandSide.LEFT, "blue"),
      right: motion(HandSide.RIGHT, "red"),
    },
  } as unknown as PictographData;
}

/**
 * Render one letter to `<outputDir>/pictograph-<letter>[-dark].png`.
 */
export async function renderPictograph(
  letter: string,
  options: RenderPictographOptions
): Promise<RenderPictographResult> {
  const themeMode = options.themeMode ?? "light";
  const size = options.size ?? 950;

  const pictographData = loadPictographData(
    options.projectRoot,
    letter,
    options.startPos,
    options.endPos
  );

  const activeRenderer = await getRenderer();
  const canvas = await activeRenderer.renderPictograph(pictographData, {
    size,
    visibility: {
      showGrid: true,
      showTKA: true,
      showTnD: false,
      showElemental: false,
      showPlacements: false,
      showReversals: false,
      showNonRadialPoints: false,
      darkMode: themeMode === "dark",
      handPointVisibility: "active",
      // Explicit prop types so the preparer never reaches for app settings.
      leftPropType: PropType.STAFF,
      rightPropType: PropType.STAFF,
    },
  });

  // node-canvas exposes toBuffer; the browser canvas types the renderer is
  // declared against do not, hence the narrow cast.
  const nodeCanvas = canvas as unknown as {
    width: number;
    height: number;
    toBuffer: (mimeType: "image/png") => Buffer;
  };
  if (typeof nodeCanvas.toBuffer !== "function") {
    throw new Error(
      "Renderer did not return a node-canvas; the document.createElement shim is missing"
    );
  }

  fs.mkdirSync(options.outputDir, { recursive: true });
  const themeSuffix = themeMode === "dark" ? "-dark" : "";
  const outputPath = path.join(
    options.outputDir,
    `pictograph-${letter}${themeSuffix}.png`
  );
  fs.writeFileSync(outputPath, nodeCanvas.toBuffer("image/png"));

  return { outputPath, width: nodeCanvas.width, height: nodeCanvas.height };
}
