/**
 * Whether Google has the site's Firebase project switched off right now, as
 * seen by this page load.
 *
 * Nothing is stored across loads. A real failed call is the only trigger, so a
 * healthy site does no extra work, and once Google restores access the next
 * load succeeds and the notice never appears. Only the visitor's "close"
 * survives a reload, for the rest of the browser session.
 *
 * Callers hand over the errors they already catch; see `noteServiceFailure`.
 */
import { browser } from "$app/env";
import { captureWhenReady } from "#lib/shared/analytics/services/posthog.js";
import {
  classifyServiceFailure,
  isSuspendedProbeResponse,
  outageProbeUrl,
} from "../domain/service-outage";

export type OutageTrigger = "suspended_error" | "firestore_probe";

const DISMISSED_KEY = "tka-outage-notice-dismissed";
const SHOWN_EVENT_KEY = "tka-outage-notice-shown-event";

function readSessionFlag(key: string): boolean {
  try {
    return sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeSessionFlag(key: string): void {
  try {
    sessionStorage.setItem(key, "1");
  } catch {
    // Private windows can refuse storage; the notice still closes for this load.
  }
}

class ServiceOutageState {
  confirmed = $state(false);
  trigger = $state<OutageTrigger | null>(null);
  dismissed = $state(browser ? readSessionFlag(DISMISSED_KEY) : false);

  /** One confirming read per page load at most. */
  private probe: Promise<void> | null = null;

  get visible(): boolean {
    return this.confirmed && !this.dismissed;
  }

  confirm(trigger: OutageTrigger): void {
    if (this.confirmed) return;
    this.confirmed = true;
    this.trigger = trigger;
  }

  dismiss(): void {
    this.dismissed = true;
    writeSessionFlag(DISMISSED_KEY);
  }

  /** Called by the notice when it first draws, so the count is of people who saw it. */
  recordShown(): void {
    if (readSessionFlag(SHOWN_EVENT_KEY)) return;
    writeSessionFlag(SHOWN_EVENT_KEY);
    captureWhenReady("service_outage_notice_shown", {
      trigger: this.trigger ?? "unknown",
    });
  }

  runProbe(): Promise<void> {
    if (this.probe) return this.probe;
    this.probe = (async () => {
      try {
        const { app } = await import("#lib/shared/auth/firebase.js");
        const projectId = app.options.projectId;
        if (!projectId) return;
        const response = await fetch(outageProbeUrl(projectId), {
          credentials: "omit",
          cache: "no-store",
        });
        const body = await response.text();
        if (isSuspendedProbeResponse(response.status, body)) {
          this.confirm("firestore_probe");
        }
      } catch {
        // The probe itself could not get out: that is the network, not Google.
      }
    })();
    return this.probe;
  }
}

export const serviceOutageState = new ServiceOutageState();

/**
 * Hand over an error from a failed Firestore or Auth call. A suspension named
 * in the error shows the notice at once; Firestore's "client is offline" while
 * the device is online asks Google once to confirm. Anything else is ignored.
 * Never throws and never blocks the caller.
 */
export function noteServiceFailure(error: unknown): void {
  if (!browser || serviceOutageState.confirmed) return;
  const kind = classifyServiceFailure(error, navigator.onLine);
  if (kind === "suspended") {
    serviceOutageState.confirm("suspended_error");
  } else if (kind === "unreachable") {
    void serviceOutageState.runProbe();
  }
}
