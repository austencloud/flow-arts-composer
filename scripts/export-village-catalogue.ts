/**
 * Writes the village's finite sequence catalogue as plain JSON: every id the
 * sim can name, its parent seed and transform, and its word and steps, so an
 * engine without the TKA sequence code (Unreal) can bake one clip per id.
 *
 *   npx tsx scripts/export-village-catalogue.ts [out.json] [--preset museum]
 *
 * Defaults to printing to stdout with the base rules.
 */

import { writeFileSync } from "node:fs";
import { loadVillageRules } from "../src/lib/features/village/domain/village-rules";
import { exportVillageCatalogue } from "../src/lib/features/village/services/village-sequence-catalogue";

const args = process.argv.slice(2);
const presetFlag = args.indexOf("--preset");
const preset = presetFlag >= 0 ? args[presetFlag + 1] : undefined;
const outPath = args.find((arg, i) => !arg.startsWith("--") && args[i - 1] !== "--preset");

const catalogue = await exportVillageCatalogue(loadVillageRules(preset));
const json = JSON.stringify(catalogue, null, "\t") + "\n";
if (outPath) {
	writeFileSync(outPath, json);
	console.log(`Wrote ${catalogue.entries.length} sequences to ${outPath}`);
} else {
	process.stdout.write(json);
}
