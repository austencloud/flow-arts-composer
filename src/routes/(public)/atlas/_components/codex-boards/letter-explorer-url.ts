import type { TurnValue } from "#lib/shared/create/domain/turn-pattern-data.js";
import {
  RotationDirection,
  type RotationDirection as RotationDirectionValue,
} from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import {
  GridMode,
  type GridMode as GridModeValue,
} from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";

/** The turns and spin each hand is set to, apart from which letter shows. */
export interface LetterExplorerEdits {
  leftTurns: TurnValue;
  rightTurns: TurnValue;
  leftRotation: RotationDirectionValue;
  rightRotation: RotationDirectionValue;
}

export interface LetterExplorerRouteState extends LetterExplorerEdits {
  letter: string;
  gridMode: GridModeValue;
  variation: number;
  /** The explorer's transforms as their URL value (letter-explorer-transforms.ts). */
  transforms?: string | null;
}

const CANONICAL_LETTER_EXPLORER_PATH = "/codex";

export const LETTER_EXPLORER_PARAMS = [
  "letter",
  "grid",
  "variation",
  "leftTurns",
  "rightTurns",
  "leftRotation",
  "rightRotation",
  "xf",
  // Published links may still carry the legacy palette-keyed names.
  "blueTurns",
  "redTurns",
  "blueRotation",
  "redRotation",
] as const;

function parseTurn(value: string | null): TurnValue {
  if (value === "fl") return "fl";
  const numeric = Number(value);
  if (
    Number.isFinite(numeric) &&
    numeric >= 0 &&
    numeric <= 3 &&
    numeric * 2 === Math.round(numeric * 2)
  ) {
    return numeric;
  }
  return 0;
}

function parseRotation(value: string | null): RotationDirectionValue {
  return value === RotationDirection.COUNTER_CLOCKWISE
    ? RotationDirection.COUNTER_CLOCKWISE
    : RotationDirection.CLOCKWISE;
}

export function parseLetterExplorerEdits(
  searchParams: URLSearchParams
): LetterExplorerEdits {
  return {
    leftTurns: parseTurn(
      searchParams.get("leftTurns") ?? searchParams.get("blueTurns")
    ),
    rightTurns: parseTurn(
      searchParams.get("rightTurns") ?? searchParams.get("redTurns")
    ),
    leftRotation: parseRotation(
      searchParams.get("leftRotation") ?? searchParams.get("blueRotation")
    ),
    rightRotation: parseRotation(
      searchParams.get("rightRotation") ?? searchParams.get("redRotation")
    ),
  };
}

export function parseLetterExplorerRoute(
  searchParams: URLSearchParams,
  allowedLetters: ReadonlySet<string>
): LetterExplorerRouteState | null {
  const letter = searchParams.get("letter");
  if (!letter || !allowedLetters.has(letter)) return null;

  const rawVariation = Number(searchParams.get("variation"));
  const variation =
    Number.isInteger(rawVariation) && rawVariation >= 0 ? rawVariation : 0;

  return {
    letter,
    gridMode:
      searchParams.get("grid") === GridMode.BOX
        ? GridMode.BOX
        : GridMode.DIAMOND,
    variation,
    transforms: searchParams.get("xf"),
    ...parseLetterExplorerEdits(searchParams),
  };
}

export function writeLetterExplorerRoute(
  url: URL,
  state: LetterExplorerRouteState | null
): void {
  for (const parameter of LETTER_EXPLORER_PARAMS) {
    url.searchParams.delete(parameter);
  }

  if (!state) return;

  url.searchParams.set("letter", state.letter);
  url.searchParams.set("grid", state.gridMode);
  url.searchParams.set("variation", String(state.variation));
  if (state.transforms) url.searchParams.set("xf", state.transforms);
  writeLetterExplorerEdits(url, state);
}

/**
 * Write only the turns and spin, leaving no letter open. The Codex board
 * follows these too, so they outlive the explorer there.
 */
export function writeLetterExplorerEdits(
  url: URL,
  edits: LetterExplorerEdits | null
): void {
  for (const parameter of [
    "leftTurns",
    "rightTurns",
    "leftRotation",
    "rightRotation",
    "blueTurns",
    "redTurns",
    "blueRotation",
    "redRotation",
  ]) {
    url.searchParams.delete(parameter);
  }
  if (!edits) return;
  if (edits.leftTurns !== 0) {
    url.searchParams.set("leftTurns", String(edits.leftTurns));
    url.searchParams.set("leftRotation", edits.leftRotation);
  }
  if (edits.rightTurns !== 0) {
    url.searchParams.set("rightTurns", String(edits.rightTurns));
    url.searchParams.set("rightRotation", edits.rightRotation);
  }
}

/**
 * Stable entry point for an unedited dataframe letter, on the Codex page.
 * Atlas type lists use this same route contract as the explorer instead of
 * assembling a second URL shape that can drift from the share-link behavior.
 */
export function buildCanonicalLetterExplorerHref(letter: string): string {
  const url = new URL(
    CANONICAL_LETTER_EXPLORER_PATH,
    "https://tkaflowarts.com"
  );
  writeLetterExplorerRoute(url, {
    letter,
    gridMode: GridMode.DIAMOND,
    variation: 0,
    leftTurns: 0,
    rightTurns: 0,
    leftRotation: RotationDirection.CLOCKWISE,
    rightRotation: RotationDirection.CLOCKWISE,
  });
  return `${url.pathname}${url.search}${url.hash}`;
}

export function hasLetterExplorerEdits(state: LetterExplorerEdits): boolean {
  return state.leftTurns !== 0 || state.rightTurns !== 0;
}
