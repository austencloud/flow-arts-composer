/**
 * Audit repro: which gallery cards can reach a pre-rendered tier at all.
 *
 * The static bundle and the shared cloud bucket hold exactly ONE visual class
 * per (variant, prop, mode, qr): the class where every composition and
 * visibility input equals the canonical default in
 * thumbnail-key-deriver.checkInputUsesDefaults(). Any other value makes
 * `usesDefaults` false, and the orchestrator then skips the static tier AND the
 * cloud tier by construction (both are gated on `key.usesDefaults`).
 *
 * These tests measure the size of that cliff with the real orchestrator, queue,
 * and metrics collector. Stubbed seams: the renderer, the local IndexedDB cache,
 * the cloud module, and `fetch` for the static manifest.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import {
  deriveKey,
  inputUsesDefaults,
  type ThumbnailRenderInput,
} from "$lib/shared/browse/services/thumbnail-key-deriver";

vi.mock("$lib/shared/analytics/thumbnail-analytics", () => ({
  captureThumbnailRenderFailure: vi.fn(),
}));

const cloudMocks = vi.hoisted(() => ({
  getCachedUrl: vi.fn(() => undefined),
  getUrl: vi.fn(async () => null),
  upload: vi.fn(async () => null),
  clearMemoryCache: vi.fn(),
  invalidateUrl: vi.fn(),
  markMissing: vi.fn(),
}));

vi.mock(
  "$lib/shared/browse/services/cloud-thumbnail-cache",
  () => cloudMocks
);

const GALLERY_SIZE = 40;

const sequence = (id: string): SequenceData =>
  ({ id, word: id, steps: [], sequenceLength: 8 }) as unknown as SequenceData;

function defaultInput(id: string): ThumbnailRenderInput {
  return {
    sequenceName: id,
    sequenceId: id,
    leftPropType: PropType.STAFF,
    rightPropType: PropType.STAFF,
    catDogModeEnabled: false,
    lightMode: false,
    variant: "gallery",
    startPositionLayout: "row",
    // What buildGalleryVisibility() produces for a signed-in default-settings
    // grid card: QR off (grid cards never allow QR), mandala on.
    visibility: { showQRCode: false, showMandala: true },
  };
}

const galleryIds = Array.from({ length: GALLERY_SIZE }, (_, i) => `SEQ${i}`);

async function createHarness() {
  const [
    { ThumbnailRenderOrchestrator },
    { ThumbnailRenderQueue },
    { ThumbnailMetricsCollector },
  ] = await Promise.all([
    import("$lib/shared/browse/services/thumbnail-render-orchestrator"),
    import("$lib/shared/browse/services/thumbnail-render-queue"),
    import("$lib/shared/browse/services/thumbnail-metrics-collector"),
  ]);

  const render = vi.fn(async () => ({
    blob: new Blob(["rendered"], { type: "image/webp" }),
    qrConsistent: true,
  }));
  const metrics = new ThumbnailMetricsCollector();
  const orchestrator = new ThumbnailRenderOrchestrator(
    new ThumbnailRenderQueue(),
    { render } as never,
    { get: vi.fn(async () => null), set: vi.fn(async () => {}) } as never,
    metrics
  );
  return { orchestrator, render, metrics };
}

/** Serve a static manifest that holds every key the given inputs derive. */
function stubManifestFor(
  orchestrator: { buildStaticKey(key: ReturnType<typeof deriveKey>): string },
  inputs: ThumbnailRenderInput[]
) {
  const keys = inputs.map((input) =>
    orchestrator.buildStaticKey(deriveKey(input))
  );
  const fetchMock = vi.fn(
    async () => new Response(JSON.stringify({ keys }), { status: 200 })
  );
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, keys };
}

