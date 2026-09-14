// GENERATED FILE — do not edit by hand.
// Source: docs/tutorial-video-voiceover/Voiceover-Scripts-{Next,Advanced}.md
// Regenerate: node scripts/build-tutorial-content.mjs

export interface PictographPick {
  letter: string;
  variationIndex: number;
  caption?: string;
}

export type ScriptBlock =
  | { kind: "spoken"; text: string }
  | { kind: "cue"; text: string }
  | { kind: "slot"; id: string; prompt: string }
  | { kind: "pictographs"; picks: PictographPick[] };

export interface TutorialScript {
  id: string;
  number: number;
  title: string;
  part: string;
  targetRuntime: string;
  goal: string;
  blocks: ScriptBlock[];
}

export const TUTORIAL_SCRIPTS: TutorialScript[] = [
  {
    "id": "12-letter-g",
    "number": 12,
    "title": "Letter G",
    "part": "Part III — Together-Same (G, H, I)",
    "targetRuntime": "~2:30",
    "goal": "introduce the beta family, tog-same isolations = G, the contrast with A, continuous repeats, both directions.",
    "blocks": [
      {
        "kind": "pictographs",
        "picks": [
          {
            "letter": "G",
            "variationIndex": 0
          }
        ]
      },
      {
        "kind": "spoken",
        "text": "Back in the compound videos I gave you a shortcut: you can narrow any letter down by where it ends. Ends in alpha, it's one of the first six. Ends in beta, it's G through L. We've already met D, E, F and J, K, L — they live inside the compounds. That leaves three letters that never leave beta: G, H, and I."
      },
      {
        "kind": "spoken",
        "text": "This video is G."
      },
      {
        "kind": "cue",
        "text": "start in beta"
      },
      {
        "kind": "spoken",
        "text": "Start in beta — hands stacked on one point, both staves radiating out from the center, acting like a single staff."
      },
      {
        "kind": "slot",
        "id": "s12-1",
        "prompt": "your preferred beta and thumb convention for this family — the compound videos started thumbs in at low beta."
      },
      {
        "kind": "spoken",
        "text": "For G, both hands isolate at the same time, traveling the same direction, and land stacked together on a new point. Beta to beta. That's G."
      },
      {
        "kind": "spoken",
        "text": "Compare that to A. In A the hands were apart and stayed apart — split, same direction. In G they're together and they stay together. Same two isolations, different neighborhood."
      },
      {
        "kind": "cue",
        "text": "continuous"
      },
      {
        "kind": "spoken",
        "text": "Do it again — G. And again — G."
      },
      {
        "kind": "slot",
        "id": "s12-2",
        "prompt": "does continuous G run into a twist the way A did? If yes, your fix goes right here, same beat structure as the A video. If it flows clean, say so on camera — the contrast with A is a teaching moment."
      },
      {
        "kind": "spoken",
        "text": "Now the other direction."
      },
      {
        "kind": "slot",
        "id": "s12-3",
        "prompt": "reverse-direction walkthrough with your landmarks."
      },
      {
        "kind": "cue",
        "text": "counts"
      },
      {
        "kind": "spoken",
        "text": "Put a count on it, both directions. One, two, three, four. And back: one, two, three, four."
      },
      {
        "kind": "spoken",
        "text": "These are together-same isolations. One unit of together-same isolations is the letter G. Next video — same hand path, and you already know what's coming."
      }
    ]
  },
  {
    "id": "13-letter-h",
    "number": 13,
    "title": "Letter H",
    "part": "Part III — Together-Same (G, H, I)",
    "targetRuntime": "~3:30",
    "goal": "H = two anti-spins on the G hand path, the orientation rule paying off at beta, negative space, both directions.",
    "blocks": [
      {
        "kind": "pictographs",
        "picks": [
          {
            "letter": "H",
            "variationIndex": 0
          }
        ]
      },
      {
        "kind": "spoken",
        "text": "H follows the exact same hand path as G. The only change — you know this pattern by now — two anti-spins instead of two isolations."
      },
      {
        "kind": "cue",
        "text": "beta, thumbs in"
      },
      {
        "kind": "spoken",
        "text": "Start in beta, thumbs in. Both hands anti-spin at the same time, traveling the same direction, and land stacked on the next point. Beta to beta. That's H."
      },
      {
        "kind": "spoken",
        "text": "Remember the orientation rule from the Positions video: isolations keep their orientation, anti-spins swap it. G kept you thumbs-in the whole way around. H flips you every single unit. Thumbs in — H — thumbs out. H — thumbs in again. In, out, in, out. Glance at your thumbs at any moment and you know whether you're on track."
      },
      {
        "kind": "cue",
        "text": "negative space"
      },
      {
        "kind": "slot",
        "id": "s13-1",
        "prompt": "where negative space shows up in H — which shoulder pocket, which end leads, whether the stacked staves need anything like the elbow trick from B, and whether an above/below sneak applies. This is the heart of the video and it's all body knowledge."
      },
      {
        "kind": "cue",
        "text": "both directions + counts"
      },
      {
        "kind": "spoken",
        "text": "Run it the other way."
      },
      {
        "kind": "slot",
        "id": "s13-2",
        "prompt": "reverse-direction landmarks."
      },
      {
        "kind": "spoken",
        "text": "Then a count, both directions: one, two, three, four. One, two, three, four."
      },
      {
        "kind": "spoken",
        "text": "Two anti-spins, together, same direction — that's H. One more letter at beta, and it's one you can already predict."
      }
    ]
  },
  {
    "id": "14-letter-i",
    "number": 14,
    "title": "Letter I",
    "part": "Part III — Together-Same (G, H, I)",
    "targetRuntime": "~4:00",
    "goal": "I = the hybrid at beta, predicted from the pattern before it's shown; convention pick; twice the variations; the G/H/I triple recap as proof the pattern generalizes.",
    "blocks": [
      {
        "kind": "pictographs",
        "picks": [
          {
            "letter": "I",
            "variationIndex": 0
          }
        ]
      },
      {
        "kind": "spoken",
        "text": "Before I show you this letter, try to predict it. At alpha we had A — two isolations. B — two anti-spins. C — one of each. You just did G — two isolations — and H — two anti-spins. So the third letter at beta has to be one hand isolating while the other anti-spins. That's I."
      },
      {
        "kind": "spoken",
        "text": "The pattern I gave you in the first wrap up — iso, anti, hybrid — isn't just an alpha thing. It runs through the whole alphabet, and you just used it to predict a letter you'd never seen."
      },
      {
        "kind": "cue",
        "text": "beta, pick the convention"
      },
      {
        "kind": "spoken",
        "text": "Like C, the hands are doing different jobs, so I has twice as many variations as G or H. Pick a convention and keep it for the whole video."
      },
      {
        "kind": "slot",
        "id": "s14-1",
        "prompt": "your pick — the C video used right hand isolates, left hand anti-spins."
      },
      {
        "kind": "spoken",
        "text": "One hand isolates, the other anti-spins, both traveling the same direction, landing stacked on the next point. Beta to beta. That's I."
      },
      {
        "kind": "spoken",
        "text": "Watch the thumbs as you go. The isolating hand keeps its orientation; the anti-spinning hand swaps every unit. In and in — then in and out. Mixed orientations are normal for hybrids. You saw the same thing in C."
      },
      {
        "kind": "cue",
        "text": "continuous + the fix"
      },
      {
        "kind": "slot",
        "id": "s14-2",
        "prompt": "continuous I — where it binds, your fix, whether the above/below options from B and C carry over."
      },
      {
        "kind": "cue",
        "text": "swap the jobs"
      },
      {
        "kind": "spoken",
        "text": "Now swap the roles — the other hand isolates, the other anti-spins — and run it again. That's your homework letter, the same way C was: every direction, both role assignments."
      },
      {
        "kind": "cue",
        "text": "counts"
      },
      {
        "kind": "spoken",
        "text": "One, two, three, four."
      },
      {
        "kind": "spoken",
        "text": "And that's the beta family. G — two isolations. H — two anti-spins. I — the hybrid. Together, same direction, never leaving beta. The same triple as A, B, C, one neighborhood over. Next stop is the last position on the grid: gamma."
      }
    ]
  },
  {
    "id": "15-gamma",
    "number": 15,
    "title": "Gamma",
    "part": "Part IV — Gamma (M through V)",
    "targetRuntime": "~3:00",
    "goal": "gamma as a first-class position; the L with staves; moving into gamma; why gamma gets its own series; the quarter-cycle offset that defines everything in it.",
    "blocks": [
      {
        "kind": "pictographs",
        "picks": [
          {
            "letter": "γ",
            "variationIndex": 0
          }
        ]
      },
      {
        "kind": "spoken",
        "text": "We've spent this whole series so far in two positions. Hands apart — alpha. Hands together — beta. The third position has been waiting, and it gets a whole series of its own. Gamma: the right angle."
      },
      {
        "kind": "cue",
        "text": "gamma with staves"
      },
      {
        "kind": "spoken",
        "text": "Put your hands on two adjacent points — one out to the side, one straight ahead. Each staff radiates out from the center, and together they make an L. That's gamma. Rotate the whole shape to any corner of the grid — still gamma."
      },
      {
        "kind": "slot",
        "id": "s15-1",
        "prompt": "a short on-camera tour of gamma placements, mirroring the \"this is alpha, this is alpha\" tour from video 1."
      },
      {
        "kind": "cue",
        "text": "moving into gamma"
      },
      {
        "kind": "slot",
        "id": "s15-2",
        "prompt": "the alpha→gamma and beta→gamma demos — which motions you want on camera. Production note: this alpha→gamma demo is the footage the reworked Grid video needs for its ending. Shoot it clean."
      },
      {
        "kind": "spoken",
        "text": "Why does gamma get its own series? Count the letters. Six letters end in alpha. Six end in beta. **Ten** end in gamma — M through V. And gamma has one idea the other positions don't have."
      },
      {
        "kind": "spoken",
        "text": "Here it is. Think about how far apart your hands are around the grid. In alpha, they're half a cycle apart — opposite points. In beta, zero — same point. Gamma sits exactly in between: a quarter of a cycle apart. Some spinner communities call the gamma patterns quarter time. The name's a little misleading — your timing doesn't change, the hands still move on the same beats. What changes is the offset: one hand runs a quarter-cycle away from the other, the whole time. Every letter in this series comes from that offset."
      },
      {
        "kind": "spoken",
        "text": "Next video, the first gamma letter: S."
      }
    ]
  },
  {
    "id": "16-letter-s",
    "number": 16,
    "title": "Letter S",
    "part": "Part IV — Gamma (M through V)",
    "targetRuntime": "~2:30",
    "goal": "quarter-same isolations = S; the offset in motion; cousin of A and G; continuous; both directions.",
    "blocks": [
      {
        "kind": "pictographs",
        "picks": [
          {
            "letter": "S",
            "variationIndex": 0
          }
        ]
      },
      {
        "kind": "spoken",
        "text": "This is the letter S."
      },
      {
        "kind": "spoken",
        "text": "Start in gamma."
      },
      {
        "kind": "slot",
        "id": "s16-1",
        "prompt": "your preferred on-camera gamma and thumb convention for this family."
      },
      {
        "kind": "spoken",
        "text": "For S, both hands isolate at the same time, traveling the same direction, holding that quarter-cycle offset the whole way. You land in a new gamma — the L walks to a new corner of the grid. Gamma to gamma. That's S."
      },
      {
        "kind": "spoken",
        "text": "You've now done this exact move in three neighborhoods. Hands apart — that was A. Hands stacked — that was G. Hands a quarter apart — S. Same two isolations every time. The position is the only thing that changed."
      },
      {
        "kind": "cue",
        "text": "continuous"
      },
      {
        "kind": "spoken",
        "text": "Keep it going. S, S, S, S. The L keeps walking around the grid."
      },
      {
        "kind": "slot",
        "id": "s16-2",
        "prompt": "twist/no-twist reality for continuous S, your fix if needed, and the reverse-direction walkthrough."
      },
      {
        "kind": "cue",
        "text": "counts"
      },
      {
        "kind": "spoken",
        "text": "Count it, both directions. One, two, three, four. Back the other way — one, two, three, four."
      },
      {
        "kind": "spoken",
        "text": "Quarter-time, same direction, two isolations — the letter S. And you can already guess what's next."
      }
    ]
  },
  {
    "id": "17-letter-t",
    "number": 17,
    "title": "Letter T",
    "part": "Part IV — Gamma (M through V)",
    "targetRuntime": "~3:00",
    "goal": "T = two anti-spins at the quarter offset; orientation flips; negative space; cousin of B and H; the tease that the pattern is about to break.",
    "blocks": [
      {
        "kind": "pictographs",
        "picks": [
          {
            "letter": "T",
            "variationIndex": 0
          }
        ]
      },
      {
        "kind": "spoken",
        "text": "T is to S what B was to A and H was to G. Same hand path, two anti-spins."
      },
      {
        "kind": "cue",
        "text": "gamma, thumbs in"
      },
      {
        "kind": "spoken",
        "text": "Start in gamma, thumbs in. Both hands anti-spin, same direction, holding the quarter offset, and the L lands on the next corner. Gamma to gamma. That's T."
      },
      {
        "kind": "spoken",
        "text": "Orientation rule, one more time: anti-spins swap. Thumbs in — T — thumbs out — T — thumbs in. If your thumbs aren't alternating, one of your hands is sneaking in an isolation."
      },
      {
        "kind": "cue",
        "text": "negative space"
      },
      {
        "kind": "slot",
        "id": "s17-1",
        "prompt": "negative-space pockets for T — with the hands a quarter apart, where the pass-throughs land and which side needs care."
      },
      {
        "kind": "cue",
        "text": "both directions + counts"
      },
      {
        "kind": "spoken",
        "text": "Both directions, with a count. One, two, three, four. Other way: one, two, three, four."
      },
      {
        "kind": "spoken",
        "text": "Two anti-spins at the quarter offset — T. Now. If the alphabet followed its usual pattern, the next video would be one hybrid letter and we'd wrap the group. Gamma has a surprise for you instead."
      }
    ]
  },
  {
    "id": "18-letters-u-v",
    "number": 18,
    "title": "Letters U & V",
    "part": "Part IV — Gamma (M through V)",
    "targetRuntime": "~4:00",
    "goal": "the doubled hybrid — gamma's four-letter group; why the quarter offset splits the hybrid in two; U and V walkthroughs; alternating homework.",
    "blocks": [
      {
        "kind": "pictographs",
        "picks": [
          {
            "letter": "U",
            "variationIndex": 0
          },
          {
            "letter": "V",
            "variationIndex": 0
          }
        ]
      },
      {
        "kind": "spoken",
        "text": "Everywhere else in the alphabet, the triple went iso, anti, hybrid — three letters. A, B, C. G, H, I. So after S and T you'd expect one hybrid. Gamma gives you two: U and V."
      },
      {
        "kind": "spoken",
        "text": "Here's the difference. In C — and in I — one hand isolates, one anti-spins, and that's the whole letter."
      },
      {
        "kind": "slot",
        "id": "s18-1",
        "prompt": "verify this framing — the draft's claim is that at the quarter offset the two role assignments become genuinely different motions, so each gets its own letter, where C and I covered both assignments under one name. If your explanation for WHY is different — lead/trail hand, which hand owns the offset — this paragraph is yours to rewrite."
      },
      {
        "kind": "spoken",
        "text": "At the quarter offset, which hand does which job changes the motion. So each assignment gets its own letter. U is one assignment. V is the other. Same shape, jobs swapped."
      },
      {
        "kind": "cue",
        "text": "U"
      },
      {
        "kind": "slot",
        "id": "s18-2",
        "prompt": "which role assignment is U for your on-camera convention, thumbs, where it binds."
      },
      {
        "kind": "spoken",
        "text": "One hand isolates, the other anti-spins, same direction, quarter offset. Gamma to gamma. That's U. Watch the thumbs: steady on the isolating hand, alternating on the anti hand — mixed orientation, same as C and I."
      },
      {
        "kind": "cue",
        "text": "V"
      },
      {
        "kind": "spoken",
        "text": "Now swap the jobs. The hand that was isolating anti-spins; the hand that was anti-spinning isolates. Same path. That's V."
      },
      {
        "kind": "slot",
        "id": "s18-3",
        "prompt": "one sentence on how U and V actually feel different in the body — this is the money line of the video."
      },
      {
        "kind": "cue",
        "text": "alternate + counts"
      },
      {
        "kind": "spoken",
        "text": "U, then V, back and forth, both directions — that's the homework. One, two, three, four."
      },
      {
        "kind": "spoken",
        "text": "And that completes the same-direction side of gamma: S, T, U, V. Iso, anti, and a hybrid for each role assignment. Four letters where every other group has three. Next up, the opposite-direction side — and just like beta had its compounds, gamma has three of its own."
      }
    ]
  },
  {
    "id": "19-mp",
    "number": 19,
    "title": "MP",
    "part": "Part IV — Gamma (M through V)",
    "targetRuntime": "~6:30",
    "goal": "quarter-opposite; M through R pair into compounds like D–F/J–L did; MP = gamma's isolation loop, cousin of DJ; the full DJ-style progression.",
    "blocks": [
      {
        "kind": "pictographs",
        "picks": [
          {
            "letter": "M",
            "variationIndex": 0
          },
          {
            "letter": "P",
            "variationIndex": 0
          }
        ]
      },
      {
        "kind": "spoken",
        "text": "Remember how the compounds worked. A, B, C repeat cleanly on their own. D, E, F don't — each one is half a cycle, so it needs a partner: D plus J, E plus K, F plus L. The exact same thing happens at gamma. S, T, U, V repeat cleanly — same direction. The other six gamma letters — M, N, O, P, Q, R — run the hands in opposite directions, and each one alone is half a cycle. M pairs with P. N pairs with Q. O pairs with R."
      },
      {
        "kind": "spoken",
        "text": "And they inherit the same triple, one level up. MP is the isolation loop. NQ is the anti-spin loop. OR is the hybrid. Cousins of DJ, EK, and FL — one position over. Canon has mnemonics for these too, if you want the memory hook: Magic Potion, Never Quit, Open Road."
      },
      {
        "kind": "spoken",
        "text": "This video is MP — the isolation loop."
      },
      {
        "kind": "cue",
        "text": "gamma start"
      },
      {
        "kind": "slot",
        "id": "s19-1",
        "prompt": "starting gamma and thumb convention."
      },
      {
        "kind": "spoken",
        "text": "Both hands isolate, opposite directions. M carries you from one gamma to another — that's half the cycle."
      },
      {
        "kind": "slot",
        "id": "s19-2",
        "prompt": "your visual language for how M reads — does it open, travel, unfold?"
      },
      {
        "kind": "spoken",
        "text": "Then P: both hands isolate back the other way, and you're home. M, P. That's one full cycle. Again — M, P. Reverse it — M, P."
      },
      {
        "kind": "cue",
        "text": "continuous — the crossing choice"
      },
      {
        "kind": "slot",
        "id": "s19-3",
        "prompt": "the continuous version — DJ solved this with the crossing-hands choice (right in front, then left in front, then alternating). Does MP have the same fork? This section mirrors that structure if so: one side, other side, alternate."
      },
      {
        "kind": "cue",
        "text": "body turns"
      },
      {
        "kind": "slot",
        "id": "s19-4",
        "prompt": "body turns with MP — DJ did four beats facing front, four through the right turn, four through the left, landing the 12-count. If MP turns the same way, reuse that structure and the \"four and four and four is twelve\" line."
      },
      {
        "kind": "cue",
        "text": "the other vantage"
      },
      {
        "kind": "slot",
        "id": "s19-5",
        "prompt": "DJ closed with the split-opposite vantage from side beta. Is there an equivalent second vantage for MP — a different gamma entry that changes the feel? If yes it goes here; if not, cut this section."
      },
      {
        "kind": "cue",
        "text": "full run with count"
      },
      {
        "kind": "spoken",
        "text": "Now the whole thing, less talking."
      },
      {
        "kind": "slot",
        "id": "s19-6",
        "prompt": "count structure — 12 if the turn structure matches DJ."
      },
      {
        "kind": "cue",
        "text": "thumbs out"
      },
      {
        "kind": "spoken",
        "text": "And all of it works thumbs out instead. Same shape, different feel. M, P. M, P."
      }
    ]
  },
  {
    "id": "20-nq",
    "number": 20,
    "title": "NQ",
    "part": "Part IV — Gamma (M through V)",
    "targetRuntime": "~6:30",
    "goal": "NQ = gamma's anti-spin loop, cousin of EK; orientation flips every unit; negative-space pass-throughs; body turns; both vantages if they exist.",
    "blocks": [
      {
        "kind": "pictographs",
        "picks": [
          {
            "letter": "N",
            "variationIndex": 0
          },
          {
            "letter": "Q",
            "variationIndex": 0
          }
        ]
      },
      {
        "kind": "spoken",
        "text": "This is NQ — the anti-spin loop. N matches with Q exactly the way E matched with K. N travels from one gamma to the other through two anti-spins, opposite directions. Q brings you home the same way."
      },
      {
        "kind": "cue",
        "text": "gamma, thumbs in"
      },
      {
        "kind": "spoken",
        "text": "Start thumbs in. Anti-spin both hands, opposite directions — N — and you've crossed to the far gamma, thumbs out. Back through — Q — thumbs in, home. Open N, close Q. Just like EK, the anti-spins mean your orientation flips on every unit, and negative space is where this loop lives."
      },
      {
        "kind": "slot",
        "id": "s20-1",
        "prompt": "the negative-space pass-throughs for N and Q — EK's version had the thumb ends riding the shoulder pockets on the open and the staves passing under the arms on the close. Where are the equivalent pockets at the quarter offset?"
      },
      {
        "kind": "cue",
        "text": "continuous, one side then the other"
      },
      {
        "kind": "slot",
        "id": "s20-2",
        "prompt": "continuous NQ with the leading-hand choice, one side then the other, then alternating — mirroring the EK video's structure."
      },
      {
        "kind": "cue",
        "text": "body turns"
      },
      {
        "kind": "slot",
        "id": "s20-3",
        "prompt": "turns — EK switched variations for turns (thumb ends outside the body instead of through negative space). Does NQ need an equivalent swap?"
      },
      {
        "kind": "cue",
        "text": "count"
      },
      {
        "kind": "spoken",
        "text": "Whole thing, less talking."
      },
      {
        "kind": "slot",
        "id": "s20-4",
        "prompt": "count."
      },
      {
        "kind": "spoken",
        "text": "That's NQ. One loop left, and if you've been following the pattern, you already know what it is."
      }
    ]
  },
  {
    "id": "21-or",
    "number": 21,
    "title": "OR",
    "part": "Part IV — Gamma (M through V)",
    "targetRuntime": "~6:30",
    "goal": "OR = gamma's hybrid loop, cousin of FL and C; one hand isolates, one anti-spins, opposite directions; role assignments as homework; the series' last new motion.",
    "blocks": [
      {
        "kind": "pictographs",
        "picks": [
          {
            "letter": "O",
            "variationIndex": 0
          },
          {
            "letter": "R",
            "variationIndex": 0
          }
        ]
      },
      {
        "kind": "spoken",
        "text": "Last compound of the series: OR — the hybrid loop. One hand isolates, one hand anti-spins, opposite directions, and O plus R closes the cycle. It's the gamma cousin of FL, the same way FL was the loop cousin of C."
      },
      {
        "kind": "cue",
        "text": "convention"
      },
      {
        "kind": "spoken",
        "text": "Keep one convention for the whole video."
      },
      {
        "kind": "slot",
        "id": "s21-1",
        "prompt": "your role pick — FL used right hand isolates, left anti-spins."
      },
      {
        "kind": "spoken",
        "text": "Everything works with the roles swapped; that's homework, same as always."
      },
      {
        "kind": "cue",
        "text": "open O, close R"
      },
      {
        "kind": "spoken",
        "text": "O — the isolating hand travels one way, the anti-spinning hand the other, and you've crossed to the far gamma."
      },
      {
        "kind": "slot",
        "id": "s21-2",
        "prompt": "thumb checkpoints — FL's were: in on beta, mixed on F, in again on L. What are they here?"
      },
      {
        "kind": "spoken",
        "text": "R — back home. O, R. Again. O, R. Reverse it."
      },
      {
        "kind": "cue",
        "text": "continuous with the leading-hand fork"
      },
      {
        "kind": "slot",
        "id": "s21-3",
        "prompt": "continuous OR — FL forked on which hand leads in front and flipped between versions at the low point. The equivalent fork here."
      },
      {
        "kind": "cue",
        "text": "body turns + count"
      },
      {
        "kind": "slot",
        "id": "s21-4",
        "prompt": "turns and the count — FL ran the 12-count with role swaps to even out both sides. Mirror that if OR turns the same way."
      },
      {
        "kind": "cue",
        "text": "outro"
      },
      {
        "kind": "spoken",
        "text": "That's OR — and that's all three gamma loops. MP the isolation loop, NQ the anti-spin loop, OR the hybrid. The same iso, anti, hybrid pattern as A, B, C — as G, H, I — as DJ, EK, FL. One video left, and it's the big one: the whole map."
      }
    ]
  },
  {
    "id": "22-type-1-wrap-up",
    "number": 22,
    "title": "Type 1 Wrap Up",
    "part": "Part IV — Gamma (M through V)",
    "targetRuntime": "~1:30",
    "goal": "the complete Type 1 map; the ends-in rule; the triple everywhere; the doubled hybrid as the one exception; compounds close cycles; the inference trick now works across the whole family; sign-off.",
    "blocks": [
      {
        "kind": "pictographs",
        "picks": [
          {
            "letter": "A",
            "variationIndex": 0
          },
          {
            "letter": "G",
            "variationIndex": 0
          },
          {
            "letter": "S",
            "variationIndex": 0
          }
        ]
      },
      {
        "kind": "spoken",
        "text": "Let's zoom all the way out, because you now hold the entire first family of the alphabet — every letter from A to V."
      },
      {
        "kind": "spoken",
        "text": "The map. Six letters end in alpha. Six end in beta. Ten end in gamma. The moment you see where a motion ends, you know its neighborhood."
      },
      {
        "kind": "spoken",
        "text": "The pattern. Iso, anti, hybrid — everywhere. A, B, C. G, H, I. M, N, O. P, Q, R. The one exception: the same-direction gamma group, where the hybrid splits in two and you get four letters — S, T, U, V."
      },
      {
        "kind": "spoken",
        "text": "The loops. When a letter closes its own cycle, it repeats on its own — A, B, C, G, H, I, S, T, U, V. When it doesn't, it has a partner: DJ, EK, FL between beta and alpha. MP, NQ, OR inside gamma."
      },
      {
        "kind": "spoken",
        "text": "So the trick from the first wrap up now works across twenty-two letters. Someone names any Type 1 letter, and you can reconstruct its neighbors, its position, and whether it needs a partner — from one piece of information."
      },
      {
        "kind": "spoken",
        "text": "That's Type 1. Both hands shifting, every beat, every way between alpha, beta, and gamma. Everything past this — dashes, statics, one hand moving without the other — builds on what you just learned. I hope this series was useful. Tell me what landed and what I could do better. See you in the next one."
      }
    ]
  },
  {
    "id": "23-type-2-one-hand-rests",
    "number": 23,
    "title": "Type 2: One Hand Rests",
    "part": "Part V — One Hand at a Time (Types 2 & 3)",
    "targetRuntime": "~4:00",
    "goal": "the second of the six combinations from video 1 finally gets its name; shift + static; Type 2 letters as the connectors between neighborhoods; the eight letters preview.",
    "blocks": [
      {
        "kind": "pictographs",
        "picks": [
          {
            "letter": "Σ",
            "variationIndex": 0
          }
        ]
      },
      {
        "kind": "spoken",
        "text": "All the way back in the first video, I showed you six ways two hands can combine: shift, dash, or static, in every pairing. The entire alphabet so far — A through V — came from just one of those six: both hands shifting. That's why it's called Type 1."
      },
      {
        "kind": "spoken",
        "text": "Today the second combination gets its letters. One hand shifts. The other stays static, holding its point. That's Type 2."
      },
      {
        "kind": "cue",
        "text": "demo — one hand shifts, one rests"
      },
      {
        "kind": "spoken",
        "text": "And Type 2 has a job Type 1 doesn't. Every Type 1 letter kept you inside a neighborhood or cycled you through a fixed route. Type 2 letters are the connectors — one hand moves, the geometry between your hands changes, and you walk from one position family into another. Alpha into gamma. Beta into gamma. Gamma back out to alpha."
      },
      {
        "kind": "spoken",
        "text": "There are eight of them: four Greek — sigma, delta, theta, omega — and four you already know from English — W, X, Y, Z. Where they sit isn't random."
      },
      {
        "kind": "slot",
        "id": "s23-1",
        "prompt": "your preferred framing for how the eight split — the next three videos group them by starting family: Σ/Δ from alpha, Θ/Ω from beta, W/X/Y/Z from gamma."
      },
      {
        "kind": "spoken",
        "text": "One more new idea before the letters. When both hands rotate in a Type 2 motion, the two props either spin the same direction or opposite directions — and the alphabet writes that down with a dot: a dot above the letter for same, below for opposite. Sigma-same. Sigma-opp. You'll see it on the pictographs starting now."
      },
      {
        "kind": "slot",
        "id": "s23-2",
        "prompt": "whether to introduce the dot here or defer to video 32 — it's spoken here because Type 2 is where it first applies."
      },
      {
        "kind": "spoken",
        "text": "Next video: the two letters that walk you out of alpha."
      }
    ]
  },
  {
    "id": "24-and-from-alpha",
    "number": 24,
    "title": "Σ and Δ (from alpha)",
    "part": "Part V — One Hand at a Time (Types 2 & 3)",
    "targetRuntime": "~4:00",
    "goal": "the alpha-start Type 2 pair; static hand as anchor; pro vs anti on the shifting hand; the dot in practice.",
    "blocks": [
      {
        "kind": "pictographs",
        "picks": [
          {
            "letter": "Σ",
            "variationIndex": 0
          },
          {
            "letter": "Δ",
            "variationIndex": 0
          }
        ]
      },
      {
        "kind": "spoken",
        "text": "Start in alpha, hands apart. This is home base for two letters: sigma and delta."
      },
      {
        "kind": "cue",
        "text": "sigma"
      },
      {
        "kind": "spoken",
        "text": "Keep one hand static — it's the anchor. The other hand shifts to an adjacent point, and now your hands sit at a right angle. You just walked from alpha into gamma with one motion. That's sigma."
      },
      {
        "kind": "slot",
        "id": "s24-1",
        "prompt": "which rotation your canonical sigma uses on the shifting hand, thumb checkpoints, and the sigma/delta distinction as you teach it — the knowledge base holds the letter data; the on-camera contrast is yours."
      },
      {
        "kind": "cue",
        "text": "delta"
      },
      {
        "kind": "spoken",
        "text": "Delta is sigma's sibling from the same start."
      },
      {
        "kind": "slot",
        "id": "s24-2",
        "prompt": "the delta walkthrough and what separates it from sigma in the body — same anchor idea, different shift."
      },
      {
        "kind": "cue",
        "text": "both, with the dot"
      },
      {
        "kind": "spoken",
        "text": "Now watch the two props when both are rotating. Same direction — that's the same-dot version. Opposite — the opp-dot. Two letters, each with both flavors."
      },
      {
        "kind": "cue",
        "text": "drill + counts"
      },
      {
        "kind": "spoken",
        "text": "Anchor left, shift right. Anchor right, shift left. Both directions. One, two, three, four."
      },
      {
        "kind": "spoken",
        "text": "Sigma and delta: your exits from alpha. Next, the exits from beta."
      }
    ]
  },
  {
    "id": "25-and-from-beta",
    "number": 25,
    "title": "Θ and Ω (from beta)",
    "part": "Part V — One Hand at a Time (Types 2 & 3)",
    "targetRuntime": "~4:00",
    "goal": "the beta-start pair; unstacking; theta and omega; drills both hands.",
    "blocks": [
      {
        "kind": "pictographs",
        "picks": [
          {
            "letter": "θ",
            "variationIndex": 0
          },
          {
            "letter": "Ω",
            "variationIndex": 0
          }
        ]
      },
      {
        "kind": "spoken",
        "text": "Hands stacked in beta. Two letters start their lives here: theta and omega."
      },
      {
        "kind": "cue",
        "text": "theta"
      },
      {
        "kind": "spoken",
        "text": "One hand holds the stack point. The other shifts away to an adjacent point — and the stack unstacks into a right angle. Beta into gamma, one motion. That's theta."
      },
      {
        "kind": "slot",
        "id": "s25-1",
        "prompt": "canonical theta — which hand leaves, rotation, thumbs."
      },
      {
        "kind": "cue",
        "text": "omega"
      },
      {
        "kind": "spoken",
        "text": "Omega, same start, same anchor idea."
      },
      {
        "kind": "slot",
        "id": "s25-2",
        "prompt": "the omega walkthrough and the theta/omega contrast."
      },
      {
        "kind": "cue",
        "text": "same/opp + drill"
      },
      {
        "kind": "spoken",
        "text": "Same-dot and opp-dot versions, both letters. Then drill it: anchor left, anchor right, both directions. One, two, three, four."
      },
      {
        "kind": "spoken",
        "text": "Theta and omega: the exits from beta. Which leaves the biggest neighborhood — and it gets four letters, not two."
      }
    ]
  },
  {
    "id": "26-w-x-y-z-from-gamma",
    "number": 26,
    "title": "W, X, Y, Z (from gamma)",
    "part": "Part V — One Hand at a Time (Types 2 & 3)",
    "targetRuntime": "~5:00",
    "goal": "the gamma-start four; why gamma gets twice as many Type 2 letters; W walkthrough as the model; X, Y, Z; the family drilled.",
    "blocks": [
      {
        "kind": "pictographs",
        "picks": [
          {
            "letter": "W",
            "variationIndex": 0
          },
          {
            "letter": "X",
            "variationIndex": 0
          },
          {
            "letter": "Y",
            "variationIndex": 0
          },
          {
            "letter": "Z",
            "variationIndex": 0
          }
        ]
      },
      {
        "kind": "spoken",
        "text": "Gamma — the right angle — is where the last four Type 2 letters live: W, X, Y, and Z. Why four here when alpha and beta each got two? Remember the gamma series: the right angle is the position where the hands' roles genuinely differ. Which hand rests and which hand travels matters more here, and the alphabet gives the variations their own names."
      },
      {
        "kind": "slot",
        "id": "s26-1",
        "prompt": "verify this framing — same caveat as the U/V video; if your explanation differs, rewrite this sentence."
      },
      {
        "kind": "cue",
        "text": "W"
      },
      {
        "kind": "spoken",
        "text": "Start in gamma. One hand holds. The other shifts — and the right angle opens out into a line. Hands apart: you've walked from gamma into alpha. That's W."
      },
      {
        "kind": "slot",
        "id": "s26-2",
        "prompt": "canonical W, thumbs, rotation."
      },
      {
        "kind": "cue",
        "text": "X, Y, Z"
      },
      {
        "kind": "slot",
        "id": "s26-3",
        "prompt": "the X, Y, Z walkthroughs and what distinguishes the four — this is the densest slot in the series; the knowledge base confirms the letters exist with pro and anti variants but the on-camera taxonomy is yours."
      },
      {
        "kind": "cue",
        "text": "family drill"
      },
      {
        "kind": "spoken",
        "text": "All four, both anchors, both directions. One, two, three, four."
      },
      {
        "kind": "spoken",
        "text": "That's Type 2 complete: eight letters, one hand resting, every road between the neighborhoods. Next — what happens when the resting hand stops resting and cuts straight across."
      }
    ]
  },
  {
    "id": "27-type-3-the-dash-letters",
    "number": 27,
    "title": "Type 3: The Dash Letters",
    "part": "Part V — One Hand at a Time (Types 2 & 3)",
    "targetRuntime": "~4:30",
    "goal": "shift + dash; the \"-\" suffix as part of the letter name; the eight Type 3 letters mirror the Type 2 eight; spoken form \"Z-dash\".",
    "blocks": [
      {
        "kind": "pictographs",
        "picks": [
          {
            "letter": "Σ-",
            "variationIndex": 0
          },
          {
            "letter": "W-",
            "variationIndex": 0
          }
        ]
      },
      {
        "kind": "spoken",
        "text": "Type 3 is Type 2 with the lazy hand fired. One hand still shifts — but the other, instead of holding its point, dashes: straight across the grid to the opposite point. Shift plus dash."
      },
      {
        "kind": "spoken",
        "text": "The names are the easiest in the alphabet: take the eight Type 2 letters and add a dash. Sigma-dash. Delta-dash. Theta-dash. Omega-dash. W-dash, X-dash, Y-dash, Z-dash. The dash is part of the letter's name — when you see Z with a little dash after it, you say \"Z-dash,\" and you know exactly what it is: Z's shift, plus a dash underneath it."
      },
      {
        "kind": "cue",
        "text": "first Type 3 demo"
      },
      {
        "kind": "slot",
        "id": "s27-1",
        "prompt": "your entry letter for Type 3 and the walkthrough — which pairing teaches the shift-over-dash coordination most cleanly, where the timing trap is, and whether the dash hand needs its own drill first."
      },
      {
        "kind": "cue",
        "text": "same/opp dot"
      },
      {
        "kind": "spoken",
        "text": "The dot rule carries over: both hands rotating, same direction or opposite, dot above or below."
      },
      {
        "kind": "cue",
        "text": "drills"
      },
      {
        "kind": "slot",
        "id": "s27-2",
        "prompt": "the drill progression across the eight — presumably not all eight in one video at full depth; pick the representatives and assign the rest as homework, the way C's variations were homework."
      },
      {
        "kind": "spoken",
        "text": "One, two, three, four. That's Type 3 — and with it, every letter where BOTH hands travel. Three combinations left, and they're quicker."
      }
    ]
  },
  {
    "id": "28-type-4",
    "number": 28,
    "title": "Type 4: Φ, Ψ, Λ",
    "part": "Part VI — Dashes and Statics (Types 4, 5, 6)",
    "targetRuntime": "~4:30",
    "goal": "dash + static; three letters, one per position family; phi, psi, lambda; the opening/closing idea for lambda.",
    "blocks": [
      {
        "kind": "pictographs",
        "picks": [
          {
            "letter": "Φ",
            "variationIndex": 0
          },
          {
            "letter": "Ψ",
            "variationIndex": 0
          },
          {
            "letter": "Λ",
            "variationIndex": 0
          }
        ]
      },
      {
        "kind": "spoken",
        "text": "Type 4: one hand dashes straight across, the other holds. Dash plus static. Three letters — and by now you can guess how they're organized. One per neighborhood."
      },
      {
        "kind": "cue",
        "text": "psi"
      },
      {
        "kind": "spoken",
        "text": "From alpha: psi. Hands apart, one dashes across while the other holds — and the hands come together. Alpha into beta."
      },
      {
        "kind": "slot",
        "id": "s28-1",
        "prompt": "canonical psi walkthrough."
      },
      {
        "kind": "cue",
        "text": "phi"
      },
      {
        "kind": "spoken",
        "text": "From beta: phi. One hand dashes out of the stack while the other holds — hands apart. Beta into alpha. Phi and psi are partners, the same way D and J were: one opens, one closes, and together they cycle."
      },
      {
        "kind": "slot",
        "id": "s28-2",
        "prompt": "whether to teach the ΦΨ compound here or hold it for video 29 — the knowledge base lists it as the dash compound."
      },
      {
        "kind": "cue",
        "text": "lambda"
      },
      {
        "kind": "spoken",
        "text": "From gamma: lambda. One hand dashes, the other holds, and the right angle lands on a new right angle. Gamma to gamma. Lambda is also where a new pair of words enters your vocabulary: instead of same and opposite, lambda's variations are described as opening or closing — does the moving motion resolve toward hands- apart, or toward hands-together?"
      },
      {
        "kind": "slot",
        "id": "s28-3",
        "prompt": "how deep to go on opening/closing on camera — the full logic lives in the glyph video (32)."
      },
      {
        "kind": "cue",
        "text": "drill all three"
      },
      {
        "kind": "spoken",
        "text": "Psi, phi, lambda. Both hand assignments. One, two, three, four."
      }
    ]
  },
  {
    "id": "29-type-5-dual-dashes-the-compound",
    "number": 29,
    "title": "Type 5: Dual Dashes + the ΦΨ Compound",
    "part": "Part VI — Dashes and Statics (Types 4, 5, 6)",
    "targetRuntime": "~3:30",
    "goal": "both hands dash; phi-dash, psi-dash, lambda-dash; the dash compound closes the arc; the alphabet's speed limit joke slot.",
    "blocks": [
      {
        "kind": "pictographs",
        "picks": [
          {
            "letter": "Φ-",
            "variationIndex": 0
          },
          {
            "letter": "Ψ-",
            "variationIndex": 0
          },
          {
            "letter": "Λ-",
            "variationIndex": 0
          }
        ]
      },
      {
        "kind": "spoken",
        "text": "Type 5: both hands dash at once. Everything crosses the grid simultaneously. Three letters again, one per family — phi-dash, psi-dash, lambda-dash — same naming trick as Type 3: the base letter, plus a dash."
      },
      {
        "kind": "cue",
        "text": "the three, briskly"
      },
      {
        "kind": "slot",
        "id": "s29-1",
        "prompt": "walkthroughs — dual dashes are mechanically simple but collision- prone; where the traffic problem is and how you route around it is the whole video."
      },
      {
        "kind": "cue",
        "text": "the ΦΨ compound"
      },
      {
        "kind": "spoken",
        "text": "And here's the last compound of the alphabet: phi plus psi. Beta to alpha, alpha to beta, one hand dashing each way while the other rests — a complete cycle out of pure dashes, the dash cousin of DJ."
      },
      {
        "kind": "slot",
        "id": "s29-2",
        "prompt": "verify the on-camera mechanics; the knowledge base confirms ΦΨ as the dash compound: one hand dashes, one stays static."
      },
      {
        "kind": "spoken",
        "text": "One, two, three, four."
      }
    ]
  },
  {
    "id": "30-type-6-statics",
    "number": 30,
    "title": "Type 6: Statics: α, β, γ",
    "part": "Part VI — Dashes and Statics (Types 4, 5, 6)",
    "targetRuntime": "~2:30",
    "goal": "holding a position is a letter; why notation needs stillness; the three statics; the wink that \"doing nothing\" completes the six combinations.",
    "blocks": [
      {
        "kind": "pictographs",
        "picks": [
          {
            "letter": "α",
            "variationIndex": 0
          },
          {
            "letter": "β",
            "variationIndex": 0
          },
          {
            "letter": "γ",
            "variationIndex": 0
          }
        ]
      },
      {
        "kind": "spoken",
        "text": "The last motion type is the easiest one to perform and the strangest one to accept: nobody moves. Both hands static. And yes — that's a letter. Three of them, actually, and you already know their names, because they're the positions themselves: alpha, beta, gamma. Lowercase."
      },
      {
        "kind": "spoken",
        "text": "Hold alpha for a beat — that's the letter alpha. Hold beta — beta. Hold gamma — gamma."
      },
      {
        "kind": "spoken",
        "text": "Why write down nothing? Because sequences live on beats. A pause isn't the absence of choreography — it's a beat you chose to hold, and if the alphabet couldn't spell it, every sequence with a rest in it would be unwritable. Music has rests. So do we."
      },
      {
        "kind": "cue",
        "text": "a sequence with a held beat"
      },
      {
        "kind": "slot",
        "id": "s30-1",
        "prompt": "a short on-camera phrase using a static mid-sequence — the moment the viewer feels the rest as a choice."
      },
      {
        "kind": "spoken",
        "text": "And with that, all six combinations from video one have their letters. Both shift — Type 1. Shift and static — Type 2. Shift and dash — Type 3. Dash and static — Type 4. Both dash — Type 5. Both static — Type 6. The alphabet is closed. Next video, we hang the whole thing on one wall."
      }
    ]
  },
  {
    "id": "31-alphabet-wrap-the-type-table",
    "number": 31,
    "title": "Alphabet Wrap: The Type Table",
    "part": "Part VI — Dashes and Statics (Types 4, 5, 6)",
    "targetRuntime": "~2:00",
    "goal": "the complete type table as one picture; every letter has a home; the count; the door to notation.",
    "blocks": [
      {
        "kind": "pictographs",
        "picks": [
          {
            "letter": "A",
            "variationIndex": 0
          },
          {
            "letter": "Σ",
            "variationIndex": 0
          },
          {
            "letter": "Σ-",
            "variationIndex": 0
          },
          {
            "letter": "Φ",
            "variationIndex": 0
          },
          {
            "letter": "Φ-",
            "variationIndex": 0
          },
          {
            "letter": "α",
            "variationIndex": 0
          }
        ]
      },
      {
        "kind": "spoken",
        "text": "Let's put the entire alphabet on screen at once."
      },
      {
        "kind": "cue",
        "text": "the full type table"
      },
      {
        "kind": "spoken",
        "text": "Type 1 — both hands shift. A through V. The families you know: the alpha letters, the beta letters, the gamma letters, and the compounds that stitch them into loops."
      },
      {
        "kind": "spoken",
        "text": "Type 2 — shift plus static. Sigma, delta, theta, omega, W, X, Y, Z. The connectors."
      },
      {
        "kind": "spoken",
        "text": "Type 3 — shift plus dash. The same eight, dashed."
      },
      {
        "kind": "spoken",
        "text": "Type 4 — dash plus static. Phi, psi, lambda."
      },
      {
        "kind": "spoken",
        "text": "Type 5 — both dash. Phi-dash, psi-dash, lambda-dash."
      },
      {
        "kind": "spoken",
        "text": "Type 6 — both static. Alpha, beta, gamma — the positions, held."
      },
      {
        "kind": "spoken",
        "text": "Every combination of shift, dash, and static, for two hands — named. When you see any motion now, you can place it: which hands moved, how, and therefore which type, which family, which letter. That was the promise of the first video, kept."
      },
      {
        "kind": "spoken",
        "text": "What we haven't done is learn to READ. The letters on these pictographs carry numbers, dots, and marks we've been walking past all series. Next video, we learn what every one of them means."
      }
    ]
  },
  {
    "id": "32-reading-a-glyph",
    "number": 32,
    "title": "Reading a Glyph",
    "part": "Part VII — Reading and Writing",
    "targetRuntime": "~5:00",
    "goal": "glyph = letter + everything around it; the two turn slots; PADS; the same/opp dot formally; opening/closing formally; spoken forms; the \"don't sweat it, the software places it\" reassurance.",
    "blocks": [
      {
        "kind": "pictographs",
        "picks": [
          {
            "letter": "C",
            "variationIndex": 0
          },
          {
            "letter": "W",
            "variationIndex": 0
          }
        ]
      },
      {
        "kind": "spoken",
        "text": "You can perform every letter in the alphabet. Now let's learn to read one, completely — because on a real pictograph, the letter never travels alone. The letter plus everything around it is called a glyph, and every mark on it means one thing."
      },
      {
        "kind": "cue",
        "text": "a glyph, zoomed"
      },
      {
        "kind": "spoken",
        "text": "To the right of the letter: two small stacked slots. Top slot, bottom slot. Each holds a number — how many extra turns each hand adds. We haven't used turns yet; that's the next part of the series. For now: two slots, one per hand."
      },
      {
        "kind": "spoken",
        "text": "Which hand goes on top? There's a priority order, and it spells PADS: pro, anti, dash, static. Whichever of the two motions sits higher on that list takes the high slot. A hybrid like C — one pro, one anti — puts pro on top. A Type 2 letter — shift and static — puts the shift on top. When both hands do the same thing, like A or B, the rule defaults to left hand high, right hand low."
      },
      {
        "kind": "slot",
        "id": "s32-1",
        "prompt": "S and T are the documented exception — leader high, follower low. Decide whether that level of detail makes the cut on camera."
      },
      {
        "kind": "cue",
        "text": "the dot"
      },
      {
        "kind": "spoken",
        "text": "The dot you've seen since Type 2: above the letter, both props rotate the same direction — spoken \"same.\" Below, opposite — spoken \"opp.\" No dot means only one prop is rotating, so there's nothing to compare."
      },
      {
        "kind": "cue",
        "text": "opening/closing"
      },
      {
        "kind": "spoken",
        "text": "And lambda and gamma trade the dot for opening and closing — per hand: is the rotating motion resolving toward hands-apart, or hands-together?"
      },
      {
        "kind": "cue",
        "text": "spoken forms"
      },
      {
        "kind": "spoken",
        "text": "Reading aloud: C with one turn in the high slot is \"C-high-one.\" W, same-dot, one turn in the low slot: \"W-same-low-one.\" In casual conversation, drop the modifiers — it's just C, just W. Nobody spells the whole glyph at a fire jam."
      },
      {
        "kind": "spoken",
        "text": "One reassurance before you panic-memorize: Flow Arts Composer places all of this for you. You don't have to write glyphs — you have to recognize what they're telling you. Focus on the motions."
      }
    ]
  },
  {
    "id": "33-orientation-algebra",
    "number": 33,
    "title": "Orientation Algebra",
    "part": "Part VII — Reading and Writing",
    "targetRuntime": "~4:00",
    "goal": "the iso-keeps/anti-swaps rule from video 2 grows into the full system; what each motion type does to orientation; predicting your end state from the page; checking yourself mid-sequence.",
    "blocks": [
      {
        "kind": "pictographs",
        "picks": [
          {
            "letter": "A",
            "variationIndex": 0
          },
          {
            "letter": "B",
            "variationIndex": 0
          }
        ]
      },
      {
        "kind": "spoken",
        "text": "Way back in the Positions video I gave you one rule: isolations keep their orientation, anti-spins swap it. That rule was the seed of something bigger, and now that you have all six types, here's the whole plant."
      },
      {
        "kind": "spoken",
        "text": "Every motion type has a fixed effect on your orientation — which way your thumb points at the end:"
      },
      {
        "kind": "spoken",
        "text": "A pro — an isolation — preserves it. Start thumb-in, end thumb-in."
      },
      {
        "kind": "spoken",
        "text": "An anti swaps it. In becomes out."
      },
      {
        "kind": "spoken",
        "text": "A dash swaps it too — cross the grid, and your relationship to the center flips."
      },
      {
        "kind": "slot",
        "id": "s33-1",
        "prompt": "verify the on-camera phrasing here — the knowledge base grounds this as: anti and dash reverse orientation at their base; pro preserves it."
      },
      {
        "kind": "spoken",
        "text": "A static changes nothing, because nothing moved."
      },
      {
        "kind": "cue",
        "text": "reading a sequence off the page"
      },
      {
        "kind": "spoken",
        "text": "So here's the superpower. Take any written sequence. Before you move at all, walk the letters: pro, keep. Anti, swap. Dash, swap. Static, keep. You now know your orientation at every beat — including the last one — without touching a staff. And mid-sequence, one glance at your thumbs tells you whether you're on script or one swap behind."
      },
      {
        "kind": "cue",
        "text": "worked example"
      },
      {
        "kind": "slot",
        "id": "s33-2",
        "prompt": "pick a short real sequence and walk it on camera, thumb checkpoints at every beat — the payoff demo."
      },
      {
        "kind": "spoken",
        "text": "That's orientation algebra. Next part of the series, we finally spend the numbers in those turn slots."
      }
    ]
  },
  {
    "id": "34-turns-level-2",
    "number": 34,
    "title": "Turns (Level 2)",
    "part": "Part VIII — Turns (Levels 2 and 3)",
    "targetRuntime": "~4:30",
    "goal": "what a turn actually is; 1 turn = 180° added; turns live per-hand in the glyph slots; same letter, new flavors; level framing.",
    "blocks": [
      {
        "kind": "pictographs",
        "picks": [
          {
            "letter": "C",
            "variationIndex": 0
          }
        ]
      },
      {
        "kind": "spoken",
        "text": "Everything so far has been Level 1: the base form of every motion, zero turns. Level 2 unlocks one dial: the turn."
      },
      {
        "kind": "spoken",
        "text": "A turn is extra prop rotation added on top of a motion's base. One turn means one hundred eighty degrees of additional rotation. Two turns, a full extra rotation. Level 2 uses whole turns: zero, one, two, or three."
      },
      {
        "kind": "cue",
        "text": "same letter, 0 vs 1 turn"
      },
      {
        "kind": "spoken",
        "text": "Watch the same letter twice."
      },
      {
        "kind": "slot",
        "id": "s34-1",
        "prompt": "your demo letter — base form, then with one turn on one hand."
      },
      {
        "kind": "spoken",
        "text": "Same hand path, same position, same letter — the prop just works harder on the way. That's why turns live in those two glyph slots instead of changing the letter: the letter is WHERE you go; turns are how much the prop spins getting there."
      },
      {
        "kind": "spoken",
        "text": "And they're per-hand. One turn on the pro hand and none on the anti is a different pictograph than the reverse — \"C-high-one\" and \"C-low-one\" are different moves, not mirror images."
      },
      {
        "kind": "cue",
        "text": "orientation callback"
      },
      {
        "kind": "spoken",
        "text": "One tie-back to the algebra video: an odd number of turns swaps your orientation; an even number keeps it. Your thumb-check still works — it just counts turns now too."
      },
      {
        "kind": "slot",
        "id": "s34-2",
        "prompt": "verify phrasing; grounded as odd whole turns reverse orientation."
      },
      {
        "kind": "slot",
        "id": "s34-3",
        "prompt": "drill progression — which letters take turns first, and the pitfalls."
      }
    ]
  },
  {
    "id": "35-half-turns-and-floats-level-3",
    "number": 35,
    "title": "Half Turns and Floats (Level 3)",
    "part": "Part VIII — Turns (Levels 2 and 3)",
    "targetRuntime": "~4:00",
    "goal": "halves split the dial; the float as its own motion quality; fl in the slot; the pro/anti boundary idea; where the foundation arc completes.",
    "blocks": [
      {
        "kind": "spoken",
        "text": "Level 3 splits the dial in half — half turns now count: a half, one and a half, two and a half. A half turn is ninety degrees of added rotation, and it lands you sideways: orientations you couldn't reach on whole turns."
      },
      {
        "kind": "slot",
        "id": "s35-1",
        "prompt": "on-camera demo + your language for the in-between orientations."
      },
      {
        "kind": "spoken",
        "text": "And Level 3 introduces one genuinely new motion quality: the float. A float doesn't rotate with your hand path and doesn't fight it — the prop holds its absolute angle in space while your hand carries it. In the glyph's turn slot it isn't a number; it's written \"fl.\""
      },
      {
        "kind": "cue",
        "text": "pro vs float vs anti, side by side"
      },
      {
        "kind": "spoken",
        "text": "Here's the deep way to see it: pro and anti are two directions of effort, and the float is the boundary between them — the zero point where the prop neither follows nor resists."
      },
      {
        "kind": "slot",
        "id": "s35-2",
        "prompt": "your preferred demo for making the boundary visible; this framing is grounded but the demonstration is yours."
      },
      {
        "kind": "spoken",
        "text": "Whole turns, half turns, floats: that completes the foundation arc of the level system. Everything after this — new grid points, new orientations, new planes — is new territory, not new dials. But first, let's actually USE the alphabet. Next part: sequences."
      }
    ]
  },
  {
    "id": "36-words",
    "number": 36,
    "title": "Words",
    "part": "Part IX — Sequences and LOOPs",
    "targetRuntime": "~3:30",
    "goal": "letters chain into words; end position feeds start position; legal transitions; reading a word off the app; first choreography.",
    "blocks": [
      {
        "kind": "spoken",
        "text": "Every video until now taught you letters. This one teaches you to spell."
      },
      {
        "kind": "spoken",
        "text": "A word is letters performed back to back, one per beat. And there's exactly one rule of spelling: each letter has to start where the previous letter ended. Ends in beta? The next letter must start in beta. That's the entire grammar."
      },
      {
        "kind": "cue",
        "text": "a 4-letter word, slow"
      },
      {
        "kind": "slot",
        "id": "s36-1",
        "prompt": "your demo word — something from the app with a clean flow."
      },
      {
        "kind": "spoken",
        "text": "Watch the seams: the end position of each beat IS the start position of the next. The word isn't four moves — it's one path with four names."
      },
      {
        "kind": "spoken",
        "text": "This is why you learned the ends-in rule so early. Ends in alpha: the next beat can be any letter that starts in alpha. The map you memorized for recognizing letters is the same map that tells you what can come next. Recognition and composition are the same skill, run in opposite directions."
      },
      {
        "kind": "cue",
        "text": "the app"
      },
      {
        "kind": "slot",
        "id": "s36-2",
        "prompt": "a short beat of Flow Arts Composer building the word — pictographs chaining left to right."
      },
      {
        "kind": "spoken",
        "text": "Spell something. Any letters, any length, one rule. Next video: what happens when a word bites its own tail."
      }
    ]
  },
  {
    "id": "37-loops",
    "number": 37,
    "title": "LOOPs",
    "part": "Part IX — Sequences and LOOPs",
    "targetRuntime": "~4:30",
    "goal": "circular words; the LOOP idea; a taste of the transformation types (rotated, mirrored, swapped); why loops are the performance unit; keep the algebra out.",
    "blocks": [
      {
        "kind": "spoken",
        "text": "Some words end where they began. Perform the last beat and you're standing in your starting position, ready to run it again — forever. That's a LOOP."
      },
      {
        "kind": "spoken",
        "text": "You've been doing them since the compound videos: DJ is a loop. So is MP. But loops go far beyond compounds, because a loop isn't just circular — the good ones are built from a pattern that transforms."
      },
      {
        "kind": "cue",
        "text": "examples"
      },
      {
        "kind": "spoken",
        "text": "Take a short seed and rotate it: the second half is the first half, carried to new points around the grid. Or mirror it: the second half is the first half flipped left to right. Or swap it: the hands trade jobs — whatever blue did, red does. Rotated, mirrored, swapped — hearing a loop's name tells you how it was built."
      },
      {
        "kind": "slot",
        "id": "s37-1",
        "prompt": "one on-camera demo per transformation, using loops from the app — and note the \"turn\" terminology guard: a loop's rotation slice is \"180 degrees,\" never \"half turn.\""
      },
      {
        "kind": "spoken",
        "text": "Why care? Because on stage and at the jam, you don't perform letters — you perform loops. They're the riffs. A four-beat loop you can hold for a minute is worth more than forty beats you can do once."
      },
      {
        "kind": "cue",
        "text": "outro"
      },
      {
        "kind": "spoken",
        "text": "And there's a gift waiting in the app: the loops have already been counted, organized, and dealt into decks. Next video — the last of this series — you get your starter deck."
      }
    ]
  },
  {
    "id": "38-your-first-deck",
    "number": 38,
    "title": "Your First Deck",
    "part": "Part IX — Sequences and LOOPs",
    "targetRuntime": "~4:00",
    "goal": "the Level 1 quartered rotated LOOP deck; 2-beat seed × 4 rotations; 64 per starting position; how to practice with cards; series sign-off.",
    "blocks": [
      {
        "kind": "spoken",
        "text": "Here's where the whole series has been heading."
      },
      {
        "kind": "spoken",
        "text": "Take everything you know — the letters, the spelling rule, the loop idea — and apply three constraints: Level 1, zero turns. The rotation keeps going the same direction the whole time. And the loop closes in eight beats with quarter symmetry: you pick just TWO beats, and the grid rotates them ninety degrees, then ninety more, then ninety more, back to start. Two beats of your choosing, four times around. That's the whole recipe."
      },
      {
        "kind": "cue",
        "text": "one card, performed"
      },
      {
        "kind": "slot",
        "id": "s38-1",
        "prompt": "perform one deck sequence on camera, seed first, then the full eight beats."
      },
      {
        "kind": "spoken",
        "text": "How many of these exist? From each starting position — exactly sixty-four. Not about sixty-four: the math closes at sixty-four, whether you start from alpha, beta, or gamma. The alphabet is finite, the rules are strict, and the whole space has been counted and dealt into a deck of cards you can hold."
      },
      {
        "kind": "cue",
        "text": "the cards"
      },
      {
        "kind": "spoken",
        "text": "Pull a card. Read the seed — two beats, you can read glyphs now. Walk the orientation algebra. Perform it four times around. That's practice, that's a warm-up game, that's choreography you can deal at random and own in an afternoon."
      },
      {
        "kind": "spoken",
        "text": "Sixty-four cards, three starting positions, every one built from letters you already speak. The alphabet was the vocabulary. This is your first book."
      },
      {
        "kind": "spoken",
        "text": "Thanks for making it all the way here. Tell me what landed and what I could do better — and I'll see you at Level 2."
      }
    ]
  }
];
