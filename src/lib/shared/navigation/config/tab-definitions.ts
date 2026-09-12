/**
 * Tab Configuration Definitions
 *
 * Pure data definitions for all module tabs.
 * Separated from state management for cleaner architecture.
 */

import type { Section, SectionGroup } from "../domain/types";

// Create tabs configuration - mutable to allow dynamic tab accessibility updates
// Note: Edit functionality is now handled via a slide-out panel, not a tab
// Note: Animate is now a Play button in the button panel with inline animator
// Note: Record removed (not implemented yet, users will use native camera apps)

// Valid backing tab while the generic /create front door is visible. Direct
// mode routes still select their requested tab explicitly.
export const DEFAULT_CREATE_TAB = "construct";

export const CREATE_TABS: Section[] = [
  {
    id: "assemble",
    labelKey: "tab_create_assemble",
    descKey: "tab_desc_create_assemble",
    label: "Assemble",
    icon: '<i class="fas fa-puzzle-piece" aria-hidden="true"></i>',
    description: "Build a sequence by choosing grid points directly.",
    color: "#06b6d4",
    gradient: "linear-gradient(135deg, #22d3ee 0%, #06b6d4 100%)",
    metadata: { isCreationMethod: true },
  },
  {
    id: "construct",
    labelKey: "tab_create_construct",
    descKey: "tab_desc_create_construct",
    label: "Construct",
    icon: '<i class="fas fa-hammer" aria-hidden="true"></i>',
    description:
      "Build a sequence one pictograph at a time, with every option available.",
    color: "#3b82f6",
    gradient: "linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%)",
    metadata: { isCreationMethod: true },
  },
  {
    id: "generate",
    labelKey: "tab_create_generate",
    descKey: "tab_desc_create_generate",
    label: "Generate",
    icon: '<i class="fas fa-wand-magic-sparkles" aria-hidden="true"></i>',
    description: "Set a few rules and let the app create a sequence for you.",
    color: "#f59e0b",
    gradient: "linear-gradient(135deg, #fbbf24 0%, #f59e0b 50%, #f97316 100%)",
    metadata: { isCreationMethod: true },
  },
  {
    id: "fuse",
    labelKey: "tab_create_fuse",
    descKey: "tab_desc_create_fuse",
    label: "Fuse",
    icon: '<i class="fas fa-fire" aria-hidden="true"></i>',
    description: "Choose two sequences and combine them into one.",
    color: "#f97316",
    gradient: "linear-gradient(135deg, #fb923c 0%, #f97316 50%, #ea580c 100%)",
    metadata: { isCreationMethod: true },
  },
  {
    id: "tunnel",
    labelKey: "tab_create_tunnel",
    descKey: "tab_desc_create_tunnel",
    label: "Tunnel",
    icon: '<i class="fas fa-people-arrows-left-right" aria-hidden="true"></i>',
    description: "Arrange complete sequences for multiple performers.",
    color: "#a78bfa",
    gradient: "linear-gradient(135deg, #67e8f9 0%, #a78bfa 100%)",
    metadata: { isCreationMethod: true },
  },
  // REMOVED: Spell tab unified into Generate tab as "Spell" mode (Feb 2026)
  // Spell functionality accessible via Generate tab's Freeform/Spell mode toggle
];

// Learn tabs configuration
// Note: TIKA moved to standalone module (src/lib/features/tika/)
export const LEARN_TABS: Section[] = [
  {
    id: "concepts",
    labelKey: "tab_learn_concepts",
    descKey: "tab_desc_learn_concepts",
    label: "Lessons",
    icon: '<i class="fas fa-lightbulb" aria-hidden="true"></i>',
    description: "Interactive lessons that build on each other",
    color: "#60a5fa",
    gradient: "linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%)",
  },
  {
    id: "play",
    labelKey: "tab_learn_play",
    descKey: "tab_desc_learn_play",
    label: "Play",
    icon: '<i class="fas fa-gamepad" aria-hidden="true"></i>',
    description: "Fun games to test your pictograph skills",
    color: "#f472b6",
    gradient: "linear-gradient(135deg, #f472b6 0%, #ec4899 100%)",
  },
  {
    id: "guide",
    labelKey: "tab_learn_guide",
    descKey: "tab_desc_learn_guide",
    label: "Read",
    icon: '<i class="fas fa-book" aria-hidden="true"></i>',
    description: "The written Guide and printable pages",
    color: "#10b981",
    gradient: "linear-gradient(135deg, #34d399 0%, #10b981 100%)",
  },
];

// Browse has two stable jobs. Its inner route owner handles content types,
// details, and all compatibility vocabulary beneath these primary tabs.
export const BROWSE_TABS: Section[] = [
  {
    id: "explore",
    labelKey: "tab_browse_explore",
    descKey: "tab_desc_browse_explore",
    label: "Explore",
    icon: '<i class="fas fa-compass" aria-hidden="true"></i>',
    description: "Discover sequences and public collections",
    color: "#a855f7",
    gradient: "linear-gradient(135deg, #c084fc 0%, #a855f7 100%)",
  },
  {
    id: "you",
    labelKey: "tab_browse_you",
    descKey: "tab_desc_browse_you",
    label: "You",
    icon: '<i class="fas fa-user" aria-hidden="true"></i>',
    description: "Your sequences, visuals, videos, and collections",
    color: "#c084fc",
    gradient: "linear-gradient(135deg, #d8b4fe 0%, #c084fc 100%)",
  },
];

/**
 * @deprecated Library module removed - functionality now in Browse > Gallery via scope toggle.
 * Kept for backwards compatibility only.
 */
export const LIBRARY_TABS: Section[] = [];

/**
 * @deprecated Explore module renamed to Browse (Jan 2026).
 * Kept for backwards compatibility only.
 */
export const EXPLORE_TABS = BROWSE_TABS;

