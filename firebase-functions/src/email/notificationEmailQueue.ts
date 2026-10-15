import * as admin from "firebase-admin";
import * as crypto from "crypto";
import {
  avatar,
  buttonRow,
  changeSection,
  divider,
  escapeHtml,
  footerLink,
  footerSignature,
  footerText,
  headline,
  insetBlock,
  linkPill,
  metaLine,
  paragraph,
  renderEmail,
  statusChip,
  type EmailButton,
  type EmailTone,
} from "./emailLayout";
import {
  richTextLinks,
  richTextToHtml,
  richTextToPlain,
  splitLeadingBold,
} from "./emailRichText";

const APP_ORIGIN = "https://tkaflowarts.com";
const INBOX_URL = `${APP_ORIGIN}/create?sheet=inbox`;
const SETTINGS_URL = `${APP_ORIGIN}/settings/notifications`;

export type EmailPreferenceKey =
  | "emailMessages"
  | "emailFeedback"
  | "emailPlatformUpdates";

export interface NotificationEmail {
  subject: string;
  text: string;
  html: string;
}

interface AuthEmailUser {
  email?: string;
  emailVerified: boolean;
  disabled: boolean;
}

export interface NotificationEmailDependencies {
  getPreferences(userId: string): Promise<Record<string, boolean> | null>;
  getAuthUser(userId: string): Promise<AuthEmailUser | null>;
  createMailIfAbsent(
    mailId: string,
    mail: {
      to: string[];
      message: NotificationEmail;
      metadata: Record<string, string>;
    }
  ): Promise<boolean>;
}

export interface QueueUserEmailRequest {
  userId: string;
  preferenceKey: EmailPreferenceKey;
  sourceType: "message" | "feedback" | "platform-update";
  sourceId: string;
  email: NotificationEmail;
}

export type QueueUserEmailResult =
  | { state: "queued"; mailId: string }
  | {
      state: "skipped";
      reason: "preference-off" | "email-unavailable" | "already-queued";
    };

export function wantsNotificationEmail(
  preferences: Record<string, boolean> | null,
  preferenceKey: EmailPreferenceKey
): boolean {
  return (
    preferences?.emailEnabled === true && preferences[preferenceKey] === true
  );
}

export function getEmailPreferenceForNotificationType(
  type: string
): EmailPreferenceKey | null {
  return type.startsWith("feedback-") ? "emailFeedback" : null;
}

export function createNotificationMailId(
  sourceType: QueueUserEmailRequest["sourceType"],
  sourceId: string,
  userId: string
): string {
  return crypto
    .createHash("sha256")
    .update(`${sourceType}:${sourceId}:${userId}`)
    .digest("hex");
}

export async function queueUserNotificationEmail(
  request: QueueUserEmailRequest,
  dependencies: NotificationEmailDependencies = defaultDependencies
): Promise<QueueUserEmailResult> {
  const preferences = await dependencies.getPreferences(request.userId);
  if (!wantsNotificationEmail(preferences, request.preferenceKey)) {
    return { state: "skipped", reason: "preference-off" };
  }

  const user = await dependencies.getAuthUser(request.userId);
  if (!user?.email || !user.emailVerified || user.disabled) {
    return { state: "skipped", reason: "email-unavailable" };
  }

  const mailId = createNotificationMailId(
    request.sourceType,
    request.sourceId,
    request.userId
  );
  const created = await dependencies.createMailIfAbsent(mailId, {
    to: [user.email],
    message: request.email,
    metadata: {
      sourceType: request.sourceType,
      sourceId: request.sourceId,
      recipientUserId: request.userId,
    },
  });

  return created
    ? { state: "queued", mailId }
    : { state: "skipped", reason: "already-queued" };
}

export function createMessageEmail(
  senderName: string,
  conversationId: string,
  senderAvatar?: string
): NotificationEmail {
  const conversationUrl = `${INBOX_URL}&conversation=${encodeURIComponent(conversationId)}`;
  const senderLabel = plainTextLabel(senderName, "Someone");

  return {
    subject: `New message from ${senderLabel}`,
    text: [
      `${senderLabel} sent you a message in Flow Arts Composer.`,
      "",
      `Open the conversation: ${conversationUrl}`,
      "",
      `Manage notification settings: ${SETTINGS_URL}`,
    ].join("\n"),
    // The message itself stays out of email; the reader opens it in the app.
    html: renderEmail({
      title: `New message from ${senderLabel}`,
      preheader: `${senderLabel} sent you a message in Flow Arts Composer.`,
      body: [
        avatar(senderLabel, senderAvatar),
        headline(`${senderLabel} sent you a message`),
        paragraph("Open the conversation to read it and reply."),
        buttonRow([{ label: "Open conversation", href: conversationUrl }]),
      ].join("\n"),
      footer: settingsFooter("message emails"),
    }),
  };
}

