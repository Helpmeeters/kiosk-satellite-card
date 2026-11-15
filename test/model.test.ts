import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  alarmServiceCall,
  buildModel,
  parseConfig,
  showNowPlaying,
  type ButtonControl,
  type DeviceEntry,
  type EntityState,
  type LightControl,
  type ModelInput,
  type RegistryEntry,
  type SatelliteModel,
  type SelectControl,
  type SwitchControl,
  type VolumeControl,
} from "../src/model";

function entry(entityId: string, fields: Partial<RegistryEntry> = {}): RegistryEntry {
  return { entity_id: entityId, ...fields };
}

function state(value: string, attributes: Record<string, unknown> = {}): EntityState {
  return { state: value, attributes };
}

function model(input: Partial<ModelInput> & Pick<ModelInput, "deviceId">): SatelliteModel {
  return buildModel({
    devices: input.devices ?? [],
    entities: input.entities ?? [],
    states: input.states ?? {},
    alarmScript: input.alarmScript,
    deviceId: input.deviceId,
  });
}

describe("parseConfig", () => {
  it("rejects a missing device, defaults style to panel, and accepts button", () => {
    for (const config of [undefined, null, {}, { device: "" }, { device: 1 }, "dev1", []]) {
      assert.throws(() => parseConfig(config), /device is required/i);
    }
    assert.deepEqual(parseConfig({ device: "dev1" }), { device: "dev1", style: "panel" });
    assert.deepEqual(parseConfig({ device: "dev1", style: "panel" }), { device: "dev1", style: "panel" });
    assert.deepEqual(parseConfig({ device: "dev1", style: "nope" }), { device: "dev1", style: "panel" });
    assert.deepEqual(parseConfig({ device: "dev1", style: "button" }), { device: "dev1", style: "button" });
  });
});

