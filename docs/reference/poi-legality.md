# Poi Legality — everything we know, in one place

**Update 2026-11-22.** Austen's October rules, his 2026-11-22 calls and his sitting 1 verdicts settle the turnaround question this doc left open: under gravity alone, a poi turns around only as a pendulum does, level with the floor and pointing out (section 5, "Settled since"). Checker rule 5 now says that; stalls are held back for now. The θ guess below is set aside. The full sourced history from July to November is kept by the poi desk at `E:/tka-poi/state/history.md`.

**Repository status (2026-10-14):** Later measured transcription evidence is in [the SpiroAnim corpus](../research/spiroanim/README.md). Letter resolution in that corpus does not prove every transition physically executable; the dynamic-transition uncertainties below remain.

**What this is.** Every attempt this project has made to define which TKA motions
a poi can actually perform, what each attempt produced, and what survived. It
exists because the work keeps getting redone from scratch, and because "how does
the Kinetic Alphabet work for poi?" is a question that arrives constantly and
currently has no written answer to point at.

**Status of the answer: partial, and honest about which part.** The steady-state
question is settled and measured. The transition question is open and has no
data at all.

**Sourcing rule, non-negotiable.** The Flow Arts MCP has no poi entries —
`get_term_definition("poi")` returns not-found (verified 2026-07-30, local
server). Poi is not canonical TKA. Every poi claim in this document traces to
either Austen or to a measurement over data in this repo, and each is labelled
which. Do not add a poi claim from general flow-arts knowledge; see
`.claude/rules/no-fabrication.md` and the `feedback_no_fabricated_community_lore`
memory.

---

## 1. The short answer

A poi is a **tethered mass**. A tether can only pull. Everything below is a
consequence of that one sentence.

A staff, club, fan or hoop is gripped: you can place it at any angle at any
moment and hold it there. A poi's head goes where its momentum and the cord's
tension put it. So the poi-performable set is a **subset** of the alphabet, and
the interesting question is exactly which subset and why.

Measured, at the level of steady-state single patterns: **every flower with at
least half a turn is poi-legal. Of the four 0-turn flowers, only `pro-0-out`
survives.** Section 3 is the evidence.

That is 25 of 28 diamond flowers — 89%. **Which means the steady-state layer is
not where poi is limited.** Whatever makes poi restrictive in practice lives in
the transition layer, which nobody has measured yet. Section 5.

---

## 2. The three attempts

### Attempt 1 — five hand-authored symbolic rules (live, dark-gated)

`src/lib/features/levels/poi-lab/services/poi-constraint-validator.ts`

| #   | Rule                                             | Stated reason                                |
| --- | ------------------------------------------------ | -------------------------------------------- |
| 1   | FLOAT only at the position's gravity orientation | —                                            |
| 2   | ANTI at 0 turns never                            | "no tramel motion"                           |
| 3   | PRO at 0 turns with IN orientation never         | "cannot isolate inward-facing swinging prop" |
| 4   | DASH needs ≥ 0.5 turns                           | "can't stop momentum on a dime"              |
| 5   | A turnaround is a pendulum turn: out, at a side  | Austen 2026-10-18; sitting 1, 2026-11-22     |

Rules 1–4 are per-motion (`validateMotion`); rule 5 is per-transition
(`validateTransition`). Until 2026-11-22 rule 5 forbade any CW↔CCW spin
reversal ("needs stall or transition beat"), which section 5 shows was wrong.
It now allows a change of spin direction, or of the way the hand travels round
the grid, only when the beat before it ends pointing out with the hand at east
or west, and refuses it otherwise.

Supporting map, `poi-gravity-orientation-deriver.ts` — the orientation a prop
takes hanging under gravity at each grid location:

| Location          | Gravity orientation                             |
| ----------------- | ----------------------------------------------- |
| N                 | IN (down = toward centre)                       |
| E                 | CLOCK                                           |
| S                 | OUT (down = away from centre)                   |
| W                 | COUNTER                                         |
| NE / SE / SW / NW | CLOCK_IN / CLOCK_OUT / COUNTER_OUT / COUNTER_IN |
| CENTER            | CENTER_S                                        |

