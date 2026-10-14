import { describe, expect, it, vi } from "vitest";
import type { HttpError, Redirect } from "@sveltejs/kit";

const fetchPublicCollectionLink = vi.hoisted(() =>
  vi.fn(async (code: string) =>
    code === "A1F8"
      ? { ownerId: "owner-1", collectionId: "collection-1" }
      : code === "DOWN"
        ? Promise.reject(new Error("Firestore REST returned 500"))
        : null
  )
);

vi.mock(
  "../../src/lib/shared/library/services/public-collection-link-reader",
  () => ({ fetchPublicCollectionLink })
);

import { GET } from "../../src/routes/c/[code]/+server";
import { normalizeCollectionShareCode } from "../../src/lib/shared/library/domain/collection-share-code";
import { buildShortCollectionUrl } from "../../src/lib/shared/browse/navigation/browse-route-resolver";

function requestEvent(code: string) {
  return { params: { code } } as never;
}

async function expectThrown(run: () => unknown): Promise<unknown> {
  try {
    await run();
  } catch (err) {
    return err;
  }
  throw new Error("Expected GET to throw");
}

describe("/c/[code]", () => {
  it("redirects a known code to the Explore detail path", async () => {
    const thrown = (await expectThrown(() =>
      GET(requestEvent("A1F8"))
    )) as Redirect;
    expect(thrown.status).toBe(302);
    expect(thrown.location).toBe(
      "/browse/explore/collections/owner-1/collection-1"
    );
  });

  it("resolves a lower-case code as its upper-case form", async () => {
    fetchPublicCollectionLink.mockClear();
    const thrown = (await expectThrown(() =>
      GET(requestEvent("a1f8"))
    )) as Redirect;
    expect(thrown.status).toBe(302);
    expect(fetchPublicCollectionLink).toHaveBeenCalledWith("A1F8");
  });

  it("404s an unknown code", async () => {
    const thrown = (await expectThrown(() =>
      GET(requestEvent("ZZZZ"))
    )) as HttpError;
    expect(thrown.status).toBe(404);
  });

  it("404s a malformed code without reading Firestore", async () => {
    fetchPublicCollectionLink.mockClear();
    const thrown = (await expectThrown(() =>
      GET(requestEvent("not-a-code"))
    )) as HttpError;
    expect(thrown.status).toBe(404);
    expect(fetchPublicCollectionLink).not.toHaveBeenCalled();
  });

  it("503s when the lookup itself fails", async () => {
    const thrown = (await expectThrown(() =>
      GET(requestEvent("DOWN"))
    )) as HttpError;
    expect(thrown.status).toBe(503);
  });
});

describe("collection share codes", () => {
  it("normalises pasted codes and rejects the rest", () => {
    expect(normalizeCollectionShareCode(" a1f8 ")).toBe("A1F8");
    expect(normalizeCollectionShareCode("ABCDEF")).toBe("ABCDEF");
    expect(normalizeCollectionShareCode("ABC")).toBeNull();
    expect(normalizeCollectionShareCode("ABCDEFG")).toBeNull();
    expect(normalizeCollectionShareCode("AB-C")).toBeNull();
    expect(normalizeCollectionShareCode("")).toBeNull();
  });

  it("builds the public short link on tkaflowarts.com", () => {
    expect(buildShortCollectionUrl("a1f8")).toBe(
      "https://tkaflowarts.com/c/A1F8"
    );
  });
});
