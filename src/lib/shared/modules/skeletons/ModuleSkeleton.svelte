<!--
  Keep the module import and its own initialization visually continuous.
  Loading a feature must not also generate sequences for a loading animation.
-->
<script lang="ts">
  import { resolveSkeleton } from "./index";
  let { moduleKey }: { moduleKey: string | null } = $props();
  const Skeleton = $derived(resolveSkeleton(moduleKey));
</script>

<Skeleton />
