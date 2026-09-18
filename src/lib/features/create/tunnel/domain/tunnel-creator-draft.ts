import { z } from "zod";
import { normalizeLegacySequence } from "@tka/tka-types";
import {
  TunnelCompositionSchema,
  TunnelSourceProvenanceSchema,
  type TunnelComposition,
  type TunnelSourceProvenance,
} from "$lib/shared/sequence-viewer/tunnel/tunnel-composition";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import {
  TunnelSnapshotSchema,
  type TunnelSnapshot,
} from "$lib/shared/sequence-viewer/tunnel/tunnel-snapshot";
import type { TunnelRelationshipRule } from "./tunnel-relationship-rule";

export const TUNNEL_CREATOR_DRAFT_VERSION = 6;

export type TunnelSourceOrigin = "picked" | "generated";
export type TunnelWorkflowMode = "seeded" | "custom";
export type TunnelWorkspacePanel = "settings" | "pairing" | "generation" | null;

/** The saved tunnel an editing session is holding. `poster` is carried so the
 *  creator can show the picture the user clicked, not just its name. */
export interface TunnelEditTarget {
  id: string;
  name: string;
  poster?: string;
}

export interface TunnelWorkspaceDraft {
  activePanel: TunnelWorkspacePanel;
  generationTargetId: string | null;
}

export interface TunnelSourceHistoryEntry {
  sequence: SequenceData;
  origin: TunnelSourceOrigin;
  sourceSequenceId?: string;
  provenance?: TunnelSourceProvenance;
}

export interface TunnelPerformerSourceDraft {
  performerId: string;
  label: string;
  independentSequence: SequenceData | null;
  origin: TunnelSourceOrigin | null;
  sourceSequenceId: string | null;
  provenance: TunnelSourceProvenance | null;
  previous: TunnelSourceHistoryEntry[];
}

export interface TunnelCreatorDraft {
  version: typeof TUNNEL_CREATOR_DRAFT_VERSION;
  workflow: TunnelWorkflowMode;
  mode: "separate" | "linked";
  composition: TunnelComposition | null;
  relationship: TunnelRelationshipRule;
  sourceStates: TunnelPerformerSourceDraft[];
  workspace: TunnelWorkspaceDraft;
  editingTunnel: TunnelEditTarget | null;
  /** Tunnel-local render state. Null only for drafts created before v4. */
  presentation: TunnelSnapshot | null;
}

const SequenceSnapshotSchema = z
  .object({
    id: z.string().min(1),
    name: z.string(),
    word: z.string(),
    steps: z.array(z.any()),
  })
  .passthrough();

const RelationshipSchema = z.object({
  rotationSteps: z.number().finite(),
  reflect: z.enum(["none", "mirror", "flip"]),
  invert: z.boolean(),
  rewind: z.boolean(),
});

const EditingTunnelSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    poster: z.string().optional(),
  })
  .nullable();

const WorkspaceSchema = z.object({
  activePanel: z.enum(["settings", "pairing", "generation"]).nullable(),
  generationTargetId: z.string().min(1).nullable(),
});

const SourceStatesSchema = z.array(
  z.object({
    performerId: z.string().min(1),
    label: z.string().min(1),
    independentSequence: SequenceSnapshotSchema.nullable(),
    origin: z.enum(["picked", "generated"]).nullable(),
    sourceSequenceId: z.string().min(1).nullable().optional().default(null),
    provenance: TunnelSourceProvenanceSchema.nullable()
      .optional()
      .default(null),
    previous: z.array(
      z.object({
        sequence: SequenceSnapshotSchema,
        origin: z.enum(["picked", "generated"]),
        sourceSequenceId: z.string().min(1).optional(),
        provenance: TunnelSourceProvenanceSchema.optional(),
      })
    ),
  })
);

const TunnelCreatorDraftSchema = z.object({
  version: z.literal(TUNNEL_CREATOR_DRAFT_VERSION),
  workflow: z.enum(["seeded", "custom"]),
  mode: z.enum(["separate", "linked"]),
  composition: TunnelCompositionSchema.nullable(),
  relationship: RelationshipSchema,
  sourceStates: SourceStatesSchema,
  workspace: WorkspaceSchema,
  editingTunnel: EditingTunnelSchema,
  presentation: TunnelSnapshotSchema.nullable(),
});

const VersionFiveTunnelCreatorDraftSchema = z.object({
  version: z.literal(5),
  workflow: z.enum(["seeded", "custom"]),
  mode: z.enum(["separate", "linked"]),
  composition: TunnelCompositionSchema.nullable(),
  relationship: RelationshipSchema,
  sourceStates: SourceStatesSchema,
  workspace: WorkspaceSchema,
  editingTunnel: EditingTunnelSchema,
  presentation: TunnelSnapshotSchema.nullable(),
});

const VersionFourTunnelCreatorDraftSchema = z.object({
  version: z.literal(4),
  mode: z.enum(["separate", "linked"]),
  composition: TunnelCompositionSchema.nullable(),
  relationship: RelationshipSchema,
  sourceStates: SourceStatesSchema,
  workspace: WorkspaceSchema,
  editingTunnel: EditingTunnelSchema,
  presentation: TunnelSnapshotSchema.nullable(),
});

