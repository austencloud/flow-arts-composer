---
status: active
value: 4
effort: M
remaining: "Verify in browser — audio playback, jukebox UI, track switching, volume/mute."
depends_on: ""
plan_path: "docs/superpowers/plans/shipped/2026-05-24-ocean-audio-system.md"
tags: ["3d", "ocean", "audio", "ui"]
last_triaged: 2026-05-24
---
# Ocean Audio System — Design Spec

## Goal

Add ambient audio to the ocean 3D scene with per-variant sound design, a scene-wide mute/volume system, and a compact mini jukebox UI in the top-left corner of the 3D viewer. Start with enriched procedural synthesis (Web Audio API); pre-recorded CC0 ambient loops can be layered in later via a track manifest system.

## Architecture

```
SceneAudioState (shared, localStorage-persisted)
├── masterVolume: number (0-1)
├── muted: boolean
└── trackPreferences: Record<OceanVariant, string>

OceanAudioEngine (Svelte component, replaces OceanAmbientAudio.svelte)
├── Procedural layer (Web Audio API)
│   5 node layers: drone, sub-bass, filtered noise, detail events, LFO
│   Per-track parameter presets (2 tracks per variant = 8 total)
│   Crossfades between presets on variant/track switch
└── Track layer (future: pre-recorded loops)
    Loads from /static/sounds/ocean/<variant>/
    Layered on top of procedural bed

SceneAudioPlayer (top-left overlay UI)
├── Collapsed: 32px music note icon with pulse
└── Expanded: ~180x130px frosted card
    Track name, play/pause, prev/next, volume slider, mute, track list
```

## Scene Audio State

File: `src/lib/shared/3d/state/scene-audio-state.svelte.ts`

Scene-wide audio state, not ocean-specific. Future scenes (Ember, Cosmic) read the same master volume/mute.

```typescript
interface SceneAudioState {
  masterVolume: number;     // 0-1, default 0.7
  muted: boolean;           // default false
  trackPreferences: Record<string, string>; // variant → trackId
}
```

Persisted to localStorage under key `tka-scene-audio-v1`. Exported as a singleton with getters/setters that auto-save.

## Track Manifest

```typescript
interface AudioTrack {
  id: string;
  name: string;
  type: "procedural" | "file";
  src?: string;            // path for file-type tracks
  variant: OceanVariant;
}
```

Initial tracks (all procedural):

| Variant | Track ID | Name | Character |
|---------|----------|------|-----------|
| abyss | abyss-deep | The Deep | 55Hz drone, metallic pings at 8-20s intervals, sub-bass pressure, LP 150Hz |
| abyss | abyss-bio | Bioluminescence | Higher harmonics (82Hz), sparkle bursts, ethereal shimmer |
| reef | reef-sunlit | Sunlit Shallows | Bright wash (LP 2-3kHz), crackle bursts, wide filter |
| reef | reef-coral | Coral Garden | Warmer tone (LP 1kHz), lower energy, gentle bubble chirps |
| mystical | mystical-aurora | Aurora Depths | Pink noise bandpass sweep, singing-bowl harmonics, shimmer reverb |
| mystical | mystical-crystal | Crystal Cavern | Resonant harmonics (stacked 5ths), heavy reverb tail |
| cinematic | cinematic-blue | Blue Planet | Realistic rumble (65Hz), balanced LP 350Hz, subtle current movement |
| cinematic | cinematic-still | Still Waters | Minimal drone, spacious silence, rare detail events only |

Each track is a parameter preset for the procedural engine: drone freq/gain, noise filter freq/Q/gain, LFO rate/depth, sub freq/gain, detail event type/interval.

## Procedural Synthesis Layers

Upgrade from current 4-node graph (drone + sub + noise + LFO) to 5 layers:

### Layer 1: Drone
Sine oscillator. Frequency and detune per track. LFO modulates frequency for organic movement.

