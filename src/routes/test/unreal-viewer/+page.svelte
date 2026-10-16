<script lang="ts">
  import { onMount } from "svelte";
  let Workbench = $state<
    | typeof import("#lib/shared/3d/unreal/components/UnrealViewerWorkbench.svelte").default
    | null
  >(null);
  let error = $state("");
  onMount(() => {
    let active = true;
    void import("#lib/shared/3d/unreal/components/UnrealViewerWorkbench.svelte")
      .then(({ default: component }) => {
        if (active) Workbench = component;
      })
      .catch((cause) => {
        if (active)
          error =
            cause instanceof Error
              ? cause.message
              : "Unable to load the viewer.";
      });
    return () => {
      active = false;
    };
  });
</script>

<svelte:head><title>Unreal Studio · Flow Arts Composer</title></svelte:head>
{#if Workbench}<Workbench />{:else}<main role="status">
    {error || "Loading Unreal studio…"}
  </main>{/if}

<style>
  main {
    min-height: 100dvh;
    display: grid;
    place-items: center;
    padding: 2rem;
    background: #0c1018;
    color: #fff;
  }
</style>
