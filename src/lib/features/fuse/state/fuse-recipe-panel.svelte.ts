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
import {
  PILL_ORDER,
  type PillId,
} from "#lib/shared/animation-panel/pill-nav/pill-types";
import type { FuseSide } from "./fuse-shuffle-pool.svelte";

const STORAGE_KEY = "fuse-recipe-panel";

/** What the panel holds: a hand's settings for new paths, or Customize, which
 *  changes how the combined preview looks. One panel, so the column and the
 *  sheet that hold it never stack a second panel beside the first. */
export type FusePanelContent = "recipe" | "customize";

interface PersistedRecipePanel {
  open?: boolean;
  content?: FusePanelContent;
  destination?: FuseSettingsDestination;
  /** Whose settings the panel shows: each hand has its own. */
  side?: FuseSide;
  /** The Customize page that was open. */
  section?: PillId;
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
      content: candidate.content === "customize" ? "customize" : "recipe",
      destination:
        typeof candidate.destination === "string" &&
        isFuseRecipeDestination(candidate.destination)
          ? candidate.destination
          : null,
      side: candidate.side === "right" ? "right" : "left",
      section: PILL_ORDER.find((pill) => pill === candidate.section),
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
let content = $state<FusePanelContent>(persisted.content ?? "recipe");
let destination = $state<FuseSettingsDestination>(
  persisted.destination ?? null
);
let side = $state<FuseSide>(persisted.side ?? "left");
let section = $state<PillId>(persisted.section ?? "effects");

function persist(): void {
  write({ open, content, destination, side, section });
}

export const fuseRecipePanel = {
  get open(): boolean {
    return open;
  },
  set open(value: boolean) {
    open = value;
    persist();
  },
  get content(): FusePanelContent {
    return content;
  },
  set content(value: FusePanelContent) {
    content = value;
    persist();
  },
  get destination(): FuseSettingsDestination {
    return destination;
  },
  set destination(value: FuseSettingsDestination) {
    destination = value;
    persist();
  },
  get side(): FuseSide {
    return side;
  },
  set side(value: FuseSide) {
    side = value;
    persist();
  },
  /** Which page of Customize is open. The column and the dock both read it, so
   *  turning a phone over keeps the page. */
  get section(): PillId {
    return section;
  },
  set section(value: PillId) {
    section = value;
    persist();
  },
};
