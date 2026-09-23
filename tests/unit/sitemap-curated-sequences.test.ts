import { beforeEach, describe, expect, it, vi } from "vitest";
import { toFirestoreFields } from "../../src/lib/shared/firestore/firestore-value-codec";

const mocks = vi.hoisted(() => ({
  listDocuments: vi.fn(),
  getFirestoreRest: vi.fn(),
}));

vi.mock("$lib/server/firestore/firestore-rest", async () => {
  const actual = await vi.importActual<
    typeof import("../../src/lib/server/firestore/firestore-rest")
  >("../../src/lib/server/firestore/firestore-rest");
  return {
    fromFirestoreFields: actual.fromFirestoreFields,
    getFirestoreRest: mocks.getFirestoreRest,
  };
});

import { GET } from "../../src/routes/sitemap.xml/+server";

function manifestDoc(name: string, sequenceIds: string[]) {
  return {
    name: `projects/test/databases/(default)/documents/deckReleases/counter/manifests/${name}`,
    fields: toFirestoreFields({
      sequences: sequenceIds.map((sequenceId) => ({ sequenceId })),
    }),
  };
}

function event(platformCredential?: string) {
  return {
    platform: platformCredential
      ? { env: { FIREBASE_SERVICE_ACCOUNT_JSON: platformCredential } }
      : undefined,
  } as never;
}

describe("sitemap.xml curated sequence URLs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getFirestoreRest.mockReturnValue({
      listDocuments: mocks.listDocuments,
    });
  });

  it("lists a card URL for every released sequenceId, resolved over the REST client with the platform credential", async () => {
    mocks.listDocuments.mockResolvedValue({
      documents: [
        manifestDoc("1", ["tnd-split-same-aaaa", "tnd-split-same-bbbb"]),
        manifestDoc("2", ["tnd-split-same-cccc"]),
      ],
    });

    const response = await GET(event("service-account-json"));
    const xml = await response.text();

    expect(response.status).toBe(200);
    expect(xml).toContain(
      "<loc>https://tkaflowarts.com/sequence/tnd-split-same-aaaa</loc>"
    );
    expect(xml).toContain(
      "<loc>https://tkaflowarts.com/sequence/tnd-split-same-bbbb</loc>"
    );
    expect(xml).toContain(
      "<loc>https://tkaflowarts.com/sequence/tnd-split-same-cccc</loc>"
    );
    expect(mocks.getFirestoreRest).toHaveBeenCalledWith(
      "service-account-json"
    );
    expect(mocks.listDocuments).toHaveBeenCalledWith(
      "deckReleases/counter/manifests",
      expect.objectContaining({ pageSize: 200 })
    );
  });

  it("de-duplicates a sequenceId released into more than one deck", async () => {
    mocks.listDocuments.mockResolvedValue({
      documents: [
        manifestDoc("1", ["tnd-split-same-aaaa"]),
        manifestDoc("2", ["tnd-split-same-aaaa"]),
      ],
    });

    const xml = await (await GET(event())).text();
    const occurrences = xml.split("sequence/tnd-split-same-aaaa").length - 1;
    expect(occurrences).toBe(1);
  });

  it("falls back to zero curated URLs and still serves a 200 sitemap when Firestore fails", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    mocks.listDocuments.mockRejectedValue(new Error("credential missing"));

    const response = await GET(event());
    const xml = await response.text();

    expect(response.status).toBe(200);
    expect(xml).not.toContain("<loc>https://tkaflowarts.com/sequence/");
    expect(xml).toContain("<loc>https://tkaflowarts.com/</loc>");
    expect(consoleError).toHaveBeenCalledWith(
      "[sitemap] getCuratedSequenceUrls failed:",
      "credential missing"
    );

    consoleError.mockRestore();
  });
});
