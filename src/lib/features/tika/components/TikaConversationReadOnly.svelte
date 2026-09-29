<!--
  TIKA Conversation Read-Only View

  Renders a Tika conversation with full fidelity (markdown, inline pictographs,
  galleries, etc.) but without input controls. Used in review panel.
-->
<script lang="ts">
  import type { UIMessage } from "ai";
  import InlinePictograph from "./InlinePictograph.svelte";
  import InlineGallery from "./InlineGallery.svelte";
  import InlineSequencePlayer from "./InlineSequencePlayer.svelte";
  import InlineStepGrid from "./InlineStepGrid.svelte";
  import InlineQuiz from "./InlineQuiz.svelte";
  import LinkChip from "$lib/shared/ui/components/LinkChip.svelte";
  import SanitizedHtml from "$lib/shared/foundation/ui/SanitizedHtml.svelte";
  import { parseMarkdown } from "../services/tika-markdown-parser";
  import { getTextFromParts as _getTextFromParts, getToolOutputFromParts as _getToolOutputFromParts } from "../services/tika-message-extractor";
  import type {
    InlinePictograph as InlinePictographType,
    InlineGallery as InlineGalleryType,
    InlineSequencePlayer as InlineSequencePlayerType,
    InlineStepGrid as InlineStepGridType,
    InlineQuiz as InlineQuizType,
  } from "../types";

  // Props
  let {
    messages = [],
  }: {
    messages: UIMessage[];
  } = $props();

  // Element reference for image capture
  let containerEl: HTMLElement | null = $state(null);

  // Export element for parent to capture
  export function getContainerElement(): HTMLElement | null {
    return containerEl;
  }

  // Get parsed content for a message using shared DOMPurify-sanitized parser
  function getMessageParsedContent(parts: UIMessage["parts"]): {
    textHtml: string | null;
    toolHtml: string | null;
    links: Array<{ text: string; url: string }>
  } {
    const textContent = _getTextFromParts(parts);
    if (textContent) {
      const parsed = parseMarkdown(textContent);
      return { textHtml: parsed.html, toolHtml: null, links: parsed.links };
    }
    const toolOutput = _getToolOutputFromParts(parts);
    if (toolOutput) {
      const parsed = parseMarkdown(toolOutput);
      return { textHtml: null, toolHtml: parsed.html, links: parsed.links };
    }
    return { textHtml: null, toolHtml: null, links: [] };
  }

  // Extract inline content from tool output
  interface InlineContent {
    pictograph?: InlinePictographType;
    gallery?: InlineGalleryType;
    galleries?: InlineGalleryType[];
    sequencePlayer?: InlineSequencePlayerType;
    stepGrid?: InlineStepGridType;
    quiz?: InlineQuizType;
  }

  // Type-safe narrowing helpers for inline content.
  // These use `unknown` parameter to satisfy TypeScript's type predicate rules,
  // then perform structural checks to narrow to the concrete type.
  function isInlinePictograph(obj: unknown): obj is InlinePictographType {
    if (!obj || typeof obj !== "object") return false;
    const r = obj as Record<string, unknown>;
    return r.type === "inline-pictograph" && typeof r.letter === "string";
  }

  function isInlineGallery(obj: unknown): obj is InlineGalleryType {
    if (!obj || typeof obj !== "object") return false;
    const r = obj as Record<string, unknown>;
    return r.type === "inline-gallery" && Array.isArray(r.items);
  }

  function isInlineSequencePlayer(obj: unknown): obj is InlineSequencePlayerType {
    if (!obj || typeof obj !== "object") return false;
    const r = obj as Record<string, unknown>;
    return r.type === "inline-sequence-player" && typeof r.word === "string";
  }

  function isInlineStepGrid(obj: unknown): obj is InlineStepGridType {
    if (!obj || typeof obj !== "object") return false;
    const r = obj as Record<string, unknown>;
    return r.type === "inline-step-grid" && Array.isArray(r.steps);
  }

  function isInlineQuiz(obj: unknown): obj is InlineQuizType {
    if (!obj || typeof obj !== "object") return false;
    const r = obj as Record<string, unknown>;
    return r.type === "inline-quiz" && typeof r.question === "string";
  }

  function extractInlineContent(output: unknown): InlineContent {
    const content: InlineContent = {};
    if (!output || typeof output !== "object") return content;

    const obj = output as Record<string, unknown>;

    if (obj.inlinePictograph && isInlinePictograph(obj.inlinePictograph)) {
      content.pictograph = obj.inlinePictograph;
    }

    if (obj.inlineGallery && isInlineGallery(obj.inlineGallery)) {
      content.gallery = obj.inlineGallery;
    }

    if (obj.inlineGalleries && Array.isArray(obj.inlineGalleries)) {
      content.galleries = [];
      for (const gal of obj.inlineGalleries) {
        if (isInlineGallery(gal)) {
          content.galleries.push(gal);
        }
      }
    }

    if (obj.inlineSequencePlayer && isInlineSequencePlayer(obj.inlineSequencePlayer)) {
      content.sequencePlayer = obj.inlineSequencePlayer;
    }

    if (obj.inlineStepGrid && isInlineStepGrid(obj.inlineStepGrid)) {
      content.stepGrid = obj.inlineStepGrid;
    }

    if (obj.inlineQuiz && isInlineQuiz(obj.inlineQuiz)) {
      content.quiz = obj.inlineQuiz;
    }

    return content;
  }

  function getInlineContentFromParts(parts: UIMessage["parts"]): InlineContent[] {
    if (!parts) return [];
    const allContent: InlineContent[] = [];

    for (const part of parts) {
      if (part.type.startsWith("tool-") && part.type !== "tool-invocation") {
        const toolPart = part as { output?: unknown; state?: string };
        if (toolPart.state === "output-available" && toolPart.output) {
          const content = extractInlineContent(toolPart.output);
          if (content.pictograph || content.gallery || content.galleries?.length || content.sequencePlayer || content.stepGrid || content.quiz) {
            allContent.push(content);
          }
        }
      }
      if (part.type === "tool-invocation") {
        const inv = (part as { toolInvocation?: { state: string; result?: unknown } }).toolInvocation;
        if (inv?.state === "result" && inv.result) {
          const content = extractInlineContent(inv.result);
          if (content.pictograph || content.gallery || content.galleries?.length || content.sequencePlayer || content.stepGrid || content.quiz) {
            allContent.push(content);
          }
        }
      }
    }

    return allContent;
  }