describe("buildModel", () => {
  it("models the Updoot1 kiosk", () => {
    const devices: DeviceEntry[] = [{ id: "dev1", name: "Updoot1", manufacturer: "kiosk_satellite" }];
    const entities: RegistryEntry[] = [
      entry("select.updoot_assistant", {
        device_id: "dev1",
        original_name: "Assistant",
        entity_category: "config",
      }),
      entry("select.updoot_wake_word", {
        device_id: "dev1",
        original_name: "Wake word",
        entity_category: "config",
      }),
      entry("number.updoot_assistant_volume", {
        device_id: "dev1",
        original_name: "Assistant volume",
        entity_category: "config",
      }),
      entry("number.updoot_media_volume", {
        device_id: "dev1",
        original_name: "Media volume",
        entity_category: "config",
      }),
      entry("number.updoot_volume", {
        device_id: "dev1",
        original_name: "Volume",
        entity_category: "config",
      }),
      entry("switch.updoot_vs_mute", {
        device_id: "dev1",
        original_name: "VS Mute",
        entity_category: "config",
      }),
      entry("binary_sensor.updoot_alarm_ringing", { device_id: "dev1", original_name: "Alarm ringing" }),
      entry("sensor.updoot_next_alarm", { device_id: "dev1", original_name: "Next alarm" }),
      entry("button.updoot_restart_device", { device_id: "dev1", original_name: "Restart device" }),
      entry("button.updoot_restart_app", { device_id: "dev1", original_name: "Restart app" }),
      entry("button.updoot_snooze_alarm", { device_id: "dev1", original_name: "Snooze alarm" }),
      entry("button.updoot_stop_alarm", { device_id: "dev1", original_name: "Stop alarm" }),
      entry("binary_sensor.updoot_charging", {
        device_id: "dev1",
        original_name: "Charging",
        entity_category: "diagnostic",
      }),
      entry("sensor.updoot_battery", {
        device_id: "dev1",
        original_name: "Battery",
        entity_category: "diagnostic",
      }),
      entry("light.updoot_led_control_idle", {
        device_id: "dev1",
        original_name: "LED Control Idle",
        entity_category: "config",
      }),
      entry("select.updoot_led_control_idle_effect", {
        device_id: "dev1",
        original_name: "LED Control Idle Effect",
        entity_category: "config",
      }),
      entry("sensor.updoot_cpu_usage", {
        device_id: "dev1",
        original_name: "CPU usage",
        entity_category: "diagnostic",
      }),
      entry("sensor.updoot_remote_admin", {
        device_id: "dev1",
        original_name: "Remote admin",
        entity_category: "diagnostic",
      }),
      entry("update.updoot_update", { device_id: "dev1", original_name: "Update" }),
      entry("assist_satellite.updoot_assist_satellite", { device_id: "dev1" }),
      entry("media_player.updoot", { device_id: "speaker" }),
      entry("button.updoot_favorite_current_song", { device_id: "speaker" }),
      entry("sensor.updoot_hidden", {
        device_id: "dev1",
        original_name: "Should not appear",
        entity_category: "diagnostic",
        hidden_by: "user",
      }),
    ];
    const states: Record<string, EntityState> = {
      "assist_satellite.updoot_assist_satellite": state("idle"),
      "number.updoot_volume": state("67", { min: 0, max: 100, step: 1 }),
      "number.updoot_media_volume": state("47", { step: 5 }),
      "number.updoot_assistant_volume": state("100", { step: 5 }),
      "select.updoot_wake_word": state("Hey Jarvis", { options: ["Hey Jarvis", "Hey Mycroft"] }),
      "select.updoot_assistant": state("Qwen"),
      "switch.updoot_vs_mute": state("off"),
      "binary_sensor.updoot_alarm_ringing": state("off"),
      "sensor.updoot_next_alarm": state("unknown", { device_class: "timestamp" }),
      "button.updoot_snooze_alarm": state("unknown"),
      "button.updoot_stop_alarm": state("unknown"),
      "button.updoot_restart_app": state("unknown"),
      "button.updoot_restart_device": state("unknown"),
      "light.updoot_led_control_idle": state("off"),
      "select.updoot_led_control_idle_effect": state("Solid", { options: ["Solid", "Breathing"] }),
      "sensor.updoot_battery": state("100", { unit_of_measurement: "%", device_class: "battery" }),
      "binary_sensor.updoot_charging": state("on"),
      "sensor.updoot_cpu_usage": state("10", { unit_of_measurement: "%" }),
      "sensor.updoot_remote_admin": state("http://192.168.0.87:2324"),
      "update.updoot_update": state("on", {
        installed_version: "2026.10.39",
        latest_version: "2026.11.19",
        title: "Kiosk Satellite",
      }),
      "media_player.updoot": state("playing", {
        media_title: "Crossfire",
        media_artist: "Stevie Ray Vaughan",
        entity_picture: "/art.jpg",
      }),
      "sensor.updoot_hidden": state("99", { unit_of_measurement: "%" }),
    };

    const built = buildModel({ deviceId: "dev1", devices, entities, states, alarmScript: true });

    assert.equal(built.media.playerId, "media_player.updoot");
    assert.equal(built.media.favoriteId, "button.updoot_favorite_current_song");
    assert.equal(built.media.title, "Crossfire");
    assert.deepEqual(
      built.volumes.map((volume) => [volume.name, volume.value, volume.step]),
      [
        ["Volume", 67, 1],
        ["Media volume", 47, 5],
        ["Assistant volume", 100, 5],
      ],
    );
    assert.equal(built.voiceSelects.some((item) => item.name === "Wake word" && item.value === "Hey Jarvis"), true);
    assert.equal(built.voiceSwitches.some((item) => item.name === "Mute" && item.on === false), true);
    assert.deepEqual(
      built.actions.map((action) => [action.name, action.confirm]),
      [
        ["Restart app", true],
        ["Restart device", true],
      ],
    );
    assert.equal(built.light?.effectEntityId, "select.updoot_led_control_idle_effect");
    assert.equal(built.light?.effect, "Solid");
    assert.deepEqual(built.light?.effectOptions, ["Solid", "Breathing"]);
    assert.equal(built.header.some((line) => line.name === "Battery"), true);
    assert.equal(built.diagnostics.some((line) => line.name === "Battery"), false);
    assert.deepEqual(
      built.diagnostics.map((line) => line.name),
      ["CPU usage"],
    );
    assert.equal(built.remoteAdmin, "http://192.168.0.87:2324");
    assert.equal(built.updates[0]?.installed, "2026.10.39");
    assert.equal(built.updates[0]?.latest, "2026.11.19");
    assert.equal(built.alarms.scriptAvailable, true);
    assert.equal(built.alarms.kioskName, "Updoot1");
    assert.equal(JSON.stringify(built).includes("sensor.updoot_hidden"), false);
    assert.equal(built.actions.some((action) => action.entityId === "button.updoot_favorite_current_song"), false);

    const expected: SatelliteModel = {
      deviceId: "dev1",
      name: "Updoot1",
      missing: false,
      assistEntityId: "assist_satellite.updoot_assist_satellite",
      assistState: "idle",
      media: {
        playerId: "media_player.updoot",
        favoriteId: "button.updoot_favorite_current_song",
        state: "playing",
        title: "Crossfire",
        artist: "Stevie Ray Vaughan",
        picture: "/art.jpg",
      },
      volumes: [
        { entityId: "number.updoot_volume", name: "Volume", min: 0, max: 100, step: 1, value: 67 },
        { entityId: "number.updoot_media_volume", name: "Media volume", min: 0, max: 100, step: 5, value: 47 },
        { entityId: "number.updoot_assistant_volume", name: "Assistant volume", min: 0, max: 100, step: 5, value: 100 },
      ],
      alarms: {
        nextAlarmId: "sensor.updoot_next_alarm",
        nextAlarm: "unknown",
        ringingId: "binary_sensor.updoot_alarm_ringing",
        ringing: false,
        snoozeId: "button.updoot_snooze_alarm",
        stopId: "button.updoot_stop_alarm",
        scriptAvailable: true,
        kioskName: "Updoot1",
      },
      voiceSelects: [
        {
          entityId: "select.updoot_wake_word",
          name: "Wake word",
          options: ["Hey Jarvis", "Hey Mycroft"],
          value: "Hey Jarvis",
        },
        { entityId: "select.updoot_assistant", name: "Assistant", options: [], value: "Qwen" },
      ],
      voiceSwitches: [{ entityId: "switch.updoot_vs_mute", name: "Mute", on: false }],
      timers: [],
      light: {
        entityId: "light.updoot_led_control_idle",
        name: "LED Control Idle",
        state: "off",
        brightness: null,
        effectEntityId: "select.updoot_led_control_idle_effect",
        effectOptions: ["Solid", "Breathing"],
        effect: "Solid",
      },
      ambient: [],
      header: [
        {
          entityId: "sensor.updoot_battery",
          name: "Battery",
          state: "100",
          unit: "%",
          deviceClass: "battery",
        },
        { entityId: "binary_sensor.updoot_charging", name: "Charging", state: "on" },
      ],
      updates: [
        {
          entityId: "update.updoot_update",
          name: "Update",
          state: "on",
          installed: "2026.10.39",
          latest: "2026.11.19",
          title: "Kiosk Satellite",
        },
      ],
      actions: [
        { entityId: "button.updoot_restart_app", name: "Restart app", confirm: true },
        { entityId: "button.updoot_restart_device", name: "Restart device", confirm: true },
      ],
      remoteAdmin: "http://192.168.0.87:2324",
      settings: [],
      diagnostics: [{ entityId: "sensor.updoot_cpu_usage", name: "CPU usage", state: "10", unit: "%" }],
    };
    assert.deepEqual(built, expected);
  });

  it("pairs Updoot2 with media_player.updoot2", () => {
    const built = model({
      deviceId: "dev2",
      devices: [{ id: "dev2", name: "Updoot2" }],
      entities: [
        entry("assist_satellite.updoot2_assist_satellite", { device_id: "dev2" }),
        entry("media_player.updoot", { device_id: "speaker" }),
        entry("button.updoot_favorite_current_song", { device_id: "speaker" }),
        entry("button.updoot2_favorite_current_song", { device_id: "speaker" }),
      ],
      states: {
        "assist_satellite.updoot2_assist_satellite": state("idle"),
        "media_player.updoot": state("playing", { media_title: "Wrong" }),
        "media_player.updoot2": state("playing", { media_title: "Right", media_artist: "Band" }),
      },
    });
    assert.equal(built.media.playerId, "media_player.updoot2");
    assert.notEqual(built.media.playerId, "media_player.updoot");
    assert.equal(built.media.favoriteId, "button.updoot2_favorite_current_song");
    assert.equal(built.media.title, "Right");
  });

  it("shows the paired media player when it is idle", () => {
    const playerId = "media_player.updoot";
    for (const state of ["idle", "off", "unknown", "unavailable", "playing", "paused", "buffering"]) {
      assert.equal(showNowPlaying(playerId, state), true, state);
    }
    assert.equal(showNowPlaying(undefined, "playing"), false);
    assert.equal(showNowPlaying(undefined, "idle"), false);
  });

  it("returns null for a non-numeric number and marks a missing device", () => {
    const unknown = model({
      deviceId: "dev1",
      devices: [{ id: "dev1", name: "Updoot1" }],
      entities: [
        entry("number.updoot_volume", { device_id: "dev1", original_name: "Volume", entity_category: "config" }),
      ],
      states: { "number.updoot_volume": state("unknown") },
    });
    assert.equal(unknown.volumes[0]?.value, null);
    assert.equal(unknown.missing, false);

    const blank = model({
      deviceId: "dev1",
      devices: [{ id: "dev1", name: "Updoot1" }],
      entities: [
        entry("number.updoot_volume", { device_id: "dev1", original_name: "Volume", entity_category: "config" }),
      ],
      states: { "number.updoot_volume": state("  ") },
    });
    assert.equal(blank.volumes[0]?.value, null);

    const missing = model({
      deviceId: "gone",
      devices: [{ id: "other", name: "Other" }],
      entities: [
        entry("number.gone_volume", { device_id: "gone", original_name: "Volume" }),
      ],
      states: { "number.gone_volume": state("unavailable") },
    });
    assert.equal(missing.missing, true);
    assert.equal(missing.name, "gone");
    assert.equal(missing.alarms.kioskName, "gone");
    assert.equal(missing.volumes[0]?.value, null);
    assert.deepEqual(missing.media, {});
  });

  it("puts Screensaver timeout in settings, not volumes", () => {
    const built = model({
      deviceId: "dev1",
      devices: [{ id: "dev1", name: "Updoot1" }],
      entities: [
        entry("number.updoot_screensaver_brightness", {
          device_id: "dev1",
          original_name: "Screensaver brightness level",
          entity_category: "config",
        }),
        entry("number.updoot_screensaver_timeout", {
          device_id: "dev1",
          original_name: "Screensaver timeout",
          entity_category: "config",
        }),
        entry("number.updoot_intercom_volume", {
          device_id: "dev1",
          original_name: "Intercom volume",
          entity_category: "config",
        }),
        entry("number.updoot_volume", {
          device_id: "dev1",
          original_name: "Volume",
          entity_category: "config",
        }),
        entry("number.updoot_media_volume", {
          device_id: "dev1",
          original_name: "Media volume",
          entity_category: "config",
        }),
        entry("number.updoot_assistant_volume", {
          device_id: "dev1",
          original_name: "Assistant volume",
          entity_category: "config",
        }),
      ],
      states: {
        "number.updoot_screensaver_brightness": state("40"),
        "number.updoot_screensaver_timeout": state("30", { min: 0, max: 120, step: 5 }),
        "number.updoot_intercom_volume": state("15"),
        "number.updoot_volume": state("10"),
        "number.updoot_media_volume": state("20"),
        "number.updoot_assistant_volume": state("30"),
      },
    });
    assert.deepEqual(
      built.volumes.map((volume) => volume.name),
      ["Volume", "Media volume", "Assistant volume", "Intercom volume"],
    );
    assert.deepEqual(
      built.settings.map((item) => item.name),
      ["Screensaver brightness level", "Screensaver timeout"],
    );
    const timeout = built.settings.find((item) => item.name === "Screensaver timeout") as VolumeControl;
    assert.deepEqual(timeout, {
      entityId: "number.updoot_screensaver_timeout",
      name: "Screensaver timeout",
      min: 0,
      max: 120,
      step: 5,
      value: 30,
    });
    assert.equal(built.volumes.some((volume) => volume.name === "Screensaver timeout"), false);
    assert.equal(built.volumes.some((volume) => volume.name === "Screensaver brightness level"), false);
  });

  it("keeps an empty device empty", () => {
    const built = model({
      deviceId: "dev1",
      devices: [{ id: "dev1", name: "Updoot1", name_by_user: null }],
    });
    assert.equal(built.missing, false);
    assert.deepEqual(built.media, {});
    assert.deepEqual(built.volumes, []);
    assert.deepEqual(built.voiceSelects, []);
    assert.deepEqual(built.voiceSwitches, []);
    assert.deepEqual(built.timers, []);
    assert.deepEqual(built.ambient, []);
    assert.deepEqual(built.header, []);
    assert.deepEqual(built.updates, []);
    assert.deepEqual(built.actions, []);
    assert.deepEqual(built.settings, []);
    assert.deepEqual(built.diagnostics, []);
    assert.equal(built.light, undefined);
    assert.equal(built.remoteAdmin, undefined);
    assert.deepEqual(built.alarms, { ringing: false, scriptAvailable: false, kioskName: "Updoot1" });
  });

  it("prefers name_by_user and falls back through name then the object id", () => {
    const named = model({
      deviceId: "dev1",
      devices: [{ id: "dev1", name: "Updoot1", name_by_user: "Kitchen kiosk" }],
    });
    assert.equal(named.name, "Kitchen kiosk");
    assert.equal(named.alarms.kioskName, "Kitchen kiosk");

    const built = model({
      deviceId: "dev1",
      devices: [{ id: "dev1", name: "Updoot1" }],
      entities: [
        entry("number.dev1_original", { device_id: "dev1", original_name: "From original", name: "From name" }),
        entry("switch.dev1_named", { device_id: "dev1", name: "From name" }),
        entry("button.dev1_object_id", { device_id: "dev1" }),
      ],
      states: {
        "number.dev1_original": state("1"),
        "switch.dev1_named": state("on"),
        "button.dev1_object_id": state("unknown"),
      },
    });
    assert.deepEqual(
      built.settings.map((item) => item.name),
      ["From name", "From original"],
    );
    const button = built.actions[0] as ButtonControl;
    assert.equal(button.name, "dev1 object id");
    assert.equal(button.confirm, false);
    assert.equal(built.settings.some((item) => item.entityId === "button.dev1_object_id"), false);
  });

  it("classifies voice, timers, ambient, alarms, and leaves other controls in settings", () => {
    const built = model({
      deviceId: "dev1",
      devices: [{ id: "dev1", name: "Updoot1" }],
      entities: [
        entry("switch.night", { device_id: "dev1", original_name: "Night mode" }),
        entry("switch.vs_extra", { device_id: "dev1", original_name: "VS Extra mode", entity_category: "config" }),
        entry("switch.vs_alpha", { device_id: "dev1", original_name: "VS Alpha", entity_category: "config" }),
        entry("switch.chimes", { device_id: "dev1", original_name: "VS Chimes", entity_category: "config" }),
        entry("switch.intercom", { device_id: "dev1", original_name: "Intercom enabled", entity_category: "config" }),
        entry("select.theme", {
          device_id: "dev1",
          original_name: "Theme",
          entity_category: "config",
        }),
        entry("select.engine", {
          device_id: "dev1",
          original_name: "VS Wake word engine",
          entity_category: "config",
        }),
        entry("number.vs_delay", {
          device_id: "dev1",
          original_name: "VS Delay",
          entity_category: "config",
        }),
        entry("light.accent", { device_id: "dev1", original_name: "Accent", entity_category: "config" }),
        entry("sensor.timers", { device_id: "dev1", original_name: "VS Timers" }),
        entry("sensor.next_timer", { device_id: "dev1", original_name: "VS Next timer" }),
        entry("sensor.noise", { device_id: "dev1", original_name: "Ambient noise" }),
        entry("sensor.light", { device_id: "dev1", original_name: "Ambient light" }),
        entry("sensor.snoozed", { device_id: "dev1", original_name: "Alarm snoozed until" }),
        entry("binary_sensor.ringing", { device_id: "dev1", original_name: "Alarm ringing" }),
        entry("sensor.memory", {
          device_id: "dev1",
          original_name: "Memory",
          entity_category: "diagnostic",
        }),
        entry("sensor.wifi", {
          device_id: "dev1",
          original_name: "WiFi",
          entity_category: "diagnostic",
        }),
        entry("button.ping", { device_id: "dev1", original_name: "Ping" }),
        entry("button.updoot_favorite_current_song", { device_id: "dev1", original_name: "Favorite current song" }),
        entry("assist_satellite.updoot_assist_satellite", { device_id: "dev1" }),
        entry("sensor.admin", {
          device_id: "dev1",
          original_name: "Remote admin",
          entity_category: "diagnostic",
        }),
        entry("number.disabled", {
          device_id: "dev1",
          original_name: "Volume",
          disabled_by: "integration",
        }),
      ],
      states: {
        "switch.night": state("on"),
        "switch.vs_extra": state("off"),
        "switch.vs_alpha": state("on"),
        "switch.chimes": state("on"),
        "switch.intercom": state("off"),
        "select.theme": state("Dark", { options: ["Dark", "Light"] }),
        "select.engine": state("openWakeWord", { options: ["openWakeWord", "microWakeWord"] }),
        "number.vs_delay": state("4", { min: 0, max: 10, step: 1 }),
        "light.accent": state("on", { brightness: 128 }),
        "sensor.timers": state("2", { unit_of_measurement: "", device_class: "duration" }),
        "sensor.next_timer": state("5", { unit_of_measurement: "min" }),
        "sensor.noise": state("20", { unit_of_measurement: "dB", device_class: "sound_pressure" }),
        "sensor.light": state("30", { device_class: "illuminance" }),
        "sensor.snoozed": state("2026-11-14T07:00:00"),
        "binary_sensor.ringing": state("on"),
        "sensor.memory": state("40", { unit_of_measurement: "%" }),
        "sensor.wifi": state("ok"),
        "button.ping": state("unknown"),
        "assist_satellite.updoot_assist_satellite": state("listening"),
        "sensor.admin": state("offline"),
      },
    });

    assert.deepEqual(
      built.voiceSelects.map((item) => item.name),
      ["Wake word engine"],
    );
    assert.equal(built.settings.some((item) => item.name === "VS Delay"), true);
    assert.equal(built.settings.some((item) => item.name === "Delay"), false);
    assert.deepEqual(
      built.voiceSwitches.map((item) => item.name),
      ["Chimes", "Intercom enabled", "Alpha", "Extra mode"],
    );
    const night = built.settings.find((item) => item.name === "Night mode") as SwitchControl;
    assert.equal(night.on, true);
    const theme = built.settings.find((item) => item.name === "Theme") as SelectControl;
    assert.deepEqual(theme.options, ["Dark", "Light"]);
    assert.equal(theme.value, "Dark");
    const accent = built.settings.find((item) => item.name === "Accent") as LightControl;
    assert.equal(accent.brightness, 128);
    assert.equal(accent.effectEntityId, undefined);
    assert.deepEqual(accent.effectOptions, []);
    assert.deepEqual(
      built.timers.map((line) => line.name),
      ["Timers", "Next timer"],
    );
    assert.equal(built.timers[0]?.unit, undefined);
    assert.equal(built.timers[0]?.deviceClass, "duration");
    assert.equal(built.timers[1]?.unit, "min");
    assert.deepEqual(
      built.ambient.map((line) => [line.name, line.deviceClass]),
      [
        ["Ambient light", "illuminance"],
        ["Ambient noise", "sound_pressure"],
      ],
    );
    assert.equal(built.alarms.snoozedUntil, "2026-11-14T07:00:00");
    assert.equal(built.alarms.ringing, true);
    assert.equal(built.remoteAdmin, undefined);
    assert.deepEqual(
      built.diagnostics.map((line) => line.name),
      ["Memory", "WiFi"],
    );
    assert.equal(built.diagnostics.some((line) => line.name === "Remote admin"), false);
    assert.deepEqual(
      built.actions.map((action) => [action.name, action.confirm]),
      [["Ping", false]],
    );
    assert.equal(built.volumes.length, 0);
    assert.equal(built.media.favoriteId, "button.updoot_favorite_current_song");
    assert.equal(built.actions.some((action) => action.entityId === "button.updoot_favorite_current_song"), false);
  });
});