// Inbox tabs configuration - Messages and notifications
export const INBOX_TABS: Section[] = [
  {
    id: "messages",
    labelKey: "tab_inbox_messages",
    descKey: "tab_desc_inbox_messages",
    label: "Messages",
    icon: '<i class="fas fa-envelope" aria-hidden="true"></i>',
    description: "Conversations with other users",
    color: "#3b82f6",
    gradient: "linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%)",
  },
  {
    id: "notifications",
    labelKey: "tab_inbox_notifications",
    descKey: "tab_desc_inbox_notifications",
    label: "Notifications",
    icon: '<i class="fas fa-bell" aria-hidden="true"></i>',
    description: "System alerts and updates",
    color: "#f59e0b",
    gradient: "linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)",
  },
];

// Community tabs configuration
export const COMMUNITY_TABS: Section[] = [
  {
    id: "creators",
    labelKey: "tab_community_creators",
    descKey: "tab_desc_community_creators",
    label: "Creators",
    icon: '<i class="fas fa-users" aria-hidden="true"></i>',
    description: "Find creators and their work",
    color: "#06b6d4",
    gradient: "linear-gradient(135deg, #22d3ee 0%, #06b6d4 100%)",
  },
  {
    id: "support",
    labelKey: "tab_community_support",
    descKey: "tab_desc_community_support",
    label: "Support",
    icon: '<i class="fas fa-heart" aria-hidden="true"></i>',
    description: "Support TKA development",
    color: "#ec4899",
    gradient: "linear-gradient(135deg, #f472b6 0%, #ec4899 100%)",
  },
];

/**
 * @deprecated Collect and Library modules removed - functionality now in Browse > Gallery.
 */
export const COLLECT_TABS: Section[] = [];

// Legacy exports for backwards compatibility during migration
export const BUILD_TABS = CREATE_TABS; // Legacy name
export const COLLECTION_TABS = LIBRARY_TABS; // Legacy name

// Compose module tabs configuration
// Arrange (mode selection + sequence config) | Browse (saved compositions) | Timeline (DAW-style editor)
// Note: Playback is an overlay, not a tab - triggered from Arrange or Browse
export const COMPOSE_TABS: Section[] = [
  {
    id: "arrange",
    labelKey: "tab_compose_arrange",
    descKey: "tab_desc_compose_arrange",
    label: "Arrange",
    icon: '<i class="fas fa-layer-group" aria-hidden="true"></i>',
    description: "Arrange sequences into compositions",
    color: "#3b82f6",
    gradient: "linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%)",
  },
  {
    id: "browse",
    labelKey: "tab_compose_browse",
    descKey: "tab_desc_compose_browse",
    label: "Browse",
    icon: '<i class="fas fa-film" aria-hidden="true"></i>',
    description: "Browse saved compositions",
    color: "#8b5cf6",
    gradient: "linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%)",
  },
  {
    id: "timeline",
    labelKey: "tab_compose_timeline",
    descKey: "tab_desc_compose_timeline",
    label: "Timeline",
    icon: '<i class="fas fa-timeline" aria-hidden="true"></i>',
    description: "DAW-style timeline editor for precise clip arrangement",
    color: "#f59e0b",
    gradient: "linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)",
  },
];

// Train tabs configuration
export const TRAIN_TABS: Section[] = [
  {
    id: "practice",
    labelKey: "tab_train_practice",
    descKey: "tab_desc_train_practice",
    label: "Practice",
    icon: '<i class="fas fa-dumbbell" aria-hidden="true"></i>',
    description: "Free practice with adaptive, step, and timed modes",
    color: "#3b82f6",
  },
  {
    id: "progress",
    labelKey: "tab_train_progress",
    descKey: "tab_desc_train_progress",
    label: "Progress",
    icon: '<i class="fas fa-chart-line" aria-hidden="true"></i>',
    description: "View stats and performance history",
    color: "#8b5cf6",
  },
];

// About - single page module (no sub-tabs)
export const ABOUT_TABS: Section[] = [];

// Account tabs configuration (personal account management)
export const ACCOUNT_TABS: Section[] = [
  {
    id: "overview",
    labelKey: "tab_account_overview",
    descKey: "tab_desc_account_overview",
    label: "Overview",
    icon: '<i class="fas fa-user" aria-hidden="true"></i>',
    description: "Profile info, stats, and achievements",
    color: "#6366f1",
    gradient: "linear-gradient(135deg, #818cf8 0%, #6366f1 100%)",
  },
  {
    id: "library",
    labelKey: "tab_account_library",
    descKey: "tab_desc_account_library",
    label: "Library",
    icon: '<i class="fas fa-book" aria-hidden="true"></i>',
    description: "Your sequences, favorites, and collections",
    color: "#0891b2",
    gradient: "linear-gradient(135deg, #22d3ee 0%, #0891b2 100%)",
  },
  {
    id: "preferences",
    labelKey: "tab_account_preferences",
    descKey: "tab_desc_account_preferences",
    label: "Preferences",
    icon: '<i class="fas fa-sliders-h" aria-hidden="true"></i>',
    description: "App settings and customization",
    color: "#64748b",
    gradient: "linear-gradient(135deg, #94a3b8 0%, #64748b 100%)",
  },
  {
    id: "security",
    labelKey: "tab_account_security",
    descKey: "tab_desc_account_security",
    label: "Security",
    icon: '<i class="fas fa-shield-alt" aria-hidden="true"></i>',
    description: "Sign in, accounts, and privacy",
    color: "#ef4444",
    gradient: "linear-gradient(135deg, #f87171 0%, #ef4444 100%)",
  },
];

/**
 * @deprecated Edit is no longer a navigation tab.
 * Edit functionality is now a slide-out panel accessible from Create and Sequence Viewer.
 * Kept for backwards compatibility.
 */
export const EDIT_TABS: Section[] = [];

