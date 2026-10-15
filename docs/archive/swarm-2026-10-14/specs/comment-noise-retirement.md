# Comment Noise Retirement

Date: 2026-04-30
Status: Implemented and verified
Scope: Codebase-wide removal of AI-generated noise comments that add no information for humans or AI agents

## 2026-08-27 Execution Contract

Austen approved execution in a dedicated worktree so the primary checkout does
not refresh throughout the pass. The working branch is
`codex/comment-hygiene-pass` at `E:/tka-platform-comment-hygiene`.

The original April inventory is historical. A token-aware August rescan of the
present tracked TypeScript, JavaScript, Svelte, and CSS-family sources found
89,038 comment blocks spanning 179,532 lines. It also found:

- 6,097 narration-shaped blocks across 2,085 files;
- 3,504 decorative section blocks across 429 files;
- 674 history, phase, dated-decision, or author-attribution blocks;
- 285 compiler, linter, coverage, and framework directives; and
- 136 generated files, which are excluded from automated edits.

Those are review queues, not deletion totals. Comment trustworthiness is the
target. The pass removes prose that merely mirrors syntax and compresses design
history to the surviving invariant or user-visible consequence. It preserves
licenses, tool directives, generated markers, units, external contracts,
compatibility constraints, security boundaries, and non-obvious algorithms.

Automated edits must satisfy all of these constraints:

1. Every removed byte belongs to a recognized comment token or that comment's
   otherwise-empty line.
2. Generated, vendored, declaration, snapshot, and asset files are skipped.
3. `TODO`, `FIXME`, `HACK`, suppression, coverage, and bundler directives are
   preserved for individual review.
4. A dry run reports candidates by rule and includes representative samples
   before any write occurs.
5. Token streams outside comments must be identical before and after each
   transformed TypeScript or JavaScript-family source.
6. Long comments carrying mixed history and invariants are edited in context,
   never removed by a word-overlap heuristic.

This work changes comments only. If clearer naming or a structural refactor is
needed to make a comment unnecessary, that becomes separate implementation
work rather than being smuggled into this pass.

## 2026-08-27 Results

The pass inspected 9,604 tracked source files and changed comments in 1,325
existing code files. The deterministic batch removed 5,996 blocks spanning
6,855 lines. A contextual pass then compressed the worst history ledgers and
syntax narration, bringing the existing-code diff to 8,550 deletions and 282
concise-comment additions: a net reduction of 8,268 source lines.

The reusable codemod and its regression suite live in
`scripts/strip-noise-comments.mjs` and
`tests/unit/scripts/strip-noise-comments.test.ts`. Its final dry run reports
zero remaining deterministic candidates. Generated sources and directives were
not modified.

The ongoing rule is part of the canonical `code-style` skill and its generated
Codex mirror. It rejects comments that restate nearby code while explicitly
protecting rationale, warnings, contracts, compatibility constraints, units,
security boundaries, tool directives, and non-obvious algorithms. Deletion
count is not a quality target.

Verification evidence:

- a syntax-aware comparison found identical executable structure in all 1,325
  edited code files after comments and whitespace were removed;
- `npm run check` completed with 0 errors and 0 warnings;
- all 7 codemod regression tests passed;
- all 33 public-sequence projection tests passed;
- `git diff --check` passed; and
- the full suite passed 11,487 tests and failed 12. Five load-sensitive or
  randomized failures passed when rerun alone. The seven persistent failures
  reproduced exactly against an untouched archive of the branch's starting
  commit, so none were introduced by this pass.

No browser verification was needed because executable code, markup structure,
and styles are unchanged.

## Historical April 2026 Problem Statement

The codebase contains 109,957 comment lines across 5,358 files (10.9% of total lines). A systematic audit categorizes every comment and identifies 34,235 lines as pure noise: they restate what the code already says, add visual clutter with no informational value, or pad JSDoc blocks with empty filler lines.

