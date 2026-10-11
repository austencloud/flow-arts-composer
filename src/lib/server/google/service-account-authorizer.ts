import { dev } from "$app/env";
import * as env from "$app/env/private";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const TOKEN_REFRESH_SKEW_MS = 5 * 60 * 1000;

export interface ServiceAccountCredentials {
  project_id: string;
  client_email: string;
  private_key: string;
}

interface AccessToken {
  value: string;
  expiresAt: number;
}

function encodeBase64Url(value: string | Uint8Array): string {
  const bytes =
    typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function parseServiceAccount(
  raw: string | undefined
): ServiceAccountCredentials {
  if (!raw) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not configured");
  }

  let parsed: Partial<ServiceAccountCredentials>;
  try {
    parsed = JSON.parse(raw) as Partial<ServiceAccountCredentials>;
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON");
  }

  if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
    throw new Error("Firebase service account credentials are incomplete");
  }

  return parsed as ServiceAccountCredentials;
}

export function loadServiceAccountSource(
  platformCredential?: string
): string | undefined {
  // Callers pass the Worker's own binding (workerEnv() in
  // src/lib/server/cloudflare/worker-env.ts). Prefer that source so
  // credentialed routes do not depend on adapter env hydration.
  const requestScoped = platformCredential?.trim();
  if (requestScoped) return requestScoped;

  const configured = env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (configured) return configured;
  if (!dev) return undefined;

  const keyPath = [
    resolve("serviceAccountKey.json"),
    resolve("../../serviceAccountKey.json"),
  ].find((candidate) => existsSync(candidate));
  if (!keyPath) return undefined;

  try {
    return readFileSync(keyPath, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not read local Firebase credentials: ${message}`);
  }
}

function normalizeScopes(scopes: string | readonly string[]): string {
  return [...new Set(typeof scopes === "string" ? [scopes] : scopes)]
    .sort()
    .join(" ");
}

export class ServiceAccountAuthorizer {
  private readonly accessTokens = new Map<string, AccessToken>();
  private readonly tokenRequests = new Map<string, Promise<string>>();

  constructor(
    private readonly credentials: ServiceAccountCredentials,
    private readonly fetchImpl?: typeof fetch
  ) {}

  get projectId(): string {
    return this.credentials.project_id;
  }

  async authorizedFetch(
    input: string,
    init: RequestInit,
    scopes: string | readonly string[]
  ): Promise<Response> {
    const token = await this.getAccessToken(scopes);
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    return this.request(input, { ...init, headers });
  }

  async getAccessToken(scopes: string | readonly string[]): Promise<string> {
    const scope = normalizeScopes(scopes);
    if (!scope) throw new Error("At least one Google OAuth scope is required");

    const now = Date.now();
    const cached = this.accessTokens.get(scope);
    if (cached && cached.expiresAt - TOKEN_REFRESH_SKEW_MS > now) {
      return cached.value;
    }

    const pending = this.tokenRequests.get(scope);
    if (pending) return pending;

    const request = this.requestAccessToken(scope).finally(() => {
      this.tokenRequests.delete(scope);
    });
    this.tokenRequests.set(scope, request);
    return request;
  }

  /**
   * Drops a cached token that Google refused, so the next call mints a fresh
   * one. A newer token cached for the same scopes is kept.
   */
  forgetAccessToken(scopes: string | readonly string[], token: string): void {
    const scope = normalizeScopes(scopes);
    if (this.accessTokens.get(scope)?.value === token) {
      this.accessTokens.delete(scope);
    }
  }

  private request(input: string, init: RequestInit): Promise<Response> {
    if (this.fetchImpl) {
      // Cloudflare validates the receiver of fetch. Copying an injected fetch
      // before invocation keeps the call unbound, matching the platform API.
      const fetchImpl = this.fetchImpl;
      return fetchImpl(input, init);
    }
    return fetch(input, init);
  }

  private async requestAccessToken(scope: string): Promise<string> {
    const jwt = await this.signJwt(scope, Math.floor(Date.now() / 1000));
    const response = await this.request(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }),
    });
    const body = (await response.json()) as {
      access_token?: string;
      expires_in?: number;
    };
    if (!response.ok || !body.access_token) {
      throw new Error(
        `Firebase service-account token exchange failed (${response.status})`
      );
    }

    this.accessTokens.set(scope, {
      value: body.access_token,
      expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000,
    });
    return body.access_token;
  }

  private async signJwt(scope: string, nowSeconds: number): Promise<string> {
    const header = encodeBase64Url(
      JSON.stringify({ alg: "RS256", typ: "JWT" })
    );
    const payload = encodeBase64Url(
      JSON.stringify({
        iss: this.credentials.client_email,
        sub: this.credentials.client_email,
        scope,
        aud: TOKEN_URL,
        iat: nowSeconds,
        exp: nowSeconds + 3600,
      })
    );
    const unsigned = `${header}.${payload}`;
    const pemContents = this.credentials.private_key
      .replace(/-----BEGIN PRIVATE KEY-----/, "")
      .replace(/-----END PRIVATE KEY-----/, "")
      .replace(/\s/g, "");
    const binaryKey = Uint8Array.from(atob(pemContents), (char) =>
      char.charCodeAt(0)
    );
    const key = await crypto.subtle.importKey(
      "pkcs8",
      binaryKey,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const signature = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      key,
      new TextEncoder().encode(unsigned)
    );

    return `${unsigned}.${encodeBase64Url(new Uint8Array(signature))}`;
  }
}

let authorizer: ServiceAccountAuthorizer | null = null;
let credentialSource: string | null = null;

export function getServiceAccountAuthorizer(
  platformCredential?: string
): ServiceAccountAuthorizer {
  const raw = loadServiceAccountSource(platformCredential);
  if (!authorizer || credentialSource !== raw) {
    authorizer = new ServiceAccountAuthorizer(parseServiceAccount(raw));
    credentialSource = raw ?? null;
  }
  return authorizer;
}
