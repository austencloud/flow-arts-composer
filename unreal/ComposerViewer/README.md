# Composer native viewer host

This UE 5.8 host renders Composer's scene through its existing web rail. The Web
and Unreal buttons switch the shared `Viewer3DCanvas`, including `/stage` and
the sequence viewer. Composer retains the cast, selection, placement, settings,
choreography, and transport. It is a consumer of `../Shared/FlowArtsRuntime`; the runtime
and native asset package paths remain unchanged. Pixel Streaming 2 uses its
installed engine plugin. [bridge-v1.md](bridge-v1.md) defines command and result
messages over `UIInteraction` and `Response`.

The host expects the verified editable native bundle's `Content/FlowFest` at
`/Game/FlowFest`, its `Content/Data/props.json`, and its
`Content/Data/PropMotion/ch01_P_staff_A.json` and `ch01_P_fan_A.json` at their same relative paths. Stage them in a task-owned
external copy of this project. Do not generate, recapture, or rename these
assets. The source bundle is `E:/FlowFestEmbodiment58/Project`.

The stage supports up to eight performers from the installed character and prop
catalogs. Composer captures motion with its production performer generator, then
transfers it to the shared native runtime. Up to eight captures are cached for
the browser page, including across renderer switches; changing choreography,
effort, planes, character, or prop geometry
requires another capture. Playback and seeking follow Composer's transport.
Staging generates `runtime-rigs.json` from the exact source rigs to validate imports.
The shared Web scene and native capture use the same prop-authoritative contact
solver. The Web worker renderer remains unavailable for this mode until it can
reproduce that solver; the Web scene uses its main-thread renderer.

The native environment is currently the studio. Web environment settings remain
in Composer and return when switching to Web. Uniform none, fire, and LED effects
follow the same performer controls. Mixed hand props/effects and charcoal require
Web until the shared native runtime supports them. The standalone `/test/unreal-viewer`
still supports its prepared practice loops. Unsupported installed assets report
an error without replacing Composer's authored state.

For an isolated compiled preview, build the task commit with the existing local
product preview mode. In PowerShell, set `$env:TKA_LOCAL_PRODUCT_PREVIEW = '1'`
and run `pnpm exec vite build` from its worktree. This skips public-page
prerendering while producing the Cloudflare worker. If building on another
machine, copy both `.svelte-kit/cloudflare` and `.svelte-kit/cloudflare-tmp`,
plus `.svelte-kit/output/server`: the worker imports the generated server
through those directories. Copy locally ignored `static/models/avatars` into
`.svelte-kit/cloudflare/models/avatars` when those assets are needed. Keep the
generated directory layout intact. Then run
`node scripts/composer-unreal-preview.mjs --port 4188` from the worktree. The
preview serves the compiled app through a local Wrangler backend, shares the
dev server's host recovery handler, and forwards Pixel Streaming on the same
origin.

The host connects its default streamer to the local signalling endpoint with
`-PixelStreamingConnectionURL=ws://127.0.0.1:18888`. The browser connects to
the player endpoint through Composer's same-origin `/unreal-stream` proxy.