// ML Training tabs configuration
export const ML_TRAINING_TABS: Section[] = [
  {
    id: "capture",
    labelKey: "tab_ml_training_capture",
    descKey: "tab_desc_ml_training_capture",
    label: "Capture",
    icon: '<i class="fas fa-video" aria-hidden="true"></i>',
    description: "Record prop training data",
    color: "#8b5cf6",
    gradient: "linear-gradient(135deg, #a78bfa 0%, #8b5cf6 100%)",
  },
  {
    id: "sessions",
    labelKey: "tab_ml_training_sessions",
    descKey: "tab_desc_ml_training_sessions",
    label: "Sessions",
    icon: '<i class="fas fa-folder-open" aria-hidden="true"></i>',
    description: "Manage captured sessions",
    color: "#3b82f6",
    gradient: "linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%)",
  },
];

// Admin tabs configuration
export const ADMIN_TABS: Section[] = [
  {
    id: "pulse",
    labelKey: "tab_admin_pulse",
    descKey: "tab_desc_admin_pulse",
    label: "Pulse",
    icon: '<i class="fas fa-wave-square" aria-hidden="true"></i>',
    description: "Live visitor activity and alerts",
    color: "#ec4899",
    gradient: "linear-gradient(135deg, #f472b6 0%, #ec4899 100%)",
  },
  {
    id: "users",
    labelKey: "tab_admin_users",
    descKey: "tab_desc_admin_users",
    label: "Users",
    icon: '<i class="fas fa-users" aria-hidden="true"></i>',
    description: "Manage users and view activity",
    color: "#22c55e",
    gradient: "linear-gradient(135deg, #4ade80 0%, #22c55e 100%)",
  },
  {
    id: "flags",
    labelKey: "tab_admin_flags",
    descKey: "tab_desc_admin_flags",
    label: "Flags",
    icon: '<i class="fas fa-flag" aria-hidden="true"></i>',
    description: "Manage feature flags and access control",
    color: "#8b5cf6",
    gradient: "linear-gradient(135deg, #a78bfa 0%, #8b5cf6 100%)",
  },
  {
    id: "announcements",
    labelKey: "tab_admin_announcements",
    descKey: "tab_desc_admin_announcements",
    label: "Announcements",
    icon: '<i class="fas fa-bullhorn" aria-hidden="true"></i>',
    description: "Create and manage system announcements",
    color: "#6366f1",
    gradient: "linear-gradient(135deg, #818cf8 0%, #6366f1 100%)",
  },
  {
    id: "moderation",
    labelKey: "tab_admin_moderation",
    descKey: "tab_desc_admin_moderation",
    label: "Moderation",
    icon: '<i class="fas fa-shield-halved" aria-hidden="true"></i>',
    description: "Review and manage user reports",
    color: "#ef4444",
    gradient: "linear-gradient(135deg, #f87171 0%, #ef4444 100%)",
  },
  {
    id: "publications",
    labelKey: "tab_admin_publications",
    descKey: "tab_desc_admin_publications",
    label: "Publications",
    icon: '<i class="fas fa-globe" aria-hidden="true"></i>',
    description: "Review visual artifacts submitted to Explore",
    color: "#06b6d4",
    gradient: "linear-gradient(135deg, #22d3ee 0%, #06b6d4 100%)",
  },
  {
    id: "seo",
    labelKey: "tab_admin_seo",
    descKey: "tab_desc_admin_seo",
    label: "SEO",
    icon: '<i class="fas fa-magnifying-glass" aria-hidden="true"></i>',
    description: "Search rank, indexing, and AI citation evidence",
    color: "#14b8a6",
    gradient: "linear-gradient(135deg, #2dd4bf 0%, #0f766e 100%)",
  },
  {
    id: "analytics",
    labelKey: "tab_admin_analytics",
    descKey: "tab_desc_admin_analytics",
    label: "Analytics",
    icon: '<i class="fas fa-chart-pie" aria-hidden="true"></i>',
    description: "Product analytics via PostHog",
    color: "#f97316",
    gradient: "linear-gradient(135deg, #fb923c 0%, #f97316 100%)",
  },
];

// Settings tabs configuration - shown in sidebar like other modules
export const SETTINGS_TABS: Section[] = [
  {
    id: "profile",
    labelKey: "tab_settings_profile",
    descKey: "tab_desc_settings_profile",
    label: "Account",
    icon: '<i class="fas fa-user" aria-hidden="true"></i>',
    description: "Identity, sign-in, and security",
    color: "#6366f1",
    gradient: "linear-gradient(135deg, #818cf8 0%, #6366f1 100%)",
  },
  {
    id: "release-notes",
    labelKey: "tab_settings_release_notes",
    descKey: "tab_desc_settings_release_notes",
    label: "Release Notes",
    icon: '<i class="fas fa-gift" aria-hidden="true"></i>',
    description: "Version history and release notes",
    color: "#8b5cf6",
    gradient: "linear-gradient(135deg, #a78bfa 0%, #8b5cf6 100%)",
  },
  {
    id: "props",
    labelKey: "tab_settings_props",
    descKey: "tab_desc_settings_props",
    label: "Props",
    icon: '<i class="fas fa-tags" aria-hidden="true"></i>',
    description: "Prop type preferences",
    color: "#ec4899",
    gradient: "linear-gradient(135deg, #f472b6 0%, #ec4899 100%)",
  },
  {
    id: "theme",
    labelKey: "tab_settings_theme",
    descKey: "tab_desc_settings_theme",
    label: "Theme",
    icon: '<i class="fas fa-palette" aria-hidden="true"></i>',
    description: "Theme and visual settings",
    color: "#06b6d4",
    gradient: "linear-gradient(135deg, #22d3ee 0%, #06b6d4 100%)",
  },
  {
    id: "notifications",
    labelKey: "tab_settings_notifications",
    descKey: "tab_desc_settings_notifications",
    label: "Notifications",
    icon: '<i class="fas fa-bell" aria-hidden="true"></i>',
    description: "Push notifications and alert preferences",
    color: "#f43f5e",
    gradient: "linear-gradient(135deg, #fb7185 0%, #f43f5e 100%)",
  },
  {
    id: "preferences",
    labelKey: "tab_settings_preferences",
    descKey: "tab_desc_settings_preferences",
    label: "Preferences",
    icon: '<i class="fas fa-sliders" aria-hidden="true"></i>',
    description: "Workflow and behavior preferences",
    color: "#f97316",
    gradient: "linear-gradient(135deg, #fb923c 0%, #f97316 100%)",
  },
  {
    id: "keyboard",
    labelKey: "tab_settings_keyboard",
    descKey: "tab_desc_settings_keyboard",
    label: "Keyboard",
    icon: '<i class="fas fa-keyboard" aria-hidden="true"></i>',
    description: "Review and change keyboard shortcuts",
    color: "#a855f7",
    gradient: "linear-gradient(135deg, #c084fc 0%, #9333ea 100%)",
  },
  {
    id: "language",
    labelKey: "tab_settings_language",
    descKey: "tab_desc_settings_language",
    label: "Language",
    icon: '<i class="fas fa-globe" aria-hidden="true"></i>',
    description: "App language and translations",
    color: "#0ea5e9",
    gradient: "linear-gradient(135deg, #38bdf8 0%, #0ea5e9 100%)",
  },
];

