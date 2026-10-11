import { savedFilmKey } from "#lib/features/film-director/domain/film-director-link.js";

/**
 * Where the film on the stage came from.
 *
 * Not recoverable from the film document: a saved film keeps the `id` and
 * `title` of the library film it started as, so the document cannot say whether
 * Save should overwrite an existing entry or create a new one.
 */
export type FilmOrigin =
  | { kind: "library"; key: string }
  | { kind: "saved"; id: string; name: string };

export type SavedFilmOrigin = Extract<FilmOrigin, { kind: "saved" }>;

/** The `?film=` value naming this origin. */
export function filmOriginUrlKey(origin: FilmOrigin): string {
  return origin.kind === "saved" ? savedFilmKey(origin.id) : origin.key;
}

/** Whether Save writes over an existing document rather than creating one. */
export function filmOriginIsSaved(origin: FilmOrigin): origin is SavedFilmOrigin {
  return origin.kind === "saved";
}

/**
 * What to call the current film. A saved entry's name is user-chosen and can
 * differ from the document's title, and the user's name wins.
 */
export function filmOriginLabel(origin: FilmOrigin, filmTitle: string): string {
  return origin.kind === "saved" ? origin.name : filmTitle;
}
