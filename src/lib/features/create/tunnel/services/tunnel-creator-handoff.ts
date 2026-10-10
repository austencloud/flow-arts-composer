import type { CollectedTunnel } from "#lib/features/tunnel-collection/domain/tunnel-collection-types.js";
import { collectedTunnelComposition } from "#lib/features/tunnel-collection/domain/collected-tunnel-source.js";
import { migrateTunnelArtifact } from "#lib/features/tunnel-collection/domain/tunnel-artifact-migration.js";
import type { TunnelComposition } from "#lib/shared/sequence-viewer/tunnel/tunnel-composition.js";
import {
  TunnelSnapshotSchema,
  type TunnelSnapshot,
} from "#lib/shared/sequence-viewer/tunnel/tunnel-snapshot.js";
import type { TunnelPresetRecipe } from "#lib/shared/sequence-viewer/tunnel/tunnel-preset-recipe.js";

const STORAGE_KEY = "tka:tunnel-creator-handoff";

/**
 * What "Edit choreography" hands the Tunnel creator on its way across the tab
 * switch. Written by the collection, read exactly once at creator construction.
 *
 * The composition is resolved here rather than copied off the entry, because a
 * tunnel saved before the creator existed has none and used to arrive as an
 * empty picker under an "Edit tunnel" title. `poster` and `tunnelName` are the
 * creator's only way to say which saved tunnel it is holding — the tab switch
 * throws away every other trace of what was on screen a moment ago.
 */
export interface TunnelCreatorHandoff {
  tunnelId: string;
  tunnelName: string;
  /** ~200px WebP data URL, the same picture the gallery card shows. */
  poster?: string;
  composition: TunnelComposition;
  /** Complete render state. Null only when consuming a pre-snapshot handoff. */
  snapshot: TunnelSnapshot | null;
  /** Compatibility alias for handoffs written before snapshot was carried. */
  formation: CollectedTunnel["snapshot"]["tunnel"]["config"];
  /** Recipe provenance is distinct from the rendered config. Legacy artifacts
   * leave this null rather than inheriting whichever look was last open. */
  presetRecipe: TunnelPresetRecipe | null;
  createdAt: number;
}

/**
 * Resolve one collection entry into the exact editor input used by every
 * Tunnel entry point. The in-tab library calls this directly; Browse persists
 * the same value across its module switch. Keeping migration and truthful
 * legacy reconstruction here prevents the two doors from disagreeing.
 */
export function createTunnelCreatorHandoff(
  collected: CollectedTunnel,
  now: () => number = Date.now
): TunnelCreatorHandoff {
  const tunnel = migrateTunnelArtifact(collected).tunnel;
  return {
    tunnelId: tunnel.id,
    tunnelName: tunnel.name,
    ...(tunnel.poster ? { poster: tunnel.poster } : {}),
    composition: collectedTunnelComposition(tunnel),
    snapshot: tunnel.snapshot,
    formation: tunnel.snapshot.tunnel.config,
    presetRecipe: tunnel.snapshot.tunnel.presetRecipe ?? null,
    createdAt: now(),
  };
}

export function saveTunnelCreatorHandoff(tunnel: CollectedTunnel): void {
  if (typeof sessionStorage === "undefined") return;

  const handoff = createTunnelCreatorHandoff(tunnel);

  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(handoff));
  } catch {
    // Quota exceeded — the creator still opens, just without the saved cast.
    // Better than throwing on the way out of the gallery.
  }
}

export function consumeTunnelCreatorHandoff(): TunnelCreatorHandoff | null {
  if (typeof sessionStorage === "undefined") return null;

  const serialized = sessionStorage.getItem(STORAGE_KEY);
  if (!serialized) return null;
  sessionStorage.removeItem(STORAGE_KEY);

  try {
    const handoff = JSON.parse(serialized) as Partial<TunnelCreatorHandoff>;
    const parsedSnapshot = TunnelSnapshotSchema.safeParse(handoff.snapshot);
    const formation = parsedSnapshot.success
      ? parsedSnapshot.data.tunnel.config
      : handoff.formation;
    if (
      !handoff.tunnelId ||
      !handoff.tunnelName ||
      !formation ||
      !handoff.composition?.performers?.length
    ) {
      return null;
    }
    return {
      tunnelId: handoff.tunnelId,
      tunnelName: handoff.tunnelName,
      ...(handoff.poster ? { poster: handoff.poster } : {}),
      composition: handoff.composition,
      snapshot: parsedSnapshot.success
        ? (parsedSnapshot.data as TunnelSnapshot)
        : null,
      formation,
      presetRecipe:
        handoff.presetRecipe ??
        (parsedSnapshot.success
          ? (parsedSnapshot.data.tunnel.presetRecipe ?? null)
          : null),
      createdAt:
        typeof handoff.createdAt === "number" ? handoff.createdAt : Date.now(),
    };
  } catch {
    return null;
  }
}
