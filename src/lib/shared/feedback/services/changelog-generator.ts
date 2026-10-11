/**
 * Changelog Generator
 *
 * Auto-generates user-friendly changelog entries from:
 * 1. Git commit messages (parsed for conventional commits)
 * 2. Completed feedback items
 *
 * Transforms technical language into plain user-facing descriptions.
 */

import type {
  ChangelogEntry,
  ChangelogCategory,
} from "#lib/shared/feedback/domain/models/version-models.js";
import type { VersionFeedbackItem } from "#lib/shared/feedback/domain/models/version-models.js";

/**
 * Parsed conventional commit
 */
interface ParsedCommit {
  type: string; // feat, fix, refactor, chore, etc.
  scope?: string; // (nav), (feedback), etc.
  message: string; // The actual message
  isBreaking: boolean;
}

/**
 * Categories for filtering commits
 */
const USER_FACING_TYPES = ["feat", "fix", "perf", "style"];
const INTERNAL_TYPES = ["refactor", "chore", "test", "docs", "ci", "build"];

/**
 * Parse a conventional commit message
 */
function parseCommit(message: string): ParsedCommit | null {
  // Match: type(scope)?: message or type!: message (breaking)
  const match = message.match(/^(\w+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/);

  if (!match) {
    // Not a conventional commit, try to categorize anyway
    const lowerMsg = message.toLowerCase();
    if (lowerMsg.includes("fix") || lowerMsg.includes("bug")) {
      return { type: "fix", message, isBreaking: false };
    }
    if (
      lowerMsg.includes("add") ||
      lowerMsg.includes("new") ||
      lowerMsg.includes("feature")
    ) {
      return { type: "feat", message, isBreaking: false };
    }
    return null; // Can't categorize
  }

  return {
    type: match[1]?.toLowerCase() ?? "feat",
    scope: match[2],
    message: match[4] ?? message,
    isBreaking: match[3] === "!",
  };
}

/**
 * Transform technical message to user-friendly language
 */
function humanizeMessage(parsed: ParsedCommit): string {
  let msg = parsed.message;

  // Remove technical prefixes
  msg = msg.replace(
    /^(Add|Implement|Create|Update|Fix|Improve|Enhance)\s+/i,
    ""
  );

  // Capitalize first letter
  msg = msg.charAt(0).toUpperCase() + msg.slice(1);

  // Don't include scope in message, it's too technical
  // (scope info from parsed.scope is intentionally ignored)

  // Add appropriate prefix based on type
  switch (parsed.type) {
    case "fix":
      if (!msg.toLowerCase().startsWith("fixed")) {
        msg = "Fixed " + msg.charAt(0).toLowerCase() + msg.slice(1);
      }
      break;
    case "feat":
      if (
        !msg.toLowerCase().startsWith("added") &&
        !msg.toLowerCase().startsWith("new")
      ) {
        msg = "Added " + msg.charAt(0).toLowerCase() + msg.slice(1);
      }
      break;
    case "perf":
      msg =
        "Improved performance of " + msg.charAt(0).toLowerCase() + msg.slice(1);
      break;
  }

  return msg;
}

/**
 * Determine changelog category from commit type
 */
function getCategory(type: string): ChangelogCategory {
  switch (type) {
    case "fix":
      return "fixed";
    case "feat":
      return "added";
    case "perf":
    case "style":
    default:
      return "improved";
  }
}

/**
 * Check if a commit is user-facing
 */
function isUserFacing(parsed: ParsedCommit): boolean {
  // Internal types are never user-facing
  if (INTERNAL_TYPES.includes(parsed.type)) {
    return false;
  }

  // Check for internal indicators in the message
  const internalKeywords = [
    "barrel",
    "export",
    "import",
    "type",
    "interface",
    "cleanup",
    "lint",
    "format",
    "dependency",
    "dependencies",
    "tsconfig",
    "eslint",
    "prettier",
    "config",
  ];

  const lowerMsg = parsed.message.toLowerCase();
  if (internalKeywords.some((kw) => lowerMsg.includes(kw))) {
    return false;
  }

  return USER_FACING_TYPES.includes(parsed.type);
}

/**
 * Generate changelog entries from git commits
 */
export function generateFromCommits(
  commitMessages: string[]
): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];

  for (const message of commitMessages) {
    const parsed = parseCommit(message);
    if (!parsed) continue;

    if (isUserFacing(parsed)) {
      entries.push({
        category: getCategory(parsed.type),
        text: humanizeMessage(parsed),
      });
    }
  }

  return entries;
}

/**
 * Generate changelog entries from completed feedback items
 */
export function generateFromFeedback(
  items: VersionFeedbackItem[]
): ChangelogEntry[] {
  return items.map((item) => {
    // Determine category from feedback type
    let category: ChangelogCategory;
    switch (item.type) {
      case "bug":
        category = "fixed";
        break;
      case "feature":
        category = "added";
        break;
      default:
        category = "improved";
    }

    // Use the title, humanized
    let text = item.title;

    // Add appropriate prefix if not already present
    const lowerText = text.toLowerCase();
    if (category === "fixed" && !lowerText.startsWith("fixed")) {
      text = "Fixed " + text.charAt(0).toLowerCase() + text.slice(1);
    } else if (
      category === "added" &&
      !lowerText.startsWith("added") &&
      !lowerText.startsWith("new")
    ) {
      text = "Added " + text.charAt(0).toLowerCase() + text.slice(1);
    }

    return { category, text, feedbackId: item.id };
  });
}

/**
 * Merge and deduplicate changelog entries
 * Prefers feedback-based entries over commit-based ones
 */
export function mergeEntries(
  fromFeedback: ChangelogEntry[],
  fromCommits: ChangelogEntry[]
): ChangelogEntry[] {
  // Start with feedback entries (higher quality, user-reported)
  const merged = [...fromFeedback];

  // Add commit entries that don't seem to duplicate feedback
  for (const commitEntry of fromCommits) {
    const isDuplicate = merged.some((feedbackEntry) => {
      // Simple similarity check - could be improved
      const feedbackWords = new Set(
        feedbackEntry.text.toLowerCase().split(/\s+/)
      );
      const commitWords = commitEntry.text.toLowerCase().split(/\s+/);
      const overlap = commitWords.filter((w) => feedbackWords.has(w)).length;
      return overlap / commitWords.length > 0.5; // 50% word overlap = likely duplicate
    });

    if (!isDuplicate) {
      merged.push(commitEntry);
    }
  }

  // Sort by category: fixed first, then added, then improved
  const categoryOrder: Record<ChangelogCategory, number> = {
    fixed: 0,
    added: 1,
    improved: 2,
  };

  merged.sort((a, b) => categoryOrder[a.category] - categoryOrder[b.category]);

  return merged;
}

/**
 * Main generator function
 */
export function generateChangelog(
  commitMessages: string[],
  feedbackItems: VersionFeedbackItem[]
): ChangelogEntry[] {
  const fromFeedback = generateFromFeedback(feedbackItems);
  const fromCommits = generateFromCommits(commitMessages);
  return mergeEntries(fromFeedback, fromCommits);
}
