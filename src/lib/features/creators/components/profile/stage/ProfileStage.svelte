<!--
  Profile Stage

  The three bands that replace the profile's single wall of choreo cards:
  Showcase (a few, big, one per medium), Collections (everything saved, mixed
  and filterable), Archive (the whole library, small).

  Each artifact renders in ITS OWN medium — a sequence animates, a 3D scene
  loads the real Viewer3DCanvas, a mandala draws from its steps — rather than
  every one of them flattening into the same card front. ArtifactTile owns that;
  LiveSlots budgets how many may animate at once so a 505-item library does not
  try to run 505 render loops.

  Design: docs/superpowers/specs/2026-07-26-profile-as-stage-design.md
  Proven in the harness at /test/profile-stage, which now renders this same
  component so the two cannot drift.
-->
<script lang="ts">
  import { onDestroy } from "svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { getLibraryRepository } from "#lib/shared/library/get-library-repository.js";
  import { scene3dCollectionState } from "#lib/features/scene-3d-collection/state/scene-3d-collection-state.svelte.js";
  import { scene3DHasSteps } from "#lib/features/scene-3d-collection/services/open-3d-scene.js";
  import { tunnelCollectionState } from "#lib/features/tunnel-collection/state/tunnel-collection-state.svelte.js";
  import { mandalaCollectionState } from "#lib/features/mandala/tabs/collection/state/mandala-collection-state.svelte.js";
  import { fitColumns } from "#lib/features/creators/domain/fit-columns.js";
  import { sortSequences } from "#lib/shared/browse/services/browse-sorter.js";
  import { BrowseSortMethod } from "#lib/shared/browse/domain/enums/browse-enums.js";
  import PanelState from "#lib/shared/components/panel/PanelState.svelte";
  import ArtifactTile from "./ArtifactTile.svelte";
  import BandDoorway from "./BandDoorway.svelte";
  import { stripColumns } from "./doorway-policy";
  import { LiveSlots, type Medium } from "./live-slots.svelte";
  import { handleModuleChange } from "#lib/shared/navigation-coordinator/navigation-coordinator.svelte.js";
  import { setPendingBrowseIntent } from "#lib/features/browse/state/pending-browse-intent.svelte.js";
  import { exploreVisualsVisible } from "#lib/shared/browse/navigation/visuals-promotion.js";
  import { listPublicArtifactsByOwner } from "#lib/shared/artifact-revisions/services/public-artifact-loader.js";
  import type { PublicArtifactEnvelope } from "#lib/shared/artifact-revisions/domain/public-artifact.js";
  import { authState } from "#lib/shared/auth/state/auth-state.svelte.js";
  import type { LibrarySequence } from "#lib/shared/library/domain/models/library-sequence.js";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

  let {
    userId,
    displayName,
  }: {
    userId: string;
    /**
     * The creator's display name. The gallery's OWNER filter matches on
     * `ownerDisplayName`, not on uid, so the Archive handoff needs it to scope
     * a visitor's landing. Optional: the harness at /test/profile-stage mounts
     * this component with a bare uid, and an own-profile handoff never uses it.
     */
    displayName?: string;
  } = $props();

  /**
   * One design for everyone — the doorway looks and behaves the same on your
   * own profile as on anyone else's. What differs is plumbing: which pool the
   * count is read from, and therefore which pool the button opens. See the
   * resolved-prerequisite section of the lobby spec.
   */
  const isOwnProfile = $derived(!!userId && userId === authState.user?.uid);

  const slots = new LiveSlots();
  onDestroy(() => slots.destroy());

  let sequences = $state<LibrarySequence[]>([]);
  let loading = $state(true);
  let loadError = $state<string | null>(null);

  $effect(() => {
    const id = userId;
    if (!id) return;

    // ONLY ever for your own profile. These three are global singletons that
    // hold the SIGNED-IN user's saved art, and `ensureStarted(uid)` repoints
    // them at that uid — including where their `add`/`remove`/`rename` write.
    // Passing a visited creator's id here pointed your own store at a stranger,
    // and since their art is owner-only by rule (firestore.rules
    // mandala-/tunnel-/scene-3d-collection: `allow read ... if isOwner`) the
    // load was rejected, left `collection` holding YOUR entries, and rendered
    // your 46 saved artifacts on their profile. It also broke your next save,
    // which would target their namespace and bounce off the rules.
    //
    // Another creator's saved art is private and there is nothing to show. The
    // Collections band is omitted for a visitor rather than faked.
    if (isOwnProfile) {
      scene3dCollectionState.ensureStarted(id);
      tunnelCollectionState.ensureStarted(id);
      mandalaCollectionState.ensureStarted(id);
    }

    loading = true;
    loadError = null;
    // A visitor may only read this creator's PUBLISHED sequences
    // (firestore.rules: `visibility == 'public' || isOwner || isAdmin`). The
    // unfiltered query this used to issue is not provably satisfiable, so
    // Firestore rejected the whole thing and the stage fell into its error
    // state for every non-admin visitor. Scoping the read repairs that, and it
    // is also what keeps the Archive doorway honest: the count a visitor sees
    // is the count of the work their handoff will actually show them.
    const scope = userId === authState.user?.uid ? {} : { visibility: "public" as const };
    getLibraryRepository()
      .getUserSequences(id, scope)
      .then((result) => {
        sequences = result;
        loading = false;
      })
      .catch((err: unknown) => {
        loadError = err instanceof Error ? err.message : t("browse_verified_load_library_failed");
        loading = false;
      });
  });

  // Guarded at the read too, not just at the load. The singletons stay
  // populated with YOUR art while you browse someone else's profile, so a bare
  // read would leak it into their Showcase even with the load skipped above.
  const scenes = $derived(isOwnProfile ? scene3dCollectionState.collection : []);
  const tunnels = $derived(isOwnProfile ? tunnelCollectionState.collection : []);
  const mandalas = $derived(isOwnProfile ? mandalaCollectionState.collection : []);

  const sortedSequences = $derived(
    sortSequences(
      [...sequences] as SequenceData[],
      BrowseSortMethod.DATE_ADDED
    ) as LibrarySequence[]
  );

  /**
   * Where "browse all their sequences" goes.
   *
   * The doorway promises a number, so landing somewhere that holds a DIFFERENT
   * number is the defect this whole design turns on. Each branch opens the pool
   * its own count was read from:
   *
   * - Own profile → Browse > Library > the All shelf, backed by
   *   `getSequences()`, which IS `getUserSequences(ownUid)` — the same call
   *   above. The counts match by construction.
   * - Another creator → the community gallery with the OWNER filter applied to
   *   their name, which is their published work. That is also what the
   *   visitor's own count was scoped to.
   *
   * Browse reads neither of these from a URL: it is a keep-alive module panel,
   * so the intent is set first and consumed on the other side.
   */
  function enterArchive(): void {
    if (isOwnProfile) {
      setPendingBrowseIntent({ kind: "own-library" });
      void handleModuleChange("browse", "library");
      return;
    }
    // Without a display name there is nothing to filter on, so the visitor
    // lands on the gallery front door rather than on a silently empty grid.
    if (displayName) {
      setPendingBrowseIntent({ kind: "creator-gallery", ownerName: displayName });
    }
    void handleModuleChange("browse", "gallery");
  }

  /**
   * The Showcase stands in for pinned items. `PinnedItem` exists on the profile
   * already but nothing writes it, so rather than show an empty band we
   * auto-pick one newest artifact per medium plus the top-starred sequence.
   * When pinning ships this derivation is what it replaces.
   */
  const showcase = $derived.by(() => {
    const picks: {
      key: string;
      medium: Medium;
      title: string;
      sequence?: SequenceData;
      poster?: string;
      tunnel?: any;
      scene?: any;
      mandala?: any;
    }[] = [];

    const topStarred = [...sequences].sort(
      (a, b) => (b.starCount ?? 0) - (a.starCount ?? 0)
    )[0];
    if (topStarred) {
      picks.push({
        key: `seq-${topStarred.id}`,
        medium: "sequence",
        title: topStarred.word || topStarred.name || t("browse_audit_sequence"),
        sequence: topStarred,
      });
    }

    const scene = scenes[0];
    if (scene) {
      picks.push({
        key: `scene-${scene.id}`,
        medium: "scene",
        title: scene.sourceWord || scene.name,
        poster: scene.poster,
        // Only a scene saved WITH a performance can animate; a look-only save
        // has no steps for the puppet loop to position anyone to.
        scene: scene3DHasSteps(scene) ? scene : null,
      });
    }

    const mandala = mandalas[0];
    if (mandala) {
      picks.push({
        key: `mandala-${mandala.id}`,
        medium: "mandala",
        title: mandala.sourceWord || mandala.name,
        mandala,
      });
    }

    const tunnel = tunnels[0];
    if (tunnel) {
      picks.push({
        key: `tunnel-${tunnel.id}`,
        medium: "tunnel",
        title: tunnel.name,
        poster: tunnel.poster,
        tunnel,
      });
    }

    return picks;
  });

  // Column counts are pinned per tier and routed through fitColumns so a band
  // never strands one tile in its own row (4k-native-layout.md). This is the
  // rule ProfileTabs' `repeat(auto-fill, minmax(240px, 1fr))` breaks.
  /*
    Measured on the STAGE, not the window.

    These tiers were tuned when the stage was the whole page, so the window's
    width and the band's width were the same number. They are not anymore: the
    identity rail takes a ~400px column beside this one. Reading the window
    over-estimates every count, which squeezes tiles or overflows the row — and
    it degrades all three bands at once, since they share this function.

    A ResizeObserver rather than a container query because these numbers feed
    `items.slice()`, not just CSS.
  */
  let stageEl = $state<HTMLElement | null>(null);
  let stageEm = $state(80);
  $effect(() => {
    if (!stageEl) return;
    const el = stageEl;
    const measure = () => {
      const root = parseFloat(getComputedStyle(el).fontSize) || 16;
      const w = el.getBoundingClientRect().width;
      if (w > 0) stageEm = w / root;
    };
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    measure();
    return () => observer.disconnect();
  });

  /*
    Tiers measured in `em`, not `px`.

    Px thresholds against a panel that carries a type ramp produce MORE, THINNER
    tiles as the screen grows — the failure 4k-native-layout.md names in rule 2.
    Concretely: the archive got 5 columns of 233px at 1920 and 7 columns of 253px
    at a real 3840, so the art never grew while the type around it did.

    Dividing the band's width by the ramped root size makes the tier ramp-aware:
    the stage measures ~80em at 1920 and ~84em at 3840, so it stays in the same
    tier and each tile grows with the ramp instead of the count growing. The
    higher tiers still exist for a stage with no rail beside it (the harness at
    /test/profile-stage runs full width).

    The two low boundaries are 40em and 26em rather than a straight px-to-em
    translation of the old 700/1100. Those numbers were compared against the
    VIEWPORT; the stage is always narrower — panel padding, the sidebar, and now
    the rail. Translating 700px to 44em put the 820px tablet at 43.4em, one hair
    under, and dropped its archive from four tiles to two.
  */
  function capFor(band: "showcase" | "collection" | "archive"): number {
    const w = stageEm;
    if (band === "showcase") {
      if (w >= 163) return 5;
      if (w >= 105) return 4;
      if (w >= 69) return 3;
      if (w >= 40) return 2;
      return 1;
    }
    if (band === "collection") {
      if (w >= 213) return 8;
      if (w >= 163) return 7;
      if (w >= 105) return 6;
      if (w >= 69) return 4;
      if (w >= 40) return 3;
      return 2;
    }
    if (w >= 213) return 10;
    if (w >= 163) return 8;
    if (w >= 105) return 7;
    if (w >= 69) return 5;
    if (w >= 40) return 4;
    if (w >= 26) return 3;
    return 2;
  }

  /** One row of the newest work, which is all the doorway shows. The old
   *  `archiveCap` existed to stop the wall being 505 tiles; the doorway removes
   *  the wall, so the cap goes with it. */
  const archiveSample = $derived(sortedSequences.slice(0, capFor("archive")));

  /**
   * ONE mixed Collections grid, not three type-segregated subbands.
   *
   * Segregating by medium looked tidy and read badly: the counts are lopsided
   * (1 scene, 4 tunnels, 41 mandalas), so at 3840 the scenes row was one tile
   * beside seven empty tracks and the tunnels row four beside four. Interleaving
   * by recency keeps every row full at every width AND puts the variety of media
   * on show, which is the whole argument for the band. The filter covers the
   * "just show me my tunnels" case that sections were really serving.
   */
  type ArtifactMandala = {
    steps: unknown[];
    variant: "left" | "right" | "both";
    leftPropType?: string;
    rightPropType?: string;
    pathShape?: "arc" | "linear" | "concave" | "hybrid";
  };

  type CollectionEntry = {
    id: string;
    medium: Medium;
    title: string;
    at: number;
    poster: string | null;
    scene: unknown | null;
    tunnel: unknown | null;
    mandala: ArtifactMandala | null;
  };

  function stamp(record: Record<string, any>): number {
    return record.createdAt ?? record.updatedAt ?? 0;
  }

  const collectionEntries = $derived.by((): CollectionEntry[] => {
    const out: CollectionEntry[] = [];

    for (const entry of scenes) {
      const r = entry as Record<string, any>;
      out.push({
        id: `scene-${entry.id}`,
        medium: "scene",
        title: r.sourceWord || entry.name,
        at: stamp(r),
        poster: r.poster ?? null,
        scene: scene3DHasSteps(entry as any) ? entry : null,
        tunnel: null,
        mandala: null,
      });
    }
    for (const entry of tunnels) {
      const r = entry as Record<string, any>;
      out.push({
        id: `tunnel-${entry.id}`,
        medium: "tunnel",
        title: r.sourceWord || entry.name,
        at: stamp(r),
        poster: r.poster ?? null,
        scene: null,
        tunnel: entry,
        mandala: null,
      });
    }
    for (const entry of mandalas) {
      const r = entry as Record<string, any>;
      out.push({
        id: `mandala-${entry.id}`,
        medium: "mandala",
        title: r.sourceWord || entry.name,
        at: stamp(r),
        poster: null,
        scene: null,
        tunnel: null,
        mandala: {
          steps: r.steps ?? [],
          variant: r.variant ?? "both",
          leftPropType: r.leftPropType,
          rightPropType: r.rightPropType,
          pathShape: r.pathShape,
        },
      });
    }

    return out.sort((a, b) => b.at - a.at);
  });

  const totalSaved = $derived(collectionEntries.length);

  /** Library > Art shelf ids, which are how the three collection galleries are
   *  addressed (`MyCollectionsPanel.svelte` ART_DETAIL). There is no route —
   *  they mount inside the Library detail pane. */
  const ART_SHELF: { medium: Medium; id: string; label: string }[] = [
    { medium: "mandala", id: "art_mandala", label: "Mandalas" },
    { medium: "tunnel", id: "art_tunnels", label: "Tunnels" },
    { medium: "scene", id: "art_scenes", label: "3D Scenes" },
  ];

  /**
   * One strip per medium instead of one mixed grid with a filter above it.
   *
   * The mixed grid was the whole band: 46 tiles, and at 41 mandalas that is a
   * wall of near-identical circles you have to scroll past. Austen, on it
   * (2026-07-28): "I just frankly should not see a giant ass grid of stuff."
   * The filter chips could narrow it, but narrowing is work the page can do
   * for you — a strip per medium IS the filter, already applied, and each one
   * carries its own way in to that medium's gallery.
   *
   * Ordered by count, so the medium you actually have leads and a lone scene
   * never opens the band. Media with nothing saved are omitted rather than
   * shown as a dead 0 — same rule the chips used.
   */
  const collectionStrips = $derived.by(() =>
    ART_SHELF.map((shelf) => ({
      ...shelf,
      items: collectionEntries.filter((e) => e.medium === shelf.medium),
    }))
      .filter((strip) => strip.items.length > 0)
      .sort((a, b) => b.items.length - a.items.length)
  );

  function enterShelf(shelfId: string, label: string): void {
    setPendingBrowseIntent({ kind: "art-shelf", shelfId, label });
    void handleModuleChange("browse", "library");
  }

  /**
   * Published visuals — the creator's APPROVED public artifacts (Browse
   * Phase 3). Unlike the private Collections band, this reads the guest
   * projection, so it works on anyone's profile. Shown only while the Explore
   * Visuals destination is promoted: the tiles open that destination, and a
   * band whose doorway leads nowhere would be worse than no band.
   */
  let publishedVisuals = $state<PublicArtifactEnvelope[]>([]);
  let publishedToken = 0;
  $effect(() => {
    const id = userId;
    const token = ++publishedToken;
    if (!id || !exploreVisualsVisible()) {
      publishedVisuals = [];
      return;
    }
    listPublicArtifactsByOwner("tunnel", id)
      .then((result) => {
        if (token === publishedToken) publishedVisuals = result;
      })
      .catch(() => {
        // Public band is decorative on the profile — a failed read hides it
        // rather than erroring the whole stage.
        if (token === publishedToken) publishedVisuals = [];
      });
  });

  function openPublishedVisual(envelope: PublicArtifactEnvelope): void {
    setPendingBrowseIntent({
      kind: "explore-visual-detail",
      visualType: "tunnels",
      artifactId: envelope.artifactId,
    });
    void handleModuleChange("browse", "gallery");
  }

  /*
    Emptiness is NOT reported outward from here.

    It used to be, and the parent defaulted to "has work" while this stage's read
    was in flight — which painted the two-column layout with an empty column and
    then collapsed it. The parent already awaits the same sequence list before it
    paints anything, so it can decide the composition up front from data it
    already holds. This component only renders; it does not shape the page around
    itself. See the derivation in UserProfilePanel.
  */
