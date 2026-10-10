import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

export type WorkspaceSharePreparationPhase =
  | "idle"
  | "preparing"
  | "ready"
  | "failed";

export type WorkspaceCardMenuAction =
  | "preparing"
  | "share"
  | "unavailable"
  | "retry";

export function getWorkspaceCardMenuAction(
  phase: WorkspaceSharePreparationPhase,
  canShareCard: boolean
): WorkspaceCardMenuAction {
  if (phase === "failed") return "retry";
  if (phase !== "ready") return "preparing";
  return canShareCard ? "share" : "unavailable";
}

export function shouldPrewarmWorkspaceShareCard(options: {
  isMobileTarget: boolean;
  nativeFileShareSupported: boolean;
}): boolean {
  return options.isMobileTarget && options.nativeFileShareSupported;
}

export interface WorkspaceCardPreparationOptions {
  darkMode: boolean;
}

export interface PreparedWorkspaceCard {
  blob: Blob;
  filename: string;
}

export interface PreparedWorkspaceLink {
  url: string;
}

export interface WorkspaceShareReadinessDeps {
  renderCard: (
    sequence: SequenceData,
    options: WorkspaceCardPreparationOptions
  ) => Promise<PreparedWorkspaceCard>;
  createLink: (sequence: SequenceData) => Promise<string>;
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

/**
 * Readiness state for the Create workspace share control.
 *
 * Native share and clipboard calls are intentionally not methods here. They
 * must run synchronously inside a fresh click handler. This factory only owns
 * the async preparation that happens before that click.
 */
export function createWorkspaceShareReadiness(
  deps: WorkspaceShareReadinessDeps
): WorkspaceShareReadiness {
  return createWorkspaceShareReadinessState(deps);
}

function createWorkspaceShareReadinessState(deps: WorkspaceShareReadinessDeps) {
  let cardKey = $state<string | null>(null);
  let cardPhase = $state<WorkspaceSharePreparationPhase>("idle");
  let preparedCard = $state<PreparedWorkspaceCard | null>(null);
  let cardError = $state<Error | null>(null);
  let cardInFlight: {
    key: string;
    token: object;
    promise: Promise<PreparedWorkspaceCard>;
  } | null = null;

  let linkKey = $state<string | null>(null);
  let linkPhase = $state<WorkspaceSharePreparationPhase>("idle");
  let preparedLink = $state<PreparedWorkspaceLink | null>(null);
  let linkError = $state<Error | null>(null);
  let linkInFlight: {
    key: string;
    token: object;
    promise: Promise<PreparedWorkspaceLink>;
  } | null = null;

  function setCardKey(nextKey: string | null): void {
    if (cardKey === nextKey) return;
    cardKey = nextKey;
    cardPhase = "idle";
    preparedCard = null;
    cardError = null;
  }

  function setLinkKey(nextKey: string | null): void {
    if (linkKey === nextKey) return;
    linkKey = nextKey;
    linkPhase = "idle";
    preparedLink = null;
    linkError = null;
  }

  function getPreparedCard(key: string): PreparedWorkspaceCard | null {
    return cardKey === key && cardPhase === "ready" ? preparedCard : null;
  }

  function getCardPhase(key: string): WorkspaceSharePreparationPhase {
    return cardKey === key ? cardPhase : "idle";
  }

  function getPreparedLink(key: string): PreparedWorkspaceLink | null {
    return linkKey === key && linkPhase === "ready" ? preparedLink : null;
  }

  function getLinkPhase(key: string): WorkspaceSharePreparationPhase {
    return linkKey === key ? linkPhase : "idle";
  }

  function prepareCard(
    key: string,
    sequence: SequenceData,
    options: WorkspaceCardPreparationOptions
  ): Promise<PreparedWorkspaceCard> {
    setCardKey(key);

    const ready = getPreparedCard(key);
    if (ready) return Promise.resolve(ready);

    if (cardInFlight?.key === key) {
      return cardInFlight.promise;
    }

    cardPhase = "preparing";
    cardError = null;

    const token = {};
    const request = deps
      .renderCard(sequence, options)
      .then((card) => {
        if (cardKey === key && cardInFlight?.token === token) {
          preparedCard = card;
          cardPhase = "ready";
        }
        return card;
      })
      .catch((error: unknown) => {
        if (cardKey === key && cardInFlight?.token === token) {
          preparedCard = null;
          cardError = asError(error);
          cardPhase = "failed";
        }
        throw error;
      })
      .finally(() => {
        if (cardInFlight?.token === token) {
          cardInFlight = null;
        }
      });

    cardInFlight = { key, token, promise: request };
    return request;
  }

  function prepareLink(
    key: string,
    sequence: SequenceData
  ): Promise<PreparedWorkspaceLink> {
    setLinkKey(key);

    const ready = getPreparedLink(key);
    if (ready) return Promise.resolve(ready);

    if (linkInFlight?.key === key) {
      return linkInFlight.promise;
    }

    linkPhase = "preparing";
    linkError = null;

    const token = {};
    const request = deps
      .createLink(sequence)
      .then((url) => {
        const link = { url };
        if (linkKey === key && linkInFlight?.token === token) {
          preparedLink = link;
          linkPhase = "ready";
        }
        return link;
      })
      .catch((error: unknown) => {
        if (linkKey === key && linkInFlight?.token === token) {
          preparedLink = null;
          linkError = asError(error);
          linkPhase = "failed";
        }
        throw error;
      })
      .finally(() => {
        if (linkInFlight?.token === token) {
          linkInFlight = null;
        }
      });

    linkInFlight = { key, token, promise: request };
    return request;
  }

  return {
    get cardPhase() {
      return cardPhase;
    },
    get cardError() {
      return cardError;
    },
    get linkPhase() {
      return linkPhase;
    },
    get linkError() {
      return linkError;
    },
    setCardKey,
    setLinkKey,
    getCardPhase,
    getLinkPhase,
    getPreparedCard,
    getPreparedLink,
    prepareCard,
    prepareLink,
  };
}

export type WorkspaceShareReadiness = ReturnType<
  typeof createWorkspaceShareReadinessState
>;
