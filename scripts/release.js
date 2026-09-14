/**
 * Release Script
 *
 * Automates version releases with proper branch workflow:
 *
 * Branch Workflow:
 * 1. Verify you're on develop branch (or main with --from-main flag)
 * 2. Stash any uncommitted changes
 * 3. Switch to main branch
 * 4. Merge develop into main
 * 5. Create release commit and tag on main
 * 6. Push main and tags
 * 7. Switch back to develop
 * 8. Restore stashed changes
 *
 * Feedback Mode (preferred):
 * - Check completed feedback count
 * - Determine version number from feedback types
 * - Generate changelog from feedback items
 * - Archive feedback and create version record in Firestore
 *
 * Git History Mode (fallback):
 * - Parse commits since last tag
 * - Determine version from conventional commit types
 * - Generate changelog from commit messages
 * - Creates Firestore version document for What's New modal
 *
 * Usage:
 *   node scripts/release.js                    - Interactive flow
 *   node scripts/release.js -p                 - Quick preview (for /fb workflow)
 *   node scripts/release.js --preview          - Quick preview (same as -p)
 *   node scripts/release.js --dry-run          - Full preview with details
 *   node scripts/release.js --show-last        - Show what was in the last release
 *   node scripts/release.js --last             - Show what was in the last release (same as --show-last)
 *   node scripts/release.js --version 0.2.0    - Manual version
 *   node scripts/release.js --confirm          - Execute release (requires audited --changelog)
 *   node scripts/release.js --changelog file.json - Use audience-audited user-facing entries
 *   node scripts/release.js --highlights 1,3,4   - Select highlight indices (comma-separated, or "none")
 *   node scripts/release.js --from-main        - Release directly from main (skip branch workflow)
 *   node scripts/release.js --auto-gate        - Drop commits behind a dark flag (unreleased modules) from the changelog; without it the gate is advisory-only
 *   node scripts/release.js --skip-jargon-check - Bypass jargon detection (use with caution)
 *   node scripts/release.js --update-notes 0.7.11 --changelog notes.json - Update existing release notes
 */

import admin from "firebase-admin";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { execSync } from "child_process";
import * as readline from "readline";
import config from "../config/feedback.config.js";
import {
  loadProductionModules,
  loadGuestModuleAccess,
  loadModuleTabs,
  collectCommits,
  gateCommits,
  auditChangelogEntries,
  toPublicChangelog,
} from "./lib/release-module-gate.mjs";

const serviceAccount = JSON.parse(
  readFileSync("./serviceAccountKey.json", "utf8")
);

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

// Import config values
const { ADMIN_USER_ID, ADMIN_USER } = config;

/**
 * Create readline interface for user prompts
 */
function createPrompt() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

/**
 * Ask user a question and wait for response
 */
function askQuestion(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

/**
 * Prompt user to select highlights from changelog entries
 * Enhanced flow with better visuals and more options
 * @param {Array} changelogEntries - The changelog entries to suggest as highlights
 * @returns {Promise<string[]>} - Selected highlights (may be empty)
 */
async function promptForHighlights(changelogEntries) {
  // Get potential highlights (features and major improvements)
  const potentialHighlights = changelogEntries
    .filter((e) => e.category === "added" || e.category === "improved")
    .map((e) => ({ text: e.text, category: e.category }));

  if (potentialHighlights.length === 0) {
    console.log("\n📌 No feature/improvement entries to highlight.\n");
    return [];
  }

  console.log("\n" + "═".repeat(70));
  console.log("⭐ HIGHLIGHT SELECTION");
  console.log("═".repeat(70));
  console.log(
    '\nHighlights appear prominently at the top of the "What\'s New" modal.'
  );
  console.log("Select items that are genuinely exciting for users.\n");

  console.log("─".repeat(70));
  console.log("  Available entries:\n");

  potentialHighlights.forEach((item, i) => {
    const icon = item.category === "added" ? "✨" : "🔧";
    const label = item.category === "added" ? "NEW" : "IMPROVED";
    console.log(`  [${i + 1}] ${icon} ${item.text}`);
    console.log(`      ${label}`);
    console.log("");
  });

  console.log("─".repeat(70));
  console.log("  Options:\n");
  console.log("    • Enter numbers separated by commas (e.g., 1,3)");
  console.log("    • Enter 'all' to select all entries");
  console.log("    • Enter 'none' or 0 for no highlights");
  console.log("    • Enter 'custom' to write your own highlight text\n");

  const rl = createPrompt();

  try {
    const answer = await askQuestion(
      rl,
      "Your selection: "
    );

    const trimmedAnswer = answer.trim().toLowerCase();

    // No highlights
    if (trimmedAnswer === "0" || trimmedAnswer === "none" || trimmedAnswer === "") {
      console.log("\n✓ No highlights selected.\n");
      return [];
    }

    // All highlights
    if (trimmedAnswer === "all") {
      const allHighlights = potentialHighlights.map((h) => h.text);
      console.log("\n✓ Selected ALL highlights:");
      allHighlights.forEach((h) => console.log(`   • ${h}`));
      console.log("");
      return allHighlights;
    }

    // Custom highlight
    if (trimmedAnswer === "c" || trimmedAnswer === "custom") {
      const customText = await askQuestion(rl, "Enter custom highlight text: ");
      if (customText && customText.trim()) {
        console.log(`\n✓ Custom highlight: "${customText.trim()}"\n`);
        return [customText.trim()];
      }
      console.log("\n✓ No highlight entered.\n");
      return [];
    }

    // Parse comma-separated numbers
    const selectedIndices = answer
      .split(",")
      .map((s) => parseInt(s.trim()) - 1)
      .filter((i) => i >= 0 && i < potentialHighlights.length);

    const selectedHighlights = selectedIndices.map(
      (i) => potentialHighlights[i].text
    );

    if (selectedHighlights.length > 0) {
      console.log("\n✓ Selected highlights:");
      selectedHighlights.forEach((h) => console.log(`   • ${h}`));
      console.log("");
    } else {
      console.log("\n⚠️ No valid selections. Enter numbers from the list above.\n");
    }

    return selectedHighlights;
  } finally {
    rl.close();
  }
}

/**
 * Get completed feedback items ready for release
 */
async function getCompletedFeedback() {
  const snapshot = await db
    .collection("feedback")
    .where("status", "==", "completed")
    .get();

  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data(),
  }));
}

