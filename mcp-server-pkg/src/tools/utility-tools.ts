/**
 * Utility Tools
 *
 * General utility tools: generate_random_word
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { generateChainableSequence } from "../core/sequence-builder.js";

export function registerUtilityTools(server: McpServer): void {
  // Tool: generate_random_word
  server.tool(
    "generate_random_word",
    "Generate a random valid TKA word of specified length. Letters are chain-valid (each letter's end placement matches the next letter's start placement).",
    {
      length: z.number().min(1).max(20).describe("Number of letters"),
      excludeLetters: z.array(z.string()).optional().describe("Letters to exclude"),
    },
    async ({ length, excludeLetters }) => {
      const defaultExclude = ["α", "β", "γ"];
      const exclude = excludeLetters
        ? [...new Set([...defaultExclude, ...excludeLetters])]
        : defaultExclude;
      const letters = generateChainableSequence(length, exclude);
      const word = letters.join("");

      return {
        content: [
          {
            type: "text" as const,
            text: `Generated word: **${word}** (${word.length} letters)`,
          },
        ],
      };
    }
  );
}
