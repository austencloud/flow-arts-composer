import type { InstagramCapabilitySnapshot } from "#lib/shared/share/domain/instagram/instagram-capability-schema.js";
import type {
  DeliveryIntent,
  PostDeliveryDraft,
} from "#lib/shared/share/domain/instagram/instagram-post-draft-schema.js";

export interface CreatePostDeliveryStateInput {
  draft: PostDeliveryDraft;
  capabilitySnapshot: InstagramCapabilitySnapshot | null;
}

export function createPostDeliveryState(input: CreatePostDeliveryStateInput) {
  let draft = $state<PostDeliveryDraft>(structuredClone(input.draft));
  let capabilitySnapshot = $state<InstagramCapabilitySnapshot | null>(
    input.capabilitySnapshot
  );
  let mobileView = $state<"preview" | "details">("details");

  function updateDraft(
    update: (current: PostDeliveryDraft) => PostDeliveryDraft
  ): void {
    draft = {
      ...update(draft),
      updatedAt: Date.now(),
    };
  }

  return {
    get draft(): PostDeliveryDraft {
      return draft;
    },
    get capabilitySnapshot(): InstagramCapabilitySnapshot | null {
      return capabilitySnapshot;
    },
    get mobileView(): "preview" | "details" {
      return mobileView;
    },
    reset(next: CreatePostDeliveryStateInput): void {
      draft = structuredClone(next.draft);
      capabilitySnapshot = next.capabilitySnapshot;
      mobileView = "details";
    },
    setCapabilitySnapshot(next: InstagramCapabilitySnapshot | null): void {
      capabilitySnapshot = next;
    },
    setMobileView(next: "preview" | "details"): void {
      mobileView = next;
    },
    setCaption(caption: string): void {
      updateDraft((current) => ({ ...current, caption }));
    },
    setShareToFeed(shareToFeed: boolean): void {
      updateDraft((current) => ({
        ...current,
        instagram: { ...current.instagram, shareToFeed },
      }));
    },
    setDelivery(delivery: DeliveryIntent): void {
      updateDraft((current) => ({ ...current, delivery }));
    },
  };
}

export type PostDeliveryState = ReturnType<typeof createPostDeliveryState>;
