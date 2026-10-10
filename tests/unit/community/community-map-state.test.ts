import { describe, it, expect } from "vitest";
import {
  createCommunityMapState,
  type AuthIdentity,
} from "#lib/features/community/state/community-map-state.svelte.js";
import type { CanonicalCity } from "#lib/features/community/domain/canonical-city.js";
import type { CommunityMapPort } from "#lib/features/community/services/community-map-port.js";
import type {
  OwnLocationResult,
  UserLocation,
  UserLocationWithProfile,
} from "#lib/features/community/domain/models/user-location.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function city(name: string): CanonicalCity {
  return {
    city: name,
    country: "United States",
    countryCode: "US",
    coords: { lat: 41.88, lng: -87.63 },
  };
}

/** A canonical city that is available immediately, as the CF path's is. */
function immediate(name: string) {
  return { label: name, canonicalize: async () => city(name) };
}

function locationDoc(name: string): UserLocation {
  return {
    userId: "user-1",
    city: name,
    country: "United States",
    countryCode: "US",
    cityCenterCoordinates: { lat: 41.88, lng: -87.63 },
    visibility: "public",
    updatedAt: undefined as unknown as UserLocation["updatedAt"],
  };
}

interface PortControls {
  port: CommunityMapPort;
  /** Every persistence call, in the order it was actually issued. */
  calls: string[];
  ownReads: Array<(result: OwnLocationResult) => void>;
  /** Gate the next save/remove instead of letting it resolve. */
  gateNextWrite(): { resolve: () => void; reject: (error: unknown) => void };
}

function createPort(): PortControls {
  const calls: string[] = [];
  const ownReads: Array<(result: OwnLocationResult) => void> = [];
  const gates: Array<ReturnType<typeof deferred<void>>> = [];

  const nextWrite = (): Promise<void> => {
    const gate = gates.shift();
    return gate ? gate.promise : Promise.resolve();
  };

  return {
    calls,
    ownReads,
    gateNextWrite() {
      const gate = deferred<void>();
      gates.push(gate);
      return { resolve: () => gate.resolve(), reject: gate.reject };
    },
    port: {
      readOwnLocation: () =>
        new Promise<OwnLocationResult>((resolve) => ownReads.push(resolve)),
      listPublicLocations: async (): Promise<UserLocationWithProfile[]> => [],
      saveCity: (_uid, canonical) => {
        calls.push(`save:${canonical.city}`);
        return nextWrite();
      },
      removeCity: () => {
        calls.push("remove");
        return nextWrite();
      },
    },
  };
}

function setup(identity: AuthIdentity = { status: "user", uid: "user-1" }) {
  const controls = createPort();
  const state = createCommunityMapState({ port: controls.port });
  state.setIdentity(identity);
  return { state, ...controls };
}

/** Bring membership to a known confirmed value without going through a write. */
async function resolveOwnRead(
  controls: PortControls,
  result: OwnLocationResult,
): Promise<void> {
  await settle();
  const resolve = controls.ownReads.shift();
  expect(resolve, "expected an own-location read to be in flight").toBeTypeOf(
    "function",
  );
  resolve!(result);
  await settle();
}

