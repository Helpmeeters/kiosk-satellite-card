import type { EntityState, SatelliteModel, VolumeControl } from "./model";

export interface TimeLocale {
  language?: string;
  time_format?: string;
}

export type RepeatMode = "off" | "all" | "one";

export const MEDIA_FEATURE = {
  PAUSE: 1,
  SEEK: 2,
  VOLUME_SET: 4,
  VOLUME_MUTE: 8,
  PREVIOUS_TRACK: 16,
  NEXT_TRACK: 32,
  TURN_ON: 128,
  TURN_OFF: 256,
  PLAY_MEDIA: 512,
  VOLUME_STEP: 1024,
  STOP: 16384,
  PLAY: 131072,
  SHUFFLE_SET: 262144,
  GROUPING: 524288,
  BROWSE_MEDIA: 1048576,
  REPEAT_SET: 2097152,
} as const;

export interface PlayerSnapshot {
  state?: string;
  title?: string;
  artist?: string;
  album?: string;
  picture?: string;
  position?: number;
  duration?: number;
  positionUpdatedAt?: string;
  volumeLevel?: number;
  supportedFeatures?: number;
  appId?: string;
  source?: string;
  muted?: boolean;
  shuffle?: boolean;
  repeat?: RepeatMode;
  groupMembers?: string[];
}

export interface RedisplayVolume {
  /** `number` writes the entity. `player` writes the player's volume, with the slider scaled 0–100. */
  source: "number" | "player";
  entityId?: string;
  min: number;
  max: number;
  step: number;
  value: number | null;
}

export interface RedisplayView {
  missing: boolean;
  name: string;
  playerId?: string;
  favoriteId?: string;
  playing: boolean;
  playerOff: boolean;
  title: string;
  artist: string;
  album: string;
  picture?: string;
  elapsed?: string;
  duration?: string;
  durationSeconds?: number;
  progress?: number;
  volume?: RedisplayVolume;
  canSeek: boolean;
  canMute: boolean;
  canShuffle: boolean;
  canRepeat: boolean;
  canStop: boolean;
  canPower: boolean;
  canGroup: boolean;
  canBrowse: boolean;
  muted: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  groupMembers: string[];
  appId?: string;
  assist?: string;
  nextAlarm?: string;
  snoozedUntil?: string;
  ringing: boolean;
  snoozeId?: string;
  stopId?: string;
  timer?: string;
}

export interface GroupMemberCandidate {
  entityId: string;
  name: string;
  joined: boolean;
}

/** Master volume, the header speaker. Media volume stays on Now playing. */
export interface PlaybackMix {
  volume: RedisplayVolume;
}

export type RedisplayTab = "now" | "alarms" | "intercom" | "agent";

const ASSIST_LABELS: Record<string, string> = {
  listening: "Listening",
  processing: "Thinking",
  responding: "Speaking",
};

export function playerSnapshot(entity: EntityState | undefined): PlayerSnapshot {
  const attributes = entity?.attributes ?? {};
  const snapshot: PlayerSnapshot = {};
  if (entity?.state) snapshot.state = entity.state;
  const title = textAttr(attributes, "media_title");
  const artist = textAttr(attributes, "media_artist");
  const album = textAttr(attributes, "media_album_name");
  const picture = textAttr(attributes, "entity_picture");
  const updated = textAttr(attributes, "media_position_updated_at");
  const position = finiteAttr(attributes, "media_position");
  const duration = finiteAttr(attributes, "media_duration");
  const volume = finiteAttr(attributes, "volume_level");
  const supportedFeatures = finiteAttr(attributes, "supported_features");
  const appId = textAttr(attributes, "app_id");
  const source = textAttr(attributes, "source");
  const muted = boolAttr(attributes, "is_volume_muted");
  const shuffle = boolAttr(attributes, "shuffle");
  const repeat = repeatAttr(attributes);
  const groupMembers = stringArrayAttr(attributes, "group_members");
  if (title) snapshot.title = title;
  if (artist) snapshot.artist = artist;
  if (album) snapshot.album = album;
  if (picture) snapshot.picture = picture;
  if (updated) snapshot.positionUpdatedAt = updated;
  if (position !== undefined) snapshot.position = position;
  if (duration !== undefined) snapshot.duration = duration;
  if (volume !== undefined) snapshot.volumeLevel = volume;
  if (supportedFeatures !== undefined) snapshot.supportedFeatures = supportedFeatures;
  if (appId) snapshot.appId = appId;
  if (source) snapshot.source = source;
  if (muted !== undefined) snapshot.muted = muted;
  if (shuffle !== undefined) snapshot.shuffle = shuffle;
  if (repeat) snapshot.repeat = repeat;
  if (groupMembers) snapshot.groupMembers = groupMembers;
  return snapshot;
}

