# Flow Arts Composer Agent Contract

This is the project entry point. Keep only stable, project-wide constraints
here. The current user request has priority over repository rules and skills
unless a higher-priority platform or safety instruction conflicts.

## Request Boundary

- Reviews, explanations, investigations, and recommendations are read-only.
- A direct request to build, fix, update, rewrite, or implement authorizes that
  stated repository change and its normal verification lifecycle.
- Do not expand approved work into adjacent cleanup, deployment, external-data
  mutation, purchases, messages, or personal-account actions.
- Resolve routine questions from code and tools. Ask Austen only for a material
  product choice, user-only interaction, destructive scope outside the approved
  workflow, or a genuine blocker.
- Preserve unrelated and in-flight changes.

## Repository Lifecycle

- Every modifying task uses one dedicated worktree based on `main`. The primary
  checkout at `E:/tka-platform` is reserved for read-only investigation, the
  dev server, and final integration unless Austen explicitly requests direct
  edits there.
- Create a unique `codex/<task-slug>` branch. Stage and commit only task-owned
  paths; never use broad staging, a bare commit, or destructive reset/checkout.
- In this repository, implementation approval includes scoped commits, guarded
  local integration, and clean worktree removal. From the primary checkout run
  `npm run wt:finish -- <branch> --route /real-route` for reviewable UI or
  `npm run wt:finish -- <branch> --nonvisual` otherwise.
- If any gate fails, leave the branch and worktree intact and report the exact
  blocker. Never delete another task's branch or dirty worktree.

## Verification

- Match evidence to risk and stop after appropriate checks pass. Documentation
  and instruction-only changes need formatting, reference, and focused contract
  checks, not the full Svelte check. Code changes need the closest tests for
  silent behavior plus the narrowest relevant type, lint, or build check.
- Visual changes need direct browser inspection when they alter geometry,
  responsiveness, element count, structure, or a reported visual defect. Use
  the viewport tiers that can exercise the changed behavior; use the full seven
  viewport matrix for new surfaces or cross-breakpoint layout work.
- Localhost verification in the dedicated agent browser is part of approved UI
  implementation. External mutation and Austen's personal session still require
  explicit authorization.
- Port 5173 is Austen's IPv6 HTTPS/2 dev server. Never start, restart, replace,
  or kill it. Probe it with `curl.exe -k -g "https://[::1]:5173/"`. A task-owned
  server must use a free port and be stopped in the same turn.

## Exact Routing

Read only the row that matches the task. Do not scan `.claude/rules/` generally.

| Trigger                                                 | Required guidance                                                                                                                  |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Worktree, commit, integration                           | `.claude/rules/worktree-workflow.md`, `.claude/rules/commit-only-your-own-changes.md`                                              |
| Tests or verification strategy                          | `.agents/skills/testing/SKILL.md`, `.claude/rules/verification-protocol.md`                                                        |
| UI layout, CSS, motion, responsive structure            | `src/AGENTS.md`, `docs/architecture/visual-design-canon.md`                                                                        |
| Sharing, downloads, export, device transfer, publishing | `docs/architecture/sharing-export-experience.md`, `src/lib/shared/share/AGENTS.md`                                                 |
| 3D environment design, art revisions, or scene review   | `src/lib/shared/3d/AGENTS.md`, `docs/architecture/scene-design-brief.md`                                                           |
| New shared component, service, utility, or behavior     | `.claude/rules/never-hand-roll.md`; search `docs/architecture/canonical-capabilities.md` with `rg` instead of reading it wholesale |
| TKA facts, pictographs, or sequence generation          | `mcp-server/AGENTS.md`                                                                                                             |
| Locomotion, gait, feet, retargeting, terrain traversal  | `src/lib/shared/3d/AGENTS.md`, `docs/architecture/locomotion-research-canon.md`                                                    |
| Firestore query or index changes                        | `.claude/rules/firestore-cost-discipline.md`                                                                                       |
| Marketing, UI, or documentation copy                    | `docs/reference/ai-writing-guide.md`                                                                                               |
| Heavy checks or local services                          | `.claude/rules/resource-budget.md`, `.claude/rules/never-start-the-dev-server.md`                                                  |
| Subagent, workflow, or Codex dispatch                   | `.claude/rules/model-routing.md`                                                                                                   |

Rule explanations and historical documents provide context, not authority. When
guidance conflicts, follow the current user request, then this file, then the
most specific matching contract.
