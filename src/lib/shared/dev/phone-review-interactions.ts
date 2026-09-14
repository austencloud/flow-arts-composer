export const PHONE_REVIEW_INTERACTIONS_VERSION = 1;
export const PHONE_REVIEW_COMMAND_TTL_MS = 30_000;
export const MAX_PHONE_REVIEW_CONTROLS = 80;

export type PhoneReviewCommandKind = "inspect" | "click" | "set";
export type PhoneReviewControlKind = "button" | "input" | "select";

export interface PhoneReviewControl {
  id: string;
  name: string;
  kind: PhoneReviewControlKind;
  inputType?: "range" | "number" | "checkbox" | "radio";
  disabled: boolean;
  options?: string[];
}

export interface PhoneReviewClient {
  id: string;
  label: string;
  route: string;
  viewport: "phone" | "desktop";
  controls: PhoneReviewControl[];
  lastSeenAt: string;
}

export interface PhoneReviewCommand {
  id: string;
  kind: PhoneReviewCommandKind;
  clientId: string;
  expectedRoute: string;
  controlId?: string;
  controlName?: string;
  value?: string;
  createdAt: string;
  expiresAt: string;
  deliveredAt?: string;
  result?: PhoneReviewCommandResult;
}

export interface PhoneReviewCommandResult {
  status: "completed" | "failed";
  message: string;
  completedAt: string;
}

export interface PhoneReviewInteractionState {
  version: number;
  clients: PhoneReviewClient[];
  commands: PhoneReviewCommand[];
}

export function emptyPhoneReviewInteractionState(): PhoneReviewInteractionState {
  return { version: PHONE_REVIEW_INTERACTIONS_VERSION, clients: [], commands: [] };
}

function shortText(value: unknown, max: number): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= max
    ? value
    : null;
}

function safeRoute(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") && !value.includes("#") && value.length <= 300;
}

export function parsePhoneReviewControl(value: unknown): PhoneReviewControl | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const id = shortText(candidate.id, 160);
  const name = shortText(candidate.name, 180);
  const kind = candidate.kind;
  if (!id || !name || !["button", "input", "select"].includes(String(kind)) || typeof candidate.disabled !== "boolean") return null;
  const inputType = candidate.inputType;
  if (inputType !== undefined && !["range", "number", "checkbox", "radio"].includes(String(inputType))) return null;
  const options = candidate.options;
  if (options !== undefined && (!Array.isArray(options) || options.length > 30 || options.some((option) => !shortText(option, 100)))) return null;
  return { id, name, kind: kind as PhoneReviewControlKind, ...(inputType ? { inputType: inputType as PhoneReviewControl["inputType"] } : {}), disabled: candidate.disabled, ...(options ? { options: options as string[] } : {}) };
}

export function parsePhoneReviewClient(value: unknown): PhoneReviewClient | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const id = shortText(candidate.id, 80);
  const label = shortText(candidate.label, 80);
  const route = candidate.route;
  const controls = candidate.controls;
  if (!id || !label || !safeRoute(route) || !["phone", "desktop"].includes(String(candidate.viewport)) || !Array.isArray(controls) || controls.length > MAX_PHONE_REVIEW_CONTROLS || typeof candidate.lastSeenAt !== "string" || Number.isNaN(Date.parse(candidate.lastSeenAt))) return null;
  const parsedControls = controls.map(parsePhoneReviewControl);
  if (parsedControls.some((control) => !control) || new Set(parsedControls.map((control) => control!.id)).size !== parsedControls.length) return null;
  return { id, label, route, viewport: candidate.viewport as "phone" | "desktop", controls: parsedControls as PhoneReviewControl[], lastSeenAt: candidate.lastSeenAt };
}

export function parsePhoneReviewCommand(value: unknown): PhoneReviewCommand | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const id = shortText(candidate.id, 80);
  const kind = candidate.kind;
  const clientId = shortText(candidate.clientId, 80);
  const expectedRoute = candidate.expectedRoute;
  if (!id || !["inspect", "click", "set"].includes(String(kind)) || !clientId || !safeRoute(expectedRoute) || typeof candidate.createdAt !== "string" || typeof candidate.expiresAt !== "string" || Number.isNaN(Date.parse(candidate.createdAt)) || Number.isNaN(Date.parse(candidate.expiresAt))) return null;
  const controlId = candidate.controlId === undefined ? undefined : shortText(candidate.controlId, 160);
  const controlName = candidate.controlName === undefined ? undefined : shortText(candidate.controlName, 180);
  const command: PhoneReviewCommand = { id, kind: kind as PhoneReviewCommandKind, clientId, expectedRoute, createdAt: candidate.createdAt, expiresAt: candidate.expiresAt };
  if (kind !== "inspect" && !controlId && !controlName) return null;
  if (controlId) command.controlId = controlId;
  if (controlName) command.controlName = controlName;
  if (kind === "set") {
    const setValue = shortText(candidate.value, 100);
    if (!setValue) return null;
    command.value = setValue;
  }
  if (typeof candidate.deliveredAt === "string" && !Number.isNaN(Date.parse(candidate.deliveredAt))) command.deliveredAt = candidate.deliveredAt;
  if (candidate.result && typeof candidate.result === "object") {
    const result = candidate.result as Record<string, unknown>;
    if ((result.status === "completed" || result.status === "failed") && typeof result.message === "string" && result.message.length > 0 && result.message.length <= 160 && typeof result.completedAt === "string" && !Number.isNaN(Date.parse(result.completedAt))) {
      command.result = { status: result.status, message: result.message, completedAt: result.completedAt };
    } else return null;
  }
  return command;
}

export function parsePhoneReviewInteractionState(value: unknown): PhoneReviewInteractionState | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.version !== PHONE_REVIEW_INTERACTIONS_VERSION || !Array.isArray(candidate.clients) || !Array.isArray(candidate.commands) || candidate.clients.length > 20 || candidate.commands.length > 100) return null;
  const clients = candidate.clients.map(parsePhoneReviewClient);
  const commands = candidate.commands.map(parsePhoneReviewCommand);
  if (clients.some((client) => !client) || commands.some((command) => !command) || new Set(clients.map((client) => client!.id)).size !== clients.length || new Set(commands.map((command) => command!.id)).size !== commands.length) return null;
  return { version: PHONE_REVIEW_INTERACTIONS_VERSION, clients: clients as PhoneReviewClient[], commands: commands as PhoneReviewCommand[] };
}

export function commandForClient(state: PhoneReviewInteractionState, clientId: string, route: string, now = new Date()): PhoneReviewCommand | null {
  return state.commands.find((command) => command.clientId === clientId && command.expectedRoute === route && !command.deliveredAt && !command.result && Date.parse(command.expiresAt) > now.getTime()) ?? null;
}

export function resolveControl(command: PhoneReviewCommand, controls: PhoneReviewControl[]): PhoneReviewControl | null {
  const matches = controls.filter((control) => (command.controlId ? control.id === command.controlId : control.name === command.controlName));
  return matches.length === 1 && !matches[0]!.disabled ? matches[0]! : null;
}
