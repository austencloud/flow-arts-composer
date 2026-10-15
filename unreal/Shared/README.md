# Shared Unreal foundation

Museum Game and Flow Fest use Composer as the source for characters, props, sequences, and performed motion. This agreement was established between the two game agents on October 15, 2026. Changes to that boundary belong here and in the shared tools before either game adds its own implementation.

## Ownership and current status

| Capability | Canonical owner | Native adoption |
| --- | --- | --- |
| Character definitions and source rigs | `@austencloud/scene-3d`, production `AVATAR_DEFINITIONS`; source GLBs in `static/models/avatars/_optimized` | `Tools/character-catalog.mjs` evaluates the actual export. Museum consumes it; Flow Fest adoption is assigned to its agent. |
| Prop families, builds, finishes, handed geometry | `src/lib/shared/3d/domain/scene-prop-catalog.ts` and Composer's existing scene-3d prop implementation | Flow Fest owns the current capture/conversion pipeline and generated equipment. Museum will reuse those assets. |
| Sequence generation and semantics | `@tka/sequence-engine` (`packages/sequence-engine`) and Composer playback | Export/capture through those owners. A second sequence engine in C++ is outside this migration. |
| Performed body pose, wrist targets, prop motion | Composer's performer and capture pipeline | `Tools/motion-contract.mjs` owns family clip acceptance. Flow Fest owns conversion until extraction. |
| Native skeletal playback, equipment, grip IK, synchronized clock and transitions | Currently `unreal/FlowFest/Source/FlowFest/FlowFestAvatarComponent`, `FlowFestAnimInstance`, and `FlowFestPropComponent` | Flow Fest agent will extract the stabilized implementation into the shared runtime. Museum will consume it. |
| Camera, locomotion and rendering | Composer's existing scene-3d/camera packages define browser behavior; Unreal supplies native rendering and movement | Reuse native mechanisms as they stabilize; web packages are source/capture dependencies, not directly executable Unreal modules. Engine settings and performance evidence must be agreed before promising equivalent visuals. |
| Environments, interaction and progression | Each game | Museum rooms, exhibits and saves; festival terrain, crowds and story remain game-owned. |

The agreed runtime destination is `unreal/Shared/FlowArtsRuntime/FlowArtsRuntime.uplugin`, module `FlowArtsRuntime`. **That plugin has not been extracted yet.** This directory currently contains shared tooling and the contract. Museum's native performers are still static; sharing a catalog does not provide animated playback.

## Character catalog

Both games must obtain native character identities from `Tools/character-catalog.mjs` rather than parsing TypeScript with regular expressions or maintaining another roster. `loadDeployedCharacters(sourceRoot)` returns ordered `{ id, name, key, modelPath, sourceRelativePath }` records. `key` replaces hyphens with underscores for existing native names. Local evaluation characters are excluded and duplicate IDs/key collisions are rejected.

`createCharacterManifest(sourceRoot)` records schema `flow-arts-native-characters-v1`, scene-3d package version, catalog path and the SHA-256 of the exact catalog source evaluated. This hash covers the catalog file, not the entire package or GLBs. Keep the repository's lockfile and package patches together with captures.

```powershell
node unreal/Shared/Tools/character-catalog.mjs --source-root . --output unreal/MuseumGame/Saved/Performers/characters.json
```

Museum's converter regenerates this manifest on every invocation. Its existing importer/runtime still require exactly 16 deployed characters. Generalizing that runtime is part of animated-performer adoption.

## Native family motion contract

Existing `flow-fest-*` schema names remain valid for both games. Renaming formats or Unreal asset paths is a separate migration.

| Field | Required value |
| --- | --- |
| Raw capture schema | `flow-fest-native-performance-v1` |
| Compact schema | `flow-fest-prop-motion-v3` |
| Manifest schema | `flow-fest-prop-motion-manifest-v1` |
| Capture revision | `clock-isolated-body-v3` |
| Family identity | Requested character ID, prop family ID and routine `A` or `B` |
| Profile / filename | `P_<prop>_<routine>` / `<character_key>_<profile>.json` |
| Timing | 30 fps, 480 frames, 16-second cycle |
| Frame layout | 28 finite numbers, with normalized root and visible-body quaternions |
| Provenance | Matching clip/manifest source SHA-256; verify actual raw bytes when available |

