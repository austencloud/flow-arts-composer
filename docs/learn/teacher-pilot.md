# Teacher pilot

Status: ready for the first eligible Learn task. Authorized by Austen on
2026-09-05 in the agent-architecture discussion. No outcome has been measured.

## Hypothesis and scope

A small briefing of accepted and rejected decisions may reduce repeated user
corrections. A profession name alone is not the mechanism. Better briefing may
account for any improvement; this trial cannot isolate an agent-persona effect.

Use Teacher on the next three distinct Learn design or implementation tasks
that produce an experience for Austen to inspect. Include every eligible task,
including difficult or unsuccessful ones. A continuation or fix round belongs
to the same task. Status queries, mechanical fixes, and this setup do not count.
Read-only reviews may use the briefing but do not write pilot records.

Invoke the `teacher` agent when it is available and delegation is appropriate.
Otherwise the current task lead applies [the same briefing](teacher-brief.md)
through the concepts workflow. Record which mode was used. Do not create a
second lead or fan out work to perform this pilot. A fresh agent catalog may be
needed to expose newly added definitions; inline use remains available.

## What to record

At the beginning of an eligible modifying task, append its task ID, scope,
complexity (small local change or larger interaction/handoff), and briefing
revision. At a review or close, record these observations in the same row:

| Measure                       | Counting rule                                                                                                                                            |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repeated preference           | One user correction restating an already recorded applicable preference; link both the earlier decision and the new correction.                          |
| Rejected approach revived     | One previously rejected approach returned in the delivered proposal or implementation; link the rejection and the result.                                |
| Substantial correction rounds | User review rounds requiring changes to interaction, teaching meaning, hierarchy, or responsive composition. Count a round once, not each comment.       |
| Effort                        | Observed briefing and review time or usage when available, with source and units. Keep user effort separate from agent effort. Otherwise record unknown. |

The categories can overlap. Never add them into a synthetic quality score.
Separate a new preference or changed scope from a repeated correction. Technical
fixes and commit counts are not evidence of user dissatisfaction.

Record evidence in the existing task/handoff and link it here. A task link or
canonical review with a dated, short correction summary is enough; do not copy
private transcripts. No reply means pending review, not zero corrections. Zero
is valid only for an observed review period, whose endpoint must be named.
Do not ask Austen to complete a survey after every task.

## Comparison and stopping rule

Before reporting improvement, select up to two recent comparable Learn tasks
with accessible review evidence and explain the match in scope and complexity.
Start with the candidates below. If evidence cannot establish counts or effort,
leave them unknown. Do not reconstruct correction counts from commit messages.

After three reviewed tasks, give Austen one short comparison with the evidence
and confounders, including changed model, task difficulty, and briefing changes.
Recommend keeping, revising, or retiring Teacher based on repeated corrections,
substantial rework, and overhead. Missing baseline or user review makes the
result inconclusive. Do not claim success or expand the roster automatically.
If the role adds ceremony without helping, recommend keeping only useful source
links. Curator, Scenographer, and Toolsmith remain proposed until Austen chooses
an expansion after seeing evidence.

## Baseline candidates

| Candidate                                    | Available evidence                                                                                                                                               | Repeat / revival / rounds / effort    |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Hand Positions clarity revision, September 5 | [Copy review](copy-reviews/hand-positions.md#approved-clarity-revision-2026-09-05) records user feedback and approval; full review history still needs checking. | Unknown / unknown / unknown / unknown |
| Grid continuation, September 3               | [Copy review](copy-reviews/grid.md) records exact approved text; likely comparable only to a small handoff change.                                               | Unknown / unknown / unknown / unknown |

## Trial record

Continuation records below do not establish a measured baseline or pilot outcome.

| Task and evidence | Scope / complexity | Mode / briefing revision | Review state and endpoint | Repeats / revivals / rounds | User effort / agent effort | Confounders |
| ----------------- | ------------------ | ------------------------ | ------------------------- | --------------------------- | -------------------------- | ----------- |
| Hand Positions, task `01a06d6d-75fc-7cc3-9d75-32a30d7c1f30`; [September 8 motion follow-up](hand-positions-ux-audit.md#content-motion-and-exploration-tools-september-8) | Interaction and responsive composition; continuation of September 5 work | Inline lead; September 5 briefing with recorded follow-ups | Anchored layout and canonical glyph revision accepted; content transitions, grid toggle and post-completion transforms requested next; follow-up pending review | Unknown cumulative counts; three observed substantial September 8 correction rounds, then one accepted-layout enhancement request | Unknown / unknown | Earlier rounds predate this record; do not infer counts from commits |

Keep records in the task-owned worktree and reconcile concurrent additions
without overwriting another task's row. During read-only work, report any new
evidence in the response and leave this file unchanged.
