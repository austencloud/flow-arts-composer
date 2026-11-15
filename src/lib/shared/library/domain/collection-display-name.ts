import { getLocale, t } from "#lib/shared/i18n/i18n.svelte.js";
import type { LibraryCollection } from "./models/collection.js";

type NamedCollection = Pick<
  LibraryCollection,
  "name" | "systemType" | "translations"
>;

/**
 * The name a collection shows. Favorites is seeded with the English word in
 * every account, so it reads in the viewer's language. A collection we publish
 * ourselves may carry a name per language (`translations`), shown to visitors
 * in that language. Every other name is what its owner typed and stays as
 * written.
 */
export function collectionDisplayName(
  collection: NamedCollection,
  locale: string = getLocale()
): string {
  if (collection.systemType === "favorites") return t("favorites");
  return collection.translations?.[locale]?.name || collection.name;
}

/** The description a collection shows, by the same rule as its name. */
export function collectionDisplayDescription(
  collection: Pick<LibraryCollection, "description" | "translations">,
  locale: string = getLocale()
): string | undefined {
  return (
    collection.translations?.[locale]?.description || collection.description
  );
}
