/**
 * Write the fire jam layout for Unreal. The browser imports the same module, so the
 * rope, the stations, the chairs and the performers stand in the same places in both
 * engines. Metres, x east, z south: the frame of `site.json`.
 *
 * Output goes in the Jam workstream's own folder of the shared content store, never in
 * `Content/Data`, which other runs treat as read-only.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildFlowFestJamLayout } from "../../../src/lib/features/flow-fest-sim/domain/flow-fest-jam-layout";

const here = dirname(fileURLToPath(import.meta.url));
const outputDir = resolve(here, "../Content/FlowFest/Assets/Jam/Data");

const layout = buildFlowFestJamLayout();
await mkdir(outputDir, { recursive: true });
await writeFile(
  join(outputDir, "jam-layout.json"),
  `${JSON.stringify(layout, null, 2)}\n`
);
console.log(
  `Exported the jam: ${layout.perimeterMeters.toFixed(1)} m of rope, ${layout.stations.length} safety stations, ` +
    `${layout.dressing.length} edge pieces, ${layout.spectators.length} spectator spots, ${layout.performers.length} fire spinners inside and ${layout.outsideSpinners.length} LED spinners outside to ${outputDir}`
);
