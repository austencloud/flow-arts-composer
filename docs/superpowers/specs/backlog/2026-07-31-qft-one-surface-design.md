---
status: backlog
value: 2
effort: M
remaining: Inspect the current QFT state and active implementation plan for One-hand/Two-hand migration progress before assigning a remaining slice.
depends_on: ''
plan_path: docs/superpowers/plans/active/2026-08-09-qft-one-surface-implementation.md
tags: []
last_triaged: '2026-10-07'
work_state: unverified
---

# QfT: One Surface, Two Hands — Design (2026-07-31)

## The problem

The app has three modes that are largely one mode wearing three hats.

`src/lib/shared/notation/qft/qft-flower-bridge.ts:46-56` settles it. A flower
already supplies four of the five knobs:

```ts
radius: FLOWER_RADIUS,                              // pinned to 1
downbeats: 2 * flower.turns + 1,                    // the ratio
spin: flower.style === "pro" ? "inspin" : "antispin",
phase: flower.ori === "out" ? 0 : 4,
handPhase: flower.grid === "box" ? 1 : 0
```

**Knobs contributes exactly one control the flower picker cannot: hand path
radius.** Line 48 pins radius to `FLOWER_RADIUS = 1`, so every matrix cell is a
radius-1 pattern and the whole rest of the radius range is reachable only from
the other mode.

The guide is nearly as redundant. Seven of its eight moves are plain knob
values (`qft-guide.ts:32-93`) — static spin `r0 db1 inspin`, isolation
`r0.5 db1 inspin phase4`, cateye `r0.5 db1 antispin`, triquetra `r1 db2
antispin`, and so on. With radius available, all seven are reachable from the
picker, and the guide stops being a place you go and becomes a set of presets.

The eighth is the exception, and it is the interesting one.

## The pendulum is the only reversal in the app

`qft-guide.ts:40-46` carries `pendulum: true`, routing to `PENDULUM_PATH`
rather than to any knob combination. It is a **prop reversal**: the rate
changes sign mid-cycle. No flower can express that, because a flower's rate is
constant — that is what makes it a flower.

This matters beyond tidiness. `docs/reference/poi-legality.md` establishes that
the 784-cell curated matrix contains no reversals at all, that 25 of 28 flowers
are legal, and therefore that **the steady state is not where poi is
restricted**. The restriction lives in the reversal layer, where there is no
data. The pendulum is this app's only specimen from that layer, so it is
retained deliberately, not as a tutorial leftover.

### The extendulum is the pendulum at radius 1

Established 2026-07-30 from Austen's worked example: the extendulum follows an
extension's continuous hand circle but reverses the prop at the left and right
edges, running extended through one half and inverted through the other, tip
dragging across the centre. **Its prop-rate array is identical to the
pendulum's; only hand radius differs (0 vs 1).**

So the two are one preset family parameterised by the radius control this
design is already adding. The extendulum costs no extra model work — but it is
unreachable today, because `buildPendulum()` hardcodes `radius: 0`.

## The design

### Modes: One hand / Two hands

The top control switches hand count, and nothing else. This is the only
distinction in the app that names something real — VTG timing is a
*relationship*, so it exists only when there are two hands.

| | One hand | Two hands |
|---|---|---|
| Flower picker | one | two |
| Radius | yes | yes, per hand |
| VTG timing | absent | present |
| Presets | the eight canonical moves | combination moves, incl. the extendulum |

`Guide`, `Knobs` and `Matrix` all disappear as modes. Nothing they did is lost
except the redundancy.

### The per-hand unit

```ts
interface QftHand {
  radius: number;        // hand path radius, in prop lengths
  handDirection: 1 | -1;
  propRate: number[];    // eight per-step rates
  propPhase: number;
}
```

`propRate[8]` replaces the scalar `downbeats × spinSign`. `propIndexAt` becomes
a prefix sum plus a fractional remainder instead of `rate · u + phase`.

