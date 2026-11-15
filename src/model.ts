export interface EntityState {
  state: string;
  attributes: Record<string, unknown>;
}

export interface RegistryEntry {
  entity_id: string;
  device_id?: string | null;
  name?: string | null;
  original_name?: string | null;
  platform?: string | null;
  entity_category?: "config" | "diagnostic" | string | null;
  hidden_by?: string | null;
  disabled_by?: string | null;
}

export interface DeviceEntry {
  id: string;
  name?: string | null;
  name_by_user?: string | null;
  manufacturer?: string | null;
  model?: string | null;
}

export type Presentation = "panel" | "button";

export interface CardConfig {
  device: string;
  style: Presentation;
}

export interface VolumeControl {
  entityId: string;
  name: string;
  min: number;
  max: number;
  step: number;
  value: number | null;
}

export interface SelectControl {
  entityId: string;
  name: string;
  options: string[];
  value: string;
}

export interface SwitchControl {
  entityId: string;
  name: string;
  on: boolean;
}

export interface ButtonControl {
  entityId: string;
  name: string;
  confirm: boolean;
}

export interface LightControl {
  entityId: string;
  name: string;
  state: string;
  brightness: number | null;
  effectEntityId?: string;
  effectOptions: string[];
  effect?: string;
}

export interface UpdateControl {
  entityId: string;
  name: string;
  state: string;
  installed?: string;
  latest?: string;
  title?: string;
}

export interface SensorLine {
  entityId: string;
  name: string;
  state: string;
  unit?: string;
  deviceClass?: string;
}

export interface MediaModel {
  playerId?: string;
  favoriteId?: string;
  state?: string;
  title?: string;
  artist?: string;
  picture?: string;
}

export interface AlarmModel {
  nextAlarmId?: string;
  nextAlarm?: string;
  snoozedUntilId?: string;
  snoozedUntil?: string;
  ringingId?: string;
  ringing: boolean;
  snoozeId?: string;
  stopId?: string;
  scriptAvailable: boolean;
  kioskName: string;
}

export interface SatelliteModel {
  deviceId: string;
  name: string;
  missing: boolean;
  assistEntityId?: string;
  assistState?: string;
  media: MediaModel;
  volumes: VolumeControl[];
  alarms: AlarmModel;
  voiceSelects: SelectControl[];
  voiceSwitches: SwitchControl[];
  timers: SensorLine[];
  light?: LightControl;
  ambient: SensorLine[];
  header: SensorLine[];
  updates: UpdateControl[];
  actions: ButtonControl[];
  remoteAdmin?: string;
  settings: Array<VolumeControl | SelectControl | SwitchControl | ButtonControl | LightControl>;
  diagnostics: SensorLine[];
}

export interface ModelInput {
  deviceId: string;
  devices: DeviceEntry[];
  entities: RegistryEntry[];
  states: Record<string, EntityState | undefined>;
  /** True when script.kiosk_satellite_alarms exists. The card passes this. */
  alarmScript?: boolean;
}

const VOICE_SELECTS = [
  "wake word",
  "wake word 2",
  "assistant",
  "assistant 2",
  "finished speaking detection",
  "vs wake word engine",
  "vs wake word sensitivity",
];

const VOICE_SWITCHES = [
  "vs mute",
  "vs chimes",
  "vs mute timers",
  "vs noise gate",
  "vs stop word",
  "intercom enabled",
  "intercom do not disturb",
];

const TIMER_NAMES = ["vs timers", "vs next timer"];
const AMBIENT_NAMES = ["ambient light", "ambient noise"];
const HEADER_NAMES = ["battery", "charging"];
const VOLUME_RANKS = ["volume", "media volume", "assistant volume"];
const ACTION_RANKS = ["restart app", "restart device"];
const SETTINGS_DOMAINS = new Set(["number", "select", "switch", "button", "light"]);
const SENSOR_DOMAINS = ["sensor", "binary_sensor"];

export function parseConfig(config: unknown): CardConfig {
  if (typeof config !== "object" || config === null) {
    throw new Error("device is required");
  }
  const device = (config as { device?: unknown }).device;
  if (typeof device !== "string" || device.length === 0) {
    throw new Error("device is required");
  }
  const style = (config as { style?: unknown }).style;
  return {
    device,
    style: style === "button" ? "button" : "panel",
  };
}

