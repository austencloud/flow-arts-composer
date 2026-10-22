#!/usr/bin/env node
/**
 * i18n Structural Validation
 *
 * Ensures every module and tab defined in navigation config has matching
 * translation keys in en.json. Catches missing keys at build time instead
 * of relying on runtime console.warn().
 *
 * Checks:
 *   module_{id}           — module label
 *   module_desc_{id}      — module description
 *   tab_{moduleId}_{tabId}      — tab label
 *   tab_desc_{moduleId}_{tabId} — tab description
 *
 * A tab that declares an explicit labelKey or descKey in tab-definitions.ts
 * is checked against those keys instead of the derived names (the Browse
 * home tabs reuse browse_home_* keys, for example).
 *
 * Usage:
 *   node scripts/validate-i18n-structure.cjs          Check only
 *   node scripts/validate-i18n-structure.cjs --fix    Add missing keys with fallback values
 *   node scripts/validate-i18n-structure.cjs --ci     Exit 1 on missing keys
 */

const fs = require("fs");
const path = require("path");

const MESSAGES_FILE = path.resolve(__dirname, "../messages/en.json");
const MODULE_DEFS_FILE = path.resolve(
  __dirname,
  "../src/lib/shared/navigation/config/module-definitions.ts"
);
const TAB_DEFS_FILE = path.resolve(
  __dirname,
  "../src/lib/shared/navigation/config/tab-definitions.ts"
);

const args = process.argv.slice(2);
const CI_MODE = args.includes("--ci");
const FIX_MODE = args.includes("--fix");

// Parse module definitions from TypeScript source

function parseModuleDefinitions() {
  const src = fs.readFileSync(MODULE_DEFS_FILE, "utf-8");

  const modules = [];

  // Find MODULE_DEFINITIONS array start — locate the "= [" that opens the array
  const marker = "const MODULE_DEFINITIONS: ModuleDefinition[] = [";
  const arrStart = src.indexOf(marker);
  if (arrStart === -1) {
    console.error("Could not find MODULE_DEFINITIONS array");
    process.exit(1);
  }

  // Slice from the opening "[" of the array literal (the one in "= [")
  const arrayOpenIdx = arrStart + marker.length - 1; // points to "["
  const objects = extractTopLevelObjects(src.slice(arrayOpenIdx));

  for (const obj of objects) {
    const idMatch = obj.match(/id:\s*"([^"]+)"/);
    const labelMatch = obj.match(/label:\s*"([^"]+)"/);
    const descMatch = obj.match(/description:\s*"([^"]+)"/);
    const sectionsMatch = obj.match(/sections:\s*(\w+)/);

    if (!idMatch || !labelMatch || !descMatch) continue;

    const sectionsVar = sectionsMatch ? sectionsMatch[1] : null;
    // "[]" becomes null (no tabs), named var becomes the var name
    const hasEmptySections = /sections:\s*\[\s*\]/.test(obj);
    const adminOnly = obj.includes("adminOnly: true");

    modules.push({
      id: idMatch[1],
      label: labelMatch[1],
      description: descMatch[1],
      sectionsVar: hasEmptySections ? null : sectionsVar,
      adminOnly,
    });
  }

  return modules;
}

/**
 * Extract top-level objects from a TS array literal string.
 * Handles nested braces correctly.
 */
function extractTopLevelObjects(arrayStr) {
  const objects = [];
  let depth = 0;
  let inArray = false;
  let objStart = -1;

  for (let i = 0; i < arrayStr.length; i++) {
    const ch = arrayStr[i];

    if (!inArray && ch === "[") {
      inArray = true;
      continue;
    }

    if (!inArray) continue;

    if (ch === "{") {
      if (depth === 0) objStart = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && objStart !== -1) {
        objects.push(arrayStr.slice(objStart, i + 1));
        objStart = -1;
      }
    } else if (ch === "]" && depth === 0) {
      break; // end of array
    }
  }

  return objects;
}

// Parse tab definitions from TypeScript source

function parseTabDefinitions() {
  const src = fs.readFileSync(TAB_DEFS_FILE, "utf-8");

  const tabGroups = {};

  // Find each exported const TABS array
  const exportRegex =
    /export\s+(?:const|let)\s+(\w+_TABS)\s*:\s*Section\[\]\s*=\s*\[/g;

  let exportMatch;
  while ((exportMatch = exportRegex.exec(src)) !== null) {
    const varName = exportMatch[1];
    const startIdx = exportMatch.index + exportMatch[0].length;

    // Find the matching closing bracket by counting nesting
    let depth = 1;
    let i = startIdx;
    while (i < src.length && depth > 0) {
      if (src[i] === "[") depth++;
      if (src[i] === "]") depth--;
      i++;
    }

    const arrayContent = src.slice(startIdx, i - 1);

    // Extract tab objects from this array. Each object is read on its own so
    // an explicit labelKey/descKey cannot be attributed to a neighbouring tab.
    const tabs = [];
    for (const obj of extractTopLevelObjects("[" + arrayContent + "]")) {
      const idMatch = obj.match(/\bid:\s*"([^"]+)"/);
      const labelMatch = obj.match(/\blabel:\s*"([^"]+)"/);
      if (!idMatch || !labelMatch) continue;
      const labelKeyMatch = obj.match(/\blabelKey:\s*"([^"]+)"/);
      const descKeyMatch = obj.match(/\bdescKey:\s*"([^"]+)"/);
      tabs.push({
        id: idMatch[1],
        label: labelMatch[1],
        labelKey: labelKeyMatch ? labelKeyMatch[1] : null,
        descKey: descKeyMatch ? descKeyMatch[1] : null,
      });
    }

    tabGroups[varName] = tabs;
  }

  return tabGroups;
}

