import { VIEWER3D_INTRO_ENABLED } from "../domain/onboarding-flags";
import {
  SCENE_STUDIO_SETUP_SEEN_KEY,
  VIEWER3D_INTRO_SEEN_KEY,
} from "../config/storage-keys";
import { getOnboardingPersister } from "#lib/shared/onboarding/get-onboarding-persister.js";

function seen(key: string): boolean {
  if (typeof localStorage === "undefined") return false;
  try {
    return localStorage.getItem(key) === "true";
  } catch {
    return false;
  }
}

/**
 * The sequence viewer's first-open pointer at the scene rail. The viewer can
 * never be unconfigured — it cannot draw a frame without a scene, performers,
 * and a formation already resolved — so its guidance points at what can be
 * changed. Building a scene from nothing is the 3D Studio's job; see
 * shouldShowSceneStudioSetup.
 */
export function shouldShowViewer3DIntro(): boolean {
  if (!VIEWER3D_INTRO_ENABLED) return false;
  if (typeof localStorage === "undefined") return false;
  return !seen(VIEWER3D_INTRO_SEEN_KEY);
}

/** The 3D Studio's first-run guided setup — a real build-from-nothing flow. */
export function shouldShowSceneStudioSetup(): boolean {
  if (!VIEWER3D_INTRO_ENABLED) return false;
  if (typeof localStorage === "undefined") return false;
  return !seen(SCENE_STUDIO_SETUP_SEEN_KEY);
}

/** Local mark only — used by tests and as the synchronous half. */
export function markViewer3DIntroSeenLocal(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(VIEWER3D_INTRO_SEEN_KEY, "true");
  } catch {
    // Quota — the intro may show once more on this device.
  }
}

/** Full mark: local immediately, cloud in the background. */
export function markViewer3DIntroSeen(): void {
  markViewer3DIntroSeenLocal();
  try {
    const persister = getOnboardingPersister();
    void persister.markViewer3DIntroSeen().catch(() => {});
  } catch {
    // Unauthenticated/persister unavailable — local flag stands.
  }
}

/** Local mark only — used by tests and as the synchronous half. */
export function markSceneStudioSetupSeenLocal(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(SCENE_STUDIO_SETUP_SEEN_KEY, "true");
  } catch {
    // Quota — the guide may show once more on this device.
  }
}

/** Full mark: local immediately, cloud in the background. */
export function markSceneStudioSetupSeen(): void {
  markSceneStudioSetupSeenLocal();
  try {
    const persister = getOnboardingPersister();
    void persister.markSceneStudioSetupSeen().catch(() => {});
  } catch {
    // Unauthenticated/persister unavailable — local flag stands.
  }
}

/**
 * `?intro=replay` reopens the guided setup on a profile that already finished
 * it — the card renders with `force`, so replaying never re-marks it seen and
 * never touches the cloud status. This is how the first-run card stays
 * reviewable after the one time a person actually sees it.
 */
export function isViewer3DIntroReplayRequested(search?: string): boolean {
  if (!VIEWER3D_INTRO_ENABLED) return false;
  const query =
    search ?? (typeof location === "undefined" ? "" : location.search);
  try {
    return new URLSearchParams(query).get("intro") === "replay";
  } catch {
    return false;
  }
}
