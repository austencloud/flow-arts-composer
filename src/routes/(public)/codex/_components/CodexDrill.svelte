<!--
  The Codex for a window that cannot hold the full board: one screen at a
  time (Home, Type, Letter, Adjust, Links), each a fixed frame under the site
  header, swapped with a Crossfade keyed by the screen. Going deeper drifts
  forward, Back drifts back. The page owns which screen shows (it is URL
  state); this host only draws it.
-->
<script lang="ts">
  import { Crossfade } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import type { Orientation } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
  import type { CodexExplorerState } from "../../atlas/_components/codex-boards/codex-explorer-state.svelte";
  import { CODEX_TYPE_BANDS } from "../../atlas/_components/codex-boards/codex-letters";
  import { codexTypeWord } from "../_data/codex-groups";
  import { describeCodexEdits } from "../_data/codex-edit-summary";
  import {
    CODEX_DEFAULT_ORIENTATIONS,
    type CodexStartOrientations,
  } from "../_data/codex-orientation";
  import { codexScreenDepth, type CodexScreen } from "../_data/codex-screen";
  import CodexHomeScreen from "./CodexHomeScreen.svelte";
  import CodexTypeScreen from "./CodexTypeScreen.svelte";
  import CodexLetterScreen from "./CodexLetterScreen.svelte";
  import CodexAdjustScreen from "./CodexAdjustScreen.svelte";
  import CodexLinksScreen from "./CodexLinksScreen.svelte";

  let {
    codex,
    screen,
    propType,
    startOrientations,
    onChooseProp,
    onChooseStart,
    onGo,
    onBack,
  }: {
    codex: CodexExplorerState;
    screen: CodexScreen;
    propType?: PropType;
    startOrientations?: CodexStartOrientations;
    onChooseProp?: (next: PropType) => void;
    onChooseStart?: (hand: "left" | "right", next: Orientation) => void;
    onGo: (screen: CodexScreen, options?: { push: boolean }) => void;
    onBack: () => void;
  } = $props();

  const key = $derived(`${screen.kind}-${screen.type}-${screen.letter}`);

  // Deeper drifts forward, shallower drifts back.
  let lastDepth = 0;
  let direction = $state<1 | -1>(1);
  $effect.pre(() => {
    const depth = codexScreenDepth(screen);
    direction = depth >= lastDepth ? 1 : -1;
    lastDepth = depth;
  });

  const summary = $derived(
    describeCodexEdits({
      transforms: codex.transforms,
      explorerTransforms: screen.letter ? codex.explorerOps : undefined,
      edits: codex.edits(),
      start: startOrientations ?? CODEX_DEFAULT_ORIENTATIONS,
    })
  );

  function resetAll(): void {
    codex.resetAll();
    const start = startOrientations ?? CODEX_DEFAULT_ORIENTATIONS;
    if (start.left !== CODEX_DEFAULT_ORIENTATIONS.left) {
      onChooseStart?.("left", CODEX_DEFAULT_ORIENTATIONS.left);
    }
    if (start.right !== CODEX_DEFAULT_ORIENTATIONS.right) {
      onChooseStart?.("right", CODEX_DEFAULT_ORIENTATIONS.right);
    }
  }

  function typeName(type: number | null): string | null {
    const band = CODEX_TYPE_BANDS.find((b) => b.type.n === type);
    return band ? codexTypeWord(band.type).replace(/:\s*$/, "") : null;
  }

  const adjustBack = $derived(
    screen.letter
      ? codex.shownLabel
      : (typeName(screen.type) ?? "Codex")
  );
</script>

<div
  class="codex-drill codex-dark"
  data-codex-mode="drill-down"
  data-codex-screen={screen.kind}
>
  <Crossfade
    {key}
    duration={DURATION.normal}
    motion="step"
    {direction}
    fill
    label={screen.kind}
  >
    {#if screen.kind === "type" && screen.type}
      <CodexTypeScreen
        {codex}
        type={screen.type}
        {propType}
        {summary}
        onResetAll={resetAll}
        {onGo}
        {onBack}
      />
    {:else if screen.kind === "letter"}
      <CodexLetterScreen
        {codex}
        {screen}
        {propType}
        {summary}
        onResetAll={resetAll}
        {onGo}
        {onBack}
      />
    {:else if screen.kind === "adjust"}
      <CodexAdjustScreen
        {codex}
        {screen}
        {propType}
        {startOrientations}
        {onChooseStart}
        onResetAll={resetAll}
        {onBack}
        backLabel={adjustBack}
      />
    {:else if screen.kind === "links"}
      <CodexLinksScreen {codex} {onBack} />
    {:else}
      <CodexHomeScreen
        {propType}
        {summary}
        onResetAll={resetAll}
        {onChooseProp}
        {onGo}
      />
    {/if}
  </Crossfade>
</div>

<style>
  .codex-drill {
    position: relative;
    height: calc(100dvh - var(--marketing-header-h, 64px));
    overflow: hidden;
  }
</style>
