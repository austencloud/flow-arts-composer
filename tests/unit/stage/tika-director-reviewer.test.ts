import { createAnthropic } from "@ai-sdk/anthropic";
import { describe, expect, it, vi } from "vitest";
import { reviewStageDirection } from "#lib/features/stage/services/server/tika-director-reviewer.js";
import type { TikaDirectorResponse } from "#lib/features/stage/domain/tika-director.js";

const request = {
  prompt: "Okay, make every prop different.",
  conversation: [{ role: "user" as const, content: "Never use fans." }],
  scene: {
    id: "test",
    name: "Test",
    bpm: 120,
    currentBeat: 0,
    performers: [],
    formations: [],
  },
};
const proposal: TikaDirectorResponse = {
  kind: "apply",
  summary: "Assign different props.",
  actions: [{ type: "assign-distinct-props" }],
};

describe("TIKA Director independent review", () => {
  it.each(["accept", "clarify", "unsupported"] as const)(
    "%s can only keep or veto the original actions",
    async (verdict) => {
      const fetch = vi.fn(async (_url, init) => {
        const body = JSON.parse(init!.body as string);
        expect(body.tools[0].input_schema.type).toBe("object");
        expect(body.messages[0].content[0].text).toContain("Never use fans.");
        return Response.json({
          id: "msg_review",
          type: "message",
          role: "assistant",
          model: "claude-sonnet-5",
          content: [
            {
              type: "tool_use",
              id: "tool_review",
              name: "json",
              input: { verdict, message: "May I include fans?" },
            },
          ],
          stop_reason: "tool_use",
          stop_sequence: null,
          usage: { input_tokens: 50, output_tokens: 10 },
        });
      });
      const provider = createAnthropic({ apiKey: "test-only", fetch });
      const result = await reviewStageDirection(
        provider("claude-sonnet-5"),
        request,
        proposal
      );
      if (verdict === "accept") expect(result.response).toBe(proposal);
      else {
        expect(result.response.kind).toBe(verdict);
        expect(result.response).not.toHaveProperty("actions");
      }
    }
  );

  it("does not spend a review call on a non-mutating answer", async () => {
    const fetch = vi.fn();
    const response: TikaDirectorResponse = {
      kind: "clarify",
      question: "How many beats?",
    };
    const result = await reviewStageDirection(
      createAnthropic({ apiKey: "test-only", fetch })("claude-sonnet-5"),
      request,
      response
    );
    expect(result.response).toBe(response);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("tells the reviewer what assign-distinct-sequences can and cannot do", async () => {
    let system = "";
    const fetch = vi.fn(async (_url, init) => {
      const body = JSON.parse(init!.body as string);
      system = Array.isArray(body.system)
        ? body.system.map((part: { text: string }) => part.text).join("\n")
        : body.system;
      return Response.json({
        id: "msg_review",
        type: "message",
        role: "assistant",
        model: "claude-sonnet-5",
        content: [
          {
            type: "tool_use",
            id: "tool_review",
            name: "json",
            input: { verdict: "accept", message: "ok" },
          },
        ],
        stop_reason: "tool_use",
        stop_sequence: null,
        usage: { input_tokens: 50, output_tokens: 10 },
      });
    });
    const provider = createAnthropic({ apiKey: "test-only", fetch });
    const sequences: TikaDirectorResponse = {
      kind: "apply",
      summary: "Assign a different library sequence to every performer.",
      actions: [{ type: "assign-distinct-sequences" }],
    };
    const result = await reviewStageDirection(
      provider("claude-sonnet-5"),
      { ...request, scene: { ...request.scene, librarySequenceCount: 5 } },
      sequences
    );
    expect(result.response).toBe(sequences);
    expect(system).toContain("assign-distinct-sequences");
    expect(system).toMatch(/librarySequenceCount/);
    expect(system).toMatch(/presentation/);
    expect(system).toMatch(/count per label was already checked/);
    expect(system).not.toMatch(/cannot filter gender/);
  });
});