</script>

<div class="stage" bind:this={stageEl}>
  {#if loadError}
    <PanelState type="error" title={t("browse_verified_load_library_failed")} message={loadError} />
  {:else}
    <section class="band" aria-labelledby="band-showcase">
      <header class="band-head">
        <h2 id="band-showcase">{t("browse_verified_showcase")}</h2>
        <span class="rule" aria-hidden="true"></span>
        <span class="band-count">{showcase.length}</span>
      </header>
      {#if showcase.length === 0}
        <p class="band-empty">
          {isOwnProfile
            ? t("browse_verified_showcase_empty_own")
            : t("browse_verified_nothing_published")}
        </p>
      {:else}
        <div
          class="grid showcase-grid"
          style:--cols={Math.min(showcase.length, fitColumns(showcase.length, capFor("showcase")))}
          style:--cap={capFor("showcase")}
        >
          {#each showcase as pick (pick.key)}
            <ArtifactTile
              {slots}
              medium={pick.medium}
              title={pick.title}
              sequence={pick.sequence ?? null}
              poster={pick.poster ?? null}
              tunnel={pick.tunnel ?? null}
              scene={pick.scene ?? null}
              mandala={pick.mandala ?? null}
              size="lg"
            />
          {/each}
        </div>
      {/if}
    </section>

    <!-- Approved public artifacts — visible on anyone's profile because the
         data itself is the guest projection. Omitted when empty (same rule as
         the collection strips) and while Explore Visuals is unpromoted. -->
    {#if publishedVisuals.length > 0}
      <section class="band" aria-labelledby="band-published">
        <header class="band-head">
          <h2 id="band-published">{t("browse_verified_published_visuals")}</h2>
          <span class="rule" aria-hidden="true"></span>
          <span class="band-count">{publishedVisuals.length}</span>
        </header>
        <div
          class="grid showcase-grid"
          style:--cols={Math.min(
            publishedVisuals.length,
            fitColumns(publishedVisuals.length, capFor("collection"))
          )}
          style:--cap={capFor("collection")}
        >
          {#each publishedVisuals as envelope (envelope.artifactId)}
            <ArtifactTile
              {slots}
              medium="tunnel"
              title={envelope.title}
              poster={envelope.posterUrl ?? null}
              onopen={() => openPublishedVisual(envelope)}
            />
          {/each}
        </div>
      </section>
    {/if}

    <!-- Own profile only. Saved scenes, tunnels and mandalas are owner-only by
         Firestore rule, so on someone else's profile there is nothing to read —
         and an empty "Collections 0" band would claim they have saved nothing
         when the truth is that it is private. Omit it. -->
    {#if isOwnProfile}
    <section class="band" aria-labelledby="band-collections">
      <header class="band-head">
        <h2 id="band-collections">{t("tab_library_collections")}</h2>
        <span class="rule" aria-hidden="true"></span>
        <span class="band-count">{totalSaved}</span>
      </header>

      {#if totalSaved === 0}
        <p class="band-empty">
          {t("browse_verified_saved_visuals_empty")}
        </p>
      {:else}
        {#each collectionStrips as strip (strip.id)}
          <BandDoorway
            {slots}
            size="md"
            label={strip.label}
            total={strip.items.length}
            columns={stripColumns(capFor("collection"))}
            actionLabel={t("browse_verified_see_all")}
            onenter={() => enterShelf(strip.id, strip.label)}
            items={strip.items
              .slice(0, stripColumns(capFor("collection")))
              .map((e) => ({
                key: e.id,
                medium: e.medium,
                title: e.title,
                poster: e.poster,
                scene: e.scene,
                tunnel: e.tunnel,
                mandala: e.mandala,
              }))}
          />
        {/each}
      {/if}
    </section>
    {/if}

    <section class="band" aria-labelledby="band-archive">
      <header class="band-head">
        <h2 id="band-archive">{t("browse_verified_archive")}</h2>
        <span class="rule" aria-hidden="true"></span>
        <span class="band-count">{sequences.length}</span>
      </header>

      {#if loading}
        <PanelState type="loading" message={t("browse_verified_loading_library")} />
      {:else if sequences.length === 0}
        <p class="band-empty">
          {isOwnProfile
            ? t("browse_verified_saved_sequences_empty")
            : t("browse_verified_published_sequences_empty")}
        </p>
      {:else}
        <!-- Always a doorway, never a grid. A band that is browsable at 40 and
             a doorway at 400 teaches two interactions for one thing. -->
        <BandDoorway
          {slots}
          total={sequences.length}
          columns={capFor("archive")}
          actionLabel={t("browse_verified_browse_all_sequences")}
          onenter={enterArchive}
          items={archiveSample.map((s) => ({
            key: s.id,
            medium: "sequence" as const,
            title: s.word || s.name || t("browse_verified_untitled"),
            sequence: s as SequenceData,
          }))}
        />
      {/if}
    </section>
  {/if}
</div>

<style>
  /* The profile stage uses the standard logical type roles. Its bands and
     tiles gain room through the surrounding composition, not magnification. */
  .stage {
    container-type: inline-size;

    display: flex;
    flex-direction: column;
    gap: clamp(1.5em, 3cqw, 3em);
    width: 100%;
    min-width: 0;
  }

  .band {
    display: flex;
    flex-direction: column;
    gap: 0.85em;
  }

  .band-head {
    display: flex;
    align-items: center;
    gap: 0.9em;
  }

  .band-head h2 {
    margin: 0;
    font-size: 0.9375em;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--theme-text-dim);
    white-space: nowrap;
  }

  .rule {
    flex: 1;
    height: 1px;
    background: var(--theme-stroke-strong, rgba(255, 255, 255, 0.12));
  }

  .band-count {
    font-size: 0.9375em;
    color: var(--theme-text-dim);
    font-variant-numeric: tabular-nums;
  }

  .band-empty {
    margin: 0;
    color: var(--theme-text-dim);
    font-size: 0.9375em;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(var(--cols), minmax(0, 1fr));
    gap: clamp(0.75em, 1.2cqw, 1.25em);
    align-items: start;
  }

  /* A showcase holding fewer items than the tier's column cap gets one track per
     item, not a full row with empty tracks trailing the last tile — that is the
     stranded-track failure (visual-verification-mandatory.md). Capping the
     grid's own width to the same share of the row keeps each tile the size it
     would have been in a full row, so one pinned item reads as one tile rather
     than ballooning to the whole band. Gaps are ignored in the ratio, which
     makes a short row a few px wider than a full one — invisible, and worth not
     threading the gap token through a calc. */
  .showcase-grid {
    /* `width: 100%` is load-bearing: `margin-inline: auto` on a column-flex item
       cancels the default stretch, and the grid then shrank to its tile's
       content width (173px instead of 407px). An explicit width makes the box
       definite again so max-width has something to clamp. */
    width: 100%;
    max-width: calc(100% * var(--cols) / var(--cap));
    margin-inline: auto;
  }

  /* Short-landscape: a grid of 1:1 tiles can't fit even one row, so the
     showcase becomes a horizontal strip you swipe. Grid everywhere else —
     this is the one viewport where the band changes shape, not a mobile
     pattern imposed on desktop. */
  @media (max-height: 560px) {
    .showcase-grid {
      display: flex;
      overflow-x: auto;
      scroll-snap-type: x mandatory;
      gap: clamp(0.75em, 1.2cqw, 1.25em);
      padding-bottom: 0.5em;
      -webkit-overflow-scrolling: touch;
    }

    .showcase-grid > :global(*) {
      flex: 0 0 auto;
      width: min(62vh, 70vw);
      scroll-snap-align: start;
    }
  }
</style>
