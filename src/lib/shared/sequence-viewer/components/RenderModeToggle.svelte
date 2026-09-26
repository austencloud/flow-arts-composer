<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte";
  /**
   * RenderModeToggle
   *
   * Single rail-chip button showing the CURRENT render mode ("2D"/"3D").
   * Clicking toggles. Lives as chip #1 inside SceneControlRail in both 2D and 3D;
   * the rail animates its position between modes so this chip glides from
   * the 2D canvas top-right corner to the top of the 3D control column.
   *
   * WebGL2 capability is read from the shared `webgl-capabilities` module
   * rather than threaded through as a prop.
   */
  import { isWebGL2Available } from "$lib/shared/3d/capabilities/webgl-capabilities";

  interface Props {
    renderMode: "2d" | "3d";
    onchange: (mode: "2d" | "3d") => void;
  }

  let { renderMode, onchange }: Props = $props();
  const webgl2Available = isWebGL2Available();

  function flip(e: MouseEvent) {
    // Stop the click from reaching .animation-pane's tap-to-focus handler,
    // which would enter edit/fullscreen mode on every render-mode toggle.
    e.stopPropagation();
    onchange(renderMode === "2d" ? "3d" : "2d");
  }
</script>

{#if webgl2Available}
  <button
    type="button"
    class="rail-chip mode-chip"
    role="switch"
    aria-checked={renderMode === "3d"}
    aria-label={renderMode === "3d" ? t("viewer_detail_switch_to_2d") : t("viewer_detail_switch_to_3d")}
    data-tooltip={renderMode === "3d" ? t("viewer_detail_switch_to_2d") : t("viewer_detail_switch_to_3d")}
    data-ghost="safe"
    data-ghost-kind="curio"
    data-ghost-label={renderMode === "3d" ? "2D" : "3D"}
    onclick={flip}
  >
    <span class="mode-label">{renderMode.toUpperCase()}</span>
  </button>
{/if}

<style>
  .rail-chip {
    width: 56px;
    height: 56px;
    background: rgba(20, 22, 32, 0.78);
    backdrop-filter: blur(20px) saturate(140%);
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 14px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
    color: rgba(255, 255, 255, 0.85);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    transition: all 180ms cubic-bezier(0.2, 0, 0.13, 1.5);
  }
  .rail-chip:hover {
    color: #fff;
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.22));
    background: rgba(28, 32, 44, 0.85);
  }
  .rail-chip:focus-visible {
    outline: 2px solid rgba(120, 160, 255, 0.6);
    outline-offset: 2px;
  }
  .rail-chip:hover::after {
    content: attr(data-tooltip);
    position: absolute;
    right: calc(100% + 10px);
    top: 50%;
    transform: translateY(-50%);
    background: rgba(0, 0, 0, 0.85);
    color: white;
    padding: 6px 10px;
    border-radius: 8px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    white-space: nowrap;
    pointer-events: none;
  }
  .mode-label {
    font-size: 15px;
    font-weight: 700;
    letter-spacing: 0.04em;
  }
</style>
