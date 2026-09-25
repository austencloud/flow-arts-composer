/**
 * The multigrid rule must reproduce the diamond dataframe row for row and the
 * approved catalog of every grid class for class, including the variant
 * numbers. The catalogs are the tables in
 * docs/superpowers/specs/2026-09-22-multigrid-lettering-design.md.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  gridBeats,
  LETTER_GRIDS,
  letterLabelOnGrid,
  letterOnGrid,
  letterStartSpacings,
  type GridBeat,
  type GridHand,
  type GridMotionType,
  type LetterGrid,
} from "../multigrid-lettering";

type GridName = keyof typeof LETTER_GRIDS;
const GRID_NAMES = Object.keys(LETTER_GRIDS) as GridName[];

const hand = (motionType: GridMotionType, start: number, end: number): GridHand => ({
  motionType,
  start,
  end,
});
const beat = (blue: GridHand, red: GridHand): GridBeat => ({ blue, red });

const shifts = (h: GridHand) => h.motionType === "pro" || h.motionType === "anti";
const isType1To3 = (b: GridBeat) => shifts(b.blue) || shifts(b.red);
const mod = (value: number, modulus: number) => ((value % modulus) + modulus) % modulus;

interface Symmetry {
  readonly turn: number;
  readonly mirror: boolean;
  readonly swap: boolean;
}

// Rotating, mirroring (which reverses travel) or swapping blue and red never
// changes what a beat looks like, so it must never change its letter.
function transform(grid: LetterGrid, b: GridBeat, { turn, mirror, swap }: Symmetry): GridBeat {
  const place = (point: number) => mod((mirror ? -point : point) + turn, grid.points);
  const move = (h: GridHand) => hand(h.motionType, place(h.start), place(h.end));
  return swap ? beat(move(b.red), move(b.blue)) : beat(move(b.blue), move(b.red));
}

function symmetries(grid: LetterGrid): Symmetry[] {
  const all: Symmetry[] = [];
  for (let turn = 0; turn < grid.points; turn++) {
    for (const mirror of [false, true]) {
      for (const swap of [false, true]) all.push({ turn, mirror, swap });
    }
  }
  return all;
}

const beatKey = (b: GridBeat) =>
  [b.blue, b.red].map((h) => `${h.motionType}:${h.start}>${h.end}`).join("|");

/** The same key for every beat that a rotation, mirror or blue/red swap turns into another. */
function classKey(grid: LetterGrid, b: GridBeat): string {
  return symmetries(grid)
    .map((s) => beatKey(transform(grid, b, s)))
    .sort()[0]!;
}

/** One representative beat per Type 1 to 3 class, as the spec counts them. */
function classes(grid: LetterGrid): GridBeat[] {
  const seen = new Set<string>();
  const representatives: GridBeat[] = [];
  for (const b of gridBeats(grid)) {
    if (!isType1To3(b)) continue;
    const key = classKey(grid, b);
    if (seen.has(key)) continue;
    seen.add(key);
    representatives.push(b);
  }
  return representatives;
}

