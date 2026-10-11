/**
 * ChoreoSheetRepository — Firestore CRUD for printable choreo sheets.
 *
 * A sheet is a lightweight roster: an ordered list of sequence references plus
 * layout settings and metadata. It deliberately stores NO hydrated steps — those
 * are re-derived from the user's library at render time, exactly as the
 * ChoreoSheet type's docstring promises.
 *
 * This mirrors LibraryRepository's conventions: user-owned data lives under
 * `users/{uid}/…` (LibraryRepository uses `users/{uid}/sequences` via
 * getUserSequencesPath), the owner is the signed-in user from
 * authState.effectiveUserId (LibraryRepository.getUserId → here, the shared
 * requireAuth()), and Date ⇄ Firestore Timestamp crosses the boundary through
 * the shared firestore helpers — `firestoreDate` coerces Timestamp → Date on
 * read (the same path LibraryRepository.getSequence takes via firestoreGet), and
 * firestoreSet stamps updatedAt with serverTimestamp on write.
 */

import { z } from "zod";
import {
  firestoreGet,
  firestoreList,
  firestoreSet,
  firestoreDelete,
  firestoreDate,
  requireAuth,
} from "#lib/shared/firestore/index.js";
import {
  DEFAULT_SHEET_LAYOUT,
  type ChoreoSheet,
} from "../domain/types/choreo-sheet";
import { migrateCues, migrateNotes } from "../domain/annotation-migration";
import {
  trackChoreoSheetDeleted,
  trackChoreoSheetSaved,
} from "../analytics/choreo-events";

// Per-user subcollection — the same shape LibraryRepository uses for its own
// user-owned data (`users/{uid}/sequences`, `/acts`, `/tags`). Scopes a sheet to
// its owner and keeps it under the existing per-user Firestore rules. Built
// inline rather than added to the library's firestore-paths.ts so the Write
// module doesn't reach across into the Library module's path registry.
function sheetsPath(ownerId: string): string {
  return `users/${ownerId}/choreoSheets`;
}

// Layout is read leniently: every field falls back to its v1 default via .catch
// so a doc written by an older or newer build still parses instead of being
// dropped whole by the validator (firestoreGet returns null on a hard parse
// failure). paperSize/orientation are fixed in v1 but kept resilient for later
// 'a4'/portrait variants. The resolved output type is exactly ChoreoSheetLayout.
const SheetLayoutSchema = z
  .object({
    columns: z.number().catch(DEFAULT_SHEET_LAYOUT.columns),
    rowsPerPage: z.number().catch(DEFAULT_SHEET_LAYOUT.rowsPerPage),
    paperSize: z.literal("letter").catch("letter"),
    // Annotated sheets (Task 6+) may be portrait; legacy docs lack the field and
    // fall back to landscape via .catch — the same lenient shape as every field
    // here, so a pre-annotation doc still resolves to a full v1 layout.
    orientation: z
      .enum(["landscape", "portrait"])
      .catch(DEFAULT_SHEET_LAYOUT.orientation),
    packing: z.enum(["flow", "aligned"]).catch(DEFAULT_SHEET_LAYOUT.packing),
    showCueRail: z.boolean().catch(DEFAULT_SHEET_LAYOUT.showCueRail),
    showNoteStrips: z.boolean().catch(DEFAULT_SHEET_LAYOUT.showNoteStrips),
    showStepNumbers: z.boolean().catch(DEFAULT_SHEET_LAYOUT.showStepNumbers),
    groupSeparator: z
      .enum(["rule", "gap", "none"])
      .catch(DEFAULT_SHEET_LAYOUT.groupSeparator),
    keepBlocksTogether: z.boolean().catch(DEFAULT_SHEET_LAYOUT.keepBlocksTogether),
  })
  .catch({ ...DEFAULT_SHEET_LAYOUT });

