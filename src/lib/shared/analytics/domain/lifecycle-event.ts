import { z } from "zod";

const EventIdSchema = z.string().uuid();
const OccurredAtSchema = z.iso.datetime({ offset: true });
const IdentifierSchema = z.string().trim().min(1).max(160);

const GuestUpgradeEventSchema = z
  .object({
    event: z.literal("guest_upgraded_to_account"),
    eventId: EventIdSchema,
    occurredAt: OccurredAtSchema,
    properties: z
      .object({
        status: z.enum(["linked", "collision-signed-in"]),
        surface: z
          .enum([
            "marketing_header_modal",
            "guest_nudge_modal",
            "auth_sheet",
            "settings_profile",
            "festival_start",
          ])
          .optional(),
        origin: z.string().trim().min(1).max(160).optional(),
        method: z
          .enum([
            "google",
            "google_one_tap",
            "facebook",
            "instagram",
            "magic_link",
            "password",
          ])
          .optional(),
        authMode: z.enum(["signin", "signup"]).optional(),
      })
      .strict(),
  })
  .strict();

const SequenceSaveEventSchema = z
  .object({
    event: z.literal("sequence_save"),
    eventId: EventIdSchema,
    occurredAt: OccurredAtSchema,
    properties: z
      .object({
        sequenceId: IdentifierSchema,
        stepCount: z.number().int().min(0).max(10_000),
        visibility: z.enum(["public", "unlisted", "private"]),
        durability: z.enum(["local", "cloud"]),
        source: z
          .enum([
            "create_save_panel",
            "viewer",
            "share_intake",
            "scan_import",
            "video_record",
            "retro",
            "fuse",
            "unspecified",
          ])
          .optional(),
        // Present only when the save copied another creator's sequence.
        // `source` above is the UI path, so the library origin is its own key.
        sequenceSource: z.literal("copied").optional(),
      })
      .strict(),
  })
  .strict();

const TunnelSaveEventSchema = z
  .object({
    event: z.literal("tunnel_save"),
    eventId: EventIdSchema,
    occurredAt: OccurredAtSchema,
    properties: z
      .object({
        tunnelId: IdentifierSchema,
        source: z.enum(["settings_panel", "canvas_context_menu"]),
        stepCount: z.number().int().min(0).max(10_000),
        durability: z.enum(["local", "cloud"]),
        sourceSequenceId: IdentifierSchema.optional(),
      })
      .strict(),
  })
  .strict();

export const LifecycleEventEnvelopeSchema = z.discriminatedUnion("event", [
  GuestUpgradeEventSchema,
  SequenceSaveEventSchema,
  TunnelSaveEventSchema,
]);

export type LifecycleEventEnvelope = z.infer<
  typeof LifecycleEventEnvelopeSchema
>;
export type LifecycleEventInput = LifecycleEventEnvelope extends infer Event
  ? Event extends LifecycleEventEnvelope
    ? Omit<Event, "eventId" | "occurredAt">
    : never
  : never;
