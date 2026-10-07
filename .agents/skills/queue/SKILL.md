---
name: queue
description: Use when picking work, listing the spec queue, or reconciling a spec with current implementation evidence.
---

<!-- generated from .claude by scripts/sync-codex-skills.mjs; do not edit directly -->

# Spec Queue

## Pick work

When invoked without arguments, run `npm run specs:next`. This command only reads the queue. It does not authorize implementation outside the user's current request.

The queue scans immediate Markdown files in `docs/superpowers/specs/active/` and `backlog/`. It excludes `backlog/someday/`. Only valid, scored, recently reviewed entries in `ready`, `in-progress`, or `verification` can be selected. Missing scores, unverified state, a review older than 30 days, unresolved dependencies, and existing claims hold an entry out of selection.

Read the selected spec, its current handoff, and its plan before acting. Check the relevant source and history for changes since the review. Run `npm run specs:drift` and adjudicate any finding on the pick. Historical design text is not a current implementation instruction.

Tell the user the selected task, score, and specific remaining work. For a verification task, perform its acceptance checks and capture evidence. Do not rebuild a feature just because its original design says "not started". If no entry is eligible, report the reason and reconcile a candidate within the user's scope. Do not invent scores or silently select held work.

## Commands

- `npm run specs:list`: show ranked eligible work and held entries with reasons.
- `npm run specs:next`: show the next eligible entry without claiming or changing it.
- `npm run specs:check`: validate queue metadata and referenced paths.
- `npm run specs:drift`: compare declared state with repository evidence.
- `node scripts/spec-drift-detector.cjs --quiet`: drift counts.
- `node scripts/spec-drift-detector.cjs --json out.json`: machine-readable drift evidence.

A drift verdict is a shortlist for review. Commit traffic can match unrelated words or broad directories. A checked implementation ledger may still have acceptance work. An "implemented" header does not establish that browser, device, production, or external-decision gates passed. Never archive or implement from a detector verdict alone.

## Triage

Read the full spec and inspect the current code and relevant history. Update the opening status and the metadata together when they contradict each other. Keep historical decisions, but label obsolete execution instructions clearly.

Use these work states:

| State        | Meaning                                                               |
| ------------ | --------------------------------------------------------------------- |
| ready        | Current implementation gap confirmed; work can start.                 |
| in-progress  | Some scope exists; a specific current gap remains.                    |
| verification | Implementation exists; acceptance evidence remains.                   |
| blocked      | A prerequisite or external decision prevents progress.                |
| unverified   | Current implementation or remaining scope has not been established.   |
| complete     | All scoped acceptance evidence is recorded; ready to move to shipped. |
| superseded   | A replacement or decision is documented; ready to move to archived.   |

Set `last_triaged` only after an actual review. This date alone does not certify the implementation: `work_state` records the remaining uncertainty. Use null scores when value or effort has not been assessed. Preserve explicit user decision gates.

## Frontmatter

```yaml
---
status: backlog # active | backlog; matches directory
value: null # integer 1-5, or null if unassessed
effort: null # XS | S | M | L | XL, or null
work_state: unverified
remaining: "Inspect the current implementation against the acceptance criteria before planning changes."
depends_on: "" # spec filename, repository-relative spec path, or "external: description"
plan_path: "" # existing repository-relative implementation plan, or empty
tags: []
last_triaged: null # YYYY-MM-DD after review, or null
---
```

Score is computed at read time: value multiplied by XS=5, S=4, M=3, L=2, or XL=1. Score remaining effort, not the cost of already completed work. A score is a prioritization aid, not proof of readiness.

Internal dependencies must resolve to a shipped spec before the dependent entry can be selected. External dependencies hold the entry until their resolution is evidenced. Fix dangling links rather than guessing that a missing dependency shipped.

## Parallel ownership

Before starting work, check `docs/superpowers/specs/.claims/<spec-filename>.lock`. Existing claims hold a spec out of automatic selection. Inspect the owner before taking over; age alone is not permission to overwrite another session's claim.

Create a claim atomically with the session ID, ISO timestamp, and task description. Remove only your own claim after completion or handoff. Worktree-local claims cannot provide a global lock across checkouts; inspect active work before claiming and use the project's existing coordination workflow.

## Completion and handoff

Run the checks appropriate to the change and the repository's integration gates. Documentation changes need metadata, reference, and diff checks. Product changes need their focused acceptance evidence; a successful type check is not feature verification.

Update `remaining`, `work_state`, and `last_triaged` whenever work completes or pauses. Include source paths, relevant commits, or recorded acceptance evidence for significant corrections. If the original spec describes shipped implementation, make the remaining verification or decision visible at the top.

Move to `shipped/` only when all scoped acceptance criteria are satisfied. Move to `archived/` only with a documented superseding decision. Update inbound spec/plan links and directory status when moving, preserve history, and remove only your own claim. Commit explicit owned paths under the repository workflow.
