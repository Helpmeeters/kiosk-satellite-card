import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SatelliteModel, UpdateControl } from "../src/model";
import {
  compareVersions,
  redisplayUserDataKey,
  tabFromUserData,
  updateIsNewer,
  updatesPending,
  userDataGet,
  userDataSet,
  voiceMute,
} from "../src/redisplay-header";

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

function update(partial: Partial<UpdateControl> = {}): UpdateControl {
  return { entityId: "update.app", name: "Update", state: "off", ...partial };
}

describe("compareVersions", () => {
  it("compares dotted numeric versions component by component", () => {
    assert.equal(compareVersions("1.2.10", "1.2.9"), true);
    assert.equal(compareVersions("1.2.9", "1.2.10"), false);
    assert.equal(compareVersions("1.10", "1.9"), true);
    assert.equal(compareVersions("2", "1.9.9"), true);
    assert.equal(compareVersions("1.2", "1.2.0"), false);
    assert.equal(compareVersions("01.002", "1.2"), false);
    assert.equal(compareVersions("1.2.3", "1.2.3"), false);
  });

  it("refuses missing or non-numeric versions", () => {
    assert.equal(compareVersions(undefined, "1.2.3"), undefined);
    assert.equal(compareVersions("1.2.3", undefined), undefined);
    assert.equal(compareVersions("1.2.3-beta", "1.2.3"), undefined);
    assert.equal(compareVersions("v1.2.3", "1.2.0"), undefined);
    assert.equal(compareVersions("  ", "1"), undefined);
  });
});

describe("updateIsNewer", () => {
  it("uses a greater latest version, and state on only when versions cannot be compared", () => {
    assert.equal(updateIsNewer(update({ installed: "1.2.9", latest: "1.2.10", state: "off" })), true);
    assert.equal(updateIsNewer(update({ installed: "1.2.10", latest: "1.2.9", state: "on" })), false);
    assert.equal(updateIsNewer(update({ installed: "1.2.3", latest: "1.2.3", state: "on" })), false);
    assert.equal(updateIsNewer(update({ state: "on" })), true);
    assert.equal(updateIsNewer(update({ installed: "dev", latest: "1", state: "on" })), true);
    assert.equal(updateIsNewer(update({ installed: "dev", state: "off" })), false);
    assert.equal(
      updatesPending([
        update({ installed: "2", latest: "2", state: "on" }),
        update({ entityId: "update.other", installed: "1.0", latest: "1.0.1", state: "off" }),
      ]),
      true,
    );
    assert.equal(updatesPending([update({ installed: "2", latest: "2", state: "on" })]), false);
  });
});

describe("voiceMute", () => {
  it("finds mute and leaves mute timers alone", () => {
    const found = voiceMute(
      satellite({
        voiceSwitches: [
          { entityId: "switch.timers", name: "Mute timers", on: true },
          { entityId: "switch.vs", name: "VS Mute", on: false },
          { entityId: "switch.chimes", name: "Chimes", on: true },
        ],
      }),
    );
    assert.deepEqual(found, { entityId: "switch.vs", name: "VS Mute", on: false });
    assert.equal(voiceMute(satellite({ voiceSwitches: [{ entityId: "switch.timers", name: "vs mute timers", on: true }] })), undefined);
    assert.equal(voiceMute(satellite()), undefined);
  });
});

describe("user data", () => {
  it("keys one card and device, and reads a real tab from the get_user_data value", () => {
    assert.equal(redisplayUserDataKey("abc"), "kiosk-redisplay:abc");
    assert.deepEqual(userDataGet("abc"), { type: "frontend/get_user_data", key: "kiosk-redisplay:abc" });
    assert.deepEqual(userDataSet("abc", "alarms"), {
      type: "frontend/set_user_data",
      key: "kiosk-redisplay:abc",
      value: { tab: "alarms" },
    });
    assert.equal(tabFromUserData({ value: { tab: "intercom" } }), "intercom");
    assert.equal(tabFromUserData({ value: { tab: "agent" } }), "agent");
    assert.equal(tabFromUserData({ value: null }), undefined);
    assert.equal(tabFromUserData({ value: { tab: "device" } }), undefined);
    assert.equal(tabFromUserData({ value: { tab: "timers" } }), undefined);
    assert.equal(tabFromUserData({}), undefined);
    assert.equal(tabFromUserData(null), undefined);
  });
});
