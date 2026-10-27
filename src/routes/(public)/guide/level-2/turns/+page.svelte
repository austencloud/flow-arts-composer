<script lang="ts">
  /**
   * Chapter hub for 1-Turns. Used to concatenate all 13 ch20 GuideSection
   * components into one long page; each now has its own crawlable
   * `/guide/level-2/<slug>` route (see level2-topic-routes.ts for the
   * section → route mapping and why), so this page becomes an overview +
   * links, mirroring `/guide/level-2`'s own hub pattern. Kept at this URL
   * (rather than 301'd) since it already carries inbound/search traffic.
   */
  import ChapterHub from "../_components/ChapterHub.svelte";
  import GuideSeo from "../../level-1/_components/GuideSeo.svelte";
  import { level2TopicPagesForChapter } from "../_data/level2-topic-routes";
  import { tDynamic } from "#lib/shared/i18n/i18n.svelte.js";

  const topics = level2TopicPagesForChapter("turns");
</script>

<GuideSeo
  title={tDynamic("guide_l2_turns_seo_title")}
  description={tDynamic("guide_l2_turns_intro")}
  path="/guide/level-2/turns"
  partOf={{ name: tDynamic("guide_level2_seo_title"), path: "/guide/level-2" }}
  breadcrumbs={[
    { name: tDynamic("guide_paths_home"), path: "/" },
    { name: tDynamic("guide_paths_part_of"), path: "/guide" },
    { name: tDynamic("guide_level2_subtitle"), path: "/guide/level-2" },
    { name: tDynamic("guide_l2_turns_title"), path: "/guide/level-2/turns" },
  ]}
/>

<ChapterHub
  title={tDynamic("guide_l2_turns_title")}
  intro={tDynamic("guide_l2_turns_intro")}
  listLabel={tDynamic("guide_l2_turns_topics")}
  {topics}
/>
