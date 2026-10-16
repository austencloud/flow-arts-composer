# Native performance bundles

Run capture and conversion from the source repository, with dependencies installed. Run long capture and Blender jobs on d2. Run Unreal jobs there when Unreal is installed; otherwise use the project's local fallback and resource limits. The same Flow Arts Composer production performer and static capture build produce raw clips for Flow Fest and Museum Game; each game has its own capture runner, manifest, and native project output.

## Capture the source

From the repository root, build the static capture page. Vite writes `unreal/FlowFest/Intermediate/native-capture-static/native-capture-build.json`, which identifies the source and built output bytes. The static runner checks that receipt against the files it serves. A normal dev server has no build receipt and cannot supply verified captures.

```powershell
pnpm exec vite build --config unreal/FlowFest/Tools/native-capture.vite.config.mjs
node unreal/FlowFest/Tools/native-capture-static-runner.mjs unreal/FlowFest/Saved/PerformanceCaptures-v3
$env:FLOW_FEST_CAPTURE_FAMILY_MODE = '1'
node unreal/FlowFest/Tools/native-capture-static-runner.mjs unreal/FlowFest/Saved/PerformanceCaptures-v3
Remove-Item Env:FLOW_FEST_CAPTURE_FAMILY_MODE
```

The default Flow Fest pass writes `manifest.json`; family mode writes `family-manifest.json` and sequence snapshots. For a bounded family pass, set comma-separated `FLOW_FEST_CAPTURE_CHARACTERS`, `FLOW_FEST_CAPTURE_FAMILIES`, or `FLOW_FEST_CAPTURE_VARIANTS` before the family-mode command. `FLOW_FEST_CAPTURE_RIDE_ONLY=1` applies to the default pass and cannot be combined with family mode. Clear filters after the run. A subset is for repair or diagnosis, not a complete production set.

Museum Game uses the same static build and runner server, with its authored manifest and its own raw directory. Generate the manifest first; `build-export.mjs` writes it under the Museum project's `Content/Data`:

```powershell
node unreal/MuseumGame/Tools/build-export.mjs
node unreal/FlowFest/Tools/native-capture-static-runner.mjs unreal/MuseumGame/Saved/PerformanceCaptures --runner unreal/MuseumGame/Tools/capture-performances.mjs --manifest unreal/MuseumGame/Content/Data/museum-performances.json
```

Raw JSON carries the sequence, mounted rig and prop identity, explicit motion options and clock, plus the build ID and byte hashes. The capture runners resume only when the existing clip still matches those inputs. Keep the raw directory, sequence snapshots, and static build receipt together as capture evidence; an older raw file without valid provenance must be recaptured.

## Prepare, convert, import, and seal

`bootstrap.ps1` runs the native stages in order. For Flow Fest, pass the source repository root and, if moved, the raw directory:

```powershell
$repo = (Resolve-Path .).Path
powershell.exe -NoProfile -ExecutionPolicy Bypass -File unreal/FlowFest/Tools/bootstrap.ps1 -SourceRoot $repo -CaptureDirectory unreal/FlowFest/Saved/PerformanceCaptures-v3
```

Flow Fest calls `prepare-characters.mjs` for decoded rigs and body GLBs, Blender `convert-characters.py` for FBX, `prepare-prop-motion.mjs` for compact prop tracks, then Unreal `import-characters.py`. The body, FBX, and imported `.uasset` each receive a `.performance.json` receipt. The bootstrap seals the imported clips into `Content/Data/performance-bundles.json` after import.

Museum Game requires Flow Fest's staged character assets and its own authored captures. Its bootstrap calls the same character, prop-motion, Blender character converter, Unreal character importer, and bundle sealer with Museum project and manifest options:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File unreal/MuseumGame/Tools/bootstrap.ps1 -SharedProject unreal/FlowFest -CaptureDirectory unreal/MuseumGame/Saved/PerformanceCaptures
```

Both bootstraps accept `-EngineRoot`, `-BlenderExe`, and `-CompilerVersion`. Flow Fest also accepts `-SkipAssetGeneration`, `-SkipBuild`, and `-SkipImport`; Museum accepts `-SkipExport`, `-SkipBuild`, and `-SkipAssets`. Use a skip switch only when the skipped stage's required outputs already exist. The explicit seal command is `node unreal/Shared/Tools/performance-bundle.mjs seal --project <project>`; Museum's bootstrap also supplies `--captures`, `--converter`, and `--importer` because those paths differ from Flow Fest defaults. `seal` checks the raw-to-body-to-FBX-to-import receipt chain, prop track, and catalog before writing the bundle index.

## Existing native assets and package verification

For a project whose older imported performances have no trustworthy raw source, run `node unreal/Shared/Tools/performance-bundle.mjs baseline --project <project>` **once, before replacing its prop tracks or imported assets**. This freezes the current listed clips' prop and `.uasset` byte hashes and catalog in `Content/Data/performance-legacy-baseline.json`. The command refuses to overwrite an existing baseline. Its `provenanceStatus` is `unavailable`: it preserves an unchanged legacy asset, but does not assert where its motion came from. A newly recaptured and sealed clip can then replace a baseline entry; never manufacture capture provenance for old assets.

Run `node unreal/Shared/Tools/performance-bundle.mjs verify --project <project>` after sealing. Verification requires each listed performance to be either a sealed bundle whose raw, body, FBX, import, prop and catalog hashes still match, or an unchanged frozen legacy entry. The project package scripts run this check before Unreal packaging and repeat it against staged data afterward:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File unreal/FlowFest/Tools/package.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File unreal/MuseumGame/Tools/package.ps1
```

For an existing package, the direct data check is `node unreal/Shared/Tools/performance-bundle.mjs verify --project <project> --packaged-data <package-Content/Data>`. The bundle proves byte lineage and identity. Its `collision`, `contact`, and `continuity` evidence fields are `not-evaluated`; use separate native playback or visual tests for those behaviors.

When moving a build from d2 to d1, preserve each Unreal project directory layout and transfer its `Saved/PerformanceCaptures*`, `Tools/staged/Characters`, `Content/Data`, imported character `.uasset` files, and adjacent `.performance.json` receipts together. Bundle paths are relative to the project root, and body receipts point to raw captures relative to the body file. Keep the source repository version and converter/importer scripts used for sealing available; a changed converter or preparer invalidates its receipt. Run `verify --project` at the destination before packaging. Do not edit receipt paths or hashes to make a partial transfer pass.
