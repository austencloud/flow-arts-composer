import type { Composition } from "#lib/shared/animation-engine/domain/compose-types.js";
import { getTunnelLayerColors } from "#lib/shared/animation-engine/domain/compose-types.js";
import { compositionSyncer } from "#lib/features/compose/services/composition-syncer.js";
import { compositionToGridState } from "#lib/features/compose/tabs/arrange/services/arrange-composition-converter.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { ArrangementSnapshot } from "#lib/shared/media-composition/domain/arrangement.js";
import type { PostProject } from "#lib/shared/media-composition/domain/post-project.js";
import { validateArrangementSnapshot } from "#lib/shared/media-composition/domain/arrangement.js";
import { createArrangementProject } from "#lib/shared/media-composition/domain/post-arrangement-item.js";
import {
  loadPostDraft,
  savePostDraft,
} from "#lib/shared/media-composition/services/post-draft-storage.js";
import {
  legacyPostOwner,
  loadPostProject,
  savePostProject,
} from "#lib/shared/media-composition/services/post-project-store.js";
import { rememberPostSequence } from "./post-workspace-projects";
import { auth } from "#lib/shared/auth/firebase.js";
import { loadAccountPostProject } from "./post-account-projects";

const SOURCE_PREFIX = "studio-arrangement:";
const SEQUENCE_PREFIX = "tka:post:sequence:v1:";

export function studioAccountId(): string | null {
  return auth.currentUser && !auth.currentUser.isAnonymous
    ? auth.currentUser.uid
    : null;
}

export function assertStudioAccount(expected: string | null): void {
  if (studioAccountId() !== expected)
    throw new Error(
      "The account changed while opening this arrangement. Try again in the current account."
    );
}

function sourceStorageKey(id: string, uid: string | null): string {
  const scope = uid ? `:account:${uid}` : legacyPostOwner() ? ":guest" : "";
  return `${SEQUENCE_PREFIX}${scope}${id}`;
}

function firstPopulatedSequence(
  snapshot: ArrangementSnapshot
): SequenceData | null {
  for (const cell of snapshot.cells) {
    if (cell.row >= snapshot.gridRows || cell.col >= snapshot.gridCols)
      continue;
    for (const layer of cell.layers) {
      if (layer.sequence?.steps?.length) return layer.sequence;
    }
  }
  return null;
}

export async function persistStudioProject(
  source: SequenceData,
  project: PostProject,
  uid: string | null
): Promise<void> {
  assertStudioAccount(uid);
  // rememberPostSequence also updates Post's recent list and active selection.
  // Verify the source separately because its cache intentionally swallows quota errors.
  rememberPostSequence(source);
  const key = sourceStorageKey(source.id, uid);
  try {
    if (localStorage.getItem(key) !== JSON.stringify(source))
      throw new Error(
        "The arrangement source could not be verified on this device."
      );
  } catch (cause) {
    throw new Error(
      "The arrangement source could not be saved on this device.",
      { cause }
    );
  }
  assertStudioAccount(uid);
  const saved = savePostProject(project);
  if (!saved.ok) throw new Error(saved.error);
  assertStudioAccount(uid);
  if (import.meta.env.DEV) await savePostDraft(project);
  assertStudioAccount(uid);
}

export async function hasStudioDraft(
  id: string,
  uid: string | null
): Promise<boolean> {
  assertStudioAccount(uid);
  if (loadPostProject(id)) return true;
  const result = await loadPostDraft(id);
  assertStudioAccount(uid);
  if (result.project) return true;
  if (result.error) throw new Error(result.error);
  if (uid) {
    const cloud = await loadAccountPostProject(uid, id);
    assertStudioAccount(uid);
    if (cloud) return true;
  }
  return false;
}

/** Lists only this account's compositions and separate, unclaimed device records. */
export async function listStudioArrangements(): Promise<{
  owned: Composition[];
  legacy: Composition[];
}> {
  const uid = studioAccountId();
  const [owned, legacy] = await Promise.all([
    compositionSyncer.getCompositions(),
    compositionSyncer.getLegacyCompositions(),
  ]);
  assertStudioAccount(uid);
  return { owned, legacy };
}

/** Copies a saved Arrange composition into a local Post draft without claiming the original. */
export async function openCompositionInStudio(
  id: string,
  options: { legacy?: boolean } = {}
): Promise<string> {
  if (!id) throw new Error("Choose an arrangement to open.");
  const uid = studioAccountId();
  const sourceId = `${SOURCE_PREFIX}${id}`;
  if (await hasStudioDraft(sourceId, uid)) return sourceId;
  if (!options.legacy) {
    await compositionSyncer.getCompositions();
    assertStudioAccount(uid);
  }
  const composition = options.legacy
    ? ((await compositionSyncer.getLegacyCompositions()).find(
        (item) => item.id === id
      ) ?? null)
    : await compositionSyncer.getComposition(id);
  assertStudioAccount(uid);
  if (!composition)
    throw new Error("This arrangement is unavailable for this account.");
  const snapshot = validateArrangementSnapshot({
    schemaVersion: 1,
    ...compositionToGridState(composition),
  });
  const sequence = firstPopulatedSequence(snapshot);
  if (!sequence)
    throw new Error("This arrangement has no sequence to open in Studio.");
  const name =
    composition.name || sequence.displayName || sequence.name || "Arrangement";
  const source = structuredClone({
    ...sequence,
    id: sourceId,
    name,
    displayName: name,
  }) as SequenceData;
  const project = createArrangementProject(snapshot, sourceId);
  await persistStudioProject(source, project, uid);
  return sourceId;
}

/** Starts an independent Studio arrangement from one chosen sequence. */
export async function createStudioArrangement(
  sequence: SequenceData,
  title?: string
): Promise<string> {
  if (!sequence.steps?.length) throw new Error("Choose a sequence with steps.");
  const uid = studioAccountId();
  const sourceId = `${SOURCE_PREFIX}${crypto.randomUUID()}`;
  const name =
    title?.trim() ||
    sequence.displayName ||
    sequence.name ||
    sequence.word ||
    "Arrangement";
  const cells = Array.from({ length: 64 }, (_, index) => ({
    id: `cell-${Math.floor(index / 8)}-${index % 8}`,
    row: Math.floor(index / 8),
    col: index % 8,
    layers:
      index === 0
        ? [
            {
              sequence: structuredClone(sequence),
              beatOffset: 0,
              propColors: getTunnelLayerColors(0),
              transformStack: [],
            },
          ]
        : [],
    beatOffset: 0,
    colSpan: 1,
    rowSpan: 1,
    mediaType: "animation" as const,
  }));
  const snapshot = validateArrangementSnapshot({
    schemaVersion: 1,
    cells,
    gridRows: 2,
    gridCols: 2,
    bpm: 120,
    skipStartPlacement: true,
  });
  const source = structuredClone({
    ...sequence,
    id: sourceId,
    name,
    displayName: name,
  }) as SequenceData;
  const project = createArrangementProject(snapshot, sourceId);
  await persistStudioProject(source, project, uid);
  return sourceId;
}
