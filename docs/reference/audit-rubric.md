# Module Audit Rubric

Historical rubric and thresholds. Current workflow entrypoint: `.agents/skills/audit/SKILL.md` (not read during this task).

## How Audits Work

The historical workflow used a **three-phase pipeline** with structural separation:

1. **Evidence collection** (`scripts/collect-evidence.cjs`) - Deterministic. No LLM. Scans files with regex and produces structured JSON.
2. **Evaluation** (historical agent reference: `.claude/agents/audit-evaluator.md`, now absent) - Read-only Sonnet agent. Grades from evidence using mechanical thresholds.
3. **Fixing** (historical agent reference: `.claude/agents/audit-fixer.md`, now absent) - Separate agent. Fixes only cited issues. Cannot grade.

Run audits via `/audit` which orchestrates the full pipeline.

---

## Grade Rubric (8 Dimensions)

Each dimension is graded A+ through F. Thresholds are mechanical based on evidence counts.

### 1. Architecture

| Grade | Criteria                                                                                                            |
| ----- | ------------------------------------------------------------------------------------------------------------------- |
| A+    | 0 barrel imports, 0 Service suffixes, no junk-drawer or stateful-logic utils                                        |
| A     | 1-2 naming violations only                                                                                          |
| B     | 3-5 violations, or a generic `utils.ts`/`helpers.ts` dump, or stateful logic shipped as loose functions in `utils/` |
| C     | Barrel imports or 6+ violations                                                                                     |
| F     | God component, pervasive structural issues                                                                          |

> A `utils/` directory of **pure, stateless functions** named for what they hold
> (e.g. `seeded-rng.ts`, `canonical-json.ts`) is NOT a violation — do not
> downgrade for it. Flag only (1) junk-drawer names where unrelated helpers pile
> up, or (2) stateful logic (cache/lifecycle/deps/coordination) disguised as a
> utility, which belongs in a verb-named service. See the `code-style` skill.

### 2. Code Quality

| Grade | Criteria                |
| ----- | ----------------------- |
| A+    | 0 any-type findings     |
| A     | 1-3 any-type findings   |
| B     | 4-10 any-type findings  |
| C     | 11+ any-type findings   |
| F     | Pervasive type unsafety |

### 3. Svelte 5 Compliance

| Grade | Criteria                 |
| ----- | ------------------------ |
| A+    | 0 legacy patterns        |
| A     | 1-2 legacy remnants      |
| B     | 3-5 legacy patterns      |
| C     | Store imports present    |
| F     | $: statements widespread |

### 4. Accessibility

| Grade | Criteria                         |
| ----- | -------------------------------- |
| A+    | 0 violations                     |
| A     | 1-2 borderline findings          |
| B     | 1-2 files missing reduced-motion |
| C     | 3+ files missing reduced-motion  |
| F     | Widespread violations            |

### 5. UX States

| Grade | Criteria                                              |
| ----- | ----------------------------------------------------- |
| A+    | All 3 states (loading, error, empty) + 0 bare catches |
| A     | 2/3 states present                                    |
| B     | 1/3 states present                                    |
| C     | No state handling                                     |
| F     | No states + bare catches                              |

**Presentational exemption:** Pure presentational components (props in, events out, no async/fetch) don't own loading/error/empty states -- the parent orchestrator does. Grade these on error handling quality only: A+ for 0 bare catches, A for 1.

### 6. UI Consistency

| Grade | Criteria                                 |
| ----- | ---------------------------------------- |
| A+    | 0 hardcoded colors/durations/legacy vars |
| A     | 1-3 duration-only findings               |
| B     | 1-5 hardcoded colors                     |
| C     | 6+ hardcoded colors                      |
| F     | Design system ignored                    |

### 7. Performance

| Grade | Criteria                                                  |
| ----- | --------------------------------------------------------- |
| A+    | 0 barrel imports, 0 unclean effects, 0 direct transitions |
| A     | 1-2 direct transition imports                             |
| B     | 1 barrel or 3-5 effects without cleanup                   |
| C     | Multiple barrel imports                                   |
| F     | Barrel pattern throughout                                 |

### 8. Security

| Grade | Criteria                         |
| ----- | -------------------------------- |
| A+    | 0 {@html}, 0 eval, 0 secrets     |
| A     | {@html} with static content only |
| B     | {@html} with unclear trust       |
| C     | {@html} with user content        |
| F     | eval() or hardcoded secrets      |

---

## Audit Scope Guidelines

| Request                     | Scope                                           |
| --------------------------- | ----------------------------------------------- |
| "Audit the Settings module" | All tabs, services, components in that module   |
| "Audit the Props tab"       | Just that tab component and its direct children |
| "Audit this component"      | Single component focus                          |
| "Full audit"                | Entire application (use subagents per target)   |

---

## Integration with Existing Tools

- **Evidence collection**: `node scripts/collect-evidence.cjs "<scope>" --out .audit-evidence.json`
- **CSS audits**: `audit-reduced-motion.cjs`, `audit-transitions.cjs`, `audit-durations.cjs` (called by evidence collector with `--scope`)
- **Accessibility details**: `accessibility-auditor` agent
- **TypeScript errors**: `/check` command
- **Architecture issues**: `/monolith` command
- **Styling compliance**: [styling guide](styling-guide.md)
- **Tracking**: `audit-tracker.cjs` (claim, record, resolve-issue, stats)
