import {
  cardPresentationsEqual,
  normalizeCardPresentation,
  type CardPresentation,
} from "#lib/shared/share/domain/models/card-presentation.js";
import type { ShareArtifact } from "#lib/shared/share/services/post-handoff.js";

export interface StartPostShareDraftInput {
  readonly availableArtifacts: readonly ShareArtifact[];
  readonly initialArtifact: ShareArtifact;
  readonly cardPresentation: CardPresentation;
}

function normalizeArtifacts(
  artifacts: readonly ShareArtifact[]
): ShareArtifact[] {
  const unique = artifacts.filter(
    (artifact, index) => artifacts.indexOf(artifact) === index
  );
  return unique.length > 0 ? [...unique] : ["card"];
}

export function createPostShareDraftState() {
  let availableArtifacts = $state<ShareArtifact[]>(["card", "video"]);
  let artifact = $state<ShareArtifact>("card");
  let caption = $state("");
  let captionTouched = $state(false);
  let cardPresentation = $state<CardPresentation>(
    normalizeCardPresentation(null)
  );
  let initialCardPresentation = $state<CardPresentation>(
    normalizeCardPresentation(null)
  );

  function start(input: StartPostShareDraftInput): void {
    availableArtifacts = normalizeArtifacts(input.availableArtifacts);
    artifact = availableArtifacts.includes(input.initialArtifact)
      ? input.initialArtifact
      : (availableArtifacts[0] ?? "card");
    caption = "";
    captionTouched = false;
    cardPresentation = normalizeCardPresentation(input.cardPresentation);
    initialCardPresentation = cardPresentation;
  }

  function selectArtifact(value: ShareArtifact): boolean {
    if (!availableArtifacts.includes(value)) return false;
    artifact = value;
    return true;
  }

  return {
    get availableArtifacts() {
      return availableArtifacts;
    },
    get artifact() {
      return artifact;
    },
    get caption() {
      return caption;
    },
    set caption(value: string) {
      caption = value;
    },
    get captionTouched() {
      return captionTouched;
    },
    set captionTouched(value: boolean) {
      captionTouched = value;
    },
    get cardPresentation() {
      return cardPresentation;
    },
    set cardPresentation(value: CardPresentation) {
      cardPresentation = normalizeCardPresentation(value);
    },
    get cardPresentationDirty() {
      return !cardPresentationsEqual(cardPresentation, initialCardPresentation);
    },
    markCardPresentationSaved(): void {
      initialCardPresentation = cardPresentation;
    },
    start,
    selectArtifact,
  };
}

export type PostShareDraftState = ReturnType<typeof createPostShareDraftState>;
