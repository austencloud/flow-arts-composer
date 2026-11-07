/**
 * Whether PostHog's session replay is recording this visit. posthog.ts
 * registers the probe once PostHog has loaded; before that, in dev, and for
 * visits replay does not sample, nothing is recording.
 *
 * Code that has to look different to the recorder (fades it cannot see,
 * images it cannot fetch) asks here, so visits nobody records keep the
 * cheaper path.
 */
let probe: (() => boolean) | null = null;

/** An element with this class, and everything inside it, is left out of replays. */
export const REPLAY_BLOCK_CLASS = "ph-no-capture";

type DeviceHints = Pick<Navigator, "maxTouchPoints" | "hardwareConcurrency"> & {
  deviceMemory?: number;
  connection?: { saveData?: boolean };
};

/**
 * Canvas frames per second to record on this device. 12 is the most posthog-js
 * allows and shows props moving smoothly, but it more than doubles the data a
 * visitor uploads and triples the capturing and image encoding. Every touch
 * screen stays at the default 4 because cheap phones often report 8 cores, so
 * core count cannot tell them from good ones.
 */
export function replayCanvasFps(device: DeviceHints = navigator): number {
  const weak =
    device.maxTouchPoints > 0 ||
    (device.hardwareConcurrency ?? 0) < 6 ||
    (device.deviceMemory ?? 8) < 4 ||
    device.connection?.saveData === true;
  return weak ? 4 : 12;
}

export function setReplayRecordingProbe(next: (() => boolean) | null): void {
  probe = next;
}

export function replayRecording(): boolean {
  try {
    return probe?.() ?? false;
  } catch {
    return false;
  }
}
