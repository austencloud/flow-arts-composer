---
status: active
value: null
effort: null
work_state: in-progress
remaining: Advance Flow Fest Sim through its measured Earth and playable graybox gates, then rehearse the Thursday-to-night slice and GNSS replay.
depends_on: ''
plan_path: ''
tags: []
last_triaged: '2026-10-07'
---

# Flow Fest Sim

**Status:** Active foundation specification  
**Decision owner:** Austen  
**Implementation owner:** Flow Fest Sim feature, composed from the shared procedural 3D engine  
**First production gate:** A meter-true, reproducible Earth site with a walkable terrain proof

## The promise

Flow Fest Sim is a human-scale festival simulator. The fantasy is not being a promoter looking down at a site plan. It is arriving as a person with too much gear, finding a campsite, meeting people, taking workshops, practicing, volunteering, getting rained on, losing track of time, and walking toward the fire circle after dark.

The first Earth site is a real place in southwest Ohio. People who know the campground may recognize the land, road, fields, slopes, pond, and tiered clearings. The product does not need to name or impersonate Hannon's Camp America or Kinetic Fire. It does not use their logos, event artwork, schedules, attendee identities, or marketing copy. Austen's direction is explicit: do not make pre-contact with either organization a production gate.

The site is the anchor, not the entire game. The game must still work as a fictional flow festival with fictional event names, characters, workshops, camps, and stories.

## Why this should exist

Flow arts games normally isolate the performance. A festival is larger than the trick being performed. It is travel, temporary community, informal teaching, weather, logistics, music bleeding across a field, and the strange transition from an ordinary campground in daylight to a village at night.

The project already owns important pieces of that experience:

- the shared Threlte/Three/Rapier world runtime owns streamed terrain, physics, camera movement, and world chunks;
- the village simulation owns population, movement, social, teaching, performance, prop, circle, season, and recombination systems;
- the object catalog owns tents, fire pits, picnic tables, coolers, speakers, generators, and festival zone markers;
- the performer stack owns TKA-driven avatar and prop motion.

Flow Fest Sim composes and extends those owners. It does not create parallel camera, physics, social, or performance engines.

## Product identity

### Player fantasy

> Go to a flow festival as a person, not as a cursor.

### First vertical slice

A 25–40 minute Thursday-arrival-to-first-night experience:

1. Turn off the county road and check in at the gate on the lower level.
2. Receive a fictional wristband, a physical tier orientation, and three camping choices: lower tent, upper tent, or lower car camping. Middle Earth is not camping.
3. Drive directly to the selected site. Lower tent sites use the lower perimeter, upper tent sites use the upper level, and car camping occupies the open middle of the lower level.
4. Unload or settle in and establish a persistent home base.
5. If tent camping, return in the car through the lower gate, drive uphill to the west upper parking field, and walk back to camp. If car camping, keep the vehicle at the campsite and skip this loop.
6. Walk from camp into Middle Earth using the direct upper-to-middle connector or the clear middle-to-lower connector. Both pass beneath canopy and can disappear from overhead terrain evidence without being blocked.
7. Meet a small simulated population whose plans continue without the player.
8. Join one workshop or informal skill exchange.
9. Help with one useful task.
10. Return at night to transformed ground with sound, light, fire-safe performance space, and active circles.
11. End at the first meaningful night choice: watch, practice, join, wander, or go back to the selected camp.

This slice proves the product. A giant map full of empty tents does not.

### Core loop

```text
arrive -> orient -> establish camp -> wander -> meet -> learn or help
       -> practice or perform -> witness the night transformation -> return changed
```

The world should produce stories through overlapping systems rather than a chain of quest markers. Schedules, weather, fatigue, social affinity, skill exchange, sound fields, light fields, and crowd movement create the conditions. Authored moments give those systems shape.

### Tone

- affectionate, observant, and lightly absurd;
- no brand parody and no event-management tycoon framing;
- experienced from standing eye height;
- the funny parts are recognizable human behavior: misplaced gear, ambitious schedules, wet socks, a workshop that starts late because everyone is helping with a tarp;
- flow artists are people, not ambient decoration.

