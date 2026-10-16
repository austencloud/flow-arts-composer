export const ADMIN_USER_TARGET_PARAM = "inspectUser";
export const ADMIN_SESSION_TARGET_PARAM = "inspectSession";

export interface AdminSessionReplayTarget {
  userId: string;
  sessionId: string | null;
}

function nonEmpty(value: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function buildAdminSessionReplayUrl(
  userId: string,
  sessionId?: string | null
): string {
  const params = new URLSearchParams({
    [ADMIN_USER_TARGET_PARAM]: userId,
  });
  if (sessionId) params.set(ADMIN_SESSION_TARGET_PARAM, sessionId);
  return `/admin/users?${params.toString()}`;
}

export function parseAdminSessionReplayTarget(
  params: Pick<URLSearchParams, "get">
): AdminSessionReplayTarget | null {
  const userId = nonEmpty(params.get(ADMIN_USER_TARGET_PARAM));
  if (!userId) return null;
  return {
    userId,
    sessionId: nonEmpty(params.get(ADMIN_SESSION_TARGET_PARAM)),
  };
}
