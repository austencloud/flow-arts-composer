import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG } from "#lib/shared/sequence-viewer/tunnel/tunnel-config.js";
import type { CollectedTunnel } from "../../domain/tunnel-collection-types";

const mocks = vi.hoisted(() => ({
  collection: [] as CollectedTunnel[],
  renderTunnelPoster: vi.fn(),
  updatePresentation: vi.fn(),
}));

vi.mock("../tunnel-discovery-poster", () => ({
  renderTunnelPoster: mocks.renderTunnelPoster,
}));

vi.mock("../../state/tunnel-collection-state.svelte", () => ({
  tunnelCollectionState: {
    get collection() {
      return mocks.collection;
    },
    updatePresentation: mocks.updatePresentation,
  },
}));

function tunnel(id: string, revision: string): CollectedTunnel {
  return {
    id,
    name: id,
    steps: [],
    poster: "data:image/webp;base64,old",
    posterRenderVersion: undefined,
    createdAt: 1,
    currentRevisionId: revision,
    currentContentDigest: "a".repeat(64),
    currentRevisionCreatedAt: 2,
    snapshot: {
      version: 2,
      tunnel: {
        config: { ...DEFAULT_CONFIG, speedOverrides: {} },
        gridVisible: false,
        colors: {
          mode: "hands",
          custom: { left: "#2e8bf0", right: "#ed1c24" },
        },
        section: "tunnel",
        presetRecipe: null,
      },
      effects: { activeEffect: "none" },
      effort: "continuous",
      paths: {
        pathShape: "arc",
        motionAwarePaths: false,
        leftPathLines: true,
        rightPathLines: true,
      },
      playback: { bpm: 60, playbackMode: "continuous" },
      props: { leftPropType: "staff", rightPropType: "staff" },
      trailRender: { mode: "off" },
    },
  } as unknown as CollectedTunnel;
}

describe("refreshTunnelPoster", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.collection = [];
    mocks.renderTunnelPoster.mockReset();
    mocks.updatePresentation.mockReset().mockResolvedValue({});
  });

  it("serializes distinct offscreen renders", async () => {
    const first = tunnel("first", "revision-first");
    const second = tunnel("second", "revision-second");
    mocks.collection = [first, second];
    let finishFirst!: (poster: string) => void;
    mocks.renderTunnelPoster
      .mockImplementationOnce(
        () => new Promise((resolve) => (finishFirst = resolve))
      )
      .mockResolvedValueOnce("data:image/webp;base64,second");
    const { refreshTunnelPoster } = await import("../tunnel-poster-refresh");

    const firstRefresh = refreshTunnelPoster(first);
    const secondRefresh = refreshTunnelPoster(second);
    await vi.waitFor(() =>
      expect(mocks.renderTunnelPoster).toHaveBeenCalledTimes(1)
    );
    finishFirst("data:image/webp;base64,first");

    await expect(firstRefresh).resolves.toBe("refreshed");
    await expect(secondRefresh).resolves.toBe("refreshed");
    expect(mocks.renderTunnelPoster).toHaveBeenCalledTimes(2);
  });

  it("deduplicates refreshes for the same artifact revision", async () => {
    const item = tunnel("same", "revision-same");
    mocks.collection = [item];
    mocks.renderTunnelPoster.mockResolvedValue(
      "data:image/webp;base64,replacement"
    );
    const { refreshTunnelPoster } = await import("../tunnel-poster-refresh");

    const results = await Promise.all([
      refreshTunnelPoster(item),
      refreshTunnelPoster(item),
      refreshTunnelPoster(item),
    ]);

    expect(results).toEqual(["refreshed", "refreshed", "refreshed"]);
    expect(mocks.renderTunnelPoster).toHaveBeenCalledOnce();
    expect(mocks.updatePresentation).toHaveBeenCalledOnce();
  });

  it("does not attach an old poster after the choreography revision changes", async () => {
    const original = tunnel("changing", "revision-old");
    mocks.collection = [original];
    let finish!: (poster: string) => void;
    mocks.renderTunnelPoster.mockImplementation(
      () => new Promise((resolve) => (finish = resolve))
    );
    const { refreshTunnelPoster } = await import("../tunnel-poster-refresh");

    const refresh = refreshTunnelPoster(original);
    await vi.waitFor(() =>
      expect(mocks.renderTunnelPoster).toHaveBeenCalledOnce()
    );
    mocks.collection = [
      {
        ...original,
        currentRevisionId: "revision-new",
        currentRevisionCreatedAt: 3,
      },
    ];
    finish("data:image/webp;base64,stale");

    await expect(refresh).resolves.toBe("unavailable");
    expect(mocks.updatePresentation).not.toHaveBeenCalled();
  });
});