## The live-location mirror

A future installation mode may render Austen's in-game avatar on a backpack 3D fan while he walks the corresponding physical site. That is not a separate map. It is a demanding consumer of the same coordinate contract.

The geospatial foundation must therefore preserve:

- the WGS84 location of the world origin;
- the projected coordinate reference system used during build;
- an invertible projected-to-world transform;
- one game unit equal to one meter;
- east/up/south axis semantics;
- terrain and authored-object provenance separately;
- timestamps and accuracy for live GNSS samples;
- a calibration transform for the fan's physical orientation;
- an explicit degraded mode when GPS accuracy is poor.

The live mirror never relies on visual dead reckoning from Google imagery. A later device bridge can transform ordinary GNSS positions through the recorded CRS, smooth them with accuracy-aware filtering, and place the avatar in the same local meter frame.

## Geospatial authority model

One owner exists for each kind of truth:

| Truth                                                                    | Owner                                                                                      |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Source discovery and immutable download selection                        | `scripts/geospatial/flow-fest-source-lock.json`                                            |
| Site anchor, grid size, axis convention, and source policy               | `scripts/geospatial/flow-fest-site.json`                                                   |
| Reproducible acquisition and derivation                                  | `scripts/geospatial/build_flow_fest_foundation.py`                                         |
| Runtime terrain metadata and derived-asset hashes                        | `static/data/flow-fest-sim/terrain.manifest.json`                                          |
| Runtime sampling, validation, and worker transfer                        | `shared/3d/procedural-engine/generation/real-terrain-zone.ts` plus `geospatial-terrain.ts` |
| Gameplay regions, paths, camps, stages, and fictional event layout       | a later Flow Fest Sim plan contract, never the terrain manifest                            |
| Visual interpretation of buildings, vegetation, and temporary structures | later authored scene layers with their own evidence                                        |

The runtime manifest is an evidence-bearing data contract. It is not a parcel survey and it does not invent property ownership.

## Source policy

### Authoritative public layers

The foundation uses sources whose terms permit offline derivation:

| Layer                                   | Selected source                                                                            | Role                                                             |
| --------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| Bare-earth terrain                      | USGS 3DEP one-meter DEM, Ohio Statewide Phase 3 2021 B21                                   | Walkable collision surface and terrain relief                    |
| Surface structure                       | USGS 3DEP classified lidar point cloud from the same Ohio project                          | Canopy/building-height evidence and later reconstruction support |
| Aerial color                            | USGS National Map NAIP Plus service, 2023 Ohio image at 0.3 m                              | Aligned reference and terrain color source                       |
| Roads and sparse public features        | OpenStreetMap, when needed and recorded separately                                         | Non-authoritative hints only                                     |
| Site layout and festival transformation | Authored from on-site observation, user memory, original photography, and fictional design | Gameplay truth                                                   |

USGS product discovery is made through The National Map API. The selected one-meter DEM product states that it is a bare-earth surface in UTM meters, referenced horizontally to NAD83 and vertically to NAVD88, and that 3DEP products are public domain. The source lock retains the exact ScienceBase ID, vendor metadata URL, download URL, published date, byte count, and SHA-256 for every selected file. The lock also pins the four public-domain NOAA NADCON5-derived grids required to transform NAD83(2011) lidar into the DEM's NAD83 frame without a ballpark datum shift.

The imagery service identifies the local source as `m_3908426_ne_17_030_20230522`, acquired May 22, 2023, with four CNIR bands and 0.3 meter source resolution. Terrain and imagery are from different years. The manifest preserves that temporal mismatch; the art pipeline does not pretend they are a synchronized capture.

### Prohibited source behavior

Google Maps imagery and 3D tiles may be viewed as ordinary visual reference. They are not downloaded, traced into geometry, machine-interpreted, cached as game assets, or used to derive object positions. No runtime Google dependency is part of this foundation.

### What the public layers cannot prove