export function buildModel(input: ModelInput): SatelliteModel {
  const device = input.devices.find((item) => item.id === input.deviceId);
  const name = deviceLabel(device, input.deviceId);
  const entries = input.entities.filter(
    (entry) => entry.device_id === input.deviceId && !isSuppressed(entry),
  );
  const used = new Set<string>();
  const states = input.states;

  const assist = entries.find((entry) => domainOf(entry) === "assist_satellite");
  if (assist) used.add(assist.entity_id);

  const media = buildMedia(assist?.entity_id, input.entities, states);
  if (media.favoriteId) used.add(media.favoriteId);

  const volumes = takeVolumes(entries, states, used);
  const alarms = buildAlarms(entries, states, used, name, input.alarmScript === true);
  const voiceSelects = takeNamed(entries, ["select"], VOICE_SELECTS, used, (entry) =>
    selectControl(entry, states),
  ).map(voiceLabel);
  const voiceSwitches = takeVoiceSwitches(entries, states, used);
  const timers = takeNamed(entries, ["sensor"], TIMER_NAMES, used, (entry) => sensorLine(entry, states)).map(
    voiceLabel,
  );
  const light = takeLight(entries, states, used);
  const ambient = takeNamed(entries, ["sensor"], AMBIENT_NAMES, used, (entry) => sensorLine(entry, states));
  const header = takeNamed(entries, SENSOR_DOMAINS, HEADER_NAMES, used, (entry) => sensorLine(entry, states));
  const updates = takeUpdates(entries, states, used);
  const actions = takeActions(entries, used);
  const remoteAdmin = takeRemoteAdmin(entries, states, used);
  const settings = takeSettings(entries, states, used);
  const diagnostics = takeDiagnostics(entries, states, used);

  const model: SatelliteModel = {
    deviceId: input.deviceId,
    name,
    missing: device === undefined,
    media,
    volumes,
    alarms,
    voiceSelects,
    voiceSwitches,
    timers,
    ambient,
    header,
    updates,
    actions,
    settings,
    diagnostics,
  };
  if (assist) {
    model.assistEntityId = assist.entity_id;
    const assistState = states[assist.entity_id];
    if (assistState) model.assistState = assistState.state;
  }
  if (light) model.light = light;
  if (remoteAdmin) model.remoteAdmin = remoteAdmin;
  return model;
}

export function alarmServiceCall(
  action: "list" | "set" | "turn_on" | "turn_off" | "delete",
  kioskName: string,
  extra?: { time?: string; label?: string; days?: string[] },
): { domain: "script"; service: "kiosk_satellite_alarms"; data: Record<string, unknown> } {
  const data: Record<string, unknown> = { action, kiosk: kioskName };
  if (typeof extra?.time === "string" && extra.time.length > 0) data.time = extra.time;
  if (typeof extra?.label === "string" && extra.label.length > 0) data.label = extra.label;
  if (Array.isArray(extra?.days) && extra.days.length > 0) data.days = extra.days.slice();
  return { domain: "script", service: "kiosk_satellite_alarms", data };
}

function deviceLabel(device: DeviceEntry | undefined, deviceId: string): string {
  if (!device) return deviceId;
  if (typeof device.name_by_user === "string" && device.name_by_user.length > 0) return device.name_by_user;
  if (typeof device.name === "string" && device.name.length > 0) return device.name;
  return deviceId;
}

function isSuppressed(entry: RegistryEntry): boolean {
  return Boolean(entry.hidden_by) || Boolean(entry.disabled_by);
}

function domainOf(entry: RegistryEntry): string {
  const dot = entry.entity_id.indexOf(".");
  return dot === -1 ? "" : entry.entity_id.slice(0, dot);
}

function objectId(entityId: string): string {
  const dot = entityId.indexOf(".");
  return dot === -1 ? entityId : entityId.slice(dot + 1);
}

function displayName(entry: RegistryEntry): string {
  if (typeof entry.original_name === "string" && entry.original_name.length > 0) return entry.original_name;
  if (typeof entry.name === "string" && entry.name.length > 0) return entry.name;
  return objectId(entry.entity_id).replace(/_/g, " ");
}

/** Voice Satellite names are prefixed "VS ". The Voice section shows the rest. */
function voiceLabel<T extends { name: string }>(control: T): T {
  const name = control.name.replace(/^VS\s+/i, "");
  if (name === control.name) return control;
  return { ...control, name };
}

function normalize(name: string): string {
  return name.trim().toLowerCase();
}

function attributesOf(
  states: Record<string, EntityState | undefined>,
  entityId: string,
): Record<string, unknown> {
  return states[entityId]?.attributes ?? {};
}

