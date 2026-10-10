import { render } from "vitest-browser-svelte";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";

const mocks = vi.hoisted(() => ({
  afterNavigateCallback: null as null | ((navigation: unknown) => void),
  resolveShortCodeWithRecord: vi.fn(),
  hydrateSequence: vi.fn(),
  updateSettings: vi.fn(),
  openSequenceOverlay: vi.fn(),
  removeCurrentUrlParams: vi.fn(),
}));

vi.mock("$app/navigation", () => ({
  afterNavigate: (callback: (navigation: unknown) => void) => {
    mocks.afterNavigateCallback = callback;
  },
  goto: vi.fn(),
  // url-state, loaded below through importOriginal, imports these.
  pushState: vi.fn(),
  replaceState: vi.fn(),
}));

vi.mock("#lib/shared/auth/state/auth-state.svelte.js", () => ({
  authState: { loading: false },
}));

vi.mock("#lib/shared/qr/get-short-code-manager.js", () => ({
  getShortCodeManager: () => ({
    resolveShortCodeWithRecord: mocks.resolveShortCodeWithRecord,
  }),
}));

vi.mock("#lib/shared/application/state/app-state.svelte.js", () => ({
  updateSettings: mocks.updateSettings,
}));

vi.mock("#lib/shared/navigation/services/sequence-hydrator.js", () => ({
  hydrateSequence: mocks.hydrateSequence,
}));

vi.mock("#lib/shared/create/get-loop-detector.js", () => ({
  getLoopDetector: () => ({ isLoop: vi.fn() }),
}));

vi.mock(
  "#lib/shared/navigation/services/url-state.js",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("#lib/shared/navigation/services/url-state.js")
    >()),
    removeCurrentUrlParams: mocks.removeCurrentUrlParams,
  })
);

vi.mock("../state/sequence-viewer-overlay-state.svelte", () => ({
  getSequenceOverlayState: () => ({
    isOpen: false,
    sequence: null,
    initialBpm: 60,
    initialStep: 0,
    handPathMode: false,
    playOnOpen: false,
    sessionKey: 0,
    dismissPath: null,
    openedFromUrl: false,
  }),
  closeSequenceOverlay: vi.fn(),
  openSequenceOverlay: mocks.openSequenceOverlay,
}));

vi.mock("./SequenceViewerOrchestrator.svelte", async () => ({
  default: (
    await import("./__test-stubs__/SequenceViewerDrawerHostChildStub.svelte")
  ).default,
}));

vi.mock("./SequenceViewerShell.svelte", async () => ({
  default: (
    await import("./__test-stubs__/SequenceViewerDrawerHostChildStub.svelte")
  ).default,
}));

import SequenceViewerDrawerHost from "./SequenceViewerDrawerHost.svelte";

describe("SequenceViewerDrawerHost URL bootstrap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.afterNavigateCallback = null;
    window.history.replaceState({}, "", "/create");
  });

  it("opens the initial deep link when the lazy host mounts after navigation", async () => {
    const resolvedSequence = { id: "resolved-cold-start" };
    const hydratedSequence = { id: "hydrated-cold-start" };
    mocks.resolveShortCodeWithRecord.mockResolvedValue({
      sequence: resolvedSequence,
      record: {
        leftPropType: PropType.STAFF,
        rightPropType: PropType.STAFF,
      },
    });
    mocks.hydrateSequence.mockResolvedValue(hydratedSequence);
    window.history.replaceState(
      {},
      "",
      "/browse/gallery?v=COLD42&bp=club&rp=club"
    );

    render(SequenceViewerDrawerHost);

    await vi.waitFor(() => {
      expect(mocks.openSequenceOverlay).toHaveBeenCalledWith(hydratedSequence, {
        fromUrl: true,
        playOnOpen: true,
        shortCode: "COLD42",
        skipHistoryPush: true,
      });
    });
    expect(mocks.resolveShortCodeWithRecord).toHaveBeenCalledWith("COLD42");
    expect(mocks.updateSettings).toHaveBeenCalledWith({
      leftPropType: PropType.CLUB,
      rightPropType: PropType.CLUB,
      catDogMode: false,
    });
  });

  it("opens a sequence when a QR deep link arrives after the host mounted", async () => {
    const resolvedSequence = { id: "resolved-sequence" };
    const hydratedSequence = { id: "hydrated-sequence" };
    mocks.resolveShortCodeWithRecord.mockResolvedValue({
      sequence: resolvedSequence,
      record: {
        leftPropType: PropType.STAFF,
        rightPropType: PropType.STAFF,
      },
    });
    mocks.hydrateSequence.mockResolvedValue(hydratedSequence);

    render(SequenceViewerDrawerHost);

    await vi.waitFor(() => {
      expect(mocks.afterNavigateCallback).toBeTypeOf("function");
    });
    expect(mocks.resolveShortCodeWithRecord).not.toHaveBeenCalled();

    const url = new URL(
      "/browse/gallery?v=SCAN42&bp=club&rp=club",
      window.location.origin
    );
    window.history.replaceState({}, "", url);
    mocks.afterNavigateCallback?.({ to: { url } });

    await vi.waitFor(() => {
      expect(mocks.openSequenceOverlay).toHaveBeenCalledWith(hydratedSequence, {
        fromUrl: true,
        playOnOpen: true,
        shortCode: "SCAN42",
        skipHistoryPush: true,
      });
    });

    expect(mocks.resolveShortCodeWithRecord).toHaveBeenCalledWith("SCAN42");
    expect(mocks.hydrateSequence).toHaveBeenCalledWith(resolvedSequence, {
      loopDetector: expect.any(Object),
    });
    expect(mocks.updateSettings).toHaveBeenCalledWith({
      leftPropType: PropType.CLUB,
      rightPropType: PropType.CLUB,
      catDogMode: false,
    });
  });

  it("replaces the open sequence when another QR handoff arrives", async () => {
    mocks.resolveShortCodeWithRecord.mockImplementation(
      async (code: string) => ({
        sequence: { id: `resolved-${code}` },
        record: null,
      })
    );
    mocks.hydrateSequence.mockImplementation(
      async (sequence: { id: string }) => ({
        id: sequence.id.replace("resolved", "hydrated"),
      })
    );

    render(SequenceViewerDrawerHost);
    await vi.waitFor(() => {
      expect(mocks.afterNavigateCallback).toBeTypeOf("function");
    });

    for (const code of ["FIRST", "SECOND"]) {
      const url = new URL(`/browse/gallery?v=${code}`, window.location.origin);
      window.history.replaceState({}, "", url);
      mocks.afterNavigateCallback?.({ to: { url } });
      await vi.waitFor(() => {
        expect(mocks.openSequenceOverlay).toHaveBeenCalledWith(
          { id: `hydrated-${code}` },
          {
            fromUrl: true,
            playOnOpen: true,
            shortCode: code,
            skipHistoryPush: true,
          }
        );
      });
    }

    expect(
      mocks.resolveShortCodeWithRecord.mock.calls.map(([code]) => code)
    ).toEqual(["FIRST", "SECOND"]);
  });
});
