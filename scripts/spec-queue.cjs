#!/usr/bin/env node
// Read-only spec queue. This module owns frontmatter validation and eligibility.
const fs = require("node:fs");
const path = require("node:path");
const YAML = require("yaml");

const ROOT = path.resolve(__dirname, "..");
const BASE = "docs/superpowers/specs";
const DIRS = ["active", "backlog"];
const EFFORT = { XS: 5, S: 4, M: 3, L: 2, XL: 1 };
const STATES = new Set([
  "ready",
  "in-progress",
  "verification",
  "blocked",
  "unverified",
  "complete",
  "superseded",
]);
const SELECTABLE = new Set(["ready", "in-progress", "verification"]);
const FIELDS = [
  "status",
  "value",
  "effort",
  "remaining",
  "depends_on",
  "plan_path",
  "tags",
  "last_triaged",
  "work_state",
];

function validDay(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
  );
}

function safeRepoPath(value, root = ROOT) {
  if (
    typeof value !== "string" ||
    !value ||
    value.includes("\\") ||
    path.posix.isAbsolute(value)
  )
    return false;
  const normalized = path.posix.normalize(value);
  if (
    normalized === ".." ||
    normalized.startsWith("../") ||
    normalized !== value ||
    /^[A-Za-z]:/.test(value)
  )
    return false;
  const full = path.resolve(root, ...value.split("/"));
  return (
    full.startsWith(root + path.sep) &&
    fs.existsSync(full) &&
    fs.statSync(full).isFile()
  );
}

function parseSpec(
  raw,
  rel,
  root = ROOT,
  today = new Date().toISOString().slice(0, 10)
) {
  const errors = [];
  raw = raw.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  if (!raw.startsWith("---\n"))
    return { data: null, errors: ["missing YAML frontmatter"] };
  const end = raw.indexOf("\n---", 4);
  if (end < 0) return { data: null, errors: ["unterminated YAML frontmatter"] };
  const doc = YAML.parseDocument(raw.slice(4, end), {
    uniqueKeys: true,
    strict: true,
  });
  errors.push(...doc.errors.map((e) => `YAML: ${e.message.split("\n")[0]}`));
  if (errors.length) return { data: null, errors };
  let data;
  try {
    data = doc.toJS({ maxAliasCount: 100 });
  } catch (error) {
    return { data: null, errors: [`YAML: ${error.message}`] };
  }
  if (!data || Array.isArray(data) || typeof data !== "object")
    return { data: null, errors: ["frontmatter must be a map"] };
  for (const key of FIELDS)
    if (!Object.hasOwn(data, key)) errors.push(`missing ${key}`);
  if (errors.length) return { data, errors };
  const dir = rel.split("/").at(-2);
  if (data.status !== dir) errors.push(`status must be ${dir}`);
  if (
    data.value !== null &&
    (!Number.isInteger(data.value) || data.value < 1 || data.value > 5)
  )
    errors.push("value must be 1-5 or null");
  if (data.effort !== null && !Object.hasOwn(EFFORT, data.effort))
    errors.push("effort must be XS/S/M/L/XL or null");
  if (typeof data.remaining !== "string" || !data.remaining.trim())
    errors.push("remaining must be nonempty");
  if (typeof data.depends_on !== "string")
    errors.push("depends_on must be a string");
  else if (data.depends_on) {
    if (data.depends_on.startsWith("external:")) {
      if (!data.depends_on.slice(9).trim())
        errors.push("external dependency needs a description");
    } else if (
      !data.depends_on.endsWith(".md") ||
      data.depends_on.includes("\\") ||
      (data.depends_on.includes("/") &&
        (!/^docs\/superpowers\/specs\/(active|backlog|shipped|archived)\/[^/]+\.md$/.test(
          data.depends_on
        ) ||
          !safeRepoPath(data.depends_on, root))) ||
      (!data.depends_on.includes("/") &&
        !/^[A-Za-z0-9][A-Za-z0-9._-]*\.md$/.test(data.depends_on))
    ) {
      errors.push(
        "depends_on must be a spec basename, existing repo path, or external:..."
      );
    }
  }
  if (
    typeof data.plan_path !== "string" ||
    (data.plan_path && !safeRepoPath(data.plan_path, root))
  )
    errors.push(
      "plan_path must be an existing repo-root relative path or empty"
    );
  if (
    !Array.isArray(data.tags) ||
    !data.tags.every((tag) => typeof tag === "string")
  )
    errors.push("tags must be a string array");
  if (data.last_triaged !== null && !validDay(data.last_triaged))
    errors.push("last_triaged must be YYYY-MM-DD or null");
  else if (data.last_triaged !== null && data.last_triaged > today)
    errors.push("last_triaged cannot be in the future");
  if (!STATES.has(data.work_state)) errors.push("invalid work_state");
  return { data, errors };
}

