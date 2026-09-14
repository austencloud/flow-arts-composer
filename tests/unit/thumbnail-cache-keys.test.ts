/**
 * Tests for thumbnail cache-key derivation and static-manifest key formats.
 *
 * These lock in the July 2026 gallery-cache fixes, each of which was a silent
 * failure in production (every card local-rendered while 4 cache tiers idled):
 *  - the deriver's canonical visibility must match the PRODUCT defaults
 *    (showMandala defaulted true in image-composition settings but false in
 *    the deriver, so every default-settings user keyed "non-default" and the
 *    static/cloud tiers + crowd uploads died for the whole population)
 *  - buildStaticKey must mirror the cloud storage path (variant + sequence id
 *    + renderer version),
 *    not the pre-variant legacy format — the synced manifest keys are derived
 *    from storage paths verbatim
 *  - the legacy key shape stays available without allowing unversioned rasters
 *    to cross a renderer migration
 */

import { describe, it, expect, vi } from "vitest";

// Prevent the orchestrator's cloud-cache import from pulling Firebase into
// the node test env — these tests only exercise pure key derivation.
vi.mock("$lib/shared/browse/services/cloud-thumbnail-cache", () => ({
  upload: vi.fn(),
  getCachedUrl: vi.fn(),
  getUrl: vi.fn(),
  clearMemoryCache: vi.fn(),
  invalidateUrl: vi.fn(),
  markMissing: vi.fn(),
}));

import {
  THUMBNAIL_RENDERER_VERSION,
  deriveKey,
} from "$lib/shared/browse/services/thumbnail-key-deriver";
import type { ThumbnailRenderInput } from "$lib/shared/browse/services/thumbnail-key-deriver";
import { ThumbnailRenderOrchestrator } from "$lib/shared/browse/services/thumbnail-render-orchestrator";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";

function galleryInput(overrides: Partial<ThumbnailRenderInput> = {}): ThumbnailRenderInput {
  return {
    sequenceName: "AKE",
    sequenceId: "seq-1",
    leftPropType: PropType.STAFF,
    rightPropType: PropType.STAFF,
    catDogModeEnabled: false,
    lightMode: false,
    variant: "gallery",
    ...overrides,
  };
}

const orchestrator = new ThumbnailRenderOrchestrator(
  null as never,
  null as never,
  null as never
);

describe("deriveKey usesDefaults — canonical class matches product defaults", () => {
  it("treats the product-default grid visibility (QR off, mandala ON) as the shared-cacheable class", () => {
    const key = deriveKey(
      galleryInput({ visibility: { showQRCode: false, showMandala: true } })
    );
    expect(key.usesDefaults).toBe(true);
  });

  it("keys mandala-OFF renders as non-default (separate class, no shared-cache collision)", () => {
    const key = deriveKey(
      galleryInput({ visibility: { showQRCode: false, showMandala: false } })
    );
    expect(key.usesDefaults).toBe(false);
  });

  it("keys QR-ON as a SHAREABLE class (deterministic short code), not local-only", () => {
    // Regression: showQRCode:true used to disqualify from the shared class,
    // forcing every signed-in default-settings card to local-render forever.
    const key = deriveKey(
      galleryInput({ visibility: { showQRCode: true, showMandala: true } })
    );
    expect(key.usesDefaults).toBe(true);
  });

  it("keys a genuinely custom composition (mandala off) as non-default", () => {
    const key = deriveKey(
      galleryInput({ visibility: { showQRCode: false, showMandala: false } })
    );
    expect(key.usesDefaults).toBe(false);
  });

  it("gives QR-on and QR-off renders distinct hashes (no shared-cache collision)", () => {
    const on = deriveKey(
      galleryInput({ visibility: { showQRCode: true, showMandala: true } })
    );
    const off = deriveKey(
      galleryInput({ visibility: { showQRCode: false, showMandala: true } })
    );
    expect(on.hash).not.toBe(off.hash);
  });

  it("gives mandala-on and mandala-off renders distinct hashes", () => {
    const on = deriveKey(
      galleryInput({ visibility: { showQRCode: false, showMandala: true } })
    );
    const off = deriveKey(
      galleryInput({ visibility: { showQRCode: false, showMandala: false } })
    );
    expect(on.hash).not.toBe(off.hash);
  });
});

