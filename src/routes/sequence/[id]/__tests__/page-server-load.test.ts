import { beforeEach, describe, expect, it, vi } from "vitest";
import { toFirestoreFields } from "../../../../lib/shared/firestore/firestore-value-codec";

const mocks = vi.hoisted(() => ({
  getDocument: vi.fn(),
  listDocuments: vi.fn(),
  getFirestoreRest: vi.fn(),
}));

vi.mock("$lib/server/firestore/firestore-rest", async () => {
  const actual = await vi.importActual<
    typeof import("../../../../lib/server/firestore/firestore-rest")
  >("../../../../lib/server/firestore/firestore-rest");
  return {
    fromFirestoreFields: actual.fromFirestoreFields,
    getFirestoreRest: mocks.getFirestoreRest,
  };
});

import { load } from "../+page.server";
import type { SequenceRouteMeta, SequenceSeoDocument } from "../sequence-seo";

// svelte-check resolves `PageServerLoad`'s generic return type from the
// generated `./$types` module only inside SvelteKit's own build graph; called
// directly here it degrades to `void | (...)`. Casting through the route's
// own exported shapes (same pattern as
// src/routes/(public)/atlas/glossary-taxonomy.test.ts) keeps the assertions
// type-checked against the real contract instead of widening to `any`.
async function loadFixture(
  event: Parameters<typeof load>[0]
): Promise<{ meta: SequenceRouteMeta; seo: SequenceSeoDocument }> {
  return (await load(event)) as unknown as {
    meta: SequenceRouteMeta;
    seo: SequenceSeoDocument;
  };
}

const SEQUENCE_ID = "tnd-split-same-aaaa";

function manifestDoc() {
  return {
    name: "projects/test/databases/(default)/documents/deckReleases/counter/manifests/4",
    fields: toFirestoreFields({
      name: "TKA 1: Learning Letters (Base Motions)",
      deckNumber: 4,
      sequences: [
        {
          sequenceId: SEQUENCE_ID,
          word: "AAAA",
          variation: 1,
          position: 12,
          sourceCatalogId: "l1-tnd-motions",
          stepCount: 4,
          footer: null,
        },
      ],
    }),
  };
}

function catalogDoc() {
  return {
    name: `projects/test/databases/(default)/documents/catalogs/l1-tnd-motions/sequences/${SEQUENCE_ID}`,
    fields: toFirestoreFields({
      word: "AAAA",
      ownerDisplayName: "TKA System",
      level: 1,
      steps: [{ letter: "A" }, { letter: "A" }, { letter: "A" }, { letter: "A" }],
      thumbnails: [
        "https://firebasestorage.googleapis.com/v0/b/example/o/card.png?alt=media",
      ],
    }),
  };
}

function event(id: string, platformCredential?: string) {
  return {
    params: { id },
    url: new URL(`https://tkaflowarts.com/sequence/${id}`),
    platform: platformCredential
      ? { env: { FIREBASE_SERVICE_ACCOUNT_JSON: platformCredential } }
      : undefined,
  } as never;
}

describe("/sequence/[id] server load", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getFirestoreRest.mockReturnValue({
      getDocument: mocks.getDocument,
      listDocuments: mocks.listDocuments,
    });
    mocks.getDocument.mockResolvedValue(null);
    mocks.listDocuments.mockResolvedValue({ documents: [] });
  });

  it("resolves a released card's real metadata over the REST client using the platform credential", async () => {
    mocks.listDocuments.mockResolvedValue({ documents: [manifestDoc()] });
    mocks.getDocument.mockImplementation(async (path: string) => {
      if (path === `catalogs/l1-tnd-motions/sequences/${SEQUENCE_ID}`) {
        return catalogDoc();
      }
      return null;
    });

    const result = await loadFixture(event(SEQUENCE_ID, "service-account-json"));

    expect(mocks.getFirestoreRest).toHaveBeenCalledWith(
      "service-account-json"
    );
    expect(result.meta).toMatchObject({
      word: "AAAA",
      creator: "TKA System",
      stepCount: 4,
      curated: true,
      source: "catalog",
      catalogId: "l1-tnd-motions",
      deckName: "TKA 1: Learning Letters (Base Motions)",
      deckNumber: 4,
      letters: ["A", "A", "A", "A"],
    });
    expect(result.meta.thumbnailUrl).toContain(
      "firebasestorage.googleapis.com"
    );
    expect(result.seo.indexable).toBe(true);
    expect(result.seo.canonical).toBe(
      `https://tkaflowarts.com/sequence/${SEQUENCE_ID}`
    );
  });

  it("falls back to unverified meta and logs with context instead of throwing when Firestore fails", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    mocks.listDocuments.mockRejectedValue(new Error("credential missing"));

    const result = await loadFixture(event(SEQUENCE_ID));

    expect(result.meta.curated).toBe(false);
    expect(result.meta.source).toBe("unknown");
    expect(result.seo.indexable).toBe(false);
    expect(consoleError).toHaveBeenCalledWith(
      `[sequence-seo] loadPublishedMeta failed for "${SEQUENCE_ID}":`,
      "credential missing"
    );

    consoleError.mockRestore();
  });
});