describe("community map state", () => {
  describe("membership reads", () => {
    it("distinguishes absent from failed rather than collapsing both", async () => {
      const controls = setup();
      await resolveOwnRead(controls, { status: "absent" });
      expect(controls.state.slot.kind).toBe("pick");

      const failing = setup();
      await resolveOwnRead(failing, {
        status: "failed",
        error: new Error("offline"),
      });

      // Never `absent`. Inviting someone who may already be on the map to add
      // themselves is the visible symptom of treating a failed read as a no.
      const slot = failing.state.slot;
      expect(slot.kind).toBe("suggest");
      if (slot.kind !== "suggest") throw new Error("unreachable");
      expect(slot.canAdd).toBe(false);
      expect(slot.retryable).toBe(true);
    });

    it("reports membership for a user whose document exists", async () => {
      const controls = setup();
      await resolveOwnRead(controls, {
        status: "found",
        location: locationDoc("Chicago"),
      });

      const slot = controls.state.slot;
      expect(slot.kind).toBe("member");
      if (slot.kind !== "member") throw new Error("unreachable");
      expect(slot.city.city).toBe("Chicago");
      expect(slot.pending).toBe(false);
    });

    it("discards a read that was overtaken by a user gesture", async () => {
      const controls = setup();
      await settle();
      const resolveRead = controls.ownReads.shift()!;

      // The user acts while the read is still in flight, so by the time it
      // lands it describes a document that has already been replaced.
      const add = controls.state.addCity(immediate("Denver"));
      resolveRead({ status: "absent" });
      await settle();
      await add;

      const slot = controls.state.slot;
      expect(slot.kind).toBe("member");
      if (slot.kind !== "member") throw new Error("unreachable");
      expect(slot.city.city).toBe("Denver");
    });
  });

  describe("gesture ordering", () => {
    it("ends absent for add A, add B, remove", async () => {
      const controls = setup();
      await resolveOwnRead(controls, { status: "absent" });

      const outcomes = await Promise.all([
        controls.state.addCity(immediate("Austin")),
        controls.state.addCity(immediate("Boston")),
        controls.state.removeCity(),
      ]);

      expect(outcomes.map((o) => o.status)).toEqual([
        "superseded",
        "superseded",
        "applied",
      ]);
      expect(controls.calls).toEqual(["remove"]);
      expect(controls.state.slot.kind).toBe("pick");
    });

    it("ends at C for remove, then add C", async () => {
      const controls = setup();
      await resolveOwnRead(controls, {
        status: "found",
        location: locationDoc("Chicago"),
      });

      const outcomes = await Promise.all([
        controls.state.removeCity(),
        controls.state.addCity(immediate("Cleveland")),
      ]);

      // Changing your mind after removing is a later explicit decision, not
      // something a "remove always wins" rule gets to discard.
      expect(outcomes.map((o) => o.status)).toEqual(["superseded", "applied"]);
      expect(controls.calls).toEqual(["save:Cleveland"]);

      const slot = controls.state.slot;
      expect(slot.kind).toBe("member");
      if (slot.kind !== "member") throw new Error("unreachable");
      expect(slot.city.city).toBe("Cleveland");
    });

    it("cannot resurrect a removed user when canonicalization resolves late", async () => {
      // THE regression the whole intent mechanism exists for. If `addCity`
      // stamped its intent after `canonicalize()` resolved, this late add would
      // outrank the Remove it lost the race to and put the user back on the map.
      const controls = setup();
      await resolveOwnRead(controls, { status: "absent" });

      const lookup = deferred<CanonicalCity>();
      const add = controls.state.addCity({
        label: "Portland",
        canonicalize: () => lookup.promise,
      });

      const removal = await controls.state.removeCity();
      expect(removal.status).toBe("applied");

      lookup.resolve(city("Portland"));
      expect((await add).status).toBe("superseded");

      expect(controls.calls).toEqual(["remove"]);
      expect(controls.state.slot.kind).toBe("pick");
    });

    it("reports a canonicalization failure only when it is still the latest gesture", async () => {
      const controls = setup();
      await resolveOwnRead(controls, { status: "absent" });

      const lost = deferred<CanonicalCity>();
      const add = controls.state.addCity({
        label: "Nowhere",
        canonicalize: () => lost.promise,
      });
      await controls.state.removeCity();

      lost.reject(new Error("no city component"));
      expect((await add).status).toBe("superseded");
      // The user already moved on; surfacing this error would be noise about
      // work nobody is waiting for.
      expect(controls.state.mutationError).toBeNull();

      const solo = setup();
      await resolveOwnRead(solo, { status: "absent" });
      const failure = await solo.state.addCity({
        label: "Nowhere",
        canonicalize: () => Promise.reject(new Error("no city component")),
      });
      expect(failure.status).toBe("failed");
      expect(solo.state.mutationError).toBeInstanceOf(Error);
    });
  });

  describe("optimistic rendering and rollback", () => {
    it("shows the destination city while the write is still in flight", async () => {
      const controls = setup();
      await resolveOwnRead(controls, { status: "absent" });

      const gate = controls.gateNextWrite();
      const add = controls.state.addCity(immediate("Seattle"));
      await settle();

      const slot = controls.state.slot;
      expect(slot.kind).toBe("member");
      if (slot.kind !== "member") throw new Error("unreachable");
      expect(slot.city.city).toBe("Seattle");
      expect(slot.pending).toBe(true);

      gate.resolve();
      await add;
      expect(controls.state.slot.pending).toBe(false);
    });

    it("rolls back to confirmed state, not to an earlier optimistic one", async () => {
      // The case that breaks "restore the prior state": confirmed is absent,
      // intent 1 optimistically renders A, intent 2 optimistically renders B,
      // intent 1 never writes, intent 2 fails. Rendering A would show a city
      // that was never persisted and that the user would read as their entry.
      const controls = setup();
      await resolveOwnRead(controls, { status: "absent" });

      const failing = controls.gateNextWrite();
      const [first, second] = await Promise.all([
        controls.state.addCity(immediate("Albany")),
        (async () => {
          const pending = controls.state.addCity(immediate("Boulder"));
          await settle();
          failing.reject(new Error("permission-denied"));
          return pending;
        })(),
      ]);

      expect(first.status).toBe("superseded");
      expect(second.status).toBe("failed");
      expect(controls.state.slot.kind).toBe("pick");
      expect(controls.state.mutationError).toBeInstanceOf(Error);
    });

    it("advances confirmed to an older applied write when a newer one fails", async () => {
      const controls = setup();
      await resolveOwnRead(controls, { status: "absent" });

      const applying = controls.gateNextWrite();
      const older = controls.state.addCity(immediate("Tucson"));
      await settle();
      expect(controls.calls).toEqual(["save:Tucson"]);

      // The newer gesture is stamped while the older write is already issued,
      // so the older one is past its supersession check and will still commit.
      const failing = controls.gateNextWrite();
      const newer = controls.state.removeCity();

      applying.resolve();
      await settle();
      failing.reject(new Error("network"));

      expect((await older).status).toBe("applied");
      expect((await newer).status).toBe("failed");

      // Confirmed reflects the write that actually landed, so the rollback
      // renders Tucson rather than the pre-add absent state.
      const slot = controls.state.slot;
      expect(slot.kind).toBe("member");
      if (slot.kind !== "member") throw new Error("unreachable");
      expect(slot.city.city).toBe("Tucson");
    });

    it("leaves the screen alone when a stale intent settles", async () => {
      const controls = setup();
      await resolveOwnRead(controls, { status: "absent" });

      const stale = controls.gateNextWrite();
      const older = controls.state.addCity(immediate("Fargo"));
      await settle();

      const gate = controls.gateNextWrite();
      const newer = controls.state.addCity(immediate("Galena"));
      await settle();

      stale.resolve();
      await settle();

      // The newer gesture owns the display even though an older write just
      // committed underneath it.
      const midway = controls.state.slot;
      expect(midway.kind).toBe("member");
      if (midway.kind !== "member") throw new Error("unreachable");
      expect(midway.city.city).toBe("Galena");
      expect(midway.pending).toBe(true);

      gate.resolve();
      await Promise.all([older, newer]);
      expect(controls.state.mutationError).toBeNull();
    });
  });

  describe("identity", () => {
    it("renders guests an invitation to sign in rather than failing at the write", () => {
      const { state } = setup({ status: "guest" });
      expect(state.slot.kind).toBe("guest");
    });

    it("reserves the slot while auth is unresolved", () => {
      const controls = createPort();
      const state = createCommunityMapState({ port: controls.port });
      expect(state.slot.kind).toBe("unresolved");
    });

    it("cancels unissued work across a sign-out and sign-in as the same uid", async () => {
      const controls = setup();
      await resolveOwnRead(controls, { status: "absent" });

      const lookup = deferred<CanonicalCity>();
      const add = controls.state.addCity({
        label: "Ithaca",
        canonicalize: () => lookup.promise,
      });

      controls.state.setIdentity({ status: "guest" });
      controls.state.setIdentity({ status: "user", uid: "user-1" });

      lookup.resolve(city("Ithaca"));
      // `cancelled`, not `superseded`: no newer gesture exists, the session
      // boundary is what killed it.
      expect((await add).status).toBe("cancelled");
      expect(controls.calls).toEqual([]);
    });

    it("disowns an issued write across an identity change and re-reads instead", async () => {
      const controls = setup();
      await resolveOwnRead(controls, { status: "absent" });

      const inFlight = controls.gateNextWrite();
      const add = controls.state.addCity(immediate("Duluth"));
      await settle();
      expect(controls.calls).toEqual(["save:Duluth"]);

      controls.state.setIdentity({ status: "user", uid: "user-2" });
      inFlight.resolve();

      // The write was already issued, so it lands. The state does not pretend
      // it was recalled; it stops owning the result and reads the new identity.
      expect((await add).status).toBe("applied");
      expect(controls.state.slot.kind).toBe("unresolved");

      await resolveOwnRead(controls, { status: "absent" });
      expect(controls.state.slot.kind).toBe("pick");
    });

    it("discards a public-location load that lands after an identity change", async () => {
      const controls = createPort();
      const listing = deferred<UserLocationWithProfile[]>();
      const state = createCommunityMapState({
        port: { ...controls.port, listPublicLocations: () => listing.promise },
      });
      state.setIdentity({ status: "user", uid: "user-1" });

      const loading = state.loadLocations();
      state.setIdentity({ status: "guest" });
      listing.resolve([{ userId: "other" } as UserLocationWithProfile]);
      await loading;

      expect(state.locations).toEqual([]);
      expect(state.locationsStatus).toBe("loading");
    });
  });

  describe("public locations", () => {
    it("keeps a load failure distinct from an empty map", async () => {
      const controls = createPort();
      const state = createCommunityMapState({
        port: {
          ...controls.port,
          listPublicLocations: () => Promise.reject(new Error("unavailable")),
        },
      });
      state.setIdentity({ status: "user", uid: "user-1" });

      await state.loadLocations();

      expect(state.locationsStatus).toBe("failed");
      expect(state.locationsError).toBeInstanceOf(Error);
      expect(state.locations).toEqual([]);
    });

    it("does not derive membership from the public list", async () => {
      const controls = setup();
      // The user's own document exists and is private, so it can never appear
      // in the public list. Membership must still be true.
      await resolveOwnRead(controls, {
        status: "found",
        location: { ...locationDoc("Chicago"), visibility: "private" },
      });
      await controls.state.loadLocations();

      expect(controls.state.locations).toEqual([]);
      expect(controls.state.slot.kind).toBe("member");
    });
  });
});
