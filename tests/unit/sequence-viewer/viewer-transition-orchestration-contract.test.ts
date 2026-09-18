import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string): string =>
  readFileSync(resolve(process.cwd(), path), "utf8");

const splitPane = read(
  "src/lib/shared/sequence-viewer/components/ViewerSplitPane.svelte"
);
const splitPaneCss = read(
  "src/lib/shared/sequence-viewer/components/viewer-split-pane.css"
);
const shell = read(
  "src/lib/shared/sequence-viewer/components/SequenceViewerShell.svelte"
);
const workspacePanels = read(
  "src/lib/shared/sequence-viewer/components/ViewerWorkspacePanels.svelte"
);
const contentRail = read(
  "src/lib/shared/sequence-viewer/components/ViewerContentRail.svelte"
);
const modeBottomBar = read(
  "src/lib/shared/sequence-viewer/components/ViewerModeBottomBar.svelte"
);
const shellLayoutState = read(
  "src/lib/shared/sequence-viewer/state/viewer-shell-layout-state.svelte.ts"
);
const panelGroup = read("src/lib/shared/panels/PanelGroup.svelte");
const panelFlex = read("src/lib/shared/panels/panel-flex.ts");
const shellModel = read(
  "src/lib/shared/sequence-viewer/services/viewer-shell-model.ts"
);
const viewerModeDissolve = read(
  "src/lib/shared/transitions/viewer-mode-dissolve.ts"
);
const viewTransitions = read("src/lib/shared/transitions/view-transitions.css");
const reviewPage = read(
  "src/routes/test/sequence-viewer-transitions/+page.svelte"
);
const reviewFrame = read(
  "src/routes/test/sequence-viewer-transitions/_components/SequenceViewerTransitionReviewFrame.svelte"
);
const geometryTrace = read(
  "src/routes/test/sequence-viewer-transitions/_components/TransitionGeometryTrace.svelte"
);
const motionSurface = read(
  "src/lib/shared/sequence-viewer/components/ViewerMotionSurface.svelte"
);
const tunnelController = read(
  "src/lib/shared/sequence-viewer/tunnel/tunnel-view-controller.svelte.ts"
);
const tunnelLayerReveal = read(
  "src/lib/shared/sequence-viewer/tunnel/tunnel-layer-reveal.ts"
);
const canvasApplicationManager = read(
  "src/lib/shared/animation-engine/services/canvas2d/canvas-2d-application-manager.ts"
);
const canvas2DRenderer = read(
  "src/lib/shared/animation-engine/services/canvas-2d-animation-renderer.ts"
);
const sceneLoadingCurtain = read(
  "src/lib/shared/3d/scene-features/components/SceneLoadingCurtain.svelte"
);
const scenePreparationSurface = read(
  "src/lib/shared/3d/scene-features/components/ScenePreparationSurface.svelte"
);
const companionSurface = read(
  "src/lib/shared/sequence-viewer/components/ViewerCompanionSurface.svelte"
);
const choreoCard = read(
  "src/lib/shared/sequence-viewer/components/ChoreoCard.svelte"
);
const animationPanel = read(
  "src/lib/shared/animation-panel/components/AnimationPanel.svelte"
);
const tunnelArtSettings = read(
  "src/lib/shared/sequence-viewer/components/art-settings/TunnelArtSettings.svelte"
);
const animatorInspectorShell = read(
  "src/lib/shared/animation-panel/components/AnimatorInspectorShell.svelte"
);
const animatorInspectorFooter = read(
  "src/lib/shared/animation-panel/components/AnimatorInspectorFooter.svelte"
);
const animatorInspectorState = read(
  "src/lib/shared/sequence-viewer/state/viewer-animator-inspector-state.svelte.ts"
);
const cardSizingState = read(
  "src/lib/shared/choreo-card/state/choreo-card-sizing-state.svelte.ts"
);
const artPane = read(
  "src/lib/shared/sequence-viewer/components/ArtPane.svelte"
);
const sequenceVideos = read(
  "src/lib/shared/sequence-viewer/components/sequence-videos/SequenceVideos.svelte"
);
const performanceState = read(
  "src/lib/shared/sequence-viewer/components/sequence-videos/state/performance-workspace-state.svelte.ts"
);
const performanceStage = read(
  "src/lib/shared/sequence-viewer/components/sequence-videos/PerformanceStage.svelte"
);

