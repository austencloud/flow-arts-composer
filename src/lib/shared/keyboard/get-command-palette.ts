import { browser } from "$app/env";

import { CommandPalette } from "./services/command-palette";
import { getNavigationVisitPersister } from "#lib/shared/navigation/get-navigation-visit-persister.js";

let instance: CommandPalette | null = null;

export function getCommandPalette(): CommandPalette {
  if (!browser) throw new Error("getCommandPalette() is browser-only");
  return (instance ??= new CommandPalette(getNavigationVisitPersister()));
}
