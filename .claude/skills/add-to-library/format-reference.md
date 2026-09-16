# Format Reference — import-sequence.cjs

## JSON Schema

```json
{
  "word": "STRING — sequence name",
  "gridMode": "diamond | box | skewed",
  "startPlacement": "STRING — grid placement like 'alpha7' or 'beta1'",
  "steps": [
    {
      "beat": "INTEGER — 1-indexed beat number",
      "letter": "STRING — TKA letter (J, D, Θ-, W, Sigma, etc.)",
      "startPlacement": "STRING — grid placement at beat start",
      "endPlacement": "STRING — grid placement at beat end",
      "motions": {
        "blue": {
          "color": "blue",
          "motionType": "pro | anti | dash | static | float",
          "rotationDirection": "cw | ccw | noRotation",
          "startLocation": "n | e | s | w | ne | se | sw | nw | c",
          "endLocation": "n | e | s | w | ne | se | sw | nw | c",
          "turns": "NUMBER — 0, 0.5, 1, 1.5, 2, etc.",
          "startOrientation": "ORIENTATION",
          "endOrientation": "ORIENTATION"
        },
        "red": {
          "color": "red",
          "motionType": "pro | anti | dash | static | float",
          "rotationDirection": "cw | ccw | noRotation",
          "startLocation": "n | e | s | w | ne | se | sw | nw | c",
          "endLocation": "n | e | s | w | ne | se | sw | nw | c",
          "turns": "NUMBER",
          "startOrientation": "ORIENTATION",
          "endOrientation": "ORIENTATION"
        }
      }
    }
  ]
}
```

## Enum Values

### motionType
| Value | Meaning |
|-------|---------|
| `pro` | Prop spins same direction as hand path |
| `anti` | Prop spins opposite to hand path |
| `dash` | Hand moves, prop doesn't spin |
| `static` | Hand stays, prop doesn't spin |
| `float` | Hand stays, prop spins |

### rotationDirection
| Value | Meaning |
|-------|---------|
| `cw` | Clockwise |
| `ccw` | Counter-clockwise |
| `noRotation` | No rotation (used with static, dash-without-turns) |

### orientation
| Value | Level | Meaning |
|-------|-------|---------|
| `in` | L1/L2 | Radial inward |
| `out` | L1/L2 | Radial outward |
| `clock` | L3 | Clockwise tangent |
| `counter` | L3 | Counter-clockwise tangent |
| `clockIn` | L4 | 45° between clock and in |
| `clockOut` | L4 | 45° between clock and out |
| `counterIn` | L4 | 45° between counter and in |
| `counterOut` | L4 | 45° between counter and out |

### location (grid points)
Cardinal: `n`, `e`, `s`, `w`
Intercardinal: `ne`, `se`, `sw`, `nw`
Center: `c`

### gridMode
`diamond` (default), `box`, `skewed`

### loopType
`rotated`, `mirrored`, `swapped`, `inverted`
Compounds: `mirrored_swapped`, `mirrored_inverted`, etc.

### visibility
`private` (default), `unlisted`. Public publishing must go through the app's canonical owner/projection/hash-claim transaction.

## Optional Beat Notation Fields

Some beats include optional annotations in brackets:

| Notation | JSON field | When present |
|----------|-----------|-------------|
| `[prefloat:type,rot]` | `motions.<color>.prefloatMotionType`, `motions.<color>.prefloatRotationDirection` | Float letters that transition from another motion type |
| `[hand:path]` | `motions.<color>.handPath` | Explicit hand path annotation |
| `[skew:steps,dir]` | `motions.<color>.skewSteps`, `motions.<color>.skewDirection` | Skewed grid motions |
| `rev` (e.g. `B` or `R` after beat line) | Reversal metadata — note which hand(s) reverse | Reversal beats |

If these appear, include them in the motion object. If absent, omit (don't set to null).

## Beat Notation → JSON Mapping

### Input notation (one beat):

```
3 Θ- alpha3>gamma5
  blue: dash norotation w>e t=0 out>in
  red:  pro cw e>s t=0 in>in
```

### Parsed to:

```json
{
  "beat": 3,
  "letter": "Θ-",
  "startPlacement": "alpha3",
  "endPlacement": "gamma5",
  "motions": {
    "blue": {
      "color": "blue",
      "motionType": "dash",
      "rotationDirection": "noRotation",
      "startLocation": "w",
      "endLocation": "e",
      "turns": 0,
      "startOrientation": "out",
      "endOrientation": "in"
    },
    "red": {
      "color": "red",
      "motionType": "pro",
      "rotationDirection": "cw",
      "startLocation": "e",
      "endLocation": "s",
      "turns": 0,
      "startOrientation": "in",
      "endOrientation": "in"
    }
  }
}
```

### Mapping rules

| Notation field | JSON field | Transform |
|---------------|-----------|-----------|
| `norotation` | `"noRotation"` | camelCase |
| `no` (short form) | `"noRotation"` | expand |
| orientation `cw` | `"clock"` | orientation namespace, not rotation |
| orientation `ccw` | `"counter"` | orientation namespace, not rotation |
| orientation `in` | `"in"` | direct |
| orientation `out` | `"out"` | direct |
| `t=1` | `"turns": 1` | extract number |
| `w>e` (location) | `"startLocation": "w", "endLocation": "e"` | split on `>` |
| `out>in` (orientation) | `"startOrientation": "out", "endOrientation": "in"` | split on `>` |
| `alpha3>gamma5` (placement) | `"startPlacement": "alpha3", "endPlacement": "gamma5"` | split on `>` |

## Full Annotated Example

See the JDΘ-W import from 2026-05-04:
- 16 beats, diamond grid, mirrored_swapped loop, starts at alpha7
- Import command: `node scripts/import-sequence.cjs <file> --circular --loop-type mirrored_swapped`
- Firestore path: `users/PBp3GSBO6igCKPwJyLZNmVEmamI3/sequences/seq_1777927466611_546e9c70`

## Import Script Flags

```bash
node scripts/import-sequence.cjs <file.json> \
  [--stdin]                        # Read JSON from stdin instead of file
  [--circular]                     # Force isCircular=true
  [--loop-type <type>]             # Force LOOP type
  [--notes "tagline"]              # Attach notes/tagline
  [--visibility private|unlisted] # Default: private; public is app-only
  [--dry-run]                      # Preview without writing to Firestore
```
