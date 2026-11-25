<!--
  FuseLinkedRuleRow — the Linked rule as one summary row on a phone.

  The open rule panel (FuseLinkedRulePanel) is too tall for a phone workspace:
  with it under the header the page scrolled and pushed the result below the
  fold. On the compact workspace the rule drills down instead (see
  .claude/rules/no-page-scroll.md): this row states the current rule and opens
  the existing rule editor, FuseRelationshipComposer behind the recipe panel's
  `pairing` destination, as its own screen.

  Composes PanelButton; the wording is the recipe summary's pairing text.
  Invert and Rewind show as the icons they wear in the editor, and keep their
  names in the button's label.

  One line where every pairing the language can show fits the row, two where
  any does not. All of them are measured, never only the current one, so a
  change of rule cannot change the row's height and move the stage below it.
-->
<script lang="ts">
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import LOOPIconStrip from "#lib/shared/components/LOOPIconStrip.svelte";
  import { LOOPComponent } from "#lib/shared/foundation/domain/models/generation/generate-models.js";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { getFuseContext } from "../context/fuse-context";
  import {
    buildFusePairingSummary,
    listFusePairingLines,
  } from "../domain/fuse-recipe-summaries";

  let {
    onOpen,
  }: {
    onOpen: () => void;
  } = $props();

  const { state: fuseState } = getFuseContext();

  const disabled = $derived(
    fuseState.isLoadingLength ||
      fuseState.pendingSide !== null ||
      fuseState.isFusing
  );
  const pairing = $derived(
    buildFusePairingSummary({
      mode: fuseState.mode,
      driverSide: fuseState.driverSide,
      rule: fuseState.rule,
    })
  );
  const operations = $derived(
    new Set([
      ...(fuseState.rule.invert ? [LOOPComponent.INVERTED] : []),
      ...(fuseState.rule.rewind ? [LOOPComponent.REWOUND] : []),
    ])
  );
  const spokenSummary = $derived(
    [
      pairing,
      fuseState.rule.invert ? t("fuse_rule_invert") : null,
      fuseState.rule.rewind ? t("fuse_rule_rewind") : null,
    ]
      .filter(Boolean)
      .join(" · ")
  );

  const lines = $derived(listFusePairingLines());
  const bothOperations = new Set([
    LOOPComponent.INVERTED,
    LOOPComponent.REWOUND,
  ]);
  let roomWidth = $state(0);
  let widestLine = $state(0);
  /** Both widths are read as whole pixels; the margin covers the rounding. */
  const twoLines = $derived(widestLine + 4 > roomWidth);
</script>

{#snippet operationIcons(shown: Set<LOOPComponent>)}
  <span class="rule-operations" aria-hidden="true">
    <LOOPIconStrip
      activeComponents={shown}
      size={14}
      showFreeformWhenEmpty={false}
    />
  </span>
{/snippet}

<div class="linked-rule-row" class:two-lines={twoLines}>
  <PanelButton
    variant="secondary"
    fullWidth={true}
    {disabled}
    ariaLabel={t("fuse_rule_change_aria", { summary: spokenSummary })}
    onclick={onOpen}
  >
    <span class="rule-summary" bind:clientWidth={roomWidth}>
      <span class="rule-line"
        >{pairing}{#if operations.size > 0}{@render operationIcons(
            operations
          )}{/if}</span
      >
      <span class="line-sizer" aria-hidden="true">
        <span class="line-sizer-stack" bind:clientWidth={widestLine}>
          {#each lines as line (line)}
            <span>{line}{@render operationIcons(bothOperations)}</span>
          {/each}
        </span>
      </span>
    </span>
    <i class="fas fa-chevron-right rule-chevron" aria-hidden="true"></i>
  </PanelButton>
</div>

<style>
  /* One 36px line (layout law, Tap size), or one fixed 48px row of two 18px
     lines. */
  .linked-rule-row :global(.panel-btn) {
    justify-content: space-between;
    gap: 8px;
    height: var(--alt-touch-target, 36px);
    min-height: var(--alt-touch-target, 36px);
    padding: 0 12px;
  }

  .linked-rule-row.two-lines :global(.panel-btn) {
    height: 48px;
  }

  .rule-summary {
    position: relative;
    display: block;
    flex: 1 1 0;
    min-width: 0;
    color: var(--theme-text);
    font-size: var(--font-size-min, 14px);
    line-height: 18px;
    text-align: start;
  }

  .rule-line {
    display: block;
    white-space: nowrap;
  }

  .two-lines .rule-line {
    text-wrap: balance;
    white-space: normal;
  }

  .rule-operations {
    display: inline-flex;
    align-items: center;
    margin-inline-start: 6px;
    vertical-align: -2px;
  }

  /* Every pairing with both icons, laid out but never drawn: the stack is as
     wide as the longest. The clip keeps it out of any scroll width. */
  .line-sizer {
    position: absolute;
    inset: 0;
    overflow: hidden;
    visibility: hidden;
  }

  .line-sizer-stack {
    position: absolute;
    inset-inline-start: 0;
    display: grid;
    width: max-content;
    white-space: nowrap;
  }

  .rule-chevron {
    flex: 0 0 auto;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
  }
</style>
