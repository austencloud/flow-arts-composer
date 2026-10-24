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

export class ComposerMotionCache {
  private readonly bundles = new Map<string, object>();
  private readonly poses = new Map<string, CapturedPoseClip>();

  constructor(private readonly limit = 8) {}

  get(signature: string): object | undefined {
    const bundle = this.bundles.get(signature);
    if (bundle) {
      this.bundles.delete(signature);
      this.bundles.set(signature, bundle);
    }
    return bundle;
  }

  has(signature: string): boolean {
    return this.bundles.has(signature);
  }

  getPose(signature: string): CapturedPoseClip | undefined {
    this.get(signature);
    return this.poses.get(signature);
  }

  set(signature: string, bundle: object, pose?: CapturedPoseClip): void {
    this.bundles.delete(signature);
    this.bundles.set(signature, bundle);
    if (pose) this.poses.set(signature, pose);
    else this.poses.delete(signature);
    while (this.bundles.size > this.limit) {
      const oldest = this.bundles.keys().next().value!;
      this.bundles.delete(oldest);
      this.poses.delete(oldest);
    }
  }
}

let pageCache: ComposerMotionCache | undefined;

/** Survives Web/Unreal component remounts but ends with the browser page. */
export function getComposerMotionCache(): ComposerMotionCache {
  return (pageCache ??= new ComposerMotionCache());
}