- legal property boundaries;
- the location of temporary festival infrastructure in any specific year;
- current building condition;
- private attendee campsites or identities;
- safe fire, vehicle, electrical, or accessibility routing.

Those are authored or field-verified layers with separate provenance.

## Coordinate contract

### Horizontal reference

- Source and build CRS: NAD83 / UTM zone 16N, EPSG:26916. Both downloaded Ohio 3DEP GeoTIFFs declare this CRS and exact one-meter transforms. A future mismatch is a build failure, not an implicit conversion guess.
- DTM elevation semantics: each source-locked USGS metadata XML must explicitly declare a bare-earth surface, elevation values in meters, and NAVD88. A missing claim or metadata hash drift is a build failure because the GeoTIFF's two-dimensional CRS cannot prove its vertical datum by itself.
- Lidar horizontal datum conversion: source-locked NOAA NADCON5 chain, selected with a site-bounded area of interest and `allow_ballpark=false`. The accepted PROJ operation reports 0.20 m accuracy; missing grids, unknown accuracy, or accuracy worse than 0.25 m are build failures.
- Requested anchor: latitude `39.589617`, longitude `-84.785764` in WGS84.
- Projected world origin: the anchor transformed to EPSG:26916 and snapped to an integer easting/northing meter. The manifest records both the requested anchor and the resolved snapped origin.
- Grid: `1025 × 1025` samples at exactly `1 meter` spacing. Sample centers span `-512..512` meters on both world horizontal axes. This gives a 1,024 meter square and aligns with 32 meter runtime chunks.

### World axes

The game frame is right-handed:

```text
+X = projected east
+Y = elevation above the recorded NAVD88 vertical origin
+Z = projected south
```

The invertible transform is:

```text
worldX = projectedEasting - originEasting
worldZ = originNorthing - projectedNorthing
worldY = navd88Elevation - verticalOriginElevation

projectedEasting = originEasting + worldX
projectedNorthing = originNorthing - worldZ
navd88Elevation = verticalOriginElevation + worldY
```

One game unit is one meter. `verticalScale` is exactly `1`. No renderer or importer may normalize local relief into an arbitrary 0–40 or 0–50 range.

### Vertical reference

- Source elevations remain meters in NAVD88.
- The selected lidar declares the compound CRS `NAD83(2011) / Ohio South (ftUS) + NAVD88 height - Geoid18 (ftUS)`. Its horizontal coordinates are transformed into EPSG:26916 through the locked 0.20 m NADCON5 operation, and its vertical US survey feet are converted to meters before comparison with the DTM. Transform description, grid hashes, and reported accuracy stay in the evidence report; lidar surface offsets remain interpreted evidence, never the collision authority.
- The build chooses a round vertical origin below the minimum terrain elevation so runtime values stay compact and positive.
- The absolute origin remains in the manifest, so world Y is reversible.
- Ellipsoidal GPS altitude is not silently compared with NAVD88. A future live-location bridge must apply the declared geoid/vertical transformation or explicitly operate horizontal-only.

### Raster orientation

- row 0 is north;
- columns advance east;
- rows advance south, matching positive world Z;
- values are row-major little-endian Float32 elevations in absolute NAVD88 meters;
- the runtime subtracts the vertical origin once and only once.

## Derived runtime package

`static/data/flow-fest-sim/` contains only distributable derived assets:

```text
terrain.manifest.json       Versioned contract, transforms, sources, hashes, statistics
terrain-height.f32          1025 × 1025 absolute NAVD88 Float32 samples
surface-offset.u16          Lidar surface height above DTM in centimeters; 65535 = no data
ortho.webp                  North-up aligned public-domain aerial color reference
```

Raw GeoTIFF and LAZ files live in `.cache/flow-fest-sim/` and remain outside Git. Rebuilding from the checked source lock must reproduce identical height and surface bytes. The orthophoto encoder version and settings are recorded because image codecs can change output bytes across releases.

## Pipeline

### 1. Discover