// One beat from every Type 1 to 3 class, with the label the spec's catalog
// gives that class. The table is the output of
//   python scripts/notation/multigrid-lettering-census.py --members
// The census letters the grids with its own implementation of the rule, so
// matching it checks the app against a second, independent reading. Each line
// is the label, the blue hand, the red hand, and after the # the census's
// description of the class.
const CLASS_MEMBERS: Record<GridName, string> = {
  trigrid: `
    G    pro 0>1    pro 0>1    # 0 to 0
    H    anti 0>1   anti 0>1   # 0 to 0
    I    pro 0>1    anti 0>1   # 0 to 0
    S    pro 0>1    pro 1>2    # 120 to 120
    T    anti 0>1   anti 1>2   # 120 to 120
    U    anti 0>1   pro 1>2    # 120 to 120, pro leads
    V    pro 0>1    anti 1>2   # 120 to 120, anti leads
    D    pro 0>1    pro 0>2    # 0 to 120 through alpha
    E    anti 0>1   anti 0>2   # 0 to 120 through alpha
    F    pro 0>1    anti 0>2   # 0 to 120 through alpha
    J    pro 0>2    pro 1>2    # 120 to 0 through alpha
    K    anti 0>2   anti 1>2   # 120 to 0 through alpha
    L    pro 0>2    anti 1>2   # 120 to 0 through alpha
    P    pro 0>1    pro 1>0    # 120 to 120 through beta
    Q    anti 0>1   anti 1>0   # 120 to 120 through beta
    R    pro 0>1    anti 1>0   # 120 to 120 through beta
    W    static 0>0 pro 1>2    # 120 to 120 through alpha
    X    static 0>0 anti 1>2   # 120 to 120 through alpha
    Y    static 0>0 pro 1>0    # 120 to 0
    Z    static 0>0 anti 1>0   # 120 to 0
    Θ    static 0>0 pro 0>1    # 0 to 120
    Ω    static 0>0 anti 0>1   # 0 to 120
  `,
  diamond: `
    A    pro 0>1    pro 2>3    # 180 to 180
    B    anti 0>1   anti 2>3   # 180 to 180
    C    pro 0>1    anti 2>3   # 180 to 180
    G    pro 0>1    pro 0>1    # 0 to 0
    H    anti 0>1   anti 0>1   # 0 to 0
    I    pro 0>1    anti 0>1   # 0 to 0
    S    pro 0>1    pro 1>2    # 90 to 90
    T    anti 0>1   anti 1>2   # 90 to 90
    U    anti 0>1   pro 1>2    # 90 to 90, pro leads
    V    pro 0>1    anti 1>2   # 90 to 90, anti leads
    D    pro 0>1    pro 0>3    # 0 to 180
    E    anti 0>1   anti 0>3   # 0 to 180
    F    pro 0>1    anti 0>3   # 0 to 180
    J    pro 0>1    pro 2>1    # 180 to 0
    K    anti 0>1   anti 2>1   # 180 to 0
    L    pro 0>1    anti 2>1   # 180 to 0
    M    pro 0>3    pro 1>2    # 90 to 90 through alpha
    N    anti 0>3   anti 1>2   # 90 to 90 through alpha
    O    pro 0>3    anti 1>2   # 90 to 90 through alpha
    P    pro 0>1    pro 1>0    # 90 to 90 through beta
    Q    anti 0>1   anti 1>0   # 90 to 90 through beta
    R    pro 0>1    anti 1>0   # 90 to 90 through beta
    W    static 0>0 pro 1>2    # 90 to 180
    X    static 0>0 anti 1>2   # 90 to 180
    Y    static 0>0 pro 1>0    # 90 to 0
    Z    static 0>0 anti 1>0   # 90 to 0
    Σ    static 0>0 pro 2>3    # 180 to 90
    Δ    static 0>0 anti 2>3   # 180 to 90
    Θ    static 0>0 pro 0>1    # 0 to 90
    Ω    static 0>0 anti 0>1   # 0 to 90
    W-   pro 0>1    dash 1>3   # 90 to 180
    X-   anti 0>1   dash 1>3   # 90 to 180
    Y-   pro 0>3    dash 1>3   # 90 to 0
    Z-   anti 0>3   dash 1>3   # 90 to 0
    Σ-   pro 0>1    dash 0>2   # 180 to 90
    Δ-   anti 0>1   dash 0>2   # 180 to 90
    Θ-   pro 0>1    dash 2>0   # 0 to 90
    Ω-   anti 0>1   dash 2>0   # 0 to 90
  `,
  pentagrid: `
    G    pro 0>1    pro 0>1    # 0 to 0
    H    anti 0>1   anti 0>1   # 0 to 0
    I    pro 0>1    anti 0>1   # 0 to 0
    S1   pro 0>1    pro 1>2    # 72 to 72
    S2   pro 0>1    pro 2>3    # 144 to 144
    T1   anti 0>1   anti 1>2   # 72 to 72
    T2   anti 0>1   anti 2>3   # 144 to 144
    U1   anti 0>1   pro 1>2    # 72 to 72, pro leads
    U2   anti 0>1   pro 2>3    # 144 to 144, pro leads
    V1   pro 0>1    anti 1>2   # 72 to 72, anti leads
    V2   pro 0>1    anti 2>3   # 144 to 144, anti leads
    D    pro 0>1    pro 0>4    # 0 to 144
    E    anti 0>1   anti 0>4   # 0 to 144
    F    pro 0>1    anti 0>4   # 0 to 144
    J    pro 0>1    pro 2>1    # 144 to 0
    K    anti 0>1   anti 2>1   # 144 to 0
    L    pro 0>1    anti 2>1   # 144 to 0
    M1   pro 0>4    pro 1>2    # 72 to 144 through alpha
    M2   pro 0>4    pro 2>3    # 144 to 72 through alpha
    N1   anti 0>4   anti 1>2   # 72 to 144 through alpha
    N2   anti 0>4   anti 2>3   # 144 to 72 through alpha
    O1   pro 0>4    anti 1>2   # 72 to 144 through alpha
    O2   pro 0>4    anti 2>3   # 144 to 72 through alpha
    P    pro 0>1    pro 1>0    # 72 to 72 through beta
    Q    anti 0>1   anti 1>0   # 72 to 72 through beta
    R    pro 0>1    anti 1>0   # 72 to 72 through beta
    W    static 0>0 pro 2>3    # 144 to 144 through alpha
    X    static 0>0 anti 2>3   # 144 to 144 through alpha
    Y    static 0>0 pro 1>0    # 72 to 0
    Z    static 0>0 anti 1>0   # 72 to 0
    Σ    static 0>0 pro 2>1    # 144 to 72
    Δ    static 0>0 anti 2>1   # 144 to 72
    Θ1   static 0>0 pro 0>1    # 0 to 72
    Θ2   static 0>0 pro 1>2    # 72 to 144
    Ω1   static 0>0 anti 0>1   # 0 to 72
    Ω2   static 0>0 anti 1>2   # 72 to 144
  `,
  skewedDiamond: `
    S1   pro 0>2    pro 1>3    # 45 to 45
    S2   pro 0>2    pro 3>5    # 135 to 135
    T1   anti 0>2   anti 1>3   # 45 to 45
    T2   anti 0>2   anti 3>5   # 135 to 135
    U1   anti 0>2   pro 1>3    # 45 to 45, pro leads
    U2   anti 0>2   pro 3>5    # 135 to 135, pro leads
    V1   pro 0>2    anti 1>3   # 45 to 45, anti leads
    V2   pro 0>2    anti 3>5   # 135 to 135, anti leads
    M1   pro 0>6    pro 1>3    # 45 to 135 through alpha
    M2   pro 0>6    pro 3>5    # 135 to 45 through alpha
    N1   anti 0>6   anti 1>3   # 45 to 135 through alpha
    N2   anti 0>6   anti 3>5   # 135 to 45 through alpha
    O1   pro 0>6    anti 1>3   # 45 to 135 through alpha
    O2   pro 0>6    anti 3>5   # 135 to 45 through alpha
    P1   pro 0>2    pro 1>7    # 45 to 135 through beta
    P2   pro 0>2    pro 3>1    # 135 to 45 through beta
    Q1   anti 0>2   anti 1>7   # 45 to 135 through beta
    Q2   anti 0>2   anti 3>1   # 135 to 45 through beta
    R1   pro 0>2    anti 1>7   # 45 to 135 through beta
    R2   pro 0>2    anti 3>1   # 135 to 45 through beta
    W    static 0>0 pro 3>5    # 135 to 135 through alpha
    X    static 0>0 anti 3>5   # 135 to 135 through alpha
    Y    static 0>0 pro 1>7    # 45 to 45 through beta
    Z    static 0>0 anti 1>7   # 45 to 45 through beta
    Σ    static 0>0 pro 3>1    # 135 to 45
    Δ    static 0>0 anti 3>1   # 135 to 45
    Θ    static 0>0 pro 1>3    # 45 to 135
    Ω    static 0>0 anti 1>3   # 45 to 135
    W-   pro 0>2    dash 1>5   # 135 to 135 through alpha
    X-   anti 0>2   dash 1>5   # 135 to 135 through alpha
    Y-   pro 0>6    dash 3>7   # 45 to 45 through beta
    Z-   anti 0>6   dash 3>7   # 45 to 45 through beta
    Σ-   pro 0>6    dash 1>5   # 135 to 45
    Δ-   anti 0>6   dash 1>5   # 135 to 45
    Θ-   pro 0>2    dash 3>7   # 45 to 135
    Ω-   anti 0>2   dash 3>7   # 45 to 135
  `,
  skewedPentagrid: `
    A    pro 0>2    pro 5>7    # 180 to 180
    B    anti 0>2   anti 5>7   # 180 to 180
    C    pro 0>2    anti 5>7   # 180 to 180
    S1   pro 0>2    pro 1>3    # 36 to 36
    S2   pro 0>2    pro 3>5    # 108 to 108
    T1   anti 0>2   anti 1>3   # 36 to 36
    T2   anti 0>2   anti 3>5   # 108 to 108
    U1   anti 0>2   pro 1>3    # 36 to 36, pro leads
    U2   anti 0>2   pro 3>5    # 108 to 108, pro leads
    V1   pro 0>2    anti 1>3   # 36 to 36, anti leads
    V2   pro 0>2    anti 3>5   # 108 to 108, anti leads
    D    pro 0>8    pro 1>3    # 36 to 180
    E    anti 0>8   anti 1>3   # 36 to 180
    F    pro 0>8    anti 1>3   # 36 to 180
    J    pro 0>2    pro 5>3    # 180 to 36
    K    anti 0>2   anti 5>3   # 180 to 36
    L    pro 0>2    anti 5>3   # 180 to 36
    M    pro 0>8    pro 3>5    # 108 to 108 through alpha
    N    anti 0>8   anti 3>5   # 108 to 108 through alpha
    O    pro 0>8    anti 3>5   # 108 to 108 through alpha
    P1   pro 0>2    pro 1>9    # 36 to 108 through beta
    P2   pro 0>2    pro 3>1    # 108 to 36 through beta
    Q1   anti 0>2   anti 1>9   # 36 to 108 through beta
    Q2   anti 0>2   anti 3>1   # 108 to 36 through beta
    R1   pro 0>2    anti 1>9   # 36 to 108 through beta
    R2   pro 0>2    anti 3>1   # 108 to 36 through beta
    W    static 0>0 pro 3>5    # 108 to 180
    X    static 0>0 anti 3>5   # 108 to 180
    Y    static 0>0 pro 1>9    # 36 to 36 through beta
    Z    static 0>0 anti 1>9   # 36 to 36 through beta
    Σ1   static 0>0 pro 3>1    # 108 to 36
    Σ2   static 0>0 pro 5>7    # 180 to 108
    Δ1   static 0>0 anti 3>1   # 108 to 36
    Δ2   static 0>0 anti 5>7   # 180 to 108
    Θ    static 0>0 pro 1>3    # 36 to 108
    Ω    static 0>0 anti 1>3   # 36 to 108
    W-   pro 0>2    dash 1>6   # 144 to 144 through alpha
    X-   anti 0>2   dash 1>6   # 144 to 144 through alpha
    Y-   pro 0>8    dash 3>8   # 72 to 0
    Z-   anti 0>8   dash 3>8   # 72 to 0
    Σ-   pro 0>8    dash 1>6   # 144 to 72
    Δ-   anti 0>8   dash 1>6   # 144 to 72
    Θ1-  pro 0>2    dash 5>0   # 0 to 72
    Θ2-  pro 0>2    dash 3>8   # 72 to 144
    Ω1-  anti 0>2   dash 5>0   # 0 to 72
    Ω2-  anti 0>2   dash 3>8   # 72 to 144
  `,
};

