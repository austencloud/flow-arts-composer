# Poi string sweep, 2026-10-19

Which CAP spins a poi can follow, and at what settings, according to the
Poi String lab's string check (`src/lib/features/lab/tabs/poi-string/poi-string-check.ts`).
Austen asked for a finite list; this is the full output behind it.

CAPs credit: Gage DeMello's 72 twelve-beat CAPs, transcribed from Mentive's SpiroAnim.

## What was tried

- **Hand paths:** all 8. A spin counts as working only if it works on every path
  (they differ only in how the pattern sits against gravity).
- **Left (capping) hand:** two beats on in one motion, then the beat back in the
  other motion. Turns on the forward beats and on the beat back each run through
  0, ¼, ½ … 3 (169 pairs per motion, 338 in all). Float was left out.
- **Right (circling) hand:** one motion throughout; the third beat may change
  turns, as Gage's Pro 1 → Pro 0 does (338 in all).
- **Settings (35):** tempo 60, 90, 120, 150, 180, 210, 240 bpm × hand circle
  radius 0.3, 0.45, 0.6, 0.75, 0.9 m. String 0.6 m, turnaround 0.06 beat,
  gravity on.

A spin **works** at a setting when the string never goes slack and the pull never
leans more than 25° off the string, on every beat.

**Assumption (not physics):** the check knows nothing about how fast a person can
spin. Fast spins keep a string tight, so without a limit the fastest tempo always
looks best. Settings where the poi would turn faster than **3 times a second**
(relative to the room) are dropped. Change `CAP` in the script to try another limit.

## Headlines

