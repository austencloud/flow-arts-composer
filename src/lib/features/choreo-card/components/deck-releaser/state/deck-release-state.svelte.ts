import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import type {
  DeckRelease,
  DeckReleaseCard,
  DeckRecipe,
} from "../../../domain/models/DeckRelease";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import {
  extractReleasedSequenceIds,
  findDuplicateRelease,
  isGalleryRelease,
  isHandPathRelease,
  isLoopRelease,
  isTnDRelease,
} from "../deck-release-model";
import type { DeckReleaserState } from "./deck-releaser-state.svelte";

export interface DeckReleaseStateDependencies {
  getAll(): Promise<DeckRelease[]>;
  getNextNumber(): Promise<number>;
  create(
    cards: DeckReleaseCard[],
    sequences: SequenceData[],
    theme: string,
    notes: string,
    metadata: {
      name: string;
      description: string;
      leftPropType: PropType;
      rightPropType: PropType;
    },
    recipe: DeckRecipe
  ): Promise<DeckRelease>;
  updateMetadata(deckNumber: number, metadata: { name: string }): Promise<void>;
  /** Soft-delete: hide a released deck from the default list. Restorable. */
  archive(deckNumber: number): Promise<void>;
  /** Undo `archive` — the deck reappears in the default list. */
  restore(deckNumber: number): Promise<void>;
}

export function createDeckReleaseState(
  deck: DeckReleaserState,
  deps: DeckReleaseStateDependencies
) {
  /** Every release fetched from Firestore, active and archived alike. */
  let allReleases = $state<DeckRelease[]>([]);
  let isLoading = $state(true);

  // Archived decks are hidden from the default history/browse lists — the
  // task's "keep old releases working" and "hide, don't erase" requirements
  // both key off this single filter.
  const releases = $derived(allReleases.filter((release) => !release.archived));
  const archivedReleases = $derived(
    allReleases.filter((release) => release.archived)
  );

  const tndReleases = $derived(releases.filter(isTnDRelease));
  const handPathReleases = $derived(releases.filter(isHandPathRelease));
  const galleryReleases = $derived(releases.filter(isGalleryRelease));
  const loopReleases = $derived(releases.filter(isLoopRelease));
  // Duplicate-detection and id-pruning must see archived decks too — an
  // archived deck's sequences are still "released" (its short codes still
  // scan), so this deliberately reads from allReleases, not the active list.
  const releasedSequenceIds = $derived(extractReleasedSequenceIds(allReleases));

  async function load(): Promise<void> {
    try {
      allReleases = await deps.getAll();
    } finally {
      isLoading = false;
    }
  }

  async function loadNextNumber(): Promise<void> {
    try {
      deck.nextDeckNumber = await deps.getNextNumber();
    } catch {
      deck.nextDeckNumber = 1;
    }
  }

  function findDuplicate(cards: DeckReleaseCard[]): DeckRelease | null {
    return findDuplicateRelease(cards, releases);
  }

  /** Soft-delete: archive the release so it drops out of the default list. */
  async function remove(deckNumber: number): Promise<unknown | null> {
    try {
      await deps.archive(deckNumber);
      const archivedAt = new Date().toISOString();
      allReleases = allReleases.map((release) =>
        release.deckNumber === deckNumber
          ? { ...release, archived: true, archivedAt }
          : release
      );
      if (deck.viewingRelease?.deckNumber === deckNumber) {
        deck.viewingRelease = null;
        deck.themeOverride = null;
        deck.leftPropOverride = null;
        deck.rightPropOverride = null;
        deck.step = "configure";
        deck.persist();
      }
      return null;
    } catch (error) {
      return error;
    }
  }

  /** Undo `remove` — the deck reappears in the default list. */
  async function restore(deckNumber: number): Promise<unknown | null> {
    try {
      await deps.restore(deckNumber);
      allReleases = allReleases.map((release) =>
        release.deckNumber === deckNumber
          ? { ...release, archived: false, archivedAt: null }
          : release
      );
      return null;
    } catch (error) {
      return error;
    }
  }

  async function create(
    name: string,
    description: string
  ): Promise<DeckRelease> {
    deck.isReleasing = true;
    try {
      const release = await deps.create(
        deck.cards,
        deck.sequences,
        deck.theme,
        deck.notes,
        {
          name,
          description,
          leftPropType: deck.leftPropType,
          rightPropType: deck.rightPropType,
        },
        deck.toRecipe()
      );
      deck.name = name;
      deck.description = description;
      deck.releasedNumber = release.deckNumber;
      deck.nextDeckNumber = release.deckNumber + 1;
      allReleases = [release, ...allReleases];
      deck.step = "released";
      deck.persist();
      return release;
    } finally {
      deck.isReleasing = false;
    }
  }

  async function rename(name: string): Promise<unknown | null> {
    const trimmed = name.trim();
    if (!trimmed || !deck.viewingRelease) return null;

    const deckNumber = deck.viewingRelease.deckNumber;
    deck.name = trimmed;
    allReleases = allReleases.map((release) =>
      release.deckNumber === deckNumber
        ? { ...release, name: trimmed }
        : release
    );
    deck.viewingRelease = { ...deck.viewingRelease, name: trimmed };
    deck.persist();
    try {
      await deps.updateMetadata(deckNumber, { name: trimmed });
      return null;
    } catch (error) {
      return error;
    }
  }

  function activate(release: DeckRelease): void {
    deck.viewingRelease = release;
    deck.cards = release.sequences;
    deck.notes = release.notes;
    deck.name =
      release.name ??
      release.notes ??
      `Deck #${String(release.deckNumber).padStart(3, "0")}`;
    deck.description = release.description ?? "";
    deck.nextDeckNumber = release.deckNumber;
    deck.themeOverride = release.theme ?? null;
    if (isLoopRelease(release)) {
      deck.leftPropOverride =
        (release.leftPropType as PropType | undefined) ?? null;
      deck.rightPropOverride =
        (release.rightPropType as PropType | undefined) ?? null;
    } else {
      deck.leftPropOverride = null;
      deck.rightPropOverride = null;
    }
    deck.step = "review";
    deck.persist();
  }

  return {
    get releases() {
      return releases;
    },
    get isLoading() {
      return isLoading;
    },
    get tndReleases() {
      return tndReleases;
    },
    get galleryReleases() {
      return galleryReleases;
    },
    get handPathReleases() {
      return handPathReleases;
    },
    get loopReleases() {
      return loopReleases;
    },
    get releasedSequenceIds() {
      return releasedSequenceIds;
    },
    get archivedReleases() {
      return archivedReleases;
    },
    load,
    loadNextNumber,
    findDuplicate,
    remove,
    restore,
    create,
    rename,
    activate,
  };
}

export type DeckReleaseState = ReturnType<typeof createDeckReleaseState>;