// Feedback tabs configuration
// User-facing tabs first (submit, my-feedback), admin-only tabs last (tracker, manage)
export const FEEDBACK_TABS: Section[] = [
  {
    id: "submit",
    labelKey: "tab_feedback_submit",
    descKey: "tab_desc_feedback_submit",
    label: "Submit",
    icon: '<i class="fas fa-paper-plane" aria-hidden="true"></i>',
    description: "Submit feedback, bug reports, or feature requests",
    color: "#14b8a6",
    gradient: "linear-gradient(135deg, #2dd4bf 0%, #14b8a6 100%)",
  },
  {
    id: "my-feedback",
    labelKey: "tab_feedback_my_feedback",
    descKey: "tab_desc_feedback_my_feedback",
    label: "My Feedback",
    icon: '<i class="fas fa-list-check" aria-hidden="true"></i>',
    description: "Track your submitted feedback and confirmations",
    color: "#3b82f6",
    gradient: "linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%)",
  },
  {
    id: "tracker",
    labelKey: "tab_feedback_tracker",
    descKey: "tab_desc_feedback_tracker",
    label: "Tracker",
    icon: '<i class="fas fa-binoculars" aria-hidden="true"></i>',
    description: "See reported bugs, features in progress, and recent fixes",
    color: "#f59e0b",
    gradient: "linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)",
  },
  {
    id: "manage",
    labelKey: "tab_feedback_manage",
    descKey: "tab_desc_feedback_manage",
    label: "Manage",
    icon: '<i class="fas fa-inbox" aria-hidden="true"></i>',
    description: "Review and manage submitted feedback",
    color: "#8b5cf6",
    gradient: "linear-gradient(135deg, #a78bfa 0%, #8b5cf6 100%)",
  },
];

// Arena tabs configuration (community pairwise ranking)
export const ARENA_TABS: Section[] = [
  {
    id: "battle",
    labelKey: "tab_arena_battle",
    descKey: "tab_desc_arena_battle",
    label: "Battle",
    icon: '<i class="fas fa-crosshairs" aria-hidden="true"></i>',
    description: "Vote on head-to-head matchups",
    color: "#e11d48",
    gradient: "linear-gradient(135deg, #fb7185 0%, #e11d48 100%)",
  },
  {
    id: "leaderboard",
    labelKey: "tab_arena_leaderboard",
    descKey: "tab_desc_arena_leaderboard",
    label: "Leaderboard",
    icon: '<i class="fas fa-ranking-star" aria-hidden="true"></i>',
    description: "Top-rated sequences ranked by the community",
    color: "#f59e0b",
    gradient: "linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)",
  },
  {
    id: "stats",
    labelKey: "tab_arena_stats",
    descKey: "tab_desc_arena_stats",
    label: "Stats",
    icon: '<i class="fas fa-chart-bar" aria-hidden="true"></i>',
    description: "Your voting history and arena statistics",
    color: "#8b5cf6",
    gradient: "linear-gradient(135deg, #a78bfa 0%, #8b5cf6 100%)",
  },
];

// Choreo Card tabs configuration
export const CHOREO_CARD_SCAN_ATLAS_TAB_ID = "scan-atlas";

export const CHOREO_CARD_TABS: Section[] = [
  {
    id: CHOREO_CARD_SCAN_ATLAS_TAB_ID,
    labelKey: "tab_choreo_card_scan_activity",
    descKey: "tab_desc_choreo_card_scan_activity",
    label: "Scan Atlas",
    icon: '<i class="fas fa-satellite-dish" aria-hidden="true"></i>',
    description: "Live feed of Choreo Card scans worldwide",
    color: "#10b981",
    gradient: "linear-gradient(135deg, #34d399 0%, #10b981 100%)",
  },
  {
    id: "releaser",
    labelKey: "tab_choreo_card_releaser",
    descKey: "tab_desc_choreo_card_releaser",
    label: "Deck Releaser",
    icon: '<i class="fas fa-stamp" aria-hidden="true"></i>',
    description: "Compose and release unique physical card decks",
    color: "#10b981",
    gradient: "linear-gradient(135deg, #34d399 0%, #10b981 100%)",
  },
  {
    id: "codex",
    labelKey: "tab_choreo_card_codex",
    descKey: "tab_desc_choreo_card_codex",
    label: "Codex Print",
    icon: '<i class="fas fa-book-open" aria-hidden="true"></i>',
    description: "Print the Double-Staff codex as cut-out reference cards",
    color: "#8b5cf6",
    gradient: "linear-gradient(135deg, #ec4899 0%, #8b5cf6 50%, #06b6d4 100%)",
  },
];

