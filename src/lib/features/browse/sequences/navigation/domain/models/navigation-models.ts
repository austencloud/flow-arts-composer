import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

export interface BrowseNavigationItem {
  id: string;
  label: string;
  value: string | number;
  count: number;
  isActive: boolean;
  sequences: SequenceData[];
}

export interface BrowseNavigationConfig {
  id: string;
  title: string;
  type: "date" | "length" | "letter" | "level" | "author" | "favorites";
  items: BrowseNavigationItem[];
  isExpanded: boolean;
  totalCount: number;
}
