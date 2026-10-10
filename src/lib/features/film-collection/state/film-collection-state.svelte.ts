import { CollectionState } from "#lib/shared/collections/collection-state.svelte.js";
import { createFirebaseCollectionRepository } from "#lib/shared/collections/firebase-collection-repository.js";
import { LocalCollectionRepository } from "#lib/shared/collections/local-collection-repository.js";

import {
  CollectedFilmSchema,
  FILM_COLLECTION_NAME,
  FILM_COLLECTION_SCHEMA_VERSION,
  FILM_COLLECTION_STORAGE_KEY,
  type CollectedFilm,
} from "../domain/film-collection-types";

/**
 * Saved films. The shared collection engine supplies everything behavioural:
 * Firestore as the source of truth when signed in, localStorage for guests,
 * migration of guest saves on sign-in, optimistic writes with rollback, and
 * read-only preview of another user's collection.
 *
 * No `lifecycle` hook — a film needs no enrichment after add. The document is
 * already complete when it is saved.
 */
export const filmCollectionState = new CollectionState<CollectedFilm>(
  createFirebaseCollectionRepository(FILM_COLLECTION_NAME, CollectedFilmSchema),
  new LocalCollectionRepository<CollectedFilm>(
    FILM_COLLECTION_STORAGE_KEY,
    FILM_COLLECTION_SCHEMA_VERSION,
  ),
);
