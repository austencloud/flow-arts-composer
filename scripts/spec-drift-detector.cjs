#!/usr/bin/env node
/**
 * Spec Drift Detection
 *
 * A spec that misreports its own state is worse than no spec: an agent acts on
 * it. `shop-operations-go-live` claimed "Not yet built" about a store that was
 * already live taking Stripe payments — followed literally, that spec rebuilds a
 * shipped checkout. Seven onboarding specs sat "Ready for Fable" while their
 * acceptance ledgers were 45/50 done and the only open item was one command.
 *
 * Both failures are mechanically detectable. This compares what each spec SAYS
 * against what the repository DOES, and reports divergence. It reads only; it
 * never edits a spec.
 *
 * Signals per spec:
 *   1. declared state  — the body's `**Status:**` line, classified
 *   2. acceptance ledger — open vs done `- [ ]` / `- [x]` counts
 *   3. deliverables     — repo paths the spec names as its own files
 *   4. git activity     — commits touching those paths since the spec's date
 *   5. existence        — how many named deliverables are still on disk
 *
 * Verdicts (most actionable first):
 *   DIVERGENT    spec says not-built, but its deliverables have heavy commit
 *                traffic since it was written. Highest risk: rebuild hazard.
 *   PHANTOM_OPEN every box in its own acceptance ledger is checked, yet it
 *                still sits in active/. Requires acceptance review.
 *   LIKELY_DONE  body declares implemented/shipped/resolved, still in active/.
 *   GHOST_PATHS  most named deliverables no longer exist — probably superseded
 *                or the code was renamed out from under the spec.
 *   WATCH        moderate traffic against a not-built claim. Not conclusive.
 *   NO_STATE     no status line and no ledger; state is unknowable from the file.
 *   OK           nothing contradicts the spec.
 *
 * Exit code 0 = no actionable drift, 1 = drift found (CI-friendly).
 *
 * Usage:
 *   node scripts/spec-drift-detector.cjs
 *   node scripts/spec-drift-detector.cjs --json out.json
 *   node scripts/spec-drift-detector.cjs --verdict DIVERGENT,PHANTOM_OPEN
 *   node scripts/spec-drift-detector.cjs --quiet     # summary counts only
 */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const YAML = require("yaml");

const ROOT = path.resolve(__dirname, "..");
const SPECS = path.join(ROOT, "docs", "superpowers", "specs");
const DIRS = ["active", "backlog"];

// Commit history horizon. Specs older than this are dated by filename anyway;
// this only bounds how much log we parse.
const LOG_SINCE = "2026-01-01";

// A spec younger than this is presumed mid-implementation, so traffic against
// its deliverables is expected rather than suspicious.
const GRACE_DAYS = 14;

// Thresholds against a not-built claim. These count TOPICAL commits only —
// commits that both touch one of the spec's deliverables and whose subject
// mentions one of the spec's own topic words. Raw path overlap is uselessly
// noisy: a spec naming `src/lib/features/` inherits every commit in the repo,
// which produced 3184 "commits" for one spec on the first run.
const DIVERGENT_TOPICAL = 8;
const WATCH_TOPICAL = 2;
// A weaker topical signal still counts as divergence when the commits landed on
// specific files the spec named by name, not just directories it gestured at.
const DIVERGENT_TOPICAL_WITH_FILES = 3;
const DIVERGENT_EXACT_FILES = 3;

// Topic words carry no discriminating power, so they never gate a match.
const STOPWORDS = new Set([
  "design", "findings", "rollout", "spec", "specs", "notes", "index", "and",
  "the", "for", "into", "with", "from", "phase", "tka", "package", "operation",
  "progress", "session", "ledger", "checkpoint", "umbrella", "memo", "research",
  "backlog", "mode", "system", "tab", "new", "old", "all", "via", "per", "plan",
]);

// Top-level repo dirs that can contain a real deliverable.
const CODE_ROOTS = [
  "src", "packages", "scripts", "firebase-functions", "static", "tests",
  "messages", "mcp-server", "agent-hub", "launchers", "functions",
];

