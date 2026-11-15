import { describe, expect, it, vi } from "vitest";

// The adapters validate whole publications; this test is about the visit's
// memory, so they are replaced with stand-ins.
vi.mock(
  "#lib/features/mandala/tabs/collection/domain/mandala-public-revision.js",
  () => ({
    mandalaPublicPayloadFromArtifact: (payload: unknown) => payload ?? null,
  })
);
vi.mock(
  "#lib/features/tunnel-collection/domain/tunnel-public-revision.js",
  () => ({
    collectedTunnelFromPublicArtifact: (_e: unknown, payload: unknown) =>
      payload ?? null,
  })
);
vi.mock("#lib/shared/artifact-revisions/services/public-artifact-loader.js", () => ({
  getPublicArtifactDetail: vi.fn(),
}));

import { createVisualPieceLoader } from "./visual-piece-loader.js";

function detail(id: string, payload: unknown = { steps: [] }) {
  return {
    envelope: { artifactId: id, artifactType: "mandala" },
    revision: { payload },
  } as never;
}

describe("createVisualPieceLoader", () => {
  it("asks once for a piece, even when asked twice at the same time", async () => {
    const fetchDetail = vi.fn(async (id: string) => detail(id));
    const loader = createVisualPieceLoader(fetchDetail);
    const [a, b] = await Promise.all([loader.load("x"), loader.load("x")]);
    expect(a).toEqual(b);
    expect(fetchDetail).toHaveBeenCalledTimes(1);
  });

  it("keeps a loaded piece for the visit and makes no new query", async () => {
    const fetchDetail = vi.fn(async (id: string) => detail(id));
    const loader = createVisualPieceLoader(fetchDetail);
    expect(loader.peek("x")).toBeUndefined();
    await loader.load("x");
    expect(loader.peek("x")?.kind).toBe("mandala");
    await loader.load("x");
    expect(fetchDetail).toHaveBeenCalledTimes(1);
  });

  it("reports a withdrawn piece and an invalid one, and keeps neither", async () => {
    const fetchDetail = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(detail("y", null))
      .mockResolvedValueOnce(detail("y"));
    const loader = createVisualPieceLoader(fetchDetail);
    expect(await loader.load("y")).toEqual({ status: "missing" });
    expect(await loader.load("y")).toEqual({ status: "invalid" });
    expect((await loader.load("y")).status).toBe("ok");
    expect(fetchDetail).toHaveBeenCalledTimes(3);
  });

  it("does not keep a failed request", async () => {
    const fetchDetail = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(detail("z"));
    const loader = createVisualPieceLoader(fetchDetail);
    await expect(loader.load("z")).rejects.toThrow("offline");
    expect((await loader.load("z")).status).toBe("ok");
  });
});
