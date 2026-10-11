<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  /**
   * InboxNotificationItem
   *
   * Simple notification card - Facebook/Instagram style
   */

  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import { onMount } from "svelte";
  import type { UserNotification } from "#lib/shared/notifications/domain/models/notification-models.js";
  import { formatRelativeTimeVerbose } from "../../utils/format";
  import { goto } from "$app/navigation";
  import { inboxState } from "../../state/inbox-state.svelte";
  import { handleModuleChange } from "#lib/shared/navigation-coordinator/navigation-coordinator.svelte.js";
  import { CHOREO_CARD_SCAN_ATLAS_TAB_ID } from "#lib/shared/navigation/config/tab-definitions.js";
  import { setNotificationTargetFeedback } from "#lib/shared/feedback/state/notification-action-state.svelte.js";
  import { setScanNotificationTarget } from "#lib/features/choreo-card/state/scan-notification-target.svelte.js";
  import type { HapticFeedback } from "#lib/shared/application/services/haptic-feedback.js";
  import { authState } from "#lib/shared/auth/state/auth-state.svelte.js";
  import { buildAdminSessionReplayUrl } from "#lib/features/admin/domain/session-replay-target.js";
  import { getErrorHandler } from "#lib/shared/application/get-error-handler.js";
  import { resolveAdminCreatedSequenceTarget } from "../../domain/admin-created-sequence-target";
  import { openCreatorProfile } from "#lib/features/creators/state/creators-routing.svelte.js";

  interface Props {
    notification: UserNotification;
    wasUnread?: boolean; // Track if it was unread when first rendered
  }

  let { notification, wasUnread = false }: Props = $props();

  // Track if this notification just became read (for animation)
  let justMarkedRead = $state(false);
  let openingCreatedSequence = $state(false);

  // Watch for read state changes to trigger animation
  $effect(() => {
    if (wasUnread && notification.read && !justMarkedRead) {
      justMarkedRead = true;
      // Reset after animation completes (1.8s total)
      const timer = setTimeout(() => {
        justMarkedRead = false;
      }, 1800);
      return () => clearTimeout(timer);
    }
    return undefined;
  });

  // Haptic feedback service
  let hapticService: HapticFeedback | undefined;

  onMount(() => {
    hapticService = getHapticFeedback();
  });

  // Get icon based on notification type
  function getIcon(type: UserNotification["type"]): string {
    switch (type) {
      case "feedback-resolved":
        return "fa-check-circle";
      case "feedback-in-progress":
        return "fa-clock";
      case "feedback-needs-info":
        return "fa-question-circle";
      case "feedback-response":
        return "fa-comment";
      case "sequence-liked":
        return "fa-heart";
      case "user-followed":
        return "fa-user-plus";
      case "achievement-unlocked":
        return "fa-trophy";
      case "message-received":
        return "fa-envelope";
      case "admin-new-user-signup":
        return "fa-user-check";
      case "admin-user-returned":
        return "fa-door-open";
      case "admin-qr-scan":
        return "fa-qrcode";
      case "admin-content-created":
        return "fa-wand-magic-sparkles";
      case "admin-parity-audit":
        return "fa-shield-halved";
      case "system-announcement":
        return "fa-bullhorn";
      default:
        return "fa-bell";
    }
  }

  // Get color based on notification type
  function getColor(type: UserNotification["type"]): string {
    switch (type) {
      case "feedback-resolved":
        return "var(--semantic-success, var(--semantic-success))";
      case "feedback-in-progress":
        return "var(--semantic-warning, var(--semantic-warning))";
      case "feedback-needs-info":
        return "var(--semantic-info, var(--semantic-info))";
      case "sequence-liked":
        return "var(--semantic-error)";
      case "user-followed":
        return "var(--theme-accent, var(--semantic-info))";
      case "achievement-unlocked":
        return "var(--semantic-warning)";
      case "message-received":
        return "var(--theme-accent-strong)";
      case "admin-parity-audit":
        return "var(--semantic-warning)";
      default:
        return "var(--theme-text-dim)";
    }
  }

  /**
   * Open an admin notification's subject in the Users module, targeted at the
   * exact PostHog session that produced the alert when one rode along.
   * Shared by the signup and returning-user notifications — both answer the
   * same question and land on the same Activity view.
   */
  async function openAdminSession(
    userId: string | undefined,
    sessionId: string | undefined,
    action: string
  ) {
    const report = (failure: Error) => {
      getErrorHandler().showUserError({
        message: t("inbox_ui_this_session_notification_could_not_be_opened"),
        technicalDetails: failure.message,
        error: failure,
        severity: "error",
        context: { module: "inbox", tab: "notifications", action },
      });
    };

    if (!userId) {
      report(new Error("Notification has no user destination"));
      return;
    }

    try {
      inboxState.close();
      await goto(buildAdminSessionReplayUrl(userId, sessionId), {
        replace: true,
        reset: false,
      });
      // The catch-all app route preserves the shell across goto(). Update its
      // module owner explicitly while keeping the deep-link URL intact.
      await handleModuleChange("admin", "users", { skipHistory: true });
    } catch (caught) {
      const failure =
        caught instanceof Error ? caught : new Error(String(caught));
      console.error("[InboxNotificationItem] Failed to open session:", failure);
      report(failure);
    }
  }

  /**
   * Open the exact owner-scoped sequence named by a Pulse notification.
   * Some new saves are private, so the public sequence route cannot be the
   * fallback here. Admins can read the owner's library record directly, then
   * hand the mapped sequence to the same viewer used everywhere else.
   */
  async function openAdminCreatedSequence(
    ownerId: string | undefined,
    sequenceId: string | undefined,
    ownerDisplayName: string | undefined
  ) {
    if (openingCreatedSequence) return;

    const report = (failure: Error) => {
      getErrorHandler().showUserError({
        message: t("inbox_ui_this_saved_sequence_could_not_be_opened"),
        technicalDetails: failure.message,
        error: failure,
        severity: "error",
        context: {
          module: "inbox",
          tab: "notifications",
          action: "openCreatedSequence",
        },
      });
    };

    const target = resolveAdminCreatedSequenceTarget(ownerId, sequenceId);
    if (!target) {
      report(new Error("Notification has no saved-sequence destination"));
      return;
    }

    openingCreatedSequence = true;
    try {
      const [
        { doc, getDocFromServer },
        { getFirestoreInstance },
        { mapDocToSequence },
        { openSequenceViewer },
      ] = await Promise.all([
        import("firebase/firestore"),
        import("#lib/shared/auth/firebase.js"),
        import("#lib/shared/library/services/collection-firestore-mapper.js"),
        import("#lib/shared/sequence-viewer/services/sequence-viewer-navigator.js"),
      ]);

      const firestore = await getFirestoreInstance();
      const snapshot = await getDocFromServer(doc(firestore, target.path));
      if (!snapshot.exists()) {
        throw new Error("The saved sequence no longer exists");
      }

      const mapped = mapDocToSequence(snapshot.data(), snapshot.id);
      const sequence = {
        ...mapped,
        ownerId: mapped.ownerId || target.ownerId,
        ownerDisplayName: mapped.ownerDisplayName || ownerDisplayName,
      };

      inboxState.close();
      openSequenceViewer(sequence, {
        source: "inbox_notification",
        returnPath: window.location.pathname,
        returnLabel: t("inbox_ui_notifications"),
      });
    } catch (caught) {
      const failure =
        caught instanceof Error ? caught : new Error(String(caught));
      console.error(
        "[InboxNotificationItem] Failed to open saved sequence:",
        failure
      );
      report(failure);
    } finally {
      openingCreatedSequence = false;
    }
  }

  // Handle card click - navigate directly (Facebook/Instagram pattern)
  async function handleCardClick() {
    hapticService?.trigger("selection");

    // Deep-link to relevant content based on notification type.
    // Each union member carries a subset of these target fields; type the
    // payload as the partial set of known deep-link keys rather than `any`.
    type DeepLinkFields = Partial<
      Record<
        | "feedbackId"
        | "sequenceId"
        | "fromUserId"
        | "conversationId"
        | "newUserId"
        | "actionUrl"
        | "shortCode"
        | "returnedUserId"
        | "postHogSessionId"
        | "contentType",
        string
      >
    > & { scanLat?: number | null; scanLng?: number | null };
    const n = notification as UserNotification & DeepLinkFields;

    switch (notification.type) {
      case "feedback-resolved":
      case "feedback-in-progress":
      case "feedback-needs-info":
      case "feedback-response":
        // Navigate to My Feedback tab via module change
        if (n["feedbackId"]) {
          setNotificationTargetFeedback(n["feedbackId"] as string);
          inboxState.close();
          await handleModuleChange("feedback", "my-feedback");
        }
        break;

      case "sequence-liked":
        // Navigate to the sequence
        if (n["sequenceId"]) {
          inboxState.close();
          goto(`/sequence/${n["sequenceId"]}`);
        }
        break;

      case "user-followed":
        // Route through the Creators owner so the keep-alive app shell changes
        // module as well as URL. A bare /profile/:uid navigation falls through
        // the catch-all route and leaves the previous module running.
        if (n["fromUserId"]) {
          inboxState.close();
          await openCreatorProfile(
            n["fromUserId"],
            undefined,
            "inbox_notification"
          );
        }
        break;

      case "message-received":
        // Switch to messages tab and open conversation
        if (n["conversationId"]) {
          inboxState.setTab("messages");
          // The ConversationList will be shown, user can click the conversation
        }
        break;

      case "achievement-unlocked":
        // The profile is owned by Creators; use its routing seam so profile
        // state, module state, URL, and browser history move together.
        inboxState.close();
        if (authState.effectiveUserId) {
          await openCreatorProfile(
            authState.effectiveUserId,
            undefined,
            "inbox_notification"
          );
        }
        break;

      case "admin-new-user-signup":
        // A signup is the same question a return is: who is this, and what did
        // they just do? Same destination — their Activity tab, on the session
        // that produced the alert when one was captured.
        await openAdminSession(
          n["newUserId"] || n["fromUserId"],
          n["postHogSessionId"],
          "openNewUserSession"
        );
        break;

      case "admin-user-returned":
        // Older live-subscription objects kept the actor but lost the
        // return-specific alias. Both fields identify the same user on a
        // returning-user notification, so either can restore the handoff.
        await openAdminSession(
          n["returnedUserId"] || n["fromUserId"],
          n["postHogSessionId"],
          "openReturnedUserSession"
        );
        break;

      case "admin-qr-scan":
        // Open Scan Atlas, flown to the scan and peeking the card.
        if (n["shortCode"]) {
          setScanNotificationTarget({
            code: n["shortCode"] as string,
            lat: typeof n.scanLat === "number" ? n.scanLat : null,
            lng: typeof n.scanLng === "number" ? n.scanLng : null,
          });
          inboxState.close();
          await handleModuleChange(
            "choreo_card",
            CHOREO_CARD_SCAN_ATLAS_TAB_ID
          );
        }
        break;

      case "admin-content-created":
        if (n["contentType"] === "sequence") {
          await openAdminCreatedSequence(
            n["fromUserId"],
            n["sequenceId"],
            n["fromUserName"]
          );
        }
        break;

      case "admin-parity-audit":
        inboxState.close();
        await goto(
          n["actionUrl"] ||
            `/admin/parity-audit?notification=${encodeURIComponent(notification.id)}`
        );
        break;

      case "system-announcement":
        // Navigate to action URL if provided
        if (n["actionUrl"]) {
          const actionUrl = n["actionUrl"] as string;
          inboxState.close();
          // An admin can link anywhere, and `goto` rejects other sites, so
          // those open in a new tab like the announcement modal's link.
          if (actionUrl.startsWith("/")) goto(actionUrl);
          else window.open(actionUrl, "_blank", "noopener,noreferrer");
        }
        break;

      default:
        // No specific navigation for other types
        break;
    }
  }

  function handleCardKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleCardClick();
    }
  }
