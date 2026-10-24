<!--
  Where to find a letter: the four things the explorer dialog's footer
  holds (LetterLinks), as boxes and pills on their own screen.
-->
<script lang="ts">
  import LetterLinks from "../../atlas/_components/codex-boards/LetterLinks.svelte";
  import type { CodexExplorerState } from "../../atlas/_components/codex-boards/codex-explorer-state.svelte";
  import CodexScreenFrame from "./CodexScreenFrame.svelte";

  let {
    codex,
    onBack,
  }: {
    codex: CodexExplorerState;
    onBack: () => void;
  } = $props();
</script>

<CodexScreenFrame
  title={`Where to find ${codex.shownLabel}`}
  {onBack}
  backLabel={codex.shownLabel}
>
  <div class="links">
    <LetterLinks
      layout="screen"
      label={codex.shownLabel}
      learningMatches={codex.learningMatches}
      learningError={codex.learningError}
      learningLoading={codex.learningLoading}
      composerHref={codex.composerHref}
      onLearningRetry={codex.loadLearningDeck}
      onCopyLink={codex.copyExactLink}
    />
  </div>
</CodexScreenFrame>

<style>
  .links {
    width: 100%;
    max-width: 40rem;
    margin-inline: auto;
    padding-top: 4px;
  }
</style>
