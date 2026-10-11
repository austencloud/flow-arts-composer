/**
 * Voice Command API Endpoint (Tier 2 Intent Resolution)
 *
 * Receives a voice transcript that the regex-based interpreter couldn't parse
 * and uses Haiku to resolve it into a structured VoiceCommand.
 *
 * Uses generateObject() from Vercel AI SDK for constrained JSON output.
 * Model: Haiku 4.5 (fast, cheap, structured output).
 *
 * Typical latency: ~300-400ms. Cost: ~$0.0004 per call.
 */

import type { RequestHandler } from "@sveltejs/kit";
import { generateObject, jsonSchema } from "ai";
import * as env from "$app/env/private";
import { requireFirebaseUser } from "#lib/server/auth/requireFirebaseUser.js";
import { RATE_LIMITS } from "#lib/server/security/rate-limiter.js";
import { withRateLimit } from "#lib/server/security/withRateLimit.js";
import { getTikaServerContainer } from "#lib/features/tika/services/server/tika-server-container.js";
import { buildVoiceCommandPrompt } from "#lib/shared/voice-control/ai/voice-command-prompt.js";
import type { VoiceCommandRequest, VoiceCommandResponse } from "#lib/shared/voice-control/domain/intent-resolution-types.js";

// ═══════════════════════════════════════════════════════════════════════════
// JSON Schema for structured LLM output
// ═══════════════════════════════════════════════════════════════════════════

const voiceCommandSchema = jsonSchema<VoiceCommandResponse>({
  type: "object",
  properties: {
    commands: {
      type: "array",
      items: {
        type: "object",
        properties: {
          category: {
            type: "string",
            enum: [
              "navigation", "settings", "playback", "create",
              "generator", "sequence", "ui", "search", "prop", "system",
            ],
          },
          action: { type: "string" },
          target: { type: "string" },
          args: {
            type: "object",
            additionalProperties: true,
          },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
        required: ["category", "action", "target", "confidence"],
      },
    },
    escalateToChat: { type: "boolean" },
    confidence: { type: "number", minimum: 0, maximum: 1 },
  },
  required: ["commands", "escalateToChat", "confidence"],
});

// ═══════════════════════════════════════════════════════════════════════════
// Request Handler
// ═══════════════════════════════════════════════════════════════════════════

export const POST: RequestHandler = async (event) => {
  try {
    // Require authenticated user - prevents unauthorized AI API usage
    const caller = await requireFirebaseUser(event);

    const blocked = await withRateLimit(event, RATE_LIMITS.AI_CHAT, "user", caller.uid);
    if (blocked) return blocked;

    const body: VoiceCommandRequest = await event.request.json();

    if (!body.transcript || typeof body.transcript !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing transcript" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const container = getTikaServerContainer({
      anthropicApiKey: env.ANTHROPIC_API_KEY || "",
      deepseekApiKey: env.DEEPSEEK_API_KEY || "",
    });

    if (!container.modelProvider.isProviderConfigured("anthropic")) {
      return new Response(
        JSON.stringify({ error: "Anthropic API key not configured" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    const currentModule = body.currentModule || "browse";
    const currentTab = body.currentTab || "";

    const systemPrompt = buildVoiceCommandPrompt(
      currentModule,
      currentTab,
      body.previousCommand,
    );

    const userMessage = `Voice command: "${body.transcript}"`;

    const result = await generateObject({
      model: container.modelProvider.getModel("haiku"),
      schema: voiceCommandSchema,
      schemaName: "VoiceCommandResponse",
      schemaDescription: "Structured voice command interpretation",
      system: systemPrompt,
      prompt: userMessage,
    });

    const response: VoiceCommandResponse = result.object;

    return new Response(JSON.stringify(response), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[Voice Command API] Error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
};