- transform the requested 1,024 meter grid plus source margin into a WGS84 query box;
- query the official TNM products API for one-meter DEM and lidar;
- select only Ohio Statewide Phase 3 2021 B21 products intersecting the box;
- query the NAIP Plus catalog for the anchor and select the declared 2023 primary raster;
- fail if selection is empty, ambiguous outside policy, or comes from a different project;
- write the exact selection to the source lock.

### 2. Acquire

- stream each source into a temporary partial file;
- verify the declared byte count when available;
- calculate SHA-256;
- atomically promote the completed file into the cache;
- fetch and hash vendor metadata;
- request an image-service export registered to the same projected grid;
- never replace a locked source with different bytes silently.

### 3. Derive

- reproject both DEM tiles into one exact EPSG:26916 grid;
- use bilinear sampling only for sub-pixel registration, never to manufacture extra detail;
- fail on any no-data sample in the playable grid;
- report overlap/seam disagreement;
- scan lidar in chunks to avoid loading the point cloud into memory;
- exclude declared noise classes and rasterize the highest valid return per grid cell;
- store height above the authoritative DTM, not a second competing ground surface;
- reproject the selected NAIP export into the same footprint and emit a runtime image;
- write SHA-256 and source-lock digest into the manifest.
- write every binary, image, report, source lock, and manifest through a sibling `.partial` file and atomically replace the published path only after the complete artifact is closed; publish the manifest last.

### 4. Verify

Automated verification fails when:

- byte length does not equal the declared grid shape;
- any DTM value is NaN, infinite, or no-data;
- sample spacing, bounds, and dimensions disagree;
- the world transform does not round-trip at corners and anchor;
- vertical scale differs from 1;
- recorded min/max/relief differ from the binary;
- a derived hash differs;
- the source-lock hash differs;
- the current legacy Hannon file is accidentally selected;
- the orthophoto and terrain footprints disagree;
- a source CRS or vertical unit differs from policy without an explicit reviewed migration.

The build also emits a north-up hillshade and a machine-readable validation report. These are evidence, not runtime truth.

## Runtime integration

The checked terrain contract, sampling math, camera, player physics, and collision primitives remain shared owners. The infinite procedural world is a compatibility consumer, not the assumed final host for this bounded site.

1. `geospatial-terrain.ts` fetches and validates the manifest and binary height layer.
2. It verifies byte length, SHA-256, finite values, statistics, units, axis declarations, vertical scale, and the surface/orthophoto footprint contracts before returning terrain. Optional surface and imagery bytes are lazy-loaded through their own length-and-hash gate, so ordinary play does not transfer them.
3. `real-terrain-zone.ts` converts either the new contract or a validated legacy contract into one normalized worker payload.
4. Workers sample absolute elevation and subtract the declared vertical origin at 1:1 scale.
5. Chunk coverage comes from the grid, not an unrelated hand-drawn property boundary.
6. Measured height owns every point inside the footprint. A procedural compatibility host may blend only outside it, and the vertical slice must not inherit even that exterior behavior without evidence that the arrival route needs an exterior world.
7. Terrain collision consumes the same generated mesh vertices as rendering.

The first runtime keeps Threlte, Three, and Rapier. Gate 2 compares two consumers of the same binary height authority:

- a bounded static ground mesh with one Rapier trimesh collider;
- the current worker/chunk host with procedural exterior, multi-chunk meshing, and its runtime overhead.

The bounded host is the default recommendation because the site is finite and authored. The chunk host must earn its extra moving parts through measured startup, frame-time, collider, or culling benefits. All geospatial preprocessing is engine-neutral, so a later Unreal or native client can consume the same manifest and binary layers.

## Scene layers above terrain

The geospatial package deliberately separates confidence levels:

1. **Measured:** DTM, lidar returns, registered public orthophoto, coordinate transforms.
2. **Interpreted:** candidate tree crowns, roof volumes, road edges, pond edge, land-cover masks.
3. **Authored-real:** field-verified paths, current structures, photographs, measured landmarks.
4. **Festival fiction:** camps, workshop tents, vendors, stages, NPC schedules, sound camps, fire-safe circles, signage, weather consequences.

