import type { ChangelogCategory } from "#lib/shared/feedback/domain/models/version-models.js";

export const CATEGORY_ICONS: Record<ChangelogCategory, string> = {
  fixed: "fa-bug",
  added: "fa-magic-wand-sparkles",
  improved: "fa-arrow-up",
};

export const CATEGORY_LABELS: Record<ChangelogCategory, string> = {
  fixed: "Bug Fixes",
  added: "New Features",
  improved: "Improvements",
};

export const CATEGORY_PLACEHOLDERS: Record<ChangelogCategory, string> = {
  fixed: "Enter new bug fix...",
  added: "Enter new feature...",
  improved: "Enter improvement...",
};

export const CATEGORY_ADD_LABELS: Record<ChangelogCategory, string> = {
  fixed: "Add bug fix",
  added: "Add feature",
  improved: "Add improvement",
};

export const CHANGELOG_CATEGORIES: ChangelogCategory[] = [
  "fixed",
  "added",
  "improved",
];
