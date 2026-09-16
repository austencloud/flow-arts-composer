import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import {
  hashSequenceContent,
  hashString,
} from "$lib/shared/foundation/services/content-hasher";
import { canonicalJSON } from "$lib/shared/foundation/utils/canonical-json";
import type { TunnelSnapshot } from "../tunnel/tunnel-snapshot";
import type { TunnelComposition } from "../tunnel/tunnel-composition";

export const TUNNEL_SAVE_DEDUPE_WINDOW_MS = 5_000;

export interface TunnelSaveDedupeState {
  readonly activeFingerprint: string | null;
  readonly recentSuccessfulSaves: readonly TunnelSaveReceipt[];
}

interface TunnelSaveReceipt {
  readonly fingerprint: string;
  readonly savedAt: number;
}

interface TunnelSaveAttemptResult {
  readonly accepted: boolean;
  readonly state: TunnelSaveDedupeState;
}

type TunnelSaveSequence = Pick<
  SequenceData,
  "word" | "steps" | "startPlacement"
>;

function fingerprintComposition(
  composition: TunnelComposition | null | undefined
) {
  if (!composition) return null;
  return {
    performers: composition.performers.map((performer) => ({
      id: performer.id,
      label: performer.label,
      timing: performer.timing,
      source:
        performer.source.kind === "independent"
          ? {
              kind: "independent" as const,
              sequence: hashSequenceContent(performer.source.sequence),
              sourceSequenceId: performer.source.sourceSequenceId,
            }
          : performer.source,
    })),
    stage: composition.stage,
    formation: composition.formation,
  };
}

export function createTunnelSaveFingerprint(
  sequence: TunnelSaveSequence,
  snapshot: TunnelSnapshot,
  composition?: TunnelComposition | null
): string {
  return hashString(
    canonicalJSON({
      sequence: hashSequenceContent(sequence),
      snapshot,
      composition: fingerprintComposition(composition),
    })
  );
}

export function createTunnelSaveDedupeState(): TunnelSaveDedupeState {
  return {
    activeFingerprint: null,
    recentSuccessfulSaves: [],
  };
}

export function beginTunnelSaveAttempt(
  state: TunnelSaveDedupeState,
  fingerprint: string,
  now: number
): TunnelSaveAttemptResult {
  const recentSuccessfulSaves = state.recentSuccessfulSaves.filter(
    (receipt) => now - receipt.savedAt < TUNNEL_SAVE_DEDUPE_WINDOW_MS
  );

  if (
    state.activeFingerprint !== null ||
    recentSuccessfulSaves.some((receipt) => receipt.fingerprint === fingerprint)
  ) {
    return {
      accepted: false,
      state: { ...state, recentSuccessfulSaves },
    };
  }

  return {
    accepted: true,
    state: {
      activeFingerprint: fingerprint,
      recentSuccessfulSaves,
    },
  };
}

export function finishTunnelSaveAttempt(
  state: TunnelSaveDedupeState,
  fingerprint: string,
  outcome: "succeeded" | "failed",
  now: number
): TunnelSaveDedupeState {
  if (state.activeFingerprint !== fingerprint) return state;

  return {
    activeFingerprint: null,
    recentSuccessfulSaves:
      outcome === "succeeded"
        ? [...state.recentSuccessfulSaves, { fingerprint, savedAt: now }]
        : state.recentSuccessfulSaves,
  };
}
