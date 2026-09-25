import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
import { PUBLISHED_META_TIMEOUT_MS } from "../published-meta";
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

function event(id: string, platformCredential?: string, query = "") {
  return {
    params: { id },
    url: new URL(`https://tkaflowarts.com/sequence/${id}${query}`),
    platform: platformCredential
      ? { env: { FIREBASE_SERVICE_ACCOUNT_JSON: platformCredential } }
      : undefined,
  } as never;
}

const PUBLIC_ID = "0504bf05-d6a0-4b0f-871f-840a5a6e44ac";

function publicSequenceDoc() {
  return {
    name: `projects/test-project/databases/(default)/documents/publicSequences/${PUBLIC_ID}`,
    fields: toFirestoreFields({
      word: "TZΣ",
      ownerDisplayName: "Paul",
      steps: [{ letter: "T" }, { letter: "Z" }, { letter: "Σ" }],
    }),
  };
}

function notFound(): Response {
  return new Response(JSON.stringify({ error: { code: 404 } }), {
    status: 404,
  });
}

/** Resolves once `ms` of fake time has passed, flushing the lookup's microtasks. */
async function elapse(ms: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
}

describe("/sequence/[id] server load", () => {
  // Unauthenticated `publicSequences` reads go through global fetch.
  const publicFetch = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.clearAllMocks();
    // A fresh client per test also gives each test a fresh manifest cache,
    // which is keyed by client.
    mocks.getFirestoreRest.mockReturnValue({
      projectId: "test-project",
      getDocument: mocks.getDocument,
      listDocuments: mocks.listDocuments,
    });
    mocks.getDocument.mockResolvedValue(null);
    mocks.listDocuments.mockResolvedValue({ documents: [] });
    publicFetch.mockImplementation(async () => notFound());
    vi.stubGlobal("fetch", publicFetch);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
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

  it("reads a public sequence over unauthenticated REST, with no token-bearing client read", async () => {
    publicFetch.mockImplementation(async (input) =>
      String(input).includes(`/publicSequences/${PUBLIC_ID}?`)
        ? new Response(JSON.stringify(publicSequenceDoc()), { status: 200 })
        : notFound()
    );

    const result = await loadFixture(event(PUBLIC_ID, "service-account-json"));

    expect(result.meta).toMatchObject({
      word: "TZΣ",
      creator: "Paul",
      stepCount: 3,
      source: "public",
      letters: ["T", "Z", "Σ"],
    });
    expect(result.seo.title).toBe("TZΣ Flow Arts Sequence | Flow Arts Composer");
    const [url, init] = publicFetch.mock.calls[0]!;
    expect(String(url)).toContain(
      `projects/test-project/databases/(default)/documents/publicSequences/${PUBLIC_ID}?`
    );
    expect(new Headers(init?.headers).has("authorization")).toBe(false);
    expect(mocks.getDocument).not.toHaveBeenCalledWith(
      `publicSequences/${PUBLIC_ID}`
    );
  });

  it("skips every Firestore read for a /q scan handoff", async () => {
    const result = await loadFixture(
      event("K7QM", "service-account-json", "?from=scan&code=K7QM&bp=staff")
    );

    expect(mocks.getFirestoreRest).not.toHaveBeenCalled();
    expect(publicFetch).not.toHaveBeenCalled();
    expect(mocks.listDocuments).not.toHaveBeenCalled();
    expect(result.meta.source).toBe("unknown");
    expect(result.seo.indexable).toBe(false);
  });

  it("still looks up a short-code-shaped id that did not arrive through a scan", async () => {
    // 31 public sequence ids are 4-6 uppercase characters (2026-09-23), so the
    // shape alone cannot rule out a real record. A `code` that does not match
    // the route is not a scan handoff either.
    await loadFixture(
      event("AB12", "service-account-json", "?from=scan&code=ZZ99")
    );

    expect(String(publicFetch.mock.calls[0]?.[0])).toContain(
      "/publicSequences/AB12?"
    );
  });

  it("gives up after the timeout, aborts the read, and serves the fallback", async () => {
    vi.useFakeTimers();
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    let publicSignal: AbortSignal | null | undefined;
    publicFetch.mockImplementation((_input, init) => {
      publicSignal = init?.signal;
      return new Promise<Response>(() => {});
    });
    mocks.listDocuments.mockReturnValue(new Promise(() => {}));

    let settled = false;
    const pending = loadFixture(event(PUBLIC_ID, "service-account-json")).then(
      (result) => {
        settled = true;
        return result;
      }
    );

    await elapse(PUBLISHED_META_TIMEOUT_MS - 1);
    expect(settled).toBe(false);
    await elapse(1);
    const result = await pending;

    expect(result.meta.source).toBe("unknown");
    expect(result.seo.indexable).toBe(false);
    expect(publicSignal?.aborted).toBe(true);
    expect(consoleError).toHaveBeenCalledWith(
      `[sequence-seo] loadPublishedMeta failed for "${PUBLIC_ID}":`,
      `timed out after ${PUBLISHED_META_TIMEOUT_MS} ms`
    );
    consoleError.mockRestore();
  });

  it("lists the release manifests once per cache window, not once per request", async () => {
    mocks.listDocuments.mockResolvedValue({ documents: [manifestDoc()] });
    mocks.getDocument.mockImplementation(async (path: string) =>
      path === `catalogs/l1-tnd-motions/sequences/${SEQUENCE_ID}`
        ? catalogDoc()
        : null
    );

    const first = await loadFixture(event(SEQUENCE_ID, "service-account-json"));
    const second = await loadFixture(event(PUBLIC_ID, "service-account-json"));
    const third = await loadFixture(event(SEQUENCE_ID, "service-account-json"));

    expect(mocks.listDocuments).toHaveBeenCalledTimes(1);
    expect(first.meta.curated).toBe(true);
    expect(second.meta.curated).toBe(false);
    expect(third.meta).toMatchObject({ curated: true, source: "catalog" });
  });

  it("retries the manifest listing after a failure instead of caching it", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    mocks.listDocuments
      .mockRejectedValueOnce(new Error("listing unavailable"))
      .mockResolvedValue({ documents: [manifestDoc()] });
    mocks.getDocument.mockImplementation(async (path: string) =>
      path === `catalogs/l1-tnd-motions/sequences/${SEQUENCE_ID}`
        ? catalogDoc()
        : null
    );

    const failed = await loadFixture(event(SEQUENCE_ID, "service-account-json"));
    const recovered = await loadFixture(
      event(SEQUENCE_ID, "service-account-json")
    );

    expect(failed.meta.curated).toBe(false);
    expect(recovered.meta.curated).toBe(true);
    expect(mocks.listDocuments).toHaveBeenCalledTimes(2);
    consoleError.mockRestore();
  });
});
