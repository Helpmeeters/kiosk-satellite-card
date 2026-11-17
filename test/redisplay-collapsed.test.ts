import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SatelliteModel } from "../src/model";
import { buildRedisplay, formatClock } from "../src/redisplay";
import {
  buildAssistActionConfig,
  buildCollapsedView,
  isTileExpandEvent,
  isTitleBarToggleEvent,
  resolveAssistPipelineId,
} from "../src/redisplay-collapsed";

function satellite(partial: Partial<SatelliteModel> = {}): SatelliteModel {
  return {
    deviceId: "dev1",
    name: "Updoot1",
    missing: false,
    media: {},
    volumes: [],
    alarms: { ringing: false, scriptAvailable: false, kioskName: "Updoot1" },
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

describe("buildCollapsedView", () => {
  it("builds Now Playing with play state, playerId, and album art", () => {
    const model = satellite({
      media: {
        playerId: "media_player.updoot1",
        state: "playing",
        title: "Track One",
        picture: "/api/media_player_proxy/media_player.updoot1?token=abc",
      },
    });
    const view = buildRedisplay(model, { state: "playing", title: "Track One", picture: model.media.picture }, 1000);
    const collapsed = buildCollapsedView(model, view);

    assert.equal(collapsed.now.playerId, "media_player.updoot1");
    assert.equal(collapsed.now.playing, true);
    assert.equal(collapsed.now.picture, "/api/media_player_proxy/media_player.updoot1?token=abc");
    assert.equal(collapsed.now.title, "Track One");
  });

  it("picks the earliest trigger between next alarm, snoozed alarm, and next timer", () => {
    const nowMs = Date.parse("2026-11-16T20:30:00+00:00");
    const earlierTimer = "2026-11-16T20:35:00+00:00";
    const laterAlarm = "2026-11-16T21:00:00+00:00";
    const modelTimerFirst = satellite({
      alarms: { ringing: false, scriptAvailable: false, kioskName: "Updoot1", nextAlarm: laterAlarm },
      timers: [{ entityId: "sensor.next_timer", name: "Next timer", state: earlierTimer }],
    });
    const viewTimerFirst = buildRedisplay(modelTimerFirst, undefined, nowMs);
    const collapsedTimerFirst = buildCollapsedView(modelTimerFirst, viewTimerFirst, undefined, nowMs);
    assert.equal(collapsedTimerFirst.alarms.kind, "timer");
    assert.equal(collapsedTimerFirst.alarms.kicker, "Next timer");
    assert.equal(collapsedTimerFirst.alarms.value, "5:00");

    const earlierAlarm = "2026-11-16T20:30:00+00:00";
    const modelAlarmFirst = satellite({
      alarms: { ringing: false, scriptAvailable: false, kioskName: "Updoot1", nextAlarm: earlierAlarm },
      timers: [{ entityId: "sensor.next_timer", name: "Next timer", state: laterAlarm }],
    });
    const viewAlarmFirst = buildRedisplay(modelAlarmFirst, undefined, 1000);
    const collapsedAlarmFirst = buildCollapsedView(modelAlarmFirst, viewAlarmFirst);
    assert.equal(collapsedAlarmFirst.alarms.kind, "alarm");
    assert.equal(collapsedAlarmFirst.alarms.kicker, "Next alarm");
    assert.equal(collapsedAlarmFirst.alarms.value, formatClock(earlierAlarm));

    const earlierSnooze = "2026-11-16T20:25:00+00:00";
    const modelSnoozeFirst = satellite({
      alarms: {
        ringing: false,
        scriptAvailable: false,
        kioskName: "Updoot1",
        nextAlarm: earlierAlarm,
        snoozedUntil: earlierSnooze,
      },
      timers: [{ entityId: "sensor.next_timer", name: "Next timer", state: laterAlarm }],
    });
    const viewSnoozeFirst = buildRedisplay(modelSnoozeFirst, undefined, 1000);
    const collapsedSnoozeFirst = buildCollapsedView(modelSnoozeFirst, viewSnoozeFirst);
    assert.equal(collapsedSnoozeFirst.alarms.kind, "snoozed");
    assert.equal(collapsedSnoozeFirst.alarms.kicker, "Snoozed");
    assert.equal(collapsedSnoozeFirst.alarms.value, formatClock(earlierSnooze));
  });

  it("shows Ringing when an alarm is ringing, and None when nothing is scheduled", () => {
    const ringingModel = satellite({
      alarms: { ringing: true, scriptAvailable: false, kioskName: "Updoot1", nextAlarm: "2026-11-16T20:30:00+00:00" },
    });
    const ringingCollapsed = buildCollapsedView(ringingModel, buildRedisplay(ringingModel, undefined, 1000));
    assert.equal(ringingCollapsed.alarms.kind, "ringing");
    assert.equal(ringingCollapsed.alarms.value, "Ringing");

    const emptyModel = satellite();
    const emptyCollapsed = buildCollapsedView(emptyModel, buildRedisplay(emptyModel, undefined, 1000));
    assert.equal(emptyCollapsed.alarms.kind, "none");
    assert.equal(emptyCollapsed.alarms.value, "None");
  });

  it("builds the 4 intercom mode buttons and falls back to disabled buttons when absent", () => {
    const model = satellite({
      voiceSwitches: [{ entityId: "switch.intercom_enabled", name: "Intercom enabled", on: true }],
      voiceSelects: [
        {
          entityId: "select.intercom_answer_mode",
          name: "Intercom answer mode",
          options: ["Ring", "Answer automatically", "Do not disturb"],
          value: "Answer automatically",
        },
      ],
    });
    const collapsed = buildCollapsedView(model, buildRedisplay(model, undefined, 1000));
    assert.deepEqual(
      collapsed.intercom.buttons.map((b) => [b.id, b.selected, b.disabled]),
      [
        ["off", false, false],
        ["ring", false, false],
        ["answer", true, false],
        ["dnd", false, false],
      ],
    );

    const absent = buildCollapsedView(satellite(), buildRedisplay(satellite(), undefined, 1000));
    assert.deepEqual(
      absent.intercom.buttons.map((b) => [b.id, b.selected, b.disabled]),
      [
        ["off", false, true],
        ["ring", false, true],
        ["answer", false, true],
        ["dnd", false, true],
      ],
    );
  });

  it("displays the primary wake word and ignores wake word 2", () => {
    const model = satellite({
      voiceSelects: [
        { entityId: "select.ww2", name: "Wake word 2", options: ["Alexa"], value: "Alexa" },
        { entityId: "select.ww1", name: "Wake word", options: ["Okay Nabu", "Hey Jarvis"], value: "Okay Nabu" },
      ],
    });
    const collapsed = buildCollapsedView(model, buildRedisplay(model, undefined, 1000));
    assert.equal(collapsed.agent.kicker, "Wake word");
    assert.equal(collapsed.agent.wakeWord, "Okay Nabu");

    const missingModel = satellite({
      voiceSelects: [{ entityId: "select.ww1", name: "Wake word", options: ["Okay Nabu"], value: "unavailable" }],
    });
    const missingCollapsed = buildCollapsedView(missingModel, buildRedisplay(missingModel, undefined, 1000));
    assert.equal(missingCollapsed.agent.wakeWord, "—");
    assert.equal(missingCollapsed.agent.assistant, undefined);
  });

  it("captures the primary assistant and ignores assistant 2", () => {
    const model = satellite({
      voiceSelects: [
        { entityId: "select.a2", name: "Assistant 2", options: ["Qwen"], value: "Qwen" },
        { entityId: "select.a1", name: "Assistant", options: ["preferred", "Jev", "Qwen"], value: "Jev" },
      ],
    });
    const collapsed = buildCollapsedView(model, buildRedisplay(model, undefined, 1000));
    assert.equal(collapsed.agent.assistant, "Jev");
  });
});

describe("resolveAssistPipelineId", () => {
  const pipelines = [
    { id: "pipe-qwen", name: "Qwen" },
    { id: "pipe-jev", name: "Jev" },
  ];

  it("matches the configured assistant name to its pipeline id", () => {
    assert.equal(resolveAssistPipelineId("Jev", pipelines, "pipe-qwen"), "pipe-jev");
    assert.equal(resolveAssistPipelineId("jev", pipelines, "pipe-qwen"), "pipe-jev");
  });

  it("uses preferred_pipeline when assistant is preferred", () => {
    assert.equal(resolveAssistPipelineId("preferred", pipelines, "pipe-qwen"), "pipe-qwen");
    assert.equal(resolveAssistPipelineId("preferred", pipelines, null), undefined);
  });

  it("returns undefined for missing or unknown assistants", () => {
    assert.equal(resolveAssistPipelineId(undefined, pipelines, "pipe-qwen"), undefined);
    assert.equal(resolveAssistPipelineId("unavailable", pipelines, "pipe-qwen"), undefined);
    assert.equal(resolveAssistPipelineId("Other", pipelines, "pipe-qwen"), undefined);
  });
});

describe("buildAssistActionConfig", () => {
  it("includes pipeline_id when resolved and omits it otherwise", () => {
    assert.deepEqual(buildAssistActionConfig("pipe-jev"), {
      tap_action: { action: "assist", pipeline_id: "pipe-jev" },
    });
    assert.deepEqual(buildAssistActionConfig(undefined), {
      tap_action: { action: "assist" },
    });
  });
});

describe("isTitleBarToggleEvent", () => {
  it("toggles when clicking title text, battery, or header background", () => {
    const title = { tagName: "H2", dataset: { part: "name" } } as unknown as EventTarget;
    const battery = { tagName: "DIV", dataset: { part: "battery" } } as unknown as EventTarget;
    const header = { tagName: "HEADER", dataset: {} } as unknown as EventTarget;
    assert.equal(isTitleBarToggleEvent([title, header]), true);
    assert.equal(isTitleBarToggleEvent([battery, header]), true);
    assert.equal(isTitleBarToggleEvent([header]), true);
  });

  it("does not toggle when clicking an icon button or tool control", () => {
    const svg = { tagName: "svg", dataset: {} } as unknown as EventTarget;
    const muteBtn = { tagName: "BUTTON", dataset: { part: "mute" } } as unknown as EventTarget;
    const masterHost = { tagName: "DIV", dataset: { part: "master" } } as unknown as EventTarget;
    const infoHost = { tagName: "DIV", dataset: { part: "info" } } as unknown as EventTarget;
    const powerHost = { tagName: "DIV", dataset: { part: "power" } } as unknown as EventTarget;
    const header = { tagName: "HEADER", dataset: {} } as unknown as EventTarget;

    assert.equal(isTitleBarToggleEvent([svg, muteBtn, header]), false);
    assert.equal(isTitleBarToggleEvent([masterHost, header]), false);
    assert.equal(isTitleBarToggleEvent([infoHost, header]), false);
    assert.equal(isTitleBarToggleEvent([powerHost, header]), false);
  });
});

describe("isTileExpandEvent", () => {
  it("expands when clicking tile background or text outside an internal button", () => {
    const span = { tagName: "SPAN" } as unknown as EventTarget;
    const tile = { tagName: "DIV" } as unknown as EventTarget;
    assert.equal(isTileExpandEvent([span, tile]), true);
    assert.equal(isTileExpandEvent([tile]), true);
  });

  it("does not expand when clicking an internal button or its svg", () => {
    const svg = { tagName: "svg" } as unknown as EventTarget;
    const button = { tagName: "BUTTON" } as unknown as EventTarget;
    const tile = { tagName: "DIV" } as unknown as EventTarget;
    assert.equal(isTileExpandEvent([svg, button, tile]), false);
    assert.equal(isTileExpandEvent([button, tile]), false);
  });
});
