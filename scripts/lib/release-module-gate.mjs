/**
 * Release Module Gate
 *
 * Catches changelog leaks: commits that belong to a module (or a dark
 * sub-feature of a live module) that is NOT yet released, so they don't slip
 * into the user-facing changelog. The recurring pain was hand-catching these
 * by eye every release ("don't ship that, Learn isn't live yet").
 *
 * Single source of truth for "what's live" is PRODUCTION_MODULES in
 * src/lib/shared/environment/environment-features.ts — parsed here, never
 * duplicated. Flip a module live there and the gate follows automatically.
 *
 * Pure functions (parse/resolve/classify/gate) take all inputs as arguments so
 * they unit-test without touching git or the filesystem. The thin I/O wrappers
 * (loadProductionModules, collectCommits) live at the bottom.
 */

import { readFileSync } from "fs";
import { execSync } from "child_process";

/** Default location of the module-visibility source of truth. */
export const PRODUCTION_MODULES_PATH =
  "src/lib/shared/environment/environment-features.ts";

/** Default location of the guest module/tab access source of truth. */
export const GUEST_MODULE_ACCESS_PATH =
  "src/lib/shared/auth/domain/guest-access-config.ts";

/** Default location of the navigation tab registry. */
export const TAB_DEFINITIONS_PATH =
  "src/lib/shared/navigation/config/tab-definitions.ts";

/**
 * Commit scopes that identify a specific user-facing tab.
 *
 * This is deliberately smaller than the complete tab registry. It only maps
 * scopes that appear in commit history and whose guest visibility would be
 * ambiguous if we stopped at the parent module.
 */
export const SCOPE_TO_SURFACE = {
  assemble: { module: "create", tab: "assemble" },
  construct: { module: "create", tab: "construct" },
  generate: { module: "create", tab: "generate" },
  fuse: { module: "create", tab: "fuse" },
  gallery: { module: "browse", tab: "gallery" },
  library: { module: "browse", tab: "library" },
};

/**
 * File prefixes that identify a specific user-facing tab when the commit scope
 * does not. Paths shared by multiple tabs intentionally stay unresolved.
 */
export const PATH_TO_SURFACE = [
  {
    prefix: "src/lib/features/create/assemble/",
    module: "create",
    tab: "assemble",
  },
  {
    prefix: "src/lib/features/create/construct/",
    module: "create",
    tab: "construct",
  },
  {
    prefix: "src/lib/features/create/generate/",
    module: "create",
    tab: "generate",
  },
  {
    prefix: "src/lib/features/create/shape-engine/",
    module: "create",
    tab: "shape-engine",
  },
  {
    prefix: "src/lib/features/fuse/",
    module: "create",
    tab: "fuse",
  },
  {
    prefix: "src/lib/features/browse/gallery-home/",
    module: "browse",
    tab: "gallery",
  },
];

/**
 * Commit scopes that don't equal their ModuleId. Only mismatches belong here —
 * a scope that already IS a PRODUCTION_MODULES key (mandala, train, museum,
 * shop, browse, ...) resolves directly and needs no entry.
 *
 * The learn family is the important case: play/guide/quiz/codex/lessons all
 * live under src/lib/features/learn/ and ship (or don't) as the `learn` module.
 */
export const SCOPE_TO_MODULE = {
  play: "learn",
  guide: "learn",
  quiz: "learn",
  codex: "learn",
  lesson: "learn",
  lessons: "learn",
  "math-foundations": "learn",
  concepts: "learn",
  store: "shop",
  assemble: "create",
  construct: "create",
  generate: "create",
  fuse: "create",
  gallery: "browse",
  library: "browse",
};

/**
 * Feature-directory aliases for the file-path fallback. The path segment right
 * after `src/lib/features/` usually equals the ModuleId; list only exceptions.
 * (learn/* nests, so the first segment is already `learn` — no entry needed.)
 */
export const DIR_TO_MODULE = {
  store: "shop",
  "choreo-card": "choreo_card",
  fuse: "create",
};

/**
 * Dark-inside-a-live-module denylist. These match commits whose module IS live
 * but which touch a sub-feature that has NOT launched. PRODUCTION_MODULES can't
 * express sub-feature gates, so they're named here by hand.
 *
 * A commit is flagged when its subject matches `subject` OR any touched file
 * starts with one of `paths`. Add a block when a new dark sub-feature appears;
 * delete it the day that sub-feature ships.
 */
