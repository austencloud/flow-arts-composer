import { stableStringify } from "../../../../../../unreal/Shared/Tools/capture-provenance.mjs";
import { captureHandDistanceKey, type PerformerHandDistance } from "../../domain/performer-hand-distance.js";
import type { CapturedPoseClip } from "../../native-capture/captured-pose-player.js";

/** Match the staff length used by the live Web performer when no override is set. */
export function composerCaptureStaffLengthCm(
  performerStaffLengthCm: number | null,
  globalStaffLengthCm: number
): number {
  return performerStaffLengthCm ?? globalStaffLengthCm;
}

/** Only capture inputs belong in the key; performer identity belongs to the transfer. */
export function composerMotionSignature(
  sequence: object,
  options: {
    beatPlaneOverrides?: ReadonlyMap<number, unknown>;
    handDistance?: PerformerHandDistance;
    [key: string]: unknown;
  }
): string {
  return stableStringify({
    captureRevision: "composer-shared-pose-v1",
    sequence,
    ...options,
    handDistance: options.handDistance
      ? captureHandDistanceKey(options.handDistance)
      : undefined,
    beatPlaneOverrides: options.beatPlaneOverrides
      ? [...options.beatPlaneOverrides].sort(([left], [right]) => left - right)
      : undefined,
  });
}

interface CacheEntry {
  bundle?: object;
  pose?: CapturedPoseClip;
}

/**
 * A clip restored from this device's saved motion has a pose but no native
 * bundle: the bundle carries the whole rig and is only rebuilt by a fresh
 * capture. So the Web performer can play a pose-only entry, while Unreal and
 * "download native motion" still see nothing until a real capture lands.
 */
export class ComposerMotionCache {
  private readonly entries = new Map<string, CacheEntry>();

  constructor(private readonly limit = 8) {}

  private touch(signature: string): CacheEntry | undefined {
    const entry = this.entries.get(signature);
    if (entry) {
      this.entries.delete(signature);
      this.entries.set(signature, entry);
    }
    return entry;
  }

  private store(signature: string, entry: CacheEntry): void {
    this.entries.delete(signature);
    this.entries.set(signature, entry);
    while (this.entries.size > this.limit) {
      this.entries.delete(this.entries.keys().next().value!);
    }
  }

  get(signature: string): object | undefined {
    return this.touch(signature)?.bundle;
  }

  has(signature: string): boolean {
    return !!this.entries.get(signature)?.bundle;
  }

  getPose(signature: string): CapturedPoseClip | undefined {
    return this.touch(signature)?.pose;
  }

  set(signature: string, bundle: object, pose?: CapturedPoseClip): void {
    this.store(signature, { bundle, pose });
  }

  /** Keeps any native bundle already captured for this signature. */
  setPose(signature: string, pose: CapturedPoseClip): void {
    this.store(signature, { ...this.entries.get(signature), pose });
  }
}

let pageCache: ComposerMotionCache | undefined;

/** Survives Web/Unreal component remounts but ends with the browser page. */
export function getComposerMotionCache(): ComposerMotionCache {
  return (pageCache ??= new ComposerMotionCache());
}
