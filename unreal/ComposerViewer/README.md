# Composer native viewer host

This UE 5.8 host provides the first prepared performer for Composer's existing
web rail. It is a separate consumer of `../Shared/FlowArtsRuntime`; the runtime
and native asset package paths remain unchanged. Pixel Streaming 2 uses its
installed engine plugin. [bridge-v1.md](bridge-v1.md) defines command and result
messages over `UIInteraction` and `Response`.

The host expects the verified editable native bundle's `Content/FlowFest` at
`/Game/FlowFest`, its `Content/Data/props.json`, and its
`Content/Data/PropMotion/ch01_P_staff_A.json` and `ch01_P_fan_A.json` at their same relative paths. Stage them in a task-owned
external copy of this project. Do not generate, recapture, or rename these
assets. The source bundle is `E:/FlowFestEmbodiment58/Project`.

The first stage supports one `ch01` performer with staff or fan, placement,
selection, camera control, and prepared loop pause, resume, restart and rate.
Staff has sealed family proof; fan is a legacy prepared family loop. Neither
represents an arbitrary Composer score. Unsupported identities return the
previous confirmed scene state with an explicit error.

The host connects its default streamer to the local signalling endpoint with
`-PixelStreamingConnectionURL=ws://127.0.0.1:18888`. The browser connects to
the player endpoint through Composer's same-origin `/unreal-stream` proxy.
