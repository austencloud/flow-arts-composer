<script lang="ts">
  import { provideStrings } from "@austencloud/video-editor/strings";
  import SingleSvelteReader from "./SingleSvelteReader.svelte";

  provideStrings((key) => `tka:${key}`);
</script>

<SingleSvelteReader />
