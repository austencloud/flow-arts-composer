# The Ghost learns what activities are worth doing

**Date:** 2026-08-06
**Status:** Shipped. Implemented and verified.
**Extends:** `2026-08-06-ghost-activity-intelligence-design.md`

**Reconciliation 2026-09-13:** owner module
`src/lib/shared/attract/domain/activity-experience.ts` is present and live.
Re-ran `vitest run --config tests/config/vitest.config.ts tests/unit/attract/`
against `c4be1619`: 9 files, 68 tests passed, 2 skipped (the env-gated fleet
test, exactly as this spec's contract expects). Moved out of `active/` — it had
been declaring itself implemented since 2026-08-06.

## The 7.0 target

The Ghost remembers several authored facts, but it cannot yet learn the value
of an arbitrary experience. Empty rooms, familiar navigation, and unchanged
playback each have their own memory rule. A new activity receives no judgment
unless another rule is written for it.

The 7.0 target is a general outcome loop:

```text
choose an activity
  -> remember the situation and its goal
  -> perform the activity
  -> compare the resulting world with the starting world
  -> record completion, achievement, and novelty
  -> retrieve similar episodes before the next choice
```

The loop remains deterministic, local, inspectable, and safe for an unattended
installation. No model call or external persistence is introduced.

## A shared goal vocabulary

Every activity declares one goal:

- `make`: produce a changed presentation or sequence.
- `inspect`: spend attention on something that can be watched or studied.
- `discover`: find a new encounter or perform a useful action in another area.
- `correct`: reverse or repair a previous choice.

The goal states what success means without giving each activity its own reward
function. New activities must select an existing goal unless the product gains
a genuinely new kind of purpose.

## The episode

An activity episode stores:

- activity and goal;
- starting situation and ending time;
- completed or abandoned outcome;
- successful actions, perceptions, and watched payoffs;
- measured world changes;
- goal achievement and result novelty;
- a final value between zero and one.

The situation records coarse facts that remain useful across UI changes:
module, tab, sequence-size band, whether effects are active, gallery-budget
state, camera availability, and the visible capability kinds. Retrieval uses
similarity over these facts instead of requiring an exact serialized match.

## Learning may advise, not imprison

Activity utility keeps its authored appeal, cooldown, and session novelty.
Retrieved experience applies a bounded multiplier from 0.75 to 1.25. Low-value
episodes can make an activity less likely. They cannot make it impossible.
Confidence rises over the first three similar episodes, so one unlucky result
does not rewrite the whole personality. An expected value of 0.72 is neutral:
results below it temper the activity, while stronger results reinforce it.

Only the most recent 200 episodes remain in session memory. Recent similar
episodes receive the most weight. A changed screen therefore earns fresh
exploration instead of being judged by stale evidence from a different state.

## Observability

The developer status exposes each candidate's base score, learned expectation,
confidence, and final score. Session memory retains the last episode and the
bounded history. The public thought caption does not narrate numeric reward.

## Behavioral contracts

- A completed activity always produces one episode.
- An abandoned activity produces one episode and a lower completion signal.
- A productive result scores above an empty completed visit.
- Similar high-value outcomes raise an activity's score.
- Similar low-value outcomes lower it without reducing it to zero.
- Unrelated contexts do not transfer full confidence.
- The 1,000-click session still has no failed actions, premature replay, or
  repeated barren-room visits.
- A seeded fleet records learned choices in every session without losing any
  activity family.
