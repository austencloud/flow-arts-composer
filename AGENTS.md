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
- Completed implementation must be on local `main` or accessible through a
  verified, live worktree preview. A branch name or worktree path alone is not
  delivery.
- In this repository, implementation approval includes scoped commits, guarded
  local integration, and clean worktree removal. From the primary checkout run
  `npm run wt:finish -- <branch> --route /real-route` for reviewable UI or
  `npm run wt:finish -- <branch> --nonvisual` otherwise. Do this without a
  routine permission question unless the user explicitly asks not to merge.
- After integration, verify the changed app route on the primary server and
  provide its direct URL, opening it in the task browser when available. For
  nonvisual work, link the changed file or artifact.
- If guarded integration is blocked or work is kept unmerged for preview, leave
  the branch and worktree intact and continue toward a reviewable delivery.
  For an app route, start or reuse a
  task-owned server whose working directory is this task's worktree, on a free
  non-5173 port, after the resource gate. Verify the changed route against the
  worktree content, open it in DevTools or the in-app browser when available,
  and always provide its clickable URL.
- Keep a handed-off preview server and its delivered browser tab alive past the
  final response. Use a persistent or detached process if the tool session
  would end it, record the task-owned process, port, worktree, and log in task
  context, and reserve its Vite-server slot while it runs. Stop it when
  superseded by integration or when the user finishes the task.
- Nonvisual instruction or code artifacts should prefer integration and do not
  need a fake app server. If integration remains blocked, provide the directly
  reviewable artifact or diff and report the incomplete integration accurately.
  If neither delivery path works, report the concrete blocker and attempted
  alternatives; do not claim completion. Never delete another task's branch or
  dirty worktree.

## Verification

- Match evidence to risk and stop after appropriate checks pass. Documentation
  and instruction-only changes need formatting, reference, and focused contract
  checks, not the full Svelte check. Code changes need the closest tests for
  silent behavior plus the narrowest relevant type, lint, or build check.
- Visual changes need direct browser inspection when they alter geometry,
  responsiveness, element count, structure, or a reported visual defect. Use
  the viewport tiers that can exercise the changed behavior; use the full seven
  viewport matrix for new surfaces or cross-breakpoint layout work.
- New surfaces, substantial restyles, and aesthetic reviews also use
  `.agents/skills/ui-bust/SKILL.md`. Functional and responsive checks do not
  establish aesthetic acceptance. Check the dated research ledger through
  that workflow; do not claim an uncalibrated reviewer detects AI authorship.
- Localhost verification in the dedicated agent browser is part of approved UI
  implementation. External mutation and Austen's personal session still require
  explicit authorization.
- Port 5173 is Austen's IPv6 HTTPS/2 dev server. Never start, restart, replace,
  or kill it. Probe it with `curl.exe -k -g "https://[::1]:5173/"`. A task-owned
  server must use a free port; preserve a handed-off delivery preview as
  described in Repository Lifecycle.

## Exact Routing

Read only the row that matches the task. Do not scan `.claude/rules/` generally.

| Trigger                                                           | Required guidance                                                                                                                  |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Worktree, commit, integration                                     | `.claude/rules/worktree-workflow.md`, `.claude/rules/commit-only-your-own-changes.md`                                              |
| Tests or verification strategy                                    | `.agents/skills/testing/SKILL.md`, `.claude/rules/verification-protocol.md`                                                        |
| UI layout, CSS, motion, responsive structure                      | `src/AGENTS.md`, `docs/architecture/visual-design-canon.md`                                                                        |
| New UI, substantial restyle, aesthetic review or research refresh | `.agents/skills/ui-bust/SKILL.md`, `docs/architecture/visual-review.md`                                                            |
| Sharing, downloads, export, device transfer, publishing           | `docs/architecture/sharing-export-experience.md`, `src/lib/shared/share/AGENTS.md`                                                 |
| 3D environment design, art revisions, or scene review             | `src/lib/shared/3d/AGENTS.md`, `docs/architecture/scene-design-brief.md`                                                           |
| New shared component, service, utility, or behavior               | `.claude/rules/never-hand-roll.md`; search `docs/architecture/canonical-capabilities.md` with `rg` instead of reading it wholesale |
| TKA facts, pictographs, or sequence generation                    | `mcp-server/AGENTS.md`                                                                                                             |
| Locomotion, gait, feet, retargeting, terrain traversal            | `src/lib/shared/3d/AGENTS.md`, `docs/architecture/locomotion-research-canon.md`                                                    |
| Firestore query or index changes                                  | `.claude/rules/firestore-cost-discipline.md`                                                                                       |
| Marketing, UI, or documentation copy                              | `docs/reference/ai-writing-guide.md`                                                                                               |
| Heavy checks or local services                                    | `.claude/rules/resource-budget.md`, `.claude/rules/never-start-the-dev-server.md`                                                  |
| Subagent, workflow, or Codex dispatch                             | `.claude/rules/model-routing.md`                                                                                                   |

Rule explanations and historical documents provide context, not authority. When
guidance conflicts, follow the current user request, then this file, then the
most specific matching contract.
