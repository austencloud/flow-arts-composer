/**
 * The mandala climb: the pool's mandalas grouped into families of look-alike
 * shapes and ordered from the plainest to the busiest.
 *
 * It follows the mandala index by itself. Once the index has measured its
 * pool, the climb reads the saved distance book, outlines the shapes and
 * measures only the pairs the book lacks (both on the mandala workers when
 * they run, in idle slices when not), links
 * the families and saves the book again. A return visit with every pair in
 * the book makes no geometry and starts no worker. A changed set of shapes
 * rebuilds, and a build for an old set is dropped; changed sequence counts
 * over the same shapes only relink. The last families keep serving
 * throughout.
 *
 * A family's filter value names its representative and that shape's first
 * sequence (`<shape key>~<sequence id>`), so the value still finds its family
 * after a re-measure changes keys: the named sequence's own shape stands in.
 *
 * Spec: docs/superpowers/specs/2026-11-11-mandala-climb-design.md.
 */
import type { MandalaPaths } from "#lib/shared/mandala/domain/mandala-types.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import {
  MANDALA_FAMILY_VERSION,
  familiesAt,
  linkFamilyTree,
  type MandalaFamily,
  type ShapeOutline,
} from "#lib/shared/mandala/services/mandala-family-distance.js";
import {
  readBook,
  writeBook,
  type MandalaFamilyBook,
} from "#lib/shared/mandala/services/mandala-family-book.js";
import { shapeOutline } from "#lib/shared/mandala/services/mandala-family.js";
import { stepsText } from "#lib/shared/mandala/services/mandala-measure-work.js";
import {
  mandalaWorkers,
  type MandalaWorkers,
} from "#lib/shared/mandala/services/mandala-workers.js";
import {
  measureDistances,
  type MandalaDistanceRunner,
} from "#lib/shared/mandala/services/mandala-distance-runner.js";
import {
  idleScheduler,
  mandalaIndex,
  seedMandalaPaths,
  type MandalaGroup,
  type MandalaIndexScheduler,
} from "./mandala-index.svelte";
import { MANDALA_MEASURE_VERSION, peekMandalaKey } from "./sequence-density";

/**
 * How alike two shapes must be to share a family, as a share of the tighter
 * shape's gap between lines. Chosen by eye on the community pool, 2026-11-11:
 * 146 families from 494 shapes, and the largest still read as one picture.
 */
export const MANDALA_FAMILY_ALIKE = 0.35;

/**
 * Joins a family value's shape key and sequence id. Filter values travel as
 * JSON in local storage and as Firestore strings in smart collections; a key
 * is hex and digits, so the first `~` always ends it.
 */
export const MANDALA_VALUE_SEPARATOR = "~";

export interface MandalaClimbFamily extends MandalaFamily<MandalaGroup> {
  /** The Mandala filter value that picks this family. */
  readonly value: string;
}

/** The one saved book; `id` is always "book". */
export interface MandalaFamilyBookRow extends MandalaFamilyBook {
  id: string;
}

export interface MandalaFamilyBookStore {
  load(): Promise<MandalaFamilyBook | null>;
  save(book: MandalaFamilyBook): Promise<void>;
}

/** What the climb reads of the index; `mandalaIndex` fits. */
export interface MandalaClimbSource {
  readonly done: boolean;
  /** A pool with no sequences has been set; the climb is then ready with no families. */
  readonly empty?: boolean;
  readonly groups: readonly MandalaGroup[];
  groupOf(key: string): MandalaGroup | undefined;
  sequenceById(id: string): SequenceData | undefined;
  subscribe(listener: () => void): () => void;
}