A flower writes a constant-sign array. The pendulum writes a sign-changing one.
Same representation, so the same code draws both — and, more to the point, the
same code *notates* both.

### The pendulum gains notation; it does not lose it

`buildPendulum()` (`qft-model.ts:279-294`) is today a hand-written duplicate of
the notation table. It assembles `QftIncrement[]` itself rather than going
through `buildIncrements()` like every other move, and hardcodes three values
while doing it:

```ts
handDepart: 8,
radius: 0,
handArrive: 8,
```

So the pendulum is notated today, but by a parallel path whose hand can never
leave position 8, whose radius is always 0, and which cannot be one half of a
pair. That is exactly why the extendulum is currently impossible — same prop
path, radius 1, and line 289 says 0.

Moving the pendulum into `propRate` retires `pendulumIndexAt`,
`tracePendulum` and `buildPendulum` as *code paths*, not as a move. What the
change buys:

1. The pendulum is written by the real notation pipeline instead of a bespoke
   copy of it, so its table cannot drift from every other table.
2. The extendulum becomes notatable at all.
3. Either can be one hand of a two-hand pairing — **a TKA flower and a poi
   reversal side by side in the same two tables, in the same notation.**

(3) is the QfT↔TKA bridge this app exists to be, and it cannot be built while
the pendulum lives outside the model.

### Reversal position is a derived validity rule, not a flag

TKA is rotation- and reflection-invariant because gravity is irrelevant to it.
QfT is poi notation and gravity is everything, so a reversal at 4 and 8 is not
"the same move rotated" — it does not exist. Reversals sit at 2 and 6, the
horizontal.

This is enforced by reading the array, never by a hand-set flag:

- **Constant-sign array** → no reversals → orientation is free, so `handPhase`
  is offered as a real control.
- **Sign-changing array** → the sign changes must occur at index 2 and 6, and
  `handPhase` is not offered, because rotating the move would move the
  reversals off the horizontal.

Derived, so it cannot be set wrong.

### Presets are the UI layer

A preset writes the array and declares which controls it exposes. The model
never learns the word "pendulum". The eight canonical moves and the matrix
cells become presets over one representation, with their provenance shown
rather than their mode.

## The landing card

Drop the "What am I looking at?" button. The app's top bar already has a `?`
that opens the same panel, so the card's second action duplicates a control
sitting directly behind it — and asks a question the reader cannot have yet,
since arriving from a release-note link they have not seen anything. "What am I
looking at" belongs where there is something to look at.

The card keeps its title, the attribution line, the lede, `Pick a combination`,
and the route out.

## What is lost, stated plainly

`downbeats = 8` becomes unreachable if the flower picker is the only ratio
control: `TURN_VALUES` tops out at 3 turns, and `2 × 3 + 1 = 7`. Nothing in the
guide or the matrix uses 8. Accepted.

## Poi legality: what is honest to ship

Steady-state legality is **solved** — the 784-cell curation reduces exactly to
a three-flower blacklist (`anti-0-in`, `anti-0-out`, `pro-0-in`), 784 agree, 0
disagree. So a legality badge on a two-hand pairing is buildable today and
would be accurate for the steady state.

Legality across a *transition* is not buildable: no dataset exists, and the θ
hypothesis cannot be tested against flowers that contain no reversals. A badge
that silently implied it covered transitions would be the wrong kind of
confident.

**Not in scope for this change.** Recorded so the next session does not
rediscover the boundary.

## Out of scope

- The poi-legal Firestore collection (7 TKA sequences) as content in this app.
- Any transition-legality work.
- The `/sequence/[id]` viewer, untouched.

## Related

- `docs/reference/poi-legality.md`
- `docs/superpowers/handoffs/2026-07-30-qft-surface-and-poi-legality-handoff.md`
- `.claude/rules/crossfade-primitive.md`, `no-layout-shift.md`,
  `4k-native-layout.md`, `clickables-look-like-buttons.md`
