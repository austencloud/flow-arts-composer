import { beforeEach, describe, expect, it, vi } from "vitest";
import { toFirestoreFields } from "../../src/lib/shared/firestore/firestore-value-codec";

const mocks = vi.hoisted(() => ({
  // The Firestore data both read paths serve; tests set it per path.
  documentAt: vi.fn(),
  getDocument: vi.fn(),
  batchGetDocuments: vi.fn(),
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

const CATALOG_ID = "l1-tnd-motions";

function manifestDoc(name: string, sequenceIds: string[]) {
  return {
    name: `projects/test/databases/(default)/documents/deckReleases/counter/manifests/${name}`,
    fields: toFirestoreFields({
      sequences: sequenceIds.map((sequenceId) => ({
        sequenceId,
        sourceCatalogId: CATALOG_ID,
        stepCount: 4,
      })),
    }),
  };
}

/** A released catalog record; `author: null` is what renders a card noindex. */
function catalogDoc(word: string, author: string | null = "TKA System") {
  return {
    name: `projects/test/databases/(default)/documents/catalogs/${CATALOG_ID}/sequences/${word}`,
    fields: toFirestoreFields({ word, author, steps: [{}, {}, {}, {}] }),
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
      getDocument: mocks.getDocument,
      batchGetDocuments: mocks.batchGetDocuments,
      listDocuments: mocks.listDocuments,
    });
    mocks.getDocument.mockImplementation(async (path: string) =>
      mocks.documentAt(path)
    );
    mocks.batchGetDocuments.mockImplementation(
      async (paths: readonly string[]) =>
        new Map(paths.map((path) => [path, mocks.documentAt(path)]))
    );
    mocks.documentAt.mockImplementation((path: string) =>
      path.startsWith(`catalogs/${CATALOG_ID}/sequences/`)
        ? catalogDoc(path.split("/").pop() ?? "")
        : null
    );
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
    expect(mocks.getFirestoreRest).toHaveBeenCalledWith("service-account-json");
    expect(mocks.listDocuments).toHaveBeenCalledWith(
      "deckReleases/counter/manifests",
      expect.objectContaining({ pageSize: 200 })
    );
  });

  it("leaves out a released card the page would serve as noindex", async () => {
    mocks.listDocuments.mockResolvedValue({
      documents: [
        manifestDoc("1", ["tnd-split-same-aaaa", "hand-path-reference-ss"]),
      ],
    });
    mocks.documentAt.mockImplementation((path: string) => {
      if (path.endsWith("/tnd-split-same-aaaa")) return catalogDoc("AAAA");
      if (path.endsWith("/hand-path-reference-ss")) {
        return catalogDoc("Split-Same", null);
      }
      return null;
    });

    const xml = await (await GET(event())).text();

    expect(xml).toContain("sequence/tnd-split-same-aaaa</loc>");
    expect(xml).not.toContain("hand-path-reference-ss");
  });

  it("resolves every released card in a fixed number of Firestore requests", async () => {
    // Past Cloudflare's 50-subrequest cap on Workers Free: one read per card
    // would fail every fetch after the 50th and silently drop those cards.
    const ids = Array.from({ length: 60 }, (_, i) => `tnd-card-${i}`);
    mocks.listDocuments.mockResolvedValue({
      documents: [
        manifestDoc("1", ids.slice(0, 30)),
        manifestDoc("2", ids.slice(30)),
      ],
    });

    const xml = await (await GET(event("service-account-json"))).text();

    for (const id of ids) expect(xml).toContain(`sequence/${id}</loc>`);
    expect(mocks.batchGetDocuments).toHaveBeenCalledTimes(1);
    expect(mocks.getDocument).not.toHaveBeenCalled();
  });

  it("falls back to a card's public copy in one more batch when no catalog record exists", async () => {
    mocks.listDocuments.mockResolvedValue({
      documents: [manifestDoc("1", ["user-made-word", "tnd-split-same-aaaa"])],
    });
    mocks.documentAt.mockImplementation((path: string) => {
      if (path === `catalogs/${CATALOG_ID}/sequences/tnd-split-same-aaaa`) {
        return catalogDoc("AAAA");
      }
      if (path === "publicSequences/user-made-word") {
        return {
          name: "projects/test/databases/(default)/documents/publicSequences/user-made-word",
          fields: toFirestoreFields({
            word: "WORD",
            ownerDisplayName: "A Creator",
            steps: [{}, {}],
          }),
        };
      }
      return null;
    });

    const xml = await (await GET(event("service-account-json"))).text();

    expect(xml).toContain("sequence/user-made-word</loc>");
    expect(xml).toContain("sequence/tnd-split-same-aaaa</loc>");
    expect(mocks.batchGetDocuments).toHaveBeenCalledTimes(2);
    expect(mocks.batchGetDocuments.mock.calls[1]?.[0]).toEqual([
      "publicSequences/user-made-word",
    ]);
    expect(mocks.getDocument).not.toHaveBeenCalled();
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