export interface MandalaClimb {
  /** Families, simple to complex: the representative's spaces, then coverage, then key. */
  readonly families: readonly MandalaClimbFamily[];
  /**
   * True once a build has finished, and from then on: while a newer pool is
   * measured, the last families keep answering until the new ones replace
   * them in one step.
   */
  readonly ready: boolean;
  /** 0 to 1 while a build runs, a rebuild included; 1 when none is running. */
  readonly progress: number;
  /** True while a build for the index's current shapes is in flight. */
  readonly building: boolean;
  /** Ticks whenever the families, or whether they are ready, change. */
  readonly version: number;
  /**
   * Three shapes for the By mandala door: the first, middle and last family's
   * representative once ready, and before that the same picks from the
   * measured shapes, so the fan is never empty once anything is measured.
   */
  readonly fan: readonly MandalaGroup[];
  /** The family a filter value names, or undefined (also before ready). */
  familyOf(value: string): MandalaClimbFamily | undefined;
  /**
   * The shape keys a filter value matches: the whole family once ready, the
   * named shape alone before (or when no family holds it). Empty for an
   * empty value.
   */
  keysFor(value: string): ReadonlySet<string>;
}

/** The filter value for a family, or for a lone shape. */
export function mandalaFamilyValue(representative: MandalaGroup): string {
  const first = representative.sequences[0];
  return first
    ? `${representative.key}${MANDALA_VALUE_SEPARATOR}${first.id}`
    : representative.key;
}

/** A value's shape key and sequence id; a bare key (an older saved value) has no id. */
export function parseMandalaFamilyValue(value: string): {
  key: string;
  sequenceId?: string;
} {
  const at = value.indexOf(MANDALA_VALUE_SEPARATOR);
  if (at < 0) return { key: value };
  return { key: value.slice(0, at), sequenceId: value.slice(at + 1) };
}

/**
 * Whether a Mandala filter over `pool` gives its final answer: the index holds
 * that very pool and has measured it, and the families are built from its
 * shapes (or the pool is empty). Until then a filtered grid is still loading.
 */
export function mandalaFamiliesSettled(
  index: MandalaIndexProgress,
  climb: Pick<MandalaClimb, "ready" | "building">,
  pool: readonly SequenceData[]
): boolean {
  if (!mandalaIndexSettled(index, pool)) return false;
  if (index.empty) return true;
  return climb.ready && !climb.building;
}

/** What the settled tests read of the index. */
export interface MandalaIndexProgress {
  readonly pool: readonly SequenceData[];
  readonly done: boolean;
  readonly empty: boolean;
}

/**
 * Every sequence of `pool` is measured (or the pool is empty): enough for a
 * Mandala level, which reads each sequence's own measure and no families.
 */
export function mandalaIndexSettled(
  index: MandalaIndexProgress,
  pool: readonly SequenceData[]
): boolean {
  if (index.pool !== pool) return false;
  return index.empty || index.done;
}

/** The Dexie table, loaded on first use; a missing or blocked database keeps nothing. */
export function dexieBookStore(): MandalaFamilyBookStore {
  const table = async () =>
    (await import("#lib/shared/persistence/database/tka-database.js")).db
      .mandalaFamilyBooks;
  return {
    async load() {
      try {
        const row = await (await table()).get(BOOK_ID);
        if (!row) return null;
        return {
          keys: row.keys,
          distances: row.distances,
          measure: row.measure,
          family: row.family,
        };
      } catch {
        return null;
      }
    },
    async save(book) {
      try {
        await (
          await table()
        ).put({ id: BOOK_ID, ...book, keys: [...book.keys] });
      } catch {
        // A full or blocked database only costs the next visit a re-measure.
      }
    },
  };
}

const BOOK_ID = "book";

const noBookStore: MandalaFamilyBookStore = {
  load: async () => null,
  save: async () => {},
};

/** First, middle and last of a list, or the whole list when it is that short. */
function spreadOfThree<T>(list: readonly T[]): readonly T[] {
  if (list.length <= 3) return list;
  const last = list.length - 1;
  return [list[0]!, list[Math.floor(last / 2)]!, list[last]!];
}

function climbOrder(a: MandalaClimbFamily, b: MandalaClimbFamily): number {
  return (
    a.representative.spaces - b.representative.spaces ||
    a.representative.coverage - b.representative.coverage ||
    a.id.localeCompare(b.id)
  );
}

/** Shapes per worker task when outlining off the page. */
const SHAPES_PER_TASK = 12;