/**
 * Generate changelog entries from feedback items
 * @param {Array} items - All completed feedback items
 * @param {boolean} includeInternalOnly - Whether to include internal-only items (default: false)
 * @returns {Object} - { userFacing: [...], developerNotes: [...] }
 */
function generateChangelogFromFeedback(items, includeInternalOnly = false) {
  const userFacing = [];
  const developerNotes = [];

  items.forEach((item) => {
    let category;
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

    let text =
      item.changelogEntry || item.title || item.description?.substring(0, 100) || "Untitled change";

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

    const entry = { category, text, feedbackId: item.id };

    // Separate user-facing from internal-only changes
    if (item.isInternalOnly) {
      developerNotes.push(entry);
    } else {
      userFacing.push(entry);
    }
  });

  return { userFacing, developerNotes };
}

/**
 * Technical jargon patterns that shouldn't appear in user-facing changelog
 * These indicate the entry needs rewriting for users
 */
const JARGON_PATTERNS = [
  // Code/file references
  /\.(ts|js|svelte|css|json|md)(\s|$|:)/i,
  /[A-Z][a-z]+[A-Z][a-z]+/, // CamelCase (likely class/component names)
  /\b(src|lib|components?|services?|utils?|helpers?)\b/i,
  /\b(props?|state|store|context)\b/i,

  // Technical terms
  /\b(refactor|endpoint|API|SDK|CSS|HTML|DOM|UI)\b/,
  /\b(migration|schema|database|firestore|firebase)\b/i,
  /\b(dependency|dependencies|npm|package)\b/i,
  /\b(config|configuration|env|environment)\b/i,
  /\b(handler|listener|callback|async|await)\b/i,
  /\b(component|module|service|class|interface|type)\b/i,
  /\b(render|mount|unmount|lifecycle)\b/i,
  /\b(cache|caching|memoiz|optimiz)/i,
  /\b(middleware|interceptor|decorator)\b/i,
  /\b(singleton|injection|DI|inversify)\b/i,

  // Dev workflow terms
  /\b(PR|pull request|merge|commit|branch|git)\b/i,
  /\b(lint|eslint|prettier|format)\b/i,
  /\b(test|spec|coverage|mock)\b/i,
  /\b(build|compile|bundle|webpack|vite)\b/i,
  /\b(debug|log|console|trace)\b/i,

  // Implementation details
  /\b(null|undefined|boolean|string|number|array|object)\b/i,
  /\b(function|method|variable|const|let|var)\b/i,
  /\b(import|export|require|module)\b/i,
  /\b(timeout|interval|promise|observable)\b/i,
  /\b(selector|query|mutation|subscription)\b/i,
];

/**
 * Check changelog entries for technical jargon
 * Returns array of entries that contain jargon
 */
function detectJargon(entries) {
  const issues = [];

  for (const entry of entries) {
    const matches = [];
    for (const pattern of JARGON_PATTERNS) {
      const match = entry.text.match(pattern);
      if (match) {
        matches.push(match[0]);
      }
    }

    if (matches.length > 0) {
      issues.push({
        text: entry.text,
        jargon: [...new Set(matches)], // Dedupe
        feedbackId: entry.feedbackId,
      });
    }
  }

  return issues;
}

/**
 * Display jargon warnings and return whether to proceed
 */
function displayJargonWarnings(issues) {
  if (issues.length === 0) {
    console.log("✓ No technical jargon detected in changelog entries\n");
    return true;
  }

  console.log("\n" + "═".repeat(70));
  console.log("⚠️  JARGON DETECTED - These entries need rewriting for users:");
  console.log("═".repeat(70) + "\n");

  issues.forEach((issue, i) => {
    console.log(`  [${i + 1}] "${issue.text}"`);
    console.log(`      Jargon found: ${issue.jargon.join(", ")}`);
    if (issue.feedbackId) {
      console.log(`      Feedback ID: ${issue.feedbackId.substring(0, 8)}...`);
    }
    console.log("");
  });

  console.log("─".repeat(70));
  console.log("  Changelog entries should be written for flow artists, not developers.");
  console.log("  Rewrite these entries to focus on user benefits, not implementation.\n");
  console.log("  Examples of good rewrites:");
  console.log('    ❌ "Fixed null check in SequenceLoader component"');
  console.log('    ✓ "Sequences now load reliably without errors"\n');
  console.log('    ❌ "Refactored gallery CSS grid layout"');
  console.log('    ✓ "Gallery thumbnails now resize smoothly on all devices"\n');
  console.log("═".repeat(70) + "\n");

  return false; // Don't proceed automatically
}

/**
 * Enforce the private audience/surface metadata required on a final custom
 * changelog, then strip it before the notes are displayed or published.
 */
