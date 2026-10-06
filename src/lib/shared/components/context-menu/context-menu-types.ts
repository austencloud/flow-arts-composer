export interface ContextMenuItem {
  id: string;
  label: string;
  icon?: string;
  iconColor?: string;
  /** Clockwise turn in degrees, for an arrow icon pointing off-axis. */
  iconRotate?: number;
  /** Raw HTML icon (for trusted sources like MODULE_DEFINITIONS only) */
  rawIcon?: string;
  rawIconColor?: string;
  disabled?: boolean;
  danger?: boolean;
  checked?: boolean;
  /** Keep menu open after clicking (for toggle actions) */
  keepOpen?: boolean;
  action?: () => void | Promise<void>;
  children?: ContextMenuItem[];
}

export interface ContextMenuSeparator {
  type: "separator";
}

export interface ContextMenuHeader {
  type: "header";
  label: string;
}

export type ContextMenuEntry =
  | ContextMenuItem
  | ContextMenuSeparator
  | ContextMenuHeader;

export type ContextMenuState =
  | { open: false }
  | { open: true; x: number; y: number };

export function isMenuItem(entry: ContextMenuEntry): entry is ContextMenuItem {
  return !("type" in entry);
}

export function isSeparator(
  entry: ContextMenuEntry
): entry is ContextMenuSeparator {
  return "type" in entry && entry.type === "separator";
}

export function isHeader(entry: ContextMenuEntry): entry is ContextMenuHeader {
  return "type" in entry && entry.type === "header";
}