// Festival Hub tabs configuration
export const FESTIVAL_TABS: Section[] = [
  {
    id: "discover",
    labelKey: "tab_festivals_discover",
    descKey: "tab_desc_festivals_discover",
    label: "Discover",
    icon: '<i class="fas fa-compass" aria-hidden="true"></i>',
    description: "Browse flow festivals worldwide",
    color: "#10b981",
    gradient: "linear-gradient(135deg, #10b981, #34d399)",
  },
  {
    id: "map",
    labelKey: "tab_festivals_map",
    descKey: "tab_desc_festivals_map",
    label: "Map",
    icon: '<i class="fas fa-globe" aria-hidden="true"></i>',
    description: "Festival locations worldwide",
    color: "#f97316",
    gradient: "linear-gradient(135deg, #f97316, #fb923c)",
  },
  {
    id: "calendar",
    labelKey: "tab_festivals_calendar",
    descKey: "tab_desc_festivals_calendar",
    label: "Calendar",
    icon: '<i class="fas fa-calendar-alt" aria-hidden="true"></i>',
    description: "Tracked festival dates and deadlines",
    color: "#6366f1",
    gradient: "linear-gradient(135deg, #6366f1, #818cf8)",
  },
  {
    id: "portfolio",
    labelKey: "tab_festivals_portfolio",
    descKey: "tab_desc_festivals_portfolio",
    label: "Portfolio",
    icon: '<i class="fas fa-briefcase" aria-hidden="true"></i>',
    description: "Workshops, acts, bios, and application materials",
    color: "#a855f7",
    gradient: "linear-gradient(135deg, #a855f7, #c084fc)",
  },
];

export const RETRO_TABS: Section[] = [
  {
    id: "dos",
    labelKey: "tab_retro_dos",
    descKey: "tab_desc_retro_dos",
    label: "1989",
    icon: '<i class="fas fa-terminal" aria-hidden="true"></i>',
    description: "DOS-era terminal with SCRIBE notation utility",
    color: "#33ff33",
    gradient: "linear-gradient(135deg, #33ff33 0%, #1a8c1a 100%)",
  },
  {
    id: "desktop",
    labelKey: "tab_retro_desktop",
    descKey: "tab_desc_retro_desktop",
    label: "1995",
    icon: '<i class="fas fa-desktop" aria-hidden="true"></i>',
    description: "Windows 95-era desktop environment",
    color: "#008080",
    gradient: "linear-gradient(135deg, #008080 0%, #000080 100%)",
  },
  {
    id: "timeline",
    labelKey: "tab_retro_timeline",
    descKey: "tab_desc_retro_timeline",
    label: "Pictograph Timeline",
    icon: '<i class="fas fa-clock-rotate-left" aria-hidden="true"></i>',
    description: "Compare pictographs across eras: 1989, 1995, 2026",
    color: "#c084fc",
    gradient: "linear-gradient(135deg, #c084fc 0%, #6366f1 100%)",
  },
  {
    id: "history",
    labelKey: "tab_retro_history",
    descKey: "tab_desc_retro_history",
    label: "Pictograph History",
    icon: '<i class="fas fa-scroll" aria-hidden="true"></i>',
    description: "TKA notation across 40,000 years of art history",
    color: "#D4AF37",
    gradient: "linear-gradient(135deg, #D4AF37 0%, #8B6914 100%)",
  },
];

// Lab tabs configuration (admin-only, temporary experiments)
// All experimental modules consolidated here instead of cluttering the sidebar
export const LEVELS_TABS: Section[] = [
  {
    id: "level4",
    labelKey: "tab_levels_level4",
    descKey: "tab_desc_levels_level4",
    label: "Level 4",
    icon: '<i class="fas fa-magnet" aria-hidden="true"></i>',
    description: "Interradial orientations & quarter turns",
    color: "#a855f7",
    gradient: "linear-gradient(135deg, #c084fc 0%, #a855f7 100%)",
  },
  {
    id: "level5",
    labelKey: "tab_levels_level5",
    descKey: "tab_desc_levels_level5",
    label: "Level 5",
    icon: '<i class="fas fa-bezier-curve" aria-hidden="true"></i>',
    description: "Skewed positions (Zeta & Eta)",
    color: "#f97316",
    gradient: "linear-gradient(135deg, #fb923c 0%, #f97316 100%)",
  },
  {
    id: "level6",
    labelKey: "tab_levels_level6",
    descKey: "tab_desc_levels_level6",
    label: "Level 6",
    icon: '<i class="fas fa-bullseye" aria-hidden="true"></i>',
    description: "Centric positions (Tau & Terra) - completes the single grid",
    color: "#06b6d4",
    gradient: "linear-gradient(135deg, #22d3ee 0%, #06b6d4 100%)",
  },
  {
    id: "conjoined-grid",
    labelKey: "tab_levels_conjoined_grid",
    descKey: "tab_desc_levels_conjoined_grid",
    label: "Conjoined Grid",
    icon: '<i class="fas fa-link" aria-hidden="true"></i>',
    description: "N-grid topology explorer with real pictograph data",
    color: "#10b981",
    gradient: "linear-gradient(135deg, #34d399 0%, #10b981 100%)",
  },
  {
    id: "poi",
    labelKey: "tab_levels_poi",
    descKey: "tab_desc_levels_poi",
    label: "Poi",
    icon: '<i class="fas fa-circle-notch" aria-hidden="true"></i>',
    description: "Poi constraints with VTG terminology",
    color: "#22d3ee",
    gradient: "linear-gradient(135deg, #67e8f9 0%, #22d3ee 100%)",
  },
];

