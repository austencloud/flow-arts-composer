import { browser } from "$app/env";
import { createPlayProgressStore } from "./services/play-progress-store";
import type { PlayProgressStore } from "./services/play-progress-store";

let instance: PlayProgressStore | null = null;

export function getPlayProgressStore(): PlayProgressStore {
  if (!browser) throw new Error("getPlayProgressStore() is browser-only");
  return (instance ??= createPlayProgressStore());
}
