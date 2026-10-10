// src/lib/shared/render/getCompositionDispatcher.ts
import { browser } from "$app/env";
import { CompositionDispatcher } from "./services/composition-dispatcher";
import { getImageComposer } from "./get-image-composer";
import { getTextRenderer } from "./get-text-renderer";

let instance: CompositionDispatcher | null = null;

export function getCompositionDispatcher(): CompositionDispatcher {
  if (!browser) throw new Error("getCompositionDispatcher() is browser-only");
  return (instance ??= new CompositionDispatcher(getImageComposer(), getTextRenderer()));
}