export const HAND_PATH_TABS: Section[] = [
  {
    id: "hand-path-explorer",
    labelKey: "tab_hand_paths_hand_path_explorer",
    descKey: "tab_desc_hand_paths_hand_path_explorer",
    label: "Path Explorer",
    icon: '<i class="fas fa-route" aria-hidden="true"></i>',
    description: "Browse unique hand paths across your sequence library",
    color: "#10b981",
    gradient: "linear-gradient(135deg, #34d399 0%, #10b981 100%)",
  },
  {
    id: "hand-path-builder",
    labelKey: "tab_hand_paths_hand_path_builder",
    descKey: "tab_desc_hand_paths_hand_path_builder",
    label: "Hand Path Builder",
    icon: '<i class="fas fa-draw-polygon" aria-hidden="true"></i>',
    description:
      "Tap grid locations to draw spatial hand paths and save them to the library",
    color: "#06b6d4",
    gradient: "linear-gradient(135deg, #22d3ee 0%, #06b6d4 100%)",
  },
];

// Playground module tabs - user-facing experimental toys, added one at a time on
// request (the user-facing counterpart to the admin-only Lab). First tab: Mandala.
// Tab labels reuse the former module's i18n keys (no re-translation needed).
export const PLAYGROUND_TABS: Section[] = [
  {
    id: "mandala",
    labelKey: "module_mandala",
    descKey: "module_desc_mandala",
    label: "Mandala",
    icon: '<i class="fas fa-dharmachakra" aria-hidden="true"></i>',
    description: "Create, collect, and meditate with mandalas",
    color: "#f472b6",
    gradient: "linear-gradient(135deg, #f9a8d4 0%, #f472b6 100%)",
  },
  {
    id: "tunnels",
    labelKey: "tab_playground_tunnels",
    descKey: "tab_desc_playground_tunnels",
    label: "Tunnels",
    icon: '<i class="fas fa-fan" aria-hidden="true"></i>',
    description:
      "Collect and replay the kaleidoscope tunnels you save from the viewer",
    color: "#22d3ee",
    gradient: "linear-gradient(135deg, #67e8f9 0%, #22d3ee 100%)",
  },
  {
    id: "scenes",
    labelKey: "tab_playground_scenes",
    descKey: "tab_desc_playground_scenes",
    label: "Scenes",
    icon: '<i class="fas fa-cube" aria-hidden="true"></i>',
    description: "Save and reload 3D viewer scene setups",
    color: "#a78bfa",
    gradient: "linear-gradient(135deg, #c4b5fd 0%, #a78bfa 100%)",
  },
];

// Toys module tabs - user-facing interactive toys, added one at a time on
// Austen's explicit request (the successor to the dissolved Playground module,
// whose galleries now live in the Library's Art shelf). First toy: Shape Matrix.
export const TOYS_TABS: Section[] = [
  {
    id: "shape-matrix",
    labelKey: "tab_toys_shape_matrix",
    descKey: "tab_desc_toys_shape_matrix",
    label: "Shape Matrix",
    icon: '<i class="fas fa-border-all" aria-hidden="true"></i>',
    description:
      "Explore shape pairings in an interactive matrix and watch each path traced live",
    color: "#2dd4bf",
    gradient: "linear-gradient(135deg, #5eead4 0%, #2dd4bf 100%)",
  },
  {
    id: "third-order",
    labelKey: "tab_toys_third_order",
    descKey: "tab_desc_toys_third_order",
    label: "Third Order",
    icon: '<i class="fas fa-atom" aria-hidden="true"></i>',
    description: "Explore sequences moving inside a larger moving grid",
    color: "#c084fc",
    gradient: "linear-gradient(135deg, #60a5fa 0%, #c084fc 50%, #f87171 100%)",
  },
  {
    id: "hand-tunnel",
    labelKey: "tab_toys_hand_tunnel",
    descKey: "tab_desc_toys_hand_tunnel",
    label: "Hand Tunnel",
    icon: '<i class="fas fa-hands" aria-hidden="true"></i>',
    description:
      "Stack several performers' timing-and-direction hand paths in one plane",
    color: "#fb923c",
    gradient: "linear-gradient(135deg, #fbbf24 0%, #fb923c 50%, #f472b6 100%)",
  },
];

// Video module tabs (graduated from Lab Mar 2026)
export const VIDEO_TABS: Section[] = [
  {
    id: "curator",
    labelKey: "tab_video_curator",
    descKey: "tab_desc_video_curator",
    label: "Curator",
    icon: '<i class="fas fa-tags" aria-hidden="true"></i>',
    description: "Review the video catalog and link videos to TKA sequences",
    color: "#f59e0b",
    gradient: "linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)",
  },
  {
    id: "video-trails",
    labelKey: "tab_video_video_trails",
    descKey: "tab_desc_video_video_trails",
    label: "Video Trails",
    icon: '<i class="fas fa-magic-wand-sparkles" aria-hidden="true"></i>',
    description:
      "Detect prop endpoints in video, apply fire/LED/trail effects, build training data",
    color: "#f43f5e",
    gradient: "linear-gradient(135deg, #fb7185 0%, #f43f5e 100%)",
  },
  {
    id: "video-lab",
    labelKey: "tab_video_video_lab",
    descKey: "tab_desc_video_video_lab",
    label: "Video Lab",
    icon: '<i class="fas fa-film" aria-hidden="true"></i>',
    description:
      "Beat mapping, BPM-synced playback, and video-to-notation alignment",
    color: "#8b5cf6",
    gradient: "linear-gradient(135deg, #a78bfa 0%, #8b5cf6 100%)",
  },
  {
    id: "skel2tka",
    labelKey: "tab_video_skel2tka",
    descKey: "tab_desc_video_skel2tka",
    label: "Skel2TKA",
    icon: '<i class="fas fa-video" aria-hidden="true"></i>',
    description: "Video-to-TKA notation pipeline",
    color: "#f43f5e",
    gradient: "linear-gradient(135deg, #fb7185 0%, #f43f5e 100%)",
  },
  {
    id: "led-notation",
    labelKey: "tab_video_led_notation",
    descKey: "tab_desc_video_led_notation",
    label: "LED Notation",
    icon: '<i class="fas fa-wand-magic-sparkles" aria-hidden="true"></i>',
    description:
      "Track LED staff ends in video and transcribe the flow into a TKA sequence",
    color: "#22d3ee",
    gradient: "linear-gradient(135deg, #67e8f9 0%, #22d3ee 100%)",
  },
];

