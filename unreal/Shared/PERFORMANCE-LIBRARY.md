# Shared performance library and transfer

Composer owns the editable score. A native game can play a score only when its
matching body animation and prop track have been prepared and verified for that
character and prop family. A missing match must say that preparation is required.
It must never substitute an A/B routine.

## Version 1 wire contract

`Content/Data/performance-library.json` contains:

```json
{
  "schema": "tka-performance-library-v1",
  "entries": [{
    "id": "x-bot/M_example",
    "characterId": "x-bot",
    "profile": "M_example",
    "propFamily": "staff",
    "title": "Example",
    "sequenceSHA256": "64 lowercase hexadecimal characters",
    "sequenceJson": "canonical JSON containing the complete SequenceData",
    "durationSeconds": 8,
    "scoreUnitsPerSecond": 2
  }]
}
```

Only sealed performance bundles are eligible. The library exporter first runs
the existing bundle verifier, then checks the full captured sequence against its
provenance hash. Unchanged legacy clips remain playable through their existing
game controls but are not advertised as exact Composer matches.

The clipboard/file transfer used in both directions is:

```json
{
  "schema": "tka-performance-transfer-v1",
  "sequenceSHA256": "64 lowercase hexadecimal characters",
  "sequenceJson": "canonical JSON containing the complete SequenceData",
  "selection": { "characterId": "x-bot", "propFamily": "staff" },
  "playback": { "phase": 0, "rate": 1, "paused": false }
}
```

`selection` is optional when Composer has not selected a native performer.
`playback` is required: phase is in [0, 1), rate in [0.5, 1.75], paused is boolean.
The rate is relative to the captured performance, not beats per minute. Transfer
preserves transport intent; opening a sequence for editing does not start playback.

Canonical JSON recursively sorts object keys, preserves array order, and uses
JSON serialization for scalar values. Normalize through JSON first so dates and
optional fields have their actual serialized representation. SHA-256 is computed
over its UTF-8 bytes, using the existing capture-provenance canonicalizer.
Native matching requires BOTH the hash and exact sequenceJson text, plus any
requested selection. Native copy uses the already verified library snapshot.
Multiple matches without a selection must be presented for explicit selection.
An altered snapshot must never play the performance for its claimed hash.

The shared animation instance remains the only native performance clock. Pause,
seek, rate, and restart go through the shared avatar/session API, retaining body,
prop and transition synchronization. Game adapters only choose the target avatar
and open the shared controls.

## Integration

`FFlowArtsPerformancePanel::Open(APlayerController*, UFlowFestAvatarComponent*,
UFlowFestPropComponent*)` opens the shared in-game controls for a target performer.
Museum binds this to F6 near a station. Other games and the standalone native
viewer should supply their target through this same API. The panel is an initial
functional surface; richer viewer rails can use `FFlowArtsPerformanceSession`
directly without introducing another playback clock or transfer format.

`FFlowArtsPerformanceSession` owns selection and delegates pause, seek, rate and
restart to the shared avatar. Its library must outlive the session because the
selected entry refers to that library. A session currently selects prepared
performances for the target's existing character and prop family.

Before cooking, run `node unreal/Shared/Tools/performance-library.mjs build
--project <project>`. After staging, run its `verify` command with the same project
and `--packaged-data <Content/Data>` to check the packaged library bytes.

Composer's viewer Share panel copies a transfer. In either native game, paste it
through the shared controls. Native Copy to Composer preserves the exact score
snapshot and transport state; paste it on Composer's `/performance` page to
inspect and explicitly open the score for editing. Downloaded transfer files can
also be opened on that page. Native file-picker import is not provided.

Composer retains the verified source snapshot through its initial editor
enrichment and viewer hydration. Each hydration boundary advances the baseline
only when the incoming score still matches the previous complete editor snapshot.
An unchanged score copies back with its original identity, selection and transport
intent; edits, including duration and metadata changes, produce a new identity.
An enrichment failure cannot silently reuse an unverified snapshot.

Version 1 does not bake arbitrary new scores inside a running game. A changed
score needs the existing capture/import/bundle preparation pipeline before it
can match a prepared performance. Snapshot verification currently targets the
Windows native builds, using the platform SHA-256 provider.
