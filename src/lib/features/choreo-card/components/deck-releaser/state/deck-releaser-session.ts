import type {
  DeckReleaseCard,
  GalleryFilters,
  StepCountWeight,
} from "../../../domain/models/DeckRelease";
import type {
  StartOriMode,
  VariationConfig,
} from "../../../services/deck-variation";
import type { ResolvedReversalPattern } from "../../../domain/reversal-transform";
import type { SmartFilterSpec } from "$lib/shared/library/domain/models/collection";

const STORAGE_KEY = "deckReleaser.session";

export type DeckReleaserStep = "configure" | "review" | "released";
export type DeckReleaserMode = "loop" | "tnd" | "gallery";
export type DeckReleaserSessionStorage = Pick<
  Storage,
  "getItem" | "setItem"
> | null;

export interface PersistedDeckReleaserSession {
  step: DeckReleaserStep;
  viewingDeckNumber: number | null;
  deckMode: DeckReleaserMode;
  totalCards: number;
  notes: string;
  name: string;
  description: string;
  variationConfig?: VariationConfig;
  /** @deprecated Migrated to the multi-select `startOriModes` field. */
  startOriMode?: StartOriMode;
  startOriModes?: StartOriMode[];
  gridModes?: ("diamond" | "box")[];
  reversalPattern?: ResolvedReversalPattern | null;
  sliceTypes?: ("halved" | "quartered")[];
  seed?: string;
  loopTypes?: string[];
  levels?: number[];
  startPlacementIds?: string[];
  startOriLeft?: string;
  startOriRight?: string;
  propStyle?: "smooth" | "mixed" | "choppy";
  handStyle?: "smooth" | "mixed" | "choppy";
  dashStyle?: "low" | "mixed" | "high";
  selectedLength?: number;
  turnIntensity?: number;
  referenceNumber?: number;
  selectedPropType?: string;
  tndFamilyIds?: string[];
  tndTurnPatternIds?: string[];
  galleryFilterSpec?: SmartFilterSpec;
  /** @deprecated Gallery recipes now use `galleryFilterSpec`. */
  galleryFilters?: GalleryFilters;
  weights?: StepCountWeight[];
  cards?: DeckReleaseCard[];
}

export function loadDeckReleaserSession(
  storage: DeckReleaserSessionStorage
): PersistedDeckReleaserSession | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveDeckReleaserSession(
  storage: DeckReleaserSessionStorage,
  session: PersistedDeckReleaserSession
): void {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Losing browser storage must not interrupt a deck already in progress.
  }
}
