/**
 * screenshot-orchestrator - Builds route/device trees and drives the capture endpoints.
 *
 * Device and route configs are hardcoded here to avoid importing test files
 * into the app bundle. Keep in sync with tests/screenshots/devices.ts.
 */

import type {
  DeviceInfo,
  ModuleGroup,
  RouteNode,
  CaptureRequest,
  CaptureStartResult,
  CaptureJobStatus,
} from "./types";

// Hardcoded device list - mirrors tests/screenshots/devices.ts
const DEVICES: DeviceInfo[] = [
  {
    slug: "iphone-se",
    name: "iPhone SE",
    width: 375,
    height: 667,
    category: "phone",
  },
  {
    slug: "iphone-16-pro",
    name: "iPhone 16 Pro",
    width: 393,
    height: 852,
    category: "phone",
  },
  {
    slug: "iphone-16-pro-max",
    name: "iPhone 16 Pro Max",
    width: 430,
    height: 932,
    category: "phone",
  },
  {
    slug: "galaxy-s24",
    name: "Galaxy S24",
    width: 360,
    height: 780,
    category: "phone",
  },
  {
    slug: "galaxy-s24-ultra",
    name: "Galaxy S24 Ultra",
    width: 412,
    height: 915,
    category: "phone",
  },
  {
    slug: "ipad-mini",
    name: "iPad Mini",
    width: 768,
    height: 1024,
    category: "tablet",
  },
  {
    slug: "ipad-air",
    name: "iPad Air",
    width: 820,
    height: 1180,
    category: "tablet",
  },
  {
    slug: "desktop-hd",
    name: "Desktop HD",
    width: 1366,
    height: 768,
    category: "desktop",
  },
  {
    slug: "desktop-fhd",
    name: "Desktop FHD",
    width: 1920,
    height: 1080,
    category: "desktop",
  },
];

// Hardcoded route list - mirrors tests/screenshots/devices.ts
const ROUTES: RouteNode[] = [
  // Public
  { label: "landing", moduleId: "public", requiresAuth: false },
  { label: "about", moduleId: "public", requiresAuth: false },
  { label: "privacy", moduleId: "public", requiresAuth: false },
  { label: "terms", moduleId: "public", requiresAuth: false },
  { label: "history", moduleId: "public", requiresAuth: false },
  {
    label: "create--construct",
    moduleId: "create",
    tabId: "construct",
    requiresAuth: true,
  },
  {
    label: "create--generate",
    moduleId: "create",
    tabId: "generate",
    requiresAuth: true,
  },
  {
    label: "create--spell",
    moduleId: "create",
    tabId: "spell",
    requiresAuth: true,
  },
  // Browse
  {
    label: "browse--gallery",
    moduleId: "browse",
    tabId: "gallery",
    requiresAuth: true,
  },
  {
    label: "creators",
    moduleId: "creators",
    requiresAuth: false,
  },
  // Compose
  {
    label: "compose--arrange",
    moduleId: "compose",
    tabId: "arrange",
    requiresAuth: true,
  },
  // Learn
  {
    label: "learn--concepts",
    moduleId: "learn",
    tabId: "concepts",
    requiresAuth: true,
  },
  // Train
  {
    label: "train--practice",
    moduleId: "train",
    tabId: "practice",
    requiresAuth: true,
  },
  // Settings
  {
    label: "settings--profile",
    moduleId: "settings",
    tabId: "profile",
    requiresAuth: true,
  },
  {
    label: "settings--display",
    moduleId: "settings",
    tabId: "display",
    requiresAuth: true,
  },
  // Feedback
  { label: "feedback", moduleId: "feedback", requiresAuth: true },
];

const MODULE_DISPLAY_NAMES: Record<string, string> = {
  public: "Public Pages",
  create: "Create",
  browse: "Browse",
  compose: "Compose",
  learn: "Learn",
  train: "Train",
  settings: "Settings",
  feedback: "Feedback",
};

export function getDevices(): DeviceInfo[] {
  return DEVICES;
}

export function getRoutes(): RouteNode[] {
  return ROUTES;
}

export function getDeviceBySlug(slug: string): DeviceInfo | null {
  return DEVICES.find((d) => d.slug === slug) ?? null;
}

export function getModuleGroups(): ModuleGroup[] {
  const groupMap = new Map<string, RouteNode[]>();

  for (const route of ROUTES) {
    const existing = groupMap.get(route.moduleId);
    if (existing) {
      existing.push(route);
    } else {
      groupMap.set(route.moduleId, [route]);
    }
  }

  const groups: ModuleGroup[] = [];
  for (const [moduleId, routes] of groupMap) {
    groups.push({
      moduleId,
      displayName: MODULE_DISPLAY_NAMES[moduleId] ?? moduleId,
      routes,
    });
  }

  return groups;
}

export async function startCapture(
  request: CaptureRequest
): Promise<CaptureStartResult> {
  const response = await fetch("/screenshots/capture", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      routes: request.routes,
      devices: request.devices,
    }),
  });

  if (response.status === 409) {
    const data = await response.json();
    throw new Error(data.error || "Capture already in progress");
  }

  if (!response.ok) {
    const data = await response
      .json()
      .catch(() => ({ error: "Unknown error" }));
    throw new Error(data.error || `HTTP ${response.status}`);
  }

  return (await response.json()) as CaptureStartResult;
}

export async function getJobStatus(jobId: string): Promise<CaptureJobStatus> {
  const response = await fetch(`/screenshots/capture/${jobId}`);

  if (!response.ok) {
    throw new Error(`Failed to get job status: HTTP ${response.status}`);
  }

  return (await response.json()) as CaptureJobStatus;
}
