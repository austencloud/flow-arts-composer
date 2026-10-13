/**
 * Save landing
 *
 * Where the "saved" toast should take someone, decided from how the save
 * went. A sequence filed into a collection lands on that collection; one
 * saved loose lands on the All shelf. Either way the destination reveals the
 * sequence itself, so the jump shows the thing that was just saved instead
 * of a grid in whatever order was last used.
 *
 * Pure: the toast copy is returned as i18n keys plus params so the caller
 * can translate, and the Browse intent is returned ready to set.
 */
import type { BrowseIntent } from "#lib/features/browse/state/pending-browse-intent.svelte.js";
import type { TranslationKey } from "#lib/shared/i18n/i18n-types.js";

export interface FiledCollection {
  id: string;
  name: string;
}

export interface SaveLanding {
  intent: BrowseIntent;
  messageKey: TranslationKey;
  messageParams?: Record<string, string | number>;
  actionKey: TranslationKey;
  actionParams?: Record<string, string | number>;
}

export function resolveSaveLanding(input: {
  sequenceId: string;
  filedCollections: readonly FiledCollection[];
}): SaveLanding {
  const [first, ...rest] = input.filedCollections;
  if (!first) {
    return {
      intent: { kind: "own-library", revealSequenceId: input.sequenceId },
      messageKey: "create_save_saved_to_your_library",
      actionKey: "create_save_go_to_library",
    };
  }
  return {
    intent: {
      kind: "collection-detail",
      collectionId: first.id,
      collectionName: first.name,
      revealSequenceId: input.sequenceId,
    },
    messageKey:
      rest.length > 0
        ? "create_save_saved_to_collections"
        : "create_save_saved_to_collection",
    messageParams: { name: first.name, count: rest.length },
    actionKey: "create_save_open_collection",
    actionParams: { name: first.name },
  };
}
