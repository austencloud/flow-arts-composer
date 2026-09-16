/**
 * Pictograph Generation Tools
 *
 * Tools for generating pictograph images: generate_pictograph,
 * view_pictograph, generate_pictograph_url
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  getStandaloneRenderer,
  type PictographInput,
  type RenderVisibilityOptions,
} from "../core/standalone-renderer.js";
import {
  ensureDataLoaded,
  getPreferences,
  saveAndOpenImage,
  type UserPreferences,
} from "../shared/server-context.js";

export function registerPictographTools(server: McpServer): void {
  // Tool: generate_pictograph_url
  server.tool(
    "generate_pictograph_url",
    "Generate a URL to render a pictograph image. Use with Playwright to navigate and screenshot, or provide to user. The dev server must be running at localhost:5173.",
    {
      letter: z.string().describe("The letter to render (A-Z or Greek)"),
      variation: z
        .number()
        .optional()
        .default(0)
        .describe("Variation index (0-based)"),
      darkMode: z
        .boolean()
        .optional()
        .default(false)
        .describe("Use dark background"),
      minimal: z
        .boolean()
        .optional()
        .default(true)
        .describe("Minimal mode (no UI, just the pictograph)"),
    },
    async ({ letter, variation = 0, darkMode = false, minimal = true }) => {
      const allPictographs = ensureDataLoaded();

      const variations = allPictographs.filter((p) => p.letter === letter);
      if (variations.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No pictograph found for letter: ${letter}`,
            },
          ],
          isError: true,
        };
      }

      if (variation >= variations.length) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Variation ${variation} not found. Letter ${letter} has ${variations.length} variations (0-${variations.length - 1})`,
            },
          ],
          isError: true,
        };
      }

      const params = new URLSearchParams({
        letter,
        variation: variation.toString(),
        dark: darkMode.toString(),
        minimal: minimal.toString(),
      });

      const url = `http://localhost:5173/test/pictograph-cli?${params.toString()}`;
      const p = variations[variation];

      return {
        content: [
          {
            type: "text" as const,
            text: `Pictograph URL for ${letter} (variation ${variation}):\n\n${url}\n\nTo capture as image:\n1. Use Playwright: browser_navigate to this URL, wait 2 seconds, then browser_take_screenshot\n2. Or open in browser and screenshot manually\n\nPictograph details:\n- Left hand: ${p.leftMotion.startLocation}→${p.leftMotion.endLocation} (${p.leftMotion.motionType})\n- Right hand: ${p.rightMotion.startLocation}→${p.rightMotion.endLocation} (${p.rightMotion.motionType})`,
          },
        ],
      };
    }
  );

  // Tool: generate_pictograph
  server.tool(
    "generate_pictograph",
    "Generate a pictograph PNG image directly in Node.js. Uses current preferences unless overridden. Returns base64-encoded image.",
    {
      letter: z
        .string()
        .describe(
          "The letter to render (A-Z or Greek: α, β, γ, Δ, Θ, Λ, Σ, Φ, Ψ, Ω)"
        ),
      variation: z
        .number()
        .optional()
        .default(0)
        .describe("Variation index (0-based)"),
      darkMode: z.boolean().optional().describe("Override: dark background"),
      size: z.number().optional().describe("Override: image size in pixels"),
      showTKA: z
        .boolean()
        .optional()
        .describe("Override: show TKA letter glyph"),
      showTND: z
        .boolean()
        .optional()
        .describe("Override: show TnD (timing & direction) glyph"),
      showPlacements: z
        .boolean()
        .optional()
        .describe("Override: show start→end placements glyph"),
      showReversals: z
        .boolean()
        .optional()
        .describe("Override: show reversal indicators"),
      showHandColorKey: z
        .boolean()
        .optional()
        .describe(
          "Render as a start placement: adds the L/R hand colour key in the bottom band"
        ),
      showGrid: z.boolean().optional().describe("Override: show grid"),
      showNonRadialPoints: z
        .boolean()
        .optional()
        .describe("Override: show non-radial grid points"),
      showLeftMotion: z
        .boolean()
        .optional()
        .describe("Override: show left-hand motion (prop + arrow)"),
      showRightMotion: z
        .boolean()
        .optional()
        .describe("Override: show right-hand motion (prop + arrow)"),
      includeTextData: z
        .boolean()
        .optional()
        .default(true)
        .describe(
          "Include motion data as text (false = image only, saves tokens)"
        ),
    },
    async ({ letter, variation = 0, includeTextData = true, ...overrides }) => {
      const allPictographs = ensureDataLoaded();

      const variations = allPictographs.filter((p) => p.letter === letter);
      if (variations.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No pictograph found for letter: ${letter}`,
            },
          ],
          isError: true,
        };
      }

      if (variation >= variations.length) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Variation ${variation} not found. Letter ${letter} has ${variations.length} variations (0-${variations.length - 1})`,
            },
          ],
          isError: true,
        };
      }

      try {
        const csvRow = variations[variation];

        // Merge preferences with any overrides
        const prefs = { ...getPreferences() };
        if (overrides.darkMode !== undefined)
          prefs.darkMode = overrides.darkMode;
        if (overrides.size !== undefined) prefs.size = overrides.size;
        if (overrides.showTKA !== undefined) prefs.showTKA = overrides.showTKA;
        if (overrides.showTND !== undefined) prefs.showTND = overrides.showTND;
        if (overrides.showPlacements !== undefined)
          prefs.showPlacements = overrides.showPlacements;
        if (overrides.showReversals !== undefined)
          prefs.showReversals = overrides.showReversals;
        if (overrides.showGrid !== undefined)
          prefs.showGrid = overrides.showGrid;
        if (overrides.showNonRadialPoints !== undefined)
          prefs.showNonRadialPoints = overrides.showNonRadialPoints;
        if (overrides.showLeftMotion !== undefined)
          prefs.showLeftMotion = overrides.showLeftMotion;
        if (overrides.showRightMotion !== undefined)
          prefs.showRightMotion = overrides.showRightMotion;

        const pictographInput: PictographInput = {
          letter: csvRow.letter,
          startPlacement: csvRow.startPlacement,
          endPlacement: csvRow.endPlacement,
          leftMotion: {
            motionType: csvRow.leftMotion.motionType,
            rotationDirection:
              csvRow.leftMotion.rotationDirection || "no_rotation",
            startLocation: csvRow.leftMotion.startLocation,
            endLocation: csvRow.leftMotion.endLocation,
            hand: "left",
            turns: 0,
            startOrientation: "in",
          },
          rightMotion: {
            motionType: csvRow.rightMotion.motionType,
            rotationDirection:
              csvRow.rightMotion.rotationDirection || "no_rotation",
            startLocation: csvRow.rightMotion.startLocation,
            endLocation: csvRow.rightMotion.endLocation,
            hand: "right",
            turns: 0,
            startOrientation: "in",
          },
        };

        const visibility: RenderVisibilityOptions = {
          darkMode: prefs.darkMode,
          size: prefs.size,
          showTKA: prefs.showTKA,
          showTND: prefs.showTND,
          showPlacements: prefs.showPlacements,
          showReversals: prefs.showReversals,
          showHandColorKey: overrides.showHandColorKey,
          showGrid: prefs.showGrid,
          showNonRadialPoints: prefs.showNonRadialPoints,
          showLeftMotion: prefs.showLeftMotion,
          showRightMotion: prefs.showRightMotion,
          leftPropType: prefs.leftPropType,
          rightPropType: prefs.rightPropType,
          fanAppearance: prefs.fanAppearance,
        };

        const renderer = getStandaloneRenderer();
        const pngBuffer = await renderer.renderToPng(
          pictographInput,
          visibility
        );

        saveAndOpenImage(pngBuffer, letter);

        const base64 = pngBuffer.toString("base64");

        const leftMotionDesc =
          `${csvRow.leftMotion.motionType} from ${csvRow.leftMotion.startLocation} to ${csvRow.leftMotion.endLocation}` +
          (csvRow.leftMotion.rotationDirection !== "noRotation"
            ? ` (${csvRow.leftMotion.rotationDirection})`
            : "");
        const rightMotionDesc =
          `${csvRow.rightMotion.motionType} from ${csvRow.rightMotion.startLocation} to ${csvRow.rightMotion.endLocation}` +
          (csvRow.rightMotion.rotationDirection !== "noRotation"
            ? ` (${csvRow.rightMotion.rotationDirection})`
            : "");

        const content: Array<
          | { type: "text"; text: string }
          | { type: "image"; data: string; mimeType: string }
        > = [];

        if (includeTextData) {
          const motionData = `## ${letter} (variation ${variation})

**Placement:** ${csvRow.startPlacement} → ${csvRow.endPlacement}

**Left-hand motion:** ${leftMotionDesc}
**Right-hand motion:** ${rightMotionDesc}`;
          content.push({ type: "text" as const, text: motionData });
        }

        content.push({
          type: "image" as const,
          data: base64,
          mimeType: "image/png",
        });

        return { content };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to generate pictograph: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // Tool: view_pictograph
  server.tool(
    "view_pictograph",
    "Generate a pictograph and open it in the system image viewer. Returns only confirmation text - NO image data returned. Use this when the USER needs to see the pictograph but Claude doesn't need to analyze it. Saves ~15-30k tokens compared to generate_pictograph.",
    {
      letter: z
        .string()
        .describe(
          "The letter to render (A-Z or Greek: α, β, γ, Δ, Θ, Λ, Σ, Φ, Ψ, Ω)"
        ),
      variation: z
        .number()
        .optional()
        .default(0)
        .describe("Variation index (0-based)"),
      darkMode: z.boolean().optional().describe("Override: dark background"),
      size: z.number().optional().describe("Override: image size in pixels"),
      showTKA: z
        .boolean()
        .optional()
        .describe("Override: show TKA letter glyph"),
      showTND: z
        .boolean()
        .optional()
        .describe("Override: show TnD (timing & direction) glyph"),
      showPlacements: z
        .boolean()
        .optional()
        .describe("Override: show start→end placements glyph"),
      showReversals: z
        .boolean()
        .optional()
        .describe("Override: show reversal indicators"),
      showHandColorKey: z
        .boolean()
        .optional()
        .describe(
          "Render as a start placement: adds the L/R hand colour key in the bottom band"
        ),
      showGrid: z.boolean().optional().describe("Override: show grid"),
      showNonRadialPoints: z
        .boolean()
        .optional()
        .describe("Override: show non-radial grid points"),
      showLeftMotion: z
        .boolean()
        .optional()
        .describe("Override: show left-hand motion (prop + arrow)"),
      showRightMotion: z
        .boolean()
        .optional()
        .describe("Override: show right-hand motion (prop + arrow)"),
    },
    async ({ letter, variation = 0, ...overrides }) => {
      const allPictographs = ensureDataLoaded();

      const variations = allPictographs.filter((p) => p.letter === letter);
      if (variations.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No pictograph found for letter: ${letter}`,
            },
          ],
          isError: true,
        };
      }

      if (variation >= variations.length) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Variation ${variation} not found. Letter ${letter} has ${variations.length} variations (0-${variations.length - 1})`,
            },
          ],
          isError: true,
        };
      }

      try {
        const csvRow = variations[variation];

        const prefs = { ...getPreferences() };
        if (overrides.darkMode !== undefined)
          prefs.darkMode = overrides.darkMode;
        if (overrides.size !== undefined) prefs.size = overrides.size;
        if (overrides.showTKA !== undefined) prefs.showTKA = overrides.showTKA;
        if (overrides.showTND !== undefined) prefs.showTND = overrides.showTND;
        if (overrides.showPlacements !== undefined)
          prefs.showPlacements = overrides.showPlacements;
        if (overrides.showReversals !== undefined)
          prefs.showReversals = overrides.showReversals;
        if (overrides.showGrid !== undefined)
          prefs.showGrid = overrides.showGrid;
        if (overrides.showNonRadialPoints !== undefined)
          prefs.showNonRadialPoints = overrides.showNonRadialPoints;
        if (overrides.showLeftMotion !== undefined)
          prefs.showLeftMotion = overrides.showLeftMotion;
        if (overrides.showRightMotion !== undefined)
          prefs.showRightMotion = overrides.showRightMotion;

        const pictographInput: PictographInput = {
          letter: csvRow.letter,
          startPlacement: csvRow.startPlacement,
          endPlacement: csvRow.endPlacement,
          leftMotion: {
            motionType: csvRow.leftMotion.motionType,
            rotationDirection:
              csvRow.leftMotion.rotationDirection || "no_rotation",
            startLocation: csvRow.leftMotion.startLocation,
            endLocation: csvRow.leftMotion.endLocation,
            hand: "left",
            turns: 0,
            startOrientation: "in",
          },
          rightMotion: {
            motionType: csvRow.rightMotion.motionType,
            rotationDirection:
              csvRow.rightMotion.rotationDirection || "no_rotation",
            startLocation: csvRow.rightMotion.startLocation,
            endLocation: csvRow.rightMotion.endLocation,
            hand: "right",
            turns: 0,
            startOrientation: "in",
          },
        };

        const visibility: RenderVisibilityOptions = {
          darkMode: prefs.darkMode,
          size: prefs.size,
          showTKA: prefs.showTKA,
          showTND: prefs.showTND,
          showPlacements: prefs.showPlacements,
          showReversals: prefs.showReversals,
          showHandColorKey: overrides.showHandColorKey,
          showGrid: prefs.showGrid,
          showNonRadialPoints: prefs.showNonRadialPoints,
          showLeftMotion: prefs.showLeftMotion,
          showRightMotion: prefs.showRightMotion,
          leftPropType: prefs.leftPropType,
          rightPropType: prefs.rightPropType,
          fanAppearance: prefs.fanAppearance,
        };

        const renderer = getStandaloneRenderer();
        const pngBuffer = await renderer.renderToPng(
          pictographInput,
          visibility
        );

        const tempPath = saveAndOpenImage(pngBuffer, letter);

        return {
          content: [
            {
              type: "text" as const,
              text: `Opened ${letter} (variation ${variation}) in system viewer.\nPlacement: ${csvRow.startPlacement} → ${csvRow.endPlacement}\nFile: ${tempPath}`,
            },
          ],
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: "text" as const,
              text: `Failed to generate pictograph: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
