import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NativeInitializer } from "$lib/shared/platform/services/native-initializer";

const mocks = vi.hoisted(() => ({
  awaitAuthSettled: vi.fn<() => Promise<void>>(),
  goto: vi.fn<(target: string) => Promise<void>>(),
  hideSplash: vi.fn<() => Promise<void>>(),
  showSplash: vi.fn<() => Promise<void>>(),
  waitForLoadingSurface: vi.fn<() => Promise<"ready" | "failed" | "timeout">>(),
  beginViewerTransition: vi.fn(),
  markTransitionStage: vi.fn(),
  markViewerFailed: vi.fn(),
  isViewerReady: vi.fn(() => false),
  addAppListener: vi.fn(),
  getLaunchUrl: vi.fn(),
  registerShareTarget: vi.fn<() => Promise<void>>(),
  recordCardScan: vi.fn(),
  appUrlOpenCallback: null as
    | null
    | ((event: { url: string }) => Promise<void>),
}));

vi.mock("$lib/shared/platform/services/platform-detector", () => ({
  isNative: () => true,
  isAndroid: () => false,
}));

vi.mock("$lib/shared/auth/state/auth-state.svelte", () => ({
  awaitAuthSettled: mocks.awaitAuthSettled,
}));

vi.mock("$app/navigation", () => ({
  goto: mocks.goto,
}));

vi.mock("@capacitor/splash-screen", () => ({
  SplashScreen: {
    hide: mocks.hideSplash,
    show: mocks.showSplash,
  },
}));

vi.mock("@capacitor/app", () => ({
  App: {
    addListener: mocks.addAppListener,
    getLaunchUrl: mocks.getLaunchUrl,
    exitApp: vi.fn(),
  },
}));

vi.mock("@capacitor/status-bar", () => ({
  StatusBar: {
    setStyle: vi.fn().mockResolvedValue(undefined),
    setOverlaysWebView: vi.fn().mockResolvedValue(undefined),
  },
  Style: { Dark: "DARK" },
}));

vi.mock("@capacitor/keyboard", () => ({
  Keyboard: {
    setResizeMode: vi.fn().mockResolvedValue(undefined),
    setScroll: vi.fn().mockResolvedValue(undefined),
  },
  KeyboardResize: { None: "none" },
}));

vi.mock("$lib/shared/share-intake/get-share-intake", () => ({
  ensureShareTargetRegistered: mocks.registerShareTarget,
}));

vi.mock("$lib/shared/platform/services/native-scan-viewer-readiness", () => ({
  beginNativeScanViewerTransition: mocks.beginViewerTransition,
  isNativeScanViewerReady: mocks.isViewerReady,
  markNativeScanTransitionStage: mocks.markTransitionStage,
  markNativeScanViewerFailed: mocks.markViewerFailed,
  waitForNativeScanLoadingSurfaceReady: mocks.waitForLoadingSurface,
}));

// The real scan client runs; only its network call is replaced.
vi.mock("$lib/shared/auth/firebase", () => ({ auth: { currentUser: null } }));
vi.mock("$lib/shared/auth/services/authed-fetch", () => ({
  authedFetch: vi.fn(),
}));
vi.mock("$lib/shared/qr/services/card-scan-ingest", async (importActual) => ({
  ...(await importActual<
    typeof import("$lib/shared/qr/services/card-scan-ingest")
  >()),
  recordCardScan: mocks.recordCardScan,
}));

const PID = "k7Qm2XpR9aBc";
const SITE_SCAN_ENDPOINT = "https://tkaflowarts.com/api/physical-cards/scan";

// The initializer loads the scan recorder with an unawaited dynamic import.
// Load that module graph once up front: a slow first import (a loaded CI
// runner) otherwise lets one test's recording land in the next test's mocks.
beforeAll(async () => {
  await import("$lib/shared/qr/services/native-card-scan");
});

type DeepLinkHandler = {
  handleDeepLink(url: string, coverWithSplash?: boolean): Promise<boolean>;
};

