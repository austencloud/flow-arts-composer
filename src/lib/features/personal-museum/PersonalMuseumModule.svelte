<script lang="ts">
  /**
   * Personal Museum Module — host
   *
   * Wires the personal-museum data layer (favorites → resolved wall slots) into
   * the reused 3D museum scene (DimensionFlipProof). It loads the user's saved
   * sequences, pre-renders each placed sequence's first-step pictograph to an
   * ImageBitmap for the wall plaques, and feeds the scene the injection maps it
   * gained in Tasks 8/9 (userSequenceData + plaquePictographs).
   *
   * The out-of-world assignment panel (Task 11) and the in-world placement
   * picker (Task 12) both mount here. The in-world picker opens when the player
   * presses E facing a wall slot — DimensionFlipProof reports the focused slot's
   * refId via onExhibitFocus, which drives focusedSlot below.
   */
  import { getEffectiveUserId } from "#lib/shared/auth/state/auth-state.svelte.js";
  import { getFavorites } from "#lib/shared/library/services/collection-manager.js";
  import { getLibraryRepository } from "#lib/shared/library/get-library-repository.js";
  import { deriveWord } from "#lib/shared/foundation/services/word-deriver.js";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import type { LibrarySequence } from "#lib/shared/library/domain/models/library-sequence.js";

  import { createPersonalMuseumState } from "./state/personal-museum-state.svelte";
  import {
    PERSONAL_MUSEUM_EDGES,
    PERSONAL_MUSEUM_SLOT_IDS,
  } from "./data/personal-museum-room-graph";
  import { buildPersonalGrid } from "./services/build-personal-grid";
  import { renderFirstStepBitmap } from "./services/plaque-pictograph";
  import PersonalMuseumAssignPanel from "./components/PersonalMuseumAssignPanel.svelte";
  import PersonalMuseumInWorldPicker from "./components/PersonalMuseumInWorldPicker.svelte";

  interface Props {
    /** False when mounted-but-hidden (keep-alive). Default true so the module
     *  behaves normally when rendered standalone or in tests. */
    visible?: boolean;
  }
  let { visible = true }: Props = $props();

  const uid = $derived(getEffectiveUserId());

  // ── State (created once for this host's lifetime) ──
  const museumState = createPersonalMuseumState({ slotIds: PERSONAL_MUSEUM_SLOT_IDS });

  // Lookup of every sequence we might place (favorites + explicitly-placed ids).
  let seqById = $state<Map<string, LibrarySequence>>(new Map());
  // Bitmap cache keyed by sequenceId so re-curation never re-renders unchanged art.
  const bitmapBySeqId = new Map<string, ImageBitmap>();

  let dataLoaded = $state(false);
  let loading = $state(true);
  let loadError = $state<string | null>(null);
  // True when the load failed for an auth/permission reason (e.g. signed out, or
  // getEffectiveUserId returned a non-null but unauthenticated id). We degrade to
  // the sign-in prompt rather than show a scary Firestore error.
  let needsAuth = $state(false);
  let loadToken = 0; // guards against overlapping data loads

  // ── Reactive injection maps (rebuilt when the resolved slot map changes) ──
  let userSequenceData = $state<Map<string, SequenceData>>(new Map());
  let plaquePictographs = $state<Map<string, ImageBitmap>>(new Map());
  let slotMeta = $state<Record<string, { name: string }>>({});

  // ── Data load: favorites → state → fill missing sequences ──
  // Runs whenever the effective user changes; guarded against re-entry and
  // torn down (state disposed) when the host unmounts.
  $effect(() => {
    const currentUid = uid;
    if (!currentUid) {
      loading = false;
      return;
    }

    const token = ++loadToken;
    loading = true;
    loadError = null;
    needsAuth = false;

    (async () => {
      try {
        const favs = await getFavorites();
        if (token !== loadToken) return;

        museumState.setFavorites(favs.map((f) => ({ id: f.id, updatedAt: f.updatedAt?.getTime?.() ?? 0 })));
        await museumState.init();
        if (token !== loadToken) return;

        const lookup = new Map<string, LibrarySequence>();
        for (const f of favs) lookup.set(f.id, f);

        // Any explicitly-placed sequence that isn't a current favorite must be
        // fetched so its art + name resolve.
        const placedIds = Object.values(museumState.resolvedSlots).filter(
          (id): id is string => id !== null,
        );
        const repo = getLibraryRepository();
        for (const id of placedIds) {
          if (lookup.has(id)) continue;
          const seq = await repo.getSequence(id);
          if (token !== loadToken) return;
          if (seq) lookup.set(id, seq);
        }

        seqById = lookup;
        dataLoaded = true;
        loading = false;
      } catch (err) {
        if (token !== loadToken) return;
        const msg = err instanceof Error ? err.message : String(err);
        // A logged-out / unauthenticated session can still yield a non-null id but
        // be denied by Firestore rules. Treat that as "needs sign-in", not an error.
        if (/permission|insufficient|unauthenticated|unauthorized|auth/i.test(msg)) {
          needsAuth = true;
        } else {
          loadError = "Failed to load your museum.";
        }
        loading = false;
      }
    })();
  });

  // Ensures a plaque bitmap exists for each placed sequence (rendering only the
  // ones not already cached), then assembles the three maps the scene consumes.
  $effect(() => {
    if (!dataLoaded) return;

    const resolved = museumState.resolvedSlots; // refId(slotId) → sequenceId | null
    const lookup = seqById;
    let cancelled = false;

    (async () => {
      // 1) Ensure bitmaps for every placed sequence (cache-keyed by sequenceId).
      const placed = Object.entries(resolved).filter(
        (e): e is [string, string] => e[1] !== null,
      );
      for (const [, seqId] of placed) {
        if (bitmapBySeqId.has(seqId)) continue;
        const seq = lookup.get(seqId);
        if (!seq) continue;
        const bmp = await renderFirstStepBitmap(seq);
        if (cancelled) return;
        if (bmp) bitmapBySeqId.set(seqId, bmp);
      }

      // 2) Assemble the maps (placed ids only).
      const nextUserData = new Map<string, SequenceData>();
      const nextPlaques = new Map<string, ImageBitmap>();
      const nextMeta: Record<string, { name: string }> = {};

      for (const [slotId, seqId] of placed) {
        const seq = lookup.get(seqId);
        if (!seq) continue;
        nextUserData.set(seqId, seq);
        nextMeta[slotId] = { name: displayName(seq) };
        const bmp = bitmapBySeqId.get(seqId);
        if (bmp) nextPlaques.set(slotId, bmp);
      }

      if (cancelled) return;
      userSequenceData = nextUserData;
      plaquePictographs = nextPlaques;
      slotMeta = nextMeta;
    })();

    return () => {
      cancelled = true;
    };
  });

  function displayName(seq: LibrarySequence): string {
    return deriveWord(seq) || seq.word || seq.name || seq.id;
  }

  // ── Grid (reactive — recomputes when resolvedSlots or slotMeta change) ──
  const grid = $derived(buildPersonalGrid(museumState.resolvedSlots, slotMeta));

  const ready = $derived(dataLoaded && !loading);

  // ── In-world curation: the wall slot the player is facing (E pressed). ──
  // Driven by DimensionFlipProof's onExhibitFocus seam; null = picker closed.
  let focusedSlot = $state<string | null>(null);

  $effect(() => {
    return () => {
      museumState.dispose();
    };
  });