// args

const argv = process.argv.slice(2);
const jsonOut = argv.includes("--json") ? argv[argv.indexOf("--json") + 1] : null;
const quiet = argv.includes("--quiet");
const verdictFilter = argv.includes("--verdict")
  ? new Set(argv[argv.indexOf("--verdict") + 1].split(",").map((s) => s.trim().toUpperCase()))
  : null;

// git history: one pass, path -> commits

function buildGitIndex() {
  let raw;
  try {
    raw = execFileSync(
      "git",
      ["log", `--since=${LOG_SINCE}`, "--date=short", "--pretty=format:\x01%h\x02%ad\x02%s", "--name-only"],
      { cwd: ROOT, encoding: "utf8", maxBuffer: 512 * 1024 * 1024 },
    );
  } catch (err) {
    console.error("git log failed: " + err.message);
    process.exit(2);
  }

  // path -> [{h, date, subject}]
  const index = new Map();
  let cur = null;
  for (const line of raw.split(/\r?\n/)) {
    if (line.startsWith("\x01")) {
      const [h, date, subject] = line.slice(1).split("\x02");
      cur = { h, date, subject };
      continue;
    }
    const p = line.trim();
    if (!p || !cur) continue;
    // Renames arrive as "old => new" inside braces; take the whole line's tail.
    const norm = p.replace(/\\/g, "/");
    if (!index.has(norm)) index.set(norm, []);
    index.get(norm).push(cur);
  }
  return index;
}

// Did this path EVER exist, per recorded history? Distinguishes a deliverable
// that was deleted out from under a spec (real drift) from one that was never
// written (normal for an unimplemented design spec). Without this split,
// "100% of paths missing" reads as alarming for both.
function everExisted(index, target) {
  const isDir = target.endsWith("/");
  for (const p of index.keys()) {
    if (isDir ? p.startsWith(target) : p === target || p.startsWith(target + "/")) return true;
  }
  return false;
}

// Commits touching `target` (file or directory prefix) strictly after `sinceDate`.
function commitsFor(index, target, sinceDate) {
  const isDir = target.endsWith("/");
  const out = [];
  for (const [p, commits] of index) {
    const hit = isDir ? p.startsWith(target) : p === target || p.startsWith(target + "/");
    if (!hit) continue;
    for (const c of commits) if (!sinceDate || c.date > sinceDate) out.push(c);
  }
  return out;
}

// ---------------------------------------------------------------------------
// spec parsing
// ---------------------------------------------------------------------------

function splitFrontmatter(raw) {
  raw = raw.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  if (!raw.startsWith("---")) return { fm: "", body: raw };
  const end = raw.indexOf("\n---", 3);
  if (end === -1) return { fm: "", body: raw };
  return { fm: raw.slice(3, end), body: raw.slice(end + 4) };
}

function frontmatterWorkState(fm) {
  if (!fm) return null;
  try {
    const doc = YAML.parseDocument(fm, { uniqueKeys: true });
    if (doc.errors.length) return null; // specs:check owns malformed YAML diagnostics
    const data = doc.toJS({ maxAliasCount: 100 });
    return typeof data?.work_state === "string" ? data.work_state : null;
  } catch {
    return null;
  }
}

function declaredStatus(body) {
  for (const line of body.split(/\r?\n/).slice(0, 40)) {
    const m =
      line.match(/^\s*\*\*Status:?\*\*:?\s*(.+)$/i) || line.match(/^\s*Status:\s*(.+)$/i);
    if (m) return m[1].trim();
  }
  return null;
}

