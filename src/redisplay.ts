import type { EntityState, SatelliteModel, VolumeControl } from "./model";

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
  title: string;
  artist: string;
  album: string;
  picture?: string;
  elapsed?: string;
  duration?: string;
  progress?: number;
  volume?: RedisplayVolume;
  assist?: string;
  nextAlarm?: string;
  snoozedUntil?: string;
  ringing: boolean;
  snoozeId?: string;
  stopId?: string;
  timer?: string;
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
  if (title) snapshot.title = title;
  if (artist) snapshot.artist = artist;
  if (album) snapshot.album = album;
  if (picture) snapshot.picture = picture;
  if (updated) snapshot.positionUpdatedAt = updated;
  if (position !== undefined) snapshot.position = position;
  if (duration !== undefined) snapshot.duration = duration;
  if (volume !== undefined) snapshot.volumeLevel = volume;
  return snapshot;
}

export function buildRedisplay(model: SatelliteModel, player: PlayerSnapshot | undefined, now: number): RedisplayView {
  if (model.missing) {
    return {
      missing: true,
      name: model.name,
      playing: false,
      title: "",
      artist: "",
      album: "",
      ringing: false,
    };
  }

  const state = player?.state ?? model.media.state;
  const playing = state === "playing" || state === "buffering";
  const title = player?.title || model.media.title || (playing ? "Playing" : "Nothing playing");
  const artist = player?.artist || model.media.artist || "";
  const picture = player?.picture || model.media.picture;
  const progress = trackProgress(player, playing, now);
  const view: RedisplayView = {
    missing: false,
    name: model.name,
    playing,
    title,
    artist,
    album: player?.album ?? "",
    ringing: model.alarms.ringing,
    snoozeId: model.alarms.snoozeId,
    stopId: model.alarms.stopId,
  };
  if (model.media.playerId) view.playerId = model.media.playerId;
  if (model.media.favoriteId) view.favoriteId = model.media.favoriteId;
  if (picture) view.picture = picture;
  if (progress) {
    view.elapsed = formatElapsed(progress.position);
    view.duration = formatElapsed(progress.duration);
    view.progress = progress.ratio;
  }
  const volume = displayVolume(model.volumes, player?.volumeLevel);
  if (volume) view.volume = volume;
  const assist = model.assistState ? ASSIST_LABELS[model.assistState] : undefined;
  if (assist) view.assist = assist;
  const nextAlarm = clockText(model.alarms.nextAlarm);
  if (nextAlarm) view.nextAlarm = nextAlarm;
  const snoozed = clockText(model.alarms.snoozedUntil);
  if (snoozed) view.snoozedUntil = snoozed;
  const timer = timerText(model);
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

export function formatClock(state: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(state) || Number.isNaN(new Date(state).getTime())) return undefined;
  return new Date(state).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
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

function normalize(name: string): string {
  return name.trim().toLowerCase();
}

function clockText(state: string | undefined): string | undefined {
  if (!state) return undefined;
  const clock = formatClock(state);
  if (clock) return clock;
  const trimmed = state.trim();
  const lower = trimmed.toLowerCase();
  if (!trimmed || lower === "unknown" || lower === "unavailable" || lower === "none") return undefined;
  return trimmed;
}

function timerText(model: SatelliteModel): string | undefined {
  const next = model.timers.find((line) => normalize(line.name) === "next timer");
  const nextText = clockText(next?.state);
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
