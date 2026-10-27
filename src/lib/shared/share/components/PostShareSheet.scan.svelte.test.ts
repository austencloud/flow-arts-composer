import { render } from "vitest-browser-svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import demo from "#lib/shared/landing/data/demo-sequence.json";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { EMPTY_META_PUBLISH_STATUS } from "#lib/shared/share/services/meta-publish.js";
import { t } from "#lib/shared/i18n/i18n.svelte.js";
import PostShareSheet from "./PostShareSheet.svelte";

// Show QR code is read by someone else's camera off a phone screen. The
// inline viewer URL carries the whole sequence and makes a code too dense to
// scan, so the code must hold the short link, with the view riding along.
const { createShortCode, generateUrlAsImage } = vi.hoisted(() => ({
  createShortCode: vi.fn(async () => ({ code: "Ab12" })),
  generateUrlAsImage: vi.fn(async () => {
    const image = new Image();
    image.src =
      "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
    return image;
  }),
}));
// The sheet's glyph header and render singletons gate on `browser`.
vi.mock("$app/env", () => ({
  browser: true,
  building: false,
  dev: false,
  version: "test",
}));
vi.mock("#lib/shared/qr/get-short-code-manager.js", () => ({
  getShortCodeManager: () => ({ createShortCode }),
}));
vi.mock("#lib/shared/qr/get-qr-code-generator.js", () => ({
  getUrlQRCodeGenerator: () => ({ generateUrlAsImage }),
  getQRCodeGenerator: () => ({ generateUrlAsImage }),
}));

const INLINE_VIEWER_URL = `https://tkaflowarts.com/sequence?seq=${"x".repeat(900)}&pane=cards`;

function openSheet(canCreateLink: boolean, shareUrl = INLINE_VIEWER_URL) {
  return render(PostShareSheet, {
    isOpen: true,
    sequence: structuredClone(demo) as unknown as SequenceData,
    shareUrl,
    videoBlobUrl: null,
    isExportingVideo: false,
    exportProgress: null,
    onClose: vi.fn(),
    availableArtifacts: ["card"],
    canCreateLink,
    metaStatusOverride: EMPTY_META_PUBLISH_STATUS,
  });
}

afterEach(() => {
  createShortCode.mockClear();
  generateUrlAsImage.mockClear();
});

describe("PostShareSheet Show QR code", () => {
  it("encodes the short link and carries the shared view", async () => {
    openSheet(true);

    await page.getByRole("button", { name: t("share_show_qr") }).click();

    await expect
      .element(page.getByRole("img", { name: t("share_scan_qr_alt") }))
      .toBeInTheDocument();
    expect(createShortCode).toHaveBeenCalledTimes(1);
    expect(generateUrlAsImage).toHaveBeenCalledWith(
      "https://tkaflowarts.com/sequence/Ab12?pane=cards",
      768
    );
    await expect
      .element(page.getByText("tkaflowarts.com/sequence/Ab12", { exact: true }))
      .toBeInTheDocument();

    // Back and in again reuses the code instead of minting another link.
    await page.getByRole("button", { name: t("share_back") }).click();
    await page.getByRole("button", { name: t("share_show_qr") }).click();
    await expect
      .element(page.getByRole("img", { name: t("share_scan_qr_alt") }))
      .toBeInTheDocument();
    expect(createShortCode).toHaveBeenCalledTimes(1);
  });

  // Create and other hosts outside the viewer pass no viewer URL. Without a
  // named view the recipient's viewer reopened whatever tab they used last.
  it("opens the 2D animation when the host has no view to hand over", async () => {
    openSheet(true, "");

    await page.getByRole("button", { name: t("share_show_qr") }).click();

    await expect
      .element(page.getByRole("img", { name: t("share_scan_qr_alt") }))
      .toBeInTheDocument();
    expect(generateUrlAsImage).toHaveBeenCalledWith(
      "https://tkaflowarts.com/sequence/Ab12?pane=animation",
      768
    );
  });

  it("never draws a code of the inline link for a guest", async () => {
    openSheet(false);

    await page.getByRole("button", { name: t("share_show_qr") }).click();

    await expect
      .element(page.getByText(t("share_save_sequence_link")))
      .toBeInTheDocument();
    expect(createShortCode).not.toHaveBeenCalled();
    expect(generateUrlAsImage).not.toHaveBeenCalled();
  });
});
