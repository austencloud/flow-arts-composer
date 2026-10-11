/**
 * The collection list the filter workspace's Collections category offers.
 *
 * Your own collections first, then every public community one, deduped by id
 * and ordered by size. Shared by the gallery and the Library so the same
 * category appears in both — collections are a stackable FILTER in either
 * source, while the Library tab stays the management home (create, edit
 * membership, share).
 *
 * Call inside a `$derived.by` — it reads reactive state, so the result tracks
 * membership changes for free.
 */
import type { CollectionOption } from "#lib/features/browse/gallery-home/gallery-drill-catalog.svelte.js";
import { collectionsState } from "#lib/features/library/state/collections-state.svelte.js";
import { communityCollectionsState } from "#lib/features/browse/collections/state/community-collections-state.svelte.js";

interface CollectionLike {
  id: string;
  name: string;
  sequenceCount?: number;
  sequenceIds?: readonly string[];
  coverImageUrl?: string;
  color?: string;
  icon?: string;
  ownerId?: string;
  systemType?: string;
  kind?: string;
}

export function getCollectionOptions(): CollectionOption[] {
  const seen = new Set<string>();
  const out: CollectionOption[] = [];

  const push = (c: CollectionLike, ownerName?: string) => {
    if (seen.has(c.id)) return;
    seen.add(c.id);
    out.push({
      id: c.id,
      name: c.name,
      size: c.sequenceCount ?? c.sequenceIds?.length ?? 0,
      coverImageUrl: c.coverImageUrl,
      color: c.color,
      icon: c.icon,
      ownerName,
      ownerId: c.ownerId,
      canShare: !ownerName && !c.systemType && c.kind !== "smart",
    });
  };

  for (const c of collectionsState.collections) push(c);
  for (const c of communityCollectionsState.items) push(c.collection, c.ownerName);

  return out.sort((a, b) => b.size - a.size);
}
