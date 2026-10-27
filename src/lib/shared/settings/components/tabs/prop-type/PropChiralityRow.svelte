<!--
  PropChiralityRow.svelte

  The buugeng pair picker, docked under the prop picker's tiles so every
  surface that mounts the picker inherits it (the Animation Panel, the Arena
  drawer, My Props, Tunnel art settings).

  Chirality is stored per hand, but what anyone sees is the pair: two buugeng
  facing opposite ways stack into one figure eight at a shared hand point, and
  two facing the same way get the beta separation and sit side by side. The
  old control offered A and B per hand on a lone prop, which showed nothing
  about that. So a host that sets both hands offers the four pairs, each drawn
  by the real pictograph renderer at the south hand point on the real grid
  (BuugengPairPreview), and a pick writes both hands. A host that sets one hand
  (cat-dog mode) offers A and B with the other hand drawn faintly beside it.

  Exactly one option is always active, so this routes to SegmentedControl per
  .claude/rules/chip-primitives.md. A is the unflipped artwork and B its
  mirror; every version draws A the same way
  (tests/unit/buugeng-art-handedness.test.ts). The "What's this?" chip opens
  the explainer on the props page.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import {
    resolveViewerCustomColorPair,
    type ViewerCustomColorPair,
  } from "#lib/shared/sequence-viewer/domain/viewer-custom-colors.js";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import LinkChip from "#lib/shared/ui/components/LinkChip.svelte";
  import BuugengPairPreview from "./BuugengPairPreview.svelte";
  import {
    BUUGENG_PAIRS,
    buugengPair,
    buugengPairFor,
    chiralityLetter,
    type BuugengPair,
    type BuugengPairId,
  } from "./buugeng-pair";
  import type {
    ChiralityHand,
    PropChiralityHandState,
  } from "./prop-chirality-seam";

  type Chirality = "a" | "b";

  let {
    propType,
    hands,
    partner,
    onChange,
    colors,
  }: {
    /** The buugeng-family prop the tiles draw. */
    propType: PropType;
    /** One entry per hand this picker governs, left first. */
    hands: readonly PropChiralityHandState[];
    /** The other hand, drawn faintly, when this picker governs one hand. */
    partner?: PropChiralityHandState;
    onChange: (hand: ChiralityHand, flipped: boolean) => void;
    colors?: ViewerCustomColorPair | null;
  } = $props();

  const palette = $derived(resolveViewerCustomColorPair(colors));
  const leftState = $derived(hands.find((state) => state.hand === "left"));
  const rightState = $derived(hands.find((state) => state.hand === "right"));
  const bothHands = $derived(leftState !== undefined && rightState !== undefined);

  let width = $state(0);
  // One row of four keeps the picker short enough to sit under the version
  // cards on a phone; each picture still reads at about 70px. Two by two only
  // in the narrowest hosts.
  const pairColumns = $derived(width === 0 || width >= 300 ? 4 : 2);

  function pairName(pair: BuugengPair): string {
    return pair.kind === "mirrored"
      ? t("settings_buugeng_pair_mirrored")
      : t("settings_buugeng_pair_matching");
  }

  function pairLetters(pair: BuugengPair): string {
    return pair.kind === "mirrored"
      ? t("settings_buugeng_pair_letters", {
          left: chiralityLetter(pair.leftFlipped),
          right: chiralityLetter(pair.rightFlipped),
        })
      : t("settings_buugeng_pair_both", {
          letter: chiralityLetter(pair.leftFlipped),
        });
  }

  const pairOptions = $derived(
    BUUGENG_PAIRS.map((pair) => ({
      value: pair.id,
      label: `${pairName(pair)}, ${pairLetters(pair)}`,
      tone: "both" as const,
    }))
  );

  const pairValue = $derived(
    buugengPairFor(leftState?.flipped ?? false, rightState?.flipped ?? false).id
  );

  function choosePair(id: BuugengPairId) {
    const pair = buugengPair(id);
    if (pair.leftFlipped !== (leftState?.flipped ?? false)) {
      onChange("left", pair.leftFlipped);
    }
    if (pair.rightFlipped !== (rightState?.flipped ?? false)) {
      onChange("right", pair.rightFlipped);
    }
  }

  const handOptions = [
    { value: "a" as const, label: "A" },
    { value: "b" as const, label: "B" },
  ];
