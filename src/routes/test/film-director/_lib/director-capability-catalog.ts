/**
 * Every capability the director language offers, enumerated for a reader.
 *
 * The films answer "what can this do?" one scene at a time, over minutes. This
 * answers it at a glance: what the axes are, how many values each one has, and
 * which scene in the loaded film proves it. Nothing here restates a value list.
 * Every count and every label is read from the registry or enum that the
 * resolver and the schema themselves read, so a capability cannot appear here
 * that a film would reject, and one cannot be added to the language without
 * appearing here.
 *
 * Doc: docs/reference/film-director-capability-matrix.md
 */

import { Plane } from "@austencloud/scene-3d";

import { CHARACTER_DEFINITIONS } from "#lib/shared/3d/domain/character-model.js";
import { SCENE_PROP_FAMILIES } from "#lib/shared/3d/domain/scene-prop-catalog.js";
import { SCENE_ENVIRONMENTS } from "#lib/shared/3d/environments/domain/scene-environment.js";
import { EFFECTS } from "#lib/shared/animation-engine/components/effects-panel/effect-registry.js";
import { EFFORTS } from "#lib/shared/effort/domain/effort-types.js";

import { CAMERA_MOVE_RULES, type DirectorCameraMove } from "./camera-language";
import {
  DIRECTOR_CAMERA_ANGLES,
  DIRECTOR_CAMERA_POSITIONS,
  DIRECTOR_CAMERA_PRESETS,
  DIRECTOR_SHOT_SIZES,
  DIRECTOR_TRANSITION_KINDS,
  type FilmDirectorInput,
  type ResolvedFilmDirectorSpec,
} from "./film-director-schema";
import {
  ENVIRONMENT_CATALOG,
  FORMATION_CATALOG,
  PROP_CATALOG,
} from "./resolve-film-director-spec";

/**
 * What the panel does when a capability is chosen.
 *
 * `reference` is not a shortfall to be filled in later. Performer axes are
 * already edited by the shared rail's performer tool, and a second editor for
 * them would be a second owner; framing and presets have no scene-edit seam
 * because they are exclusive with the moves the timeline exists to hold. Those
 * capabilities are here to be counted, read, and proved, which is the half of
 * the ask that no other surface answers.
 */
export type DirectorCapabilityAction =
  | { kind: "camera-move"; move: DirectorCameraMove }
  | { kind: "scene"; field: "formation" | "environment"; value: string }
  | { kind: "reference" };

export interface DirectorCapability {
  /** Unique across the whole catalog, so usage can be keyed on it. */
  id: string;
  label: string;
  /** The literal a film would spell, when it differs from the label. */
  token?: string;
  /** A swatch, where the registry the value came from carries one. */
  color?: string;
  action: DirectorCapabilityAction;
}

export interface DirectorCapabilityGroup {
  id: string;
  label: string;
  /** One line on what the axis controls. Never a list of its values. */
  summary: string;
  /** Where the values come from, named so a reader can go check. */
  source: string;
  capabilities: DirectorCapability[];
}

