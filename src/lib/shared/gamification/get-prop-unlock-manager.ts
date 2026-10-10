import { browser } from "$app/env";
import { PropUnlockManager } from "./services/prop-unlock-manager";

let instance: PropUnlockManager | null = null;

export function getPropUnlockManager(): PropUnlockManager {
  if (!browser) throw new Error("getPropUnlockManager() is browser-only");
  return (instance ??= new PropUnlockManager());
}
