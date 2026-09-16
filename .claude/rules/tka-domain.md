---
paths:
  - "mcp-server/**/*"
  - "src/lib/shared/{foundation,notation,pictograph,sequence-engine}/**/*"
  - "src/lib/features/{learn,train}/**/*"
  - "docs/learn/**/*"
---

# TKA Language and Tool Contract

The Flow Arts MCP server owns domain facts. Verify terminology there instead of
treating this file as a knowledge base.

- A direct sequence-generation request goes to the matching MCP tool without a
  separate feasibility interrogation. Use `constraintPreset: "smooth"` unless
  the user specifies another constraint.
- Explain pictographs in plain language for the user's level, but retain the
  verified TKA terms for placements, orientations, motion types, turns, and grid
  modes.
- Correct a material terminology error briefly when it changes the answer.
- Use “step” for a sequence entry in TKA-facing UI and documentation. Reserve
  “turn” for the domain meanings returned by the MCP source; do not use it as a
  casual synonym for a LOOP rotation slice.
- Do not present planned labs, props, or capabilities as shipped. Verify the
  current implementation before making availability claims.
- Reflection axis and grid mode are separate inputs. Obtain their exact
  semantics from the current domain tools.

If a static statement here ever conflicts with MCP data, MCP wins and this file
should be corrected.

## Terminology contract

Three spatial ideas, three words. Do not blur them.

| Word | Meaning |
|---|---|
| location | One hand's grid point (N, E, S, W, NE...) |
| placement | The two-hand relationship (alpha, beta, gamma, zeta, eta) |
| position | Coordinates only: x/y, rotation, scroll, seek, CSS |
