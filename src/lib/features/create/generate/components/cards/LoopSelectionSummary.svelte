<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import type { LOOPSpecWire } from "@tka/sequence-engine/loop";

  import LoopBlockTimeline from "#lib/shared/components/LoopBlockTimeline.svelte";
  import type { GuestLoopLock } from "#lib/shared/create/services/loop-guest-gate.js";
  import type { RhythmGate } from "#lib/shared/create/services/loop-rhythm-gating.js";
  import { blockSignatures } from "#lib/shared/create/services/loop-block-signatures.js";
  import { flyFade, motionDuration } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";

  interface Props {
    wordMathText: string | null;
    specWire: LOOPSpecWire | null;
    explanationText: string;
    isImplemented: boolean;
    selectionCount: number;
    guestLock: GuestLoopLock;
    rhythmGate: RhythmGate | null;
    buttonText: string;
    onConfirm: () => void;
  }

  const props: Props = $props();
  const applyDisabled = $derived(
    props.selectionCount === 0 ||
      !props.isImplemented ||
      (!props.guestLock.locked &&
        props.rhythmGate !== null &&
        !props.rhythmGate.ok)
  );

  const rhythmReason = $derived.by(() => {
    const gate = props.rhythmGate;
    if (!gate || gate.ok) return "";
    if (gate.reason.startsWith("No LOOP type"))
      return t("create_deep_loop_no_match");
    if (gate.reason.startsWith("Too short"))
      return t("create_deep_loop_too_short");
    const match = gate.reason.match(
      /^(\d+) beats can't split into (\d+) equal parts$/
    );
    return match
      ? t("create_deep_loop_cannot_split", { beats: match[1], parts: match[2] })
      : gate.reason;
  });

  const guestReason = $derived.by(() => {
    if (!props.guestLock.locked) return "";
    if (props.guestLock.kind === "category")
      return t("create_deep_loop_guest_category");
    const match = props.guestLock.reason.match(
      /at least (\d+) steps\. Guests cap at (\d+)/
    );
    return match
      ? t("create_deep_loop_guest_length", {
          minimum: match[1],
          maximum: match[2],
        })
      : props.guestLock.reason;
  });
</script>

<div
  class="combo-details desktop-combo-details themed-scrollbar"
  in:flyFade={{
    y: 8,
    delay: motionDuration(DURATION.instant),
    duration: DURATION.normal,
  }}
