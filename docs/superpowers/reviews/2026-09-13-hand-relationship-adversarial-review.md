# Hand Relationship adversarial review

Reviewed the shipped feature against the September 13 handoff, using a worktree based on `cb4d4210b4`.

## Findings and changes

1. **Spell silently dropped the settings.** `onSpellGenerate` constructed its own options without Hand Relationship, Inverted, or Match turns. Its later bridge-aware extension also had no relationship constraint. Constrained spells now use the existing config mapper and the engine's word/LOOP pipeline. Tests cover option propagation, period coercion, a compatible mirrored word with matched turns, and incompatible words.
2. **Old Saved Setups inherited the live constraints.** Both setup application entry points now use one replacement operation. Missing fields take defaults, malformed relationship fields are dropped, and absent optional settings are cleared. Ordinary control updates retain their partial-update and no-op semantics. Tests exercise replacement, serialization, malformed values, and unchanged updates.
3. **LOOP transforms left float provenance stale.** Reflection, inversion, and rewind transformed the live motion but left its saved pre-float type or direction unchanged. Letter lookup consumes those fields. The existing executors now transform the optional provenance too. Twenty-four cases cover left-only, right-only, and paired floats, including combined transforms and overlay inversion.
4. **Symmetric hands triggered false LOOP identity failures.** A requested swap can also read as a rotation, and transported box reflections need not have one global axis. The detector's preferred description is insufficient to validate those requests. Constrained builds now replay the requested construction through the canonical executor and compare every motion's path, type, spin, turns, and float provenance against the output cycle. Position, orientation, and exact-length checks remain in force. Unconstrained requests retain their existing validation.
5. **Start selection conflicted with the relationship.** A forced beta start excluded valid opposite-hand starts. An invalid first LOOP target could also abort the search before reaching an eligible target, causing intermittent quartered Unison failures. Relationship-constrained builds now let the hard constraint determine eligible starts, and compositional specs use the canonical endpoint selector. A deterministic regression pins the formerly failing target order.
6. **The Generate button missed relationship edits.** Its existing changed-settings comparison now includes all three fields.

## Evidence

- Baseline: 57 focused engine tests and 157 app tests passed before fixes. Those tests did not exercise the broken boundaries above.
- App regression set: 25 files, 163 tests passed. After refining replacement's no-op behavior, the affected 15 state tests passed again.
- Final engine suite: 54 files, 763 tests passed. The TypeScript package build passed.
- LOOP matrix: 272 combinations cover both grids, all four relationships, plain/inverted, and all 17 LOOP types at level 2 with a requested 16 steps. Assertions cover every step's relationship, exact length, and circularity.
- The relationship build file also exercises matched turns, floats, compatible and incompatible words, and existing quartered Unison/no-dash cases.
- Negative coverage rejects corrupted derived motion data and preserves rejection of weaker LOOP identities on unconstrained requests.

Commands run from the worktree root unless noted:

```powershell
node node_modules/vitest/vitest.mjs run --config tests/config/vitest.config.ts src/lib/features/create/generate src/lib/shared/create/domain src/lib/shared/create/services/loop-type-utils.hand-relationship.test.ts tests/unit/services/generation-orchestrator-hand-relationship.test.ts tests/unit/create/generate/spell-truncation-toast.test.ts --maxWorkers=2
# From packages/sequence-engine:
node ../../node_modules/vitest/vitest.mjs run --config vitest.config.ts --maxWorkers=2
```

## Review boundaries

- Browser verification could not run: the in-app browser twice returned `Timed out waiting for the Browser webview to attach for this browser-use page`. Drawer reset, real-keyboard navigation, public Composer presentation, and the changed Generate indicator therefore remain visually unverified in this review. No task-owned server was started and port 5173 was not changed.
- Source inspection confirms the public Composer omits the optional relationship handler, and the overlay resets all three local values alongside the config reset. This is source evidence, not a browser result.
- Saved Setup behavior was tested locally. No live Firestore writes were performed.
- Independent turns and independent start orientations remain the recorded product decisions. No new orientation lock or LOOP coercion was added.
- The separate arrow-key task, feedback status, and worktree cleanup implementation were not modified.