</script>

{#if !uid || needsAuth}
  <div class="pm-prompt">
    <i class="fas fa-landmark" aria-hidden="true"></i>
    <p>Sign in to walk your personal museum.</p>
  </div>
{:else if loadError}
  <div class="pm-prompt">
    <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
    <p>{loadError}</p>
  </div>
{:else if !ready}
  <div class="pm-prompt">
    <i class="fas fa-landmark pm-pulse" aria-hidden="true"></i>
    <p>Opening your gallery…</p>
  </div>
{:else}
  {#await import("../museum/components/game/DimensionFlipProof.svelte") then { default: DimensionFlipProof }}
    <DimensionFlipProof
      {grid}
      edges={PERSONAL_MUSEUM_EDGES}
      {visible}
      startInFps={false}
      {userSequenceData}
      {plaquePictographs}
      onExhibitFocus={(refId) => (focusedSlot = refId)}
    />
  {/await}

  <div class="pm-curate-dock">
    <PersonalMuseumAssignPanel
      {museumState}
      slotIds={PERSONAL_MUSEUM_SLOT_IDS}
      {seqById}
      {displayName}
    />
  </div>

  <PersonalMuseumInWorldPicker
    {museumState}
    {focusedSlot}
    {seqById}
    {displayName}
    onClose={() => (focusedSlot = null)}
  />
{/if}

<style>
  .pm-curate-dock {
    position: absolute;
    top: 1rem;
    right: 1rem;
    width: min(22rem, calc(100vw - 2rem));
    max-height: calc(100% - 2rem);
    display: flex;
    z-index: 5;
  }

  .pm-prompt {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    color: rgba(220, 210, 190, 0.9);
    background: #0b0b0d;
    text-align: center;
    padding: 2rem;
  }

  .pm-prompt i {
    font-size: 2.5rem;
    color: #f59e0b;
  }

  .pm-prompt p {
    margin: 0;
    font-size: 1rem;
    max-width: 22rem;
  }

  .pm-pulse {
    animation: pm-pulse 1.6s ease-in-out infinite;
  }

  @keyframes pm-pulse {
    0%,
    100% {
      opacity: 0.5;
    }
    50% {
      opacity: 1;
    }
  }
</style>
