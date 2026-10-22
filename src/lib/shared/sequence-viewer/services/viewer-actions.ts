import type { OrchestratorContext } from "../domain/viewer-orchestrator-context";
import { VIDEO_UPLOAD_ENABLED } from "../config/viewer-feature-flags";
import { openCollectionPicker } from "#lib/features/library/state/collection-picker-state.svelte.js";
import { ensureGuestIdentity } from "#lib/shared/auth/services/guest-identity.js";

// One profile since every viewer destination adopted SequenceViewerShell (the
// same chrome verbatim) — the hand-rolled "scan" funnel profile is gone. The param
// survives so call sites read explicitly.
export type ViewerHeaderProfile = "full";

/**
 * Handlers the orchestrator `ctx` cannot own — page-local wiring (e.g. the
 * page's delete-confirm dialog).
 */
export interface ViewerActionWiring {
  onDeleteRequest?: () => void;
}

/**
 * The exact gated prop-set every header surface feeds to `ViewerOverflowMenu`
 * (and its desktop right-cluster). `undefined` handler = the action is hidden.
 */
export interface ViewerHeaderActions {
  isFavorite: boolean;
  isSaved: boolean;
  isSaving: boolean;
  isPublished: boolean;
  practiceActive: boolean;
  showPractice: boolean;
  onFavoriteToggle?: () => void;
  onSave?: () => void;
  onAddToCollection?: () => void;
  onRemix?: () => void;
  remixLabel?: string;
  onVideoUpload?: () => void;
  onPublish?: () => void;
  onUnpublish?: () => void;
  onDeleteRequest?: () => void;
  onPracticeToggle?: () => void;
}

/**
 * Single source of truth for which viewer actions exist and when. Gate rules
 * (grounded in SequenceViewerOrchestrator.svelte:400,1060):
 *   - Engagement (favorite/save/remix/practice): always offered — a guest tap
 *     prompts login via invokeGatedAction.
 *   - Management (video/publish/unpublish/delete): gated by ctx eligibility.
 *   - Collections: any sequence a collection can resolve later, which is the
 *     viewer's own library record or someone else's gallery sequence (members
 *     missing from the owner's library are read from the public index). A
 *     guest gets an anonymous identity first, like save.
 */
export function buildHeaderActions(
  ctx: OrchestratorContext,
  _profile: ViewerHeaderProfile,
  wiring: ViewerActionWiring = {}
): ViewerHeaderActions {
  const ownerCanManage = ctx.isOwned && ctx.isSaved && ctx.isOwnedLibraryRecord;

  const a: ViewerHeaderActions = {
    isFavorite: ctx.isFavorite,
    isSaved: ctx.isSaved,
    isSaving: ctx.isSaving,
    isPublished: ctx.isPublished,
    practiceActive: ctx.practiceActive,
    showPractice: true,
  };

  a.onFavoriteToggle = () =>
    ctx.invokeGatedAction("favorite", ctx.handleFavoriteToggle);
  a.onSave = () => ctx.invokeGatedAction("save", ctx.handleSave);
  a.onRemix = () => ctx.invokeGatedAction("remix", ctx.handleEdit);
  a.onPracticeToggle = () =>
    ctx.practiceActive ? ctx.exitPracticeMode() : ctx.enterPracticeMode();

  if (ctx.isLoggedIn && VIDEO_UPLOAD_ENABLED)
    a.onVideoUpload = () => ctx.handleVideoUpload();
  if (canFileInCollection(ctx)) {
    a.onAddToCollection = () => {
      const sequence = ctx.sequence;
      if (!sequence) return;
      void ensureGuestIdentity().then(() =>
        openCollectionPicker({
          sequenceId: sequence.id,
          sequenceLabel: sequence.name || sequence.word || undefined,
        })
      );
    };
  }
  if (ownerCanManage) {
    a.onPublish = () =>
      ctx.invokeGatedAction("publish", ctx.handlePublishAction);
    a.onUnpublish = ctx.handleUnpublishAction;
    a.onDeleteRequest = wiring.onDeleteRequest;
  }

  return a;
}

/**
 * Whether a collection could hold this sequence and find it again. Unsaved
 * work of your own and sequences with no owner have ids nothing resolves, so
 * filing them would leave an empty slot in the collection.
 */
export function canFileInCollection(
  ctx: Pick<OrchestratorContext, "sequence" | "isOwned" | "isOwnedLibraryRecord">
): boolean {
  const sequence = ctx.sequence;
  if (!sequence?.id) return false;
  if (ctx.isOwnedLibraryRecord) return true;
  return !!sequence.ownerId && !ctx.isOwned;
}
