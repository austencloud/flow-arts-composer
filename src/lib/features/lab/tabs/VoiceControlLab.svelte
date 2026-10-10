<!--
  VoiceControlLab - Test the "Hey Tika" voice control system

  Lets you start/stop the wake word detector, see live state,
  view a command log, and test commands manually.
-->
<script lang="ts">

import { getVoiceSessionAnalyzer } from "#lib/features/voice-sessions/get-voice-session-analyzer.js";
import { getVoiceSessionFormatter } from "#lib/features/voice-sessions/get-voice-session-formatter.js";
import { getVoiceSessionReplayer } from "#lib/features/voice-sessions/get-voice-session-replayer.js";
import { getVoiceSessionRepository } from "#lib/shared/voice-sessions/get-voice-session-repository.js";
import { getCommandDispatcher } from "#lib/shared/voice-control/get-command-dispatcher.js";
import { getCommandInterpreter } from "#lib/shared/voice-control/get-command-interpreter.js";
import { getVoiceSessionRecorder } from "#lib/shared/voice-control/get-voice-session-recorder.js";
import { getWakeWordDetector } from "#lib/shared/voice-control/get-wake-word-detector.js";
  import { onMount } from "svelte";
  import type { WakeWordDetector } from "#lib/shared/voice-control/services/wake-word-detector.js";
  import type { CommandInterpreter } from "#lib/shared/voice-control/services/command-interpreter.js";
  import type { CommandDispatcher } from "#lib/shared/voice-control/services/command-dispatcher.js";
  import type { VoiceSessionRecorder } from "#lib/shared/voice-control/services/voice-session-recorder.js";
  import type * as VoiceSessionFormatterModule from "#lib/features/voice-sessions/services/voice-session-formatter.js";
  import type * as VoiceSessionRepositoryModule from "#lib/shared/voice-sessions/services/voice-session-repository.js";
  import type * as VoiceSessionAnalyzerModule from "#lib/features/voice-sessions/services/voice-session-analyzer.js";
  import type { VoiceSessionReplayer } from "#lib/features/voice-sessions/services/voice-session-replayer.js";
  import type { WakeWordState } from "#lib/shared/voice-control/domain/voice-command-types.js";
  import type { VoiceSession } from "#lib/shared/voice-control/domain/voice-session-types.js";
  import { navigationState } from "#lib/shared/navigation/state/navigation-state.svelte.js";
  import { voiceControlState } from "#lib/shared/voice-control/state/voice-control-state.svelte.js";
  import SavedSessionList from "#lib/features/voice-sessions/components/SavedSessionList.svelte";
  import SessionAnalysisPanel from "#lib/features/voice-sessions/components/SessionAnalysisPanel.svelte";

  let detector: WakeWordDetector | null = null;
  let interpreter: CommandInterpreter | null = null;
  let dispatcher: CommandDispatcher | null = null;
  let sessionRecorder: VoiceSessionRecorder | null = null;
  let sessionFormatter = $state<typeof VoiceSessionFormatterModule | null>(null);
  let sessionRepository = $state<typeof VoiceSessionRepositoryModule | null>(null);
  let sessionAnalyzer = $state<typeof VoiceSessionAnalyzerModule | null>(null);
  let sessionReplayer = $state<VoiceSessionReplayer | null>(null);

  let supported = $state(false);
  let listening = $state(false);
  let wakeWordState = $state<WakeWordState>("idle");
  let manualInput = $state("");

  // Session recording state
  let recording = $state(false);
  let sessionEventCount = $state(0);
  let sessionDuration = $state("0s");
  let sessionStatusMessage = $state("");
  let durationInterval: ReturnType<typeof setInterval> | null = null;
  let sessionStartTime: number | null = null;
  let lastSession = $state<VoiceSession | null>(null);
  let copySuccess = $state(false);
  let saveSuccess = $state(false);
  let saving = $state(false);
  let refreshTrigger = $state(0);

  interface LogEntry {
    time: string;
    type: "command" | "result" | "error" | "info";
    text: string;
  }

  let log = $state<LogEntry[]>([]);

  function addLog(type: LogEntry["type"], text: string) {
    const time = new Date().toLocaleTimeString("en-US", { hour12: false });
    log = [{ time, type, text }, ...log].slice(0, 50);
  }

  onMount(() => {
    try {
      detector = getWakeWordDetector();
      interpreter = getCommandInterpreter();
      dispatcher = getCommandDispatcher();
      sessionRecorder = getVoiceSessionRecorder();
      sessionFormatter = getVoiceSessionFormatter();
      sessionRepository = getVoiceSessionRepository();
      sessionAnalyzer = getVoiceSessionAnalyzer();
      sessionReplayer = getVoiceSessionReplayer();
      supported = detector.isSupported();
      listening = detector.isListening();
      recording = sessionRecorder.isRecording();
    } catch (e) {
      addLog("error", `Failed to resolve services: ${e}`);
      return;
    }

    const unsubWakeWord = detector.onWakeWord(() => {
      addLog("info", "Wake word detected - entering command mode");
    });

    const unsubCommand = detector.onCommand(async (event) => {
      addLog("command", `"${event.command}" (confidence: ${event.confidence.toFixed(2)})`);

      if (!interpreter || !dispatcher) return;

      const context = {
        currentModule: navigationState.currentModule,
        currentTab: navigationState.activeTab,
      };

      const command = interpreter.interpret(event.command, context);

      if (command.category === "system" && command.action === "unknown") {
        addLog("error", `Unrecognized: "${event.command}"`);
        return;
      }

      addLog("info", `Interpreted: ${command.category}:${command.action} → "${command.target}"`);
      const result = await dispatcher.dispatch(command);
      addLog("result", `${result.success ? "OK" : "FAIL"}: ${result.message}`);
    });

    const unsubState = detector.onStateChange((state) => {
      wakeWordState = state;
      listening = detector?.isListening() ?? false;
    });

    addLog("info", `Initialized. Speech API supported: ${supported}`);
    if (listening) {
      addLog("info", "Already listening (started by HeyTikaListener)");
    }

    return () => {
      unsubWakeWord();
      unsubCommand();
      unsubState();
      if (durationInterval) clearInterval(durationInterval);
    };
  });

  function toggleListening() {
    if (!detector) return;
    if (detector.isListening()) {
      detector.stop();
      listening = false;
      voiceControlState.setEnabled(false);
      voiceControlState.setDetectorState("idle");
      addLog("info", "Stopped listening");
    } else {
      detector.start();
      listening = true;
      voiceControlState.setEnabled(true);
      voiceControlState.setDetectorState("listening");
      addLog("info", "Started listening");
    }
  }

  async function sendManualCommand() {
    if (!manualInput.trim() || !interpreter || !dispatcher) return;
    const text = manualInput.trim();
    manualInput = "";

    addLog("command", `Manual: "${text}"`);

    const context = {
      currentModule: navigationState.currentModule,
      currentTab: navigationState.activeTab,
    };

    const command = interpreter.interpret(text, context);

    if (command.category === "system" && command.action === "unknown") {
      addLog("error", `Unrecognized: "${text}"`);
      return;
    }

    addLog("info", `Interpreted: ${command.category}:${command.action} → "${command.target}"`);
    const result = await dispatcher.dispatch(command);
    addLog("result", `${result.success ? "OK" : "FAIL"}: ${result.message}`);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") sendManualCommand();
  }

  function clearLog() {
    log = [];
  }

  // =========================================================================
  // Session Recording
  // =========================================================================

  function toggleRecording() {
    if (!sessionRecorder) return;

    if (recording) {
      stopRecording();
    } else {
      startRecording();
    }
  }

  function startRecording() {
    if (!sessionRecorder) return;
    sessionRecorder.startSession();
    recording = true;
    sessionEventCount = 0;
    sessionStartTime = Date.now();
    sessionStatusMessage = "";
    addLog("info", "Session recording started");

    durationInterval = setInterval(() => {
      if (sessionStartTime) {
        const elapsed = Date.now() - sessionStartTime;
        const secs = Math.floor(elapsed / 1000);
        sessionDuration = secs < 60 ? `${secs}s` : `${Math.floor(secs / 60)}m ${secs % 60}s`;
      }
      // Update event count from recorder
      const current = sessionRecorder?.getCurrentSession();
      if (current) {
        sessionEventCount = current.events.length;
      }
    }, 1000);
  }

  function stopRecording() {
    if (!sessionRecorder) return;
    const session = sessionRecorder.endSession();
    recording = false;
    if (durationInterval) {
      clearInterval(durationInterval);
      durationInterval = null;
    }

    if (session) {
      lastSession = session;
      addLog("info", `Session ended: ${session.events.length} events, ${formatDuration(session.durationMs)}`);
      sessionStatusMessage = `${session.events.length} events recorded`;
    } else {
      addLog("info", "No session data");
    }
  }

  async function copySession() {
    if (!lastSession || !sessionFormatter) return;
    const markdown = sessionFormatter.formatForAnalysis(lastSession);
    try {
      await navigator.clipboard.writeText(markdown);
      copySuccess = true;
      addLog("info", "Session copied to clipboard");
      setTimeout(() => { copySuccess = false; }, 2000);
    } catch (err) {
      addLog("error", `Failed to copy: ${err}`);
    }
  }

  async function saveSession() {
    if (!lastSession || !sessionRepository) return;
    saving = true;
    try {
      await sessionRepository.saveSession(lastSession);
      saveSuccess = true;
      addLog("info", `Session saved: ${lastSession.id}`);
      refreshTrigger++;
      setTimeout(() => { saveSuccess = false; }, 2000);
    } catch (err) {
      addLog("error", `Failed to save: ${err}`);
    } finally {
      saving = false;
    }
  }

  function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    const secs = Math.floor(ms / 1000);
    if (secs < 60) return `${secs}s`;
    return `${Math.floor(secs / 60)}m ${secs % 60}s`;
  }

  const stateColors: Record<WakeWordState, string> = {
    idle: "#64748b",
    listening: "#22c55e",
    command_mode: "#3b82f6",
    processing: "#f59e0b",
    error: "#ef4444",
  };