Austen's verdict on the five rules at the time: _"it didn't really get it
right."_ Section 3 shows two of them were in fact exactly right, and Section 5
shows which one is actually wrong.

Composer wiring: `apply-poi-legal-filter.ts`, gated
`import.meta.env.DEV || isAdmin()`. Production treats poi as planned.

### Attempt 2 — the momentum simulator (built, reverted)

Thesis (Austen's, recorded in
`docs/superpowers/handoffs/2026-07-18-poi-momentum-simulator-brainstorm-handoff.md`):
**poi legality is governed by momentum continuity.** A move is legal only if it
continues an achievable momentum, and achievability is physics — the worked
example being that an extension is impossible below a minimum hand speed,
because the cord needs enough rotational momentum to stay taut against gravity.

Proposed build: 2D position-Verlet sim reusing `jellyfish-verlet.ts`
(`src/lib/shared/3d/environments/scenes/ocean/runtime/fauna/jellyfish/`) — pin
the hand, tension-only distance constraint for the cord (min = 0), point mass at
the head, constant gravity. Output would be a **minimum BPM** per transition
rather than a boolean, because feasibility is tempo-dependent.

The brainstorm paused on one question that was never answered:

> Is "poi-legal" **(A)** a pure tempo envelope, **(B)** mostly categorical, or
> **(C)** two separable layers — categorical _and_ physical, reported separately?

It was built anyway and **reverted as unusable** — `47402bab2c`, "Revert
docs(poi): momentum-simulator design spec". The reverted direction included the
tempo math and slack modelling.

### Attempt 3 — curation by eye (the current state)

`docs/superpowers/specs/shipped/2026-07-19-poi-legal-matrix-design.md`. Ratified restart
after the revert:

- Flowers first — the VTG pattern matrix is the base.
- Most patterns are poi-performable once momentum is present; the exceptions are
  categorical, not tempo-dependent.
- Legality is judged cell by cell, by eye, with poi-style trails rendered.

Product: `src/lib/features/levels/poi-lab/data/poi-legal-matrix.json` —
**784 verdicts, 625 legal, 159 illegal**, keyed `<blueFlower>|<redFlower>` over
the 28 diamond flowers.

---

## 3. What the curation actually says (measured 2026-07-30)

Predicate tested against all 784 judgments:

> A cell is illegal **if and only if either hand** is one of `anti-0-in`,
> `anti-0-out`, `pro-0-in`.

**784 agree, 0 disagree.** 159 = 784 − 25², exactly.

Three consequences:

1. **Legality is per-hand, not per-pair.** Not one of the 784 judgments depends
   on the combination. The VTG mode a cell is read in doesn't enter into it
   either — the matrix was judged as pairs of shapes.
2. **The by-eye curation and the symbolic rules agree completely.** Those three
   flowers are precisely rules 2 and 3 of `poi-constraint-validator.ts`. Two
   independent attempts, same answer, and nobody had checked until now.
3. **The rule is the 0-turn boundary.** The only other 0-turn flower,
   `pro-0-out`, is legal, and everything at ≥ 0.5 turns is legal. So the
   ratified framing — "poi-performable once momentum is present" — is not a
   slogan; it is what the data says, with the 0-turn line as the boundary.

Reproduce:

```bash
node -e "
const j=require('./src/lib/features/levels/poi-lab/data/poi-legal-matrix.json');
const BAD=new Set(['anti-0-in-diamond','anti-0-out-diamond','pro-0-in-diamond']);
let ok=0,bad=0;
for(const [k,val] of Object.entries(j.verdicts)){
  const [b,r]=k.split('|');
  ((BAD.has(b)||BAD.has(r)?'illegal':'legal')===val) ? ok++ : bad++;
}
console.log(ok,bad);"
```

---

## 4. What the QfT app knows about this

`/notation/qft` implements Cushing's 2011 poi notation, which is the same
subject from the other end: a notation designed _for_ poi rather than a filter
_over_ TKA. Two things there are evidence:

