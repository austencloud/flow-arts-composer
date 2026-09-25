<script lang="ts">
  /**
   * Chapter hub for 1-Turns. Used to concatenate all 13 ch20 GuideSection
   * components into one long page; each now has its own crawlable
   * `/guide/level-2/<slug>` route (see level2-topic-manifest.ts for the
   * section → route mapping and why), so this page becomes an overview +
   * links, mirroring `/guide/level-2`'s own hub pattern. Kept at this URL
   * (rather than 301'd) since it already carries inbound/search traffic.
   */
  import GuideSeo from "../../level-1/_components/GuideSeo.svelte";
  import { level2TopicPagesForChapter } from "../_data/level2-topic-manifest";

  const topics = level2TopicPagesForChapter("turns");
</script>

<GuideSeo
  title="2.0 1-Turns · Level 2 · Flow Arts Notation Guide"
  description="Level 2 chapter on 1-turns: 180° prop rotations layered onto shifts, dashes, and static motions, with glyphs, PADS ordering, and Types 1–6 with turns."
  path="/guide/level-2/turns"
  partOf={{ name: "Level 2 Guide: Turns", path: "/guide/level-2" }}
  breadcrumbs={[
    { name: "Home", path: "/" },
    { name: "Guide", path: "/guide" },
    { name: "Level 2", path: "/guide/level-2" },
    { name: "1-Turns", path: "/guide/level-2/turns" },
  ]}
/>

<div class="chapter-hub">
  <h1>1-Turns</h1>
  <p class="intro">
    Level 2 chapter on 1-turns: 180° prop rotations layered onto shifts, dashes, and static
    motions, with glyphs, PADS ordering, and Types 1–6 with turns.
  </p>

  <nav class="topic-list" aria-label="1-Turns topics">
    <ol>
      {#each topics as topic (topic.slug)}
        <li>
          <a href="/guide/level-2/{topic.slug}">
            <strong>{topic.h1}</strong>
            <span>{topic.description}</span>
          </a>
        </li>
      {/each}
    </ol>
  </nav>
</div>

<style>
  .chapter-hub {
    max-width: 44rem;
    margin: 0 auto;
    padding-bottom: 2rem;
  }
  .intro {
    text-align: center;
    margin: 0 auto 2rem;
  }
  .topic-list ol {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
  }
  .topic-list a {
    display: block;
    padding: 1rem 1.25rem;
    background: oklch(0.18 0.02 270 / 0.6);
    border: 1px solid oklch(0.45 0.04 270 / 0.35);
    border-radius: 8px;
    text-decoration: none;
    color: inherit;
    transition:
      border-color 0.15s,
      box-shadow 0.15s;
  }
  .topic-list a:hover {
    border-color: #4ea7e8;
    box-shadow: 0 2px 8px rgba(78, 167, 232, 0.25);
  }
  .topic-list strong {
    display: block;
    color: oklch(0.9 0.02 270);
  }
  .topic-list span {
    display: block;
    font-size: 0.9rem;
    color: oklch(0.68 0.02 270);
    margin-top: 0.25rem;
  }
</style>
