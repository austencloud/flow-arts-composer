#!/usr/bin/env node
/**
 * Audit script for prefers-reduced-motion support
 *
 * Finds all files with @keyframes or animation properties that
 * don't have corresponding @media (prefers-reduced-motion) support.
 *
 * Usage:
 *   node scripts/audit-reduced-motion.cjs [--verbose] [--fix-count]
 *
 * Options:
 *   --verbose    Show detailed information about each file
 *   --fix-count  Only show the count of files needing fixes
 *   --json       Output as JSON for programmatic use
 */

const fs = require("fs");
const path = require("path");

// Files/folders to exclude
const EXCLUDE_PATTERNS = [
  "node_modules",
  ".svelte-kit",
  "build",
  "dist",
  ".git",
  "keyframes.css", // Our centralized file already has reduced-motion
  "app.css", // Already has comprehensive reduced-motion
];

// Keyframe names from our centralized file (can use these globally)
const CENTRALIZED_KEYFRAMES = [
  "spin",
  "spin-reverse",
  "pulse",
  "pulse-scale",
  "pulse-glow",
  "fadeIn",
  "fadeOut",
  "slideUp",
  "slideDown",
  "slideLeft",
  "slideRight",
  "scaleIn",
  "scaleOut",
  "popIn",
  "bounce",
  "shake",
  "shimmer",
  // Also keyframes already in app.css
  "star-twinkle-animation",
  "aurora-animation",
  "bubble-rise",
  "module-slide-out-left",
  "module-slide-in-left",
  "module-slide-out-right",
  "module-slide-in-right",
  "tab-slide-out-left",
  "tab-slide-in-left",
  "tab-slide-out-right",
  "tab-slide-in-right",
];

const args = process.argv.slice(2);
const verbose = args.includes("--verbose");
const fixCountOnly = args.includes("--fix-count");
const jsonOutput = args.includes("--json");
const scopeIdx = args.indexOf("--scope");
const scopePath = scopeIdx !== -1 ? args[scopeIdx + 1] : null;
const searchDir = scopePath ? `src/lib/${scopePath}` : "src/";

function shouldExclude(filePath) {
  return EXCLUDE_PATTERNS.some((pattern) => filePath.includes(pattern));
}

function findFilesWithKeyframes() {
  const results = [];
  const root = path.resolve(process.cwd(), searchDir);

  function visit(directory) {
    if (!fs.existsSync(directory) || shouldExclude(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(absolutePath);
        continue;
      }
      if (!/\.(?:svelte|css)$/.test(entry.name)) continue;
      const relativePath = path.relative(process.cwd(), absolutePath);
      if (shouldExclude(relativePath)) continue;
      if (fs.readFileSync(absolutePath, "utf-8").includes("@keyframes")) {
        results.push(relativePath);
      }
    }
  }

  visit(root);
  return results;
}

function analyzeFile(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");

  // Find all @keyframes definitions
  const keyframeMatches = content.match(/@keyframes\s+([a-zA-Z0-9_-]+)/g) || [];
  const keyframeNames = keyframeMatches.map((m) =>
    m.replace("@keyframes ", "").trim()
  );

  // Filter out keyframes that are defined in centralized file
  const localKeyframes = keyframeNames.filter(
    (name) => !CENTRALIZED_KEYFRAMES.includes(name)
  );

  // Check if file has prefers-reduced-motion media query
  const hasReducedMotion = content.includes("prefers-reduced-motion");

  // Check if file uses animation: property
  const usesAnimation = /@?animation\s*:/.test(content);

  // Check if reduced-motion handling actually addresses the animations
  let reducedMotionCoversAnimations = false;
  if (hasReducedMotion) {
    // Look for animation: none or animation-duration: 0 patterns
    const reducedMotionSection = content.match(
      /@media[^{]*prefers-reduced-motion[^{]*\{([^}]+\{[^}]+\})+\s*\}/gs
    );
    if (reducedMotionSection) {
      const section = reducedMotionSection.join("");
      reducedMotionCoversAnimations =
        section.includes("animation: none") ||
        section.includes("animation-duration: 0") ||
        section.includes("animation-duration: 0.01ms") ||
        section.includes("animation: inherit");
    }
  }

  return {
    filePath,
    keyframeNames,
    localKeyframes,
    hasReducedMotion,
    usesAnimation,
    reducedMotionCoversAnimations,
    needsFix:
      (localKeyframes.length > 0 || usesAnimation) &&
      !reducedMotionCoversAnimations,
  };
}

function main() {
  if (!jsonOutput) {
    console.log("Auditing for prefers-reduced-motion support...\n");
  }

  const files = findFilesWithKeyframes();
  const analyses = files.map(analyzeFile);

  const needingFix = analyses.filter((a) => a.needsFix);
  const alreadyOk = analyses.filter((a) => !a.needsFix);

  if (jsonOutput) {
    console.log(
      JSON.stringify(
        {
          total: files.length,
          needingFix: needingFix.length,
          alreadyOk: alreadyOk.length,
          files: needingFix.map((a) => ({
            path: a.filePath,
            keyframes: a.localKeyframes,
            usesAnimation: a.usesAnimation,
          })),
        },
        null,
        2
      )
    );
    return;
  }

  if (fixCountOnly) {
    console.log(`Files needing reduced-motion support: ${needingFix.length}`);
    return;
  }

  // Group by directory for better organization
  const byDirectory = {};
  for (const analysis of needingFix) {
    const dir = path.dirname(analysis.filePath);
    if (!byDirectory[dir]) byDirectory[dir] = [];
    byDirectory[dir].push(analysis);
  }

  console.log("FILES NEEDING REDUCED-MOTION SUPPORT:");
  console.log("=====================================\n");

  for (const [dir, files] of Object.entries(byDirectory).sort()) {
    console.log(`\n${dir}/`);
    for (const analysis of files) {
      const fileName = path.basename(analysis.filePath);
      const keyframes = analysis.localKeyframes.length
        ? ` (keyframes: ${analysis.localKeyframes.join(", ")})`
        : "";
      const animUse = analysis.usesAnimation ? " (uses animation:)" : "";
      console.log(`  - ${fileName}${keyframes}${animUse}`);

      if (verbose) {
        console.log(
          `      Has @media reduced-motion: ${analysis.hasReducedMotion}`
        );
        console.log(
          `      Reduced-motion covers animations: ${analysis.reducedMotionCoversAnimations}`
        );
      }
    }
  }

  console.log("\n=====================================");
  console.log(`Total files with @keyframes: ${files.length}`);
  console.log(`Files needing fixes: ${needingFix.length}`);
  console.log(`Files already OK: ${alreadyOk.length}`);

  if (needingFix.length > 0) {
    console.log("\n\nSUGGESTED FIX PATTERN:");
    console.log("----------------------");
    console.log(`
Add to each file's <style> section:

@media (prefers-reduced-motion: reduce) {
  .your-animated-class {
    animation: none;
  }
}

Or for inline animations, ensure the duration is 0:

@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
  }
}
`);
  }

  // Exit with error code if there are files needing fixes
  process.exit(needingFix.length > 0 ? 1 : 0);
}

main();
