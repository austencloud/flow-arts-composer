/**
 * The Browse ask screen's rules: which length tiles show, how the starting
 * letters fall into rows, and what the main button says.
 *
 * Pure and framework-free so the rules the eye cannot check (which seven
 * lengths, which row a letter lands in, the button's count) are tested
 * directly. The screen itself (GalleryAskScreen.svelte) composes these with
 * the gallery catalog's values and the drill's filter bindings.
 */
import {
  getLetterType,
  type Letter,
} from "#lib/shared/foundation/domain/models/letter.js";
import { LetterType } from "#lib/shared/foundation/domain/models/letter-type.js";

/** The ask screen's two questions. */
export type AskQuestion = "length" | "letter";

/** At most this many length tiles; past it the last tile is "Other". */
export const MAX_LENGTH_TILES = 8;
/** The letter grid's column count (Wren's placement note). */
export const LETTER_COLUMNS = 8;

export interface LengthOption {
  value: number;
  count: number;
}

export type LengthTile =
  | { kind: "length"; value: number; count: number }
  /** Opens the full length editor. `chosen` carries the applied length when
   * it is not one of the tiles shown. */
  | { kind: "other"; count: number; chosen: number | null };

/**
 * The length tiles. Eight or fewer distinct lengths: all of them, ascending.
 * More: the seven with the most sequences in the whole pool (`poolCounts`),
 * ascending, then Other. Ranking by the pool keeps the tiles still while the
 * other answer changes the live counts; each tile still shows its live count.
 */
export function pickLengthTiles(
  options: readonly LengthOption[],
  poolCounts: ReadonlyMap<number, number>,
  chosen: number | null
): LengthTile[] {
  const ascending = [...options].sort((a, b) => a.value - b.value);
  if (ascending.length <= MAX_LENGTH_TILES) {
    return ascending.map((o) => ({ kind: "length", ...o }));
  }
  const shown = new Set(
    [...ascending]
      .sort(
        (a, b) =>
          (poolCounts.get(b.value) ?? 0) - (poolCounts.get(a.value) ?? 0) ||
          a.value - b.value
      )
      .slice(0, MAX_LENGTH_TILES - 1)
      .map((o) => o.value)
  );
  const tiles: LengthTile[] = ascending
    .filter((o) => shown.has(o.value))
    .map((o) => ({ kind: "length", ...o }));
  const rest = ascending.filter((o) => !shown.has(o.value));
  tiles.push({
    kind: "other",
    count: rest.reduce((sum, o) => sum + o.count, 0),
    chosen: chosen !== null && !shown.has(chosen) ? chosen : null,
  });
  return tiles;
}

/**
 * Starting letters in rows of eight, one block per letter type so W sits over
 * W-: Type 1 (A to V, wrapping), Type 2, Type 3, then Types 4 to 6 together
 * (Φ Ψ Λ, their dash forms, α β Γ). Each block starts a new row. Letters keep
 * the order they arrive in (the catalog's kinetic-alphabet order). A letter
 * the type table does not know joins the last block.
 */
export function letterRows<T extends { value: string }>(
  letters: readonly T[]
): T[][] {
  const blocks: T[][] = [[], [], [], []];
  for (const letter of letters) blocks[letterBlock(letter.value)]!.push(letter);
  const rows: T[][] = [];
  for (const block of blocks) {
    for (let i = 0; i < block.length; i += LETTER_COLUMNS) {
      rows.push(block.slice(i, i + LETTER_COLUMNS));
    }
  }
  return rows;
}

function letterBlock(letter: string): number {
  let type: LetterType;
  try {
    type = getLetterType(letter as Letter);
  } catch {
    return 3;
  }
  if (type === LetterType.TYPE1) return 0;
  if (type === LetterType.TYPE2) return 1;
  if (type === LetterType.TYPE3) return 2;
  return 3;
}

/** A letter with this few sequences draws dimmer where counts are hidden. */
export const FEW_SEQUENCES = 5;

export function isFewLetter(count: number): boolean {
  return count > 0 && count <= FEW_SEQUENCES;
}

export type AskButtonLabel =
  | { key: "browse_ask_show_all"; count: number }
  | { key: "browse_ask_show_one" }
  | { key: "browse_ask_show_count"; count: number };

/** The main button: "Show all N" with nothing chosen, else "Show N". */
export function askButtonLabel(
  resultCount: number,
  answered: boolean
): { label: AskButtonLabel; disabled: boolean } {
  const label: AskButtonLabel = !answered
    ? { key: "browse_ask_show_all", count: resultCount }
    : resultCount === 1
      ? { key: "browse_ask_show_one" }
      : { key: "browse_ask_show_count", count: resultCount };
  return { label, disabled: resultCount === 0 };
}

/**
 * One answer per question. Tapping the chosen value clears it; tapping
 * another replaces it.
 */
export function answerTap<V>(
  current: V | null,
  tapped: V
): { action: "clear" } | { action: "replace"; value: V } {
  return current === tapped
    ? { action: "clear" }
    : { action: "replace", value: tapped };
}

/**
 * The value the visitor chose for one question, read from the engine's
 * filters. Host-locked filters (a pile's scope) are not answers.
 */
export function appliedAnswer(
  filters: ReadonlyMap<
    string,
    { type: unknown; value: unknown; locked: boolean }
  >,
  type: unknown
): string | number | null {
  for (const f of filters.values()) {
    if (f.type === type && !f.locked) return f.value as string | number;
  }
  return null;
}

/**
 * Whether the ask screen's counts are on screen, so the boot screen may
 * leave. The engine reports "not loading" before its load has begun, so that
 * alone is not enough: the load must have been seen in progress, or the pool
 * must already hold sequences.
 */
export function countsAreReady(
  loading: boolean,
  loadSeen: boolean,
  poolSize: number
): boolean {
  return !loading && (loadSeen || poolSize > 0);
}