function prepareCustomChangelog(entries) {
  let audit;
  try {
    audit = auditChangelogEntries(entries, {
      productionModules: loadProductionModules(),
      guestModuleAccess: loadGuestModuleAccess(),
      moduleTabs: loadModuleTabs(),
    });
  } catch (error) {
    console.error(`❌ Changelog visibility audit failed: ${error.message}`);
    return null;
  }

  if (audit.errors.length > 0) {
    console.log("\n" + "═".repeat(70));
    console.log("❌ CHANGELOG VISIBILITY AUDIT FAILED");
    console.log("═".repeat(70) + "\n");
    for (const issue of audit.errors) {
      console.log(`  - ${issue.message}`);
    }
    console.log("");
    console.log(
      '  Every final entry needs audience "guest" or "account" and a'
    );
    console.log('  surface of "global" or { "module": "...", "tab": "..." }.');
    console.log(
      "  Account-only entries must say that the user needs an account or"
    );
    console.log("  must be signed in.");
    console.log("\n" + "═".repeat(70) + "\n");
    return null;
  }

  console.log(
    `✓ Changelog visibility audit: ${audit.guestCount} guest-visible, ` +
      `${audit.accountCount} sign-in required\n`
  );
  return toPublicChangelog(entries);
}

/**
 * Get most recent git tag
 */
function getLatestTag() {
  try {
    const tag = execSync("git describe --tags --abbrev=0", {
      encoding: "utf8",
    }).trim();
    return tag.replace(/^v/, "");
  } catch (error) {
    // No tags exist
    return null;
  }
}

/**
 * Generate changelog entries from git commits since last tag
 */
function generateChangelogFromGitHistory() {
  const latestTag = getLatestTag();
  const range = latestTag ? `v${latestTag}..HEAD` : "HEAD";

  try {
    const commits = execSync(
      `git log ${range} --pretty=format:"%s" --no-merges`,
      {
        encoding: "utf8",
      }
    ).trim();

    if (!commits) return [];

    return commits.split("\n").map((commit) => {
      let category = "improved";
      let text = commit;

      // Parse conventional commit format
      const fixMatch = commit.match(/^fix(\(.+?\))?:\s*(.+)/i);
      const featMatch = commit.match(/^feat(\(.+?\))?:\s*(.+)/i);
      const refactorMatch = commit.match(/^refactor(\(.+?\))?:\s*(.+)/i);
      const styleMatch = commit.match(/^style(\(.+?\))?:\s*(.+)/i);
      const choreMatch = commit.match(/^chore(\(.+?\))?:\s*(.+)/i);

      if (fixMatch) {
        category = "fixed";
        text = fixMatch[2];
      } else if (featMatch) {
        category = "added";
        text = featMatch[2];
      } else if (refactorMatch || styleMatch || choreMatch) {
        category = "improved";
        text = refactorMatch?.[2] || styleMatch?.[2] || choreMatch?.[2] || text;
      }

      // Ensure proper capitalization
      text = text.charAt(0).toUpperCase() + text.slice(1);

      return { category, text, commit };
    });
  } catch (error) {
    console.error("Warning: Could not read git history:", error.message);
    return [];
  }
}

/**
 * Run the module gate over the git range and reconcile it with the generated
 * changelog. Flags commits whose module (or dark sub-feature) is not released,
 * so they don't leak into the user-facing changelog.
 *
 * @param {Array} changelog - entries from generateChangelogFromGitHistory (each has `.commit` = subject)
 * @param {string} range - git range, e.g. "v0.28.1..HEAD"
 * @param {boolean} autoGate - when true, drop flagged entries from the changelog
 * @returns {{ changelog: Array, flagged: Array }}
 */
