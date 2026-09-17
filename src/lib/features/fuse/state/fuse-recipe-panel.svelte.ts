/**
 * Where the Fuse recipe panel is: open or shut, and which editor it shows.
 *
 * This lives at module level rather than in FuseLayout's own `$state` so it
 * survives a hot-module replacement of the layout, and it is mirrored into
 * sessionStorage so it survives the full reload Vite falls back to when a
 * change lands outside an HMR boundary. Either way, saving a file while the
 * Rule editor is open brings the editor back instead of shutting it.
 *
 * sessionStorage, not localStorage: this is where you were in this tab, not a
 * preference, and a new tab opens on the workspace with the panel shut. On the
 * compact hosts the restored sheet still plays its slide-up on load; only the
 * desktop column lands in place.
 */
import type { FuseSettingsDestination } from "../domain/fuse-recipe-destination";
import { isFuseRecipeDestination } from "../domain/fuse-recipe-destination";

const STORAGE_KEY = "fuse-recipe-panel";

interface PersistedRecipePanel {
  open?: boolean;
  destination?: FuseSettingsDestination;
}

function read(): PersistedRecipePanel {
  try {
    if (typeof sessionStorage === "undefined") return {};
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const candidate = parsed as Record<string, unknown>;
    return {
      open: candidate.open === true,
      destination:
        typeof candidate.destination === "string" &&
        isFuseRecipeDestination(candidate.destination)
          ? candidate.destination
          : null,
    };
  } catch {
    return {};
  }
}

function write(data: PersistedRecipePanel): void {
  try {
    if (typeof sessionStorage === "undefined") return;
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Storage full or blocked: the panel still works for this page load.
  }
}

const persisted = read();
let open = $state(persisted.open ?? false);
let destination = $state<FuseSettingsDestination>(
  persisted.destination ?? null
);

function persist(): void {
  write({ open, destination });
}

export const fuseRecipePanel = {
  get open(): boolean {
    return open;
  },
  set open(value: boolean) {
    open = value;
    persist();
  },
  get destination(): FuseSettingsDestination {
    return destination;
  },
  set destination(value: FuseSettingsDestination) {
    destination = value;
    persist();
  },
};
