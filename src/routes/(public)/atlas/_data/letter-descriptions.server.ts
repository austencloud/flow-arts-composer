// One plain-language description per Level 1 letter, composed at prerender time.
//
// WHY THIS IS A SERVER MODULE: every fact here comes from `@tka/domain`, which
// the glossary deliberately keeps server-side (see +page.server.ts). The page is
// prerendered, so the 47 finished descriptions ship as static payload and the
// 500 KB domain package never reaches the browser.
//
// NOTHING IS AUTHORED HERE. Each sentence is assembled from canonical parts:
//   - the hand path is TYPE_DEFINITIONS[n].description, verbatim;
//   - the VTG group, rotation pattern and leader rotation are TYPE1_ROTATION,
//     the single source for Type 1 (see rotation-invariant.ts, which explicitly
//     forbids restating its facts elsewhere);
//   - the per-hand motion types for Types 2 and 3 are read from the same
//     pictograph dataframe the Codex draws, so a caption can never disagree
//     with the picture beside it;
//   - the placement phrases are short forms of PLACEMENT_DEFINITIONS' own
//     descriptions (alpha 180 degrees, beta 0 degrees, gamma 90 degrees).
//
// Letters that the canon does not distinguish read alike on purpose. M and P
// are both Quarter-Opposite pro/pro at gamma; the MCP's own compare_letters
// reports "no major differences". Inventing a distinction to make the text look
// varied would be fabrication.
import { BASE_ALPHABET_LETTERS, LETTER_TO_TYPE, TYPE1_ROTATION, TYPE_DEFINITIONS } from "@tka/domain";
import type { VtgGroup } from "@tka/domain";
import lettersData from "../../guide/level-1/_data/letters.json";

/** Display names for the six VTG timing groups. Presentation only - the letter
 *  membership behind each group is TYPE1_ROTATION's, never restated here. */
const VTG_GROUP_NAME: Record<VtgGroup, string> = {
  ss: "Split-Same",
  so: "Split-Opposite",
  ts: "Together-Same",
  to: "Together-Opposite",
  qs: "Quarter-Same",
  qo: "Quarter-Opposite",
};

/** Short forms of PLACEMENT_DEFINITIONS' descriptions, sized for one line. */
const PLACEMENT_PHRASE: Record<string, string> = {
  alpha: "at opposite points",
  beta: "both at the same point",
  gamma: "at a right angle",
};

type RawMotion = { motionType?: string };
type RawPictograph = {
  startPlacement?: string;
  endPlacement?: string;
  motions?: { left?: RawMotion; right?: RawMotion };
};

const PICTOGRAPHS = (lettersData as unknown as { pictographs: Record<string, RawPictograph> })
  .pictographs;

/** "alpha3" -> "alpha". */
function group(placement: string | undefined): string | null {
  const match = placement?.match(/[a-z]+/i);
  return match ? match[0].toLowerCase() : null;
}

function placementSentence(p: RawPictograph, isStatic: boolean): string {
  const start = group(p.startPlacement);
  const end = group(p.endPlacement);
  if (!start || !end) return "";
  const phrase = (g: string): string => `${g}, ${PLACEMENT_PHRASE[g] ?? ""}`.trimEnd().replace(/,$/, "");
  if (isStatic) return `The hands hold ${phrase(start)}.`;
  if (start === end) return `The hands start and finish in ${phrase(start)}.`;
  return `The hands start in ${phrase(start)}, and finish in ${phrase(end)}.`;
}

/** The pro/anti character of a Type 1 letter, including the leader/follower
 *  split that exists only in Quarter-Same. */
function type1Rotation(letter: string): string {
  const entry = TYPE1_ROTATION[letter];
  if (!entry) return "";
  const timing = `${VTG_GROUP_NAME[entry.vtgGroup]} timing`;
  if (entry.rotationPattern === "pro") {
    return `${timing}: both props prospin, rotating with the hands' travel.`;
  }
  if (entry.rotationPattern === "anti") {
    return `${timing}: both props antispin, rotating against the hands' travel.`;
  }
  if (entry.leaderRotation === "pro") {
    return `${timing}: the leading hand's prop prospins and the follower's antispins.`;
  }
  if (entry.leaderRotation === "anti") {
    return `${timing}: the leading hand's prop antispins and the follower's prospins.`;
  }
  return `${timing}: one prop prospins while the other antispins.`;
}

/** Types 2 and 3 pair a shift with a static hold or a dash. Only the shifting
 *  hand carries a pro/anti character, and which colour holds it varies between
 *  variations, so the sentence names the motion and not the hand. */
function shiftRotation(p: RawPictograph): string {
  const types = [p.motions?.left?.motionType, p.motions?.right?.motionType];
  if (types.includes("pro")) return "The shifting prop prospins, rotating with the hand's travel.";
  if (types.includes("anti")) return "The shifting prop antispins, rotating against the hand's travel.";
  return "";
}

function describe(letter: string): string {
  const pictograph = PICTOGRAPHS[`${letter}-0`];
  const typeNumber = LETTER_TO_TYPE[letter]?.typeNumber;
  if (!pictograph || !typeNumber) return "";

  const handPath = TYPE_DEFINITIONS[typeNumber]?.description ?? "";
  const rotation =
    typeNumber === 1
      ? type1Rotation(letter)
      : typeNumber === 2 || typeNumber === 3
        ? shiftRotation(pictograph)
        : "";

  return [handPath, rotation, placementSentence(pictograph, typeNumber === 6)]
    .filter(Boolean)
    .join(" ");
}

/** letter -> its description, for every letter the Codex draws. */
export const LETTER_DESCRIPTIONS: Record<string, string> = Object.fromEntries(
  BASE_ALPHABET_LETTERS.map((letter) => [letter, describe(letter)]).filter(([, text]) => text)
);
