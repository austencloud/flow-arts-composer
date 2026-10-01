<script lang="ts">
  import { onMount } from "svelte";
  import DisplayPanel from "$lib/shared/animation-engine/components/settings-panels/DisplayPanel.svelte";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import PostAnimationAppearanceTool from "$lib/shared/share/components/post-studio/editor/PostAnimationAppearanceTool.svelte";
  import type { PostEditorState } from "$lib/shared/media-composition/state/post-editor-state.svelte";
  import { getBrowseLoader } from "$lib/shared/browse/get-browse-loader";
  import { hydrateSequence } from "$lib/shared/sequence-viewer/services/sequence-data-provider";
  import { loopDetector } from "$lib/features/create/generate/circular/services/loop-detector";
  import { registerLoopDetector } from "$lib/shared/create/get-loop-detector";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  // The .rt-chip vocabulary the panel styles against normally arrives from the
  // rail that hosts it. Without it every tile falls back to a bare <button>.
  import "$lib/shared/animation-panel/bento/rail-tile.css";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

  /**
   * Harness for the Display page's toggle tiles. It mounts the REAL
   * DisplayPanel against a REAL published sequence, at the widths the panel
   * actually gets in production, so the tiles can be judged side by side
   * instead of one width at a time. Every toggle here is live — clicking one
   * writes to the same visibility manager the canvas reads.
   *
   * Production widths this mirrors: the sequence-viewer sidebar is ~662px at a
   * 1920 viewport and ~830px at 3840; Post Studio's inspector is ~419px; the
   * mobile dock tray is ~360px.
   */
  const SEQUENCE_WORD = "CΨΩXCΨΩXCΨΩXCΨΩX";
  const SEQUENCE_ID = "2077a0d6-01d1-4b2b-a920-da9da6ee7e47";

  // Height matters as much as width now: the sidebar hosts hand the panel a
  // definite box and it fits its columns to that box's shape, so each column
  // here reproduces the height its host actually gives as well as the width.
  const WIDTHS = [
    { label: "Mobile dock tray", px: 360, h: 220, fill: false },
    { label: "Post Studio inspector", px: 419, h: 620, fill: true },
    { label: "Viewer sidebar @ 1920", px: 662, h: 900, fill: true },
    { label: "Viewer sidebar @ 3840", px: 830, h: 1400, fill: true },
  ];

  // Post Studio's tool panel body scrolls the panel inside a box nothing sizes
  // for it, under the section nav and the canvas-theme row (96px of nav, 44px of
  // theme, 16px gaps). The compact layout fits what the scroller holds to the
  // scroller's visible height, so each box here is one height that host gets:
  // the editor at 1440x900 and at 1922x995, the phone dock's half-screen tray,
  // and a window too short to fit.
  const COMPACT_BOXES = [
    { label: "Post panel @ 1440x900", px: 403, h: 285 },
    { label: "Post panel @ 1922x995", px: 416, h: 380 },
    { label: "Post panel on a phone", px: 358, h: 422 },
    { label: "Post panel, too short", px: 403, h: 200 },
  ];

  // Enough for the word, glyph and step tiles to draw real content when the
  // gallery is unreachable (a signed-out session cannot read Firestore). The
  // mandala tile draws its own fallback in that case.
  const STANDIN = {
    word: SEQUENCE_WORD,
    steps: [{ letter: "C" }, { letter: "Ψ" }, { letter: "Ω" }, { letter: "X" }],
  } as unknown as SequenceData;

  let sequence = $state<SequenceData | null>(null);
  // The appearance tool reads only the sequence from its editor; with
  // `onAppearanceChange` given it never edits it, so a toggle here changes
  // nothing saved.
  const postEditor = $derived({ sequence } as unknown as PostEditorState);
  let loadError = $state<string | null>(null);

  onMount(async () => {
    registerLoopDetector(loopDetector);
    // The panel reads --theme-* from :root, which only the app shell sets. Run
    // the same pipeline the standalone /q page runs so the tiles are judged on
    // the chrome they actually ship on, not on unstyled defaults.
    const { applyThemeForBackground } =
      await import("$lib/shared/settings/utils/background-theme-calculator");
    const { BackgroundType } = await import("@austencloud/backgrounds");
    applyThemeForBackground(BackgroundType.OCEAN);
    try {
      const loaded = await getBrowseLoader().loadFullSequenceData(
        SEQUENCE_WORD,
        SEQUENCE_ID
      );
      if (!loaded) {
        sequence = STANDIN;
        loadError =
          "Gallery lookup returned nothing (a signed-out session cannot read Firestore) — word and glyph come from a stand-in and the mandala draws its fallback.";
        return;
      }
      sequence = await hydrateSequence(loaded);
    } catch (error) {
      sequence = STANDIN;
      loadError =
        error instanceof Error ? error.message : "Could not load the sequence.";
    }
  });
