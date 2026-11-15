import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { EntityState, SatelliteModel, VolumeControl } from "../src/model";
import {
  buildRedisplay,
  formatClock,
  formatElapsed,
  formatVolumeReadout,
  playbackMix,
  playerSnapshot,
  redisplayTab,
  type PlayerSnapshot,
} from "../src/redisplay";

function satellite(partial: Partial<SatelliteModel> = {}): SatelliteModel {
  return {
    deviceId: "dev1",
    name: "Dot",
    missing: false,
    media: {},
    volumes: [],
    alarms: { ringing: false, scriptAvailable: false, kioskName: "Dot" },
    voiceSelects: [],
    voiceSwitches: [],
    timers: [],
    ambient: [],
    header: [],
    updates: [],
    actions: [],
    settings: [],
    diagnostics: [],
    ...partial,
  };
}

function volume(name: string, value: number, entityId = `number.${name}`): VolumeControl {
  return { entityId, name, min: 0, max: 100, step: name === "Media volume" ? 5 : 1, value };
}

describe("formatElapsed", () => {
  it("formats minutes and hours", () => {
    assert.equal(formatElapsed(0), "0:00");
    assert.equal(formatElapsed(40), "0:40");
    assert.equal(formatElapsed(125), "2:05");
    assert.equal(formatElapsed(3661), "1:01:01");
  });
});

describe("playerSnapshot", () => {
  it("reads the player attributes a display needs", () => {
    const entity: EntityState = {
      state: "playing",
      attributes: {
        media_title: "Crossfire",
        media_artist: "Stevie Ray Vaughan",
        media_album_name: "Couldn't Stand the Weather",
        entity_picture: "/art.jpg",
        media_position: 30,
        media_duration: 120,
        media_position_updated_at: "2026-11-14T12:00:00",
        volume_level: 0.47,
        ignored: true,
      },
    };
    assert.deepEqual(playerSnapshot(entity), {
      state: "playing",
      title: "Crossfire",
      artist: "Stevie Ray Vaughan",
      album: "Couldn't Stand the Weather",
      picture: "/art.jpg",
      position: 30,
      duration: 120,
      positionUpdatedAt: "2026-11-14T12:00:00",
      volumeLevel: 0.47,
    });
    assert.deepEqual(playerSnapshot(undefined), {});
  });
});

