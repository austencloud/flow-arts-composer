/**
 * Dead Code Detector
 *
 * A custom script that understands this project's architecture:
 * - Dynamic module loaders (ModuleRenderer, BackgroundFactory, etc.)
 * - SvelteKit routes as entry points
 * - DI container registrations
 * - #lib import paths
 *
 * Run with: npx tsx scripts/find-dead-code.ts
 */

import * as ts from "typescript";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");
const SRC_DIR = path.join(PROJECT_ROOT, "src");

// Files/patterns to skip (external packages, SvelteKit internals, etc.)
const SKIP_PATTERNS = [
  /^[^./$#]/, // bare imports (npm packages) - but NOT #lib
  /^\$app\//, // SvelteKit internals
  /^virtual:/, // Vite virtual modules
  /^node:/, // Node.js built-ins
  /\.css$/, // CSS files
  /\.json$/, // JSON files (handled separately if needed)
];

// Known dynamic loader files that need special parsing
const DYNAMIC_LOADERS = [
  "src/lib/shared/modules/ModuleRenderer.svelte",
  "src/lib/shared/settings/components/SettingsTabContent.svelte",
  "src/lib/shared/background/shared/services/implementations/BackgroundFactory.ts",
  "src/lib/shared/3d-core/destinations/definitions.ts",
];

// Static entry points (always reachable)
const STATIC_ENTRY_PATTERNS = [
  "src/routes/**/*.svelte",
  "src/routes/**/*.ts",
  "src/hooks.*.ts",
  "src/app.d.ts",
  "src/lib/shared/di/**/*.ts",
  "vite.config.ts",
  "src/config/svelte-options.js",
];


interface ImportGraph {
  [filePath: string]: Set<string>;
}

interface AnalysisResult {
  totalFiles: number;
  reachableFiles: number;
  deadFiles: string[];
  deadByDirectory: { [dir: string]: string[] };
  warnings: string[];
}


function normalizePath(p: string): string {
  return p.replace(/\\/g, "/");
}

function getAllFiles(dir: string, extensions: string[]): string[] {
  const results: string[] = [];

  function walk(currentDir: string) {
    if (!fs.existsSync(currentDir)) return;

    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      // Skip node_modules, .svelte-kit, build directories
      if (
        entry.isDirectory() &&
        !["node_modules", ".svelte-kit", "build", ".git", "archive"].includes(
          entry.name
        )
      ) {
        walk(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (extensions.includes(ext)) {
          results.push(normalizePath(fullPath));
        }
      }
    }
  }

  walk(dir);
  return results;
}

function globMatch(pattern: string, filePath: string): boolean {
  // Simple glob matching for ** and *
  // Use placeholders to avoid double-replacement issues
  const regexPattern = pattern
    .replace(/\*\*\//g, "{{GLOB_ANY_PATH}}") // **/ = zero or more path segments
    .replace(/\*\*/g, "{{GLOB_ANY}}") // ** alone = any chars
    .replace(/\*/g, "[^/]*") // * = any chars except /
    .replace(/\//g, "\\/")
    .replace(/{{GLOB_ANY_PATH}}/g, "(?:.*\\/)?") // restore: optional path prefix
    .replace(/{{GLOB_ANY}}/g, ".*"); // restore: any chars

  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(filePath);
}

function getStaticEntryPoints(): string[] {
  const entries: string[] = [];
  const allFiles = getAllFiles(PROJECT_ROOT, [".ts", ".svelte", ".js"]);

  for (const file of allFiles) {
    const relativePath = normalizePath(path.relative(PROJECT_ROOT, file));
    for (const pattern of STATIC_ENTRY_PATTERNS) {
      if (globMatch(pattern, relativePath)) {
        entries.push(file);
        break;
      }
    }
  }

  return entries;
}

// ============================================================================
// SVELTE SCRIPT EXTRACTION
// ============================================================================

function extractSvelteScript(content: string): string {
  // Extract content from <script lang="ts"> or <script>
  const scriptMatch = content.match(
    /<script[^>]*(?:lang=["'](?:ts|typescript)["'])?[^>]*>([\s\S]*?)<\/script>/i
  );

  if (scriptMatch) {
    return scriptMatch[1];
  }

  return "";
}

// ============================================================================
// IMPORT EXTRACTION
// ============================================================================

function shouldSkipImport(specifier: string): boolean {
  return SKIP_PATTERNS.some((pattern) => pattern.test(specifier));
}

function resolveImportPath(
  specifier: string,
  containingFile: string,
  compilerOptions: ts.CompilerOptions
): string | null {
  // Skip external/virtual imports
  if (shouldSkipImport(specifier)) {
    return null;
  }

  // Handle #lib manually (more reliable than ts.resolveModuleName for this).
  // These imports name the emitted `.js` file; the source beside it is `.ts`.
  if (specifier.startsWith("#lib/")) {
    const resolved = path.join(
      SRC_DIR,
      "lib",
      specifier.slice(5).replace(/\.js$/, "") // Remove "#lib/" and ".js"
    );
    return resolveWithExtensions(resolved);
  }

  if (specifier.startsWith("#lib")) {
    const resolved = path.join(SRC_DIR, "lib");
    return resolveWithExtensions(resolved);
  }

  // Handle relative imports
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    const containingDir = path.dirname(containingFile);
    const resolved = path.resolve(containingDir, specifier);
    return resolveWithExtensions(resolved);
  }

  // For other paths, try ts.resolveModuleName
  const host: ts.ModuleResolutionHost = {
    fileExists: fs.existsSync,
    readFile: (fileName) => {
      try {
        return fs.readFileSync(fileName, "utf-8");
      } catch {
        return undefined;
      }
    },
  };

  const result = ts.resolveModuleName(
    specifier,
    containingFile,
    compilerOptions,
    host
  );

  if (result.resolvedModule) {
    return normalizePath(result.resolvedModule.resolvedFileName);
  }

  return null;
}

function resolveWithExtensions(basePath: string): string | null {
  const extensions = [".ts", ".svelte", ".js", "/index.ts", "/index.js"];

  // First check if the path already has an extension and exists
  if (fs.existsSync(basePath)) {
    const stat = fs.statSync(basePath);
    if (stat.isFile()) {
      return normalizePath(basePath);
    }
    if (stat.isDirectory()) {
      // Check for index files
      for (const ext of ["/index.ts", "/index.js", "/index.svelte"]) {
        const indexPath = basePath + ext;
        if (fs.existsSync(indexPath)) {
          return normalizePath(indexPath);
        }
      }
    }
  }

  // Try adding extensions
  for (const ext of extensions) {
    const fullPath = basePath + ext;
    if (fs.existsSync(fullPath)) {
      return normalizePath(fullPath);
    }
  }

  return null;
}

function extractImportsFromSource(
  sourceCode: string,
  filePath: string,
  compilerOptions: ts.CompilerOptions
): Set<string> {
  const imports = new Set<string>();

  const sourceFile = ts.createSourceFile(
    filePath,
    sourceCode,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith(".svelte") ? ts.ScriptKind.TS : undefined
  );

  function visit(node: ts.Node) {
    // Static imports: import X from "Y"
    if (ts.isImportDeclaration(node) && node.moduleSpecifier) {
      if (ts.isStringLiteral(node.moduleSpecifier)) {
        const specifier = node.moduleSpecifier.text;
        const resolved = resolveImportPath(
          specifier,
          filePath,
          compilerOptions
        );
        if (resolved) {
          imports.add(resolved);
        }
      }
    }

    // Export from: export * from "Y" or export { X } from "Y"
    if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      if (ts.isStringLiteral(node.moduleSpecifier)) {
        const specifier = node.moduleSpecifier.text;
        const resolved = resolveImportPath(
          specifier,
          filePath,
          compilerOptions
        );
        if (resolved) {
          imports.add(resolved);
        }
      }
    }

    // Dynamic imports: import("Y") or await import("Y")
    if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const arg = node.arguments[0];
        if (arg && ts.isStringLiteral(arg)) {
          const specifier = arg.text;
          const resolved = resolveImportPath(
            specifier,
            filePath,
            compilerOptions
          );
          if (resolved) {
            imports.add(resolved);
          }
        }
        // Template literal imports can't be statically analyzed
        // We'll catch these in the warnings
      }
    }

    ts.forEachChild(node, visit);
  }

  ts.forEachChild(sourceFile, visit);

  return imports;
}

function extractImportsFromFile(
  filePath: string,
  compilerOptions: ts.CompilerOptions
): Set<string> {
  try {
    let content = fs.readFileSync(filePath, "utf-8");

    // For Svelte files, extract the script content
    if (filePath.endsWith(".svelte")) {
      content = extractSvelteScript(content);
    }

    if (!content.trim()) {
      return new Set();
    }

    return extractImportsFromSource(content, filePath, compilerOptions);
  } catch (error) {
    console.warn(`Warning: Could not parse ${filePath}: ${error}`);
    return new Set();
  }
}

// ============================================================================
// DYNAMIC LOADER PARSING
// ============================================================================

function extractDynamicLoaderTargets(
  filePath: string,
  compilerOptions: ts.CompilerOptions
): string[] {
  const targets: string[] = [];

  try {
    let content = fs.readFileSync(filePath, "utf-8");

    if (filePath.endsWith(".svelte")) {
      content = extractSvelteScript(content);
    }

    // Find all dynamic import() calls with string literals
    const importRegex = /import\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g;
    let match;

    while ((match = importRegex.exec(content)) !== null) {
      const specifier = match[1];
      const resolved = resolveImportPath(specifier, filePath, compilerOptions);
      if (resolved) {
        targets.push(resolved);
      }
    }
  } catch (error) {
    console.warn(`Warning: Could not parse dynamic loader ${filePath}: ${error}`);
  }

  return targets;
}

// ============================================================================
// GRAPH BUILDING & REACHABILITY
// ============================================================================

// Debug specific file - set to filename to debug, or empty string to disable
const DEBUG_FILE = "";

function buildImportGraph(
  files: string[],
  compilerOptions: ts.CompilerOptions
): ImportGraph {
  const graph: ImportGraph = {};

  for (const file of files) {
    const imports = extractImportsFromFile(file, compilerOptions);
    graph[file] = imports;

    // Debug output for specific file
    if (DEBUG_FILE && file.includes(DEBUG_FILE)) {
      console.log(`\n[DEBUG] ${file}`);
      console.log(`  Imports found: ${imports.size}`);
      for (const imp of imports) {
        console.log(`    -> ${imp}`);
      }
    }
  }

  return graph;
}

function findReachableFiles(
  entryPoints: string[],
  graph: ImportGraph
): Set<string> {
  const visited = new Set<string>();
  const queue = [...entryPoints];

  while (queue.length > 0) {
    const current = queue.shift()!;

    if (visited.has(current)) {
      continue;
    }

    visited.add(current);

    const dependencies = graph[current];
    if (dependencies) {
      for (const dep of dependencies) {
        if (!visited.has(dep)) {
          queue.push(dep);
        }
      }
    }
  }

  return visited;
}

// ============================================================================
// MAIN ANALYSIS
// ============================================================================

function analyze(): AnalysisResult {
  console.log("Dead Code Detector\n");
  console.log("=".repeat(60));

  // Load compiler options
  const configPath = path.join(PROJECT_ROOT, "tsconfig.json");
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  const parsedConfig = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    PROJECT_ROOT
  );
  const compilerOptions = parsedConfig.options;

  // Collect all project files
  console.log("\n1. Collecting project files...");
  const allFiles = getAllFiles(SRC_DIR, [".ts", ".svelte"]);
  console.log(`   Found ${allFiles.length} files in src/`);

  // Collect static entry points
  console.log("\n2. Identifying entry points...");
  const staticEntries = getStaticEntryPoints();
  console.log(`   Static entries: ${staticEntries.length}`);

  // Collect dynamic loader targets
  console.log("\n3. Parsing dynamic loaders...");
  const dynamicTargets: string[] = [];
  for (const loaderRelPath of DYNAMIC_LOADERS) {
    const loaderPath = normalizePath(path.join(PROJECT_ROOT, loaderRelPath));
    if (fs.existsSync(loaderPath)) {
      const targets = extractDynamicLoaderTargets(loaderPath, compilerOptions);
      dynamicTargets.push(...targets);
      console.log(`   ${loaderRelPath}: ${targets.length} targets`);
    } else {
      console.log(`   ${loaderRelPath}: NOT FOUND (skipped)`);
    }
  }

  // Combine all entry points
  const allEntryPoints = [...new Set([...staticEntries, ...dynamicTargets])];
  console.log(`   Total entry points: ${allEntryPoints.length}`);

  // Build import graph
  console.log("\n4. Building import graph...");
  const graph = buildImportGraph(allFiles, compilerOptions);
  const totalEdges = Object.values(graph).reduce(
    (sum, deps) => sum + deps.size,
    0
  );
  console.log(`   Graph: ${allFiles.length} nodes, ${totalEdges} edges`);

  // Find reachable files
  console.log("\n5. Computing reachability...");
  const reachable = findReachableFiles(allEntryPoints, graph);
  console.log(`   Reachable: ${reachable.size} files`);

  // Find dead files
  const deadFiles: string[] = [];
  for (const file of allFiles) {
    if (!reachable.has(file)) {
      deadFiles.push(file);
    }
  }

  // Group by directory
  const deadByDirectory: { [dir: string]: string[] } = {};
  for (const file of deadFiles) {
    const relativePath = normalizePath(path.relative(SRC_DIR, file));
    const parts = relativePath.split("/");
    // Group by first 4 path segments for better granularity
    const dirKey = parts.slice(0, Math.min(4, parts.length - 1)).join("/");
    if (!deadByDirectory[dirKey]) {
      deadByDirectory[dirKey] = [];
    }
    deadByDirectory[dirKey].push(relativePath);
  }

  // Sort directories by count
  const sortedDirs = Object.entries(deadByDirectory).sort(
    (a, b) => b[1].length - a[1].length
  );

  // Warnings
  const warnings: string[] = [];

  // Check for template literal imports that couldn't be analyzed
  for (const file of allFiles) {
    try {
      const content = fs.readFileSync(file, "utf-8");
      if (/import\s*\(\s*`/.test(content)) {
        warnings.push(
          `Template literal import in ${path.relative(PROJECT_ROOT, file)} (cannot statically analyze)`
        );
      }
    } catch {}
  }

  return {
    totalFiles: allFiles.length,
    reachableFiles: reachable.size,
    deadFiles: deadFiles.map((f) =>
      normalizePath(path.relative(PROJECT_ROOT, f))
    ),
    deadByDirectory: Object.fromEntries(sortedDirs),
    warnings,
  };
}

// ============================================================================
// OUTPUT
// ============================================================================

function printResults(result: AnalysisResult) {
  console.log("\n" + "=".repeat(60));
  console.log("RESULTS");
  console.log("=".repeat(60));

  console.log(`\nTotal files:     ${result.totalFiles}`);
  console.log(`Reachable files: ${result.reachableFiles}`);
  console.log(
    `Dead files:      ${result.deadFiles.length} (${((result.deadFiles.length / result.totalFiles) * 100).toFixed(1)}%)`
  );

  if (result.deadFiles.length > 0) {
    console.log("\n--- Dead Files by Directory ---\n");

    for (const [dir, files] of Object.entries(result.deadByDirectory)) {
      console.log(`${dir}/ (${files.length} files)`);
      // Show first 3 files as examples
      for (const file of files.slice(0, 3)) {
        console.log(`  - ${file.split("/").pop()}`);
      }
      if (files.length > 3) {
        console.log(`  ... and ${files.length - 3} more`);
      }
      console.log();
    }
  }

  if (result.warnings.length > 0) {
    console.log("\n--- Warnings ---\n");
    for (const warning of result.warnings) {
      console.log(`⚠ ${warning}`);
    }
  }

  // Save full report
  const reportPath = path.join(PROJECT_ROOT, "dead-code-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(result, null, 2));
  console.log(`\nFull report saved to: ${reportPath}`);
}

// ============================================================================
// RUN
// ============================================================================

const result = analyze();
printResults(result);

// Exit with error code if dead files found (useful for CI)
if (result.deadFiles.length > 0) {
  console.log(
    `\n✗ Found ${result.deadFiles.length} potentially dead files`
  );
  process.exit(1);
} else {
  console.log("\n✓ No dead files found");
  process.exit(0);
}
