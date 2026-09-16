/**
 * Data Query Tools
 *
 * Tools for querying pictograph data: list_letter_variations,
 * get_pictograph_data, search_pictographs, list_available_letters
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ensureDataLoaded, LETTER_TYPES } from "../shared/server-context.js";

export function registerDataTools(server: McpServer): void {
  // Tool: list_letter_variations
  server.tool(
    "list_letter_variations",
    "List all variations of a TKA letter. Each letter can have multiple variations with different motion combinations.",
    {
      letter: z
        .string()
        .describe(
          "Letter to list variations for (A-Z, or Greek: α, β, γ, Δ, Θ, Λ, Σ, Φ, Ψ, Ω)"
        ),
      limit: z
        .number()
        .optional()
        .describe(
          "Max variations to return (default: all). Use 5-10 for quick overview."
        ),
    },
    async ({ letter, limit }) => {
      const allPictographs = ensureDataLoaded();
      const variations = allPictographs.filter((p) => p.letter === letter);

      if (variations.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No variations found for letter: ${letter}`,
            },
          ],
        };
      }

      const toShow = limit ? variations.slice(0, limit) : variations;
      const truncated = limit && variations.length > limit;

      const variationList = toShow
        .map((v, i) => {
          return `[${i}] ${v.startPlacement} → ${v.endPlacement}
   Left hand: ${v.leftMotion.startLocation}→${v.leftMotion.endLocation} (${v.leftMotion.motionType}, ${v.leftMotion.rotationDirection})
   Right hand: ${v.rightMotion.startLocation}→${v.rightMotion.endLocation} (${v.rightMotion.motionType}, ${v.rightMotion.rotationDirection})`;
        })
        .join("\n\n");

      const header = truncated
        ? `Letter ${letter} has ${variations.length} variations (showing first ${limit}):`
        : `Letter ${letter} has ${variations.length} variations:`;

      return {
        content: [
          {
            type: "text" as const,
            text: `${header}\n\n${variationList}`,
          },
        ],
      };
    }
  );

  // Tool: get_pictograph_data
  server.tool(
    "get_pictograph_data",
    "Get detailed data for a specific pictograph variation. Returns all motion parameters.",
    {
      letter: z.string().describe("The letter (A-Z or Greek)"),
      variation: z
        .number()
        .optional()
        .default(0)
        .describe("Variation index (0-based)"),
    },
    async ({ letter, variation = 0 }) => {
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

      const p = variations[variation];
      const data = JSON.stringify(p, null, 2);

      return {
        content: [
          {
            type: "text" as const,
            text: `Pictograph ${letter} (variation ${variation}):\n\n${data}`,
          },
        ],
      };
    }
  );

  // Tool: search_pictographs
  server.tool(
    "search_pictographs",
    "Search for pictographs matching specific criteria. Filter by placement, motion type, or location.",
    {
      startPlacement: z
        .string()
        .optional()
        .describe("Filter by start placement (e.g., alpha1, alpha3, beta1)"),
      endPlacement: z.string().optional().describe("Filter by end placement"),
      startPosition: z
        .string()
        .optional()
        .describe(
          "Deprecated alias for startPlacement. 'Position' is the older TKA term; use startPlacement."
        ),
      endPosition: z
        .string()
        .optional()
        .describe(
          "Deprecated alias for endPlacement. 'Position' is the older TKA term; use endPlacement."
        ),
      motionType: z
        .enum(["pro", "anti", "static", "dash"])
        .optional()
        .describe("Filter by motion type"),
      startLocation: z
        .string()
        .optional()
        .describe(
          "Filter by motion start location (n, e, s, w, ne, se, sw, nw)"
        ),
      endLocation: z
        .string()
        .optional()
        .describe("Filter by motion end location"),
      limit: z
        .number()
        .optional()
        .default(10)
        .describe("Max results to return"),
    },
    async ({
      startPlacement,
      endPlacement,
      startPosition,
      endPosition,
      motionType,
      startLocation,
      endLocation,
      limit = 10,
    }) => {
      // Deprecated aliases: startPosition/endPosition map onto the current names.
      startPlacement = startPlacement ?? startPosition;
      endPlacement = endPlacement ?? endPosition;

      const allPictographs = ensureDataLoaded();
      let results = [...allPictographs];

      if (startPlacement) {
        results = results.filter(
          (p) => p.startPlacement.toLowerCase() === startPlacement.toLowerCase()
        );
      }

      if (endPlacement) {
        results = results.filter(
          (p) => p.endPlacement.toLowerCase() === endPlacement.toLowerCase()
        );
      }

      if (motionType) {
        results = results.filter(
          (p) =>
            p.leftMotion.motionType === motionType ||
            p.rightMotion.motionType === motionType
        );
      }

      if (startLocation) {
        results = results.filter(
          (p) =>
            p.leftMotion.startLocation === startLocation ||
            p.rightMotion.startLocation === startLocation
        );
      }

      if (endLocation) {
        results = results.filter(
          (p) =>
            p.leftMotion.endLocation === endLocation ||
            p.rightMotion.endLocation === endLocation
        );
      }

      const limited = results.slice(0, limit);

      if (limited.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: "No pictographs found matching criteria",
            },
          ],
        };
      }

      const resultList = limited
        .map((p) => {
          return `${p.letter}: ${p.startPlacement}→${p.endPlacement} | Left hand: ${p.leftMotion.startLocation}→${p.leftMotion.endLocation} (${p.leftMotion.motionType}) | Right hand: ${p.rightMotion.startLocation}→${p.rightMotion.endLocation} (${p.rightMotion.motionType})`;
        })
        .join("\n");

      return {
        content: [
          {
            type: "text" as const,
            text: `Found ${results.length} matches (showing ${limited.length}):\n\n${resultList}`,
          },
        ],
      };
    }
  );

  // Tool: list_available_letters
  server.tool(
    "list_available_letters",
    "List all letters available in the TKA alphabet dataframe",
    {
      compact: z
        .boolean()
        .optional()
        .default(false)
        .describe(
          "Compact output (just letter lists, no descriptions - saves ~800 tokens)"
        ),
    },
    async ({ compact = false }) => {
      const allPictographs = ensureDataLoaded();

      const availableLetters = new Set<string>();
      for (const p of allPictographs) {
        availableLetters.add(p.letter);
      }

      if (compact) {
        const byType: string[] = [];
        const registeredExtensions: string[] = [];
        for (const [_typeKey, typeInfo] of Object.entries(LETTER_TYPES)) {
          const presentLetters = typeInfo.letters.filter((l) =>
            availableLetters.has(l)
          );
          if (presentLetters.length > 0) {
            byType.push(
              `${typeInfo.name.split(":")[0]}: ${presentLetters.join(",")}`
            );
          }
          registeredExtensions.push(...(typeInfo.extendedLetters ?? []));
        }
        if (registeredExtensions.length > 0) {
          byType.push(
            `Registered extensions without dataframe variations: ${registeredExtensions.join(",")}`
          );
        }
        return {
          content: [{ type: "text" as const, text: byType.join("\n") }],
        };
      }

      const output: string[] = [
        "# TKA Letters by Type",
        "",
        "IMPORTANT: When a user says '[Letter] dash' (e.g., 'Sigma dash'), they mean the Type 3 letter with '-' suffix (e.g., 'Σ-'), NOT a letter with dash motion.",
        "",
      ];

      for (const [_typeKey, typeInfo] of Object.entries(LETTER_TYPES)) {
        const presentLetters = typeInfo.letters.filter((l) =>
          availableLetters.has(l)
        );
        if (presentLetters.length > 0) {
          output.push(`## ${typeInfo.name}`);
          output.push(`${typeInfo.description}`);
          output.push(
            `Level 1/dataframe letters: ${presentLetters.join(", ")}`
          );
          if (typeInfo.extendedLetters?.length) {
            output.push(
              `Registered higher-level extensions without dataframe variations: ${typeInfo.extendedLetters.join(", ")}`
            );
          }
          output.push("");
        }
      }

      output.push(
        `Total available in the pictograph dataframe: ${availableLetters.size} letters`
      );

      return {
        content: [
          {
            type: "text" as const,
            text: output.join("\n"),
          },
        ],
      };
    }
  );
}
