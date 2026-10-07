import { z } from "zod";
import type { GridJoin } from "@tka/tka-types";
import { isGridJoin } from "@tka/render-core";
import { StepDataSchema } from "$lib/shared/foundation/domain/schemas";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import {
  TunnelSnapshotSchema,
  type TunnelSnapshot,
} from "$lib/shared/sequence-viewer/tunnel/tunnel-snapshot";
import {
  TunnelCompositionSchema,
  type TunnelComposition,
} from "$lib/shared/sequence-viewer/tunnel/tunnel-composition";

export interface CollectedTunnel {
  id: string;
  name: string;
  steps: StepData[];
  /** The grid join the steps were made under; absent means one grid, which
   *  is also how tunnels saved before joins read. */
  conjoined?: GridJoin;
  snapshot: TunnelSnapshot;
  poster: string; // ~200px WebP data URL
  createdAt: number;
  source?: "viewer" | "default";
  /** Lineage stamp — the source sequence's simplified word (never a raw
   *  repeated word; see simplifyRepeatedWord) and, when known at save time,
   *  its library id. Optional: old entries simply lack them. */
  sourceWord?: string;
  sourceSequenceId?: string;
  /** Authored cast and derivation graph. Absent means a legacy one-source tunnel. */
  composition?: TunnelComposition;
  /** Version of the mutable artifact envelope. Missing means a record saved
   * before the envelope named its contract; migration preserves that fact. */
  artifactSchemaVersion?: 1 | 2;
  /** A stage capture is disposable presentation. Only a canonical renderer may
   * mark it current; absent means legacy/unknown, never "good enough". */
  posterRenderVersion?: 1;
  /** Stable work id lives in `id`; these fields identify the exact current
   * immutable payload. Legacy entries are baselined when they next hydrate. */
  currentRevisionId?: string;
  currentContentDigest?: string;
  currentRevisionCreatedAt?: number;
  revisionDigestAlgorithm?: "SHA-256";
  revisionDigestVersion?: 1;
  /** Schema of the immutable payload named by currentRevisionId. Missing is the
   * original payload shape, retained so old revision ids keep their meaning. */
  currentRevisionSchemaVersion?: 1 | 2;
}

export const CollectedTunnelSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  steps: z.array(StepDataSchema),
  // A malformed stored join reads as one grid instead of failing the entry.
  conjoined: z.custom<GridJoin>(isGridJoin).optional().catch(undefined),
  snapshot: TunnelSnapshotSchema,
  poster: z.string(),
  // createdAt is always the client's Date.now() number (saveTunnel passes an
  // explicit id, so firestoreSet preserves it). updatedAt is a SERVER timestamp
  // firestoreSet stamps on every write — an object on read, hence z.any().
  createdAt: z.number(),
  updatedAt: z.any().optional(),
  source: z.enum(["viewer", "default"]).optional(),
  sourceWord: z.string().optional(),
  sourceSequenceId: z.string().optional(),
  composition: TunnelCompositionSchema.optional(),
  artifactSchemaVersion: z.union([z.literal(1), z.literal(2)]).optional(),
  posterRenderVersion: z.literal(1).optional(),
  currentRevisionId: z.string().min(1).optional(),
  currentContentDigest: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  currentRevisionCreatedAt: z.number().optional(),
  revisionDigestAlgorithm: z.literal("SHA-256").optional(),
  revisionDigestVersion: z.literal(1).optional(),
  currentRevisionSchemaVersion: z
    .union([z.literal(1), z.literal(2)])
    .optional(),
});

export const TUNNEL_COLLECTION_STORAGE_KEY = "tka:tunnel-collection";
export const TUNNEL_COLLECTION_SCHEMA_VERSION = 1;
export const TUNNEL_ARTIFACT_SCHEMA_VERSION = 2 as const;
