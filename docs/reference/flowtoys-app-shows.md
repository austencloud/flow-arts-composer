# Flowtoys Connect App: Shows, Modes and Limits

How the official Flowtoys Connect app (`com.flowtoys.app` 1.5.1, Flutter)
builds shows, stores modes and turns them into bridge packets. Read from the
app's compiled Dart code with blutter on 2026-10-18; no prop or bridge was
touched. The packet itself is in [flowtoys-protocol.md](flowtoys-protocol.md).

Statements marked _inferred_ come from code shape rather than a traced value.
Everything else was read directly from a constant or a string in the code.

## Modes

A mode is one of the prop's built-in patterns (page and number, 80 in all; see
`FLOWTOYS_MODES`) plus seven parameters:

| Parameter    | Range | Notes                                                        |
| ------------ | ----- | ------------------------------------------------------------ |
| `hue`        | 0..1  | wraps: the app sends `value mod 1`                           |
| `saturation` | 0..1  | multiplied by the app's global saturation slider before use  |
| `brightness` | 0..1  | multiplied by the app's global brightness slider before use  |
| `speed`      | 0..1  |                                                              |
| `density`    | 0..1  |                                                              |
| `adjust1`    | 0..1  | may be unset; the mode's own `adjust_links` say what it does |
| `adjust2`    | 0..1  | may be unset                                                 |

The default for every parameter is 0.5. A preset may leave `adjust1` or
`adjust2` without a value; the prop then uses its own.

`adjust_links` (per base mode) name what each adjust changes: 57 of the 80
base modes link adjust 1 to `hue`, two link 1 to `density` and 2 to
`mapping`, one links 1 to `hue` and 2 to `mapping`, and 20 have none.

Mode flags stored with each preset: `is_advanced`, `is_adjusting` (the prop
runs its own adjust cycle, sent as the start-adjust flag), `adjust_randomized`,
`bypass_adjust`, and three motion reactions, `bump_reactive`, `spin_reactive`
and `stall_reactive`.

### Parameter animation

Each parameter can animate on its own, independent of the timeline:

- `animationSpeed` sets the cycle: one cycle lasts `0.2 s / |animationSpeed|`;
  0 means still.
- Hue cycles around the wheel; _inferred:_ the other parameters bounce between
  their ends.
- The app computes the animated value itself and resends the mode, so the prop
  only ever sees plain values.

### Audio links

A parameter can follow the song's loudness. Each link stores `initialValue`
(default 0), `intensity` (default 1), `minThreshold` (default 0) and
`decayRate`. The app measures loudness in short windows, normalises it against
recent peaks, and moves the value toward `initialValue + level × intensity`.
Smoothing uses the divisor `1 + (1 − decayRate) × 20`, so a higher decay rate
follows the music faster. _Inferred:_ the normalisation uses the louder part
of roughly the last 55 windows.

## Presets shipped with the app

`assets/data/` holds the preset lists the app shows before sign-in:

| File                   | Lists | Modes | Content                                  |
| ---------------------- | ----- | ----- | ---------------------------------------- |
| `base_modes.json`      | n/a   | 80    | the built-in patterns and their defaults |
| `lists/system.json`    | 4     | 80    | "page 1", "page 2", "page 3", "page 13"  |
| `lists/official.json`  | 8     | 111   | Flowtoys' curated lists                  |
| `lists/community.json` | 8     | 297   | user-made lists                          |

No shipped preset uses an audio link, a duration or adjust cycles. 118 are
marked advanced and 15 adjusting.

## From mode to packet

`Bridge.sendCommand` fills the packet in this order: `adjust1`, `adjust2`,
`lfo3`, `lfo4`, `hue`, `saturation`, `brightness`, `speed`, `density`. So the
four LFO bytes carry adjust 1, adjust 2 and two values no preset sets.

- Each value becomes a byte as `ceil(value × 255)`; a missing value is sent as
  0 with its override bit clear.
- Command flags by name: `start_adjust` 0x01, `wakeup` 0x02, `sleep` 0x04,
  `save` 0x10; `stop_adjust` and `commit_save` send 0. Never send save.
- Default sending: 3 repeats 200 ms apart. _Inferred:_ a wake-up uses a
  different repeat count (not traced).

## Shows

A show is a set of tracks laid against a song.

- **Element types.** A timeline element holds a mode, another show (a
  subshow), or a song. Each has `start_offset`, `duration`, `content_offset`
  (where inside the song or subshow it starts), `timeline_index` and
  `timeline_type`.
- **Tracks.** Mode tracks run end to end: every element starts where the last
  one ended, and empty space is an empty element. The app keeps start offsets
  in step and pads every track with empty space up to the show's length.
- **Three track levels.** One global track, one per group, or one per prop.
  The editor splits a global track into groups or props and merges them back
  (`splitGlobalTrackIntoProps`, `splitGroupsIntoProps`, `combineTrackToGroups`,
  `combineTracksToGlobal`). Supergroups pick which connected groups follow a
  track.
- **Songs.** A show has a list of songs played one after another, shown as
  waveforms. The show's length is the longer of the songs and the mode tracks.
- **Editing.** Insert at the playhead, split at the playhead, stretch the
  selection from either side, replace selected modes, select all, undo and
  redo, and edges that snap to the edges on other tracks. _Inferred:_ stretched
  lengths round to whole milliseconds.
- **Generate.** A show can be filled from a mode list. A cycle-count slider
  (_inferred:_ steps of 1/20, at least one mode) sets how many times the list repeats, and
  each mode gets an equal share of the show.
- **Saving.** Shows save to the user's account at `api.flowtoys.com` with a
  local history.

### Limits

| Limit               | Value                                              |
| ------------------- | -------------------------------------------------- |
| New empty show      | 60 s                                               |
| First inserted mode | 60 s when the show is empty                        |
| Longest show        | 3 hours (10,800 s)                                 |
| Editor zoom range   | at least 600 s, or 2 × the show, whichever is more |
| Playhead sync       | every 100 ms                                       |
| Autoplay cycle      | 4 to 25 s per mode, 8 s by default                 |

### Playback

The app, not the props, plays the show. As the playhead enters an element it
sets that track's groups to the element's mode, which sends a packet. A 200 ms
timer then prepares the next groups (_inferred_ from `_setCurrentAndNextGroups`). Animated and audio-linked parameters resend the
mode as their values move. A prop therefore needs the phone and bridge in range
for the whole show.

## Autoplay and remote control

- Autoplay steps through a mode list, in order or shuffled, holding each mode
  for the cycle time.
- The app listens for OSC: `/modes/next`, `/modes/previous`,
  `/modes/togglePlay`, `/modes/cycleDuration`, `/global/brightness`,
  `/global/saturation`, `/pattern`, `/show/pause`, `/show/restart` and
  `/show/togglePlay`.
- Prop settings in the app: auto sleep, dimming (10 s, 3 min, 5 min, never),
  internal brightness, block button presses, and "prop button press = next
  mode in app".
