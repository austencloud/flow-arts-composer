<!--
  TIKA Module - AI-Powered TKA Learning Assistant

  Two modes:
  - Conversation: Single-column chat with inline pictographs
  - Review: Human review of flagged evaluation results

  Uses AI SDK for streaming chat with tool-use architecture.
  Pictographs render inline in message bubbles (no side panel).
-->
<script lang="ts">
  import { getConceptProgressTracker } from "#lib/features/learn/get-concept-progress-tracker.js";
  import * as quizHistoryRecorderModule from "#lib/features/learn/services/quiz-history-recorder.js";
  import * as conceptRecommenderModule from "#lib/features/learn/services/concept-recommender.js";
  import { getRecurringMisconceptions } from "#lib/features/learn/services/gap-detector.js";
  import { Chat, type UIMessage } from "@ai-sdk/svelte";
  import { DefaultChatTransport } from "ai";
  import { browser } from "$app/env";
  import { trackTikaQuestionSubmitted } from "#lib/features/tika/analytics/tika-events.js";
  import { onMount } from "svelte";
  import TikaConversation from "./components/TikaConversation.svelte";
  import TikaReviewPanel from "./components/TikaReviewPanel.svelte";
  import TikaCompareView from "./components/TikaCompareView.svelte";
  import TikaHistoryDrawer from "./components/TikaHistoryDrawer.svelte";
  import { getEffectiveUserId, authState } from "#lib/shared/auth/state/auth-state.svelte.js";
  import { auth } from "#lib/shared/auth/firebase.js";
  import type { ConceptProgressTracker } from "#lib/features/learn/services/concept-progress-tracker.js";
  import type { MasteryContext } from "#lib/features/learn/domain/quiz-history-types.js";
  import * as tikaSessionRepository from "./services/tika-session-repository";
  import { ConversationMemoryRetriever } from "./services/conversation-memory-retriever";
  import { TikaInteractionTracker } from "./services/tika-interaction-tracker";
  import { buildWelcome } from "./services/tika-welcome-builder";
  import type { WelcomeContext } from "./services/tika-welcome-builder";
  import { TIKA_LIMITS } from "./data/firestore-paths";
  import type { ModelOption } from "./types";
  import {
    DEFAULT_TIKA_MODEL,
    resolveTikaModelKey,
  } from "./domain/tika-model-catalog";

  // Persistence keys
  const STORAGE_KEY = "tika-conversation";
  const MODEL_STORAGE_KEY = "tika_model_preference";

  /** SessionStorage key for pre-seeded questions from other modules */
  const SEED_MESSAGE_KEY = "tika-seed-message";

  // Load persisted messages from sessionStorage
  function loadPersistedMessages(): UIMessage[] {
    if (!browser) return [];
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.warn("[TIKA] Failed to load persisted messages:", e);
    }
    return [];
  }

  // Load model preference from localStorage
  function loadModelPreference(
    key = MODEL_STORAGE_KEY,
    fallback: string = DEFAULT_TIKA_MODEL
  ): string {
    if (!browser) return fallback;
    try {
      const stored = localStorage.getItem(key);
      return stored ? resolveTikaModelKey(stored) ?? fallback : fallback;
    } catch {
      return fallback;
    }
  }

  // Model selection state
  let selectedModel = $state(loadModelPreference());
  let availableModels = $state<ModelOption[]>([]);

  // Mode toggle - conversation vs review
  type TabMode = "conversation" | "review";
  let mode = $state<TabMode>("conversation");

  // Session management state
  let currentSessionId = $state<string | null>(null);
  let showHistory = $state(false);
  let isFlagged = $state(false);
  let autoSaveTimeout: ReturnType<typeof setTimeout> | null = null;

  // Compare mode state
  let compareMode = $state(false);
  const COMPARE_MODEL_A_KEY = "tika-compare-model-a";
  const COMPARE_MODEL_B_KEY = "tika-compare-model-b";
  let compareModelA = $state(loadModelPreference(COMPARE_MODEL_A_KEY));
  let compareModelB = $state(
    loadModelPreference(COMPARE_MODEL_B_KEY, "sonnet-5")
  );

  // Repository module (only active in browser for Firestore access)
  const sessionRepository = browser ? tikaSessionRepository : null;

  // Memory retriever for past conversation context
  const memoryRetriever = sessionRepository
    ? new ConversationMemoryRetriever(sessionRepository)
    : null;

  // Check if user is authenticated
  const isAuthenticated = $derived(authState.isAuthenticated);

  // User identity
  const userId = $derived(getEffectiveUserId() || "anonymous");

  // Progress tracker and mastery services via module singleton getters
  const progressTracker: ConceptProgressTracker | null = browser
    ? (getConceptProgressTracker() as ConceptProgressTracker) ?? null
    : null;

  // Interaction tracker for quiz persistence and topic tracking
  const interactionTracker = browser ? new TikaInteractionTracker() : null;

  // Welcome builder for adaptive suggestions (module function)

  const completedConcepts = $derived.by(() => {
    if (!progressTracker) return [];
    const progress = progressTracker.getProgress();
    return Array.from(progress.completedConcepts);
  });

  // Mastery context for adaptive TIKA responses
  let masteryContext = $state<MasteryContext | undefined>(undefined);

  // Conversation memory context (loaded once on first message)
  let conversationMemory = $state<string | undefined>(undefined);
  let memoryLoaded = $state(false);

  // Adaptive welcome context (loaded on mount for authenticated users)
  let welcomeContext = $state<WelcomeContext | undefined>(undefined);

  // Load mastery context when user is authenticated
  $effect(() => {
    if (!isAuthenticated || !userId || userId === "anonymous") return;
    if (!progressTracker) return;

    // Initialize Firestore sync for progress tracker
    progressTracker.initializeForUser(userId);

    // Load mastery data asynchronously
    quizHistoryRecorderModule
      .getAllMasteryScores(userId)
      .then((masteryScores) => {
        const progress = progressTracker.getProgress();
        const completedIds = progress.completedConcepts;

        const masteredConcepts: string[] = [];
        const strugglingConcepts: string[] = [];

        for (const [conceptId, mastery] of masteryScores) {
          if (mastery.mastered) {
            masteredConcepts.push(conceptId);
          } else if (mastery.averageScore < 60) {
            strugglingConcepts.push(conceptId);
          }
        }

        const suggestedNext = conceptRecommenderModule
          .getNextConcepts(completedIds, 3)
          .map((c) => c.id);

        const dueForReview =
          conceptRecommenderModule.getConceptsDueForReview(masteryScores);

        masteryContext = {
          masteredConcepts,
          strugglingConcepts,
          suggestedNext,
          dueForReview,
        };

        // Load active misconceptions and inject into mastery context
        if (userId) {
          getRecurringMisconceptions(userId)
            .then((patterns) => {
              if (patterns.length > 0 && masteryContext) {
                masteryContext = {
                  ...masteryContext,
                  activeMisconceptions: patterns.map((p) => ({
                    nodeA: p.nodeA,
                    nodeB: p.nodeB,
                    occurrenceCount: p.occurrenceCount,
                    explanation: p.explanation,
                  })),
                };
              }
            })
            .catch((err) => {
              console.warn("[TIKA] Failed to load misconceptions:", err);
            });
        }
      })
      .catch((error) => {
        console.warn("[TIKA] Failed to load mastery context:", error);
      });
  });

  // Build adaptive welcome context when mastery data and user data are available
  $effect(() => {
    if (!isAuthenticated || userId === "anonymous") {
      // Anonymous users get static defaults
      welcomeContext = buildWelcome();
      return;
    }

    // Load topic history and history summary in parallel, then build welcome
    const topicHistoryPromise = interactionTracker
      ? interactionTracker.getTopicHistory(userId, 5)
      : Promise.resolve(undefined);

    const historySummaryPromise = memoryRetriever
      ? memoryRetriever.getHistorySummary()
      : Promise.resolve(undefined);

    Promise.all([topicHistoryPromise, historySummaryPromise])
      .then(([topicHistory, historySummary]) => {
        welcomeContext = buildWelcome(
          masteryContext,
          topicHistory ?? undefined,
          historySummary ?? undefined,
        );
      })
      .catch((error) => {
        console.warn("[TIKA] Failed to build welcome context:", error);
        // Fall back to static defaults
        welcomeContext = buildWelcome();
      });
  });

  // Get Firebase auth headers for API requests
  async function getAuthHeaders(): Promise<Record<string, string>> {
    const user = auth.currentUser;
    if (!user) return {};
    const token = await user.getIdToken();
    return { Authorization: `Bearer ${token}` };
  }

  // Initialize Chat class from AI SDK with persistence
  const chat = browser
    ? new Chat({
        id: "tika-main",
        transport: new DefaultChatTransport({
          api: "/api/tika/ask",
          headers: () => getAuthHeaders(),
          body: () => ({
            userId,
            completedConcepts,
            masteryContext,
            conversationMemory,
            language: "en",
            model: selectedModel,
          }),
        }),
        messages: loadPersistedMessages(),
        onError: (error: Error) => {
          console.error("[TIKA] Chat error:", error);
        },
      })
    : null;

  // Compare mode Chat instances (created lazily when compare mode activates)
  let chatA = $state<Chat | null>(null);
  let chatB = $state<Chat | null>(null);

  function createCompareChat(id: string, model: string): Chat {
    return new Chat({
      id,
      transport: new DefaultChatTransport({
        api: "/api/tika/ask",
        headers: () => getAuthHeaders(),
        body: () => ({
          userId,
          completedConcepts,
          masteryContext,
          conversationMemory,
          language: "en",
          model,
        }),
      }),
      onError: (error: Error) => {
        console.error(`[TIKA Compare ${id}] Chat error:`, error);
      },
    });
  }

  // Derived reactive bindings for chat state
  // These ensure Svelte 5 properly tracks reactivity from the Chat class
  // IMPORTANT: Must be defined AFTER chat initialization
  const chatMessages = $derived(chat?.messages ?? []);
  const chatStatus = $derived(chat?.status ?? "ready");

  // Compare mode derived state
  const compareMessagesA = $derived(chatA?.messages ?? []);
  const compareMessagesB = $derived(chatB?.messages ?? []);
  const compareStatusA = $derived(chatA?.status ?? "ready");
  const compareStatusB = $derived(chatB?.status ?? "ready");

  // Persist messages to sessionStorage when they change
  $effect(() => {
    if (browser && chatMessages.length > 0) {
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(chatMessages));
      } catch (e) {
        console.warn("[TIKA] Failed to persist messages:", e);
      }
    }
  });

  // Track topics from assistant tool calls for welcome suggestions
  let lastTrackedMessageCount = $state(0);
  $effect(() => {
    if (!interactionTracker || !isAuthenticated || userId === "anonymous") return;
    if (chatMessages.length <= lastTrackedMessageCount) return;

    // Only scan newly added messages
    const newMessages = chatMessages.slice(lastTrackedMessageCount);
    lastTrackedMessageCount = chatMessages.length;

    const topics = new Set<string>();
    for (const msg of newMessages) {
      if (msg.role !== "assistant") continue;
      for (const part of msg.parts) {
        if (!part.type.startsWith("tool-")) continue;
        // Extract topic from tool input args
        const toolPart = part as { input?: Record<string, unknown> };
        if (!toolPart.input) continue;
        const input = toolPart.input;
        if (typeof input.letter === "string") topics.add(`letter-${input.letter}`);
        if (typeof input.type === "number") topics.add(`type-${input.type}`);
        if (typeof input.position === "string") topics.add(`position-${input.position}`);
        if (typeof input.motionType === "string") topics.add(`motion-${input.motionType}`);
        if (typeof input.topic === "string") topics.add(input.topic);
      }
    }

    // Fire-and-forget: record each unique topic
    for (const topic of topics) {
      interactionTracker.recordTopicDiscussion(userId, topic).catch((err) => {
        console.warn("[TIKA] Failed to record topic discussion:", err);
      });
    }
  });

  // Auto-save to Firebase (debounced) when messages change
  $effect(() => {
    // Skip if not authenticated or no repository
    if (!isAuthenticated || !sessionRepository) return;

    // Skip if below minimum message threshold
    if (chatMessages.length < TIKA_LIMITS.MIN_MESSAGES_FOR_SAVE) return;

    // Clear existing timeout
    if (autoSaveTimeout) {
      clearTimeout(autoSaveTimeout);
    }

    // Debounce the save
    autoSaveTimeout = setTimeout(async () => {
      try {
        const session = await sessionRepository.saveSession(
          currentSessionId ?? undefined,
          chatMessages
        );
        // Update session ID if this was a new session
        if (!currentSessionId) {
          currentSessionId = session.id;
        }
      } catch (error) {
        console.error("[TIKA] Auto-save failed:", error);
      }
    }, TIKA_LIMITS.AUTO_SAVE_DEBOUNCE_MS);

    return () => {
      if (autoSaveTimeout) {
        clearTimeout(autoSaveTimeout);
      }
    };
  });

  // Fetch available models on mount
  onMount(async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/tika/models", { headers });
      if (!res.ok) {
        console.warn("[TIKA] Models endpoint returned", res.status);
        return;
      }
      const data = await res.json();
      availableModels = data.models || [];

      // Validate saved preference still exists
      if (availableModels.length > 0 && !availableModels.find((m) => m.id === selectedModel)) {
        selectedModel = availableModels[0]?.id || DEFAULT_TIKA_MODEL;
      }
      if (!availableModels.some((model) => model.id === compareModelA)) {
        compareModelA = availableModels[0]?.id ?? DEFAULT_TIKA_MODEL;
      }
      if (!availableModels.some((model) => model.id === compareModelB)) {
        compareModelB = availableModels[1]?.id ?? availableModels[0]?.id ?? DEFAULT_TIKA_MODEL;
      }
      if (compareModelA === compareModelB && availableModels.length > 1) {
        compareModelB = availableModels.find((model) => model.id !== compareModelA)!.id;
      }
    } catch (error) {
      console.error("[TIKA] Failed to fetch models:", error);
      availableModels = [];
    }

    // Check for a seeded question from another module (e.g. quiz misconception hint)
    if (browser) {
      const seedMessage = sessionStorage.getItem(SEED_MESSAGE_KEY);
      if (seedMessage) {
        sessionStorage.removeItem(SEED_MESSAGE_KEY);
        // Start a fresh conversation with the seeded question
        await handleNewChat();
        // Small delay to let the chat initialize after clearing
        setTimeout(() => {
          handleSubmit(seedMessage);
        }, 100);
      }
    }
  });

  // Handle model change
  function handleModelChange(modelId: string) {
    selectedModel = modelId;
    // Persist to localStorage
    if (browser) {
      try {
        localStorage.setItem(MODEL_STORAGE_KEY, modelId);
      } catch {
        // Ignore storage errors
      }
    }
  }

  // Handle new message submission from conversation component
  async function handleSubmit(question: string) {
    // Load conversation memory on first message (lazy)
    if (!memoryLoaded && memoryRetriever && isAuthenticated) {
      memoryLoaded = true;
      try {
        conversationMemory = await memoryRetriever.buildMemoryContext(question);
      } catch (error) {
        console.warn("[TIKA] Failed to load conversation memory:", error);
      }
    }
    if (!chat) return;
    trackTikaQuestionSubmitted({
      mode: "single",
      modelCount: 1,
      authenticated: isAuthenticated,
    });
    chat.sendMessage({ text: question });
  }

  // Handle stop/abort streaming
  function handleStop() {
    chat?.stop();
  }

  // Compare mode handlers
  function toggleCompare() {
    compareMode = !compareMode;
    if (compareMode && browser) {
      chatA = createCompareChat("tika-compare-a", compareModelA);
      chatB = createCompareChat("tika-compare-b", compareModelB);
    }
  }

  function handleCompareModelAChange(modelId: string) {
    compareModelA = modelId;
    if (browser) localStorage.setItem(COMPARE_MODEL_A_KEY, modelId);
    chatA = createCompareChat("tika-compare-a", modelId);
  }

  function handleCompareModelBChange(modelId: string) {
    compareModelB = modelId;
    if (browser) localStorage.setItem(COMPARE_MODEL_B_KEY, modelId);
    chatB = createCompareChat("tika-compare-b", modelId);
  }

  async function handleCompareSubmit(question: string) {
    if (!memoryLoaded && memoryRetriever && isAuthenticated) {
      memoryLoaded = true;
      try {
        conversationMemory = await memoryRetriever.buildMemoryContext(question);
      } catch (error) {
        console.warn("[TIKA] Failed to load conversation memory:", error);
      }
    }
    if (!chatA || !chatB) return;
    trackTikaQuestionSubmitted({
      mode: "compare",
      modelCount: 2,
      authenticated: isAuthenticated,
    });
    chatA.sendMessage({ text: question });
    chatB.sendMessage({ text: question });
  }

  function handleCompareStop() {
    chatA?.stop();
    chatB?.stop();
  }

  // Handle inline quiz completion (persist results)
  function handleQuizComplete(quizId: string, topic: string, correct: boolean) {
    if (!interactionTracker || !isAuthenticated || userId === "anonymous") return;

    interactionTracker
      .recordQuizResult(userId, topic, correct, quizId)
      .catch((error) => {
        console.warn("[TIKA] Failed to record quiz result:", error);
      });
  }

  // Start a new conversation
  async function handleNewChat() {
    // Save current session if it has messages
    if (isAuthenticated && sessionRepository && chatMessages.length >= TIKA_LIMITS.MIN_MESSAGES_FOR_SAVE) {
      try {
        await sessionRepository.saveSession(
          currentSessionId ?? undefined,
          chatMessages
        );
      } catch (error) {
        console.error("[TIKA] Failed to save session before new chat:", error);
      }
    }

    // Clear current conversation
    if (chat) chat.messages = [];
    currentSessionId = null;
    isFlagged = false;
    conversationMemory = undefined;
    memoryLoaded = false;
    welcomeContext = undefined;

    // Clear sessionStorage
    if (browser) {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  }

  // Load a previous session
  async function handleLoadSession(sessionId: string) {
    if (!sessionRepository || !chat) return;

    try {
      const session = await sessionRepository.getSession(sessionId);
      if (session) {
        chat.messages = session.messages as UIMessage[];
        currentSessionId = session.id;
        isFlagged = session.flaggedForReview ?? false;

        // Update sessionStorage
        if (browser) {
          sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session.messages));
        }
      }
    } catch (error) {
      console.error("[TIKA] Failed to load session:", error);
    }
  }

  // Open/close history drawer
  function handleOpenHistory() {
    showHistory = true;
  }

  function handleCloseHistory() {
    showHistory = false;
  }

  // Flag/unflag conversation for review
  async function handleFlagForReview(flagged: boolean) {
    if (!sessionRepository || !currentSessionId) return;

    try {
      await sessionRepository.flagForReview(currentSessionId, flagged);
      isFlagged = flagged;
    } catch (error) {
      console.error("[TIKA] Failed to flag conversation:", error);
    }
  }

  // Helper to extract text from message parts
  function getTextFromParts(parts: UIMessage["parts"]): string {
    return parts
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("");
  }

  type ToolInvocationPart = {
    type: "tool-invocation";
    toolInvocation: {
      toolName: string;
      args: Record<string, unknown>;
      state: string;
      result?: unknown;
    };
  };

  function isToolInvocationPart(part: unknown): part is ToolInvocationPart {
    if (!part || typeof part !== "object") return false;
    const p = part as Record<string, unknown>;
    if (p.type !== "tool-invocation") return false;
    const inv = p.toolInvocation;
    return (
      inv !== null &&
      typeof inv === "object" &&
      typeof (inv as Record<string, unknown>).toolName === "string"
    );
  }

  // Extract explanation from tool output, handling canonical response format
  function extractToolExplanation(output: unknown): string {
    if (typeof output === "string") return output;
    if (output && typeof output === "object") {
      const obj = output as Record<string, unknown>;
      // Check for explanation field (canonical response format)
      if (typeof obj.explanation === "string") {
        return obj.explanation;
      }
      // Fallback to JSON
      return JSON.stringify(output, null, 2);
    }
    return String(output);
  }

  // Generate conversation data for AI review (returns string for CopyForAIButton)
  function generateCopyForAI(): string {
    if (chatMessages.length === 0) return "";

    // Format conversation for AI review
    const lines: string[] = [
      "# Tika Conversation for Review",
      "",
      `**Date:** ${new Date().toLocaleString()}`,
      `**Messages:** ${chatMessages.length}`,
      "",
      "---",
      "",
    ];

    for (const message of chatMessages) {
      if (message.role === "user") {
        lines.push(`## User Question`);
        lines.push("");
        lines.push(getTextFromParts(message.parts));
        lines.push("");
      } else if (message.role === "assistant") {
        lines.push(`## Tika Response`);
        lines.push("");

        // Extract text content
        if (message.parts) {
          const textParts = message.parts.filter((p) => p.type === "text");
          const text = textParts
            .map((p) => (p as { type: "text"; text: string }).text)
            .join("");
          if (text) {
            lines.push(text);
            lines.push("");
          }

          // Extract tool output (new AI SDK format: type is "tool-{toolName}")
          let hasToolOutput = false;
          for (const part of message.parts) {
            if (part.type.startsWith("tool-") && part.type !== "tool-invocation") {
              const toolPart = part as { output?: unknown; state?: string; input?: Record<string, unknown> };
              if (toolPart.state === "output-available" && toolPart.output) {
                hasToolOutput = true;
                // Extract explanation field if present (canonical response format)
                const output = extractToolExplanation(toolPart.output);
                lines.push(output);
                lines.push("");
              }
            }
          }

          // Extract tool calls (old format)
          if (!hasToolOutput) {
            const toolParts = message.parts.filter(
              (p) => p.type === "tool-invocation"
            );
            if (toolParts.length > 0) {
              lines.push("### Tools Called");
              lines.push("");
              for (const part of toolParts) {
                if (!isToolInvocationPart(part)) continue;
                const inv = part.toolInvocation;
                lines.push(`- **${inv.toolName}**: \`${JSON.stringify(inv.args)}\``);
                // Include result if available
                if (inv.state === "result" && inv.result) {
                  const result = inv.result as Record<string, unknown>;
                  if (typeof result.explanation === "string") {
                    lines.push("");
                    lines.push(result.explanation);
                  }
                }
              }
              lines.push("");
            }
          }
        } else {
          // Fallback: extract text from parts
          const text = getTextFromParts(message.parts);
          if (text) {
            lines.push(text);
            lines.push("");
          }
        }
      }
      lines.push("---");
      lines.push("");
    }

    return lines.join("\n");
  }

