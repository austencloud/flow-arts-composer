import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import type { ThumbnailRenderInput } from "$lib/shared/browse/services/thumbnail-key-deriver";

vi.mock("$lib/shared/analytics/thumbnail-analytics", () => ({
  captureThumbnailRenderFailure: vi.fn(),
}));

vi.mock("$lib/shared/browse/services/cloud-thumbnail-cache", () => ({
  getCachedUrl: () => null,
  getUrl: vi.fn(async () => null),
  upload: vi.fn(async () => null),
  clearMemoryCache: () => {},
  invalidateUrl: () => {},
  markMissing: vi.fn(),
}));

const sequence = (id: string): SequenceData =>
  ({ id, word: id, steps: [] }) as unknown as SequenceData;

const input = (id: string): ThumbnailRenderInput => ({
  sequenceName: id,
  sequenceId: id,
  leftPropType: PropType.STAFF,
  rightPropType: PropType.STAFF,
  catDogModeEnabled: false,
  lightMode: false,
  variant: "gallery",
});

async function createOrchestrator() {
  const [{ ThumbnailRenderOrchestrator }, { ThumbnailRenderQueue }] =
    await Promise.all([
      import("$lib/shared/browse/services/thumbnail-render-orchestrator"),
      import("$lib/shared/browse/services/thumbnail-render-queue"),
    ]);
  return new ThumbnailRenderOrchestrator(
    new ThumbnailRenderQueue(),
    {
      render: vi.fn(async () => ({
        blob: new Blob(["rendered"], { type: "image/webp" }),
        qrConsistent: true,
      })),
    } as never,
    { get: vi.fn(async () => null), set: vi.fn(async () => {}) } as never
  );
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:rendered");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("static thumbnail manifest retries", () => {
  it("retries after a transient failure instead of caching an empty manifest", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ keys: [] }), { status: 200 })
      );
    vi.stubGlobal("fetch", fetchMock);
    const orchestrator = await createOrchestrator();

    await orchestrator.getThumbnail({
      sequence: sequence("AB"),
      input: input("AB"),
    });
    await vi.advanceTimersByTimeAsync(5_000);
    await orchestrator.getThumbnail({
      sequence: sequence("CD"),
      input: input("CD"),
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("caches a successful empty manifest", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ keys: [] }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);
    const orchestrator = await createOrchestrator();

    await orchestrator.getThumbnail({
      sequence: sequence("EF"),
      input: input("EF"),
    });
    await orchestrator.getThumbnail({
      sequence: sequence("GH"),
      input: input("GH"),
    });

    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("coalesces concurrent manifest requests", async () => {
    let resolveFetch!: (response: Response) => void;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        })
    );
    vi.stubGlobal("fetch", fetchMock);
    const orchestrator = await createOrchestrator();

    const first = orchestrator.getThumbnail({
      sequence: sequence("IJ"),
      input: input("IJ"),
    });
    const second = orchestrator.getThumbnail({
      sequence: sequence("KL"),
      input: input("KL"),
    });
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledOnce();

    resolveFetch(new Response(JSON.stringify({ keys: [] }), { status: 200 }));
    await Promise.all([first, second]);
  });
});
