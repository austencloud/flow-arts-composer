---
status: backlog
value: 3
effort: M
remaining: Recheck the Museum interior systems against the current Museum code, especially whether the TV display remains absent.
depends_on: ''
plan_path: ''
tags: []
last_triaged: '2026-10-07'
work_state: unverified
---

# Museum Interior Design System

> **DRIFT WARNING — 2026-08-02.** 3 of 4 systems shipped verbatim; TV display system (Section 2) does not exist
>
> Status lines below predate this check and are left intact deliberately.
> This banner is the current state. Source: `docs/superpowers/handoffs/2026-07-25-spec-triage-ledger.md`.


## Problem

Museum exhibit placements are hand-coded as fractional wall positions with no design rules enforced. Plaques float in doorways, cluster in corners, and ignore visitor flow. The plaque content requires pressing E to read via a side panel rather than being readable in the 3D space. There are no sequence displays (TVs) despite GLB models existing in the asset pipeline. No dev tooling exists to track what each room is supposed to contain.

## Solution

Four interconnected systems that professionalize the museum's interior design:

1. **Canvas-to-texture plaque rendering** - Readable text directly on 3D plaque surfaces
2. **Era-matched TV displays** - GLB television models with render-to-texture sequence playback, evolving from 1940s to 2020s
3. **Museum design validator** - A linter for exhibit placement that enforces professional gallery standards
4. **Dev whiteboard system** - In-game whiteboards documenting each room's purpose and TODO state

## Design Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Text rendering | Canvas-to-texture | Proven pattern (MuseumPortal), one draw call per plaque, full layout control |
| TV models | Era-matched GLBs + procedural | Portal 2-style decade evolution visible as you walk through |
| Rule enforcement | Validator (not auto-placer) | Rooms have narrative intent; auto-placement would miss storytelling |
| Dev notes | In-game whiteboards | Visible while designing, comedically large, stripped in prod |
| Room execution | Sequential, entrance-first | Design in visitor path order so sightlines connect |
| Plaque readability | Title visible from 3-4 tiles, body from 1-2 | Matches real museum behavior, creates "drawn forward" effect |

---

## Section 1: Plaque Rendering System

### PlaqueTextureGenerator

A service that takes plaque content and returns a Three.js `CanvasTexture`.

**Pipeline:**
1. Create OffscreenCanvas at resolution matching plaque physical size
2. Draw dark background with subtle warm border
3. Render title large in warm-gold color (visible 3-4 tiles away)
4. Render subtitle in smaller italic
5. Word-wrap body text in museum-appropriate serif font
6. Render footer in small caps at bottom
7. Return CanvasTexture applied to plaque BoxGeometry

### Plaque Sizes

| Size | Tile Dimensions | Canvas Resolution | Use Case |
|------|----------------|-------------------|----------|
| `standard` | 0.8w x 1.5h | 512x768 | Most plaques |
| `large` | 1.5w x 1.5h | 1024x768 | Important exhibits, info panels |
| `dev-whiteboard` | 3w x 2.5h | 2048x1536 | Room dev notes, TODO lists |

### Rendering Changes

The current system uses a single InstancedMesh for all plaques (same geometry, same material). Since each plaque now has a unique texture, plaques become individual meshes. Each plaque:

- Gets its own BoxGeometry sized to its `size` field
- Gets a unique MeshStandardMaterial with the canvas texture as `map`
- Retains the brass frame mesh behind it (scaled to match)
- Is positioned and rotated using the existing wall-relative + facing system

Exhibit rendering should be extracted from `Museum3DScene.svelte` into a dedicated `MuseumPlaque3D.svelte` component to prevent the scene file from growing further. The existing exhibit InstancedMesh construction (~30 lines) is replaced by per-plaque component instances in the Svelte template.

### Texture Caching

PlaqueTextureGenerator caches textures by `refId`. Textures are created once at grid build time, not per frame. With ~30 exhibits across 16 rooms, this is ~30 canvas elements and textures - well within browser limits.

### Font Strategy

