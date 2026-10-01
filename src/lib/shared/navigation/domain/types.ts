/**
 * Navigation Domain Types
 *
 * Core types for the navigation system.
 * This is the canonical source for ModuleId, TabId, and related navigation types.
 */

import type { TranslationKey } from "../../i18n/i18n-types.js";

/**
 * Metadata for tabs that controls behavior-based filtering
 * Rather than hardcoding tab IDs in business logic, mark tabs with semantic metadata
 */
export interface SectionMetadata {
  /** Tab is a creation entry point (assemble, construct, generate, spell) */
  isCreationMethod?: boolean;
}

/**
 * Tab within a module
 * Represents a navigation tab within a specific module (e.g., "Construct" tab in Create module)
 */
export interface Section {
  id: string;
  labelKey: TranslationKey;
  descKey: TranslationKey;
  label: string;
  icon: string;
  description?: string;
  color?: string;
  gradient?: string;
  disabled?: boolean;
  metadata?: SectionMetadata;
  /** Optional grouping key. When a module defines `groups`, sections sharing a
   *  groupId render under a collapsible group header in the desktop sidebar. */
  groupId?: string;
}

/** Static copy for a module landing surface. Routing still treats the landing
 * as `/module`, never as a synthetic tab. */
export interface ModuleHomeDefinition {
  label: string;
  optionLabel?: string;
  ariaLabel?: string;
  description?: string;
  icon?: string;
}

/** A module landing surface prepared for the active navigation chrome. */
export interface SectionHomeDestination extends ModuleHomeDefinition {
  icon: string;
  color?: string;
  gradient?: string;
  active: boolean;
}

/**
 * Section Group
 * A collapsible cluster of sections within a single module's sidebar.
 * Purely a render-time grouping — routing/activeTab remain flat.
 */
export interface SectionGroup {
  id: string;
  labelKey: TranslationKey;
  label: string;
  icon: string;
  color?: string;
}

// Module-based navigation types
// Should match MODULE_DEFINITIONS in navigation-state.svelte.ts
export type ModuleId =
  | "create"
  | "browse"
  | "creators" // Creator directory and public profiles
  | "learn"
  | "tika" // Tika AI tutor (TKA Intelligent Knowledge Assistant)
  | "premium"
  | "compose"
  | "post"
  | "train"
  | "choreo_card" // Choreography reference cards (printable)
  | "word_card" // Legacy alias for choreo_card
  | "choreo" // Choreo sheet builder (route renamed from "write" Jul 2026; dir stays features/write)
  | "feedback"
  | "admin"
  | "settings"
  | "moderation" // Content moderation (admin)
  | "arena" // Community pairwise ranking
  | "festivals" // Festival Hub - discover and apply to flow festivals
  | "museum" // The Archive - walkable museum with 2D/3D flip
  | "personal-museum" // User's private museum - saved sequences hung on the walls
  | "retro" // Retro module: TKA-OS desktop, ASCII pictograph, pixel pictograph
  | "levels" // Level progression labs: L4-L7 + Poi
  | "hand-paths" // Hand path explorer and builder (graduated from Lab Mar 2026)
  | "video" // Video analysis, trails, effects, notation extraction (graduated from Lab Mar 2026)
  | "social" // Community map + nearby spinner sync
  | "lab" // Experimental features lab (all experiments consolidated here)
  | "stage" // Stage choreography - multi-performer formation locomotion
  | "mandala" // Mandala creation, collection, meditation, and export
  | "toys" // User-facing interactive toys (first toy: Shape Matrix explorer)
  | "shop"; // Plain link-out to /shop (Choreo Cards store) — never boots the module shell, see `linkHref`

/**
 * Module Definition
 * Represents a top-level module with its sections
 */
export interface ModuleDefinition {
  id: ModuleId;
  labelKey: TranslationKey;
  descKey: TranslationKey;
  label: string;
  icon: string;
  color?: string;
  description?: string;
  isMain: boolean;
  sections: Section[];
  /** Optional `/module` landing destination shown above the module's tabs. */
  home?: ModuleHomeDefinition;
  /** Optional collapsible group definitions. When present, the desktop sidebar
   *  renders this module's sections clustered under group headers (sections are
   *  matched by their `groupId`). Absent → flat list (default). */
  groups?: SectionGroup[];
  disabled?: boolean;
  disabledMessage?: string;
  adminOnly?: boolean;
  /** When set, this entry renders as a plain `<a href={linkHref}>` in the module
   *  grid instead of a module-select button — it navigates away rather than
   *  activating a module. Used for link-out entries (e.g. Shop) that must never
   *  boot the app shell's module renderer. */
  linkHref?: string;
}

export interface ModuleSelectorState {
  isOpen: boolean;
  showDiscoveryHint: boolean;
}

/**
 * Legacy tab IDs (for backwards compatibility during migration)
 * Maps old tab names to module concepts
 */
export type LegacyTabId =
  | "construct" // Legacy ID that maps to "build" module
  | "browse" // Legacy ID for browse/browse
  | "word-card" // Legacy hyphenated version (now choreo_card)
  | "word_card" // Legacy underscore version (now choreo_card)
  | "choreo-card" // Legacy hyphenated version of choreo_card
  | "about" // About page (not a proper module)
  | "animator"; // Animator feature

/**
 * All possible tab/module IDs (includes both new ModuleId and legacy IDs)
 * @deprecated Prefer using ModuleId for new code
 */
export type TabId = ModuleId | LegacyTabId;