</script>

<div
  class="notification-item"
  class:unread={!notification.read}
  class:just-marked-read={justMarkedRead}
  onclick={handleCardClick}
  onkeydown={handleCardKeydown}
  role="button"
  tabindex="0"
  aria-label="{notification.message}{!notification.read ? ` (${t("inbox_unread")})` : ''}"
>
  <!-- Icon -->
  <div class="icon" style="--icon-color: {getColor(notification.type)}">
    <i class="fas {getIcon(notification.type)}" aria-hidden="true"></i>
  </div>

  <!-- Content -->
  <div class="content">
    <p class="message">{notification.message}</p>
    <span class="time">{formatRelativeTimeVerbose(notification.createdAt)}</span
    >
  </div>

  <!-- Chevron indicator -->
  <div class="chevron">
    <i class="fas fa-chevron-right" aria-hidden="true"></i>
  </div>
</div>

<style>
  .notification-item {
    position: relative;
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    min-height: 64px;
    padding: 16px;
    background: transparent;
    border: none;
    border-bottom: 1px solid var(--theme-stroke);
    text-align: left;
    cursor: pointer;
    transition:
      background 0.2s ease,
      transform 0.2s ease;
  }

  .notification-item:hover {
    background: var(--theme-card-bg);
  }

  .notification-item:active {
    transform: scale(0.995);
  }

  .notification-item:focus-visible {
    outline: none;
    background: var(--theme-card-hover-bg);
    box-shadow: inset 0 0 0 2px
      color-mix(in srgb, var(--theme-accent) 50%, transparent);
  }

  .notification-item.unread {
    background: color-mix(in srgb, var(--theme-accent) 5%, transparent);
  }

  /* Animation when notification is marked as read */
  .notification-item.just-marked-read {
    animation: markAsRead 1.8s ease-out;
  }

  @keyframes markAsRead {
    0% {
      background: color-mix(in srgb, var(--theme-accent) 25%, transparent);
      transform: scale(1.03);
    }
    40% {
      background: color-mix(in srgb, var(--theme-accent) 20%, transparent);
      transform: scale(1.02);
    }
    70% {
      background: color-mix(in srgb, var(--theme-accent) 8%, transparent);
      transform: scale(1.01);
    }
    100% {
      background: transparent;
      transform: scale(1);
    }
  }

  /* Icon */
  .icon {
    flex-shrink: 0;
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: color-mix(in srgb, var(--icon-color) 15%, transparent);
    border-radius: 50%;
    font-size: var(--font-size-sm);
    color: var(--icon-color);
    transition: transform var(--duration-normal) ease;
  }

  .notification-item:hover .icon {
    transform: scale(1.1);
  }

  /* Content */
  .content {
    flex: 1;
    min-width: 0;
  }

  .message {
    margin: 0 0 4px;
    font-size: var(--font-size-min);
    line-height: 1.4;
    color: var(--theme-text);
    transition: font-weight var(--duration-emphasis) ease;
  }

  .unread .message {
    font-weight: 500;
  }

  .just-marked-read .message {
    animation: messageUnbold 0.8s ease-out forwards;
  }

  @keyframes messageUnbold {
    0% {
      font-weight: 500;
    }
    100% {
      font-weight: 400;
    }
  }

  .time {
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim, var(--theme-text-dim));
  }

  /* Chevron indicator */
  .chevron {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact);
    transition: all var(--duration-normal) ease;
  }

  .notification-item:hover .chevron {
    color: var(--theme-text-dim);
    transform: translateX(2px);
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .notification-item,
    .icon,
    .chevron,
    .message {
      transition: none !important;
      animation: none !important;
    }

    .notification-item.just-marked-read {
      animation: none !important;
    }

    .just-marked-read .message {
      animation: none !important;
      font-weight: 400;
    }
  }
</style>