describe("buildRedisplay", () => {
  const now = Date.parse("2026-11-14T12:00:10");

  it("shows nothing playing when the player is idle", () => {
    const view = buildRedisplay(satellite({ assistState: "idle" }), { state: "idle" }, now);
    assert.equal(view.missing, false);
    assert.equal(view.name, "Dot");
    assert.equal(view.playing, false);
    assert.equal(view.title, "Nothing playing");
    assert.equal(view.assist, undefined);
    assert.equal(view.progress, undefined);
    assert.equal(view.volume, undefined);
  });

  it("advances a playing track from the last reported position", () => {
    const player: PlayerSnapshot = {
      state: "playing",
      title: "Crossfire",
      artist: "Stevie Ray Vaughan",
      album: "Couldn't Stand the Weather",
      picture: "/art.jpg",
      position: 30,
      duration: 120,
      positionUpdatedAt: "2026-11-14T12:00:00",
    };
    const view = buildRedisplay(
      satellite({ media: { playerId: "media_player.dot", favoriteId: "button.dot_favorite_current_song", state: "playing" } }),
      player,
      now,
    );
    assert.equal(view.playing, true);
    assert.equal(view.title, "Crossfire");
    assert.equal(view.artist, "Stevie Ray Vaughan");
    assert.equal(view.album, "Couldn't Stand the Weather");
    assert.equal(view.picture, "/art.jpg");
    assert.equal(view.playerId, "media_player.dot");
    assert.equal(view.favoriteId, "button.dot_favorite_current_song");
    assert.equal(view.elapsed, "0:40");
    assert.equal(view.duration, "2:00");
    assert.equal(view.progress, 40 / 120);
  });

  it("keeps a paused track at the reported position and clamps the end of a track", () => {
    const paused = buildRedisplay(
      satellite(),
      { state: "paused", title: "Crossfire", position: 30, duration: 120, positionUpdatedAt: "2026-11-14T12:00:00" },
      now,
    );
    assert.equal(paused.playing, false);
    assert.equal(paused.elapsed, "0:30");

    const ended = buildRedisplay(
      satellite(),
      { state: "playing", position: 110, duration: 120, positionUpdatedAt: "2026-11-14T12:00:00" },
      now,
    );
    assert.equal(ended.elapsed, "2:00");
    assert.equal(ended.progress, 1);
  });

  it("names the active assist state", () => {
    assert.equal(buildRedisplay(satellite({ assistState: "listening" }), undefined, now).assist, "Listening");
    assert.equal(buildRedisplay(satellite({ assistState: "processing" }), undefined, now).assist, "Thinking");
    assert.equal(buildRedisplay(satellite({ assistState: "responding" }), undefined, now).assist, "Speaking");
    assert.equal(buildRedisplay(satellite({ assistState: "unavailable" }), undefined, now).assist, undefined);
  });

  it("uses media volume, then the player volume", () => {
    const media = buildRedisplay(
      satellite({
        volumes: [volume("Volume", 10, "number.volume"), volume("Media volume", 47, "number.media"), volume("Assistant volume", 80, "number.assistant")],
      }),
      { volumeLevel: 0.2 },
      now,
    );
    assert.deepEqual(media.volume, { source: "number", entityId: "number.media", min: 0, max: 100, step: 5, value: 47 });

    const player = buildRedisplay(satellite({ volumes: [volume("Assistant volume", 80)] }), { volumeLevel: 0.47 }, now);
    assert.deepEqual(player.volume, { source: "player", min: 0, max: 100, step: 1, value: 47 });
  });

  it("shows the next alarm, a ringing alarm, and the next timer", () => {
    const alarmAt = "2026-11-14T13:30:00";
    const view = buildRedisplay(
      satellite({
        alarms: {
          ringing: true,
          scriptAvailable: false,
          kioskName: "Dot",
          nextAlarm: alarmAt,
          snoozedUntil: "unknown",
          snoozeId: "button.snooze",
          stopId: "button.stop",
        },
        timers: [
          { entityId: "sensor.timers", name: "Timers", state: "2" },
          { entityId: "sensor.next", name: "Next timer", state: "5 min" },
        ],
      }),
      undefined,
      now,
    );
    assert.equal(view.nextAlarm, formatClock(alarmAt));
    assert.equal(view.snoozedUntil, undefined);
    assert.equal(view.ringing, true);
    assert.equal(view.snoozeId, "button.snooze");
    assert.equal(view.stopId, "button.stop");
    assert.equal(view.timer, "Timer 5 min");
  });

  it("counts timers when none is scheduled and reports a missing device", () => {
    const counted = buildRedisplay(
      satellite({ timers: [{ entityId: "sensor.timers", name: "Timers", state: "2" }] }),
      undefined,
      now,
    );
    assert.equal(counted.timer, "2 timers");

    const idle = buildRedisplay(
      satellite({ timers: [{ entityId: "sensor.next", name: "Next timer", state: "unknown" }] }),
      undefined,
      now,
    );
    assert.equal(idle.timer, undefined);
    assert.equal(idle.nextAlarm, undefined);

    const missing = buildRedisplay(satellite({ missing: true, name: "missing-id" }), undefined, now);
    assert.equal(missing.missing, true);
    assert.equal(missing.name, "missing-id");
    assert.equal(missing.title, "");
  });
});

describe("redisplayTab", () => {
  it("keeps the four tabs and folds a remembered device selection into Now playing", () => {
    assert.equal(redisplayTab("now"), "now");
    assert.equal(redisplayTab("alarms"), "alarms");
    assert.equal(redisplayTab("timers"), "alarms");
    assert.equal(redisplayTab("intercom"), "intercom");
    assert.equal(redisplayTab("agent"), "agent");
    assert.equal(redisplayTab("device"), "now");
    assert.equal(redisplayTab("light"), "now");
  });
});

describe("playbackMix", () => {
  it("keeps Volume as its own slider and leaves the switches out", () => {
    const mix = playbackMix(
      satellite({
        volumes: [
          volume("Media volume", 47, "number.media"),
          volume("Volume", 67, "number.volume"),
          volume("Assistant volume", 80, "number.assistant"),
          volume("Intercom volume", 60, "number.intercom"),
        ],
        voiceSwitches: [
          { entityId: "switch.stop", name: "Stop word", on: false },
          { entityId: "switch.gate", name: "Noise gate", on: true },
          { entityId: "switch.timers", name: "Mute timers", on: false },
          { entityId: "switch.chimes", name: "Chimes", on: true },
          { entityId: "switch.mute", name: "Mute", on: false },
        ],
      }),
    );
    assert.deepEqual(mix, {
      volume: { source: "number", entityId: "number.volume", min: 0, max: 100, step: 1, value: 67 },
    });
    assert.equal(JSON.stringify(mix).includes("Mute"), false);
    assert.equal(JSON.stringify(mix).includes("Chimes"), false);
    assert.equal(JSON.stringify(mix).includes("Noise gate"), false);
    assert.equal(playbackMix(satellite()), undefined);
  });
});

describe("formatVolumeReadout", () => {
  it("prints a percent at a 0–100 slider and the number otherwise", () => {
    assert.equal(formatVolumeReadout(47, 100), "47%");
    assert.equal(formatVolumeReadout(0.5, 1), "0.5");
  });
});
