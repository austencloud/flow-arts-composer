import { describe, expect, it } from "vitest";
import {
  InstagramCapabilitySnapshotSchema,
  type InstagramCapabilitySnapshot,
} from "#lib/shared/share/domain/instagram/instagram-capability-schema.js";
import {
  PostDeliveryDraftSchema,
  type InstagramPublishOptions,
  type PostDeliveryDraft,
} from "#lib/shared/share/domain/instagram/instagram-post-draft-schema.js";
import {
  canTransitionInstagramPublication,
  InstagramPublicationRecordSchema,
} from "#lib/shared/share/domain/instagram/instagram-publication-schema.js";
import { PostRecipeSchema } from "#lib/shared/share/domain/instagram/post-recipe-schema.js";
import {
  countInstagramCaptionParts,
  evaluateInstagramPublishEligibility,
} from "#lib/shared/share/domain/instagram/instagram-post-policy.js";
import { buildInstagramCapabilitySnapshot } from "../../../firebase-functions/src/share/instagramCapabilities";

function timestamp(ms: number): { toMillis(): number } {
  return { toMillis: () => ms };
}

function options(): InstagramPublishOptions {
  return {
    shareToFeed: true,
    cover: { kind: "frame", offsetMs: 1_500 },
    originalAudioName: null,
    attachedAudio: null,
    trial: null,
    collaborators: [],
    userTags: [],
    locationId: null,
    productTags: [],
    aiGenerated: false,
    paidPartnership: false,
    sponsorIds: [],
  };
}

function draft(): PostDeliveryDraft {
  return {
    schemaVersion: 1,
    id: "draft-a",
    ownerId: "owner-a",
    sourceSequenceId: "sequence-a",
    recipeId: null,
    format: "reel",
    items: [
      {
        id: "item-a",
        artifactRevisionId: "artifact-a",
        order: 0,
        altText: null,
        cropPreviewRevision: "crop-a",
      },
    ],
    caption: "FΨ practice #flowarts @tkaflowarts",
    instagram: options(),
    delivery: { mode: "publish-now" },
    selectedAccountId: "ig-a",
    capabilitySnapshotId: "snapshot-a",
    createdAt: 100,
    updatedAt: 100,
  };
}

function snapshot(nowMs = 100): InstagramCapabilitySnapshot {
  return InstagramCapabilitySnapshotSchema.parse(
    buildInstagramCapabilitySnapshot(
      {
        igUserId: "ig-a",
        username: "tkaflowarts",
        accountType: "CREATOR",
        graphVersion: "v26.0",
        appAccess: "standard",
        permissions: {
          instagram_business_basic: "granted",
          instagram_business_content_publish: "granted",
        },
        expiresAt: timestamp(10_000),
        verifiedAt: timestamp(nowMs),
      },
      nowMs
    )
  );
}

describe("Instagram capability contract", () => {
  it("accepts the server-derived v26 snapshot without client repair", () => {
    const parsed = snapshot();

    expect(parsed.features.reel.available).toBe(true);
    expect(parsed.features["api-audio"]).toEqual({
      available: false,
      reasonCode: "meta/facebook-capability-required",
      recoveryAction: "connect-facebook",
    });
  });

  it("keeps a legacy connection conservative until account type is verified", () => {
    const legacy = buildInstagramCapabilitySnapshot(
      {
        igUserId: "ig-legacy",
        username: "legacy",
        permissions: {
          instagram_business_content_publish: "granted",
        },
        expiresAt: timestamp(10_000),
      },
      100
    );

    expect(legacy.accountType).toBe("UNKNOWN");
    expect(legacy.features.reel).toMatchObject({
      available: false,
      reasonCode: "meta/account-type-unverified",
      recoveryAction: "reconnect",
    });
  });

  it("preserves an expired connection so policy can offer the correct recovery", () => {
    const expired = InstagramCapabilitySnapshotSchema.parse(
      buildInstagramCapabilitySnapshot(
        {
          igUserId: "ig-expired",
          username: "expired",
          accountType: "BUSINESS",
          graphVersion: "v26.0",
          appAccess: "standard",
          permissions: {
            instagram_business_basic: "granted",
            instagram_business_content_publish: "granted",
          },
          expiresAt: timestamp(99),
          verifiedAt: timestamp(100),
        },
        100
      )
    );
    const value = draft();
    value.selectedAccountId = "ig-expired";

    expect(evaluateInstagramPublishEligibility(value, expired, 101)).toEqual({
      canPublishDirectly: false,
      reasonCode: "meta/token-expired",
      recoveryAction: "reconnect",
      requiredFeature: "reel",
    });
  });
});

