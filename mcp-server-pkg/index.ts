#!/usr/bin/env node
/**
 * TKA Domain MCP Server
 *
 * Comprehensive MCP server for The Kinetic Alphabet domain.
 * Provides pictograph rendering, sequence generation, educational tools,
 * and domain knowledge queries.
 *
 * Tools:
 * - Pictograph Generation: generate_pictograph, generate_pictograph_url, view_pictograph
 * - Sequence Generation: generate_sequence_data, generate_sequence_image, view_sequence
 * - Sequence Constraints: parse_constraints, analyze_word_feasibility
 * - LOOP Sequences: validate_loop_options, generate_loop_sequence, generate_loop_image
 * - Data Queries: list_available_letters, list_letter_variations, get_pictograph_data, search_pictographs
 * - Educational: get_alphabet_info, get_letter_explanation, get_term_definition, compare_letters, list_letters_by_type, get_placement_info
 * - User Presets: list_user_presets, save_user_preset, delete_user_preset, get_user_preset, generate_with_preset, seed_default_presets
 * - Preferences: set_preferences, get_preferences, reset_preferences
 * - Utilities: generate_random_word
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import packageJson from "./package.json" with { type: "json" };
import {
  registerDataTools,
  registerPreferenceTools,
  registerEducationalTools,
  registerPictographTools,
  registerSequenceTools,
  registerLoopTools,
  registerPresetTools,
  registerUtilityTools,
} from "./src/tools/index.js";
import { ensureTransitionGraphInitialized } from "./src/core/letter-transition-graph.js";
import { loadKnowledgeBase } from "./src/shared/server-context.js";

// Create MCP server instance
const server = new McpServer({
  name: "tka-domain",
  version: packageJson.version,
});

// Load knowledge base (glossary, letter types)
loadKnowledgeBase();

// Register all tool groups
registerDataTools(server);
registerPreferenceTools(server);
registerEducationalTools(server);
registerPictographTools(server);
registerSequenceTools(server);
registerLoopTools(server);
registerPresetTools(server);
registerUtilityTools(server);

async function main() {
  console.error(
    `[MCP] Starting TKA Domain MCP Server v${packageJson.version}...`
  );

  // Ensure transition graph is initialized before accepting tool calls
  // This must complete before any sequence generation tools are used
  console.error("[MCP] Initializing transition graph...");
  await ensureTransitionGraphInitialized();
  console.error("[MCP] Transition graph ready");

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("[MCP] Server connected and ready");
}

main().catch((error) => {
  console.error("[MCP] Fatal error:", error);
  process.exit(1);
});
