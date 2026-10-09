<!-- Stands in for CanvasSurface in AnimatorCanvas tests: it draws nothing and
     records the props the host passed it. -->
<script module lang="ts">
  export const surfaceProps: { last: Record<string, unknown> | null } = {
    last: null,
  };
</script>

<script lang="ts">
  let { ...props }: Record<string, unknown> = $props();

  $effect.pre(() => {
    surfaceProps.last = { trailOverlay: props.trailOverlay };
  });
</script>
