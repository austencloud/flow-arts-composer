<!--
  VoiceCommandHelpOverlay

  Full-screen overlay showing available voice commands for the CURRENT context.
  Only shows commands relevant to the active module, tab, and state.

  Triggered by "what can I say", "help", or "commands" in command mode.
  Dismissed by voice ("close", "done"), tap the backdrop, or the X button.
-->
<script lang="ts">
  import { voiceControlState } from "../state/voice-control-state.svelte";
  import { navigationState } from "../../navigation/state/navigation-state.svelte";
  import { getAnimationPlaybackRef } from "../../coordinators/animation-playback-ref.svelte";
  import { getSequenceViewerRef } from "../../coordinators/sequence-viewer-ref.svelte";
  import { getGeneratorVoiceRef } from "#lib/shared/create/state/generator-voice-ref.svelte.js";
  import { MODULE_DEFINITIONS } from "../../navigation/config/module-definitions";

  const isOpen = $derived(voiceControlState.helpOverlayOpen);
  const currentModule = $derived(navigationState.currentModule);
  const currentTab = $derived(navigationState.activeTab);
  const hasPlaybackController = $derived(getAnimationPlaybackRef() !== null);
  const hasSequenceViewer = $derived(getSequenceViewerRef() !== null);

  // Get current module definition and tabs
  const currentModuleDef = $derived(
    MODULE_DEFINITIONS.find((m) => m.id === currentModule)
  );
  const currentModuleLabel = $derived(currentModuleDef?.label ?? currentModule);
  const currentTabs = $derived(currentModuleDef?.sections ?? []);

  // Module categorization for filtering
  const SEQUENCE_MODULES = new Set([
    "create",
    "browse",
    "compose",
    "learn",
    "train",
    "choreo_card",
    "choreo",
  ]);
  const SETTINGS_MODULES = new Set([
    "create",
    "browse",
    "compose",
    "learn",
    "train",
    "choreo_card",
    "choreo",
    "settings",
  ]);
  const PROP_MODULES = new Set([
    "create",
    "browse",
    "compose",
    "learn",
    "train",
    "choreo_card",
  ]);

  const isSequenceModule = $derived(SEQUENCE_MODULES.has(currentModule));
  const isSettingsModule = $derived(SETTINGS_MODULES.has(currentModule));
  const isPropModule = $derived(PROP_MODULES.has(currentModule));
  const isOnGenerateTab = $derived(
    currentModule === "create" &&
      currentTab === "generate" &&
      getGeneratorVoiceRef() !== null
  );

  interface CommandEntry {
    phrase: string;
    description: string;
  }

  interface CommandGroup {
    title: string;
    icon: string;
    commands: CommandEntry[];
  }

  // Build tab-specific navigation commands
  const tabCommands = $derived<CommandEntry[]>(
    currentTabs.length > 0
      ? currentTabs.map((tab) => ({
          phrase: `switch to ${tab.label.toLowerCase()} tab`,
          description: tab.label,
        }))
      : []
  );

  // Build the contextual command list - only groups relevant RIGHT NOW
  const commandGroups = $derived<CommandGroup[]>(buildCommandGroups());

  function buildCommandGroups(): CommandGroup[] {
    const groups: CommandGroup[] = [];

    // Always: system
    groups.push({
      title: "System",
      icon: "fa-circle-info",
      commands: [
        { phrase: "what can I say", description: "Show this help" },
        { phrase: "stop / done / bye", description: "Exit command mode" },
      ],
    });

    // Module-specific: create
    if (currentModule === "create") {
      groups.push({
        title: "Create",
        icon: "fa-pen-nib",
        commands: [
          { phrase: "undo / redo", description: "Undo or redo last step" },
          { phrase: "save", description: "Save sequence" },
          { phrase: "mirror / flip", description: "Mirror or flip sequence" },
          { phrase: "swap hands", description: "Swap left and right" },
          { phrase: "reverse", description: "Reverse step order" },
          { phrase: "rotate", description: "Rotate 90 degrees" },
          { phrase: "clear", description: "Clear sequence" },
        ],
      });
    }

    // Context: on the generate tab with generator panel mounted
    if (isOnGenerateTab) {
      groups.push({
        title: "Generator",
        icon: "fa-dice",
        commands: [
          {
            phrase: "generate / go / again",
            description: "Generate a sequence",
          },
          { phrase: "set level to 3", description: "Set parameter value" },
          { phrase: "toggle grid mode", description: "Cycle parameter values" },
          { phrase: "increase length", description: "Increment a parameter" },
          {
            phrase: "what is loop type",
            description: "Open help for a control",
          },
        ],
      });
    }

    // Context: playback controller is active
    if (hasPlaybackController) {
      groups.push({
        title: "Playback",
        icon: "fa-play",
        commands: [
          { phrase: "play / pause", description: "Toggle playback" },
          { phrase: "stop playback", description: "Stop animation" },
          { phrase: "next / previous", description: "Step forward or back" },
          { phrase: "faster / slower", description: "Adjust speed" },
          { phrase: "loop", description: "Toggle loop mode" },
          { phrase: "set bpm to 120", description: "Set specific BPM" },
          { phrase: "jump to step 3", description: "Seek to beat" },
        ],
      });
    }

    // Context: sequence viewer is open
    if (hasSequenceViewer) {
      groups.push({
        title: "Sequence",
        icon: "fa-bookmark",
        commands: [
          { phrase: "export", description: "Open export mode" },
          { phrase: "save to library", description: "Save current sequence" },
          { phrase: "share", description: "Share sequence" },
          { phrase: "edit", description: "Open in compose" },
        ],
      });
    }

    // Settings toggles - only in modules where pictograph/grid visibility matters
    if (isSettingsModule) {
      groups.push({
        title: "Settings",
        icon: "fa-sliders",
        commands: [
          { phrase: "toggle grid", description: "Show/hide grid" },
          { phrase: "toggle dark mode", description: "Switch light/dark" },
          { phrase: "show step numbers", description: "Turn on step numbers" },
          { phrase: "hide reversals", description: "Turn off reversals" },
          { phrase: "toggle TKA glyph", description: "Show/hide TKA glyph" },
          { phrase: "turn on haptics", description: "Enable haptic feedback" },
        ],
      });
    }

    // Prop selection - only in modules that render pictographs
    if (isPropModule) {
      groups.push({
        title: "Props",
        icon: "fa-fire",
        commands: [
          {
            phrase: "use poi / fans / staff",
            description: "Change both props",
          },
          { phrase: "change blue to clubs", description: "Change one hand" },
          { phrase: "change red to hoop", description: "Change other hand" },
        ],
      });
    }

    // Search - only in browse
    if (currentModule === "browse") {
      groups.push({
        title: "Search",
        icon: "fa-magnifying-glass",
        commands: [
          { phrase: "search for fire", description: "Text search" },
          { phrase: "filter by difficulty", description: "Apply filter" },
          { phrase: "sort by newest", description: "Change sort order" },
          { phrase: "clear filters", description: "Reset all filters" },
        ],
      });
    }

    // Always: UI
    groups.push({
      title: "UI",
      icon: "fa-arrows-up-down",
      commands: [
        { phrase: "scroll up / down", description: "Scroll page" },
        { phrase: "go back", description: "Navigate back" },
        { phrase: "fullscreen", description: "Toggle fullscreen" },
      ],
    });

    // Always: navigation (with specific tab commands for this module)
    const navCommands: CommandEntry[] = [
      { phrase: "go to create", description: "Switch module" },
      { phrase: "go to browse", description: "Switch module" },
    ];
    if (tabCommands.length > 0) {
      navCommands.push(...tabCommands);
    }
    groups.push({
      title: "Navigation",
      icon: "fa-compass",
      commands: navCommands,
    });

    return groups;
  }

  function handleClose() {
    voiceControlState.closeHelp();
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      handleClose();
    }
  }
