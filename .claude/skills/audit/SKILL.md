---
# managed by @austencloud/claude-skills - do not edit manually, run: npx @austencloud/claude-skills sync
description: Use when assessing code quality of a feature or component across 7 dimensions
---

# Audit Command

**Args:** `$ARGUMENTS` (optional: target path, or "list", "targets", "stats", "--auto-claim")

## Quick Commands (pass-through)

Prefer the repo-owned scripts when `scripts/audit-tracker.cjs` and
`scripts/collect-evidence.cjs` exist. They are the current pipeline source and
do not depend on the last published package version. Fall back to the package
commands only in projects without those scripts.

If the user passes a tracker command directly, just run it:

```bash
node scripts/audit-tracker.cjs $ARGUMENTS
```

This handles: `list`, `targets`, `stats`, `status <target>`, `resolve-issue <target> <index>`

## Pipeline Workflow

For actual audits (no args, or a target path), run the **three-phase pipeline**:

```
ac-audit --auto-claim → ac-evidence → audit-evaluator agent → record → present
```

### Role Separation (CRITICAL)

| Role | Can read source? | Can grade? | Can fix? |
|------|-----------------|------------|----------|
| Evidence collector (script) | Yes | No | No |
| Evaluator agent | Evidence JSON + source | Yes | No |
| Fixer agent | Cited files only | No | Yes |
| This orchestrator (you) | Coordinates all | No | No |

**You do NOT grade code.** The evaluator agent does. You orchestrate the pipeline.

---

### Phase 1: Claim Target

**No args (auto-select):**

```bash
node scripts/audit-tracker.cjs --auto-claim
```

Parse `CLAIMED_TARGET:` from output. If `AUTO_CLAIM_TARGET:` appears, the claim succeeded.

**With target specified** (e.g., `/audit src/lib/features/shop`):

```bash
node scripts/audit-tracker.cjs claim "$ARGUMENTS"
```

**Large module protection:** If the claim command shows "MODULE TOO LARGE", pick a sub-feature from the list and claim that instead.

---

### Phase 2: Collect Evidence

Run the deterministic evidence collector:

```bash
node scripts/collect-evidence.cjs "<target>" --out .audit-evidence.json
```

This produces structured JSON with per-dimension findings. No LLM involved. Takes ~10 seconds.

---

### Phase 3: Evaluate

Spawn the **audit-evaluator** agent (`subagent_type: "audit-evaluator"`) with the evidence file path and target scope. It returns a scorecard, `GRADES_JSON`, and `ISSUES_JSON` blocks.

---

### Phase 4: Record

Parse the evaluator's `GRADES_JSON` and `ISSUES_JSON` from its response. Record to tracker:

```bash
node scripts/audit-tracker.cjs record "<target>" --grades "<A+,A,B,A,A,A+,A>" --issues-json '<json>'
```

Grade order: Architecture, Code Quality, Accessibility, UX States, UI Consistency, Performance, Security.

---

### Phase 5: Present to User

Show the evaluator's scorecard and issues to the user. Then ask:

1. **Fix now** - Spawn fixer agent for all issues
2. **Fix critical only** - Spawn fixer for critical/serious issues
3. **Skip** - Leave issues for later

---

### Phase 6 (Optional): Fix

Spawn the **audit-fixer** agent (`subagent_type: "audit-fixer"`) with the `ISSUES_JSON`. After fixes, re-collect evidence, re-evaluate, re-record, and present before/after.

## Post-Audit

1. Recording auto-releases the claim
2. If fixes were made, offer to commit
3. Show grades, issues fixed/deferred, and next recommendation

## Key Rules

- Evidence is deterministic. Thresholds are mechanical. 0 violations = A+.
- Evaluator cannot fix code. Re-evaluation uses fresh evidence, not the fixer's word.
- Claims expire after 4 hours. Large modules (>30 files) audit as sub-features.
