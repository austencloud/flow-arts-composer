/**
 * Notification Domain Models — re-export shim.
 *
 * This file was a verbatim copy of the canonical models in
 * `#lib/shared/feedback/domain/models/notification-models.js` and the two had
 * already started to drift (the Pulse notification types landed only in the
 * canonical file). Inbox components import from here, so keep the path alive
 * but forward everything to the single source of truth.
 */
export * from "#lib/shared/feedback/domain/models/notification-models.js";
