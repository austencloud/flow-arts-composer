<script lang="ts">
  let { inline = false } = $props<{ inline?: boolean }>();
</script>

{#if inline}
  <div data-testid="inline-auth">
    <button type="button">Continue with email</button>
  </div>
{/if}