const VersionThreeTunnelCreatorDraftSchema = z.object({
  version: z.literal(3),
  mode: z.enum(["separate", "linked"]),
  composition: TunnelCompositionSchema.nullable(),
  relationship: RelationshipSchema,
  sourceStates: SourceStatesSchema,
  workspace: WorkspaceSchema,
  editingTunnel: EditingTunnelSchema,
});

const VersionTwoTunnelCreatorDraftSchema = z.object({
  version: z.literal(2),
  mode: z.enum(["separate", "linked"]),
  composition: TunnelCompositionSchema.nullable(),
  relationship: RelationshipSchema,
  sourceStates: SourceStatesSchema,
  editingTunnel: EditingTunnelSchema,
});

const VersionOneTunnelCreatorDraftSchema = z.object({
  version: z.literal(1),
  mode: z.enum(["separate", "linked"]),
  composition: TunnelCompositionSchema.nullable(),
  relationship: RelationshipSchema,
  editingTunnel: EditingTunnelSchema,
});

/**
 * A stale or partially written draft should open as an empty creator, never as
 * a plausible-looking tunnel with missing performers or malformed transforms.
 * Every sequence snapshot the draft carries (independentSequence and each
 * performer's previous history) is passed through normalizeLegacySequence so
 * a draft saved before the position -> placement rename still resolves its
 * start step from the old startPosition/startingPosition spelling.
 */
export function parseTunnelCreatorDraft(
  value: unknown
): TunnelCreatorDraft | null {
  const draft = parseTunnelCreatorDraftShape(value);
  return draft ? normalizeDraftSequences(draft) : null;
}

/** Applies normalizeLegacySequence to every sequence snapshot a parsed draft
 * carries, so pre-rename localStorage data still yields a usable start step. */
function normalizeDraftSequences(
  draft: TunnelCreatorDraft
): TunnelCreatorDraft {
  return {
    ...draft,
    sourceStates: draft.sourceStates.map((source) => ({
      ...source,
      independentSequence:
        source.independentSequence !== null
          ? (normalizeLegacySequence(
              source.independentSequence
            ) as SequenceData)
          : null,
      previous: source.previous.map((entry) => ({
        ...entry,
        sequence: normalizeLegacySequence(entry.sequence) as SequenceData,
      })),
    })),
  };
}

function parseTunnelCreatorDraftShape(
  value: unknown
): TunnelCreatorDraft | null {
  const parsed = TunnelCreatorDraftSchema.safeParse(value);
  if (parsed.success) return parsed.data as unknown as TunnelCreatorDraft;

  const versionFive = VersionFiveTunnelCreatorDraftSchema.safeParse(value);
  if (versionFive.success) {
    return {
      ...versionFive.data,
      version: TUNNEL_CREATOR_DRAFT_VERSION,
    } as unknown as TunnelCreatorDraft;
  }

  const versionFour = VersionFourTunnelCreatorDraftSchema.safeParse(value);
  if (versionFour.success) {
    return {
      ...versionFour.data,
      version: TUNNEL_CREATOR_DRAFT_VERSION,
      workflow: inferLegacyWorkflow(versionFour.data.composition),
    } as unknown as TunnelCreatorDraft;
  }

  const versionThree = VersionThreeTunnelCreatorDraftSchema.safeParse(value);
  if (versionThree.success) {
    return {
      ...versionThree.data,
      version: TUNNEL_CREATOR_DRAFT_VERSION,
      workflow: inferLegacyWorkflow(versionThree.data.composition),
      presentation: null,
    } as unknown as TunnelCreatorDraft;
  }

  const versionTwo = VersionTwoTunnelCreatorDraftSchema.safeParse(value);
  if (versionTwo.success) {
    return {
      ...versionTwo.data,
      version: TUNNEL_CREATOR_DRAFT_VERSION,
      workflow: inferLegacyWorkflow(versionTwo.data.composition),
      workspace: { activePanel: null, generationTargetId: null },
      presentation: null,
    } as unknown as TunnelCreatorDraft;
  }

  const versionOne = VersionOneTunnelCreatorDraftSchema.safeParse(value);
  if (!versionOne.success) return null;

  return {
    ...versionOne.data,
    version: TUNNEL_CREATOR_DRAFT_VERSION,
    workflow: inferLegacyWorkflow(versionOne.data.composition),
    sourceStates: [],
    workspace: { activePanel: null, generationTargetId: null },
    presentation: null,
  } as unknown as TunnelCreatorDraft;
}

function inferLegacyWorkflow(
  composition: TunnelComposition | null
): TunnelWorkflowMode {
  const performers = composition?.performers ?? [];
  if (performers.length < 2) return "seeded";
  const leadId = performers[0]?.id;
  return leadId &&
    performers
      .slice(1)
      .every(
        (performer) =>
          performer.source.kind === "derived" &&
          performer.source.performerId === leadId
      )
    ? "seeded"
    : "custom";
}
