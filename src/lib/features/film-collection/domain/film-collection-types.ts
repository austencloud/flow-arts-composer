import { z } from "zod";

import type { CollectionEntry } from "#lib/shared/collections/collection-entry.js";

export const FILM_COLLECTION_STORAGE_KEY = "tka:film-collection";
export const FILM_COLLECTION_SCHEMA_VERSION = 1;

/** Firestore subcollection under `users/{uid}/`. */
export const FILM_COLLECTION_NAME = "film-collection";

/**
 * A saved film's authored document, stored verbatim.
 *
 * Structural rather than an import of the director's `FilmDirectorInput`: that
 * type lives under `src/routes/test/film-director/_lib/`, where the `_` prefix
 * marks it private to the route, so a `src/lib/` feature importing it would
 * invert the dependency. Only the three fields this layer labels films by are
 * declared; the rest of the document rides along at runtime via passthrough,
 * and the director's schema stays the authority on validity, applied when the
 * film is opened.
 */
export interface StoredFilmDocument {
  id: string;
  title: string;
  version: number;
}

export interface CollectedFilm extends CollectionEntry {
  // id, name, createdAt come from CollectionEntry.
  /** ~200px WebP data URL captured off the live canvas; "" when unavailable. */
  poster: string;
  /**
   * The authored input document, NOT the resolved spec. Directives are the
   * intent: a saved film should re-roll from its seed when reopened
   * rather than being frozen to one resolution. It is also what the workbench's
   * JSON editor round-trips, so save → open → edit is lossless.
   */
  film: StoredFilmDocument;
  /**
   * The document this entry held before the last overwrite, so a bad save can
   * be undone. One deep, deliberately: enough to reverse a mistake, not a
   * version history. Absent until the entry has been overwritten once.
   */
  previousFilm?: StoredFilmDocument;
  /** Denormalized off the resolved spec so the gallery renders meta chips
   *  without resolving every entry it lists. */
  durationSeconds: number;
  sceneCount: number;
}

const StoredFilmDocumentSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    version: z.number(),
  })
  // Everything else on the document passes through untouched — see the note on
  // StoredFilmDocument for why this layer does not re-validate the director's
  // schema.
  .passthrough();

export const CollectedFilmSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  createdAt: z.number(),
  poster: z.string(),
  film: StoredFilmDocumentSchema,
  previousFilm: StoredFilmDocumentSchema.optional(),
  durationSeconds: z.number().nonnegative(),
  sceneCount: z.number().int().nonnegative(),
});
