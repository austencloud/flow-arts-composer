/**
 * Phone app (Capacitor) over-the-air updates, made visible.
 *
 * Capgo's auto-update already downloads new bundles on its own whenever the
 * app comes to the foreground, but it only switches to them the next time the
 * app goes to the background. Nothing on screen said an update had arrived, so
 * the only way to get it was to leave the app and come back. This module
 * listens to the updater, shows the same "An update is ready" toast the web
 * service worker shows, and lets Settings check on demand and restart now.
 *
 * The plugin is imported dynamically so web builds never load it.
 */
import { showToast } from "$lib/shared/toast/state/toast-state.svelte";
import { t } from "$lib/shared/i18n/i18n.svelte";

type Updater = (typeof import("@capgo/capacitor-updater"))["CapacitorUpdater"];

export type NativeUpdateStatus =
  | "idle"
  | "checking"
  | "downloading"
  | "ready"
  | "up-to-date"
  | "failed";

// A check that never hears back (offline, Doze, a cached 429) shouldn't leave
// the button spinning forever.
const CHECK_TIMEOUT_MS = 30_000;

class NativeUpdateState {
  /** True once the updater plugin has loaded inside the phone app. */
  available = $state(false);
  /** Version of the bundle running now; null while it's the one built into the APK. */
  currentVersion = $state<string | null>(null);
  /** Downloaded bundle waiting to be switched to. */
  readyVersion = $state<string | null>(null);
  status = $state<NativeUpdateStatus>("idle");
  percent = $state(0);
}

export const nativeUpdate = new NativeUpdateState();

let updater: Updater | null = null;
let currentBundleId: string | null = null;
let readyBundleId: string | null = null;
let toastedVersion: string | null = null;
let checkTimer: ReturnType<typeof setTimeout> | null = null;

function clearCheckTimer(): void {
  if (checkTimer !== null) {
    clearTimeout(checkTimer);
    checkTimer = null;
  }
}

function markReady(bundle: { id: string; version: string }): void {
  if (bundle.id === currentBundleId) return;
  clearCheckTimer();
  readyBundleId = bundle.id;
  nativeUpdate.readyVersion = bundle.version;
  nativeUpdate.status = "ready";
  if (toastedVersion === bundle.version) return;
  toastedVersion = bundle.version;
  showToast({
    message: t("settings_app_update_ready"),
    type: "info",
    duration: 15_000,
    action: { label: t("settings_app_update_restart"), onClick: applyNativeUpdate },
  });
}

function settleCheck(status: "up-to-date" | "failed"): void {
  // Only a check the person asked for reports back; the plugin's own
  // foreground checks stay silent unless they find something.
  if (nativeUpdate.status !== "checking" && nativeUpdate.status !== "downloading") return;
  clearCheckTimer();
  nativeUpdate.status = status;
}

/**
 * Tell Capgo this bundle booted fine (so it isn't rolled back), then start
 * listening for updates. Call once, inside the phone app only.
 */
export async function startNativeUpdates(): Promise<void> {
  if (updater) return;
  const { CapacitorUpdater } = await import("@capgo/capacitor-updater");
  updater = CapacitorUpdater;
  await CapacitorUpdater.notifyAppReady();
  nativeUpdate.available = true;

  const { bundle } = await CapacitorUpdater.current();
  currentBundleId = bundle.id;
  nativeUpdate.currentVersion = bundle.id === "builtin" ? null : bundle.version;

  await CapacitorUpdater.addListener("download", ({ percent }) => {
    if (nativeUpdate.status === "ready") return;
    nativeUpdate.status = "downloading";
    nativeUpdate.percent = percent;
  });
  // downloadComplete fires at 100%, a moment before the plugin queues the
  // bundle; updateAvailable fires once it's saved. Either one means ready.
  await CapacitorUpdater.addListener("downloadComplete", ({ bundle }) => markReady(bundle));
  await CapacitorUpdater.addListener("updateAvailable", ({ bundle }) => markReady(bundle));
  await CapacitorUpdater.addListener("noNeedUpdate", () => settleCheck("up-to-date"));
  await CapacitorUpdater.addListener("downloadFailed", () => settleCheck("failed"));
  await CapacitorUpdater.addListener("updateCheckResult", ({ kind }) => {
    if (kind === "failed") settleCheck("failed");
  });

  // A bundle downloaded earlier in this session (or before a crash) may
  // already be queued; offer it straight away.
  const next = await CapacitorUpdater.getNextBundle();
  if (next && (next.status === "pending" || next.status === "success")) markReady(next);
}

/** Ask Capgo for a newer bundle now instead of waiting for the next app switch. */
export async function checkForNativeUpdate(): Promise<void> {
  if (!updater || nativeUpdate.status === "ready") return;
  if (nativeUpdate.status === "checking" || nativeUpdate.status === "downloading") return;
  nativeUpdate.status = "checking";
  nativeUpdate.percent = 0;
  clearCheckTimer();
  checkTimer = setTimeout(() => {
    checkTimer = null;
    if (nativeUpdate.status === "checking") nativeUpdate.status = "failed";
  }, CHECK_TIMEOUT_MS);
  try {
    const result = await updater.triggerUpdateCheck();
    if (result.status === "unavailable") settleCheck("failed");
  } catch {
    settleCheck("failed");
  }
}

/** Switch to the downloaded bundle now. The page reloads, so this never returns normally. */
export async function applyNativeUpdate(): Promise<void> {
  if (!updater) return;
  // Queue it explicitly in case the tap beats the plugin's own queueing.
  if (readyBundleId) await updater.next({ id: readyBundleId }).catch(() => {});
  await updater.reload();
}
