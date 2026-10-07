import {
  createAxisStream,
  resolveFilmSeed,
} from "$lib/features/film-director/domain/directive-random";
import { resolveCastAxis } from "$lib/features/film-director/domain/resolve-directives";
import { authState } from "$lib/shared/auth/state/auth-state.svelte";
import {
  charactersWithPresentation,
  countCharacterPresentations,
} from "$lib/shared/3d/config/character-presentation";
import { DEPLOYED_CHARACTER_IDS } from "$lib/shared/3d/config/deployed-characters";
import type { CharacterId } from "$lib/shared/3d/domain/character-model";
import type {
  Viewer3DState,
  ViewerPerformerAppearanceAssignment,
} from "$lib/shared/3d/state/viewer-3d-state.svelte";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import type { StageChoreography } from "../domain/stage-types";
import {
  TikaDirectorResponseSchema,
  TIKA_DIRECTOR_MAX_HISTORY,
  type TikaDirectorAction,
  type TikaDirectorConversationMessage,
  type TikaDirectorRequest,
  type TikaDirectorResponse,
} from "../domain/tika-director";
import { interpretConversationLocally } from "../domain/tika-director-interpreter";

export async function resolveStageDirection(input: {
  prompt: string;
  conversation: readonly TikaDirectorConversationMessage[];
  choreography: StageChoreography;
  currentBeat: number;
  viewer: Viewer3DState;
  /** Saved sequences the cast can borrow; omitted when the library is unreadable. */
  librarySequenceCount?: number;
  signal?: AbortSignal;
}): Promise<TikaDirectorResponse> {
  if (input.conversation.length > TIKA_DIRECTOR_MAX_HISTORY) {
    throw new Error(
      "This direction conversation is full. Reload the Stage to start a new one, and restate any constraints you want to keep."
    );
  }
  // Deterministic first: the patterns read every turn of a conversation they
  // have owned from the start. One unparsed sentence or a pending question
  // hands the rest of the conversation to the model, which sees the history.
  const local = interpretConversationLocally(input.prompt, input.conversation, {
    currentBeat: input.currentBeat,
  });
  if (local) return local;

  const user = authState.user;
  if (!user) {
    throw new Error("Sign in before asking TIKA to direct this scene.");
  }
  const token = await user.getIdToken();
  input.signal?.throwIfAborted();
  const viewerSnapshot = input.viewer.serialize();
  const body: TikaDirectorRequest = {
    prompt: input.prompt,
    conversation: [...input.conversation],
    scene: {
      id: input.choreography.id,
      name: input.choreography.name,
      bpm: input.choreography.bpm,
      currentBeat: input.currentBeat,
      performers: input.choreography.performers.map((performer, index) => {
        const look = viewerSnapshot.performers[index];
        return {
          id: performer.id,
          label: performer.label,
          characterId: look?.characterId ?? "unknown",
          prop:
            look?.settings?.prop ?? viewerSnapshot.defaultProp ?? PropType.STAFF,
        };
      }),
      formations: input.choreography.formations.map((formation) => ({
        atBeat: formation.atBeat,
        ...(formation.presetId ? { presetId: formation.presetId } : {}),
      })),
      ...(input.librarySequenceCount !== undefined
        ? { librarySequenceCount: input.librarySequenceCount }
        : {}),
      characterPresentationCounts: countCharacterPresentations(),
    },
  };

  const response = await fetch("/api/tika/direct", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: input.signal,
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      typeof payload === "object" &&
      payload !== null &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : "TIKA could not interpret that direction.";
    throw new Error(message);
  }
  return TikaDirectorResponseSchema.parse(payload);
}

export function resolveDirectorAppearanceAssignments(input: {
  actions: readonly TikaDirectorAction[];
  performerIds: readonly string[];
  seedKey: string;
}): ViewerPerformerAppearanceAssignment[] {
  const characterAction = input.actions.find(
    (action) => action.type === "assign-distinct-characters"
  );
  const assignCharacters = characterAction !== undefined;
  const presentation =
    characterAction?.type === "assign-distinct-characters"
      ? characterAction.presentation
      : undefined;
  const assignProps = input.actions.some(
    (action) => action.type === "assign-distinct-props"
  );
  if (!assignCharacters && !assignProps) return [];

  const seed = resolveFilmSeed(input.seedKey);
  const sceneId = "live-stage";
  const characterCatalog = presentation
    ? charactersWithPresentation(presentation)
    : DEPLOYED_CHARACTER_IDS;
  if (assignCharacters && characterCatalog.length < input.performerIds.length) {
    throw new Error(
      `Only ${characterCatalog.length} ${presentation ?? ""} avatars are deployed, but this cast has ${input.performerIds.length} performers.`.replace(
        "  ",
        " "
      )
    );
  }
  const characters = assignCharacters
    ? resolveCastAxis<string>({
        axis: "characterId",
        sceneId,
        performerIds: input.performerIds,
        values: input.performerIds.map(() => ({ pick: "distinct" as const })),
        catalog: characterCatalog,
        random: createAxisStream(seed, sceneId, "characterId"),
      })
    : null;
  const propCatalog = Object.values(PropType);
  const props = assignProps
    ? resolveCastAxis<PropType>({
        axis: "prop",
        sceneId,
        performerIds: input.performerIds,
        values: input.performerIds.map(() => ({ pick: "distinct" as const })),
        catalog: propCatalog,
        random: createAxisStream(seed, sceneId, "prop"),
      })
    : null;

  return input.performerIds.map((_, index) => ({
    index,
    ...(characters ? { characterId: characters[index] as CharacterId } : {}),
    ...(props ? { prop: props[index] } : {}),
  }));
}
