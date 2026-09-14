import { getContext, setContext } from "svelte";
import {
  CHARACTER_DEFINITIONS,
  type CharacterDefinition,
} from "../domain/character-model";

const CHARACTER_CATALOG = Symbol("character-catalog");
type CharacterCatalog = () => readonly CharacterDefinition[];

/** A local generator can supply a live, availability-checked catalog. */
export function setCharacterCatalogContext(catalog: CharacterCatalog): void {
  setContext(CHARACTER_CATALOG, catalog);
}

export function getCharacterCatalogContext(): CharacterCatalog {
  return (
    getContext<CharacterCatalog | undefined>(CHARACTER_CATALOG) ??
    (() => CHARACTER_DEFINITIONS)
  );
}
