import { beforeEach, describe, expect, it, vi } from "vitest";

type Listener = (event: never) => void;

const listeners = new Map<string, Listener>();
const plugin = {
  notifyAppReady: vi.fn().mockResolvedValue({}),
  current: vi.fn(),
  getNextBundle: vi.fn(),
  triggerUpdateCheck: vi.fn(),
  next: vi.fn().mockResolvedValue({}),
  reload: vi.fn().mockResolvedValue(undefined),
  addListener: vi.fn(async (name: string, fn: Listener) => {
    listeners.set(name, fn);
    return { remove: vi.fn() };
  }),
};
const showToast = vi.fn();
const isNativePlatform = vi.fn(() => true);

vi.mock("@capgo/capacitor-updater", () => ({ CapacitorUpdater: plugin }));
vi.mock("#lib/shared/toast/state/toast-state.svelte.js", () => ({ showToast }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform } }));

type ToastCall = { action: { label: string; onClick: () => Promise<void> } };
const toastAt = (i: number) => showToast.mock.calls[i]![0] as ToastCall;

function emit(name: string, event: unknown): void {
  listeners.get(name)?.(event as never);
}

const bundle = (id: string, version: string, status = "pending") => ({
  id,
  version,
  status,
  downloaded: "",
  checksum: "",
});

// The module keeps one updater per app run, so each test loads a fresh copy.
async function load(current = bundle("cur", "1.0.899", "success"), next: unknown = null) {
  vi.resetModules();
  listeners.clear();
  plugin.current.mockResolvedValue({ bundle: current, native: "1.0.0" });
  plugin.getNextBundle.mockResolvedValue(next);
  const mod = await import("./native-update.svelte");
  await mod.startNativeUpdates();
  return mod;
}

describe("phone app updates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("still tells Capgo the bundle booted, so it isn't rolled back", async () => {
    const { nativeUpdate } = await load();
    expect(plugin.notifyAppReady).toHaveBeenCalledTimes(1);
    expect(nativeUpdate.available).toBe(true);
    expect(nativeUpdate.currentVersion).toBe("1.0.899");
  });

  it("does nothing in a web browser, where window.Capacitor also exists", async () => {
    isNativePlatform.mockReturnValueOnce(false);
    const { nativeUpdate } = await load();
    expect(nativeUpdate.available).toBe(false);
    expect(plugin.notifyAppReady).not.toHaveBeenCalled();
  });

  it("shows no update version while the APK's own bundle runs", async () => {
    const { nativeUpdate } = await load(bundle("builtin", "1.0.0", "success"));
    expect(nativeUpdate.currentVersion).toBeNull();
  });

  it("offers a restart once, when the download finishes", async () => {
    const { nativeUpdate } = await load();
    emit("downloadComplete", { bundle: bundle("new", "1.0.900") });
    emit("updateAvailable", { bundle: bundle("new", "1.0.900") });

    expect(nativeUpdate.status).toBe("ready");
    expect(nativeUpdate.readyVersion).toBe("1.0.900");
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(toastAt(0).action.label).toBe("Restart");
  });

  it("restarts into the downloaded bundle, queueing it first", async () => {
    const { applyNativeUpdate } = await load();
    emit("updateAvailable", { bundle: bundle("new", "1.0.900") });
    await toastAt(0).action.onClick();

    expect(plugin.next).toHaveBeenCalledWith({ id: "new" });
    expect(plugin.reload).toHaveBeenCalledTimes(1);
    expect(plugin.next.mock.invocationCallOrder[0]!).toBeLessThan(
      plugin.reload.mock.invocationCallOrder[0]!
    );
    expect(applyNativeUpdate).toBeTypeOf("function");
  });

  it("offers a bundle that was already queued before this launch", async () => {
    const { nativeUpdate } = await load(undefined, bundle("queued", "1.0.900"));
    expect(nativeUpdate.status).toBe("ready");
    expect(showToast).toHaveBeenCalledTimes(1);
  });

  it("ignores a queued bundle that failed or is the one running", async () => {
    const failed = await load(undefined, bundle("bad", "1.0.900", "error"));
    expect(failed.nativeUpdate.status).toBe("idle");
    const same = await load(undefined, bundle("cur", "1.0.899", "success"));
    expect(same.nativeUpdate.status).toBe("idle");
    expect(showToast).not.toHaveBeenCalled();
  });

  it("reports up to date after a check that finds nothing", async () => {
    plugin.triggerUpdateCheck.mockResolvedValue({ status: "queued", queued: true });
    const { nativeUpdate, checkForNativeUpdate } = await load();
    await checkForNativeUpdate();
    expect(nativeUpdate.status).toBe("checking");
    emit("noNeedUpdate", { bundle: bundle("cur", "1.0.899") });
    expect(nativeUpdate.status).toBe("up-to-date");
  });

  it("shows progress, then ready, when a check finds a bundle", async () => {
    plugin.triggerUpdateCheck.mockResolvedValue({ status: "queued", queued: true });
    const { nativeUpdate, checkForNativeUpdate } = await load();
    await checkForNativeUpdate();
    emit("download", { percent: 40, bundle: bundle("new", "1.0.900", "downloading") });
    expect(nativeUpdate.status).toBe("downloading");
    expect(nativeUpdate.percent).toBe(40);
    emit("downloadComplete", { bundle: bundle("new", "1.0.900") });
    expect(nativeUpdate.status).toBe("ready");
  });

  it("stops spinning when the check fails or never answers", async () => {
    plugin.triggerUpdateCheck.mockResolvedValue({ status: "unavailable", queued: false });
    const first = await load();
    await first.checkForNativeUpdate();
    expect(first.nativeUpdate.status).toBe("failed");

    vi.useFakeTimers();
    plugin.triggerUpdateCheck.mockResolvedValue({ status: "queued", queued: true });
    const second = await load();
    await second.checkForNativeUpdate();
    expect(second.nativeUpdate.status).toBe("checking");
    vi.advanceTimersByTime(30_000);
    expect(second.nativeUpdate.status).toBe("failed");
  });

  it("stays quiet about the plugin's own background checks", async () => {
    const { nativeUpdate } = await load();
    emit("noNeedUpdate", { bundle: bundle("cur", "1.0.899") });
    emit("downloadFailed", { version: "1.0.900" });
    expect(nativeUpdate.status).toBe("idle");
  });
});
