/**
 * The JSON cache's failure rules. These are invisible in the UI: a regression
 * shows up only as exception spam in PostHog (one per arrow) or as a page that
 * never recovers from one bad request.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  JsonLoadError,
  SimpleJsonCache,
  isJsonLoadFailure,
} from "../simple-json-cache";
import { setPageLeavingForTests } from "#lib/shared/net/asset-fetch.js";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("SimpleJsonCache failures", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    setPageLeavingForTests(false);
    fetchMock.mockReset();
    errorSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it("stays quiet when the page unloads under a fetch", async () => {
    setPageLeavingForTests(true);
    fetchMock.mockRejectedValue(
      new TypeError("NetworkError when attempting to fetch resource.")
    );
    const cache = new SimpleJsonCache();

    const error = await cache.get("/a.json").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(JsonLoadError);
    expect((error as JsonLoadError).kind).toBe("cancelled");
    expect(errorSpy).not.toHaveBeenCalled();
    // An unloading page does not spend a retry.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports a real failure once per path, then retries and recovers", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const cache = new SimpleJsonCache();

    for (let i = 0; i < 3; i++) {
      const error = await cache.get("/b.json").catch((e: unknown) => e);
      expect((error as JsonLoadError).kind).toBe("failed");
    }
    expect(errorSpy).toHaveBeenCalledTimes(1);

    // The failure was not kept: the next lookup fetches again.
    fetchMock.mockResolvedValue(jsonResponse({ ok: 1 }));
    await expect(cache.get("/b.json")).resolves.toEqual({ ok: 1 });
  });

  it("does not log a missing file", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 404 }));
    const cache = new SimpleJsonCache();

    const error = await cache.get("/c.json").catch((e: unknown) => e);

    expect((error as JsonLoadError).kind).toBe("missing");
    expect((error as Error).message).toBe("File not found: /c.json");
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("finds a load failure through a rethrown cause chain", () => {
    const root = new JsonLoadError("/d.json", "failed", "JSON load failed");
    const wrapped = new Error("outer", {
      cause: new Error("middle", { cause: root }),
    });
    expect(isJsonLoadFailure(wrapped)).toBe(true);
    expect(isJsonLoadFailure(new Error("unrelated"))).toBe(false);
  });
});
