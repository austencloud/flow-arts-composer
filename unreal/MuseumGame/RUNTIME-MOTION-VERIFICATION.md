# Runtime motion verification

Recorded October 18, 2026, against the staged Unreal Engine 5.8 project at
`E:/MuseumRuntimeMotion58/Project`. This evidence covers X-Bot with the physical
Fire Staff (`fire_double_staff:default`). The Composer workflow is **Download
game motion**, then F6 and the downloaded `.motion.json` path in Museum. Each
edit needs a new download; the executable does not need rebuilding. A motion
file has sampled movement and score data, but no pictograph atlas, so the
preview has no score board.

## Cooked source parity

The 16-second, 480-frame physical Fire Staff B capture was converted to both
the runtime file and cooked `P_fire_double_staff_B` profile. The parity test
compares source bone and prop transforms before stance and collision adjustments
at 1,922 times across the full loop, including fractional frames and the seam
(99,944 bone comparisons). The original limits were kept.

| Measure | Maximum observed | Limit |
| --- | ---: | ---: |
| Body joint position | 0.389677 cm, `LeftForeArm` at 15.995833 s | 0.500 cm |
| Body joint rotation | 0.210120°, `LeftToeBase` at 5.500000 s | 1.000° |
| Prop root position | 0.000015 cm | 0.050 cm |
| Prop root rotation | 0.000000° | 0.100° |
| Prop tip position | 0.000015 cm | 0.100 cm |

The maximum body position error on keys was 0.241960 cm; between keys it was
0.389677 cm. After final pose evaluation, the test observed left and right
prop root offsets of 1.5000 and 1.4416 cm at 10 s. Those stance, collision,
and entry effects are reported separately from the raw parity assertions.

- Runtime source: `Saved/Performances/parity-fire-staff.motion.json`, file SHA-256 `20eb4a6507d77a620e56316262a4d0af0cd74a44fd5de04afef5433b9b5966db`, sequence SHA-256 `f6c435e93bd559e54c5e211339f4b0296a7740d3a68b2d7cf986484ce4ddb807`.
- Raw capture SHA-256: `af9de7fff602c12b28d494946a430a7f36ea5cba14ea178d6a385056c1c03890`.
- Cooked animation: `Content/FlowFest/Characters/x_bot/A_Flow_P_fire_double_staff_B.uasset`, SHA-256 `f5d2b7dd0d6c764ef5e9715176d9c6f1d8c7f05eeb4171a3546fd752b2e33165`.
- Cooked prop motion: `Content/Data/PropMotion/x_bot_P_fire_double_staff_B.json`, SHA-256 `a30160f0d34a8f274211155ce1e9fcaf19e605d05664fb6dc54c48e1f42e74f0`; its source and capture hashes match the raw capture.
- Shared sampler commit: `1477b0f87f3dd6b7a7f9b083e8a594bd1b7b833d` (parent-space interpolation of captured bones).

## Native checks

These focused automation runs succeeded. Paths below are relative to
`E:/MuseumRuntimeMotion58/Project/Saved`.

| Test | Log | Automation report |
| --- | --- | --- |
| `FlowArts.Runtime.PortableMotion.CookedParity` | `Logs/CookedParity-local-hierarchy-20261018.log` | `Automation/CookedParity-local-hierarchy-20261018/index.json` |
| `FlowArts.Runtime.PortableMotion.LocalHierarchyInterpolation` | `Logs/LocalHierarchy-20261018.log` | `Automation/LocalHierarchy-20261018/index.json` |
| `FlowArts.Runtime.ImportedMotion.ActualRig` | `Logs/ImportedMotion-20261018.log` | `Automation/ImportedMotion-20261018/index.json` |
| `FlowArts.Runtime.PortableMotionRetarget` | `Logs/Retarget-20261018.log` | `Automation/Retarget-20261018/index.json` |
| `FlowArts.Museum.RuntimeMotion.Replacement` | `Logs/MuseumReplacement-20261018.log` | `Automation/MuseumReplacement-20261018/index.json` |

The replacement run loaded these two genuine Composer UI downloads on the same
performer in the same world:

| Export | File SHA-256 | Sequence SHA-256 | Duration |
| --- | --- | --- | ---: |
| `Saved/Performances/composer-ui-A.motion.json` | `9db5c0fbd467b23ee8b909b0205fb58ca4335b9191f9c14624720e3084f1fb56` | `289cc91516f90b4a16edbce827aec7f8f4ae13e58f9fee5320bec63634c81602` | 8 s |
| `Saved/Performances/composer-ui-B.motion.json` | `da5b7a2e02c2c2bfbdd07021832527b60a3cdda598ff2956563e15f0ef4ecf88` | `726bf6014dc1375b9f1cb26d08fc9e484e1bd8041d2c17f792da5791f8894cb4` | 3 s |

The automation report records `Success` with one expected warning: it rejects
an intentionally missing motion file between A and B, preserves A, then loads B
without rebuilding the world or performer. The native B view was inspected at
`Saved/ExhibitReview/Hero-20261018-193214/HighresScreenshot00001.png`; the
adjacent `Saved/ExhibitReview/Hero-20261018-193214.json` receipt names the B
file and its exact SHA-256. The native build log is
`Saved/Logs/MuseumGameEditor-local-hierarchy-20261018.log`. Built DLL hashes:

- `Binaries/Win64/UnrealEditor-FlowArtsRuntime.dll`: `7ce2c33c0f76b9557126c2b98e447406abc1914901af2b86571a6810fad4b3bd`
- `Binaries/Win64/UnrealEditor-MuseumGame.dll`: `71e1371e46c0cab137867443a76f62700bf83865cb6aa17a7ec16320e343d809`

**Pending:** the final Flow Fest runtime test on the genuine A and B exports.
