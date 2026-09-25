<script lang="ts">
  /**
   * Crawlable + interactive Level-2 topic page — same per-topic pattern as
   * `/guide/level-1/[slug]` (GuideSeo + prerendered body + prev/next), built
   * from the live ch20/ch21 GuideSection components instead of level-1's
   * block-based reflow content (level-2 has no GUIDE_CONTENT equivalent; its
   * prose already lives in real .svelte sections, so this route renders
   * those directly — see level2-topic-manifest.ts for the mapping and why).
   */
  import GuideSeo from "../../level-1/_components/GuideSeo.svelte";
  import Level2TopicBody from "../_components/Level2TopicBody.svelte";
  import { LEVEL2_GROUP_TITLES } from "../_data/guide-manifest";
  import { LEVEL2_TOPIC_PAGES } from "../_data/level2-topic-manifest";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();
  const slug = $derived(data.slug);
  const index = $derived(LEVEL2_TOPIC_PAGES.findIndex((p) => p.slug === slug));
  const meta = $derived(LEVEL2_TOPIC_PAGES[index]);
  const prev = $derived(index > 0 ? LEVEL2_TOPIC_PAGES[index - 1] : null);
  const next = $derived(
    index >= 0 && index < LEVEL2_TOPIC_PAGES.length - 1
      ? LEVEL2_TOPIC_PAGES[index + 1]
      : null
  );

  const chapterGroup = $derived(
    meta?.chapter === "double-turns" ? "2.1" : "2.0"
  );
  const chapterHubLabel = $derived(LEVEL2_GROUP_TITLES[chapterGroup]);
  const chapterHubPath = $derived(`/guide/level-2/${meta?.chapter ?? "turns"}`);
</script>

{#if meta}
  <GuideSeo
    title={meta.title}
    description={meta.description}
    path={`/guide/level-2/${slug}`}
    partOf={{ name: "Level 2 Guide: Turns", path: "/guide/level-2" }}
    breadcrumbs={[
      { name: "Home", path: "/" },
      { name: "Guide", path: "/guide" },
      { name: "Level 2", path: "/guide/level-2" },
      { name: chapterHubLabel, path: chapterHubPath },
      { name: meta.h1, path: `/guide/level-2/${slug}` },
    ]}
  />

  {#key slug}
    <Level2TopicBody {meta} {prev} {next} />
  {/key}
{/if}
