// @vitest-environment jsdom
/**
 * Static contract test for the SequenceViewerShell host pattern.
 *
 * The in-app drawer and /sequence route render the SAME shell component so the
 * two viewer destinations cannot drift. /q is a scan-only ingress and must not
 * become a third viewer again. This test locks both contracts at source level.
 *
 * If this test fails, fix the host — do not loosen the assertions.
 */
import { afterEach, describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { isFirstScanRouteVisit } from "#lib/shared/qr/utils/scan-detection.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);

const SHELL_PATH =
  "src/lib/shared/sequence-viewer/components/SequenceViewerShell.svelte";

const HOSTS: Record<string, string[]> = {
  "drawer host": [
    "src/lib/shared/sequence-viewer/components/SequenceViewerDrawerHost.svelte",
    "src/lib/shared/sequence-viewer/components/SequenceViewerDrawerContent.svelte",
  ],
  "/sequence route host": [
    "src/routes/sequence/[id]/SequenceViewerPage.svelte",
  ],
  "/from/spiroanim route host": [
    "src/routes/from/spiroanim/[cellKey]/+page.svelte",
  ],
  "/tunnel route host": ["src/routes/tunnel/[pair]/TunnelViewerPage.svelte"],
};

/**
 * Chrome internals only the shell may compose. A host importing one of these
 * means viewer chrome is being rebuilt host-side — the exact drift this guards.
 */
const CHROME_INTERNALS = [
  "ViewerHeader.svelte",
  "ViewerSplitPane.svelte",
  "ViewerOverflowMenu.svelte",
  "ExportImagePanel.svelte",
  "VideoPreviewPanel.svelte",
  "PracticeBar.svelte",
  "PracticeSetupBar.svelte",
  "DeleteConfirmDialog.svelte",
  "services/viewer-actions",
];

/** Markup markers owned by the shell; their presence in a host means a fork. */
const SHELL_MARKUP_MARKERS = ["drawer-header", "viewer-and-export"];

function read(rel: string): string {
  return readFileSync(path.join(repoRoot, rel), "utf8");
}

/** Lines that carry an import specifier (handles multi-line import blocks). */
function importSpecifierLines(source: string): string[] {
  return source
    .split("\n")
    .filter((line) => /^\s*import\b/.test(line) || line.includes('from "'));
}

const shellSource = read(SHELL_PATH);
const shellModelSource = read(
  "src/lib/shared/sequence-viewer/services/viewer-shell-model.ts"
);
const shellShareStateSource = read(
  "src/lib/shared/sequence-viewer/state/viewer-shell-share-state.svelte.ts"
);
const scanSource = read("src/routes/q/[code]/QScanPage.svelte");
const drawerSource = read(
  "src/lib/shared/sequence-viewer/components/SequenceViewerDrawerHost.svelte"
);
const sequenceRouteSource = read(
  "src/routes/sequence/[id]/SequenceViewerPage.svelte"
);
const spiroanimBridgeRouteSource = read(
  "src/routes/from/spiroanim/[cellKey]/+page.svelte"
);
const cardHeaderSource = read(
  "src/lib/shared/sequence-viewer/components/CardHeader.svelte"
);
const overflowMenuSource = read(
  "src/lib/shared/sequence-viewer/components/ViewerOverflowMenu.svelte"
);
const viewerHeaderSource = read(
  "src/lib/shared/sequence-viewer/components/ViewerHeader.svelte"
);
const viewerSplitPaneSource = read(
  "src/lib/shared/sequence-viewer/components/ViewerSplitPane.svelte"
);
const viewerMotionSurfaceSource = read(
  "src/lib/shared/sequence-viewer/components/ViewerMotionSurface.svelte"
);
const viewerCompanionSurfaceSource = read(
  "src/lib/shared/sequence-viewer/components/ViewerCompanionSurface.svelte"
);
const viewerPracticeLaneSource = read(
  "src/lib/shared/sequence-viewer/components/ViewerPracticeLane.svelte"
);
const controlDockSource = read(
  "src/lib/shared/sequence-viewer/components/ControlDock.svelte"
);
/** The English catalog t() loads statically. Chrome labels live here now, so
 *  a test that names a label reads its words here. */
const englishMessages = JSON.parse(read("messages/en.json")) as Record<
  string,
  string
>;
const hostEntries = Object.entries(HOSTS).map(
  ([name, rels]) => [name, rels.map(read).join("\n")] as const
);

describe("SequenceViewerShell host contract", () => {
  it("keeps split geometry separate from pane behavior owners", () => {
    expect(viewerSplitPaneSource).toContain("<ViewerMotionSurface");
    expect(viewerSplitPaneSource).toContain("<ViewerCompanionSurface");
    expect(viewerSplitPaneSource).toContain("<ViewerPracticeLane");
    expect(viewerSplitPaneSource).not.toContain("<AnimatorCanvas");
    expect(viewerSplitPaneSource).not.toContain("createPaneKeepAlive");

    expect(viewerMotionSurfaceSource).toContain("<AnimatorCanvas");
    expect(viewerMotionSurfaceSource).toMatch(
      /<AnimatorCanvas[\s\S]*?\bfillContainer\b[\s\S]*?\/>/
    );
    expect(viewerMotionSurfaceSource).toContain("<LazyMount");
    expect(viewerMotionSurfaceSource).toContain(
      'import("#lib/shared/3d/components/controls/SceneControlWorkspace.svelte")'
    );
    expect(viewerCompanionSurfaceSource).toContain("createPaneKeepAlive");
    expect(viewerCompanionSurfaceSource).toContain("<ChoreoCard");
    expect(viewerCompanionSurfaceSource).toContain("<ArtPane");
    expect(viewerPracticeLaneSource).toContain("<PracticeLanePane");
  });

  // A scanned link draws its first frame from this shell. A static import of
  // any of these brings the video editor, its media encoder or three.js into
  // that first download, and nothing on screen would show it.
  it("loads tap-only editors and 3D tools on demand", () => {
    const staticImport = (source: string, file: string) =>
      new RegExp(String.raw`^\s*import\s+[^;]*?["'][^"']*${file}["']`, "m").test(
        source
      );
    expect(staticImport(shellSource, "PostStudioPane.svelte")).toBe(false);
    expect(staticImport(shellSource, "PostShareSheet.svelte")).toBe(false);
    expect(staticImport(shellSource, "get-post-workspace-navigator.js")).toBe(
      false
    );
    expect(
      staticImport(viewerMotionSurfaceSource, "SceneControlWorkspace.svelte")
    ).toBe(false);
    expect(
      staticImport(
        read("src/lib/shared/sequence-viewer/services/sequence-modal-exporter.svelte.ts"),
        "get-offline-3d-exporter.js"
      )
    ).toBe(false);
  });

  it("builds the 3D state only when someone opens 3D", () => {
    // A value import of either module puts three.js (about 1.5 MB) back on
    // every scan. Type imports are erased and stay allowed.
    const valueImport = (source: string, file: string) =>
      new RegExp(
        String.raw`^\s*import\s+(?!type\s)[^;]*?["']${file}["']`,
        "m"
      ).test(source);
    const orchestrator = read(
      "src/lib/shared/sequence-viewer/components/SequenceViewerOrchestrator.svelte"
    );
    for (const file of [
      "#lib/shared/3d/state/viewer-3d-state.svelte.js",
      "@austencloud/scene-3d",
      "#lib/features/scene-3d-collection/services/open-3d-scene.js",
    ]) {
      expect(valueImport(orchestrator, file), file).toBe(false);
    }
    expect(
      read("src/lib/shared/sequence-viewer/state/lazy-viewer-3d-state.svelte.ts")
    ).toContain('import("#lib/shared/3d/state/viewer-3d-state.svelte.js")');
  });

  it("keeps the Codex letter table and fabric off the scan", () => {
    // The guide index is built from the Codex letter table (about 215 KB) and
    // only "See it in the Guide" needs it.
    expect(read("src/routes/sequence/[id]/SequenceViewerPage.svelte")).not.toMatch(
      /^\s*import\s+(?!type\s)[^;]*?guide-content-index["']/m
    );
    // Every scanned card places arrows. fabric was only ever used for `Point`
    // here, and importing it loads the whole library (about 274 KB).
    const arrowRoot = path.join(repoRoot, "src/lib/shared/pictograph/arrow");
    const files = readdirSync(arrowRoot, { recursive: true, encoding: "utf8" })
      .filter((file) => /\.(ts|svelte)$/.test(file));
    for (const file of files) {
      expect(
        readFileSync(path.join(arrowRoot, file), "utf8"),
        file
      ).not.toMatch(/from\s+["']fabric["']/);
    }
  });

  it("keeps compressed mobile dock tabs pressable", () => {
    expect(controlDockSource).toMatch(
      /\.cat-scroll\s*\{[\s\S]*?overflow-x:\s*auto;/
    );
    expect(controlDockSource).toMatch(
      /\.dock-btn\.cat\s*\{[\s\S]*?min-width:\s*var\(--min-touch-target, 44px\);/
    );
  });

  it("shell exists and exposes the host prop seam", () => {
    expect(shellSource).toContain("exportOverrides");
    expect(shellSource).toContain("openAppHref");
    expect(shellSource).toContain("onAccountSignIn");
    expect(shellSource).toContain("startInSplit");
    expect(shellSource).toContain("startInCardThenSplit");
    expect(shellSource).toContain("contextContent");
    expect(shellSource).toContain("showFullscreenControls");
    expect(shellSource).toContain("navigation");
  });

  it("keeps the QR account entry inside the shared shell prop seam", () => {
    expect(shellSource).toContain("<ViewerHeader");
    expect(viewerHeaderSource).toContain("authState.isFullAccount");
    expect(viewerHeaderSource).toContain("RobustAvatar");
    expect(sequenceRouteSource).toContain("ctx.openSignInPrompt");
  });

  it("registers the library repository before the standalone viewer mounts", () => {
    expect(sequenceRouteSource).toContain(
      'from "#lib/shared/composition-root/register-library-repository.js"'
    );
    expect(sequenceRouteSource).toContain(
      "if (browser) registerLibraryRepository();"
    );
  });

  it("names the app Flow Arts Composer in viewer launch actions", () => {
    expect(viewerHeaderSource).toContain(
      't("viewer_ui_open_flow_arts_composer")'
    );
    expect(overflowMenuSource).toContain(
      'label: openAppLabel ?? t("viewer_ui_open_app")'
    );
    expect(englishMessages.viewer_ui_open_flow_arts_composer).toBe(
      "Open Flow Arts Composer"
    );
    expect(englishMessages.viewer_ui_open_app).toBe("Open Flow Arts Composer");
    expect(viewerHeaderSource).not.toContain("Open TKA");
  });

  it("hands Escape to the share panel instead of leaving the viewer", () => {
    // Share keeps focus in the header, so a Back target there would be the
    // nearest Escape owner and navigate away with the panel still open.
    expect(
      viewerHeaderSource.match(
        /data-escape-shortcut=\{!sharePanelOpen \|\| undefined\}/g
      )
    ).toHaveLength(2);
    expect(viewerHeaderSource).not.toMatch(/data-escape-shortcut\s*\n/);
    expect(overflowMenuSource).not.toContain("Open TKA");
  });

  it("uses one shared Share control and keeps Send inside it", () => {
    expect(viewerHeaderSource).toContain(
      'from "#lib/shared/share/components/ShareActionMenu.svelte"'
    );
    expect(viewerHeaderSource).toContain('testId="viewer-share-button"');
    expect(viewerHeaderSource).toContain("containDesktopMenu={true}");
    expect(viewerHeaderSource).toContain(
      "onActionSelect={onShareActionSelect}"
    );
    expect(shellSource).toContain("createViewerShellShareState");
    expect(shellModelSource).toContain('label: "Share Sequence…"');
    expect(shellModelSource).toContain('label: "Send in Flow Arts Composer"');
    expect(shellModelSource).toMatch(
      /label:\s*linkCopied\s*\?\s*"Copied"\s*:\s*"Copy Link"/
    );
    expect(shellShareStateSource).toContain("shareLinkCopied = true");
    expect(viewerHeaderSource).not.toContain("onSendTo={handleSendTo}");
  });

  it("leaves the video file to Share and the 3D take to the stage", () => {
    // The Export page keeps its settings but loses its own render button, so
    // the file has one route and cannot drift between two flows. A 3D take is
    // filmed with the stage's Record button; Share hands over the film.
    expect(shellSource).toContain("showExportAction={false}");
    expect(shellSource).toContain(
      "onDownload={() => void downloadFromShare()}"
    );
    expect(shellSource).toContain("ctx.saveRetainedFilm(film.id)");
    expect(shellSource).toContain('text: t("viewer_ui_record_a_take")');
    expect(shellSource).not.toContain("suspendForSceneTake");
  });

  it("keeps More compact-only and limits the primary row to four actions", () => {
    expect(viewerHeaderSource).toMatch(
      /\{#if compactChrome\}[\s\S]*?<ViewerOverflowMenu/
    );
    expect(
      viewerHeaderSource.match(/class="viewer-action core-action/g)
    ).toHaveLength(4);
    expect(viewerHeaderSource).toContain('class="context-actions"');
    expect(viewerHeaderSource).not.toContain(
      "{#if !compactChrome && guideAction}"
    );
    expect(shellSource).toContain(
      "footerAction={!embedded && !layout.compactChrome && guideAction"
    );
    expect(viewerHeaderSource).toContain("{isSaving}");
  });

  it("does not duplicate the app launch when the account avatar already opens it", () => {
    expect(viewerHeaderSource).toMatch(
      /showOpenAppAction = \$derived\([\s\S]*?authState\.isFullAccount/
    );
    expect(viewerHeaderSource).toContain(
      "onOpenApp={showOpenAppAction ? onOpenApp : undefined}"
    );
  });

  it("keeps admin clipboard tooling out of customer viewer chrome", () => {
    expect(shellSource).not.toContain("getClaudeCodeCopier");
    expect(shellShareStateSource).not.toContain("copyForClaude");
    expect(viewerHeaderSource).not.toContain("Copy Data");
    expect(overflowMenuSource).not.toContain("Copy Data");
  });

  it("labels Save by its action and exposes immediate pending feedback", () => {
    expect(viewerHeaderSource).toContain(
      '>{t("viewer_header_saving_short")}</span'
    );
    expect(viewerHeaderSource.replace(/\s+/g, " ")).toContain(
      '{isSaving ? t("viewer_header_saving_short") : isSaved ? t("viewer_header_saved_short") : t("browse_save")}'
    );
    expect(englishMessages.viewer_header_saving_short).toBe("Saving…");
    expect(englishMessages.viewer_header_saved_short).toBe("Saved");
    expect(englishMessages.browse_save).toBe("Save");
    expect(viewerHeaderSource).not.toContain(
      '<span class="action-label">Library</span>'
    );
  });

  it("does not expose the unfinished Coven hub from viewer overflow", () => {
    expect(overflowMenuSource).not.toContain("View in coven hub");
    expect(overflowMenuSource).not.toContain("__FEATURE_COVEN__");
  });

  it("keeps the current word as the stable centered identity", () => {
    expect(viewerHeaderSource).toContain("<WordActionMenu");
    expect(viewerHeaderSource).toContain("<WordHeader");
    expect(viewerHeaderSource).toContain(
      "activeStepNumber={activeWordStepNumber}"
    );
    expect(viewerHeaderSource).toContain('ctx.editingPane !== "image"');
    expect(shellSource).toContain(
      "sequence={ctx.effectiveSequence ?? sequence}"
    );
    expect(viewerMotionSurfaceSource.match(/\s+hideHeader\s*\n/g)).toHaveLength(
      1
    );
    expect(viewerHeaderSource).not.toContain('label: "Copy word"');
    expect(viewerHeaderSource).not.toContain("Sequence Viewer");
    expect(viewerHeaderSource).not.toContain("Animation Export");
    expect(viewerHeaderSource).not.toContain("Record Scene");
  });

  it("uses Bits UI for the explicit More popover", () => {
    expect(overflowMenuSource).toContain('import { Popover } from "bits-ui"');
    expect(overflowMenuSource).toContain("<Popover.Content");
    expect(overflowMenuSource).not.toContain("overflow-backdrop");
    expect(overflowMenuSource).not.toContain(
      "querySelectorAll<HTMLButtonElement>"
    );
  });

  it("fits glyph titles at the card-header boundary", () => {
    expect(cardHeaderSource).toMatch(
      /<TKAWordGlyph[\s\S]*?fitToParent[\s\S]*?\/>/
    );
  });

  it.each(hostEntries)("%s renders SequenceViewerShell", (_name, source) => {
    expect(source).toContain("SequenceViewerShell.svelte");
    expect(source).toContain("<SequenceViewerShell");
  });

  it("keeps /q as an attribution ingress instead of a viewer host", () => {
    expect(scanSource).toContain("buildScanSequenceDestination");
    expect(scanSource).toContain("replace: true");
    expect(scanSource).not.toContain("SequenceViewerShell.svelte");
    expect(scanSource).not.toContain("SequenceViewerOrchestrator.svelte");
  });

  it("starts the scan ingress and viewer downloads together", () => {
    // Serial loading (ingress graph, then the viewer graph from the ingress's
    // onMount) cost a phone scan ~3 s. The route load starts both at once.
    const scanLoadSource = read("src/routes/q/[code]/+page.ts");
    expect(scanLoadSource).toContain('import("./QScanPage.svelte")');
    expect(scanLoadSource).toContain("loadSequenceViewerPage()");
    // The handoff's route data loads while the viewer graph finishes.
    const preload = scanSource.indexOf("preloadData(destination)");
    expect(preload).toBeGreaterThan(-1);
    expect(preload).toBeLessThan(scanSource.indexOf("await viewerModule"));
  });

  it.each(hostEntries)(
    "%s declares no calculator-owned theme vars (shadowing bug)",
    (_name, source) => {
      // Declarations like `--theme-accent: #123;` shadow the :root values set
      // by applyThemeForBackground() for the whole subtree. Consuming them via
      // var(--theme-accent, fallback) is fine and does not match this pattern.
      const declarations = source.match(
        /^\s*--(?:theme|semantic)-[\w-]+\s*:/gm
      );
      expect(declarations ?? []).toEqual([]);
    }
  );

  it.each(hostEntries)(
    "%s imports no chrome internals (chrome lives in the shell)",
    (_name, source) => {
      const imports = importSpecifierLines(source).join("\n");
      const violations = CHROME_INTERNALS.filter((marker) =>
        imports.includes(marker)
      );
      expect(violations).toEqual([]);
    }
  );

  it.each(hostEntries)(
    "%s contains no shell-owned markup markers",
    (_name, source) => {
      const violations = SHELL_MARKUP_MARKERS.filter((marker) =>
        source.includes(marker)
      );
      expect(violations).toEqual([]);
    }
  );

  it.each(hostEntries)(
    "%s uses the shared 768px mobile breakpoint",
    (_name, source) => {
      expect(source).toMatch(/<\s*768\b/);
    }
  );

  // The counter increment and the scanEvents write moved behind
  // /api/physical-cards/scan, so the host's half of the contract is now the
  // recordCardScan call rather than the two Firestore writes it replaced.
  it("records card scans only from the dedicated /q host", () => {
    expect(scanSource).toContain("isFirstScanRouteVisit");
    expect(scanSource).toContain("recordCardScan");

    for (const directLinkSource of [
      drawerSource,
      sequenceRouteSource,
      spiroanimBridgeRouteSource,
    ]) {
      expect(directLinkSource).not.toContain("isFirstScanRouteVisit");
      expect(directLinkSource).not.toContain("recordCardScan");
      expect(directLinkSource).not.toContain("incrementScanCount");
      expect(directLinkSource).not.toContain("logScanEvent");
    }
  });
});

describe("scan attribution boundary", () => {
  afterEach(() => {
    window.history.replaceState({}, "", "/");
    sessionStorage.clear();
  });

  it("does not treat a typed in-app viewer URL as a card scan", () => {
    window.history.replaceState({}, "", "/create/construct?v=O263");

    expect(isFirstScanRouteVisit("O263")).toBe(false);
    expect(sessionStorage.getItem("tka:scanned:O263")).toBeNull();
  });

  it("allows the dedicated scan route once per tab", () => {
    window.history.replaceState({}, "", "/q/O263");

    expect(isFirstScanRouteVisit("O263")).toBe(true);
    expect(isFirstScanRouteVisit("O263")).toBe(false);
  });
});
