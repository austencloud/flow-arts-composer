# Flow Arts Composer: Claude Code Adapter

@AGENTS.md

The imported file is the shared contract for Codex, Claude Code, and other
coding agents.

## Priority

- The current user request defines the objective and authorized scope. It
  overrides repository rules and skills unless a higher-priority platform or
  safety instruction conflicts.
- Apply `.claude/rules/*.md` only when the task matches the rule's domain or
  affected paths. Do not treat a historical plan, dated rationale, memory link,
  model name, or quoted incident as current policy.
- When two project files conflict, follow `AGENTS.md`, then the most specific
  matching contract. Report a material unresolved conflict instead of inventing
  a compromise.

## Claude-Specific Operation

- Use the available Claude tool equivalent when shared guidance names a Codex
  tool. Tool names and model catalogs are runtime facts, not repository policy.
- Use the configured Chrome DevTools MCP and
  `scripts/launch-chrome-debug.ps1` for local application verification. Keep one
  task-owned tab, pass its page ID to scoped calls, emulate viewports per page,
  and close only temporary verification tabs when finished. Keep a tab used to
  deliver the result open for Austen to review.
- Use the dedicated agent browser profile for application testing. Austen
  completes password, passkey, CAPTCHA, and consent interactions. Do not use his
  personal browser session without explicit authorization.
- Never start, restart, replace, or kill the dev server on port 5173. Use the
  IPv6 HTTPS probe and a task-owned free port when a separate server is needed.
- In a Git repository, follow the worktree and scoped-commit lifecycle in
  `AGENTS.md`. Guarded local integration needs no extra permission question
  unless the user explicitly forbids merging. If it is blocked or the user
  requests an unmerged preview, deliver a
  verified task-worktree preview on a free non-5173 port when an app route
  exists, keep that preview and its tab alive for handoff, and provide the
  clickable URL. Preserve unrelated work and never use destructive Git cleanup.

Do not add model-version guidance, tool inventories, incident histories, or
duplicated project rules here. Put durable architecture in `docs/architecture/`
and keep this adapter small.
