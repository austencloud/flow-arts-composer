import { beforeEach, describe, expect, it, vi } from "vitest";

const loadPublishedMeta = vi.hoisted(() => vi.fn());

vi.mock("../../src/routes/sequence/[id]/published-meta", async () => {
  const actual = await vi.importActual<
    typeof import("../../src/routes/sequence/[id]/published-meta")
  >("../../src/routes/sequence/[id]/published-meta");
  return { ...actual, loadPublishedMeta };
});

import { load } from "../../src/routes/embed/sequence/[id]/+page.server";

type EmbedData = {
  meta: { source: string; catalogId: string | null; word: string | null };
  title: string;
};

function run(id: string, platformCredential?: string) {
  return load({
    params: { id },
    url: new URL(`https://tkaflowarts.com/embed/sequence/${id}`),
    platform: platformCredential
      ? { env: { FIREBASE_SERVICE_ACCOUNT_JSON: platformCredential } }
      : undefined,
  } as never) as Promise<EmbedData>;
}

describe("/embed/sequence/[id] load", () => {
  beforeEach(() => {
    loadPublishedMeta.mockReset();
  });

  it("hands the viewer the released catalog meta it needs to open the sequence", async () => {
    loadPublishedMeta.mockImplementation(async (_id, fallback) => ({
      ...fallback,
      word: "AAAA",
      source: "catalog",
      catalogId: "l1-tnd-motions",
      curated: true,
    }));

    const data = await run("tnd-split-same-aaaa", "service-account-json");

    expect(loadPublishedMeta).toHaveBeenCalledWith(
      "tnd-split-same-aaaa",
      expect.objectContaining({ source: "unknown" }),
      "service-account-json"
    );
    expect(data.meta.source).toBe("catalog");
    expect(data.meta.catalogId).toBe("l1-tnd-motions");
    expect(data.title).toBe("AAAA — Flow Arts Composer");
  });

  it("does not look up an inline-encoded id, which has no published record", async () => {
    const data = await run("s~q1:abc|def");

    expect(loadPublishedMeta).not.toHaveBeenCalled();
    expect(data.meta.source).toBe("unknown");
    expect(data.title).toBe("Flow Arts Composer sequence player");
  });
});
