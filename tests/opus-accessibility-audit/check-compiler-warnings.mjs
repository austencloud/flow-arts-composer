/**
 * Svelte compiler warning check for the components this audit touched.
 *
 * Why this exists separately from `svelte-check`: `svelte-check` reported
 * "0 errors and 0 warnings" for a file that the Svelte compiler was in fact
 * warning about (`a11y_interactive_supports_focus` on FilterChipBase's
 * listbox). Compiler a11y warnings did not surface through that path here, so
 * an a11y change cannot be cleared by `svelte-check` alone. This asks the
 * compiler directly.
 *
 * Usage (exits non-zero if any warning is emitted):
 *   node tests/opus-accessibility-audit/check-compiler-warnings.mjs
 *   node tests/opus-accessibility-audit/check-compiler-warnings.mjs path/to/Other.svelte
 */
import { compile } from "svelte/compiler";
import { readFileSync } from "node:fs";

/** Every .svelte file the audit's implementation modified or added. */
const DEFAULT_TARGETS = [
  "src/lib/shared/foundation/ui/Drawer.svelte",
  "src/lib/shared/foundation/ui/DrawerKeyboardTestHarness.svelte",
  "src/lib/shared/browse/components/filter-chips/FilterChipBase.svelte",
  "src/lib/shared/browse/components/filter-chips/FilterChipDropdownTestHarness.svelte",
  "src/lib/shared/browse/components/filter-chips/LengthFilterChip.svelte",
  "src/lib/shared/browse/components/filter-chips/LevelFilterChip.svelte",
  "src/lib/shared/browse/components/filter-chips/LOOPFilterChip.svelte",
  "src/lib/shared/browse/components/filter-chips/MaxTurnIntensityFilterChip.svelte",
  "src/lib/features/browse/gallery-home/GalleryFilterSheet.svelte",
];

const targets = process.argv.slice(2);
const files = targets.length > 0 ? targets : DEFAULT_TARGETS;

let total = 0;
for (const file of files) {
  const { warnings } = compile(readFileSync(file, "utf8"), {
    filename: file,
    generate: "client",
  });
  for (const warning of warnings) {
    total++;
    console.log(
      `${file}:${warning.start?.line ?? "?"}  ${warning.code}  ${warning.message}`
    );
  }
}

console.log(`${total} compiler warning(s) across ${files.length} file(s)`);
process.exit(total > 0 ? 1 : 0);
