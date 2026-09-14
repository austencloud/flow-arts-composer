import { getContext, setContext } from "svelte";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

interface ViewerPathContext {
  readonly canSave: boolean;
  readonly saving: boolean;
  readonly sequence: SequenceData | null;
  save: () => Promise<void>;
}

const KEY = Symbol("viewer-path-actions");
export function setViewerPathContext(value: ViewerPathContext): void {
  setContext(KEY, value);
}
export function getViewerPathContext(): ViewerPathContext | undefined {
  return getContext<ViewerPathContext>(KEY);
}