</script>

<div class="voice-lab">
  <header class="lab-header">
    <h1>Voice Control Lab</h1>
    <p class="subtitle">Test "Hey Tika" wake word detection and command dispatch</p>
  </header>

  <div class="lab-content">
    <!-- Status -->
    <section class="status-section">
      <h2>Status</h2>
      <div class="state-display">
        <div class="state-row">
          <span class="label">Speech API</span>
          <span class="value" class:success={supported} class:fail={!supported}>
            {supported ? "Supported" : "Not supported"}
          </span>
        </div>
        <div class="state-row">
          <span class="label">Detector State</span>
          <span class="value" style="color: {stateColors[wakeWordState]}">
            {wakeWordState.toUpperCase()}
          </span>
        </div>
        <div class="state-row">
          <span class="label">Command Mode</span>
          <span class="value" style="color: {voiceControlState.commandMode ? '#3b82f6' : '#64748b'}">
            {voiceControlState.commandMode ? "ACTIVE (mic hot)" : "OFF"}
          </span>
        </div>
        <div class="state-row">
          <span class="label">Current Module</span>
          <span class="value">{navigationState.currentModule}</span>
        </div>
        <div class="state-row">
          <span class="label">Current Tab</span>
          <span class="value">{navigationState.activeTab || "(none)"}</span>
        </div>
      </div>
    </section>

    <!-- Controls -->
    <section class="controls-section">
      <h2>Controls</h2>
      <div class="button-grid">
        <button
          class="lab-button"
          class:primary={!listening}
          class:danger={listening}
          onclick={toggleListening}
          disabled={!supported}
        >
          <i class="fas {listening ? 'fa-microphone-slash' : 'fa-microphone'}"></i>
          {listening ? "Stop Listening" : "Start Listening"}
        </button>
        <button class="lab-button" onclick={clearLog}>
          <i class="fas fa-trash"></i>
          Clear Log
        </button>
      </div>
    </section>

    <!-- Session Recording -->
    <section class="session-section">
      <h2>Session Recording</h2>
      <div class="session-controls">
        <button
          class="lab-button"
          class:danger={recording}
          class:primary={!recording}
          onclick={toggleRecording}
        >
          <i class="fas {recording ? 'fa-stop' : 'fa-circle'}" style="color: var(--semantic-error)"></i>
          {recording ? "Stop Recording" : "Record Session"}
        </button>

        {#if recording}
          <div class="session-status">
            <span class="recording-indicator"></span>
            <span class="session-stat">{sessionDuration}</span>
            <span class="session-stat">{sessionEventCount} events</span>
          </div>
        {/if}

        {#if lastSession && !recording}
          <button
            class="lab-button"
            onclick={copySession}
            disabled={copySuccess}
          >
            <i class="fas {copySuccess ? 'fa-check' : 'fa-copy'}"></i>
            {copySuccess ? "Copied" : "Copy for AI"}
          </button>
          <button
            class="lab-button"
            onclick={saveSession}
            disabled={saving || saveSuccess}
          >
            <i class="fas {saveSuccess ? 'fa-check' : 'fa-cloud-upload-alt'}"></i>
            {saveSuccess ? "Saved" : saving ? "Saving..." : "Save Session"}
          </button>
        {/if}
      </div>

      {#if lastSession && !recording}
        <div class="session-summary">
          <div class="state-row">
            <span class="label">Events</span>
            <span class="value">{lastSession.stats.totalEvents}</span>
          </div>
          <div class="state-row">
            <span class="label">Success</span>
            <span class="value" style="color: var(--semantic-success)">{lastSession.stats.successCount}</span>
          </div>
          <div class="state-row">
            <span class="label">Failed</span>
            <span class="value" style="color: var(--semantic-error)">{lastSession.stats.failureCount}</span>
          </div>
          <div class="state-row">
            <span class="label">Unresolved</span>
            <span class="value" style="color: var(--semantic-warning)">{lastSession.stats.unresolvedCount}</span>
          </div>
          <div class="state-row">
            <span class="label">Avg Latency</span>
            <span class="value">{lastSession.stats.avgLatencyMs}ms</span>
          </div>
        </div>
      {/if}

      {#if sessionStatusMessage && !recording}
        <p class="hint">{sessionStatusMessage}</p>
      {/if}
    </section>

    <!-- Saved Sessions -->
    {#if sessionRepository && sessionFormatter}
      <SavedSessionList
        repository={sessionRepository}
        formatter={sessionFormatter}
        replayer={sessionReplayer}
        {refreshTrigger}
      />
    {/if}

    <!-- Pattern Analysis -->
    {#if sessionRepository && sessionAnalyzer}
      <SessionAnalysisPanel
        repository={sessionRepository}
        analyzer={sessionAnalyzer}
      />
    {/if}

    <!-- Manual input -->
    <section class="manual-section">
      <h2>Manual Command</h2>
      <p class="hint">Type a command as if you just said "Hey Tika, ..." (don't include the wake word)</p>
      <div class="manual-input-row">
        <input
          type="text"
          bind:value={manualInput}
          onkeydown={handleKeydown}
          placeholder="go to compose"
          class="manual-input"
        />
        <button class="lab-button primary" onclick={sendManualCommand} disabled={!manualInput.trim()}>
          <i class="fas fa-paper-plane"></i>
          Send
        </button>
      </div>
    </section>

    <!-- Command reference -->
    <section class="reference-section">
      <h2>Supported Commands</h2>
      <div class="reference-grid">
        <div class="ref-group">
          <h3>Module Navigation</h3>
          <ul>
            <li>"go to compose"</li>
            <li>"open browse"</li>
            <li>"navigate to train"</li>
            <li>"show settings"</li>
          </ul>
        </div>
        <div class="ref-group">
          <h3>Tab Switching</h3>
          <ul>
            <li>"switch to manage"</li>
            <li>"go to gallery tab"</li>
            <li>"open concepts tab"</li>
            <li>"switch to construct"</li>
          </ul>
        </div>
        <div class="ref-group">
          <h3>Command Mode</h3>
          <ul>
            <li>Say "Hey Tika" alone to enter</li>
            <li>All speech becomes commands</li>
            <li>Auto-exits after 15s of silence</li>
          </ul>
        </div>
        <div class="ref-group">
          <h3>Exit Command Mode</h3>
          <ul>
            <li>"stop" / "stop listening"</li>
            <li>"done" / "exit" / "cancel"</li>
            <li>"bye tika" / "goodbye"</li>
          </ul>
        </div>
      </div>
    </section>

    <!-- Log -->
    <section class="log-section">
      <h2>Event Log</h2>
      <div class="log-container themed-scrollbar">
        {#if log.length === 0}
          <div class="log-empty">No events yet. Say "Hey Tika" or use manual input.</div>
        {:else}
          {#each log as entry}
            <div class="log-entry {entry.type}">
              <span class="log-time">{entry.time}</span>
              <span class="log-badge {entry.type}">{entry.type}</span>
              <span class="log-text">{entry.text}</span>
            </div>
          {/each}
        {/if}
      </div>
    </section>
  </div>
</div>

<style>
  .voice-lab {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 24px;
    overflow-y: auto;
  }

  .lab-header {
    margin-bottom: 24px;
  }

  .lab-header h1 {
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--theme-text, white);
    margin: 0 0 8px;
  }

  .subtitle {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-size: var(--font-size-sm, 14px);
    margin: 0;
  }

  .lab-content {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  section {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 12px;
    padding: 16px;
  }

  section h2 {
    font-size: var(--font-size-sm, 14px);
    font-weight: 600;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin: 0 0 12px;
  }

  .state-display {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .state-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    background: rgba(0, 0, 0, 0.2);
    border-radius: 6px;
  }

  .label {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-size: var(--font-size-sm, 14px);
  }

  .value {
    color: var(--theme-text, white);
    font-weight: 600;
    font-size: var(--font-size-sm, 14px);
    font-family: monospace;
  }

  .value.success { color: #22c55e; }
  .value.fail { color: #ef4444; }

  .button-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .lab-button {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    min-height: var(--min-touch-target);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.15));
    border-radius: 8px;
    color: var(--theme-text, white);
    font-size: var(--font-size-sm, 14px);
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .lab-button:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.25);
  }

  .lab-button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .lab-button.primary {
    background: var(--theme-accent-strong, #8b5cf6);
    border-color: var(--theme-accent-strong, #8b5cf6);
  }

  .lab-button.primary:hover:not(:disabled) {
    background: color-mix(in srgb, var(--theme-accent-strong, #8b5cf6) 85%, white);
  }

  .lab-button.danger {
    background: rgba(239, 68, 68, 0.15);
    border-color: rgba(239, 68, 68, 0.3);
    color: #ef4444;
  }

  .lab-button.danger:hover:not(:disabled) {
    background: rgba(239, 68, 68, 0.25);
  }

  /* Session recording */
  .session-controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
  }

  .session-status {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.2);
    border-radius: 8px;
  }

  .recording-indicator {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #ef4444;
    animation: pulse 1.5s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }

  .session-stat {
    color: var(--theme-text, white);
    font-size: var(--font-size-compact, 12px);
    font-family: monospace;
    font-weight: 600;
  }

  .session-summary {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  /* Manual input */
  .hint {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    font-size: var(--font-size-compact, 12px);
    margin: 0 0 10px;
  }

  .manual-input-row {
    display: flex;
    gap: 8px;
  }

  .manual-input {
    flex: 1;
    padding: 10px 14px;
    min-height: var(--min-touch-target);
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.15));
    border-radius: 8px;
    color: var(--theme-text, white);
    font-size: var(--font-size-sm, 14px);
    font-family: monospace;
    outline: none;
  }

  .manual-input::placeholder {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.3));
  }

  .manual-input:focus {
    border-color: var(--theme-accent, #8b5cf6);
  }

  /* Reference */
  .reference-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }

  .ref-group h3 {
    font-size: var(--font-size-sm, 14px);
    font-weight: 600;
    color: var(--theme-text, white);
    margin: 0 0 8px;
  }

  .ref-group ul {
    margin: 0;
    padding: 0 0 0 16px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-size: var(--font-size-compact, 12px);
    font-family: monospace;
    line-height: 1.8;
  }

  /* Log */
  .log-container {
    max-height: 300px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .log-empty {
    text-align: center;
    padding: 24px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
    font-size: var(--font-size-sm, 14px);
  }

  .log-entry {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    background: rgba(0, 0, 0, 0.15);
    border-radius: 4px;
    font-size: var(--font-size-compact, 12px);
    font-family: monospace;
  }

  .log-time {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.4));
    flex-shrink: 0;
  }

  .log-badge {
    padding: 1px 6px;
    border-radius: 3px;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    flex-shrink: 0;
  }

  .log-badge.command { background: rgba(59, 130, 246, 0.2); color: #60a5fa; }
  .log-badge.result { background: rgba(34, 197, 94, 0.2); color: #4ade80; }
  .log-badge.error { background: rgba(239, 68, 68, 0.2); color: #f87171; }
  .log-badge.info { background: rgba(148, 163, 184, 0.2); color: #94a3b8; }

  .log-text {
    color: var(--theme-text, white);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @media (max-width: 600px) {
    .voice-lab {
      padding: 16px;
    }

    .reference-grid {
      grid-template-columns: 1fr;
    }

    .manual-input-row {
      flex-direction: column;
    }

    .button-grid {
      flex-direction: column;
    }

    .lab-button {
      width: 100%;
      justify-content: center;
    }
  }
</style>