function numberAttr(attributes: Record<string, unknown>, key: string, fallback: number): number {
  const value = attributes[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function numericState(value: string | undefined): number | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const numeric = Number(trimmed);
  return Number.isFinite(numeric) ? numeric : null;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) return [];
  return value.slice();
}

function named(entry: RegistryEntry, name: string): boolean {
  const shown = normalize(displayName(entry));
  // Lovelace may only have the friendly name or the object id, both prefixed
  // with the device ("Updoot2 Next alarm", "updoot2 next alarm").
  return shown === name || shown.endsWith(` ${name}`);
}

function rankOf(name: string, ranks: readonly string[]): number {
  const index = ranks.indexOf(normalize(name));
  return index === -1 ? ranks.length : index;
}

function compareRank(aName: string, bName: string, ranks: readonly string[]): number {
  const aRank = rankOf(aName, ranks);
  const bRank = rankOf(bName, ranks);
  if (aRank !== bRank) return aRank - bRank;
  if (aRank === ranks.length) return aName.localeCompare(bName, undefined, { sensitivity: "base" });
  return 0;
}

function compareName(a: { name: string }, b: { name: string }): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

function volumeControl(entry: RegistryEntry, states: Record<string, EntityState | undefined>): VolumeControl {
  const attributes = attributesOf(states, entry.entity_id);
  return {
    entityId: entry.entity_id,
    name: displayName(entry),
    min: numberAttr(attributes, "min", 0),
    max: numberAttr(attributes, "max", 100),
    step: numberAttr(attributes, "step", 1),
    value: numericState(states[entry.entity_id]?.state),
  };
}

function selectControl(entry: RegistryEntry, states: Record<string, EntityState | undefined>): SelectControl {
  return {
    entityId: entry.entity_id,
    name: displayName(entry),
    options: stringArray(attributesOf(states, entry.entity_id).options),
    value: states[entry.entity_id]?.state ?? "",
  };
}

function switchControl(entry: RegistryEntry, states: Record<string, EntityState | undefined>): SwitchControl {
  return {
    entityId: entry.entity_id,
    name: displayName(entry),
    on: states[entry.entity_id]?.state === "on",
  };
}

function buttonControl(entry: RegistryEntry, confirmable: boolean): ButtonControl {
  const name = displayName(entry);
  const key = normalize(name);
  return {
    entityId: entry.entity_id,
    name,
    confirm: confirmable && (key === "restart app" || key === "restart device"),
  };
}

function lightControl(
  entry: RegistryEntry,
  states: Record<string, EntityState | undefined>,
  effect?: RegistryEntry,
): LightControl {
  const brightness = attributesOf(states, entry.entity_id).brightness;
  const control: LightControl = {
    entityId: entry.entity_id,
    name: displayName(entry),
    state: states[entry.entity_id]?.state ?? "",
    brightness: typeof brightness === "number" && Number.isFinite(brightness) ? brightness : null,
    effectOptions: [],
  };
  if (!effect) return control;
  control.effectEntityId = effect.entity_id;
  control.effectOptions = stringArray(attributesOf(states, effect.entity_id).options);
  control.effect = states[effect.entity_id]?.state ?? "";
  return control;
}

function sensorLine(entry: RegistryEntry, states: Record<string, EntityState | undefined>): SensorLine {
  const attributes = attributesOf(states, entry.entity_id);
  const line: SensorLine = {
    entityId: entry.entity_id,
    name: displayName(entry),
    state: states[entry.entity_id]?.state ?? "",
  };
  const unit = attributes.unit_of_measurement;
  const deviceClass = attributes.device_class;
  if (typeof unit === "string" && unit.length > 0) line.unit = unit;
  if (typeof deviceClass === "string" && deviceClass.length > 0) line.deviceClass = deviceClass;
  return line;
}

function updateControl(entry: RegistryEntry, states: Record<string, EntityState | undefined>): UpdateControl {
  const attributes = attributesOf(states, entry.entity_id);
  const control: UpdateControl = {
    entityId: entry.entity_id,
    name: displayName(entry),
    state: states[entry.entity_id]?.state ?? "",
  };
  if (typeof attributes.installed_version === "string") control.installed = attributes.installed_version;
  if (typeof attributes.latest_version === "string") control.latest = attributes.latest_version;
  if (typeof attributes.title === "string") control.title = attributes.title;
  return control;
}

