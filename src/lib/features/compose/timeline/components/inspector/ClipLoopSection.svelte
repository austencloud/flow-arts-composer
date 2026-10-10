<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  /**
   * ClipLoopSection - Loop toggle and count controls
   */

  interface Props {
    loop: boolean;
    loopCount: number;
    onUpdateLoop: (enabled: boolean) => void;
    onUpdateLoopCount: (count: number) => void;
  }

  let { loop, loopCount, onUpdateLoop, onUpdateLoopCount }: Props = $props();
</script>

<section class="section">
  <div class="section-header">
    <i class="fa-solid fa-repeat" aria-hidden="true"></i>
    <span>{t("compose_ui_loop")}</span>
  </div>

  <label class="toggle-row">
    <span>{t("compose_ui_enable_looping")}</span>
    <input
      type="checkbox"
      checked={loop}
      onchange={(e) => onUpdateLoop((e.target as HTMLInputElement).checked)}
    />
  </label>

  {#if loop}
    <div class="field">
      <label class="field-label" for="loop-count"
        >Loop Count (0 = infinite)</label
      >
      <input
        id="loop-count"
        type="number"
        class="number-input wide"
        min="0"
        max="100"
        value={loopCount}
        onchange={(e) =>
          onUpdateLoopCount(parseInt((e.target as HTMLInputElement).value))}
      />
    </div>
  {/if}
</section>

<style>
  .section {
    margin-bottom: 20px;
  }

  .section-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-bottom: 8px;
    margin-bottom: 12px;
    border-bottom: 1px solid var(--theme-stroke);
    font-size: var(--font-size-compact);
    font-weight: 600;
    color: var(--theme-text);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .section-header i {
    font-size: var(--font-size-compact);
    opacity: 0.6;
  }

  .field {
    margin-bottom: 12px;
  }

  .number-input {
    width: 60px;
    padding: 6px 8px;
    background: var(--theme-input-bg);
    border: 1px solid var(--theme-stroke, var(--theme-stroke));
    border-radius: 4px;
    font-size: var(--font-size-compact);
    color: var(--theme-text, var(--theme-text));
    text-align: center;
  }

  .field-label {
    display: block;
    margin-bottom: 6px;
    font-size: var(--font-size-compact);
    color: var(--theme-text-muted, var(--theme-text-dim));
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  .number-input.wide {
    width: 100%;
  }

  .toggle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 10px;
    background: var(--theme-card-bg);
    border-radius: 6px;
    font-size: var(--font-size-compact);
    color: var(--theme-text);
    cursor: pointer;
    margin-bottom: 12px;
  }

  .toggle-row input[type="checkbox"] {
    width: 16px;
    height: 16px;
    accent-color: var(--theme-accent);
  }
</style>