describe("post delivery draft contract", () => {
  it("round-trips deliberate false separately from null", () => {
    const value = draft();
    value.instagram.shareToFeed = false;
    value.instagram.aiGenerated = null;

    const parsed = PostDeliveryDraftSchema.parse(
      JSON.parse(JSON.stringify(value))
    );

    expect(parsed.instagram.shareToFeed).toBe(false);
    expect(parsed.instagram.aiGenerated).toBeNull();
  });

  it("rejects unknown fields and broken carousel order", () => {
    expect(
      PostDeliveryDraftSchema.safeParse({ ...draft(), surprise: true }).success
    ).toBe(false);

    const carousel = draft();
    carousel.format = "carousel";
    carousel.instagram = {
      ...options(),
      shareToFeed: null,
      cover: null,
    };
    carousel.items = [
      { ...carousel.items[0]!, order: 1 },
      {
        id: "item-b",
        artifactRevisionId: "artifact-b",
        order: 0,
        altText: "Second slide",
        cropPreviewRevision: "crop-b",
      },
    ];

    expect(PostDeliveryDraftSchema.safeParse(carousel).success).toBe(false);
  });

  it("rejects Reel-only settings on a still image", () => {
    const image = draft();
    image.format = "image";

    expect(PostDeliveryDraftSchema.safeParse(image).success).toBe(false);
  });
});

describe("delivery and publication policy", () => {
  it("blocks a draft from silently switching Instagram accounts", () => {
    const value = draft();
    value.selectedAccountId = "someone-else";

    expect(
      evaluateInstagramPublishEligibility(value, snapshot(), 200)
    ).toMatchObject({
      canPublishDirectly: false,
      reasonCode: "meta/account-mismatch",
      recoveryAction: "connect-instagram",
    });
  });

  it("allows only the publication state transitions in the contract", () => {
    expect(canTransitionInstagramPublication("ready", "publishing")).toBe(true);
    expect(canTransitionInstagramPublication("publishing", "published")).toBe(
      true
    );
    expect(canTransitionInstagramPublication("published", "publishing")).toBe(
      false
    );
  });

  it("requires a media id before a record can claim publication", () => {
    const record = {
      schemaVersion: 1,
      id: "publication-a",
      ownerId: "owner-a",
      draftSnapshot: draft(),
      accountId: "ig-a",
      username: "tkaflowarts",
      route: "instagram-login",
      state: "published",
      attemptId: "attempt-a",
      leaseExpiresAt: null,
      containerIds: ["container-a"],
      mediaId: null,
      permalink: null,
      scheduledFor: null,
      publishedAt: 200,
      lastError: null,
      lastReconciledAt: null,
      createdAt: 100,
      updatedAt: 200,
    };

    expect(InstagramPublicationRecordSchema.safeParse(record).success).toBe(
      false
    );
  });
});

describe("recipe and caption policy", () => {
  it("refuses temporary audio data and concrete media on a recipe", () => {
    const recipe = {
      schemaVersion: 1,
      id: "recipe-a",
      ownerId: "owner-a",
      name: "Performance breakdown",
      format: "reel",
      compositionPresetId: "preset-a",
      carouselStructure: null,
      captionPresetId: "caption-a",
      deliveryDefaults: options(),
      createdAt: 100,
      updatedAt: 100,
      temporaryAudioPreviewUrl: "https://example.com/temporary.mp3",
    };

    expect(PostRecipeSchema.safeParse(recipe).success).toBe(false);
  });

  it("counts Unicode hashtags and account mentions independently", () => {
    expect(countInstagramCaptionParts("FΨ #flowarts #ψ @tka.flow")).toEqual({
      characters: 25,
      hashtags: 2,
      mentions: 1,
    });
  });
});
