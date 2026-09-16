/**
 * Resolves each performer's directed sequence into real SequenceData.
 *
 * The film schema lets a performer say what they spin — the shared demo, a
 * directed sequence, a saved library sequence, or another performer's
 * sequence changed by a chain of transforms (`mirrorOf` being the one-word
 * spelling of a single mirror). Generating, loading, and transforming are all
 * async, so this sits between the synchronous spec resolver and the location:
 * the scene asks for a scene's sequences, gets whatever has resolved so far,
 * and re-applies once the rest land.
 *
 * Everything is cached by what it is rather than by who asked for it, so two
 * performers who directed the same sequence share one generated result, and a
 * given transform chain of it runs once no matter how many performers ask.
 *
 * Dependencies are injectable so the chain logic is testable without the
 * generation orchestrator, Firestore, or the motion-query singleton; the
 * defaults are the production owners.
 */

import { generationOrchestrator } from "$lib/shared/create/services/generation-orchestrator";
import {
  flipSequence,
  invertSequence,
  mirrorSequence,
  rewindSequence,
  rotateSequence,
  shiftStartPlacement,
  swapHands,
} from "$lib/shared/create/services/sequence-transformer";
import type { GenerationOptions } from "$lib/shared/foundation/domain/models/generation/generate-models";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

import { loadPublicLibrarySequence } from "./director-library-source";
import type {
  ResolvedDirectorScene,
  ResolvedFilmDirectorSpec,
} from "./film-director-schema";
import {
  compileSequenceDirective,
  isGeneratedSequence,
  isIdleSequence,
  isLibrarySequence,
  sequenceDirectiveKey,
  transformSourceId,
  type DirectorPerformerSequence,
  type DirectorSequenceTransform,
  type DirectorTransformHand,
} from "./sequence-language";

export interface DirectorSequenceTransforms {
  mirrorSequence(
    seq: SequenceData,
    hand: DirectorTransformHand
  ): Promise<SequenceData>;
  flipSequence(
    seq: SequenceData,
    hand: DirectorTransformHand
  ): Promise<SequenceData>;
  rotateSequence(
    seq: SequenceData,
    steps: number,
    hand: DirectorTransformHand
  ): Promise<SequenceData>;
  swapHands(seq: SequenceData): SequenceData;
  invertSequence(
    seq: SequenceData,
    hand: DirectorTransformHand
  ): Promise<SequenceData>;
  rewindSequence(
    seq: SequenceData,
    hand: DirectorTransformHand
  ): Promise<SequenceData>;
  shiftStartPlacement(seq: SequenceData, step: number): SequenceData;
}

export interface DirectorSequenceLibraryDeps {
  generate(options: GenerationOptions): Promise<SequenceData>;
  loadLibrarySequence(id: string): Promise<SequenceData>;
  transforms: DirectorSequenceTransforms;
}

const PRODUCTION_DEPS: DirectorSequenceLibraryDeps = {
  generate: (options) => generationOrchestrator.generateSequence(options),
  loadLibrarySequence: loadPublicLibrarySequence,
  transforms: {
    mirrorSequence,
    flipSequence,
    rotateSequence,
    swapHands,
    invertSequence,
    rewindSequence,
    shiftStartPlacement,
  },
};

export interface DirectorSequencePrepareOptions {
  /**
   * Resolve this scene before any other. Generating a spelled sequence is real
   * CPU work, and a viewer who opened on one scene should not wait behind the
   * twenty-three they are not watching.
   */
  focusSceneId?: string | null;
  /** Called as each scene's sequences land, in resolution order. */
  onSceneResolved?: (sceneId: string) => void;
}

export interface DirectorSequenceLibrary {
  /**
   * Resolve every sequence the film names. Calling it again with the same
   * film returns the first call's promise rather than regenerating.
   */
  prepare(
    film: ResolvedFilmDirectorSpec,
    options?: DirectorSequencePrepareOptions
  ): Promise<void>;
  /** Performer id → sequence, for a scene that has finished resolving. */
  forScene(sceneId: string): ReadonlyMap<string, SequenceData>;
  /** Human-readable reasons a directed sequence fell back to the demo. */
  readonly failures: readonly string[];
}

const EMPTY: ReadonlyMap<string, SequenceData> = new Map();

/** Degrees and a felt direction → the transformer's signed 45° step count (positive is clockwise). */
export function rotationSteps(
  degrees: number,
  direction: "cw" | "ccw"
): number {
  const steps = degrees / 45;
  return direction === "cw" ? steps : -steps;
}

/** The chain `mirrorOf` stands for. */
const MIRROR_CHAIN: readonly DirectorSequenceTransform[] = [{ op: "mirror" }];

