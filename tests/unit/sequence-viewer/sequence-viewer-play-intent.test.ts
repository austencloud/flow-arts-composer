import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$app/navigation", () => ({
  pushState: vi.fn(),
  replaceState: vi.fn(),
}));
vi.mock("#lib/shared/qr/get-short-code-manager.js", () => ({
  getShortCodeManager: vi.fn(),
}));
vi.mock("#lib/shared/auth/state/auth-state.svelte.js", () => ({
  authState: {
    loading: false,
    isAuthenticated: false,
  },
}));

import {
  closeSequenceOverlay,
  getSequenceOverlayState,
  openSequenceOverlay,
} from "#lib/shared/sequence-viewer/state/sequence-viewer-overlay-state.svelte.js";

describe("sequence viewer Play intent", () => {
  const overlay = getSequenceOverlayState();

  beforeEach(() => {
    closeSequenceOverlay();
  });

  it("carries a one-open animation playback request", () => {
    openSequenceOverlay(
      {
        id: "play-intent-sequence",
        name: "Test",
        word: "A",
        steps: [],
      } as never,
      {
        analyticsSource: "qr",
        playOnOpen: true,
        fromUrl: true,
        skipHistoryPush: true,
      }
    );

    expect(overlay.isOpen).toBe(true);
    expect(overlay.playOnOpen).toBe(true);
  });

  it("clears the request when the viewer closes", () => {
    openSequenceOverlay(
      {
        id: "play-intent-sequence",
        name: "Test",
        word: "A",
        steps: [],
      } as never,
      {
        analyticsSource: "qr",
        playOnOpen: true,
        fromUrl: true,
        skipHistoryPush: true,
      }
    );

    closeSequenceOverlay();

    expect(overlay.playOnOpen).toBe(false);
  });

  it("carries and clears the Tunnel save acknowledgement callback", () => {
    const onTunnelSaved = vi.fn();
    openSequenceOverlay(
      { id: "tunnel-source", name: "Tunnel", word: "A", steps: [] } as never,
      {
        analyticsSource: "create_workspace",
        fromUrl: true,
        skipHistoryPush: true,
        onTunnelSaved,
      }
    );

    expect(overlay.onTunnelSaved).toBe(onTunnelSaved);

    closeSequenceOverlay();

    expect(overlay.onTunnelSaved).toBeNull();
  });

  it("starts a fresh viewer session when an open sequence is replaced", () => {
    openSequenceOverlay(
      { id: "first", name: "First", word: "A", steps: [] } as never,
      {
        analyticsSource: "qr",
        fromUrl: true,
        shortCode: "FIRST",
        skipHistoryPush: true,
      }
    );
    const firstSession = overlay.sessionKey;

    openSequenceOverlay(
      { id: "second", name: "Second", word: "B", steps: [] } as never,
      {
        analyticsSource: "qr",
        fromUrl: true,
        shortCode: "SECOND",
        skipHistoryPush: true,
        playOnOpen: true,
      }
    );

    expect(overlay.isOpen).toBe(true);
    expect(overlay.sequence?.id).toBe("second");
    expect(overlay.activeShortCode).toBe("SECOND");
    expect(overlay.sessionKey).toBeGreaterThan(firstSession);
    expect(overlay.playOnOpen).toBe(true);
  });

  it("reopens a closed viewer for the next scanned sequence", () => {
    openSequenceOverlay(
      { id: "first", name: "First", word: "A", steps: [] } as never,
      {
        analyticsSource: "qr",
        fromUrl: true,
        shortCode: "FIRST",
        skipHistoryPush: true,
      }
    );
    closeSequenceOverlay();

    openSequenceOverlay(
      { id: "second", name: "Second", word: "B", steps: [] } as never,
      {
        analyticsSource: "qr",
        fromUrl: true,
        shortCode: "SECOND",
        skipHistoryPush: true,
        playOnOpen: true,
      }
    );

    expect(overlay.isOpen).toBe(true);
    expect(overlay.sequence?.id).toBe("second");
    expect(overlay.activeShortCode).toBe("SECOND");
    expect(overlay.playOnOpen).toBe(true);
  });
});