describe("buildModel alarm names", () => {
  it("matches a next alarm whose name is prefixed with the device", () => {
    const prefixed = model({
      deviceId: "dev2",
      devices: [{ id: "dev2", name: "Updoot2" }],
      entities: [
        entry("sensor.updoot2_next_alarm", { device_id: "dev2", name: "Updoot2 Next alarm" }),
        entry("sensor.updoot2_vs_next_timer", { device_id: "dev2", name: "Updoot2 VS Next timer" }),
        entry("binary_sensor.updoot2_alarm_ringing", { device_id: "dev2", name: "Updoot2 Alarm ringing" }),
      ],
      states: {
        "sensor.updoot2_next_alarm": state("2026-11-08T16:00:00+00:00"),
        "sensor.updoot2_vs_next_timer": state("00:10:00"),
        "binary_sensor.updoot2_alarm_ringing": state("off"),
      },
    });
    assert.equal(prefixed.alarms.nextAlarmId, "sensor.updoot2_next_alarm");
    assert.equal(prefixed.alarms.nextAlarm, "2026-11-08T16:00:00+00:00");
    assert.equal(prefixed.alarms.ringingId, "binary_sensor.updoot2_alarm_ringing");
    assert.equal(JSON.stringify(prefixed.alarms).includes("vs_next_timer"), false);

    const fromId = model({
      deviceId: "dev1",
      devices: [{ id: "dev1", name: "Updoot1" }],
      entities: [entry("sensor.updoot_next_alarm", { device_id: "dev1" })],
      states: { "sensor.updoot_next_alarm": state("2026-11-15T16:00:00+00:00") },
    });
    assert.equal(fromId.alarms.nextAlarmId, "sensor.updoot_next_alarm");
  });
});

