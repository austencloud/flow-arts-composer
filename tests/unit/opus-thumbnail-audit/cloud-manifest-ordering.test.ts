/**
 * Audit repro: the cloud tier only answers for keys the cloud manifest has
 * already registered, and the manifest load is deferred to browser idle time.
 *
 * - `+layout.svelte:678-693` schedules `loadManifest()` inside `runDeferred`,
 *   which is handed to `requestIdleCallback`.
 * - `thumbnail-render-orchestrator.ts:509-515` asks the cloud tier with
 *   `{ probeUnknown: false }`, so a key that is not yet in `knownExists`
 *   resolves as a miss with no request at all.
 * - `cloud-thumbnail-cache.ts:352-361` is where those two meet: manifest keys
 *   are free, unknown keys are "absent" unless probing is allowed.
 *
 * A gallery-first cold load therefore races: cards that reach the cloud step
 * before the idle callback runs are sent to the renderer even though the object
 * exists in the shared bucket. On a cold gallery the main thread is busy with
 * exactly those renders, which is what delays the idle callback.
 *
 * This test uses the REAL cloud-thumbnail-cache module. Only Firebase auth /
 * storage and `fetch` are stubbed.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import {
  deriveKey,
  type ThumbnailRenderInput,
} from "$lib/shared/browse/services/thumbnail-key-deriver";

vi.mock("$lib/shared/analytics/thumbnail-analytics", () => ({
  captureThumbnailRenderFailure: vi.fn(),
}));

const firebaseMocks = vi.hoisted(() => ({
  auth: {
    authStateReady: vi.fn(),
    currentUser: null as { uid: string } | null,
  },
}));

vi.mock("$lib/shared/auth/firebase", () => ({
  getAuthInstance: vi.fn(async () => firebaseMocks.auth),
  getStorageInstance: vi.fn(async () => ({ bucket: "test" })),
}));
vi.mock("$lib/shared/auth/services/guest-identity", () => ({
  ensureGuestIdentity: vi.fn(async () => undefined),
}));

const sequence = {
  id: "public-1",
  word: "AB",
  steps: [{ id: "step-1", motions: {} }],
} as unknown as SequenceData;

const input: ThumbnailRenderInput = {
  sequenceName: "AB",
  sequenceId: "public-1",
  leftPropType: PropType.STAFF,
  rightPropType: PropType.STAFF,
  catDogModeEnabled: false,
  lightMode: false,
  variant: "gallery",
  startPositionLayout: "row",
  visibility: { showQRCode: false, showMandala: true },
};

interface Harness {
  orchestrator: {
    getThumbnail(request: {
      sequence: SequenceData;
      input: ThumbnailRenderInput;
    }): Promise<{ url: string | null; fromCache: boolean }>;
    buildCloudKey(key: ReturnType<typeof deriveKey>): never;
  };
  render: ReturnType<typeof vi.fn>;
  cloud: typeof import("$lib/shared/browse/services/cloud-thumbnail-cache");
  fetchMock: ReturnType<typeof vi.fn>;
}

async function createHarness(): Promise<Harness> {
  const [{ ThumbnailRenderOrchestrator }, { ThumbnailRenderQueue }, cloud] =
    await Promise.all([
      import("$lib/shared/browse/services/thumbnail-render-orchestrator"),
      import("$lib/shared/browse/services/thumbnail-render-queue"),
      import("$lib/shared/browse/services/cloud-thumbnail-cache"),
    ]);

  const render = vi.fn(async () => ({
    blob: new Blob(["rendered"], { type: "image/webp" }),
    qrConsistent: true,
  }));
  const orchestrator = new ThumbnailRenderOrchestrator(
    new ThumbnailRenderQueue(),
    { render } as never,
    { get: vi.fn(async () => null), set: vi.fn(async () => {}) } as never
  );

  // The one shared thumbnail this test cares about: it EXISTS in the bucket.
  const storagePath = cloud.getStoragePath(
    orchestrator.buildCloudKey(deriveKey(input))
  );
  const manifestKey = storagePath
    .replace(/^thumbnails\//, "")
    .replace(/\.webp$/, "");

  const fetchMock = vi.fn(async (url: string) => {
    if (url.startsWith("/thumbnails/")) {
      // The bundled static tier is empty in this scenario.
      return new Response(JSON.stringify({ keys: [] }), { status: 200 });
    }
    if (url.includes("manifest.json")) {
      return new Response(
        JSON.stringify({ keys: [manifestKey], generated: "now" }),
        {
          status: 200,
        }
      );
    }
    // Object metadata probe / download.
    return new Response(JSON.stringify({ name: storagePath }), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);

  return { orchestrator: orchestrator as never, render, cloud, fetchMock };
}

beforeEach(() => {
  vi.resetModules();
  localStorage.clear();
  firebaseMocks.auth.currentUser = null;
  firebaseMocks.auth.authStateReady.mockResolvedValue(undefined);
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:rendered");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.spyOn(console, "debug").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("cloud tier availability vs. manifest timing", () => {
  it("DEFECT: a card that asks before the idle manifest load renders locally", async () => {
    const h = await createHarness();
    expect(h.cloud.isManifestLoaded()).toBe(false);

    const result = await h.orchestrator.getThumbnail({ sequence, input });

    // DEFECT: the object exists in the bucket and the manifest would have named
    // it, but the orchestrator refuses to probe and the manifest has not landed,
    // so this becomes a full local render — and an upload of a file that is
    // already there.
    expect(h.render).toHaveBeenCalledOnce();
    expect(result.fromCache).toBe(false);
    // No request was made for the object: `probeUnknown: false` short-circuits
    // before the network.
    const probed = h.fetchMock.mock.calls.filter(([url]) =>
      String(url).includes("firebasestorage")
    );
    expect(probed).toHaveLength(0);
  });

  it("CONTROL: the same card resolves from the cloud once the manifest has loaded", async () => {
    const h = await createHarness();
    const registered = await h.cloud.loadManifest();
    expect(registered).toBe(1);
    expect(h.cloud.isManifestLoaded()).toBe(true);

    const result = await h.orchestrator.getThumbnail({ sequence, input });

    expect(h.render).not.toHaveBeenCalled();
    expect(result.fromCache).toBe(true);
    expect(result.url).toContain("firebasestorage.googleapis.com");
  });

  it("shows the manifest is the only thing that changed between the two runs", async () => {
    // Same key, same bucket contents, same stubs: the outcome is decided purely
    // by whether the deferred manifest fetch has completed.
    const cold = await createHarness();
    await cold.orchestrator.getThumbnail({ sequence, input });
    const coldRenders = cold.render.mock.calls.length;

    vi.resetModules();
    localStorage.clear();
    const warm = await createHarness();
    await warm.cloud.loadManifest();
    await warm.orchestrator.getThumbnail({ sequence, input });

    expect(coldRenders).toBe(1);
    expect(warm.render).not.toHaveBeenCalled();
  });
});
