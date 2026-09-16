---
paths:
  - "mcp-server/**/*"
  - "src/lib/shared/{foundation,notation,pictograph,sequence-engine}/**/*"
  - "src/lib/features/{learn,train}/**/*"
  - "docs/learn/**/*"
---

# TKA Ground-Truth Contract

Use the Flow Arts MCP server for user-facing claims about letters, VTG,
placements, pictographs, terminology, word feasibility, transitions, or physical
execution. Use a current-turn result or a result already present in the same
conversation; do not rely on model memory or existing UI copy.

| Claim                                       | Preferred lookup                                  |
| ------------------------------------------- | ------------------------------------------------- |
| Letter behavior or alphabet structure       | `get_letter_explanation`, `get_alphabet_info`     |
| Pictograph structure                        | `get_pictograph_data`                             |
| VTG pattern, shape, category, or transition | matching `get_vtg_*` tool                         |
| Term or deep topic                          | `get_term_definition`, `get_domain_topic`         |
| Available letters or variations             | matching `list_*` tool                            |
| Word feasibility or LOOP structure          | `analyze_word_feasibility`, `detect_loop_pattern` |
| Comparison                                  | `compare_letters`                                 |

If the server is unavailable, stop the domain-dependent portion and report the
missing capability. Routine interface language without a TKA claim does not
need MCP evidence.

For educational or marketing copy, map each substantive TKA claim to current
evidence. Material claims about ease, intuition, pedagogy, visual effect, or
physical feel need explicit support; do not invent them to improve prose. A
separate approval or review record is required only when the user or the owning
curriculum workflow asks for one.
