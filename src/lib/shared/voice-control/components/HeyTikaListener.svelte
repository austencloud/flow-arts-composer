<!--
  HeyTikaListener

  Invisible component that orchestrates the "Hey Tika" voice control pipeline.

  Three-tier intent resolution:
  - Tier 1 (Fast): Regex-based sub-interpreters. 0ms, $0. Handles known phrases.
  - Tier 2 (Smart): LLM-powered resolution via Haiku. ~400ms, ~$0.0004. Natural language fallback.
  - Tier 3 (Rich): Route to TIKA chat for questions. (Phase 4)

  Flow:
  1. Starts in wake word mode (listening for "Hey Tika")
  2. "Hey Tika [command]" → interpret + dispatch immediately
  3. "Hey Tika" alone → enters command mode (mic is hot, everything is a command)
  4. In command mode, "stop"/"done"/etc → exits command mode
  5. Command mode auto-expires after 15s of no commands
  6. Unknown commands → classify tier → Tier 2 LLM or Tier 3 chat
-->
<script lang="ts">

import { getVoiceSessionRepository } from "#lib/shared/voice-sessions/get-voice-session-repository.js";
import { getCommandDispatcher } from "#lib/shared/voice-control/get-command-dispatcher.js";
import { getCommandInterpreter } from "#lib/shared/voice-control/get-command-interpreter.js";
import { resolveIntent } from "#lib/shared/voice-control/services/llm-intent-resolver.js";
import { getTTSProvider } from "#lib/shared/voice-control/get-tts-provider.js";
import { getVoiceSessionRecorder } from "#lib/shared/voice-control/get-voice-session-recorder.js";
import { getWakeWordDetector } from "#lib/shared/voice-control/get-wake-word-detector.js";
  import { onMount } from "svelte";
  import type { WakeWordDetector } from "#lib/shared/voice-control/services/wake-word-detector.js";
  import type { CommandInterpreter } from "#lib/shared/voice-control/services/command-interpreter.js";
  import type { CommandDispatcher } from "../services/command-dispatcher";
  import type { WebSpeechTTSProvider } from "#lib/shared/voice-control/services/web-speech-tts-provider.js";
  import type { VoiceSessionRecorder } from "../services/voice-session-recorder";
  import type * as VoiceSessionRepositoryModule from "#lib/shared/voice-sessions/services/voice-session-repository.js";
  import { navigationState } from "../../navigation/state/navigation-state.svelte";
  import { voiceControlState } from "../state/voice-control-state.svelte";
  import { classifyTier } from "../ai/tier-classifier";
  import type { VoiceCommand } from "../domain/voice-command-types";

  let wakeWordDetector: WakeWordDetector | null = null;
  let commandInterpreter: CommandInterpreter | null = null;
  let commandDispatcher: CommandDispatcher | null = null;
  let ttsProvider: WebSpeechTTSProvider | null = null;
  let sessionRecorder: VoiceSessionRecorder | null = null;
  let sessionRepository: typeof VoiceSessionRepositoryModule | null = null;

  function getContext() {
    return {
      module: navigationState.currentModule,
      tab: navigationState.activeTab,
    };
  }

  function enterCommandMode() {
    // Auto-start recording when command mode is entered
    if (sessionRecorder && !sessionRecorder.isRecording()) {
      sessionRecorder.startSession();
    }

    // voiceControlState.enterCommandMode() calls onEnterCommandMode callback,
    // which tells the detector to setCommandMode(true)
    voiceControlState.enterCommandMode();
  }

  function exitCommandMode() {
    // Auto-end recording when command mode exits
    if (sessionRecorder?.isRecording()) {
      sessionRecorder.endSession();
      // Session save is handled by the onSessionEnded callback
    }

    // voiceControlState.exitCommandMode() triggers the onCommandModeExpired callback,
    // which tells the detector to setCommandMode(false). Single path for all exits.
    voiceControlState.exitCommandMode();
  }

  /**
   * Tier 2: LLM-powered intent resolution.
   * Called when regex chain returns "unknown" and tier classifier says "action".
   */
  async function resolveTier2(rawText: string, rawEvent: string, startMs: number) {
    if (!commandDispatcher) return;

    const context = {
      currentModule: navigationState.currentModule,
      currentTab: navigationState.activeTab,
    };

    // Show "Understanding..." while LLM processes
    voiceControlState.showFeedback("info", "Understanding...", rawEvent);

    // Pass previous command for conversational context ("do that again", "make it longer")
    const lastCommands = voiceControlState.lastResolvedCommands;
    const previousCommand = lastCommands.length > 0 ? lastCommands[lastCommands.length - 1] : undefined;

    const resolution = await resolveIntent(rawText, context, previousCommand);

    // If LLM says this is a question, route to Tier 3 (voice-to-chat)
    if (resolution.escalateToChat) {
      await resolveTier3(rawText, rawEvent, startMs);
      return;
    }

    // Check if LLM couldn't resolve it either
    const firstCommand = resolution.commands[0];
    const isUnknown = resolution.commands.length === 1
      && firstCommand?.category === "system"
      && firstCommand?.action === "unknown";

    if (isUnknown || resolution.commands.length === 0) {
      voiceControlState.showFeedback("error", `"${rawText}"?`, rawEvent);

      // Record unresolved event
      sessionRecorder?.recordEvent({
        transcript: rawText,
        speechConfidence: 0,
        tier: "unresolved",
        interpretedCommand: null,
        dispatchResult: null,
        context: getContext(),
        latencyMs: Math.round(performance.now() - startMs),
        llmDetails: {
          escalatedToChat: false,
          confidence: resolution.confidence,
          commandCount: 0,
        },
      });
      return;
    }

    // Store for conversational context (Phase 3)
    voiceControlState.setLastResolvedCommands(resolution.commands);

    // Dispatch all resolved commands sequentially
    for (const command of resolution.commands) {
      const result = await commandDispatcher.dispatch(command);
      voiceControlState.refreshCommandModeTimer();

      // Record Tier 2 event
      sessionRecorder?.recordEvent({
        transcript: rawText,
        speechConfidence: 0,
        tier: "tier2_llm",
        interpretedCommand: command,
        dispatchResult: result,
        context: getContext(),
        latencyMs: Math.round(performance.now() - startMs),
        llmDetails: {
          escalatedToChat: false,
          confidence: resolution.confidence,
          commandCount: resolution.commands.length,
        },
      });

      if (result.success) {
        voiceControlState.showFeedback("success", result.message, rawEvent);
      } else {
        console.warn(`[HeyTika] Command failed: ${result.message}`);
        voiceControlState.showFeedback("error", result.message, rawEvent);
      }
    }
  }

  /**
   * Tier 3: Voice-to-chat for questions.
   * Sends the question to /api/tika/ask, collects the streamed response,
   * speaks it via TTS, and shows a chat bubble.
   */
  async function resolveTier3(rawText: string, rawEvent: string, startMs: number) {
    voiceControlState.showFeedback("info", "Thinking...", rawEvent);
    voiceControlState.refreshCommandModeTimer();

    try {
      const response = await fetch("/api/tika/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: rawText,
          model: "haiku",
        }),
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) {
        voiceControlState.showFeedback("error", "Couldn't get an answer", rawEvent);

        sessionRecorder?.recordEvent({
          transcript: rawText,
          speechConfidence: 0,
          tier: "tier3_chat",
          interpretedCommand: null,
          dispatchResult: { success: false, message: `HTTP ${response.status}` },
          context: getContext(),
          latencyMs: Math.round(performance.now() - startMs),
        });
        return;
      }

      // Collect the streamed response text
      const responseText = await collectStreamedText(response);

      if (!responseText) {
        voiceControlState.showFeedback("error", "No response", rawEvent);

        sessionRecorder?.recordEvent({
          transcript: rawText,
          speechConfidence: 0,
          tier: "tier3_chat",
          interpretedCommand: null,
          dispatchResult: { success: false, message: "Empty response" },
          context: getContext(),
          latencyMs: Math.round(performance.now() - startMs),
        });
        return;
      }

      // Truncate for display (bubble is small)
      const displayText = responseText.length > 200
        ? responseText.slice(0, 200) + "..."
        : responseText;

      // Show chat bubble and speak
      voiceControlState.showChatBubble(displayText, true);
      voiceControlState.clearFeedback();
      voiceControlState.refreshCommandModeTimer();

      let spokeTTS = false;
      if (ttsProvider?.isSupported()) {
        await ttsProvider.speak(responseText);
        spokeTTS = true;
      }

      voiceControlState.setChatBubbleSpeaking(false);

      // Record Tier 3 event
      sessionRecorder?.recordEvent({
        transcript: rawText,
        speechConfidence: 0,
        tier: "tier3_chat",
        interpretedCommand: null,
        dispatchResult: { success: true, message: "Chat responded" },
        context: getContext(),
        latencyMs: Math.round(performance.now() - startMs),
        chatDetails: {
          responseText,
          spokeTTS,
        },
      });
    } catch (error) {
      console.warn("[HeyTika] Tier 3 failed:", error);
      voiceControlState.showFeedback("error", "Couldn't get an answer", rawEvent);

      sessionRecorder?.recordEvent({
        transcript: rawText,
        speechConfidence: 0,
        tier: "tier3_chat",
        interpretedCommand: null,
        dispatchResult: { success: false, message: String(error) },
        context: getContext(),
        latencyMs: Math.round(performance.now() - startMs),
      });
    }
  }

  /**
   * Collect text from a streamed AI SDK response.
   * The AI SDK streams UI messages as newline-delimited JSON.
   * We extract text content from the stream.
   */
  async function collectStreamedText(response: Response): Promise<string> {
    const reader = response.body?.getReader();
    if (!reader) return "";

    const decoder = new TextDecoder();
    let fullText = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });

        // AI SDK streams text parts as lines like: 0:"text content"
        // Parse text delta lines (format: 0:"chunk")
        for (const line of chunk.split("\n")) {
          const trimmed = line.trim();
          if (trimmed.startsWith("0:")) {
            try {
              const textContent = JSON.parse(trimmed.slice(2));
              if (typeof textContent === "string") {
                fullText += textContent;
              }
            } catch {
              // Not valid JSON, skip
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return fullText.trim();
  }

  onMount(() => {
    try {
      wakeWordDetector = getWakeWordDetector();
      commandInterpreter = getCommandInterpreter();
      commandDispatcher = getCommandDispatcher();
      ttsProvider = getTTSProvider();
      sessionRecorder = getVoiceSessionRecorder();
      sessionRepository = getVoiceSessionRepository();
    } catch (error) {
      console.error("[HeyTika] Failed to resolve voice control services:", error);
      return;
    }

    // Auto-save sessions when they end (always-on recording)
    sessionRecorder.onSessionEnded(async (session) => {
      if (session.events.length === 0) {
        return;
      }

      try {
        await sessionRepository!.saveSession(session);

        // Enforce session limit in background (don't block)
        sessionRepository!.enforceSessionLimit().catch((err) => {
          console.warn("[HeyTika] Session limit enforcement failed:", err);
        });
      } catch (error) {
        console.warn("[HeyTika] Auto-save failed:", error);
      }
    });

    voiceControlState.setSupported(wakeWordDetector.isSupported());

    if (!wakeWordDetector.isSupported()) {
      console.warn("[HeyTika] Web Speech API not supported. Voice control disabled.");
      return;
    }

    // Bridge state callbacks → detector
    voiceControlState.setOnCommandModeExpired(() => {
      wakeWordDetector?.setCommandMode(false);
    });

    voiceControlState.setOnEnterCommandMode(() => {
      wakeWordDetector?.setCommandMode(true);
    });

    // On-demand activation: UI calls startListening() → we start the detector
    voiceControlState.setOnStartRequested(() => {
      if (!wakeWordDetector) return;
      wakeWordDetector.start();
      voiceControlState.setEnabled(true);
      voiceControlState.setDetectorState("listening");
    });

    // "Hey Tika" said alone → enter command mode
    const unsubWakeWord = wakeWordDetector.onWakeWord(() => {
      enterCommandMode();
      voiceControlState.showFeedback("success", "Listening...");
    });

    // Command detected (either from wake word + command, or from command mode speech)
    const unsubCommand = wakeWordDetector.onCommand(async (event) => {
      if (!commandInterpreter || !commandDispatcher) return;

      const commandStartMs = performance.now();

      const context = {
        currentModule: navigationState.currentModule,
        currentTab: navigationState.activeTab,
      };

      const command = commandInterpreter.interpret(event.command, context);

      // System exit command
      if (command.category === "system" && command.action === "exit") {
        // If help overlay is open, "close"/"dismiss" closes it instead of exiting
        if (voiceControlState.helpOverlayOpen) {
          voiceControlState.closeHelp();
          voiceControlState.showFeedback("success", "Help closed");
          voiceControlState.refreshCommandModeTimer();
          return;
        }
        exitCommandMode();
        voiceControlState.showFeedback("success", "Stopped listening");
        return;
      }

      // System help command
      if (command.category === "system" && command.action === "help") {
        voiceControlState.toggleHelp();
        voiceControlState.refreshCommandModeTimer();
        const msg = voiceControlState.helpOverlayOpen ? "Here's what you can say" : "Help closed";
        voiceControlState.showFeedback("success", msg);
        return;
      }

      // Unknown command (no interpreter matched) → escalate to Tier 2/3
      if (command.category === "system" && command.action === "unknown") {
        const tier = classifyTier(event.command);

        if (tier === "question") {
          await resolveTier3(event.command, event.command, commandStartMs);
          return;
        }

        // Tier 2: action intent → LLM resolution
        await resolveTier2(event.command, event.command, commandStartMs);
        return;
      }

      // Tier 1 matched → dispatch directly
      const result = await commandDispatcher.dispatch(command);
      voiceControlState.refreshCommandModeTimer();

      // Record Tier 1 event
      sessionRecorder?.recordEvent({
        transcript: event.command,
        speechConfidence: event.confidence,
        tier: "tier1_regex",
        interpretedCommand: command,
        dispatchResult: result,
        context: getContext(),
        latencyMs: Math.round(performance.now() - commandStartMs),
      });

      if (result.success) {
        voiceControlState.showFeedback("success", result.message, event.command);
      } else {
        console.warn(`[HeyTika] Command failed: ${result.message}`);
        voiceControlState.showFeedback("error", result.message, event.command);
      }
    });

    // Sync detector state → reactive store
    const unsubState = wakeWordDetector.onStateChange((state) => {
      voiceControlState.setDetectorState(state);
      if (state === "error") {
        console.warn("[HeyTika] Wake word detector entered error state");
      }
      // Detector auto-paused (e.g., too many silent restarts on mobile).
      // Show the inactive mic button so the user can tap to re-activate.
      if (state === "idle" && voiceControlState.enabled && !wakeWordDetector!.isListening()) {
        voiceControlState.setEnabled(false);
        voiceControlState.exitCommandMode();
      }
    });

    // Don't auto-start. Voice control activates when the user clicks the mic button.
    // This avoids the browser microphone permission prompt on page load.

    // Restore command mode if it was active before HMR
    if (voiceControlState.shouldRestoreCommandMode()) {
      wakeWordDetector.start();
      voiceControlState.setEnabled(true);
      voiceControlState.setDetectorState("listening");
      enterCommandMode();
      voiceControlState.showFeedback("success", "Listening...");
    }

    return () => {
      // End any in-progress recording before unmount
      if (sessionRecorder?.isRecording()) {
        sessionRecorder.endSession();
      }
      sessionRecorder?.onSessionEnded(null);

      unsubWakeWord();
      unsubCommand();
      unsubState();
      wakeWordDetector?.stop();
      ttsProvider?.cancel();
      voiceControlState.setOnStartRequested(null);
      voiceControlState.setOnEnterCommandMode(null);
      voiceControlState.setEnabled(false);
      voiceControlState.setDetectorState("idle");
      voiceControlState.clearFeedback();
      voiceControlState.dismissChatBubble();
      voiceControlState.destroy();
    };
  });
</script>
