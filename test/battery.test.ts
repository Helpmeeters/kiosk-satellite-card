import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { batteryFillWidth, batteryMark } from "../src/battery";

describe("batteryMark", () => {
  it("omits the mark when the battery sensor is missing", () => {
    assert.equal(batteryMark([{ name: "Charging", state: "on" }]), undefined);
    assert.equal(batteryMark([]), undefined);
  });

  it("omits the mark when battery is not a percent", () => {
    assert.equal(
      batteryMark([
        { name: "Battery", state: "unknown", deviceClass: "battery" },
        { name: "Charging", state: "on" },
      ]),
      undefined,
    );
  });

  it("describes a full charging battery", () => {
    assert.deepEqual(
      batteryMark([
        { name: "Battery", state: "100.0", unit: "%", deviceClass: "battery" },
        { name: "Charging", state: "on", deviceClass: "battery_charging" },
      ]),
      {
        percent: 100,
        charging: true,
        low: false,
        label: "Battery 100%, charging",
      },
    );
    assert.equal(batteryFillWidth(100), 19.3);
  });

  it("shows a partial battery without a bolt when charging is off", () => {
    const mark = batteryMark([
      { name: "Battery", state: "67.4", deviceClass: "battery" },
      { name: "Charging", state: "off" },
    ]);
    assert.equal(mark?.charging, false);
    assert.equal(mark?.low, false);
    assert.equal(mark?.label, "Battery 67%");
    assert.equal(batteryFillWidth(mark?.percent ?? 0), 13.01);
  });

  it("treats a low battery that is charging as charging, not empty", () => {
    const mark = batteryMark([{ name: "Battery", state: "10", deviceClass: "battery" }, { name: "Charging", state: "on" }]);
    assert.equal(mark?.low, false);
    assert.equal(mark?.charging, true);
  });

  it("marks a low battery when it is not charging", () => {
    const mark = batteryMark([{ name: "Battery", state: "15", deviceClass: "battery" }]);
    assert.equal(mark?.low, true);
    assert.equal(mark?.charging, false);
    assert.equal(mark?.label, "Battery 15%");
    assert.equal(batteryFillWidth(0), 0);
  });
});