### Layer 2: Sub-bass
Second sine oscillator. Provides visceral low-end below the drone. Gain per track (0 for tracks that don't need it).

### Layer 3: Filtered Noise
4-second looped noise buffer through BiquadFilter (lowpass or bandpass per track). Filter frequency and Q configurable. Brown noise for deep variants, pink for mystical.

### Layer 4: LFO
Sine LFO modulating drone frequency. Rate and depth per track. Creates the slow breathing/pulsing quality.

### Layer 5: Detail Events (NEW)
Scheduled one-shot sounds at random intervals. Per-track event type:

- **Metallic ping** (abyss): High sine (2-4kHz), 5ms attack, 80ms release, long delay feedback for echo. Interval: 8-20s random.
- **Bubble cluster** (reef): 3-5 rapid sine chirps (150-400Hz random), 50ms each, pitch sweep up, clustered within 200ms window. Interval: 4-10s.
- **Shimmer tone** (mystical): Stacked sine harmonics (fundamental × 1, 1.5, 2, 3), 2s attack, 3s sustain, 2s release. Interval: 6-15s.
- **Water movement** (cinematic): Short filtered noise burst (BP 200-600Hz), 100ms attack, 500ms release. Interval: 5-12s.

All detail events go through a dedicated GainNode so they can be independently balanced against the bed.

## Crossfade Behavior

- Variant change: 2s equal-power crossfade (sin/cos curve). Tear down old graph, build new, ramp gains.
- Track change within variant: 1.5s crossfade. Same mechanism.
- Mute: 300ms fade to 0. Unmute: 500ms fade to masterVolume.
- Volume change: 300ms `setTargetAtTime` ramp.

## Mini Jukebox UI

File: `src/lib/shared/3d/components/SceneAudioPlayer.svelte`

### Collapsed State (default)
- 32×32px circle, position `top: 12px; left: 12px`, z-index 50
- Music note icon (Font Awesome `fa-music`)
- Subtle CSS pulse animation when playing
- Click to expand
- Fades to 50% opacity after 5s inactivity, full on hover

### Expanded State
- ~180×130px frosted glass card (`backdrop-filter: blur(12px)`, dark semi-transparent bg)
- Layout:

```
┌──────────────────────────┐
│ ♫  Reef: Sunlit Sha...  ✕│  header: variant + track name + collapse btn
├──────────────────────────┤
│  ◀   ▶ ▐▐  ─────●── 🔊  │  prev/next, play/pause, volume, mute
├──────────────────────────┤
│  ▸ Sunlit Shallows       │  track list (highlight = active)
│    Coral Garden          │
└──────────────────────────┘
```

- Collapse button (✕) returns to icon state
- Track list: click to switch. Active track highlighted.
- Volume slider: horizontal, ~80px wide, controls masterVolume
- Mute button: speaker icon, toggles muted state
- Play/pause: toggles audio playback on/off
- Prev/next (◀▶): cycle through variant's track list

### Styling
- Dark frosted glass: `background: rgba(10, 20, 40, 0.75); backdrop-filter: blur(12px)`
- Text: white/light-blue, small (12-13px)
- Icons: Font Awesome solid, 14px
- Border: `1px solid rgba(100, 180, 255, 0.15)`
- Border-radius: 12px (expanded), 50% (collapsed)
- Transition: 200ms ease for expand/collapse

### Behavior
- Opens expanded on first audio play (after user gesture unlocks audio)
- Auto-collapses after 8s of no interaction
- Remembers expand/collapse preference in session (not persisted)
- Hidden when `hideOverlays` is true (matches other viewer overlays)

## Mounting Point

`SceneAudioPlayer` mounts inside `Viewer3DCanvas.svelte` as a sibling to other overlay elements. Conditionally rendered when the active background is Ocean (same guard pattern as `ScenePostProcessing`).

`OceanAudioEngine` replaces the current `OceanAmbientAudio` component inside `OceanScene.svelte`. It reads variant + track selection from state, produces audio, and exposes play/pause control to the UI.

## Autoplay Policy

Audio context created on first user interaction (pointerdown/keydown). Before that, the jukebox shows a "Click to enable audio" state instead of track info. After unlock, playback begins automatically and the jukebox transitions to its normal state.

## Future: Pre-Recorded Track Layer

When ready to add ambient loops:
1. Place OGG + MP3 files in `/static/sounds/ocean/<variant>/`
2. Add entries to the track manifest with `type: "file"` and `src` path
3. OceanAudioEngine loads and loops them via `HTMLAudioElement` (gapless OGG, MP3 fallback)
4. Pre-recorded tracks mix with procedural bed via separate GainNode
5. Track manifest supports mixing: a track can be `type: "hybrid"` with both a file source and procedural params

Licensing: Pixabay Audio (safest — free, no attribution, irrevocable) or Freesound CC0.

## Dependencies

- No new npm packages. Web Audio API only (already used by OceanAmbientAudio.svelte and SoundPlayer.ts).
- Font Awesome icons (already in project).
- localStorage (already used throughout).

## Not In Scope

- Spatial/positional audio (3D positioned sounds near reef structures)
- Audio visualization (waveform, spectrum)
- Audio for non-ocean scenes (infra supports it, but no tracks/presets defined)
- File-based tracks (future follow-up)