export const DARK_DENYLIST = [
  {
    label: "shop: LOOP deck listing",
    reason: "LOOP deck store/listing not launched yet (still in design)",
    subject: /\bLOOP (deck|listing|configurator|board|pack|turntable)\b/i,
    paths: [
      "src/lib/features/store/LoopDeck",
      "src/lib/features/store/components/Loop",
    ],
  },
];

/**
 * Extract PRODUCTION_MODULES from the environment-features source text into a
 * plain { moduleId: boolean } map. Regex, not a TS import — the real module
 * pulls in `$app/environment` and `import.meta.env`, which won't run in Node.
 *
 * @param {string} source - contents of environment-features.ts
 * @returns {Record<string, boolean>}
 */
export function parseProductionModules(source) {
  const start = source.indexOf("PRODUCTION_MODULES");
  if (start === -1) {
    throw new Error(
      "PRODUCTION_MODULES not found in environment-features source"
    );
  }
  const open = source.indexOf("{", start);
  const close = source.indexOf("};", open);
  if (open === -1 || close === -1) {
    throw new Error("Could not bound the PRODUCTION_MODULES object literal");
  }
  const body = source.slice(open + 1, close);

  const map = {};
  // Match `key: true|false` and `"quoted-key": true|false`, ignoring trailing
  // `// comments` (we only capture up to the boolean).
  const entry = /(?:^|\n)\s*["']?([A-Za-z0-9_-]+)["']?\s*:\s*(true|false)\b/g;
  let m;
  while ((m = entry.exec(body)) !== null) {
    map[m[1]] = m[2] === "true";
  }
  if (Object.keys(map).length === 0) {
    throw new Error("Parsed zero entries from PRODUCTION_MODULES");
  }
  return map;
}

/**
 * Extract GUEST_MODULE_ACCESS into a plain { moduleId: tabId[] } map.
 *
 * @param {string} source - contents of guest-access-config.ts
 * @returns {Record<string, string[]>}
 */
export function parseGuestModuleAccess(source) {
  const start = source.indexOf("GUEST_MODULE_ACCESS");
  if (start === -1) {
    throw new Error(
      "GUEST_MODULE_ACCESS not found in guest-access-config source"
    );
  }
  const open = source.indexOf("{", start);
  const close = source.indexOf("};", open);
  if (open === -1 || close === -1) {
    throw new Error("Could not bound the GUEST_MODULE_ACCESS object literal");
  }
  const body = source.slice(open + 1, close);
  const map = {};
  const entry =
    /(?:^|\n)\s*["']?([A-Za-z0-9_-]+)["']?\s*:\s*\[([\s\S]*?)\]\s*,?/g;
  let match;
  while ((match = entry.exec(body)) !== null) {
    const tabs = [];
    const tabPattern = /["']([^"']+)["']/g;
    let tabMatch;
    while ((tabMatch = tabPattern.exec(match[2])) !== null) {
      tabs.push(tabMatch[1]);
    }
    map[match[1]] = tabs;
  }
  if (Object.keys(map).length === 0) {
    throw new Error("Parsed zero entries from GUEST_MODULE_ACCESS");
  }
  return map;
}

/**
 * Extract the registered tab ids for modules that have mixed guest/account
 * access. Reading the navigation registry catches misspelled or stale tab ids
 * in a release manifest instead of treating them as account-only by default.
 *
 * @param {string} source - contents of tab-definitions.ts
 * @param {string[]} [moduleIds]
 * @returns {Record<string, string[]>}
 */
export function parseModuleTabs(source, moduleIds = ["create", "browse"]) {
  const result = {};
  for (const moduleId of moduleIds) {
    const constant = `${moduleId.toUpperCase().replaceAll("-", "_")}_TABS`;
    const marker = new RegExp(`export\\s+const\\s+${constant}\\b`).exec(source);
    if (!marker) {
      throw new Error(`${constant} not found in tab-definitions source`);
    }
    const open = source.indexOf("[", marker.index);
    const close = source.indexOf("];", open);
    if (open === -1 || close === -1) {
      throw new Error(`Could not bound the ${constant} array literal`);
    }
    const body = source.slice(open + 1, close);
    const tabs = [];
    const idPattern = /\bid\s*:\s*["']([^"']+)["']/g;
    let match;
    while ((match = idPattern.exec(body)) !== null) {
      tabs.push(match[1]);
    }
    if (tabs.length === 0) {
      throw new Error(`Parsed zero tab ids from ${constant}`);
    }
    result[moduleId] = tabs;
  }
  return result;
}

/**
 * Parse the conventional-commit type + scope off a subject line.
 * `feat(play): x` -> { type: "feat", scope: "play" }. No scope -> scope null.
 *
 * @param {string} subject
 * @returns {{ type: string | null, scope: string | null }}
 */
export function parseConventional(subject) {
  const m = /^([a-z]+)(?:\(([^)]+)\))?!?:/i.exec(subject.trim());
  if (!m) return { type: null, scope: null };
  return { type: m[1].toLowerCase(), scope: m[2] ? m[2].toLowerCase() : null };
}

/**
 * Resolve a commit to a ModuleId using scope first, then touched files.
 * Returns null when nothing maps confidently — shared/infra commits (auth,
 * export, render) and anything unrecognized stay null so they're never gated.
 *
 * @param {{ scope: string | null, files?: string[] }} commit
 * @param {Record<string, boolean>} productionModules
 * @returns {string | null}
 */
export function resolveModule({ scope, files = [] }, productionModules) {
  // Scope is the authoritative signal of intent: a `feat(mandala):` /
  // `feat(play):` commit is that module's work even if it also edits shared
  // infra. Only fall back to files when scope names no module.
  if (scope) {
    if (SCOPE_TO_MODULE[scope]) return SCOPE_TO_MODULE[scope];
    if (scope in productionModules) return scope;
  }

  // File fallback — resolve to the SINGLE feature module the commit owns, or
  // null when it's cross-cutting. A commit that touches `src/lib/shared/` is
  // infrastructure that serves live surfaces, and a commit spanning more than
  // one feature module isn't owned by any — both mis-flag as some lone dark
  // dir they happen to touch (this is what wrongly gated the live
  // Share/Download export sweep as mandala/video). Gating is then a pure
  // productionModules lookup on the returned module.
  if (files.some((f) => f.startsWith("src/lib/shared/"))) return null;

  const featureModules = [];
  for (const file of files) {
    const m = /^src\/lib\/features\/([A-Za-z0-9_-]+)\//.exec(file);
    if (!m) continue;
    const module = DIR_TO_MODULE[m[1]] ?? m[1];
    if (module in productionModules && !featureModules.includes(module)) {
      featureModules.push(module);
    }
  }
  return featureModules.length === 1 ? featureModules[0] : null;
}

/**
 * Resolve a commit to a specific user-facing tab when the evidence is
 * unambiguous. Scope wins; file paths are the fallback.
 *
 * @param {{ scope: string | null, files?: string[] }} commit
 * @returns {{ module: string, tab: string } | null}
 */
export function resolveSurface({ scope, files = [] }) {
  if (scope && SCOPE_TO_SURFACE[scope]) {
    return { ...SCOPE_TO_SURFACE[scope] };
  }

  const matches = [];
  for (const file of files) {
    const rule = PATH_TO_SURFACE.find((candidate) =>
      file.startsWith(candidate.prefix)
    );
    if (!rule) continue;
    const key = `${rule.module}/${rule.tab}`;
    if (!matches.some((match) => match.key === key)) {
      matches.push({ key, module: rule.module, tab: rule.tab });
    }
  }
  return matches.length === 1
    ? { module: matches[0].module, tab: matches[0].tab }
    : null;
}

/**
 * Resolve who can actually reach a released surface.
 *
 * guest: available before sign-in
 * account: requires a signed-in account
 * mixed: the module contains both guest and account-only tabs
 * unreleased: production module is disabled
 * unknown: no module could be resolved
 *
 * @param {{ module: string | null, tab?: string | null }} surface
 * @param {Record<string, boolean>} productionModules
 * @param {Record<string, string[]>} guestModuleAccess
 * @returns {"guest" | "account" | "mixed" | "unreleased" | "unknown"}
 */
export function resolveAudience(
  { module, tab = null },
  productionModules,
  guestModuleAccess
) {
  if (module == null || !(module in productionModules)) return "unknown";
  if (productionModules[module] !== true) return "unreleased";

  const guestTabs = guestModuleAccess[module];
  if (!guestTabs) return "account";
  if (tab == null) return "mixed";
  return guestTabs.includes(tab) ? "guest" : "account";
}

/**
 * Does a commit hit the dark-sub-feature denylist? Returns the matching entry
 * (for its reason/label) or null.
 *
 * @param {{ subject: string, files?: string[] }} commit
 * @param {Array} denylist
 */
export function matchDenylist(
  { subject, files = [] },
  denylist = DARK_DENYLIST
) {
  for (const rule of denylist) {
    if (rule.subject && rule.subject.test(subject)) return rule;
    if (
      rule.paths &&
      files.some((f) => rule.paths.some((p) => f.startsWith(p)))
    ) {
      return rule;
    }
  }
  return null;
}

/**
 * Classify one commit's release visibility.
 *
 * released: false = behind a dark flag (module gated, or denylist hit)
 *           true  = its module is live
 *           null  = couldn't resolve a module (shared/infra) — never gated
 *
 * @param {{ hash?: string, subject: string, files?: string[] }} commit
 * @param {{ productionModules: Record<string, boolean>, denylist?: Array }} ctx
 */
export function classifyCommit(
  commit,
  { productionModules, guestModuleAccess = null, denylist = DARK_DENYLIST }
) {
  const { scope } = parseConventional(commit.subject);
  const files = commit.files ?? [];
  const surface = resolveSurface({ scope, files });

  const dark = matchDenylist({ subject: commit.subject, files }, denylist);
  if (dark) {
    const module =
      surface?.module ?? resolveModule({ scope, files }, productionModules);
    return {
      hash: commit.hash,
      subject: commit.subject,
      scope,
      module,
      tab: surface?.tab ?? null,
      released: false,
      darkReason: dark.label,
      audience: guestModuleAccess ? "unreleased" : null,
    };
  }

  const module =
    surface?.module ?? resolveModule({ scope, files }, productionModules);
  const released = module == null ? null : productionModules[module] === true;
  return {
    hash: commit.hash,
    subject: commit.subject,
    scope,
    module,
    tab: surface?.tab ?? null,
    released,
    darkReason: released === false ? `module "${module}" not released` : null,
    audience: guestModuleAccess
      ? resolveAudience(
          { module, tab: surface?.tab ?? null },
          productionModules,
          guestModuleAccess
        )
      : null,
  };
}

/**
 * Classify a batch and split into flagged (behind a dark flag) vs shown.
 * `shown` keeps live (true) AND unknown (null) — we only withhold what we're
 * confident is dark.
 *
 * @param {Array} commits
 * @param {{ productionModules: Record<string, boolean>, denylist?: Array }} ctx
 * @returns {{ flagged: Array, shown: Array }}
 */
export function gateCommits(commits, ctx) {
  const classified = commits.map((c) => classifyCommit(c, ctx));
  return {
    flagged: classified.filter((c) => c.released === false),
    shown: classified.filter((c) => c.released !== false),
    guestVisible: classified.filter((c) => c.audience === "guest"),
    accountOnly: classified.filter((c) => c.audience === "account"),
    needsAudienceReview: classified.filter(
      (c) => c.audience === "mixed" || c.audience === "unknown"
    ),
  };
}

const ACCOUNT_QUALIFIER =
  /\b(?:account|signed[- ]in|after (?:you )?sign(?:ing)? in|once (?:you )?sign in)\b/i;
const CHANGELOG_CATEGORIES = new Set(["fixed", "added", "improved"]);
const CHANGELOG_AUDIENCES = new Set(["guest", "account"]);

/**
 * Validate the private metadata attached to final changelog entries. The
 * metadata is stripped before release notes are published; it exists to force
 * an explicit guest/account decision while the notes are being written.
 *
 * @param {Array} entries
 * @param {{
 *   productionModules: Record<string, boolean>,
 *   guestModuleAccess: Record<string, string[]>,
 *   moduleTabs: Record<string, string[]>
 * }} ctx
 * @returns {{ errors: Array<{ index: number, message: string }>, guestCount: number, accountCount: number }}
 */
export function auditChangelogEntries(
  entries,
  { productionModules, guestModuleAccess, moduleTabs }
) {
  const errors = [];
  let guestCount = 0;
  let accountCount = 0;

  entries.forEach((entry, index) => {
    const label = `Entry ${index + 1}`;
    if (!CHANGELOG_CATEGORIES.has(entry?.category)) {
      errors.push({
        index,
        message: `${label} needs category fixed, added, or improved`,
      });
    }
    if (typeof entry?.text !== "string" || entry.text.trim() === "") {
      errors.push({
        index,
        message: `${label} needs non-empty user-facing text`,
      });
    }
    if (!CHANGELOG_AUDIENCES.has(entry?.audience)) {
      errors.push({
        index,
        message: `${label} needs audience "guest" or "account"`,
      });
    } else if (entry.audience === "guest") {
      guestCount += 1;
    } else {
      accountCount += 1;
    }

    if (entry?.surface == null) {
      errors.push({
        index,
        message: `${label} needs a surface ("global" or { module, tab })`,
      });
      return;
    }

    let expectedAudience = null;
    if (entry.surface !== "global") {
      if (
        typeof entry.surface !== "object" ||
        typeof entry.surface.module !== "string"
      ) {
        errors.push({
          index,
          message: `${label} has an invalid surface`,
        });
        return;
      }

      const module = entry.surface.module;
      const tab =
        typeof entry.surface.tab === "string" ? entry.surface.tab : null;
      if (!(module in productionModules)) {
        errors.push({
          index,
          message: `${label} names unknown module "${module}"`,
        });
        return;
      }
      if (productionModules[module] !== true) {
        errors.push({
          index,
          message: `${label} names unreleased module "${module}"`,
        });
        return;
      }

      if (module in guestModuleAccess) {
        if (tab == null) {
          errors.push({
            index,
            message: `${label} must name a tab because "${module}" mixes guest and account-only tabs`,
          });
          return;
        }
        const knownTabs = moduleTabs[module] ?? [];
        if (!knownTabs.includes(tab)) {
          errors.push({
            index,
            message: `${label} names unknown ${module} tab "${tab}"`,
          });
          return;
        }
      }

      expectedAudience = resolveAudience(
        { module, tab },
        productionModules,
        guestModuleAccess
      );
      // A guest-readable tab can still contain actions that require a full
      // account, such as saving a cloud setup. The registry gives us the
      // broadest audience for the surface, so only reject metadata that claims
      // broader access than the surface allows. Account-only copy is checked
      // separately below to ensure the restriction is stated plainly.
      if (expectedAudience === "account" && entry.audience === "guest") {
        errors.push({
          index,
          message: `${label} says audience "${entry.audience}", but ${module}${tab ? `/${tab}` : ""} is "${expectedAudience}"`,
        });
      }
    }

    if (
      entry?.audience === "account" &&
      typeof entry?.text === "string" &&
      !ACCOUNT_QUALIFIER.test(entry.text)
    ) {
      errors.push({
        index,
        message: `${label} is account-only but its text does not say "account" or "signed in"`,
      });
    }
  });

  return { errors, guestCount, accountCount };
}

/**
 * Remove release-audit metadata before notes are shown or published.
 *
 * @param {Array} entries
 * @returns {Array<{ category: string, text: string }>}
 */
export function toPublicChangelog(entries) {
  return entries.map(({ category, text }) => ({ category, text }));
}

// ── Thin I/O wrappers (not unit-tested; exercised by release.js) ────────────

/**
 * Load + parse PRODUCTION_MODULES from disk.
 * @param {string} [path]
 * @returns {Record<string, boolean>}
 */
export function loadProductionModules(path = PRODUCTION_MODULES_PATH) {
  return parseProductionModules(readFileSync(path, "utf8"));
}

/**
 * Load + parse GUEST_MODULE_ACCESS from disk.
 * @param {string} [path]
 * @returns {Record<string, string[]>}
 */
export function loadGuestModuleAccess(path = GUEST_MODULE_ACCESS_PATH) {
  return parseGuestModuleAccess(readFileSync(path, "utf8"));
}

/**
 * Load the registered tab ids for guest-accessible modules.
 * @param {string} [path]
 * @returns {Record<string, string[]>}
 */
export function loadModuleTabs(path = TAB_DEFINITIONS_PATH) {
  return parseModuleTabs(readFileSync(path, "utf8"));
}

/**
 * Collect commits in a git range with the files each one touched.
 * @param {string} range - e.g. "v0.28.1..HEAD" or "HEAD"
 * @returns {Array<{ hash: string, subject: string, files: string[] }>}
 */
export function collectCommits(range) {
  // NUL-delimited records: hash \x1f subject, then one file path per line.
  const raw = execSync(
    `git log ${range} --no-merges --name-only --pretty=format:"%x1e%H%x1f%s"`,
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
  );
  const commits = [];
  for (const record of raw.split("\x1e")) {
    if (!record.trim()) continue;
    const [header, ...fileLines] = record.split("\n");
    const sep = header.indexOf("\x1f");
    if (sep === -1) continue;
    commits.push({
      hash: header.slice(0, sep),
      subject: header.slice(sep + 1),
      files: fileLines.map((l) => l.trim()).filter(Boolean),
    });
  }
  return commits;
}