Frame offsets are zero-based:

| Offsets | Meaning |
| --- | --- |
| 0–6 / 7–13 | Left / right root position (3) and quaternion (4) |
| 14–16 / 17–19 | Left / right wrist target position |
| 20–23 / 24–27 | Left / right visible-body quaternion |

Prop positions in native Feet space are `(source.z, -source.x, source.y) * 100` centimetres. Root rotation uses the mirrored avatar basis with native mesh X scale `-1`. Visible-body rotation uses reflection-conjugated `inverse(root) * rotatedBodyWorld`; the runtime also applies mesh rest orientation. Skeleton FBX conversion has its own basis. Do not substitute its axis settings for prop conversion. The authoritative conversion remains `unreal/FlowFest/Tools/prepare-prop-motion.mjs` until it is moved with its verification.

The animation instance owns body playback time. Props update after the body in `PostUpdateWork` using the same clock and matching blend state. Hand/wrist solving, mirrored equipment, visible prop rotation and loop transitions must migrate together.

The shared validator API is:

```js
import { familyMotionIdentity, indexMotionManifest, validateFamilyMotion }
  from "../../Shared/Tools/motion-contract.mjs";

const identity = familyMotionIdentity(characterId, propId, routine);
const entries = indexMotionManifest(manifest);
const result = validateFamilyMotion(clip, {
  ...identity,
  manifestEntry: entries.get(`${characterId}/${identity.profile}`),
  sourceBytes, // Optional raw file bytes; omission is reported explicitly.
});
```

`result.sourceHashVerified` is true only when the supplied raw bytes match. Agreement between two metadata fields alone is not a verified source hash. Game wrappers retain checks for their complete asset inventory, terrain and legacy profiles; legacy clips cannot substitute for family captures.

```powershell
node unreal/Shared/Tools/motion-contract.mjs --clip CLIP.json --manifest manifest.json --character x-bot --prop staff --routine A --source-capture RAW.json
```

Current finalized raw captures are under Flow Fest's `Saved/PerformanceCaptures-v3/<character>/`. The older `Saved/PerformanceCaptures` pilot is obsolete. Preserve immutable capture archives and their hashes, and reuse finalized FBX/native outputs across games rather than running a second capture campaign. Changing a file after conversion invalidates its recorded source hash.

## Migration order and coordination

1. Museum owns these shared tools, catalog adoption, tests and this contract. Flow Fest adopts the exported helpers in its game-specific tools.
2. Flow Fest finishes its current capture/transition repairs and verifies the native performer against those captures.
3. Flow Fest extracts that implementation, conversion/import tools and relevant native tests into `FlowArtsRuntime` and `Shared/Tools`. Game modules depend on that one implementation. Preserve existing `/Game/FlowFest/...` asset references until an explicit Unreal migration can update and verify them; filesystem-renaming `.uasset` files is not a migration.
4. Museum replaces its static stations with shared performers and the same generated asset bundle. Verify station placement, character/equipment identity, start/stop/loop timing, wrists, mirrored props and transitions in Museum as well as Flow Fest.
5. Extend the common runtime for new Composer capabilities through both consumers. Record material format, package, axis or clock changes here and notify the other game agent before changing their boundary.

Game-specific work can proceed in parallel. Shared files have one active owner per change. Serialize native builds/imports, and coordinate heavy captures and Blender conversion on d2. The current native baseline is UE 5.8.3 with MSVC 14.50.35717; use the projects' existing scripts and bounded parallelism.

## Focused verification

```powershell
npx vitest run --config tests/config/vitest.config.ts tests/unit/unreal/native-character-catalog.test.ts tests/unit/unreal/native-motion-contract.test.ts
```

These tests exercise catalog evaluation/identity/provenance and silent capture failures: wrong family/rig/routine, stale revision, incompatible basis, incorrect timing, malformed frames/quaternions and source substitution. They do not establish native animation or visual parity. A finalized x-bot/staff/A v3 capture has also passed the CLI with its raw hash verified; the obsolete pilot was rejected.
