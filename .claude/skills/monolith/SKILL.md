---
# managed by @austencloud/claude-skills - do not edit manually, run: npx @austencloud/claude-skills sync
description: Use when a file feels too large or has multiple responsibilities that should be separated
---

# Monolith Detection

## Run

```bash
npx -p @austencloud/code-quality ac-monolith --auto-claim
```

## Why This Still Matters With Coding Agents

The goal is not to make files pleasant to read by hand. The goal is to keep an
agent's working context focused, make behavior ownership obvious, reduce change
blast radius, and give verification a narrow target.

Do not optimize for line count. Generated files, literal catalogs, sandbox
routes, and thin orchestrators can be large without being good production
refactor targets. The scanner deprioritizes those by default and ranks active
implementation work by context cost and change risk.

A decomposition is useful only when it produces at least one of these outcomes:

- a task can load one owner instead of several unrelated responsibilities;
- a behavior gains an explicit test or verification seam;
- a change can be made without touching unrelated markup, state, or styling;
- a named owner replaces an ambiguous shared implementation.

## Workflow

1. **Parse CLAIMED_FILE** from output
2. **Read the score reasons** and inspect the claimed file's responsibilities
3. **Evaluate with Four Perspectives** (see below)
4. **Propose decomposition OR mark as audited**
5. **Get confirmation** before proceeding
6. **Extract** following project conventions, or mark audited
7. **Release claim** when done

---

## Critical Guardrails

### The Single Responsibility Test

Line count is a signal, not a rule. The real question:

> "Can I describe what this file does in one sentence without using 'and'?"

A 1500-line orchestrator that wires children together is fine. A 400-line file with 6 tangled responsibilities is not.

### Four Perspectives Test

Evaluate through all four before proposing changes:

1. **Architect** - Is the boundary at the right level?
2. **Change Safety** - Can one behavior change without loading or touching the rest?
3. **Agent Context** - Will future tasks need materially less context after the split?
4. **Skeptic** - Am I solving real coupling or only reacting to line count?

**Convergence:** 3/4 must agree before proceeding.

### When to Extract

| Extract When                                | Example                             |
| ------------------------------------------- | ----------------------------------- |
| Distinct UI section with own markup + CSS   | Header, Footer, SplitPane           |
| Reusable logic in multiple places           | Validation, formatting              |
| Logic that needs unit testing (silent bugs) | Calculations, algorithms            |
| A section you can't describe without "and"  | "handles swipe AND export AND sync" |

### When NOT to Extract

- It's orchestration (wiring children, managing flow)
- It's generated source or a literal data catalog
- Extraction creates thin wrappers with no logic
- The "duplication" is actually encapsulation
- You're uncomfortable with size but can't name the responsibility

### Common Traps

**The Thin Wrapper Trap:** Extracting services that add files but no value. If the extracted class is just a passthrough with no logic of its own, you created 7 files and ~240 lines for nothing. Only extract when the piece has its own responsibility.

**The "It's An Orchestrator" Excuse:** Concluding "leave it alone" for a 2000+ line file because "it orchestrates children." Check if it has 5+ distinct UI sections each with their own markup + CSS. If so, those sections are extractable components, not orchestration.

### The Real Test

1. Can a new developer know what it does from the filename?
2. Can you delete it without breaking unrelated features?
3. Can you find a bug in under 60 seconds?

If yes to all three, it's fine regardless of line count.

Before decomposing, also name the context win in one sentence. If the answer is
only "the files will be shorter," mark it audited or move on.

---

## Two Valid Outcomes

### Option A: Decompose

Extract following project conventions. Get user confirmation first.

### Option B: Mark as Audited

```bash
npx -p @austencloud/code-quality ac-monolith --mark-audited "src/lib/path/to/File.svelte" "Reason: [what it does]. [Why size is inherent]."
```

**Always offer this when concluding "leave it alone."**

---

## Commands Reference

All commands: `npx -p @austencloud/code-quality ac-monolith <flag>`

| Flag                             | Purpose                                        |
| -------------------------------- | ---------------------------------------------- |
| (none)                           | Top 20 monoliths                               |
| `--all`                          | All over threshold                             |
| `--auto-claim`                   | Find and claim top                             |
| `--include-low-signal`           | Include generated/static-data files in ranking |
| `--include-sandbox`              | Include tests, demos, fixtures, and stories    |
| `--claim <path>`                 | Claim specific                                 |
| `--release <path>`               | Release claim                                  |
| `--mark-audited <path> "reason"` | Mark as reviewed                               |
| `--unmark-audited <path>`        | Remove audit mark                              |
