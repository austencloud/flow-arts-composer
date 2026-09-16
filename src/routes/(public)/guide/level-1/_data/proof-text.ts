/**
 * Proof text runs for manifest pages that faithfully correspond to a page in the
 * original proof PDF (static/guides/_proof/level-1-v05.pdf). GENERATED - do not
 * hand-edit; regenerate from scripts if the proof changes. Coordinates are the
 * proof's own points (top-left origin, 612×792pt sheet); the renderer scales by
 * 816/612. The page title is intentionally omitted (GuidePage renders it from
 * the manifest). Images/pictographs are NOT here - text only, for now.
 */
export type ProofRun = {
  x: number;
  y: number;
  w: number;
  fs: number;
  s: "regular" | "bold" | "italic" | "bolditalic" | "heading";
  t: string;
};

export const PROOF_TEXT: Record<string, ProofRun[]> = {
  "hm-type1": [
    {
      "x": 98.3,
      "y": 68.5,
      "w": 338.7,
      "fs": 14,
      "s": "regular",
      "t": "When both hands move to adjacent locations, it’s called a"
    },
    {
      "x": 440.1,
      "y": 68.5,
      "w": 64,
      "fs": 14,
      "s": "bold",
      "t": "Dual-Shift"
    },
    {
      "x": 504.1,
      "y": 68.5,
      "w": 2.9,
      "fs": 14,
      "s": "regular",
      "t": "."
    },
    {
      "x": 47.2,
      "y": 85.3,
      "w": 50.4,
      "fs": 14,
      "s": "regular",
      "t": "Our first"
    },
    {
      "x": 100.7,
      "y": 85.3,
      "w": 70.4,
      "fs": 14,
      "s": "bold",
      "t": "Dual-Shifts"
    },
    {
      "x": 174.1,
      "y": 85.3,
      "w": 384,
      "fs": 14,
      "s": "regular",
      "t": "correspond to the four modes of timing/direction: SS, TS, SO, TO."
    },
    {
      "x": 52.8,
      "y": 102.1,
      "w": 499.8,
      "fs": 14,
      "s": "regular",
      "t": "You can determine the start position by looking at the non-pointed end of the arrow."
    },
    {
      "x": 93.7,
      "y": 712.9,
      "w": 157.8,
      "fs": 14,
      "s": "regular",
      "t": "Notice that it can be either"
    },
    {
      "x": 254.5,
      "y": 712.9,
      "w": 54,
      "fs": 14,
      "s": "italic",
      "t": "Split-Opp"
    },
    {
      "x": 311.6,
      "y": 712.9,
      "w": 13.2,
      "fs": 14,
      "s": "regular",
      "t": "or"
    },
    {
      "x": 327.9,
      "y": 712.9,
      "w": 49.4,
      "fs": 14,
      "s": "italic",
      "t": "Tog-Opp"
    },
    {
      "x": 380.4,
      "y": 712.9,
      "w": 167.9,
      "fs": 14,
      "s": "regular",
      "t": "depending on start position."
    },
    {
      "x": 86.1,
      "y": 746.5,
      "w": 469.7,
      "fs": 14,
      "s": "bold",
      "t": "Practice using Dual-Shifts to travel between Alpha and Beta in each mode."
    },
    {
      "x": 117.5,
      "y": 383.6,
      "w": 397.5,
      "fs": 14,
      "s": "regular",
      "t": "The Kinetic Alphabet puts focus on simultaneous motions between"
    },
    {
      "x": 192.1,
      "y": 400.4,
      "w": 248.3,
      "fs": 14,
      "s": "regular",
      "t": "two positions, relative to the center point."
    },
    {
      "x": 209.6,
      "y": 417.2,
      "w": 143.3,
      "fs": 14,
      "s": "regular",
      "t": "Let’s try another type of"
    },
    {
      "x": 356.1,
      "y": 417.2,
      "w": 64,
      "fs": 14,
      "s": "bold",
      "t": "Dual-Shift"
    },
    {
      "x": 420,
      "y": 417.2,
      "w": 2.9,
      "fs": 14,
      "s": "regular",
      "t": "."
    },
    {
      "x": 173.2,
      "y": 434,
      "w": 286.2,
      "fs": 14,
      "s": "regular",
      "t": "What happens when we move between α and β?"
    },
    {
      "x": 12.7,
      "y": 190.2,
      "w": 70.6,
      "fs": 16,
      "s": "italic",
      "t": "Split-Same"
    },
    {
      "x": 15.3,
      "y": 308.2,
      "w": 65.4,
      "fs": 16,
      "s": "italic",
      "t": "Tog-Same"
    },
    {
      "x": 21.4,
      "y": 627.9,
      "w": 56.5,
      "fs": 16,
      "s": "italic",
      "t": "Tog-Opp"
    },
    {
      "x": 19.4,
      "y": 511.6,
      "w": 61.7,
      "fs": 16,
      "s": "italic",
      "t": "Split-Opp"
    }
  ],
  "hm-gamma-type2": [
    {
      "x": 97.2,
      "y": 30.8,
      "w": 417.7,
      "fs": 15,
      "s": "regular",
      "t": "Gamma, aka quarter-time, is based on two often forgotten modes:"
    },
    {
      "x": 197.1,
      "y": 48.8,
      "w": 87.9,
      "fs": 15,
      "s": "bold",
      "t": "Quarter-Opp"
    },
    {
      "x": 288.3,
      "y": 48.8,
      "w": 24,
      "fs": 15,
      "s": "regular",
      "t": "and"
    },
    {
      "x": 315.6,
      "y": 48.8,
      "w": 96.3,
      "fs": 15,
      "s": "bold",
      "t": "Quarter-Same"
    },
    {
      "x": 411.8,
      "y": 48.8,
      "w": 3.1,
      "fs": 15,
      "s": "regular",
      "t": "."
    },
    {
      "x": 131.4,
      "y": 66.8,
      "w": 349.1,
      "fs": 15,
      "s": "regular",
      "t": "Quarter-Opp has variations of parallel and antiparallel."
    },
    {
      "x": 188.1,
      "y": 242.9,
      "w": 241,
      "fs": 15,
      "s": "regular",
      "t": "In Quarter-Same, this doesn’t happen:"
    },
    {
      "x": 84.5,
      "y": 408.4,
      "w": 435.5,
      "fs": 16,
      "s": "regular",
      "t": "When in gamma, you can move to any other variation of gamma."
    },
    {
      "x": 31,
      "y": 427.6,
      "w": 542.4,
      "fs": 16,
      "s": "regular",
      "t": "These examples are continuous, but non-continuous sequence are also possible."
    },
    {
      "x": 76.8,
      "y": 466,
      "w": 450.9,
      "fs": 16,
      "s": "regular",
      "t": "Here’s one that switches between Quarter-Opp and Quarter-Same:"
    },
    {
      "x": 51.1,
      "y": 745.1,
      "w": 187.1,
      "fs": 16,
      "s": "bold",
      "t": "Practice using Dual-Shifts"
    },
    {
      "x": 241.7,
      "y": 745.1,
      "w": 345.7,
      "fs": 16,
      "s": "bold",
      "t": "to create other non-continuous Γ→Γ variations!"
    },
    {
      "x": 10.5,
      "y": 327.8,
      "w": 75.8,
      "fs": 13,
      "s": "italic",
      "t": "Quarter-Same"
    },
    {
      "x": 13.5,
      "y": 173.3,
      "w": 68.5,
      "fs": 13,
      "s": "italic",
      "t": "Quarter-Opp"
    },
    {
      "x": 215.8,
      "y": 104.1,
      "w": 45.4,
      "fs": 14,
      "s": "italic",
      "t": "Parallel"
    },
    {
      "x": 305.9,
      "y": 104.1,
      "w": 69.4,
      "fs": 14,
      "s": "italic",
      "t": "Antiparallel"
    },
    {
      "x": 414,
      "y": 104.1,
      "w": 45.4,
      "fs": 14,
      "s": "italic",
      "t": "Parallel"
    },
    {
      "x": 505.2,
      "y": 104.1,
      "w": 69.4,
      "fs": 14,
      "s": "italic",
      "t": "Antiparallel"
    }
  ],
  "letters-type2": [
    {
      "x": 24.5,
      "y": 59.5,
      "w": 119.6,
      "fs": 16,
      "s": "regular",
      "t": "To move between"
    },
    {
      "x": 147.6,
      "y": 60.5,
      "w": 439.6,
      "fs": 15,
      "s": "regular",
      "t": "Γ and α/β, you can shift one hand and keep the other hand static."
    },
    {
      "x": 39.2,
      "y": 78.7,
      "w": 189.2,
      "fs": 16,
      "s": "regular",
      "t": "This combination is called a"
    },
    {
      "x": 231.9,
      "y": 78.7,
      "w": 33.8,
      "fs": 16,
      "s": "bold",
      "t": "Shift"
    },
    {
      "x": 269.3,
      "y": 78.7,
      "w": 303.2,
      "fs": 16,
      "s": "regular",
      "t": "(with a capital “S”). Here’s a simple example:"
    },
    {
      "x": 75.2,
      "y": 224.7,
      "w": 461.3,
      "fs": 16,
      "s": "regular",
      "t": "The following examples explore both same and opposite handpaths."
    },
    {
      "x": 195.2,
      "y": 243.9,
      "w": 221.3,
      "fs": 16,
      "s": "regular",
      "t": "They alternate the shifting hand."
    },
    {
      "x": 154.9,
      "y": 282.3,
      "w": 301.9,
      "fs": 16,
      "s": "regular",
      "t": "Here, they are shifting in the same direction:"
    },
    {
      "x": 138.5,
      "y": 518.2,
      "w": 334.7,
      "fs": 16,
      "s": "regular",
      "t": "And here, they are shifting in opposite directions."
    },
    {
      "x": 7.3,
      "y": 758.6,
      "w": 38.6,
      "fs": 15,
      "s": "bold",
      "t": "Shifts"
    },
    {
      "x": 49.2,
      "y": 758.6,
      "w": 555.5,
      "fs": 15,
      "s": "regular",
      "t": "seems mundane here, but they’re very useful later for constructing dynamic sequences."
    }
  ],
  "hm-type34": [
    {
      "x": 194.5,
      "y": 525,
      "w": 155.3,
      "fs": 15,
      "s": "regular",
      "t": "And this one shows beta"
    },
    {
      "x": 349.9,
      "y": 524,
      "w": 13.4,
      "fs": 16,
      "s": "regular",
      "t": "→"
    },
    {
      "x": 363.3,
      "y": 525,
      "w": 50.8,
      "fs": 15,
      "s": "regular",
      "t": "gamma:"
    },
    {
      "x": 49.2,
      "y": 764.5,
      "w": 177.4,
      "fs": 15,
      "s": "regular",
      "t": "Tech nerds will notice these"
    },
    {
      "x": 229.9,
      "y": 764.5,
      "w": 80.8,
      "fs": 15,
      "s": "bold",
      "t": "Cross-Shifts"
    },
    {
      "x": 314.1,
      "y": 764.5,
      "w": 39.5,
      "fs": 15,
      "s": "regular",
      "t": "create"
    },
    {
      "x": 356.9,
      "y": 764.5,
      "w": 92.9,
      "fs": 15,
      "s": "italic",
      "t": "Zan’s Diamond"
    },
    {
      "x": 453.1,
      "y": 764.5,
      "w": 104.9,
      "fs": 15,
      "s": "regular",
      "t": "variations. Neat!"
    },
    {
      "x": 15.7,
      "y": 237.8,
      "w": 580.6,
      "fs": 15,
      "s": "regular",
      "t": "Note the halfway point. One hand is in the center point and one is on a diagonal hand point."
    },
    {
      "x": 37.3,
      "y": 255.8,
      "w": 537.3,
      "fs": 15,
      "s": "regular",
      "t": "By pausing at this halfway point, it ensures that the dash moves at the correct speed."
    },
    {
      "x": 128,
      "y": 273.8,
      "w": 356.1,
      "fs": 15,
      "s": "regular",
      "t": "The following sequences demonstrate their capabilities."
    },
    {
      "x": 198.3,
      "y": 293,
      "w": 151.2,
      "fs": 15,
      "s": "regular",
      "t": "This one explores alpha"
    },
    {
      "x": 349.5,
      "y": 292,
      "w": 13.4,
      "fs": 16,
      "s": "regular",
      "t": "→"
    },
    {
      "x": 362.9,
      "y": 293,
      "w": 50.8,
      "fs": 15,
      "s": "regular",
      "t": "gamma:"
    },
    {
      "x": 171.7,
      "y": 49.4,
      "w": 9.3,
      "fs": 15,
      "s": "regular",
      "t": "A"
    },
    {
      "x": 184.3,
      "y": 49.4,
      "w": 74,
      "fs": 15,
      "s": "bold",
      "t": "Cross-Shift"
    },
    {
      "x": 261.6,
      "y": 49.4,
      "w": 178.7,
      "fs": 15,
      "s": "regular",
      "t": "combines a shift and a dash."
    },
    {
      "x": 125.7,
      "y": 67.4,
      "w": 360.7,
      "fs": 15,
      "s": "regular",
      "t": "Since a dash has further to travel, it moves slightly faster."
    },
    {
      "x": 113.2,
      "y": 85.4,
      "w": 93,
      "fs": 15,
      "s": "regular",
      "t": "To understand"
    },
    {
      "x": 209.5,
      "y": 85.4,
      "w": 80.8,
      "fs": 15,
      "s": "bold",
      "t": "Cross-Shifts"
    },
    {
      "x": 290.3,
      "y": 85.4,
      "w": 208.5,
      "fs": 15,
      "s": "regular",
      "t": ", let’s break one down into parts:"
    },
    {
      "x": 108.4,
      "y": 116.2,
      "w": 32,
      "fs": 16,
      "s": "italic",
      "t": "start"
    },
    {
      "x": 217.4,
      "y": 116.2,
      "w": 53.4,
      "fs": 16,
      "s": "italic",
      "t": "halfway"
    },
    {
      "x": 351.6,
      "y": 116.2,
      "w": 24.3,
      "fs": 16,
      "s": "italic",
      "t": "end"
    }
  ],
  "hm-type56": [
    {
      "x": 149.5,
      "y": 638.4,
      "w": 45.1,
      "fs": 15,
      "s": "regular",
      "t": "Finally,"
    },
    {
      "x": 198,
      "y": 638.4,
      "w": 38.4,
      "fs": 15,
      "s": "bold",
      "t": "Static"
    },
    {
      "x": 239.7,
      "y": 638.4,
      "w": 224,
      "fs": 15,
      "s": "regular",
      "t": "motions are indicated by no arrow:"
    },
    {
      "x": 63.3,
      "y": 394.8,
      "w": 42,
      "fs": 15,
      "s": "regular",
      "t": "With a"
    },
    {
      "x": 108.5,
      "y": 394.8,
      "w": 71.7,
      "fs": 15,
      "s": "bold",
      "t": "Dual-Dash"
    },
    {
      "x": 180.2,
      "y": 394.8,
      "w": 368.6,
      "fs": 15,
      "s": "regular",
      "t": ", both hands dash simultaneously to their opposite points."
    },
    {
      "x": 127.7,
      "y": 535.4,
      "w": 359.6,
      "fs": 15,
      "s": "bold",
      "t": "Practice using Dual-Dashes, Dashes, and Cross-Shifts"
    },
    {
      "x": 205.5,
      "y": 553.4,
      "w": 204,
      "fs": 15,
      "s": "bold",
      "t": "from different start positions."
    },
    {
      "x": 65.7,
      "y": 53.3,
      "w": 42,
      "fs": 15,
      "s": "regular",
      "t": "With a"
    },
    {
      "x": 110.9,
      "y": 53.3,
      "w": 34.4,
      "fs": 15,
      "s": "bold",
      "t": "Dash"
    },
    {
      "x": 145.4,
      "y": 53.3,
      "w": 401,
      "fs": 15,
      "s": "regular",
      "t": ", one hand executes a dash while the other hand remains static."
    },
    {
      "x": 142.6,
      "y": 71.3,
      "w": 326.8,
      "fs": 15,
      "s": "regular",
      "t": "With alpha→beta, this creates a two-step sequence:"
    },
    {
      "x": 128.4,
      "y": 200.1,
      "w": 355.3,
      "fs": 15,
      "s": "regular",
      "t": "And with gamma→gamma, it creates a 4-step sequence:"
    },
    {
      "x": 80,
      "y": 764.8,
      "w": 453.2,
      "fs": 15,
      "s": "regular",
      "t": "Later on, static sequences gain complexity when adding prop rotations."
    }
  ],
  "staff-placements": [
    {
      "x": 51.8,
      "y": 74,
      "w": 510,
      "fs": 15,
      "s": "regular",
      "t": "When writing sequences with staves, it helps to mark the thumb end with a line."
    },
    {
      "x": 20.9,
      "y": 92,
      "w": 571.8,
      "fs": 15,
      "s": "regular",
      "t": "The performer can use it to keep track of rotations and check their position on every step."
    },
    {
      "x": 77.8,
      "y": 110,
      "w": 458,
      "fs": 15,
      "s": "regular",
      "t": "It also encourages negative space/body turns instead of finger spinning."
    },
    {
      "x": 107.7,
      "y": 146,
      "w": 398.1,
      "fs": 15,
      "s": "regular",
      "t": "In the following examples, an end is always at the center point."
    },
    {
      "x": 60.8,
      "y": 182,
      "w": 491.9,
      "fs": 15,
      "s": "bold",
      "t": "Practice each position below, paying attention to the thumb orientation."
    },
    {
      "x": 79.7,
      "y": 660.4,
      "w": 454.4,
      "fs": 16,
      "s": "regular",
      "t": "Many of pictographs in this guide are depicted with no thumb ends"
    },
    {
      "x": 94.1,
      "y": 679.6,
      "w": 425.7,
      "fs": 16,
      "s": "regular",
      "t": "when categorizating. It is usually noted only during sequences."
    },
    {
      "x": 83.5,
      "y": 718,
      "w": 446.7,
      "fs": 16,
      "s": "regular",
      "t": "Most sequences in this guide start with thumbs in for consistency."
    },
    {
      "x": 55.9,
      "y": 737.2,
      "w": 502,
      "fs": 16,
      "s": "regular",
      "t": "It’s equally valid to start any sequence from a different thumb orientation."
    },
    {
      "x": 150,
      "y": 231.4,
      "w": 14.2,
      "fs": 17,
      "s": "regular",
      "t": "in"
    },
    {
      "x": 36.1,
      "y": 231.4,
      "w": 64.1,
      "fs": 17,
      "s": "regular",
      "t": "Thumbs:"
    },
    {
      "x": 44.5,
      "y": 341.9,
      "w": 42.3,
      "fs": 17,
      "s": "regular",
      "t": "Alpha"
    },
    {
      "x": 49.3,
      "y": 477.8,
      "w": 32.7,
      "fs": 17,
      "s": "regular",
      "t": "Beta"
    },
    {
      "x": 38,
      "y": 608.7,
      "w": 55.3,
      "fs": 17,
      "s": "regular",
      "t": "Gamma"
    },
    {
      "x": 265.1,
      "y": 231.4,
      "w": 24.2,
      "fs": 17,
      "s": "regular",
      "t": "out"
    },
    {
      "x": 489.3,
      "y": 231.2,
      "w": 59.7,
      "fs": 17,
      "s": "regular",
      "t": "(in/out)"
    },
    {
      "x": 368.7,
      "y": 231.4,
      "w": 59.7,
      "fs": 17,
      "s": "regular",
      "t": "(out/in)"
    }
  ],
  "staff-motions": [
    {
      "x": 277.6,
      "y": 58.9,
      "w": 53.4,
      "fs": 30,
      "s": "heading",
      "t": "Shift"
    },
    {
      "x": 276.1,
      "y": 584.2,
      "w": 56.4,
      "fs": 30,
      "s": "heading",
      "t": "Dash"
    },
    {
      "x": 114.5,
      "y": 426.2,
      "w": 32,
      "fs": 16,
      "s": "italic",
      "t": "start"
    },
    {
      "x": 223.4,
      "y": 426.2,
      "w": 53.4,
      "fs": 16,
      "s": "italic",
      "t": "halfway"
    },
    {
      "x": 357.6,
      "y": 426.2,
      "w": 24.3,
      "fs": 16,
      "s": "italic",
      "t": "end"
    },
    {
      "x": 11.9,
      "y": 139.8,
      "w": 63.5,
      "fs": 20,
      "s": "italic",
      "t": "Prospin"
    },
    {
      "x": 11.9,
      "y": 371.9,
      "w": 68.9,
      "fs": 20,
      "s": "italic",
      "t": "Antispin"
    },
    {
      "x": 27.4,
      "y": 326.7,
      "w": 553.9,
      "fs": 16,
      "s": "regular",
      "t": "In a base isolation, the thumb orientation remains the same for the entire motion."
    },
    {
      "x": 95.2,
      "y": 372.4,
      "w": 7.1,
      "fs": 16,
      "s": "regular",
      "t": "•"
    },
    {
      "x": 105.8,
      "y": 372.4,
      "w": 62.5,
      "fs": 16,
      "s": "bold",
      "t": "Antispin"
    },
    {
      "x": 171.8,
      "y": 372.4,
      "w": 404.6,
      "fs": 16,
      "s": "regular",
      "t": "- The prop rotates in the opposite direction of the handpath"
    },
    {
      "x": 95.2,
      "y": 391.6,
      "w": 328.2,
      "fs": 16,
      "s": "regular",
      "t": "A 90 degree antispin is our base unit of antispin."
    },
    {
      "x": 16.1,
      "y": 555,
      "w": 579.8,
      "fs": 16,
      "s": "regular",
      "t": "In an antispin, the ends swap orientation. Here, it moves from thumb in to thumb out."
    },
    {
      "x": 125,
      "y": 622.2,
      "w": 363.4,
      "fs": 16,
      "s": "regular",
      "t": "In a base dash, the thumb ends also swap orientation."
    },
    {
      "x": 38.9,
      "y": 480.4,
      "w": 24,
      "fs": 12,
      "s": "italic",
      "t": "start"
    },
    {
      "x": 28.3,
      "y": 494.8,
      "w": 45.1,
      "fs": 12,
      "s": "italic",
      "t": "thumb in"
    },
    {
      "x": 561.1,
      "y": 480.4,
      "w": 18.2,
      "fs": 12,
      "s": "italic",
      "t": "end"
    },
    {
      "x": 544.1,
      "y": 494.8,
      "w": 52,
      "fs": 12,
      "s": "italic",
      "t": "thumb out"
    },
    {
      "x": 114.5,
      "y": 190.8,
      "w": 32,
      "fs": 16,
      "s": "italic",
      "t": "start"
    },
    {
      "x": 223.4,
      "y": 190.8,
      "w": 53.4,
      "fs": 16,
      "s": "italic",
      "t": "halfway"
    },
    {
      "x": 357.6,
      "y": 190.8,
      "w": 24.3,
      "fs": 16,
      "s": "italic",
      "t": "end"
    },
    {
      "x": 95.2,
      "y": 141.9,
      "w": 6.6,
      "fs": 15,
      "s": "regular",
      "t": "•"
    },
    {
      "x": 105.1,
      "y": 141.9,
      "w": 54.1,
      "fs": 15,
      "s": "bold",
      "t": "Prospin"
    },
    {
      "x": 165.8,
      "y": 141.9,
      "w": 342.8,
      "fs": 15,
      "s": "regular",
      "t": "- The prop rotates the same direction as the handpath"
    },
    {
      "x": 95.2,
      "y": 159.9,
      "w": 319,
      "fs": 15,
      "s": "regular",
      "t": "A 90 degree isolation is our base unit of a prospin."
    },
    {
      "x": 38.9,
      "y": 245,
      "w": 24,
      "fs": 12,
      "s": "italic",
      "t": "start"
    },
    {
      "x": 28.3,
      "y": 259.4,
      "w": 45.1,
      "fs": 12,
      "s": "italic",
      "t": "thumb in"
    },
    {
      "x": 561.1,
      "y": 244.3,
      "w": 18.2,
      "fs": 12,
      "s": "italic",
      "t": "end"
    },
    {
      "x": 547.6,
      "y": 258.7,
      "w": 45.1,
      "fs": 12,
      "s": "italic",
      "t": "thumb in"
    },
    {
      "x": 114.5,
      "y": 642.6,
      "w": 32,
      "fs": 16,
      "s": "italic",
      "t": "start"
    },
    {
      "x": 223.4,
      "y": 642.6,
      "w": 53.4,
      "fs": 16,
      "s": "italic",
      "t": "halfway"
    },
    {
      "x": 357.6,
      "y": 642.6,
      "w": 24.3,
      "fs": 16,
      "s": "italic",
      "t": "end"
    },
    {
      "x": 38.9,
      "y": 695,
      "w": 24,
      "fs": 12,
      "s": "italic",
      "t": "start"
    },
    {
      "x": 28.3,
      "y": 709.4,
      "w": 45.1,
      "fs": 12,
      "s": "italic",
      "t": "thumb in"
    },
    {
      "x": 561.1,
      "y": 695,
      "w": 18.2,
      "fs": 12,
      "s": "italic",
      "t": "end"
    },
    {
      "x": 544.1,
      "y": 709.4,
      "w": 52,
      "fs": 12,
      "s": "italic",
      "t": "thumb out"
    },
    {
      "x": 41.6,
      "y": 101.1,
      "w": 525.6,
      "fs": 16,
      "s": "regular",
      "t": "During a shift, a prop can rotate in one of two directions - Prospin or Antispin"
    },
    {
      "x": 39.7,
      "y": 766.7,
      "w": 532.7,
      "fs": 16,
      "s": "regular",
      "t": "Halfway through the motion, the center of the staff is at the grid’s center point."
    }
  ],
  "negative-space": [
    {
      "x": 17.4,
      "y": 59.5,
      "w": 572.3,
      "fs": 14,
      "s": "regular",
      "t": "Many sequences seem impossible, but most can be solved by using negative space or body turns."
    },
    {
      "x": 91.4,
      "y": 76.3,
      "w": 93.7,
      "fs": 14,
      "s": "bolditalic",
      "t": "Negative space"
    },
    {
      "x": 188.2,
      "y": 76.3,
      "w": 327.6,
      "fs": 14,
      "s": "regular",
      "t": "lets you face the audience and reduces body movement"
    },
    {
      "x": 75.2,
      "y": 93.1,
      "w": 68.3,
      "fs": 14,
      "s": "bolditalic",
      "t": "Body turns"
    },
    {
      "x": 146.6,
      "y": 93.1,
      "w": 385.4,
      "fs": 14,
      "s": "regular",
      "t": "add movement and help you execute patterns with longer staves."
    },
    {
      "x": 72,
      "y": 109.9,
      "w": 463.1,
      "fs": 14,
      "s": "regular",
      "t": "Each method is equally important, and learning both will maximize capability."
    },
    {
      "x": 90,
      "y": 126.7,
      "w": 427.2,
      "fs": 14,
      "s": "regular",
      "t": "This guide will assume some knowledge of these fundamental concepts."
    },
    {
      "x": 41.9,
      "y": 160.3,
      "w": 523.4,
      "fs": 14,
      "s": "regular",
      "t": "To make the most of the Alphabet, it’s highly recommended that you learn the following."
    },
    {
      "x": 88.5,
      "y": 626.9,
      "w": 430.1,
      "fs": 14,
      "s": "regular",
      "t": "To execute this in wall plane, you must do one of the following on step 2:"
    },
    {
      "x": 11.7,
      "y": 660.5,
      "w": 508.2,
      "fs": 14,
      "s": "regular",
      "t": "• Pass the thumb end through the negative space above your right shoulder on step 2."
    },
    {
      "x": 11.7,
      "y": 677.3,
      "w": 581.8,
      "fs": 14,
      "s": "regular",
      "t": "• Turn your torso to the left on step 2 and pass the thumb end in front, then pass the pinky end on"
    },
    {
      "x": 11.7,
      "y": 694.1,
      "w": 298,
      "fs": 14,
      "s": "regular",
      "t": "the inside of your right arm as you move to step 3."
    },
    {
      "x": 107.1,
      "y": 727.7,
      "w": 393,
      "fs": 14,
      "s": "bold",
      "t": "Practice in reverse, then do both directions in the other hand."
    },
    {
      "x": 112.5,
      "y": 744.5,
      "w": 382.2,
      "fs": 14,
      "s": "bold",
      "t": "Then practice everything again starting with the thumb out."
    },
    {
      "x": 138.6,
      "y": 761.3,
      "w": 329.9,
      "fs": 14,
      "s": "bold",
      "t": "Try using both negative space and turns. Good luck!"
    },
    {
      "x": 208.4,
      "y": 474.7,
      "w": 177,
      "fs": 30,
      "s": "heading",
      "t": "4-Petal Antispin"
    },
    {
      "x": 48.9,
      "y": 350.9,
      "w": 522.3,
      "fs": 14,
      "s": "regular",
      "t": "To execute this without finger-spinning, turn your torso to the left on step 3. During this"
    },
    {
      "x": 12.9,
      "y": 367.7,
      "w": 572.4,
      "fs": 14,
      "s": "regular",
      "t": "step, the staff moves briefly in wheel-plane relative to your left-facing view. On step 4, turn your"
    },
    {
      "x": 12.9,
      "y": 384.5,
      "w": 323.2,
      "fs": 14,
      "s": "regular",
      "t": "body back to center as you return to the start position."
    },
    {
      "x": 107.1,
      "y": 418.1,
      "w": 393,
      "fs": 14,
      "s": "bold",
      "t": "Practice in reverse, then do both directions in the other hand."
    },
    {
      "x": 111.6,
      "y": 434.9,
      "w": 384,
      "fs": 14,
      "s": "bold",
      "t": "Then practice it with the thumb out, isolating the pinky end."
    },
    {
      "x": 225.2,
      "y": 193.9,
      "w": 153.6,
      "fs": 30,
      "s": "heading",
      "t": "360° Isolation"
    },
    {
      "x": 532.4,
      "y": 3.8,
      "w": 70.3,
      "fs": 20,
      "s": "italic",
      "t": "VTG: 1:1"
    }
  ],
  "bl-double-staff": [
    {
      "x": 245.7,
      "y": 511,
      "w": 60.9,
      "fs": 22,
      "s": "italic",
      "t": "Type 2"
    },
    {
      "x": 311.4,
      "y": 511,
      "w": 57.5,
      "fs": 22,
      "s": "bolditalic",
      "t": "- Shift"
    },
    {
      "x": 149.5,
      "y": 767.5,
      "w": 37.5,
      "fs": 13,
      "s": "italic",
      "t": "Sigma"
    },
    {
      "x": 232.3,
      "y": 766.8,
      "w": 31.5,
      "fs": 13,
      "s": "italic",
      "t": "Delta"
    },
    {
      "x": 346.6,
      "y": 767.7,
      "w": 33.5,
      "fs": 13,
      "s": "italic",
      "t": "Theta"
    },
    {
      "x": 421.8,
      "y": 767.6,
      "w": 42,
      "fs": 13,
      "s": "italic",
      "t": "Omega"
    },
    {
      "x": 218.7,
      "y": 54.5,
      "w": 60.9,
      "fs": 22,
      "s": "italic",
      "t": "Type 1"
    },
    {
      "x": 284.4,
      "y": 54.5,
      "w": 110.9,
      "fs": 22,
      "s": "bolditalic",
      "t": "- Dual-Shift"
    }
  ],
  "base-letters": [
    {
      "x": 162,
      "y": 127.4,
      "w": 96.8,
      "fs": 35,
      "s": "italic",
      "t": "Type 1"
    },
    {
      "x": 266.5,
      "y": 127.4,
      "w": 176.4,
      "fs": 35,
      "s": "bolditalic",
      "t": "- Dual-Shift"
    },
    {
      "x": 18.5,
      "y": 52.8,
      "w": 585.4,
      "fs": 16,
      "s": "regular",
      "t": "Just like positions, each motion pictograph can be rotated, reflected, or color swapped."
    },
    {
      "x": 52.5,
      "y": 72,
      "w": 517.4,
      "fs": 16,
      "s": "regular",
      "t": "Letters are organized on the page by end position, Alpha, Beta, then Gamma."
    },
    {
      "x": 192.6,
      "y": 91.2,
      "w": 237.2,
      "fs": 16,
      "s": "regular",
      "t": "Let’s look at each type individually."
    },
    {
      "x": 57.6,
      "y": 706.5,
      "w": 501.6,
      "fs": 16,
      "s": "bold",
      "t": "In hybrids like C and I, either hand can execute a prospin or antispin."
    },
    {
      "x": 60,
      "y": 744.9,
      "w": 61.8,
      "fs": 16,
      "s": "regular",
      "t": "Here, the"
    },
    {
      "x": 125.3,
      "y": 744.9,
      "w": 36,
      "fs": 16,
      "s": "bold",
      "t": "right"
    },
    {
      "x": 164.9,
      "y": 744.9,
      "w": 11.3,
      "fs": 16,
      "s": "regular",
      "t": "is"
    },
    {
      "x": 179.7,
      "y": 744.9,
      "w": 69.8,
      "fs": 16,
      "s": "regular",
      "t": "in pro and"
    },
    {
      "x": 253.1,
      "y": 744.9,
      "w": 24.5,
      "fs": 16,
      "s": "bold",
      "t": "left"
    },
    {
      "x": 281.1,
      "y": 744.9,
      "w": 275.8,
      "fs": 16,
      "s": "regular",
      "t": "in anti, but it’s equally valid to swap this."
    },
    {
      "x": 23,
      "y": 181.8,
      "w": 316.9,
      "fs": 16,
      "s": "regular",
      "t": "First we’ll look at A,B, and C. Their handpath is"
    },
    {
      "x": 343.5,
      "y": 181.8,
      "w": 70.6,
      "fs": 16,
      "s": "italic",
      "t": "Split-Same"
    },
    {
      "x": 417.6,
      "y": 181.8,
      "w": 136.3,
      "fs": 16,
      "s": "regular",
      "t": "and they move from"
    },
    {
      "x": 557.4,
      "y": 181.8,
      "w": 31.8,
      "fs": 16,
      "s": "regular",
      "t": "α→α"
    },
    {
      "x": 589.6,
      "y": 181.8,
      "w": 4.2,
      "fs": 16,
      "s": "regular",
      "t": ":"
    },
    {
      "x": 173.5,
      "y": 368.5,
      "w": 128.2,
      "fs": 16,
      "s": "regular",
      "t": "Notice the pattern:"
    },
    {
      "x": 305.2,
      "y": 368.5,
      "w": 133.2,
      "fs": 16,
      "s": "bold",
      "t": "Pro - Anti - Hybrid"
    },
    {
      "x": 122.3,
      "y": 387.7,
      "w": 367.3,
      "fs": 16,
      "s": "regular",
      "t": "This pattern helps you navigate/memorize the letters."
    },
    {
      "x": 47.1,
      "y": 426.1,
      "w": 517.7,
      "fs": 16,
      "s": "regular",
      "t": "If you only remember that A has prospins, you can infer that B has antispins."
    },
    {
      "x": 55.4,
      "y": 445.3,
      "w": 501.3,
      "fs": 16,
      "s": "regular",
      "t": "If you only remember that B has antispins, you can infer that C is a hybrid."
    },
    {
      "x": 64.7,
      "y": 464.5,
      "w": 482.6,
      "fs": 16,
      "s": "bolditalic",
      "t": "If you memorize only one letter in each group, you know all of them."
    },
    {
      "x": 16.4,
      "y": 502.9,
      "w": 540.3,
      "fs": 16,
      "s": "regular",
      "t": "Next let’s look at G, H, and I. Their handpaths are Tog-Same and they move from"
    },
    {
      "x": 560.2,
      "y": 502.9,
      "w": 31.2,
      "fs": 16,
      "s": "regular",
      "t": "β→β"
    },
    {
      "x": 591.4,
      "y": 502.9,
      "w": 4.2,
      "fs": 16,
      "s": "regular",
      "t": ":"
    },
    {
      "x": 72.7,
      "y": 610.8,
      "w": 68.7,
      "fs": 16.8,
      "s": "italic",
      "t": "Tog-Same"
    },
    {
      "x": 68.9,
      "y": 279.3,
      "w": 74.2,
      "fs": 16.8,
      "s": "italic",
      "t": "Split-Same"
    },
    {
      "x": 200.8,
      "y": 207,
      "w": 25.1,
      "fs": 15.6,
      "s": "italic",
      "t": "Pro"
    },
    {
      "x": 319,
      "y": 207,
      "w": 29.7,
      "fs": 15.6,
      "s": "italic",
      "t": "Anti"
    },
    {
      "x": 428.9,
      "y": 207,
      "w": 50.9,
      "fs": 15.6,
      "s": "italic",
      "t": "Hybrid"
    },
    {
      "x": 200.8,
      "y": 536,
      "w": 25.1,
      "fs": 15.6,
      "s": "italic",
      "t": "Pro"
    },
    {
      "x": 319,
      "y": 536,
      "w": 29.7,
      "fs": 15.6,
      "s": "italic",
      "t": "Anti"
    },
    {
      "x": 428.9,
      "y": 536,
      "w": 50.9,
      "fs": 15.6,
      "s": "italic",
      "t": "Hybrid"
    },
    {
      "x": 87.4,
      "y": 258.1,
      "w": 42.4,
      "fs": 20.4,
      "s": "bold",
      "t": "α→α"
    }
  ],
  "lt1-dj-ek-fl": [
    {
      "x": 119.7,
      "y": 91,
      "w": 285.4,
      "fs": 15.5,
      "s": "regular",
      "t": "Now let’s look at the letters that move from"
    },
    {
      "x": 408.5,
      "y": 91,
      "w": 85.6,
      "fs": 15.5,
      "s": "regular",
      "t": "β→α or α→β."
    },
    {
      "x": 65.9,
      "y": 128.2,
      "w": 478.8,
      "fs": 15.5,
      "s": "bold",
      "t": "All pictographs can be rotated or mirrored without changing letters"
    },
    {
      "x": 544.7,
      "y": 128.2,
      "w": 3.2,
      "fs": 15.5,
      "s": "regular",
      "t": "."
    },
    {
      "x": 39.6,
      "y": 165.4,
      "w": 128.5,
      "fs": 15.5,
      "s": "regular",
      "t": "These can be either"
    },
    {
      "x": 171.5,
      "y": 165.4,
      "w": 54.7,
      "fs": 15.5,
      "s": "italic",
      "t": "Tog-Opp"
    },
    {
      "x": 229.6,
      "y": 165.4,
      "w": 14.6,
      "fs": 15.5,
      "s": "regular",
      "t": "or"
    },
    {
      "x": 247.7,
      "y": 165.4,
      "w": 59.8,
      "fs": 15.5,
      "s": "italic",
      "t": "Split-Opp"
    },
    {
      "x": 310.8,
      "y": 165.4,
      "w": 263.4,
      "fs": 15.5,
      "s": "regular",
      "t": "depending on which α/β you start from."
    },
    {
      "x": 67.4,
      "y": 488.5,
      "w": 473.8,
      "fs": 15.5,
      "s": "regular",
      "t": "These compound letters can’t be self-combined like the previous letters."
    },
    {
      "x": 25.1,
      "y": 525.7,
      "w": 558.5,
      "fs": 15.5,
      "s": "regular",
      "t": "Instead, they combine with other compound letters to form the words DJ, EK, and FL."
    },
    {
      "x": 104.6,
      "y": 562.9,
      "w": 402.9,
      "fs": 15.5,
      "s": "regular",
      "t": "Here they are along with cute phrases to help you remember:"
    },
    {
      "x": 166.7,
      "y": 206.7,
      "w": 60,
      "fs": 17,
      "s": "italic",
      "t": "Tog-Opp"
    },
    {
      "x": 423.2,
      "y": 206.7,
      "w": 65.6,
      "fs": 17,
      "s": "italic",
      "t": "Split-Opp"
    },
    {
      "x": 85.5,
      "y": 241.5,
      "w": 17.7,
      "fs": 13,
      "s": "italic",
      "t": "Iso"
    },
    {
      "x": 171.5,
      "y": 241.5,
      "w": 24.8,
      "fs": 13,
      "s": "italic",
      "t": "Anti"
    },
    {
      "x": 253.1,
      "y": 241.5,
      "w": 42.4,
      "fs": 13,
      "s": "italic",
      "t": "Hybrid"
    },
    {
      "x": 369.4,
      "y": 241.5,
      "w": 17.7,
      "fs": 13,
      "s": "italic",
      "t": "Iso"
    },
    {
      "x": 455.4,
      "y": 241.5,
      "w": 24.8,
      "fs": 13,
      "s": "italic",
      "t": "Anti"
    },
    {
      "x": 536.9,
      "y": 241.5,
      "w": 42.4,
      "fs": 13,
      "s": "italic",
      "t": "Hybrid"
    },
    {
      "x": 52.2,
      "y": 716.2,
      "w": 26.3,
      "fs": 14,
      "s": "italic",
      "t": "DJ -"
    },
    {
      "x": 81.9,
      "y": 716.2,
      "w": 65.5,
      "fs": 14,
      "s": "italic",
      "t": "Disco Jam"
    },
    {
      "x": 234.1,
      "y": 716.2,
      "w": 27.5,
      "fs": 14,
      "s": "italic",
      "t": "EK -"
    },
    {
      "x": 264.9,
      "y": 716.2,
      "w": 106.1,
      "fs": 14,
      "s": "italic",
      "t": "Exploding Kitten"
    },
    {
      "x": 455.4,
      "y": 716.2,
      "w": 25.5,
      "fs": 14,
      "s": "italic",
      "t": "FL -"
    },
    {
      "x": 484.2,
      "y": 716.2,
      "w": 80.7,
      "fs": 14,
      "s": "italic",
      "t": "Fruity Loops"
    }
  ],
  "lt1-mp-nq-or-stuv": [
    {
      "x": 54.5,
      "y": 49.7,
      "w": 30.6,
      "fs": 16,
      "s": "regular",
      "t": "Γ→Γ"
    },
    {
      "x": 88.3,
      "y": 50.7,
      "w": 233.4,
      "fs": 15,
      "s": "regular",
      "t": "motions can combine with any other"
    },
    {
      "x": 328.3,
      "y": 49.7,
      "w": 30.6,
      "fs": 16,
      "s": "regular",
      "t": "Γ→Γ"
    },
    {
      "x": 362.1,
      "y": 50.7,
      "w": 195.4,
      "fs": 15,
      "s": "regular",
      "t": "motion to create lots of words!"
    },
    {
      "x": 134.2,
      "y": 68.7,
      "w": 255.7,
      "fs": 15,
      "s": "regular",
      "t": "First let’s look at the compound letters ("
    },
    {
      "x": 389.9,
      "y": 68.7,
      "w": 79.1,
      "fs": 15,
      "s": "italic",
      "t": "Quarter-Opp"
    },
    {
      "x": 469,
      "y": 68.7,
      "w": 8.8,
      "fs": 15,
      "s": "regular",
      "t": ")."
    },
    {
      "x": 88.2,
      "y": 313.3,
      "w": 435.6,
      "fs": 15,
      "s": "regular",
      "t": "When combined as a continuous motion, these form MP, NQ, and OR."
    },
    {
      "x": 158.5,
      "y": 331.3,
      "w": 295.1,
      "fs": 15,
      "s": "regular",
      "t": "Here they are along with a memorable phrase:"
    },
    {
      "x": 130.3,
      "y": 502.9,
      "w": 90.1,
      "fs": 15,
      "s": "regular",
      "t": "The final Γ→Γ"
    },
    {
      "x": 223.9,
      "y": 502.9,
      "w": 47,
      "fs": 15,
      "s": "regular",
      "t": "group ("
    },
    {
      "x": 270.9,
      "y": 502.9,
      "w": 87.5,
      "fs": 15,
      "s": "italic",
      "t": "Quarter-Same"
    },
    {
      "x": 358.4,
      "y": 502.9,
      "w": 123.4,
      "fs": 15,
      "s": "regular",
      "t": ") has 4 instead of 3."
    },
    {
      "x": 31.5,
      "y": 520.9,
      "w": 546.9,
      "fs": 15,
      "s": "regular",
      "t": "It may seem like U and V contain the same information, but it’s impossible to rotate or"
    },
    {
      "x": 31.5,
      "y": 538.9,
      "w": 515,
      "fs": 15,
      "s": "regular",
      "t": "reflect U in order to turn it into V, and vica-versa, so they must be disambiguated."
    },
    {
      "x": 250.6,
      "y": 462.5,
      "w": 103.9,
      "fs": 16,
      "s": "italic",
      "t": "NQ - Never Quit"
    },
    {
      "x": 434.3,
      "y": 462.5,
      "w": 103.4,
      "fs": 16,
      "s": "italic",
      "t": "OR - Open Road"
    },
    {
      "x": 47.6,
      "y": 462.5,
      "w": 121.2,
      "fs": 16,
      "s": "italic",
      "t": "MP - Magic Potion"
    },
    {
      "x": 105.6,
      "y": 675.7,
      "w": 162.3,
      "fs": 16,
      "s": "regular",
      "t": "Note that all four have a"
    },
    {
      "x": 271.4,
      "y": 675.7,
      "w": 49.6,
      "fs": 16,
      "s": "italic",
      "t": "leading"
    },
    {
      "x": 324.6,
      "y": 675.7,
      "w": 74.9,
      "fs": 16,
      "s": "regular",
      "t": "hand and a"
    },
    {
      "x": 403,
      "y": 675.7,
      "w": 62.1,
      "fs": 16,
      "s": "italic",
      "t": "following"
    },
    {
      "x": 468.7,
      "y": 675.7,
      "w": 37.7,
      "fs": 16,
      "s": "regular",
      "t": "hand."
    },
    {
      "x": 35.2,
      "y": 694.9,
      "w": 61.8,
      "fs": 16,
      "s": "regular",
      "t": "Here, the"
    },
    {
      "x": 100.6,
      "y": 694.9,
      "w": 36,
      "fs": 16,
      "s": "bold",
      "t": "right"
    },
    {
      "x": 140.1,
      "y": 694.9,
      "w": 11.3,
      "fs": 16,
      "s": "regular",
      "t": "is"
    },
    {
      "x": 155,
      "y": 694.9,
      "w": 79.2,
      "fs": 16,
      "s": "regular",
      "t": "leading and"
    },
    {
      "x": 237.7,
      "y": 694.9,
      "w": 24.5,
      "fs": 16,
      "s": "bold",
      "t": "left"
    },
    {
      "x": 265.7,
      "y": 694.9,
      "w": 311,
      "fs": 16,
      "s": "regular",
      "t": "is following, but it’s equally valid to swap this."
    },
    {
      "x": 101.3,
      "y": 714.1,
      "w": 176.4,
      "fs": 16,
      "s": "bolditalic",
      "t": "U leads with an isolation"
    },
    {
      "x": 281.3,
      "y": 714.1,
      "w": 229.4,
      "fs": 16,
      "s": "regular",
      "t": "(a round motion like the letter U)."
    },
    {
      "x": 106.3,
      "y": 733.3,
      "w": 172,
      "fs": 16,
      "s": "bolditalic",
      "t": "V leads with an antispin"
    },
    {
      "x": 281.8,
      "y": 733.3,
      "w": 223.9,
      "fs": 16,
      "s": "regular",
      "t": "(a spiky motion like the letter V)."
    },
    {
      "x": 113.2,
      "y": 752.5,
      "w": 385.5,
      "fs": 16,
      "s": "regular",
      "t": "These self-combine to form the words SS, TT, UU, and VV."
    },
    {
      "x": 209,
      "y": 96.5,
      "w": 17.7,
      "fs": 13,
      "s": "italic",
      "t": "Iso"
    },
    {
      "x": 295,
      "y": 96.5,
      "w": 24.8,
      "fs": 13,
      "s": "italic",
      "t": "Anti"
    },
    {
      "x": 376.6,
      "y": 96.5,
      "w": 42.4,
      "fs": 13,
      "s": "italic",
      "t": "Hybrid"
    },
    {
      "x": 126.7,
      "y": 130.9,
      "w": 33.9,
      "fs": 14,
      "s": "italic",
      "t": "(Opp)"
    },
    {
      "x": 74.8,
      "y": 593.4,
      "w": 42.1,
      "fs": 14,
      "s": "italic",
      "t": "(Same)"
    }
  ],
  "lt2-wxyz": [
    {
      "x": 27.9,
      "y": 449.9,
      "w": 558,
      "fs": 16,
      "s": "regular",
      "t": "When we arrange them in continuous motions, we get the words WΣYΘ and XΔZΩ."
    },
    {
      "x": 93.2,
      "y": 52.5,
      "w": 427,
      "fs": 15,
      "s": "regular",
      "t": "So far we’ve learned how to move between α↔β and between Γ↔Γ."
    },
    {
      "x": 31.5,
      "y": 70.5,
      "w": 512.3,
      "fs": 15,
      "s": "regular",
      "t": "In order to travel between these two modes, we can use a Type 2 Motion called a"
    },
    {
      "x": 547.1,
      "y": 70.5,
      "w": 31.7,
      "fs": 15,
      "s": "bold",
      "t": "Shift"
    },
    {
      "x": 578.9,
      "y": 70.5,
      "w": 3.1,
      "fs": 15,
      "s": "regular",
      "t": "."
    },
    {
      "x": 46.3,
      "y": 106.5,
      "w": 520.8,
      "fs": 15,
      "s": "bold",
      "t": "A Shift (or single shift) is the combination of one shift and one static motion."
    },
    {
      "x": 131.1,
      "y": 124.5,
      "w": 351.3,
      "fs": 15,
      "s": "regular",
      "t": "Their letters are organized by end position: α, β, then Γ."
    },
    {
      "x": 140.5,
      "y": 142.5,
      "w": 332.5,
      "fs": 15,
      "s": "regular",
      "t": "These can also be categorized by opening or closing."
    },
    {
      "x": 83.4,
      "y": 720.8,
      "w": 446.9,
      "fs": 16,
      "s": "regular",
      "t": "Though simple at this stage, these motions become more complex"
    },
    {
      "x": 63,
      "y": 740,
      "w": 487.8,
      "fs": 16,
      "s": "regular",
      "t": "as we dive deeper into the Alphabet and add rotations to static motions."
    },
    {
      "x": 208.9,
      "y": 3.6,
      "w": 96.8,
      "fs": 35,
      "s": "italic",
      "t": "Type 2"
    },
    {
      "x": 313.4,
      "y": 3.6,
      "w": 91.5,
      "fs": 35,
      "s": "bolditalic",
      "t": "- Shift"
    },
    {
      "x": 121.6,
      "y": 416.5,
      "w": 37.5,
      "fs": 13,
      "s": "italic",
      "t": "Sigma"
    },
    {
      "x": 214.4,
      "y": 415.8,
      "w": 31.5,
      "fs": 13,
      "s": "italic",
      "t": "Delta"
    },
    {
      "x": 362,
      "y": 416.7,
      "w": 33.5,
      "fs": 13,
      "s": "italic",
      "t": "Theta"
    },
    {
      "x": 447.2,
      "y": 416.6,
      "w": 42,
      "fs": 13,
      "s": "italic",
      "t": "Omega"
    }
  ],
  "lt3-dash-letters": [
    {
      "x": 11.5,
      "y": 761.1,
      "w": 592.6,
      "fs": 15,
      "s": "bolditalic",
      "t": "When initially learning, it’s useful to pause at the halfway point to ensure proper timing."
    },
    {
      "x": 71,
      "y": 61.6,
      "w": 80.8,
      "fs": 15,
      "s": "bold",
      "t": "Cross-Shifts"
    },
    {
      "x": 155.1,
      "y": 61.6,
      "w": 144.7,
      "fs": 15,
      "s": "regular",
      "t": "use the same letters as"
    },
    {
      "x": 303.1,
      "y": 61.6,
      "w": 38.6,
      "fs": 15,
      "s": "bold",
      "t": "Shifts"
    },
    {
      "x": 341.7,
      "y": 61.6,
      "w": 201.1,
      "fs": 15,
      "s": "regular",
      "t": ", but each letter is followed by a"
    },
    {
      "x": 92.2,
      "y": 79.6,
      "w": 429.3,
      "fs": 15,
      "s": "regular",
      "t": "dash to indicate that the other hand is dashing into its end position."
    },
    {
      "x": 161.1,
      "y": 97.6,
      "w": 292.6,
      "fs": 15,
      "s": "regular",
      "t": "They are spoken as “W Dash” or “Sigma Dash”."
    },
    {
      "x": 116.6,
      "y": 115.6,
      "w": 380.6,
      "fs": 15,
      "s": "italic",
      "t": "A dash symbol in the glyph equals a dash arrow on the graph."
    },
    {
      "x": 107.2,
      "y": 133.6,
      "w": 399.3,
      "fs": 15,
      "s": "bolditalic",
      "t": "The end position for each Type 2/3 letter remains the same."
    },
    {
      "x": 48.8,
      "y": 445.5,
      "w": 80.8,
      "fs": 15,
      "s": "bold",
      "t": "Cross-Shifts"
    },
    {
      "x": 132.9,
      "y": 445.5,
      "w": 437.2,
      "fs": 15,
      "s": "regular",
      "t": "can be tricky to remember. It helps to first picture the corresponding"
    },
    {
      "x": 48.1,
      "y": 463.5,
      "w": 522.7,
      "fs": 15,
      "s": "regular",
      "t": "Type 2 pictograph, then add the dash arrow without changing any other variables."
    },
    {
      "x": 63.9,
      "y": 499.5,
      "w": 321.1,
      "fs": 15,
      "s": "regular",
      "t": "Just like we did with hands, let’s break down some"
    },
    {
      "x": 388.3,
      "y": 499.5,
      "w": 80.8,
      "fs": 15,
      "s": "bold",
      "t": "Cross-Shifts"
    },
    {
      "x": 472.5,
      "y": 499.5,
      "w": 82.5,
      "fs": 15,
      "s": "regular",
      "t": "step-by-step."
    },
    {
      "x": 152.7,
      "y": 523.9,
      "w": 26.6,
      "fs": 13.3,
      "s": "italic",
      "t": "start"
    },
    {
      "x": 253.7,
      "y": 523.9,
      "w": 44.5,
      "fs": 13.3,
      "s": "italic",
      "t": "halfway"
    },
    {
      "x": 375.9,
      "y": 523.9,
      "w": 20.2,
      "fs": 13.3,
      "s": "italic",
      "t": "end"
    },
    {
      "x": 161.5,
      "y": 0.2,
      "w": 96.8,
      "fs": 35,
      "s": "italic",
      "t": "Type 3"
    },
    {
      "x": 266,
      "y": 0.2,
      "w": 186.3,
      "fs": 35,
      "s": "bolditalic",
      "t": "- Cross-Shift"
    },
    {
      "x": 439.3,
      "y": 408.4,
      "w": 50,
      "fs": 12,
      "s": "italic",
      "t": "Om Dash"
    },
    {
      "x": 130.6,
      "y": 408.2,
      "w": 47.9,
      "fs": 12,
      "s": "italic",
      "t": "Sig Dash"
    },
    {
      "x": 213.1,
      "y": 408.2,
      "w": 48.8,
      "fs": 12,
      "s": "italic",
      "t": "Del Dash"
    },
    {
      "x": 351.2,
      "y": 408.2,
      "w": 50.5,
      "fs": 12,
      "s": "italic",
      "t": "The Dash"
    }
  ],
  "lt456-phi-psi-lambda": [
    {
      "x": 86.3,
      "y": 207.4,
      "w": 42,
      "fs": 15,
      "s": "regular",
      "t": "With a"
    },
    {
      "x": 131.6,
      "y": 207.4,
      "w": 34.4,
      "fs": 15,
      "s": "bold",
      "t": "Dash"
    },
    {
      "x": 166,
      "y": 207.4,
      "w": 352.4,
      "fs": 15,
      "s": "regular",
      "t": ", one prop executes a dash and the other remains static."
    },
    {
      "x": 130,
      "y": 243.4,
      "w": 344.8,
      "fs": 15,
      "s": "regular",
      "t": "“Lambda” can be further shortened by calling it “Lam”."
    },
    {
      "x": 177.1,
      "y": 497.9,
      "w": 23.9,
      "fs": 15,
      "s": "regular",
      "t": "In a"
    },
    {
      "x": 204.3,
      "y": 497.9,
      "w": 70.9,
      "fs": 15,
      "s": "bolditalic",
      "t": "Dual-Dash"
    },
    {
      "x": 275.2,
      "y": 497.9,
      "w": 158.6,
      "fs": 15,
      "s": "regular",
      "t": ", both hands are dashing."
    },
    {
      "x": 192,
      "y": 515.9,
      "w": 226.9,
      "fs": 15,
      "s": "regular",
      "t": "The end position remains the same."
    },
    {
      "x": 137.5,
      "y": 734.1,
      "w": 23.9,
      "fs": 15,
      "s": "regular",
      "t": "In a"
    },
    {
      "x": 164.6,
      "y": 734.1,
      "w": 38.4,
      "fs": 15,
      "s": "bold",
      "t": "Static"
    },
    {
      "x": 206.4,
      "y": 734.1,
      "w": 267,
      "fs": 15,
      "s": "regular",
      "t": "motion, both hands remain still for a step."
    },
    {
      "x": 141.4,
      "y": 752.1,
      "w": 328.1,
      "fs": 15,
      "s": "regular",
      "t": "These become more interesting when adding turns."
    },
    {
      "x": 195.8,
      "y": 566.6,
      "w": 96.8,
      "fs": 35,
      "s": "italic",
      "t": "Type 6"
    },
    {
      "x": 300.3,
      "y": 566.6,
      "w": 108,
      "fs": 35,
      "s": "bolditalic",
      "t": "- Static"
    },
    {
      "x": 205.4,
      "y": 11.8,
      "w": 96.8,
      "fs": 35,
      "s": "italic",
      "t": "Type 4"
    },
    {
      "x": 309.9,
      "y": 11.8,
      "w": 98.6,
      "fs": 35,
      "s": "bolditalic",
      "t": "- Dash"
    },
    {
      "x": 153,
      "y": 294.3,
      "w": 96.8,
      "fs": 35,
      "s": "italic",
      "t": "Type 5"
    },
    {
      "x": 257.5,
      "y": 294.3,
      "w": 184.5,
      "fs": 35,
      "s": "bolditalic",
      "t": "- Dual-Dash"
    },
    {
      "x": 201.7,
      "y": 462.8,
      "w": 48.3,
      "fs": 12,
      "s": "italic",
      "t": "Phi Dash"
    },
    {
      "x": 283.2,
      "y": 462.8,
      "w": 46.7,
      "fs": 12,
      "s": "italic",
      "t": "Psi Dash"
    },
    {
      "x": 359.9,
      "y": 462.8,
      "w": 55.4,
      "fs": 12,
      "s": "italic",
      "t": "Lam Dash"
    },
    {
      "x": 288.8,
      "y": 351.1,
      "w": 34.7,
      "fs": 17,
      "s": "bold",
      "t": "β→β"
    },
    {
      "x": 369.6,
      "y": 351.1,
      "w": 33,
      "fs": 17,
      "s": "bold",
      "t": "Γ→Γ"
    },
    {
      "x": 208.2,
      "y": 351.1,
      "w": 35.3,
      "fs": 17,
      "s": "bold",
      "t": "α→α"
    },
    {
      "x": 208.5,
      "y": 67.5,
      "w": 35,
      "fs": 17,
      "s": "bold",
      "t": "β→α"
    },
    {
      "x": 288.5,
      "y": 67.5,
      "w": 35,
      "fs": 17,
      "s": "bold",
      "t": "α→β"
    },
    {
      "x": 369.5,
      "y": 67.5,
      "w": 33,
      "fs": 17,
      "s": "bold",
      "t": "Γ→Γ"
    },
    {
      "x": 216.2,
      "y": 180.2,
      "w": 19.1,
      "fs": 13,
      "s": "italic",
      "t": "Phi"
    },
    {
      "x": 296.4,
      "y": 180.2,
      "w": 17.4,
      "fs": 13,
      "s": "italic",
      "t": "Psi"
    },
    {
      "x": 359.7,
      "y": 180.2,
      "w": 48.9,
      "fs": 13,
      "s": "italic",
      "t": "Lambda"
    },
    {
      "x": 208.1,
      "y": 710.2,
      "w": 34.7,
      "fs": 13,
      "s": "italic",
      "t": "Alpha"
    },
    {
      "x": 293,
      "y": 710.2,
      "w": 26.6,
      "fs": 13,
      "s": "italic",
      "t": "Beta"
    },
    {
      "x": 362.6,
      "y": 710.2,
      "w": 47.2,
      "fs": 13,
      "s": "italic",
      "t": "Gamma"
    }
  ],
  "words": [
    {
      "x": 140.9,
      "y": 50,
      "w": 332,
      "fs": 15,
      "s": "regular",
      "t": "Let’s create more complex words using pictographs!"
    },
    {
      "x": 55.1,
      "y": 77.6,
      "w": 503.7,
      "fs": 15,
      "s": "regular",
      "t": "In order to perform the words in this section correctly without finger-spinning,"
    },
    {
      "x": 125.2,
      "y": 95.6,
      "w": 363.4,
      "fs": 15,
      "s": "regular",
      "t": "you must be familiar with negative space and body turns."
    },
    {
      "x": 71.5,
      "y": 123.2,
      "w": 470.8,
      "fs": 15,
      "s": "regular",
      "t": "If you finger-spin instead of using negative space, you’ll lose precision and"
    },
    {
      "x": 36.7,
      "y": 141.2,
      "w": 540.4,
      "fs": 15,
      "s": "regular",
      "t": "the ability to check your thumb orientation on each step to see if you’re still on track."
    },
    {
      "x": 22.8,
      "y": 168.8,
      "w": 568.2,
      "fs": 15,
      "s": "regular",
      "t": "We’ll use the word AABB as an example. Here are three variations on AABB, starting from"
    },
    {
      "x": 70.5,
      "y": 186.8,
      "w": 273.1,
      "fs": 15,
      "s": "regular",
      "t": "different thumb orientations. Use staves or"
    },
    {
      "x": 346.9,
      "y": 186.8,
      "w": 61.6,
      "fs": 15,
      "s": "bold",
      "t": "red/blue"
    },
    {
      "x": 411.8,
      "y": 186.8,
      "w": 131.5,
      "fs": 15,
      "s": "regular",
      "t": "pens to follow along."
    },
    {
      "x": 7.8,
      "y": 547,
      "w": 596.4,
      "fs": 15,
      "s": "regular",
      "t": "As you execute these with staves, notice that each of these sequences requires a different type"
    },
    {
      "x": 76.4,
      "y": 565,
      "w": 459.3,
      "fs": 15,
      "s": "regular",
      "t": "of negative space, either above/below the shoulder or behind the elbow."
    },
    {
      "x": 47.9,
      "y": 601,
      "w": 552.2,
      "fs": 15,
      "s": "regular",
      "t": "The execution of the same word can feel completely different depending on factors like"
    },
    {
      "x": 24.9,
      "y": 619,
      "w": 562.2,
      "fs": 15,
      "s": "regular",
      "t": "the start position, rotation direction, and thumb orientation. That’s why it’s necessary to"
    },
    {
      "x": 112.9,
      "y": 637,
      "w": 386.3,
      "fs": 15,
      "s": "regular",
      "t": "draw the full sequence with pictographs for complete clarity."
    },
    {
      "x": 134.2,
      "y": 673,
      "w": 255.8,
      "fs": 15,
      "s": "bold",
      "t": "The Alphabet is primarily a system of"
    },
    {
      "x": 393.3,
      "y": 673,
      "w": 81,
      "fs": 15,
      "s": "bolditalic",
      "t": "pictographs"
    },
    {
      "x": 474.3,
      "y": 673,
      "w": 3.5,
      "fs": 15,
      "s": "bold",
      "t": ","
    },
    {
      "x": 128.8,
      "y": 691,
      "w": 354.4,
      "fs": 15,
      "s": "bold",
      "t": "organized by letters for convenient communication."
    },
    {
      "x": 65.1,
      "y": 727,
      "w": 517.9,
      "fs": 15,
      "s": "regular",
      "t": "The letters do not give all of the information, and are merely intended to separate"
    },
    {
      "x": 8.1,
      "y": 745,
      "w": 595.8,
      "fs": 15,
      "s": "regular",
      "t": "motion combinations into categories which can be further clarified with detailed pictographs."
    },
    {
      "x": 14.6,
      "y": 225.3,
      "w": 50.7,
      "fs": 14,
      "s": "italic",
      "t": "Thumbs"
    },
    {
      "x": 18.9,
      "y": 271.1,
      "w": 42.1,
      "fs": 14,
      "s": "bolditalic",
      "t": "in | in"
    },
    {
      "x": 9.1,
      "y": 366.6,
      "w": 61.2,
      "fs": 14,
      "s": "bolditalic",
      "t": "out | out"
    },
    {
      "x": 13.9,
      "y": 466.6,
      "w": 51.6,
      "fs": 14,
      "s": "bolditalic",
      "t": "in | out"
    }
  ],
  "permutations": [
    {
      "x": 51.2,
      "y": 46,
      "w": 504.9,
      "fs": 15,
      "s": "regular",
      "t": "When a word ends on a variation of its start position, we can repeat it to trace a"
    },
    {
      "x": 39.6,
      "y": 64,
      "w": 528.2,
      "fs": 15,
      "s": "regular",
      "t": "complimentary pattern, eventually returning back to the start position (aka home)."
    },
    {
      "x": 68.5,
      "y": 82,
      "w": 203.9,
      "fs": 15,
      "s": "regular",
      "t": "This type of sequence is called a"
    },
    {
      "x": 275.7,
      "y": 82,
      "w": 27.9,
      "fs": 15,
      "s": "bolditalic",
      "t": "CAP,"
    },
    {
      "x": 306.9,
      "y": 82,
      "w": 22.4,
      "fs": 15,
      "s": "regular",
      "t": "aka"
    },
    {
      "x": 332.6,
      "y": 82,
      "w": 206.2,
      "fs": 15,
      "s": "bold",
      "t": "Continuous Assembly Pattern."
    },
    {
      "x": 94.4,
      "y": 118,
      "w": 210.7,
      "fs": 15,
      "s": "regular",
      "t": "Three common types of CAPs are"
    },
    {
      "x": 308.4,
      "y": 118,
      "w": 56.3,
      "fs": 15,
      "s": "italic",
      "t": "Mirrored"
    },
    {
      "x": 364.7,
      "y": 118,
      "w": 3.1,
      "fs": 15,
      "s": "regular",
      "t": ","
    },
    {
      "x": 371.1,
      "y": 118,
      "w": 49,
      "fs": 15,
      "s": "italic",
      "t": "Rotated"
    },
    {
      "x": 420,
      "y": 118,
      "w": 30.4,
      "fs": 15,
      "s": "regular",
      "t": ", and"
    },
    {
      "x": 453.7,
      "y": 118,
      "w": 56.2,
      "fs": 15,
      "s": "italic",
      "t": "Swapped"
    },
    {
      "x": 509.9,
      "y": 118,
      "w": 3.1,
      "fs": 15,
      "s": "regular",
      "t": "."
    },
    {
      "x": 425.1,
      "y": 418.2,
      "w": 174.9,
      "fs": 15,
      "s": "regular",
      "t": "In a rotated CAP, each repe-"
    },
    {
      "x": 391.4,
      "y": 436.2,
      "w": 206.4,
      "fs": 15,
      "s": "regular",
      "t": "tition ends in a rotated variation"
    },
    {
      "x": 417.9,
      "y": 454.2,
      "w": 153.4,
      "fs": 15,
      "s": "regular",
      "t": "on its previous position."
    },
    {
      "x": 431.4,
      "y": 490.2,
      "w": 162.4,
      "fs": 15,
      "s": "regular",
      "t": "In this example, there is a"
    },
    {
      "x": 392.1,
      "y": 508.2,
      "w": 16.6,
      "fs": 15,
      "s": "regular",
      "t": "90"
    },
    {
      "x": 409.3,
      "y": 508.2,
      "w": 187.7,
      "fs": 15,
      "s": "regular",
      "t": "° rotation, finally returning to"
    },
    {
      "x": 394.2,
      "y": 526.2,
      "w": 200.7,
      "fs": 15,
      "s": "regular",
      "t": "the start position (aka “home”)."
    },
    {
      "x": 37.4,
      "y": 190.6,
      "w": 140.3,
      "fs": 15,
      "s": "regular",
      "t": "In a mirrored CAP, the"
    },
    {
      "x": 26.4,
      "y": 208.6,
      "w": 161.8,
      "fs": 15,
      "s": "regular",
      "t": "second repetition’s picto-"
    },
    {
      "x": 34.8,
      "y": 226.6,
      "w": 145,
      "fs": 15,
      "s": "regular",
      "t": "graphs reflect the first,"
    },
    {
      "x": 25.9,
      "y": 244.6,
      "w": 162.8,
      "fs": 15,
      "s": "regular",
      "t": "which changes their rota-"
    },
    {
      "x": 62.3,
      "y": 262.6,
      "w": 89.9,
      "fs": 15,
      "s": "regular",
      "t": "tion direction."
    },
    {
      "x": 40.6,
      "y": 298.6,
      "w": 133.4,
      "fs": 15,
      "s": "regular",
      "t": "In this example, each"
    },
    {
      "x": 19.3,
      "y": 316.6,
      "w": 176.1,
      "fs": 15,
      "s": "regular",
      "t": "column is reflected across a"
    },
    {
      "x": 53.3,
      "y": 334.6,
      "w": 108,
      "fs": 15,
      "s": "regular",
      "t": "horizontal plane."
    },
    {
      "x": 45.1,
      "y": 630.6,
      "w": 148.1,
      "fs": 15,
      "s": "regular",
      "t": "In a swapped CAP, each"
    },
    {
      "x": 35.9,
      "y": 648.6,
      "w": 166,
      "fs": 15,
      "s": "regular",
      "t": "repetition swaps the roles"
    },
    {
      "x": 77.4,
      "y": 666.6,
      "w": 12.5,
      "fs": 15,
      "s": "regular",
      "t": "of"
    },
    {
      "x": 93.2,
      "y": 666.6,
      "w": 33.8,
      "fs": 15,
      "s": "bold",
      "t": "right"
    },
    {
      "x": 127,
      "y": 666.6,
      "w": 7.3,
      "fs": 15,
      "s": "regular",
      "t": "/"
    },
    {
      "x": 134.3,
      "y": 666.6,
      "w": 22.9,
      "fs": 15,
      "s": "bold",
      "t": "left"
    },
    {
      "x": 157.3,
      "y": 666.6,
      "w": 3.1,
      "fs": 15,
      "s": "regular",
      "t": "."
    },
    {
      "x": 37,
      "y": 702.6,
      "w": 163.7,
      "fs": 15,
      "s": "regular",
      "t": "Though the prop’s shapes"
    },
    {
      "x": 41,
      "y": 720.6,
      "w": 155.7,
      "fs": 15,
      "s": "regular",
      "t": "look the same, this swap"
    },
    {
      "x": 38.8,
      "y": 738.6,
      "w": 160.1,
      "fs": 15,
      "s": "regular",
      "t": "changes the body motion"
    },
    {
      "x": 78.9,
      "y": 756.6,
      "w": 79.8,
      "fs": 15,
      "s": "regular",
      "t": "significantly."
    },
    {
      "x": 453.7,
      "y": 377.3,
      "w": 85.2,
      "fs": 30,
      "s": "heading",
      "t": "Rotated"
    },
    {
      "x": 66.8,
      "y": 587,
      "w": 96.6,
      "fs": 30,
      "s": "heading",
      "t": "Swapped"
    },
    {
      "x": 51.8,
      "y": 154.4,
      "w": 94.8,
      "fs": 30,
      "s": "heading",
      "t": "Mirrored"
    }
  ],
  "reversals": [
    {
      "x": 375.6,
      "y": 571.9,
      "w": 135,
      "fs": 30,
      "s": "heading",
      "t": "Full-reversal"
    },
    {
      "x": 342.2,
      "y": 620.8,
      "w": 230.4,
      "fs": 14,
      "s": "regular",
      "t": "With a full-reversal, the prop and hand"
    },
    {
      "x": 306.2,
      "y": 637.6,
      "w": 280.3,
      "fs": 14,
      "s": "regular",
      "t": "retrace their paths and return to their previous"
    },
    {
      "x": 306.2,
      "y": 654.4,
      "w": 230.8,
      "fs": 14,
      "s": "regular",
      "t": "position, as if going backwards in time."
    },
    {
      "x": 342.2,
      "y": 688,
      "w": 224.1,
      "fs": 14,
      "s": "regular",
      "t": "Because this contains a prop reversal,"
    },
    {
      "x": 306.2,
      "y": 704.8,
      "w": 27.6,
      "fs": 14,
      "s": "regular",
      "t": "the “"
    },
    {
      "x": 333.9,
      "y": 704.8,
      "w": 9.3,
      "fs": 14,
      "s": "bold",
      "t": "R"
    },
    {
      "x": 343.1,
      "y": 704.8,
      "w": 6.9,
      "fs": 14,
      "s": "regular",
      "t": "/"
    },
    {
      "x": 350,
      "y": 704.8,
      "w": 9.3,
      "fs": 14,
      "s": "bold",
      "t": "R"
    },
    {
      "x": 359.3,
      "y": 704.8,
      "w": 227.2,
      "fs": 14,
      "s": "regular",
      "t": "” draws attention to it. This succinctly"
    },
    {
      "x": 306.2,
      "y": 721.6,
      "w": 249.6,
      "fs": 14,
      "s": "regular",
      "t": "indicates to the performer that something"
    },
    {
      "x": 306.2,
      "y": 738.4,
      "w": 130,
      "fs": 14,
      "s": "regular",
      "t": "unusual is happening."
    },
    {
      "x": 322.5,
      "y": 185,
      "w": 267.4,
      "fs": 14,
      "s": "regular",
      "t": "With a hand reversal, the hand returns to the"
    },
    {
      "x": 286.5,
      "y": 201.8,
      "w": 307.2,
      "fs": 14,
      "s": "regular",
      "t": "point it came from previously, without changing the"
    },
    {
      "x": 286.5,
      "y": 218.6,
      "w": 308.1,
      "fs": 14,
      "s": "regular",
      "t": "prop’s direction of spin. Relative to the center point,"
    },
    {
      "x": 286.5,
      "y": 235.4,
      "w": 310.1,
      "fs": 14,
      "s": "regular",
      "t": "this changes a prospin to an antispin and vica-versa."
    },
    {
      "x": 322.5,
      "y": 269,
      "w": 275.3,
      "fs": 14,
      "s": "regular",
      "t": "This is the simplest and least disruptive rever-"
    },
    {
      "x": 286.5,
      "y": 285.8,
      "w": 303.4,
      "fs": 14,
      "s": "regular",
      "t": "sal. We’ve already used it in the previous examples."
    },
    {
      "x": 147.8,
      "y": 54.2,
      "w": 316.3,
      "fs": 15,
      "s": "regular",
      "t": "Reversals open up a huge number of possibilities!"
    },
    {
      "x": 196.8,
      "y": 72.2,
      "w": 218.3,
      "fs": 15,
      "s": "regular",
      "t": "There are three types of reversals:"
    },
    {
      "x": 365.8,
      "y": 125.3,
      "w": 149.4,
      "fs": 30,
      "s": "heading",
      "t": "Hand-reversal"
    },
    {
      "x": 438.6,
      "y": 445.7,
      "w": 25.9,
      "fs": 15,
      "s": "italic",
      "t": "Anti"
    },
    {
      "x": 464.5,
      "y": 445.7,
      "w": 12.6,
      "fs": 15,
      "s": "regular",
      "t": "→"
    },
    {
      "x": 477.1,
      "y": 445.7,
      "w": 21.9,
      "fs": 15,
      "s": "italic",
      "t": "Pro"
    },
    {
      "x": 57.7,
      "y": 389.1,
      "w": 257.4,
      "fs": 14,
      "s": "regular",
      "t": "With a prop reversal, the hand continues to"
    },
    {
      "x": 21.7,
      "y": 405.9,
      "w": 286.9,
      "fs": 14,
      "s": "regular",
      "t": "the next point while the prop reverses direction."
    },
    {
      "x": 21.7,
      "y": 422.7,
      "w": 259.8,
      "fs": 14,
      "s": "regular",
      "t": "This reversal also changes a prospin into an"
    },
    {
      "x": 21.7,
      "y": 439.5,
      "w": 141.1,
      "fs": 14,
      "s": "regular",
      "t": "antispin and vica-versa."
    },
    {
      "x": 57.7,
      "y": 473.1,
      "w": 237.1,
      "fs": 14,
      "s": "regular",
      "t": "Since a prop reversal is less intuitive, an"
    },
    {
      "x": 21.7,
      "y": 489.9,
      "w": 5.3,
      "fs": 14,
      "s": "regular",
      "t": "“"
    },
    {
      "x": 27,
      "y": 489.9,
      "w": 9.3,
      "fs": 14,
      "s": "bold",
      "t": "R"
    },
    {
      "x": 36.2,
      "y": 489.9,
      "w": 6.9,
      "fs": 14,
      "s": "regular",
      "t": "/"
    },
    {
      "x": 43.1,
      "y": 489.9,
      "w": 9.3,
      "fs": 14,
      "s": "bold",
      "t": "R"
    },
    {
      "x": 52.3,
      "y": 489.9,
      "w": 234.3,
      "fs": 14,
      "s": "regular",
      "t": "” is added in the corresponding color in"
    },
    {
      "x": 21.7,
      "y": 506.7,
      "w": 228.4,
      "fs": 14,
      "s": "regular",
      "t": "between the pictographs to indicate it."
    },
    {
      "x": 95.2,
      "y": 341.3,
      "w": 139.8,
      "fs": 30,
      "s": "heading",
      "t": "Prop-reversal"
    },
    {
      "x": 121.9,
      "y": 116.6,
      "w": 21.9,
      "fs": 15,
      "s": "italic",
      "t": "Pro"
    },
    {
      "x": 143.8,
      "y": 116.6,
      "w": 12.6,
      "fs": 15,
      "s": "regular",
      "t": "→"
    },
    {
      "x": 156.3,
      "y": 116.6,
      "w": 25.9,
      "fs": 15,
      "s": "italic",
      "t": "Anti"
    },
    {
      "x": 438.6,
      "y": 342.3,
      "w": 21.9,
      "fs": 15,
      "s": "italic",
      "t": "Pro"
    },
    {
      "x": 460.4,
      "y": 342.3,
      "w": 12.6,
      "fs": 15,
      "s": "regular",
      "t": "→"
    },
    {
      "x": 473,
      "y": 342.3,
      "w": 25.9,
      "fs": 15,
      "s": "italic",
      "t": "Anti"
    },
    {
      "x": 121.8,
      "y": 220.4,
      "w": 25.9,
      "fs": 15,
      "s": "italic",
      "t": "Anti"
    },
    {
      "x": 147.8,
      "y": 220.4,
      "w": 12.6,
      "fs": 15,
      "s": "regular",
      "t": "→"
    },
    {
      "x": 160.4,
      "y": 220.4,
      "w": 21.9,
      "fs": 15,
      "s": "italic",
      "t": "Pro"
    },
    {
      "x": 125.4,
      "y": 567,
      "w": 21.9,
      "fs": 15,
      "s": "italic",
      "t": "Pro"
    },
    {
      "x": 147.3,
      "y": 567,
      "w": 12.6,
      "fs": 15,
      "s": "regular",
      "t": "→"
    },
    {
      "x": 159.9,
      "y": 567,
      "w": 21.9,
      "fs": 15,
      "s": "italic",
      "t": "Pro"
    },
    {
      "x": 118.3,
      "y": 674.9,
      "w": 25.9,
      "fs": 15,
      "s": "italic",
      "t": "Anti"
    },
    {
      "x": 144.2,
      "y": 674.9,
      "w": 12.6,
      "fs": 15,
      "s": "regular",
      "t": "→"
    },
    {
      "x": 156.8,
      "y": 674.9,
      "w": 25.9,
      "fs": 15,
      "s": "italic",
      "t": "Anti"
    }
  ],
  "examples-abc": [
    {
      "x": 172.4,
      "y": 49.2,
      "w": 267.2,
      "fs": 15,
      "s": "regular",
      "t": "Let’s practice reversals and permutations."
    },
    {
      "x": 80.2,
      "y": 67.2,
      "w": 451.7,
      "fs": 15,
      "s": "regular",
      "t": "We’ll use AABB as an example to explore different reversal placements."
    },
    {
      "x": 26.3,
      "y": 85.2,
      "w": 559.4,
      "fs": 15,
      "s": "bold",
      "t": "These start from the same alpha start position. Interpret it from the first motions."
    },
    {
      "x": 409.1,
      "y": 578,
      "w": 179.1,
      "fs": 15,
      "s": "regular",
      "t": "As demonstrated with these"
    },
    {
      "x": 373.1,
      "y": 596,
      "w": 203.5,
      "fs": 15,
      "s": "regular",
      "t": "examples, a reversal in different"
    },
    {
      "x": 373.1,
      "y": 614,
      "w": 217.6,
      "fs": 15,
      "s": "regular",
      "t": "locations in the word can lead to a"
    },
    {
      "x": 373.1,
      "y": 632,
      "w": 169,
      "fs": 15,
      "s": "regular",
      "t": "notably different outcome."
    },
    {
      "x": 409.1,
      "y": 668,
      "w": 189.2,
      "fs": 15,
      "s": "regular",
      "t": "The word AABB is not limited"
    },
    {
      "x": 373.1,
      "y": 686,
      "w": 206.2,
      "fs": 15,
      "s": "regular",
      "t": "to one presentation, it is a broad"
    },
    {
      "x": 373.1,
      "y": 704,
      "w": 226.7,
      "fs": 15,
      "s": "regular",
      "t": "category of sequences that includes"
    },
    {
      "x": 373.1,
      "y": 722,
      "w": 199.4,
      "fs": 15,
      "s": "regular",
      "t": "those letters with variations on"
    },
    {
      "x": 373.1,
      "y": 740,
      "w": 209.5,
      "fs": 15,
      "s": "regular",
      "t": "reversals and thumb orientation."
    },
    {
      "x": 45.7,
      "y": 278.8,
      "w": 179.1,
      "fs": 15,
      "s": "regular",
      "t": "Let’s place the reversals in a"
    },
    {
      "x": 9.7,
      "y": 296.8,
      "w": 217.4,
      "fs": 15,
      "s": "regular",
      "t": "different place. This time we’ll put"
    },
    {
      "x": 9.7,
      "y": 314.8,
      "w": 112.7,
      "fs": 15,
      "s": "regular",
      "t": "them after step 1."
    },
    {
      "x": 45.7,
      "y": 350.8,
      "w": 185.3,
      "fs": 15,
      "s": "regular",
      "t": "This will put our left hand on"
    },
    {
      "x": 9.7,
      "y": 368.8,
      "w": 220.6,
      "fs": 15,
      "s": "regular",
      "t": "top after step 4, so we’ll repeat the"
    },
    {
      "x": 9.7,
      "y": 386.8,
      "w": 208.2,
      "fs": 15,
      "s": "regular",
      "t": "sequence again mirrored (with a"
    },
    {
      "x": 9.7,
      "y": 404.8,
      "w": 236.7,
      "fs": 15,
      "s": "regular",
      "t": "reversal after step 5) to return to our"
    },
    {
      "x": 9.7,
      "y": 422.8,
      "w": 147.9,
      "fs": 15,
      "s": "regular",
      "t": "original home position."
    },
    {
      "x": 45.7,
      "y": 458.8,
      "w": 52.3,
      "fs": 15,
      "s": "regular",
      "t": "This is a"
    },
    {
      "x": 101.3,
      "y": 458.8,
      "w": 85.9,
      "fs": 15,
      "s": "italic",
      "t": "Mirrored CAP."
    },
    {
      "x": 410.2,
      "y": 119.5,
      "w": 190.8,
      "fs": 15,
      "s": "regular",
      "t": "Here’s an AABB in which both"
    },
    {
      "x": 374.2,
      "y": 137.5,
      "w": 91.4,
      "fs": 15,
      "s": "regular",
      "t": "staves execute"
    },
    {
      "x": 469,
      "y": 137.5,
      "w": 101.4,
      "fs": 15,
      "s": "bold",
      "t": "prop-reversals"
    },
    {
      "x": 573.7,
      "y": 137.5,
      "w": 30.3,
      "fs": 15,
      "s": "regular",
      "t": "after"
    },
    {
      "x": 374.2,
      "y": 155.5,
      "w": 187.4,
      "fs": 15,
      "s": "regular",
      "t": "steps 2 and 4, notated by an “"
    },
    {
      "x": 561.6,
      "y": 155.5,
      "w": 27.4,
      "fs": 15,
      "s": "bold",
      "t": "R/R"
    },
    {
      "x": 589.1,
      "y": 155.5,
      "w": 5.6,
      "fs": 15,
      "s": "regular",
      "t": "”"
    },
    {
      "x": 374.2,
      "y": 173.5,
      "w": 177,
      "fs": 15,
      "s": "regular",
      "t": "in between the pictographs."
    },
    {
      "x": 410.2,
      "y": 191.5,
      "w": 181.3,
      "fs": 15,
      "s": "regular",
      "t": "This requires negative space"
    },
    {
      "x": 374.2,
      "y": 209.5,
      "w": 162.2,
      "fs": 15,
      "s": "regular",
      "t": "or a body turn to execute."
    },
    {
      "x": 58.6,
      "y": 535.3,
      "w": 498,
      "fs": 15,
      "s": "regular",
      "t": "Now let’s look at another variation of AABB*2 with reversals after steps 3 & 7:"
    }
  ],
  "misc-permutations": [
    {
      "x": 47.2,
      "y": 70.3,
      "w": 514.5,
      "fs": 15,
      "s": "regular",
      "t": "In this example of DJII, the graphs in the second repetition (steps 5-8) mirror the"
    },
    {
      "x": 72.2,
      "y": 88.3,
      "w": 372,
      "fs": 15,
      "s": "regular",
      "t": "graphs in the first repetition (steps 1-4), classifiying it as a"
    },
    {
      "x": 447.5,
      "y": 88.3,
      "w": 85.9,
      "fs": 15,
      "s": "italic",
      "t": "Mirrored CAP."
    },
    {
      "x": 95.5,
      "y": 736.8,
      "w": 420.9,
      "fs": 15,
      "s": "regular",
      "t": "In this example of KIEC, the colors are swapped in the second half,"
    },
    {
      "x": 159.4,
      "y": 754.7,
      "w": 131.3,
      "fs": 15,
      "s": "regular",
      "t": "so it is classified as a"
    },
    {
      "x": 294,
      "y": 754.7,
      "w": 158.6,
      "fs": 15,
      "s": "italic",
      "t": "Swapped & Mirrored CAP."
    },
    {
      "x": 12.2,
      "y": 396.2,
      "w": 69.4,
      "fs": 15,
      "s": "italic",
      "t": "Swapped &"
    },
    {
      "x": 22.4,
      "y": 414.2,
      "w": 49,
      "fs": 15,
      "s": "italic",
      "t": "Rotated"
    },
    {
      "x": 34.2,
      "y": 432.2,
      "w": 25.2,
      "fs": 15,
      "s": "italic",
      "t": "CAP"
    },
    {
      "x": 24,
      "y": 143.3,
      "w": 32.3,
      "fs": 20,
      "s": "regular",
      "t": "DJII"
    },
    {
      "x": 20.5,
      "y": 343.3,
      "w": 45.9,
      "fs": 20,
      "s": "regular",
      "t": "BBLF"
    },
    {
      "x": 26.6,
      "y": 543.3,
      "w": 41.8,
      "fs": 20,
      "s": "regular",
      "t": "KIEC"
    }
  ]
};
