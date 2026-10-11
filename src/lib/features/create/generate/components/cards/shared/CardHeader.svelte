<!--
CardHeader.svelte - Re-exports from shared for backwards compatibility
-->
<script lang="ts">
  import SharedCardHeader from "#lib/shared/components/stepper-card/shared/CardHeader.svelte";

  let { title, headerFontSize } = $props<{
    title: string;
    headerFontSize?: string;
  }>();
</script>

<SharedCardHeader {title} {headerFontSize} />