</script>

<svelte:head><title>Display tiles harness</title></svelte:head>

<div class="harness">
  <header>
    <h1>Display tiles</h1>
    <p>
      Live toggles, sequence <strong>{sequence?.word ?? "—"}</strong> ({sequence
        ?.steps?.length ?? 0} steps). Click any tile.
      {#if loadError}<br /><span class="err">{loadError}</span>{/if}
    </p>
  </header>

  <div class="columns">
    {#each WIDTHS as w (w.px)}
      <section>
        <h2>{w.label} <span>{w.px} x {w.h}</span></h2>
        <div class="panel" style="width: {w.px}px; height: {w.h}px">
          <DisplayPanel {sequence} propType={PropType.STAFF} fill={w.fill} />
        </div>
      </section>
    {/each}
  </div>

  <h2 class="group">Compact, scrolled by its host</h2>
  <div class="columns">
    {#each COMPACT_BOXES as box (box.label)}
      <section>
        <h2>{box.label} <span>{box.px} x {box.h}</span></h2>
        <div
          class="panel scroller"
          data-compact-box={box.label}
          style="width: {box.px}px; height: {box.h}px"
        >
          <div class="chrome" aria-hidden="true">Section nav, canvas theme</div>
          <DisplayPanel compact {sequence} propType={PropType.STAFF} />
        </div>
      </section>
    {/each}
  </div>

  <h2 class="group">
    Post Studio's appearance tool, as its tool panel hosts it
  </h2>
  <div class="columns">
    {#each COMPACT_BOXES as box (box.label)}
      <section>
        <h2>{box.label} <span>{box.px} x {box.h}</span></h2>
        <div
          class="panel scroller post-body"
          data-post-box={box.label}
          style="width: {box.px}px; height: {box.h}px"
        >
          <div class="item-tool snug">
            <PostAnimationAppearanceTool
              editor={postEditor}
              locked={false}
              appearanceOverride={null}
              onAppearanceChange={() => {}}
            />
            <PanelButton>Use animation defaults</PanelButton>
          </div>
        </div>
      </section>
    {/each}
  </div>
</div>

<style>
  .harness {
    padding: 24px;
    min-height: 100vh;
    background: var(--theme-bg, #0d1117);
    color: var(--theme-text, #e6edf3);
  }

  header {
    margin-bottom: 20px;
  }

  h1 {
    margin: 0 0 4px;
    font-size: 1.4rem;
  }

  header p {
    margin: 0;
    opacity: 0.75;
    font-size: 0.9rem;
  }

  .err {
    color: #f8836b;
  }

  .columns {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 28px;
  }

  h2 {
    margin: 0 0 8px;
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    opacity: 0.6;
  }

  h2 span {
    opacity: 0.6;
    text-transform: none;
    letter-spacing: 0;
  }

  .group {
    margin: 28px 0 8px;
  }

  .panel.scroller {
    display: block;
    padding: 4px;
  }

  /* Stands in for the section nav (96px), its gap, the canvas-theme row (44px)
     and its gap, so the panel starts where it does in Post Studio. */
  .chrome {
    height: 172px;
    margin-bottom: 0;
    border: 1px dashed var(--theme-stroke, #30363d);
    border-radius: 10px;
    opacity: 0.5;
    font-size: 0.75rem;
    display: grid;
    place-items: center;
    box-sizing: border-box;
  }

  /* PostToolPanel's body and PostItemTool's wrapper, reproduced: the body
     scrolls with a quarter-rem of padding, and the tool lays its pieces out in
     one grid column, half a rem apart once it holds an animation's appearance
     panel (the `snug` modifier). */
  .panel.post-body {
    padding: 0.25rem;
  }

  .item-tool {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 1rem;
    min-width: 0;
  }

  .item-tool.snug {
    gap: 0.5rem;
  }

  .panel {
    display: flex;
    flex-direction: column;
    overflow: auto;
    padding: 12px;
    border: 1px solid var(--theme-stroke, #30363d);
    border-radius: 12px;
    background: var(--theme-panel-bg, #161b22);
  }
</style>