// Annotation layer (cue rail + note strips + page header). All read leniently:
// a legacy doc has no `annotations` at all and hydrates to an empty set via the
// top-level .catch, so opening a pre-annotation sheet never fails validation.
// Two generations of annotation addressing. Current marks carry an absolute
// `stepIndex`; pre-migration ones carry a band-relative `band` (+ `count`),
// which meant a different set of steps at every pictograph size. Both parse —
// `toSheet` converts the legacy ones using the layout the doc was SAVED with,
// which is the only place the original `columns` is still known. Current shape
// is listed first so a doc carrying both keys resolves as current.
const CurrentCueSchema = z.object({
  sequenceId: z.string(),
  stepIndex: z.number().int().nonnegative(),
  timestamp: z.string().catch(""),
  text: z.string().catch(""),
});
const LegacyCueSchema = z.object({
  band: z.string(),
  timestamp: z.string().catch(""),
  text: z.string().catch(""),
});
const CueMarkSchema = z.union([CurrentCueSchema, LegacyCueSchema]);

const CurrentNoteSchema = z.object({
  id: z.string(),
  sequenceId: z.string(),
  stepIndex: z.number().int().nonnegative(),
  pinned: z.boolean().catch(false),
  text: z.string().catch(""),
});
const LegacyNoteSchema = z.object({
  id: z.string(),
  band: z.string(),
  count: z.number().nullable().catch(null),
  text: z.string().catch(""),
});
const NoteMarkSchema = z.union([CurrentNoteSchema, LegacyNoteSchema]);
const SheetHeaderSchema = z.object({
  songName: z.string().optional(),
  choreographer: z.string().optional(),
  songArtist: z.string().optional(),
  tagline: z.string().optional(),
  date: z.string().optional(),
  showTitleBlock: z.boolean().catch(true),
});
const AnnotationsSchema = z
  .object({
    cues: z.array(CueMarkSchema).catch([]),
    notes: z.array(NoteMarkSchema).catch([]),
    header: SheetHeaderSchema.catch({ showTitleBlock: true }),
  })
  .catch({ cues: [], notes: [], header: { showTitleBlock: true } });

// Display-only snapshot of each referenced sequence (row label + step count), so
// a sheet opened on a cold device can label its rows before hydration resolves.
// Optional by design: every doc written before this field existed parses exactly
// as it did, and the canonical steps still come from the library record.
const SequenceMetaSchema = z.object({ name: z.string(), stepCount: z.number() });

const ChoreoSheetDocSchema = z.object({
  id: z.string(),
  name: z.string().catch("Untitled Sheet"),
  ownerId: z.string().catch(""),
  sequenceIds: z.array(z.string()).catch([]),
  layout: SheetLayoutSchema,
  annotations: AnnotationsSchema,
  sequenceMeta: z.record(z.string(), SequenceMetaSchema).optional().catch(undefined),
  bpm: z.number().optional().catch(undefined),
  // serverTimestamp can read back as a pending null on the writing client; the
  // optional+catch keeps the doc parseable and toSheet supplies the fallback.
  createdAt: firestoreDate.optional().catch(undefined),
  updatedAt: firestoreDate.optional().catch(undefined),
});

type ChoreoSheetDoc = z.infer<typeof ChoreoSheetDocSchema>;

export type SheetSequenceMeta = z.infer<typeof SequenceMetaSchema>;

/**
 * A loaded sheet plus the optional display-meta snapshot. Carried alongside the
 * domain type rather than inside it: `ChoreoSheet` is the printable roster, and
 * meta is a non-authoritative cache the loader may or may not have. Assignable
 * to `ChoreoSheet` everywhere, so existing consumers are untouched.
 */
export type LoadedChoreoSheet = ChoreoSheet & {
  sequenceMeta?: Record<string, SheetSequenceMeta>;
};

function toSheet(doc: ChoreoSheetDoc): LoadedChoreoSheet {
  // Legacy annotations resolve against the layout they were written against —
  // `doc.layout.columns` is the saved chunk width, so band+count converts back
  // to the exact step the user pointed at. Already-migrated marks pass through.
  const savedColumns = doc.layout.columns;
  return {
    id: doc.id,
    name: doc.name,
    ownerId: doc.ownerId,
    sequenceIds: doc.sequenceIds,
    layout: doc.layout,
    annotations: {
      ...doc.annotations,
      cues: migrateCues(doc.annotations.cues, savedColumns),
      notes: migrateNotes(doc.annotations.notes, savedColumns),
    },
    sequenceMeta: doc.sequenceMeta,
    bpm: doc.bpm,
    createdAt: doc.createdAt ?? new Date(),
    updatedAt: doc.updatedAt ?? new Date(),
  };
}