// Order is load-bearing, and the naive order is wrong. Testing DONE first
// misreads "IN PROGRESS — 9 waves complete" and "Approved (brainstorming
// complete, ready for plan)" as finished, because the completion word describes
// a PRIOR STAGE, not the spec. So: strip stage-completion phrases, resolve
// in-progress and deferred first, and only then look for a real DONE marker.
function classifyStatus(status) {
  if (!status) return "UNKNOWN";
  let s = status.toLowerCase();

  // "brainstorming complete" / "design approved" describe the spec's own
  // authoring, not its implementation. Remove before testing for completion.
  s = s.replace(
    /\b(brainstorm(?:ing)?|design|spec|specc?ing|audit|research|framing|scoping|review)\s+(?:is\s+)?(?:complete|completed|done|approved)\b/g,
    " ",
  );

  if (/\b(superseded|abandoned|rejected|obsolete|withdrawn)\b/.test(s)) return "SUPERSEDED";

  // Deferred/partial beats done: a spec with pending remainder is not finished
  // even when part of it shipped.
  if (
    /\b(in progress|in-progress|implementing|underway|partially|deferred|remaining|still owed|pending)\b/
      .test(s)
  )
    return "IN_PROGRESS";

  if (/\b(implemented|shipped|complete|completed|resolved|landed)\b/.test(s)) return "DONE";

  if (
    /\b(draft|not yet built|not started|not begun|awaiting|ready for|approved|design|backlog|proposed|revised)\b/
      .test(s)
  )
    return "NOT_STARTED";

  return "UNKNOWN";
}

function ledgerCounts(body) {
  const open = (body.match(/^[ \t]*- \[ \]/gm) || []).length;
  const done = (body.match(/^[ \t]*- \[[xX~]\]/gm) || []).length;
  return { open, done };
}

const PATH_RE = new RegExp(
  "(?:" + CODE_ROOTS.join("|") + ")/[A-Za-z0-9_@./-]*[A-Za-z0-9_/]",
  "g",
);

function deliverables(body) {
  const found = new Set();
  for (const m of body.match(PATH_RE) || []) {
    let p = m.replace(/[.,;:)]+$/, "");
    if (p.length < 9) continue;
    // A bare root like "src/lib" is too coarse to attribute anything to.
    if (p.split("/").length < 3) continue;
    found.add(p);
  }
  return [...found];
}

