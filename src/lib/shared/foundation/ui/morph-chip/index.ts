/**
 * MorphChip Primitives
 *
 * Reusable morphing chip components with smooth spring animations.
 *
 * @example
 * ```svelte
 * <script>
 *   import { MorphChipGroup, MorphChip } from "#lib/shared/foundation/ui/morph-chip/index.js";
 *
 *   let dashes = $state("Mixed");
 *   const options = [
 *     { value: "Smooth", label: "Smooth" },
 *     { value: "Mixed", label: "Mixed" },
 *     { value: "High", label: "High" },
 *   ];
 * </script>
 *
 * <MorphChipGroup>
 *   <MorphChip id="dashes" label="Dashes" bind:value={dashes} {options} />
 * </MorphChipGroup>
 * ```
 */

export { default as MorphChip } from "./MorphChip.svelte";
export { default as MorphChipGroup } from "./MorphChipGroup.svelte";
export type {
	MorphChipProps,
	MorphChipGroupProps,
	MorphChipOption,
	MorphChipContext,
} from "./types";
