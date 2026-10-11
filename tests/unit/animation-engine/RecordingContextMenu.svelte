<!-- Stands in for ContextMenu in host tests: it draws nothing and records the
     entries the host passed it. -->
<script module lang="ts">
  import type { ContextMenuEntry } from "#lib/shared/components/context-menu/context-menu-types.js";

  export const menuProps: { items: ContextMenuEntry[] | null } = {
    items: null,
  };
</script>

<script lang="ts">
  let { ...props }: Record<string, unknown> = $props();

  $effect.pre(() => {
    menuProps.items = props.items as ContextMenuEntry[];
  });
</script>
