import { afterEach, describe, expect, it, vi } from "vitest";
import {
  TikaAuthError,
  callTikaStreaming,
  readTikaStream,
  requireTikaIdToken,
  resolveTikaEndpoint,
} from "../../../scripts/tika/lib/stream-client.mjs";

// Hand-built UI message stream in the wire format result.toUIMessageStreamResponse()
// sends: one SSE `data:` event per chunk, closed by `data: [DONE]`.
function sse(chunks: unknown[]): string {
  return (
    chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join("") +
    "data: [DONE]\n\n"
  );
}

function body(text: string): ReadableStream<Uint8Array> {
  return new Response(text).body!;
}

const toolAnswer = sse([
  { type: "start", messageId: "msg-1" },
  { type: "start-step" },
  { type: "text-start", id: "t1" },
  { type: "text-delta", id: "t1", delta: "Let me " },
  { type: "text-delta", id: "t1", delta: "check." },
  { type: "text-end", id: "t1" },
  {
    type: "tool-input-start",
    toolCallId: "call-1",
    toolName: "get_letter_explanation",
  },
  {
    type: "tool-input-delta",
    toolCallId: "call-1",
    inputTextDelta: '{"letter":',
  },
  { type: "tool-input-delta", toolCallId: "call-1", inputTextDelta: '"A"}' },
  {
    type: "tool-input-available",
    toolCallId: "call-1",
    toolName: "get_letter_explanation",
    input: { letter: "A" },
  },
  {
    type: "tool-output-available",
    toolCallId: "call-1",
    output: { letter: "A", type: 1 },
  },
  { type: "finish-step" },
  { type: "start-step" },
  { type: "text-start", id: "t2" },
  { type: "text-delta", id: "t2", delta: "A is a Type 1 " },
  { type: "text-delta", id: "t2", delta: "letter." },
  { type: "text-end", id: "t2" },
  { type: "finish-step" },
  { type: "finish", finishReason: "stop" },
]);

describe("readTikaStream", () => {
  it("joins text blocks and pairs each tool call with its output", async () => {
    const parsed = await readTikaStream(body(toolAnswer));

    expect(parsed.fullText).toBe("Let me check.\n\nA is a Type 1 letter.");
    expect(parsed.toolCalls).toEqual([
      {
        id: "call-1",
        name: "get_letter_explanation",
        input: { letter: "A" },
        result: { letter: "A", type: 1 },
        error: null,
      },
    ]);
    expect(parsed.finishReason).toBe("stop");
    expect(parsed.errors).toEqual([]);
  });

  it("keeps tool failures and stream errors instead of dropping them", async () => {
    const parsed = await readTikaStream(
      body(
        sse([
          { type: "start" },
          {
            type: "tool-input-available",
            toolCallId: "call-2",
            toolName: "list_letters_by_type",
            input: { type: 9 },
          },
          {
            type: "tool-output-error",
            toolCallId: "call-2",
            errorText: "No type 9",
          },
          { type: "error", errorText: "Provider overloaded" },
          { type: "finish", finishReason: "error" },
        ])
      )
    );

    expect(parsed.fullText).toBe("");
    expect(parsed.toolCalls).toEqual([
      {
        id: "call-2",
        name: "list_letters_by_type",
        input: { type: 9 },
        result: null,
        error: "No type 9",
      },
    ]);
    expect(parsed.errors).toContain("Provider overloaded");
    expect(parsed.finishReason).toBe("error");
  });
});

describe("TIKA request setup", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defaults to the HTTPS dev server and honours TIKA_BASE_URL", () => {
    expect(resolveTikaEndpoint({})).toBe("https://localhost:5173/api/tika/ask");
    expect(
      resolveTikaEndpoint({ TIKA_BASE_URL: "https://dev.tkaflowarts.com" })
    ).toBe("https://dev.tkaflowarts.com/api/tika/ask");
  });

  it("requires an ID token and accepts one pasted with its Bearer prefix", () => {
    expect(() => requireTikaIdToken({})).toThrow(TikaAuthError);
    expect(requireTikaIdToken({ TIKA_ID_TOKEN: " Bearer abc.def.ghi " })).toBe(
      "abc.def.ghi"
    );
  });

  it("sends the token and reads the streamed answer", async () => {
    const fetchMock = vi.fn(
      async () => new Response(toolAnswer, { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await callTikaStreaming("What is A?", 1, ["1.1"], {
      env: { TIKA_ID_TOKEN: "abc.def.ghi" },
    });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://localhost:5173/api/tika/ask");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer abc.def.ghi"
    );
    expect(JSON.parse(init.body as string)).toMatchObject({
      messages: [
        { role: "user", parts: [{ type: "text", text: "What is A?" }] },
      ],
      completedConcepts: ["1.1"],
    });
    expect(result.explanation).toBe("Let me check.\n\nA is a Type 1 letter.");
    expect(result.toolsCalled.map((t: { name: string }) => t.name)).toEqual([
      "get_letter_explanation",
    ]);
  });

  it("reports the route's 500 sign-in failure as an auth error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ error: "Missing Authorization Bearer token" }),
            {
              status: 500,
            }
          )
      )
    );

    await expect(
      callTikaStreaming("What is A?", 1, [], {
        env: { TIKA_ID_TOKEN: "stale" },
      })
    ).rejects.toBeInstanceOf(TikaAuthError);
  });
});
