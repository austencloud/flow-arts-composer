<!--
  BuugengPairsExplainer.svelte

  The "What's this?" screen for buugeng pairs, opened inside the prop picker's
  own sheet (PropGrid's `pairs` drill) so a visitor never leaves the app to
  learn it. It used to link to /notation/props#buugeng-chirality, which
  reloaded the app on the Create front door and lost the card being edited
  (a visitor talk-through, 2026-11-14).

  A large stage draws the pair that is picked right now, and the props glide
  when the pick changes, so mirrored pairs visibly slide together into one 8
  and matching pairs slide apart. Under it, one paragraph says why A and B
  exist, and the same pair tiles as the picker set the props from here.

  Composes BuugengPairPreview (drawing) and PropChiralityRow (picking); it owns
  no chirality state of its own.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import {
    resolveViewerCustomColorPair,
    type ViewerCustomColorPair,
  } from "#lib/shared/sequence-viewer/domain/viewer-custom-colors.js";
  import { Crossfade } from "#lib/shared/transitions/motion.js";
  import BuugengPairPreview from "./BuugengPairPreview.svelte";
  import PropChiralityRow from "./PropChiralityRow.svelte";
  import type {
    ChiralityHand,
    PropChiralityHandState,
  } from "./prop-chirality-seam";

  let {
    propType,
    hands,
    partner,
    onChange,
    colors,
    fill = false,
  }: {
    propType: PropType;
    hands: readonly PropChiralityHandState[];
    partner?: PropChiralityHandState;
    onChange: (hand: ChiralityHand, flipped: boolean) => void;
    colors?: ViewerCustomColorPair | null;
    /** The host gives this screen a fixed height (the sheet rail); a short
     *  one sets the picture beside the words so nothing has to scroll. */
    fill?: boolean;
  } = $props();

  const palette = $derived(resolveViewerCustomColorPair(colors));
  const flippedFor = (hand: ChiralityHand): boolean =>
    (
      hands.find((state) => state.hand === hand) ??
      (partner?.hand === hand ? partner : undefined)
    )?.flipped ?? false;
  const leftFlipped = $derived(flippedFor("left"));
  const rightFlipped = $derived(flippedFor("right"));
  const stacks = $derived(leftFlipped !== rightFlipped);
</script>

<div class="pairs-explainer" class:fill>
  <div class="pairs-layout">
    <figure class="stage">
      <div class="stage-art">
        <BuugengPairPreview
          {propType}
          {leftFlipped}
          {rightFlipped}
          leftColor={palette.left}
          rightColor={palette.right}
          animate
        />
      </div>
      <figcaption class="stage-caption" aria-live="polite">
        <Crossfade key={stacks ? "stack" : "side"}>
          {stacks
            ? t("settings_buugeng_pairs_stack")
            : t("settings_buugeng_pairs_side")}
        </Crossfade>
      </figcaption>
    </figure>

    <p class="explain">{t("settings_buugeng_pairs_explain")}</p>

    <div class="tiles">
      <PropChiralityRow {propType} {hands} {partner} {colors} {onChange} bare />
    </div>
  </div>
</div>

<style>
  .pairs-explainer {
    container: pairs-explainer / inline-size;
  }

  .pairs-explainer.fill {
    container-type: size;
    height: 100%;
    min-height: 0;
  }

  .pairs-layout {
    display: grid;
    grid-template-areas: "stage" "explain" "tiles";
    align-content: start;
    gap: 10px;
    padding: 0 12px 12px;
  }

  .stage {
    grid-area: stage;
  }
  .explain {
    grid-area: explain;
  }
  .tiles {
    grid-area: tiles;
    min-width: 0;
  }

  /* A short sheet: the picture sits beside the words, the tiles run under
     both, and the whole screen fits the sheet's fixed height. */
  @container pairs-explainer (height < 26rem) {
    .pairs-layout {
      grid-template-columns: 7.5rem minmax(0, 1fr);
      grid-template-areas: "stage explain" "tiles tiles";
      align-items: center;
      gap: 6px 10px;
      padding: 2px 4px 2px;
    }
    .pairs-layout .stage {
      padding: 4px 0;
    }
    .pairs-layout .explain {
      line-height: 1.32;
    }
    .pairs-layout .stage-art {
      width: 82%;
    }
  }

  .stage {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    margin: 0;
    padding: 8px 0 6px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 16px;
    background: radial-gradient(
      circle at 50% 45%,
      color-mix(in srgb, var(--theme-accent, #8b6cff) 14%, transparent),
      transparent 70%
    );
  }

  .stage-art {
    width: min(150px, 45%);
  }

  .stage-caption {
    display: grid;
    min-height: 1.4em;
    color: var(--theme-text);
    font-size: var(--font-size-min, 14px);
    font-weight: 700;
    text-align: center;
  }

  .explain {
    margin: 0;
    color: var(--theme-text);
    font-size: var(--font-size-min, 14px);
    line-height: 1.4;
  }
</style>
