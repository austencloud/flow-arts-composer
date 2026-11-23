<script lang="ts">
  /**
   * The print route's ONE piece of dev chrome: a fixed top-right toolbar with
   * every viewing toggle, so there is a single place to look at the guide
   * during development - no ?edit / ?theme URL juggling, no separate screens.
   *
   *   ✎ Edit        - drag-edit mode on/off (same state as the E hotkey);
   *                   while on, the contextual coords panel appears bottom-center
   *   Page numbers  - recto/verso footer numbers on/off
   *   Cover         - navy (foil) ↔ home (ink-cheap) edition
   *
   * Screen-only; hidden in the printout.
   */
  import { guideEdit, toggleEdit } from "../_data/guide-edit.svelte";
  import { pageNumberPrefs } from "../_data/page-number-prefs.svelte";

  let { coverTheme = $bindable("navy") }: { coverTheme?: "navy" | "light" } = $props();
</script>

<div class="dev-bar">
  <button class="tgl" aria-pressed={guideEdit.on} onclick={toggleEdit} title="Edit mode (E)">
    <span class="dot" class:on={guideEdit.on} aria-hidden="true"></span>
    ✎ Edit · {guideEdit.on ? "On" : "Off"}
  </button>
  <button
    class="tgl"
    aria-pressed={pageNumberPrefs.show}
    onclick={() => (pageNumberPrefs.show = !pageNumberPrefs.show)}
  >
    <span class="dot" class:on={pageNumberPrefs.show} aria-hidden="true"></span>
    Page numbers · {pageNumberPrefs.show ? "On" : "Off"}
  </button>
  <button
    class="tgl"
    aria-pressed={coverTheme === "light"}
    onclick={() => (coverTheme = coverTheme === "navy" ? "light" : "navy")}
    title="Cover edition: navy (foil) or home (ink-cheap)"
  >
    <span class="dot" class:on={coverTheme === "light"} aria-hidden="true"></span>
    Cover · {coverTheme === "navy" ? "Navy" : "Home"}
  </button>
</div>

<style>
  .dev-bar {
    position: fixed;
    top: calc(16px + var(--safe-top));
    right: 16px;
    z-index: 50;
    display: flex;
    gap: 8px;
  }
  .tgl {
    display: inline-flex;
    align-items: center;
    gap: 0.5em;
    font: 500 12px/1 system-ui, sans-serif;
    padding: 8px 13px;
    border-radius: 999px;
    border: 1px solid #4a4a56;
    background: #26262f;
    color: #cfcfe0;
    cursor: pointer;
  }
  .tgl:hover {
    background: #303039;
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #5a5a68;
  }
  .dot.on {
    background: #6f8cff;
  }
  @media print {
    .dev-bar {
      display: none;
    }
  }
</style>