1. **Gage's chart:** 32 of the 72 work. These are the four rows built only from
   Anti 1 and Pro 0 (left Anti 1 → Pro 0 or Pro 0 → Anti 1, against right Anti 1
   or Pro 0), on all 8 paths. They work only at **180–240 bpm** with a hand
   circle of **0.45–0.6 m** (about the string's length). Every CAP with a
   prospin beat (left Pro 1 → Anti 1, right Pro 1 → Pro 0) fails at every setting.
2. **The capping hand decides.** 93 of 338 left-hand spins work somewhere;
   153 of 338 right-hand spins do. The right hand works almost anywhere from
   1¼ turns up.
3. **Under 1 turn, the capping hand never works,** apart from Gage's
   Anti 1 → Pro 0 and Pro 0 → Anti 1.
4. **The beat back wants more turns, not the same.** After the hand turns round
   with the poi pointing out, the poi naturally speeds up. The widest window is
   **Pro 1¼ → Anti 2½** (90–180 bpm, any hand circle). Pro 1 → Anti 3 works
   where Gage's Pro 1 → Anti 1 never does.
5. **Small hand circles forgive more.** Most capping spins that work only at one
   or two settings need the 0.3 m circle.

## Left hand (capping), 93 spins

| Spin                 | Settings that work (of 35) | Tempo       | Hand circle |
| -------------------- | -------------------------- | ----------- | ----------- |
| Pro 1.25 → Anti 2.5  | 20                         | 90–180 bpm  | 0.3–0.9 m   |
| Anti 2.75 → Pro 2.5  | 13                         | 60–120 bpm  | 0.3–0.9 m   |
| Anti 3 → Pro 2       | 13                         | 60–120 bpm  | 0.3–0.9 m   |
| Pro 2 → Anti 3       | 13                         | 60–120 bpm  | 0.3–0.9 m   |
| Anti 2.25 → Pro 1.5  | 11                         | 90–180 bpm  | 0.3–0.75 m  |
| Pro 2.25 → Anti 2.5  | 11                         | 60–120 bpm  | 0.3–0.9 m   |
| Anti 2.5 → Pro 2.5   | 10                         | 60–120 bpm  | 0.3–0.75 m  |
| Anti 3 → Pro 2.5     | 10                         | 60–120 bpm  | 0.3–0.75 m  |
| Pro 2.5 → Anti 2.5   | 10                         | 60–120 bpm  | 0.3–0.75 m  |
| Pro 2.5 → Anti 2.75  | 10                         | 60–120 bpm  | 0.3–0.75 m  |
| Pro 2.5 → Anti 3     | 10                         | 60–120 bpm  | 0.3–0.75 m  |
| Anti 3 → Pro 3       | 9                          | 60–90 bpm   | 0.3–0.9 m   |
| Pro 3 → Anti 3       | 9                          | 60–90 bpm   | 0.3–0.9 m   |
| Anti 2.25 → Pro 2.5  | 8                          | 60–120 bpm  | 0.3–0.75 m  |
| Anti 2.75 → Pro 3    | 8                          | 60–90 bpm   | 0.3–0.9 m   |
| Anti 3 → Pro 2.25    | 8                          | 60–120 bpm  | 0.3–0.75 m  |
| Anti 3 → Pro 2.75    | 8                          | 60–90 bpm   | 0.3–0.9 m   |
| Pro 2.25 → Anti 3    | 8                          | 60–120 bpm  | 0.3–0.75 m  |
| Pro 2.75 → Anti 3    | 8                          | 60–90 bpm   | 0.3–0.9 m   |
| Anti 2.25 → Pro 2.25 | 7                          | 60–120 bpm  | 0.3–0.6 m   |
| Anti 2.5 → Pro 2.25  | 7                          | 60–120 bpm  | 0.3–0.6 m   |
| Anti 2.75 → Pro 2.25 | 7                          | 60–120 bpm  | 0.3–0.6 m   |
| Anti 2.75 → Pro 2.75 | 7                          | 60–90 bpm   | 0.3–0.75 m  |
| Pro 1 → Anti 3       | 7                          | 90–120 bpm  | 0.3–0.9 m   |
| Pro 2.25 → Anti 2.25 | 7                          | 60–120 bpm  | 0.3–0.6 m   |
| Pro 2.25 → Anti 2.75 | 7                          | 60–120 bpm  | 0.3–0.6 m   |
| Pro 2.5 → Anti 2.25  | 7                          | 60–120 bpm  | 0.3–0.6 m   |
| Pro 2.75 → Anti 2.75 | 7                          | 60–90 bpm   | 0.3–0.75 m  |
| Pro 3 → Anti 2.75    | 7                          | 60–90 bpm   | 0.3–0.75 m  |
| Anti 2.5 → Pro 3     | 6                          | 60–90 bpm   | 0.3–0.75 m  |
| Pro 2.75 → Anti 2.5  | 6                          | 60–90 bpm   | 0.3–0.75 m  |
| Pro 3 → Anti 2.5     | 6                          | 60–90 bpm   | 0.3–0.75 m  |
| Anti 1.75 → Pro 1.75 | 5                          | 90–150 bpm  | 0.3–0.45 m  |
| Anti 2 → Pro 2       | 5                          | 90–120 bpm  | 0.3–0.6 m   |
| Anti 2 → Pro 2.5     | 5                          | 90–120 bpm  | 0.3–0.6 m   |
| Anti 2.5 → Pro 2.75  | 5                          | 60–90 bpm   | 0.3–0.6 m   |
| Pro 1.75 → Anti 1.75 | 5                          | 90–150 bpm  | 0.3–0.45 m  |
| Pro 2.25 → Anti 2    | 5                          | 90–120 bpm  | 0.3–0.6 m   |
| Pro 2.5 → Anti 2     | 5                          | 90–120 bpm  | 0.3–0.6 m   |
| Anti 1 → Pro 0       | 4                          | 180–240 bpm | 0.45–0.6 m  |
| Anti 2 → Pro 1.75    | 4                          | 90–150 bpm  | 0.3–0.45 m  |
| Anti 2 → Pro 2.25    | 4                          | 90–120 bpm  | 0.3–0.45 m  |
| Anti 2.25 → Pro 1.75 | 4                          | 90–150 bpm  | 0.3–0.45 m  |
| Anti 2.25 → Pro 2    | 4                          | 90–120 bpm  | 0.3–0.45 m  |
| Anti 2.25 → Pro 2.75 | 4                          | 60–90 bpm   | 0.3–0.6 m   |
| Anti 2.25 → Pro 3    | 4                          | 60–90 bpm   | 0.3–0.6 m   |
| Anti 2.5 → Pro 1.75  | 4                          | 90–150 bpm  | 0.3–0.45 m  |
| Anti 2.5 → Pro 2     | 4                          | 90–120 bpm  | 0.3–0.45 m  |
| Anti 2.75 → Pro 1.75 | 4                          | 90–150 bpm  | 0.3–0.45 m  |
| Anti 2.75 → Pro 2    | 4                          | 90–120 bpm  | 0.3–0.45 m  |
| Pro 0 → Anti 1       | 4                          | 180–240 bpm | 0.45–0.6 m  |
| Pro 1.75 → Anti 2    | 4                          | 90–150 bpm  | 0.3–0.45 m  |
| Pro 1.75 → Anti 2.25 | 4                          | 90–150 bpm  | 0.3–0.45 m  |
| Pro 1.75 → Anti 2.5  | 4                          | 90–150 bpm  | 0.3–0.45 m  |
| Pro 1.75 → Anti 2.75 | 4                          | 90–150 bpm  | 0.3–0.45 m  |
| Pro 2 → Anti 2       | 4                          | 90–120 bpm  | 0.3–0.45 m  |
| Pro 2 → Anti 2.25    | 4                          | 90–120 bpm  | 0.3–0.45 m  |
| Pro 2 → Anti 2.5     | 4                          | 90–120 bpm  | 0.3–0.45 m  |
| Pro 2 → Anti 2.75    | 4                          | 90–120 bpm  | 0.3–0.45 m  |
| Pro 2.75 → Anti 2.25 | 4                          | 60–90 bpm   | 0.3–0.6 m   |
| Pro 3 → Anti 2.25    | 4                          | 60–90 bpm   | 0.3–0.6 m   |
| Anti 1.5 → Pro 1.5   | 3                          | 120–180 bpm | 0.3 m       |
| Anti 1.75 → Pro 1.5  | 3                          | 120–180 bpm | 0.3 m       |
| Anti 1.75 → Pro 2    | 3                          | 90–120 bpm  | 0.3–0.45 m  |
| Anti 1.75 → Pro 2.5  | 3                          | 90–120 bpm  | 0.3–0.45 m  |
| Anti 2 → Pro 0       | 3                          | 180–240 bpm | 0.9 m       |
| Pro 1.5 → Anti 1.5   | 3                          | 120–180 bpm | 0.3 m       |
| Pro 1.5 → Anti 1.75  | 3                          | 120–180 bpm | 0.3 m       |
| Anti 1.5 → Pro 1.75  | 2                          | 120–150 bpm | 0.3 m       |
| Anti 1.75 → Pro 2.25 | 2                          | 90–120 bpm  | 0.3 m       |
| Anti 2 → Pro 1.5     | 2                          | 150–180 bpm | 0.3 m       |
| Anti 2 → Pro 2.75    | 2                          | 90 bpm      | 0.3–0.45 m  |
| Anti 2 → Pro 3       | 2                          | 90 bpm      | 0.3–0.45 m  |
| Anti 3 → Pro 1.75    | 2                          | 90–120 bpm  | 0.3 m       |
| Pro 1.5 → Anti 2     | 2                          | 150–180 bpm | 0.3 m       |
| Pro 1.5 → Anti 2.25  | 2                          | 150–180 bpm | 0.3 m       |
| Pro 1.75 → Anti 1.5  | 2                          | 120–150 bpm | 0.3 m       |
| Pro 1.75 → Anti 3    | 2                          | 90–120 bpm  | 0.3 m       |
| Pro 2 → Anti 1.75    | 2                          | 90–120 bpm  | 0.3 m       |
| Pro 2.25 → Anti 1.75 | 2                          | 90–120 bpm  | 0.3 m       |
| Pro 2.5 → Anti 1.75  | 2                          | 90–120 bpm  | 0.3 m       |
| Pro 2.75 → Anti 2    | 2                          | 90 bpm      | 0.3–0.45 m  |
| Pro 3 → Anti 2       | 2                          | 90 bpm      | 0.3–0.45 m  |
| Anti 1.25 → Pro 1.25 | 1                          | 180 bpm     | 0.3 m       |
| Anti 1.5 → Pro 2     | 1                          | 120 bpm     | 0.3 m       |
| Anti 1.75 → Pro 2.75 | 1                          | 90 bpm      | 0.3 m       |
| Anti 1.75 → Pro 3    | 1                          | 90 bpm      | 0.3 m       |
| Anti 2.5 → Pro 1.5   | 1                          | 180 bpm     | 0.3 m       |
| Pro 1.25 → Anti 1.25 | 1                          | 180 bpm     | 0.3 m       |
| Pro 1.5 → Anti 2.5   | 1                          | 180 bpm     | 0.3 m       |
| Pro 2 → Anti 1.5     | 1                          | 120 bpm     | 0.3 m       |
| Pro 2.75 → Anti 1.75 | 1                          | 90 bpm      | 0.3 m       |
| Pro 3 → Anti 1.75    | 1                          | 90 bpm      | 0.3 m       |

## Right hand (circling), 153 spins

| Spin                  | Settings that work (of 35) | Tempo       | Hand circle |
| --------------------- | -------------------------- | ----------- | ----------- |
| Anti 2                | 35                         | 60–240 bpm  | 0.3–0.9 m   |
| Anti 2 → Anti 1.75    | 34                         | 60–240 bpm  | 0.3–0.9 m   |
| Anti 1.75             | 33                         | 60–240 bpm  | 0.3–0.9 m   |
| Anti 1.75 → Anti 2    | 33                         | 60–240 bpm  | 0.3–0.9 m   |
| Anti 1.25             | 30                         | 90–240 bpm  | 0.3–0.9 m   |
| Anti 1.25 → Anti 1.5  | 30                         | 90–240 bpm  | 0.3–0.9 m   |
| Anti 1.25 → Anti 1.75 | 30                         | 90–240 bpm  | 0.3–0.9 m   |
| Anti 1.25 → Anti 2    | 30                         | 90–240 bpm  | 0.3–0.9 m   |
| Anti 1.5              | 30                         | 90–240 bpm  | 0.3–0.9 m   |
| Anti 1.5 → Anti 1.25  | 30                         | 90–240 bpm  | 0.3–0.9 m   |
| Anti 1.5 → Anti 1.75  | 30                         | 90–240 bpm  | 0.3–0.9 m   |
| Anti 1.5 → Anti 2     | 30                         | 90–240 bpm  | 0.3–0.9 m   |
| Anti 1.75 → Anti 1.25 | 30                         | 90–240 bpm  | 0.3–0.9 m   |
| Anti 1.75 → Anti 1.5  | 30                         | 90–240 bpm  | 0.3–0.9 m   |
| Anti 2 → Anti 1.5     | 30                         | 90–240 bpm  | 0.3–0.9 m   |
| Anti 1                | 27                         | 90–240 bpm  | 0.3–0.9 m   |
| Anti 1.75 → Anti 1    | 27                         | 90–240 bpm  | 0.3–0.9 m   |
| Pro 1                 | 27                         | 90–240 bpm  | 0.3–0.9 m   |
| Anti 1 → Anti 1.5     | 25                         | 90–240 bpm  | 0.3–0.9 m   |
| Anti 2 → Anti 1.25    | 25                         | 120–240 bpm | 0.3–0.9 m   |
| Anti 2 → Anti 2.25    | 25                         | 60–180 bpm  | 0.3–0.9 m   |
| Anti 2 → Anti 2.5     | 25                         | 60–180 bpm  | 0.3–0.9 m   |
| Anti 2.25             | 25                         | 60–180 bpm  | 0.3–0.9 m   |
| Anti 2.25 → Anti 2    | 25                         | 60–180 bpm  | 0.3–0.9 m   |
| Anti 2.25 → Anti 2.5  | 25                         | 60–180 bpm  | 0.3–0.9 m   |
| Anti 2.5              | 25                         | 60–180 bpm  | 0.3–0.9 m   |
| Anti 2.5 → Anti 2     | 25                         | 60–180 bpm  | 0.3–0.9 m   |
| Anti 2.5 → Anti 2.25  | 25                         | 60–180 bpm  | 0.3–0.9 m   |
| Anti 1 → Anti 1.25    | 24                         | 120–240 bpm | 0.3–0.9 m   |
| Anti 1.25 → Anti 1    | 24                         | 120–240 bpm | 0.3–0.9 m   |
| Anti 2.25 → Anti 1.75 | 24                         | 60–180 bpm  | 0.3–0.9 m   |
| Anti 1.75 → Anti 2.25 | 23                         | 60–180 bpm  | 0.3–0.9 m   |
| Anti 1.75 → Anti 2.5  | 23                         | 60–180 bpm  | 0.3–0.9 m   |
| Anti 2.5 → Anti 1.75  | 23                         | 60–180 bpm  | 0.3–0.9 m   |
| Pro 0.75              | 23                         | 120–240 bpm | 0.3–0.9 m   |
| Anti 0.75             | 22                         | 120–240 bpm | 0.3–0.9 m   |
| Anti 1.5 → Anti 1     | 22                         | 120–240 bpm | 0.3–0.9 m   |
| Anti 1.5 → Anti 2.25  | 20                         | 90–180 bpm  | 0.3–0.9 m   |
| Anti 1.5 → Anti 2.5   | 20                         | 90–180 bpm  | 0.3–0.9 m   |
| Anti 2 → Anti 2.75    | 20                         | 60–150 bpm  | 0.3–0.9 m   |
| Anti 2.25 → Anti 1.5  | 20                         | 90–180 bpm  | 0.3–0.9 m   |
| Anti 2.25 → Anti 2.75 | 20                         | 60–150 bpm  | 0.3–0.9 m   |
| Anti 2.5 → Anti 1.5   | 20                         | 90–180 bpm  | 0.3–0.9 m   |
| Anti 2.5 → Anti 2.75  | 20                         | 60–150 bpm  | 0.3–0.9 m   |
| Anti 2.75             | 20                         | 60–150 bpm  | 0.3–0.9 m   |
| Anti 2.75 → Anti 2    | 20                         | 60–150 bpm  | 0.3–0.9 m   |
| Anti 2.75 → Anti 2.25 | 20                         | 60–150 bpm  | 0.3–0.9 m   |
| Anti 2.75 → Anti 2.5  | 20                         | 60–150 bpm  | 0.3–0.9 m   |
| Pro 1.25              | 20                         | 90–180 bpm  | 0.3–0.9 m   |
| Pro 1.25 → Pro 1.5    | 20                         | 90–180 bpm  | 0.3–0.9 m   |
| Pro 1.5               | 20                         | 90–180 bpm  | 0.3–0.9 m   |
| Pro 1.5 → Pro 1.25    | 20                         | 90–180 bpm  | 0.3–0.9 m   |
| Anti 2 → Anti 1       | 19                         | 150–240 bpm | 0.3–0.9 m   |
| Anti 2.75 → Anti 1.75 | 19                         | 60–150 bpm  | 0.3–0.9 m   |
| Anti 1.25 → Anti 2.25 | 18                         | 90–180 bpm  | 0.3–0.9 m   |
| Anti 1.75 → Anti 2.75 | 18                         | 60–150 bpm  | 0.3–0.9 m   |
| Anti 2.25 → Anti 1.25 | 18                         | 90–180 bpm  | 0.3–0.9 m   |
| Pro 1.75              | 18                         | 60–150 bpm  | 0.3–0.9 m   |
| Pro 0.5               | 16                         | 150–240 bpm | 0.3–0.9 m   |
| Anti 1.5 → Anti 2.75  | 15                         | 90–150 bpm  | 0.3–0.9 m   |
| Anti 2 → Anti 3       | 15                         | 60–120 bpm  | 0.3–0.9 m   |
| Anti 2.25 → Anti 3    | 15                         | 60–120 bpm  | 0.3–0.9 m   |
| Anti 2.5 → Anti 3     | 15                         | 60–120 bpm  | 0.3–0.9 m   |
| Anti 2.75 → Anti 1.5  | 15                         | 90–150 bpm  | 0.3–0.9 m   |
| Anti 2.75 → Anti 3    | 15                         | 60–120 bpm  | 0.3–0.9 m   |
| Anti 3                | 15                         | 60–120 bpm  | 0.3–0.9 m   |
| Anti 3 → Anti 2       | 15                         | 60–120 bpm  | 0.3–0.9 m   |
| Anti 3 → Anti 2.25    | 15                         | 60–120 bpm  | 0.3–0.9 m   |
| Anti 3 → Anti 2.5     | 15                         | 60–120 bpm  | 0.3–0.9 m   |
| Anti 3 → Anti 2.75    | 15                         | 60–120 bpm  | 0.3–0.9 m   |
| Pro 1.25 → Pro 1.75   | 15                         | 90–150 bpm  | 0.3–0.9 m   |
| Pro 1.5 → Pro 1.75    | 15                         | 90–150 bpm  | 0.3–0.9 m   |
| Pro 1.75 → Pro 1.25   | 15                         | 90–150 bpm  | 0.3–0.9 m   |
| Pro 1.75 → Pro 1.5    | 15                         | 90–150 bpm  | 0.3–0.9 m   |
| Pro 2                 | 15                         | 60–120 bpm  | 0.3–0.9 m   |
| Pro 2 → Pro 2.25      | 15                         | 60–120 bpm  | 0.3–0.9 m   |
| Pro 2 → Pro 2.5       | 15                         | 60–120 bpm  | 0.3–0.9 m   |
| Pro 2.25              | 15                         | 60–120 bpm  | 0.3–0.9 m   |
| Pro 2.25 → Pro 2      | 15                         | 60–120 bpm  | 0.3–0.9 m   |
| Pro 2.25 → Pro 2.5    | 15                         | 60–120 bpm  | 0.3–0.9 m   |
| Pro 2.5               | 15                         | 60–120 bpm  | 0.3–0.9 m   |
| Pro 2.5 → Pro 2       | 15                         | 60–120 bpm  | 0.3–0.9 m   |
| Pro 2.5 → Pro 2.25    | 15                         | 60–120 bpm  | 0.3–0.9 m   |
| Anti 3 → Anti 1.75    | 14                         | 60–120 bpm  | 0.3–0.9 m   |
| Pro 0                 | 14                         | 180–240 bpm | 0.3–0.9 m   |
| Pro 1 → Pro 1.25      | 14                         | 120–180 bpm | 0.3–0.9 m   |
| Pro 1.25 → Pro 1      | 14                         | 120–180 bpm | 0.3–0.9 m   |
| Pro 1.75 → Pro 2.5    | 14                         | 60–120 bpm  | 0.3–0.9 m   |
| Pro 2 → Pro 1.75      | 14                         | 60–120 bpm  | 0.3–0.9 m   |
| Pro 2.25 → Pro 1.75   | 14                         | 60–120 bpm  | 0.3–0.9 m   |
| Anti 1.25 → Anti 2.5  | 13                         | 120–180 bpm | 0.3–0.9 m   |
| Anti 1.75 → Anti 3    | 13                         | 60–120 bpm  | 0.3–0.9 m   |
| Anti 2.5 → Anti 1.25  | 13                         | 120–180 bpm | 0.3–0.9 m   |
| Pro 1 → Pro 1.5       | 13                         | 120–180 bpm | 0.3–0.9 m   |
| Pro 1.75 → Pro 2      | 13                         | 60–120 bpm  | 0.3–0.9 m   |
| Pro 1.75 → Pro 2.25   | 13                         | 60–120 bpm  | 0.3–0.9 m   |
| Pro 2.5 → Pro 1.75    | 13                         | 60–120 bpm  | 0.3–0.9 m   |
| Anti 0.5              | 12                         | 150–240 bpm | 0.3–0.75 m  |
| Pro 1.5 → Pro 1       | 12                         | 120–180 bpm | 0.3–0.9 m   |
| Pro 1.75 → Pro 1      | 12                         | 90–150 bpm  | 0.3–0.9 m   |
| Anti 1.25 → Anti 2.75 | 10                         | 120–150 bpm | 0.3–0.9 m   |
| Anti 1.5 → Anti 3     | 10                         | 90–120 bpm  | 0.3–0.9 m   |
| Anti 2.75 → Anti 1.25 | 10                         | 120–150 bpm | 0.3–0.9 m   |
| Anti 3 → Anti 1.5     | 10                         | 90–120 bpm  | 0.3–0.9 m   |
| Pro 1.25 → Pro 2      | 10                         | 90–120 bpm  | 0.3–0.9 m   |
| Pro 1.5 → Pro 2       | 10                         | 90–120 bpm  | 0.3–0.9 m   |
| Pro 1.5 → Pro 2.25    | 10                         | 90–120 bpm  | 0.3–0.9 m   |
| Pro 1.5 → Pro 2.5     | 10                         | 90–120 bpm  | 0.3–0.9 m   |
| Pro 2 → Pro 1.5       | 10                         | 90–120 bpm  | 0.3–0.9 m   |
| Pro 2 → Pro 2.75      | 10                         | 60–90 bpm   | 0.3–0.9 m   |
| Pro 2 → Pro 3         | 10                         | 60–90 bpm   | 0.3–0.9 m   |
| Pro 2.25 → Pro 1.5    | 10                         | 90–120 bpm  | 0.3–0.9 m   |
| Pro 2.25 → Pro 2.75   | 10                         | 60–90 bpm   | 0.3–0.9 m   |
| Pro 2.25 → Pro 3      | 10                         | 60–90 bpm   | 0.3–0.9 m   |
| Pro 2.5 → Pro 1.5     | 10                         | 90–120 bpm  | 0.3–0.9 m   |
| Pro 2.5 → Pro 2.75    | 10                         | 60–90 bpm   | 0.3–0.9 m   |
| Pro 2.5 → Pro 3       | 10                         | 60–90 bpm   | 0.3–0.9 m   |
| Pro 2.75              | 10                         | 60–90 bpm   | 0.3–0.9 m   |
| Pro 2.75 → Pro 2      | 10                         | 60–90 bpm   | 0.3–0.9 m   |
| Pro 2.75 → Pro 2.25   | 10                         | 60–90 bpm   | 0.3–0.9 m   |
| Pro 2.75 → Pro 2.5    | 10                         | 60–90 bpm   | 0.3–0.9 m   |
| Pro 2.75 → Pro 3      | 10                         | 60–90 bpm   | 0.3–0.9 m   |
| Pro 3                 | 10                         | 60–90 bpm   | 0.3–0.9 m   |
| Pro 3 → Pro 2         | 10                         | 60–90 bpm   | 0.3–0.9 m   |
| Pro 3 → Pro 2.25      | 10                         | 60–90 bpm   | 0.3–0.9 m   |
| Pro 3 → Pro 2.5       | 10                         | 60–90 bpm   | 0.3–0.9 m   |
| Pro 3 → Pro 2.75      | 10                         | 60–90 bpm   | 0.3–0.9 m   |
| Anti 0.75 → Anti 1    | 9                          | 150–240 bpm | 0.3–0.6 m   |
| Anti 1 → Anti 0.75    | 9                          | 150–240 bpm | 0.3–0.6 m   |
| Pro 0.75 → Pro 1      | 9                          | 150–240 bpm | 0.3–0.6 m   |
| Pro 1 → Pro 0.75      | 9                          | 150–240 bpm | 0.3–0.6 m   |
| Pro 1.75 → Pro 3      | 9                          | 60–90 bpm   | 0.3–0.9 m   |
| Pro 2.75 → Pro 1.75   | 9                          | 60–90 bpm   | 0.3–0.9 m   |
| Pro 3 → Pro 1.75      | 9                          | 60–90 bpm   | 0.3–0.9 m   |
| Pro 1.75 → Pro 2.75   | 8                          | 60–90 bpm   | 0.3–0.9 m   |
| Anti 1 → Anti 1.75    | 5                          | 180–240 bpm | 0.3–0.45 m  |
| Anti 1.25 → Anti 3    | 5                          | 120 bpm     | 0.3–0.9 m   |
| Pro 1.25 → Pro 2.25   | 5                          | 120 bpm     | 0.3–0.9 m   |
| Pro 1.5 → Pro 2.75    | 5                          | 90 bpm      | 0.3–0.9 m   |
| Pro 1.5 → Pro 3       | 5                          | 90 bpm      | 0.3–0.9 m   |
| Pro 2 → Pro 1.25      | 5                          | 120 bpm     | 0.3–0.9 m   |
| Pro 2.25 → Pro 1.25   | 5                          | 120 bpm     | 0.3–0.9 m   |
| Pro 2.75 → Pro 1.5    | 5                          | 90 bpm      | 0.3–0.9 m   |
| Pro 3 → Pro 1.5       | 5                          | 90 bpm      | 0.3–0.9 m   |
| Anti 2.75 → Anti 1    | 3                          | 90–120 bpm  | 0.3–0.45 m  |
| Anti 3 → Anti 1.25    | 3                          | 120 bpm     | 0.3–0.6 m   |
| Pro 1.25 → Pro 2.5    | 3                          | 120 bpm     | 0.3–0.6 m   |
| Pro 2.5 → Pro 1.25    | 3                          | 120 bpm     | 0.3–0.6 m   |
| Pro 0.25              | 2                          | 210–240 bpm | 0.3 m       |
| Pro 2.75 → Pro 1      | 2                          | 90 bpm      | 0.3–0.45 m  |
| Anti 0.25             | 1                          | 240 bpm     | 0.3 m       |
| Anti 0.75 → Anti 1.25 | 1                          | 240 bpm     | 0.3 m       |
| Anti 1 → Anti 2       | 1                          | 240 bpm     | 0.3 m       |

## Rerunning

`sweep.ts` here is the script. Copy it into
`src/lib/features/lab/tabs/poi-string/` as `_sweep.test.ts` and run it with
Vitest, one path per process for speed:

```bash
SWEEP_OUT=out-p1.json PATHS=1 npx vitest run src/lib/features/lab/tabs/poi-string/_sweep.test.ts
```

Settings come from the `BPMS`, `RADII`, `LENGTHS` and `TURNAROUNDS` variables.
The analysis (worst case over paths, the spin limit) is in `analyze.py`.