</script>

{#if isOpen}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="help-backdrop"
    role="dialog"
    aria-modal="true"
    aria-label="Voice commands help"
    tabindex="-1"
    onclick={handleBackdropClick}
    onkeydown={handleKeydown}
  >
    <div class="help-panel">
      <header class="help-header">
        <div class="help-title-row">
          <i class="fas fa-microphone help-title-icon"></i>
          <h2 class="help-title">What can I say?</h2>
          <span class="context-badge"
            >{currentModuleLabel}{currentTab ? ` / ${currentTab}` : ""}</span
          >
        </div>
        <button class="close-btn" onclick={handleClose} aria-label="Close help">
          <i class="fas fa-xmark"></i>
        </button>
      </header>

      <div class="help-content themed-scrollbar">
        {#each commandGroups as group}
          <section class="command-group">
            <h3 class="group-title">
              <i class="fas {group.icon} group-icon"></i>
              {group.title}
            </h3>
            <div class="command-list">
              {#each group.commands as cmd}
                <div class="command-row">
                  <span class="command-phrase">"{cmd.phrase}"</span>
                  <span class="command-desc">{cmd.description}</span>
                </div>
              {/each}
            </div>
          </section>
        {/each}
      </div>

      <footer class="help-footer">
        <span class="footer-hint">
          Say <strong>"close"</strong> or <strong>"done"</strong> to dismiss
        </span>
      </footer>
    </div>
  </div>
{/if}

<style>
  .help-backdrop {
    /* Scoped state palette — mapped to the global success token, hex fallback. */
    --vc-active: var(--semantic-success, #22c55e);

    position: fixed;
    inset: 0;
    z-index: var(--z-toast);
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    animation: backdrop-in 0.2s ease-out;
  }

  @keyframes backdrop-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .help-panel {
    width: 100%;
    max-width: 520px;
    max-height: 80vh;
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 16px;
    display: flex;
    flex-direction: column;
    animation: panel-in 0.25s ease-out;
    overflow: hidden;
  }

  @keyframes panel-in {
    from {
      opacity: 0;
      transform: scale(0.95) translateY(12px);
    }
    to {
      opacity: 1;
      transform: scale(1) translateY(0);
    }
  }

  /* ═══ Header ═══ */

  .help-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    flex-shrink: 0;
  }

  .help-title-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .help-title-icon {
    color: var(--vc-active);
    font-size: 16px;
  }

  .help-title {
    margin: 0;
    font-size: var(--font-size-lg, 18px);
    font-weight: 700;
    color: var(--theme-text, #ffffff);
  }

  .context-badge {
    font-size: var(--font-size-compact, 12px);
    font-weight: 500;
    color: rgba(255, 255, 255, 0.4);
    background: rgba(255, 255, 255, 0.06);
    padding: 2px 8px;
    border-radius: 6px;
    white-space: nowrap;
  }

  .close-btn {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    border: none;
    background: rgba(255, 255, 255, 0.06);
    color: rgba(255, 255, 255, 0.5);
    font-size: 14px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s ease;
    flex-shrink: 0;
  }

  .close-btn:hover {
    background: rgba(255, 255, 255, 0.12);
    color: rgba(255, 255, 255, 0.8);
  }

  /* ═══ Content ═══ */

  .help-content {
    flex: 1;
    overflow-y: auto;
    padding: 12px 20px 20px;
  }

  /* ═══ Command Groups ═══ */

  .command-group {
    margin-bottom: 16px;
  }

  .command-group:last-child {
    margin-bottom: 0;
  }

  .group-title {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 8px;
    font-weight: 600;
    color: var(--theme-text, rgba(255, 255, 255, 0.9));
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-size: 0.75rem;
  }

  .group-icon {
    width: 16px;
    text-align: center;
    font-size: 12px;
    color: var(--theme-accent, var(--vc-active));
    opacity: 0.8;
  }

  .command-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .command-row {
    display: flex;
    align-items: baseline;
    gap: 12px;
    padding: 5px 0;
  }

  .command-phrase {
    font-size: var(--font-size-min, 14px);
    font-weight: 500;
    color: var(--vc-active);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .command-desc {
    font-size: var(--font-size-compact, 12px);
    color: rgba(255, 255, 255, 0.45);
  }

  /* ═══ Footer ═══ */

  .help-footer {
    padding: 12px 20px;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    text-align: center;
    flex-shrink: 0;
  }

  .footer-hint {
    font-size: var(--font-size-compact, 12px);
    color: rgba(255, 255, 255, 0.35);
  }

  .footer-hint strong {
    color: rgba(255, 255, 255, 0.55);
  }

  /* ═══ Mobile ═══ */

  @media (max-width: 768px) {
    .help-backdrop {
      padding: 12px;
      align-items: flex-end;
    }

    .help-panel {
      max-height: 85vh;
      border-radius: 16px 16px 8px 8px;
    }
  }

  /* ═══ Reduced Motion ═══ */

  @media (prefers-reduced-motion: reduce) {
    .help-backdrop {
      animation: none;
    }

    .help-panel {
      animation: none;
    }
  }
</style>
