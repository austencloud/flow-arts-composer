import {
  normalizeLetter,
  type Letter,
} from "#lib/shared/foundation/domain/models/letter.js";

export const GALLERY_LETTER_QUERY_PARAM = "letter";

export function parseGalleryLetterQuery(
  searchParams: URLSearchParams
): Letter | null {
  return normalizeLetter(searchParams.get(GALLERY_LETTER_QUERY_PARAM));
}

export function buildGalleryLetterHref(letter: string): string {
  const params = new URLSearchParams({
    [GALLERY_LETTER_QUERY_PARAM]: letter,
  });
  return `/browse/explore/sequences?${params.toString()}`;
}
