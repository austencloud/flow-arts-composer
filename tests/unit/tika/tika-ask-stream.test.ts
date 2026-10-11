import { beforeEach, describe, expect, it, vi } from "vitest";
import { MockLanguageModelV3 } from "ai/test";
import type { LanguageModelV3StreamPart } from "@ai-sdk/provider";
import type { RequestEvent } from "@sveltejs/kit";

const mocks = vi.hoisted(() => ({
  getModel: vi.fn(),
  isProviderConfigured: vi.fn(() => true),
  getTermDefinition: vi.fn(() => ({
    term: "alpha",
    definition: "Hands opposite.",
  })),
}));

vi.mock("$app/env/private", async () => {
  const { envModule } = await import("#test-helpers/env-module.js");
  return envModule();
});
vi.mock("#lib/server/auth/requireFirebaseUser.js", () => ({
  requireFirebaseUser: vi.fn(async () => ({ uid: "test-user" })),
}));
vi.mock("#lib/server/security/withRateLimit.js", () => ({
  withRateLimit: vi.fn(async () => null),
}));
vi.mock("#lib/features/tika/ai/system-prompts.js", () => ({
  buildSystemPrompt: () => "Answer using the available tools.",
}));
vi.mock("#lib/features/tika/services/server/tika-server-container.js", () => ({
  getTikaServerContainer: () => ({
    modelProvider: mocks,
    toolExecutor: { getTermDefinition: mocks.getTermDefinition },
  }),
}));

import { POST } from "../../../src/routes/api/tika/ask/+server";

function event(body: unknown): RequestEvent {
  return {
    request: new Request("http://localhost/api/tika/ask", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  } as RequestEvent;
}

function stream(parts: LanguageModelV3StreamPart[]) {
  return new ReadableStream<LanguageModelV3StreamPart>({
    start(controller) {
      for (const part of parts) controller.enqueue(part);
      controller.close();
    },
  });
}

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 10, text: 10, reasoning: 0 },
};
const textParts: LanguageModelV3StreamPart[] = [
  { type: "text-start", id: "answer" },
  { type: "text-delta", id: "answer", delta: "The two hands are opposite." },
  { type: "text-end", id: "answer" },
  { type: "finish", finishReason: { unified: "stop", raw: "end_turn" }, usage },
];

describe("TIKA main chat streaming", () => {
  beforeEach(() => vi.clearAllMocks());

  it("executes a tool and streams its result and the following answer through the real SDK", async () => {
    let calls = 0;
    const model = new MockLanguageModelV3({
      doStream: async () => ({
        stream: stream(
          calls++ === 0
            ? [
                {
                  type: "tool-call",
                  toolCallId: "definition",
                  toolName: "get_term_definition",
                  input: JSON.stringify({ term: "alpha" }),
                },
                {
                  type: "finish",
                  finishReason: { unified: "tool-calls", raw: "tool_use" },
                  usage,
                },
              ]
            : textParts
        ),
      }),
    });
    mocks.getModel.mockReturnValue(model);
    const response = await POST(event({ question: "Define alpha" }));
    const body = await response.text();
    expect(response.headers.get("x-vercel-ai-ui-message-stream")).toBe("v1");
    expect(body).toContain('"type":"tool-output-available"');
    expect(body).toContain("The two hands are opposite.");
    expect(mocks.getTermDefinition).toHaveBeenCalledWith("alpha");
    expect(mocks.getModel).toHaveBeenCalledWith("haiku");
    expect(model.doStreamCalls).toHaveLength(2);
    expect(
      model.doStreamCalls[1]?.prompt.some((message) => message.role === "tool")
    ).toBe(true);
  });

  it("can continue after stopping an answer during a tool call", async () => {
    const model = new MockLanguageModelV3({
      doStream: async () => ({ stream: stream(textParts) }),
    });
    mocks.getModel.mockReturnValue(model);
    const response = await POST(
      event({
        messages: [
          {
            id: "old",
            role: "assistant",
            parts: [
              {
                type: "tool-get_term_definition",
                toolCallId: "unfinished",
                state: "input-available",
                input: { term: "alpha" },
              },
            ],
          },
          {
            id: "new",
            role: "user",
            parts: [{ type: "text", text: "Try again" }],
          },
        ],
      })
    );
    await response.text();
    expect(JSON.stringify(model.doStreamCalls[0]?.prompt)).not.toContain(
      "unfinished"
    );
  });

  it("rejects an unknown model before any generation", async () => {
    const response = await POST(event({ question: "Hello", model: "typo" }));
    expect(response.status).toBe(400);
    expect(mocks.getModel).not.toHaveBeenCalled();
  });
});