- The source itself encodes the gravity asymmetry: _"A pendulum never touches 7,
  8, or 1, because those point upward."_ Position 8 is north.
- `PENDULUM_PATH = [2,3,4,5,6,5,4,3,2]` in `qft-model.ts` — per-increment prop
  rates of `+1,+1,+1,+1,−1,−1,−1,−1`. The reversals sit at 2 and 6, the
  horizontal.

**The extendulum** (Austen, 2026-07-29, defined by worked example): a move that
follows an extension's hand path — a continuous hand circle — but reverses the
prop's spin at the left and right edges, so it runs extended through one half of
the circle and pendulum-inverted through the other, the tip dragging across the
centre. In his example the prop bearing runs `2 → 4 → 6 → 4 → 2`: horizontal
east, straight down, horizontal west, straight down, back.

Its prop-rate array is **identical to the pendulum's**. The only difference is
hand radius: 0 for a pendulum, 1 for an extendulum. They are one pattern at two
settings of one slider.

**Rotation is not a symmetry here.** Austen, 2026-07-29: TKA is rotation- and
reflection-invariant because gravity is irrelevant to it; QfT is poi notation
and gravity means everything, so a reversal at 4 and 8 is not "the same move
rotated" — it does not exist. Any code that treats the compass as rotatable is
wrong for gravity-bound patterns.

---

## 5. The open part: transitions

The 784-cell matrix judges **steady-state single patterns only**. It contains no
reversals, no transitions, no dashes and no floats. Rules 1, 4 and 5 have never
been tested against any data.

Rule 5 is the one known to be wrong. It forbids spin reversal outright — and the
extendulum is a spin reversal that is performed. Austen, 2026-07-30: _"many
reversals of momentum are possible if done in a specific way where the
orientation lands in a specific way and we just haven't developed the language
or algorithms to identify that quite yet."_

### Settled since: a poi turns around while it points out

Austen's words, each quoted from his chats:

- 2026-10-15: _"Any antispin needs 1 turn, and must go from out to out. isos
  (pro at 0) can have 0 turns but must also be out - out."_
- 2026-10-18: a poi can point in _"as long as the momentum continues in that
  same path until an out point occurs"_.
- 2026-10-18: _"every prop except poi can do one thing poi can't do - Antispins
  with 0 turns"_.
- 2026-10-19, of Gage's 72 CAPs: _"all 72 of Gage's patterns should physically
  work."_ `capPoiProblem` in `src/lib/shared/guide-topics/caps-topic.ts`
  already applies the out-point rule to them.
- 2026-11-22, asked whether a turnaround must point out wherever the hand is
  (option A) or lie level with the floor (option B, the θ guess below), he
  picked A.

That pick read the turnaround point as the **out point** alone. His sitting 1
verdicts the same day (ten moving poi on `/test/poi-reversals`, saved in
`src/lib/features/levels/poi-lab/data/poi-reversal-observations.json`) narrowed
it. Only the pendulum (hand still, poi level) and the extendulum with the hand
at a side and the poi pointing out past it were legal. Turning out at the top
or bottom, out on a diagonal, sideways, or pointing in were all illegal
("Instant momentum change."). Asked whether that means level with the floor
and pointing out, he said:

> "if you apply momentum in the correct way, you can stall upwards or even
> sidewards. It just takes a certain amount of momentum and build-up and
> pull-back at the right rate with the right handpath being applied. ... But if
> you're talking pendulums only and we're experiencing gravity, then yes, that
> is how it would be"

He then chose pendulum turns only for the checker until it can see a hand path
build up. Rule 5 is written to that: out, with the hand at east or west.
`capPoiProblem` still applies the looser out-point rule to Gage's CAPs.

Still open: dashes, floats, statics and planes other than the wall plane have
no call on record. Austen chose on 2026-11-22 to settle them in short judging
sittings, ten moving poi at a time, on `/test/poi-reversals`.

### Set aside: θ, the prop's angle from gravity-down

**Status: a July hypothesis, mine, derived from one worked example plus the
gravity map. Austen picked the out-point rule over it on 2026-11-22. Kept for
the record.**

