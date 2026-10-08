<!--
  Packaging spike for @austencloud/video-editor (extraction step 0). Renders
  the package's placeholder component, which asks its module worker for a
  timecode, and reports whether the page and the package share one Svelte
  runtime. The /test layout keeps this route out of production.
-->
<script lang="ts">
  import { untrack } from "svelte";
  import { VideoEditor, runtimeProbe } from "@austencloud/video-editor";
  import { formatTimecode } from "@austencloud/video-editor/core";
  import "@austencloud/video-editor/css/video-editor-tokens.css";

  const singleSvelte = runtimeProbe.untrack === untrack;
</script>

<main class="spike" data-ve-single-svelte={singleSvelte}>
  <h1>@austencloud/video-editor spike</h1>
  <p>Core says {formatTimecode(83.5)}. Single Svelte runtime: {singleSvelte}.</p>
  <VideoEditor seconds={83.5} />
</main>

<style>
  .spike {
    max-width: 640px;
    margin: 40px auto;
    padding: 0 16px;
    font-family: system-ui, sans-serif;
  }
</style>
