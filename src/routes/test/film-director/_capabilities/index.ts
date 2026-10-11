import { hashString } from "#lib/shared/3d/procedural-engine/generation/seed-generator.js";

import type {
  DirectorSceneCategory,
  FilmDirectorInput,
} from "../_lib/film-director-schema";
import { capabilityScene } from "./scenes";

/**
 * Every capability the director language offers, one demo each.
 *
 * This replaced a library of nine films. The films proved the language and then
 * kept charging for it: finding out whether the camera can leave the tripod
 * cost a three and a half minute watch, or knowing that Proving Grounds scene
 * eleven was the one. A capability is now its own document with one scene in
 * it, so picking it plays it, on a loop, and nothing else.
 *
 * `id` is the address (`?film=<id>`) and the scene id it wraps. `demonstrates`
 * is the whole description: one line, read in a glance, no paragraph behind it.
 * If a capability needs more than a line to say what it shows, the demo is
 * doing two things and should be two demos.
 *
 * Staging lives in `./scenes`. Nothing here restates it.
 */
export interface CapabilityDemo {
  /** Unique. Both the URL key and the id of the scene the demo leads with. */
  id: string;
  label: string;
  /** One line. What you will see. Never a second sentence of theory. */
  demonstrates: string;
  category: DirectorSceneCategory;
  film: FilmDirectorInput;
}

/**
 * Shared across every demo, because none of them is a film with a look of its
 * own.
 *
 * `base` is stated rather than left to default, and that is load-bearing. The
 * default is `hashString(film.id)`, which would give each demo its own stream
 * family and make a scene's draw depend on which document happens to wrap it —
 * so `combined-draw` would deal one set of planes in its own demo and a
 * different set as the callback's establishing shot. Naming the base pins the
 * draw to the scene, which is the unit now. The `rightPlane` salt is tuned
 * against this base: it lands `combined-draw` a draw with no cross-axis
 * repeats, so its frame shows six visibly different planes.
 */
const DEMO_DOCUMENT = {
  version: 5,
  format: { width: 1920, height: 1080, fps: 30 },
  playback: { loop: true, autoplay: true },
  seed: {
    base: hashString("film-director-capabilities"),
    axes: { rightPlane: 5 },
  },
} as const;

function demo(
  category: DirectorSceneCategory,
  id: string,
  label: string,
  demonstrates: string,
  /** Lead-in scenes, for the two capabilities that need one. */
  leadIn: readonly string[] = []
): CapabilityDemo {
  return {
    id,
    label,
    demonstrates,
    category,
    film: {
      ...DEMO_DOCUMENT,
      id: `capability-${id}`,
      title: label,
      brief: demonstrates,
      scenes: [...leadIn, id].map(capabilityScene),
    },
  };
}

/**
 * Declared in category order, which is also the order the list renders in.
 * Adding a capability means adding a scene to `./scenes` and a line here.
 */
export const CAPABILITY_LIBRARY: readonly CapabilityDemo[] = [
  demo(
    "camera",
    "camera-edges",
    "Camera Edges",
    "Truck, zoom and roll: the frame slides, tightens and tilts without turning."
  ),
  demo(
    "camera",
    "tracking-shot",
    "Tracking Shot",
    "The camera follows a walking performer instead of losing them."
  ),
  demo(
    "camera",
    "three-shots",
    "Three Shots",
    "Three framings and two hard cuts inside one scene."
  ),
  demo(
    "camera",
    "orbit-clockwise",
    "Orbit Clockwise",
    "A 90 degree orbit whose direction reads at a glance."
  ),
  demo(
    "camera",
    "dolly-zoom",
    "Dolly Zoom",
    "A zoom inside a push that holds the performer the same size in frame."
  ),
  demo(
    "camera",
    "handheld",
    "Handheld",
    "Off the tripod, shaking the same way every run."
  ),
  demo(
    "camera",
    "whip-pans",
    "Whip Pans",
    "A pan aimed at a performer rather than at an angle."
  ),
  demo(
    "camera",
    "hand-cam",
    "Hand Cam",
    "The camera takes a hand or a prop tip as its subject."
  ),
  demo(
    "timing",
    "on-the-beat",
    "On the Beat",
    "Every duration counted in beats, nothing in seconds."
  ),
  demo(
    "timing",
    "waltz",
    "Waltz",
    "Counted in bars: meter three, four bars, a two bar push."
  ),
  demo(
    "timing",
    "tempo-double",
    "Tempo Change",
    "The count carries across a tempo cut instead of restarting at zero.",
    ["tempo-slow"]
  ),
  demo(
    "timing",
    "growing-staff",
    "Growing Staff",
    "Named cues drive a staff ramp, a camera hold and a freeze together."
  ),
  demo(
    "staging",
    "edges-of-the-stage",
    "Edges of the Stage",
    "An entrance from eight meters outside the frame, along a curve."
  ),
  demo(
    "staging",
    "empty-stage",
    "Empty Stage",
    "A cast of zero. The stage holds with nobody on it."
  ),
  demo(
    "staging",
    "two-lines-one-circle",
    "Two Lines, One Circle",
    "Blocking as a timeline: three formations inside one scene."
  ),
  demo(
    "performers",
    "combined-draw",
    "Combined Draw",
    "Six different spin planes drawn at once, and never the wall."
  ),
  demo(
    "performers",
    "derived-sequences",
    "Derived Sequences",
    "A saved sequence and two transforms of it, side by side."
  ),
  demo(
    "performers",
    "per-step-changes",
    "Per-Step Changes",
    "Effect, effort and a hold change partway through a scene."
  ),
  demo(
    "performers",
    "canon-ramp",
    "Canon Ramp",
    "One spread the cast divides among itself: a canon offset and a level ramp."
  ),
  demo(
    "props",
    "prop-builds",
    "Prop Builds",
    "The build of a prop, with its finish overridden per performer."
  ),
  demo(
    "props",
    "split-hands",
    "Split Hands",
    "A different effect on each hand."
  ),
  demo(
    "structure",
    "callback",
    "Callback",
    "The same scene again from behind, inherited rather than retyped.",
    ["combined-draw"]
  ),
];

/** Whether a string names a demo. The guard `?film=` is parsed against. */
export function isLibraryFilmKey(key: string): boolean {
  return CAPABILITY_LIBRARY.some((entry) => entry.id === key);
}

/**
 * Throws rather than falling back: every caller has already been through
 * `isLibraryFilmKey` or picked from the list, so a miss is a wiring bug. A
 * silent fall back to the first demo would play the wrong thing and look like
 * it worked.
 */
export function capabilityDemo(id: string): CapabilityDemo {
  const found = CAPABILITY_LIBRARY.find((entry) => entry.id === id);
  if (!found) throw new Error(`No capability "${id}"`);
  return found;
}

export function getLibraryFilm(key: string): FilmDirectorInput {
  return capabilityDemo(key).film;
}
