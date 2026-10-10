import { LibraryPageLoader } from "./services/library-page-loader.js";
import { authState } from "#lib/shared/auth/state/auth-state.svelte.js";
import {
  onLibraryMutated,
  onLibrarySequenceAdded,
  onLibrarySequenceUpdated,
} from "#lib/shared/library/library-events.js";

let instance: LibraryPageLoader | null = null;
export function getLibraryPageLoader(): LibraryPageLoader {
  if (!instance) {
    instance = new LibraryPageLoader();
    onLibraryMutated((id) => {
      if (authState.effectiveUserId)
        instance?.remove(authState.effectiveUserId, id);
    });
    onLibrarySequenceAdded((sequence) => {
      if (authState.effectiveUserId)
        instance?.add(authState.effectiveUserId, sequence);
    });
    onLibrarySequenceUpdated((id, updates) => {
      if (authState.effectiveUserId)
        instance?.patch(authState.effectiveUserId, id, updates);
    });
  }
  return instance;
}