function takeFirst(
  entries: readonly RegistryEntry[],
  domains: readonly string[],
  name: string,
  used: Set<string>,
): RegistryEntry | undefined {
  const entry = entries.find(
    (item) => !used.has(item.entity_id) && domains.includes(domainOf(item)) && named(item, name),
  );
  if (entry) used.add(entry.entity_id);
  return entry;
}

function takeNamed<T>(
  entries: readonly RegistryEntry[],
  domains: readonly string[],
  names: readonly string[],
  used: Set<string>,
  map: (entry: RegistryEntry) => T,
): T[] {
  const result: T[] = [];
  for (const name of names) {
    for (const entry of entries) {
      if (used.has(entry.entity_id) || !domains.includes(domainOf(entry)) || !named(entry, name)) continue;
      used.add(entry.entity_id);
      result.push(map(entry));
    }
  }
  return result;
}

function takeVolumes(
  entries: readonly RegistryEntry[],
  states: Record<string, EntityState | undefined>,
  used: Set<string>,
): VolumeControl[] {
  const matches = entries.filter(
    (entry) =>
      !used.has(entry.entity_id) &&
      domainOf(entry) === "number" &&
      normalize(displayName(entry)).includes("volume"),
  );
  for (const entry of matches) used.add(entry.entity_id);
  return matches
    .map((entry) => volumeControl(entry, states))
    .sort((a, b) => compareRank(a.name, b.name, VOLUME_RANKS));
}

function buildAlarms(
  entries: readonly RegistryEntry[],
  states: Record<string, EntityState | undefined>,
  used: Set<string>,
  kioskName: string,
  scriptAvailable: boolean,
): AlarmModel {
  const alarms: AlarmModel = { ringing: false, scriptAvailable, kioskName };
  const nextAlarm = takeFirst(entries, ["sensor"], "next alarm", used);
  if (nextAlarm) {
    alarms.nextAlarmId = nextAlarm.entity_id;
    alarms.nextAlarm = states[nextAlarm.entity_id]?.state ?? "";
  }
  const snoozed = takeFirst(entries, ["sensor"], "alarm snoozed until", used);
  if (snoozed) {
    alarms.snoozedUntilId = snoozed.entity_id;
    alarms.snoozedUntil = states[snoozed.entity_id]?.state ?? "";
  }
  const ringing = takeFirst(entries, ["binary_sensor"], "alarm ringing", used);
  if (ringing) {
    alarms.ringingId = ringing.entity_id;
    alarms.ringing = states[ringing.entity_id]?.state === "on";
  }
  const snooze = takeFirst(entries, ["button"], "snooze alarm", used);
  if (snooze) alarms.snoozeId = snooze.entity_id;
  const stop = takeFirst(entries, ["button"], "stop alarm", used);
  if (stop) alarms.stopId = stop.entity_id;
  return alarms;
}

function takeVoiceSwitches(
  entries: readonly RegistryEntry[],
  states: Record<string, EntityState | undefined>,
  used: Set<string>,
): SwitchControl[] {
  const ordered = takeNamed(entries, ["switch"], VOICE_SWITCHES, used, (entry) => switchControl(entry, states));
  const extras = entries.filter(
    (entry) =>
      !used.has(entry.entity_id) &&
      domainOf(entry) === "switch" &&
      normalize(displayName(entry)).startsWith("vs "),
  );
  extras.sort((a, b) => displayName(a).localeCompare(displayName(b), undefined, { sensitivity: "base" }));
  for (const entry of extras) used.add(entry.entity_id);
  return [...ordered, ...extras.map((entry) => switchControl(entry, states))].map(voiceLabel);
}

function takeLight(
  entries: readonly RegistryEntry[],
  states: Record<string, EntityState | undefined>,
  used: Set<string>,
): LightControl | undefined {
  const light = takeFirst(entries, ["light"], "led control idle", used);
  if (!light) return undefined;
  const effect = takeFirst(entries, ["select"], "led control idle effect", used);
  return lightControl(light, states, effect);
}

function takeUpdates(
  entries: readonly RegistryEntry[],
  states: Record<string, EntityState | undefined>,
  used: Set<string>,
): UpdateControl[] {
  const matches = entries.filter((entry) => !used.has(entry.entity_id) && domainOf(entry) === "update");
  for (const entry of matches) used.add(entry.entity_id);
  return matches.map((entry) => updateControl(entry, states)).sort(compareName);
}