export async function applyTransformChain(
  source: SequenceData,
  chain: readonly DirectorSequenceTransform[],
  transforms: DirectorSequenceTransforms
): Promise<SequenceData> {
  let current = source;
  for (const step of chain) {
    switch (step.op) {
      case "mirror":
        current = await transforms.mirrorSequence(current, step.hand ?? "both");
        break;
      case "flip":
        current = await transforms.flipSequence(current, step.hand ?? "both");
        break;
      case "rotate":
        current = await transforms.rotateSequence(
          current,
          rotationSteps(step.degrees, step.direction),
          step.hand ?? "both"
        );
        break;
      case "swap-hands":
        current = transforms.swapHands(current);
        break;
      case "invert":
        current = await transforms.invertSequence(current, step.hand ?? "both");
        break;
      case "rewind":
        current = await transforms.rewindSequence(current, step.hand ?? "both");
        break;
      case "start-at":
        current = transforms.shiftStartPlacement(current, step.step);
        break;
    }
  }
  return current;
}

export function createDirectorSequenceLibrary(
  demoSequence: SequenceData,
  deps: DirectorSequenceLibraryDeps = PRODUCTION_DEPS
): DirectorSequenceLibrary {
  const sources = new Map<string, Promise<SequenceData>>();
  const derived = new Map<string, Promise<SequenceData>>();
  const byScene = new Map<string, Map<string, SequenceData>>();
  const failures: string[] = [];
  let preparedFilmId: string | null = null;
  let preparing: Promise<void> | null = null;

  function resolveSource(
    sequence: DirectorPerformerSequence
  ): Promise<SequenceData> {
    const key = sequenceDirectiveKey(sequence);
    const existing = sources.get(key);
    if (existing) return existing;

    const created = isGeneratedSequence(sequence)
      ? deps.generate(compileSequenceDirective(sequence))
      : isLibrarySequence(sequence)
        ? deps.loadLibrarySequence(sequence.library)
        : Promise.resolve(demoSequence);

    sources.set(key, created);
    return created;
  }

  /**
   * A derived sequence is cached by its SOURCE's directive key plus the chain,
   * not by the source performer's id: two performers who transform two
   * different performers spinning the same word still share one result.
   */
  function resolveDerived(
    source: DirectorPerformerSequence,
    chain: readonly DirectorSequenceTransform[]
  ): Promise<SequenceData> {
    const key = `derived:${sequenceDirectiveKey(source)}:${JSON.stringify(chain)}`;
    const existing = derived.get(key);
    if (existing) return existing;

    const created = resolveSource(source).then((resolved) =>
      applyTransformChain(resolved, chain, deps.transforms)
    );
    derived.set(key, created);
    return created;
  }

  async function resolveScene(scene: ResolvedDirectorScene): Promise<void> {
    const performers = scene.performance.performers;
    const byId = new Map(
      performers.map((performer) => [performer.id, performer.sequence])
    );
    const resolved = new Map<string, SequenceData>();

    await Promise.all(
      performers.map(async (performer) => {
        const directed = performer.sequence;
        if (isIdleSequence(directed)) {
          // Deliberately no entry: the adapter reads the absence as "this
          // performer spins nothing", which is different from "the library has
          // not finished yet" only because the adapter also knows the scene.
          return;
        }
        try {
          const sourceId = transformSourceId(directed);
          if (sourceId !== null) {
            // The spec resolver already proved this names a non-derived
            // performer in this same scene.
            const source = byId.get(sourceId)!;
            const chain =
              "transformOf" in directed ? directed.transforms : MIRROR_CHAIN;
            resolved.set(performer.id, await resolveDerived(source, chain));
            return;
          }
          resolved.set(performer.id, await resolveSource(directed));
        } catch (error: unknown) {
          const reason = error instanceof Error ? error.message : String(error);
          failures.push(
            `Scene "${scene.id}", performer "${performer.id}": ${reason}`
          );
          console.error(
            `[FilmDirector] Could not build the directed sequence for "${performer.id}" in scene "${scene.id}". Falling back to the film's demo sequence.`,
            error
          );
          resolved.set(performer.id, demoSequence);
        }
      })
    );

    byScene.set(scene.id, resolved);
  }

  function prepare(
    film: ResolvedFilmDirectorSpec,
    options: DirectorSequencePrepareOptions = {}
  ): Promise<void> {
    if (preparedFilmId === film.id && preparing) return preparing;

    preparedFilmId = film.id;
    byScene.clear();
    failures.length = 0;

    const announce = async (scene: ResolvedDirectorScene): Promise<void> => {
      await resolveScene(scene);
      options.onSceneResolved?.(scene.id);
    };

    const focused = options.focusSceneId
      ? (film.scenes.find((scene) => scene.id === options.focusSceneId) ?? null)
      : null;

    if (!focused) {
      preparing = Promise.all(film.scenes.map(announce)).then(() => undefined);
      return preparing;
    }

    // Ordered, not merely prioritized: the rest start only once the focused
    // scene has its sequences, so nothing competes with the one on screen.
    const rest = film.scenes.filter((scene) => scene !== focused);
    preparing = announce(focused)
      .then(() => Promise.all(rest.map(announce)))
      .then(() => undefined);
    return preparing;
  }

  return {
    prepare,
    forScene: (sceneId) => byScene.get(sceneId) ?? EMPTY,
    get failures() {
      return failures;
    },
  };
}
