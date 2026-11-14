import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { spansFullWidth, type ColumnRole } from "../src/layout";

const SPAN: ColumnRole[] = [
  "heading",
  "device-name",
  "media",
  "alarm-form",
  "alarm-list",
  "alarm-result",
  "update",
  "restart",
  "remote",
  "diagnostics",
];

const HALF: ColumnRole[] = [
  "header-status",
  "volume",
  "alarm-status",
  "alarm-actions",
  "select",
  "switch",
  "timer",
  "led",
  "brightness",
  "effect",
  "ambient",
  "setting",
];

describe("spansFullWidth", () => {
  it("spans structural rows and leaves controls as one cell", () => {
    for (const role of SPAN) assert.equal(spansFullWidth(role), true, role);
    for (const role of HALF) assert.equal(spansFullWidth(role), false, role);
  });
});
