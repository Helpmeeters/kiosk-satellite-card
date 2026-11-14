export type ColumnRole =
  | "heading"
  | "device-name"
  | "header-status"
  | "media"
  | "volume"
  | "alarm-status"
  | "alarm-actions"
  | "alarm-form"
  | "alarm-list"
  | "alarm-result"
  | "select"
  | "switch"
  | "timer"
  | "led"
  | "brightness"
  | "effect"
  | "ambient"
  | "setting"
  | "update"
  | "restart"
  | "remote"
  | "diagnostics";

const FULL_WIDTH = new Set<ColumnRole>([
  "heading",
  "device-name",
  "media",
  "alarm-form",
  "alarm-list",
  "alarm-result",
  "update",
  "restart",
  "remote",
  "diagnostics",
]);

/** Full-width rows span the control grid. Everything else is one cell. */
export function spansFullWidth(role: ColumnRole): boolean {
  return FULL_WIDTH.has(role);
}
