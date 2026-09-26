# Worktree consolidation, September 25, 2026

## Scope

Recover completed work stranded outside local `main`, especially the rebuilt
Composer information page. Integrate locally and retire clean, integrated
worktrees. Preserve active tasks, uncommitted work, and intentionally retired
experiments. No remote push or deployment is included.

The consolidation branch is `codex/consolidate-worktrees-20260925`. Its worktree
is `E:/tka-consolidate-worktrees-20260925`; delivery is
<https://localhost:5173/composer> after the guarded local merge.

## Recovered branches

| Branch | Recovered tip | Work |
| --- | --- | --- |
| `codex/about-composer-fusion` | `1f74b07df3` | Composer information page, interactive demos, prop appearance, animation and background fixes |
| `codex/install-guide-drilldown` | `ea288e015a` | Device-specific installation guide, Android screenshots, fullscreen handling |
| `codex/print-qr-size` | `473fd3550f` | Printed QR sizing, decoding guards, serialized print runs |
| `codex/post-studio-polish` | `d4fa9a24ba` | Take timing, tap fitting, fades, export and carousel corrections |
| `codex/rot-override-hand-alias` | `b35d6625a3` | Legacy hand aliases in rotation overrides |
| `codex/visual-calibration-round-one` | `7ddb38b712` | Visual calibration records, design artifacts, and evidence |
| `codex/parity-short-codes` | `1f685d1067` | Physical-card prop identity, turn colors, equal printed grid gutters |
| `codex/text-full-width-publish` | `0ba59d95ab` | Reconciled history; its width change already existed on main |

The two clean Claude branches ending at `4260fb09ce` are also ancestors of the
reconciled text branch. Their notation-caption and style changes already exist
on main as `004c99523a` and `a2b024b7b2`, with later copy improvements retained.

Conflicts were resolved against current main. This preserves translated labels,
newer prop behavior, turns geometry, and updated notation copy. The restored
Composer sections retain the full-width text work. Browser verification caught
a prop-picker reference to a removed label helper; it now uses the current
localized label function and preserves triangle-grip previews.

## Verification

- Focused application tests: 37 files, 892 tests passed. Nine suites initially
  needed local workspace packages built; all nine passed after that setup.
- Additional animation, prop-look, and Fuse tests: five files, 62 tests passed.
- Card surface geometry package: three tests passed.
- Composer worker checks passed for prop crossfades (16), Ocean interactions
  (5), auth nudges (13), hero seeds (2), mandala guide transitions (7), overlay
  attachment (1), and background lifecycle (7).
- Local packages built successfully. A frozen offline dependency install applied
  the recovered backgrounds patch without changing the lockfile.
- In the worktree browser, the Composer hero played, switched to Poi, changed
  to the Ocean theme, rolled another sequence, and opened the Generate demo.
- Composer geometry checked at CSS viewports 375x667, 960x412, 820x1180,
  1440x900, 1920x1080, 2560x1440, and 3840x2160. No horizontal overflow.
- The `/start` guest flow opened the rebuilt installation guide with device
  choices and desktop instructions.

Final integration uses the primary checkout's `npm run wt:finish` guard, which
runs `npm run check`, rejects overlapping uncommitted paths, and rejects a moving
main branch. Its merge receipt is recorded in `.git/automerge-log.jsonl` under
the consolidation branch name. Final delivery requires inspecting `/composer`
on the primary server; the temporary preview is then stopped.

## Retired and preserved work

Eight clean, already-integrated trees were retired during the inventory:
`claude/adoring-haibt-f2c001`, `claude/amazing-grothendieck-67c900`,
`claude/focused-dijkstra-4e647e`, `claude/heuristic-grothendieck-0afb62`,
`claude/nervous-jones-b7f94b`, `claude/priceless-brattain-46fe1f`,
`claude/unruffled-babbage-9386a2`, and `codex/undo-coverage`.

After integration, the six clean recovered feature trees, the two duplicate
Claude trees, and this consolidation tree can be retired by the same guard.
The rotation-alias and parity branches contain uncommitted work, so their
directories must remain even though their committed changes are integrated.

Preserved during this pass:

- Main's 26 unrelated changed or untracked paths, including integration-script
  changes, elemental glyph work, audio candidates, and image assets.
- Active release/sync, German shape-engine, Fuse controls, flowers, and physical
  performer work. Some active tasks landed independently during this pass.
- `hand-mandala-card`: its staged work reverses its only unique commit; do not
  blindly resurrect the earlier version.
- `post-studio-carousel`, `post-studio-localmap`, and `post-studio-takes`:
  uncommitted work mixed with superseded code or unfinished UI.
- Uncommitted material in `grip-elbow-continuity`, `user-marker-contract`,
  `rot-override-hand-alias`, and `parity-short-codes`.
- Previously retired research and WIP branches identified in
  `docs/superpowers/plans/2026-09-04-worktree-retirement-audit.md`.

These remaining trees need individual decisions about unfinished work. They
were neither silently discarded nor represented as completed integrations.
