import { authState } from "#lib/shared/auth/state/auth-state.svelte.js";
import type { INavigationVisitPersister } from "./services/contracts/INavigationVisitPersister";
import { NavigationVisitPersister } from "./services/implementations/NavigationVisitPersister";

let instance: INavigationVisitPersister | undefined;

export function getNavigationVisitPersister(): INavigationVisitPersister {
  instance ??= new NavigationVisitPersister(
    typeof localStorage === "undefined" ? null : localStorage,
    () => authState.user?.uid ?? "signed-out"
  );
  return instance;
}
