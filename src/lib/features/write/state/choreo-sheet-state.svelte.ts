/**
 * Choreo Sheet builder state — factory + context.
 *
 * Holds the sheet a user is assembling: which sequences are on it (in order),
 * the page layout, and a cache of the full sequence data needed to draw each
 * row of step-pictographs. A sheet only stores sequence *ids*; the actual steps
 * live in the user's library, so we hydrate them on demand and keep them cached
 * (re-ordering a row or toggling step numbers must never refetch).
 *
 * Both the on-screen preview and the PDF export read `pages` + `geo` from here,
 * so the printed sheet and the preview can never drift apart.
 *
 * Follows the module Factory + Context pattern (see the state-management skill):
 * `createChoreoSheetState()` returns getters (never raw `$state`), services come
 * in as arguments, and the context is set once in the builder root and consumed
 * by any descendant.
 */

import { getContext, setContext } from "svelte";
import { SvelteMap } from "svelte/reactivity";
import {
  createEmptyAnnotations,
  createEmptyChoreoSheet,
  DEFAULT_SHEET_LAYOUT,
  type ChoreoSheet,
  type ChoreoSheetAnnotations,
  type ChoreoSheetLayout,
  type CueMark,
  type NoteMark,
} from "../domain/types/choreo-sheet";
import {
  getSheetPageLayout,
  type SheetPageGeometry,
} from "../domain/sheet-page-layout";
import {
  buildBands,
  planBands,
  planSheet,
  type SheetBand,
  type SheetBandPage,
  type SheetPage,
} from "../services/sheet-row-planner";
import { prefillTimestamps as computePrefill } from "../services/timestamp-prefill";
import { buildActSequence } from "../services/sheet-act-sequence";
import {
  connects,
  endStateOf,
  loopStatus,
  normalizeToStart,
  type LoopStatus,
} from "../services/sheet-continuity";
import type { ActData } from "../domain/types/write";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type {
  ResolveFailure,
  ResolveOutcome,
} from "../services/sheet-sequence-resolver";

/** Per-row hydration state. `retrying` is a re-attempt of a row that already
 *  failed — visually identical to `loading`, so recovery never flashes red. */
export type RowStatus = "loading" | "retrying" | "ready" | "missing" | "error";

/** Display-only snapshot of a sequence, cached in the draft so a cold restore
 *  can label its rows before any step data has arrived. Never authoritative —
 *  the steps always come from the library/gallery record. */
export interface SequenceMeta {
  name: string;
  stepCount: number;
}

export interface RosterRow {
  id: string;
  status: RowStatus;
  sequence: SequenceData | null;
  meta: SequenceMeta | null;
  failure: ResolveFailure | null;
  attempts: number;
}

export interface ChoreoSheetStateDeps {
  /** Resolves one id to full step data (private→public, classified, retrying).
   *  Wire to createSheetSequenceResolver(...).resolve at the builder root. */
  resolveSequence: (id: string, signal: AbortSignal) => Promise<ResolveOutcome>;
  /** Optional seed sheet (e.g. a saved sheet being reopened). Defaults to a fresh empty sheet. */
  initialSheet?: ChoreoSheet;
  /**
   * localStorage key for an auto-saved draft. When set, the builder restores
   * from it on construction (unless `initialSheet` is passed) and re-saves on
   * every change, so a reload / HMR lands on the exact state the user left. The
   * heavy step data is NOT persisted — only ids + layout + name + a display-meta
   * snapshot; steps rehydrate via `resolveSequence` on restore.
   */
  persistKey?: string;
}

// ── Draft persistence (localStorage) ─────────────────────────────────────────
// Lightweight: ids + layout + name + timestamps only. Mirrors the guarded
// load/persist pattern used across the state modules (e.g. practice-view-prefs).

// JSON round-trips Date fields as ISO strings, so a restored draft's timestamps
// arrive as `unknown`-shaped values. Narrow at runtime instead of casting.
function parseDraftDate(value: unknown, fallback: Date): Date {
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return fallback;
}

