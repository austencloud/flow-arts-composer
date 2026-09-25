<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import FontAwesomeIcon from "$lib/shared/foundation/ui/FontAwesomeIcon.svelte";
  import type { LOOPComponentInfo } from "$lib/features/create/generate/shared/domain/constants/loop-components";
  import type { RhythmGate } from "$lib/shared/create/services/loop-rhythm-gating";
  import LoopRhythmConfigurator from "./LoopRhythmConfigurator.svelte";
  import type { LoopRhythmValue } from "./loop-expanded-overlay-model";

  interface Props {
    detail: LOOPComponentInfo;
    rhythm: LoopRhythmValue;
    inversionCaption: string;
    rhythmGate: RhythmGate | null;
    isMultiSelectMode: boolean;
    idPrefix: string;
    onBack: () => void;
    onRhythmChange: (updates: Partial<LoopRhythmValue>) => void;
  }

  const props: Props = $props();
</script>

<section
  class="loop-detail themed-scrollbar"
  style="--component-color: {props.detail.color};"
  aria-label="{props.detail.label} settings"
>
  <div class="loop-detail-header">
    <button
      type="button"
      class="loop-detail-back"
      onclick={props.onBack}
      aria-label={t("create_ui_back_to_all_loop_types")}
    >
      <FontAwesomeIcon icon="fas fa-arrow-left" size="1em" />
    </button>
    <div class="loop-detail-identity">
      <div class="loop-detail-icon" aria-hidden="true">
        <FontAwesomeIcon icon={props.detail.icon} size="1em" />
      </div>
      <div class="loop-detail-copy">
        <strong>{props.detail.label}</strong>
        <span>{props.detail.description}</span>
      </div>
    </div>
  </div>

  <div class="loop-detail-controls">
    <LoopRhythmConfigurator
      component={props.detail.component}
      rhythm={props.rhythm}
      inversionCaption={props.inversionCaption}
      statusReason={!props.isMultiSelectMode &&
      props.rhythmGate &&
      !props.rhythmGate.ok
        ? props.rhythmGate.reason
        : undefined}
      idPrefix={props.idPrefix}
      onChange={props.onRhythmChange}
    />
  </div>
</section>

<style>
  .loop-detail {
    --theme-accent: var(--component-color);
    display: flex;
    height: 100%;
    min-height: 0;
    flex-direction: column;
    gap: 10px;
    padding: 2px;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .loop-detail-header {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    gap: 10px;
  }

  .loop-detail-back {
    display: flex;
    width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 1px solid
      color-mix(in srgb, var(--component-color) 55%, transparent);
    border-radius: 10px;
    background: color-mix(
      in srgb,
      var(--component-color) 16%,
      var(--theme-panel-bg, #18152a)
    );
    color: var(--theme-text, white);
    cursor: pointer;
  }

  .loop-detail-back:focus-visible {
    outline: 2px solid var(--component-color);
    outline-offset: 2px;
  }

  .loop-detail-identity {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 9px;
  }

  .loop-detail-icon {
    display: flex;
    width: 36px;
    height: 36px;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    border-radius: 9px;
    background: color-mix(in srgb, var(--component-color) 28%, transparent);
    color: var(--theme-text, white);
    font-size: 1.15rem;
  }

  .loop-detail-copy {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 1px;
  }

  .loop-detail-copy strong {
    color: var(--theme-text, white);
    font-size: var(--font-size-sm, 14px);
  }

  .loop-detail-copy span {
    overflow: hidden;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.72));
    font-size: var(--font-size-compact, 12px);
    line-height: 1.25;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .loop-detail-controls {
    min-height: 0;
    padding: 0 2px 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .loop-detail-back {
      transition: none;
    }
  }
</style>
