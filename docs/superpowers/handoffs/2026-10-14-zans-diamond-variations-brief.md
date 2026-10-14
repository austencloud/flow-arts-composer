# Zan's Diamond variations — starting brief (2026-10-14)

Worktree: `E:/worktrees/tka-platform/zans-diamond-variations`, branch
`codex/zans-diamond-variations`, based on local `main` at 11ee23a5a8.
Design is still to be discussed with Austen in this worktree's session.

## What exists

- Austen's public collection **"Zan's Diamond"**:
  `users/PBp3GSBO6igCKPwJyLZNmVEmamI3/collections/dab5fdca-b279-4a50-bd7a-67f291fce071`
  (created 2026-10-13). It holds one sequence,
  `users/PBp3GSBO6igCKPwJyLZNmVEmamI3/sequences/seq_1791923102683_sysj46042`,
  word `IΨ-IΨ-IΨ-IΨ-`. That sequence is the author-verified Zan's Diamond
  hand path. Read its beats with the Firebase MCP or the app before deriving
  anything.
- The Learn curriculum lists "Zan's Diamond variations" under Type 3
  Cross-Shifts (`src/lib/features/learn/domain/concepts.ts`), with no content
  behind it yet.
- The trace-paths spec (`docs/superpowers/specs/shipped/2026-07-20-trace-paths-game-design.md`)
  records that Zan's Diamond must come from an author-verified record, never be
  invented. The saved sequence above is that record.

## Austen's framing

Each hand individually traces the Zan's Diamond path. The variations come from
combining two such hand paths: staggered in time (one hand offset by some
number of beats), reversed (one hand runs the path backwards), or both. The
work is to enumerate those combinations as sequences, decide which are
distinct, and get them into the app (likely the same collection, possibly
Learn content later).

## Open questions for the design conversation

- Which stagger offsets count as distinct for a 4-beat path (0, 1, 2, 3 beats?)
  and whether reversal applies per hand or to the whole pair.
- Whether a generated variation must still parse as a valid TKA word
  (letters resolve per beat) or whether hand-path-only data is acceptable.
- Delivery: sequences appended to the "Zan's Diamond" collection, a Learn
  lesson, or both.
