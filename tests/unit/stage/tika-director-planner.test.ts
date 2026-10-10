import { createAnthropic } from "@ai-sdk/anthropic";
import { describe, expect, it, vi } from "vitest";
import {
  TikaDirectorRequestSchema,
  type TikaDirectorResponse,
} from "#lib/features/stage/domain/tika-director.js";
import {
  planStageDirection,
  TIKA_DIRECTOR_SYSTEM_PROMPT,
} from "#lib/features/stage/services/server/tika-director-planner.js";

const request = {
  prompt: "Give everyone different props",
  conversation: [],
  scene: {
    id: "review",
    name: "Review",
    bpm: 120,
    currentBeat: 8,
    performers: [{ id: "a", label: "A", characterId: "x-bot", prop: "staff" }],
    formations: [],
  },
};

describe("TIKA Director provider boundary", () => {
  it.each<TikaDirectorResponse>([
    {
      kind: "apply",
      summary: "Assign distinct props.",
      actions: [{ type: "assign-distinct-props" }],
    },
    {
      kind: "apply",
      summary: "Assign a different library sequence to every performer.",
      actions: [{ type: "assign-distinct-sequences" }],
    },
    { kind: "clarify", question: "Over how many beats?" },
    { kind: "unsupported", message: "I cannot change the lighting yet." },
  ])(
    "sends a valid object tool schema and reads $kind through the real SDK adapter",
    async (response) => {
      const fetch = vi.fn(async (_url, init) => {
        const body = JSON.parse(init!.body as string);
        expect(body.tools[0].input_schema.type).toBe("object");
        expect(body.tools[0].input_schema.required).toContain("response");
        expect(body.tools[0].input_schema.properties.response).toBeDefined();
        return Response.json({
          id: "msg_test",
          type: "message",
          role: "assistant",
          model: "claude-haiku-4-5-20251001",
          content: [
            {
              type: "tool_use",
              id: "tool_test",
              name: "json",
              input: { response },
            },
          ],
          stop_reason: "tool_use",
          stop_sequence: null,
          usage: { input_tokens: 100, output_tokens: 20 },
        });
      });
      const provider = createAnthropic({ apiKey: "test-only", fetch });
      const result = await planStageDirection(
        provider("claude-haiku-4-5-20251001"),
        request
      );
      expect(result.response).toEqual(response);
      expect(fetch).toHaveBeenCalledTimes(1);
    }
  );

  it("tells the planner how presentation filtering works and when it fails", () => {
    expect(TIKA_DIRECTOR_SYSTEM_PROMPT).toMatch(/presentation/);
    expect(TIKA_DIRECTOR_SYSTEM_PROMPT).toMatch(/characterPresentationCounts/);
    expect(TIKA_DIRECTOR_SYSTEM_PROMPT).toMatch(
      /feminine.*masculine.*androgynous/s
    );
    expect(TIKA_DIRECTOR_SYSTEM_PROMPT).toMatch(/presentation:'feminine'/);
    expect(TIKA_DIRECTOR_SYSTEM_PROMPT).not.toMatch(
      /cannot filter avatars by gender/i
    );
    expect(TIKA_DIRECTOR_SYSTEM_PROMPT).toMatch(/still partial execution/);
  });

  it("accepts the full allowed prompt length when it becomes conversation history", () => {
    const prompt = "x".repeat(2_000);
    expect(
      TikaDirectorRequestSchema.safeParse({ ...request, prompt }).success
    ).toBe(true);
    expect(
      TikaDirectorRequestSchema.safeParse({
        ...request,
        conversation: [{ role: "user", content: prompt }],
      }).success
    ).toBe(true);
  });

  it("retains older constraints within the bounded conversation instead of dropping them", () => {
    const conversation = Array.from({ length: 40 }, (_, index) => ({
      role: "user",
      content: index === 0 ? "Never use fans." : "Keep that restriction.",
    }));
    const parsed = TikaDirectorRequestSchema.parse({
      ...request,
      conversation,
    });
    expect(parsed.conversation[0]?.content).toBe("Never use fans.");
    expect(
      TikaDirectorRequestSchema.safeParse({
        ...request,
        conversation: [...conversation, conversation[0]],
      }).success
    ).toBe(false);
  });

  it("retries malformed structured output once, never exposing the invalid plan", async () => {
    let calls = 0;
    const response = {
      kind: "unsupported",
      message: "Lighting changes are not supported.",
    };
    const fetch = vi.fn(async () => {
      calls++;
      return Response.json({
        id: "msg_retry",
        type: "message",
        role: "assistant",
        model: "claude-haiku-4-5-20251001",
        content: [
          {
            type: "tool_use",
            id: "tool_retry",
            name: "json",
            input: calls === 1 ? { response: { response } } : { response },
          },
        ],
        stop_reason: "tool_use",
        stop_sequence: null,
        usage: { input_tokens: 100, output_tokens: 20 },
      });
    });
    const result = await planStageDirection(
      createAnthropic({ apiKey: "test-only", fetch })(
        "claude-haiku-4-5-20251001"
      ),
      request
    );
    expect(result.response).toEqual(response);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("teaches the planner that distinct sequences draw from the library and cannot be named", () => {
    expect(TIKA_DIRECTOR_SYSTEM_PROMPT).toContain("assign-distinct-sequences");
    expect(TIKA_DIRECTOR_SYSTEM_PROMPT).toMatch(/librarySequenceCount/);
    expect(TIKA_DIRECTOR_SYSTEM_PROMPT).toMatch(
      /cannot (?:choose|select|pick) (?:a )?(?:named|specific)/i
    );
  });
});
