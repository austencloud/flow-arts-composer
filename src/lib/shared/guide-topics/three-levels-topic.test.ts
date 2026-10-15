import { describe, expect, it } from "vitest";
import { TYPE1_ROTATION } from "@tka/domain";
import records from "../../../../docs/research/spiroanim/eightstep-72-sequences.json";
import {
  readName,
  readPattern,
  repeatingCell,
  threeLevelsStrip,
  THREE_LEVELS_PATTERNS,
  THREE_LEVELS_SAME_WORD_PAIR,
  type EightStepRecord,
} from "./three-levels-topic";

const all = records as unknown as EightStepRecord[];
const byCode = new Map(all.map((r) => [r.metadata.cell, r]));
const shown = [...THREE_LEVELS_PATTERNS, ...THREE_LEVELS_SAME_WORD_PAIR];

const GROUP_LABEL: Record<string, string> = {
  ss: "Split-Same",
  so: "Split-Opp",
  ts: "Tog-Same",
  to: "Tog-Opp",
  qs: "Quarter-Same",
  qo: "Quarter-Opp",
};

describe("three levels topic", () => {
  it("reads every one of Gage's 72 patterns without a gap", () => {
    expect(all).toHaveLength(72);
    for (const record of all) {
      const pattern = readPattern(record);
      expect(pattern.beats).toHaveLength(12);
      expect(pattern.cell.join("").repeat(pattern.repeats)).toBe(pattern.word);
    }
  });

  it("spells each shown word beat for beat, with timing from the letter canon", () => {
    for (const code of shown) {
      const record = byCode.get(code)!;
      const pattern = readPattern(record);
      expect(pattern.beats.map((b) => b.letter).join("")).toBe(record.word);
      for (const beat of pattern.beats) {
        const canon = TYPE1_ROTATION[beat.letter]!;
        expect(beat.group).toBe(GROUP_LABEL[canon.vtgGroup]);
        // A hybrid letter has one pro hand and one anti hand.
        const motions = record.steps[beat.beat - 1]!.motions;
        const types = new Set([
          motions.left.motionType,
          motions.right.motionType,
        ]);
        expect(beat.hybrid).toBe(types.size === 2);
      }
    }
  });

  it("does not take the transcription's conflicting timing field", () => {
    // 1-AA's fourth beat is a K, which the canon calls split; the raw
    // transcription labels it together.
    const k = readPattern(byCode.get("1-AA")!).beats[3]!;
    expect(k.letter).toBe("K");
    expect(k.group).toBe("Split-Opp");
  });

  it("gives each spin the Ratios page's hand:prop ratio", () => {
    const readings = all.flatMap((r) =>
      readPattern(r).beats.flatMap((b) => [b.blue, b.red])
    );
    const pairs = new Set(readings.map((h) => `${h.spin} ${h.ratio}`));
    expect([...pairs].sort()).toEqual([
      "antispin 1:3",
      "extension 1:1",
      "inspin 1:3",
    ]);
  });

  it("only reads inspin where Gage's row names inspin", () => {
    for (const record of all) {
      const pattern = readPattern(record);
      const spins = pattern.beats.flatMap((b) => [b.blue.spin, b.red.spin]);
      const rowNamesInspin = [
        pattern.name.capping,
        pattern.name.continual,
      ].includes("inspin");
      if (spins.includes("inspin")) expect(rowNamesInspin).toBe(true);
    }
  });

  it("decodes Gage's code as column relationship, then row families", () => {
    expect(readName("1-AA")).toMatchObject({
      relationship: "Opposite",
      capping: "antispin",
      continual: "antispin",
    });
    expect(readName("3-AI")).toMatchObject({
      relationship: "Same",
      capping: "antispin",
      continual: "inspin",
    });
    expect(readName("6-EA").relationship).toBe("Quarter Aligned");
    expect(readName("8-IE").relationship).toBe("Quarter Opposed");
  });

  it("finds the shortest repeating cell", () => {
    expect(repeatingCell([..."KECKECKECKEC"])).toEqual(["K", "E", "C"]);
    expect(repeatingCell([..."IIDCCJIIDCCJ"])).toEqual([..."IIDCCJ"]);
  });

  it("pairs two codes that spell one word with different turns", () => {
    const [a, b] = THREE_LEVELS_SAME_WORD_PAIR.map((c) => byCode.get(c)!);
    expect(a!.word).toBe(b!.word);
    const turns = (r: EightStepRecord) =>
      r.steps.map((s) => `${s.motions.left.turns}/${s.motions.right.turns}`);
    expect(turns(a!)).not.toEqual(turns(b!));
    expect(new Set(all.map((r) => r.word)).size).toBe(32);
  });

  it("builds a playable strip: start pose plus twelve lettered beats", () => {
    const strip = threeLevelsStrip(byCode.get("1-AA")!);
    expect(strip).toHaveLength(13);
    expect(strip[0]!.stepNumber).toBe(0);
    expect(
      strip
        .slice(1)
        .map((s) => s.letter)
        .join("")
    ).toBe("KECKECKECKEC");
    expect(strip[1]!.motions.left.turns).toBe(1);
  });
});
