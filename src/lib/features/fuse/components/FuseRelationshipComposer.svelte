<script lang="ts">
  import { untrack } from "svelte";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import { getFuseContext } from "../context/fuse-context";
  import {
    fuseRuleLabel,
    fuseRulesEqual,
    type FuseRule,
  } from "../domain/fuse-rule";
  import type { FuseSide } from "../state/fuse-shuffle-pool.svelte";
  import FuseTransformPicker from "./FuseTransformPicker.svelte";
  import {
    classifyFuseRule,
    DEFAULT_TND_SELECTION,
    fuseTnDElement,
    fuseTnDModeLabel,
  } from "../domain/fuse-tnd-rule";
  import { checkFuseTnD } from "../domain/fuse-tnd-check";

  let {
    onCancel,
    onApply,
  }: {
    onCancel?: () => void;
    onApply?: () => void;
  } = $props();

  const { state: fuseState } = getFuseContext();
  let draftDriver = $state<FuseSide>(fuseState.driverSide);
  let draftRule = $state<FuseRule>(fuseState.rule);

  const draftRuleLabel = $derived(fuseRuleLabel(draftRule));
  const draftSelection = $derived(
    classifyFuseRule(draftRule) ?? DEFAULT_TND_SELECTION
  );
  const draftModeLabel = $derived(fuseTnDModeLabel(draftSelection.mode));
  // The mode is the rule. The result node wears the mode's element, the same
  // accent and icon as the chip that chose it, and names the operations that
  // realise it in a second, quieter line.
  const draftElement = $derived(fuseTnDElement(draftSelection.mode));

  // The live preview the canvas is drawing for this draft. While the draft
  // matches the applied rule the state's own preview is the one to read.
  const draftCheck = $derived.by(() => {
    if (!draftSelection.rewind) return null;
    const sequence = fuseState.previewSequence;
    if (!sequence) return null;
    return checkFuseTnD(sequence, draftSelection.mode);
  });
  const rewindBreaksAt = $derived(draftCheck?.firstMismatchBeat ?? null);
  const resultModeLabel = $derived(
    rewindBreaksAt === null
      ? draftModeLabel
      : `About ${draftModeLabel.toLowerCase()}`
  );
  const draftDriverLabel = $derived(
    draftDriver === "left" ? "Left path" : "Right path"
  );
  const draftFollowerLabel = $derived(
    draftDriver === "left" ? "Right path" : "Left path"
  );
  const busy = $derived(
    fuseState.isLoadingLength ||
      fuseState.pendingSide !== null ||
      fuseState.isFusing
  );

  // Opening the editor on the relationship that is already applied has nothing
  // to preview: the canvas is showing it. Deriving it anyway costs a full
  // rebuild of the follower path, and it lands in the same frames as the panel's
  // open animation, which is where it was eating the motion.
  const matchesApplied = (side: FuseSide, next: FuseRule) =>
    fuseState.mode === "symmetry" &&
    fuseState.driverSide === side &&
    fuseRulesEqual(fuseState.rule, next);

  $effect(() => {
    const driver = draftDriver;
    const rule = draftRule;

    untrack(() => {
      if (matchesApplied(driver, rule)) return;
      void fuseState.previewRelationship(driver, rule);
    });

    return () => {
      untrack(() => fuseState.cancelRelationshipPreview());
    };
  });

  function chooseDriver(side: FuseSide): void {
    draftDriver = side;
  }

  function chooseRule(rule: FuseRule): void {
    draftRule = rule;
  }

  function cancel(): void {
    fuseState.cancelRelationshipPreview();
    onCancel?.();
  }

  function apply(): void {
    fuseState.setRelationship(draftDriver, draftRule);
    onApply?.();
  }
</script>

<!-- `drill-grow` is the drill panel's opt-in for a form that owns its own
     footer: the editor takes the pane's remaining height so Cancel / Use this
     relationship land at the bottom, and keeps its natural height when the pane
     is shorter than the form so the pane's scroller still works. -->
<section
  class="pairing-editor drill-grow"
  aria-labelledby="pairing-editor-title"
