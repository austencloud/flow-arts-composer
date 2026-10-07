---
status: active
value: 2
effort: L
remaining: "Verify which mandala roadmap phases after the viewer exist in the current sequence viewer, then split remaining phases into independently scoped specs."
depends_on: ""
plan_path: ""
tags: []
last_triaged: 2026-10-07
work_state: unverified
---
# Mandala Creation Roadmap

The breathing mandala viewer (Phase 1) is the foundation. Everything below builds on it.

## Phase Order

Ordered by: dependencies → effort → standalone value → what enables future phases.

---

### Phase 1: Viewer Pane ✅ COMPLETE
The interactive mandala viewer with breathing undulation, path shapes (Arc/Linear/Concave/Hybrid), color modes (Solid/Flow), spin, depth, line weight, and MP4 export. Lives in the sequence viewer as a content pane.

---

### Phase 2: Mandala Trails / Afterimage
**What:** Ghost previous frames at decreasing opacity. The mandala leaves a luminous trail as it breathes — like long-exposure photography. Especially gorgeous in Flow mode where the color shifts leave rainbow trails.

**Why first:** Low effort, renderer-level enhancement, massive visual impact. No new UI needed — just a toggle or intensity slider. Builds directly on the existing SVG rendering pipeline.

**Complexity:** Small. Layer previous SVG frames at decreasing opacity behind the current frame. 5-10 ghosted frames with exponential opacity falloff.

**Dependencies:** Phase 1 only.

---

### Phase 3: Shareable Mandala Links
**What:** Encode all viewer settings (sequence ID + preset + color mode + speed + spin + depth + path shape + line weight) into a tka.run short code. Anyone with the link sees the exact same breathing mandala.

**Why early:** Leverages existing short code infrastructure (tka.run, Firebase shortcodes collection). Viral growth mechanic — users share mandalas on social media.

**Complexity:** Small-medium. Serialize settings to JSON, store in Firestore, generate short code. Receiving end: detect mandala link type, hydrate viewer with saved settings.

**Dependencies:** Phase 1 + existing short code system.

---

### Phase 4: Guided Meditation
**What:** Sync "inhale... exhale..." text prompts to the undulation cycle. User sets their target breath rate (breaths per minute). The mandala becomes a visual breathing guide. Optionally pair with ambient audio (ocean, forest, chimes).

**Why standalone:** Real wellness feature with broad appeal beyond the TKA community. Meditation apps are a proven market. This positions the mandala as more than a visualization — it's a tool.

**Complexity:** Medium. Breathing coach UI (BPM selector, session timer, prompt overlay). Optional Web Audio API for ambient sounds. Session history tracking.

**Dependencies:** Phase 1 only.

---

### Phase 5: Mandala Formations
**What:** Arrange N mandalas in a shape (ring, grid, spiral, hexagon). Each mandala breathes with configurable phase offsets — a ring of 8 creates a breathing wave rippling around the circle. The formation itself rotates and scales independently.

**Why the big one:** This is where mandalas become compositions. The composition lab already handles arrangement, timing, layering. Mandala formations are a new composition type.

**Complexity:** Large. Multi-instance rendering (performance: SVG vs Canvas vs WebGL for N mandalas). Formation layout engine (polar, grid, spiral, custom). Phase offset system. Formation-level transform controls (rotation, scale, breathing). Composition lab integration.

**Dependencies:** Phase 1. Benefits from Phase 2 (trails on formations = spectacular).

---

### Phase 6: Phase-Chained Breathing
**What:** One mandala's exhale triggers the next's inhale. A chain of mandalas creates a "breathing relay" — a wave of expansion/contraction that travels through the formation. Different chain topologies: linear, circular, branching, random.

**Why after formations:** Requires multiple mandalas to exist (Phase 5). Enhancement to formations that makes them feel alive.

**Complexity:** Medium. Phase coupling system with configurable trigger points and propagation speed. Chain topology editor.

**Dependencies:** Phase 5.

---

