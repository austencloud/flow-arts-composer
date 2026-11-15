/**
 * Which order a Browse engine opens on: the visitor's own choice if they made
 * one, else the host's default.
 *
 * The engine saves its sort on every load, so a saved A to Z ascending order
 * written before `sortChosen` existed cannot be told from "never chose" (A to Z
 * was the default for everyone). That one value is treated as never chosen, so
 * a host's new default reaches returning visitors. Any other legacy order, and
 * every order saved with `sortChosen`, is kept.
 */

import { BrowseSortMethod } from "#lib/shared/browse/domain/enums/browse-enums.js";
import type { PersistedEngineState } from "#lib/shared/browse/engine/types.js";

export interface InitialSort {
  method: BrowseSortMethod;
  direction: "asc" | "desc";
  chosen: boolean;
}

export function resolveInitialSort(
  persisted: Pick<
    PersistedEngineState,
    "sortMethod" | "sortDirection" | "sortChosen"
  > | null,
  host: { sort?: BrowseSortMethod | undefined; direction?: "asc" | "desc" | undefined }
): InitialSort {
  const fallback: InitialSort = {
    method: host.sort ?? BrowseSortMethod.ALPHABETICAL,
    direction: host.direction ?? "asc",
    chosen: false,
  };
  if (!persisted?.sortMethod) return fallback;
  if (persisted.sortChosen === true) {
    return {
      method: persisted.sortMethod,
      direction: persisted.sortDirection ?? "asc",
      chosen: true,
    };
  }
  const oldDefault =
    persisted.sortMethod === BrowseSortMethod.ALPHABETICAL &&
    (persisted.sortDirection ?? "asc") === "asc";
  if (oldDefault) return fallback;
  return {
    method: persisted.sortMethod,
    direction: persisted.sortDirection ?? fallback.direction,
    chosen: false,
  };
}
