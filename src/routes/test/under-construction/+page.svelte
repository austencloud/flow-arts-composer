<!--
  /test/under-construction — preview harness for the shared UnderConstruction
  gate (the real component, no mockup). The gated pages themselves render their
  real content in dev, so this is the only way to see the production note while
  iterating on it.
-->
<script lang="ts">
  import UnderConstruction from "#lib/shared/landing/components/UnderConstruction.svelte";
</script>

<svelte:head><title>Under construction preview | TKA test</title></svelte:head>

<UnderConstruction
  title="Flow Arts Notation"
  note="This overview is being rebuilt from scratch. Everything it linked to is still here and still works."
  destinations={[
    { label: "Shape Matrix", href: "/shape-engine", icon: "fa-diagram-project" },
    { label: "CAPs", href: "/notation/caps", icon: "fa-circle-nodes" },
  ]}
/>