export function loadDraft(key: string): ChoreoSheet | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<ChoreoSheet> & {
      sequenceIds?: unknown;
    };
    if (!Array.isArray(p.sequenceIds)) return null;
    const now = new Date();
    return {
      id: typeof p.id === "string" && p.id ? p.id : crypto.randomUUID(),
      name: typeof p.name === "string" ? p.name : "Untitled Sheet",
      ownerId: typeof p.ownerId === "string" ? p.ownerId : "",
      sequenceIds: (p.sequenceIds as unknown[]).filter(
        (x): x is string => typeof x === "string"
      ),
      layout: { ...DEFAULT_SHEET_LAYOUT, ...(p.layout ?? {}) },
      annotations: p.annotations ?? createEmptyAnnotations(),
      bpm: typeof p.bpm === "number" ? p.bpm : undefined,
      createdAt: parseDraftDate(p.createdAt, now),
      updatedAt: parseDraftDate(p.updatedAt, now),
    };
  } catch {
    return null;
  }
}

/**
 * Reads the draft's display-meta snapshot (row name + step count per id). Kept
 * separate from `loadDraft` so the sheet shape stays exactly what it was —
 * unknown JSON fields are ignored by that parser, so old drafts (no meta) and
 * new ones both round-trip.
 */
export function loadDraftMeta(key: string): Record<string, SequenceMeta> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as { sequenceMeta?: unknown };
    const out: Record<string, SequenceMeta> = {};
    if (parsed.sequenceMeta && typeof parsed.sequenceMeta === "object") {
      for (const [id, m] of Object.entries(
        parsed.sequenceMeta as Record<string, unknown>
      )) {
        const meta = m as Partial<SequenceMeta> | null;
        if (
          meta &&
          typeof meta.name === "string" &&
          typeof meta.stepCount === "number"
        ) {
          out[id] = { name: meta.name, stepCount: meta.stepCount };
        }
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function persistDraft(
  key: string,
  sheet: ChoreoSheet,
  sequenceMeta?: Record<string, SequenceMeta>
): void {
  try {
    localStorage.setItem(
      key,
      JSON.stringify(sequenceMeta ? { ...sheet, sequenceMeta } : sheet)
    );
  } catch {
    // ignore storage errors (quota, private mode)
  }
}

function buildChoreoSheetState(deps: ChoreoSheetStateDeps) {
  // The sheet itself (ids + layout + metadata). Mutated by reassignment so the
  // `updatedAt` stamp and downstream `$derived`s refresh together. Restored from
  // the persisted draft when a persistKey is given and no explicit seed passed.
  let sheet = $state<ChoreoSheet>(
    deps.initialSheet ??
      (deps.persistKey ? loadDraft(deps.persistKey) : null) ??
      createEmptyChoreoSheet("")
  );

  // Dirty = the live sheet object differs from the construction / last-loaded
  // baseline. Every mutator reassigns `sheet` to a fresh object (bumping
  // `updatedAt`), so reference identity is an exact, allocation-cheap dirty
  // signal with no timestamp races. Exposed via a getter that reads both
  // `$state`s live, so component consumers still track it. Reset the baseline on
  // load/new-sheet so a freshly opened or freshly created sheet reads clean.
  let pristineSheet = $state<ChoreoSheet>(sheet);

  // id -> hydrated SequenceData. A SvelteMap (not a plain Map) so `.set()`/`.get()`
  // are reactive — the moment a sequence finishes hydrating, the rows that need
  // it recompute. We keep entries even after a sequence is removed from the
  // sheet: re-adding it is then instant, and the cache is just keyed by id.
  const cache = new SvelteMap<string, SequenceData>();

  // Per-id hydration truth. Reactive maps (not one `isHydrating` boolean) so a
  // row that is still loading, retrying, missing, or errored says so on its own
  // row instead of the whole rail flipping to one global state.
  const statusById = new SvelteMap<string, RowStatus>();
  const failureById = new SvelteMap<string, ResolveFailure>();
  const attemptsById = new SvelteMap<string, number>();
  const metaById = new SvelteMap<string, SequenceMeta>();
  if (deps.persistKey) {
    for (const [id, meta] of Object.entries(loadDraftMeta(deps.persistKey)))
      metaById.set(id, meta);
  }

  // Generation token + live controllers: a sheet swap cancels the batch it
  // replaced, and any completion carrying a stale generation is dropped rather
  // than written into the maps of a roster it no longer belongs to.
  let generation = 0;
  const controllers = new Set<AbortController>();

  function metaName(seq: SequenceData): string {
    return seq.displayName ?? seq.word ?? seq.name ?? seq.id;
  }

  // Which sequence block (by id) is selected in the preview / rail — powers
  // select-then-remove (click the whole sequence, see it highlighted, remove it).
  let selectedSequenceId = $state<string | null>(null);

  // The on-sheet sequences, in sheet order, with any not-yet-hydrated ones
  // skipped (their rows simply haven't drawn yet — they fill in as hydration
  // resolves). This is what the planner and preview consume.
  const hydratedSequences = $derived(
    sheet.sequenceIds
      .map((id) => cache.get(id))
      .filter((seq): seq is SequenceData => seq != null)
  );

  // The roster: one row per sheet id, in sheet order, ALWAYS. Rows are never
  // dropped, reordered, or collapsed by load state — a row that failed still
  // holds its place, which is what makes retry-in-place possible without the
  // list reflowing under the user's cursor.
  const roster = $derived<RosterRow[]>(
    sheet.sequenceIds.map((id) => {
      const sequence = cache.get(id) ?? null;
      return {
        id,
        status: sequence ? "ready" : (statusById.get(id) ?? "loading"),
        sequence,
        meta: sequence
          ? { name: metaName(sequence), stepCount: sequence.steps?.length ?? 0 }
          : (metaById.get(id) ?? null),
        failure: sequence ? null : (failureById.get(id) ?? null),
        attempts: attemptsById.get(id) ?? 0,
      };
    })
  );
  const rosterComplete = $derived(roster.every((r) => r.status === "ready"));

  // While ANY row is unresolved the planner input is EMPTY — sequence N+1 is
  // never normalized against N−1 across a hole, and no reduced sheet is ever
  // paginated, played, or exported (spec §1.3).
  const planRows = $derived<SequenceData[]>(
    sheet.sequenceIds.length > 0 &&
      sheet.sequenceIds.every((id) => cache.has(id))
      ? sheet.sequenceIds.map((id) => cache.get(id)!)
      : []
  );

  // Each row (after the first) is normalized to start where the previous row's
  // normalized form ends — so "fill from collections" auto-connects. The fold is
  // order-dependent, so it lives here (not in the id-keyed cache).
  const normalizedRows = $derived.by<SequenceData[]>(() => {
    const out: SequenceData[] = [];
    for (let i = 0; i < planRows.length; i++) {
      const seq = planRows[i]!;
      if (i === 0) {
        out.push(seq);
        continue;
      }
      const prevEnd = endStateOf(out[i - 1]!);
      out.push(prevEnd ? normalizeToStart(seq, prevEnd) : seq);
    }
    return out;
  });

  // boundaries[i] = does row i connect to row i+1 (after normalization)?
  const boundaries = $derived(
    normalizedRows.slice(1).map((seq, i) => connects(normalizedRows[i]!, seq))
  );

  // Ids of rows that begin a break (don't connect to the row above). The preview
  // and PDF mark a block start whose sequence id is in this set.
  const breakSequenceIds = $derived(
    new Set(
      normalizedRows
        .filter((seq, i) => i > 0 && !connects(normalizedRows[i - 1]!, seq))
        .map((seq) => seq.id)
    )
  );

  const sheetLoopStatus = $derived<LoopStatus>(loopStatus(normalizedRows));

  // Page geometry (cell size, margins, grid) and the paginated rows of cells.
  // Both recompute from the normalized rows + layout, so preview and PDF stay in
  // lockstep with what connects.
  const geo = $derived<SheetPageGeometry>(getSheetPageLayout(sheet.layout));
  const pages = $derived<SheetPage[]>(planSheet(normalizedRows, sheet.layout));

  // Annotated-branch planner output: row-aligned, height-packed bands carrying
  // their resolved cue + notes. Only computed in "aligned" packing — flow sheets
  // keep using `pages` above. Preview and PDF read this so they stay in lockstep.
  const bandPages = $derived<SheetBandPage[]>(
    sheet.layout.packing === "aligned"
      ? planBands({
          sequences: normalizedRows,
          geo,
          cues: sheet.annotations.cues,
          notes: sheet.annotations.notes,
          showTitleBlock: sheet.annotations.header.showTitleBlock,
        })
      : []
  );

  // The phone view re-chunks at its OWN column count — 4 across is an 83px cell
  // at 375px, which is legible, and 4/8/16-step sequences chunk without a ragged
  // last row. Re-chunking is only safe because cues and notes address an
  // absolute step index; when they were band-relative this would have scrambled
  // every one of them.
  //
  // Same `buildBands` the printed sheet uses, so chunking and annotation
  // placement have exactly one implementation. No pagination — reading scrolls.
  // Set by the view from its measured width: 4 on a phone, 8 once there is room.
  // Wider screens get MORE pictographs, never bigger ones — a 215px cell on a
  // short landscape screen wastes the whole viewport on one band.
  let readingColumns = $state(4);
  function setReadingColumns(n: number): void {
    if (n > 0 && n !== readingColumns) readingColumns = n;
  }
  const readingBands = $derived<SheetBand[]>(
    buildBands({
      sequences: normalizedRows,
      geo: getSheetPageLayout({ ...sheet.layout, columns: readingColumns }),
      cues: sheet.annotations.cues,
      notes: sheet.annotations.notes,
    })
  );

  // sequenceId → display word for the reading view's per-sequence heading. A
  // repeated word always shows in its smallest form.
  const sequenceNames = $derived<Record<string, string>>(
    Object.fromEntries(normalizedRows.map((s) => [s.id, s.word ?? ""]))
  );

  // The whole sheet as ONE continuous sequence, for act playback. Recomputes only
  // when the normalized rows or the name change.
  const actSequence = $derived(buildActSequence(normalizedRows, sheet.name));

  // Hydrate only the ids we don't already have, in parallel. The resolver owns
  // the auth gate, classification, and automatic retries; this coordinator owns
  // per-row status and the generation check that keeps a cancelled batch from
  // writing into the roster that replaced it.
  async function ensureHydrated(ids: readonly string[]): Promise<void> {
    const targets = ids.filter((id) => !cache.has(id));
    if (targets.length === 0) return;
    const gen = generation;
    const ctrl = new AbortController();
    controllers.add(ctrl);
    try {
      await Promise.all(
        targets.map(async (id) => {
          const prior = statusById.get(id);
          statusById.set(
            id,
            prior === "error" || prior === "missing" ? "retrying" : "loading"
          );
          failureById.delete(id);
          try {
            const outcome = await deps.resolveSequence(id, ctrl.signal);
            if (gen !== generation) return; // stale batch — drop
            attemptsById.set(id, outcome.attempts);
            if (outcome.sequence) {
              cache.set(id, outcome.sequence);
              statusById.set(id, "ready");
              resetDevAutoRetries();
              metaById.set(id, {
                name: metaName(outcome.sequence),
                stepCount: outcome.sequence.steps?.length ?? 0,
              });
            } else {
              statusById.set(
                id,
                outcome.failure === "missing" ? "missing" : "error"
              );
              failureById.set(id, outcome.failure ?? "transient");
            }
          } catch {
            if (gen !== generation || ctrl.signal.aborted) return; // cancelled — not an error
            statusById.set(id, "error");
            failureById.set(id, "transient");
          }
        })
      );
    } finally {
      controllers.delete(ctrl);
      persistMeta();
      // Any row that came out of this batch stuck gets another go on its own,
      // so a hot reload repairs itself instead of parking behind Try again.
      scheduleDevAutoRetry();
    }
  }

  // Re-attempt hydration for one failed id, or every errored row when none given.
  async function retryHydration(id?: string): Promise<void> {
    const targets = id
      ? [id]
      : roster.filter((r) => r.status === "error").map((r) => r.id);
    if (targets.length === 0) return;
    await ensureHydrated(targets);
  }

  /**
   * Dev only: a transient failure must not be terminal.
   *
   * The resolver's ladder is three attempts over ~6s. A hot module replacement
   * can tear down the Firestore connection or the auth module for longer than
   * that, and every row that is still failing when the ladder runs out sticks
   * in `error`. Because `planRows` is complete-or-empty, ONE such row leaves the
   * whole sheet blank behind the "couldn't load these" panel until someone
   * clicks Try again — which is the "I hot-reloaded and it stopped loading"
   * report, and it lands in the middle of the edit loop this module is worked in.
   *
   * Retrying on the `vite:afterUpdate` event does NOT fix it: when the swap
   * remounts this view the rows are still `loading` at that moment and only
   * fail seconds later. So the trigger is the failure itself, not the swap.
   *
   * Only `error` (the transient class) is retried — never `missing`, which is
   * the server answering that the document is gone. Bounded, so a genuinely
   * dead row cannot spin forever.
   */
  const DEV_AUTO_RETRY_LIMIT = 5;
  const DEV_AUTO_RETRY_DELAY_MS = 2500;
  let devAutoRetries = 0;
  let devAutoRetryTimer: ReturnType<typeof setTimeout> | null = null;

  function scheduleDevAutoRetry(): void {
    if (!import.meta.env.DEV) return;
    if (devAutoRetryTimer !== null) return;
    if (devAutoRetries >= DEV_AUTO_RETRY_LIMIT) return;

    const stuck = roster.filter((r) => r.status === "error").map((r) => r.id);
    if (stuck.length === 0) return;

    devAutoRetryTimer = setTimeout(() => {
      devAutoRetryTimer = null;
      const still = roster.filter((r) => r.status === "error").map((r) => r.id);
      if (still.length === 0) return;
      devAutoRetries++;
      console.info(
        `[choreo] dev auto-retry ${devAutoRetries}/${DEV_AUTO_RETRY_LIMIT} for ${still.length} stuck row(s)`
      );
      void ensureHydrated(still);
    }, DEV_AUTO_RETRY_DELAY_MS);
  }

  // A successful resolve means the connection is back — let the budget refill so
  // a later hot reload gets its own full allowance.
  function resetDevAutoRetries(): void {
    devAutoRetries = 0;
  }

  // Abandon every in-flight batch: bump the generation (so late completions are
  // dropped) and abort the controllers (so the resolver stops mid-backoff).
  function cancelHydration(): void {
    generation++;
    for (const ctrl of controllers) ctrl.abort();
    controllers.clear();
  }

  // Snapshot the display meta of the rows currently on the sheet into the draft.
  // Cache fills don't reassign `sheet`, so the persist $effect never sees them —
  // this is the write that keeps a cold restore able to label its rows.
  function persistMeta(): void {
    if (!deps.persistKey) return;
    const meta: Record<string, SequenceMeta> = {};
    for (const id of sheet.sequenceIds) {
      const m = metaById.get(id);
      if (m) meta[id] = m;
    }
    persistDraft(deps.persistKey, sheet, meta);
  }

  // Append sequences to the sheet (one block per sequence, so ids already on the
  // sheet are skipped) and hydrate whatever isn't cached yet. The ids appear
  // immediately; the pictographs fill in as hydration resolves.
  async function addSequences(ids: readonly string[]): Promise<void> {
    const additions = ids.filter((id) => !sheet.sequenceIds.includes(id));
    if (additions.length > 0) {
      sheet = {
        ...sheet,
        sequenceIds: [...sheet.sequenceIds, ...additions],
        updatedAt: new Date(),
      };
    }
    await ensureHydrated(additions.length > 0 ? additions : ids);
  }

  // Append sequences we ALREADY hold fully hydrated (e.g. clicked in the shared
  // media browser, which loads from the public/gallery loader — not the user's
  // library). Seed the cache directly with the given data so we neither refetch
  // nor depend on the id existing in the library `loadSequence` path.
  function addHydratedSequences(seqs: readonly SequenceData[]): void {
    const additions: string[] = [];
    for (const seq of seqs) {
      if (!seq?.id) continue;
      cache.set(seq.id, seq);
      // directly seeded — any earlier failure is moot
      statusById.delete(seq.id);
      failureById.delete(seq.id);
      metaById.set(seq.id, {
        name: metaName(seq),
        stepCount: seq.steps?.length ?? 0,
      });
      if (!sheet.sequenceIds.includes(seq.id) && !additions.includes(seq.id)) {
        additions.push(seq.id);
      }
    }
    if (additions.length > 0) {
      sheet = {
        ...sheet,
        sequenceIds: [...sheet.sequenceIds, ...additions],
        updatedAt: new Date(),
      };
    }
    persistMeta();
  }

  // Drop the row at `index`. The cached SequenceData is intentionally retained —
  // it's keyed by id and re-adding the sequence should not refetch.
  function removeAt(index: number): void {
    if (index < 0 || index >= sheet.sequenceIds.length) return;
    const removedId = sheet.sequenceIds[index];
    const next = sheet.sequenceIds.slice();
    next.splice(index, 1);
    sheet = { ...sheet, sequenceIds: next, updatedAt: new Date() };
    if (removedId === selectedSequenceId) selectedSequenceId = null;
  }

  // Remove a whole sequence block by id (the preview selects by id, not index).
  function removeById(id: string): void {
    const index = sheet.sequenceIds.indexOf(id);
    if (index >= 0) removeAt(index);
  }

  // Selection: which sequence block is highlighted for select-then-remove.
  function selectSequence(id: string | null): void {
    selectedSequenceId = id;
  }
  function toggleSequenceSelection(id: string): void {
    selectedSequenceId = selectedSequenceId === id ? null : id;
  }
  function clearSelection(): void {
    selectedSequenceId = null;
  }

  // Reorder: pull the row out of `from` and drop it back in at `to`.
  function move(from: number, to: number): void {
    const ids = sheet.sequenceIds;
    if (
      from < 0 ||
      from >= ids.length ||
      to < 0 ||
      to >= ids.length ||
      from === to
    ) {
      return;
    }
    const next = ids.slice();
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved!);
    sheet = { ...sheet, sequenceIds: next, updatedAt: new Date() };
  }

  // Rename the sheet. Kept in state (not a local in the view) so the name is
  // part of the persisted draft and restores on reload.
  function setName(name: string): void {
    sheet = { ...sheet, name, updatedAt: new Date() };
  }

  // Patch one or more layout fields (e.g. toggle step numbers, change the group
  // separator). Merges over the current layout so callers only pass what changed.
  function setLayout(patch: Partial<ChoreoSheetLayout>): void {
    sheet = {
      ...sheet,
      layout: { ...sheet.layout, ...patch },
      updatedAt: new Date(),
    };
  }

  // Set the sheet's BPM (drives cue-rail timestamp prefill). Same reassign
  // pattern as the other mutators so the dirty flag + downstream $derived refresh.
  function setBpm(bpm: number): void {
    sheet = { ...sheet, bpm, updatedAt: new Date() };
  }

  // ── Annotation editing ───────────────────────────────────────────────────────
  // Each mutator reassigns `sheet` with a bumped `updatedAt` (same pattern as the
  // roster/layout mutators above), so `isDirty` and every downstream `$derived`
  // refresh together.

  // Patch the page header (song/choreographer/tagline/title-block toggle).
  function setHeader(patch: Partial<ChoreoSheetAnnotations["header"]>): void {
    sheet = {
      ...sheet,
      annotations: {
        ...sheet.annotations,
        header: { ...sheet.annotations.header, ...patch },
      },
      updatedAt: new Date(),
    };
  }

  // Upsert a cue at an absolute step: patch the cue already anchored there, or
  // seed a fresh one (blank timestamp/text) with the patch applied. Addressing
  // the step rather than the band is what keeps a cue — and its BPM-prefilled
  // timestamp — on the same music when the pictograph size changes.
  function setCue(
    sequenceId: string,
    stepIndex: number,
    patch: Partial<Omit<CueMark, "sequenceId" | "stepIndex">>
  ): void {
    const cues = sheet.annotations.cues.slice();
    const idx = cues.findIndex(
      (c) => c.sequenceId === sequenceId && c.stepIndex === stepIndex
    );
    if (idx === -1)
      cues.push({ sequenceId, stepIndex, timestamp: "", text: "", ...patch });
    else cues[idx] = { ...cues[idx]!, ...patch };
    sheet = {
      ...sheet,
      annotations: { ...sheet.annotations, cues },
      updatedAt: new Date(),
    };
  }

  // Add a blank note at an absolute step — `pinned` puts it under that step's
  // column, otherwise it reads as a full-width bullet on that step's row.
  // Returns its stable id so the caller can immediately edit/remove it.
  function addNote(
    sequenceId: string,
    stepIndex: number,
    pinned: boolean
  ): string {
    const id = crypto.randomUUID();
    const notes = [
      ...sheet.annotations.notes,
      { id, sequenceId, stepIndex, pinned, text: "" },
    ];
    sheet = {
      ...sheet,
      annotations: { ...sheet.annotations, notes },
      updatedAt: new Date(),
    };
    return id;
  }

  // Patch a note (text and/or count) by id.
  function setNote(id: string, patch: Partial<Omit<NoteMark, "id">>): void {
    const notes = sheet.annotations.notes.map((n) =>
      n.id === id ? { ...n, ...patch } : n
    );
    sheet = {
      ...sheet,
      annotations: { ...sheet.annotations, notes },
      updatedAt: new Date(),
    };
  }

  // Remove a note by id.
  function removeNote(id: string): void {
    const notes = sheet.annotations.notes.filter((n) => n.id !== id);
    sheet = {
      ...sheet,
      annotations: { ...sheet.annotations, notes },
      updatedAt: new Date(),
    };
  }

  // Fill blank cue timestamps from each band's first-step beat index at the
  // sheet's BPM (1 step = 1 beat). Never overwrites a timestamp the user typed —
  // the pure helper only returns keys for blank bands; a no-op when BPM is unset.
  function prefillTimestamps(): void {
    // A band's prefill lands on its FIRST step — that is the step
    // `firstBeatIndex` timed. Anchoring the write there (rather than on the band
    // key) is what makes a prefilled timestamp survive a pictograph-size change:
    // the cue stays on the step whose beat produced it.
    const all = bandPages.flatMap((p) => p.bands);
    const anchors = new Map(
      all.map((b) => [
        b.key,
        { sequenceId: b.sequenceId, stepIndex: b.firstStepIndex },
      ])
    );
    const bands = all.map((b) => ({
      key: b.key,
      firstBeatIndex: b.firstBeatIndex,
      timestamp:
        b.cues.find((c) => c.stepIndex === b.firstStepIndex)?.timestamp ?? "",
    }));
    const filled = computePrefill(bands, sheet.bpm);
    for (const [key, timestamp] of Object.entries(filled)) {
      const anchor = anchors.get(key);
      if (anchor) setCue(anchor.sequenceId, anchor.stepIndex, { timestamp });
    }
  }

  // Turn an Act into a sheet roster ("Send to Sheet"). An Act already carries a
  // fully-hydrated SequenceData per placement, so we seed the cache straight from
  // it and skip the library round-trip entirely. Duplicate placements collapse to
  // a single block (one block per sequence).
  function seedFromAct(act: ActData): void {
    const ids: string[] = [];
    for (const placement of act.sequences) {
      const data = placement.sequenceData;
      if (!data?.id) continue;
      cache.set(data.id, data);
      // directly seeded — any earlier failure is moot
      statusById.delete(data.id);
      failureById.delete(data.id);
      metaById.set(data.id, {
        name: metaName(data),
        stepCount: data.steps?.length ?? 0,
      });
      if (!ids.includes(data.id)) ids.push(data.id);
    }
    sheet = {
      ...sheet,
      name: act.name,
      sequenceIds: ids,
      updatedAt: new Date(),
    };
    persistMeta();
  }

  // Load a saved sheet into the builder (the Acts dock's "open"). Replaces the
  // whole sheet — the persist $effect then snapshots it as the live draft — and
  // hydrates whatever steps aren't cached yet. Selection is cleared because it
  // referenced the outgoing roster.
  function replaceSheet(next: ChoreoSheet): void {
    cancelHydration(); // the outgoing roster's batch must never land on this one
    sheet = { ...next, sequenceIds: [...next.sequenceIds] };
    pristineSheet = sheet; // a freshly loaded sheet is clean
    selectedSequenceId = null;
    if (sheet.sequenceIds.length > 0) void ensureHydrated(sheet.sequenceIds);
  }

  // Start a fresh act. The hydration cache is retained on purpose (keyed by id —
  // re-adding a sequence must not refetch).
  function newSheet(): void {
    cancelHydration();
    sheet = createEmptyChoreoSheet("");
    pristineSheet = sheet; // a freshly created sheet is clean
    selectedSequenceId = null;
  }

  // Restore path: a draft loaded with ids needs its steps hydrated now (via the
  // loader dep, which must resolve both community and library ids).
  if (sheet.sequenceIds.length > 0) {
    void ensureHydrated(sheet.sequenceIds);
  }

  // Auto-save the draft on every sheet change, so reload / HMR restores the
  // exact state the user left. Cache/hydration mutations don't reassign `sheet`,
  // so they don't trigger a redundant write.
  if (deps.persistKey) {
    // Constructed outside a component (unit tests read the factory directly),
    // `$effect` has no owner and throws `effect_orphan`. Auto-save is a
    // component-lifetime concern, so skip it there rather than forcing every
    // test to stand up an effect root — explicit `persistMeta()` calls in the
    // mutators still cover the writes that matter.
    try {
      $effect(() => {
        void sheet;
        persistMeta();
      });
    } catch {
      // no component owner — no auto-save
    }
  }

  return {
    get sheet() {
      return sheet;
    },
    get sequenceIds() {
      return sheet.sequenceIds;
    },
    get layout() {
      return sheet.layout;
    },
    get hydratedSequences() {
      return hydratedSequences;
    },
    get geo() {
      return geo;
    },
    get pages() {
      return pages;
    },
    get bandPages() {
      return bandPages;
    },
    get readingBands() {
      return readingBands;
    },
    get readingColumns() {
      return readingColumns;
    },
    setReadingColumns,
    get sequenceNames() {
      return sequenceNames;
    },
    get isDirty() {
      return sheet !== pristineSheet;
    },
    get actSequence() {
      return actSequence;
    },
    get normalizedRows() {
      return normalizedRows;
    },
    get boundaries() {
      return boundaries;
    },
    get breakSequenceIds() {
      return breakSequenceIds;
    },
    get loopStatus() {
      return sheetLoopStatus;
    },
    get roster() {
      return roster;
    },
    get rosterComplete() {
      return rosterComplete;
    },
    get isHydrating() {
      return roster.some(
        (r) => r.status === "loading" || r.status === "retrying"
      );
    },
    get failedSequenceIds(): ReadonlySet<string> {
      return new Set(
        roster
          .filter((r) => r.status === "error" || r.status === "missing")
          .map((r) => r.id)
      );
    },
    get selectedSequenceId() {
      return selectedSequenceId;
    },

    addSequences,
    retryHydration,
    cancelHydration,
    addHydratedSequences,
    replaceSheet,
    newSheet,
    removeAt,
    removeById,
    selectSequence,
    toggleSequenceSelection,
    clearSelection,
    move,
    setName,
    setLayout,
    setBpm,
    seedFromAct,
    setHeader,
    setCue,
    addNote,
    setNote,
    removeNote,
    prefillTimestamps,
  };
}

export type ChoreoSheetState = ReturnType<typeof buildChoreoSheetState>;

export function createChoreoSheetState(
  deps: ChoreoSheetStateDeps
): ChoreoSheetState {
  return buildChoreoSheetState(deps);
}

// ── Context ──────────────────────────────────────────────────────────────────
// Set once in the builder root (ChoreoSheetView / WriteTab), consumed by any
// descendant (preview, picker, settings strip) without prop-drilling.

export interface ChoreoSheetContext {
  state: ChoreoSheetState;
}

const CHOREO_SHEET_CONTEXT_KEY = Symbol("choreo-sheet");

export function setChoreoSheetContext(context: ChoreoSheetContext): void {
  setContext(CHOREO_SHEET_CONTEXT_KEY, context);
}

export function getChoreoSheetContext(): ChoreoSheetContext {
  const context = getContext<ChoreoSheetContext>(CHOREO_SHEET_CONTEXT_KEY);

  if (!context) {
    throw new Error(
      "ChoreoSheetContext not found. Ensure you're calling getChoreoSheetContext() " +
        "within a component that is a descendant of the choreo sheet builder root."
    );
  }

  return context;
}
