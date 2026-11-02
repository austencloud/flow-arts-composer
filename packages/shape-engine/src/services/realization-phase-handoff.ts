interface PhaseHandoffInput {
  outgoingStep: number;
  outgoingStepCount: number;
  incomingStepCount: number;
  fallbackKey: string;
}

function seededEntryStep(key: string, stepCount: number): number {
  let hash = 0x811c9dc5;
  for (const character of key) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }

  const beat = (hash >>> 0) % stepCount;
  const fraction = 0.28 + ((hash >>> 8) % 44) / 100;
  return 1 + beat + fraction;
}

/**
 * Carries the point in the outgoing loop into a differently sized incoming
 * loop. The viewer sees the motion continue around its cycle instead of every
 * new realization entering at an unrelated pose. A deterministic non-starting
 * phase remains the fallback for first paint, before any player is visible.
 */
export function resolveRealizationEntryStep({
  outgoingStep,
  outgoingStepCount,
  incomingStepCount,
  fallbackKey,
}: PhaseHandoffInput): number {
  const safeIncomingCount = Math.max(1, Math.floor(incomingStepCount));
  if (
    !Number.isFinite(outgoingStep) ||
    outgoingStep <= 0 ||
    !Number.isFinite(outgoingStepCount) ||
    outgoingStepCount <= 0
  ) {
    return seededEntryStep(fallbackKey, safeIncomingCount);
  }

  const zeroBasedStep = outgoingStep - 1;
  const wrappedStep =
    ((zeroBasedStep % outgoingStepCount) + outgoingStepCount) %
    outgoingStepCount;
  const phase = wrappedStep / outgoingStepCount;
  return 1 + phase * safeIncomingCount;
}
