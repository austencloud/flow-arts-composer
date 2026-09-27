import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("QR scan cloud-render contract", () => {
  it("does not initialize the complete pictograph renderer on the scan route", () => {
    const page = source("src/routes/q/[code]/QScanPage.svelte");
    expect(page).not.toContain("getGlyphCache().initialize()");
  });

  it("makes scan-card cell resolution cloud-only", () => {
    const card = source(
      "src/lib/shared/sequence-viewer/components/ChoreoCard.svelte"
    );
    expect(card).toContain("probeCloud: cloudProbeEnabled");
    expect(card).toContain("cloudOnly: cloudProbeEnabled");
  });

  it("prepares the viewer record once and retains the browser fallback", () => {
    const page = source("src/routes/q/[code]/QScanPage.svelte");
    const server = source("src/routes/q/[code]/+page.server.ts");
    const publicReader = source(
      "src/lib/shared/qr/services/public-short-code-record-reader.ts"
    );
    expect(server).toContain("fetchPublicShortCodeRecord");
    expect(publicReader).toContain("fromFirestoreFields");
    expect(server).toContain("prepareScanViewerPayload(");
    expect(server).toContain("preparedSequence: prepared?.sequence ?? null");
    expect(server).toContain(
      "preparedPropConfig: prepared?.propConfig ?? null"
    );
    expect(server).not.toContain("scanCard:");
    expect(page).toContain("data.preparedSequence");
    expect(page).toMatch(
      /shortCodeManager\.resolveShortCodeWithRecord\(\s*shortCode,\s*data\.record\s*\)/
    );
  });

  it("keeps choreography out of the ingress while it hands off", () => {
    const route = source("src/routes/q/[code]/+page.svelte");
    const ingress = source("src/routes/q/[code]/QScanPage.svelte");

    expect(route).not.toContain("ScanCardBootstrap");
    expect(route).not.toContain("ChoreoCard.svelte");
    expect(route).toContain('import("./QScanPage.svelte")');
    expect(route).toContain('<LoadingGate variant="bar"');
    expect(route).toContain("class:ready={viewerReady}");
    expect(route).toContain("aria-hidden={!viewerReady}");
    expect(route).toContain("inert={!viewerReady ? true : undefined}");
    expect(ingress).toContain("buildScanSequenceDestination");
    expect(ingress).toContain("replaceState: true");
    expect(ingress).not.toContain("SequenceViewerShell.svelte");
  });

  it("reveals terminal resolution errors instead of leaving the loader stuck", () => {
    const page = source("src/routes/q/[code]/QScanPage.svelte");

    expect(page).toContain('reportFailure(\n          "Sequence not found"');
    expect(page).toContain("onViewerReady?.();");
  });

  it("keeps scan step numbers out of the cached bitmap pipeline", () => {
    const card = source(
      "src/lib/shared/sequence-viewer/components/ChoreoCard.svelte"
    );
    const cell = source(
      "src/lib/shared/sequence-viewer/components/CellRenderer.svelte"
    );
    expect(card).toContain(
      "showStepNumbers: cloudProbeEnabled ? false : showStepNumbers"
    );
    expect(cell).toContain("scanUsesHtmlStepNumbers");
  });

  it("builds the complete viewer in card mode before interactive startup", () => {
    const page = source("src/routes/sequence/[id]/SequenceViewerPage.svelte");
    expect(page).toContain("initialViewerMode={initialViewerModeForUrl(");
    expect(page).toContain("!!scanOriginCode");
    const modes = source(
      "src/lib/shared/sequence-viewer/services/viewer-modes.ts"
    );
    // Prettier's singleQuote:false pass (i18n commit b11df1a24d) reformatted
    // this file's quote style; the branch itself is unchanged.
    expect(modes).toContain('if (scanOrigin) return "card";');
    expect(page).toContain("deferInteractiveStartup");
    expect(page).toContain("startInCardThenSplit");
    expect(page).toContain("setScanCardCloudProbe(true)");
  });

  it("does not launch the local card pre-warmer for a cloud-backed scan", () => {
    const orchestrator = source(
      "src/lib/shared/sequence-viewer/components/SequenceViewerOrchestrator.svelte"
    );
    const interactiveServices = source(
      "src/lib/shared/sequence-viewer/state/viewer-interactive-services-state.svelte.ts"
    );
    expect(orchestrator).toContain("cloudBackedScan,");
    expect(interactiveServices).toMatch(
      /if \(!inputs\.cloudBackedScan\) \{\s*dependencies\.preWarmSequence/
    );
  });
});
