/**
 * Groups the skewed-frame beats of SkewedPictographDataframe.csv for the
 * lettering review page.
 *
 * The frame's opposite-direction letters come in six pairs: M1/M2, N1/N2,
 * O1/O2, P1/P2, Q1/Q2 and R1/R2. On 2026-09-23 one side of each pair was
 * relettered: beats starting 45 degrees apart that pass alpha had been
 * D E F, and beats starting 135 degrees apart that pass beta had been
 * J K L (128 CSV rows). Their partners kept their letters. The page shows
 * each pair together, so a reviewer can check that both halves are the same
 * kind of move, and then every other frame letter.
 */
import { Letter } from "$lib/shared/foundation/domain/models/letter";
import { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
import {
  skewedFrameLetterLabel,
  type SkewFrameHand,
  type SkewFrameLocation,
  type SkewFrameMotionType,
} from "$lib/shared/pictograph/skew/skewed-frame-letter";

export interface ReviewItem {
  readonly id: string;
  readonly label: string;
  readonly pictograph: PictographData;
}

export interface ReviewRow {
  readonly label: string;
  /** The letter these beats had before 2026-09-23, or null when unchanged. */
  readonly previous: string | null;
  readonly note: string;
  readonly items: readonly ReviewItem[];
}

export interface ReviewFamily {
  readonly letter: string;
  /** A diamond beat with the same letter, which this change did not touch. */
  readonly reference: PictographData | null;
  readonly rows: readonly ReviewRow[];
}

export interface ReviewSection {
  readonly title: string;
  readonly rows: readonly ReviewRow[];
}

export interface ReviewChecks {
  readonly frameRows: number;
  readonly changedRows: number;
  /** Any of D E F J K L still used in the frame. Should be empty. */
  readonly retiredLetters: readonly string[];
  /** Rows whose CSV letter differs from the rule's letter. Should be empty. */
  readonly disagreements: readonly string[];
  /** Frame rows the rule gives no letter. Should be zero. */
  readonly unlabelled: number;
}

export interface LetteringReview {
  readonly families: readonly ReviewFamily[];
  readonly others: readonly ReviewSection[];
  readonly checks: ReviewChecks;
}

// Measured by diffing the CSV before and after the change: every M1 N1 O1
// row had been D E F and every P2 Q2 R2 row had been J K L. No other row moved.
const PREVIOUS_LETTER: Readonly<Record<string, string>> = {
  M1: "D",
  N1: "E",
  O1: "F",
  P2: "J",
  Q2: "K",
  R2: "L",
};

const RETIRED_LETTERS = new Set(["D", "E", "F", "J", "K", "L"]);

interface FamilyNote {
  readonly landmark: "alpha" | "beta";
  readonly motions: string;
}

interface StartNote {
  readonly spacing: string;
  readonly alphaAt: string;
  readonly betaAt: string;
}

const FAMILY_NOTES: Readonly<Record<string, FamilyNote>> = {
  M: { landmark: "alpha", motions: "both pro" },
  N: { landmark: "alpha", motions: "both anti" },
  O: { landmark: "alpha", motions: "one pro, one anti" },
  P: { landmark: "beta", motions: "both pro" },
  Q: { landmark: "beta", motions: "both anti" },
  R: { landmark: "beta", motions: "one pro, one anti" },
};

// Each hand shifts 90 degrees the other way from its partner, so the gap
// between the hands changes by 180 degrees over the beat. Starting 45 degrees
// apart, the hands are opposite three quarters of the way through, or together
// a quarter of the way through; starting 135 degrees apart, the other way
// round. On the diamond both moments fall exactly mid-beat. Checked against
// every M to R frame row of the CSV on 2026-09-23: each crosses its landmark
// once, at these fractions.
const START: Readonly<Record<string, StartNote>> = {
  "1": { spacing: "start 45° apart (η)", alphaAt: "¾", betaAt: "¼" },
  "2": { spacing: "start 135° apart (ζ)", alphaAt: "¼", betaAt: "¾" },
};

function familyNote({ landmark, motions }: FamilyNote, { spacing, alphaAt, betaAt }: StartNote): string {
  const crossing =
    landmark === "alpha"
      ? `hands opposite (α) ${alphaAt} of the way through`
      : `hands together (β) ${betaAt} of the way through`;
  return `${crossing} · ${motions} · ${spacing}`;
}

const OTHER_SECTIONS: readonly { title: string; letters: readonly string[] }[] = [
  {
    title: "Type 1, same direction",
    letters: [Letter.S, Letter.T, Letter.U, Letter.V],
  },
  {
    title: "Type 2",
    letters: [
      Letter.W, Letter.X, Letter.Y, Letter.Z,
      Letter.SIGMA, Letter.DELTA, Letter.THETA, Letter.OMEGA,
    ],
  },
  {
    title: "Type 3",
    letters: [
      Letter.W_DASH, Letter.X_DASH, Letter.Y_DASH, Letter.Z_DASH,
      Letter.SIGMA_DASH, Letter.DELTA_DASH, Letter.THETA_DASH, Letter.OMEGA_DASH,
    ],
  },
  { title: "Type 4", letters: [Letter.PHI, Letter.PSI] },
  { title: "Type 5", letters: [Letter.PHI_DASH, Letter.PSI_DASH] },
  { title: "Type 6", letters: [Letter.ZETA, Letter.ETA] },
];

function isFrameBeat(pictograph: PictographData): boolean {
  return /^(zeta|eta)\d+$/.test(pictograph.startPlacement ?? "");
}

function frameHand(pictograph: PictographData, side: HandSide): SkewFrameHand | null {
  const motion = pictograph.motions[side];
  if (!motion) return null;
  return {
    motionType: motion.motionType as SkewFrameMotionType,
    startLocation: motion.startLocation as SkewFrameLocation,
    endLocation: motion.endLocation as SkewFrameLocation,
  };
}

/** The rule's label for a frame beat, with its number (M1, S2, W). */
function frameLabel(pictograph: PictographData): string | null {
  const left = frameHand(pictograph, HandSide.LEFT);
  const right = frameHand(pictograph, HandSide.RIGHT);
  if (!left || !right) return null;
  return skewedFrameLetterLabel({ left, right });
}

/** "M1" to "M", "Θ1-" to "Θ-". */
function letterOf(label: string): string {
  return label.replace(/\d+/g, "");
}

function numberOf(label: string): number {
  return Number(label.match(/\d+/)?.[0] ?? 0);
}

export function buildLetteringReview(
  skewed: readonly PictographData[],
  diamond: readonly PictographData[]
): LetteringReview {
  const byLabel = new Map<string, PictographData[]>();
  const retired = new Set<string>();
  const disagreements: string[] = [];
  let frameRows = 0;
  let unlabelled = 0;

  for (const pictograph of skewed) {
    if (!isFrameBeat(pictograph)) continue;
    frameRows++;
    const csvLetter = String(pictograph.letter ?? "");
    if (RETIRED_LETTERS.has(csvLetter)) retired.add(csvLetter);
    const label = frameLabel(pictograph);
    if (label === null) {
      unlabelled++;
      continue;
    }
    if (letterOf(label) !== csvLetter) {
      disagreements.push(
        `${pictograph.startPlacement} to ${pictograph.endPlacement}: CSV ${csvLetter}, rule ${label}`
      );
    }
    const members = byLabel.get(label) ?? [];
    members.push(pictograph);
    byLabel.set(label, members);
  }

  const row = (label: string, note: string): ReviewRow => ({
    label,
    previous: PREVIOUS_LETTER[label] ?? null,
    note,
    items: (byLabel.get(label) ?? []).map((pictograph, index) => ({
      id: `${label}-${index + 1}`,
      label,
      pictograph,
    })),
  });

  const families: ReviewFamily[] = Object.entries(FAMILY_NOTES).map(([letter, family]) => ({
    letter,
    reference: diamond.find((p) => String(p.letter) === letter) ?? null,
    rows: Object.entries(START).map(([n, start]) => row(`${letter}${n}`, familyNote(family, start))),
  }));

  const others: ReviewSection[] = OTHER_SECTIONS.map(({ title, letters }) => ({
    title,
    rows: letters.flatMap((letter) =>
      [...byLabel.keys()]
        .filter((label) => letterOf(label) === letter)
        .sort((a, b) => numberOf(a) - numberOf(b))
        .map((label) => row(label, ""))
    ),
  }));

  // A label no section expects would otherwise vanish from the page.
  const shown = new Set(
    [...families.flatMap((f) => f.rows), ...others.flatMap((s) => s.rows)].map(
      (r) => r.label
    )
  );
  const unexpected = [...byLabel.keys()].filter((label) => !shown.has(label));
  if (unexpected.length > 0) {
    others.push({
      title: "Not in the frame alphabet",
      rows: unexpected.map((label) => row(label, "")),
    });
  }

  const changedRows = families
    .flatMap((family) => family.rows)
    .filter((r) => r.previous !== null)
    .reduce((sum, r) => sum + r.items.length, 0);

  return {
    families,
    others,
    checks: {
      frameRows,
      changedRows,
      retiredLetters: [...retired].sort(),
      disagreements,
      unlabelled,
    },
  };
}
