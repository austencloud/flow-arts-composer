<script lang="ts">
  import { onMount } from "svelte";
  import type { QueryDocumentSnapshot } from "firebase/firestore";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import { calculate as calculateMandalaGeometry } from "#lib/shared/mandala/services/mandala-geometry-calculator.js";
  import {
    getCachedCatalogs,
    loadCatalogs,
    loadCatalogSequencesPage,
  } from "#lib/features/choreo-card/services/catalog-loader.js";
  import type { Catalog } from "#lib/features/choreo-card/domain/models/Catalog.js";
  import { toast } from "#lib/shared/toast/state/toast-state.svelte.js";
  import { getStickerLabContext } from "../context/sticker-lab-context";
  import { cachePrimitivePaths } from "../state/mandala-paths-cache.svelte";
  import {
    addCatalogShapeMembers,
    createCatalogShapeMembers,
    sortCatalogShapeGroups,
    type CatalogShapeGroup,
    type CatalogShapeMember,
    type CatalogShapeScope,
  } from "../services/catalog-shape-index";
  import CatalogShapeGallery from "./shape-browser/CatalogShapeGallery.svelte";
  import ShapeInspector from "./shape-browser/ShapeInspector.svelte";

  const FETCH_PAGE = 200;
  const stickerState = getStickerLabContext();

  type View =
    | { kind: "catalogs" }
    | { kind: "groups"; catalog: Catalog }
    | { kind: "members"; catalog: Catalog; group: CatalogShapeGroup }
    | {
        kind: "inspect";
        catalog: Catalog;
        group: CatalogShapeGroup;
        memberIndex: number;
      };

  const scopeOptions = [
    { value: "solo" as const, label: "Solo" },
    { value: "combined" as const, label: "Combined" },
  ];

  let catalogs = $state<Catalog[]>([]);
  let catalogsLoading = $state(true);
  let catalogsError = $state<string | null>(null);
  let scope = $state<CatalogShapeScope>("solo");
  let view = $state<View>({ kind: "catalogs" });
  let groups = $state<CatalogShapeGroup[]>([]);
  let scanProgress = $state("");
  let scanError = $state<string | null>(null);
  let scanGeneration = 0;

  const copiesMap = $derived(
    new Map(
      stickerState.sheet.stickers.map((sticker) => [
        sticker.primitiveRef.shapeHash,
        sticker.copies,
      ])
    )
  );

  onMount(() => {
    void refreshCatalogs();
  });

  async function refreshCatalogs(): Promise<void> {
    catalogsLoading = true;
    catalogsError = null;
    const cached = getCachedCatalogs();
    if (cached?.length) catalogs = cached;

    try {
      catalogs = await loadCatalogs();
    } catch (error) {
      console.error("[sticker-lab] catalog load failed:", error);
      catalogsError =
        "Couldn't load catalogs. Check your connection and try again.";
    } finally {
      catalogsLoading = false;
    }
  }

  async function openCatalog(catalog: Catalog): Promise<void> {
    const generation = ++scanGeneration;
    view = { kind: "groups", catalog };
    groups = [];
    scanProgress = "Loading catalog…";
    scanError = null;

    const groupMap = new Map<string, CatalogShapeGroup>();
    let lastDoc: QueryDocumentSnapshot | null = null;
    let hasMore = true;
    let loaded = 0;

    try {
      while (hasMore && generation === scanGeneration) {
        const page = await loadCatalogSequencesPage(
          catalog.id,
          FETCH_PAGE,
          lastDoc ?? undefined
        );
        if (generation !== scanGeneration) return;

        for (const sequence of page.sequences) {
          if (!sequence.steps?.length) continue;
          const paths = calculateMandalaGeometry(
            sequence.steps,
            "staff",
            "staff"
          );
          addCatalogShapeMembers(
            groupMap,
            createCatalogShapeMembers(sequence, paths, scope)
          );
        }

        loaded += page.sequences.length;
        groups = sortCatalogShapeGroups(groupMap);
        scanProgress = `${loaded.toLocaleString()} sequences · ${groups.length.toLocaleString()} ${scope === "solo" ? "solo orbits" : "combined shapes"}`;
        lastDoc = page.lastDoc;
        hasMore = page.sequences.length === FETCH_PAGE;
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    } catch (error) {
      if (generation !== scanGeneration) return;
      console.error(`[sticker-lab] ${catalog.id} scan failed:`, error);
      scanError = "This catalog couldn't be scanned. Try it again.";
    } finally {
      if (generation === scanGeneration) scanProgress = "";
    }
  }

  function selectScope(next: CatalogShapeScope): void {
    if (next === scope) return;
    scope = next;
    if (view.kind !== "catalogs") {
      void openCatalog(view.catalog);
    }
  }

  function backToCatalogs(): void {
    scanGeneration++;
    groups = [];
    scanProgress = "";
    scanError = null;
    view = { kind: "catalogs" };
  }

  function openGroup(group: CatalogShapeGroup): void {
    if (view.kind !== "groups") return;
    view = { kind: "members", catalog: view.catalog, group };
  }

  function inspectMember(group: CatalogShapeGroup, memberIndex: number): void {
    if (view.kind !== "members") return;
    view = {
      kind: "inspect",
      catalog: view.catalog,
      group,
      memberIndex,
    };
  }

  function backFromInspector(): void {
    if (view.kind !== "inspect") return;
    view = {
      kind: "members",
      catalog: view.catalog,
      group: view.group,
    };
  }

  function addMember(member: CatalogShapeMember): void {
    cachePrimitivePaths(member.primitiveRef.shapeHash, member.fullPaths);
    stickerState.addPrimitive(member.primitiveRef);
    toast.success(`${member.word} added to the sheet`);
  }

  function copyCount(member: CatalogShapeMember): number {
    return copiesMap.get(member.primitiveRef.shapeHash) ?? 0;
  }

  function catalogLabel(catalog: Catalog): string {
    return (
      catalog.name ??
      `${catalog.turnPattern ?? ""}`
        .replace("uniform-", "")
        .replace("t", " Turn")
    );
  }
</script>

<div class="shape-browser">
  <header class="browser-header">
    <div class="heading">
      <h2>Mandala Shapes</h2>
      <p>
        {scope === "solo"
          ? "Group one-hand paths across rotations, then choose the full mandala to print."
          : "Browse complete two-hand mandalas grouped by exact shape."}
      </p>
    </div>
    <div class="scope-control">
      <span>Shape scope</span>
      <SegmentedControl
        options={scopeOptions}
        value={scope}
        onchange={selectScope}
        color="accent"
        size="sm"
      />
    </div>
  </header>

  {#if view.kind === "inspect"}
    <ShapeInspector
      members={view.group.members}
      initialIndex={view.memberIndex}
      {copyCount}
      onBack={backFromInspector}
      onAdd={addMember}
    />
  {:else if view.kind === "members"}
    <nav class="breadcrumb" aria-label="Shape browser location">
      <button
        type="button"
        onclick={() =>
          (view = {
            kind: "groups",
            catalog: view.kind === "members" ? view.catalog : catalogs[0]!,
          })}
      >
        <i class="fas fa-arrow-left" aria-hidden="true"></i>
        Shapes
      </button>
      <span aria-hidden="true">/</span>
      <strong>{view.group.members.length} members</strong>
      <small
        >Select a preview to inspect it. Add creates the full sticker.</small
      >
    </nav>
    <CatalogShapeGallery
      group={view.group}
      {copyCount}
      onOpenGroup={openGroup}
      onInspect={inspectMember}
      onAdd={addMember}
    />
  {:else if view.kind === "groups"}
    <nav class="breadcrumb" aria-label="Shape browser location">
      <button type="button" onclick={backToCatalogs}>
        <i class="fas fa-arrow-left" aria-hidden="true"></i>
        Catalogs
      </button>
      <span aria-hidden="true">/</span>
      <strong>{catalogLabel(view.catalog)}</strong>
      {#if scanProgress}
        <small class="progress">
          <i class="fas fa-circle-notch fa-spin" aria-hidden="true"></i>
          {scanProgress}
        </small>
      {:else}
        <small>{groups.length.toLocaleString()} shapes</small>
      {/if}
    </nav>

    {#if scanError}
      <div class="error" role="alert">
        <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
        <span>{scanError}</span>
        <button
          type="button"
          onclick={() =>
            openCatalog(view.kind === "groups" ? view.catalog : catalogs[0]!)}
          >Retry</button
        >
      </div>
    {:else}
      <CatalogShapeGallery
        {groups}
        {scanProgress}
        {copyCount}
        onOpenGroup={openGroup}
        onInspect={inspectMember}
        onAdd={addMember}
      />
    {/if}
  {:else}
    <div class="catalog-list">
      {#if catalogsLoading && catalogs.length === 0}
        <div class="loading" role="status">
          <i class="fas fa-circle-notch fa-spin" aria-hidden="true"></i>
          Loading catalogs…
        </div>
      {:else if catalogsError && catalogs.length === 0}
        <div class="error" role="alert">
          <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
          <span>{catalogsError}</span>
          <button type="button" onclick={refreshCatalogs}>Retry</button>
        </div>
      {:else}
        {@const loopCatalogs = catalogs.filter(
          (catalog) => catalog.collection === "LOOPs"
        )}
        {@const tndCatalogs = catalogs.filter(
          (catalog) => catalog.collection !== "LOOPs"
        )}

        {#if loopCatalogs.length > 0}
          <section>
            <h3>LOOP Catalogs <span>{loopCatalogs.length}</span></h3>
            <div class="catalog-grid">
              {#each loopCatalogs as catalog (catalog.id)}
                <button type="button" onclick={() => openCatalog(catalog)}>
                  <strong>{catalogLabel(catalog)}</strong>
                  <span
                    >{catalog.totalSequences.toLocaleString()} sequences</span
                  >
                </button>
              {/each}
            </div>
          </section>
        {/if}

        {#if tndCatalogs.length > 0}
          <section>
            <h3>T&amp;D Catalogs <span>{tndCatalogs.length}</span></h3>
            <div class="catalog-grid">
              {#each tndCatalogs as catalog (catalog.id)}
                <button type="button" onclick={() => openCatalog(catalog)}>
                  <strong>{catalogLabel(catalog)}</strong>
                  <span
                    >{catalog.totalSequences.toLocaleString()} sequences</span
                  >
                </button>
              {/each}
            </div>
          </section>
        {/if}

        {#if catalogs.length === 0}
          <div class="loading">No catalogs found.</div>
        {/if}
      {/if}
    </div>
  {/if}
</div>

<style>
  .shape-browser {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    container-type: inline-size;
  }

  .browser-header {
    flex-shrink: 0;
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: var(--spacing-lg);
    padding: var(--spacing-md);
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
  }

  .heading {
    min-width: 0;
  }

  h2,
  h3,
  p {
    margin: 0;
  }

  h2 {
    color: var(--theme-text, white);
    font-size: var(--font-size-lg, 18px);
    font-weight: 650;
  }

  .heading p {
    margin-top: var(--spacing-xs);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.62));
    font-size: var(--font-size-min, 14px);
    line-height: 1.45;
  }

  .scope-control {
    flex: 0 0 auto;
    width: min(18rem, 42cqw);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }

  .scope-control > span {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.58));
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .breadcrumb {
    flex-shrink: 0;
    min-height: var(--min-touch-target);
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-sm) var(--spacing-md);
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.58));
  }

  .breadcrumb button,
  .error button {
    min-height: var(--min-touch-target);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-sm) var(--spacing-md);
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: var(--radius-2026-sm);
    background: transparent;
    color: var(--theme-text, white);
    font-size: var(--font-size-min, 14px);
    cursor: pointer;
  }

  .breadcrumb strong {
    color: var(--theme-text, white);
    font-size: var(--font-size-min, 14px);
  }

  .breadcrumb small {
    margin-left: auto;
    display: inline-flex;
    align-items: center;
    gap: var(--spacing-xs);
    font-size: var(--font-size-compact, 12px);
  }

  .catalog-list {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xl);
    overflow-y: auto;
    padding: var(--spacing-md);
    scrollbar-width: thin;
    scrollbar-color: var(--theme-stroke, rgba(255, 255, 255, 0.14)) transparent;
  }

  section {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }

  h3 {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.68));
    font-size: var(--font-size-min, 14px);
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  h3 span {
    opacity: 0.58;
    font-weight: 400;
  }

  .catalog-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--spacing-sm);
  }

  .catalog-grid button {
    min-height: 4.5rem;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    gap: var(--spacing-xs);
    padding: var(--spacing-md);
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    border-radius: var(--radius-2026-sm);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.035));
    color: var(--theme-text, white);
    text-align: left;
    cursor: pointer;
  }

  .catalog-grid button:hover,
  button:focus-visible {
    border-color: var(--theme-accent, #a78bfa);
    outline: none;
  }

  .catalog-grid strong {
    font-size: var(--font-size-min, 14px);
  }

  .catalog-grid span {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.56));
    font-size: var(--font-size-compact, 12px);
  }

  .loading,
  .error {
    flex: 1;
    min-height: 14rem;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-sm);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.65));
    font-size: var(--font-size-min, 14px);
  }

  .error {
    flex-direction: column;
    text-align: center;
    color: var(--semantic-error, #ef4444);
  }

  @container (min-width: 48rem) {
    .catalog-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  @container (min-width: 72rem) {
    .catalog-grid {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }

  @container (min-width: 104rem) {
    .catalog-grid {
      grid-template-columns: repeat(5, minmax(0, 1fr));
    }
  }

  @container (min-width: 142rem) {
    .catalog-grid {
      grid-template-columns: repeat(7, minmax(0, 1fr));
    }
  }

  @media (max-width: 42rem) {
    .browser-header {
      align-items: stretch;
      flex-direction: column;
      gap: var(--spacing-sm);
    }

    .scope-control {
      width: 100%;
    }

    .breadcrumb {
      flex-wrap: wrap;
    }

    .breadcrumb small {
      width: 100%;
      margin-left: 0;
    }
  }
</style>
