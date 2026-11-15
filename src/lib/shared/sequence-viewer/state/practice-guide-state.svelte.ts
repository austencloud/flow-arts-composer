/**
 * Practice guide: the Mirror camera's state and the one line of words under
 * the practice cockpit.
 *
 * Practice shows a sentence in exactly one place, the cockpit's status line,
 * and only one at a time. This module decides which: a camera message first,
 * then a first-time coach line, else nothing (the cockpit falls back to its
 * ramp caption). Nothing here draws over the stage.
 *
 * Mirror is off, starting or on. A tap starts the camera at once; the camera
 * preview reports back through cameraReady / cameraFailed. A failure turns
 * Mirror off, saves that, and shows one message for about six seconds.
 */

import type { TranslationKey } from "#lib/shared/i18n/i18n-types.js";
import type { PracticeViewPrefs } from "./practice-view-prefs.svelte.js";
import {
  readCameraPermission,
  type CameraFailureKind,
  type CameraPermission,
} from "#lib/shared/train/services/camera-failure.js";

export type MirrorStatus = "off" | "starting" | "on";
export type CoachTarget = "strip" | "tempo" | "stop";
type CameraNotice = "intro" | CameraFailureKind;

export const CAMERA_FAILURE_NOTICE_MS = 6000;
export const MIRROR_INTRO_AFTER_READY_MS = 4000;
export const COACH_LINE_MS = 4000;

const CAMERA_NOTICE_KEYS: Record<CameraNotice, TranslationKey> = {
  intro: "viewer_practice_mirror_intro",
  "not-started": "viewer_practice_camera_not_started",
  blocked: "viewer_practice_camera_blocked",
  missing: "viewer_practice_camera_missing",
  busy: "viewer_practice_camera_busy",
};

const COACH_LINES: { target: CoachTarget; key: TranslationKey }[] = [
  { target: "strip", key: "viewer_practice_coach_strip" },
  { target: "tempo", key: "viewer_practice_coach_tempo" },
  { target: "stop", key: "viewer_practice_coach_stop" },
];

export interface PracticeGuideDeps {
  getPrefs: () => PracticeViewPrefs | null;
  readPermission?: () => Promise<CameraPermission>;
}

export function createPracticeGuide(deps: PracticeGuideDeps) {
  const readPermission = deps.readPermission ?? readCameraPermission;

  let mirrorStatus = $state<MirrorStatus>("off");
  let cameraNotice = $state<CameraNotice | null>(null);
  let coachIndex = $state(-1);

  let cameraTimer: ReturnType<typeof setTimeout> | null = null;
  let coachTimer: ReturnType<typeof setTimeout> | null = null;
  // Bumped by reset(): an async permission read that lands after practice
  // closed must not switch the camera back on.
  let session = 0;

  function clearCameraTimer() {
    if (cameraTimer !== null) {
      clearTimeout(cameraTimer);
      cameraTimer = null;
    }
  }

  function clearCoachTimer() {
    if (coachTimer !== null) {
      clearTimeout(coachTimer);
      coachTimer = null;
    }
  }

  function showCameraNotice(notice: CameraNotice | null, ms?: number) {
    clearCameraTimer();
    cameraNotice = notice;
    if (notice !== null && ms !== undefined) {
      cameraTimer = setTimeout(() => {
        cameraTimer = null;
        cameraNotice = null;
      }, ms);
    }
  }

  /** The cockpit's Mirror button. */
  function toggleMirror() {
    const prefs = deps.getPrefs();
    if (mirrorStatus === "off") {
      mirrorStatus = "starting";
      prefs?.setMirrorEnabled(true);
      // Stays up while the browser asks, then a few seconds once live.
      showCameraNotice("intro");
      return;
    }
    mirrorStatus = "off";
    prefs?.setMirrorEnabled(false);
    showCameraNotice(null);
  }

  /** The camera preview went live. */
  function cameraReady() {
    if (mirrorStatus !== "starting") return;
    mirrorStatus = "on";
    if (cameraNotice === "intro") {
      showCameraNotice("intro", MIRROR_INTRO_AFTER_READY_MS);
    }
  }

  /** The camera preview could not start. Mirror turns itself off. */
  function cameraFailed(kind: CameraFailureKind) {
    if (mirrorStatus === "off") return;
    mirrorStatus = "off";
    deps.getPrefs()?.setMirrorEnabled(false);
    showCameraNotice(kind, CAMERA_FAILURE_NOTICE_MS);
  }

  /**
   * On entering practice: a Mirror left on from an earlier visit comes back
   * only when the camera is already allowed, so no browser question appears
   * without a tap. Otherwise Mirror stays off for this visit.
   */
  async function resumeMirrorOnEntry() {
    const prefs = deps.getPrefs();
    if (!prefs?.mirrorEnabled || mirrorStatus !== "off") return;
    const mine = session;
    const permission = await readPermission();
    if (mine !== session || mirrorStatus !== "off") return;
    if (permission === "granted") mirrorStatus = "starting";
  }

  function scheduleCoachLine(index: number) {
    clearCoachTimer();
    coachIndex = index;
    if (index < 0) return;
    coachTimer = setTimeout(() => {
      coachTimer = null;
      scheduleCoachLine(index + 1 < COACH_LINES.length ? index + 1 : -1);
    }, COACH_LINE_MS);
  }

  /** First run on this device: play the three coach lines once. */
  function startCoach() {
    const prefs = deps.getPrefs();
    if (!prefs || prefs.coachSeen || coachIndex >= 0) return;
    prefs.setCoachSeen(true);
    scheduleCoachLine(0);
  }

  /** A tap on the line: clears a camera message, or ends the coach. */
  function dismissLine() {
    if (cameraNotice !== null) {
      showCameraNotice(null);
      return;
    }
    if (coachIndex >= 0) scheduleCoachLine(-1);
  }

  /** Leaving practice: camera off, every message cleared. */
  function reset() {
    session++;
    clearCameraTimer();
    clearCoachTimer();
    mirrorStatus = "off";
    cameraNotice = null;
    coachIndex = -1;
  }

  return {
    get mirrorStatus() { return mirrorStatus; },
    /** True while the camera is wanted (starting or on). */
    get mirrorOn() { return mirrorStatus !== "off"; },
    /** The sentence the cockpit line shows, or null for its ramp caption. */
    get noticeKey(): TranslationKey | null {
      if (cameraNotice !== null) return CAMERA_NOTICE_KEYS[cameraNotice];
      if (coachIndex >= 0) return COACH_LINES[coachIndex]!.key;
      return null;
    },
    /** The control the current coach line names, for its highlight ring. */
    get coachTarget(): CoachTarget | null {
      if (cameraNotice !== null || coachIndex < 0) return null;
      return COACH_LINES[coachIndex]!.target;
    },
    toggleMirror,
    cameraReady,
    cameraFailed,
    resumeMirrorOnEntry,
    startCoach,
    dismissLine,
    reset,
    dispose: reset,
  };
}

export type PracticeGuide = ReturnType<typeof createPracticeGuide>;
