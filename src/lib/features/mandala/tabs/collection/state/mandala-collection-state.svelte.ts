import { CollectionState } from "#lib/shared/collections/collection-state.svelte.js";
import { LocalCollectionRepository } from "#lib/shared/collections/local-collection-repository.js";
import {
  MANDALA_COLLECTION_STORAGE_KEY,
  MANDALA_COLLECTION_SCHEMA_VERSION,
} from "../domain/mandala-collection-types";
import type { CollectedMandala } from "../domain/mandala-collection-types";
import { createMandalaCollectionRepository } from "../services/mandala-collection-repository";

export const mandalaCollectionState = new CollectionState<CollectedMandala>(
  createMandalaCollectionRepository(),
  new LocalCollectionRepository(MANDALA_COLLECTION_STORAGE_KEY, MANDALA_COLLECTION_SCHEMA_VERSION),
);
