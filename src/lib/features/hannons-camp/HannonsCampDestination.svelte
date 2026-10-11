<script lang="ts">
  /**
   * Flow Fest Sim Earth Destination
   *
   * Meter-true public USGS terrain for the first Flow Fest Sim Earth site.
   *
   * Now uses Threlte-based WorldScene for full avatar parity with
   * Stage and Gallery destinations.
   *
   * The checked manifest and binary field are fetched before WorldScene mounts.
   * A real-terrain destination has nothing truthful to build until both pass
   * their coordinate, length, statistics, and checksum checks.
   */

  import WorldScene from "#lib/shared/3d/procedural-engine/components/WorldScene.svelte";
  import { FLOW_FEST_SIM_CONFIG } from "#lib/shared/3d/procedural-engine/core/world-definitions.js";
  import { loadGeospatialTerrain } from "#lib/shared/3d/procedural-engine/generation/geospatial-terrain.js";

  const terrain = loadGeospatialTerrain(FLOW_FEST_SIM_CONFIG.terrain.dataPath!);
</script>

{#await terrain}
  <div class="terrain-status">Checking Flow Fest Sim terrain…</div>
{:then terrainData}
  <WorldScene realmConfig={FLOW_FEST_SIM_CONFIG} {terrainData} />
{:catch error}
  <div class="terrain-status terrain-status--error">
    Flow Fest Sim terrain failed to load: {error.message}
  </div>
{/await}

<style>
  .terrain-status {
    display: grid;
    place-items: center;
    width: 100%;
    height: 100%;
    padding: 2rem;
    color: var(--theme-text-secondary, #94a3b8);
    font-size: 1rem;
    text-align: center;
  }

  .terrain-status--error {
    color: var(--semantic-error, #f87171);
  }
</style>
