import { isNative, isAndroid } from "./platform-detector";
import { resolveNativeDeepLinkTarget } from "./native-deep-link-target";
import {
  beginNativeScanViewerTransition,
  isNativeScanViewerReady,
  markNativeScanTransitionStage,
  markNativeScanViewerFailed,
  waitForNativeScanLoadingSurfaceReady,
} from "./native-scan-viewer-readiness";

export class NativeInitializer {
  private deepLinkTransitionToken = 0;
  private launchScanTraceCode: string | null = null;
  private appUrlListenerRegistration: Promise<void> | null = null;
  private appUrlOpenNavigation: Promise<boolean> | null = null;

  async initialize(): Promise<void> {
    if (!isNative()) return;

    // Android can deliver the QR intent as soon as it brings our activity to
    // the foreground. Attach this before share intake, auth, or the app shell
    // can delay startup; otherwise the scan is lost and the user keeps staring
    // at the launch cover with no sequence queued behind it.
    await this.registerAppUrlListener();

    // initAppLifecycle navigates off the marketing landing (the native shell
    // loads "/") into the app. Hide the splash only AFTER that navigation so
    // the landing never flashes behind the splash on a cold start.
    await Promise.allSettled([
      this.initStatusBar(),
      this.initKeyboard(),
      this.initAppLifecycle(),
    ]);

    await this.hideSplashScreen(this.launchScanTraceCode);
    this.launchScanTraceCode = null;
  }

  private async initStatusBar(): Promise<void> {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    await StatusBar.setStyle({ style: Style.Dark });

    if (isAndroid()) {
      // Don't overlay on Android - let the system handle status bar space.
      // The WebView's env(safe-area-inset-top) isn't reliable in Android WebView.
      await StatusBar.setOverlaysWebView({ overlay: false });
      await StatusBar.setBackgroundColor({ color: "#0b1d2a" });
    } else {
      // iOS handles safe area insets natively via env() - overlay is safe
      await StatusBar.setOverlaysWebView({ overlay: true });
    }
  }

  private async initKeyboard(): Promise<void> {
    const { Keyboard, KeyboardResize } = await import("@capacitor/keyboard");
    await Keyboard.setResizeMode({ mode: KeyboardResize.None });
    await Keyboard.setScroll({ isDisabled: true });
  }

  private async showSplashScreen(scanCode: string): Promise<void> {
    markNativeScanTransitionStage(scanCode, "native-cover-show-start");
    const { SplashScreen } = await import("@capacitor/splash-screen");
    await SplashScreen.show({ autoHide: false, fadeInDuration: 0 });
    markNativeScanTransitionStage(scanCode, "native-cover-shown");
  }

  private async hideSplashScreen(
    scanCode: string | null = null
  ): Promise<void> {
    if (scanCode) {
      markNativeScanTransitionStage(scanCode, "native-cover-hide-start");
    }
    const { SplashScreen } = await import("@capacitor/splash-screen");
    // Playback is released only after this promise resolves. A zero-duration
    // hide makes that boundary exact instead of buzzing under a fading image.
    await SplashScreen.hide({ fadeOutDuration: 0 });
    if (scanCode) {
      markNativeScanTransitionStage(scanCode, "native-cover-hidden");
    }
  }

  private async initAppLifecycle(): Promise<void> {
    const { App } = await import("@capacitor/app");

    if (isAndroid()) {
      await App.addListener("backButton", ({ canGoBack }) => {
        if (canGoBack) {
          window.history.back();
        } else {
          App.exitApp();
        }
      });
    }

    // Register the share target BEFORE the first await that could yield, so
    // the plugin's retained ACTION_SEND event has a listener to be replayed
    // to. Nothing here is awaited for a grace period and nothing routes:
    // the adapter persists the bytes and bumps a signal, and
    // ShareIntakeHost - mounted inside MainApplication, beside the drawers a
    // share actually opens - runs the pipeline.
    //
    // The unconditional boot-into-app-shell call below is unchanged by this
    // edit. An earlier revision skipped it when a share was pending, which
    // left the app on "/" - the marketing landing (src/routes/+page.svelte) -
    // where InboxDrawer and SequenceViewerDrawerHost do not exist, so the
    // share opened as state nothing rendered.
    const { ensureShareTargetRegistered } =
      await import("$lib/shared/share-intake/get-share-intake");
    await ensureShareTargetRegistered();

    // Handle deep links from both cold start and warm resume.
    // Cold start: getLaunchUrl() returns the URL that opened the app.
    // Warm resume: appUrlOpen fires when a new URL arrives while running.
    const launchUrl = await App.getLaunchUrl();
    const openedViaDeepLink = launchUrl?.url
      ? await this.handleDeepLink(launchUrl.url)
      : false;
    const appUrlOpenNavigation = this.appUrlOpenNavigation;
    const openedViaAppUrlOpen = appUrlOpenNavigation
      ? await appUrlOpenNavigation
      : false;

    // Normal cold start (tapped the app icon, no deep link): the native shell
    // loads "/", which is the marketing landing. This is a standalone app, so
    // boot straight into the Composer instead of showing the landing page.
    if (!openedViaDeepLink && !openedViaAppUrlOpen) {
      await this.bootIntoApp();
    }
  }