</script>

<div class="tika-module">
  {#if mode === "conversation"}
    {#if compareMode}
      <TikaCompareView
        messagesA={compareMessagesA}
        messagesB={compareMessagesB}
        statusA={compareStatusA}
        statusB={compareStatusB}
        modelA={compareModelA}
        modelB={compareModelB}
        {availableModels}
        onModelAChange={handleCompareModelAChange}
        onModelBChange={handleCompareModelBChange}
        onSubmit={handleCompareSubmit}
        onStop={handleCompareStop}
        onExitCompare={toggleCompare}
      />
    {:else}
      <div class="conversation-container">
        <TikaConversation
          messages={chatMessages}
          status={chatStatus}
          onSubmit={handleSubmit}
          onStop={handleStop}
          onNewChat={isAuthenticated ? handleNewChat : undefined}
          onOpenHistory={isAuthenticated ? handleOpenHistory : undefined}
          onOpenReview={() => (mode = "review")}
          {generateCopyForAI}
          {selectedModel}
          {availableModels}
          onModelChange={handleModelChange}
          sessionId={currentSessionId}
          {isFlagged}
          onFlagForReview={isAuthenticated ? handleFlagForReview : undefined}
          onQuizComplete={isAuthenticated ? handleQuizComplete : undefined}
          {welcomeContext}
          {compareMode}
          onToggleCompare={toggleCompare}
        />
      </div>
    {/if}
  {:else}
    <TikaReviewPanel
      onBack={() => (mode = "conversation")}
      onLoadSession={handleLoadSession}
    />
  {/if}

  <!-- History Drawer -->
  {#if showHistory && isAuthenticated && sessionRepository}
    <div class="history-overlay" role="presentation">
      <button
        class="history-backdrop"
        onclick={handleCloseHistory}
        aria-label="Close history"
      ></button>
      <div class="history-drawer-container">
        <TikaHistoryDrawer
          repository={sessionRepository}
          {currentSessionId}
          onNewChat={handleNewChat}
          onLoadSession={handleLoadSession}
          onClose={handleCloseHistory}
        />
      </div>
    </div>
  {/if}
</div>

<style>
  .tika-module {
    position: relative;
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    overflow: hidden;
    background: transparent;
  }

  /* Single-column conversation layout */
  .conversation-container {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    max-width: 900px;
    margin: 0 auto;
    width: 100%;
  }

  /* History Overlay */
  .history-overlay {
    position: absolute;
    inset: 0;
    z-index: 100;
    display: flex;
    justify-content: flex-end;
  }

  .history-backdrop {
    position: absolute;
    inset: 0;
    background: var(--theme-overlay, rgba(0, 0, 0, 0.5));
    border: none;
    cursor: pointer;
    backdrop-filter: var(--overlay-blur, blur(2px));
  }

  .history-drawer-container {
    position: relative;
    width: 320px;
    max-width: 90vw;
    height: 100%;
    animation: slideIn var(--duration-normal) ease;
  }

  @keyframes slideIn {
    from {
      transform: translateX(100%);
    }
    to {
      transform: translateX(0);
    }
  }

  /* Reduced Motion */
  @media (prefers-reduced-motion: reduce) {
    .history-backdrop {
      transition: none;
    }

    .history-drawer-container {
      animation: none;
    }
  }
</style>
