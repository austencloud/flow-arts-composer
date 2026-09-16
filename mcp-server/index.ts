/**
 * Flow Arts Knowledge MCP Server
 *
 * Comprehensive MCP server for flow arts domain knowledge.
 * Provides TKA pictograph rendering, sequence generation, educational tools,
 * VTG (Vulcan Tech Gospel) domain queries, and cross-system translation.
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
  registerVTGTools,
} from "./src/tools/index.js";
import { ensureTransitionGraphInitialized } from "./src/core/letter-transition-graph.js";
import { loadKnowledgeBase } from "./src/shared/server-context.js";
import { resolveAuthConfig, resolveHttpPort } from "./src/http/auth-config.js";
import { createHttpApp } from "./src/http/create-http-app.js";
import { createJwksVerifier } from "./src/http/jwks-verifier.js";

// A malformed value throws rather than silently disabling HTTP: parseInt("abc")
// is NaN, and NaN > 0 quietly skipped the whole branch on a typo.
const HTTP_PORT = resolveHttpPort(process.env.MCP_HTTP_PORT);

function createMcpServer() {
  const server = new McpServer({
    name: "flow-arts-knowledge",
    version: packageJson.version,
  });

  registerDataTools(server);
  registerPreferenceTools(server);
  registerEducationalTools(server);
  registerPictographTools(server);
  registerSequenceTools(server);
  registerLoopTools(server);
  registerPresetTools(server);
  registerUtilityTools(server);
  registerVTGTools(server);

  return server;
}

// Load knowledge base (glossary, letter types)
loadKnowledgeBase();

async function main() {
  console.error(
    `[MCP] Starting Flow Arts Knowledge MCP Server v${packageJson.version}...`
  );

  console.error("[MCP] Initializing transition graph...");
  await ensureTransitionGraphInitialized();
  console.error("[MCP] Transition graph ready");

  // Stdio transport (default, for Claude Code)
  const stdioServer = createMcpServer();
  const stdioTransport = new StdioServerTransport();
  await stdioServer.connect(stdioTransport);
  console.error("[MCP] Stdio transport connected");

  // HTTP transport (for Claude.ai via remote MCP). Authorization is mandatory:
  // see docs/superpowers/specs/2026-07-27-choreo-mcp-act-surface-design.md.
  // Enabling HTTP without auth config is a startup error, never a silent downgrade.
  if (HTTP_PORT > 0) {
    const authConfig = resolveAuthConfig(process.env);

    const { app } = createHttpApp({
      config: authConfig,
      verifier: createJwksVerifier({
        issuer: authConfig.issuer,
        audience: authConfig.audience,
        resource: authConfig.resourceUrl,
        jwksUri: authConfig.jwksUri,
        onError: (error) => console.error("[MCP-HTTP] token rejected:", error),
      }),
      createMcpServer,
    });

    // Explicit 127.0.0.1: cloudflared resolves "localhost" to ::1 first, which
    // an IPv4-only listener never answers.
    app.listen(HTTP_PORT, "127.0.0.1", () => {
      console.error(
        `[MCP-HTTP] Listening on 127.0.0.1:${HTTP_PORT}/mcp (authorization required)`
      );
    });
  }

  console.error("[MCP] Server connected and ready");
}

main().catch((error) => {
  console.error("[MCP] Fatal error:", error);
  process.exit(1);
});
