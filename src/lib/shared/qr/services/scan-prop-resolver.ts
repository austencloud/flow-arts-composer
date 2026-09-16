import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import {
  catDogFromCandidates,
  propFromCandidates,
  sequenceIntentCandidates,
  type PropConfigCandidate,
  type ResolvedPropConfig,
} from "$lib/shared/foundation/services/recorded-prop-intent";

export type ScanPropCandidate = PropConfigCandidate;

export type ScanPropConfig = ResolvedPropConfig;

function motionProps(
  sequence: SequenceData | null | undefined
): ScanPropCandidate {
  if (!sequence) return {};
  let leftPropType: unknown;
  let rightPropType: unknown;
  const pictographs = [sequence.startPlacement, ...(sequence.steps ?? [])];
  for (const pictograph of pictographs) {
    leftPropType ??= pictograph?.motions?.left?.propType;
    rightPropType ??= pictograph?.motions?.right?.propType;
    if (leftPropType && rightPropType) break;
  }
  return { leftPropType, rightPropType };
}

/**
 * Resolve the prop represented by a scan. Callers pass strongest evidence
 * first: the scan event, then its shortcode record. Sequence intent and motion
 * data cover historical events that predate per-scan prop telemetry.
 */
export function resolveScanPropConfig(
  sequence: SequenceData | null | undefined,
  ...scanCandidates: readonly (ScanPropCandidate | null | undefined)[]
): ScanPropConfig {
  const sequenceCandidates: (ScanPropCandidate | null | undefined)[] = [
    ...sequenceIntentCandidates(sequence),
    motionProps(sequence),
  ];
  const candidates = [...scanCandidates, ...sequenceCandidates];
  const leftPropType =
    propFromCandidates("leftPropType", candidates) ?? PropType.STAFF;
  const rightPropType =
    propFromCandidates("rightPropType", candidates) ?? PropType.STAFF;
  const scanCatDogMode = catDogFromCandidates(scanCandidates);
  const sequenceCatDogMode = catDogFromCandidates(sequenceCandidates);

  return {
    leftPropType,
    rightPropType,
    // A printed per-hand override is stronger evidence than an older
    // sequence-level false flag. Without this inference, mixed-prop QR URLs
    // resolved both values correctly and then rendered the red hand as blue.
    catDogMode:
      scanCatDogMode ??
      (leftPropType !== rightPropType ? true : (sequenceCatDogMode ?? false)),
  };
}