This noise has two costs. First, it is the most widely recognized fingerprint of AI-generated code. Any experienced developer opening a file and seeing `/** Delete a daily challenge */` above `deleteChallenge()` immediately concludes: "an AI wrote this and nobody reviewed it." Second, every AI agent session pays tokens to read these comments. Across a typical 50-file Claude Code session, that is roughly 3,000+ wasted tokens per session on content that provides zero signal.

### Audit Results

| Category | Count | Est. Lines | Action |
|---|---|---|---|
| Method JSDoc restating method name | 4,289 blocks | ~15,000 | REMOVE |
| Interface JSDoc (on contracts being deleted) | 1,521 blocks | ~5,300 | REMOVE (covered by enterprise ceremony spec) |
| Class JSDoc restating class name | 3 blocks | ~10 | REMOVE |
| @param tags restating parameter name | 40 tags | ~40 | REMOVE |
| Section divider lines (`// ====`, `// ----`) | 4,082 lines | ~4,082 | REMOVE ALL |
| Empty JSDoc filler lines (bare `*` lines) | 5,429 lines | ~5,429 | REMOVE |
| Obvious inline comments (restate next line) | 4,339 lines | ~4,339 | REVIEW, remove clear noise |
| Useful JSDoc blocks | 14,936 blocks | -- | KEEP |
| Useful inline comments | 32,505 lines | -- | KEEP |

Files requiring changes: ~1,021 out of 5,358 (19%)

Files with section dividers: 591

## The Decision Rule

Every comment must pass one test: **Does this comment tell the reader something they cannot already determine from the code itself within 2 seconds?**

If the answer is no, the comment is noise and is removed.

### REMOVE: Comments that fail the test

**Method/function JSDoc that restates the name:**
```typescript
// BEFORE — noise
/** Create a new daily challenge */
async createChallenge(formData: ChallengeFormData): Promise<DailyChallenge> {

// AFTER — the method name + types are the documentation
async createChallenge(formData: ChallengeFormData): Promise<DailyChallenge> {
```

More examples from the codebase:
- `/** Get current gesture state */` on `getState()`
- `/** Reset zoom to 1x */` on `resetZoom()`
- `/** Check if currently zoomed */` on `isZoomed()`
- `/** Get user activity over time */` on `getUserActivity()`
- `/** Get engagement metrics */` on `getEngagementMetrics()`
- `/** Get top sequences by views */` on `getTopSequences()`
- `/** Update callbacks (e.g., when props change) */` on `updateCallbacks()`

**Class-level JSDoc that restates the class name:**
```typescript
// BEFORE — noise
/**
 * Audit Logger Implementation
 *
 * Writes immutable records of admin operations to Firestore.
 */
export class AuditLogger implements IAuditLogger {

// AFTER — remove entirely (or keep only if the description adds non-obvious info)
export class AuditLogger {
```

**Section dividers:**
```typescript
// BEFORE — visual noise, cargo-culted from Java
// ============================================================================
// Filter Methods
// ============================================================================

private filterByStartingLetter(sequences, filterValue) {

// AFTER — just the code
private filterByStartingLetter(sequences, filterValue) {
```

**Empty JSDoc filler lines:**
```typescript
// BEFORE — padding
/**
 * Apply rubber band effect to offset
 *
 */

// The blank " * " line between description and closing adds nothing
```

**Obvious @param tags:**
```typescript
// BEFORE — restates the parameter name
/** @param id The id */

// AFTER — removed entirely
```

### KEEP: Comments that pass the test

**WHY comments (explain reasoning, not behavior):**
```typescript
// Arena is loop-only — skip sequences without a labeled loop type
if (!loopType) continue;

// Concurrency guard: prevent overlapping prune operations
if (this.pruning) return;

// Use debug level for orphaned sequences (data issue, not bug)
console.debug(`Orphaned sequence ${id}`);
```

