export interface MotionRequestKey {
  signature: string;
  sequence: object | null;
}

export function planWebMotionPreparation<T extends MotionRequestKey>(
  requests: readonly T[],
  hasPose: (signature: string) => boolean,
  cacheLimit = 8
): {
  unique: T[];
  completedCount: number;
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
  const completedCount = unique.filter((request) =>
    hasPose(request.signature)
  ).length;
  return {
    unique,
    completedCount,
    next: overflow
      ? undefined
      : unique.find((request) => !hasPose(request.signature)),
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