beforeEach(() => {
  vi.resetModules();
  cloudMocks.getCachedUrl.mockReturnValue(undefined);
  cloudMocks.getUrl.mockResolvedValue(null);
  cloudMocks.getUrl.mockClear();
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:rendered");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.spyOn(console, "debug").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("shared thumbnail tier coverage", () => {
  it("CONTROL: a fully warmed default-settings gallery renders nothing locally", async () => {
    const { orchestrator, render, metrics } = await createHarness();
    const inputs = galleryIds.map(defaultInput);
    const { fetchMock } = stubManifestFor(orchestrator, inputs);

    const results = await Promise.all(
      inputs.map((input, i) =>
        orchestrator.getThumbnail({ sequence: sequence(galleryIds[i]!), input })
      )
    );

    expect(results.every((r) => r.fromCache && r.url?.startsWith("/thumbnails/"))).toBe(
      true
    );
    expect(render).not.toHaveBeenCalled();
    // One manifest fetch for the whole page, not one per card.
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(metrics.getSummary().byLayer.static).toBe(GALLERY_SIZE);
    expect(metrics.getSummary().byLayer.render).toBe(0);
  });

  it("DEFECT: turning mandalas off drops the SAME gallery to 100% local render", async () => {
    const { orchestrator, render, metrics } = await createHarness();
    const warmed = galleryIds.map(defaultInput);
    // Everything the warm pass baked is still on disk...
    const { fetchMock } = stubManifestFor(orchestrator, warmed);

    // ...but one user-facing display toggle (ExportImagePanel "Mandalas",
    // persisted in image-composition-state and read by
    // buildGalleryVisibility) moves every card to a class no shared tier holds.
    const mandalasOff = warmed.map((input) => ({
      ...input,
      visibility: { ...input.visibility, showMandala: false },
    }));
    expect(mandalasOff.every((input) => !inputUsesDefaults(input))).toBe(true);

    await Promise.all(
      mandalasOff.map((input, i) =>
        orchestrator.getThumbnail({ sequence: sequence(galleryIds[i]!), input })
      )
    );

    expect(render).toHaveBeenCalledTimes(GALLERY_SIZE);
    // The static tier is never even consulted: step 1 is gated on usesDefaults.
    expect(fetchMock).not.toHaveBeenCalled();
    // Neither is the cloud tier, so nothing this user renders is ever shared.
    expect(cloudMocks.getUrl).not.toHaveBeenCalled();
    expect(metrics.getSummary().byLayer.render).toBe(GALLERY_SIZE);
    expect(metrics.getSummary().byLayer.static).toBe(0);
  });

  it("enumerates every reachable input that collapses shared-tier coverage", () => {
    const base = defaultInput("AB");
    // Each patch is a value a user or an embedding surface can actually
    // produce today. All of them fall off the shared cache.
    const collapsing: Array<[string, Partial<ThumbnailRenderInput>]> = [
      ["mandala off (viewer image panel)", { visibility: { ...base.visibility, showMandala: false } }],
      ["start position as left column (per-length layout pick)", { startPositionLayout: "column" }],
      ["grid dots hidden", { visibility: { ...base.visibility, showGrid: false } }],
      ["hand points: active only", { visibility: { ...base.visibility, handPointVisibility: "active" } }],
      ["non-radial points on", { visibility: { ...base.visibility, showNonRadialPoints: true } }],
      ["custom hand palette", { primaryPropColors: { left: "#00e5ff", right: "#ff3d71" } }],
      ["hand-path mode", { visibility: { ...base.visibility, handPathMode: true } }],
      ["one hand hidden", { visibility: { ...base.visibility, showLeftMotion: false } }],
      ["word hidden", { addWord: false }],
      ["step numbers hidden", { addStepNumbers: false }],
      ["start position excluded", { includeStartPosition: false }],
      ["difficulty badge hidden", { addDifficultyLevel: false }],
      ["notes footer text", { customNotesText: "🔥 FireDrums 2026 🔥" }],
      ["LOOP glyph strip hidden", { showLoopGlyph: false }],
    ];

    expect(inputUsesDefaults(base)).toBe(true);
    for (const [label, patch] of collapsing) {
      expect(
        inputUsesDefaults({ ...base, ...patch }),
        `${label} should be recorded as a shared-tier collapse`
      ).toBe(false);
    }
  });

  it("shows the cloud tier is unreachable for a non-default class even when the object exists", async () => {
    const { orchestrator, render } = await createHarness();
    // A cloud object exists for this exact hash — but the orchestrator's
    // cloud steps are gated on usesDefaults, so it is never asked for.
    cloudMocks.getCachedUrl.mockReturnValue("https://cdn.example/thumb.webp");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ keys: [] }))));

    const personal: ThumbnailRenderInput = {
      ...defaultInput("AB"),
      primaryPropColors: { left: "#00e5ff", right: "#ff3d71" },
    };
    const result = await orchestrator.getThumbnail({
      sequence: sequence("AB"),
      input: personal,
    });

    expect(result.fromCache).toBe(false);
    expect(render).toHaveBeenCalledOnce();
    expect(cloudMocks.getCachedUrl).not.toHaveBeenCalled();
  });
});
