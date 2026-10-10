import { parse as parseDevalue } from "devalue";
import type { ModuleId } from "../navigation/domain/types";

export type HistoryState = { moduleId: ModuleId; sectionId?: string };

// SvelteKit 3's history-entry key (HISTORY_METADATA_KEY in its client).
const KIT_HISTORY_METADATA = "sveltekit:metadata";

/**
 * Read our own payload back out of a history entry.
 *
 * Page state written through SvelteKit's shallow routing does not sit at the
 * top level of `history.state`. SvelteKit 3 keeps it under
 * `sveltekit:metadata` as a devalue-encoded string; SvelteKit 2 nested the
 * plain object under `sveltekit:states`. Reading `event.state.moduleId`
 * directly finds nothing for those entries, so the coordinator's popstate handler
 * would bail on every back/forward and the module would never follow the URL:
 * press Back after leaving Creators for Browse and the address bar says
 * /creators/{id} while Browse stays on screen. SvelteKit updates `page.state`
 * only after an async route lookup, too late for that handler, so the entry is
 * decoded here.
 *
 * All three shapes are accepted. A history stack outlives a deploy, so entries
 * written by an older build, or flat entries pushed by other code, still work.
 */
export function readHistoryState(raw: unknown): HistoryState | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const flat = raw as Partial<HistoryState>;
  if (flat.moduleId) return flat as HistoryState;

  const metadata = record[KIT_HISTORY_METADATA];
  if (metadata && typeof metadata === "object") {
    const encoded = (metadata as { state?: unknown }).state;
    if (typeof encoded === "string") {
      try {
        const inner = parseDevalue(encoded) as Partial<HistoryState> | null;
        if (inner?.moduleId) return inner as HistoryState;
      } catch {
        // Not something SvelteKit wrote; fall through to the older shape.
      }
    }
  }

  const nested = record["sveltekit:states"];
  if (nested && typeof nested === "object") {
    const inner = nested as Partial<HistoryState>;
    if (inner.moduleId) return inner as HistoryState;
  }
  return null;
}