Only layer 1 belongs in the terrain manifest. Layer 2 can be regenerated. Layers 3 and 4 need their own plan contract and review evidence.

## Performance and quality budgets

### Foundation budgets

- terrain spacing: 1 meter, 1,025 samples per axis;
- horizontal world span: 1,024 meters;
- runtime terrain binary: about 4.2 MB before transport compression;
- no runtime GIS library required for ordinary play;
- no per-frame geodetic transforms in ordinary play;
- chunk size remains 32 meters so data edges align with chunk boundaries;
- collision and visible terrain share height samples;
- overlapping tiles must hold their 95th-percentile disagreement to 2 cm or less, RMSE to 5 cm or less, and maximum disagreement to 5 cm or less after the locked two-pixel source-edge trim. Overlap values are averaged so file order cannot choose the terrain;
- measured class-2 lidar ground minus DTM must hold signed median bias to 10 cm or less and 95th-percentile absolute residual to 25 cm or less. The full signed p05/p50/p95 and maximum absolute outlier remain in evidence.

### Vertical-slice runtime targets

- 60 fps target on the current desktop baseline;
- 30 fps minimum for an eventual battery-powered installation display;
- deterministic terrain and authored placement from versioned manifests;
- asynchronous world loading with visible progress and retryable errors;
- no silent procedural fallback when authoritative terrain fails validation.

## Backpack display architecture

The live installation is a later adapter, not a reason to contaminate the world runtime.

```text
GNSS sample -> accuracy/time validation -> CRS transform -> local world meters
            -> smoothing/prediction -> avatar pose -> fan-specific render output
```

Non-negotiable behaviors:

- discard stale positions and surface the degraded state;
- use horizontal accuracy to tune smoothing rather than pretending every fix is exact;
- calibrate heading independently from position;
- keep device location local unless Austen explicitly chooses recording or broadcast;
- never expose the precise live position of other attendees;
- provide a rehearsal mode driven by recorded or synthetic tracks;
- allow the display to show the in-game world even when location lock is unavailable.

## Safety, privacy, and identity

- All festival names, NPCs, schedules, workshop descriptions, signs, and camp identities are fictional unless separately cleared for inclusion.
- No attendee likeness, tent decoration, license plate, private message, or precise campsite history is reconstructed from imagery.
- Publicly distributed builds do not contain a live attendee map.
- Fire, traffic, weather, and accessibility behavior are game systems, not real-site instructions.
- A short fiction notice is enough for the neutral simulation. A branded shout-out can be a later creative choice, not a dependency.

## Production gates

### Gate 0: Foundation evidence

Complete when current ownership, legacy defects, public source policy, coordinate frame, and pipeline contract are proven. This specification and the source lock are the record.

### Gate 1: Measured Earth plan

Deliver:

- north-up hillshade;
- aerial/terrain registration contact sheet;
- lidar surface/imagery registration contact sheet with returns at least two meters above the DTM highlighted;
- a lower-tent vertical relief section plus measured branch metrics for upper tent and lower car camping;
- a numbered first-arrival branch storyboard over the measured land;
- a top-down plan that distinguishes lower tent, upper tent, lower car camping, west upper parking, and no-camping Middle Earth;
- source-locked centerlines from Austen's orthophoto traces for the direct upper-to-middle and middle-to-lower connectors, including their passage beneath canopy;
- sightline studies between lower, Middle Earth, and upper clearings that treat lidar surface as visibility evidence rather than a walkability mask;
- scale figure and 1,024 meter footprint.

Approval question: can Austen trace all three camp choices, explain which vehicles move to west upper parking, identify both tree-line connectors, and show how every branch reaches Middle Earth and returns to its selected camp? Austen has already confirmed that both tent branches return through the lower gate before parking.

### Gate 2: Playable terrain graybox

Deliver a first-person meter-true walk with collision, spawn, fixed review cameras, route timing, and representative placeholder volumes for current permanent structures. Compare the bounded static host with the existing chunk host using the same height bytes, then record the winner and evidence. No decoration may hide terrain or scale errors.