export function buildRedisplay(
  model: SatelliteModel,
  player: PlayerSnapshot | undefined,
  now: number,
  locale?: TimeLocale,
): RedisplayView {
  if (model.missing) {
    return {
      missing: true,
      name: model.name,
      playing: false,
      playerOff: false,
      title: "",
      artist: "",
      album: "",
      canSeek: false,
      canMute: false,
      canShuffle: false,
      canRepeat: false,
      canStop: false,
      canPower: false,
      canGroup: false,
      canBrowse: false,
      muted: false,
      shuffle: false,
      repeat: "off",
      groupMembers: [],
      ringing: false,
    };
  }

  const state = player?.state ?? model.media.state;
  const playing = state === "playing" || state === "buffering";
  const playerOff = state === "off" || state === "standby";
  const title = player?.title || model.media.title || (playing ? "Playing" : "Nothing playing");
  const artist = player?.artist || model.media.artist || "";
  const picture = player?.picture || model.media.picture;
  const progress = trackProgress(player, playing, now);
  const features = player?.supportedFeatures ?? 0;
  const hasPlayer = Boolean(model.media.playerId);
  const view: RedisplayView = {
    missing: false,
    name: model.name,
    playing,
    playerOff,
    title,
    artist,
    album: player?.album ?? "",
    canSeek: hasPlayer && supportsFeature(features, MEDIA_FEATURE.SEEK),
    canMute: hasPlayer && supportsFeature(features, MEDIA_FEATURE.VOLUME_MUTE),
    canShuffle: hasPlayer && supportsFeature(features, MEDIA_FEATURE.SHUFFLE_SET),
    canRepeat: hasPlayer && supportsFeature(features, MEDIA_FEATURE.REPEAT_SET),
    canStop: hasPlayer && supportsFeature(features, MEDIA_FEATURE.STOP),
    canPower:
      hasPlayer && (supportsFeature(features, MEDIA_FEATURE.TURN_ON) || supportsFeature(features, MEDIA_FEATURE.TURN_OFF)),
    canGroup: hasPlayer && supportsFeature(features, MEDIA_FEATURE.GROUPING),
    canBrowse:
      hasPlayer && (supportsFeature(features, MEDIA_FEATURE.BROWSE_MEDIA) || player?.appId === "music_assistant"),
    muted: player?.muted === true,
    shuffle: player?.shuffle === true,
    repeat: player?.repeat ?? "off",
    groupMembers: player?.groupMembers ? [...player.groupMembers] : [],
    ringing: model.alarms.ringing,
    snoozeId: model.alarms.snoozeId,
    stopId: model.alarms.stopId,
  };
  if (model.media.playerId) view.playerId = model.media.playerId;
  if (model.media.favoriteId) view.favoriteId = model.media.favoriteId;
  if (player?.appId) view.appId = player.appId;
  if (picture) view.picture = picture;
  if (progress) {
    view.elapsed = formatElapsed(progress.position);
    view.duration = formatElapsed(progress.duration);
    view.durationSeconds = progress.duration;
    view.progress = progress.ratio;
  }
  const volume = displayVolume(model.volumes, player?.volumeLevel);
  if (volume) view.volume = volume;
  const assist = model.assistState ? ASSIST_LABELS[model.assistState] : undefined;
  if (assist) view.assist = assist;
  const nextAlarm = clockText(model.alarms.nextAlarm, locale);
  if (nextAlarm) view.nextAlarm = nextAlarm;
  const snoozed = clockText(model.alarms.snoozedUntil, locale);
  if (snoozed) view.snoozedUntil = snoozed;
  const timer = timerText(model, locale);
  if (timer) view.timer = timer;
  return view;
}

