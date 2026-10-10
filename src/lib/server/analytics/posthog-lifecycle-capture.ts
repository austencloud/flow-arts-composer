import { PostHog } from "posthog-node";
import type { LifecycleEventEnvelope } from "#lib/shared/analytics/domain/lifecycle-event.js";

const POSTHOG_INGESTION_HOST = "https://us.i.posthog.com";

type CaptureClient = Pick<PostHog, "captureImmediate" | "shutdown">;
type CaptureClientFactory = (apiKey: string) => CaptureClient;

export interface PostHogLifecycleCapture {
  apiKey: string;
  distinctId: string;
  envelope: LifecycleEventEnvelope;
  sessionId: string | null;
  isGuest: boolean;
}

function createCaptureClient(apiKey: string): CaptureClient {
  return new PostHog(apiKey, {
    host: POSTHOG_INGESTION_HOST,
    flushAt: 1,
    flushInterval: 0,
  });
}

function lifecycleProperties(
  envelope: LifecycleEventEnvelope
): Record<string, unknown> {
  switch (envelope.event) {
    case "guest_upgraded_to_account":
      return {
        status: envelope.properties.status,
        ...(envelope.properties.surface
          ? { surface: envelope.properties.surface }
          : {}),
        ...(envelope.properties.origin
          ? { origin: envelope.properties.origin }
          : {}),
        ...(envelope.properties.method
          ? { method: envelope.properties.method }
          : {}),
        ...(envelope.properties.authMode
          ? { auth_mode: envelope.properties.authMode }
          : {}),
      };
    case "sequence_save":
      return {
        category: "sequence",
        sequence_id: envelope.properties.sequenceId,
        sequence_length: envelope.properties.stepCount,
        visibility: envelope.properties.visibility,
        is_public: envelope.properties.visibility === "public",
        durability: envelope.properties.durability,
        source: envelope.properties.source ?? "unspecified",
      };
    case "tunnel_save":
      return {
        category: "tunnel",
        tunnel_id: envelope.properties.tunnelId,
        source: envelope.properties.source,
        sequence_length: envelope.properties.stepCount,
        durability: envelope.properties.durability,
        ...(envelope.properties.sourceSequenceId
          ? { source_sequence_id: envelope.properties.sourceSequenceId }
          : {}),
      };
  }
}

/**
 * Server-owned capture keeps the verified Firebase UID authoritative while
 * preserving the browser's replay session and the client's idempotency key.
 */
export async function capturePostHogLifecycleEvent(
  input: PostHogLifecycleCapture,
  createClient: CaptureClientFactory = createCaptureClient
): Promise<void> {
  const client = createClient(input.apiKey);
  try {
    await client.captureImmediate({
      distinctId: input.distinctId,
      event: input.envelope.event,
      uuid: input.envelope.eventId,
      timestamp: new Date(input.envelope.occurredAt),
      properties: {
        ...lifecycleProperties(input.envelope),
        ...(input.sessionId ? { $session_id: input.sessionId } : {}),
        is_guest: input.isGuest,
        delivery: "server",
        schema_version: 1,
      },
    });
  } finally {
    await client.shutdown();
  }
}