/** Share of the progress bar spent making outlines before measuring starts. */
const OUTLINE_SHARE = 0.2;
const MEASURE_SHARE = 0.75;

export function createMandalaClimb(
  options: {
    index?: MandalaClimbSource;
    store?: MandalaFamilyBookStore;
    measure?: MandalaDistanceRunner;
    scheduler?: MandalaIndexScheduler;
    /** A shape's traces and span; the default makes them from its geometry. */
    outline?: (paths: MandalaPaths) => ShapeOutline;
    /** Outlines shapes off the page; null outlines in idle slices. Default:
     *  the app's pool, unless `outline` is given. */
    workers?: MandalaWorkers | null;
    now?: () => number;
  } = {}
): MandalaClimb {
  const index = options.index ?? mandalaIndex;
  const store =
    options.store ??
    (typeof indexedDB === "undefined" ? noBookStore : dexieBookStore());
  const measure = options.measure ?? measureDistances;
  const scheduler = options.scheduler ?? idleScheduler;
  const outlineOf = options.outline ?? shapeOutline;
  const workers =
    options.workers !== undefined
      ? options.workers
      : options.outline
        ? null
        : mandalaWorkers();
  const now = options.now ?? (() => performance.now());

  let families = $state.raw<readonly MandalaClimbFamily[]>([]);
  let ready = $state(false);
  let progress = $state(0);
  let version = $state(0);
  let building = $state(false);

  /** Each family's member keys, by every member's key. */
  const keysByMember = $derived.by(() => {
    const map = new Map<
      string,
      { family: MandalaClimbFamily; keys: ReadonlySet<string> }
    >();
    for (const family of families) {
      const entry = {
        family,
        keys: new Set(family.members.map((member) => member.key)),
      };
      for (const member of family.members) map.set(member.key, entry);
    }
    return map;
  });

  const familyFan = $derived(
    spreadOfThree(families).map((family) => family.representative)
  );

  // The book as last read or written; undefined until the store answers.
  let book: MandalaFamilyBook | null | undefined;
  const outlines = new Map<string, ShapeOutline>();
  // The groups (keys and sequence counts) the families or the build in
  // flight are for; null once dropped, so the next notice builds again.
  let builtFrom: string | null = null;
  // The shape keys of the build in flight, null when none runs.
  let buildingKeys: string | null = null;
  // The last finished build's distances, before linking, so new sequence
  // counts over the same shapes relink without measuring.
  let linked: { keys: string; matrix: Float32Array } | null = null;
  let run = 0;
  let abort: AbortController | null = null;
  let stopGathering: (() => void) | null = null;

  async function loadBook(): Promise<MandalaFamilyBook | null> {
    if (book !== undefined) return book;
    const saved = await store.load();
    book =
      saved &&
      saved.measure === MANDALA_MEASURE_VERSION &&
      saved.family === MANDALA_FAMILY_VERSION &&
      saved.distances.length ===
        (saved.keys.length * (saved.keys.length - 1)) / 2
        ? saved
        : null;
    return book;
  }

  /** Every group's outline; null if the build was dropped. */
  function gatherOutlines(
    groups: readonly MandalaGroup[],
    thisRun: number
  ): Promise<ShapeOutline[] | null> {
    if (workers && !workers.broken)
      return gatherOffPage(groups, thisRun, workers);
    return gatherInSlices(groups, thisRun);
  }

  /**
   * The outlines not yet made, a few shapes per worker task, each from the
   * steps of the shape's first sequence (the sequence its geometry comes
   * from). Each shape's drawing comes back too and is kept for the wall:
   * without it the wall made 146 drawings on the page as it drew, a 0.56 s
   * freeze (12 Nov). If a worker fails, the slices make what is left.
   */
  function gatherOffPage(
    groups: readonly MandalaGroup[],
    thisRun: number,
    pool: MandalaWorkers
  ): Promise<ShapeOutline[] | null> {
    const missing = groups.filter((group) => !outlines.has(group.key));
    const all = (): ShapeOutline[] =>
      groups.map((group) => outlines.get(group.key)!);
    if (missing.length === 0) return Promise.resolve(all());
    return new Promise((resolve) => {
      const controller = new AbortController();
      let finished = false;
      const finish = (value: ShapeOutline[] | null): void => {
        if (finished) return;
        finished = true;
        stopGathering = null;
        resolve(value);
      };
      stopGathering = () => {
        controller.abort();
        finish(null);
      };
      let made = groups.length - missing.length;
      for (let start = 0; start < missing.length; start += SHAPES_PER_TASK) {
        const chunk = missing.slice(start, start + SHAPES_PER_TASK);
        pool
          .run(
            () => ({
              type: "outlines",
              steps: stepsText(
                chunk.map((group) => group.sequences[0]?.steps ?? [])
              ),
            }),
            { signal: controller.signal }
          )
          .then((result) => {
            if (finished || result.type !== "outlines") return;
            if (thisRun !== run) return finish(null);
            chunk.forEach((group, i) => {
              const outline = result.outlines[i];
              if (outline) outlines.set(group.key, outline);
              const drawing = result.paths[i];
              if (drawing) seedMandalaPaths(group.key, drawing);
            });
            made += chunk.length;
            progress = (OUTLINE_SHARE * made) / Math.max(1, groups.length);
            if (made >= groups.length) finish(all());
          })
          .catch(() => {
            if (finished || controller.signal.aborted) return;
            controller.abort();
            finished = true;
            stopGathering = null;
            void gatherInSlices(groups, thisRun).then(resolve);
          });
      }
    });
  }

  /** Every group's outline, made in idle slices; null if the build was dropped. */
  function gatherInSlices(
    groups: readonly MandalaGroup[],
    thisRun: number
  ): Promise<ShapeOutline[] | null> {
    return new Promise((resolve) => {
      const gathered: ShapeOutline[] = [];
      let cancel: (() => void) | null = null;
      stopGathering = () => {
        cancel?.();
        resolve(null);
      };
      const slice = (budgetMs: number): void => {
        cancel = null;
        if (thisRun !== run) return resolve(null);
        const start = now();
        // Each new outline makes the shape's geometry, several milliseconds.
        // At least one per slice, so a slice with no time left still moves on.
        let made = 0;
        while (
          gathered.length < groups.length &&
          (made === 0 || now() - start < budgetMs)
        ) {
          const group = groups[gathered.length]!;
          let outline = outlines.get(group.key);
          if (!outline) {
            outline = outlineOf(group.paths);
            outlines.set(group.key, outline);
          }
          gathered.push(outline);
          made++;
        }
        progress =
          (OUTLINE_SHARE * gathered.length) / Math.max(1, groups.length);
        if (gathered.length < groups.length) cancel = scheduler(slice);
        else {
          stopGathering = null;
          resolve(gathered);
        }
      };
      cancel = scheduler(slice);
    });
  }

  /** Replaces the families in one step. `matrix` is kept; linking gets a copy. */
  function link(groups: readonly MandalaGroup[], matrix: Float32Array): void {
    const tree = linkFamilyTree(groups, matrix.slice());
    land(familiesAt(tree, MANDALA_FAMILY_ALIKE));
  }

  function land(found: readonly MandalaFamily<MandalaGroup>[]): void {
    families = found
      .map((family) => ({
        ...family,
        value: mandalaFamilyValue(family.representative),
      }))
      .sort(climbOrder);
    ready = true;
    progress = 1;
    version++;
  }

  const groupsKey = (groups: readonly MandalaGroup[]) =>
    groups.map((group) => group.key).join("|");
  const countsKey = (groups: readonly MandalaGroup[]) =>
    groups.map((group) => `${group.key}:${group.sequences.length}`).join("|");

  async function build(
    groups: readonly MandalaGroup[],
    thisRun: number,
    signal: AbortSignal
  ): Promise<void> {
    const keys = groups.map((group) => group.key);
    const saved = await loadBook();
    if (thisRun !== run) return;
    const { matrix, missing } = readBook(saved, keys);

    if (missing.length > 0) {
      const gathered = await gatherOutlines(groups, thisRun);
      if (!gathered || thisRun !== run) return;
      let values: Float32Array;
      try {
        values = await measure(
          { outlines: gathered, pairs: missing },
          {
            signal,
            onProgress: (share) => {
              if (thisRun === run)
                progress = OUTLINE_SHARE + MEASURE_SHARE * share;
            },
          }
        );
      } catch {
        // Dropped for a newer pool: that build owns the state now.
        if (thisRun !== run) return;
        // A real failure: each shape stands alone so the screen and the
        // filter still work, and the next notice from the index tries again.
        abort = null;
        buildingKeys = null;
        building = false;
        builtFrom = null;
        land(familiesAt({ shapes: groups, merges: [] }, MANDALA_FAMILY_ALIKE));
        return;
      }
      if (thisRun !== run) return;
      const n = keys.length;
      for (let p = 0; p < values.length; p++) {
        const i = missing[2 * p]!;
        const j = missing[2 * p + 1]!;
        matrix[i * n + j] = values[p]!;
        matrix[j * n + i] = values[p]!;
      }
      book = writeBook(saved, keys, matrix, {
        measure: MANDALA_MEASURE_VERSION,
        family: MANDALA_FAMILY_VERSION,
      });
      void store.save(book);
    }

    abort = null;
    buildingKeys = null;
    building = false;
    const shapes = groupsKey(groups);
    linked = { keys: shapes, matrix };
    // Sequence counts may have moved while measuring; the same shapes link
    // with the latest groups so each family's representative is current.
    const latest = index.groups;
    const fresh = groupsKey(latest) === shapes;
    if (fresh) builtFrom = countsKey(latest);
    link(fresh ? latest : groups, matrix);
  }

  /** Drops any build in flight; the last families keep serving. */
  function abandon(): void {
    run++;
    abort?.abort();
    abort = null;
    stopGathering?.();
    stopGathering = null;
    builtFrom = null;
    buildingKeys = null;
    building = false;
    if (ready) progress = 1;
    else progress = 0;
  }

  function follow(): void {
    if (!index.done && !index.empty) {
      if (buildingKeys !== null) abandon();
      return;
    }
    const groups = index.empty ? [] : index.groups;
    // Sequence counts are part of it: they choose each family's representative.
    const from = countsKey(groups);
    if (from === builtFrom) return;
    const shapes = groupsKey(groups);
    if (buildingKeys === shapes) {
      // Same shapes, new counts: the build in flight links the latest groups.
      builtFrom = from;
      return;
    }
    if (buildingKeys === null && linked?.keys === shapes) {
      builtFrom = from;
      link(groups, linked.matrix);
      return;
    }
    abandon();
    builtFrom = from;
    buildingKeys = shapes;
    building = true;
    const controller = new AbortController();
    abort = controller;
    void build(groups, run, controller.signal);
  }

  index.subscribe(follow);
  follow();

  function resolveKey(value: string): string | undefined {
    const { key, sequenceId } = parseMandalaFamilyValue(value);
    if (key && index.groupOf(key)) return key;
    if (sequenceId) {
      const sequence = index.sequenceById(sequenceId);
      const own = sequence ? peekMandalaKey(sequence) : undefined;
      if (own) return own;
    }
    return key || undefined;
  }

  return {
    get families() {
      return families;
    },
    get ready() {
      return ready;
    },
    get progress() {
      return progress;
    },
    get building() {
      return building;
    },
    get version() {
      return version;
    },
    get fan() {
      // Before families land, picked from the index each time it is read, so
      // it follows the index without the climb holding a copy.
      return ready ? familyFan : spreadOfThree(index.groups);
    },
    familyOf(value) {
      if (!ready) return undefined;
      const key = resolveKey(value);
      return key ? keysByMember.get(key)?.family : undefined;
    },
    keysFor(value) {
      const key = resolveKey(value);
      if (!key) return new Set();
      return (
        (ready ? keysByMember.get(key)?.keys : undefined) ?? new Set([key])
      );
    },
  };
}

/** The app's one climb, beside the one index it follows. */
export const mandalaClimb: MandalaClimb = createMandalaClimb();