/**
 * The shell's CSS as {selector, body} pairs. Assertions about a rule ask for it
 * by what it selects; matching raw source text instead makes a prettier reflow
 * look like a deleted rule, or worse, silently matches a different rule.
 */
const shellRules = [...shell.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(
  (match) => ({
    selector: match[1]!.trim().replace(/\s+/g, " "),
    body: match[2]!,
  })
);

/** The desktop rule that composes one inspector layer at its own width. */
function composedRule(layer: string): string {
  const rule = shellRules.find(
    (candidate) =>
      candidate.selector.includes(".viewer-and-export.desktop") &&
      candidate.selector.includes(`.${layer}`)
  );
  expect(rule, `${layer} has no composed-width rule`).toBeDefined();
  return rule!.body;
}

/** Every rule whose selector ends at `marker`, whatever precedes it. */
function rulesSelecting(marker: string): string[] {
  return shellRules
    .filter((rule) => rule.selector.includes(marker))
    .map((rule) => rule.body);
}

describe("Sequence Viewer transition orchestration contract", () => {
  it("composes 2D and Tunnel settings from one inspector shell", () => {
    expect(animationPanel).toContain("<AnimatorInspectorShell");
    expect(tunnelArtSettings).toContain("<AnimatorInspectorShell");
    expect(animationPanel).toContain("<AnimatorInspectorFooter");
    expect(tunnelArtSettings).toContain("<AnimatorInspectorFooter");
    // 7672b256d7 gave the wide-sidebar Props page its whole page too (the
    // 18-tile picker needed the room the old two-way condition didn't grant),
    // reformatting the three-way check across lines.
    expect(animationPanel).toContain(
      'fillBody={resolvedPill === "display" ||\n' +
        '      resolvedPill === "effects" ||\n' +
        '      resolvedPill === "props"}'
    );
    expect(tunnelArtSettings).toContain(
      'fillBody={tunnelSection === "display" || tunnelSection === "effects"}'
    );
    expect(animatorInspectorShell).toContain("<IconRailNav");
    expect(animatorInspectorShell).toContain('class="panel-transition"');
    expect(animatorInspectorShell).toContain("scrollbar-gutter: stable");
    expect(animatorInspectorFooter).toContain("background: var(--theme-accent");
    expect(animatorInspectorFooter).toContain(
      "class:empty={!meta || disabled}"
    );
    expect(animatorInspectorState).toContain(
      '"effects",\n  "props",\n  "motion",\n  "display"'
    );
    expect(tunnelArtSettings).toContain('id: "display"');
    expect(tunnelArtSettings).toContain('id: "motion" as const');
    expect(tunnelArtSettings).toContain("<TunnelEffectsSettings");
  });

  it("seats Tempo and Mode on one row where a host has no Paths page", () => {
    expect(animationPanel, "solo column is unmarked").toMatch(
      /\{:else if showTempoControls \|\| onPlaybackModeChange\}\s*<div class="motion-col motion-col-solo">/
    );
    expect(animationPanel, "solo column still shares a two-column row").toMatch(
      /\.motion-col-solo \{\s*grid-column: 1 \/ -1;/
    );
    expect(animationPanel, "Tempo and Mode still stack").toMatch(
      /\.motion-col-solo > :global\(\.playback-rows\) \{\s*display: grid;\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/
    );
  });

  it("lets the dock tray size itself around the Display rows", () => {
    // The sidebar hands these rows a height to divide, so they fill it. The
    // dock tray is the other way round: it takes its height FROM the content.
    // Left filling there, the rows report zero, and the Display tab collapses
    // to its own padding behind the dock bar with nothing visible.
    expect(animationPanel, "dock tray Display rows still fill").toMatch(
      /\.dock-dense \.display-rows,\s*\.dock-dense \.display-rows \.rt-section \{\s*flex: 0 0 auto;/
    );
  });

  it("names both responsive switchers as Sequence views", () => {
    expect(contentRail).toContain('aria-label="Sequence views"');
    expect(modeBottomBar).toContain('aria-label="Sequence views"');
  });

  it("routes split geometry through the canonical PanelGroup owner", () => {
    expect(splitPane).toContain(
      'import PanelGroup from "$lib/shared/panels/PanelGroup.svelte"'
    );
    expect(splitPane).toContain("{#snippet animationPanel()}");
    expect(splitPane).toContain("{#snippet previewPanel()}");
    expect(splitPane).toContain(
      "<PanelGroup\n    direction={panelLayout.direction}"
    );
    // The animation panel becomes resizable when the Side by Side divider is
    // on; the preview panel stays fixed.
    expect(splitPane).toMatch(
      /id: "animation",\s*content: animationPanel,\s*resizable: splitResizable,/
    );
    expect(splitPane).toContain("content: previewPanel");
  });

  it("keeps collapsed production panes mounted, hidden, and inert", () => {
    expect(splitPane).toContain(
      'inert={layout.focusedPane === "image" || !animationPanelReady}'
    );
    expect(splitPane).toContain(
      'inert={layout.focusedPane === "animation" || !previewPanelReady}'
    );
    expect(splitPane).toContain(
      'aria-hidden={layout.focusedPane === "image" || !animationPanelReady}'
    );
    expect(splitPane).toContain(
      'aria-hidden={layout.focusedPane === "animation" || !previewPanelReady}'
    );
    expect(splitPane).not.toContain("{#if layout.focusedPane");
  });

  it("uses the shared emphasis clock instead of focused grid endpoints", () => {
    expect(splitPaneCss).toContain(
      "transition: opacity var(--transition-fast);"
    );
    expect(splitPaneCss).toContain('data-readable="false"');
    expect(splitPaneCss).toContain(
      ':root[data-motion-preference="reduce"] .split-view'
    );
    expect(splitPaneCss).toContain("transition: none !important;");
    expect(splitPaneCss).not.toMatch(
      /\[data-focused=[^\]]+\]\s*\{[^}]*grid-template/s
    );
    expect(splitPane).not.toContain("data-landscape=");
    expect(splitPane).not.toContain("data-fullscreen-stack=");
    expect(splitPane).not.toContain("data-adaptive-stack=");
  });

  it("routes inspector presence through the same canonical panel owner", () => {
    expect(shell).toContain("<ViewerWorkspacePanels");
    expect(shell).toContain(
      'direction={layout.effectiveMobile ? "vertical" : "horizontal"}'
    );
    expect(shell).not.toContain("grid-template-columns: 1fr 0px");
    expect(shell).not.toContain("transition: grid-template-columns");
    expect(workspacePanels).toContain(
      'import PanelGroup, {\n    type PanelDefinition,\n  } from "$lib/shared/panels/PanelGroup.svelte"'
    );
    expect(workspacePanels).toContain('id: "export-inspector"');
    expect(workspacePanels).toContain('id: "export-inspector-stacked"');
    expect(workspacePanels).toContain("!inspectorActive || inspectorCollapsed");
    expect(workspacePanels).toContain('if (direction === "horizontal")');
    expect(workspacePanels).toContain("else if (inspectorActive)");
    expect(workspacePanels).toContain("fixedSize:");
    expect(workspacePanels).toContain("preferredSize:");
    expect(workspacePanels).toContain("resizable: inspectorResizable");
    expect(workspacePanels).toContain(
      "gap={inspectorResizable ? VIEWER_INSPECTOR_HANDLE_SIZE : 0}"
    );
    expect(workspacePanels).toContain(
      "if (inspectorActive) workspaceDirection = direction;"
    );
    expect(workspacePanels).toContain("direction={workspaceDirection}");
    expect(panelGroup).toContain("style={getFlexStyle(panel, i)}");
    // Fixed still outranks preferred, and both still hold the panel so its
    // basis is its size. That decision moved to the panel-flex owner, which is
    // where the measured-handoff rule can be tested without a layout engine.
    expect(panelFlex).toContain("if (panel.fixedSize)");
    expect(panelFlex).toContain(
      "if (panel.preferredSize && !options.manuallySized)"
    );
    expect(panelGroup).toContain("resolvePanelFlex(panel, {");
    // A held dock that swaps `480px` for `auto` cannot be interpolated by CSS,
    // so PanelGroup measures both ends rather than letting the group re-lay out
    // in one frame and teleport everything below the dock.
    expect(panelFlex).toContain("export function needsMeasuredBasisHandoff(");
    expect(panelFlex).toContain("isHeldPanel(previous) && isHeldPanel(next)");
    expect(panelGroup).toContain("needsMeasuredBasisHandoff(previous, next)");
    expect(panelGroup).toContain("startBasisHandoff");
    expect(panelGroup).toContain("element.style.flexBasis = `${from}px`");
    expect(panelGroup).toContain("prefersReducedMotion()");
    expect(panelGroup).toContain("data-manually-sized=");
    expect(panelGroup).toContain("panel.resizeLabel ??");
    expect(shell).toContain("data-effects-inspector");
    expect(shell).toContain(
      ".motion-settings-layer .animator-inspector-origin"
    );
    expect(shell).toContain("--card-sidebar-width: clamp(480px, 28vw, 640px)");
    expect(shell).toContain('panel-wrapper[data-manually-sized="true"]');
    expect(geometryTrace).toContain("Card → Effects seam");
    expect(geometryTrace).toContain("2D return allocation");
    expect(shellLayoutState).not.toContain("splitModePromotionTimer");
    expect(shell).toContain(
      'class="inspector-content-layer card-settings-layer"'
    );
    expect(shell).toContain("data-active={cardInspectorVisible}");
    // Send mode owns the inspector track, so the card inspector yields to it
    // before the export and studio conditions are consulted.
    expect(shell).toContain(
      "const cardInspectorVisible = $derived(\n    !share.sendModeActive &&\n      (layout.isImageExportActive ||"
    );
    expect(shellLayoutState).toContain(
      'if (previousMode !== "card" && mode === "card")'
    );
    expect(shellLayoutState).toContain(
      'else if (previousMode === "card" && mode !== "card")'
    );
    expect(shellLayoutState).toContain(
      'previousMode === "split" ? "focus" : "restore"'
    );
    expect(choreoCard).toContain(
      '.choreo-card-root[data-contain-size-motion="restore"] .preview-stack'
    );
    expect(choreoCard).toContain("flex: 0 0 auto;");
    expect(shell).toContain("const cardOwnsReadablePane =");
  });

  it("reviews the real production shell through production mode buttons", () => {
    expect(reviewFrame).toContain("<SequenceViewerOrchestrator");
    expect(reviewFrame).toContain("<SequenceViewerShell");
    expect(reviewFrame).toContain(
      'document.querySelectorAll<HTMLButtonElement>("button[aria-label]")'
    );
    expect(reviewFrame).toContain("button.click()");
    expect(reviewPage).toContain("Stress reversal");
    expect(reviewPage).toContain("Replay with 2D");
    expect(reviewPage).toContain("Replay with Tunnel");
    expect(reviewPage).toContain('{ value: "reduce", label: "Reduced" }');
    expect(reviewPage).toContain("No viewport overflow");
    expect(reviewFrame).toContain('action: "motion"');
    expect(reviewFrame).toContain("scheduleMetrics()");
    expect(reviewPage).toContain('onclick={() => review.mark("approved")}');
    expect(reviewPage).toContain(
      'const requestedGateId = page.url.searchParams.get("gate")'
    );
  });

  it("starts mobile review frames at their final geometry and keeps the gate scrollable", () => {
    expect(reviewFrame).toContain(
      "let isMobile = $state(browser && window.innerWidth < 768);"
    );
    expect(reviewFrame).toContain('button.classList.contains("active")');
    expect(reviewPage).toContain("onchange={setViewport}");
    expect(reviewPage).toContain(
      "{#key `${selectedViewport.id}-${review.activeGateId}-${frameVersion}`}"
    );
    expect(reviewPage).toContain("height: 100dvh;");
    expect(reviewPage).toContain("overflow-y: auto;");
  });

  it("uses a no-remount opacity dissolve for Gate 1 reduced motion", () => {
    expect(shell).toContain("bind:this={viewerWorkspaceElement}");
    expect(viewerModeDissolve).toContain("document.startViewTransition");
    expect(viewerModeDissolve).toContain("flushSync(mutate)");
    expect(viewerModeDissolve).toContain("reducedMotion()");
    expect(viewerModeDissolve).not.toContain("Crossfade.svelte");
    expect(viewTransitions).toContain(
      "::view-transition-group(\n    sequence-viewer-workspace"
    );
    expect(viewTransitions).toContain("animation: none !important;");
    expect(viewTransitions).toContain("sequence-viewer-dissolve-out");
    expect(viewTransitions).toContain("sequence-viewer-dissolve-in");
    expect(reviewPage).toContain("Reduced motion · dissolve");
  });

  it("presents an honest 3D-owned preparation surface on first activation", () => {
    expect(motionSurface).toContain("const is3DPresented = $derived(");
    expect(motionSurface).toContain("is3DActive || keep3DUntilTunnelPaints");
    expect(motionSurface).toContain(
      "is2DActive || (isTunnelActive && !keep3DUntilTunnelPaints)"
    );
    expect(motionSurface).toContain('initialRevealMode: "gated"');
    expect(motionSurface).toContain(
      '<ScenePreparationSurface statusText="Opening 3D" />'
    );
    expect(sceneLoadingCurtain).toContain(
      "<ScenePreparationSurface {statusText} {progress} />"
    );
    expect(scenePreparationSurface).toContain("data-scene-preparation");
    expect(scenePreparationSurface).toContain("3D viewer");
    expect(scenePreparationSurface).toContain('role="progressbar"');
    expect(scenePreparationSurface).toContain(
      "aria-valuenow={percent ?? undefined}"
    );
    expect(motionSurface).not.toContain("viewer-3d-handoff-status");
    expect(motionSurface).toMatch(
      /!inStudio\s*&&\s*preparationCanvasWidth !== null/
    );
    expect(motionSurface).toContain(
      "data-3d-preparation-held={preparationCanvasWidth !== null || undefined}"
    );
    expect(splitPaneCss).toContain(
      ".canvas-2d-layer.canvas-2d-preparation-held"
    );
    expect(splitPaneCss).toContain("width: var(--preparation-canvas-width)");
    expect(motionSurface).toContain("data-scene-ready={scene3DReady}");
    expect(motionSurface).toContain("inert={!is3DActive}");
    expect(motionSurface).toContain("inert={!isAnimatorActive}");
    expect(motionSurface).toContain("const releaseWhenCovered = () =>");
    expect(motionSurface).toContain("requestAnimationFrame(");
    expect(motionSurface).toContain("getComputedStyle(pane2D).opacity");
    expect(splitPaneCss).toContain("opacity var(--transition-emphasis)");
    expect(viewerModeDissolve).toContain(
      'previousMode === "animation" && nextMode === "animation-3d"'
    );
    expect(reviewFrame).toContain('message.command === "3d-first"');
    expect(reviewFrame).toContain("await waitFor3DReady(version)");
    expect(scenePreparationSurface).toContain(
      "data-scene-preparation-progress"
    );
    expect(geometryTrace).toContain("Misidentified 3D frames");
    expect(geometryTrace).toContain("Progress regressions");
    expect(reviewPage).toContain("Replay first 3D");
    expect(reviewPage).toContain("Replay repeat switch");
    expect(reviewPage).toContain(
      'import { fits3DViewport } from "$lib/shared/3d/capabilities/viewport-3d-gate.svelte"'
    );
    expect(reviewPage).toContain("!activeGateCanReplay");
    expect(reviewPage).toContain(
      "3D is intentionally withheld at this viewport."
    );
  });

  it("keeps reduced 2D and 3D motion to a canonical opacity-only handoff", () => {
    expect(splitPaneCss).toContain(
      ".media-pane.persistent-3d[data-motion-surface]"
    );
    expect(splitPaneCss).toContain(
      ".media-pane.persistent-2d[data-motion-surface]"
    );
    expect(splitPaneCss).toContain(
      "transition-property: opacity, visibility !important;"
    );
    expect(splitPaneCss).toContain(
      "transition-duration: var(--duration-normal), 0s !important;"
    );
    expect(splitPaneCss).toContain(
      "transition-delay: 0s, var(--duration-normal) !important;"
    );
  });

  it("keeps one inspector shell while 2D and Tunnel controls trade places", () => {
    expect(shell).toContain("createViewerInspectorHostState()");
    expect(shell).toContain("setViewerInspectorHostContext(inspectorHost)");
    expect(shell).toContain("layout.isWorkspaceInspectorActive");
    expect(shell).toContain("data-viewer-art-inspector-target");
    expect(artPane).toContain(
      "use:reparentToInspector={externalInspectorTarget}"
    );
    expect(artPane).toContain("data-art-settings={artType}");
    expect(artPane).toContain("data-active={presented}");
  });

  it("morphs the persistent Animator canvas into Tunnel without a canvas swap", () => {
    expect(companionSurface).toContain('data-companion-surface="tunnel"');
    expect(companionSurface).toContain("sharedTunnelCanvas");
    expect(companionSurface).toContain("controller={tunnelStage.controller}");
    expect(motionSurface).toContain("data-persistent-animator");
    expect(motionSurface).toContain("data-tunnel-blend");
    expect(motionSurface).toContain(
      "additionalLayers={inStudio ? [] : tunnelLayers}"
    );
    expect(motionSurface.match(/<AnimatorCanvas/g)).toHaveLength(1);
    expect(motionSurface).toContain("resolveTunnelLayerOpacity(");
    expect(motionSurface).toContain("tunnelLayerPoseDifference(");
    expect(motionSurface).not.toContain("interpolateTunnelLayerProp(");
    expect(motionSurface).not.toContain("trailCaptureSuppressed:");
    expect(motionSurface).toContain(
      'tunnelVisualActive && activeEffect !== "none"'
    );
    expect(motionSurface).toContain("tipEffectMap={tunnelTipEffectMap}");
    expect(splitPane).toContain("prepareWhileInactive: true");
    expect(tunnelController).toContain("get layersReady(): boolean");
    expect(tunnelController).toContain("preparedAdditionalLayersAt(");
    expect(motionSurface).not.toContain("if (!tunnelController.layersReady)");
    expect(motionSurface).toContain(
      "preloadAdditionalLayers={preparedTunnelLayers}"
    );
    expect(motionSurface).toContain("data-tunnel-textures-ready");
    expect(motionSurface).toContain(
      "if (!tunnelController.layersReady || !tunnelTexturesReady) return"
    );
    expect(tunnelLayerReveal).toContain(
      "export function resolveTunnelGridOpacity("
    );
    expect(tunnelLayerReveal).toContain("DURATION.emphasis + DURATION.normal");
    expect(splitPane).toContain("motionDuration(TUNNEL_REVEAL_DURATION)");
    expect(motionSurface).toContain(
      "gridOpacity={inStudio ? 1 : tunnelGridOpacity}"
    );
    expect(motionSurface).toContain("data-tunnel-layer-opacity-max");
    expect(motionSurface).toContain("data-tunnel-layer-opacity-mean");
    expect(motionSurface).toContain("data-tunnel-perceptible-layer-count");
    expect(motionSurface).toContain("data-tunnel-formation-pose-drift");
    expect(reviewFrame).toContain("tunnelLayerOpacityMaximum:");
    expect(canvasApplicationManager).toContain(
      'this.canvas.dataset.animationLayer = "props"'
    );
    expect(reviewFrame).toContain('canvas[data-animation-layer="props"]');
    expect(canvas2DRenderer).toContain("publishTunnelPaintTelemetry(");
    expect(canvas2DRenderer).toContain(
      'capture.dataset.captureTunnelPaint !== "true"'
    );
    expect(canvas2DRenderer).toContain(
      "paintedTunnelOpacities.push(ctx.globalAlpha)"
    );
    expect(reviewFrame).toContain("setTunnelPaintCapture(true)");
    expect(reviewFrame).toContain("readTunnelPaintHistory()");
    expect(reviewFrame).toContain("tunnelPaintSamples:");
    expect(reviewFrame).toContain("tunnelPaintedOpacityMean:");
    expect(geometryTrace).toContain("Reveal-before-layers frames:");
    expect(geometryTrace).toContain("Largest grid alpha step:");
    expect(geometryTrace).toContain("Layer timing spread:");
    expect(geometryTrace).toContain("Ensemble legibility:");
    expect(geometryTrace).toContain("Painted prop arrival:");
    expect(geometryTrace).toContain("Formation trail captures:");
    expect(geometryTrace).toContain("Trail-safe formation:");
    expect(geometryTrace).toContain("Formation placement:");
    expect(viewerModeDissolve).toContain(
      'GATE_THREE_STAGE_MODES.has(previousMode) && nextMode === "tunnel"'
    );
    expect(reviewFrame).toContain('message.command === "tunnel-first"');
    expect(reviewPage).toContain("Replay first Tunnel");
    expect(reviewPage).toContain("Replay from 3D");
  });

  it("instruments singleton identity instead of inferring continuity from opacity", () => {
    expect(reviewFrame).toContain("const elementIdentities = new WeakMap");
    expect(reviewFrame).toContain(
      'animatorIdentity: elementIdentity("[data-persistent-animator]")'
    );
    expect(reviewFrame).toContain("activeArtSettingsCount:");
    expect(geometryTrace).toContain("Animator remounts:");
    expect(geometryTrace).toContain("Inspector remounts:");
    expect(geometryTrace).toContain("Non-singleton canvas frames:");
  });

  it("lets every inspector panel choose its own anchor and surfaces the track", () => {
    // An automatic start margin absorbs free space when the panel fits, so a
    // departing surface stays at the viewport edge and fades without sliding,
    // and collapses to zero when it does not, so an arriving surface is
    // revealed from the seam with its overflow past the screen edge. Anchoring
    // by hand gets one direction right and the other wrong.
    const autoAnchored = (marker: string) => {
      const bodies = rulesSelecting(marker);
      expect(
        bodies.length,
        `${marker} has no composed-width rule`
      ).toBeGreaterThan(0);
      expect(
        bodies.some((body) => body.includes("margin-left: auto")),
        `${marker} is anchored by hand`
      ).toBe(true);
    };
    autoAnchored(".animator-inspector-origin");
    autoAnchored(":global(.performance-inspector)");
    autoAnchored(":global(.export-panel:not(.inline))");
    autoAnchored(":global(.art-settings-panel)");

    // The surface belongs to the layer, which spans the whole track, not to the
    // panel, which does not. Otherwise the band the panel does not reach shows
    // the workspace through the container's partly transparent fill.
    const layerIndex = shell.indexOf(".inspector-content-layer {");
    expect(layerIndex).toBeGreaterThan(-1);
    expect(shell.slice(layerIndex, layerIndex + 320)).toContain(
      "background: var(--theme-panel-bg"
    );
    const resetIndex = shell.indexOf(
      ".inspector-content-layer :global(.export-panel),"
    );
    expect(resetIndex, "panels still paint their own surface").toBeGreaterThan(
      -1
    );
    expect(shell.slice(resetIndex, resetIndex + 260)).toContain(
      "background: transparent"
    );
  });

  it("composes every inspector layer at its destination width", () => {
    // A settings surface that is width-100% of the animating inspector track
    // re-wraps on every frame of the seam animation, which reads as the panel
    // sliding and settling rather than being revealed. Each persistent layer
    // pins its own destination width instead.
    const composed = (layer: string, token: string) => {
      expect(composedRule(layer)).toContain(`width: var(--${token})`);
    };
    composed("motion-settings-layer", "export-sidebar-width");
    composed("performance-inspector-layer", "performance-sidebar-width");
    composed("art-settings-layer", "export-sidebar-width");
    // The card pin must hang off the persistent layer, not the mode-conditional
    // container class: Svelte removes that class the instant the mode changes,
    // so the departing Card panel loses its width mid-transition.
    composed("card-settings-layer", "card-sidebar-width");
    // Direct manipulation still wins over the composed width.
    for (const layer of [
      "motion-settings-layer",
      "performance-inspector-layer",
      "art-settings-layer",
      "card-settings-layer",
    ]) {
      const index = shell.indexOf(`"true"])
    .${layer}`);
      expect(index, `${layer} has no manual-resize override`).toBeGreaterThan(
        -1
      );
      expect(shell.slice(index, index + 400)).toContain("width: 100%");
    }
  });

  it("composes Performances through the persistent stage and inspector tracks", () => {
    expect(workspacePanels).toContain("data-persistent-viewer-stage");
    expect(shell).toContain("data-persistent-performance-stage");
    expect(shell).toContain("data-persistent-performance-inspector");
    expect(shell).toContain("data-persistent-performance-editor");
    expect(workspacePanels).toContain("data-active={!takeoverActive}");
    expect(shell).toContain("data-active={layout.showVideoGallery}");
    expect(shell).toContain(
      'active={layout.showVideoGallery ? "second" : "first"}'
    );
    expect(workspacePanels).toContain("viewer-motion-stage-layer");
    expect(shell).toContain("performance-stage-layer");
    expect(shell).toContain("performance-inspector-layer");
    // Send mode keeps the live stage and puts the recipients in the inspector,
    // so it is not a workspace takeover: only the performance editor is.
    expect(shell).toContain("takeoverActive={workspaceTakeoverActive}");
    expect(shell).toContain("performanceEditorActive && !share.sendModeActive");
    expect(shellLayoutState).toContain("showVideoGallery ||");
    // Performances owns its own inspector profile. The gap between its width
    // and the effects inspector width is the seam travel Gate 5 animates.
    expect(shellLayoutState).toContain('? "performance"');
    expect(shellModel).toContain("performance: { defaultWidth: 400");
    expect(shell).toContain("--performance-sidebar-width");
    expect(shell).toContain(
      "class:performance-inspector={layout.inspectorProfile ==="
    );
    expect(workspacePanels).toContain("<DualSourceCrossfade");
    expect(shell).toContain("<DualSourceCrossfade");
    expect(workspacePanels).toContain('profile="soft-dissolve"');
    expect(workspacePanels).toContain("panel-workspace-transition-stage");
    expect(sequenceVideos).not.toContain("in:fade");
    expect(sequenceVideos).toContain("<PerformanceStage");
    expect(sequenceVideos).toContain("<PerformanceInspector");
    expect(performanceState).toContain(
      "if (!inputs.getActive() || !sequence?.id) return;"
    );
    expect(performanceState).toContain("activePlayer?.pause();");
    expect(performanceState).toContain('view === "browse"');
    expect(performanceStage).toContain(
      "poster={workspace.selectedVideo.thumbnailUrl}"
    );
    expect(viewerModeDissolve).toContain("GATE_FIVE_STAGE_MODES");
    expect(reviewFrame).toContain('message.command === "performances-2d"');
    expect(reviewFrame).toContain('message.command === "performances-3d"');
    expect(reviewFrame).toContain(
      'message.command === "performances-interrupt"'
    );
    expect(geometryTrace).toContain("Viewer stage remounts:");
    expect(geometryTrace).toContain("Performance stage remounts:");
    expect(geometryTrace).toContain("Visible inspector layout changes:");
    expect(geometryTrace).toContain("Maximum performance players:");
    expect(geometryTrace).toContain("Shared-background dip:");
  });

  it("animates the Card's contained box to its destination instead of freezing it", () => {
    // The contained box used to be frozen to a size captured on a previous
    // focus and held for the whole motion, so the distance to the real
    // destination was crossed in one untransitioned frame when the freeze
    // expired. Nothing may reintroduce a stale captured size.
    expect(cardSizingState).not.toContain("splitContainedSize");
    expect(cardSizingState).toContain("MIN_MEASURABLE_MOTION_SIZE");
    expect(cardSizingState).toContain(
      "availableWidth < MIN_MEASURABLE_MOTION_SIZE"
    );
    expect(cardSizingState).toContain(
      "availableHeight < MIN_MEASURABLE_MOTION_SIZE"
    );

    // Only this phase attribute carries the width and height transition, so it
    // has to outlive the workspace allocation and release on settled paints
    // rather than on the motion clock alone.
    expect(choreoCard).toContain(
      '.choreo-card-root[data-contain-size-motion="restore"] .preview-stack'
    );
    expect(shellLayoutState).toContain(
      "spatialDuration + motionDuration(DURATION.emphasis)"
    );
    expect(shellLayoutState).toContain("cancelCardContainSizeMotionRelease");
    expect(shellLayoutState).toContain("cardContainSizeMotionSettleFrame");

    // The review harness has to keep sampling past that release, and grade the
    // frames after it, or the jump is invisible to the trace.
    expect(reviewFrame).toContain("SETTLE_TAIL_MS");
    expect(reviewFrame).toContain('setTracePhase("settle")');
    expect(reviewFrame).toContain('message.command === "card-performances"');
    expect(reviewFrame).toContain("cardContainSizeMotion: elementDataValue(");
    expect(geometryTrace).toContain("Card size pin release:");
  });
});