Use system fonts to avoid web font loading: `Georgia, "Times New Roman", serif` for plaques, `Consolas, "Courier New", monospace` for dev whiteboards. These are universally available on Windows, Mac, and Linux.

### Exhibit Placement Data Changes

New fields on `ExhibitPlacement`:

```typescript
interface ExhibitPlacement {
  wall: "north" | "south" | "east" | "west";
  position: number;        // 0.0-1.0 along wall
  refId: string;
  facing: Direction;
  size?: "standard" | "large" | "dev-whiteboard";  // NEW - default "standard"
  group?: string;           // NEW - exhibits in same group may be closer than 2 tiles
  isAnchor?: boolean;       // NEW - marks this as the room's anchor piece
}
```

### Migration Path

The new fields (`size`, `group`, `isAnchor`) are all optional with sensible defaults. Existing exhibits work without changes. The validator rules that depend on `isAnchor` (anchor presence, anchor placement) only fire for rooms where at least one exhibit has `isAnchor: true`. Rooms without any anchor annotation are skipped with an info-level note, not a warning. Fields are added room-by-room as each room is redesigned during the execution phase.

### Group Field

Exhibits with the same `group` string are treated as a visual cluster. The spacing rule (2+ tiles between exhibits) is relaxed within a group. Example: the two Lascaux Tablets on the north wall of the Vulcan Cave share `group: "lascaux"` and can be placed 1 tile apart.

---

## Section 2: TV Display System

### Era-Matched Models

TV technology evolves through the museum timeline:

| Decade | TV Style | Model Source | Rooms |
|--------|----------|-------------|-------|
| Pre-1940s | No TV | - | Entrance, Vulcan Cave |
| 1940s | Massive wooden cabinet, tiny round screen | `cabinetTelevision.glb` | Egyptian Wing |
| 1950s | Console TV, furniture piece, doors | `cabinetTelevisionDoors.glb` | Renaissance Wing |
| 1960s | Boxy tube, rabbit ears, wood panel | `televisionAntenna.glb` | Victorian Wing |
| 1970s | Fake wood grain console, rotary knobs | `televisionVintage.glb` | Suppression (early) |
| 1980s | Boxy plastic CRT, silver/black, chunky buttons | Procedural: rounded-edge box, inset screen, 4:3 aspect | Suppression (later) |
| 1990s | Computer CRT monitor, beige box | `computerScreen.glb` | Digital Wing |
| 2000s | Early flat panel, thick silver bezels, wide base stand | Procedural: thin box + thick bezel frame, 16:10 aspect | K's Gallery |
| 2010s | Thin LED, minimal bezels | `televisionModern.glb` | Fear, Isolation, Collaboration |
| 2020s | Ultra-thin OLED, frameless, wall-mounted | Procedural: near-zero depth slab, 16:9, no visible bezel | Gift Shop |

Procedural models (1980s, 2000s, 2020s) are Three.js geometry styled per decade. No external assets needed.

### Sequence Playback on TV Surfaces

Uses the proven MuseumPortal render-to-texture pattern:

1. A hidden Three.js scene contains Avatar3D + Staff3D playing a sequence in puppet mode
2. A `WebGLRenderTarget` captures this scene each frame
3. The render target texture is applied to the TV model's screen mesh
4. Each TV with a `sequenceId` gets its own render target + hidden scene
5. TVs without a sequence show static/noise or "NO SIGNAL"

### Performance

Each active TV = one extra render pass per frame. Cumulative budget: main scene + portal + 2-3 TVs + performer avatars = 4-6 render passes. This is manageable at 60fps for modern GPUs.

Render target resolution scales by era (older TVs are grainier):
- 1940s-1970s: 128x128 (deliberately low-res, CRT authenticity)
- 1980s-1990s: 256x256 (sharper but still period-appropriate)
- 2000s-2010s: 512x384 (clear but not crisp)
- 2020s: 512x512 (modern display quality)

If more than 3 TVs are simultaneously visible, off-screen TVs render every 3rd frame.

### Placement Data

New tile type `"sequence-screen"` in the tile registry:

```typescript
// In tile-registry.ts
"sequence-screen": {
  walkable: false,
  solid: true,
  renders3D: true,
  cssClass: "sequence-screen",
  icon: "tv",
  label: "Sequence Screen",
}
```

New `screens` field on `RoomNode` in the room graph:

```typescript
interface RoomNode {
  // ... existing fields
  screens?: ScreenPlacement[];
}

interface ScreenPlacement {
  wall: "north" | "south" | "east" | "west";
  position: number;
  refId: string;
  facing: Direction;
  decade: "1940s" | "1950s" | "1960s" | "1970s" | "1980s" | "1990s" | "2000s" | "2010s" | "2020s";
  sequenceId?: string;      // if omitted, shows static
}
```

---

## Section 3: Museum Design Validator

A `MuseumDesignValidator` service that runs after grid build. Dev-only, zero prod cost.

### Rules

| Rule | Check | Severity |
|------|-------|----------|
| Corner avoidance | No exhibit within 1 tile of a room corner | Warning |
| Entrance clearance | No exhibit within 2 tiles of a doorway opening | Warning |
| Wall-backed | Every exhibit has a wall tile behind it | Error |
| Anchor presence | Each room has exactly one exhibit marked `isAnchor` | Warning |
| Anchor placement | Anchor is on the wall opposite the entrance | Warning |
| Spacing | No two exhibits within 2 tiles of each other (unless same `group`) | Warning |
| Wall coverage | No single wall exceeds 70% exhibit tile coverage | Warning |
| Sightline | No solid exhibit tiles blocking the straight line between entrance center and anchor tile (tile-based raycast, not pathfinding) | Warning |

### Implementation

The validator receives the built `MuseumGrid` plus the `PlacedRoom[]` and `RoomEdge[]` data. It:

1. For each room, identifies the entrance wall (the wall where a corridor connects FROM the previous room on the main path)
2. Identifies the opposite wall (the anchor wall)
3. Checks each exhibit placement against the rules
4. Checks room-level rules (anchor presence, sightline)
5. Returns `DesignViolation[]` (named to avoid collision with existing `ValidationResult` in layout-types.ts) with room ID, rule name, severity, and human-readable message
6. Logs results to console, grouped by room

```typescript
interface DesignViolation {
  roomId: string;
  rule: string;
  severity: "error" | "warning";
  message: string;
  exhibitRefId?: string;  // which exhibit triggered it, if applicable
}
```

### Entrance Wall Detection

The entrance wall for each room is determined by the edge data:
- Find the main-path edge where this room is the `to` node
- The `toWall` on that edge is the entrance wall
- The entrance for the first room (Entrance Lobby) is "south" (front door)
- The opposite wall is the anchor wall

---

## Section 4: Dev Whiteboard System

### In-Game Whiteboards

Each room gets a whiteboard on the opposite-entrance wall (the anchor wall). During development, the whiteboard IS the anchor. When the room is finished, the whiteboard is replaced by the real anchor exhibit.

### Whiteboard Content

A `devNotes` field on each room definition:

```typescript
interface RoomNode {
  // ... existing fields
  devNotes?: string;  // Multi-line string, rendered as whiteboard text
}
```

Example:
```
VULCAN CAVE - Ancient Origins
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PURPOSE: First "holy shit" moment. Player
realizes this notation is ancient.

EXHIBITS:
[x] Lascaux Tablets A & B (north wall)
[x] Cave paintings - figures + audience (west)
[x] Dr. Marchand portrait (west)
[ ] Need 1940s TV showing cave performer seq
[ ] Torch placement needs work

TONE: Reverent. Quiet. Torchlight.
No humor here - earn it later.
```

### Rendering

- Uses the same PlaqueTextureGenerator but with whiteboard styling:
  - White background instead of dark
  - Black monospace text instead of gold serif
  - No brass frame - plain white rectangle
- Size: `dev-whiteboard` (3 tiles wide, 2.5 tiles tall)
- Controlled by `DEV_WHITEBOARDS` constant - when false, whiteboards are not placed

### Auto-Placement