function loadSpecs(root = ROOT) {
  const result = [];
  for (const dir of DIRS) {
    const folder = path.join(root, BASE, dir);
    if (!fs.existsSync(folder)) continue;
    for (const name of fs
      .readdirSync(folder)
      .filter((name) => name.endsWith(".md"))
      .sort()) {
      const rel = `${BASE}/${dir}/${name}`;
      const parsed = parseSpec(
        fs.readFileSync(path.join(folder, name), "utf8"),
        rel,
        root
      );
      result.push({ ...parsed, rel, name, dir });
    }
  }
  return result;
}

function resolveDependency(value, root, specs) {
  if (!value) return null;
  if (value.startsWith("external:")) return "external dependency";
  const dirs = ["active", "backlog", "shipped", "archived"];
  const candidates = [];
  for (const dir of dirs) {
    const rel = `${BASE}/${dir}/${path.basename(value)}`;
    if (
      (value === path.basename(value) || value === rel) &&
      fs.existsSync(path.join(root, rel))
    )
      candidates.push(dir);
  }
  if (candidates.length !== 1)
    return candidates.length
      ? "ambiguous dependency"
      : "dependency not found in spec queue";
  return candidates[0] === "shipped" ? null : `dependency ${candidates[0]}`;
}

function queue(
  specs,
  { root = ROOT, today = new Date().toISOString().slice(0, 10) } = {}
) {
  const date = new Date(`${today}T00:00:00Z`);
  return specs
    .map((s) => {
      const d = s.data;
      const reasons = [...s.errors];
      if (fs.existsSync(path.join(root, BASE, ".claims", `${s.name}.lock`)))
        reasons.push("existing claim");
      if (d) {
        if (!SELECTABLE.has(d.work_state))
          reasons.push(`work_state ${d.work_state}`);
        if (d.value === null || d.effort === null) reasons.push("unscored");
        if (d.last_triaged === null) reasons.push("untriaged");
        else if (
          validDay(d.last_triaged) &&
          (date - new Date(`${d.last_triaged}T00:00:00Z`)) / 86400000 > 30
        )
          reasons.push("triage older than 30 days");
        const dependency =
          typeof d.depends_on === "string"
            ? resolveDependency(d.depends_on, root, specs)
            : null;
        if (dependency) reasons.push(dependency);
      }
      return {
        ...s,
        score: d?.value && EFFORT[d.effort] ? d.value * EFFORT[d.effort] : null,
        reasons,
        eligible: reasons.length === 0,
      };
    })
    .sort(
      (a, b) =>
        Number(b.eligible) - Number(a.eligible) ||
        (b.score ?? -1) - (a.score ?? -1) ||
        a.rel.localeCompare(b.rel)
    );
}

function main(args = process.argv.slice(2)) {
  const command = args[0] || "check";
  if (!["check", "list", "next"].includes(command)) {
    console.error("Usage: spec-queue.cjs check|list|next");
    return 2;
  }
  const specs = loadSpecs();
  if (command === "check") {
    const invalid = specs.filter(
      (s) =>
        s.errors.length ||
        (s.data &&
          typeof s.data.depends_on === "string" &&
          /^dependency not found|^ambiguous dependency/.test(
            resolveDependency(s.data.depends_on, ROOT, specs) || ""
          ))
    );
    for (const s of invalid) {
      for (const error of s.errors) console.error(`${s.rel}: ${error}`);
      if (s.data && typeof s.data.depends_on === "string") {
        const dependency = resolveDependency(s.data.depends_on, ROOT, specs);
        if (
          /^dependency not found|^ambiguous dependency/.test(dependency || "")
        )
          console.error(`${s.rel}: ${dependency}`);
      }
    }
    console.log(`${specs.length} specs checked; ${invalid.length} invalid`);
    return invalid.length ? 1 : 0;
  }
  const ranked = queue(specs);
  if (command === "next") {
    const next = ranked.find((s) => s.eligible);
    console.log(
      next
        ? `${next.rel} (score ${next.score}; ${next.data.work_state}; remaining: ${next.data.remaining})`
        : "No eligible spec"
    );
    return 0;
  }
  for (const s of ranked)
    console.log(
      `${s.eligible ? "READY" : "HELD "} ${String(s.score ?? "-").padStart(2)} ${s.rel} [${s.data?.work_state ?? "invalid"}] remaining: ${s.data?.remaining ?? "unknown"}${s.reasons.length ? ` — ${s.reasons.join("; ")}` : ""}`
    );
  return 0;
}

if (require.main === module) process.exitCode = main();
module.exports = { parseSpec, loadSpecs, queue, validDay, main };
