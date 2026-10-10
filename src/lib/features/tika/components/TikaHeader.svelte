<!--
  TIKA Header

  Header bar with title, review badge, and action buttons.
-->
<script lang="ts">
  import CopyAsImageButton from "#lib/shared/foundation/ui/CopyAsImageButton.svelte";
  import TikaModelSwitcher from "./TikaModelSwitcher.svelte";
  import TikaActionMenu from "./TikaActionMenu.svelte";
  import type { ModelOption } from "../types";
  import type { ReviewStatus, ReviewMetadata } from "../domain/models/tika-conversation-models";

  let {
    reviewStatus,
    reviewMetadata,
    selectedModel = "sonnet-4",
    availableModels = [],
    onModelChange,
    onNewChat,
    onOpenHistory,
    onOpenReview,
    sessionId,
    isFlagged = false,
    onFlagForReview,
    hasMessages = false,
    chatContainer,
    showToolDetails = false,
    onToggleToolDetails,
    generateCopyForAI,
    compareMode = false,
    onToggleCompare,
  }: {
    reviewStatus?: ReviewStatus;
    reviewMetadata?: ReviewMetadata;
    selectedModel?: string;
    availableModels?: ModelOption[];
    onModelChange?: (modelId: string) => void;
    onNewChat?: () => void;
    onOpenHistory?: () => void;
    onOpenReview?: () => void;
    sessionId?: string | null;
    isFlagged?: boolean;
    onFlagForReview?: (flagged: boolean) => void;
    hasMessages?: boolean;
    chatContainer?: HTMLElement | null;
    showToolDetails?: boolean;
    onToggleToolDetails?: () => void;
    generateCopyForAI?: () => string;
    compareMode?: boolean;
    onToggleCompare?: () => void;
  } = $props();

  // Derived: review badge display
  const reviewBadge = $derived(() => {
    if (!reviewStatus || reviewStatus === "pending") return null;

    switch (reviewStatus) {
      case "approved":
        return {
          label: reviewMetadata?.grade ? `Reviewed: ${reviewMetadata.grade}` : "Approved",
          icon: "fa-check-circle",
          color: "green",
        };
      case "needs-correction":
        return {
          label: "Needs Correction",
          icon: "fa-exclamation-circle",
          color: "red",
        };
      case "claimed":
        return {
          label: "Being Reviewed",
          icon: "fa-spinner fa-spin",
          color: "blue",
        };
      case "in-review":
        return {
          label: "In Review",
          icon: "fa-eye",
          color: "purple",
        };
      case "archived":
        return {
          label: reviewMetadata?.grade ? `Archived: ${reviewMetadata.grade}` : "Archived",
          icon: "fa-archive",
          color: "gray",
        };
      default:
        return null;
    }
  });
</script>

