<script lang="ts">
  import GuideReader from "../../(public)/guide/level-1/_components/GuideReader.svelte";
</script>

<div class="host">
  <GuideReader />
</div>

<style>
  .host {
    /* behind the status bar: a holder, the guide reader clears the bar itself */
    position: fixed;
    inset: 0;
    container-type: inline-size;
  }
</style>
