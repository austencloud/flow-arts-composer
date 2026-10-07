# Prop versions for hosts with their own prop

Approved by Austen on 2026-10-07 in conversation. Follows
`2026-10-06-prop-versions-design.md`, whose "Known limit" this closes.

## Problem

Hosts that pick a prop for their own use pass no `onPropLookChange` to
`BentoPropGrid`, so its fallback writes the account's `settings.propArtwork`.
A V2 tile in one of them turns the main prop to Version 2 everywhere, the
"sticky 3D" Austen asked to remove.

## Per-host decisions

| Host | What draws its prop | Decision |
| --- | --- | --- |
| Deck releaser (`DeckPropSwitcher`, `LoopBentoBoard`) | Print cards on the locked render path, which only draws an explicit look, so always Version 1 | No version choice: `showPropLook={false}`, tiles show Version 1 |
| Tunnel settings in the viewer's Art pane (`ArtSettingsPanel`) | Writes the account's prop pair on purpose | Unchanged: the global writer and `withPickVersion` are correct here |
| Tunnel creator (`TunnelLayout` → `TunnelArtSettings`, `TunnelArtView`) | `AnimatorCanvas`, which takes a `propLook` override | Creator-only version through `versionAfterPick`, saved with the tunnel |
| Arena (`ArenaPropDrawer` → `PropSelectionSheet`) | Two `InlineAnimationPlayer`s, which take `propLook` | Arena-only version through `versionAfterPick`, shared by both panels |
| Guide codex (`GuideCodexControls` → `PropSelectionSheet`) | Codex cells draw notation (Version 1); the companion animation read the global look | Always Version 1: no version choice, and the companion draws Version 1 in codex mode |

## Rules

- A host with its own version follows the account's pick rule: a V2 tile sets
  Version 2, a versionless pick of a different prop with a Version 2 starts at
  Version 1, and re-picking the held prop (either size) keeps the version. The
  Arena holds one prop and uses `versionAfterPick`; its random prop is a
  versionless pick. The tunnel creator holds a pair, so it runs
  `withPickVersion` on its local pair, exactly as the account does.
- A host without a version choice passes `showPropLook={false}` and
  `propLook="pictograph"`, so the grid shows no V2 tiles and its selected tile
  shows the art the host draws.
- None of these hosts writes `settings.propArtwork`.

## Seams

- `PropSelectionSheet` forwards the pick's version as `onSelect(prop, look?)`
  and passes `showPropLook` through to `BentoPropGrid`.
- `TunnelArtSettings` takes optional `propLook` and `onPropLookChange`; the Art
  pane passes neither and keeps the global writer.
- The tunnel snapshot gains an optional `props.propLook`. A missing value means
  Version 1. The viewer's Art pane captures the global look it draws. Opening
  a saved tunnel in the viewer already writes its prop pair to the account, so
  it writes the saved version with it, the way an applied preset does. The
  tunnel collection's preview draws the saved version.

## Verification

- Component: each host's picker. Deck and Guide show no V2 tiles. Arena and
  the tunnel creator report Version 2 from a V2 tile to the host. None of them
  changes `settings.propArtwork`.
- Unit: tunnel presentation state resets the version on a new prop, keeps it on
  the same prop, and round-trips it through a snapshot; an old snapshot opens
  at Version 1.
- Browser, in a worktree preview: with the main prop at Version 1, pick a V2
  tile in the Arena and in the tunnel creator, then confirm the main Props
  picker still shows Version 1.
