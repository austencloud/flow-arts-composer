# Poi string sweep, 2026-10-19

How hard each CAP spin is to make on a real poi, according to the Poi String
lab's hand solver (`src/lib/features/lab/tabs/poi-string/poi-string-check.ts`).
Austen asked for a finite list; the full ranking of all 676 spins is in
[ranking.md](ranking.md), easiest first.

CAPs credit: Gage DeMello's 72 twelve-beat CAPs, transcribed from Mentive's
SpiroAnim.

## How it works

The poi head follows the drawing; the hand is what gives. A string can only
pull along itself, so on every frame the hand has to sit one string length
from the head, in the direction of the pull the head needs (its acceleration
less gravity). Any smooth head path has such a hand, so **every pattern can be
spun**. What changes is how far that hand has to stray from the drawn hand
path. That distance, the **stray**, is the measure of effort.

Two kinds of smoothing stand in for a real spinner:

- **Speed change (0.25 beat):** the head's speed along its drawn path is eased,
  so a change of spin speed at a beat line spreads over a quarter beat. The
  drawn shape is kept.
- **Turnaround (0.06 beat):** sharp corners in the hand and head paths are
  rounded off.

Reading bands (a reading aid, not physics): **close** within 15 cm, **steer**
15–35 cm, **hard** over 35 cm, and **loose** when the pull drops under a fifth
of the poi's weight.

## What was tried

- **Hand paths:** all 8. A spin's number is its worst case over the 8.
- **Left (capping) hand:** two beats on in one motion, then the beat back in the
  other motion, with turns 0 to 3 in quarters on each (338 spins).
- **Right (circling) hand:** one motion throughout; the third beat may change
  turns, as Gage's Pro 1 → Pro 0 does (338 spins).
- **Shape stray:** gravity off, 180 bpm, hand circle 0.3 to 0.9 m. Without
  gravity the stray doesn't depend on tempo, so this measures the spin's shape
  alone. The ranking sorts by it at a 0.6 m circle.
- **With gravity:** tempo 60 to 240 bpm × hand circle 0.3 to 0.9 m. "Slowest
  tempo" is the slowest one where the hand stays within 35 cm and the string
  stays tight. Gravity matters most when slow: at 60 bpm the hand has to come
  round above the poi at the top of a wall-plane circle.

String 0.6 m throughout.

## Headlines

1. **All 72 of Gage's CAPs are workable.** At 180 bpm with a 0.6 m hand circle,
   every one keeps the string tight and the hand stray under the string's
   length. Six of the nine left/right pairings need 21–30 cm of steering.
2. **The hardest part of Gage's chart is the right hand's Pro 1 → Pro 0.** The
   drop from 1 turn to 0 turns makes the poi slow its spin by two thirds in
   one beat, and the hand strays about 34 cm to make that happen, whatever the
   circle size. With gravity at 180 bpm it is 44 cm, the most of any chart CAP.
3. **The capping hand's prospin beat is not the problem it looked like.** Left
   Pro 1 → Anti 1 strays 17 cm at a 0.6 m circle, less than Anti 1 → Pro 0.
4. **The truly hard spins all involve 0 turns.** Every spin whose stray passes
   the string's length (137 left, 79 right) jumps between 0 turns and a fast
   spin, such as Anti 0 → Pro 3. The poi would have to change speed faster than
   a quarter beat allows, so a real spinner rounds the drawing off.
5. **Spins with similar turns on both sides are easiest.** The left hand's top
   spins (Anti 2.25 → Pro 1.5, Anti 2 → Pro 2, Anti 1.75 → Pro 1.75) stray
   about 12 cm. A plain extension (right Pro 0) strays nothing without gravity.

| Hand  | Close (≤ 15 cm) | Steer (15–35 cm) | Hard (35–60 cm) | Past the string (> 60 cm) |
| ----- | --------------- | ---------------- | --------------- | ------------------------- |
| Left  | 73              | 92               | 36              | 137                       |
| Right | 94              | 111              | 54              | 79                        |

Shape stray at a 0.6 m hand circle, 338 spins per hand.

## Gage's chart

Worst case over its 8 paths.

| Left hand      | Right hand    | Stray at 180 bpm, 0.6 m circle | Slowest tempo, both within 35 cm |
| -------------- | ------------- | ------------------------------ | -------------------------------- |
| Anti 1 → Pro 0 | Anti 1        | 30 cm                          | 180 bpm                          |
| Anti 1 → Pro 0 | Pro 0         | 30 cm                          | 180 bpm                          |
| Anti 1 → Pro 0 | Pro 1 → Pro 0 | 44 cm                          | none up to 240                   |
| Pro 0 → Anti 1 | Anti 1        | 30 cm                          | 180 bpm                          |
| Pro 0 → Anti 1 | Pro 0         | 30 cm                          | 180 bpm                          |
| Pro 0 → Anti 1 | Pro 1 → Pro 0 | 44 cm                          | none up to 240                   |
| Pro 1 → Anti 1 | Anti 1        | 21 cm                          | 120 bpm                          |
| Pro 1 → Anti 1 | Pro 0         | 22 cm                          | 150 bpm                          |
| Pro 1 → Anti 1 | Pro 1 → Pro 0 | 44 cm                          | none up to 240                   |

"None up to 240" means the hand always strays a little over 35 cm, not that
the pattern fails: the 35 cm line is a reading band.

## Corrections to the first sweep

The first sweep (same day) said 40 of the 72 fail. Austen pointed out that all
72 work on real poi. Two mistakes:

- **It pinned both the hand and the poi angle** to the drawing and then asked
  whether a string could carry that. Real hands move off the drawn path to
  steer; the solver now works out that path instead.
- **Its spin-speed formula for antispin was wrong.** The poi turns
  90° + 180° × turns per beat relative to the room for pro and anti alike.

## Rerunning

`sweep.ts` here is the script. Copy it into
`src/lib/features/lab/tabs/poi-string/` as `_sweep.test.ts` and run it with
Vitest, one path per process for speed (about 30 minutes each on d1):

```bash
SWEEP_OUT=out-p1.json PATHS=1 npx vitest run src/lib/features/lab/tabs/poi-string/_sweep.test.ts --testTimeout=0
```

Settings come from the `BPMS`, `RADII`, `LENGTHS`, `TURNAROUNDS` and `BLENDS`
variables. Run `analyze.py` from the folder holding the `out-p*.json` files; it
prints the tables above and writes `ranking.json`.

This run was on d1 because d2 didn't answer over ssh.
