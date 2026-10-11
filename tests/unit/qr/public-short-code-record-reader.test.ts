import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPublicShortCodeRecord } from "#lib/shared/qr/services/public-short-code-record-reader.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("public short-code record reader", () => {
  it("decodes the complete public Firestore REST document", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({
        fields: {
          sequence: { stringValue: "CLUB" },
          encoded: { stringValue: "s~payload" },
          payloadStepCount: { integerValue: "4" },
          sequenceData: {
            mapValue: {
              fields: {
                steps: {
                  arrayValue: {
                    values: [
                      {
                        mapValue: {
                          fields: { letter: { stringValue: "C" } },
                        },
                      },
                    ],
                  },
                },
              },
            },
          },
        },
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const record = await fetchPublicShortCodeRecord("A/B", {
      projectId: "test-project",
      timeoutMs: 900,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "/projects/test-project/databases/(default)/documents/shortcodes/A%2FB?"
      ),
      expect.objectContaining({
        headers: { accept: "application/json" },
        signal: expect.any(AbortSignal),
      })
    );
    expect(record).toMatchObject({
      sequence: "CLUB",
      encoded: "s~payload",
      payloadStepCount: 4,
      sequenceData: { steps: [{ letter: "C" }] },
    });
  });

  it("returns null for an unknown code", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 404,
        statusText: "Not Found",
      }))
    );

    await expect(fetchPublicShortCodeRecord("NOPE")).resolves.toBeNull();
  });
});
