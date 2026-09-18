/**
 * Module Definitions
 *
 * Defines all application modules with their metadata.
 * Separated from state management for cleaner architecture.
 */

import type { ModuleDefinition, ModuleId } from "../domain/types";
import {
  CREATE_TABS,
  LEARN_TABS,
  BROWSE_TABS,
  COMPOSE_TABS,
  TRAIN_TABS,
  FEEDBACK_TABS,
  ADMIN_TABS,
  SETTINGS_TABS,
  LAB_TABS,
  LAB_GROUPS,
  ARENA_TABS,
  CHOREO_CARD_TABS,
  CHOREO_CARD_SCAN_ATLAS_TAB_ID,
  FESTIVAL_TABS,
  RETRO_TABS,
  LEVELS_TABS,
  HAND_PATH_TABS,
  VIDEO_TABS,
  SOCIAL_TABS,
  STAGE_TABS,
  TOYS_TABS,
} from "./tab-definitions";

/**
 * Migration map for renamed module IDs.
 * Maps old (invalid) module IDs to their current canonical form.
 * Used to handle stale data from localStorage/Firestore.
 */
const MODULE_ID_MIGRATIONS: Record<string, ModuleId> = {
  write: "choreo", // Module id + route renamed write -> choreo (Jul 2026); dir stays features/write internally
  TIKA: "tika", // Module renamed back to lowercase for cleaner URLs
  discover: "browse", // Module renamed from Discover to Browse (Jan 2026)
  explore: "browse", // Module renamed from Explore to Browse (Jan 2026)
  dashboard: "create", // Dashboard removed - Create is now the default landing (Jan 2026)
  // Experimental modules consolidated into Lab (Jan 2026), then graduated to Levels (Mar 2026)
  skewlab: "levels",
  "poi-lab": "levels",
  // Museum renamed from museum-2d to museum (Mar 2026)
  "museum-2d": "museum",
  // Realm module dissolved (Apr 2026) - deep links redirect to museum (the most
  // polished former destination). Campground + 3D Controls moved to Lab.
  realm: "museum",
  // Archive module deleted (Jun 2026) - it was a single-room Rapier-FPS prototype
  // of the walkable museum that the museum module superseded on a different engine.
  // Old /archive deep links redirect to museum (both are "The Kinetic Archive").
  archive: "museum",
  // Mandala graduated into Playground (2026-06-30); Playground/Art module
  // dissolved into the Library's Art shelf (2026-07-12) — old deep links land
  // on Browse, where the Library tab hosts the Art galleries.
  "mandala-generator": "browse",
  "mandala-collection": "browse",
  mandala: "browse",
  playground: "browse",
  "background-builder": "lab",
  "landing-preview": "lab",
  // ml-training removed (Mar 2026)
  community: "social",
  connect: "social",
  // Moderation folded into Admin as a tab (2026-06-30) — lands on Admin;
  // navigation-state deep-link handling routes the "moderation" section.
  moderation: "admin",
  // Watch retired (Aug 2026). Performances live on their sequence in Browse.
  watch: "browse",
};

/**
 * Normalize a module ID from potentially stale persisted data.
 * Returns the canonical module ID if valid, or undefined if unknown.
 */
export function normalizeModuleId(rawModuleId: string): ModuleId | undefined {
  // Check if it's a known migration
  const migrated = MODULE_ID_MIGRATIONS[rawModuleId];
  if (migrated) {
    return migrated;
  }

  // Check if it's already a valid module ID
  const isValid = MODULE_DEFINITIONS.some((m) => m.id === rawModuleId);
  if (isValid) {
    return rawModuleId as ModuleId;
  }

  return undefined;
}

const SECTION_ID_MIGRATIONS: Readonly<
  Record<string, Readonly<Record<string, string>>>
> = {
  choreo_card: {
    "scan-activity": CHOREO_CARD_SCAN_ATLAS_TAB_ID,
  },
};

/** Keep bookmarks and persisted navigation valid when a tab gets a clearer name. */
export function normalizeSectionId(
  moduleId: string,
  rawSectionId: string | null | undefined
): string | undefined {
  if (!rawSectionId) return undefined;
  return SECTION_ID_MIGRATIONS[moduleId]?.[rawSectionId] ?? rawSectionId;
}

