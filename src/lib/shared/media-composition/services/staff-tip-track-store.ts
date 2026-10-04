import Dexie, { type Table } from "dexie";
import {
  StaffTipTrackSchema,
  type StaffTipTrack,
} from "$lib/shared/media-composition/domain/staff-tip-track";

/**
 * Saves each take's staff ends on this device, keyed by the take's key, so
 * finding the staffs is a one-time wait per video.
 *
 * A minute of footage is a few hundred kilobytes of positions, too much to
 * share localStorage with the saved projects, so it gets its own small
 * IndexedDB database. Nothing is written to Firestore.
 */

const DB_NAME = "tka-post-studio-staff-tips";

interface StoredStaffTipTrack {
  takeKey: string;
  savedAt: number;
  track: unknown;
}

class StaffTipDatabase extends Dexie {
  tracks!: Table<StoredStaffTipTrack, string>;

  constructor() {
    super(DB_NAME);
    this.version(1).stores({ tracks: "takeKey" });
  }
}

let database: StaffTipDatabase | null = null;

function db(): StaffTipDatabase | null {
  if (typeof indexedDB === "undefined") return null;
  database ??= new StaffTipDatabase();
  return database;
}

/** The saved ends for a take, or null when there are none or they no longer read. */
export async function loadStaffTipTrack(
  takeKey: string
): Promise<StaffTipTrack | null> {
  const store = db();
  if (!store) return null;
  try {
    const row = await store.tracks.get(takeKey);
    if (!row) return null;
    const parsed = StaffTipTrackSchema.safeParse(row.track);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function saveStaffTipTrack(
  takeKey: string,
  track: StaffTipTrack
): Promise<void> {
  const store = db();
  if (!store) return;
  await store.tracks.put({ takeKey, savedAt: Date.now(), track });
}
