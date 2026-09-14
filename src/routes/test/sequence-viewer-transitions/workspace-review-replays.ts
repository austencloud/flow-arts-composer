/** Replays for the workspace gates; these never export, upload or approve a gate. */
export const WORKSPACE_REPLAY_COMMANDS = [
  "studio-2d",
  "studio-3d",
  "studio-interrupt",
  "studio-card-top",
  "studio-card-bottom",
  "inspector-toggle",
  "inspector-interrupt",
  "practice-2d",
  "practice-card",
  "practice-interrupt",
  "switchers-tour",
  "switchers-interrupt",
] as const;

export type WorkspaceReplayCommand = (typeof WORKSPACE_REPLAY_COMMANDS)[number];
export function isWorkspaceReplayCommand(
  value: unknown
): value is WorkspaceReplayCommand {
  return (
    typeof value === "string" &&
    WORKSPACE_REPLAY_COMMANDS.some((command) => command === value)
  );
}

export const WORKSPACE_GATE_REVIEWS = {
  "post-studio": {
    acceptance: [
      "the editor dissolves into the existing stage; returning does not remount the viewer",
      "the draft survives a round trip and hidden previews stop playing",
      "first entry, ready 3D, rapid reversals and reduced motion all land on the selected view",
    ],
    options: [
      { command: "studio-2d", label: "Replay with 2D" },
      { command: "studio-3d", label: "Replay with 3D", requires3D: true },
      { command: "studio-card-top", label: "Card ⇄ Studio · top selected" },
      {
        command: "studio-card-bottom",
        label: "Card ⇄ Studio · bottom selected",
      },
      { command: "studio-interrupt", label: "Stress reversal", primary: true },
    ],
  },
  "export-inspector": {
    acceptance: [
      "the inspector opens and closes without reflowing its controls through a narrow strip",
      "reversing midway returns the same canvas and inspector to their original allocation",
      "the centered common section buttons stay in place when 2D and Tunnel exchange controls",
      "this gate exercises the desktop inspector; compact layouts use their control dock",
    ],
    options: [
      { command: "inspector-toggle", label: "Replay open / close" },
      {
        command: "inspector-interrupt",
        label: "Stress reversal",
        primary: true,
      },
    ],
  },
  practice: {
    acceptance: [
      "practice controls rise a short distance while the stage makes room on the same clock",
      "entering and exiting preserve the live canvas and the sequence playhead",
      "a rapid reversal leaves no invisible controls intercepting clicks or keyboard focus",
    ],
    options: [
      { command: "practice-2d", label: "Replay from 2D" },
      { command: "practice-card", label: "Replay from Card" },
      {
        command: "practice-interrupt",
        label: "Stress reversal",
        primary: true,
      },
    ],
  },
  switchers: {
    acceptance: [
      "exactly one visible mode button reflects the committed selection",
      "every available ordered pair is exercised, including returning from Post Studio",
      "rapid clicks finish on the last requested mode without stale selection or blank content",
      "the mobile bottom bar and desktop rail are both keyboard accessible",
    ],
    options: [
      { command: "switchers-tour", label: "Replay every available pair" },
      {
        command: "switchers-interrupt",
        label: "Stress reversal",
        primary: true,
      },
    ],
  },
} satisfies Record<
  string,
  {
    acceptance: string[];
    options: {
      command: WorkspaceReplayCommand;
      label: string;
      requires3D?: boolean;
      primary?: boolean;
    }[];
  }
>;

/** Each direction matters: an exit that looks good says nothing about its return. */
export function orderedModePairs<T extends string>(
  modes: readonly T[]
): [T, T][] {
  const unique = [...new Set(modes)];
  return unique.flatMap((from) =>
    unique.filter((to) => to !== from).map((to) => [from, to] as [T, T])
  );
}
