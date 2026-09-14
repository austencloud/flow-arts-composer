# Shape Engine for Android

The installed app mounts the same `ShapeMatrixApp.svelte` that Flow Arts
Composer and the public `/shape-engine` page use. This directory owns only
the standalone host, native packaging, and launcher artwork. Pattern math,
animation, interactions, and the interface remain shared.

Android package: `com.tkaflowarts.shapeengine`. It installs alongside
`com.tkaflowarts.composer` with its own saved settings.

## Build

Install the repository's normal workspace dependencies first. From the
repository root:

```powershell
node scripts/svelte-kit-sync-if-needed.mjs
npm --prefix apps/shape-engine run build
npm --prefix apps/shape-engine run android:sync
```

Then use JDK 21 and Android SDK 36 to build
`apps/shape-engine/android/gradlew.bat --no-daemon assembleDebug` from that
Android directory. Set `JAVA_HOME` and `ANDROID_HOME` to the local installations,
or provide the SDK in the ignored `android/local.properties` file.

The sideloadable APK is written to
`android/app/build/outputs/apk/debug/app-debug.apk`.

## Shared releases

Changes to the shared component are included in both hosts' next builds. An
installed APK contains a bundled version: publishing the website does not
silently update that APK. Rebuild and install an update to deliver shared changes
to the Android app. No second implementation or manual feature copying is needed.

The bundle includes its fonts, pattern data, prop art, and renderer assets for
offline use. About's references open the public website. Shared pattern links
use the public `/shape-engine` address rather than a device-local address.

## Artwork

`assets/icon-source.png` is the current packaging source.
`node scripts/prepare-icons.mjs` prepares all Android launcher density resources.
The four full-resolution alternatives are in `assets/options/`; `review.html`
is a local comparison sheet with large and launcher-size previews.

These images were generated using the built-in image-generation tool. The
directions were luminous rosette, flat geometric rosette, satin woven trefoil,
and orbital rosette with two moving endpoints. All use cobalt blue and vermilion
red on midnight navy, with no text and an uncluttered silhouette.