**Non-obvious behavior:**
```typescript
// publicSequences is a lightweight index — steps live in the source doc.
// Build entries from the index, then batch-fetch full data via sourceRef.
```

**Firestore collection structure / data model documentation:**
```typescript
/**
 * Collections:
 *   arenaRatings/{entryId}       - ArenaRating documents
 *   arenaVotes/{autoId}          - Individual vote records
 *   arenaSnapshots/{YYYY-MM-DD}  - Daily rank snapshots
 */
```

**Algorithm explanations:**
```typescript
/**
 * Conservative display rating: mu - 2*phi.
 * New entries start at the bottom and climb as uncertainty drops.
 */
displayRating(rating: ArenaRating): number {
```

**TODO / HACK / WORKAROUND markers:**
```typescript
// TODO: Implement user targeting logic when user metadata is available
// Legacy aliases for backwards compatibility
```

### BORDERLINE: Multi-line JSDoc with mixed value

Some JSDoc blocks have a first line that restates the method name but subsequent lines that add genuine information:

```typescript
/**
 * Get all scheduled challenges for a date range            ← REMOVE (restates name)
 * Optimized: Single batch query instead of per-day requests ← KEEP (explains HOW)
 */
async getScheduledChallenges(startDate, endDate) {
```

For these: remove the restating first line, keep the useful content. If the useful content is a single line, convert to an inline comment:

```typescript
// Single batch query instead of per-day requests
async getScheduledChallenges(startDate, endDate) {
```

## Phases

### Phase 0: Codemod Script (30 min)

Write a TypeScript/Node script (`scripts/strip-noise-comments.ts`) that processes each `.ts` and `.svelte` file and applies deterministic removals:

1. **Strip all section dividers**: remove any line matching `^\s*// [=\-\*]{4,}\s*$` and the immediately following line if it is also a comment (the section title). If the section title line is between two dividers, remove all three lines.

2. **Strip empty JSDoc filler**: in any JSDoc block, remove lines that are just `\s*\*\s*$` (bare asterisk lines) unless they separate genuinely distinct paragraphs in a multi-paragraph comment.

3. **Strip single-line restating JSDoc**: for any JSDoc block that is a single descriptive line (no @tags, no multi-paragraph content) followed by a method/function declaration, apply the word-overlap test:
   - Extract words from the comment (excluding filler: the, for, and, with, from, that, this, an, to, of, in, on, by, is, or, all, its, set, get)
   - Extract words from the function/method name (split camelCase)
   - If overlap >= 50% AND comment length < 100 chars: remove the entire JSDoc block

4. **Strip restating class-level JSDoc**: for any JSDoc block immediately preceding `export class`, apply the same word-overlap test against the class name. Additionally, remove any JSDoc whose only substantive content contains the word "Implementation" or "Service" combined with the class name words.

5. **Trim borderline multi-line JSDoc**: for JSDoc blocks where the first descriptive line fails the overlap test but subsequent lines do not, remove only the first line and reformat.

6. **Strip obvious @param tags**: remove `@param` lines where the description is just "The {paramName}" or "The {paramName} to {verbThatRestatesContext}".

Deliverable: a script that takes `--dry-run` (reports what it would do) and `--apply` (does it).

### Phase 1: Automated Removal (est. 30 min)

Run the codemod in `--dry-run` mode, review the report, then run with `--apply`.

Expected: ~25,000-30,000 lines removed across ~1,000 files with zero logic changes.

Validation: `tsc --noEmit` and `vitest run` must pass. Comments are not code, so this phase carries near-zero risk.

### Phase 2: Inline Comment Review (est. 1-2 hours)

The 4,339 "obvious inline comments" need human or agent judgment because they are harder to classify mechanically. Examples:

```typescript
// Initialize the map        ← probably noise (next line is `const map = new Map()`)
// Constants                  ← probably noise (before a const declaration block)
// Return the result          ← definitely noise
```

vs:

