<script lang="ts">
  import { T, useTask } from "@threlte/core";
  import type { ObsidianPillarsConfig } from "../../domain/models/scene-configs";
  import { userProportionsState } from "@austencloud/scene-3d";
  import { createObsidianPillarField } from "../../worlds/ember/ember-obsidian-pillars";

  interface Props {
    config: ObsidianPillarsConfig;
  }

  let { config }: Props = $props();
  const groundY = $derived(userProportionsState.groundY);

  // One InstancedMesh per pillar part over one shared material; the builder is
  // shared with the ember world so both paths draw identical pillars.
  const field = $derived(createObsidianPillarField(config));

  $effect(() => {
    const current = field;
    return () => current?.dispose();
  });

  useTask((delta) => {
    field?.update(delta);
  });
</script>

{#if field}
  <T is={field.object} position.y={groundY} />
{/if}
