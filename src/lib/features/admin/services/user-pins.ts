import type { UserPresenceWithId } from "#lib/shared/presence/domain/models/presence-models.js";

/** A generic map pin matching GlobalUserMap's `scanMarkers` prop shape. */
export interface UserMapPin {
  id: string;
  lat: number;
  lng: number;
  label: string;
  styleClass: "pin" | "pin-new";
}

/**
 * Build map pins from admin users that have finite coordinates. Active users
 * render as the pulsing "pin-new" so live connections stand out. Label is the
 * display name plus city when known. Pure for unit testing.
 */
export function buildUserPins(users: UserPresenceWithId[]): UserMapPin[] {
  const pins: UserMapPin[] = [];
  for (const u of users) {
    const lat = u.location?.lat;
    const lng = u.location?.lng;
    if (lat == null || lng == null) continue;
    const name = u.displayName ?? "User";
    const city = u.location?.city;
    pins.push({
      id: u.userId,
      lat,
      lng,
      label: city ? `${name} · ${city}` : name,
      styleClass: u.activityStatus === "active" ? "pin-new" : "pin",
    });
  }
  return pins;
}