>
  {#if props.wordMathText}
    <div class="word-math">
      <span class="word-math-sizer" aria-hidden="true">
        {t("create_deep_loop_too_short")}
      </span>
      <span class="word-math-live">{props.wordMathText}</span>
    </div>
  {/if}

  {#if props.specWire}
    <LoopBlockTimeline model={blockSignatures(props.specWire)} />
  {/if}

  <div class="explanation-section">
    <p class="explanation-text">{props.explanationText}</p>
    {#if !props.isImplemented && props.selectionCount > 0}
      <div class="coming-soon-badge">
        {t("create_deep_loop_no_match_hint")}
      </div>
    {:else if props.guestLock.locked}
      <div class="signup-badge">{guestReason}</div>
    {:else if props.rhythmGate && !props.rhythmGate.ok}
      <div class="coming-soon-badge">{rhythmReason}</div>
    {/if}
  </div>
</div>

{#if !props.isImplemented && props.selectionCount > 0}
  <div class="mobile-loop-status coming-soon-badge">
    {t("create_deep_loop_no_match_hint")}
  </div>
{:else if props.guestLock.locked}
  <div class="mobile-loop-status signup-badge">
    {guestReason}
  </div>
{:else if props.rhythmGate && !props.rhythmGate.ok}
  <div class="mobile-loop-status coming-soon-badge">
    {rhythmReason}
  </div>
{/if}

<div
  class="apply-dock"
  in:flyFade={{
    y: 8,
    delay: motionDuration(DURATION.fast),
    duration: DURATION.normal,
  }}
>
  <button
    class="apply-button"
    class:locked={props.guestLock.locked}
    class:disabled={applyDisabled}
    onclick={props.onConfirm}
    disabled={applyDisabled}
  >
    {props.buttonText}
  </button>
</div>

<style>
  .combo-details {
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    gap: 10px;
  }

  .explanation-section {
    display: flex;
    flex-shrink: 0;
    flex-direction: column;
    gap: 8px;
  }

  .explanation-text {
    margin: 0;
    padding: 10px 12px;
    border-radius: 8px;
    background: rgba(0, 0, 0, 0.2);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    font-size: var(--font-size-sm, 14px);
    line-height: 1.4;
  }

  .coming-soon-badge,
  .signup-badge {
    padding: 6px 10px;
    border-radius: 6px;
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    text-align: center;
  }

  .coming-soon-badge {
    border: 1px solid
      color-mix(in srgb, var(--semantic-warning) 50%, transparent);
    background: color-mix(in srgb, var(--semantic-warning) 20%, transparent);
    color: var(--semantic-warning);
  }

  .signup-badge {
    border: 1px solid color-mix(in srgb, var(--theme-accent) 55%, transparent);
    background: color-mix(in srgb, var(--theme-accent) 18%, transparent);
    color: var(--theme-text, white);
  }

  .word-math {
    display: grid;
    margin: 0;
    color: var(--theme-text, white);
    font-size: var(--font-size-sm, 14px);
    font-variant-numeric: tabular-nums;
    font-weight: 700;
    text-align: center;
  }

  .word-math-sizer,
  .word-math-live {
    grid-area: 1 / 1;
  }

  .word-math-sizer {
    visibility: hidden;
  }

  .mobile-loop-status {
    display: none;
  }

  .apply-dock {
    position: sticky;
    bottom: 0;
    z-index: 5;
    flex-shrink: 0;
    margin: 0 -12px -12px;
    padding: 8px 12px 12px;
    background: color-mix(
      in srgb,
      var(--theme-accent-strong, #6366f1) 20%,
      #1a1a2e
    );
  }

  .apply-button {
    width: 100%;
    min-height: var(--min-touch-target);
    flex-shrink: 0;
    padding: 12px 20px;
    border: 2px solid var(--theme-accent);
    border-radius: 10px;
    background: color-mix(in srgb, var(--theme-accent) 30%, transparent);
    color: var(--theme-text, white);
    cursor: pointer;
    font-size: var(--font-size-base, 16px);
    font-weight: 700;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    transition: all var(--duration-normal) ease;
  }

  .apply-button:hover:not(:disabled) {
    background: color-mix(in srgb, var(--theme-accent) 45%, transparent);
    transform: translateY(-1px);
  }

  .apply-button:disabled,
  .apply-button.disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .apply-button.locked {
    opacity: 1;
    background: color-mix(in srgb, var(--theme-accent) 55%, transparent);
    cursor: pointer;
  }

  @media (max-width: 768px) {
    .desktop-combo-details {
      display: none;
    }

    .mobile-loop-status {
      display: block;
      flex: 0 0 auto;
    }
  }

  @media (min-width: 769px) and (max-width: 1023px) {
    :global(.loop-drawer-sheet[data-placement="bottom"])
      .desktop-combo-details {
      display: none;
    }

    :global(.loop-drawer-sheet[data-placement="bottom"]) .mobile-loop-status {
      display: block;
      flex: 0 0 auto;
    }
  }

  @media (min-width: 769px) and (max-height: 700px) {
    :global(.loop-drawer-sheet[data-placement="right"]) .desktop-combo-details {
      display: none;
    }

    :global(.loop-drawer-sheet[data-placement="right"]) .mobile-loop-status {
      display: block;
      flex: 0 0 auto;
    }
  }

  @media (max-width: 768px) and (max-height: 700px) {
    .explanation-text {
      display: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .apply-button {
      transition: none;
    }
  }
</style>
