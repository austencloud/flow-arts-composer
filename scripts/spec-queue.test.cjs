const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { parseSpec, loadSpecs, queue } = require("./spec-queue.cjs");
const {
  verdictFor,
  classifyStatus,
  frontmatterWorkState,
  splitFrontmatter,
} = require("./spec-drift-detector.cjs");

function spec(fields = {}) {
  const data = {
    status: "active",
    value: 3,
    effort: "S",
    work_state: "ready",
    remaining: "Verify the route in a browser.",
    depends_on: "",
    plan_path: "",
    tags: [],
    last_triaged: "2026-10-07",
    ...fields,
  };
  return `---\n${Object.entries(data)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join("\n")}\n---\n\n# Test\n`;
}

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "spec-queue-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const dir of ["active", "backlog", "shipped"])
    fs.mkdirSync(path.join(root, "docs/superpowers/specs", dir), {
      recursive: true,
    });
  return root;
}

function write(root, dir, name, body) {
  const rel = `docs/superpowers/specs/${dir}/${name}`;
  fs.writeFileSync(path.join(root, rel), body);
  return rel;
}

test("malformed YAML, duplicate keys, and old non-root plan paths fail validation", (t) => {
  const root = fixture(t);
  const rel = "docs/superpowers/specs/active/example.md";
  assert.match(
    parseSpec("---\nvalue: [\n---\n", rel, root).errors.join(" "),
    /YAML:/
  );
  assert.match(
    parseSpec(
      spec().replace('status: "active"', 'status: "active"\nstatus: "backlog"'),
      rel,
      root
    ).errors.join(" "),
    /YAML:/
  );
  assert.match(
    parseSpec(
      spec({ plan_path: "docs/superpowers/plans/missing.md" }),
      rel,
      root
    ).errors.join(" "),
    /plan_path/
  );
  assert.match(
    parseSpec(spec({ last_triaged: "2026-02-30" }), rel, root).errors.join(" "),
    /last_triaged/
  );
  assert.match(
    parseSpec(
      spec({ last_triaged: "2026-10-08" }),
      rel,
      root,
      "2026-10-07"
    ).errors.join(" "),
    /future/
  );
  assert.equal(
    parseSpec(`\uFEFF${spec().replace(/\n/g, "\r\n")}`, rel, root).errors
      .length,
    0
  );
});

test("blocked high-score and stale or unscored specs never become next", (t) => {
  const root = fixture(t);
  write(
    root,
    "active",
    "blocked.md",
    spec({ value: 5, effort: "XS", work_state: "blocked" })
  );
  write(
    root,
    "active",
    "stale.md",
    spec({ value: 5, effort: "XS", last_triaged: "2026-08-01" })
  );
  write(root, "active", "unscored.md", spec({ value: null, effort: null }));
  write(root, "active", "ready.md", spec({ value: 2, effort: "M" }));
  const ranked = queue(loadSpecs(root), { root, today: "2026-10-07" });
  assert.equal(ranked.find((s) => s.eligible).name, "ready.md");
  assert.equal(ranked.find((s) => s.name === "blocked.md").score, 25);
  assert.match(
    ranked.find((s) => s.name === "stale.md").reasons.join(" "),
    /older than 30 days/
  );
  assert.match(
    ranked.find((s) => s.name === "unscored.md").reasons.join(" "),
    /unscored/
  );
});

test("only shipped dependencies clear the queue; external and active ones hold", (t) => {
  const root = fixture(t);
  write(root, "shipped", "done.md", "# already shipped\n");
  write(root, "active", "base.md", spec());
  write(root, "active", "after-shipped.md", spec({ depends_on: "done.md" }));
  write(root, "active", "after-active.md", spec({ depends_on: "base.md" }));
  write(
    root,
    "active",
    "external.md",
    spec({ depends_on: "external: venue approval" })
  );
  const ranked = queue(loadSpecs(root), { root, today: "2026-10-07" });
  assert.equal(
    ranked.find((s) => s.name === "after-shipped.md").eligible,
    true
  );
  assert.match(
    ranked.find((s) => s.name === "after-active.md").reasons.join(" "),
    /dependency active/
  );
  assert.match(
    ranked.find((s) => s.name === "external.md").reasons.join(" "),
    /external dependency/
  );
});

test("backlog can rank; claims and missing or ambiguous dependencies hold entries", (t) => {
  const root = fixture(t);
  write(
    root,
    "backlog",
    "candidate.md",
    spec({ status: "backlog", value: 5, effort: "XS" })
  );
  write(root, "active", "claimed.md", spec({ value: 5, effort: "XS" }));
  write(root, "active", "missing.md", spec({ depends_on: "absent.md" }));
  write(root, "active", "duplicate.md", spec({ depends_on: "shared.md" }));
  write(root, "active", "shared.md", spec());
  write(root, "shipped", "shared.md", "# shipped\n");
  fs.mkdirSync(path.join(root, "docs/superpowers/specs/.claims"));
  fs.writeFileSync(
    path.join(root, "docs/superpowers/specs/.claims/claimed.md.lock"),
    "owner"
  );
  const ranked = queue(loadSpecs(root), { root, today: "2026-10-07" });
  assert.equal(ranked.find((s) => s.name === "candidate.md").eligible, true);
  assert.match(
    ranked.find((s) => s.name === "claimed.md").reasons.join(" "),
    /claim/
  );
  assert.match(
    ranked.find((s) => s.name === "missing.md").reasons.join(" "),
    /not found/
  );
  assert.match(
    ranked.find((s) => s.name === "duplicate.md").reasons.join(" "),
    /ambiguous/
  );
});

test("drift detection reads work state through a Windows BOM and CRLF", () => {
  const { fm, body } = splitFrontmatter(
    "\uFEFF---\r\nwork_state: in-progress\r\n---\r\n# Roadmap\r\n"
  );
  assert.equal(frontmatterWorkState(fm), "in-progress");
  assert.match(body, /# Roadmap/);
});

test("checked implementation ledger with verification remainder is not phantom done", () => {
  const item = {
    acked: false,
    ledger: { done: 12, open: 0 },
    dir: "active",
    stateClass: classifyStatus("Implemented"),
    workState: "verification",
    deliverables: 0,
    deletedRatio: 0,
  };
  assert.equal(verdictFor(item), "OK");
  assert.equal(
    verdictFor({ ...item, stateClass: classifyStatus("Not yet built") }),
    "STALE_HEADER"
  );
  assert.equal(
    verdictFor({
      ...item,
      acked: true,
      stateClass: classifyStatus("Not yet built"),
    }),
    "STALE_HEADER"
  );
  assert.equal(
    verdictFor({
      ...item,
      acked: true,
      workState: "unverified",
      stateClass: "NOT_STARTED",
      ageDays: 60,
      topicalCount: 80,
      exactFileCount: 4,
    }),
    "DIVERGENT"
  );
  assert.equal(verdictFor({ ...item, workState: "ready" }), "PHANTOM_OPEN");
});