/** A remembered Timers or Alarms selection opens Alarms & Timers. Device and anything else unknown open Now playing. */
export function redisplayTab(id: string): RedisplayTab {
  if (id === "alarms" || id === "timers") return "alarms";
  if (id === "intercom" || id === "agent" || id === "now") return id;
  return "now";
}

/**
 * Volume, the header speaker. Media volume, assistant volume, and intercom volume stay out.
 * Mute, chimes, and noise gate are not part of this slider.
 */
export function playbackMix(model: SatelliteModel): PlaybackMix | undefined {
  const master = model.volumes.find((volume) => normalize(volume.name) === "volume");
  if (!master) return undefined;
  return {
    volume: {
      source: "number",
      entityId: master.entityId,
      min: master.min,
      max: master.max,
      step: master.step,
      value: master.value,
    },
  };
}

export function formatVolumeReadout(value: number, max: number): string {
  const rounded = Math.round(value * 10) / 10;
  return max === 100 ? `${rounded}%` : String(rounded);
}

export function formatElapsed(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const second = String(secs).padStart(2, "0");
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${second}`;
  return `${minutes}:${second}`;
}

export function formatDateClock(date: Date, locale?: TimeLocale): string {
  const format = locale?.time_format;
  if (format === "12") {
    return date.toLocaleTimeString(locale?.language || undefined, {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }
  if (format === "24") {
    return date.toLocaleTimeString(locale?.language || undefined, {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
  }
  if (format === "language" && locale?.language) {
    return date.toLocaleTimeString(locale.language, {
      hour: "numeric",
      minute: "2-digit",
    });
  }
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function formatClock(state: string, locale?: TimeLocale): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(state) || Number.isNaN(new Date(state).getTime())) return undefined;
  return formatDateClock(new Date(state), locale);
}

function trackProgress(
  player: PlayerSnapshot | undefined,
  playing: boolean,
  now: number,
): { position: number; duration: number; ratio: number } | undefined {
  const duration = player?.duration;
  const position = player?.position;
  if (duration === undefined || duration <= 0 || position === undefined) return undefined;
  let elapsed = position;
  if (playing && player?.positionUpdatedAt) {
    const updated = Date.parse(player.positionUpdatedAt);
    if (!Number.isNaN(updated)) elapsed += Math.max(0, (now - updated) / 1000);
  }
  const clamped = Math.min(Math.max(elapsed, 0), duration);
  return { position: clamped, duration, ratio: clamped / duration };
}

function displayVolume(volumes: readonly VolumeControl[], playerLevel: number | undefined): RedisplayVolume | undefined {
  const media = volumes.find((volume) => normalize(volume.name) === "media volume");
  if (media) {
    return {
      source: "number",
      entityId: media.entityId,
      min: media.min,
      max: media.max,
      step: media.step,
      value: media.value,
    };
  }
  if (playerLevel === undefined) return undefined;
  return {
    source: "player",
    min: 0,
    max: 100,
    step: 1,
    value: Math.round(Math.min(Math.max(playerLevel, 0), 1) * 100),
  };
}

const SPEAKER_PATH =
  "M3 9v6h4l5 5V4L7 9H3zm13.5 3a5 5 0 0 1-2.5 4.03V7.97A5 5 0 0 1 16.5 12zM14 3.23v2.06A7 7 0 0 1 19 12a7 7 0 0 1-5 6.71v2.06A9 9 0 0 0 21 12a9 9 0 0 0-7-8.77z";

/** Inline 24x24 SVG icon, with a span fallback when document lacks createElementNS. */
export function svgIcon(pathData: string, className = ""): HTMLElement {
  const creator = document as Document & {
    createElementNS?: (namespace: string, name: string) => Element;
  };
  if (typeof creator.createElementNS === "function") {
    const svg = creator.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    if (className) svg.setAttribute("class", className);
    const path = creator.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("fill", "currentColor");
    path.setAttribute("d", pathData);
    svg.append(path);
    return svg as unknown as HTMLElement;
  }
  const span = document.createElement("span");
  if (className) span.className = className;
  span.setAttribute("aria-hidden", "true");
  return span;
}

/** Speaker mark for a volume row. A span stands in when the document cannot build SVG. */
export function speakerMark(className: string): HTMLElement {
  return svgIcon(SPEAKER_PATH, className);
}

function normalize(name: string): string {
  return name.trim().toLowerCase();
}

function clockText(state: string | undefined, locale?: TimeLocale): string | undefined {
  if (!state) return undefined;
  const clock = formatClock(state, locale);
  if (clock) return clock;
  const trimmed = state.trim();
  const lower = trimmed.toLowerCase();
  if (!trimmed || lower === "unknown" || lower === "unavailable" || lower === "none") return undefined;
  return trimmed;
}

function timerText(model: SatelliteModel, locale?: TimeLocale): string | undefined {
  const next = model.timers.find((line) => normalize(line.name) === "next timer");
  const nextText = clockText(next?.state, locale);
  if (nextText) return `Timer ${nextText}`;
  const count = model.timers.find((line) => normalize(line.name) === "timers");
  const numeric = Number(count?.state);
  if (!Number.isFinite(numeric) || numeric <= 0) return undefined;
  return numeric === 1 ? "1 timer" : `${numeric} timers`;
}

function textAttr(attributes: Record<string, unknown>, key: string): string | undefined {
  const value = attributes[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function finiteAttr(attributes: Record<string, unknown>, key: string): number | undefined {
  const value = attributes[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function boolAttr(attributes: Record<string, unknown>, key: string): boolean | undefined {
  const value = attributes[key];
  return typeof value === "boolean" ? value : undefined;
}

function repeatAttr(attributes: Record<string, unknown>): RepeatMode | undefined {
  const value = attributes.repeat;
  if (value === "off" || value === "all" || value === "one") return value;
  return undefined;
}

function stringArrayAttr(attributes: Record<string, unknown>, key: string): string[] | undefined {
  const value = attributes[key];
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

export function supportsFeature(features: number | undefined, flag: number): boolean {
  if (typeof features !== "number" || !Number.isFinite(features)) return false;
  return Math.floor(features / flag) % 2 === 1;
}

export function nextRepeatMode(current: RepeatMode | undefined): RepeatMode {
  if (current === "off" || !current) return "all";
  if (current === "all") return "one";
  return "off";
}

export function buildGroupCandidates(
  playerId: string | undefined,
  groupMembers: readonly string[],
  states: Record<string, EntityState | undefined>,
): GroupMemberCandidate[] {
  if (!playerId) return [];
  const current = states[playerId];
  const currentMassType = current?.attributes?.mass_player_type;
  const joinedSet = new Set(groupMembers);
  const candidates: GroupMemberCandidate[] = [];
  for (const [entityId, state] of Object.entries(states)) {
    if (!entityId.startsWith("media_player.") || entityId === playerId || !state) continue;
    if (state.state === "unavailable" || state.state === "unknown") continue;
    const attrs = state.attributes ?? {};
    const features = typeof attrs.supported_features === "number" ? attrs.supported_features : 0;
    if (!supportsFeature(features, MEDIA_FEATURE.GROUPING)) continue;
    if (typeof currentMassType === "string" && currentMassType.length > 0) {
      if (attrs.mass_player_type !== currentMassType) continue;
    }
    const name = textAttr(attrs, "friendly_name") ?? entityId;
    candidates.push({ entityId, name, joined: joinedSet.has(entityId) });
  }
  return candidates.sort((a, b) => a.name.localeCompare(b.name));
}

export function computeJoinGroupMembers(
  playerId: string,
  currentMembers: readonly string[],
  targetId: string,
): string[] {
  const set = new Set<string>(currentMembers.filter((id) => id !== playerId));
  set.add(targetId);
  return Array.from(set);
}
