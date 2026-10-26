export interface MotionRequestKey {
  signature: string;
  sequence: object | null;
}

/**
 * A motion missing from memory may already be saved on this device. While
 * that lookup is outstanding the motion sits in `lookups` and is never
 * offered as `next`, so a clip already baked is not baked again just because
 * reading it back took a moment.
 */
export function planWebMotionPreparation<T extends MotionRequestKey>(
  requests: readonly T[],
  hasPose: (signature: string) => boolean,
  isAwaitingLookup: (signature: string) => boolean = () => false,
  cacheLimit = 8
): {
  unique: T[];
  completedCount: number;
  lookups: T[];
  next: T | undefined;
  overflow: boolean;
} {
  const seen = new Set<string>();
  const unique = requests.filter((request) => {
    if (!request.sequence || !request.signature || seen.has(request.signature))
      return false;
    seen.add(request.signature);
    return true;
  });
  const overflow = unique.length > cacheLimit;
  const missing = unique.filter((request) => !hasPose(request.signature));
  const lookups = overflow
    ? []
    : missing.filter((request) => isAwaitingLookup(request.signature));
  return {
    unique,
    completedCount: unique.length - missing.length,
    lookups,
    next: overflow
      ? undefined
      : missing.find((request) => !isAwaitingLookup(request.signature)),
    overflow,
  };
}

export function isCurrentMotionCaptureJob(
  job: { signature: string; generation: number; requestKeys: string },
  current: {
    signature: string | undefined;
    generation: number;
    requestKeys: string;
  }
): boolean {
  return (
    job.generation === current.generation &&
    job.signature === current.signature &&
    job.requestKeys === current.requestKeys
  );
}
