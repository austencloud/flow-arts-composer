# Shared Unreal foundation

Museum Game and Flow Fest use Composer as the source for characters, props, sequences, and performed motion. This agreement was established between the two game agents on October 15, 2026. Changes to that boundary belong here and in the shared tools before either game adds its own implementation.

## Ownership and current status

| Capability | Canonical owner | Native adoption |
| --- | --- | --- |
| Character definitions and source rigs | `@austencloud/scene-3d`, production `AVATAR_DEFINITIONS`; source GLBs in `static/models/avatars/_optimized` | Both games consume `Tools/character-catalog.mjs`, which evaluates the actual export. |
| Prop families, builds, finishes, handed geometry | `src/lib/shared/3d/domain/scene-prop-catalog.ts` and Composer's existing scene-3d prop implementation | Flow Fest produces the generated equipment. Museum copies the shared bundle with hashes, retaining its package paths. |
| Sequence generation and semantics | `@tka/sequence-engine` (`packages/sequence-engine`) and Composer playback | Export/capture through those owners. A second sequence engine in C++ is outside this migration. |
| Performed body pose, wrist targets, prop motion | Composer's performer and capture pipeline | `Tools/motion-contract.mjs` owns family clip acceptance. Flow Fest owns conversion until extraction. |
| Native skeletal playback, equipment, grip IK, synchronized clock and transitions | `FlowArtsRuntime/Source/FlowArtsRuntime` | Both games depend on this runtime plugin. It contains the avatar, animation, prop and footstep components. |
| Camera, locomotion and rendering | Composer's existing scene-3d/camera packages define browser behavior; Unreal supplies native rendering and movement | Reuse native mechanisms as they stabilize; web packages are source/capture dependencies, not directly executable Unreal modules. Engine settings and performance evidence must be agreed before promising equivalent visuals. |
| Environments, interaction and progression | Each game | Museum rooms, exhibits and saves; festival terrain, crowds and story remain game-owned. |

The runtime is `unreal/Shared/FlowArtsRuntime/FlowArtsRuntime.uplugin`, module `FlowArtsRuntime`. `SOURCE-PROVENANCE.json` records the extraction's original source hashes. The `UFlowFest*` reflected class names remain for compatibility; the exported module macro is `FLOWARTSRUNTIME_API`. Flow Fest redirects its former module classes to the plugin and removes its duplicate implementation. Museum instantiates these same components in its station actors.

## Character catalog

Both games must obtain native character identities from `Tools/character-catalog.mjs` rather than parsing TypeScript with regular expressions or maintaining another roster. `loadDeployedCharacters(sourceRoot)` returns ordered `{ id, name, key, modelPath, sourceRelativePath }` records. `key` replaces hyphens with underscores for existing native names. Local evaluation characters are excluded and duplicate IDs/key collisions are rejected.

`createCharacterManifest(sourceRoot)` records schema `flow-arts-native-characters-v1`, scene-3d package version, catalog path and the SHA-256 of the exact catalog source evaluated. This hash covers the catalog file, not the entire package or GLBs. Keep the repository's lockfile and package patches together with captures.

```powershell
node unreal/Shared/Tools/character-catalog.mjs --source-root . --output unreal/MuseumGame/Saved/Performers/characters.json
```

The deployed catalog currently contains 16 characters. Museum's authored capture manifest selects x-bot for its animated stations; its two unsequenced figures use the existing static assets.

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

## Authored Museum routines

Museum exports `Content/Data/museum-performances.json`, schema `museum-native-performances-v1`. Its 31 sequenced stations reference 25 unique authored sequences. Profiles are `M_<sequence_id_with_underscores>`; identical sequence IDs reuse a capture. The capture API accepts the exact sequence payload and uses its summed step duration at 30 fps. Family profiles retain their 16-step/480-frame requirement.

The common production capture scene and existing Flow Fest conversion/import tools handle both manifests. Museum does not implement its own sampler, skeletal conversion, wrist solver or prop-coordinate math. Its native clips and compact tracks retain the existing `/Game/FlowFest` mount and `flow-fest-*` formats. Museum package checks verify the complete station-to-clip mapping.

One telekinetic formation hides the shared rig while displaying its synchronized props. Two figures have no authored sequence. Room-specific console transforms and village simulation remain separate migration work; station captures preserve the authored bound routines.

## Coordination

1. Museum owns the authored station adapters, manifest and capture hooks; Flow Fest owns its game consumer and ongoing cross-rig runtime repairs.
2. Shared files have one active owner per change. Exchange scoped commits before either consumer changes a shared format or API.
3. Preserve `/Game/FlowFest/...` references until an explicit Unreal migration can update and verify them; filesystem-renaming `.uasset` files is not a migration.
4. Verify placement, character/equipment identity, loop timing, wrists, mirrored props and playback controls in both consumers.

Game-specific work can proceed in parallel. Shared files have one active owner per change. Serialize native builds/imports, and coordinate heavy captures and Blender conversion on d2. The current native baseline is UE 5.8.3 with MSVC 14.50.35717; use the projects' existing scripts and bounded parallelism.

## Focused verification

```powershell
npx vitest run --config tests/config/vitest.config.ts tests/unit/unreal/native-character-catalog.test.ts tests/unit/unreal/native-motion-contract.test.ts
```

These tests exercise catalog evaluation/identity/provenance and silent capture failures: wrong family/rig/routine, stale revision, incompatible basis, incorrect timing, malformed frames/quaternions and source substitution. They do not establish native animation or visual parity. A finalized x-bot/staff/A v3 capture has also passed the CLI with its raw hash verified; the obsolete pilot was rejected.