</script>

<div class="chirality-row" bind:clientWidth={width}>
  <div class="chirality-heading">
    <span class="chirality-label">{t("settings_buugeng_pair")}</span>
    <LinkChip size="inline" href="/notation/props#buugeng-chirality">
      {t("settings_buugeng_whats_this")}
    </LinkChip>
  </div>
  <p class="chirality-hint">
    {t("settings_buugeng_pair_hint")}
    {#if !bothHands && partner}
      {t("settings_buugeng_pair_one_hand_hint")}
    {/if}
  </p>

  {#if bothHands}
    <SegmentedControl
      options={pairOptions}
      value={pairValue}
      onchange={choosePair}
      color="accent"
      columns={pairColumns}
      semantics="radiogroup"
      ariaLabel={t("settings_buugeng_pair")}
    >
      {#snippet optionContent(id)}
        {@const pair = buugengPair(id)}
        <span class="pair-tile">
          <BuugengPairPreview
            {propType}
            leftFlipped={pair.leftFlipped}
            rightFlipped={pair.rightFlipped}
            leftColor={palette.left}
            rightColor={palette.right}
          />
          <span class="pair-name">{pairName(pair)}</span>
          <span class="pair-letters">{pairLetters(pair)}</span>
        </span>
      {/snippet}
    </SegmentedControl>
  {:else}
    {#each hands as state (state.hand)}
      {@const other = state.hand === "left" ? "right" : "left"}
      <div class="chirality-hand" class:red={state.hand === "right"}>
        <span class="chirality-hand-label">
          <span
            class="chirality-hand-dot"
            style:background={state.hand === "right"
              ? palette.right
              : palette.left}
            aria-hidden="true"
          ></span>
          {state.hand === "right"
            ? t("settings_right_prop")
            : t("settings_left_prop")}
        </span>
        <SegmentedControl
          options={handOptions}
          value={(state.flipped ? "b" : "a") as Chirality}
          onchange={(next) => onChange(state.hand, next === "b")}
          color={state.hand === "left" ? "blue" : "red"}
          semantics="radiogroup"
          ariaLabel={state.hand === "right"
            ? t("settings_right_buugeng_chirality")
            : t("settings_left_buugeng_chirality")}
        >
          {#snippet optionContent(option)}
            {@const flipped = option === "b"}
            {@const partnerFlipped = partner?.flipped ?? false}
            <span class="pair-tile">
              <BuugengPairPreview
                {propType}
                leftFlipped={state.hand === "left" ? flipped : partnerFlipped}
                rightFlipped={state.hand === "right" ? flipped : partnerFlipped}
                leftColor={palette.left}
                rightColor={palette.right}
                dimHand={other}
              />
              <span class="pair-name">{chiralityLetter(flipped)}</span>
            </span>
          {/snippet}
        </SegmentedControl>
      </div>
    {/each}
  {/if}
</div>

<style>
  .chirality-row {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
    margin: 0 12px 12px;
    padding: 12px;
    border: 1px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.14));
    border-radius: 16px;
    background: color-mix(
      in srgb,
      var(--theme-accent, #8b6cff) 8%,
      var(--theme-card-bg, rgba(0, 0, 0, 0.75))
    );
  }

  .chirality-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .chirality-label {
    font-size: var(--font-size-min, 14px);
    font-weight: 700;
    color: var(--theme-text);
    white-space: nowrap;
  }

  .chirality-hint {
    margin: 0;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
    line-height: 1.35;
  }

  .chirality-row :global(.segment-label) {
    display: block;
    width: 100%;
    min-width: 0;
  }

  .pair-tile {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    width: 100%;
    padding: 4px 0;
  }

  .pair-tile :global(.pair-crop) {
    max-width: 120px;
  }

  .pair-name {
    font-weight: 700;
    line-height: 1.2;
  }

  .pair-letters {
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
    line-height: 1.2;
    white-space: normal;
    text-align: center;
  }

  .chirality-hand {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .chirality-hand-label {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--theme-text);
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
  }

  .chirality-hand-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }
</style>