describe("alarmServiceCall", () => {
  it("sends action and kiosk, plus time, label, and days only when provided", () => {
    assert.deepEqual(alarmServiceCall("list", "Updoot1"), {
      domain: "script",
      service: "kiosk_satellite_alarms",
      data: { action: "list", kiosk: "Updoot1" },
    });
    assert.deepEqual(alarmServiceCall("set", "Updoot1", { time: "06:30" }), {
      domain: "script",
      service: "kiosk_satellite_alarms",
      data: { action: "set", kiosk: "Updoot1", time: "06:30" },
    });
    assert.deepEqual(
      alarmServiceCall("set", "Updoot1", { time: "06:30", label: "Wake", days: ["mon", "fri"] }),
      {
        domain: "script",
        service: "kiosk_satellite_alarms",
        data: { action: "set", kiosk: "Updoot1", time: "06:30", label: "Wake", days: ["mon", "fri"] },
      },
    );
    assert.deepEqual(alarmServiceCall("set", "Updoot1", { time: "", label: "", days: [] }), {
      domain: "script",
      service: "kiosk_satellite_alarms",
      data: { action: "set", kiosk: "Updoot1" },
    });
    assert.deepEqual(alarmServiceCall("turn_off", "Updoot1"), {
      domain: "script",
      service: "kiosk_satellite_alarms",
      data: { action: "turn_off", kiosk: "Updoot1" },
    });
    assert.deepEqual(alarmServiceCall("delete", "Kitchen", { label: "Nap" }), {
      domain: "script",
      service: "kiosk_satellite_alarms",
      data: { action: "delete", kiosk: "Kitchen", label: "Nap" },
    });
  });
});