  private registerAppUrlListener(): Promise<void> {
    this.appUrlListenerRegistration ??= this.attachAppUrlListener();
    return this.appUrlListenerRegistration;
  }

  private async attachAppUrlListener(): Promise<void> {
    const { App } = await import("@capacitor/app");
    await App.addListener("appUrlOpen", async ({ url }) => {
      const navigation = this.handleDeepLink(url, true);
      this.appUrlOpenNavigation = navigation;
      await navigation;
    });
  }

  // Navigate off the "/" landing into the app's front page. replaceState so the
  // Android back button from the app entry exits the app (via the backButton
  // handler) rather than returning to the landing page.
  private async bootIntoApp(): Promise<void> {
    const appUrlOpenNavigation = this.appUrlOpenNavigation;
    if (appUrlOpenNavigation && (await appUrlOpenNavigation)) return;

    const { goto } = await import("$app/navigation");

    // Importing the router yields. Recheck in case Android delivered the URL
    // in that gap so the ordinary app boot cannot overwrite the scan route.
    const latestAppUrlOpenNavigation = this.appUrlOpenNavigation;
    if (
      latestAppUrlOpenNavigation !== appUrlOpenNavigation &&
      latestAppUrlOpenNavigation &&
      (await latestAppUrlOpenNavigation)
    )
      return;

    await goto("/create", { replaceState: true });
  }

  private recordCardScan(url: string): void {
    void import("$lib/shared/qr/services/native-card-scan")
      .then(({ recordNativeCardScan }) => recordNativeCardScan(url))
      .catch((error: unknown) => {
        console.warn("[NativeInitializer] Card scan not recorded:", error);
      });
  }

  // Returns true if the URL was a real deep link that navigated the app.
  private async handleDeepLink(
    url: string,
    coverWithSplash = false
  ): Promise<boolean> {
    const target = resolveNativeDeepLinkTarget(url);
    if (!target) return false;

    // A printed-card link that Android opened here never reaches /q, so /q
    // never records it. Record it from the original link (it carries the pid)
    // without waiting: the viewer below must not depend on this request.
    this.recordCardScan(url);

    const targetUrl = new URL(target, "https://localhost");
    const scanCode = targetUrl.searchParams.get("v");
    const alreadyShowingScan =
      scanCode !== null && isNativeScanViewerReady(scanCode);
    const transitionToken = scanCode ? ++this.deepLinkTransitionToken : 0;
    const shouldCoverTransition =
      coverWithSplash && scanCode !== null && !alreadyShowingScan;

    if (scanCode && !alreadyShowingScan) {
      beginNativeScanViewerTransition(scanCode);
      markNativeScanTransitionStage(scanCode, "deep-link-received", {
        launch: coverWithSplash ? "warm" : "cold",
        coverRequested: shouldCoverTransition,
      });
      if (!coverWithSplash) this.launchScanTraceCode = scanCode;
    }

    if (shouldCoverTransition && scanCode)
      await this.showSplashScreen(scanCode);

    const loadingSurfaceReadiness =
      scanCode && !alreadyShowingScan
        ? waitForNativeScanLoadingSurfaceReady(scanCode)
        : null;

    try {
      // The native launch URL arrives before the root layout finishes
      // Firestore/auth startup. Waiting at this boundary makes the eventual
      // navigation observable by the already-mounted sequence viewer host,
      // instead of asking it to recover a route that completed during boot.
      const { awaitAuthSettled } =
        await import("$lib/shared/auth/state/auth-state.svelte");
      await awaitAuthSettled();
      if (scanCode) markNativeScanTransitionStage(scanCode, "auth-settled");

      const { goto } = await import("$app/navigation");
      if (scanCode) {
        markNativeScanTransitionStage(scanCode, "route-navigation-start", {
          target,
        });
      }
      await goto(target);
      if (scanCode) {
        markNativeScanTransitionStage(scanCode, "route-navigation-complete");
      }

      if (loadingSurfaceReadiness) {
        const outcome = await loadingSurfaceReadiness;
        if (outcome === "timeout") {
          console.warn(
            `[NativeInitializer] Timed out waiting for the scan loading surface for "${scanCode}" to paint.`
          );
        }
      }
      return true;
    } catch {
      if (scanCode) {
        markNativeScanViewerFailed(scanCode);
      }
      return false;
    } finally {
      if (
        shouldCoverTransition &&
        transitionToken === this.deepLinkTransitionToken
      ) {
        await this.hideSplashScreen(scanCode);
      }
    }
  }
}
