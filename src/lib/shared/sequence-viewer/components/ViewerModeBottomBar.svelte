<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import type { ContentType, ViewerMode } from "../state/viewer-state.svelte";
  import {
    viewerModeOptions,
    viewerModeLabel,
    PRACTICE_OPTION,
    type SelectableViewerMode,
  } from "../services/viewer-modes";
  import { canAccessPostStudio } from "../services/post-studio-access";
  import { viewportFits3D } from "$lib/shared/3d/capabilities/viewport-3d-gate.svelte";
  import NavButton from "$lib/shared/navigation/components/buttons/NavButton.svelte";

  interface Props {
    reviewPostStudio?: boolean;
    activeMode: ViewerMode;
    webgl2Available?: boolean;
    practiceActive?: boolean;
    /**
     * When false, the Side-by-Side option is dropped. The split view is
     * useless on tiny viewports (each pane shrinks below legibility), so the
     * QR scan page disables it in its portrait bottom bar.
     */
    allowSplit?: boolean;
    onSelectMode: (mode: SelectableViewerMode) => void;
    onSelectSplit: () => void;
    onPracticeToggle?: () => void;
    /** Open the full Post workspace instead of the legacy viewer pane. */
    onOpenPost?: () => void;
  }

  let {
    reviewPostStudio = false,
    activeMode,
    webgl2Available = true,
    practiceActive = false,
    allowSplit = true,
    onSelectMode,
    onSelectSplit,
    onPracticeToggle,
    onOpenPost,
  }: Props = $props();

  const modes = $derived(
    viewerModeOptions(
      webgl2Available,
      viewportFits3D(),
      canAccessPostStudio() || (import.meta.env.DEV && reviewPostStudio)
    )
      .filter((m) => allowSplit || m.id !== "split")
      .map((m) => ({
        ...m,
        label: m.id === "post-studio" && onOpenPost
          ? t("viewer_ui_edit_in_post")
          : viewerModeLabel(m.id),
      }))
  );

  function selectMode(id: ViewerMode) {
    if (id === "split") onSelectSplit();
    else if (id === "post-studio" && onOpenPost) onOpenPost();
    else onSelectMode(id as SelectableViewerMode);
  }
</script>

<nav class="viewer-bottom-bar" aria-label={t("viewer_ui_sequence_views")}>
  {#each modes as mode (mode.id)}
    <NavButton
      icon={`<i class="fas ${mode.icon}"></i>`}
      label={mode.label}
      ariaLabel={mode.label}
      active={activeMode === mode.id}
      onClick={() => selectMode(mode.id)}
    />
  {/each}
  {#if onPracticeToggle}
    <NavButton
      icon={`<i class="fas ${practiceActive ? "fa-stop" : PRACTICE_OPTION.icon}"></i>`}
      label={practiceActive ? t("viewer_ui_stop") : t("viewer_ui_practice")}
      ariaLabel={practiceActive
        ? t("viewer_ui_stop_practice")
        : t("viewer_ui_practice")}
      active={practiceActive}
      onClick={onPracticeToggle}
    />
  {/if}
</nav>

<style>
  .viewer-bottom-bar {
    display: flex;
    flex-direction: row;
    align-items: stretch;
    justify-content: space-around;
    gap: var(--spacing-xs, 4px);
    width: 100%;
    flex-shrink: 0;
    padding: 4px 6px;
    padding-bottom: calc(4px + env(safe-area-inset-bottom));
    background: var(--theme-panel-bg, #0a0a14);
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));

    /* Mirror BottomNavigation: container queries drive NavButton label visibility */
    container-type: inline-size;
    container-name: viewer-bottom-bar;
  }

  .viewer-bottom-bar :global(.nav-button) {
    flex: 1 1 0%;
    min-height: var(--min-touch-target, 44px);
  }

  /* Full labels only at 520px+. The NavButton "compact" label is identical
	   text to the full label, so a mid-width tier just renders the same long
	   strings ("2D Animation"/"3D Animation") in too little space and they
	   overlap. Below 520px we show icons only (NavButton default hides both
	   label spans) — six labels this long need ~520px to sit side by side. */
  @container viewer-bottom-bar (min-width: 520px) {
    .viewer-bottom-bar :global(.nav-label-full) {
      display: block;
    }
  }

  /* Fallback where container queries are unsupported */
  @supports not (container-type: inline-size) {
    @media (min-width: 520px) {
      .viewer-bottom-bar :global(.nav-label-full) {
        display: block;
      }
    }
  }
</style>
