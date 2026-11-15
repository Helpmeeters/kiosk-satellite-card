import type { SatelliteModel, SwitchControl, UpdateControl } from "./model";

/**
 * Home Assistant stores this on the user, not in the browser.
 * `frontend/get_user_data` with `key` resolves to `{ value }` for that key
 * (`null` when the key is unset). `frontend/set_user_data` writes one key
 * with `{ key, value }`. That is `fetchFrontendUserData` / `saveFrontendUserData`
 * in the Home Assistant frontend, and `websocket_get_user_data` /
 * `websocket_set_user_data` in `homeassistant/components/frontend/storage.py`.
 * `value` may be a dict. Open popups are not part of it.
 */
export const REDISPLAY_TABS = ["now", "alarms", "intercom", "agent"] as const;

export type StoredTab = (typeof REDISPLAY_TABS)[number];

const STORED_TABS = new Set<string>(REDISPLAY_TABS);
const DOTTED_VERSION = /^\d+(?:\.\d+)*$/;

export function redisplayUserDataKey(deviceId: string): string {
  return `kiosk-redisplay:${deviceId}`;
}

export function userDataGet(deviceId: string): { type: "frontend/get_user_data"; key: string } {
  return { type: "frontend/get_user_data", key: redisplayUserDataKey(deviceId) };
}

export function userDataSet(
  deviceId: string,
  tab: StoredTab,
): { type: "frontend/set_user_data"; key: string; value: { tab: StoredTab } } {
  return {
    type: "frontend/set_user_data",
    key: redisplayUserDataKey(deviceId),
    value: { tab },
  };
}

/** The saved tab, when the get_user_data result holds one of the four real tabs. */
export function tabFromUserData(result: unknown): StoredTab | undefined {
  if (typeof result !== "object" || result === null || Array.isArray(result)) return undefined;
  if (!Object.prototype.hasOwnProperty.call(result, "value")) return undefined;
  const value = (result as { value: unknown }).value;
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const tab = (value as { tab?: unknown }).tab;
  if (typeof tab !== "string" || !STORED_TABS.has(tab)) return undefined;
  return tab as StoredTab;
}

/**
 * True when latest is a greater dotted numeric version, false when it is not,
 * undefined when either side is missing or not a dotted number.
 */
export function compareVersions(latest: string | undefined, installed: string | undefined): boolean | undefined {
  const next = dottedParts(latest);
  const current = dottedParts(installed);
  if (!next || !current) return undefined;
  const length = Math.max(next.length, current.length);
  for (let index = 0; index < length; index += 1) {
    const delta = (next[index] ?? 0) - (current[index] ?? 0);
    if (delta > 0) return true;
    if (delta < 0) return false;
  }
  return false;
}

/** Latest greater than installed, or update state "on" when the versions cannot be compared. */
export function updateIsNewer(update: UpdateControl): boolean {
  const compared = compareVersions(update.latest, update.installed);
  if (compared === undefined) return update.state === "on";
  return compared;
}

export function updatesPending(updates: readonly UpdateControl[]): boolean {
  return updates.some(updateIsNewer);
}

/** The voice Mute switch. "Mute timers" is not mute. A leading "vs " is ignored. */
export function voiceMute(model: SatelliteModel): SwitchControl | undefined {
  return model.voiceSwitches.find((item) => normalizeVoice(item.name) === "mute");
}

function dottedParts(version: string | undefined): number[] | undefined {
  if (typeof version !== "string") return undefined;
  const trimmed = version.trim();
  if (!DOTTED_VERSION.test(trimmed)) return undefined;
  return trimmed.split(".").map((part) => Number(part));
}

function normalizeVoice(name: string): string {
  return name.trim().toLowerCase().replace(/^vs\s+/, "");
}