/** Sections that moved to another module. Old links open what the tab became. */
const SECTION_MODULE_MIGRATIONS: Readonly<
  Record<
    string,
    Readonly<Record<string, { moduleId: ModuleId; sectionId: string }>>
  >
> = {
  // Shape Engine graduated from Toys to the Create module's Shape tab (2026-09-18)
  toys: {
    "shape-matrix": { moduleId: "create", sectionId: "shape-engine" },
  },
};

/**
 * Resolve a module/section pair from a URL or history entry to where it lives
 * now: follows cross-module moves first, then same-module renames.
 */
export function normalizeNavigationTarget(
  moduleId: ModuleId,
  rawSectionId: string | null | undefined
): { moduleId: ModuleId; sectionId: string | undefined } {
  const moved = rawSectionId
    ? SECTION_MODULE_MIGRATIONS[moduleId]?.[rawSectionId]
    : undefined;
  if (moved) return moved;
  return { moduleId, sectionId: normalizeSectionId(moduleId, rawSectionId) };
}

// Module definitions for the new navigation system
// NOTE: Dashboard removed - it was a redundant launcher. Create is now the default landing.
export const MODULE_DEFINITIONS: ModuleDefinition[] = [
  {
    id: "create",
    labelKey: "module_create",
    descKey: "module_desc_create",
    label: "Create",
    icon: '<i class="fas fa-tools" style="color: #f59e0b;" aria-hidden="true"></i>',
    color: "#f59e0b", // Amber - construction/creation
    description: "Construct and generate sequences",
    isMain: true,
    sections: CREATE_TABS,
    home: {
      label: "Create",
      optionLabel: "All methods",
      ariaLabel: "All creation methods",
      description: "Choose how you want to build your next sequence.",
      icon: '<i class="fas fa-border-all" aria-hidden="true"></i>',
    },
  },
  {
    id: "browse",
    labelKey: "module_browse",
    descKey: "module_desc_browse",
    label: "Browse",
    icon: '<i class="fas fa-compass" style="color: #a855f7;" aria-hidden="true"></i>',
    color: "#a855f7", // Purple - browsing
    description: "Browse sequences and collections",
    isMain: true,
    sections: BROWSE_TABS,
  },
  {
    id: "creators",
    labelKey: "module_creators",
    descKey: "module_desc_creators",
    label: "Creators",
    icon: '<i class="fas fa-users" style="color: #06b6d4;" aria-hidden="true"></i>',
    color: "#06b6d4",
    description: "Find creators and their work",
    isMain: true,
    sections: [],
  },
  {
    id: "social",
    labelKey: "module_social",
    descKey: "module_desc_social",
    label: "Social",
    icon: '<i class="fas fa-users" style="color: #14b8a6;" aria-hidden="true"></i>',
    color: "#14b8a6",
    description: "Community map and nearby spinner sync",
    isMain: true,
    sections: SOCIAL_TABS,
  },
  {
    id: "learn",
    labelKey: "module_learn",
    descKey: "module_desc_learn",
    label: "Learn",
    icon: '<i class="fas fa-graduation-cap" style="color: #3b82f6;" aria-hidden="true"></i>',
    color: "#3b82f6", // Blue - education/knowledge
    description: "Study and practice TKA",
    isMain: true,
    sections: LEARN_TABS,
  },
  {
    id: "tika",
    labelKey: "module_tika",
    descKey: "module_desc_tika",
    label: "Tika",
    icon: '<i class="fas fa-brain" style="color: #6366f1;" aria-hidden="true"></i>',
    color: "#6366f1", // Indigo - AI/assistant
    description: "AI tutor for learning TKA",
    isMain: true,
    sections: [], // Single-tab module
  },
  {
    id: "premium",
    labelKey: "module_premium",
    descKey: "module_desc_premium",
    label: "Go Premium",
    icon: '<i class="fas fa-crown" style="color: #fbbf24;" aria-hidden="true"></i>',
    color: "#fbbf24", // Gold - premium/upgrade
    description: "Support TKA and unlock premium features",
    isMain: true, // Visibility controlled by getModuleDefinitions() - only shown to non-premium users
    sections: [], // Single-tab module - no sub-tabs
  },
  {
    id: "compose",
    labelKey: "module_compose",
    descKey: "module_desc_compose",
    label: "Compose",
    icon: '<i class="fas fa-photo-film" style="color: #ec4899;" aria-hidden="true"></i>',
    color: "#ec4899", // Pink - composition/choreography
    description: "Compose sequences into animations",
    isMain: true,
    sections: COMPOSE_TABS, // TODO: Rename to COMPOSE_TABS
  },
  // Playground/Art module dissolved 2026-07-12: the tunnel/scene/mandala
  // galleries now mount inside the Library's Art shelf detail pane
  // (MyCollectionsPanel). PLAYGROUND_TABS survives as their metadata source.
  {
    id: "arena",
    labelKey: "module_arena",
    descKey: "module_desc_arena",
    label: "Arena",
    icon: '<i class="fas fa-trophy" style="color: #e11d48;" aria-hidden="true"></i>',
    color: "#e11d48", // Rose - competition
    description: "Vote on head-to-head sequence matchups",
    isMain: true,
    sections: ARENA_TABS,
  },
  {
    id: "train",
    labelKey: "module_train",
    descKey: "module_desc_train",
    label: "Train",
    icon: '<i class="fas fa-running" style="color: #ef4444;" aria-hidden="true"></i>',
    color: "#ef4444", // Red - action/training
    description: "Practice with real-time scoring",
    isMain: true,
    sections: TRAIN_TABS,
  },
  {
    id: "toys",
    labelKey: "module_toys",
    descKey: "module_desc_toys",
    label: "Toys",
    icon: '<i class="fas fa-shapes" style="color: #2dd4bf;" aria-hidden="true"></i>',
    color: "#2dd4bf", // Teal - playful exploration
    description: "Interactive toys for exploring flow arts ideas",
    isMain: true,
    sections: TOYS_TABS,
  },
  {
    id: "shop",
    labelKey: "module_shop",
    descKey: "module_desc_shop",
    label: "Shop",
    icon: '<i class="fas fa-store" style="color: #10b981;" aria-hidden="true"></i>',
    color: "#10b981", // Emerald - storefront
    description: "Physical Choreo Cards decks",
    isMain: true,
    sections: [],
    linkHref: "/shop", // Plain navigation only — never boots the module shell (see linkHref doc)
  },
  // REMOVED: Library module - functionality now integrated into Browse > Gallery via scope toggle
  // Removed: inbox module (Messages/notifications accessible via Dashboard widget drawer)
  // Removed: account module (merged into Dashboard - profile widget handles auth)
  // Removed: edit module (Edit functionality is now a slide-out panel accessible from Create and Sequence Viewer)
  // Removed: about module (content moved to Dashboard > Support widget)
  {
    id: "choreo_card",
    labelKey: "module_choreo_card",
    descKey: "module_desc_choreo_card",
    label: "Choreo Cards",
    icon: '<i class="fas fa-id-card" style="color: #6366f1;" aria-hidden="true"></i>',
    color: "#6366f1", // Indigo - flashcards/learning
    description: "Browse choreography as printable reference cards",
    isMain: true,
    sections: CHOREO_CARD_TABS,
    adminOnly: true, // Operator-only: deck releaser is an admin tool
  },
  {
    id: "choreo",
    labelKey: "module_write",
    descKey: "module_desc_write",
    label: "Choreo",
    icon: '<i class="fas fa-pen-nib" style="color: #f43f5e;" aria-hidden="true"></i>',
    color: "#f43f5e", // Rose - creative writing/composition
    description: "Build a printable choreography sheet",
    isMain: true,
    sections: [], // Single-tab module
  },
  {
    id: "feedback",
    labelKey: "module_feedback",
    descKey: "module_desc_feedback",
    label: "Feedback",
    icon: '<i class="fas fa-comment-dots" style="color: #14b8a6;" aria-hidden="true"></i>',
    color: "#14b8a6", // Teal - feedback/communication
    description: "Submit and manage feedback",
    isMain: true, // Visibility controlled by getModuleDefinitions() based on tester status
    sections: FEEDBACK_TABS,
  },
  // Moderation folded into Admin as a tab (2026-06-30) — see ADMIN_TABS
  // "moderation" section. Old deep links redirect via MODULE_ID_MIGRATIONS.
  // ml-training module consolidated into Lab (Feb 2026)
  {
    id: "admin",
    labelKey: "module_admin",
    descKey: "module_desc_admin",
    label: "Admin",
    icon: '<i class="fas fa-crown" style="color: #ffd700;" aria-hidden="true"></i>',
    color: "#ffd700", // Gold - admin/privileged
    description: "System management & configuration",
    isMain: true,
    sections: ADMIN_TABS,
    adminOnly: true,
  },
  {
    id: "festivals",
    labelKey: "module_festivals",
    descKey: "module_desc_festivals",
    label: "Festivals",
    icon: '<i class="fas fa-fire" style="color: #f97316;" aria-hidden="true"></i>',
    color: "#f97316",
    description: "Discover and apply to flow festivals",
    isMain: true,
    sections: FESTIVAL_TABS,
  },
  {
    id: "museum",
    labelKey: "module_museum",
    descKey: "module_desc_museum",
    label: "Museum",
    icon: '<i class="fas fa-landmark" style="color: #f59e0b;" aria-hidden="true"></i>',
    color: "#f59e0b",
    description: "Explore The Kinetic Archive - walk the museum, flip into 3D",
    isMain: true,
    sections: [],
  },
  {
    id: "personal-museum",
    labelKey: "module_museum",
    descKey: "module_desc_museum",
    label: "My Museum",
    icon: '<i class="fas fa-images" style="color: #f59e0b;" aria-hidden="true"></i>',
    color: "#f59e0b",
    description: "Your saved sequences hung on the walls of a private gallery",
    isMain: true,
    sections: [],
  },
  {
    id: "retro",
    labelKey: "module_retro",
    descKey: "module_desc_retro",
    label: "Retro",
    icon: '<i class="fas fa-desktop" style="color: #008080;" aria-hidden="true"></i>',
    color: "#008080",
    description: "1989 DOS terminal, 1995 Win95 desktop, pictograph timeline",
    isMain: true,
    sections: RETRO_TABS,
  },
  {
    id: "levels",
    labelKey: "module_levels",
    descKey: "module_desc_levels",
    label: "Levels",
    icon: '<i class="fas fa-layer-group" style="color: #8b5cf6;" aria-hidden="true"></i>',
    color: "#8b5cf6",
    description: "Level 4-7 position labs and poi constraints",
    isMain: true,
    sections: LEVELS_TABS,
  },
  {
    id: "hand-paths",
    labelKey: "module_hand_paths",
    descKey: "module_desc_hand_paths",
    label: "Hand Paths",
    icon: '<i class="fas fa-route" style="color: #10b981;" aria-hidden="true"></i>',
    color: "#10b981",
    description: "Browse and build spatial hand paths",
    isMain: true,
    sections: HAND_PATH_TABS,
  },
  {
    id: "video",
    labelKey: "module_video",
    descKey: "module_desc_video",
    label: "Video",
    icon: '<i class="fas fa-film" style="color: #f43f5e;" aria-hidden="true"></i>',
    color: "#f43f5e",
    description: "Video analysis, trails, effects, and notation extraction",
    isMain: true,
    sections: VIDEO_TABS,
  },
  {
    id: "stage",
    labelKey: "module_stage",
    descKey: "module_desc_stage",
    label: "3D Studio",
    icon: '<i class="fas fa-cubes" style="color: #06b6d4;" aria-hidden="true"></i>',
    color: "#06b6d4",
    description: "Build, choreograph, save, and export in 3D",
    isMain: true,
    sections: STAGE_TABS,
  },
  {
    id: "lab",
    labelKey: "module_lab",
    descKey: "module_desc_lab",
    label: "Lab",
    icon: '<i class="fas fa-flask" style="color: #10b981;" aria-hidden="true"></i>',
    color: "#10b981", // Emerald - experimental
    description: "Temporary experiments and UI prototypes",
    isMain: true,
    sections: LAB_TABS,
    groups: LAB_GROUPS,
    adminOnly: true,
  },
  {
    id: "settings",
    labelKey: "module_settings",
    descKey: "module_desc_settings",
    label: "Settings",
    icon: '<i class="fas fa-cog" style="color: #64748b;" aria-hidden="true"></i>',
    color: "#64748b", // Slate - neutral settings color
    description: "Configure app preferences",
    isMain: false, // Settings is in sidebar footer, not main module list
    sections: SETTINGS_TABS, // Profile, Props, Background, Visibility, Misc, AI tabs
  },
  // REMOVED: Standalone 3D modules (now unified under Realm)
  // - infinite-worlds → Now accessible via Realm destination picker
  // - museum → Now accessible via Realm destination picker (Gallery destination)
  // - gallery3d → Retired, merged into Gallery destination
  // - 3d-viewer → Retired, merged into 3D Studio
];