### Gate 3: Festival transformation target

Register daylight, dusk, and night visual targets to approved graybox cameras. Lock the visual hierarchy, temporary architecture families, light logic, sound-field logic, and density.

### Gate 4: Thursday-to-night production slice

Finish the three-choice arrival ritual, persistent selected campsite, one workshop/social exchange, one volunteer task, the night transformation, and one active circle with production-quality interaction.

### Gate 5: Living festival integration

Integrate village population, schedules, teaching, performance, props, circles, audio boundaries, weather response, persistence, and re-entry.

### Gate 6: Acceptance and installation rehearsal

Walk the slice end to end, verify viewports and performance, then replay a recorded GNSS track through the backpack adapter before any live event use.

## Risks and answers

| Risk                                                      | Answer                                                                                                   |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| The real site becomes an empty tech demo                  | Scope the first release around one authored arrival-to-night story and a small persistent population.    |
| Aerial or lidar canopy is treated as blocked ground      | Keep DTM walkability, surface visibility, first-person route knowledge, and authored reconstruction as separate layers with separate confidence. |
| GPS and game space drift apart                            | Preserve the projected CRS and invertible local transform from the first build.                          |
| Legacy data quietly returns                               | Runtime schema validation rejects the mismatched v1 boundary and arbitrary vertical normalization.       |
| Terrain is accurate but the festival feels false          | Field observation and fictional festival systems drive the experience above the ground.                  |
| Web runtime cannot sustain density                        | Profile the vertical slice before an engine move. The offline package is engine-neutral.                 |
| Recognizable setting is mistaken for official affiliation | Use a neutral title and fictional event identity; omit marks and official copy.                          |
| Public source changes upstream                            | Build from the checked source lock and content hashes; refresh only as an explicit migration.            |

## Explicit non-goals for the foundation

- a legal boundary survey;
- a year-specific reconstruction of Kinetic Fire;
- photorealistic automatic reconstruction from one aerial image;
- live multiplayer attendee tracking;
- a complete festival economy;
- a mobile GNSS adapter before the desktop walking slice works;
- choosing a permanent engine before measured terrain and the experience slice are proven.

## Acceptance criteria for this implementation

The geospatial foundation is ready to hand to scene production when:

1. the task and spec are named Flow Fest Sim;
2. the current shared owners and legacy failures are recorded with evidence;
3. the source lock selects exact USGS DEM, lidar, and NAIP inputs;
4. all selected source files have byte counts and SHA-256 values;
5. the build emits a 1,025 × 1,025 one-meter DTM with no missing samples;
6. the manifest records EPSG:26916, NAVD88, origin, axes, units, bounds, source dates, and hashes;
7. runtime sampling preserves one meter of source relief as one game meter;
8. corner, center, axis, binary-length, checksum, and invalid-legacy tests pass;
9. north-up hillshade, DTM/imagery registration, lidar/imagery registration, both terrain sections, and the validation report have been inspected;
10. Opus 5 independently reviews both the initial architecture and the finished diff, and accepted findings are incorporated;
11. no unrelated worktree changes are touched.

## Evidence available at specification time

- The checked legacy JSON declares a `467.5 × 444.0 m` world but its 21 boundary points span `1126.35 × 415.11 m`.
- Its elevation range is `23.60 m`, while the runtime maps that relief to `40` world meters, a `1.6949×` exaggeration.
- The importer calculates bounds from the mismatched boundary and ignores `worldDimensions`.
- The legacy 512 × 512 height field has only 237 unique values, and more than 82% of horizontal and vertical neighbors are identical, consistent with data far coarser than the requested grid.
- The current `satelliteImagery` feature flag has no terrain-image consumer.
- The TNM API returns two 2021 Ohio Phase 3 one-meter DEM tiles across the site seam and current Ohio Phase 3 lidar tiles published in 2025.
- The NAIP Plus catalog returns one 2023 0.3 meter four-band source at the anchor.

These facts justify replacing the foundation rather than polishing the old data.
