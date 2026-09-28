<script lang="ts">
  /**
   * Crawlable + interactive Level-2 topic page — same per-topic pattern as
   * `/guide/level-1/[slug]` (GuideSeo + prerendered body + prev/next), built
   * from the live ch20/ch21 GuideSection components instead of level-1's
   * block-based reflow content (level-2 has no GUIDE_CONTENT equivalent; its
   * prose already lives in real .svelte sections, so this route renders
   * those directly — see level2-topic-routes.ts for the mapping and why).
   */
  import GuideSeo from "../../level-1/_components/GuideSeo.svelte";
  import Level2TopicBody from "../_components/Level2TopicBody.svelte";
  import { LEVEL2_TOPIC_PAGES } from "../_data/level2-topic-routes";
  import { localizedLevel2Topic } from "../_data/localize-level2-topic";
  import { tDynamic } from "$lib/shared/i18n/i18n.svelte.js";
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
  const chapterHubLabel = $derived(tDynamic(chapterGroup === "2.1" ? "guide_level2_chapter2_title" : "guide_level2_chapter1_title"));
  const chapterHubPath = $derived(`/guide/level-2/${meta?.chapter ?? "turns"}`);
</script>

{#if meta}
  <GuideSeo
    title={tDynamic("guide_l2_topic_seo_title", { topic: localizedLevel2Topic(meta, "h1") })}
    description={localizedLevel2Topic(meta, "description")}
    path={`/guide/level-2/${slug}`}
    partOf={{ name: tDynamic("guide_level2_seo_title"), path: "/guide/level-2" }}
    breadcrumbs={[
      { name: tDynamic("guide_paths_home"), path: "/" },
      { name: tDynamic("guide_paths_part_of"), path: "/guide" },
      { name: tDynamic("guide_level2_subtitle"), path: "/guide/level-2" },
      { name: chapterHubLabel, path: chapterHubPath },
      { name: localizedLevel2Topic(meta, "h1"), path: `/guide/level-2/${slug}` },
    ]}
  />

  {#key slug}
    <Level2TopicBody {meta} {prev} {next} />
  {/key}
{/if}