export const SOCIAL_TABS: Section[] = [
  {
    id: "community",
    labelKey: "tab_social_community",
    descKey: "tab_desc_social_community",
    label: "Community",
    icon: '<i class="fas fa-globe" aria-hidden="true"></i>',
    description: "Global TKA community map",
    color: "#14b8a6",
    gradient: "linear-gradient(135deg, #2dd4bf 0%, #14b8a6 100%)",
  },
  {
    id: "connect",
    labelKey: "tab_social_connect",
    descKey: "tab_desc_social_connect",
    label: "Connect",
    icon: '<i class="fas fa-users" aria-hidden="true"></i>',
    description: "Sync with nearby spinners",
    color: "#10b981",
    gradient: "linear-gradient(135deg, #34d399 0%, #10b981 100%)",
  },
];

// Lab collapsible groups (desktop sidebar). Sections are matched to a group by
// their `groupId`. Render-only — routing/activeTab stay flat. (2026-06-18)
export const LAB_GROUPS: SectionGroup[] = [
  {
    id: "notation",
    labelKey: "tab_group_lab_notation",
    label: "Notation",
    icon: '<i class="fas fa-shapes" aria-hidden="true"></i>',
    color: "#50c878",
  },
  {
    id: "choreography",
    labelKey: "tab_group_lab_choreography",
    label: "Choreography",
    icon: '<i class="fas fa-music" aria-hidden="true"></i>',
    color: "#a78bfa",
  },
  {
    id: "physical",
    labelKey: "tab_group_lab_physical",
    label: "3D / Physical",
    icon: '<i class="fas fa-cube" aria-hidden="true"></i>',
    color: "#6a6aff",
  },
  {
    id: "output",
    labelKey: "tab_group_lab_output",
    label: "Output",
    icon: '<i class="fas fa-print" aria-hidden="true"></i>',
    color: "#ec4899",
  },
  {
    id: "presentation",
    labelKey: "tab_group_lab_presentation",
    label: "Presentation",
    icon: '<i class="fas fa-palette" aria-hidden="true"></i>',
    color: "#f472b6",
  },
];