function takeActions(entries: readonly RegistryEntry[], used: Set<string>): ButtonControl[] {
  const matches = entries.filter((entry) => !used.has(entry.entity_id) && domainOf(entry) === "button");
  for (const entry of matches) used.add(entry.entity_id);
  return matches
    .map((entry) => buttonControl(entry, true))
    .sort((a, b) => compareRank(a.name, b.name, ACTION_RANKS));
}

function takeRemoteAdmin(
  entries: readonly RegistryEntry[],
  states: Record<string, EntityState | undefined>,
  used: Set<string>,
): string | undefined {
  const entry = takeFirst(entries, ["sensor"], "remote admin", used);
  if (!entry) return undefined;
  const value = states[entry.entity_id]?.state ?? "";
  return value.startsWith("http") ? value : undefined;
}

function takeSettings(
  entries: readonly RegistryEntry[],
  states: Record<string, EntityState | undefined>,
  used: Set<string>,
): SatelliteModel["settings"] {
  const matches = entries.filter((entry) => {
    if (used.has(entry.entity_id) || !SETTINGS_DOMAINS.has(domainOf(entry))) return false;
    const category = entry.entity_category;
    return category === "config" || category == null || category === "";
  });
  for (const entry of matches) used.add(entry.entity_id);
  return matches.map((entry) => toSetting(entry, states)).sort(compareName);
}

function toSetting(
  entry: RegistryEntry,
  states: Record<string, EntityState | undefined>,
): VolumeControl | SelectControl | SwitchControl | ButtonControl | LightControl {
  switch (domainOf(entry)) {
    case "number":
      return volumeControl(entry, states);
    case "select":
      return selectControl(entry, states);
    case "switch":
      return switchControl(entry, states);
    case "button":
      return buttonControl(entry, false);
    case "light":
      return lightControl(entry, states);
    default:
      throw new Error(`Unsupported settings domain ${domainOf(entry)}`);
  }
}

function takeDiagnostics(
  entries: readonly RegistryEntry[],
  states: Record<string, EntityState | undefined>,
  used: Set<string>,
): SensorLine[] {
  const matches = entries.filter((entry) => {
    if (used.has(entry.entity_id) || entry.entity_category !== "diagnostic") return false;
    const domain = domainOf(entry);
    return domain === "sensor" || domain === "binary_sensor";
  });
  for (const entry of matches) used.add(entry.entity_id);
  return matches.map((entry) => sensorLine(entry, states)).sort(compareName);
}

/**
 * assist_satellite.{stem} or assist_satellite.{stem}_assist_satellite
 * pairs with media_player.{stem}, which may live on another device.
 */
function satelliteStem(entityId: string): string | undefined {
  const prefix = "assist_satellite.";
  if (!entityId.startsWith(prefix)) return undefined;
  let stem = entityId.slice(prefix.length);
  const suffix = "_assist_satellite";
  if (stem.endsWith(suffix)) stem = stem.slice(0, -suffix.length);
  return stem || undefined;
}

function entityKnown(
  entityId: string,
  entities: readonly RegistryEntry[],
  states: Record<string, EntityState | undefined>,
): boolean {
  if (states[entityId] != null) return true;
  return entities.some((entry) => entry.entity_id === entityId);
}

/**
 * The Now Playing section uses Home Assistant's media-control card whenever a
 * paired player exists. Idle, off, unknown, and unavailable still show it.
 */
export function showNowPlaying(playerId: string | undefined, _state: string | undefined): boolean {
  return Boolean(playerId);
}

function buildMedia(
  assistEntityId: string | undefined,
  entities: readonly RegistryEntry[],
  states: Record<string, EntityState | undefined>,
): MediaModel {
  const stem = assistEntityId ? satelliteStem(assistEntityId) : undefined;
  if (!stem) return {};
  const playerId = `media_player.${stem}`;
  const favoriteId = `button.${stem}_favorite_current_song`;
  const media: MediaModel = {};
  if (entityKnown(playerId, entities, states)) {
    media.playerId = playerId;
    const player = states[playerId];
    if (player) {
      media.state = player.state;
      const attributes = player.attributes ?? {};
      if (typeof attributes.media_title === "string") media.title = attributes.media_title;
      if (typeof attributes.media_artist === "string") media.artist = attributes.media_artist;
      if (typeof attributes.entity_picture === "string") media.picture = attributes.entity_picture;
    }
  }
  if (entityKnown(favoriteId, entities, states)) media.favoriteId = favoriteId;
  return media;
}
