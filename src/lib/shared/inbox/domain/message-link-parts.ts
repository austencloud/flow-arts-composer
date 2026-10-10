import { find } from "linkifyjs";
import { extractScanCode } from "#lib/shared/qr/services/extract-scan-code.js";
import type {
  Message,
  MessageAttachment,
} from "#lib/shared/messaging/domain/models/message-models.js";

export type MessageTextPart =
  | { kind: "text"; text: string }
  | {
      kind: "link";
      text: string;
      href: string;
      linkType: string;
    };

export interface MessageSequenceLink {
  href: string;
  route: string;
  identifier: string;
  shortCode?: string;
}

const APP_HOSTS = new Set([
  "tkaflowarts.com",
  "www.tkaflowarts.com",
  "localhost",
  "127.0.0.1",
]);
const SHORT_HOSTS = new Set(["tka.run", "www.tka.run"]);

export function parseMessageText(content: string): MessageTextPart[] {
  const matches = find(content, { defaultProtocol: "https" });
  if (matches.length === 0) return [{ kind: "text", text: content }];

  const parts: MessageTextPart[] = [];
  let cursor = 0;

  for (const match of matches) {
    if (match.start > cursor) {
      parts.push({ kind: "text", text: content.slice(cursor, match.start) });
    }
    parts.push({
      kind: "link",
      text: match.value,
      href: match.href,
      linkType: match.type,
    });
    cursor = match.end;
  }

  if (cursor < content.length) {
    parts.push({ kind: "text", text: content.slice(cursor) });
  }

  return parts;
}

function decodePathSegment(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}

function routeSuffix(url: URL): string {
  return `${url.search}${url.hash}`;
}

function sequenceLinkFromUrl(href: string): MessageSequenceLink | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  const hostname = url.hostname.toLowerCase();
  const segments = url.pathname.split("/").filter(Boolean);

  if (SHORT_HOSTS.has(hostname)) {
    const code = extractScanCode(url.toString());
    if (!code) return null;
    return {
      href,
      route: `/sequence/${encodeURIComponent(code)}${routeSuffix(url)}`,
      identifier: code,
      shortCode: code,
    };
  }

  if (!APP_HOSTS.has(hostname)) return null;

  const routeKind = segments[0]?.toLowerCase();
  const rawIdentifier = segments[1];
  if ((routeKind !== "sequence" && routeKind !== "q") || !rawIdentifier) {
    return null;
  }

  const identifier = decodePathSegment(rawIdentifier);
  if (!identifier) return null;

  if (routeKind === "q") {
    const code = extractScanCode(`https://tka.run/${rawIdentifier}`);
    if (!code) return null;
    return {
      href,
      route: `/sequence/${encodeURIComponent(code)}${routeSuffix(url)}`,
      identifier: code,
      shortCode: code,
    };
  }

  return {
    href,
    route: `/sequence/${rawIdentifier}${routeSuffix(url)}`,
    identifier,
  };
}

export function findMessageSequenceLink(
  content: string
): MessageSequenceLink | null {
  for (const part of parseMessageText(content)) {
    if (part.kind !== "link" || part.linkType !== "url") continue;
    const sequenceLink = sequenceLinkFromUrl(part.href);
    if (sequenceLink) return sequenceLink;
  }
  return null;
}

export function buildDetectedSequenceAttachment(
  link: MessageSequenceLink
): MessageAttachment {
  return {
    type: "sequence",
    url: link.route,
    name: "Sequence",
    metadata: {
      title: "Sequence",
      ...(link.shortCode
        ? { sequenceShortCode: link.shortCode }
        : { sequenceId: link.identifier }),
    },
  };
}

/**
 * Matches MessageBubble's attachment precedence so thread autoplay selects a
 * sequence card that will actually render, including previews detected from a
 * pasted TKA link.
 */
export function messageHasSequencePreview(message: Message): boolean {
  if (message.isDeleted) return false;

  const attachments = message.attachments ?? [];
  if (attachments.some((attachment) => attachment.type === "image")) {
    return false;
  }
  if (attachments.some((attachment) => attachment.type === "sequence")) {
    return true;
  }
  if (
    attachments.some(
      (attachment) =>
        attachment.type === "collection" || attachment.type === "feedback"
    )
  ) {
    return false;
  }

  return findMessageSequenceLink(message.content) !== null;
}

export function findLatestSequencePreviewMessageId(
  messages: readonly Message[]
): string | null {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message && messageHasSequencePreview(message)) return message.id;
  }
  return null;
}
