<!--
  TikaCompareView - Side-by-side A/B model comparison.
  Two independent conversation panels with a shared input area.
-->
<script lang="ts">
  import type { UIMessage } from "@ai-sdk/svelte";
  import type { ModelOption } from "../types";
  import TikaComparePanel from "./TikaComparePanel.svelte";
  import TikaModelSwitcher from "./TikaModelSwitcher.svelte";
  import TikaInputArea from "./TikaInputArea.svelte";

  interface Props {
    messagesA: UIMessage[];
    messagesB: UIMessage[];
    statusA: "submitted" | "streaming" | "ready" | "error";
    statusB: "submitted" | "streaming" | "ready" | "error";
    modelA: string;
    modelB: string;
    availableModels: ModelOption[];
    onModelAChange: (modelId: string) => void;
    onModelBChange: (modelId: string) => void;
    onSubmit: (question: string) => void;
    onStop: () => void;
    onExitCompare: () => void;
  }

  let {
    messagesA,
    messagesB,
    statusA,
    statusB,
    modelA,
    modelB,
    availableModels,
    onModelAChange,
    onModelBChange,
    onSubmit,
    onStop,
    onExitCompare,
  }: Props = $props();

  const modelAOption = $derived(availableModels.find((m) => m.id === modelA));
  const modelBOption = $derived(availableModels.find((m) => m.id === modelB));

  const combinedStatus = $derived<
    "submitted" | "streaming" | "ready" | "error"
  >(
    statusA === "streaming" || statusB === "streaming"
      ? "streaming"
      : statusA === "submitted" || statusB === "submitted"
        ? "submitted"
        : statusA === "error" || statusB === "error"
          ? "error"
          : "ready"
  );
</script>

<div class="compare-view">
  <div class="compare-header">
    <div class="header-side">
      <TikaModelSwitcher
        currentModel={modelA}
        {availableModels}
        onModelChange={onModelAChange}
      />
    </div>
    <button
      aria-label="Exit compare mode"
      class="exit-compare"
      onclick={onExitCompare}
    >
      <i class="fas fa-times" aria-hidden="true"></i>
      Exit Compare
    </button>
    <div class="header-side">
      <TikaModelSwitcher
        currentModel={modelB}
        {availableModels}
        onModelChange={onModelBChange}
      />
    </div>
  </div>

  <div class="compare-panels">
    {#if messagesA.length === 0 && messagesB.length === 0}
      <div class="compare-welcome">
        <p>Type a message below to send it to both models simultaneously.</p>
      </div>
    {/if}
    <TikaComparePanel
      modelLabel={modelAOption?.shortName ?? modelA}
      modelColor={modelAOption?.color ?? "#6366f1"}
      messages={messagesA}
      status={statusA}
    />
    <div class="panel-divider"></div>
    <TikaComparePanel
      modelLabel={modelBOption?.shortName ?? modelB}
      modelColor={modelBOption?.color ?? "#22c55e"}
      messages={messagesB}
      status={statusB}
    />
  </div>

  <div class="compare-input">
    <TikaInputArea status={combinedStatus} {onSubmit} {onStop} />
  </div>
</div>

<style>
  .compare-view {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
  }

  .compare-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    gap: 12px;
  }

  .header-side {
    flex: 1;
    display: flex;
    justify-content: center;
  }

  .exit-compare {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    background: transparent;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 6px;
    color: var(--theme-text-secondary, rgba(255, 255, 255, 0.6));
    font-size: var(--font-size-compact, 12px);
    cursor: pointer;
    transition:
      border-color var(--duration-fast) var(--ease-standard),
      color var(--duration-fast) var(--ease-standard);
    white-space: nowrap;
  }

  .exit-compare:hover {
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    color: var(--theme-text, #ffffff);
  }

  .compare-panels {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    position: relative;
  }

  .compare-welcome {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    color: var(--theme-text-secondary, rgba(255, 255, 255, 0.4));
    font-size: var(--font-size-min, 14px);
    text-align: center;
    pointer-events: none;
    z-index: 1;
  }

  .panel-divider {
    width: 1px;
    background: var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .compare-input {
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    padding: 8px 12px;
  }

  @media (prefers-reduced-motion: reduce) {
    .exit-compare {
      transition: none;
    }
  }
</style>
