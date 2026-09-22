# Model Routing Contract

Applies to every subagent, workflow, agent-team, or Codex dispatch.

Use delegation for context isolation or genuinely independent, coarse work. Keep
sequential, visual, and single-file work together. A brief names the owned
paths, objective, acceptance checks, and relevant constraints; refer to files
instead of pasting them.

For native Codex workers, set `model: gpt-5.6-terra`,
`reasoning_effort: medium`, and `fork_turns: none` for bounded implementation,
debugging, tests, and documentation. Use `gpt-6-astra` with `high` only when
cross-cutting planning, difficult diagnosis, or failed evidence warrants its
judgment. State why when departing from these defaults.

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
uses the signed-in Codex account and defaults to Terra/medium; override its
model or effort per task when justified. Do not claim that another Codex
process has a separate account quota.
