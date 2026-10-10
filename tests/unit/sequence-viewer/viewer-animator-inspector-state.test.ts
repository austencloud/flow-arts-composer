import { describe, expect, it } from "vitest";
import { createViewerAnimatorInspectorState } from "#lib/shared/sequence-viewer/state/viewer-animator-inspector-state.svelte.js";

describe("viewer animator inspector state", () => {
  const animationSections = [
    "effects",
    "props",
    "motion",
    "display",
    "export",
  ] as const;
  const tunnelSections = [
    "effects",
    "props",
    "motion",
    "display",
    "tunnel",
    "speed",
  ] as const;

  it("keeps a shared section open across 2D and Tunnel", () => {
    const state = createViewerAnimatorInspectorState("effects");

    state.select("display");

    expect(state.resolve(animationSections)).toBe("display");
    expect(state.resolve(tunnelSections)).toBe("display");
  });

  it("falls back to the last shared section while a mode-only page is absent", () => {
    const state = createViewerAnimatorInspectorState("props");

    state.select("tunnel");

    expect(state.resolve(tunnelSections)).toBe("tunnel");
    expect(state.resolve(animationSections)).toBe("props");
  });

  it("maps the former Effort and Playback pages onto the shared Motion page", () => {
    const fromEffort = createViewerAnimatorInspectorState("effort");
    const fromPlayback = createViewerAnimatorInspectorState("playback");

    expect(fromEffort.resolve(animationSections)).toBe("motion");
    expect(fromPlayback.resolve(tunnelSections)).toBe("motion");
  });

  it("uses Effects when a persisted mode-only page has no shared history", () => {
    const state = createViewerAnimatorInspectorState("export");

    expect(state.resolve(tunnelSections)).toBe("effects");
  });
});