describe("NativeInitializer deep-link readiness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.goto.mockResolvedValue();
    mocks.hideSplash.mockResolvedValue();
    mocks.showSplash.mockResolvedValue();
    mocks.waitForLoadingSurface.mockResolvedValue("ready");
    mocks.isViewerReady.mockReturnValue(false);
    mocks.getLaunchUrl.mockResolvedValue(null);
    mocks.registerShareTarget.mockResolvedValue();
    mocks.appUrlOpenCallback = null;
    mocks.recordCardScan.mockResolvedValue({
      recorded: true,
      duplicate: false,
      scanKind: "serialized",
    });
    sessionStorage.clear();
    mocks.addAppListener.mockImplementation(
      async (
        eventName: string,
        callback: (event: { url: string }) => Promise<void>
      ) => {
        if (eventName === "appUrlOpen") mocks.appUrlOpenCallback = callback;
        return { remove: vi.fn() };
      }
    );
  });

  it("captures a QR intent before slower native startup work settles", async () => {
    let releaseShareTarget!: () => void;
    mocks.registerShareTarget.mockReturnValue(
      new Promise<void>((resolve) => {
        releaseShareTarget = resolve;
      })
    );
    mocks.awaitAuthSettled.mockResolvedValue();

    const initializer = new NativeInitializer();
    const initialization = initializer.initialize();

    await vi.waitFor(() => {
      expect(mocks.appUrlOpenCallback).toBeTypeOf("function");
      expect(mocks.registerShareTarget).toHaveBeenCalledOnce();
    });

    await mocks.appUrlOpenCallback?.({
      url: "https://tka.run/EARLY42?bp=club&rp=club",
    });

    expect(mocks.goto).toHaveBeenCalledWith(
      "/browse/gallery?bp=club&rp=club&v=EARLY42"
    );
    expect(mocks.showSplash).toHaveBeenCalled();

    releaseShareTarget();
    await initialization;

    expect(mocks.goto).not.toHaveBeenCalledWith("/create", {
      replaceState: true,
    });
  });

  it("waits for app startup before navigating a QR launch URL", async () => {
    let releaseStartup!: () => void;
    mocks.awaitAuthSettled.mockReturnValue(
      new Promise<void>((resolve) => {
        releaseStartup = resolve;
      })
    );

    const initializer = new NativeInitializer() as unknown as DeepLinkHandler;
    const opening = initializer.handleDeepLink(
      "https://tkaflowarts.com/q/W61Y?bp=club&rp=club"
    );

    // The scan recorder also waits on auth to attribute a signed-in scanner,
    // so this may be the second call; the navigation is what must wait.
    await vi.waitFor(() => {
      expect(mocks.awaitAuthSettled).toHaveBeenCalled();
    });
    expect(mocks.goto).not.toHaveBeenCalled();

    releaseStartup();

    await expect(opening).resolves.toBe(true);
    expect(mocks.goto).toHaveBeenCalledWith(
      "/browse/gallery?bp=club&rp=club&v=W61Y"
    );
    expect(mocks.waitForLoadingSurface).toHaveBeenCalledWith("W61Y");
    expect(mocks.beginViewerTransition).toHaveBeenCalledWith("W61Y");
    expect(mocks.markTransitionStage).toHaveBeenCalledWith(
      "W61Y",
      "deep-link-received",
      { launch: "cold", coverRequested: false }
    );
  });

  it("covers a warm scan until the app loading surface has painted", async () => {
    mocks.awaitAuthSettled.mockResolvedValue();
    let releaseViewer!: (outcome: "ready") => void;
    mocks.waitForLoadingSurface.mockReturnValue(
      new Promise((resolve) => {
        releaseViewer = resolve;
      })
    );

    const initializer = new NativeInitializer() as unknown as DeepLinkHandler;
    const opening = initializer.handleDeepLink(
      "https://tka.run/W61Y?bp=club&rp=club",
      true
    );

    await vi.waitFor(() => {
      expect(mocks.showSplash).toHaveBeenCalledWith({
        autoHide: false,
        fadeInDuration: 0,
      });
      expect(mocks.goto).toHaveBeenCalled();
    });
    expect(mocks.hideSplash).not.toHaveBeenCalled();

    releaseViewer("ready");

    await expect(opening).resolves.toBe(true);
    expect(mocks.hideSplash).toHaveBeenCalledWith({ fadeOutDuration: 0 });
    expect(mocks.markTransitionStage).toHaveBeenCalledWith(
      "W61Y",
      "native-cover-hidden"
    );
  });

  it("ignores non-deep-link URLs without waiting for startup", async () => {
    mocks.awaitAuthSettled.mockResolvedValue();
    const initializer = new NativeInitializer() as unknown as DeepLinkHandler;

    await expect(
      initializer.handleDeepLink("https://tkaflowarts.com/")
    ).resolves.toBe(false);

    expect(mocks.awaitAuthSettled).not.toHaveBeenCalled();
    expect(mocks.goto).not.toHaveBeenCalled();
  });
});