### Phase 7: Audio-Reactive Mode
**What:** Mic input or uploaded audio track drives mandala parameters. Bass → depth/expansion, mids → spin speed, highs → color phase shift. Real-time FFT analysis maps frequency bands to visual parameters. Works with single mandala or formations.

**Why here:** Web Audio API + AnalyserNode is well-supported. Festival projection material. Works with everything built so far.

**Complexity:** Medium-large. Web Audio API integration (mic + file input). FFT frequency band mapping. Parameter smoothing (avoid jitter). Sensitivity/mapping controls. Works with formations (Phase 5) for maximum impact.

**Dependencies:** Phase 1. Enhanced by Phase 5 (audio-reactive formations).

---

### Phase 8: Fractal Nesting
**What:** Zoom into the center of a mandala → reveal a smaller mandala inside → which contains another. Infinite zoom loop. Each nesting level can be a different sequence, creating visual relationships between movement patterns.

**Why here:** High wow factor but niche use case. Requires careful rendering optimization (LOD system to avoid rendering invisible inner layers).

**Complexity:** Medium. Recursive mandala rendering with depth limit. Zoom animation system. LOD culling. Sequence assignment per nesting level.

**Dependencies:** Phase 1. Enhanced by Phase 2 (trails during zoom transitions).

---

### Phase 9: Wallpaper / Tessellation Export
**What:** Tile mandalas in repeating patterns — hexagonal, square, triangular tessellations. Export as static images (phone/desktop wallpapers) or animated loops (live wallpapers, screensavers). High-res export pipeline.

**Why here:** Builds on formations (Phase 5) for animated tessellations. Static tessellations work without formations.

**Complexity:** Medium. Tessellation layout engine (3 tile types). High-res static export (SVG → PNG at arbitrary resolution). Animated export (extend existing MP4 pipeline to formations). Aspect ratio presets (phone, desktop, ultrawide).

**Dependencies:** Phase 1 for static. Phase 5 for animated.

---

### Phase 10: Sequence Morphing
**What:** Smoothly interpolate between two sequences' mandala geometries. Watch one movement pattern dissolve into another. Visual proof of how sequences relate.

**Why late:** Requires interpolating between SVG path geometries, which means changes to the mandala geometry calculator. Path correspondence problem (matching paths between different sequences with different step counts).

**Complexity:** Large. Path correspondence algorithm. Geometry interpolation (matching control points between different path shapes). Transition timing and easing. UI for selecting source/target sequences.

**Dependencies:** Phase 1. Geometry calculator changes.

---

### Phase 11: 3D Extrusion
**What:** Extrude 2D SVG mandala paths into 3D geometry in the Threlte scene. The breathing mandala becomes a sculptural object you orbit around. Paths become ribbons or tubes in 3D space. Lighting, materials, depth-of-field.

**Why last:** Most complex. Requires bridging the SVG path system with the Three.js geometry pipeline. Premium tier content — the kind of thing that justifies a subscription.

**Complexity:** Very large. SVG path → Three.js BufferGeometry conversion. Extrusion/lathe along paths. Material system (metallic, glass, emissive). Camera orbit. Performance optimization for animated 3D geometry. Integration with existing 3D scene system.

**Dependencies:** Phase 1 + Threlte/Three.js pipeline.

---

## Summary Table

| Phase | Name | Effort | Value | Depends On |
|-------|------|--------|-------|------------|
| 1 | Viewer Pane | ✅ | ✅ | — |
| 2 | Trails / Afterimage | S | High | 1 |
| 3 | Shareable Links | S-M | High | 1 |
| 4 | Guided Meditation | M | High | 1 |
| 5 | Formations | L | Very High | 1 |
| 6 | Phase-Chained Breathing | M | High | 5 |
| 7 | Audio-Reactive | M-L | Very High | 1, opt 5 |
| 8 | Fractal Nesting | M | Medium | 1 |
| 9 | Wallpaper Export | M | Medium | 1, opt 5 |
| 10 | Sequence Morphing | L | Medium | 1 |
| 11 | 3D Extrusion | XL | Very High | 1 |