export function createFeedbackEmail(input: {
  type: string;
  feedbackId: string;
  feedbackTitle?: string;
  message: string;
}): NotificationEmail {
  const status = feedbackStatus(input.type);
  const title = plainTextLabel(input.feedbackTitle || "", "Your feedback");
  const feedbackUrl = `${APP_ORIGIN}/feedback/my-feedback?feedback=${encodeURIComponent(input.feedbackId)}`;
  const body = input.message.trim() || `${title}: ${status.label}`;
  const bodyHtml = escapeHtml(body).replace(/\n/g, "<br>");

  return {
    subject: `${status.label}: ${title}`,
    text: [
      title,
      body,
      "",
      `View your feedback: ${feedbackUrl}`,
      "",
      `Manage notification settings: ${SETTINGS_URL}`,
    ].join("\n"),
    html: renderEmail({
      title: `${status.label}: ${title}`,
      preheader: plainTextLabel(body, status.label),
      body: [
        statusChip(status.label, status.tone),
        headline(title),
        // A reply is someone else's words, so it sits in a quoted surface.
        input.type === "feedback-response"
          ? insetBlock(bodyHtml)
          : paragraph(bodyHtml),
        buttonRow([{ label: "View feedback", href: feedbackUrl }]),
      ].join("\n"),
      footer: settingsFooter("feedback emails"),
    }),
  };
}

export interface ReleaseChangelogEntry {
  category: string;
  text: string;
}

const RELEASE_SECTIONS = [
  { category: "added", heading: "New" },
  { category: "improved", heading: "Improved" },
  { category: "fixed", heading: "Fixed" },
] as const;
// A taste of each category; the release notes page holds the full list.
const RELEASE_ITEMS_PER_SECTION = 3;

export function createPlatformUpdateEmail(input: {
  version: string;
  releaseNotes?: string;
  highlights?: string[];
  changelogEntries?: ReleaseChangelogEntry[];
}): NotificationEmail {
  const version = plainTextLabel(input.version, "New version");
  const releaseUrl = `${APP_ORIGIN}/settings/release-notes`;
  const highlights = (input.highlights ?? [])
    .map((highlight) => highlight.trim())
    .filter(Boolean);
  const entries = (input.changelogEntries ?? []).filter(
    (entry) => typeof entry.text === "string" && entry.text.trim()
  );

  // The first highlight leads: its bold run becomes the headline and the
  // thing it links to becomes the main button. A "New in Explore:" style
  // prefix moves up beside the version instead of crowding the headline.
  const lead =
    highlights[0] ?? entries.find((entry) => entry.category === "added")?.text;
  const split = lead ? splitLeadingBold(lead) : null;
  const leadParts = split ? splitKicker(split.lead) : null;
  const headlineText = leadParts?.title || `What's new in ${version}`;
  const ledeSource = split ? split.rest : lead;
  const leadLink = lead ? richTextLinks(lead)[0] : undefined;
  const meta = [`Version ${version}`, leadParts?.kicker]
    .filter(Boolean)
    .join(" · ");

  const sections: { heading: string; items: string[] }[] = RELEASE_SECTIONS.map(
    (section) => ({
      heading: section.heading,
      items: entries
        .filter((entry) => entry.category === section.category)
        .map((entry) => entry.text)
        .filter((text) => text !== lead),
    })
  ).filter((section) => section.items.length > 0);
  if (sections.length === 0 && highlights.length > 1) {
    sections.push({
      heading: "Also in this release",
      items: highlights.slice(1),
    });
  }
  const changeCount = Math.max(entries.length, highlights.length);
  const fallbackDetail = lead
    ? ""
    : input.releaseNotes?.trim() ||
      "Open the release notes to see what changed.";

  const button: EmailButton = leadLink
    ? { label: `Open ${leadLink.label}`, href: leadLink.href }
    : { label: "Read the release notes", href: releaseUrl };
  const releaseNotesLink = linkPill(
    changeCount > 1
      ? `All ${changeCount} changes in the release notes`
      : "Release notes",
    releaseUrl
  );
  const changesHtml = sections.length
    ? divider() +
      sections
        .map((section) =>
          changeSection({
            heading: section.heading,
            items: section.items
              .slice(0, RELEASE_ITEMS_PER_SECTION)
              .map((item) => richTextToHtml(item)),
          })
        )
        .join("\n") +
      releaseNotesLink
    : leadLink
      ? `<p style="margin:8px 0 0">${releaseNotesLink}</p>`
      : "";

  const textSections = sections.flatMap((section) => [
    "",
    section.heading,
    ...section.items.map((item) => `- ${richTextToPlain(item)}`),
  ]);

  return {
    subject: `Flow Arts Composer ${version} is available`,
    text: [
      `Flow Arts Composer ${version} is available.`,
      "",
      split ? split.lead : headlineText,
      ledeSource ? richTextToPlain(ledeSource) : fallbackDetail,
      ...textSections,
      "",
      `Read the release notes: ${releaseUrl}`,
      "",
      `Manage notification settings: ${SETTINGS_URL}`,
    ]
      .join("\n")
      .replace(/\n{3,}/g, "\n\n"),
    html: renderEmail({
      title: `Flow Arts Composer ${version}`,
      preheader: ledeSource
        ? richTextToPlain(ledeSource, { withUrls: false })
        : `Flow Arts Composer ${version} is available.`,
      body: [
        metaLine(meta),
        headline(headlineText, { editorial: true }),
        ledeSource
          ? paragraph(richTextToHtml(ledeSource))
          : paragraph(escapeHtml(fallbackDetail).replace(/\n/g, "<br>")),
        buttonRow([button]),
        changesHtml,
      ].join("\n"),
      footer: settingsFooter("release emails"),
    }),
  };
}