export const LAB_TABS: Section[] = [
  // ascii-pictograph graduated to Retro module (Mar 2026)
  // assemble-lab removed - functionality lives in Create module's Assemble tab
  // avatar removed (Mar 2026)
  {
    id: "themes",
    groupId: "presentation",
    labelKey: "tab_lab_themes",
    descKey: "tab_desc_lab_themes",
    label: "Themes",
    icon: '<i class="fas fa-palette" aria-hidden="true"></i>',
    description: "Unified theme designer: 2D backgrounds and 3D scenes",
    color: "#a78bfa",
    gradient: "linear-gradient(135deg, #c4b5fd 0%, #a78bfa 100%)",
  },
  // community graduated to Social module (Mar 2026)
  // connect graduated to Social module (Mar 2026)
  // contact-ball removed (Mar 2026)
  // disassemble removed (Jun 2026) — 16-line stub, overlapped graduated Hand Paths module
  {
    id: "effects",
    groupId: "choreography",
    labelKey: "tab_lab_effects",
    descKey: "tab_desc_lab_effects",
    label: "Effects",
    icon: '<i class="fas fa-fire" aria-hidden="true"></i>',
    description: "Visual effects: trails, fire, LED overlays",
    color: "#8b5cf6",
    gradient: "linear-gradient(135deg, #a78bfa 0%, #8b5cf6 100%)",
  },
  // hand-path-builder graduated to Hand Paths module (Mar 2026)
  // hand-pose removed (Jun 2026) — authoring dead-ended (sessionStorage only, no downstream); finger posing is a Blender/baked-content job
  // level4, level5, level6, level7 graduated to Levels module (Mar 2026)
  // mandala + mandala-collection graduated to Mandala module (May 2026)
  // mandala-drawing removed (Apr 2026) - was just a placeholder notes tab
  // ml-training removed (Mar 2026)
  // multi-grid graduated to Levels module as conjoined-grid (Mar 2026)
  // hand-path-explorer graduated to Hand Paths module (Mar 2026)
  {
    id: "phrase-effort",
    groupId: "choreography",
    labelKey: "tab_lab_phrase_effort",
    descKey: "tab_desc_lab_phrase_effort",
    label: "Phrase Effort",
    icon: '<i class="fas fa-music" aria-hidden="true"></i>',
    description:
      "Paint effort qualities across beats to shape how a sequence moves",
    color: "#a78bfa",
    gradient: "linear-gradient(135deg, #c084fc 0%, #a78bfa 100%)",
  },
  // poi graduated to Levels module (Mar 2026)
  {
    id: "prop-buttons",
    groupId: "presentation",
    labelKey: "tab_lab_prop_buttons",
    descKey: "tab_desc_lab_prop_buttons",
    label: "Prop Buttons",
    icon: '<i class="fas fa-wand-magic-sparkles" aria-hidden="true"></i>',
    description: "Paired prop composition tuning for buttons",
    color: "#f97316",
    gradient: "linear-gradient(135deg, #fb923c 0%, #f97316 100%)",
  },
  // retro + retro-pictograph graduated to Retro module (Mar 2026)
  // screenshot-gallery removed (Mar 2026)
  // skel2tka graduated to Video module (Mar 2026)
  {
    id: "trigrid",
    groupId: "notation",
    labelKey: "tab_lab_trigrid",
    descKey: "tab_desc_lab_trigrid",
    label: "Trigrid",
    icon: '<i class="fas fa-draw-polygon" aria-hidden="true"></i>',
    description: "3-point equilateral triangle grid (triad's native grid)",
    color: "#d946ef",
    gradient: "linear-gradient(135deg, #e879f9 0%, #d946ef 100%)",
  },
  // video-lab, video-trails graduated to Video module (Mar 2026)
  {
    id: "voice",
    groupId: "presentation",
    labelKey: "tab_lab_voice",
    descKey: "tab_desc_lab_voice",
    label: "Voice",
    icon: '<i class="fas fa-microphone" aria-hidden="true"></i>',
    description: "Test Hey Tika voice control",
    color: "#f43f5e",
    gradient: "linear-gradient(135deg, #fb7185 0%, #f43f5e 100%)",
  },
  {
    id: "pronunciation-recorder",
    groupId: "presentation",
    labelKey: "tab_lab_pronunciation_recorder",
    descKey: "tab_desc_lab_pronunciation_recorder",
    label: "Pronunciation",
    icon: '<i class="fas fa-waveform-lines" aria-hidden="true"></i>',
    description: "Record contextual TKA letter pronunciations",
    color: "#22d3ee",
    gradient: "linear-gradient(135deg, #67e8f9 0%, #22d3ee 100%)",
  },
  {
    id: "vtg",
    groupId: "notation",
    labelKey: "tab_lab_vtg",
    descKey: "tab_desc_lab_vtg",
    label: "VTG",
    icon: '<i class="fas fa-circle-half-stroke" aria-hidden="true"></i>',
    description: "Map VTG modes to TKA letters and terminology",
    color: "#f59e0b",
    gradient: "linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)",
  },
  {
    id: "village",
    groupId: "physical",
    labelKey: "tab_lab_village",
    descKey: "tab_desc_lab_village",
    label: "Village",
    icon: '<i class="fas fa-users" style="color: #e8a87c;" aria-hidden="true"></i>',
    description: "Generational cultural simulation",
    color: "#e8a87c",
    gradient: "linear-gradient(135deg, #e8a87c 0%, #d4886a 100%)",
  },
  {
    id: "pov-pattern",
    groupId: "output",
    labelKey: "tab_lab_pov_pattern",
    descKey: "tab_desc_lab_pov_pattern",
    label: "POV Pattern",
    icon: '<i class="fas fa-lightbulb" style="color: #06b6d4;" aria-hidden="true"></i>',
    description: "LED strip pattern engine for pixel poi",
    color: "#06b6d4",
    gradient: "linear-gradient(135deg, #22d3ee 0%, #06b6d4 100%)",
  },
  {
    id: "combinator",
    groupId: "choreography",
    labelKey: "tab_lab_combinator",
    descKey: "tab_desc_lab_combinator",
    label: "Combinator",
    icon: '<i class="fas fa-code-merge" aria-hidden="true"></i>',
    description: "Two cards in, every LOOP they make out",
    color: "#a78bfa",
    gradient: "linear-gradient(135deg, #c4b5fd 0%, #a78bfa 100%)",
  },
  {
    id: "collision-lab",
    groupId: "physical",
    labelKey: "tab_lab_collision_lab",
    descKey: "tab_desc_lab_collision_lab",
    label: "Collision Lab",
    icon: '<i class="fas fa-shield-halved" style="color: #ef4444;" aria-hidden="true"></i>',
    description: "Catalog and label 3D poses for collision safety",
    color: "#ef4444",
    gradient: "linear-gradient(135deg, #f87171 0%, #ef4444 100%)",
  },
  {
    id: "dodge",
    groupId: "physical",
    labelKey: "tab_lab_dodge",
    descKey: "tab_desc_lab_dodge",
    label: "Dodge",
    icon: '<i class="fas fa-person-running" style="color: #22c55e;" aria-hidden="true"></i>',
    description: "Step a performer clear of a prop while the hands stay on it",
    color: "#22c55e",
    gradient: "linear-gradient(135deg, #4ade80 0%, #22c55e 100%)",
  },
  {
    id: "spatial-lab",
    groupId: "physical",
    labelKey: "tab_lab_spatial_lab",
    descKey: "tab_desc_lab_spatial_lab",
    label: "Spatial Lab",
    icon: '<i class="fas fa-eye" style="color: #6a6aff;" aria-hidden="true"></i>',
    description: "Bird's eye exploration of body rotation and arm reachability",
    color: "#6a6aff",
    gradient: "linear-gradient(135deg, #8888ff 0%, #6a6aff 100%)",
  },
  {
    id: "fan-relations",
    groupId: "physical",
    labelKey: "tab_lab_fan_relations",
    descKey: "tab_desc_lab_fan_relations",
    label: "Fan Relations",
    icon: '<i class="fas fa-fan" style="color: #22d3ee;" aria-hidden="true"></i>',
    description:
      "Compare fan placement, orientation, face plane, and viewpoint",
    color: "#22d3ee",
    gradient: "linear-gradient(135deg, #67e8f9 0%, #0891b2 100%)",
  },
  {
    id: "stickers",
    groupId: "output",
    labelKey: "tab_lab_stickers",
    descKey: "tab_desc_lab_stickers",
    label: "Stickers",
    icon: '<i class="fas fa-circle" aria-hidden="true"></i>',
    description:
      "Browse solo and combined mandala shapes, then build printable sheets",
    color: "#ec4899",
    gradient: "linear-gradient(135deg, #f472b6 0%, #ec4899 100%)",
  },
  // coral-lab removed (Jun 2026) — EZ-Tree procedural approach abandoned for Smithsonian CC0 coral models
];

// REMOVED: LANDING_PAGE_TABS - public pages are routed directly.

// Stage module tabs configuration.
//
// One stage, one tab. The Scene / Stage split asked the author to decide
// whether they were dressing a scene or choreographing a cast before they had
// seen either, and hid the shared control rail behind the wrong half of the
// answer. Both live on one surface now.
export const STAGE_TABS: Section[] = [
  {
    id: "scene",
    labelKey: "tab_stage_scene",
    descKey: "tab_desc_stage_scene",
    label: "Stage",
    icon: '<i class="fas fa-people-group" aria-hidden="true"></i>',
    description: "Choreograph a cast in 3D, then save and export the scene",
    color: "#06b6d4",
  },
];
