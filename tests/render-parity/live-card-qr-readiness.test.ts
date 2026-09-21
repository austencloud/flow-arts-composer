import { render } from "vitest-browser-svelte";
import { describe, expect, it, vi } from "vitest";
import { cardParityCases } from "./card-parity-cases";
import {
  cardParityExportOptions,
  cardParitySequence,
} from "./render-composer-card";
import LiveCardParityHarness from "./LiveCardParityHarness.svelte";

// A real ChoreoCard QR request that deliberately never resolves. The test uses
// the public deterministic URL path and does not mint a short code or contact
// any service.
const heldQrRequest = new Promise<never>(() => {});

vi.mock("$lib/shared/qr/get-qr-code-generator", () => ({
  getQRCodeGenerator: () => undefined,
  getUrlQRCodeGenerator: () => ({
    generateForUrl: () => heldQrRequest,
  }),
}));

function fixture() {
  const value = cardParityCases().find(
    (entry) => entry.name === "composer-light"
  );
  if (!value) throw new Error("Missing composer-light fixture");
  return value;
}

describe("LiveExportCard QR readiness", () => {
  it("announces settled card content while its QR request remains pending", async () => {
    const testCase = fixture();
    const options = cardParityExportOptions(testCase, { printMode: false });
    options.visibilityOverrides = {
      ...options.visibilityOverrides,
      showQRCode: true,
    };
    let readyCalls = 0;
    const screen = await render(LiveCardParityHarness, {
      sequence: cardParitySequence(testCase),
      options,
      width: 600,
      height: 966,
      qrUrl: "https://thekineticalphabet.com/sequence/qr-readiness-fixture",
      onReady: () => {
        readyCalls += 1;
      },
    });

    await expect.poll(() => readyCalls, { timeout: 10_000 }).toBe(1);
    const host = screen.getByTestId("live-export-card").element();
    expect(
      host.querySelectorAll(".live-pictograph svg[role='img']").length
    ).toBeGreaterThan(0);
    expect(host.querySelector(".qr-pending")).toBeTruthy();
    await screen.unmount();
  });
});
