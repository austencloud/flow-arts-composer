---
paths:
  - "mcp-server/**/*"
  - "src/lib/shared/effects/**/*"
---

# Sequence Generation Rules

Full reference with humor workflow details in `docs/reference/sequence-generation-guide.md`.

## Always Use `constraintPreset: "smooth"`

Two builders exist: legacy (random walk, fails often) and constrained (beam search, reliable). Adding `constraintPreset: "smooth"` triggers the reliable one. Always include it unless user specifies a different constraint.

```
generate_sequence(word: "BOOK", constraintPreset: "smooth")
```

## When User Doesn't Specify a Word

**Never invent words.** Use `length` and/or `loopType` instead:

```
generate_sequence(loopType: "rotated", constraintPreset: "smooth")
generate_sequence(length: 8, constraintPreset: "smooth")
```

## Named Words and Taglines

When user provides a specific named word (e.g. "generate CAKE"), present 4
tagline options from the humor profile before generating unless the user gives
tagline text, declines a tagline, or indicates time pressure. See the full
workflow in `docs/reference/sequence-generation-guide.md`.

Humor-profile training is opt-in. Do not run `scripts/add-humor-pair.cjs` or
modify `mcp-server/src/core/humor-profile.json` unless Austen explicitly asks to
save the choice as training data.

Does NOT apply to requests by letter, level, loop type, or length.

## Effect Previews Use Generated LOOPs

Effect preset labs, effect comparison pages, renderer studies, and other
continuously playing effect previews use the production LOOP generator. Reuse
`InfiniteSequenceGenerator`; do not feed these surfaces a hand-authored museum
drill or an ordinary sequence whose player merely resets at the end.

- Generate 16 counts by default. Eight counts is the minimum. Four-count
  previews are forbidden unless Austen explicitly requests one.
- Validate the result with `isEffectPreviewLoop`, which applies the length
  floor and the canonical placement-plus-orientation seam check.
- Playback moves straight from the closing beat into beat one. Do not add an
  end hold, reset pose, reload flash, or visible jump at the boundary.
- If generation is asynchronous, render an honest loading state and a retryable
  error state. Never fall back silently to a short fixture.
- Orientation-cycle extension performed by the canonical generator is part of
  the LOOP. Do not truncate it to make the count look shorter.

The production references are the landing-page Infinite Spinner and
`EffectsLabPlaybackHost.svelte`. The shared preview policy lives in
`src/lib/shared/effects/domain/effect-preview-loop-policy.ts`.
