import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";

export interface ScanActivityEventRecord {
  id: string;
  code: string;
  timestamp: string;
  city: string | null;
  country: string | null;
  lat: number | null;
  lng: number | null;
  deviceId: string | null;
  userId: string | null;
  leftPropType: PropType | null;
  rightPropType: PropType | null;
  catDogMode: boolean | null;
}

export interface ScanActivityCardDocument {
  code: string;
  data: Record<string, unknown>;
}

export interface ScanActivityAuthor {
  displayName: string;
  avatarUrl?: string;
}

export interface IScanActivityWatcher {
  watchRecentEvents(
    onEvents: (events: ScanActivityEventRecord[]) => void,
    onError: (error: Error) => void
  ): Promise<() => void>;
  loadCards(codes: string[]): Promise<ScanActivityCardDocument[]>;
  loadAuthor(ownerId: string): Promise<ScanActivityAuthor>;
}
