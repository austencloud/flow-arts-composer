import { goto } from "$app/navigation";

import { savedFilmHref } from "#lib/features/film-director/domain/film-director-link.js";

import type { CollectedFilm } from "../domain/film-collection-types";

/**
 * Play a saved film.
 *
 * A film only plays on the Director's stage, so opening one from anywhere else
 * in the app is a navigation. This is where that decision lives — the shelf
 * component renders entries and does not get to choose where they go.
 *
 * A push, not a replace: the Library entry the user came from has to survive on
 * the history stack, or browser Back strands them on the Director's marquee.
 */
export function openSavedFilm(film: CollectedFilm): Promise<void> {
  return goto(savedFilmHref(film.id));
}
