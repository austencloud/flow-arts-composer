<script lang="ts">
	/**
	 * Realm Destination - Campground clearing with procedural forest
	 *
	 * Spawn in a grassy meadow with fire pit, tent, and log seating.
	 * Walk out into procedurally generated forest terrain.
	 */

	import WorldScene from "#lib/shared/3d/procedural-engine/components/WorldScene.svelte";
	import { PERFORMANCE_STAGE_CONFIG } from "#lib/shared/3d/procedural-engine/core/world-definitions.js";
</script>

<WorldScene realmConfig={PERFORMANCE_STAGE_CONFIG} />
