/**
 * Reactive owner of the community map band: the public marker list, the signed-in
 * user's own membership, and the invitation slot derived from both.
 *
 * Ordering, supersession, session cancellation, and serialization are NOT here.
 * They live in `domain/location-mutation-queue.ts` as plain functions, because
 * that is where every defect four review rounds found actually was, and testing
 * them through a reactive wrapper would have hidden all of them. This module
 * owns reactive fields and delegates.
 *
 * Two rules shape everything below:
 *
 * 1. **Membership derives only from the user's own document.** It cannot be
 *    read off the public list: that query excludes private documents, drops
 *    documents whose profile join returns null, and is limit-bounded, so a
 *    member can be missing from it for three unrelated reasons.
 * 2. **Confirmed and optimistic state are separate.** Confirmed advances only
 *    on an applied write or a repository read. A failure drops the optimistic
 *    layer and renders confirmed — never an earlier optimistic snapshot, which
 *    would show the user a city that was never persisted.
 */

import {
  createLocationMutationQueue,
  type MutationOutcome,
} from "../domain/location-mutation-queue";
import type { CanonicalCity, CitySuggestion } from "../domain/canonical-city";
import type { UserLocationWithProfile } from "../domain/models/user-location";
import type { CommunityMapPort } from "../services/community-map-port";

/**
 * Auth as this module needs it. Pushed in by the host rather than read from a
 * global, so the guest / pending / full-user distinction the Firestore rules
 * already enforce is explicit here instead of inferred from a null uid.
 */
export type AuthIdentity =
  | { status: "pending" }
  | { status: "guest" }
  | { status: "user"; uid: string };

/** A city as the slot renders it. Reached from a write or from a read. */
export interface MemberCity {
  city: string;
  country: string;
  /**
   * The pin is kept off the public map because the person is hidden from
   * Creators or disabled. Known from the save that wrote it, or from the
   * hiddenByFlag mark on the stored pin.
   */
  private?: boolean;
}

type ConfirmedMembership =
  | { status: "unresolved" }
  | { status: "absent" }
  | { status: "member"; city: MemberCity }
  | { status: "failed"; error: unknown };

/**
 * What the latest gesture is claiming, before the write confirms it. `label` is
 * separate from a full {@link CanonicalCity} because the display name is known
 * at the gesture while the coordinates are still being resolved.
 */
type OptimisticMembership =
  | { intent: number; kind: "add"; label: string }
  | { intent: number; kind: "remove" };

export type LocationsStatus = "idle" | "loading" | "loaded" | "failed";

export type SlotState =
  /** Auth or the own-document read is still outstanding. Reserve space, say nothing. */
  | { kind: "unresolved" }
  /** Not a full account. The rules would reject the write; the UI says so first. */
  | { kind: "guest" }
  /** One tap away from joining, or recovering from a read that failed. */
  | {
      kind: "suggest";
      suggestion: CitySuggestion | null;
      canAdd: boolean;
      retryable: boolean;
      pending: boolean;
    }
  /** No suggestion to offer, or the user asked to choose. */
  | { kind: "pick"; pending: boolean }
  /** On the map. */
  | { kind: "member"; city: MemberCity; pending: boolean };

export interface CommunityMapStateOptions {
  port: CommunityMapPort;
  /**
   * The Cloudflare-derived city, if the edge supplied a usable one. Read as a
   * function so the host can supply it once page data resolves.
   */
  getSuggestion?: () => CitySuggestion | null;
}

/** An add gesture: a label to show immediately, and the work to make it writable. */
export interface AddCityRequest {
  label: string;
  canonicalize: () => Promise<CanonicalCity>;
}

