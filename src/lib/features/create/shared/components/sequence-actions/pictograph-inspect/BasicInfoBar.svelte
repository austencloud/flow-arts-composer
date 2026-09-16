<script lang="ts">
  /**
   * Basic Info Bar
   *
   * Slim full-width info bar (letter / grid mode / prop type / start→end + lookup
   * keys) shown between the inspect modal header and body. Not a column, not
   * collapsible.
   */
  import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
  import type { MotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
  import { formatBasicInfo, formatRotationOverrideKey } from "./formatters";
  import { getSettings } from "$lib/shared/application/state/app-state.svelte";

  interface LookupKeys {
    gridMode: string;
    oriKey: string;
    turnsTuple: string;
    leftRotationOverrideKey: string | null;
    rightRotationOverrideKey: string | null;
  }

  interface Props {
    displayData: StepData | null;
    leftMotion: MotionData | undefined;
    rightMotion: MotionData | undefined;
    lookupKeys: LookupKeys | null;
    copiedSection: string | null;
    onCopy: (text: string, section: string) => void;
  }

  let {
    displayData,
    leftMotion,
    rightMotion,
    lookupKeys,
    copiedSection,
    onCopy,
  }: Props = $props();

  // Active prop type reflects the current settings override (what's rendered),
  // not the stale propType stored on the motion data.
  const activePropType = $derived.by(() => {
    const s = getSettings();
    return (
      s.leftPropType ??
      leftMotion?.propType ??
      s.rightPropType ??
      rightMotion?.propType ??
      "staff"
    );
  });

  // The prop type baked into the saved motion data. When it diverges from the
  // active (rendered) prop, surface it — stale stored props explain odd placement.
  const storedPropType = $derived(
    leftMotion?.propType ?? rightMotion?.propType ?? null
  );
  const propDiffers = $derived(
    storedPropType != null &&
      storedPropType.toLowerCase() !== String(activePropType).toLowerCase()
  );
</script>

<div class="info-bar">
  <div class="basic-line">
    {#if displayData?.letter}<span class="bl letter">{displayData.letter}</span
      ><span class="sep">·</span>{/if}
    <span class="bl">{leftMotion?.gridMode ?? rightMotion?.gridMode ?? "—"}</span>
    <span class="sep">·</span>
    <span class="bl">{activePropType}</span>
    {#if propDiffers}<span
        class="bl stored"
        title="Prop type stored in the saved motion data differs from the active setting"
        >(stored: {storedPropType})</span
      >{/if}
    <span class="sep">·</span>
    <span class="bl path"
      >{displayData?.startPlacement ?? "—"} → {displayData?.endPlacement ??
        "—"}</span
    >
  </div>
  <div class="lookup">
    {#if lookupKeys}
      <span class="lk">ori_key <b>{lookupKeys.oriKey}</b></span>
      <span class="lk">turns <b>{lookupKeys.turnsTuple}</b></span>
      {#if lookupKeys.leftRotationOverrideKey}<span
          class="lk"
          title="blue rotation override key: {lookupKeys.leftRotationOverrideKey}"
          >blue rot <b
            >{formatRotationOverrideKey(lookupKeys.leftRotationOverrideKey)}</b
          ></span
        >{/if}
      {#if lookupKeys.rightRotationOverrideKey}<span
          class="lk"
          title="red rotation override key: {lookupKeys.rightRotationOverrideKey}"
          >red rot <b
            >{formatRotationOverrideKey(lookupKeys.rightRotationOverrideKey)}</b
          ></span
        >{/if}
    {/if}
    <button
      class="copy-btn"
      onclick={() =>
        onCopy(formatBasicInfo(displayData, leftMotion, rightMotion), "basic")}
      title="Copy Basic Info"
      aria-label="Copy Basic Info"
    >
      <i class="fas fa-copy" aria-hidden="true"
      ></i>{#if copiedSection === "basic"}<span class="copied">Copied!</span
        >{/if}
    </button>
  </div>
</div>

<style>
  .info-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
    padding: 10px 18px;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.015));
  }
  .basic-line {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 8px;
    font-size: var(--font-size-min, 16px);
    font-weight: 600;
    color: var(--theme-text-muted, #c9d1d9);
    font-variant-numeric: tabular-nums;
  }
  .basic-line .letter {
    color: var(--semantic-info, #79c0ff);
    font-weight: 800;
    font-size: 19px;
  }
  .basic-line .path {
    color: var(--theme-text, #fff);
  }
  .basic-line .stored {
    color: var(--semantic-warning, #d29922);
    font-size: var(--font-size-compact, 12px);
    font-weight: 500;
  }
  .basic-line .sep {
    color: var(--theme-stroke-strong, #3a4250);
  }
  .lookup {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    align-items: center;
  }
  .lk {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, #6b7480);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 6px;
    padding: 3px 8px;
    font-variant-numeric: tabular-nums;
  }
  .lk b {
    color: var(--theme-text, #c9d1d9);
    font-weight: 700;
  }
  .copy-btn {
    min-height: var(--min-touch-target, 44px);
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 0 12px;
    border-radius: 8px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    background: transparent;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    cursor: pointer;
    font-size: var(--font-size-compact, 12px);
    font-family: inherit;
  }
  .copied {
    color: var(--semantic-success, #7ee787);
    font-weight: 600;
  }
</style>
