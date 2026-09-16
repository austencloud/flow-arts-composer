import type { GlossaryEntry } from "../types/glossary.js";

export const GLOSSARY: Record<string, GlossaryEntry> = {
  alpha: {
    definition:
      "A placement where the two hands are at opposite grid points (180 degrees apart). Note: the Type 6 letter α (lowercase) shares this name because a static letter is essentially a held placement: the same concept. When someone asks 'what is alpha?', context determines whether they mean the placement (hands opposite) or the letter (both hands static at opposite points).",
    examples: [
      "alpha1: hands at N and S",
      "alpha3: hands at E and W",
      "The Type 6 letter α represents holding an alpha placement with no motion",
    ],
    relatedTerms: ["beta", "gamma", "placement"],
    category: "placement",
  },
  beta: {
    definition:
      "A placement where both hands are at the same grid point (0 degrees apart). The Type 6 letter β (lowercase) shares this name. It represents holding a beta placement with no motion, which is also a natural start placement for 'together' patterns.",
    examples: ["beta1: both hands at N", "beta5: both hands at NE"],
    relatedTerms: ["alpha", "gamma", "placement"],
    category: "placement",
  },
  gamma: {
    definition:
      "A placement where the hands form a right angle (90 degrees apart on adjacent grid points). The Type 6 letter γ (lowercase) shares this name. It represents holding a gamma placement with no motion.",
    examples: [
      "gamma1: hands at N and E",
      "gamma5: hands at NE and NW (box mode)",
    ],
    relatedTerms: ["alpha", "beta", "placement"],
    category: "placement",
  },
  zeta: {
    definition:
      "A placement where the hands form an obtuse angle (greater than 90 degrees). Introduced in Level 5 with skewed grid mode.",
    examples: [
      "One hand cardinal, one intercardinal, forming ~135 degree angle",
    ],
    relatedTerms: ["eta", "skewed", "placement"],
    category: "placement",
  },
  eta: {
    definition:
      "A placement where the hands form an acute angle (less than 90 degrees). Introduced in Level 5 with skewed grid mode.",
    examples: [
      "One hand cardinal, one intercardinal, forming ~45 degree angle",
    ],
    relatedTerms: ["zeta", "skewed", "placement"],
    category: "placement",
  },
  tau: {
    definition:
      "A placement where one hand is at the center grid point and the other is at a non-center point. Introduced in Level 6 with centric grid mode.",
    examples: [
      "One hand at center, one hand at N",
      "One hand at center, one hand at NE",
    ],
    relatedTerms: ["terra", "centric", "placement"],
    category: "placement",
  },
  terra: {
    definition:
      "A placement where both hands are at the center grid point. Introduced in Level 6 with centric grid mode.",
    examples: ["Both hands stacked at the center of the grid"],
    relatedTerms: ["tau", "centric", "placement"],
    category: "placement",
  },
  placement: {
    definition:
      "Where the two hands are relative to each other on the grid. Defined by the angle between them. Seven placements exist across the level system: alpha, beta, gamma, zeta, eta, tau, and terra. Older TKA material calls this a 'position'; this system now follows VTG's term, 'placement'.",
    examples: [
      "Alpha = hands opposite (180°)",
      "Beta = hands together (0°)",
      "Gamma = right angle (90°)",
    ],
    relatedTerms: ["alpha", "beta", "gamma", "zeta", "eta", "tau", "terra"],
    category: "general",
  },
  "home-placement": {
    definition:
      "The starting hand placement a sequence uses as its reference point. Returning home means the final hand locations reconnect to the starting locations. A fully realized LOOP can require additional passes for the prop orientations to close as well.",
    examples: [
      "A LOOP returns from its final step to the same hand locations where it began",
      "A placement cycle may close before the prop-orientation cycle does",
    ],
    relatedTerms: ["placement", "loop", "sequence"],
    category: "placement",
  },
  grid: {
    definition:
      "The spatial reference used to place hands and draw motion paths in a TKA pictograph. Diamond and box are the two 4-point grid modes. Together they form an 8-point grid around a shared center.",
    examples: [
      "Diamond mode uses the four cardinal directions",
      "Box mode uses the four intercardinal directions",
      "The merged grid combines all eight directions",
    ],
    relatedTerms: ["diamond", "box", "center", "hand-point", "outer-point"],
    category: "grid",
  },
  "grid-mode": {
    definition:
      "The set of grid locations available to a pictograph. Diamond uses cardinal points, box uses intercardinal points, centric includes the center point, and skewed combines one cardinal point with one intercardinal point.",
    examples: [
      "Diamond is the default 4-point mode",
      "Skewed combines diamond and box locations at Level 5",
      "Centric introduces the center point at Level 6",
    ],
    relatedTerms: ["grid", "diamond", "box", "centric", "skewed"],
    category: "grid",
  },
  "hand-point": {
    definition:
      "One of the four locations where a hand can be placed in a grid mode. Each hand point sits halfway between the center and the matching outer point. Diamond hand points are cardinal; box hand points are intercardinal.",
    examples: [
      "North, east, south, and west are diamond hand points",
      "Northeast, southeast, southwest, and northwest are box hand points",
    ],
    relatedTerms: [
      "grid",
      "center",
      "outer-point",
      "cardinal",
      "intercardinal",
    ],
    category: "grid",
  },
  "outer-point": {
    definition:
      "A marker at the outer edge of the grid, aligned with a hand point and farther from the center. Outer points show the grid's full extent rather than a Level 1 hand location.",
    examples: [
      "A diamond grid has outer markers north, east, south, and west of center",
      "A box grid places its outer markers on the four diagonals",
    ],
    relatedTerms: ["grid", "center", "hand-point", "diamond", "box"],
    category: "grid",
  },
  tka: {
    definition:
      "The Kinetic Alphabet is a notation system for dual-wielded flow arts, built around double staves. A pictograph records one step by showing both hands, both props, their grid placements, and their motion paths.",
    examples: [
      "A TKA word is written as a sequence of lettered pictographs",
      "Double staves provide visible thumb-end and pinky-end references",
    ],
    relatedTerms: ["pictograph", "letter", "word", "staff-reference"],
    category: "general",
  },
  letter: {
    definition:
      "The fundamental unit of TKA notation. Each letter classifies the two hands' motion families for one step. The Level 1 pictograph dataframe contains 47 base letters across six numbered types; higher levels may register extensions, such as the Level 6 Tau-Dash letter, before their variations enter that dataframe.",
    examples: [
      "A is a Type 1 letter",
      "Σ is a Type 2 letter",
      "α is a Type 6 letter",
      "τ- is an extended Type 4 letter",
    ],
    relatedTerms: ["pictograph", "variation", "letter-type", "word"],
    category: "general",
  },
  "letter-type": {
    definition:
      "One of six numbered classifications determined by the two hands' motion families: shift, dash, or static. Types describe the hand-path combination, not a difficulty rank and not merely how many hands move.",
    examples: [
      "Type 1: both hands shift",
      "Type 3: one hand shifts and one dashes",
      "Type 6: both hands remain static",
    ],
    relatedTerms: ["type-1", "type-2", "type-3", "type-4", "type-5", "type-6"],
    category: "general",
  },
  word: {
    definition:
      "A sequence of TKA letters that spells out a choreographic phrase. Each letter in the word is one step of motion. Words can be any length and may require bridge letters between certain transitions.",
    examples: [
      "STORM is a 5-letter bridge-free word (5 steps)",
      "MONSTROUS is a 9-letter bridge-free word",
      "TRUST is a 5-letter word",
      "DJ is a 2-letter compound word",
    ],
    relatedTerms: ["letter", "sequence", "bridge", "compound-letter"],
    category: "general",
  },
  sequence: {
    definition:
      "An ordered series of pictographs representing choreography. A sequence includes a start placement (step 0) followed by one pictograph per letter in the word. The visual output is called a choreo card.",
    examples: [
      "A 4-letter word produces a sequence with 5 pictographs (start + 4 steps)",
      "Sequences can be rendered as grid layouts or single-row strips",
    ],
    relatedTerms: ["word", "pictograph", "step", "loop"],
    category: "general",
  },
  "compound-letter": {
    definition:
      "A complementary pair of TKA letters whose two steps complete a motion cycle and return to the starting placement type. Despite the singular name, a compound letter is written as a pair.",
    examples: [
      "DJ moves beta to alpha, then alpha to beta",
      "EK and FL complete the same placement cycle with different prop rotations",
      "MP, NQ, and OR are gamma-to-gamma compound pairs",
    ],
    relatedTerms: ["compound-word", "letter", "loop", "vtg"],
    category: "general",
  },
  "compound-word": {
    definition:
      "A two-letter TKA word built from a compound pair. The Level 1 curriculum uses DJ, EK, and FL to practice complete cycles from different starting phases and execution paths.",
    examples: [
      "DJ is the pro/pro compound word",
      "EK is the anti/anti compound word",
      "FL is the pro/anti hybrid compound word",
    ],
    relatedTerms: ["compound-letter", "word", "sequence"],
    category: "sequence",
  },
  bridge: {
    definition:
      "A letter automatically inserted between two letters in a word when no direct transition exists between them. The sequence generator handles bridge insertion transparently.",
    examples: [
      "Σ inserted between B and O when no B→O transition exists",
      "Bridge letters appear in the generated sequence but not in the word spelling",
    ],
    relatedTerms: ["word", "sequence", "transition"],
    category: "general",
  },
  level: {
    definition:
      "A progressive difficulty tier that introduces new placements, grid modes, turn counts, and orientations. Level 1: 0 turns only. Level 2: whole turns (0-3). Level 3: half turns and float. Level 4: interradial orientations and quarter turns (clockIn, clockOut, counterIn, counterOut: completes orientation freedom at 8 values). Level 5: skewed grid (zeta, eta placements, 8-point grid, skew+/- shifts). Level 6: centric grid with center point (tau, terra placements, hash hand path, completes the single grid, not yet implemented). Level 7: conjoined grids (dual grids sharing a junction point, new placement combinations, bridges to 3D). Level 8: atomics (two props on different spinning planes simultaneously). Level 9: Rubik's cube tech (in-between points across intersecting planes, same expansion skewed brought to single-plane).",
    examples: [
      "Level 1: alpha, beta, gamma placements with 0 turns only",
      "Level 4: interradial orientations and quarter turns double angular precision",
      "Level 5: introduces zeta, eta placements with skewed grid",
      "Level 6: introduces center point with centric grid (completes single-grid 2D)",
      "Level 7: conjoined grids expand the spatial canvas with dual grids, bridging to 3D",
      "Level 8: one prop on wall plane, one on wheel plane (atomics)",
      "Level 9: skewed-equivalent access to in-between points across multiple planes",
    ],
    relatedTerms: [
      "turns",
      "placement",
      "orientation",
      "spinning-plane",
      "atomic",
      "rubiks-cube",
      "conjoined-grid",
    ],
    category: "general",
  },
  glyph: {
    definition:
      "A visual notation element displayed on a pictograph. Glyphs annotate the pictograph with additional information beyond the prop and arrow placements. The TKA glyph's turns column (high/low slots) is laid out per PADS.",
    examples: [
      "TKA glyph: shows the letter name and turn numbers",
      "TnD glyph: shows timing & direction relationship between hands",
      "Placement glyph: shows start and end placements",
    ],
    relatedTerms: ["pictograph", "pads", "vtg", "tka"],
    category: "notation",
  },
  "dash-notation": {
    definition:
      "The hyphen suffix that is part of every Type 3 and Type 5 letter name. It identifies the cross-shift or dual-dash letter derived from a base letter; it does not add a dash motion to an otherwise unchanged letter.",
    examples: [
      "W- is read W-Dash and belongs to Type 3",
      "Σ- is read Sigma-Dash",
      "Φ- is read Phi-Dash and belongs to Type 5",
    ],
    relatedTerms: ["glyph", "type-3", "type-5"],
    category: "notation",
  },
  pads: {
    definition:
      "The Pro, Anti, Dash, Static priority order used to place two different motion types in a pictograph's high and low turn slots. Pro ranks above anti, anti above dash, and dash above static. Matching motion types use the left hand in the high slot and the right hand in the low slot, except S and T use the leading and following hands. Type 2 uses shift-high/static-low; Type 3 uses shift-high/dash-low.",
    examples: [
      "C-High-One: pro hand has 1 turn, anti hand has 0 (high = pro per PADS)",
      "R(fl, 0): float marker in high slot means the float was applied to the pro hand (pro-high / anti-low for hybrids)",
      "W(1, 0): shift has 1 turn, static has 0 (high = shift since shift beats static)",
      "Φ(1, 0): dash has 1 turn, static has 0 (high = dash since dash beats static)",
      "S-High-One: leading hand has 1 turn (leading goes high for S and T)",
    ],
    relatedTerms: [
      "glyph",
      "pro",
      "anti",
      "dash",
      "static",
      "turns",
      "hybrid",
      "pictograph",
      "high-slot",
      "low-slot",
    ],
    category: "notation",
  },
  "high-slot": {
    definition:
      "The upper of the two turn-number slots positioned to the right of a letter in a TKA glyph. Which hand occupies the high slot is determined by PADS priority (Pro > Anti > Dash > Static) when motion types differ, by left-hand convention when motion types match, or by the leading hand for S and T. The corresponding low-slot sits below. TKA software handles slot placement automatically; the concept is defined in the Level 2 Guide (Glyphs / PADS section).",
    examples: [
      "In C(1,0), the '1' sits in the high slot and belongs to the pro motion (pro beats anti per PADS)",
      "In W(s,1,0), the '1' in the high slot belongs to the shift (shift beats static)",
      "In A(1,0), the '1' in the high slot belongs to the left hand (motion types match, so left goes high)",
    ],
    relatedTerms: ["low-slot", "pads", "glyph", "turns", "leading"],
    category: "notation",
  },
  "low-slot": {
    definition:
      "The lower of the two turn-number slots in a TKA glyph, sitting beneath the high-slot. Which hand occupies the low slot is determined by PADS priority (takes whichever motion type is lower: anti, dash, or static depending on the pair), by right-hand convention when motion types match, or by the following hand for S and T. Complement of high-slot.",
    examples: [
      "In C(1,0), the '0' in the low slot belongs to the anti motion",
      "In Φ(1,0), the '0' in the low slot belongs to the static hand (dash beats static)",
      "In A(1,0), the '0' in the low slot belongs to the right hand",
    ],
    relatedTerms: ["high-slot", "pads", "glyph", "turns", "following"],
    category: "notation",
  },
  "rotational-relationship": {
    definition:
      "The relationship between the rotation directions of two props that rotate during the same step. Same means both rotate in the same direction; Opp means they rotate in opposite directions. A same-dot or opp-dot records the relationship. Lambda (Λ, Λ-) and gamma (γ) use opening and closing instead.",
    examples: [
      "W(s,0,1): shift and static both rotate in the same direction → same-dot above the W",
      "X(o,1,1): shift and static rotate in opposite directions → opp-dot below the X",
      "Φ(1,0): only the dash rotates → no rotational relationship, no dot",
      "Λ(0,1,op): rotating hand is opening. Opening/closing replaces same/opp for Lambda",
    ],
    relatedTerms: ["same-dot", "opp-dot", "opening", "closing", "glyph"],
    category: "rotation",
  },
  "same-dot": {
    definition:
      "A dot above a letter showing that both rotating props turn in the same direction. It is read aloud as '[Letter]-Same.' Lambda (Λ, Λ-) and gamma (γ) use opening and closing instead.",
    examples: [
      "W(s,0,1): W with same-dot above, 0 turns on shift, 1 on static ('W-Same-Low-One')",
      "Ψ-(s,1,1): Psi-Dash with same-dot, 1 turn on each hand ('Psi-Dash-Same-One-One')",
      "α(s,1,1): alpha with same-dot, 1 turn each ('Alpha-Same-One-One')",
    ],
    relatedTerms: ["opp-dot", "rotational-relationship", "glyph"],
    category: "notation",
  },
  "opp-dot": {
    definition:
      "A dot placed below a letter in a TKA glyph to mark the rotational relationship as 'Opp': the two rotating props are spinning in opposite directions relative to each other. Encoded in code as an (o) parameter (e.g., X(o,1,1)). Read aloud as '[Letter]-Opp'. For example, X with an opp-dot is spoken 'X-Opp'. Same application scope as same-dot. Does NOT apply to Lambda or Gamma. Complement of same-dot.",
    examples: [
      "X(o,1,1): X with opp-dot below, 1 turn on each hand ('X-Opp-One-One')",
      "Θ-(o,1,1): Theta-Dash with opp-dot, 1 turn each ('Theta-Dash-Opp-One-One')",
      "Φ(o,1,1): Phi with opp-dot. Both dash and static rotating in opposite directions",
    ],
    relatedTerms: ["same-dot", "rotational-relationship", "glyph"],
    category: "notation",
  },
  opening: {
    definition:
      "A per-hand designation used by Lambda (Λ), Lambda-Dash (Λ-), and gamma (γ). Opening means the rotating hand's trajectory would continue through a pro shift toward an alpha placement. Each hand can be opening or closing independently.",
    examples: [
      "Λ(0,1,op): Lambda with 1-turn static hand whose trajectory would resolve to alpha",
      "Λ-(1,1,op,cl): Lambda-Dash with the left hand opening (toward alpha), right hand closing (toward beta)",
      "γ(op,op): gamma with both hands rotating such that both trajectories resolve to alpha",
    ],
    relatedTerms: ["closing", "glyph", "alpha", "rotational-relationship"],
    category: "notation",
  },
  closing: {
    definition:
      "A per-hand designation used by Lambda (Λ), Lambda-Dash (Λ-), and gamma (γ). Closing means the rotating hand's trajectory would continue through a pro shift toward a beta placement. Each hand can be opening or closing independently.",
    examples: [
      "Λ(0,1,cl): Lambda with 1-turn static hand whose trajectory would resolve to beta",
      "Λ-(1,1,cl,cl): Lambda-Dash with both hands closing (both trajectories resolve to beta)",
      "γ(cl,op): gamma with the left hand closing (toward beta), right hand opening (toward alpha)",
    ],
    relatedTerms: ["opening", "glyph", "beta", "rotational-relationship"],
    category: "notation",
  },
  "thumb-switch": {
    definition:
      "One flip of the thumb-end's reference orientation during a motion (e.g., thumb in → thumb out). The Level 2 Guide's primary pedagogical counting framework for teaching turns: every motion has a base thumb-switch count, and each additional turn adds exactly one more thumb switch. Provides a discrete, physically-verifiable check during practice rather than requiring students to track abstract angular rotation.",
    examples: [
      "Isolation (0-turn pro shift): 0 switches (thumb stays in throughout)",
      "Antispin (0-turn anti shift): 1 switch (in → out)",
      "1-turn antispin: 2 switches (in → out → in)",
      "2-turn antispin: 3 switches (in → out → in → out)",
      "Base dash: 1 switch (in → out)",
      "1-turn dash: 2 switches (in → out → in, back to start orientation)",
      "2-turn static: 2 switches (in → out → in)",
    ],
    relatedTerms: [
      "turns",
      "orientation",
      "pro",
      "anti",
      "dash",
      "static",
      "isolation",
    ],
    category: "rotation",
  },
  "linear-extension": {
    definition:
      "A repeated-dash choreo pattern where the hand travels in a straight line through the center to the opposite grid point with one turn added per step (a 1-turn dash executed on repeat). Named 'linear extension' because the pattern extends along a linear hand path rather than a curved one. Iconic because with double staves, the prop's two ends exhibit opposite rotation relationships relative to the linear hand path: one end behaves like a prospin, the other like an antispin. The Level 2 Guide recommends focusing on the antispin half to ensure the hand passes directly through the center point.",
    examples: [
      "Repeated 1-turn dashes: N→S→N→S with one turn per step",
      "The prop's two ends: one end prospins, the other antispins. Focus on the antispin end for timing",
    ],
    relatedTerms: ["dash", "turns", "thumb-switch"],
    category: "motion",
  },
  leading: {
    definition:
      "The hand that drives a Quarter-Same gamma motion. S, T, U, and V have a leading and following hand. In S and T, the leading hand occupies the glyph's high turn slot. In the hybrid letters U and V, PADS assigns the slots by pro and anti instead.",
    examples: [
      "S-High-One: leading hand has 1 turn (leading occupies the high slot for S and T)",
      "T-Low-One: following hand has 1 turn, leading has 0",
      "U-High-One: leading hand has 1 turn, but here the high slot is pro, not leader, because U is pro|anti hybrid",
    ],
    relatedTerms: [
      "following",
      "leader-follower",
      "gamma",
      "high-slot",
      "pads",
    ],
    category: "placement",
  },
  following: {
    definition:
      "The hand that trails the leading hand in a Quarter-Same gamma motion. In S and T, the following hand occupies the glyph's low turn slot. In U and V, PADS assigns the slots by pro and anti instead.",
    examples: [
      "S-Low-One: following hand has 1 turn",
      "T-High-One: leading hand has 1 turn, following has 0",
    ],
    relatedTerms: ["leading", "leader-follower", "gamma", "low-slot", "pads"],
    category: "placement",
  },
  prop: {
    definition:
      "The object manipulated while the hands move through the grid. TKA is built around a pair of staves gripped at their centers, so each prop has a thumb end and a pinky end. Other gripped static props can use the notation when their orientations remain readable; momentum-driven props require additional interpretation.",
    examples: [
      "A double-staff pictograph tracks both staff orientations",
      "A fan or club can use the same hand-placement vocabulary",
    ],
    relatedTerms: [
      "bilateral",
      "staff-reference",
      "thumb-end",
      "pinky-end",
      "rotation",
      "chirality",
      "buugeng",
    ],
    category: "general",
  },

  chirality: {
    definition:
      "Which of two mirror-image forms an asymmetric prop takes. A chiral prop is not superimposable on its own mirror image, so the shape has a handedness that rotation cannot change: orientation turns the prop, chirality decides which of the two shapes is being turned. Chirality is set per hand, so the left and right props can differ. In TKA it applies to the buugeng family, where the pair's relative chirality is what matters: two props of the same chirality stay visibly apart at a shared hand point, while two of opposite chirality nest into a single combined shape and take no separation offset. Neither form is the canonical one, so TKA names them A and B rather than treating one as a mirrored version of the other.",
    examples: [
      "Left A beside right B is the pairing that nests at a beta placement",
      "Left A beside right A stays separated, the same as any other matched pair",
      "Flipping one hand's chirality changes the shape drawn, not its rotation angle",
    ],
    relatedTerms: [
      "buugeng",
      "trigeng",
      "prop",
      "orientation",
      "beta",
      "bilateral",
    ],
    category: "general",
  },

  buugeng: {
    definition:
      "An S-shaped bilateral prop, gripped at its center like a staff. Its shape is asymmetric, so each buugeng has a chirality: one of two mirror-image forms. The TKA buugeng family is buugeng, big buugeng, and trigeng, and all three carry chirality the same way. A pair of buugeng is the case TKA models most directly, because two of opposite chirality combine into one shape while two of the same chirality do not.",
    examples: [
      "A buugeng pictograph tracks orientation and chirality separately",
      "Trigeng is the three-armed member of the same family",
    ],
    relatedTerms: [
      "chirality",
      "trigeng",
      "prop",
      "bilateral",
      "staff-reference",
    ],
    category: "general",
  },
  trigeng: {
    definition:
      "A three-armed geng. Its arms are geng curves rather than the triad's straight spokes, and they radiate from a center grip about 120 degrees apart, which gives it a near-square footprint where a buugeng's is a long straight span. It is asymmetric, so it carries chirality exactly as a buugeng does: two trigeng of opposite chirality nest and take no separation offset, while a matched pair does not. The prop picker files it as a variation of the triad, so it is reached through the triad card even though the render layer groups it with the buugeng family for chirality and spacing. It also carries a separation rule of its own: two trigeng at the same radiality but different end orientations sit together with no offset, whatever their chirality.",
    examples: [
      "Two trigeng of opposite chirality nest, the same as two buugeng",
      "Reaching trigeng in the prop picker means opening the triad card, not the buugeng card",
      "Two trigeng, both radial, ending on different orientations, take no beta offset",
    ],
    relatedTerms: ["buugeng", "chirality", "prop", "bilateral"],
    category: "general",
  },
  bilateral: {
    definition:
      "A prop held at its center point, extending equally on both sides of the hand. The prop rotates around its center, which is where the hand grips.",
    examples: ["Staff", "Double-ended baton"],
    relatedTerms: ["unilateral", "prop"],
    category: "general",
  },
  unilateral: {
    definition:
      "A prop held at one end, extending outward from the hand in one direction. The prop rotates around the grip point, which is at the edge of the prop.",
    examples: ["A single-ended club", "A one-ended baton"],
    relatedTerms: ["bilateral", "prop"],
    category: "general",
  },
  "staff-reference": {
    definition:
      "The end-label convention used to read a staff's orientation in TKA. With a center grip, the end nearest the thumb is the thumb end and the end nearest the pinky is the pinky end.",
    examples: [
      "The marked thumb end makes an in orientation unambiguous",
      "A thumb-end marker lets two visually similar staff placements be distinguished",
    ],
    relatedTerms: ["prop", "thumb-end", "pinky-end", "orientation"],
    category: "general",
  },
  "thumb-end": {
    definition:
      "The end of a center-gripped staff nearest the performer's thumb. TKA uses it as one of the two named references for reading prop orientation.",
    examples: [
      "A colored tape mark can identify the thumb end",
      "The thumb end may point in, out, clock, or counter",
    ],
    relatedTerms: ["pinky-end", "staff-reference", "orientation", "prop"],
    category: "general",
  },
  "pinky-end": {
    definition:
      "The end of a center-gripped staff nearest the performer's pinky. It is opposite the thumb end and provides the second named reference for staff orientation.",
    examples: [
      "The pinky end points opposite the thumb end",
      "A pictograph remains readable when either named end is tracked consistently",
    ],
    relatedTerms: ["thumb-end", "staff-reference", "orientation", "prop"],
    category: "general",
  },
  rotation: {
    definition:
      "The prop's change in angle during a step. TKA separates the base rotation produced by the hand path from any additional rotation measured in turns.",
    examples: [
      "A 0-turn shift still has base rotation",
      "A 1-turn dash adds 180 degrees of prop rotation to its straight hand path",
    ],
    relatedTerms: [
      "base-rotation",
      "turns",
      "motion-type",
      "clockwise",
      "counterclockwise",
    ],
    category: "rotation",
  },
  pro: {
    definition:
      "A prop rotation type where the prop rotates in the same direction as the hand's arc. Also called 'prospin'. At 0 turns, center-relative orientation is preserved (e.g. in stays in). This specific case is called an 'isolation', where the prop rotates with the arc creating the visual effect of a fixed point (distinct from float, which holds absolute spatial angle). At higher turn counts, the parity rules apply: even turns (0, 2) preserve orientation, odd turns (1, 3) reverse it.",
    examples: [
      "Hand shifts W to N clockwise, prop rotates clockwise with the arc",
      "0-turn pro: center-relative orientation preserved (isolation)",
      "1-turn pro: orientation reverses",
      "2-turn pro: orientation preserved again",
    ],
    relatedTerms: ["anti", "float", "isolation", "rotation"],
    category: "rotation",
  },
  anti: {
    definition:
      "A prop rotation type where the prop rotates opposite to the hand's arc. Also called 'antispin'. Creates petal-like patterns in continuous motion. At 0 turns, orientation reverses (e.g. in becomes out). At higher turn counts, the parity rules apply: even turns (0, 2) reverse orientation, odd turns (1, 3) preserve it, the opposite of pro.",
    examples: [
      "Hand shifts W to N clockwise, prop rotates counter-clockwise against the arc",
      "0-turn anti: orientation reverses (in becomes out)",
      "1-turn anti: orientation preserved",
      "2-turn anti: orientation reverses again",
    ],
    relatedTerms: ["pro", "float", "rotation"],
    category: "rotation",
  },
  isolation: {
    definition:
      "Pro motion at 0 turns. The prop's center-relative orientation remains constant as the hand moves: the prop rotates with the arc, creating the visual effect of a fixed point while the hand orbits around it. Distinct from float, where the prop literally holds its absolute spatial angle. With additional turns, the motion is still pro but no longer an isolation since the prop visibly rotates beyond the base rate.",
    examples: [
      "Pro at 0 turns during a shift: center-relative orientation preserved, prop appears fixed",
      "DJ compound uses isolation (pro/pro at 0 turns)",
    ],
    relatedTerms: ["pro", "turns", "rotation"],
    category: "rotation",
  },
  float: {
    definition:
      "A shift state where the prop holds its absolute spatial angle while the hand follows a curved path. Float is a separate binary state, not a negative turn count. Its center-relative orientation changes because the hand moves around the grid while the prop stays fixed in space.",
    examples: [
      "The hand shifts from west to north while the prop keeps the same absolute facing",
      "Float has no clockwise or counterclockwise turn value",
    ],
    relatedTerms: ["pro", "anti", "shift", "rotation", "orientation"],
    category: "rotation",
  },
  "motion-type": {
    definition:
      "The prop behavior attached to one hand's path during a step. A curved shift can be pro, anti, or float. Dash, hash, and static paths instead use no rotation at zero turns or clockwise and counterclockwise rotation when turns are added.",
    examples: [
      "Pro and anti compare prop rotation with a shift arc",
      "Float holds absolute angle during a shift",
      "A dash with turns records clockwise or counterclockwise rotation",
    ],
    relatedTerms: ["pro", "anti", "float", "shift", "dash", "hash", "static"],
    category: "motion",
  },
  static: {
    definition:
      "A hand motion type where the hand stays at its current grid point. The prop may still rotate (with turns), but the hand does not move.",
    examples: [
      "Type 6 letters (α, β, γ) have both hands static",
      "Type 2 letters have one static hand and one shifting hand",
    ],
    relatedTerms: ["shift", "dash", "motion-type"],
    category: "motion",
  },
  shift: {
    definition:
      "A hand motion type where the hand arcs along the perimeter to an adjacent grid point. The curved arc is what distinguishes shifts from dashes and hashes (straight lines). The prop behavior during a shift depends on the rotation type: pro rotates with the arc, anti rotates against it, float holds absolute spatial angle. On a 4-point grid, adjacent points are 90° apart; on an 8-point grid, 45° apart.",
    examples: [
      "N to E is a shift (4-point grid, 90° arc)",
      "NE to SE is a shift (8-point grid, 45° arc)",
      "Type 1 and Type 2 letters use shifts",
    ],
    relatedTerms: ["static", "dash", "pro", "anti", "float", "motion-type"],
    category: "motion",
  },
  dash: {
    definition:
      "A hand motion type where the hand moves in a straight line to the diametrically opposite grid point (180 degrees across the grid). At 0 turns, the prop does not rotate: it translates along the straight path without spinning. Unlike shifts (curved arcs), dashes follow straight lines, so pro/anti/float distinctions do not apply. At 1+ turns, the prop rotates CW or CCW during the traverse.",
    examples: [
      "N to S is a dash",
      "NE to SW is a dash",
      "Type 4 and Type 5 letters use dashes",
    ],
    relatedTerms: ["static", "shift", "hash", "motion-type"],
    category: "motion",
  },
  "hand-path": {
    definition:
      "The trajectory a hand traces when moving between grid points. Four types: static (stay), shift (curved arc along perimeter to adjacent point), dash (straight line to opposite point), hash (straight line to/from center). The geometric shape of the path matters: shifts follow curved arcs (enabling pro/anti/float distinctions), while dashes and hashes follow straight lines (no pro/anti/float). The hand path determines the base rotation behavior.",
    examples: [
      "W to N clockwise is a curved shift arc",
      "N to S is a straight-line dash",
      "N to center is a hash (half-dash)",
    ],
    relatedTerms: [
      "shift",
      "dash",
      "hash",
      "static",
      "pro",
      "anti",
      "float",
      "base-rotation",
    ],
    category: "motion",
  },
  turns: {
    definition:
      "Additional prop rotation beyond the motion's base rotation. One turn equals 180 degrees. Level 1 uses zero turns, Level 2 adds whole turns, Level 3 adds half turns, and Level 4 adds quarter turns. The standard level palettes begin at 0, but 0 is not a mathematical lower bound: VTG writes ratios hand:prop, and for a hand:prop ratio H:P with a moving hand, TKA turns = (P/H - 1) / 2. The Shape Matrix therefore uses -0.25 for 2:1. Float remains a separate shift state with no numeric turn count and is the exceptional 1:0 ratio, not -0.5 turns.",
    examples: [
      "0 turns on a pro shift uses only its base rotation",
      "1 turn adds 180 degrees",
      "0.5 turns adds 90 degrees",
      "0.25 turns adds 45 degrees",
      "-0.25 turns is the Shape Matrix's TKA value for the VTG 2:1 ratio",
      "Float is the TKA state corresponding to the VTG 1:0 ratio",
    ],
    relatedTerms: [
      "rotation",
      "base-rotation",
      "pro",
      "anti",
      "float",
      "level",
    ],
    category: "rotation",
  },
  orientation: {
    definition:
      "The facing direction of a prop relative to the performer's center point. Eight possible values across the level system. Cardinal orientations (all levels): in (toward center), out (away from center), clock (clockwise-facing), counter (counter-clockwise-facing). Interradial orientations (Level 4+): clockIn, clockOut, counterIn, counterOut, the four orientations at 45 degrees between cardinal orientations.",
    examples: [
      "Pro at 0 turns preserves orientation (in stays in)",
      "Anti at 0 turns switches orientation (in becomes out)",
      "Level 4 adds clockIn, clockOut, counterIn, counterOut between base orientations",
    ],
    relatedTerms: ["pro", "anti", "turns", "rotation", "level"],
    category: "rotation",
  },
  in: {
    definition:
      "A radial prop orientation where the marked end faces toward the performer's center. In describes the prop's facing direction, not the hand's grid location or direction of rotation.",
    examples: [
      "A staff at the north hand point can face in toward the center",
      "A 0-turn pro shift preserves an in orientation",
    ],
    relatedTerms: ["out", "clock", "counter", "radial", "orientation"],
    category: "rotation",
  },
  out: {
    definition:
      "A radial prop orientation where the marked end faces away from the performer's center. Out is the radial opposite of in.",
    examples: [
      "A staff at the north hand point can face out away from the center",
      "A 0-turn anti shift can change in to out",
    ],
    relatedTerms: ["in", "clock", "counter", "radial", "orientation"],
    category: "rotation",
  },
  clock: {
    definition:
      "A nonradial prop orientation perpendicular to the center line and facing in the clockwise direction around the performer. Clock names an orientation; clockwise names a rotation direction.",
    examples: [
      "At any hand point, clock lies 90 degrees from in",
      "A half turn can move a radial orientation to clock or counter",
    ],
    relatedTerms: [
      "counter",
      "in",
      "out",
      "nonradial",
      "clockwise",
      "orientation",
    ],
    category: "rotation",
  },
  counter: {
    definition:
      "A nonradial prop orientation perpendicular to the center line and facing in the counterclockwise direction around the performer. Counter names an orientation; counterclockwise names a rotation direction.",
    examples: [
      "At any hand point, counter lies 90 degrees from in",
      "Clock and counter are the two nonradial orientations",
    ],
    relatedTerms: [
      "clock",
      "in",
      "out",
      "nonradial",
      "counterclockwise",
      "orientation",
    ],
    category: "rotation",
  },
  step: {
    definition:
      "A pictograph in the context of a sequence. A sequence of N letters has N steps of motion plus a start placement (step 0). Each step shows what both hands and props do, while its duration is measured separately in musical beats.",
    examples: [
      "A 4-letter word is 4 steps long",
      "Step 0 is the start placement (no motion yet)",
      "Each step corresponds to one pictograph in the choreo card",
    ],
    relatedTerms: ["letter", "pictograph", "sequence"],
    category: "general",
  },
  beat: {
    definition:
      "A unit of musical timing. A beat can be subdivided, and a sequence step may last for one or more beats. Beat does not mean pictograph or step.",
    examples: [
      "A half beat is a subdivision of one beat",
      "A held step can last for two beats",
    ],
    relatedTerms: ["step", "sequence", "timing"],
    category: "notation",
  },
  "type-1": {
    definition:
      "The Dual-Shift letter type. Both hands shift to adjacent grid points. Type 1 contains the 22 letters A through V and is organized by timing, hand-path direction, and prop-rotation pattern.",
    examples: [
      "A, B, and C are split-same Type 1 letters",
      "M through R are quarter-opposite Type 1 letters",
      "S through V are quarter-same Type 1 letters",
    ],
    relatedTerms: [
      "letter-type",
      "shift",
      "quarter-opposite",
      "quarter-same",
      "hybrid",
    ],
    category: "letterType",
  },
  "type-2": {
    definition:
      "The Shift letter type. One hand shifts to an adjacent grid point while the other hand remains static. Type 2 contains W, X, Y, Z, Σ, Δ, Θ, and Ω.",
    examples: [
      "W and X move from gamma to alpha",
      "Y and Z move from gamma to beta",
      "Σ, Δ, Θ, and Ω return from alpha or beta to gamma",
    ],
    relatedTerms: ["shift", "static", "letter", "type-3"],
    category: "letterType",
  },
  "type-3": {
    definition:
      "The Cross-Shift letter type. One hand shifts while the other dashes, so both hands move with different hand paths. Type 3 letters use a hyphen suffix, such as W- and Σ-.",
    examples: [
      "W-, X-, Y-, and Z-",
      "Σ-, Δ-, Θ-, and Ω-",
      "Sigma-Dash means the Type 3 letter Σ-",
    ],
    relatedTerms: ["letter-type", "shift", "dash", "dash-notation"],
    category: "letterType",
  },
  "type-4": {
    definition:
      "The Dash letter type. One hand follows the dash hand-path family while the other remains static. The Level 1 dataframe contains Φ, Ψ, and Λ. Tau-Dash (τ-) is a registered Level 6 extension with the static hand at center.",
    examples: [
      "Φ increases the angle between perimeter hand placements",
      "Ψ decreases that angle",
      "Λ preserves a gamma angle",
      "τ- pairs a perimeter dash with a static center hand",
    ],
    relatedTerms: ["letter-type", "dash", "static", "tau-dash", "type-5"],
    category: "letterType",
  },
  "type-5": {
    definition:
      "The Dual-Dash letter type. Both hands dash to their opposite grid points at the same time. Type 5 contains Φ-, Ψ-, and Λ- and uses the same hyphen suffix as Type 3.",
    examples: [
      "Φ- is a dual-dash letter",
      "Ψ- is a dual-dash letter",
      "Λ- preserves the gamma angle while both hands dash",
    ],
    relatedTerms: ["letter-type", "dash", "dash-notation", "type-4"],
    category: "letterType",
  },
  "type-6": {
    definition:
      "The Static letter type. Both hands stay at their current grid points while the props may rotate in place. Type 6 contains the placement letters α, β, and γ.",
    examples: [
      "α holds an alpha placement",
      "β holds a beta placement",
      "γ holds a gamma placement",
    ],
    relatedTerms: ["letter-type", "static", "alpha", "beta", "gamma"],
    category: "letterType",
  },
  hybrid: {
    definition:
      "A Type 1 prop-rotation pattern where one hand prospins and the other antispins. Most timing and direction groups have one hybrid letter. Quarter-same has two, U and V, because changing which motion leads creates a different letter.",
    examples: [
      "C, F, I, L, O, and R are pro/anti hybrids",
      "U has a pro leader and anti follower",
      "V has an anti leader and pro follower",
    ],
    relatedTerms: ["pro", "anti", "type-1", "quarter-same", "leader-follower"],
    category: "rotation",
  },
  diamond: {
    definition:
      "A grid mode where hands are placed only on cardinal points (N, E, S, W). The default grid mode.",
    examples: ["Standard placements like alpha1 (N/S) use diamond mode"],
    relatedTerms: ["box", "skewed", "centric", "grid"],
    category: "grid",
  },
  box: {
    definition:
      "A grid mode where hands are placed only on intercardinal points (NE, SE, SW, NW).",
    examples: ["Placement beta5 (both hands at NE) uses box mode"],
    relatedTerms: ["diamond", "skewed", "centric", "grid"],
    category: "grid",
  },
  skewed: {
    definition:
      "A grid mode introduced in Level 5 where one hand is on a cardinal point and one is on an intercardinal point. Creates zeta and eta placements.",
    examples: ["Hand at N and hand at NE", "Creates zeta and eta placements"],
    relatedTerms: ["diamond", "box", "centric", "zeta", "eta"],
    category: "grid",
  },
  centric: {
    definition:
      "A grid mode introduced in Level 6 where at least one hand is at the center grid point. Creates tau and terra placements. Not yet implemented in Flow Arts Composer.",
    examples: [
      "One hand at center, one at N (tau placement)",
      "Both hands at center (terra placement)",
    ],
    relatedTerms: ["diamond", "box", "skewed", "tau", "terra"],
    category: "grid",
  },
  center: {
    definition:
      "The 9th grid point, located at the center of the grid. Introduced in Level 6 with centric grid mode. Not yet implemented in Flow Arts Composer.",
    examples: [
      "Tau placement: one hand at center",
      "Terra placement: both hands at center",
    ],
    relatedTerms: ["centric", "tau", "terra", "cardinal", "intercardinal"],
    category: "grid",
  },
  pictograph: {
    definition:
      "A visual TKA diagram showing two props, arrows indicating motion, and optional glyphs for letter name, timing, placements, and reversals. A pictograph can stand alone; when it is placed in a sequence, it functions as a step.",
    examples: [
      "Each letter has multiple pictograph variations",
      "Pictographs can be sequenced into choreo cards",
    ],
    relatedTerms: ["step", "sequence", "letter", "glyph"],
    category: "general",
  },
  variation: {
    definition:
      "A specific instance of a letter with particular starting/ending placements and locations. Each letter can have many variations that all produce the same letter classification but differ in where on the grid they happen.",
    examples: [
      "Letter A has variations starting from alpha1, alpha3, etc.",
      "Variations differ by rotation direction and grid locations",
    ],
    relatedTerms: ["letter", "pictograph", "placement"],
    category: "general",
  },
  cardinal: {
    definition:
      "The four main compass points on the grid: North (N), East (E), South (S), West (W).",
    examples: [
      "Diamond mode uses cardinal points",
      "N is at the top of the pictograph",
    ],
    relatedTerms: ["intercardinal", "diamond", "grid"],
    category: "grid",
  },
  intercardinal: {
    definition:
      "The four diagonal compass points on the grid: Northeast (NE), Southeast (SE), Southwest (SW), Northwest (NW).",
    examples: [
      "Box mode uses intercardinal points",
      "NE is at the top-right of the pictograph",
    ],
    relatedTerms: ["cardinal", "box", "grid"],
    category: "grid",
  },
  direction: {
    definition:
      "Which way a hand path or prop rotation travels. In VTG, same and opposite compare the two hand paths. In TKA motions with added turns, clockwise and counterclockwise record the prop's rotation direction.",
    examples: [
      "Two shift paths can travel in the same direction",
      "A rotating dash can turn clockwise or counterclockwise",
    ],
    relatedTerms: [
      "clockwise",
      "counterclockwise",
      "vtg",
      "hand-path",
      "rotation",
    ],
    category: "notation",
  },
  clockwise: {
    definition:
      "Clockwise rotation direction, as viewed from above the performer. Abbreviated as 'cw'.",
    examples: ["Hand path moving N -> E -> S -> W is clockwise"],
    relatedTerms: ["counterclockwise", "direction", "rotation"],
    category: "rotation",
  },
  counterclockwise: {
    definition:
      "Counter-clockwise rotation direction, as viewed from above the performer. Abbreviated as 'ccw'.",
    examples: ["Hand path moving N -> W -> S -> E is counter-clockwise"],
    relatedTerms: ["clockwise", "direction", "rotation"],
    category: "rotation",
  },
  timing: {
    definition:
      "The phase relationship between two props at VTG's south downbeat. Together means both arrive there in sync. Split means they are 180 degrees out of phase, with one at the downbeat while the other is at the top.",
    examples: [
      "Together timing places both props at south at once",
      "Split timing places one prop at south and the other at north",
    ],
    relatedTerms: ["together", "split", "downbeat", "vtg", "direction"],
    category: "notation",
  },
  vtg: {
    definition:
      "Vulcan Tech Gospel: an older, widely-adopted notation framework for flow arts that emerged from the poi community at the Vulcan Lofts in Oakland, CA. TKA uses VTG as a secondary notation layer. VTG is ground-referenced: the 'downbeat' (south/bottom of the circle) is the anchor point for all timing and direction classifications. 'Same/opposite' in VTG refers to hand path direction (both hands arc the same way vs opposite ways), not prop rotation direction.",
    examples: [
      "Split-Same (SS): props 180° out of phase, hands arc same way",
      "Together-Same (TS): props in sync, hands arc same way",
      "Split-Opposite (SO): props out of phase, hands arc opposite ways",
      "Together-Opposite (TO): props in sync, hands arc opposite ways",
    ],
    relatedTerms: ["split", "together", "downbeat", "timing", "direction"],
    category: "notation",
  },
  split: {
    definition:
      "A VTG timing classification where the two props are 180 degrees out of phase: one is at the downbeat (south) when the other is at the top. In TKA terms, split timing corresponds to alpha placements (hands at opposite points).",
    examples: [
      "Letters A, B, C (alpha to alpha) are always split-same",
      "DJ compound can be split-opp depending on variation",
    ],
    relatedTerms: ["together", "vtg", "alpha", "downbeat", "timing"],
    category: "notation",
  },
  together: {
    definition:
      "A VTG timing classification where both props pass through the downbeat (south) at the same moment. Abbreviated as 'tog'. In TKA terms, together timing corresponds to beta placements (hands at the same point).",
    examples: ["Letters G, H, I (beta to beta) are always together-same"],
    relatedTerms: ["split", "vtg", "beta", "downbeat", "timing"],
    category: "notation",
  },
  downbeat: {
    definition:
      "The reference point for VTG timing, located at the south (bottom) of the circle. VTG classifies patterns based on when and how props pass through the downbeat. TKA uses center-referenced placements instead, but maps to VTG for compatibility.",
    examples: [
      "Both props at south simultaneously = together timing",
      "Props 180° out of phase relative to south = split timing",
    ],
    relatedTerms: ["vtg", "split", "together", "timing"],
    category: "notation",
  },
  "split-same": {
    definition:
      "A VTG category where props are 180° out of phase (split) and both hands arc the same direction. Abbreviated SS.",
    examples: ["Letters A, B, C (alpha to alpha) are always split-same"],
    relatedTerms: ["split", "vtg", "together-same", "split-opposite"],
    category: "notation",
  },
  "together-same": {
    definition:
      "A VTG category where props are in sync (together) and both hands arc the same direction. Abbreviated TS or tog-same.",
    examples: ["Letters G, H, I (beta to beta) are always together-same"],
    relatedTerms: ["together", "vtg", "split-same", "together-opposite"],
    category: "notation",
  },
  "split-opposite": {
    definition:
      "A VTG category where props are 180° out of phase (split) and hands arc in opposite directions. Abbreviated SO or split-opp.",
    examples: ["DJ east-start variation is split-opposite"],
    relatedTerms: ["split", "vtg", "split-same", "together-opposite"],
    category: "notation",
  },
  "together-opposite": {
    definition:
      "A VTG category where props are in sync (together) and hands arc in opposite directions. Abbreviated TO or tog-opp.",
    examples: ["DJ south-start variation is together-opposite"],
    relatedTerms: ["together", "vtg", "together-same", "split-opposite"],
    category: "notation",
  },
  "quarter-opposite": {
    definition:
      "A dual-shift timing and direction family where the hands are 90 degrees out of phase in a gamma placement and arc in opposite hand-path directions. The TKA letters M through R belong to this family.",
    examples: [
      "M, N, and O are one half of the quarter-opposite group",
      "P, Q, and R complete the MP, NQ, and OR compounds",
      "Quarter-opposite has no leading or following hand",
    ],
    relatedTerms: ["quarter-same", "gamma", "type-1", "compound-letter", "vtg"],
    category: "notation",
  },
  "quarter-same": {
    definition:
      "A dual-shift timing and direction family where the hands are 90 degrees out of phase in a gamma placement and arc in the same hand-path direction. The TKA letters S, T, U, and V belong to this family and have a leading and following hand.",
    examples: [
      "S is the pro/pro quarter-same letter",
      "T is the anti/anti quarter-same letter",
      "U and V split the hybrid case by which motion leads",
    ],
    relatedTerms: [
      "quarter-opposite",
      "gamma",
      "type-1",
      "hybrid",
      "leader-follower",
    ],
    category: "notation",
  },
  reversal: {
    definition:
      "A directional change in a TKA sequence. There are three distinct types: hand reversal (hand returns to previous point, prop continues, switches pro/anti), prop reversal (hand continues, prop reverses direction, switches pro/anti), and full reversal (both hand and prop retrace, maintains pro/anti). Reversals are indicated by colored dots on the left edge of the pictograph.",
    examples: [
      "Hand reversal: hand goes back, prop keeps spinning same way. Switches prospin to antispin.",
      "Prop reversal: hand continues forward, prop switches direction.",
      "Full reversal: everything rewinds. Pro stays pro, anti stays anti.",
      "Colored dots appear on the left edge of the pictograph when a reversal occurs",
    ],
    relatedTerms: [
      "hand-reversal",
      "prop-reversal",
      "full-reversal",
      "rotation",
    ],
    category: "motion",
  },
  "hand-reversal": {
    definition:
      "A reversal where the hand returns to the grid point it came from, but the prop continues rotating in the same direction. This switches prospin to antispin (or vice versa) because the hand's path direction reverses while the prop doesn't. The least disruptive reversal type. No special notation required.",
    examples: [
      "Hand was at N, shifted to E, now shifts back to N. Prop keeps spinning the same way.",
    ],
    relatedTerms: ["reversal", "prop-reversal", "full-reversal"],
    category: "motion",
  },
  "prop-reversal": {
    definition:
      "A reversal where the hand continues to the next grid point but the prop reverses its rotation direction. Switches prospin to antispin (or vice versa). Indicated by a colored dot on the left edge of the pictograph in the corresponding hand's color.",
    examples: [
      "Hand continues N to E, but prop switches from clockwise to counter-clockwise.",
    ],
    relatedTerms: ["reversal", "hand-reversal", "full-reversal"],
    category: "motion",
  },
  "full-reversal": {
    definition:
      "A reversal where both the hand and prop retrace their paths, like pressing rewind. The hand returns to its previous point AND the prop reverses direction. Unlike hand and prop reversals, this maintains the rotation type: prospin stays prospin, antispin stays antispin. Indicated by a colored dot on the left edge of the pictograph.",
    examples: [
      "Hand goes back to previous point AND prop reverses. Everything rewinds. Pro stays pro.",
    ],
    relatedTerms: ["reversal", "hand-reversal", "prop-reversal"],
    category: "motion",
  },
  rotated: {
    definition:
      "A LOOP transformation where placements rotate around the grid to return home. The second half continues rotating in the same direction as the first half to complete a full 360 degrees. Not to be confused with rewound, where hands reverse direction.",
    examples: [
      "Halved: two halves, each rotates 180° (total 360°)",
      "Quartered: four quarters, each rotates 90° (total 360°)",
    ],
    relatedTerms: ["loop", "mirrored", "rewound"],
    category: "sequence",
  },
  reflection: {
    definition:
      "A LOOP transformation that maps every grid location across a chosen axis. Applying the same reflection twice returns each location to where it started, which allows a directly reflected seed to close without beginning on the axis.",
    examples: [
      "An N-S reflection swaps east and west locations",
      "An E-W reflection swaps north and south locations",
      "Diagonal reflections are available in every grid mode",
    ],
    relatedTerms: ["reflection-axis", "loop", "mirrored", "flipped"],
    category: "sequence",
  },
  "reflection-axis": {
    definition:
      "The line used to map locations in a reflected LOOP. TKA supports N-S, E-W, NE-SW, and NW-SE axes. The axis is chosen independently of diamond, box, or skewed grid mode.",
    examples: [
      "N-S leaves north and south fixed while east and west exchange",
      "NE-SW leaves northeast and southwest fixed",
      "A diamond sequence can reflect across a diagonal axis",
    ],
    relatedTerms: ["reflection", "grid", "diamond", "box", "skewed"],
    category: "sequence",
  },
  mirrored: {
    definition:
      "A LOOP transformation where placements mirror across the vertical axis (left-right swap) to return home.",
    examples: [
      "Hand at E mirrors to W",
      "Left-right placements swap across the vertical midline",
    ],
    relatedTerms: ["loop", "flipped", "rotated"],
    category: "sequence",
  },
  flipped: {
    definition:
      "A LOOP transformation where placements mirror across the horizontal axis (top-bottom swap) to return home.",
    examples: [
      "Hand at N flips to S",
      "Top-bottom placements swap across the horizontal midline",
    ],
    relatedTerms: ["loop", "mirrored", "rotated"],
    category: "sequence",
  },
  swapped: {
    definition:
      "A LOOP transformation where the left and right hands swap roles. What the left hand did, the right hand now does (and vice versa). Changes body motion significantly.",
    examples: [
      "The left hand was at N doing pro; now the right hand is at N doing pro",
      "Body has to reorganize to execute the swapped version",
    ],
    relatedTerms: ["loop", "mirrored", "inverted"],
    category: "sequence",
  },
  inverted: {
    definition:
      "A LOOP transformation where motion types flip between pro and anti. Prospin becomes antispin and vice versa.",
    examples: [
      "Pro motion in first half becomes anti in second half",
      "Changes the visual pattern significantly while keeping hand paths the same",
    ],
    relatedTerms: ["loop", "swapped", "pro", "anti"],
    category: "sequence",
  },
  rewound: {
    definition:
      "A LOOP transformation where the second half plays in reverse: hands trace their path backwards to return home. Like pressing rewind on a video. Not to be confused with rotated, where hands continue forward in the same direction.",
    examples: ["First half: A→B→C→D. Second half: D→C→B→A (rewound back home)"],
    relatedTerms: ["loop", "rotated", "full-reversal"],
    category: "sequence",
  },
  "negative-space": {
    definition:
      "The space around and behind the body that a prop can travel through during a pattern. Performers can reach into it with arm extension, body turns, or a combination of both.",
    examples: [
      "Reaching behind the torso while keeping the staff clear",
      "Turning the body to open a path through the space behind the shoulders",
    ],
    relatedTerms: ["body-turns", "prop"],
    category: "execution",
    benefit: "Extend patterns beyond the front-facing plane",
  },
  "body-turns": {
    definition:
      "Turning the torso to execute patterns, especially for longer staves.",
    examples: [
      "Rotating shoulders to reach behind",
      "Full body rotation during complex sequences",
    ],
    relatedTerms: ["negative-space", "prop"],
    category: "execution",
    benefit:
      "Add movement quality, handle longer staves, create dynamic contrast",
  },
  "thumb-orientation": {
    definition:
      "Tracking whether thumbs point inward or outward on each step to verify prop rotation.",
    examples: [
      "thumbs-in: starting placement with thumbs toward center",
      "thumbs-out: thumbs away from center",
    ],
    relatedTerms: ["orientation", "pro", "anti"],
    category: "execution",
    importance: "Track rotations and check placement on every step",
  },
  loop: {
    definition:
      "A circular sequence that returns to its starting placement through transformations. Six base transformations (rotated, mirrored, flipped, swapped, inverted, rewound) can be combined into compound types like mirrored-swapped or rotated-inverted. The word repeats with transformations applied until it arrives back home.",
    examples: [
      "DJII (8-count rewound loop)",
      "AABB with mirrored-swapped transformation",
      "16-count loops use 4-letter words repeated 4 times",
      "Compound LOOP types combine multiple base transformations",
    ],
    relatedTerms: [
      "sequence",
      "word",
      "rotated",
      "mirrored",
      "rewound",
      "halved",
      "quartered",
    ],
    category: "sequence",
  },
  transition: {
    definition:
      "The connection between two consecutive letters in a sequence. A valid transition requires the end placement of one letter to match the start placement of the next. When no valid transition exists, a bridge letter is inserted.",
    examples: [
      "A ends at alpha, next letter starts at alpha = valid transition",
      "B ends at alpha, O starts at gamma = needs bridge letter",
    ],
    relatedTerms: ["bridge", "sequence", "word"],
    category: "general",
  },
  inversion: {
    definition:
      "A formal relationship between two letters that differ only in their rotation type (pro vs anti). Each letter has an inversion pair. These pairs are used in LOOP generation with the inverted transformation.",
    examples: [
      "A (pro/pro) ↔ B (anti/anti)",
      "D (pro/pro) ↔ E (anti/anti)",
      "W (pro) ↔ X (anti)",
      "Σ ↔ Δ, Θ ↔ Ω",
    ],
    relatedTerms: ["pro", "anti", "inverted", "letter"],
    category: "general",
  },
  "choreo-card": {
    definition:
      "The visual output of sequence generation: a composite image showing all pictographs in a sequence arranged in a grid or strip layout. Includes optional header (word, difficulty), step numbers, reversal indicators, and footer (username, notes, date).",
    examples: [
      "A 4-letter word produces a choreo card with 5 pictographs (start + 4 steps)",
      "Grid layout arranges pictographs in rows, strip layout puts them in a single row",
    ],
    relatedTerms: ["sequence", "pictograph", "word"],
    category: "notation",
  },
  "left-hand": {
    definition:
      "The performer's physical left hand. It is the canonical left motion channel in TKA data and uses blue in the default notation palette.",
    examples: [
      "The left hand starts at N and shifts to E",
      "Changing the left-hand color changes its prop, arrow, and mandala path together",
    ],
    relatedTerms: ["right-hand", "blue", "motion-type", "pictograph"],
    category: "general",
  },
  "right-hand": {
    definition:
      "The performer's physical right hand. It is the canonical right motion channel in TKA data and uses red in the default notation palette.",
    examples: [
      "The right hand starts at S and shifts to W",
      "Changing the right-hand color changes its prop, arrow, and mandala path together",
    ],
    relatedTerms: ["left-hand", "red", "motion-type", "pictograph"],
    category: "general",
  },
  blue: {
    definition:
      "The canonical display color for the performer's left hand and prop in TKA notation. The underlying motion identity is left; pictographs traditionally render its prop and arrow in blue.",
    examples: [
      "The left hand starts at N and shifts to E",
      "The left prop and arrow use canonical blue in the default palette",
    ],
    relatedTerms: ["red", "left-hand", "prop", "pictograph"],
    category: "general",
  },
  red: {
    definition:
      "The canonical display color for the performer's right hand and prop in TKA notation. The underlying motion identity is right; pictographs traditionally render its prop and arrow in red.",
    examples: [
      "The right hand starts at S and shifts to W",
      "The right prop and arrow use canonical red in the default palette",
    ],
    relatedTerms: ["blue", "right-hand", "prop", "pictograph"],
    category: "general",
  },
  constraint: {
    definition:
      "A rule used during sequence generation to shape which motions or transitions may appear. A hard constraint must be satisfied; a soft constraint guides the result when possible.",
    examples: [
      "constraintPreset: 'smooth' minimizes reversals",
      "constraintPreset: 'isolation' forces all pro motions",
      "Natural language: 'maximize flow with the left hand clockwise'",
    ],
    relatedTerms: ["sequence", "word", "pro", "anti", "reversal"],
    category: "sequence",
  },
  "constraint-preset": {
    definition:
      "A named group of generation constraints. Available presets are smooth, smooth-hands, smooth-props, reversal, isolation, antispin, no-dash, no-static, maximize-dash, and maximum-chaos.",
    examples: [
      "'smooth' preset minimizes both hand path and prop reversals",
      "'isolation' forces all pro motions like the DJ compound",
      "'maximum-chaos' maximizes every possible reversal",
    ],
    relatedTerms: ["constraint", "sequence", "pro", "anti", "reversal"],
    category: "sequence",
  },
  halved: {
    definition:
      "A LOOP slice size where the sequence is divided into two halves of 180 degrees each. The transformation is applied once to create the second half, completing a 360-degree cycle. Used with the rotated LOOP type.",
    examples: [
      "A 4-letter word halved: first 4 steps + transformed 4 steps = 8-step LOOP",
      "Each half covers 180 degrees of the full rotation",
    ],
    relatedTerms: ["quartered", "loop", "rotated"],
    category: "sequence",
  },
  quartered: {
    definition:
      "A LOOP slice size where the sequence is divided into four quarters of 90 degrees each. The transformation is applied three times to create quarters 2-4, completing a 360-degree cycle. Used with the rotated LOOP type.",
    examples: [
      "A 4-letter word quartered: 4 steps repeated 4 times = 16-step LOOP",
      "Each quarter covers 90 degrees of the full rotation",
    ],
    relatedTerms: ["halved", "loop", "rotated"],
    category: "sequence",
  },
  "spinning-plane": {
    definition:
      "The plane in space on which a prop pattern is executed. Three planes exist: wall (vertical, facing the audience), wheel (vertical, perpendicular to audience), and overhead (horizontal, above the performer). All levels 1-7 work on a single plane at a time (any of the three). Level 8 (atomics) introduces patterns where two props are on different planes simultaneously.",
    examples: [
      "Wall plane: the prop traces a circle facing the audience",
      "Wheel plane: the prop traces a circle like a bicycle wheel (side view)",
      "Overhead plane: the prop traces a circle above the performer's head",
    ],
    relatedTerms: ["atomic", "level", "prop"],
    category: "general",
  },
  "conjoined-grid": {
    definition:
      "A Level 7 concept where two grids share a junction point, expanding the spatial canvas and bridging to 3D. Each grid shows one hand's motion. The junction point creates new placement combinations that can't exist on a single grid, including patterns with two center points. Uses existing terminology (alpha, beta, gamma, etc.) to express new spatial relationships across the paired grids. Placed after the centric grid (L6) so the single grid is complete — every orientation (L4), every perimeter pairing (L5), and the center point itself (L6) — before expanding beyond one grid. The junction consumes the center point directly.",
    examples: [
      "Two grids sharing a north/south junction, left hand on grid A, right hand on grid B",
      "Layouts: left-right, top-bottom, diagonal arrangements",
      "Patterns where hands are spatially further apart than a single grid allows",
    ],
    relatedTerms: ["level", "centric", "placement"],
    category: "grid",
  },
  atomic: {
    definition:
      "A Level 8 concept where two props operate on different spinning planes simultaneously. One prop might be on the wall plane while the other is on the wheel plane. Analogous to how Level 5 expanded from single-grid (diamond or box) to mixed-grid (skewed), Level 8 expands from single-plane to mixed-plane. By this level, the full 2D system (including interradial orientations from Level 4, the center point from Level 6, and conjoined grids from Level 7) is complete, so all 2D knowledge carries into 3D. Not yet implemented.",
    examples: [
      "Left hand doing a wall-plane pattern while right hand does a wheel-plane pattern",
      "Intersecting two planes creates 3D motion even though each individual prop traces a 2D circle",
    ],
    relatedTerms: ["spinning-plane", "level", "skewed", "rubiks-cube"],
    category: "general",
  },
  "rubiks-cube": {
    definition:
      "Level 9 concept. Within the multi-plane context of Level 8 (atomics), the points between the relative cardinal points on each plane become individually accessible. The same expansion that Level 5 (skewed) brought to single-plane grid work, Level 9 brings to multi-plane work. Named for the Rubik's cube geometry that emerges when three intersecting planes each have their in-between points addressed. Completes 3D mastery the same way Level 4 (interradials) completes 2D orientation freedom. Not yet implemented.",
    examples: [
      "Level 5 mixed cardinal and intercardinal on one plane (skewed). Level 9 mixes equivalent points across two intersecting planes.",
      "The 3D grid formed by wall + wheel + overhead planes with in-between access resembles a Rubik's cube",
    ],
    relatedTerms: ["atomic", "spinning-plane", "skewed", "level"],
    category: "general",
  },
  hash: {
    definition:
      "A hand motion type where the hand moves in a straight line to or from the center grid point. Hash is **dash-** (dash with a minus modifier): the same straight-line traverse as a dash, but covering half the distance (center to perimeter or perimeter to center). 'Hash' is the official name for dash-, just as 'skew' is the official name for shift+/-. Introduced in Level 6 with centric grid mode. Same rotation physics as dash: at 0 turns, no rotation (1 state); at 1+ turns, CW or CCW (2 states per turn count). Pro/anti/float distinctions do not apply (straight line, not curved arc).",
    examples: [
      "N to center is a hash (dash-)",
      "Center to E is a hash",
      "Hash = dash- = half-dash, same physics as dash",
    ],
    relatedTerms: [
      "dash",
      "shift",
      "static",
      "centric",
      "tau",
      "motion-type",
      "hand-path-modifier",
    ],
    category: "motion",
  },
  radial: {
    definition:
      "A prop orientation that lies along the line between the performer's center point and the hand: in (pointing toward center) or out (pointing away). Radial and nonradial describe prop ORIENTATION. Cardinal and intercardinal describe grid point LOCATION. The two are independent and must never be conflated.",
    examples: [
      "in and out are the two radial orientations",
      "A prop at 0 turns from a radial start stays radial",
      "Level 1 and Level 2 sequences are radial throughout, because only a half turn or a float can leave radial",
    ],
    relatedTerms: ["nonradial", "interradial", "orientation", "layer"],
    category: "rotation",
  },
  nonradial: {
    definition:
      "A prop orientation that lies across the line between the performer's center point and the hand: clock or counter. Written non-radial in some code. A prop reaches nonradial from radial by a half turn or by a float on a curved hand path, so nonradial orientation does not exist below Level 3.",
    examples: [
      "clock and counter are the two nonradial orientations",
      "A half turn takes a prop from radial to nonradial",
      "Level 3 is where nonradial first becomes possible",
    ],
    relatedTerms: ["radial", "interradial", "orientation", "layer", "level"],
    category: "rotation",
  },
  layer: {
    definition:
      "Which of the four radial/nonradial combinations the two props are in at a given step. Layer 1: both props radial. Layer 2: both props nonradial. Layer 3: blue radial, red nonradial. Layer 4: blue nonradial, red radial. Layers 3 and 4 are mirror images of each other, so they are collapsed to a single 'layer 3' for display, the same way A, B and C collapse. Layer is a Level 3 concept: nonradial orientation does not exist below Level 3, so every Level 1 and Level 2 sequence is in layer 1 from start to finish.",
    examples: [
      "Layer 1: both props pointing in or out",
      "Layer 2: both props lying across the radius",
      "Layers 3 and 4 read as busy, because one prop is flat to the circle and the other is on edge",
      "Level 1 and Level 2 sequences never leave layer 1",
    ],
    relatedTerms: [
      "layer-signature",
      "radial",
      "nonradial",
      "orientation",
      "level",
    ],
    category: "rotation",
  },
  "layer-signature": {
    definition:
      "The layer of each step of a sequence read in order, written as a string such as 1233341112333411. It is decided entirely by the pattern of turns and does not depend on the letters at all, so the same turn pattern laid over a completely different word produces the same signature. A sequence that repeats needs each prop to change layer an even number of times, or the second pass through starts in a different layer than the first.",
    examples: [
      "1111111111111111: a sequence that never leaves layer 1, which is every Level 1 and Level 2 sequence",
      "1233341112333411: the same signature appears on unrelated words",
      "A repeating sequence whose props change layer an odd number of times takes two passes to come back around",
    ],
    relatedTerms: ["layer", "turns", "loop", "level"],
    category: "sequence",
  },
  interradial: {
    definition:
      "The four orientations at 45 degrees between the base cardinal orientations, introduced at Level 4. These double the angular precision of the orientation system from 4 values to 8. The four interradial orientations are: clockIn (between clock and in), clockOut (between clock and out), counterIn (between counter and in), counterOut (between counter and out). Quarter turns (0.25, 0.75, etc.) produce interradial orientations using the 8-point radial cycle: in → clockIn → clock → clockOut → out → counterOut → counter → counterIn.",
    examples: [
      "clockIn: prop faces 45° between clock and in",
      "Level 4 doubles orientation vocabulary from 4 to 8",
      "Quarter turns step through the 8-point radial cycle",
    ],
    relatedTerms: ["orientation", "level", "clock", "counter"],
    category: "rotation",
  },
  "base-rotation": {
    definition:
      "The inherent prop rotation that occurs at 0 additional turns during any motion. Turn counts in TKA measure ADDITIONAL rotation on top of this base. For shifts (curved arcs), the arc causes center-relative angular change even at 0 turns. 0-turn pro and 0-turn anti are two different states because the prop either rotates with or against the arc. For dashes, hashes, and statics (straight lines or no movement), there is no arc, so base rotation at 0 turns means truly no rotation, producing exactly 1 state, not 2.",
    examples: [
      "0-turn pro shift: prop rotates with the arc (base rotation preserves orientation)",
      "0-turn anti shift: prop rotates against the arc (base rotation reverses orientation)",
      "0-turn dash: no rotation, no direction (just one state)",
    ],
    relatedTerms: ["turns", "pro", "anti", "shift", "dash", "orientation"],
    category: "rotation",
  },
  "hand-path-modifier": {
    definition:
      "The +/- system that extends or shortens standard hand paths. Applies to both shifts and dashes. For shifts: skew+ (longer arc), skew- (shorter arc). For dashes: dash- (to/from center, called 'hash'), dash+ (cross-grid, L7), dash++ (cross-grid to opposite perimeter, L7). The modifier is displayed per-hand in the turns column of the TKA glyph. Modifiers do NOT change the letter type classification. Dash and dash- are both in the 'dash' family.",
    examples: [
      "Skew+ (shift+): S to NE, extended arc spanning 3 segments",
      "Dash- (hash): N to center, shortened straight line",
      "Dash+ (L7): perimeter to center of other grid",
    ],
    relatedTerms: ["shift", "dash", "hash", "skew", "hand-path"],
    category: "motion",
  },
  skew: {
    definition:
      "A shift with a +/- path length modifier (Level 5+, 8-point grid). Skew+ extends the arc beyond a single segment (e.g., S to NE spanning 3 segments). Skew- shortens the arc to less than one segment. Skews support all three shift motion types (pro, anti, float) and are theoretically unbounded in arc length. For enumeration, the standard single-segment shift is counted; skews are extensions.",
    examples: [
      "Skew+ (shift+): extended arc, e.g. S to NE",
      "Skew- (shift-): shortened arc",
      "Skew++ (shift++): double-extended arc",
    ],
    relatedTerms: ["shift", "hand-path-modifier", "hand-path"],
    category: "motion",
  },
  "leader-follower": {
    definition:
      "A distinction that arises in asymmetric placements (gamma, zeta, eta) when both hands shift the same direction. One hand is directionally 'ahead' of the other, creating a leader and a follower. This matters for letter assignment because the leader and follower can have different turn values. In the TKA glyph, the leader's turn number appears on top, the follower's on bottom. Leader/follower does NOT apply to opposite-direction movement (hands diverge/converge symmetrically) or to symmetric placements (alpha, beta). Leader/follower is combinatorially equivalent to mixed motion types: it doubles the variation space the same way that having one pro and one anti does.",
    examples: [
      "In gamma, same-direction shifts create leader/follower. Requires S, T, U, V letters",
      "In alpha (symmetric), no leader/follower. Uses A through L",
      "Opposite-direction shifts in any placement have no leader/follower",
      "S,T,U,V each have the same variation count as hybrids (C, F, I, L, O) because leader/follower doubles the space",
    ],
    relatedTerms: [
      "gamma",
      "zeta",
      "eta",
      "placement",
      "symmetry-invariance",
      "leading",
      "following",
    ],
    category: "placement",
  },
  "symmetry-invariance": {
    definition:
      "The founding design principle that a pictograph represents the same letter under rotation, reflection, and color swap. This minimizes the alphabet by treating spatially equivalent arrangements as identical. The principle holds for symmetric placements (alpha, beta) and opposite-direction movement. It breaks for same-direction movement in asymmetric placements (gamma), which is why the quarter-same group has 4 letters (S,T,U,V) instead of the usual 3.",
    examples: [
      "Rotate a pictograph card: same letter",
      "Mirror a pictograph: same letter",
      "Swap red/blue: same letter (except STUV hybrids)",
      "U and V exist because color-swapping a quarter-same hybrid changes which motion type leads",
    ],
    relatedTerms: ["leader-follower", "dual-shift", "gamma"],
    category: "general",
  },
  caps: {
    definition:
      "Continuous Assembly Patterns (CAPs): coined by Damien of Angers, France (posting as French_Saltimbanque and Zaltymbunk) in the Yuta move analysis thread on the Home of Poi forums, from ideas germinated with the OMCC crew (Alien Jon, Noel, Greg, Jordan, Zan) at Burning Man 2007. Canonical definition: a cyclic pattern assembled from 2+ elementary patterns (trochoid building blocks notated θ1 θ2 ; ρ1 ρ2 ; d) iterated 1+ times; the SERIAL composition process, contrasted with hybrids (PARALLEL superposition, one pattern per hand). The community later narrowed everyday 'cap' to mean the C-CAP (extension + antispin petal alternation). CAPs and LOOPs are parallel concepts, not parent/child. Neither is a subset of the other.",
    examples: [
      "C-CAP: the extension-arc + antispin-petal pattern most spinners call 'a cap'",
      "The Yuta CAP: 1 0 ; 1 3/4 ; 1/2 assembled with -1 4 ; 1 3/4 ; 1/2",
      "CAPs compose per-hand trajectories serially; hybrids compose across hands in parallel",
      "LOOPs compose per-step snapshots (one letter = both hands)",
    ],
    relatedTerms: ["loop", "compound", "vtg"],
    category: "sequence",
  },
  "quarter-time": {
    definition:
      "A misnomer for gamma patterns (M through V) in VTG vocabulary. It describes a 90-degree phase offset between hands, NOT a timing or duration change. VTG's split and tog have formal phase designations, but quarter time never received equivalent formal naming. It was strapped onto VTG's framework by later practitioners without integration into the original four-category system. In TKA, these patterns are simply the gamma letters. No special 'quarter time' designation needed.",
    examples: [
      "'Quarter time' = 90-degree phase offset, not a timing change",
      "In TKA, these are just gamma letters (M through V)",
      "VTG never formally integrated QT into its core four categories",
    ],
    relatedTerms: ["vtg", "gamma"],
    category: "notation",
  },
  "tau-dash": {
    definition:
      "The registered Level 6 letter τ-. Tau-Dash extends Type 4: one hand follows the dash family while the other remains static at center. It is an individual letter, not a seventh letter type, and its variations are not part of the current Level 1 pictograph dataframe.",
    examples: [
      "τ- is classified as Type 4",
      "Its static hand occupies center rather than a perimeter point",
    ],
    relatedTerms: ["type-4", "dash", "tau", "centric", "letter"],
    category: "general",
  },
  "elemental-model": {
    definition:
      "A mnemonic framework mapping VTG's timing/direction categories to classical elements plus two additions. The original four elements (Earth, Water, Air, Fire) come from the poi community's VTG teaching tradition. TKA expands the model with Sun and Moon to cover gamma patterns. Same-direction elements (Earth, Water, Sun) are grid-mode invariant. Opposite-direction elements (Air, Fire, Moon) permute when switching between diamond and box mode.",
    examples: [
      "Earth = tog-same (G,H,I), Water = split-same (A,B,C), Air = tog-opp, Fire = split-opp",
      "Sun = quarter-same (S,T,U,V), Moon = quarter-opp (MP,NQ,OR compounds)",
      "Diamond DJ = Air/Fire, but Box DJ = Moon",
    ],
    relatedTerms: ["vtg", "quarter-time", "gamma", "compound-letter"],
    category: "notation",
  },
} as const satisfies Record<string, GlossaryEntry>;
