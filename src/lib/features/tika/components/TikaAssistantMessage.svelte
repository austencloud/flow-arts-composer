<!--
  TIKA Assistant Message

  Renders a single assistant message with markdown content,
  inline pictographs/galleries, tool details, and link references.
-->
<script lang="ts">
  import type { UIMessage } from "ai";
  import InlinePictograph from "./InlinePictograph.svelte";
  import InlineGallery from "./InlineGallery.svelte";
  import InlineSequencePlayer from "./InlineSequencePlayer.svelte";
  import InlineStepGrid from "./InlineStepGrid.svelte";
  import InlineQuiz from "./InlineQuiz.svelte";
  import LinkChip from "#lib/shared/ui/components/LinkChip.svelte";
  import SanitizedHtml from "#lib/shared/foundation/ui/SanitizedHtml.svelte";
  import { parseMarkdown } from "../services/tika-markdown-parser";
  import { getTextFromParts, getToolOutputFromParts, getToolsFromParts, getInlineContentFromParts } from "../services/tika-message-extractor";

  let {
    message,
    isStreaming = false,
    showToolDetails = false,
    onQuizComplete,
  }: {
    message: UIMessage;
    isStreaming?: boolean;
    showToolDetails?: boolean;
    onQuizComplete?: (quizId: string, topic: string, correct: boolean) => void;
  } = $props();

  // Get parsed content for a message (text or tool output) with link extraction
  function getMessageParsedContent(parts: UIMessage["parts"]): {
    textHtml: string | null;
    toolHtml: string | null;
    links: Array<{ text: string; url: string }>
  } {
    const textContent = getTextFromParts(parts);
    if (textContent) {
      const parsed = parseMarkdown(textContent);
      return { textHtml: parsed.html, toolHtml: null, links: parsed.links };
    }
    const toolOutput = getToolOutputFromParts(parts);
    if (toolOutput) {
      const parsed = parseMarkdown(toolOutput);
      return { textHtml: null, toolHtml: parsed.html, links: parsed.links };
    }
    return { textHtml: null, toolHtml: null, links: [] };
  }

  // Format tool name for display
  function formatToolName(name: string): string {
    return name
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
</script>

<div class="message assistant-message">
  <div class="message-avatar">
    <i class="fas fa-robot" aria-hidden="true"></i>
  </div>
  <div class="message-content">
    <!-- Text content - parse once and store links for rendering at end -->
    {#if true}
      {@const parsed = getMessageParsedContent(message.parts)}
      {#if parsed.textHtml}
        <div class="text-response markdown-content">
          <SanitizedHtml html={parsed.textHtml} />
          {#if isStreaming}
            <span class="streaming-cursor"></span>
          {/if}
        </div>
      {:else if isStreaming}
        <!-- Still waiting for text (model may be processing tool results) -->
        <div class="typing-indicator">
          <span></span>
          <span></span>
          <span></span>
        </div>
      {:else if parsed.toolHtml}
        <!-- Tool output as response (model finished without generating text) -->
        <div class="tool-response markdown-content">
          <SanitizedHtml html={parsed.toolHtml} />
        </div>
      {/if}

      <!-- Thinking indicator during tool execution -->
      {@const pendingTools = getToolsFromParts(message.parts).filter(t => t.isPending)}
      {#if pendingTools.length > 0 && isStreaming}
        <div class="thinking-indicator">
          <i class="fas fa-brain fa-pulse" aria-hidden="true"></i>
          <span>Looking up {formatToolName(pendingTools[0]?.name ?? "")}...</span>
        </div>
      {/if}

      <!-- Inline Pictographs/Galleries/Sequence Players from tool outputs -->
      {#if getInlineContentFromParts(message.parts).length > 0}
        {@const inlineContent = getInlineContentFromParts(message.parts)}
        <div class="inline-content-container">
          {#each inlineContent as content}
            {#if content.pictograph}
              <InlinePictograph pictograph={content.pictograph} />
            {/if}
            {#if content.gallery}
              <InlineGallery gallery={content.gallery} />
            {/if}
            {#if content.galleries?.length}
              {#each content.galleries as gal}
                <InlineGallery gallery={gal} />
              {/each}
            {/if}
            {#if content.sequencePlayer}
              <InlineSequencePlayer sequence={content.sequencePlayer} />
            {/if}
            {#if content.stepGrid}
              <InlineStepGrid stepGrid={content.stepGrid} />
            {/if}
            {#if content.quiz}
              <InlineQuiz quiz={content.quiz} {onQuizComplete} />
            {/if}
          {/each}
        </div>
      {/if}

      <!-- Tool Details (if enabled) -->
      {#if showToolDetails}
        {@const tools = getToolsFromParts(message.parts)}
        {#if tools.length > 0}
          <div class="tool-details">
            <div class="tool-header">
              <i class="fas fa-wrench" aria-hidden="true"></i>
              Tools called ({tools.length})
            </div>
            {#each tools as tool}
              <div class="tool-item" class:pending={tool.isPending}>
                <span class="tool-name">
                  {formatToolName(tool.name)}
                  {#if tool.isPending}
                    <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
                  {/if}
                </span>
                <span class="tool-input">
                  {JSON.stringify(tool.args)}
                </span>
              </div>
            {/each}
          </div>
        {/if}
      {/if}

      <!-- Link index at very bottom of message (after all content) -->
      {#if parsed.links.length > 0}
        <div class="link-index">
          <span class="link-index-label">References</span>
          {#each parsed.links as link, i}
            <LinkChip href={link.url}>
              <span class="link-number">{i + 1}</span>
              <span class="link-text">{link.text}</span>
            </LinkChip>
          {/each}
        </div>
      {/if}
    {/if}
  </div>
</div>

<style>
  .message {
    display: flex;
    gap: 12px;
    max-width: 100%;
    --shadow-accent-sm: 0 4px 12px rgba(99, 102, 241, 0.3);
    --shadow-dark-sm: 0 0 0 rgba(0, 0, 0, 0.2);
  }

  .assistant-message {
    justify-content: flex-start;
  }

  .message-avatar {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    background: linear-gradient(135deg, var(--theme-accent, #818cf8) 0%, color-mix(in srgb, var(--theme-accent, #6366f1) 85%, black) 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .message-avatar i {
    font-size: 14px;
    color: white;
  }

  .assistant-message .message-content {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 4px 16px 16px 16px;
    padding: 12px 16px;
    max-width: 85%;
  }

  /* Inline content container for pictographs/galleries */
  .inline-content-container {
    margin-top: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .text-response {
    display: inline;
  }

  /* Markdown content styling */
  .markdown-content {
    font-size: 14px;
    line-height: 1.6;
    color: var(--theme-text, #ffffff);
  }

  .markdown-content :global(h1),
  .markdown-content :global(h2) {
    font-size: 16px;
    font-weight: 600;
    margin: 12px 0 8px 0;
    color: var(--theme-accent, #6366f1);
  }

  .markdown-content :global(h1:first-child),
  .markdown-content :global(h2:first-child) {
    margin-top: 0;
  }

  .markdown-content :global(h3),
  .markdown-content :global(h4) {
    font-size: 14px;
    font-weight: 600;
    margin: 10px 0 6px 0;
    color: var(--theme-text, #ffffff);
  }

  .markdown-content :global(p) {
    margin: 0 0 8px 0;
  }

  .markdown-content :global(p:last-child) {
    margin-bottom: 0;
  }

  .markdown-content :global(strong) {
    color: var(--theme-text, #ffffff);
    font-weight: 600;
  }

  .markdown-content :global(ul),
  .markdown-content :global(ol) {
    margin: 4px 0 8px 0;
    padding-left: 20px;
  }

  .markdown-content :global(li) {
    margin: 2px 0;
  }

  /* Table styling */
  .markdown-content :global(table) {
    width: 100%;
    border-collapse: collapse;
    margin: 8px 0;
    font-size: 13px;
  }

  .markdown-content :global(th),
  .markdown-content :global(td) {
    padding: 6px 10px;
    text-align: left;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.15));
  }

  .markdown-content :global(th) {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    font-weight: 600;
    color: var(--theme-accent, #6366f1);
  }

  .markdown-content :global(tr:nth-child(even)) {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.02));
  }

  .markdown-content :global(code) {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.08));
    padding: 1px 4px;
    border-radius: 3px;
    font-family: monospace;
    font-size: 13px;
  }

  /* Footnote references (superscript numbers in text) */
  .markdown-content :global(.footnote-ref) {
    font-size: 0.7em;
    color: var(--theme-accent, #6366f1);
    font-weight: 600;
    vertical-align: super;
    margin-left: 1px;
    cursor: default;
  }

  /* Link index container (pill chips at bottom of message) */
  .link-index {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
    margin-top: 20px;
    padding-top: 16px;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
  }

  .link-index-label {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: 600;
  }

  .link-index :global(.link-number) {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 24px;
    height: 24px;
    background: var(--theme-accent, #6366f1);
    color: white;
    border-radius: 50%;
    font-size: 12px;
    font-weight: 700;
  }

  .link-index :global(.link-text) {
    font-weight: 500;
  }

  /* Thinking indicator during tool execution */
  .thinking-indicator {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
    padding: 6px 14px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    border-radius: 20px;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.6));
    font-size: var(--font-size-compact, 12px);
  }

  .thinking-indicator i {
    color: var(--theme-accent, #6366f1);
    font-size: 14px;
  }

  /* Streaming cursor */
  .streaming-cursor {
    display: inline-block;
    width: 2px;
    height: 1em;
    background: var(--theme-accent, #6366f1);
    margin-left: 2px;
    animation: blink 1s step-end infinite;
    vertical-align: text-bottom;
  }

  @keyframes blink {
    50% {
      opacity: 0;
    }
  }

  /* Tool Details */
  .tool-details {
    margin-top: 12px;
    padding: 10px;
    background: color-mix(in srgb, var(--theme-accent, #6366f1) 10%, transparent);
    border-radius: 8px;
    font-size: 12px;
  }

  .tool-header {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--theme-accent, #6366f1);
    font-weight: 500;
    margin-bottom: 8px;
  }

  .tool-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 6px;
    background: var(--theme-shadow-bg, rgba(0, 0, 0, 0.2));
    border-radius: 4px;
    margin-bottom: 4px;
  }

  .tool-item.pending {
    opacity: 0.7;
  }

  .tool-name {
    color: var(--theme-text, #ffffff);
    font-weight: 500;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .tool-input {
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.6));
    font-family: monospace;
    font-size: 12px;
    word-break: break-all;
  }

  /* Typing Indicator */
  .typing-indicator {
    display: flex;
    gap: 4px;
    padding: 4px 0;
  }

  .typing-indicator span {
    width: 8px;
    height: 8px;
    background: var(--theme-text-muted, rgba(255, 255, 255, 0.4));
    border-radius: 50%;
    animation: typing 1.4s infinite;
  }

  .typing-indicator span:nth-child(2) {
    animation-delay: var(--duration-normal);
  }

  .typing-indicator span:nth-child(3) {
    animation-delay: var(--duration-dramatic);
  }

  @keyframes typing {
    0%,
    60%,
    100% {
      opacity: 0.3;
      transform: scale(0.8);
    }
    30% {
      opacity: 1;
      transform: scale(1);
    }
  }

  /* Reduced Motion */
  @media (prefers-reduced-motion: reduce) {
    .streaming-cursor {
      animation: none;
    }

    .typing-indicator span {
      animation: none;
      opacity: 0.5;
    }

    .thinking-indicator i {
      animation: none;
    }
  }
</style>