The grid builder auto-places each room's whiteboard:
1. Detect the entrance wall from edge data
2. Compute the opposite wall
3. Place the whiteboard centered on the opposite wall
4. Uses the same wall-backed check to avoid doorways on that wall

### Interaction with Anchor Rule

When `DEV_WHITEBOARDS` is true, the validator suppresses the "anchor presence" and "anchor placement" rules for rooms that don't yet have a real `isAnchor` exhibit. The whiteboard occupies the anchor wall position during development. When a room is finished, the whiteboard's `devNotes` is removed (or left for future reference), the `DEV_WHITEBOARDS` flag hides it, and a real anchor exhibit takes its place.

---

## Section 5: Room-by-Room Execution

### Process Per Room

1. Write the whiteboard content (purpose, planned exhibits, constraints)
2. Hand-place exhibits using wall-relative coordinates with design rules in mind
3. Run validator, fix any violations
4. User walks it in-game, gives feedback
5. Iterate until satisfied

### Room Order (Visitor Path)

| # | Room | Exhibits | TVs | Key Challenge |
|---|------|----------|-----|---------------|
| 1 | Entrance Lobby | 2 | 0 | Set the tone. Simple. |
| 2 | Vulcan Cave | 5 | 0 | First complex room. Pre-1940s, no TV. Torchlight atmosphere. |
| 3 | Egyptian Wing | 4 | 1 (1940s) | Sandstone warmth. First TV appears. Formalization of Types. |
| 4 | Renaissance Wing | 4 | 1 (1950s) | Da Vinci's workshop. Wood and natural light. |
| 5 | Victorian Wing | 4 | 1 (1960s) | Gas lamps. Brass notation device sequence. |
| 6 | Digital Wing | 4 | 1 (1990s CRT) | The escape to digital. BBS era. |
| 7 | Suppression | 6 | 2 (1970s-80s) | The reveal. Dense and institutional. |
| 8 | Vulcan Wing | 1 | 0 | Under renovation. Quick. |
| 9 | The Crumble | 0 | 0 | Abandoned. Whiteboard only. |
| 10 | K's Gallery | 4 | 1 (2000s) | Emotional heart. K's additions. |
| 11 | Room of Fear | 3 | 1 (2010s) | Containment warnings. Oppressive. |
| 12 | Room of Isolation | 0 | 1 (2010s) | Cubicle walls. Screen shows what could be. |
| 13 | Room of Collaboration | 0 | 1 (2010s) | 4 performers. The payoff. |
| 14 | Gift Shop | 0 | 1 (2020s) | Commercial contrast. |
| 15 | Construction Zone | 1 | 0 | Staff only. Quick. |
| 16 | Janitor's Closet | 2 | 0 | The meta reveal. |

### Pace

1-3 rooms per session. Walk each one. Iterate. No rushing.

---

## File Locations

| Component | Path |
|-----------|------|
| PlaqueTextureGenerator | `museum-2d/services/implementations/PlaqueTextureGenerator.ts` |
| TV procedural models | `museum-2d/services/implementations/MuseumTVFactory.ts` |
| TV render-to-texture | `museum-2d/components/game/MuseumSequenceScreen.svelte` |
| Design validator | `museum-2d/services/implementations/MuseumDesignValidator.ts` |
| Whiteboard auto-placer | Integrated into `MuseumGridBuilder.ts` |
| Room dev notes | `devNotes` field in `museum-room-graph.ts` |
| Validator rules config | `museum-2d/domain/museum-design-rules.ts` |

## Dependencies

- No new npm packages. Canvas API, Three.js, and existing GLB loader are sufficient.
- Procedural TV models (1970s, 1980s, 2000s, 2020s) are Three.js geometry, no external assets.
- Existing `MUSEUM_EXHIBIT_SEQUENCES` data feeds the TV sequence playback.

## Out of Scope

- Interactive exhibits (pressing E to open panels) - replaced by readable plaques
- Auto-placement algorithms - validator only, hand-placement preserved
- Audio/sound design per room
- NPC dialogue systems
- Museum editor integration (the tile editor is separate)
