import type { BrowseFilterType } from "#lib/shared/persistence/domain/enums/filtering-enums.js";
import type { FilterConnective } from "#lib/shared/browse/services/multi-filter.js";
import type { Snippet } from "svelte";
import type {
  CategoryEntry,
  GalleryCatalog,
  Section,
} from "./gallery-drill-catalog.svelte";

export interface GalleryWorkspaceProps {
  catalog: GalleryCatalog;
  section: Section;
  drillWidth: number;
  sheet: boolean;
  /** Rendering inside the split pane's left column. */
  splitPane?: boolean;
  unifiedFilterChooser: boolean;
  adaptiveValueLayout: boolean;
  persistentDesktopCatalog: boolean;
  chooserTitle?: string;
  chooserHint?: string;
  stackHint?: string;
  isValueApplied?: (type: BrowseFilterType, value: string | number) => boolean;
  activeLoopValues?: ReadonlySet<string>;
  onToggleLoop?: unknown;
  loopConnective: FilterConnective;
  onLoopConnectiveChange?: (connective: FilterConnective) => void;
  activeFamilyValues?: ReadonlySet<string>;
  onToggleFamily?: unknown;
  familyConnective: FilterConnective;
  onFamilyConnectiveChange?: (connective: FilterConnective) => void;
  onBack: () => void;
  onPickValue: (
    type: BrowseFilterType,
    value: string | number,
    label: string,
    color?: string
  ) => void;
  /** Replace the applied value of a single-valued category (the turn-limit
   * slider) rather than stacking a second one. */
  onPickExclusiveValue: (
    type: BrowseFilterType,
    /** null clears the category — the slider's "No limit" stop. */
    value: string | number | null,
    label: string,
    previous?: { value: string | number; label: string },
    color?: string
  ) => void;
  onPickLoop: (v: { value: string; label: string; color: string }) => void;
  onPickFamily: (v: { value: string; label: string; color: string }) => void;
  onApply: (
    type: BrowseFilterType,
    value: string | number,
    label: string,
    color?: string
  ) => void;
  onSelectCategory: (entry: CategoryEntry) => void;
}

export type GalleryValueHeadSnippet = Snippet<
  [title: string, hint?: string, trailing?: Snippet]
>;