/**
 * Validate + hydrate a raw sheet object (Firestore snapshot or persisted JSON)
 * into a ChoreoSheet, filling every missing field from its v1 default. Reuses
 * the same lenient schema the repository reads through, so a pre-annotation doc
 * hydrates to flow mode with empty annotations rather than being rejected. Date
 * fields coerce from Firestore Timestamps OR ISO strings via `firestoreDate`.
 */
export function parseChoreoSheet(raw: unknown): LoadedChoreoSheet {
  return toSheet(ChoreoSheetDocSchema.parse(raw));
}

export class ChoreoSheetRepository {
  /**
   * List a user's sheets, most-recently-edited first. Defaults to the signed-in
   * user; an explicit ownerId mirrors LibraryRepository.getUserSequences(userId)
   * for reading another user's roster.
   */
  async listSheets(ownerId?: string): Promise<LoadedChoreoSheet[]> {
    const uid = ownerId ?? requireAuth();
    const docs = await firestoreList(sheetsPath(uid), ChoreoSheetDocSchema, {
      orderBy: [{ field: "updatedAt", direction: "desc" }],
    });
    return docs.map(toSheet);
  }

  async loadSheet(id: string): Promise<LoadedChoreoSheet | null> {
    const uid = requireAuth();
    const doc = await firestoreGet(sheetsPath(uid), id, ChoreoSheetDocSchema);
    return doc ? toSheet(doc) : null;
  }

  /**
   * Upsert. Writes the full document (no merge) so removed sequence ids and
   * cleared layout fields actually disappear. updatedAt is bumped server-side by
   * firestoreSet; createdAt is carried from the sheet so it survives re-saves.
   * Stores only references + layout + metadata — never hydrated steps. The path
   * and stored ownerId both come from the signed-in user, the same way
   * LibraryRepository.saveSequence trusts getUserId() over the incoming object.
   *
   * `sequenceMeta` is the optional display snapshot (row label + step count per
   * id) taken from the ready rows — display only, never a source of steps.
   */
  async saveSheet(
    sheet: ChoreoSheet,
    sequenceMeta?: Record<string, SheetSequenceMeta>,
  ): Promise<ChoreoSheet> {
    const uid = requireAuth();
    await firestoreSet(
      sheetsPath(uid),
      sheet.id,
      {
        name: sheet.name,
        ownerId: uid,
        sequenceIds: [...sheet.sequenceIds],
        layout: { ...sheet.layout },
        annotations: {
          cues: [...sheet.annotations.cues],
          notes: [...sheet.annotations.notes],
          header: { ...sheet.annotations.header },
        },
        // firestoreSet strips undefined, so an act with no BPM writes no field.
        bpm: sheet.bpm,
        sequenceMeta,
        createdAt: sheet.createdAt,
      } as Record<string, unknown>,
      { trackOffline: true, repoName: "choreo-sheets" },
    );
    trackChoreoSheetSaved({
      sheetId: sheet.id,
      sequenceCount: sheet.sequenceIds.length,
      orientation: sheet.layout.orientation,
      columns: sheet.layout.columns,
    });
    return { ...sheet, ownerId: uid, updatedAt: new Date() };
  }

  async deleteSheet(id: string): Promise<void> {
    const uid = requireAuth();
    await firestoreDelete(sheetsPath(uid), id, {
      trackOffline: true,
      repoName: "choreo-sheets",
    });
    trackChoreoSheetDeleted(id);
  }
}

// Module-level singleton getter — the factory-getter pattern this repo uses for
// data-access services (see getLibraryRepository). No DI container.
let instance: ChoreoSheetRepository | null = null;
export function getChoreoSheetRepository(): ChoreoSheetRepository {
  return (instance ??= new ChoreoSheetRepository());
}
