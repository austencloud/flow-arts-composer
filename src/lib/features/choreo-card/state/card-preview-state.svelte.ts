import type { Catalog } from "../domain/models/Catalog";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { loadCatalogSequences, loadSequencesByIds } from "../services/catalog-loader";
import type { PrintRenderOptions } from "../services/types";
import { CARD_SIZES, type CardSizeId } from "../domain/card-sizes";

export type CardPreviewSource = 'loops' | 'tnd';

export interface VisibilitySettings {
  showGrid: boolean;
  showTKA: boolean;
  showWord: boolean;
  includeStartPlacement: boolean;
  handPointsVisible: boolean;
  theme: string;
}

interface BreadcrumbSegment {
  label: string;
  level: 0 | 1 | 2;
}

const STORAGE_CARD_SIZE = 'cardPreview.cardSize';
const STORAGE_SOURCE = 'cardPreview.source';
const STORAGE_CATALOG_ID = 'cardPreview.deckId';

// Catalogs with this many sequences or more use lazy-loading per family subset.
const LARGE_CATALOG_THRESHOLD = 500;

function getStored(key: string): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(key);
}

function persist(key: string, value: string | null) {
  if (typeof window === 'undefined') return;
  if (value === null) localStorage.removeItem(key);
  else localStorage.setItem(key, value);
}

export function createCardPreviewState(
  _allCatalogs: Catalog[]
) {
  let level = $state<0 | 1 | 2>(0);
  let selectedSource = $state<CardPreviewSource | null>(
    (getStored(STORAGE_SOURCE) as CardPreviewSource) ?? null
  );
  let selectedCatalog = $state<Catalog | null>(null);

  let cardSize = $state<CardSizeId>(
    (getStored(STORAGE_CARD_SIZE) as CardSizeId) ?? 'poker'
  );

  let selectedFamilyIds = $state<string[]>([]);
  let startPlacementFilter = $state<string | null>(null);

  let sequences = $state<SequenceData[]>([]);
  let isLoading = $state(false);
  let renderProgress = $state(0);
  let renderTotal = $state(0);


  const isLargeCatalog = $derived(
    (selectedCatalog?.totalSequences ?? 0) >= LARGE_CATALOG_THRESHOLD
  );

  // Applies active family and start-placement filters to the loaded sequence set.
  const filteredSequences = $derived.by(() => {
    let result = sequences;

    if (selectedFamilyIds.length > 0) {
      const idSet = new Set(selectedFamilyIds);
      const seqIds = new Set(
        selectedCatalog?.families
          .filter(f => idSet.has(f.id))
          .flatMap(f => [...f.sequenceIds]) ?? []
      );
      result = result.filter(s => seqIds.has(s.id));
    }

    if (startPlacementFilter) {
      result = result.filter(
        s => s.startingPlacementGroup === startPlacementFilter
      );
    }

    return result;
  });

  // Trail of labels the user can click to jump back up the hierarchy.
  const breadcrumbs = $derived.by<BreadcrumbSegment[]>(() => {
    const crumbs: BreadcrumbSegment[] = [{ label: 'Card Preview', level: 0 }];
    if (selectedSource) {
      crumbs.push({
        label: selectedSource === 'loops' ? 'LOOP Catalogs' : 'TnD Catalogs',
        level: 1,
      });
    }
    if (selectedCatalog) {
      crumbs.push({ label: selectedCatalog.name, level: 2 });
    }
    return crumbs;
  });


  async function loadCatalogSequencesForCatalog(catalog: Catalog) {
    isLoading = true;
    sequences = [];
    try {
      const loaded = await loadCatalogSequences(catalog.id);
      sequences = loaded;
    } finally {
      isLoading = false;
    }
  }

  // Merges newly-fetched family sequences into the existing list without duplicates.
  async function loadFamilySequences(catalog: Catalog, familyIds: string[]) {
    isLoading = true;
    try {
      const seqIds = catalog.families
        .filter(f => familyIds.includes(f.id))
        .flatMap(f => [...f.sequenceIds]);
      const loaded = await loadSequencesByIds(catalog.id, seqIds);
      const existingIds = new Set(sequences.map(s => s.id));
      const newSeqs = loaded.filter(s => !existingIds.has(s.id));
      sequences = [...sequences, ...newSeqs];
    } finally {
      isLoading = false;
    }
  }


  return {
    // Getters
    get level() { return level; },
    get selectedSource() { return selectedSource; },
    get selectedCatalog() { return selectedCatalog; },
    get breadcrumbs() { return breadcrumbs; },
    get cardSize() { return cardSize; },
    get selectedFamilyIds() { return selectedFamilyIds; },
    get startPlacementFilter() { return startPlacementFilter; },
    get filteredSequences() { return filteredSequences; },
    get isLoading() { return isLoading; },
    get isLargeCatalog() { return isLargeCatalog; },
    get renderProgress() { return renderProgress; },
    get renderTotal() { return renderTotal; },

    // Setters (external mutations allowed for render pipeline progress tracking)
    set cardSize(v: CardSizeId) {
      cardSize = v;
      persist(STORAGE_CARD_SIZE, v);
    },
    set renderProgress(v: number) { renderProgress = v; },
    set renderTotal(v: number) { renderTotal = v; },

    // Actions

    selectSource(source: CardPreviewSource) {
      selectedSource = source;
      level = 1;
      persist(STORAGE_SOURCE, source);
    },

    async selectCatalog(catalog: Catalog) {
      selectedCatalog = catalog;
      level = 2;
      selectedFamilyIds = [];
      startPlacementFilter = null;
      persist(STORAGE_CATALOG_ID, catalog.id);

      if ((catalog.totalSequences ?? 0) < LARGE_CATALOG_THRESHOLD) {
        await loadCatalogSequencesForCatalog(catalog);
      }
    },

    navigateTo(targetLevel: 0 | 1 | 2) {
      if (targetLevel <= 1) {
        selectedCatalog = null;
        sequences = [];
        selectedFamilyIds = [];
        startPlacementFilter = null;
      }
      if (targetLevel === 0) {
        selectedSource = null;
        persist(STORAGE_SOURCE, null);
      }
      level = targetLevel;
    },

    async setFamilyFilter(ids: string[]) {
      selectedFamilyIds = ids;

      // For large catalogs, fetch the families that haven't been loaded yet.
      if (
        (selectedCatalog?.totalSequences ?? 0) >= LARGE_CATALOG_THRESHOLD &&
        selectedCatalog &&
        ids.length > 0
      ) {
        await loadFamilySequences(selectedCatalog, ids);
      }
    },

    setStartPlacementFilter(pos: string | null) {
      startPlacementFilter = pos;
    },

    // Converts current card size + caller-supplied visibility into render options
    // that the print pipeline can consume directly.
    buildRenderOptions(visibility: VisibilitySettings): PrintRenderOptions {
      const size = CARD_SIZES[cardSize];
      return {
        canvasWidth: size.canvasWidth,
        canvasHeight: size.canvasHeight,
        bleedPx: size.bleedPx,
        includeStartPlacement: visibility.includeStartPlacement,
        theme: visibility.theme,
      };
    },
  };
}

export type CardPreviewState = ReturnType<typeof createCardPreviewState>;