describe("QR variant — distinct shareable cache paths", () => {
  it("buildStaticKey marks the QR variant with _qr", () => {
    const key = deriveKey(
      galleryInput({ visibility: { showQRCode: true, showMandala: true } })
    );
    expect(orchestrator.buildStaticKey(key)).toBe(
      "gallery/staff/AKE_seq-1_qr_r6_dark"
    );
  });

  it("buildStaticKey omits _qr for the no-QR card", () => {
    const key = deriveKey(
      galleryInput({ visibility: { showQRCode: false, showMandala: true } })
    );
    expect(orchestrator.buildStaticKey(key)).toBe(
      "gallery/staff/AKE_seq-1_r6_dark"
    );
  });

  it("buildCloudKey carries showQRCode so the storage path separates variants", () => {
    const qrKey = deriveKey(
      galleryInput({ visibility: { showQRCode: true, showMandala: true } })
    );
    const noQrKey = deriveKey(
      galleryInput({ visibility: { showQRCode: false, showMandala: true } })
    );
    expect(orchestrator.buildCloudKey(qrKey).showQRCode).toBe(true);
    expect(orchestrator.buildCloudKey(noQrKey).showQRCode).toBe(false);
    expect(orchestrator.buildCloudKey(qrKey).rendererVersion).toBe(
      THUMBNAIL_RENDERER_VERSION
    );
  });

  it("legacy static key cannot match an unversioned pre-fix bundle", () => {
    const qrKey = deriveKey(
      galleryInput({ visibility: { showQRCode: true, showMandala: true } })
    );
    expect(orchestrator.buildLegacyStaticKey(qrKey)).toBe(
      "staff/AKE_qr_r6_dark"
    );
  });
});

describe("buildStaticKey — mirrors the cloud storage path", () => {
  it("includes variant, prop, sequence id, and mode", () => {
    const key = deriveKey(galleryInput());
    expect(orchestrator.buildStaticKey(key)).toBe(
      "gallery/staff/AKE_seq-1_r6_dark"
    );
  });

  it("uses _light suffix in light mode and omits the id suffix when absent", () => {
    const key = deriveKey(
      galleryInput({ sequenceId: undefined, lightMode: true })
    );
    expect(orchestrator.buildStaticKey(key)).toBe(
      "gallery/staff/AKE_r6_light"
    );
  });

  it("sanitizes Windows-illegal characters the same way sync-static-thumbnails.cjs does", () => {
    const key = deriveKey(
      galleryInput({ sequenceName: "Sequence 11:46:02 PM", sequenceId: undefined })
    );
    expect(orchestrator.buildStaticKey(key)).toBe(
      "gallery/staff/Sequence 11-46-02 PM_r6_dark"
    );
  });

  it("stays in lockstep with the cloud path (manifest keys are path-derived)", () => {
    const key = deriveKey(galleryInput());
    const pathDerived = key.cloudPath
      .replace(/^thumbnails\//, "")
      .replace(/\.webp$/, "");
    expect(orchestrator.buildStaticKey(key)).toBe(pathDerived);
  });
});

describe("buildLegacyStaticKey — pre-variant bundle fallback", () => {
  it("keeps the old prop/name format but requires the current renderer version", () => {
    const key = deriveKey(galleryInput());
    expect(orchestrator.buildLegacyStaticKey(key)).toBe("staff/AKE_r6_dark");
  });
});

describe("renderer cache invalidation", () => {
  it("folds the renderer version into local and cloud cache identities", () => {
    const key = deriveKey(galleryInput());

    expect(key.rendererVersion).toBe(THUMBNAIL_RENDERER_VERSION);
    expect(key.hash).toBe("-z2fi9k");
    expect(key.cloudPath).toBe(
      "thumbnails/gallery/staff/AKE_seq-1_r6_dark.webp"
    );
  });
});

describe("primary prop colors — custom palettes never touch the shared tiers", () => {
  const palette = { left: "#00ff88", right: "#ff8800" };

  it("keys a custom palette as non-default so it can't be served from or uploaded to the shared cache", () => {
    const key = deriveKey(galleryInput({ primaryPropColors: palette }));
    expect(key.usesDefaults).toBe(false);
  });

  it("keeps a null palette (theme defaults) on the shared class with the same hash as no palette", () => {
    const absent = deriveKey(galleryInput());
    const nulled = deriveKey(galleryInput({ primaryPropColors: null }));
    expect(nulled.usesDefaults).toBe(true);
    expect(nulled.hash).toBe(absent.hash);
  });

  it("gives each palette its own hash", () => {
    const defaults = deriveKey(galleryInput());
    const custom = deriveKey(galleryInput({ primaryPropColors: palette }));
    const swapped = deriveKey(
      galleryInput({
        primaryPropColors: { left: palette.right, right: palette.left },
      })
    );
    expect(custom.hash).not.toBe(defaults.hash);
    expect(swapped.hash).not.toBe(custom.hash);
  });
});