>
  <!-- Separate vs Linked belongs to the header switch, which is also what opens
       this editor. Reaching it at all means the paths are linked, so the editor
       is only the rule that links them. -->
  <h3 id="pairing-editor-title" class="pairing-title">
    Choose how the two paths relate
  </h3>

  <FuseTransformPicker
    driver={draftDriver}
    rule={draftRule}
    onDriverChange={chooseDriver}
    onRuleChange={chooseRule}
  />

  {#if rewindBreaksAt !== null}
    <p class="rule-note" role="status">
      Rewind breaks {draftModeLabel} at beat {rewindBreaksAt}.
    </p>
  {/if}

  {#if fuseState.ruleAdjusted}
    <p class="rule-note" role="status">Rule adjusted to the nearest timing.</p>
  {/if}

  <div class="relationship-commit">
    <!-- Named Result, not Preview: it states what applying this does, and the
         canvas behind the editor is already showing the live preview. -->
    <div class="result" aria-live="polite">
      <span class="result-label">Result</span>
      <!-- The chain labels each node with what happens to it, so a sentence
           above it would say the same thing a second time. -->
      <div class="result-chain">
        <span class="path-node" data-side={draftDriver}>
          <span class="node-dot" aria-hidden="true"></span>
          <span class="node-copy">
            <!-- "Leads", echoing the control in step 1, and the pair reads
                 Leads / Rebuilds in one voice. "You edit" named the same path
                 from the other end and left the chain saying what the user
                 does beside what the app does. -->
            <span class="node-role">Leads</span>
            <strong>{draftDriverLabel}</strong>
          </span>
        </span>
        <i class="fas fa-arrow-right" aria-hidden="true"></i>
        <span
          class="rule-node"
          style="--rule-accent: {draftElement.accentColor}"
        >
          <img class="rule-icon" src={draftElement.iconPath} alt="" />
          <span class="node-copy">
            <span class="node-role">Rule</span>
            <strong>{resultModeLabel}</strong>
            <span class="node-ops">{draftRuleLabel}</span>
          </span>
        </span>
        <i class="fas fa-arrow-right" aria-hidden="true"></i>
        <span
          class="path-node"
          data-side={draftDriver === "left" ? "right" : "left"}
        >
          <span class="node-dot" aria-hidden="true"></span>
          <span class="node-copy">
            <!-- "Rebuilds", not "Fuse rebuilds": the panel is the fuse editor,
                 and the two words cost the rule node the width its sentence
                 needs. -->
            <span class="node-role">Rebuilds</span>
            <strong>{draftFollowerLabel}</strong>
          </span>
        </span>
      </div>
    </div>

    <div class="editor-actions">
      <PanelButton variant="secondary" onclick={cancel}>Cancel</PanelButton>
      <PanelButton variant="primary" disabled={busy} onclick={apply}>
        <i class="fas fa-link" aria-hidden="true"></i>
        Use this relationship
      </PanelButton>
    </div>
  </div>
</section>

<style>
  /* The panel holding this is 480–620px wide, and every part of the editor has
     to be visible in it at once — a form that clips itself into an inner
     scroller is the bug this layout exists to avoid. It fills the panel's width
     rather than capping short of it, so the result chain below reads across the
     same span the step cards above it do. */
  .pairing-editor {
    container-type: inline-size;
    container-name: pairing-editor;
    display: flex;
    flex-direction: column;
    gap: var(--settings-spacing-md, 14px);
    width: 100%;
    min-width: 0;
  }

  .pairing-title {
    margin: 0;
    color: var(--theme-text, #fff);
    font-size: 1.05rem;
  }

  .result-label {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.62));
    font-size: var(--font-size-compact, 12px);
    font-weight: 750;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  /* `margin-top: auto` is what puts Cancel / Use this relationship on the floor
     of the pane instead of directly under the last control, wherever the form
     happens to end.

     `sticky` covers the other half: on a pane too short for the form — a folded
     phone in landscape is 412px tall — that floor is below the fold, so the
     block rides the scroll instead of hiding under it. The scrim is what lets
     the controls pass behind it legibly. Sticky has to sit on this block rather
     than on the buttons alone: a sticky child can only travel inside its own
     parent's box, and this block's box is entirely below the fold. */
  .relationship-commit {
    position: sticky;
    bottom: 0;
    z-index: 1;
    display: grid;
    gap: var(--settings-spacing-md, 14px);
    margin-top: auto;
    padding-top: var(--settings-spacing-md, 14px);
    padding-bottom: 2px;
    /* The scrim is the pane's own solid surface, so it only shows as a scrim
       when it has controls to cover. The theme's panel colour is a translucent
       black and painted a darker box onto the pane. */
    background: var(--customize-surface-solid, var(--theme-panel-bg, #12141c));
  }

  /* A card like the two steps above it, with the same frame and the same
     inset, so the chain sits inside a plate instead of running edge to edge
     with its end nodes against the pane's sides. */
  .result {
    display: grid;
    gap: 8px;
    min-width: 0;
    padding: clamp(12px, 0.45cqw, 17px);
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: var(--settings-radius-md, 14px);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.045));
  }

  /* The chain spans the panel: the path and rule nodes share the width evenly
     and the arrows take only what they need. Content-sized nodes in a flex row
     left the right third of the panel empty, which read as the chain being cut
     short rather than as breathing room. */
  .result-chain {
    display: grid;
    /* The path nodes name one path each, so they take exactly the width of
       their words and never wrap or clip. Everything left over goes to the rule
       node, which is the one carrying a sentence. */
    grid-template-columns:
      max-content auto minmax(0, 1fr) auto
      max-content;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .result-chain > i {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    font-size: var(--font-size-compact, 12px);
  }

  .node-copy {
    display: grid;
    gap: 1px;
    min-width: 0;
  }

  .node-role {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-size: var(--font-size-compact, 12px);
  }

  .node-copy strong {
    color: var(--theme-text, #fff);
    font-size: var(--font-size-min, 14px);
    font-weight: 700;
  }

  .node-ops {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-size: var(--font-size-compact, 12px);
    line-height: 1.25;
  }

  .rule-note {
    margin: 0;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    font-size: var(--font-size-compact, 12px);
  }

  /* The mode is two words and stays on one line. The operation chain under it
     can name four operations, and "Rotate 90° + Mirror + Invert + Rewind" left
     to itself is several stacked lines — tall enough to push the controls that
     built it out of the panel. Two is the cap; the mode above it is the rule
     whether or not every operation fits. */
  .rule-node .node-copy strong {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    line-height: 1.25;
    text-align: center;
  }

  .rule-node .node-ops {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
  }

  .rule-node .node-copy {
    justify-items: center;
    text-align: center;
  }

  /* "Blue path" is one thing, so it stays on one line rather than breaking
     across two the way the rule's sentence legitimately does. */
  .path-node .node-copy strong {
    white-space: nowrap;
  }

  /* A path is identified by its prop colour, so a dot says it — no capsule, no
     tinted plate. The name stays plain text and stays readable. */
  .path-node {
    display: flex;
    align-items: center;
    gap: 9px;
    min-width: 0;
  }

  .node-dot {
    flex: 0 0 auto;
    width: 11px;
    height: 11px;
    border-radius: 50%;
    background: var(--node-color);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--node-color) 22%, transparent);
  }

  .path-node[data-side="left"] {
    --node-color: var(--prop-blue, #2196f3);
  }

  .path-node[data-side="right"] {
    --node-color: var(--prop-red, #f44336);
  }

  /* The rule is the mode you chose above, so the node looks like the chip that
     chose it: the mode's element accent and icon. The operations that realise
     the mode are named underneath in the dim line, not painted — two colour
     systems on one node had the operations shouting over the rule. */
  .rule-node {
    --rule-accent: var(--theme-accent, #8b5cf6);
    /* The icon sits ABOVE the words rather than beside them so the sentence
       keeps the node's full width. */
    display: grid;
    justify-items: center;
    gap: 4px;
    min-width: 0;
    padding: 7px 12px;
    border: 1.5px solid color-mix(in srgb, var(--rule-accent) 62%, transparent);
    border-radius: 10px;
    background: color-mix(in srgb, var(--rule-accent) 18%, transparent);
  }

  .rule-icon {
    width: 1.75rem;
    height: 1.75rem;
    object-fit: contain;
  }

  .editor-actions {
    display: grid;
    grid-template-columns: minmax(0, 0.7fr) minmax(0, 1.3fr);
    gap: 8px;
  }

  .editor-actions :global(.panel-btn) {
    width: 100%;
  }

  /* Below a 4K panel the same form has to fit a shorter box, so the first thing
     to go is the one said twice: the panel's own header already reads
     "Pairing". */
  @media (max-height: 1250px) {
    .pairing-editor {
      gap: 10px;
    }

    .pairing-title {
      display: none;
    }

    .relationship-commit {
      gap: 10px;
      padding-top: 10px;
    }

    .result {
      padding: 8px 10px;
    }
  }

  /* A 900px-tall laptop needs the rest of the chrome too. The chain nodes label
     themselves, so the eyebrow above them is the last thing worth keeping. */
  @media (max-height: 950px) {
    .result-label {
      display: none;
    }
  }

  /* A folded phone in landscape is 412px tall, and this block is sticky — every
     row it keeps is a row of controls it covers. Which path you edit is stated
     in step 1 directly above, so the chain drops to the one node that changes
     as you work — and under 480px even that goes, because the dial and the chips
     directly above already say the rule and step 1 says which path. */
  @media (max-height: 620px) {
    .result-chain {
      grid-template-columns: minmax(0, 1fr);
    }

    .result-chain > i,
    .path-node {
      display: none;
    }
  }

  @media (max-height: 480px) {
    .result {
      display: none;
    }
  }

  /* Narrow host: the chain becomes a top-to-bottom list, arrows turned to match,
     so nothing has to shrink below its own words. Keyed to the editor's own
     width rather than the viewport's, because the same editor is 620px wide in a
     drawer and 400px wide in the desktop recipe column — the viewport says
     nothing about which. */
  @container pairing-editor (max-width: 25rem) {
    .result-chain {
      grid-template-columns: minmax(0, 1fr);
      gap: 8px;
    }

    /* Stacked, the chain plus the two stacked buttons pinned together ran to a
       third of the panel and buried the chips behind them. In a column this
       narrow the chain says nothing the panel is not already saying: step 1
       names the path you edit, the dial and the chips name the rule, and the
       note under the preview states the applied relationship in full. */
    .result {
      display: none;
    }

    .editor-actions {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  /* A stacked chain makes this block a third of a phone sheet — too much to pin.
     A phone scrolls to its commands like every other phone form. */
  @media (max-width: 480px) {
    .relationship-commit {
      position: static;
      background: none;
      backdrop-filter: none;
    }
  }
</style>