// Topic words for this spec, from its filename slug plus any frontmatter tags.
// Used to decide whether a commit is plausibly ABOUT this spec rather than
// merely touching a directory the spec mentions.
function topicWords(filename, fm) {
  const slug = filename.replace(/\.md$/, "").replace(/^\d{4}-\d{2}-\d{2}-/, "");
  const words = new Set();
  for (const t of slug.split(/[-_]/)) {
    const w = t.toLowerCase();
    if (w.length >= 3 && !STOPWORDS.has(w)) words.add(w);
  }
  const tags = fm.match(/^tags:\s*\[(.*)\]/m);
  if (tags) {
    for (const t of tags[1].split(",")) {
      const w = t.trim().replace(/^["']|["']$/g, "").toLowerCase();
      if (w.length >= 3 && !STOPWORDS.has(w)) words.add(w);
    }
  }
  return [...words];
}

function subjectMatchesTopic(subject, words) {
  const s = subject.toLowerCase();
  return words.some((w) => s.includes(w));
}

// A path naming an actual file (has an extension on its last segment) is a much
// stronger attribution signal than a directory the spec waved at.
function isSpecificFile(p) {
  return /\.[A-Za-z0-9]+$/.test(p.split("/").pop() || "");
}

function specDate(filename, gitIndex, relSpecPath) {
  const m = filename.match(/^(\d{4}-\d{2}-\d{2})-/);
  if (m) return m[1];
  // Undated spec: fall back to the earliest commit that introduced the file.
  const commits = gitIndex.get(relSpecPath);
  if (commits && commits.length) return commits[commits.length - 1].date;
  return null;
}

function daysSince(dateStr) {
  if (!dateStr) return Infinity;
  const then = new Date(dateStr + "T00:00:00Z").getTime();
  return Math.floor((Date.now() - then) / 86400000);
}

// ---------------------------------------------------------------------------
// verdict
// ---------------------------------------------------------------------------

function verdictFor(s) {
  // A checked implementation ledger does not prove that acceptance or an
  // external gate finished. The queue frontmatter records that distinction.
  const heldRemainder = ["in-progress", "verification", "blocked", "unverified"].includes(s.workState);
  if (["in-progress", "verification"].includes(s.workState) && s.stateClass === "NOT_STARTED") return "STALE_HEADER";

  // Checked boxes are only a closeout candidate when no current remainder is
  // recorded. A reviewer still needs to verify the acceptance evidence.
  if (!heldRemainder && s.ledger.done > 0 && s.ledger.open === 0 && s.dir === "active") return "PHANTOM_OPEN";

  if (s.stateClass === "SUPERSEDED") return "LIKELY_DONE";
  if (!heldRemainder && s.stateClass === "DONE" && s.dir === "active") return "LIKELY_DONE";

  // Only paths that once existed count. A design spec naming files nobody has
  // written yet is not drift, it is just unimplemented.
  if (s.deliverables >= 4 && s.deletedRatio > 0.5) return "GHOST_PATHS";

  if (s.stateClass === "NOT_STARTED" && s.ageDays > GRACE_DAYS) {
    if (
      s.topicalCount >= DIVERGENT_TOPICAL ||
      (s.topicalCount >= DIVERGENT_TOPICAL_WITH_FILES &&
        s.exactFileCount >= DIVERGENT_EXACT_FILES)
    )
      return "DIVERGENT";
    if (s.topicalCount >= WATCH_TOPICAL) return "WATCH";
  }

  // Historical acknowledgements annotate a quiet result; they cannot suppress
  // a new contradiction or fresh commit/path evidence.
  if (s.acked) return "DRIFT_ACKED";

  if (s.stateClass === "UNKNOWN" && s.ledger.open === 0 && s.ledger.done === 0 && !s.workState)
    return "NO_STATE";

  return "OK";
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

function main() {
const gitIndex = buildGitIndex();
const specs = [];

for (const dir of DIRS) {
  const abs = path.join(SPECS, dir);
  if (!fs.existsSync(abs)) continue;
  for (const file of fs.readdirSync(abs).filter((f) => f.endsWith(".md"))) {
    const full = path.join(abs, file);
    const raw = fs.readFileSync(full, "utf8");
    const { fm, body } = splitFrontmatter(raw);
    const relSpecPath = `docs/superpowers/specs/${dir}/${file}`;

    const status = declaredStatus(body);
    const stateClass = classifyStatus(status);
    const ledger = ledgerCounts(body);
    const dels = deliverables(body);
    const date = specDate(file, gitIndex, relSpecPath);

    const topics = topicWords(file, splitFrontmatter(raw).fm);

    let touchedPaths = 0;
    let missing = 0;
    const allCommits = new Set();
    const topicalCommits = new Set();
    const exactFileCommits = new Set();
    const sampleSubjects = [];

    let deleted = 0;
    for (const d of dels) {
      if (!fs.existsSync(path.join(ROOT, d))) {
        missing++;
        if (everExisted(gitIndex, d)) deleted++;
      }
      const commits = commitsFor(gitIndex, d, date);
      if (!commits.length) continue;
      touchedPaths++;
      const specific = isSpecificFile(d);
      for (const c of commits) {
        allCommits.add(c.h);
        if (!subjectMatchesTopic(c.subject, topics)) continue;
        topicalCommits.add(c.h);
        if (specific) exactFileCommits.add(c.h);
        if (sampleSubjects.length < 3 && !sampleSubjects.some((x) => x.endsWith(c.subject)))
          sampleSubjects.push(`${c.date} ${c.subject}`);
      }
    }

    const s = {
      file,
      dir,
      date,
      ageDays: daysSince(date),
      status,
      stateClass,
      workState: frontmatterWorkState(fm),
      ledger,
      topics,
      acked: /DRIFT WARNING/.test(body),
      deliverables: dels.length,
      missingRatio: dels.length ? missing / dels.length : 0,
      deletedRatio: dels.length ? deleted / dels.length : 0,
      neverWritten: missing - deleted,
      commitCount: allCommits.size,
      topicalCount: topicalCommits.size,
      exactFileCount: exactFileCommits.size,
      touchedPaths,
      sampleSubjects,
    };
    s.verdict = verdictFor(s);
    specs.push(s);
  }
}

// ---------------------------------------------------------------------------
// report
// ---------------------------------------------------------------------------

const ORDER = [
  "DIVERGENT", "STALE_HEADER", "PHANTOM_OPEN", "LIKELY_DONE", "GHOST_PATHS",
  "WATCH", "DRIFT_ACKED", "NO_STATE", "OK",
];
const ACTIONABLE = new Set(["DIVERGENT", "STALE_HEADER", "PHANTOM_OPEN", "LIKELY_DONE", "GHOST_PATHS"]);

const byVerdict = new Map(ORDER.map((v) => [v, []]));
for (const s of specs) byVerdict.get(s.verdict).push(s);

const BLURB = {
  DIVERGENT: "spec claims not-built; its deliverables have heavy traffic since. REBUILD HAZARD.",
  STALE_HEADER: "body claims not-built while frontmatter records work underway or held.",
  PHANTOM_OPEN: "checked ledger without a current remainder state; inspect acceptance evidence before closing.",
  LIKELY_DONE: "body declares done/superseded, still in active/.",
  GHOST_PATHS: "most named deliverables no longer exist on disk.",
  WATCH: "moderate traffic against a not-built claim. Inconclusive.",
  NO_STATE: "no status line, no ledger. State unknowable from the file.",
  DRIFT_ACKED: "historical drift acknowledgement; no current actionable signal.",
  OK: "nothing contradicts the spec.",
};

console.log(`Scanned ${specs.length} specs in ${DIRS.join(" + ")}/\n`);

for (const v of ORDER) {
  const rows = byVerdict.get(v);
  if (!rows.length) continue;
  if (verdictFilter && !verdictFilter.has(v)) continue;
  console.log(`${v}  (${rows.length}) — ${BLURB[v]}`);
  if (!quiet && v !== "OK") {
    rows.sort((a, b) => b.topicalCount - a.topicalCount);
    for (const s of rows) {
      const bits = [`${s.dir}/${s.file}`];
      const ev = [];
      if (s.topicalCount)
        ev.push(
          `${s.topicalCount} topical commits (${s.exactFileCount} on named files) of ${s.commitCount} touching its paths`,
        );
      if (s.ledger.done || s.ledger.open) ev.push(`ledger ${s.ledger.done}done/${s.ledger.open}open`);
      if (s.deletedRatio > 0) ev.push(`${Math.round(s.deletedRatio * 100)}% paths DELETED`);
      if (s.neverWritten > 0) ev.push(`${s.neverWritten} never written`);
      if (s.ageDays !== Infinity) ev.push(`${s.ageDays}d old`);
      console.log(`    ${bits[0]}`);
      console.log(`        ${ev.join(" · ")}`);
      if (s.status) console.log(`        says: ${s.status.slice(0, 150)}`);
      for (const sub of s.sampleSubjects) console.log(`        git:  ${sub.slice(0, 110)}`);
    }
  }
  console.log("");
}

const actionable = specs.filter((s) => ACTIONABLE.has(s.verdict));
console.log("=".repeat(70));
console.log(
  ORDER.map((v) => `${v}=${byVerdict.get(v).length}`).join("  ") +
    `\nactionable: ${actionable.length}`,
);

if (jsonOut) {
  fs.writeFileSync(jsonOut, JSON.stringify({ scanned: specs.length, specs }, null, 2));
  console.log(`\nwrote ${jsonOut}`);
}

return actionable.length ? 1 : 0;
}

if (require.main === module) process.exitCode = main();
module.exports = { verdictFor, classifyStatus, frontmatterWorkState, splitFrontmatter };