</script>

<div class="conversation-readonly" bind:this={containerEl}>
  {#each messages as message (message.id)}
    {#if message.role === "user"}
      <!-- User Message -->
      <div class="message user-message">
        <div class="message-content">
          <p>{_getTextFromParts(message.parts)}</p>
        </div>
      </div>
    {:else if message.role === "assistant"}
      <!-- Assistant Response -->
      {@const parsed = getMessageParsedContent(message.parts)}
      {@const inlineContent = getInlineContentFromParts(message.parts)}
      <div class="message assistant-message">
        <div class="message-avatar">
          <i class="fas fa-robot" aria-hidden="true"></i>
        </div>
        <div class="message-content">
          {#if parsed.textHtml}
            <div class="text-response markdown-content">
              <SanitizedHtml html={parsed.textHtml} />
            </div>
          {:else if parsed.toolHtml}
            <div class="tool-response markdown-content">
              <SanitizedHtml html={parsed.toolHtml} />
            </div>
          {/if}

          <!-- Inline Pictographs/Galleries/Sequence Players from tool outputs -->
          {#if inlineContent.length > 0}
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
                  <InlineQuiz quiz={content.quiz} />
                {/if}
              {/each}
            </div>
          {/if}

          <!-- Link index at bottom of message -->
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
        </div>
      </div>
    {/if}
  {/each}
</div>

<style>
  .conversation-readonly {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 16px;
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    border-radius: 12px;
    --shadow-accent-sm: 0 4px 12px rgba(99, 102, 241, 0.3);
  }

  /* Messages */
  .message {
    display: flex;
    gap: 12px;
    max-width: 100%;
  }

  .user-message {
    justify-content: flex-end;
  }

  .user-message .message-content {
    background: var(--theme-accent, #6366f1);
    color: white;
    border-radius: 16px 16px 4px 16px;
    padding: 12px 16px;
    max-width: 80%;
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

  .message-content p {
    margin: 0;
    font-size: 14px;
    line-height: 1.5;
    color: var(--theme-text, #ffffff);
    white-space: pre-wrap;
  }

  /* Inline content container */
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

  /* Footnote references */
  .markdown-content :global(.footnote-ref) {
    font-size: 0.7em;
    color: var(--theme-accent, #6366f1);
    font-weight: 600;
    vertical-align: super;
    margin-left: 1px;
    cursor: default;
  }

  /* Link index */
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
</style>
