import { describe, expect, it } from "vitest";
import { generateText, Output } from "ai";
import { z } from "zod";
import {
  createTikaDirectorModel,
  DEFAULT_OLLAMA_DIRECTOR_MODEL,
  isOllamaDirectorModel,
  isTikaDirectorModelConfigured,
  ollamaDirectorModelId,
} from "../../../src/lib/features/stage/services/server/tika-director-models";

describe("TIKA Director model selection", () => {
  it("recognises the local Ollama keys and their model ids", () => {
    expect(isOllamaDirectorModel("ollama")).toBe(true);
    expect(isOllamaDirectorModel("ollama:qwen3:8b")).toBe(true);
    expect(isOllamaDirectorModel("sonnet-5")).toBe(false);
    expect(ollamaDirectorModelId("ollama")).toBe(DEFAULT_OLLAMA_DIRECTOR_MODEL);
    expect(ollamaDirectorModelId("ollama:qwen3:8b")).toBe("qwen3:8b");
  });

  it("reports a key as configured only when its provider has what it needs", () => {
    expect(isTikaDirectorModelConfigured("ollama", {})).toBe(false);
    expect(
      isTikaDirectorModelConfigured("ollama", {
        ollamaBaseUrl: "http://127.0.0.1:11434",
      })
    ).toBe(true);
    expect(isTikaDirectorModelConfigured("sonnet-5", {})).toBe(false);
    expect(
      isTikaDirectorModelConfigured("sonnet-5", { anthropicApiKey: "k" })
    ).toBe(true);
    expect(
      isTikaDirectorModelConfigured("no-such-model", { anthropicApiKey: "k" })
    ).toBe(false);
  });

  it("resolves hosted keys through the shared TIKA model provider", () => {
    const model = createTikaDirectorModel("sonnet-5", { anthropicApiKey: "k" });
    expect(typeof model === "object" && model.modelId).toBe("claude-sonnet-5");
  });

  it("refuses the local key without a base URL", () => {
    expect(() => createTikaDirectorModel("ollama", {})).toThrow(
      /OLLAMA_BASE_URL/
    );
  });

  it("sends every local request greedy, seeded, and schema-constrained", async () => {
    const requests: { url: string; body: Record<string, unknown> }[] = [];
    const fetchStub: typeof fetch = async (input, init) => {
      requests.push({
        url: String(input),
        body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      });
      return new Response(
        JSON.stringify({
          id: "chatcmpl-1",
          object: "chat.completion",
          created: 0,
          model: DEFAULT_OLLAMA_DIRECTOR_MODEL,
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: '{"shape":"circle"}' },
              finish_reason: "stop",
            },
          ],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    };
    const model = createTikaDirectorModel("ollama", {
      ollamaBaseUrl: "http://127.0.0.1:11434/",
      fetch: fetchStub,
    });
    const result = await generateText({
      model,
      output: Output.object({ schema: z.object({ shape: z.string() }) }),
      // The hosted planner passes this; the local model must ignore it.
      providerOptions: { anthropic: { structuredOutputMode: "jsonTool" } },
      prompt: "circle",
    });
    expect(result.output).toEqual({ shape: "circle" });
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("http://127.0.0.1:11434/v1/chat/completions");
    expect(requests[0].body).toMatchObject({
      model: DEFAULT_OLLAMA_DIRECTOR_MODEL,
      seed: 7,
      temperature: 0,
      response_format: { type: "json_schema" },
    });
  });
});
