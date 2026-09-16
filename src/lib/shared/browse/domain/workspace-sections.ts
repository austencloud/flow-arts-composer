/**
 * Which workspace category owns each filter type.
 *
 * Two consumers need this mapping and must not drift: the rule strip (editing
 * a chip reopens the drill on that filter's editor) and the catalog's
 * per-tile rule-count dots. Lived in BrowseModule until the workspace became
 * shared between the gallery and the Library.
 */
import { BrowseFilterType } from "$lib/shared/persistence/domain/enums/filtering-enums";

export type WorkspaceSection =
  | "level"
  | "length"
  | "letter"
  | "placement"
  | "gridmode"
  | "author"
  | "performance"
  | "collection"
  | "collections"
  | "loop"
  | "family"
  | "max_turn_intensity";

export const SECTION_FOR_FILTER_TYPE: Partial<
  Record<string, WorkspaceSection>
> = {
  [BrowseFilterType.DIFFICULTY]: "level",
  [BrowseFilterType.LENGTH]: "length",
  [BrowseFilterType.STARTING_LETTER]: "letter",
  [BrowseFilterType.STARTING_PLACEMENT]: "placement",
  [BrowseFilterType.GRID_MODE]: "gridmode",
  [BrowseFilterType.OWNER]: "author",
  [BrowseFilterType.PERFORMANCE_AVAILABILITY]: "performance",
  [BrowseFilterType.RECENT_PERFORMANCE]: "performance",
  [BrowseFilterType.LOOP_TYPE]: "loop",
  [BrowseFilterType.TND_FAMILY]: "family",
  [BrowseFilterType.MAX_TURN_INTENSITY]: "max_turn_intensity",
  [BrowseFilterType.COLLECTION]: "collection",
};
