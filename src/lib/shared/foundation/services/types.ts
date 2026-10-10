/**
 * File Download Service Contract
 *
 * Handles file download operations for the browser environment.
 * Provides cross-browser utilities for downloading files from Blob objects.
 */

export interface DownloadOptions {
  filename?: string;
  mimeType?: string;
  showSaveDialog?: boolean;
}

export interface BatchDownloadOptions extends DownloadOptions {
  delay?: number; // Delay between downloads to prevent browser blocking
  zipFiles?: boolean; // Future enhancement: zip multiple files
}

export interface DownloadResult {
  success: boolean;
  filename: string;
  method: "share" | "download";
  canceled?: boolean;
  error?: Error;
}

import type {
  GridLocation,
  GridMode,
} from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";

export interface HandPathFilters {
  readonly startLocation?: GridLocation;
  readonly endLocation?: GridLocation;
  readonly impliedGridMode?: GridMode;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly isClosed?: boolean;
  readonly containsBigram?: string;
  readonly limit?: number;
}

/**
 * SEO Service Contract
 *
 * Handles SEO-related functionality including link generation
 * and meta tag management.
 */

export interface SEOLinkOptions {
  tab?: string;
  section?: string;
  seoMode?: boolean;
}

import type { Orientation } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";

export interface SoloPropFilters {
  readonly startLocation?: GridLocation;
  readonly startOrientation?: Orientation;
  readonly impliedGridMode?: GridMode;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly containsBigram?: string;
  readonly pathHash?: string;
  readonly limit?: number;
}

import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";

export interface ViewerPreferences {
  readonly leftPropType: PropType;
  readonly rightPropType: PropType;
  readonly catDogMode: boolean;
}