interface Member {
  readonly label: string;
  readonly beat: GridBeat;
}

function parseMembers(table: string): Member[] {
  // A hand reads "pro 0>1": its motion type, then the points it starts and ends on.
  const parseHand = (motionType: string, move: string) => {
    const [start, end] = move.split(">").map(Number);
    return hand(motionType as GridMotionType, start!, end!);
  };
  return table
    .split("\n")
    .map((line) => line.replace(/#.*/, "").trim())
    .filter((line) => line)
    .map((line) => {
      const [label, blueType, blueMove, redType, redMove] = line.split(/\s+/);
      return {
        label: label!,
        beat: beat(parseHand(blueType!, blueMove!), parseHand(redType!, redMove!)),
      };
    });
}

describe("the diamond", () => {
  const csvPath = resolve(
    __dirname,
    "../../../../../../static/data/pictographs/DiamondPictographDataframe.csv"
  );
  const lines = readFileSync(csvPath, "utf8")
    .split("\n")
    .filter((line) => line.trim());
  const header = lines[0]!.split(",");
  const rows = lines.slice(1).map((line) => {
    const values = line.split(",");
    return Object.fromEntries(header.map((key, index) => [key, values[index]!.trim()]));
  });
  const POINT: Record<string, number> = { n: 0, e: 1, s: 2, w: 3 };
  const rowHand = (row: Record<string, string>, color: "blue" | "red") =>
    hand(
      row[`${color}MotionType`] as GridMotionType,
      POINT[row[`${color}StartLocation`]!]!,
      POINT[row[`${color}EndLocation`]!]!
    );

  it("letters all 512 Type 1 to 3 rows of DiamondPictographDataframe.csv as the dataframe does", () => {
    let checked = 0;
    for (const row of rows) {
      const b = beat(rowHand(row, "blue"), rowHand(row, "red"));
      if (!isType1To3(b)) continue;
      checked++;
      expect(letterOnGrid(LETTER_GRIDS.diamond, b), JSON.stringify(row)).toBe(row.letter);
    }
    expect(checked).toBe(512);
  });
});

describe.each(GRID_NAMES)("the %s", (name) => {
  const grid = LETTER_GRIDS[name];

  // With the symmetry test below, this fixes the label of every beat in every class.
  it("gives each class the label the census gives it", () => {
    const members = parseMembers(CLASS_MEMBERS[name]);
    const memberClasses = members.map((m) => classKey(grid, m.beat));
    expect(new Set(memberClasses).size, "one line per class").toBe(members.length);
    expect(memberClasses.sort()).toEqual(classes(grid).map((b) => classKey(grid, b)).sort());
    for (const { label, beat: b } of members) {
      expect(letterLabelOnGrid(grid, b), beatKey(b)).toBe(label);
    }
  });

  it("letters every Type 1 to 3 beat, and nothing else", () => {
    for (const b of gridBeats(grid)) {
      const letter = letterOnGrid(grid, b);
      if (isType1To3(b)) expect(letter, beatKey(b)).not.toBeNull();
      else expect(letter, beatKey(b)).toBeNull();
    }
  });

  it("keeps the letter under rotation, mirror and blue/red swap", () => {
    const generators: Symmetry[] = [
      { turn: 1, mirror: false, swap: false },
      { turn: 0, mirror: true, swap: false },
      { turn: 0, mirror: false, swap: true },
    ];
    for (const b of gridBeats(grid)) {
      if (!isType1To3(b)) continue;
      for (const s of generators) {
        expect(letterLabelOnGrid(grid, transform(grid, b, s)), beatKey(b)).toBe(
          letterLabelOnGrid(grid, b)
        );
      }
    }
  });

  it("swaps D E F with J K L and keeps M N O and P Q R when a beat runs backwards", () => {
    const reversed: Record<string, string> = {
      D: "J", E: "K", F: "L", J: "D", K: "E", L: "F",
      M: "M", N: "N", O: "O", P: "P", Q: "Q", R: "R",
    };
    let opposite = 0;
    for (const b of gridBeats(grid)) {
      if (!shifts(b.blue) || !shifts(b.red)) continue;
      const blueTravel = mod(b.blue.end - b.blue.start, grid.points);
      const redTravel = mod(b.red.end - b.red.start, grid.points);
      if (blueTravel === redTravel) continue;
      opposite++;
      const backwards = beat(
        hand(b.blue.motionType, b.blue.end, b.blue.start),
        hand(b.red.motionType, b.red.end, b.red.start)
      );
      expect(letterOnGrid(grid, backwards), beatKey(b)).toBe(reversed[letterOnGrid(grid, b)!]);
    }
    expect(opposite).toBeGreaterThan(0);
  });
});

describe("variant numbers", () => {
  const { pentagrid, skewedDiamond, skewedPentagrid, trigrid, diamond } = LETTER_GRIDS;

  it.each<[string, LetterGrid, GridBeat]>([
    // Same direction, 72 and 144 apart.
    ["S1", pentagrid, beat(hand("pro", 0, 1), hand("pro", 1, 2))],
    ["S2", pentagrid, beat(hand("pro", 0, 1), hand("pro", 2, 3))],
    // Opposite direction through alpha, from 72 and from 144.
    ["M1", pentagrid, beat(hand("pro", 4, 3), hand("pro", 0, 1))],
    ["M2", pentagrid, beat(hand("pro", 4, 3), hand("pro", 1, 2))],
    // One hand still: widening from 0 and from 72.
    ["Θ1", pentagrid, beat(hand("static", 3, 3), hand("pro", 3, 2))],
    ["Θ2", pentagrid, beat(hand("static", 0, 0), hand("pro", 1, 2))],
    // Skewed diamond: 1 from eta (45), 2 from zeta (135).
    ["S1", skewedDiamond, beat(hand("pro", 0, 2), hand("pro", 1, 3))],
    ["S2", skewedDiamond, beat(hand("pro", 0, 2), hand("pro", 3, 5))],
    ["M1", skewedDiamond, beat(hand("pro", 0, 6), hand("pro", 1, 3))],
    ["M2", skewedDiamond, beat(hand("pro", 0, 6), hand("pro", 3, 5))],
    ["P1", skewedDiamond, beat(hand("pro", 0, 2), hand("pro", 1, 7))],
    ["P2", skewedDiamond, beat(hand("pro", 0, 2), hand("pro", 3, 1))],
    // A dash counts where it ends; the number goes before the dash.
    ["Θ1-", skewedPentagrid, beat(hand("dash", 6, 1), hand("pro", 1, 3))],
    ["Θ2-", skewedPentagrid, beat(hand("dash", 4, 9), hand("pro", 1, 3))],
    ["Σ2", skewedPentagrid, beat(hand("static", 5, 5), hand("pro", 0, 2))],
  ])("labels %s", (label, grid, b) => {
    expect(letterLabelOnGrid(grid, b)).toBe(label);
  });

  it("numbers nothing on the trigrid or the diamond", () => {
    for (const grid of [trigrid, diamond]) {
      for (const spacings of letterStartSpacings(grid).values()) expect(spacings).toHaveLength(1);
    }
  });

  it("lists start spacings narrowest first", () => {
    expect(letterStartSpacings(pentagrid).get("S")).toEqual([72, 144]);
    expect(letterStartSpacings(skewedDiamond).get("P")).toEqual([45, 135]);
    expect(letterStartSpacings(skewedPentagrid).get("Θ-")).toEqual([0, 72]);
  });
});

describe("beats the rule does not letter", () => {
  const { pentagrid, trigrid, skewedDiamond, diamond } = LETTER_GRIDS;
  // The app also has a float motion, which this rule does not cover.
  const float = "float" as string as GridMotionType;

  it.each<[string, LetterGrid, GridBeat]>([
    ["a float hand", diamond, beat(hand(float, 0, 1), hand("pro", 1, 2))],
    ["a pro hand moving two points", pentagrid, beat(hand("pro", 0, 2), hand("static", 1, 1))],
    ["a static hand that moves", pentagrid, beat(hand("static", 0, 1), hand("pro", 1, 2))],
    ["a dash on an odd grid", trigrid, beat(hand("dash", 0, 1), hand("pro", 1, 2))],
    ["a skewed-frame beat with both hands on cardinals", skewedDiamond, beat(hand("pro", 0, 2), hand("pro", 2, 4))],
    ["Type 4, dash and static", diamond, beat(hand("dash", 0, 2), hand("static", 1, 1))],
    ["Type 6, both static", diamond, beat(hand("static", 0, 0), hand("static", 2, 2))],
    ["a point off the grid", diamond, beat(hand("pro", 3, 4), hand("pro", 0, 1))],
  ])("%s", (_, grid, b) => {
    expect(letterOnGrid(grid, b)).toBeNull();
    expect(letterLabelOnGrid(grid, b)).toBeNull();
  });
});
