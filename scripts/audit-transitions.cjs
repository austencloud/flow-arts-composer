#!/usr/bin/env node
/**
 * Audit script for svelte/transition usage
 *
 * Finds files that directly import from 'svelte/transition' instead of
 * using the centralized transition system in src/lib/shared/transitions/transitions.ts
 *
 * Usage:
 *   node scripts/audit-transitions.cjs [--verbose] [--json]
 *
 * Options:
 *   --verbose  Show which transitions are used in each file
 *   --json     Output as JSON for programmatic use
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
  // Our centralized transitions file can import from svelte/transition
  "transitions.ts",
  "transitions/index.ts",
];

// Mapping from svelte/transition to centralized alternatives
const TRANSITION_MAPPING = {
  fade: {
    replacement: "fadeStandard or fadeEmphasis",
    import:
      "import { fadeStandard, fadeEmphasis } from '#lib/shared/transitions/transitions.js'",
    notes: "fadeStandard for quick fades, fadeEmphasis for important content",
  },
  fly: {
    replacement: "flyUp, flyDown, flyLeft, or flyRight",
    import:
      "import { flyUp, flyDown, flyLeft, flyRight } from '#lib/shared/transitions/transitions.js'",
    notes:
      "Choose based on direction; uses consistent DURATION and SLIDE_DISTANCE",
  },
  slide: {
    replacement: "flyUp or flyDown with custom params",
    import: "import { flyUp } from '#lib/shared/transitions/transitions.js'",
    notes: "slide can be replaced with fly using appropriate y values",
  },
  scale: {
    replacement: "scalePop or scaleSpring",
    import:
      "import { scalePop, scaleSpring } from '#lib/shared/transitions/transitions.js'",
    notes: "scalePop for modals/cards, scaleSpring for bouncy interactions",
  },
  blur: {
    replacement: "(custom implementation)",
    import: null,
    notes: "No centralized blur - add if needed, or use fade",
  },
  draw: {
    replacement: "(keep as-is)",
    import: null,
    notes: "SVG-specific, keep direct import",
  },
  crossfade: {
    replacement: "(keep as-is)",
    import: null,
    notes: "Complex transition, keep direct import",
  },
};

const args = process.argv.slice(2);
const verbose = args.includes("--verbose");
const jsonOutput = args.includes("--json");
const scopeIdx = args.indexOf("--scope");
const scopePath = scopeIdx !== -1 ? args[scopeIdx + 1] : null;
const searchDir = scopePath ? `src/lib/${scopePath}` : "src/";

function shouldExclude(filePath) {
  return EXCLUDE_PATTERNS.some((pattern) => filePath.includes(pattern));
}

function findFilesWithSvelteTransitions() {
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
      if (!/\.(?:svelte|ts)$/.test(entry.name)) continue;
      const relativePath = path.relative(process.cwd(), absolutePath);
      if (shouldExclude(relativePath)) continue;
      if (
        /from\s*['"]svelte\/transition['"]/.test(
          fs.readFileSync(absolutePath, "utf-8")
        )
      ) {
        results.push(relativePath);
      }
    }
  }

  visit(root);
  return results;
}

function analyzeFile(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");

  // Find the import statement
  const importMatch = content.match(
    /import\s*\{([^}]+)\}\s*from\s*["']svelte\/transition["']/
  );

  if (!importMatch) {
    return null;
  }

  const importedTransitions = importMatch[1]
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  // Categorize transitions
  const replaceable = [];
  const keepAsIs = [];

  for (const transition of importedTransitions) {
    const mapping = TRANSITION_MAPPING[transition];
    if (mapping && mapping.import) {
      replaceable.push({
        name: transition,
        replacement: mapping.replacement,
        import: mapping.import,
        notes: mapping.notes,
      });
    } else {
      keepAsIs.push(transition);
    }
  }

  // Check if file also imports from centralized transitions
  const usesCentralized = content.includes(
    "#lib/shared/transitions/transitions.js"
  );

  return {
    filePath,
    importedTransitions,
    replaceable,
    keepAsIs,
    usesCentralized,
    canFullyMigrate: keepAsIs.length === 0,
  };
}

function main() {
  if (!jsonOutput) {
    console.log("Auditing svelte/transition imports...\n");
  }

  const files = findFilesWithSvelteTransitions();
  const analyses = files.map(analyzeFile).filter(Boolean);

  // Categorize results
  const fullyMigratable = analyses.filter((a) => a.canFullyMigrate);
  const partiallyMigratable = analyses.filter(
    (a) => !a.canFullyMigrate && a.replaceable.length > 0
  );
  const keepAsIs = analyses.filter(
    (a) => a.replaceable.length === 0 && a.keepAsIs.length > 0
  );

  if (jsonOutput) {
    console.log(
      JSON.stringify(
        {
          total: files.length,
          fullyMigratable: fullyMigratable.length,
          partiallyMigratable: partiallyMigratable.length,
          keepAsIs: keepAsIs.length,
          files: analyses.map((a) => ({
            path: a.filePath,
            transitions: a.importedTransitions,
            canFullyMigrate: a.canFullyMigrate,
          })),
        },
        null,
        2
      )
    );
    return;
  }

  // Summary by transition type
  const transitionUsage = {};
  for (const analysis of analyses) {
    for (const t of analysis.importedTransitions) {
      transitionUsage[t] = (transitionUsage[t] || 0) + 1;
    }
  }

  console.log("TRANSITION USAGE SUMMARY:");
  console.log("=========================\n");
  for (const [transition, count] of Object.entries(transitionUsage).sort(
    (a, b) => b[1] - a[1]
  )) {
    const mapping = TRANSITION_MAPPING[transition] || { replacement: "N/A" };
    const migratable = mapping.import ? "✓" : "✗";
    console.log(
      `  ${migratable} ${transition}: ${count} files -> ${mapping.replacement}`
    );
  }

  console.log("\n\nFILES BY MIGRATION STATUS:");
  console.log("===========================\n");

  console.log(`\n✅ FULLY MIGRATABLE (${fullyMigratable.length} files):`);
  console.log("These files only use fade, fly, slide, or scale\n");
  for (const analysis of fullyMigratable.slice(0, 10)) {
    console.log(`  ${analysis.filePath}`);
    if (verbose) {
      console.log(`    Uses: ${analysis.importedTransitions.join(", ")}`);
    }
  }
  if (fullyMigratable.length > 10) {
    console.log(`  ... and ${fullyMigratable.length - 10} more`);
  }

  console.log(
    `\n⚠️  PARTIALLY MIGRATABLE (${partiallyMigratable.length} files):`
  );
  console.log("These files use some transitions that should stay as-is\n");
  for (const analysis of partiallyMigratable.slice(0, 10)) {
    console.log(`  ${analysis.filePath}`);
    if (verbose) {
      console.log(
        `    Migratable: ${analysis.replaceable.map((r) => r.name).join(", ")}`
      );
      console.log(`    Keep: ${analysis.keepAsIs.join(", ")}`);
    }
  }
  if (partiallyMigratable.length > 10) {
    console.log(`  ... and ${partiallyMigratable.length - 10} more`);
  }

  console.log(`\n✗ KEEP AS-IS (${keepAsIs.length} files):`);
  console.log(
    "These files only use transitions without centralized equivalents\n"
  );
  for (const analysis of keepAsIs.slice(0, 10)) {
    console.log(`  ${analysis.filePath}`);
    if (verbose) {
      console.log(`    Uses: ${analysis.importedTransitions.join(", ")}`);
    }
  }
  if (keepAsIs.length > 10) {
    console.log(`  ... and ${keepAsIs.length - 10} more`);
  }

  console.log("\n\n=====================================");
  console.log(`Total files with svelte/transition: ${files.length}`);
  console.log(`Fully migratable: ${fullyMigratable.length}`);
  console.log(`Partially migratable: ${partiallyMigratable.length}`);
  console.log(`Keep as-is: ${keepAsIs.length}`);

  console.log("\n\nMIGRATION GUIDE:");
  console.log("================");
  console.log(`
1. Replace imports:
   - import { fade } from 'svelte/transition'
   + import { fadeStandard } from '#lib/shared/transitions/transitions.js'

2. Update usage:
   - <div in:fade={{ duration: 200 }}>
   + <div in:fadeStandard>   (uses DURATION.fast = 150ms by default)

3. For custom durations, pass params:
   <div in:fadeStandard={{ duration: DURATION.emphasis }}>

4. Import duration constants if needed:
   import { DURATION, fadeStandard } from '#lib/shared/transitions/transitions.js'
`);
}

main();
