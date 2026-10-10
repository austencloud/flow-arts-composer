import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";

import type { DirectorSceneInput } from "../_lib/film-director-schema";

/**
 * The staging behind every capability demo, one scene per thing the director
 * language can say.
 *
 * These were the scenes of a film called Proving Grounds, which ran three and a
 * half minutes and asked to be watched end to end before it answered anything.
 * Nobody wants a film to find out whether the camera can leave the tripod. The
 * scenes stayed; the film did not. `_capabilities/index.ts` wraps each one as a
 * demo that plays on its own, and owns the name and the single line that says
 * what it shows.
 *
 * Nothing here is user-facing text. A scene is staging: where the bodies are,
 * what is in their hands, what the camera does, and how long it lasts. Scene
 * ids are the stable address — array order is not, and nothing may refer to a
 * scene by its position.
 *
 * Two scenes only mean something with a partner, and their demos carry both:
 * `tempo-double` continues the phrase `tempo-slow` started, and `callback`
 * extends `combined-draw` and re-draws its seed.
 */
export const CAPABILITY_SCENES: readonly DirectorSceneInput[] = [
  {
    id: "combined-draw",
    title: "Combined Draw",
    durationSeconds: 12,
    location: {
      environmentId: "forest",
      // Every plane the draw can land on, lit as scenery — so the six drawn
      // grids are readable in the frame and the absent wall is visible as an
      // absence. The list is the full nine minus the excluded wall.
      visiblePlanes: [
        "wheel",
        "floor",
        "right-shield",
        "left-shield",
        "forward-ramp",
        "backward-ramp",
        "right-wing",
        "left-wing",
      ],
    },
    performance: {
      formation: "line",
      cast: {
        count: 3,
        defaults: {
          // The wave-1 spelling. Each half of it was already sayable; saying
          // both on one axis is what this scene exists to show.
          leftPlane: { pick: "distinct", not: "wall" },
          rightPlane: { pick: "distinct", not: "wall" },
          effect: "none",
        },
      },
    },
    camera: {
      subject: { kind: "group" },
      shotSize: "wide",
      angle: "eye",
      position: "front",
      moves: [{ move: "hold" }],
    },
  },
  {
    id: "on-the-beat",
    title: "On the Beat",
    durationBeats: 16,
    transition: { kind: "cut" },
    location: { environmentId: "cosmic" },
    performance: {
      bpm: 120,
      formation: "side-by-side",
      cast: {
        count: 2,
        performers: [
          {
            id: "performer-2",
            // Side-by-side puts this one on the mark at (0.9, 0). The
            // crossing runs THROUGH the frame — downstage of the partner to
            // (-1.5, -1) — 2.62 m in the four seconds eight beats buy, or
            // 0.65 m/s, inside the 0.47-2.6 m/s window where a walk reads
            // as a walk. A destination out the side of the frame turned the
            // pushed-in arrival into a wall of close-up geometry.
            blocking: [
              {
                move: "walk",
                to: { x: -1.5, z: -1 },
                durationBeats: 8,
                facing: "travel",
              },
              { move: "stand" },
            ],
          },
        ],
      },
    },
    camera: {
      // Aim at the performer who HOLDS a mark, not the group: the group's
      // center is vacated the moment the crossing starts, and a camera
      // aimed at vacated space holds an empty frame for the closing four
      // seconds. Wide with a one-meter push keeps both the push-in and the
      // crossing readable; a deeper push ends with the downstage walker
      // half-cropped at the frame edge.
      subject: { kind: "performer", performerId: "performer-1" },
      shotSize: "wide",
      angle: "eye",
      position: "front",
      moves: [
        { move: "push-in", amount: { meters: 1 }, durationBeats: 8 },
        { move: "hold", durationBeats: 8 },
      ],
    },
  },
  {
    id: "camera-edges",
    title: "Camera Edges",
    durationBeats: 24,
    transition: { kind: "fade-through-black", durationBeats: 2 },
    location: { environmentId: "forest" },
    performance: {
      bpm: 120,
      formation: "side-by-side",
      cast: { count: 2, defaults: { effect: "none" } },
    },
    camera: {
      subject: { kind: "group" },
      shotSize: "wide",
      angle: "eye",
      position: "front",
      moves: [
        {
          move: "truck",
          direction: "right",
          amount: { meters: 1 },
          durationBeats: 8,
        },
        {
          move: "zoom",
          direction: "in",
          amount: { degrees: 15 },
          durationBeats: 8,
        },
        {
          move: "roll",
          direction: "cw",
          amount: { degrees: 10 },
          durationBeats: 4,
        },
        { move: "hold", durationBeats: 4 },
      ],
    },
  },
  {
    id: "tracking-shot",
    title: "Tracking Shot",
    durationBeats: 16,
    transition: { kind: "cut" },
    location: { environmentId: "forest" },
    performance: {
      bpm: 120,
      formation: "side-by-side",
      cast: {
        count: 2,
        defaults: { effect: "none" },
        performers: [
          {
            id: "performer-2",
            // Side-by-side puts performer-2 at (0.9, 0). A 3 m crossing in
            // the four seconds eight beats buy is 0.75 m/s, a walk. The
            // path runs downstage of the partner's mark at (-0.9, 0); a
            // straight walk along z = 0 passed through their body.
            blocking: [
              {
                move: "walk",
                to: { x: -1.5, z: -1.8 },
                durationBeats: 8,
                facing: "travel",
              },
              { move: "stand" },
            ],
          },
        ],
      },
    },
    camera: {
      subject: {
        kind: "performer",
        performerId: "performer-2",
        track: "follow",
      },
      shotSize: "medium",
      angle: "eye",
      position: "front",
      moves: [{ move: "hold" }],
    },
  },
  {
    id: "three-shots",
    title: "Three Shots",
    durationBeats: 16,
    transition: { kind: "cut" },
    location: { environmentId: "cosmic" },
    performance: {
      bpm: 120,
      formation: "side-by-side",
      cast: { count: 2, defaults: { effect: "none" } },
    },
    camera: {
      shots: [
        {
          subject: { kind: "group" },
          shotSize: "wide",
          angle: "eye",
          position: "front",
          durationBeats: 6,
        },
        {
          subject: { kind: "performer", performerId: "performer-1" },
          shotSize: "close-up",
          angle: "low",
          position: "front",
          moves: [{ move: "push-in", amount: { meters: 0.4 } }],
          durationBeats: 6,
        },
        {
          subject: { kind: "group" },
          shotSize: "medium",
          angle: "high",
          position: "behind",
        },
      ],
    },
  },
  {
    id: "derived-sequences",
    title: "Derived Sequences",
    durationBeats: 16,
    transition: { kind: "cut" },
    location: { environmentId: "cosmic" },
    performance: {
      bpm: 120,
      formation: "line",
      cast: {
        count: 3,
        defaults: { effect: "none" },
        performers: [
          {
            id: "performer-1",
            // A real publicSequences document id, world-readable
            // (firestore.rules -> publicSequences). Word FLFLFLFL as of
            // 2026-09-02. If it is ever unpublished the library falls back
            // to the demo and names the miss in `failures`.
            sequence: { library: "0c7e6529-1dca-4254-903e-7068e38c030c" },
          },
          {
            id: "performer-2",
            sequence: {
              transformOf: "performer-1",
              transforms: [
                { op: "rotate", degrees: 90, direction: "cw" },
                { op: "swap-hands" },
              ],
            },
          },
          {
            id: "performer-3",
            sequence: {
              transformOf: "performer-1",
              transforms: [{ op: "rewind" }],
            },
          },
        ],
      },
    },
    camera: {
      subject: { kind: "group" },
      shotSize: "wide",
      angle: "eye",
      position: "front",
      moves: [{ move: "hold" }],
    },
  },
  {
    id: "edges-of-the-stage",
    title: "Edges of the Stage",
    durationBeats: 16,
    transition: { kind: "cut" },
    location: { environmentId: "forest" },
    performance: {
      bpm: 120,
      // side-by-side, not custom: a per-performer `position` overrides its
      // formation slot under any preset (resolve-film-director-spec.ts,
      // `buildResolvedPerformers`), and "custom" would demand a position
      // from all three when only one of them starts somewhere unusual.
      formation: "side-by-side",
      cast: {
        count: 3,
        defaults: { effect: "none" },
        performers: [
          { id: "performer-1", sequence: { source: "none" } },
          { id: "performer-2" },
          {
            id: "performer-3",
            // Off camera at the top of the scene, past the edge of the
            // medium shot below. side-by-side puts the third slot at
            // (1.8, -0.3), which is where the arc lands.
            position: { x: 8, z: -1 },
            blocking: [
              {
                move: "walk",
                to: { x: 1.8, z: -0.3 },
                along: { arc: "left", bulge: 0.25 },
                facing: "travel",
                durationBeats: 12,
              },
              { move: "stand" },
            ],
          },
        ],
      },
    },
    camera: {
      // A medium shot aimed at the centre of the line, not a wide on the
      // group: a group framing widens to include every opening mark, and
      // even a wide on one performer sees about 11 m either side of centre
      // at this depth (measured 2026-09-02), so both put the entrance inside
      // the frame from the first beat and make "off camera" a lie.
      subject: { kind: "performer", performerId: "performer-2" },
      shotSize: "medium",
      angle: "eye",
      position: "front",
      moves: [{ move: "hold" }],
    },
  },
  {
    id: "per-step-changes",
    title: "Per-Step Changes",
    durationBeats: 16,
    transition: { kind: "cut" },
    location: { environmentId: "cosmic" },
    performance: {
      bpm: 120,
      formation: "side-by-side",
      cast: {
        count: 2,
        performers: [
          {
            id: "performer-1",
            stepEffects: [
              { step: 0, effect: "none" },
              { step: 4, effect: "trails" },
              { step: 8, effect: "fire" },
            ],
            stepEfforts: [{ step: 8, effort: "punch" }],
          },
          {
            id: "performer-2",
            holds: [{ fromStep: 4, steps: 4 }],
          },
        ],
      },
    },
    camera: {
      subject: { kind: "group" },
      shotSize: "wide",
      angle: "eye",
      position: "front",
      moves: [{ move: "hold" }],
    },
  },
  {
    id: "orbit-clockwise",
    title: "Orbit Clockwise",
    durationBeats: 16,
    transition: { kind: "cut" },
    location: { environmentId: "forest" },
    performance: {
      bpm: 120,
      formation: "line",
      cast: {
        count: 3,
        defaults: { effect: "none" },
        performers: [
          { id: "performer-1", characterId: "x-bot" },
          { id: "performer-2", characterId: "remy" },
          { id: "performer-3", characterId: "ch01" },
        ],
      },
    },
    camera: {
      subject: { kind: "group" },
      shotSize: "wide",
      angle: "eye",
      position: "front",
      moves: [{ move: "orbit", amount: { degrees: 90 }, direction: "cw" }],
    },
  },
  {
    id: "dolly-zoom",
    title: "Dolly Zoom",
    durationSeconds: 8,
    transition: { kind: "cut" },
    location: { environmentId: "forest" },
    performance: {
      formation: "solo",
      cast: { count: 1, defaults: { effect: "none" } },
    },
    camera: {
      subject: { kind: "performer", performerId: "performer-1" },
      shotSize: "medium",
      angle: "eye",
      position: "front",
      moves: [
        {
          move: "push-in",
          // 1.2 meters, not 2: a medium shot on one performer sits about
          // 2.9 m out, and closing all but 0.9 m of that needs a 114-degree
          // lens to hold her size, past the 100-degree ceiling. 1.2 lands
          // the solve near 77 degrees, wide enough to stretch the forest.
          amount: { meters: 1.2 },
          durationSeconds: 6,
          with: [{ move: "zoom", amount: { match: "subject-size" } }],
        },
        { move: "hold", durationSeconds: 2 },
      ],
    },
  },
  {
    id: "handheld",
    title: "Handheld",
    durationSeconds: 7,
    transition: { kind: "cut" },
    location: { environmentId: "forest" },
    performance: {
      formation: "line",
      cast: { count: 3, defaults: { effect: "none" } },
    },
    camera: {
      subject: { kind: "group" },
      shotSize: "wide",
      angle: "eye",
      position: "front",
      handheld: "steady",
      moves: [{ move: "hold" }],
    },
  },
  {
    id: "whip-pans",
    title: "Whip Pans",
    durationSeconds: 8,
    transition: { kind: "cut" },
    location: { environmentId: "cosmic" },
    performance: {
      formation: "custom",
      performers: [
        {
          id: "him",
          position: { x: -2.5, z: 0 },
          facingDegrees: 180,
          effect: "none",
        },
        {
          id: "her",
          position: { x: 2.5, z: 0 },
          facingDegrees: 180,
          effect: "none",
        },
      ],
    },
    camera: {
      subject: { kind: "performer", performerId: "him" },
      shotSize: "medium",
      angle: "eye",
      position: "front",
      moves: [
        { move: "hold", durationSeconds: 2.5 },
        {
          move: "pan",
          to: { kind: "performer", performerId: "her" },
          durationSeconds: 0.3,
          easing: "linear",
        },
        { move: "hold", durationSeconds: 2.4 },
        {
          move: "pan",
          to: { kind: "performer", performerId: "him" },
          durationSeconds: 0.3,
          easing: "linear",
        },
        { move: "hold", durationSeconds: 2.5 },
      ],
    },
  },
  {
    id: "callback",
    // Gaps 13 and 14. No cast, no location, no plane list, no framing: the
    // only thing this scene says about its staging is which scene it is a
    // variation of and which side the camera is on.
    extends: "combined-draw",
    seedAs: "combined-draw",
    title: "Callback",
    durationSeconds: 6,
    transition: { kind: "cut" },
    camera: { position: "behind" },
  },
  {
    id: "empty-stage",
    title: "Empty Stage",
    durationSeconds: 3,
    transition: { kind: "fade-through-black" },
    location: { environmentId: "forest" },
    performance: { cast: { count: 0 } },
    camera: {
      subject: { kind: "group" },
      shotSize: "wide",
      angle: "eye",
      position: "front",
      moves: [{ move: "hold" }],
    },
  },
  {
    id: "waltz",
    title: "Waltz",
    durationBars: 4,
    transition: { kind: "cut" },
    location: { environmentId: "cosmic" },
    performance: {
      bpm: 90,
      meter: { beatsPerBar: 3 },
      formation: "solo",
      cast: { count: 1, defaults: { effect: "none" } },
    },
    camera: {
      subject: { kind: "performer", performerId: "performer-1" },
      shotSize: "medium",
      angle: "eye",
      position: "front",
      moves: [
        { move: "push-in", amount: { meters: 0.6 }, durationBars: 2 },
        { move: "hold" },
      ],
    },
  },
  {
    id: "tempo-slow",
    title: "Tempo, Slow Half",
    durationBeats: 16,
    transition: { kind: "cut" },
    location: { environmentId: "cosmic" },
    performance: {
      bpm: 60,
      formation: "side-by-side",
      cast: { count: 2, defaults: { effect: "trails" } },
    },
    camera: {
      subject: { kind: "group" },
      shotSize: "wide",
      angle: "eye",
      position: "front",
      moves: [{ move: "hold" }],
    },
  },
  {
    id: "tempo-double",
    title: "Tempo, Double Time",
    durationBeats: 16,
    transition: { kind: "cut" },
    location: { environmentId: "cosmic" },
    performance: {
      bpm: 120,
      phrase: "continue",
      formation: "side-by-side",
      cast: { count: 2, defaults: { effect: "trails" } },
    },
    camera: {
      subject: { kind: "group" },
      shotSize: "wide",
      angle: "eye",
      position: "front",
      moves: [{ move: "hold" }],
    },
  },
  {
    id: "growing-staff",
    title: "Growing Staff",
    durationBeats: 16,
    transition: { kind: "cut" },
    location: { environmentId: "forest" },
    cues: { grow: { atBeats: 4 }, settle: { atBeats: 12 } },
    performance: {
      bpm: 120,
      formation: "side-by-side",
      cast: {
        count: 2,
        defaults: { effect: "trails" },
        performers: [
          {
            id: "performer-1",
            staffLengthCm: 100,
            stepStaffLengths: [
              { step: "grow", staffLengthCm: 100, ease: "cut" },
              { step: "settle", staffLengthCm: 250 },
            ],
          },
          {
            id: "performer-2",
            holds: [{ fromStep: "grow", steps: 4, progress: 0.5 }],
          },
        ],
      },
    },
    camera: {
      subject: { kind: "group" },
      shotSize: "wide",
      angle: "eye",
      position: "front",
      moves: [
        { move: "hold", until: "settle" },
        { move: "push-in", amount: { meters: 0.5 } },
      ],
    },
  },
  {
    id: "two-lines-one-circle",
    title: "Two Lines, One Circle",
    durationBeats: 32,
    transition: { kind: "cut" },
    location: { environmentId: "forest" },
    cues: { drop: { atBeats: 16 } },
    performance: {
      bpm: 120,
      formation: "grid-2x2",
      cast: { count: 4, defaults: { effect: "led" } },
      blocking: [
        { endFormation: "line", durationBeats: 8, facing: "hold" },
        { endFormation: "line", durationBeats: 4 },
        {
          endFormation: "circle",
          startCue: "drop",
          durationBeats: 8,
          facing: "travel",
        },
      ],
    },
    camera: {
      subject: { kind: "group" },
      shotSize: "wide",
      angle: "high",
      position: "front",
      moves: [{ move: "hold" }],
    },
  },
  {
    id: "hand-cam",
    title: "Hand Cam",
    durationBeats: 16,
    transition: { kind: "cut" },
    location: { environmentId: "forest" },
    performance: {
      bpm: 120,
      formation: "side-by-side",
      cast: { count: 2, defaults: { effect: "trails" } },
    },
    camera: {
      subject: { kind: "hand", performerId: "performer-1", hand: "right" },
      shotSize: "close-up",
      angle: "eye",
      position: "front",
      moves: [{ move: "hold" }],
    },
  },
  {
    id: "canon-ramp",
    title: "Canon Ramp",
    durationBeats: 32,
    transition: { kind: "cut" },
    location: { environmentId: "forest" },
    performance: {
      bpm: 120,
      formation: "line",
      cast: {
        count: 4,
        defaults: {
          effect: "led",
          beatOffset: { canon: 2 },
          sequence: { length: 8, level: { ramp: { from: 1, to: 3 } } },
        },
      },
    },
    camera: {
      subject: { kind: "group" },
      shotSize: "wide",
      angle: "high",
      position: "front",
      moves: [{ move: "hold" }],
    },
  },
  {
    id: "prop-builds",
    title: "Prop Builds",
    durationBeats: 16,
    transition: { kind: "cut" },
    location: { environmentId: "forest" },
    performance: {
      bpm: 120,
      formation: "side-by-side",
      cast: {
        count: 2,
        defaults: { prop: PropType.FAN, effect: "trails" },
        performers: [
          {
            id: "performer-1",
            propBuild: {
              fanBuild: "fire",
              fanFrameColor: "black",
              finish: "fire",
            },
          },
          {
            id: "performer-2",
            propBuild: { fanBuild: "lotus", finish: "day" },
          },
        ],
      },
    },
    camera: {
      subject: { kind: "group" },
      shotSize: "medium",
      angle: "eye",
      position: "front",
      moves: [{ move: "hold" }],
    },
  },
  {
    id: "split-hands",
    title: "Split Hands",
    durationBeats: 16,
    transition: { kind: "cut" },
    location: { environmentId: "forest" },
    cues: { split: { atBeats: 8 } },
    performance: {
      bpm: 120,
      formation: "side-by-side",
      cast: {
        count: 2,
        performers: [
          {
            id: "performer-1",
            effect: { left: "fire", right: "led" },
          },
          {
            id: "performer-2",
            effect: "trails",
            stepEffects: [
              { step: "split", effect: { left: "sparkles", right: "ghost" } },
            ],
          },
        ],
      },
    },
    camera: {
      subject: { kind: "group" },
      shotSize: "medium",
      angle: "eye",
      position: "front",
      moves: [{ move: "hold" }],
    },
  },
];

/** Throws rather than returns undefined: a demo names its scenes literally. */
export function capabilityScene(id: string): DirectorSceneInput {
  const scene = CAPABILITY_SCENES.find((entry) => entry.id === id);
  if (!scene) throw new Error(`No capability scene "${id}"`);
  return scene;
}