```typescript
// Convert legacy /Browse/ paths to /gallery/ paths    ← useful (explains WHY)
// This prevents 404 spam                               ← useful (explains WHY)
```

Strategy: an agent reads each flagged inline comment in context (the comment + the 3 lines after it) and applies the decision rule. If the comment only describes WHAT the next line does, remove it. If it explains WHY, WHEN, or GOTCHA, keep it.

This phase can run as 3-4 parallel agents, each taking a slice of the files.

### Phase 3: Validation

1. `tsc --noEmit`
2. `vitest run`
3. Spot-check 20 files to verify no useful comments were removed
4. Grep for any remaining section divider patterns
5. Run the noise audit script again to verify totals

## Historical Expected Outcomes

| Metric | Before | After |
|---|---|---|
| Total comment lines | 109,957 | ~75,000 |
| JSDoc blocks | 20,749 | ~15,000 |
| Section divider lines | 4,082 | 0 |
| Empty JSDoc filler lines | 5,429 | ~500 |
| Lines removed | -- | ~34,000 |
| Codebase total lines | 1,005,259 | ~971,000 |
| Comment-to-code ratio | 10.9% | ~7.7% |
| Files touched | -- | ~1,021 |
| "AI-generated" fingerprint | Visible in 19% of files | Eliminated |

### Token Impact Per Claude Code Session

A typical Claude Code session reads 50-100 files. With the current noise level, each session wastes approximately 3,000-6,000 tokens on comment noise. After cleanup:

- Per-file savings: ~6-8 noise comment lines removed on average across affected files
- Per-session savings: ~3,000+ tokens (conservative, based on 50-file reads)
- Annual savings at 5 sessions/day: ~5.5M tokens/year

The real win is not the token count but the signal-to-noise ratio. When every remaining comment in the codebase genuinely adds information, AI agents spend less time parsing noise and more time understanding intent.

## Comment Style Going Forward

After cleanup, adopt these conventions for all new code:

1. **No JSDoc on methods/functions unless it adds information beyond the signature.** The method name, parameter names, and TypeScript types ARE the documentation.

2. **Comment WHY, never WHAT.** If you can determine what the code does by reading it, a comment explaining what it does is noise. Comments should explain reasoning, constraints, gotchas, workarounds, and non-obvious decisions.

3. **No section dividers.** If a file needs internal section markers, it needs to be split into smaller files.

4. **No empty JSDoc filler lines.** If a JSDoc block has content, it should be dense.

5. **@param tags only when the parameter name is insufficient.** `@param startDate` needs no description. `@param tolerance Maximum acceptable deviation in radians` does.

6. **File-level JSDoc only for non-obvious module purposes.** A file called `browse-sorter.ts` does not need a comment explaining it sorts browse results. A file called `detect-uniform-pattern.ts` might benefit from a brief explanation of the pipeline stages.

## Risks

1. **False positives in the word-overlap heuristic.** The 50% overlap threshold might occasionally flag a useful comment. Mitigated by the `--dry-run` review step and the fact that removing a useful comment never breaks compilation or tests, only reduces documentation quality. Any false positives can be restored from git.

2. **Borderline multi-line trimming.** Removing the first line of a multi-line JSDoc could occasionally produce an awkward result. The codemod should reformat the remaining lines to be valid JSDoc.

3. **Team expectations.** If other contributors exist or are expected, document the new comment conventions in a CONTRIBUTING.md or similar.

## Historical Execution Strategy for Claude Code

The August implementation used one dedicated Codex worktree. The parallel
strategy below is retained only as the original April proposal.

- Phase 0: Single agent writes the codemod script
- Phase 1: Single agent runs the codemod (`--dry-run`, review, `--apply`)
- Phase 2: 3-4 parallel agents, each taking a slice of files with inline comment noise
- Phase 3: Single agent, validation sweep

Total budget: well under 5% of a weekly Claude Code budget. This is a fast, low-risk cleanup.
