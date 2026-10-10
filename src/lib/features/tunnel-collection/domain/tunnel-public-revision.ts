import { canonicalDigest } from "#lib/shared/foundation/utils/canonical-digest.js";
import {
  createArtifactRevisionRef,
  type ArtifactRevisionRef,
} from "#lib/shared/artifact-revisions/domain/artifact-revision.js";
import type {
  DerivedTunnelSource,
  TunnelComposition,
  TunnelPerformerTiming,
} from "#lib/shared/sequence-viewer/tunnel/tunnel-composition.js";
import type { PublicArtifactEnvelope } from "#lib/shared/artifact-revisions/domain/public-artifact.js";
import type { TunnelConfig } from "#lib/shared/sequence-viewer/tunnel/tunnel-config.js";
import type { TunnelStage } from "#lib/shared/sequence-viewer/tunnel/tunnel-stage.js";
import {
  CollectedTunnelSchema,
  type CollectedTunnel,
} from "./tunnel-collection-types";

/**
 * The tunnel adapter for the publication boundary: builds the SANITIZED public
 * payload and its content address. The public digest deliberately differs from
 * the private revision digest — the private payload carries unpublished
 * identifiers (`sourceSequenceId`, hydrated SequenceData passthrough metadata)
 * that must never reach a guest projection. Provenance back to the exact
 * private revision lives in the publication request's `sourceRevision`.
 */

/** Whitelisted embedded sequence — positional placeholder id, no library id,
 *  no passthrough metadata. Still parses with TunnelCompositionSchema, whose
 *  sequence boundary only requires { id, name, word, steps }. */
export interface PublicTunnelSequenceSource {
  readonly id: string;
  readonly name: string;
  readonly word: string;
  readonly steps: readonly unknown[];
}

export interface PublicTunnelIndependentSource {
  readonly kind: "independent";
  readonly sequence: PublicTunnelSequenceSource;
}

export type PublicTunnelPerformerSource =
  | PublicTunnelIndependentSource
  | DerivedTunnelSource;

export interface PublicTunnelPerformer {
  readonly id: string;
  readonly label: string;
  readonly source: PublicTunnelPerformerSource;
  readonly timing: TunnelPerformerTiming;
}

export interface PublicTunnelComposition {
  readonly version: number;
  readonly id: string;
  readonly name: string;
  readonly performers: PublicTunnelPerformer[];
  readonly stage: TunnelStage;
  readonly formation: TunnelConfig;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface TunnelPublicPayload {
  readonly steps: CollectedTunnel["steps"];
  readonly snapshot: CollectedTunnel["snapshot"];
  readonly poster: string;
  readonly sourceWord?: string;
  readonly composition?: PublicTunnelComposition;
}

export interface TunnelPublicRevision extends ArtifactRevisionRef {
  readonly artifactType: "tunnel";
  readonly payload: TunnelPublicPayload;
}

/**
 * Validate a guest-readable public revision into the same artifact shape the
 * Tunnel discovery UI already understands. The zero date is intentional:
 * publication timestamps live on the envelope and the private creation date
 * was never part of the public payload, so the adapter does not invent one.
 */
export function collectedTunnelFromPublicArtifact(
  envelope: PublicArtifactEnvelope,
  payload: TunnelPublicPayload
): CollectedTunnel | null {
  if (envelope.artifactType !== "tunnel") return null;
  const parsed = CollectedTunnelSchema.safeParse({
    id: envelope.artifactId,
    name: envelope.title,
    steps: payload.steps,
    snapshot: payload.snapshot,
    poster: payload.poster,
    createdAt: 0,
    source: "viewer",
    ...(payload.sourceWord !== undefined && {
      sourceWord: payload.sourceWord,
    }),
    ...(payload.composition !== undefined && {
      composition: payload.composition,
    }),
  });
  return parsed.success ? (parsed.data as CollectedTunnel) : null;
}

/**
 * A saved personal preset is private library provenance, not public artifact
 * provenance. The rendered configuration is already fully captured in
 * `tunnel.config`; retain built-in recipe names but remove saved-recipe IDs and
 * names at the public boundary.
 */
function sanitizeTunnelSnapshot(snapshot: CollectedTunnel["snapshot"]) {
  if (snapshot.tunnel.presetRecipe?.kind !== "saved") return snapshot;
  return {
    ...snapshot,
    tunnel: { ...snapshot.tunnel, presetRecipe: null },
  };
}

/**
 * Rebuilds the composition field-by-field so nothing rides along that the
 * whitelist did not name. Independent sources keep only the choreography
 * (name, word, steps) under a positional `src-<n>` placeholder; derived
 * sources are structural (performer graph + transforms) and copy cleanly.
 */
export function sanitizeTunnelComposition(
  composition: TunnelComposition
): PublicTunnelComposition {
  let independentCount = 0;
  return {
    version: composition.version,
    id: composition.id,
    name: composition.name,
    performers: composition.performers.map((performer) => ({
      id: performer.id,
      label: performer.label,
      source:
        performer.source.kind === "independent"
          ? {
              kind: "independent",
              sequence: {
                id: `src-${++independentCount}`,
                name: performer.source.sequence.name,
                word: performer.source.sequence.word,
                steps: performer.source.sequence.steps,
              },
            }
          : {
              kind: "derived",
              performerId: performer.source.performerId,
              transforms: performer.source.transforms.map((op) => ({ ...op })),
            },
      timing: {
        stepOffset: performer.timing.stepOffset,
        speed: performer.timing.speed,
      },
    })),
    stage: {
      instances: composition.stage.instances.map((instance) => ({
        ...instance,
      })),
    },
    formation: { ...composition.formation },
    createdAt: composition.createdAt,
    updatedAt: composition.updatedAt,
  };
}

export function tunnelPublicPayload(
  tunnel: Pick<
    CollectedTunnel,
    "steps" | "snapshot" | "poster" | "sourceWord" | "composition"
  >
): TunnelPublicPayload {
  return {
    steps: tunnel.steps,
    snapshot: sanitizeTunnelSnapshot(tunnel.snapshot),
    poster: tunnel.poster,
    ...(tunnel.sourceWord !== undefined && { sourceWord: tunnel.sourceWord }),
    ...(tunnel.composition !== undefined && {
      composition: sanitizeTunnelComposition(tunnel.composition),
    }),
  };
}

export async function createTunnelPublicRevision(
  tunnel: CollectedTunnel
): Promise<TunnelPublicRevision> {
  const payload = tunnelPublicPayload(tunnel);
  const contentDigest = await canonicalDigest(payload);
  return {
    ...createArtifactRevisionRef(tunnel.id, contentDigest),
    artifactType: "tunnel",
    payload,
  };
}
