import type {
  LibraryCollection,
  SmartFilterSpec,
} from "#lib/shared/library/domain/models/collection.js";

export const COMMUNITY_RULE: SmartFilterSpec = {
  source: "community",
  filters: [
    {
      key: "difficulty",
      type: "difficulty",
      value: 1,
      label: "Level 1",
      chipColor: "#36c3ff",
    },
    {
      key: "length",
      type: "length",
      value: 8,
      label: "8 steps",
      chipColor: "#f59e0b",
    },
    {
      key: "cap_type:component:mirrored",
      type: "cap_type",
      value: "component:mirrored",
      label: "Mirrored",
      chipColor: "#a970ff",
    },
  ],
  sortMethod: "alphabetical",
  sortDirection: "asc",
};

export const DENSE_COMMUNITY_RULE: SmartFilterSpec = {
  source: "community",
  filters: [
    {
      key: "difficulty",
      type: "difficulty",
      value: 2,
      label: "Level 2",
      chipColor: "#36c3ff",
    },
  ],
  sortMethod: "alphabetical",
  sortDirection: "asc",
};

export const LIBRARY_RULE: SmartFilterSpec = {
  source: "my-library",
  filters: [
    {
      key: "favorites",
      type: "favorites",
      value: true,
      label: "Favorites",
      chipColor: "#ec4899",
    },
    {
      key: "max_turn_intensity",
      type: "max_turn_intensity",
      value: 2,
      label: "No more than 2 turns in any motion",
      chipColor: "#22c55e",
    },
  ],
  sortMethod: "date",
  sortDirection: "desc",
};

export const PERSONAL_CARD: LibraryCollection = {
  id: "smart-personal-preview",
  name: "Level 1 practice",
  description: "Sequences for the next practice session",
  ownerId: "preview-user",
  sequenceIds: [],
  sequenceCount: 127,
  color: "#8b6cff",
  icon: "fa-wand-magic-sparkles",
  isPublic: false,
  sortOrder: 0,
  kind: "smart",
  filterSpec: COMMUNITY_RULE,
  createdAt: new Date(2026, 6, 30),
  updatedAt: new Date(2026, 6, 30),
};

export const BUILT_IN_CARD: LibraryCollection = {
  ...PERSONAL_CARD,
  id: "founding-preview",
  name: "TKA Core Level 1",
  description: "Maintained by TKA",
  sequenceCount: 48,
  color: "#36c3ff",
  systemType: "founding",
};