describe("NativeInitializer card scan recording", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.goto.mockResolvedValue();
    mocks.hideSplash.mockResolvedValue();
    mocks.showSplash.mockResolvedValue();
    mocks.waitForLoadingSurface.mockResolvedValue("ready");
    mocks.isViewerReady.mockReturnValue(false);
    mocks.getLaunchUrl.mockResolvedValue(null);
    mocks.registerShareTarget.mockResolvedValue();
    mocks.awaitAuthSettled.mockResolvedValue();
    mocks.appUrlOpenCallback = null;
    mocks.addAppListener.mockImplementation(
      async (
        eventName: string,
        callback: (event: { url: string }) => Promise<void>
      ) => {
        if (eventName === "appUrlOpen") mocks.appUrlOpenCallback = callback;
        return { remove: vi.fn() };
      }
    );
    mocks.recordCardScan.mockResolvedValue({
      recorded: true,
      duplicate: false,
      scanKind: "serialized",
    });
    sessionStorage.clear();
  });

  it("records a cold-start scan with its card ID through the site's scan endpoint", async () => {
    mocks.getLaunchUrl.mockResolvedValue({
      url: `https://tka.run/K7QM?bp=staff&rp=staff&pid=${PID}`,
    });

    await new NativeInitializer().initialize();

    await vi.waitFor(() => {
      expect(mocks.recordCardScan).toHaveBeenCalledOnce();
    });
    expect(mocks.recordCardScan).toHaveBeenCalledWith(
      {
        shortCode: "K7QM",
        physicalCardId: PID,
        deviceId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      },
      { endpoint: SITE_SCAN_ENDPOINT, keepalive: false }
    );
    // The viewer still gets the card's props and identity.
    expect(mocks.goto).toHaveBeenCalledWith(
      `/browse/gallery?bp=staff&rp=staff&pid=${PID}&v=K7QM`
    );
  });

  it("records a warm-resume /q/ scan", async () => {
    const initialization = new NativeInitializer().initialize();
    await vi.waitFor(() => {
      expect(mocks.appUrlOpenCallback).toBeTypeOf("function");
    });

    await mocks.appUrlOpenCallback?.({
      url: `https://tkaflowarts.com/q/K7QM?bp=staff&rp=staff&pid=${PID}`,
    });
    await initialization;

    await vi.waitFor(() => {
      expect(mocks.recordCardScan).toHaveBeenCalledOnce();
    });
    expect(mocks.recordCardScan.mock.calls[0]?.[0]).toMatchObject({
      shortCode: "K7QM",
      physicalCardId: PID,
    });
  });

  it("records a legacy mixed-case code exactly as printed", async () => {
    const initializer = new NativeInitializer() as unknown as DeepLinkHandler;

    await expect(
      initializer.handleDeepLink("https://tka.run/07JPcN")
    ).resolves.toBe(true);

    await vi.waitFor(() => {
      expect(mocks.recordCardScan).toHaveBeenCalledOnce();
    });
    expect(mocks.recordCardScan.mock.calls[0]?.[0]).toMatchObject({
      shortCode: "07JPcN",
      physicalCardId: null,
    });
    expect(mocks.goto).toHaveBeenCalledWith("/browse/gallery?v=07JPcN");
  });

  it("opens the viewer without waiting for the scan to be recorded", async () => {
    mocks.recordCardScan.mockReturnValue(new Promise(() => {}));
    const initializer = new NativeInitializer() as unknown as DeepLinkHandler;

    await expect(
      initializer.handleDeepLink(
        `https://tka.run/K7QM?bp=staff&rp=staff&pid=${PID}`,
        true
      )
    ).resolves.toBe(true);

    expect(mocks.goto).toHaveBeenCalledWith(
      `/browse/gallery?bp=staff&rp=staff&pid=${PID}&v=K7QM`
    );
    expect(mocks.hideSplash).toHaveBeenCalled();
  });

  it("keeps a failed recording away from the person scanning", async () => {
    mocks.recordCardScan.mockRejectedValue(new TypeError("Failed to fetch"));
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const initializer = new NativeInitializer() as unknown as DeepLinkHandler;

    await expect(
      initializer.handleDeepLink("https://tka.run/ELYW")
    ).resolves.toBe(true);

    await vi.waitFor(() => {
      expect(logged).toHaveBeenCalled();
    });
    expect(mocks.markViewerFailed).not.toHaveBeenCalled();
    expect(mocks.goto).toHaveBeenCalledWith("/browse/gallery?v=ELYW");
  });

  it("does not record app links that are not card scans", async () => {
    const initializer = new NativeInitializer() as unknown as DeepLinkHandler;

    await initializer.handleDeepLink(
      "https://tkaflowarts.com/sequence/AB12?sheet=animation"
    );
    await initializer.handleDeepLink(
      `https://tkaflowarts.com/store/open?to=${encodeURIComponent(
        `/browse/gallery?pid=${PID}&from=scan&code=K7QM&v=K7QM`
      )}`
    );
    // Let the dynamic import and dedupe run before asserting nothing went out.
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(mocks.recordCardScan).not.toHaveBeenCalled();
  });
});