const FEATURE_ENABLED: Record<string, boolean> = {
  create: true,
  browse: true,
  creators: true,
  feedback: true,
  social: typeof __FEATURE_SOCIAL__ !== "undefined" ? __FEATURE_SOCIAL__ : true,
  learn: typeof __FEATURE_LEARN__ !== "undefined" ? __FEATURE_LEARN__ : true,
  tika: typeof __FEATURE_TIKA__ !== "undefined" ? __FEATURE_TIKA__ : true,
  premium:
    typeof __FEATURE_PREMIUM__ !== "undefined" ? __FEATURE_PREMIUM__ : true,
  compose:
    typeof __FEATURE_COMPOSE__ !== "undefined" ? __FEATURE_COMPOSE__ : true,
  arena: typeof __FEATURE_ARENA__ !== "undefined" ? __FEATURE_ARENA__ : true,
  train: typeof __FEATURE_TRAIN__ !== "undefined" ? __FEATURE_TRAIN__ : true,
  choreo_card:
    typeof __FEATURE_CHOREO_CARD__ !== "undefined"
      ? __FEATURE_CHOREO_CARD__
      : true,
  choreo: typeof __FEATURE_WRITE__ !== "undefined" ? __FEATURE_WRITE__ : true,
  admin: typeof __FEATURE_ADMIN__ !== "undefined" ? __FEATURE_ADMIN__ : true,
  festivals:
    typeof __FEATURE_FESTIVALS__ !== "undefined" ? __FEATURE_FESTIVALS__ : true,
  museum: typeof __FEATURE_MUSEUM__ !== "undefined" ? __FEATURE_MUSEUM__ : true,
  archive:
    typeof __FEATURE_ARCHIVE__ !== "undefined" ? __FEATURE_ARCHIVE__ : true,
  retro: typeof __FEATURE_RETRO__ !== "undefined" ? __FEATURE_RETRO__ : true,
  levels: typeof __FEATURE_LEVELS__ !== "undefined" ? __FEATURE_LEVELS__ : true,
  "hand-paths":
    typeof __FEATURE_HAND_PATHS__ !== "undefined"
      ? __FEATURE_HAND_PATHS__
      : true,
  video: typeof __FEATURE_VIDEO__ !== "undefined" ? __FEATURE_VIDEO__ : true,
  stage: typeof __FEATURE_STAGE__ !== "undefined" ? __FEATURE_STAGE__ : true,
  mandala:
    typeof __FEATURE_MANDALA__ !== "undefined" ? __FEATURE_MANDALA__ : true,
  shop: true,
  lab: typeof __FEATURE_LAB__ !== "undefined" ? __FEATURE_LAB__ : true,
  settings:
    typeof __FEATURE_SETTINGS__ !== "undefined" ? __FEATURE_SETTINGS__ : true,
};

export const ENABLED_MODULE_DEFINITIONS = MODULE_DEFINITIONS.filter(
  (m) => FEATURE_ENABLED[m.id] !== false
);