/** `fire_double_staff` and `extreme-wide` both become title case. */
function titleCase(token: string): string {
  return token
    .split(/[-_]/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** Display names for the props the 3D prop catalog knows by name. */
const PROP_LABELS = new Map<string, string>(
  SCENE_PROP_FAMILIES.flatMap((family) =>
    family.variants.map((variant) => [variant.id as string, variant.label])
  )
);

/** Spoken forms of the direction tokens, for labels only. */
const DIRECTION_WORDS: Record<string, string> = {
  cw: "clockwise",
  ccw: "counter-clockwise",
  up: "up",
  down: "down",
  left: "left",
  right: "right",
  in: "in",
  out: "out",
};

/**
 * Every legal way to spend one camera move.
 *
 * A move with directions appears once per direction, because "orbit" is not
 * something a director can ask for on its own — the two orbits are two
 * different shots. Amounts are deliberately left off: the compiler carries a
 * default for each move, and repeating those numbers here would be a second
 * place for them to drift.
 */
function cameraMoveCapabilities(): DirectorCapability[] {
  const capabilities: DirectorCapability[] = [];
  for (const [move, rule] of Object.entries(CAMERA_MOVE_RULES)) {
    const name = move as DirectorCameraMove["move"];
    if (!rule.directions) {
      capabilities.push({
        id: `camera-move:${name}`,
        label: titleCase(name),
        token: name,
        action: { kind: "camera-move", move: { move: name } },
      });
      continue;
    }
    for (const direction of rule.directions) {
      capabilities.push({
        id: `camera-move:${name}:${direction}`,
        label: `${titleCase(name)} ${DIRECTION_WORDS[direction] ?? direction}`,
        token: `${name} ${direction}`,
        action: {
          kind: "camera-move",
          move: {
            move: name,
            direction: direction as DirectorCameraMove["direction"],
          },
        },
      });
    }
  }
  return capabilities;
}

/** The whole catalog, built once per call from the live registries. */
export function buildDirectorCapabilityGroups(): DirectorCapabilityGroup[] {
  const moveCount = Object.keys(CAMERA_MOVE_RULES).length;

  return [
    {
      id: "camera-moves",
      label: "Camera moves",
      summary: `${moveCount} moves, counted once per direction they accept. A scene takes up to 16, and moves inside one entry run together.`,
      source: "CAMERA_MOVE_RULES",
      capabilities: cameraMoveCapabilities(),
    },
    {
      id: "environments",
      label: "Environments",
      summary: "Where the scene is staged. Changing it mid-film is what a dissolve transition crosses.",
      source: "SCENE_ENVIRONMENTS",
      capabilities: ENVIRONMENT_CATALOG.map((id) => ({
        id: `environment:${id}`,
        label:
          SCENE_ENVIRONMENTS.find((environment) => environment.id === id)
            ?.label ?? titleCase(id),
        token: id,
        action: { kind: "scene", field: "environment", value: id } as const,
      })),
    },
    {
      id: "formations",
      label: "Formations",
      summary:
        "Where the cast stands. Each one accepts particular cast sizes, so a formation can be legal for four performers and not for three.",
      source: "DIRECTOR_FORMATIONS",
      capabilities: FORMATION_CATALOG.map((preset) => ({
        id: `formation:${preset}`,
        label: titleCase(preset),
        token: preset,
        action: { kind: "scene", field: "formation", value: preset } as const,
      })),
    },
    {
      id: "effects",
      label: "Effects",
      summary:
        "What trails a performer's props. Set per performer, per scene, or per step; `none` clears it.",
      source: "EFFECTS",
      capabilities: EFFECTS.map((effect) => ({
        id: `effect:${effect.id}`,
        label: effect.label,
        token: effect.id,
        color: effect.color,
        action: { kind: "reference" } as const,
      })),
    },
    {
      id: "props",
      label: "Props",
      summary: "What a performer holds. Builds and finishes vary within a family.",
      source: "PropType",
      capabilities: PROP_CATALOG.map((prop) => ({
        id: `prop:${prop}`,
        label: PROP_LABELS.get(prop) ?? titleCase(prop),
        token: prop,
        action: { kind: "reference" } as const,
      })),
    },
    {
      id: "characters",
      label: "Characters",
      summary: "The body assigned to a performer. Choreography stays with the performer, not the character.",
      source: "CHARACTER_DEFINITIONS",
      capabilities: CHARACTER_DEFINITIONS.map((character) => ({
        id: `character:${character.id}`,
        label: character.name,
        token: character.id,
        action: { kind: "reference" } as const,
      })),
    },
    {
      id: "efforts",
      label: "Efforts",
      summary: "How the motion is weighted through time. Set per performer or per step.",
      source: "EFFORTS",
      capabilities: EFFORTS.map((effort) => ({
        id: `effort:${effort.id}`,
        label: effort.label,
        token: effort.id,
        action: { kind: "reference" } as const,
      })),
    },
    {
      id: "planes",
      label: "Planes",
      summary: "Which plane a hand spins in. Set per hand, and per step within a scene.",
      source: "Plane",
      capabilities: Object.values(Plane).map((plane) => ({
        id: `plane:${plane}`,
        label: titleCase(String(plane)),
        token: String(plane),
        action: { kind: "reference" } as const,
      })),
    },
    {
      id: "shot-sizes",
      label: "Shot sizes",
      summary: "How much of the subject the frame holds. Exclusive with a camera preset.",
      source: "DIRECTOR_SHOT_SIZES",
      capabilities: DIRECTOR_SHOT_SIZES.map((size) => ({
        id: `shot-size:${size}`,
        label: titleCase(size),
        token: size,
        action: { kind: "reference" } as const,
      })),
    },
    {
      id: "camera-angles",
      label: "Camera angles",
      summary: "The height the frame looks from.",
      source: "DIRECTOR_CAMERA_ANGLES",
      capabilities: DIRECTOR_CAMERA_ANGLES.map((angle) => ({
        id: `angle:${angle}`,
        label: titleCase(angle),
        token: angle,
        action: { kind: "reference" } as const,
      })),
    },
    {
      id: "camera-positions",
      label: "Camera positions",
      summary: "Where around the cast the frame sits. A film may also name an exact angle in degrees.",
      source: "DIRECTOR_CAMERA_POSITIONS",
      capabilities: DIRECTOR_CAMERA_POSITIONS.map((position) => ({
        id: `position:${position}`,
        label: titleCase(position),
        token: position,
        action: { kind: "reference" } as const,
      })),
    },
    {
      id: "camera-presets",
      label: "Camera presets",
      summary:
        "A whole framing in one word. Exclusive with moves and framing, and a preset a formation does not approve is substituted with the swap shown.",
      source: "DIRECTOR_CAMERA_PRESETS",
      capabilities: DIRECTOR_CAMERA_PRESETS.map((preset) => ({
        id: `preset:${preset}`,
        label: titleCase(preset),
        token: preset,
        action: { kind: "reference" } as const,
      })),
    },
    {
      id: "transitions",
      label: "Transitions",
      summary: "How a scene reaches the next one.",
      source: "DIRECTOR_TRANSITION_KINDS",
      capabilities: DIRECTOR_TRANSITION_KINDS.map((kind) => ({
        id: `transition:${kind}`,
        label: titleCase(kind),
        token: kind,
        action: { kind: "reference" } as const,
      })),
    },
  ];
}

/**
 * Which scenes of the loaded film actually use each capability.
 *
 * Computed rather than authored, so it cannot claim a scene proves something
 * the scene stopped doing. Camera moves are read from the written document,
 * because the resolver compiles them into keyframes and the move names are
 * gone by then; everything else is read from the resolved film, where a
 * directive has already become the concrete value it drew.
 */
export function findCapabilityUsage(
  input: FilmDirectorInput,
  film: ResolvedFilmDirectorSpec
): Map<string, string[]> {
  const usage = new Map<string, string[]>();
  const note = (capabilityId: string, sceneId: string): void => {
    const scenes = usage.get(capabilityId);
    if (!scenes) usage.set(capabilityId, [sceneId]);
    else if (!scenes.includes(sceneId)) scenes.push(sceneId);
  };

  for (const scene of input.scenes) {
    const camera = scene.camera as Record<string, unknown> | undefined;
    if (!camera) continue;

    const framings: Record<string, unknown>[] = [camera];
    if (Array.isArray(camera.shots)) {
      framings.push(...(camera.shots as Record<string, unknown>[]));
    }

    for (const framing of framings) {
      for (const [field, prefix] of [
        ["shotSize", "shot-size"],
        ["angle", "angle"],
        ["position", "position"],
      ] as const) {
        const value = framing[field];
        if (typeof value === "string") note(`${prefix}:${value}`, scene.id);
      }
      noteCameraMoves(framing.moves, scene.id, note);
    }
  }

  for (const scene of film.scenes) {
    note(`environment:${scene.location.environmentId}`, scene.id);
    note(`formation:${scene.performance.formation}`, scene.id);
    note(`transition:${scene.transition.kind}`, scene.id);
    note(`preset:${scene.camera.preset}`, scene.id);
    if (scene.camera.substitutedFor) {
      note(`preset:${scene.camera.substitutedFor}`, scene.id);
    }

    for (const performer of scene.performance.performers) {
      note(`character:${performer.characterId}`, scene.id);
      note(`prop:${performer.prop}`, scene.id);
      note(`effort:${performer.effort}`, scene.id);
      if (performer.effect && performer.effect !== "none") {
        note(`effect:${performer.effect}`, scene.id);
      }
      for (const plane of [performer.leftPlane, performer.rightPlane]) {
        if (plane) note(`plane:${plane}`, scene.id);
      }
    }
  }

  return usage;
}

/** Walks a `moves` list, including the moves nested under `with`. */
function noteCameraMoves(
  moves: unknown,
  sceneId: string,
  note: (capabilityId: string, sceneId: string) => void
): void {
  if (!Array.isArray(moves)) return;
  for (const entry of moves as DirectorCameraMove[]) {
    if (!entry || typeof entry.move !== "string") continue;
    note(
      entry.direction
        ? `camera-move:${entry.move}:${entry.direction}`
        : `camera-move:${entry.move}`,
      sceneId
    );
    noteCameraMoves(entry.with, sceneId, note);
  }
}