<header class="panel-header">
  <div class="header-left">
    <div class="header-title">
      <div class="title-icon">
        <i class="fas fa-robot" aria-hidden="true"></i>
      </div>
      <div class="title-text">
        <span class="title-main">Tika</span>
        <span class="title-subtitle">TKA Intelligent Knowledge Assistant</span>
      </div>
    </div>
    <!-- Review Status Badge -->
    {#if reviewBadge()}
      {@const badge = reviewBadge()}
      {#if badge}
        <button aria-label={`Review status: ${badge.label}`}
          class="review-badge review-badge-{badge.color}"
          title={reviewMetadata?.aiNotes || `Status: ${reviewStatus}`}
        >
          <i class="fas {badge.icon}" aria-hidden="true"></i>
          <span>{badge.label}</span>
        </button>
      {/if}
    {/if}
  </div>
  <div class="header-actions">
    <!-- Primary Actions: Always visible -->
    {#if availableModels.length > 1 && onModelChange}
      <TikaModelSwitcher
        currentModel={selectedModel}
        {availableModels}
        {onModelChange}
      />
    {/if}
    {#if onNewChat}
      <button aria-label="Start new conversation"
        class="action-btn new-chat-btn"
        onclick={onNewChat}
        title="New conversation"
      >
        <i class="fas fa-plus" aria-hidden="true"></i>
      </button>
    {/if}
    {#if onOpenHistory}
      <button aria-label="Open chat history"
        class="action-btn history-btn"
        onclick={onOpenHistory}
        title="Chat history"
      >
        <i class="fas fa-history" aria-hidden="true"></i>
      </button>
    {/if}

    <!-- Flag for Review: Shows when there's a saved session -->
    {#if sessionId && onFlagForReview}
      <button aria-label={isFlagged ? "Remove from review queue" : "Flag conversation for review"}
        class="action-btn flag-btn"
        class:flagged={isFlagged}
        onclick={() => onFlagForReview(!isFlagged)}
        title={isFlagged ? "Remove from review queue" : "Flag for review"}
        aria-pressed={isFlagged}
      >
        <i class="fas fa-flag" aria-hidden="true"></i>
      </button>
    {/if}

    <!-- Compare Mode Toggle: Desktop only -->
    {#if onToggleCompare}
      <button aria-label={compareMode ? "Exit compare mode" : "Compare models side by side"}
        class="action-btn compare-btn"
        class:active={compareMode}
        onclick={onToggleCompare}
        title={compareMode ? "Exit compare mode" : "Compare models side by side"}
      >
        <i class="fas fa-columns" aria-hidden="true"></i>
      </button>
    {/if}

    <!-- Copy as image - always visible when there are messages -->
    {#if hasMessages && chatContainer}
      <CopyAsImageButton
        targetElement={chatContainer}
        ariaLabel="Copy conversation as image"
      />
    {/if}

    <!-- Secondary Actions: In overflow menu -->
    <TikaActionMenu
      actions={[
        ...(hasMessages && onToggleToolDetails
          ? [
              {
                id: "tools",
                label: showToolDetails ? "Hide tool details" : "Show tool details",
                icon: "fa-wrench",
                onClick: onToggleToolDetails,
                active: showToolDetails,
              },
            ]
          : []),
        ...(hasMessages && generateCopyForAI
          ? [
              {
                id: "copy-ai",
                label: "Copy for AI review",
                icon: "fa-copy",
                onClick: () => {
                  const data = generateCopyForAI();
                  navigator.clipboard.writeText(data);
                },
              },
            ]
          : []),
        ...(onOpenReview
          ? [
              {
                id: "review-panel",
                label: "Review panel",
                icon: "fa-clipboard-check",
                onClick: onOpenReview,
              },
            ]
          : []),
      ]}
    />
  </div>
</header>

<style>
  .panel-header {
    padding: 12px 16px;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    background: var(--theme-panel-bg, rgba(15, 20, 30, 0.95));
    --shadow-dark-sm: 0 2px 8px rgba(0, 0, 0, 0.2);
    --shadow-dark-md: 0 4px 12px rgba(0, 0, 0, 0.3);
    --shadow-accent-icon: 0 2px 8px rgba(99, 102, 241, 0.3);
    --shadow-success-sm: 0 2px 8px rgba(34, 197, 94, 0.25);
    --shadow-success-md: 0 4px 14px rgba(34, 197, 94, 0.4);
    --shadow-accent-sm: 0 2px 8px rgba(99, 102, 241, 0.25);
    --shadow-accent-md: 0 4px 14px rgba(99, 102, 241, 0.4);
    --shadow-accent-sm2: 0 2px 8px rgba(99, 102, 241, 0.35);
    --shadow-accent-lg: 0 4px 14px rgba(99, 102, 241, 0.5);
    --shadow-warning-sm: 0 2px 8px rgba(245, 158, 11, 0.35);
    --shadow-warning-md: 0 4px 14px rgba(245, 158, 11, 0.4);
    --shadow-warning-lg: 0 4px 14px rgba(245, 158, 11, 0.5);
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }

  /* Review Status Badge */
  .review-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: 16px;
    font-size: 12px;
    font-weight: 600;
    border: 1px solid;
    cursor: help;
    transition: all var(--duration-normal, 0.3s) ease;
  }

  .review-badge i {
    font-size: 12px;
  }

  .review-badge-green {
    background: color-mix(in srgb, var(--semantic-success, #22c55e) 15%, transparent);
    border-color: color-mix(in srgb, var(--semantic-success, #22c55e) 40%, transparent);
    color: var(--semantic-success, #22c55e);
  }

  .review-badge-green:hover {
    background: color-mix(in srgb, var(--semantic-success, #22c55e) 25%, transparent);
  }

  .review-badge-red {
    background: color-mix(in srgb, var(--semantic-error, #ef4444) 15%, transparent);
    border-color: color-mix(in srgb, var(--semantic-error, #ef4444) 40%, transparent);
    color: var(--semantic-error, #ef4444);
  }

  .review-badge-red:hover {
    background: color-mix(in srgb, var(--semantic-error, #ef4444) 25%, transparent);
  }

  .review-badge-blue {
    background: color-mix(in srgb, var(--semantic-info, #3b82f6) 15%, transparent);
    border-color: color-mix(in srgb, var(--semantic-info, #3b82f6) 40%, transparent);
    color: var(--semantic-info, #3b82f6);
  }

  .review-badge-blue:hover {
    background: color-mix(in srgb, var(--semantic-info, #3b82f6) 25%, transparent);
  }

  .review-badge-purple {
    background: color-mix(in srgb, var(--theme-accent, #a855f7) 15%, transparent);
    border-color: color-mix(in srgb, var(--theme-accent, #a855f7) 40%, transparent);
    color: var(--theme-accent, #a855f7);
  }

  .review-badge-purple:hover {
    background: color-mix(in srgb, var(--theme-accent, #a855f7) 25%, transparent);
  }

  .review-badge-gray {
    background: color-mix(in srgb, var(--theme-text-secondary, #9ca3af) 15%, transparent);
    border-color: color-mix(in srgb, var(--theme-text-secondary, #9ca3af) 40%, transparent);
    color: var(--theme-text-secondary, #9ca3af);
  }

  .review-badge-gray:hover {
    background: color-mix(in srgb, var(--theme-text-secondary, #9ca3af) 25%, transparent);
  }

  .header-title {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .title-icon {
    width: 40px;
    height: 40px;
    border-radius: 12px;
    background: linear-gradient(135deg, var(--theme-accent, #818cf8) 0%, color-mix(in srgb, var(--theme-accent, #6366f1) 85%, black) 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    box-shadow: var(--shadow-accent-icon);
  }

  .title-icon i {
    font-size: 18px;
    color: white;
  }

  .title-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .title-main {
    font-size: 18px;
    font-weight: 700;
    color: var(--theme-text, #ffffff);
    letter-spacing: -0.01em;
  }

  .title-subtitle {
    font-size: 12px;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.6));
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  /* Action buttons - circular with proper touch targets */
  .action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--min-touch-target, 48px);
    height: var(--min-touch-target, 48px);
    padding: 0;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.15));
    border-radius: 50%;
    color: var(--theme-text, #ffffff);
    font-size: 16px;
    cursor: pointer;
    transition: all var(--duration-normal, 0.3s) ease;
    flex-shrink: 0;
    box-shadow: var(--shadow-dark-sm);
  }

  .action-btn:hover {
    transform: scale(1.05);
    box-shadow: var(--shadow-dark-md);
  }

  .action-btn:active {
    transform: scale(0.95);
    transition: transform 0.1s ease;
  }

  .action-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }

  /* New chat button - green gradient for "create new" action */
  .new-chat-btn {
    background: linear-gradient(135deg, var(--semantic-success, #22c55e), color-mix(in srgb, var(--semantic-success, #22c55e) 80%, black));
    border-color: color-mix(in srgb, var(--semantic-success, #22c55e) 30%, transparent);
    box-shadow: var(--shadow-success-sm);
  }

  .new-chat-btn:hover {
    background: linear-gradient(135deg, var(--semantic-success, #22c55e), color-mix(in srgb, var(--semantic-success, #22c55e) 75%, black));
    box-shadow: var(--shadow-success-md);
  }

  /* History button - indigo gradient for navigation */
  .history-btn {
    background: linear-gradient(135deg, var(--theme-accent, #6366f1), color-mix(in srgb, var(--theme-accent, #6366f1) 80%, black));
    border-color: color-mix(in srgb, var(--theme-accent, #6366f1) 30%, transparent);
    box-shadow: var(--shadow-accent-sm);
  }

  .history-btn:hover {
    background: linear-gradient(135deg, var(--theme-accent, #6366f1), color-mix(in srgb, var(--theme-accent, #6366f1) 75%, black));
    box-shadow: var(--shadow-accent-md);
  }

  /* Flag button - amber/yellow when not flagged, red when flagged */
  .flag-btn {
    background: var(--theme-card-bg, rgba(100, 100, 120, 0.85));
    border-color: var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .flag-btn:hover {
    background: linear-gradient(135deg, var(--semantic-warning, #f59e0b), color-mix(in srgb, var(--semantic-warning, #f59e0b) 80%, black));
    border-color: color-mix(in srgb, var(--semantic-warning, #f59e0b) 30%, transparent);
    box-shadow: var(--shadow-warning-md);
  }

  .flag-btn.flagged {
    background: linear-gradient(135deg, var(--semantic-warning, #f59e0b), color-mix(in srgb, var(--semantic-warning, #f59e0b) 80%, black));
    border-color: color-mix(in srgb, var(--semantic-warning, #f59e0b) 40%, transparent);
    box-shadow: var(--shadow-warning-sm);
  }

  .flag-btn.flagged:hover {
    background: linear-gradient(135deg, var(--semantic-warning, #f59e0b), color-mix(in srgb, var(--semantic-warning, #f59e0b) 75%, black));
    box-shadow: var(--shadow-warning-lg);
  }

  /* Compare toggle - hidden on mobile (needs width for side-by-side) */
  .compare-btn {
    display: none;
    background: var(--theme-card-bg, rgba(100, 100, 120, 0.85));
    border-color: var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  @media (min-width: 768px) {
    .compare-btn {
      display: flex;
    }
  }

  .compare-btn:hover {
    background: linear-gradient(135deg, var(--theme-accent, #6366f1), color-mix(in srgb, var(--theme-accent, #6366f1) 80%, black));
    border-color: color-mix(in srgb, var(--theme-accent, #6366f1) 30%, transparent);
    box-shadow: var(--shadow-accent-md);
  }

  .compare-btn.active {
    background: linear-gradient(135deg, var(--theme-accent, #6366f1), color-mix(in srgb, var(--theme-accent, #6366f1) 80%, black));
    border-color: color-mix(in srgb, var(--theme-accent, #6366f1) 40%, transparent);
    box-shadow: var(--shadow-accent-sm2);
  }

  .compare-btn.active:hover {
    box-shadow: var(--shadow-accent-lg);
  }

  /* Responsive: hide subtitle on very narrow screens */
  @media (max-width: 480px) {
    .title-subtitle {
      display: none;
    }
  }

  /* Reduced Motion */
  @media (prefers-reduced-motion: reduce) {
    .action-btn {
      transition: none;
    }

    .action-btn:hover,
    .action-btn:active {
      transform: none;
    }
  }
</style>