Define θ as the angle between the prop's bearing and straight down.
`getGravityOrientation` is already the θ = 0 map.

| θ     | State                                                                                         | What it explains                                                                                                                 |
| ----- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 0     | Hanging straight down. Bottom of the swing, fastest point. No momentum required to be here.   | Rule 1 — FLOAT only at gravity orientation                                                                                       |
| ±90°  | Horizontal. Top of a gravity-driven swing arc, where angular velocity naturally reaches zero. | **Where reversals are possible.** The extendulum reverses at bearing 2 and 6 — the horizontals — and moves fastest at the bottom |
| →180° | Overhead. The cord needs speed to stay taut or the head falls.                                | The extension floor the simulator was chasing                                                                                    |

One sentence: **a poi move is legal when every reversal of prop momentum occurs
at θ = ±90°, and every sustained extension carries the speed to hold θ past 90°.**

If that holds, rule 5 isn't wrong about reversals needing something — it's wrong
about what. Not "a stall beat" but "the right θ at the moment of reversal",
which is what "the orientation lands in a specific way" means.

Note the two halves are the two layers framing (C) from the reverted brainstorm,
arrived at from a different direction: the reversal condition is categorical, the
extension condition is physical and tempo-dependent.

### What would settle it

1. **A reversal dataset judged the way the flower matrix was judged.** The
   flower data cannot test the θ claim — those 784 patterns contain no
   reversals, so the predicate passes them trivially.
2. **Austen checking θ = ±90° against moves he actually throws.** One derived
   example is not proof.
3. **Whether extended-through-the-top is real**, or whether the swing family has
   one form (extended through the bottom, inverted through the top, as in the
   worked example). Open.

---

## 6. Where the code lives

| Path                                             | What                                                                                            |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `src/lib/features/levels/poi-lab/`               | All move-legality code. The five rules, the gravity map, the verdict store, the composer filter |
| `.../poi-lab/data/poi-legal-matrix.json`         | The 784 curated verdicts                                                                        |
| `.../poi-lab/services/apply-poi-legal-filter.ts` | Composer entry point, gated `DEV \|\| isAdmin()`                                                |
| `src/routes/test/poi-matrix/`                    | The curation surface + its dev-only save endpoint                                               |
| `src/routes/(public)/notation/poi/`              | The public poi page — says Poi Lab is planned                                                   |
| `src/lib/shared/notation/qft/`                   | Cushing's 2011 poi notation, implemented                                                        |
| `docs/reference/archive/qft-notation/`           | The 2011 source material                                                                        |

**Two unrelated `poi` trees are not legality:** `src/lib/features/poi/` and
`src/lib/shared/poi/` are LED / POV-strip hardware code.

---

## 7. Open questions, ranked

1. **Is legality binary or a tempo envelope?** Asked 2026-07-18, never answered,
   and it still gates the shape of any filter. The θ proposal implies the answer
   is "both, separably" — but that is an implication, not an answer.
2. ~~Does θ = ±90° hold for reversals?~~ Answered 2026-11-22: for a pendulum
   turn, yes, and the poi must also point out. Stalls at other angles need
   momentum build-up (section 5).
3. **What is the transition-layer restriction actually made of?** The steady
   state loses 3 flowers of 28. If poi is as restrictive in practice as it feels,
   the restriction is here, and it is entirely unmeasured.
4. **Does the legality set change with VTG mode?** The matrix says no for
   steady-state shapes. Unknown for transitions.

---

## Related

- `docs/superpowers/handoffs/2026-07-18-poi-momentum-simulator-brainstorm-handoff.md`
  — attempt 2 in full, including the Verlet reuse target
- `docs/superpowers/specs/shipped/2026-07-19-poi-legal-matrix-design.md` — attempt 3
- `docs/superpowers/specs/shipped/2026-07-17-poi-legal-composer-filtering-design.md`
  — the symbolic filter's own admission that five rules are a first pass
- `docs/reference/archive/qft-notation/README.md` — the 2011 source
- `.claude/rules/mcp-ground-truth.md`, `.claude/rules/no-fabrication.md`