function applyModuleGate(changelog, range, autoGate) {
  let flagged;
  let accountOnly;
  let needsAudienceReview;
  try {
    const productionModules = loadProductionModules();
    const guestModuleAccess = loadGuestModuleAccess();
    const commits = collectCommits(range);
    ({ flagged, accountOnly, needsAudienceReview } = gateCommits(commits, {
      productionModules,
      guestModuleAccess,
    }));
  } catch (error) {
    console.log(`   ⚠️  Module gate skipped (non-fatal): ${error.message}\n`);
    return {
      changelog,
      flagged: [],
      accountOnly: [],
      needsAudienceReview: [],
    };
  }

  if (flagged.length === 0) {
    console.log("✓ Module gate: no commits behind a dark flag\n");
  } else {
    // Group flagged commits by their reason for a readable report.
    const byReason = new Map();
    for (const c of flagged) {
      const key = c.darkReason || "not released";
      if (!byReason.has(key)) byReason.set(key, []);
      byReason.get(key).push(c);
    }

    console.log("\n" + "═".repeat(70));
    console.log("🚧 BEHIND A DARK FLAG — exclude these from release notes:");
    console.log("═".repeat(70) + "\n");
    for (const [reason, commits] of byReason) {
      console.log(`  ${reason}:`);
      commits.forEach((c) => console.log(`     - ${c.subject}`));
      console.log("");
    }
    console.log("─".repeat(70));
    if (autoGate) {
      console.log("  --auto-gate: dropping these from the changelog.\n");
    } else {
      console.log("  Advisory only. Exclude these when writing the final");
      console.log("  changelog, or re-run with --auto-gate to drop them.\n");
    }
    console.log("═".repeat(70) + "\n");
  }

  if (accountOnly.length > 0) {
    console.log("\n" + "═".repeat(70));
    console.log("🔐 SIGN-IN REQUIRED — qualify these notes or exclude them:");
    console.log("═".repeat(70) + "\n");
    accountOnly.forEach((commit) => {
      const surface = commit.tab
        ? `${commit.module}/${commit.tab}`
        : commit.module;
      console.log(`  [${surface}] ${commit.subject}`);
    });
    console.log("");
    console.log(
      '  Final wording must explicitly say "after signing in" or "account".'
    );
    console.log("═".repeat(70) + "\n");
  }

  const reviewable = needsAudienceReview.filter(
    (commit) =>
      commit.audience === "mixed" &&
      /^(?:feat|fix|perf|a11y|tune)(?:\(|:)/i.test(commit.subject)
  );
  if (reviewable.length > 0) {
    console.log("\n" + "═".repeat(70));
    console.log(
      "🔎 GUEST VISIBILITY UNRESOLVED — trace the exact entry point:"
    );
    console.log("═".repeat(70) + "\n");
    reviewable.forEach((commit) => console.log(`  - ${commit.subject}`));
    console.log("");
    console.log(
      "  Include only after proving the affected tab or control is reachable."
    );
    console.log("═".repeat(70) + "\n");
  }

  const unresolvedCount = needsAudienceReview.filter(
    (commit) =>
      commit.audience === "unknown" &&
      /^(?:feat|fix|perf|a11y|tune)(?:\(|:)/i.test(commit.subject)
  ).length;
  if (unresolvedCount > 0) {
    console.log(
      `ℹ️  ${unresolvedCount} user-facing commit candidates do not map to a ` +
        "single module or tab."
    );
    console.log(
      "   The release evidence table must trace their real entry points.\n"
    );
  }

  let gated = changelog;
  if (autoGate) {
    const flaggedSubjects = new Set(flagged.map((c) => c.subject));
    gated = changelog.filter((entry) => !flaggedSubjects.has(entry.commit));
  }

  return { changelog: gated, flagged, accountOnly, needsAudienceReview };
}

/**
 * Determine suggested version based on changelog entries
 *
 * Pre-1.0 versioning strategy:
 * - PATCH (0.1.x): Bug fixes and small improvements only
 * - MINOR (0.x.0): New features or significant changes
 *
 * Significant change indicators:
 * - New modules, major UI changes, architectural shifts
 * - Keywords: "new module", "major", "refactor", "redesign", "architecture"
 */
function suggestVersion(currentVersion, changelogEntries) {
  const parts = currentVersion.replace("-beta", "").split(".");
  const major = parseInt(parts[0]) || 0;
  const minor = parseInt(parts[1]) || 0;
  const patch = parseInt(parts[2]) || 0;

  // Check if any features exist
  const hasFeatures = changelogEntries.some(
    (entry) => entry.category === "added"
  );

  if (!hasFeatures) {
    // Only bugs/improvements → patch bump
    return `${major}.${minor}.${patch + 1}`;
  }

  // Minor bump ONLY for genuinely new user-facing capabilities.
  // "New capability" = users can do something they literally could not do before.
  // Improvements to existing features (redesigns, performance, infrastructure) are patches.
  const newCapabilityKeywords = [
    "new module",
    "new tab",
    "new feature set",
  ];

  const allChangeText = changelogEntries
    .map((e) => e.text.toLowerCase())
    .join(" ");

  const hasNewCapability = newCapabilityKeywords.some((keyword) =>
    allChangeText.includes(keyword)
  );

  if (hasNewCapability) {
    // Genuinely new capability → minor bump
    return `${major}.${minor + 1}.0`;
  }

  // Features that improve existing capabilities → patch bump
  return `${major}.${minor}.${patch + 1}`;
}

/**
 * Get current version from package.json
 */
function getCurrentVersion() {
  const packageJson = JSON.parse(readFileSync("./package.json", "utf8"));
  return packageJson.version;
}

/**
 * Update package.json version
 */
function updatePackageVersion(newVersion) {
  const packageJson = JSON.parse(readFileSync("./package.json", "utf8"));
  packageJson.version = newVersion;
  writeFileSync("./package.json", JSON.stringify(packageJson, null, 2) + "\n");
}

// NOTE: releases do NOT bump the service worker cache version. sw.js's
// CACHE_NAME is bumped manually, only on breaking cache-shape changes —
// bumping it per release would wipe every user's offline cache on each deploy.

/**
 * Prepare release in Firestore
 * (archives completed feedback and creates version record)
 */
async function prepareFirestoreRelease(
  version,
  changelogEntries,
  feedbackItems,
  highlights = []
) {
  const batch = db.batch();

  // Calculate summary counts
  const summary = { bugs: 0, features: 0, general: 0 };
  feedbackItems.forEach((item) => {
    if (item.type === "bug") summary.bugs++;
    else if (item.type === "feature") summary.features++;
    else summary.general++;
  });

  // Update all completed feedback items
  feedbackItems.forEach((item) => {
    const ref = db.collection("feedback").doc(item.id);
    batch.update(ref, {
      fixedInVersion: version,
      status: "archived",
      archivedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });

  // Create version document
  const versionRef = db.collection("versions").doc(version);
  const versionData = {
    version,
    feedbackCount: feedbackItems.length,
    feedbackSummary: summary,
    changelogEntries,
    releasedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  // Only include highlights if there are any (keeps data clean)
  if (highlights.length > 0) {
    versionData.highlights = highlights;
  }

  batch.set(versionRef, versionData);

  // Commit batch
  await batch.commit();
}

/**
 * Create version document in Firestore (for git history mode)
 * Creates version record without archiving feedback items
 */
async function createFirestoreVersion(version, changelogEntries, highlights = []) {
  const versionRef = db.collection("versions").doc(version);

  const versionData = {
    version,
    feedbackCount: 0,
    feedbackSummary: { bugs: 0, features: 0, general: 0 },
    changelogEntries,
    releasedAt: admin.firestore.FieldValue.serverTimestamp(),
    source: "git-history", // Mark as generated from git history
  };

  // Only include highlights if there are any
  if (highlights.length > 0) {
    versionData.highlights = highlights;
  }

  // Use set with merge to handle both create and update scenarios
  await versionRef.set(versionData, { merge: true });
}

/**
 * Update release notes for an existing version
 * Updates both Firestore and GitHub release
 */
async function updateReleaseNotes(version, changelogEntries, highlights = []) {
  console.log(`\n📝 Updating release notes for v${version}...\n`);

  // 1. Update Firestore
  console.log("✓ Updating Firestore version document...");
  const versionRef = db.collection("versions").doc(version);
  const updateData = {
    changelogEntries,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  if (highlights.length > 0) {
    updateData.highlights = highlights;
  }

  await versionRef.set(updateData, { merge: true });

  // 2. Update GitHub release
  console.log("✓ Updating GitHub release...");
  const releaseNotes = formatGitHubReleaseNotes(changelogEntries);

  // Write to temp file
  writeFileSync(".release-notes.tmp", releaseNotes);

  try {
    execSync(`gh release edit v${version} --notes-file .release-notes.tmp`, {
      stdio: "inherit",
    });
  } finally {
    try {
      execSync("rm .release-notes.tmp", { stdio: "ignore" });
    } catch (e) {
      // Ignore cleanup errors
    }
  }

  console.log(`\n✅ Release notes updated for v${version}!\n`);
}

/**
 * Format changelog entries for GitHub release notes
 */
function formatGitHubReleaseNotes(changelog) {
  const fixed = changelog.filter((e) => e.category === "fixed");
  const added = changelog.filter((e) => e.category === "added");
  const improved = changelog.filter((e) => e.category === "improved");

  let releaseNotes = "";

  if (fixed.length > 0) {
    releaseNotes += "## 🐛 Bug Fixes\n\n";
    fixed.forEach((e) => {
      releaseNotes += `- ${e.text}\n`;
    });
    releaseNotes += "\n";
  }

  if (added.length > 0) {
    releaseNotes += "## ✨ New Features\n\n";
    added.forEach((e) => {
      releaseNotes += `- ${e.text}\n`;
    });
    releaseNotes += "\n";
  }

  if (improved.length > 0) {
    releaseNotes += "## 🔧 Improvements\n\n";
    improved.forEach((e) => {
      releaseNotes += `- ${e.text}\n`;
    });
    releaseNotes += "\n";
  }

  return releaseNotes;
}

/**
 * Check git status
 */
function checkGitStatus() {
  try {
    const status = execSync("git status --porcelain", { encoding: "utf8" });
    return status.trim();
  } catch (error) {
    return "";
  }
}

/**
 * Get current git branch
 */
function getCurrentBranch() {
  try {
    return execSync("git branch --show-current", { encoding: "utf8" }).trim();
  } catch (error) {
    return null;
  }
}

/**
 * Switch to a git branch
 */
function switchToBranch(branch) {
  execSync(`git checkout ${branch}`, { stdio: "inherit" });
}

/**
 * Merge a branch into current branch
 */
function mergeBranch(sourceBranch) {
  execSync(`git merge ${sourceBranch} --no-edit`, { stdio: "inherit" });
}

/**
 * Stash changes if there are any
 * Returns true if changes were stashed
 */
function stashChanges() {
  const status = checkGitStatus();
  if (status) {
    execSync('git stash push -m "release-script-auto-stash"', {
      stdio: "inherit",
    });
    return true;
  }
  return false;
}

/**
 * Pop stashed changes
 */
function popStash() {
  try {
    execSync("git stash pop", { stdio: "inherit" });
  } catch (error) {
    console.log("⚠️  Could not restore stashed changes automatically.");
    console.log('   Run "git stash pop" manually if needed.');
  }
}

/**
 * Push the branch and only this release's tag to remote
 */
function pushToRemote(branch, version) {
  execSync(`git push origin ${branch}`, { stdio: "inherit" });
  execSync(`git push origin refs/tags/v${version}`, { stdio: "inherit" });
}

/**
 * Create git commit and tag
 */
function createGitRelease(version, changelog) {
  // Stage package.json. sw.js is deliberately NOT staged — releases no longer
  // touch it, and staging it here would sweep unrelated in-flight sw.js edits
  // into the release commit.
  execSync("git add package.json", { stdio: "inherit" });

  // Create commit message
  const changelogSummary = changelog
    .slice(0, 5)
    .map((e) => `- ${e.text}`)
    .join("\n");

  const commitMessage = `chore(release): v${version}

${changelogSummary}${changelog.length > 5 ? "\n..." : ""}

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>`;

  // Create commit — scope to the release files via explicit pathspec so a
  // shared index containing another agent's staged work is NOT swept in.
  const releasePaths = ["package.json"];
  if (existsSync("./static/thumbnails")) releasePaths.push("static/thumbnails");
  const pathspec = releasePaths.join(" ");
  execSync(`git commit -m "${commitMessage.replace(/"/g, '\\"')}" -- ${pathspec}`, {
    stdio: "inherit",
  });

  // Create annotated tag
  const tagMessage = changelog.map((e) => `- ${e.text}`).join("\n");
  execSync(`git tag -a v${version} -m "Release v${version}\n\n${tagMessage}"`, {
    stdio: "inherit",
  });
}

/**
 * Create GitHub release
 */
function createGitHubRelease(version, changelog) {
  const releaseNotes = formatGitHubReleaseNotes(changelog);

  // Write release notes to temp file to handle special characters
  writeFileSync(".release-notes.tmp", releaseNotes);

  try {
    // Create GitHub release
    execSync(
      `gh release create v${version} --title "v${version}" --notes-file .release-notes.tmp`,
      {
        stdio: "inherit",
      }
    );
  } finally {
    // Clean up temp file
    try {
      execSync("rm .release-notes.tmp", { stdio: "ignore" });
    } catch (e) {
      // Ignore cleanup errors
    }
  }
}

/**
 * Display changelog preview
 */
function displayChangelog(entries) {
  const fixed = entries.filter((e) => e.category === "fixed");
  const added = entries.filter((e) => e.category === "added");
  const improved = entries.filter((e) => e.category === "improved");

  console.log("\n📋 Changelog Preview:\n");

  if (fixed.length > 0) {
    console.log("  🐛 Fixed:");
    fixed.forEach((e) => console.log(`     - ${e.text}`));
    console.log("");
  }

  if (added.length > 0) {
    console.log("  ✨ Added:");
    added.forEach((e) => console.log(`     - ${e.text}`));
    console.log("");
  }

  if (improved.length > 0) {
    console.log("  🔧 Improved:");
    improved.forEach((e) => console.log(`     - ${e.text}`));
    console.log("");
  }
}

/**
 * Show what was released in the last version
 */
async function showLastRelease() {
  console.log("📦 Last Release Summary\n");
  console.log("=".repeat(70));

  try {
    // Get latest version from git tags
    const latestTag = getLatestTag();

    if (!latestTag) {
      console.log("\n⚠️  No releases found.");
      console.log("   Create your first release with /release\n");
      return;
    }

    const version = latestTag;
    console.log(`\n🏷️  Version: v${version}\n`);

    // Get tag date and message
    try {
      const tagInfo = execSync(`git tag -l -n99 v${version}`, {
        encoding: "utf8",
      }).trim();
      const tagDate = execSync(`git log -1 --format=%ai v${version}`, {
        encoding: "utf8",
      }).trim();

      console.log(`📅 Released: ${tagDate}\n`);
    } catch (e) {
      // Ignore if we can't get tag info
    }

    // Query Firestore for feedback items fixed in this version
    const snapshot = await db
      .collection("feedback")
      .where("fixedInVersion", "==", version)
      .get();

    if (snapshot.empty) {
      console.log("⚠️  No feedback items found for this version in Firestore.");
      console.log("   This might be a git-only release.\n");

      // Show git tag message as fallback
      try {
        const tagMessage = execSync(
          `git tag -l -n99 v${version} | tail -n +2`,
          { encoding: "utf8" }
        ).trim();
        if (tagMessage) {
          console.log("📋 Release Notes:\n");
          console.log(tagMessage);
          console.log("");
        }
      } catch (e) {
        // Ignore
      }
      return;
    }

    const items = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    // Group by type
    const bugs = items.filter((i) => i.type === "bug");
    const features = items.filter((i) => i.type === "feature");
    const general = items.filter((i) => i.type === "general");

    console.log(`✅ Shipped ${items.length} items:`);
    console.log(`   🐛 ${bugs.length} bug fixes`);
    console.log(`   ✨ ${features.length} new features`);
    console.log(`   🔧 ${general.length} improvements\n`);

    console.log("─".repeat(70));

    // Show details
    if (bugs.length > 0) {
      console.log("\n🐛 Bug Fixes:\n");
      bugs.forEach((item) => {
        const title =
          item.title || item.description?.substring(0, 60) || "Untitled";
        console.log(`   • ${title}${item.title ? "" : "..."}`);
        if (item.id) {
          console.log(`     └─ ID: ${item.id.substring(0, 8)}...`);
        }
      });
    }

    if (features.length > 0) {
      console.log("\n✨ New Features:\n");
      features.forEach((item) => {
        const title =
          item.title || item.description?.substring(0, 60) || "Untitled";
        console.log(`   • ${title}${item.title ? "" : "..."}`);
        if (item.id) {
          console.log(`     └─ ID: ${item.id.substring(0, 8)}...`);
        }
      });
    }

    if (general.length > 0) {
      console.log("\n🔧 Improvements:\n");
      general.forEach((item) => {
        const title =
          item.title || item.description?.substring(0, 60) || "Untitled";
        console.log(`   • ${title}${item.title ? "" : "..."}`);
        if (item.id) {
          console.log(`     └─ ID: ${item.id.substring(0, 8)}...`);
        }
      });
    }

    console.log("\n" + "─".repeat(70));
    console.log(`\n💡 View on GitHub: gh release view v${version}`);
    console.log(
      `💡 In app: "What's New" modal shows automatically on first login\n`
    );
  } catch (error) {
    console.error("❌ Error fetching last release:", error.message);
    process.exit(1);
  }
}

/**
 * Main release flow
 */
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const quickPreview = args.includes("--preview") || args.includes("-p");
  const showLast = args.includes("--show-last") || args.includes("--last");
  const manualVersionIndex = args.indexOf("--version");
  const manualVersion =
    manualVersionIndex >= 0 ? args[manualVersionIndex + 1] : null;
  const changelogFileIndex = args.indexOf("--changelog");
  const changelogFile =
    changelogFileIndex >= 0 ? args[changelogFileIndex + 1] : null;
  const highlightsIndex = args.indexOf("--highlights");
  const highlightsArg =
    highlightsIndex >= 0 ? args[highlightsIndex + 1] : null;
  const fromMain = args.includes("--from-main");
  const autoGate = args.includes("--auto-gate");
  const updateNotesIndex = args.indexOf("--update-notes");
  const updateNotesVersion =
    updateNotesIndex >= 0 ? args[updateNotesIndex + 1] : null;

  // Update existing release notes mode
  if (updateNotesVersion) {
    if (!changelogFile || !existsSync(changelogFile)) {
      console.error("❌ --update-notes requires --changelog <file.json>");
      console.error("   Usage: node scripts/release.js --update-notes 0.7.11 --changelog notes.json");
      process.exit(1);
    }

    try {
      const changelog = JSON.parse(readFileSync(changelogFile, "utf8"));

      // Parse highlights if provided
      let highlights = [];
      if (highlightsArg && highlightsArg !== "none" && highlightsArg !== "0") {
        const potentialHighlights = changelog
          .filter((e) => e.category === "added" || e.category === "improved")
          .map((e) => e.text);

        if (highlightsArg === "all") {
          highlights = potentialHighlights;
        } else {
          const indices = highlightsArg
            .split(",")
            .map((s) => parseInt(s.trim()) - 1)
            .filter((i) => i >= 0 && i < potentialHighlights.length);
          highlights = indices.map((i) => potentialHighlights[i]);
        }
      }

      await updateReleaseNotes(updateNotesVersion, changelog, highlights);
      process.exit(0);
    } catch (error) {
      console.error(`❌ Failed to update release notes: ${error.message}`);
      process.exit(1);
    }
  }

  // Show last release mode
  if (showLast) {
    await showLastRelease();
    process.exit(0);
  }

  // Check current branch
  const startingBranch = getCurrentBranch();
  const isOnDevelop = startingBranch === "develop";
  const isOnMain = startingBranch === "main";

  // Quick preview mode - minimal output
  if (quickPreview) {
    console.log("🔍 Quick Release Preview\n");
  } else {
    console.log("📦 Starting release process...\n");
  }

  // Branch check (skip for preview modes)
  if (!dryRun && !quickPreview) {
    console.log(`🌿 Current branch: ${startingBranch}`);

    if (!isOnDevelop && !isOnMain) {
      console.error(`\n❌ You must be on 'develop' or 'main' to release.`);
      console.error(`   Currently on: ${startingBranch}`);
      console.error(`   Switch to develop: git checkout develop\n`);
      process.exit(1);
    }

    if (isOnMain && !fromMain) {
      console.log(`\n⚠️  You're on 'main' branch.`);
      console.log(`   Releases should typically be made from 'develop'.`);
      console.log(`   Add --from-main flag to release directly from main.\n`);
      process.exit(1);
    }

    if (isOnDevelop) {
      console.log(`   ✓ Will merge develop → main, then release on main\n`);
    }
  }

  // 1. Check completed feedback
  console.log("🔍 Checking completed feedback...");
  const feedbackItems = await getCompletedFeedback();

  let changelog;
  let useGitHistory = false;
  let useCustomChangelog = false;

  // Check if a custom changelog file was provided (user-friendly entries from Claude)
  if (changelogFile && existsSync(changelogFile)) {
    try {
      const customEntries = JSON.parse(readFileSync(changelogFile, "utf8"));
      changelog = prepareCustomChangelog(customEntries);
      if (!changelog) process.exit(1);
      useCustomChangelog = true;
      console.log(`✓ Using custom changelog from ${changelogFile}`);
      console.log(`  (${changelog.length} user-friendly entries)\n`);
    } catch (error) {
      console.error(`❌ Failed to parse changelog file: ${error.message}`);
      process.exit(1);
    }
  } else if (feedbackItems.length === 0) {
    console.log("⚠️  No completed feedback found.");
    console.log("📝 Using git commit history instead...\n");

    changelog = generateChangelogFromGitHistory();

    if (changelog.length === 0) {
      console.error("❌ No commits found to release.");
      console.error("   Either:");
      console.error("   1. Complete some feedback items, or");
      console.error("   2. Make some commits to include in the release");
      process.exit(1);
    }

    useGitHistory = true;
    console.log(`✓ Found ${changelog.length} commits since last release\n`);
  } else {
    const { userFacing, developerNotes } =
      generateChangelogFromFeedback(feedbackItems);

    // Count user-facing items only for summary
    const summary = { bugs: 0, features: 0, general: 0 };
    feedbackItems
      .filter((item) => !item.isInternalOnly)
      .forEach((item) => {
        if (item.type === "bug") summary.bugs++;
        else if (item.type === "feature") summary.features++;
        else summary.general++;
      });

    console.log(`✓ Found ${userFacing.length} completed items`);
    console.log(
      `  (${summary.bugs} bugs, ${summary.features} features, ${summary.general} general)\n`
    );

    if (developerNotes.length > 0) {
      console.log(
        `📝 ${developerNotes.length} internal-only items (excluded from user changelog)\n`
      );
    }

    // Use only user-facing items for changelog
    changelog = userFacing;
  }

  // Always audit the release's commit range. Custom and feedback changelogs
  // still need the same dark-module and guest/account visibility evidence as
  // raw git-history notes.
  const latestTag = getLatestTag();
  const range = latestTag ? `v${latestTag}..HEAD` : "HEAD";
  ({ changelog } = applyModuleGate(
    changelog,
    range,
    autoGate && useGitHistory
  ));

  if (args.includes("--confirm") && !useCustomChangelog) {
    console.error(
      "❌ A release requires an audited custom changelog via --changelog <file.json>."
    );
    console.error(
      "   Each entry must declare its guest/account audience and user-facing surface.\n"
    );
    process.exit(1);
  }

  // 2. Determine version
  const currentVersion = getCurrentVersion();
  const suggestedVersion =
    manualVersion || suggestVersion(currentVersion, changelog);

  console.log(`📌 Current version: ${currentVersion}`);
  console.log(`📌 Suggested version: ${suggestedVersion}`);

  // Explain the bump type
  const parts = currentVersion.split(".");
  const currentMinor = parseInt(parts[1]) || 0;
  const suggestedParts = suggestedVersion.split(".");
  const suggestedMinor = parseInt(suggestedParts[1]) || 0;

  if (suggestedMinor > currentMinor) {
    console.log("   (minor bump - new user-facing capability detected)");
  } else {
    console.log("   (patch bump - fixes and improvements)");
  }

  console.log("   💡 Override with: --version X.Y.Z");
  console.log("");

  // 3. Display changelog
  displayChangelog(changelog);

  // 4. Check every changelog for jargon. A custom file is no longer assumed to
  // be vetted merely because an agent wrote it.
  const jargonIssues = detectJargon(changelog);
  const jargonOk = displayJargonWarnings(jargonIssues);

  if (!jargonOk && !args.includes("--skip-jargon-check")) {
    console.log(
      "💡 Fix the jargon issues above, or add --skip-jargon-check to proceed anyway.\n"
    );
    if (!dryRun && !quickPreview) {
      process.exit(1);
    }
  }

  // 5. Check git status
  const gitStatus = checkGitStatus();
  if (gitStatus) {
    console.log("⚠️  Warning: Working directory has uncommitted changes:");
    console.log(
      gitStatus
        .split("\n")
        .map((line) => `   ${line}`)
        .join("\n")
    );
    console.log("");
  }

  if (dryRun || quickPreview) {
    if (quickPreview) {
      console.log(
        "\n💡 Tip: Run /release to create this release interactively."
      );
    } else {
      console.log("🔍 Dry run complete. No changes made.");
    }
    process.exit(0);
  }

  // In actual use, Claude will handle confirmation via AskUserQuestion
  // For now, require --confirm flag
  if (!args.includes("--confirm")) {
    console.log("💡 This is a preview. Add --confirm to execute the release.");
    console.log("   Or use the /release slash command for interactive flow.");
    process.exit(0);
  }

  // 5. Get highlights (from CLI flag or interactive prompt)
  let selectedHighlights = [];
  if (!useGitHistory && feedbackItems.length > 0) {
    // Get potential highlights (features and major improvements)
    const potentialHighlights = changelog
      .filter((e) => e.category === "added" || e.category === "improved")
      .map((e) => e.text);

    if (highlightsArg !== null) {
      // Use CLI-provided highlights (non-interactive mode for Claude)
      if (highlightsArg === "none" || highlightsArg === "0") {
        console.log("✓ No highlights selected (via --highlights flag)\n");
        selectedHighlights = [];
      } else if (highlightsArg === "all") {
        // Select all potential highlights
        selectedHighlights = potentialHighlights;
        console.log("✓ Selected ALL highlights (via --highlights all):");
        selectedHighlights.forEach((h) => console.log(`   • ${h}`));
        console.log("");
      } else {
        // Parse comma-separated indices (1-based)
        const indices = highlightsArg
          .split(",")
          .map((s) => parseInt(s.trim()) - 1)
          .filter((i) => i >= 0 && i < potentialHighlights.length);

        selectedHighlights = indices.map((i) => potentialHighlights[i]);

        if (selectedHighlights.length > 0) {
          console.log("✓ Selected highlights (via --highlights flag):");
          selectedHighlights.forEach((h) => console.log(`   • ${h}`));
          console.log("");
        }
      }
    } else {
      // Interactive mode (fallback)
      selectedHighlights = await promptForHighlights(changelog);
    }
  }

  // 6. Execute release
  console.log("🚀 Executing release...\n");

  let didStash = false;

  // Branch workflow: stash, switch to main, merge develop
  if (isOnDevelop) {
    // Stash any uncommitted changes
    const gitStatus = checkGitStatus();
    if (gitStatus) {
      console.log("📦 Stashing uncommitted changes...");
      didStash = stashChanges();
    }

    // Switch to main
    console.log("🔀 Switching to main branch...");
    switchToBranch("main");

    // Pull latest main (in case remote has changes)
    try {
      console.log("⬇️  Pulling latest main...");
      execSync("git pull origin main --no-edit", { stdio: "inherit" });
    } catch (error) {
      console.log("   (No remote changes or not connected)");
    }

    // Merge develop into main
    console.log("🔀 Merging develop → main...");
    mergeBranch("develop");
  }

  // Update package.json
  console.log("✓ Updating package.json...");
  updatePackageVersion(suggestedVersion);

  // Prepare Firestore
  if (!useGitHistory && feedbackItems.length > 0) {
    console.log("✓ Archiving feedback in Firestore...");
    // Use custom changelog entries if provided, otherwise use generated ones
    // Include selected highlights (if any) in the version document
    await prepareFirestoreRelease(
      suggestedVersion,
      changelog,
      feedbackItems,
      selectedHighlights
    );
  } else {
    // Create version document even with 0 feedback (changelog still needs to be stored)
    console.log("✓ Creating version record in Firestore...");
    await createFirestoreVersion(suggestedVersion, changelog, selectedHighlights);
  }

  // Sync static thumbnails from cloud for instant loading
  console.log("✓ Syncing static thumbnails from cloud...");
  try {
    execSync("node scripts/sync-static-thumbnails.cjs", { stdio: "inherit" });
    // Stage the new/updated thumbnails
    execSync("git add static/thumbnails", { stdio: "pipe" });
  } catch (error) {
    console.log("   ⚠️  Thumbnail sync failed (non-fatal):", error.message);
  }

  // Create git commit and tag
  console.log("✓ Creating git commit and tag...");
  createGitRelease(suggestedVersion, changelog);

  // Push main branch and tags
  console.log("✓ Pushing to remote...");
  pushToRemote("main", suggestedVersion);

  // Create GitHub release
  console.log("✓ Creating GitHub release...");
  createGitHubRelease(suggestedVersion, changelog);

  // Note: "What's New" modal is handled by WhatsNewChecker component
  // which reads from the 'versions' collection created above

  // Switch back to develop and restore stash
  if (isOnDevelop) {
    console.log("🔀 Switching back to develop...");
    switchToBranch("develop");

    // Merge main back to develop (so develop has the version bump)
    console.log("🔀 Syncing main → develop...");
    mergeBranch("main");

    // Push develop
    console.log("✓ Pushing develop...");
    execSync("git push origin develop", { stdio: "inherit" });

    // Restore stashed changes
    if (didStash) {
      console.log("📦 Restoring stashed changes...");
      popStash();
    }
  }

  console.log(`\n🎉 Release v${suggestedVersion} complete!\n`);
  console.log("   Summary:");
  console.log(`   - Version: v${suggestedVersion}`);
  console.log(`   - Branch: main (tagged and pushed)`);
  console.log(`   - Current branch: ${isOnDevelop ? "develop" : "main"}`);
  console.log("");
  console.log("   View the release:");
  console.log(`   - GitHub: gh release view v${suggestedVersion}`);
  console.log(
    '   - In app: "What\'s New" modal shows automatically on first login'
  );
  console.log("");

  process.exit(0);
}

main().catch((error) => {
  console.error("❌ Release failed:", error.message);
  process.exit(1);
});
