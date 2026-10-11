<script lang="ts">
  import { browser } from "$app/env";
  import type { Snippet } from "svelte";
  import "../../../app.css";

  let { children } = $props<{
    children: Snippet;
  }>();

  // /test pages never mount the app shell, so mirror the shell's gallery
  // prewarm here. The builder and prefetcher share the same loader instance,
  // which coalesces the first request instead of making each drill wait for a
  // fresh gallery fetch.
  if (browser) {
    void import("#lib/features/browse/shared/get-gallery-prefetcher.js")
      .then(({ getGalleryPrefetcher }) => getGalleryPrefetcher().prefetch())
      .catch((error: unknown) =>
        console.warn("[SmartCollectionReview] Gallery prewarm failed:", error)
      );
  }
</script>

<svelte:head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width" />
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

{@render children()}
