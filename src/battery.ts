/** Inner width of the battery glyph, in SVG user units. Matches the fill rect in the card. */
export const BATTERY_FILL_MAX = 19.3;

export interface BatteryMark {
  percent: number;
  charging: boolean;
  low: boolean;
  label: string;
}

export function batteryFillWidth(percent: number): number {
  if (!Number.isFinite(percent) || percent <= 0) return 0;
  const clamped = Math.min(100, percent);
  return Math.round((clamped / 100) * BATTERY_FILL_MAX * 100) / 100;
}

function isChargingState(state: string): boolean {
  const value = state.trim().toLowerCase();
  return value === "on" || value === "true" || value === "yes" || value === "charging";
}

function isBatteryLine(line: { name: string; deviceClass?: string }): boolean {
  return line.deviceClass === "battery" || line.name.trim().toLowerCase() === "battery";
}

function isChargingLine(line: { name: string; deviceClass?: string }): boolean {
  return line.deviceClass === "battery_charging" || line.name.trim().toLowerCase() === "charging";
}

/** Status glyph for the header. Missing or non-numeric battery omits the mark. */
export function batteryMark(
  lines: readonly { name: string; state: string; deviceClass?: string }[],
): BatteryMark | undefined {
  const battery = lines.find(isBatteryLine);
  if (!battery) return undefined;
  const parsed = Number.parseFloat(battery.state);
  if (!Number.isFinite(parsed)) return undefined;
  const percent = Math.min(100, Math.max(0, parsed));
  const chargingLine = lines.find(isChargingLine);
  const charging = chargingLine ? isChargingState(chargingLine.state) : false;
  const shown = Math.round(percent);
  return {
    percent,
    charging,
    low: percent <= 20 && !charging,
    label: charging ? `Battery ${shown}%, charging` : `Battery ${shown}%`,
  };
}
