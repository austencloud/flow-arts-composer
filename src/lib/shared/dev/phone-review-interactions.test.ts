import { describe, expect, it } from "vitest";
import {
  commandForClient,
  parsePhoneReviewCommand,
  parsePhoneReviewInteractionState,
  resolveControl,
  type PhoneReviewCommand,
  type PhoneReviewControl,
} from "./phone-review-interactions";

const controls: PhoneReviewControl[] = [
  { id: "speed", name: "Speed 0.5", kind: "input", inputType: "range", disabled: false },
  { id: "mirror-a", name: "Mirror", kind: "button", disabled: false },
  { id: "mirror-b", name: "Mirror", kind: "button", disabled: false },
  { id: "grid", name: "Grid", kind: "input", inputType: "checkbox", disabled: true },
];

const command: PhoneReviewCommand = {
  id: "command-1", kind: "set", clientId: "phone-a", expectedRoute: "/test/hand-tunnel",
  controlId: "speed", value: "0.7", createdAt: "2026-09-13T12:00:00.000Z", expiresAt: "2026-09-13T12:00:30.000Z",
};

describe("phone review interactions", () => {
  it("does not deliver expired, already delivered, wrong-client, or wrong-route commands", () => {
    const state = { version: 1, clients: [], commands: [command] };
    const now = new Date("2026-09-13T12:00:05.000Z");
    expect(commandForClient(state, "phone-a", "/test/hand-tunnel", now)).toEqual(command);
    expect(commandForClient(state, "desktop-b", "/test/hand-tunnel", now)).toBeNull();
    expect(commandForClient(state, "phone-a", "/create", now)).toBeNull();
    expect(commandForClient(state, "phone-a", "/test/hand-tunnel", new Date("2026-09-13T12:01:00.000Z"))).toBeNull();
    expect(commandForClient({ ...state, commands: [{ ...command, deliveredAt: now.toISOString() }] }, "phone-a", "/test/hand-tunnel", now)).toBeNull();
  });

  it("fails ambiguous name matching and disabled controls instead of guessing", () => {
    expect(resolveControl({ ...command, kind: "click", controlId: undefined, controlName: "Mirror" }, controls)).toBeNull();
    expect(resolveControl({ ...command, kind: "click", controlId: "grid", controlName: undefined }, controls)).toBeNull();
    expect(resolveControl(command, controls)).toEqual(controls[0]);
  });

  it("keeps bounded acknowledgments and rejects malformed command payloads", () => {
    const acknowledged = { ...command, result: { status: "completed", message: "Set Speed 0.5", completedAt: "2026-09-13T12:00:02.000Z" } };
    expect(parsePhoneReviewCommand(acknowledged)).toEqual(acknowledged);
    expect(parsePhoneReviewCommand({ ...command, kind: "eval" })).toBeNull();
    expect(parsePhoneReviewCommand({ ...command, value: "x".repeat(101) })).toBeNull();
    expect(parsePhoneReviewInteractionState({ version: 1, clients: [], commands: [acknowledged] })?.commands[0]?.result?.message).toBe("Set Speed 0.5");
  });
});
