import { browser } from "$app/env";
import { deepLinker, type DeepLinker } from "./services/deep-linker";

export function getDeepLinker(): DeepLinker {
  if (!browser) throw new Error("getDeepLinker() is browser-only");
  return deepLinker;
}