export function createCommunityMapState(options: CommunityMapStateOptions) {
  const { port, getSuggestion = () => null } = options;

  let identity = $state<AuthIdentity>({ status: "pending" });

  let locations = $state<UserLocationWithProfile[]>([]);
  let locationsStatus = $state<LocationsStatus>("idle");
  let locationsError = $state<unknown>(null);

  let confirmed = $state<ConfirmedMembership>({ status: "unresolved" });
  let optimistic = $state<OptimisticMembership | null>(null);
  let mutationError = $state<{ intent: number; error: unknown } | null>(null);
  let pickerOpen = $state(false);

  /**
   * Reactive mirror of the queue's latest intent number. The queue is a plain
   * module by design, so its counter cannot drive `$derived`; this field is
   * updated wherever an intent is stamped and is only ever read for rendering.
   * The queue remains the authority for ordering decisions.
   */
  let latestGestureIntent = $state(0);

  /**
   * The highest intent whose write has been confirmed. Applied outcomes arrive
   * in increasing intent order today, since the queue runs submissions serially
   * and a submission that lost the ordering race is superseded before it writes.
   * The guard is kept anyway: it makes the invariant explicit at the one place
   * that depends on it rather than leaving it as a property to be re-derived.
   */
  let confirmedIntent = 0;

  /**
   * Identifies the current session. Bumped on every identity change, and
   * captured by every read and every gesture, so nothing issued for the
   * previous user can land on the next one's state.
   *
   * Mutations need this as much as reads do. A write that was already issued
   * when the identity changed still resolves, and without this guard an
   * `applied` outcome from the old session would advance the new session's
   * confirmed membership — the previous user's city, shown to whoever signed
   * in after them.
   */
  let sessionToken = 0;

  const queue = createLocationMutationQueue({
    getLiveUid: () => (identity.status === "user" ? identity.uid : null),
  });

  /** The optimistic layer only renders while it still owns the latest gesture. */
  const activeOptimistic = $derived(
    optimistic && optimistic.intent === latestGestureIntent ? optimistic : null,
  );

  const errorForDisplay = $derived(
    mutationError && mutationError.intent === latestGestureIntent
      ? mutationError.error
      : null,
  );

  const slot = $derived.by<SlotState>(() => {
    if (identity.status === "pending") return { kind: "unresolved" };
    if (identity.status === "guest") return { kind: "guest" };

    const pending = activeOptimistic !== null;

    if (activeOptimistic?.kind === "add") {
      // The city name is known from the gesture even though the write is not
      // confirmed, so the slot can show the destination rather than a spinner
      // with no subject.
      return {
        kind: "member",
        city: { city: activeOptimistic.label, country: "" },
        pending: true,
      };
    }

    if (activeOptimistic?.kind !== "remove") {
      if (confirmed.status === "unresolved") return { kind: "unresolved" };
      if (confirmed.status === "member") {
        return { kind: "member", city: confirmed.city, pending: false };
      }
      if (confirmed.status === "failed") {
        // Never `absent`: offering "add yourself to the map" to someone who is
        // already on it is the visible symptom of treating a failed read as a
        // negative answer.
        return {
          kind: "suggest",
          suggestion: getSuggestion(),
          canAdd: false,
          retryable: true,
          pending,
        };
      }
    }

    if (pickerOpen) return { kind: "pick", pending };

    const suggestion = getSuggestion();
    if (suggestion === null) return { kind: "pick", pending };
    return { kind: "suggest", suggestion, canAdd: true, retryable: false, pending };
  });

  /** Record an outcome. Confirmed and displayed state move independently. */
  function settle(
    session: number,
    outcome: MutationOutcome,
    applied: ConfirmedMembership,
  ): void {
    // Disowned. The write may well have landed under the old uid — nothing
    // client-side can recall an issued request — but this state belongs to a
    // different identity now and re-reads rather than inferring what committed.
    if (session !== sessionToken) return;

    if (outcome.status === "applied" && outcome.intent >= confirmedIntent) {
      confirmed = applied;
      confirmedIntent = outcome.intent;
    }

    // An outcome for a stale intent may advance confirmed, but it changes
    // nothing on screen: a newer gesture already owns the display.
    if (outcome.intent !== latestGestureIntent) return;

    optimistic = null;
    mutationError =
      outcome.status === "failed"
        ? { intent: outcome.intent, error: outcome.error }
        : null;
  }

  async function loadOwnMembership(): Promise<void> {
    if (identity.status !== "user") return;
    const uid = identity.uid;
    const token = sessionToken;
    const intentAtStart = latestGestureIntent;

    confirmed = { status: "unresolved" };
    const result = await port.readOwnLocation(uid);

    // Disowned if the identity changed, or if the user acted while the read was
    // in flight — in that case the document the read describes is already stale.
    if (token !== sessionToken || intentAtStart !== latestGestureIntent) return;

    if (result.status === "found") {
      confirmed = {
        status: "member",
        city: {
          city: result.location.city,
          country: result.location.country,
          ...(result.location.hiddenByFlag === true ? { private: true } : {}),
        },
      };
    } else if (result.status === "absent") {
      confirmed = { status: "absent" };
    } else {
      confirmed = { status: "failed", error: result.error };
    }
  }

  return {
    get identity() {
      return identity;
    },
    get locations() {
      return locations;
    },
    get locationsStatus() {
      return locationsStatus;
    },
    get locationsError() {
      return locationsError;
    },
    get slot() {
      return slot;
    },
    get mutationError() {
      return errorForDisplay;
    },
    get pickerOpen() {
      return pickerOpen;
    },

    openPicker() {
      pickerOpen = true;
    },
    closePicker() {
      pickerOpen = false;
    },

    /**
     * Point the state at an identity. Cancels every unissued mutation from the
     * previous session, disowns outstanding reads, and reloads. Signing out and
     * back in as the same uid still resets: the boundary is the session.
     */
    setIdentity(next: AuthIdentity): void {
      const unchanged =
        identity.status === next.status &&
        (identity.status !== "user" ||
          next.status !== "user" ||
          identity.uid === next.uid);
      if (unchanged) return;

      identity = next;
      queue.invalidateSession();
      sessionToken += 1;
      optimistic = null;
      mutationError = null;
      pickerOpen = false;
      confirmed = { status: "unresolved" };
      confirmedIntent = 0;

      // An issued write may still land under the old uid; nothing client-side
      // can recall it. Rather than reasoning about what committed, the state
      // re-reads whatever is actually there for the new identity.
      if (next.status === "user") void loadOwnMembership();
    },

    async loadLocations(): Promise<void> {
      locationsStatus = "loading";
      locationsError = null;
      const token = sessionToken;
      try {
        const result = await port.listPublicLocations();
        if (token !== sessionToken) return;
        locations = result;
        locationsStatus = "loaded";
      } catch (error) {
        if (token !== sessionToken) return;
        locationsError = error;
        locationsStatus = "failed";
      }
    },

    loadOwnMembership,
    /** Re-read after a failed read. Not a mutation; draws no intent. */
    retryOwnMembership: loadOwnMembership,

    /**
     * Add or change the user's city.
     *
     * The intent is stamped here, synchronously, before `canonicalize()` is
     * awaited. Stamping it after canonicalization is the bug this whole
     * mechanism exists to prevent: a picker selection that begins a Places
     * lookup, loses a race to a Remove, and then resolves would draw a *newer*
     * number than the Remove and put the user back on the map.
     */
    async addCity(request: AddCityRequest): Promise<MutationOutcome> {
      const intent = queue.beginIntent("add");
      const session = sessionToken;
      latestGestureIntent = intent.intent;
      optimistic = { intent: intent.intent, kind: "add", label: request.label };
      mutationError = null;
      pickerOpen = false;

      let canonical: CanonicalCity;
      try {
        canonical = await request.canonicalize();
      } catch (error) {
        // Routed through the queue rather than reported directly, so a
        // canonicalization failure for a gesture the user already replaced
        // reports `superseded` and stays silent instead of raising an error
        // about work nobody is waiting on.
        const outcome = await queue.submit(intent, () => Promise.reject(error));
        settle(session, outcome, confirmed);
        return outcome;
      }

      const city: MemberCity = { city: canonical.city, country: canonical.country };
      const applied: ConfirmedMembership = { status: "member", city };
      const outcome = await queue.submit(intent, async () => {
        const wrote = await port.saveCity(intent.uid, canonical);
        if (wrote === "private") city.private = true;
      });
      settle(session, outcome, applied);
      return outcome;
    },

    /** Remove the user from the map. */
    async removeCity(): Promise<MutationOutcome> {
      const intent = queue.beginIntent("remove");
      const session = sessionToken;
      latestGestureIntent = intent.intent;
      optimistic = { intent: intent.intent, kind: "remove" };
      mutationError = null;

      const outcome = await queue.submit(intent, () =>
        port.removeCity(intent.uid),
      );
      settle(session, outcome, { status: "absent" });
      return outcome;
    },
  };
}

export type CommunityMapState = ReturnType<typeof createCommunityMapState>;
