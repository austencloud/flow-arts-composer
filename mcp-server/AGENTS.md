# Flow Arts MCP Contract

This file applies under `mcp-server/`. The current user request and root
`AGENTS.md` remain higher priority.

- Treat canonical package data and MCP results as TKA ground truth. Do not
  replace missing data with model memory or inferred geometry.
- Use existing generation, validation, rendering, and viewing owners. Never
  create a second renderer or hand-author base64/image output for a task the MCP
  already supports.
- For a direct generation request, call the generation tool without a separate
  feasibility interrogation. Use `constraintPreset: "smooth"` unless the user
  specifies a different constraint.
- Named-word creative requests may offer tagline choices before generation.
  Generating a result does not authorize modifying the private humor profile,
  `E:/flow-arts-private/humor/humor-profile.json`; save training data only when
  Austen explicitly asks.
- Effect previews use `InfiniteSequenceGenerator`, default to 16 counts, remain
  at least 8 counts, pass `isEffectPreviewLoop`, and play through the seam with
  no end hold or reset flash.
- Preserve the distinction between TKA terms and implementation terminology.
  Verify domain-facing explanations through the current MCP implementation.
- If required domain tooling is unavailable, report that boundary instead of
  creating a fallback renderer or guessed answer.

Read `.claude/rules/sequence-generation.md` for generation behavior,
`.claude/rules/tka-domain.md` for terminology, and
`.claude/rules/verify-at-canonical-source.md` when correcting domain data.