// Normalize ID to translation key format (lowercase, - → _)

function normalize(id) {
  return id.toLowerCase().replace(/-/g, "_");
}

// Main

function main() {
  const messages = JSON.parse(fs.readFileSync(MESSAGES_FILE, "utf-8"));
  const modules = parseModuleDefinitions();
  const tabGroups = parseTabDefinitions();

  const missing = [];

  for (const mod of modules) {
    const normId = normalize(mod.id);

    // module_{id}
    const moduleKey = `module_${normId}`;
    if (!messages[moduleKey]) {
      missing.push({ key: moduleKey, value: mod.label, category: "module" });
    }

    // module_desc_{id}
    const descKey = `module_desc_${normId}`;
    if (!messages[descKey]) {
      missing.push({
        key: descKey,
        value: mod.description,
        category: "module_desc",
      });
    }

    // Find tabs for this module
    const tabs = tabGroups[mod.sectionsVar] || [];

    for (const tab of tabs) {
      const normTabId = normalize(tab.id);

      // tab_{moduleId}_{tabId}, unless the tab names its own label key
      const tabKey = tab.labelKey || `tab_${normId}_${normTabId}`;
      if (!messages[tabKey]) {
        missing.push({ key: tabKey, value: tab.label, category: "tab" });
      }

      // tab_desc_{moduleId}_{tabId}, unless the tab names its own desc key;
      // the description text itself is read from the source
      const tabDescKey = tab.descKey || `tab_desc_${normId}_${normTabId}`;
      if (!messages[tabDescKey]) {
        // Try to find description in source for this tab
        const tabSrc = findTabDescription(mod.sectionsVar, tab.id);
        missing.push({
          key: tabDescKey,
          value: tabSrc || tab.label,
          category: "tab_desc",
        });
      }
    }
  }

  // Report
  if (missing.length === 0) {
    console.log(
      `\n✅ All ${modules.length} modules and their tabs have matching translation keys.\n`
    );
    process.exit(0);
  }

  console.log(
    `\n❌ Found ${missing.length} missing translation key(s):\n`
  );

  const byCategory = {};
  for (const m of missing) {
    byCategory[m.category] = byCategory[m.category] || [];
    byCategory[m.category].push(m);
  }

  for (const [cat, items] of Object.entries(byCategory)) {
    console.log(`  [${cat}] (${items.length})`);
    for (const item of items) {
      console.log(`    "${item.key}": "${item.value}"`);
    }
    console.log("");
  }

  if (FIX_MODE) {
    // Add missing keys to en.json
    for (const m of missing) {
      messages[m.key] = m.value;
    }

    // Sort keys and write
    const sorted = {};
    for (const key of Object.keys(messages).sort()) {
      sorted[key] = messages[key];
    }

    fs.writeFileSync(MESSAGES_FILE, JSON.stringify(sorted, null, 2) + "\n");
    console.log(
      `✅ Added ${missing.length} key(s) to en.json (sorted).\n`
    );
    console.log(
      "   Review the auto-generated values — descriptions may need refinement.\n"
    );
  } else {
    console.log("   Run with --fix to auto-add these keys.\n");
  }

  if (CI_MODE) {
    process.exit(1);
  }
}

// Helper: extract tab description from tab-definitions source
function findTabDescription(sectionsVar, tabId) {
  const src = fs.readFileSync(TAB_DEFS_FILE, "utf-8");

  // Find the array for this sectionsVar
  const varRegex = new RegExp(
    `export\\s+(?:const|let)\\s+${sectionsVar}\\s*:\\s*Section\\[\\]\\s*=\\s*\\[`
  );
  const varMatch = varRegex.exec(src);
  if (!varMatch) return null;

  const startIdx = varMatch.index + varMatch[0].length;
  let depth = 1;
  let i = startIdx;
  while (i < src.length && depth > 0) {
    if (src[i] === "[") depth++;
    if (src[i] === "]") depth--;
    i++;
  }
  const arrayContent = src.slice(startIdx, i - 1);

  // Find the specific tab object and extract its description
  const tabObjRegex = new RegExp(
    `id:\\s*"${tabId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[\\s\\S]*?description:\\s*"([^"]+)"`
  );
  const descMatch = tabObjRegex.exec(arrayContent);
  return descMatch ? descMatch[1] : null;
}

main();
