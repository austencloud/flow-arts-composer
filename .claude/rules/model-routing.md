# Model Routing Contract

Applies to every subagent, workflow, agent-team, or Codex dispatch.

Use delegation for context isolation or genuinely independent, coarse work. Keep
sequential, visual, and single-file work together. A brief names the owned
paths, objective, acceptance checks, and relevant constraints; refer to files
instead of pasting them.

For native Codex workers, use `model: gpt-6-sol`,
`reasoning_effort: medium`, and `fork_turns: none` for bounded implementation,
debugging, tests, and documentation. Use `gpt-6-luna` for focused, repeatable
tasks when its result can be checked cheaply. Raise Sol to `high` for complex
logic or edge cases; use `gpt-6-astra` when difficult diagnosis or cross-cutting
judgment warrants it. State why when departing from the ordinary default.

For Claude dispatches, keep its routing separate: use `haiku` for censuses and
mechanical edits, `sonnet` for implementation, tests, and research summaries,
and `opus` for planning, debugging, or review. Set the model explicitly and
raise effort only after evidence warrants it.

Delegate one bounded chunk at a time unless independent chunks justify more.
Do not create reciprocal status or polling loops. A worker reports once at a
natural completed-work boundary with changed paths and ranges, verification
run, and any blocker. The coordinator does not reread completed implementation
except for focused final review, integration, or evidence needed to resolve a
specific risk. Retest when a relevant change or failure creates new risk, then
move to the next task at completed-work boundaries, not timers.

`scripts/codex-ask.sh` is for a bounded CLI second opinion or long review. It
uses the signed-in Codex account and defaults to Sol/medium; override its
model or effort per task when justified. Do not claim that another Codex
process has a separate account quota.

## Cloud Session Waves

Applies when a coordinator spawns unattended cloud sessions against the backlog.

- Establish git facts on real history before briefing anyone. Ahead and behind
  counts, or a missing merge base, read from a shallow clone are not evidence.
  Fetch enough depth, confirm with `git merge-base`, and decide "missing from
  main" by comparing the files a branch created or changed, not by probing for
  a few names.
- Probe before fan-out. When a batch rests on a premise (the branches are
  orphaned, the specs are undone), test it in the coordinator on one branch or
  ten specs. Fund the batch only when the probe finds real work.
- Spend on mergeable code first. Triage, ledgers and reconciliation reports take
  at most a third of a wave unless the user asks for them. State each session's
  expected yield before launch.
- Name what the cloud cannot reach before proposing a plan, and offer the route
  that would make it reachable. Do not route around a source the user named.
- A cloud branch is not delivery. Local agents cannot see it and the spec queue
  on `main` still lists the work as open, so the same spec gets built twice. At
  launch, tell the user which specs are being worked on which branches and
  merge the triage branch first. Schedule a check on integration within three
  days of the wave finishing and report every branch still unmerged.
- Before calling work landed or not landed, diff the branch's files against
  current `main`. An independent implementation of the same spec shows up as
  added or changed files at the same paths.
- Agree on the trigger for the next wave at launch. When the goal is spend by a
  date, a wave that waits on a reply needs a scheduled prompt.
- Report each session's cost from its own usage record.
- Publish a rebased branch under a new name. Do not force-push a published
  branch.