/**
 * Splits "New in Explore: Zan's Diamond, 24 versions." into a short kicker
 * and a headline without its closing period. A long or absent prefix stays
 * in the headline.
 */
function splitKicker(text: string): { kicker?: string; title: string } {
  const trimmed = text.trim().replace(/\.$/, "");
  const match = /^([^:]{3,32}):\s+(\S[\s\S]*)$/.exec(trimmed);
  return match ? { kicker: match[1], title: match[2]! } : { title: trimmed };
}

function settingsFooter(category: string): string {
  return [
    footerText(
      `You get these because ${escapeHtml(category)} are on. ${footerLink("Email settings", SETTINGS_URL)}`
    ),
    footerSignature(),
  ].join("\n");
}

function feedbackStatus(type: string): { label: string; tone: EmailTone } {
  const statuses: Record<string, { label: string; tone: EmailTone }> = {
    "feedback-resolved": { label: "Feedback resolved", tone: "added" },
    "feedback-in-progress": { label: "Feedback in progress", tone: "improved" },
    "feedback-needs-info": { label: "More information needed", tone: "fixed" },
    "feedback-response": { label: "New feedback response", tone: "accent" },
  };
  return statuses[type] || { label: "Feedback update", tone: "accent" };
}

function plainTextLabel(value: string, fallback: string): string {
  return (
    value
      .replace(/[\r\n]+/g, " ")
      .trim()
      .slice(0, 160) || fallback
  );
}

const defaultDependencies: NotificationEmailDependencies = {
  async getPreferences(userId) {
    const snapshot = await admin
      .firestore()
      .doc(`users/${userId}/settings/notificationPreferences`)
      .get();
    return (
      (snapshot.data()?.notificationPreferences as
        | Record<string, boolean>
        | undefined) ?? null
    );
  },

  async getAuthUser(userId) {
    try {
      const user = await admin.auth().getUser(userId);
      return {
        email: user.email,
        emailVerified: user.emailVerified,
        disabled: user.disabled,
      };
    } catch (error) {
      if ((error as { code?: string }).code === "auth/user-not-found") {
        return null;
      }
      throw error;
    }
  },

  async createMailIfAbsent(mailId, mail) {
    const db = admin.firestore();
    const mailRef = db.collection("mail").doc(mailId);
    let created = false;

    await db.runTransaction(async (transaction) => {
      const existing = await transaction.get(mailRef);
      if (existing.exists) return;

      transaction.create(mailRef, {
        ...mail,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      created = true;
    });

    return created;
  },
};
