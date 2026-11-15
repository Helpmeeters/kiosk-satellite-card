import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { alarmServiceCall, type SatelliteModel } from "../src/model";
import {
  alarmListFromFailure,
  alarmListFromPayload,
  buildRedisplayAlarms,
  formatAlarmStamp,
  redisplayAlarmServiceCall,
  redisplayAlarmsCss,
  renderRedisplayAlarms,
  type AlarmScriptAction,
  type AlarmScriptExtra,
  type RedisplayAlarmEntry,
  type RedisplayAlarmsCallbacks,
  type RedisplayAlarmsView,
} from "../src/redisplay-alarms";

function satellite(alarms: SatelliteModel["alarms"], extra: Partial<SatelliteModel> = {}): SatelliteModel {
  return {
    deviceId: "dev1",
    name: "Dot",
    missing: false,
    media: {},
    volumes: [],
    alarms,
    voiceSelects: [],
    voiceSwitches: [],
    timers: [],
    ambient: [],
    header: [],
    updates: [],
    actions: [],
    settings: [],
    diagnostics: [],
    ...extra,
  };
}

const quiet = { ringing: false, scriptAvailable: false, kioskName: "Dot" };

function wake(extra: Partial<RedisplayAlarmEntry> = {}): RedisplayAlarmEntry {
  return { time: "06:30", label: "Wake", days: ["mon", "fri"], enabled: true, ...extra };
}

function expectedStamp(state: string): string {
  const date = new Date(state);
  const time = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const day = date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  return `${time} \u00b7 ${day}`;
}

describe("formatAlarmStamp", () => {
  it("renders an ISO timestamp as a clock and a short date", () => {
    const alarmAt = "2026-11-14T13:30:00";
    assert.equal(formatAlarmStamp(alarmAt), expectedStamp(alarmAt));
    assert.equal(formatAlarmStamp(undefined), undefined);
    assert.equal(formatAlarmStamp("unknown"), undefined);
    assert.equal(formatAlarmStamp("none"), undefined);
    assert.equal(formatAlarmStamp("6:30 AM"), undefined);
  });
});

describe("buildRedisplayAlarms", () => {
  const alarmAt = "2026-11-14T13:30:00";

  it("omits the section when the device has no alarm entities and no script", () => {
    assert.equal(buildRedisplayAlarms(satellite(quiet)), undefined);
    assert.equal(
      buildRedisplayAlarms(satellite({ ...quiet, nextAlarm: alarmAt })),
      undefined,
    );
  });

  it("shows the next alarm, snoozed until, and ringing controls from the entities", () => {
    const view = buildRedisplayAlarms(
      satellite({
        ...quiet,
        ringing: true,
        ringingId: "binary_sensor.ringing",
        nextAlarmId: "sensor.next_alarm",
        nextAlarm: alarmAt,
        snoozedUntilId: "sensor.snoozed",
        snoozedUntil: "unknown",
        snoozeId: "button.snooze",
        stopId: "button.stop",
      }),
    );
    assert.ok(view);
    assert.equal(view.ringing, true);
    assert.equal(view.ringingControls, true);
    assert.equal(view.nextAlarm, formatAlarmStamp(alarmAt));
    assert.equal(view.snoozedUntil, undefined);
    assert.equal(view.snoozeId, "button.snooze");
    assert.equal(view.stopId, "button.stop");
    assert.equal(view.script, false);
    assert.deepEqual(view.items, []);
  });

  it("formats a snoozed timestamp and keeps a non-timestamp next alarm", () => {
    const snoozedAt = "2026-11-14T07:05:00";
    const view = buildRedisplayAlarms(
      satellite({
        ...quiet,
        nextAlarmId: "sensor.next_alarm",
        nextAlarm: "Weekdays 6:30",
        snoozedUntilId: "sensor.snoozed",
        snoozedUntil: snoozedAt,
      }),
    );
    assert.equal(view?.nextAlarm, "Weekdays 6:30");
    assert.equal(view?.snoozedUntil, formatAlarmStamp(snoozedAt));
    assert.equal(view?.ringingControls, false);

    const empty = buildRedisplayAlarms(
      satellite({
        ...quiet,
        nextAlarmId: "sensor.next_alarm",
        nextAlarm: "unavailable",
        snoozedUntilId: "sensor.snoozed",
        snoozedUntil: "none",
      }),
    );
    assert.equal(empty?.nextAlarm, "None");
    assert.equal(empty?.snoozedUntil, undefined);
    assert.equal(
      buildRedisplayAlarms(satellite({ ...quiet, nextAlarmId: "sensor.next_alarm", nextAlarm: "none" }))?.nextAlarm,
      "none",
    );
  });

  it("uses the device name for the script and ignores a stale list when the script is absent", () => {
    const listed = {
      error: "offline",
      alarms: [wake()],
    };
    const view = buildRedisplayAlarms(
      satellite({ ringing: false, scriptAvailable: true, kioskName: "Kitchen kiosk" }, { name: "Pretty" }),
      listed,
    );
    assert.equal(view?.kioskName, "Kitchen kiosk");
    assert.equal(view?.script, true);
    assert.equal(view?.error, "offline");
    assert.equal(view?.items.length, 1);
    assert.equal(view?.items[0]?.summary, "06:30 Wake");
    assert.equal(view?.items[0]?.detail, "mon, fri \u00b7 On");
    assert.equal(view?.items[0]?.action, "turn_off");
    assert.equal(view?.items[0]?.next, false);

    const sensorsOnly = buildRedisplayAlarms(satellite({ ...quiet, snoozeId: "button.snooze" }), listed);
    assert.equal(sensorsOnly?.script, false);
    assert.equal(sensorsOnly?.error, undefined);
    assert.deepEqual(sensorsOnly?.items, []);
    assert.equal(sensorsOnly?.snoozeId, "button.snooze");
  });

  it("describes a disabled alarm and copies the day list", () => {
    const days = ["sat"];
    const view = buildRedisplayAlarms(satellite({ ...quiet, scriptAvailable: true }), {
      alarms: [{ time: "22:00", label: "", days, enabled: false }, { time: "", label: "Nap", days: [], enabled: true }],
    });
    assert.equal(view?.items[0]?.summary, "22:00");
    assert.equal(view?.items[0]?.detail, "sat \u00b7 Off");
    assert.equal(view?.items[0]?.action, "turn_on");
    assert.equal(view?.items[1]?.summary, "Nap");
    assert.equal(view?.items[1]?.detail, "On");
    view?.items[0]?.days.push("sun");
    assert.deepEqual(days, ["sat"]);
  });

  it("lists every alarm with the next one first", () => {
    const alarmAt = "2026-11-14T13:30:00";
    const date = new Date(alarmAt);
    const time = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
    const weekdays = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    const weekday = weekdays[date.getDay()];
    const other = weekdays[(date.getDay() + 1) % 7];
    const view = buildRedisplayAlarms(
      satellite({
        ...quiet,
        scriptAvailable: true,
        nextAlarmId: "sensor.next_alarm",
        nextAlarm: alarmAt,
      }),
      {
        alarms: [
          { time, label: "Other day", days: [other], enabled: true },
          { time: "07:00", label: "Early", days: [], enabled: false },
          { time: "1:30 PM", label: "Match", days: [weekday], enabled: true },
        ],
      },
    );
    assert.deepEqual(
      view?.items.map((item) => [item.label, item.next]),
      [
        ["Match", true],
        ["Other day", false],
        ["Early", false],
      ],
    );
  });

  it("shows an alarm that exists but is turned off when the next alarm sensor is unknown", () => {
    const listed = alarmListFromPayload({
      ok: true,
      alarms: [{ time: "10:00", label: "Hermes Alarm", days: "once", on: false }],
    });
    assert.deepEqual(listed.alarms, [{ time: "10:00", label: "Hermes Alarm", days: [], enabled: false }]);
    const view = buildRedisplayAlarms(
      satellite({
        ...quiet,
        scriptAvailable: true,
        kioskName: "Updoot2",
        nextAlarmId: "sensor.updoot2_next_alarm",
        nextAlarm: "unknown",
      }),
      listed,
    );
    assert.ok(view);
    assert.equal(view.nextAlarm, "None");
    assert.equal(view.items.length, 1);
    assert.equal(view.items[0]?.enabled, false);
    assert.equal(view.items[0]?.summary, "10:00 Hermes Alarm");
    assert.equal(view.items[0]?.detail, "Off");
    assert.equal(view.items[0]?.action, "turn_on");
    assert.equal(view.items[0]?.next, false);
    const parent = host();
    paint(parent, view, recorded().callbacks);
    const row = parent.querySelector(".rd-alarms-item-off");
    assert.ok(row);
    assert.equal(row.classList.contains("rd-alarms-item"), true);
    assert.equal(parent.querySelector(".rd-alarms-meta")?.textContent, "Off");
    assert.equal(parent.querySelector('[data-rd-alarms="toggle"]')?.textContent, "Turn on");
    assert.equal(parent.querySelector('[data-rd-alarms="clock"]')?.textContent, "None");
  });

  it("shows a next-alarm timestamp when the script list has no alarm at that time", () => {
    const alarmAt = "2026-11-15T16:00:00+00:00";
    const date = new Date(alarmAt);
    const time = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
    const missing = buildRedisplayAlarms(
      satellite({
        ...quiet,
        scriptAvailable: true,
        nextAlarmId: "sensor.updoot2_next_alarm",
        nextAlarm: alarmAt,
      }),
      { error: "No kiosk answered" },
    );
    assert.equal(missing?.items.length, 1);
    assert.equal(missing?.items[0]?.time, time);
    assert.equal(missing?.items[0]?.label, "");
    assert.deepEqual(missing?.items[0]?.days, []);
    assert.equal(missing?.items[0]?.enabled, true);
    assert.equal(missing?.items[0]?.next, true);

    const listed = buildRedisplayAlarms(
      satellite({
        ...quiet,
        scriptAvailable: true,
        nextAlarmId: "sensor.updoot2_next_alarm",
        nextAlarm: alarmAt,
      }),
      { alarms: [{ time, label: "Hermes Alarm", days: [], enabled: true }] },
    );
    assert.equal(listed?.items.length, 1);
    assert.equal(listed?.items[0]?.label, "Hermes Alarm");
    assert.equal(listed?.items[0]?.next, true);
  });
});

describe("alarm list payload", () => {
  const previous = { error: "old", alarms: [wake()] };

  it("unwraps the script payload and keeps the previous list when no list comes back", () => {
    const cleared = alarmListFromPayload({ ok: true }, previous);
    assert.equal(cleared.error, undefined);
    assert.equal(cleared.alarms, previous.alarms);

    const wrapped = alarmListFromPayload({
      response: { list: [{ label: "Nap", on: false, days: "mon, fri" }] },
      service_response: { error: "ignored" },
    });
    assert.deepEqual(wrapped.alarms, [{ time: "", label: "Nap", days: ["mon", "fri"], enabled: false }]);

    const enabledWins = alarmListFromPayload({
      alarms: [{ time: "06:30", label: "Wake", enabled: true, on: false }, null, { days: ["fri"] }],
    });
    assert.deepEqual(enabledWins.alarms, [{ time: "06:30", label: "Wake", days: [], enabled: true }]);

    const once = alarmListFromPayload({
      alarms: [{ time: "10:00", label: "Hermes Alarm", days: "once", on: true }],
    });
    assert.deepEqual(once.alarms, [{ time: "10:00", label: "Hermes Alarm", days: [], enabled: true }]);
    const weekdays = alarmListFromPayload({
      alarms: [{ time: "09:00", label: "Week", days: ["mon", "tue"], on: true }],
    });
    assert.deepEqual(weekdays.alarms, [{ time: "09:00", label: "Week", days: ["mon", "tue"], enabled: true }]);
  });

  it("surfaces the script error and still stores a list shipped with the failure", () => {
    assert.deepEqual(alarmListFromPayload({ ok: false, error: "   " }), { error: "Alarm request failed" });
    const failed = alarmListFromPayload(
      { response: { ok: false, error: " kiosk offline ", alarms: [{ time: "07:00", label: "Up" }] } },
      previous,
    );
    assert.equal(failed.error, " kiosk offline ");
    assert.deepEqual(failed.alarms, [{ time: "07:00", label: "Up", days: [], enabled: true }]);
    assert.notEqual(failed.alarms, previous.alarms);

    const outer = alarmListFromPayload({ response: { value: 1 }, ok: false, error: "outer" });
    assert.equal(outer.error, "outer");
  });

  it("keeps the alarm list when the script call throws", () => {
    const thrown = alarmListFromFailure(new Error("script down"), previous);
    assert.equal(thrown.error, "script down");
    assert.equal(thrown.alarms, previous.alarms);
    assert.equal(alarmListFromFailure({ message: "denied" }).error, "denied");
    assert.equal(alarmListFromFailure("boom").error, "boom");
    assert.deepEqual(alarmListFromPayload({ ok: true, alarms: [] }, previous).alarms, []);
  });
});

describe("redisplayAlarmServiceCall", () => {
  it("sends the device name as kiosk and drops empty fields", () => {
    assert.deepEqual(redisplayAlarmServiceCall("Updoot1", "list"), alarmServiceCall("list", "Updoot1"));
    assert.deepEqual(
      redisplayAlarmServiceCall("Updoot1", "set", { time: "06:30", label: "", days: [] }),
      alarmServiceCall("set", "Updoot1", { time: "06:30", label: "", days: [] }),
    );
    assert.deepEqual(
      redisplayAlarmServiceCall("Kitchen kiosk", "delete", { label: "Nap" }),
      alarmServiceCall("delete", "Kitchen kiosk", { label: "Nap" }),
    );
  });
});

describe("redisplayAlarmsCss", () => {
  it("scopes every selector under rd-alarms and uses the display tokens", () => {
    const selectors: string[] = [];
    for (const block of redisplayAlarmsCss.split("}")) {
      const selector = block.split("{")[0]?.trim();
      if (!selector) continue;
      for (const part of selector.split(",")) selectors.push(part.trim());
    }
    assert.ok(selectors.length > 0);
    assert.ok(selectors.every((selector) => selector.startsWith(".rd-alarms")));
    for (const token of ["--primary-text-color", "--secondary-text-color", "--primary-color", "--error-color", "--divider-color"]) {
      assert.equal(redisplayAlarmsCss.includes(`var(${token}`), true, token);
    }
    assert.equal(redisplayAlarmsCss.includes("grid-template-columns"), false);
    assert.equal(redisplayAlarmsCss.includes("padding: 16px 16px 18px"), true);
    assert.match(redisplayAlarmsCss, /\.rd-alarms-card\s*\{[^}]*padding:\s*10px/);
    assert.equal(redisplayAlarmsCss.includes("position: fixed"), false);
    assert.equal(redisplayAlarmsCss.includes("::backdrop"), false);
  });
});

class FakeElement {
  className = "";
  textContent = "";
  hidden = false;
  value = "";
  checked = false;
  type = "";
  children: FakeElement[] = [];
  readonly attributes = new Map<string, string>();
  private readonly listeners = new Map<string, Array<() => void>>();
  readonly dataset: { [key: string]: string };

  constructor(readonly tagName: string) {
    const attributes = this.attributes;
    this.dataset = new Proxy({} as { [key: string]: string }, {
      get(_target, prop) {
        if (typeof prop !== "string") return undefined;
        return attributes.get(dataName(prop)) ?? "";
      },
      set(_target, prop, value) {
        if (typeof prop !== "string") return false;
        attributes.set(dataName(prop), String(value));
        return true;
      },
    });
  }

  get classList(): { contains(name: string): boolean; toggle(name: string, force?: boolean): boolean } {
    const element = this;
    return {
      contains(name: string) {
        return element.className.split(/\s+/).filter(Boolean).includes(name);
      },
      toggle(name: string, force?: boolean) {
        const names = element.className.split(/\s+/).filter(Boolean);
        const has = names.includes(name);
        const on = force === undefined ? !has : force;
        const next = on ? (has ? names : [...names, name]) : names.filter((item) => item !== name);
        element.className = next.join(" ");
        return on;
      },
    };
  }

  get firstElementChild(): FakeElement | null {
    return this.children[0] ?? null;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  append(...nodes: FakeElement[]): void {
    for (const node of nodes) this.children.push(node);
  }

  replaceChildren(...nodes: FakeElement[]): void {
    this.children = [];
    this.append(...nodes);
  }

  addEventListener(type: string, listener: () => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  click(): void {
    for (const listener of this.listeners.get("click") ?? []) listener();
  }

  querySelector(selector: string): FakeElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector: string): FakeElement[] {
    const found: FakeElement[] = [];
    const visit = (node: FakeElement) => {
      for (const child of node.children) {
        if (child.matches(selector)) found.push(child);
        visit(child);
      }
    };
    visit(this);
    return found;
  }

  matches(selector: string): boolean {
    const attr = /^\[([^=\]]+)(?:="([^"]*)")?\]$/.exec(selector);
    if (attr) {
      const actual = this.attributes.get(attr[1]);
      if (actual === undefined) return false;
      return attr[2] === undefined || actual === attr[2];
    }
    if (selector.startsWith(".")) return this.className.split(/\s+/).includes(selector.slice(1));
    return false;
  }
}

function dataName(prop: string): string {
  return `data-${prop.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
}

function installDocument(): void {
  if (typeof document !== "undefined") return;
  (globalThis as { document: { createElement(tag: string): FakeElement } }).document = {
    createElement(tag: string) {
      return new FakeElement(tag);
    },
  };
}

installDocument();

function host(): FakeElement {
  return new FakeElement("div");
}

function recorded(): {
  presses: string[];
  scripts: Array<{ action: AlarmScriptAction; extra?: AlarmScriptExtra }>;
  errors: string[];
  callbacks: RedisplayAlarmsCallbacks;
} {
  const presses: string[] = [];
  const scripts: Array<{ action: AlarmScriptAction; extra?: AlarmScriptExtra }> = [];
  const errors: string[] = [];
  return {
    presses,
    scripts,
    errors,
    callbacks: {
      onPress(entityId) {
        presses.push(entityId);
      },
      onScript(action, extra) {
        scripts.push({ action, extra });
      },
      onError(message) {
        errors.push(message);
      },
    },
  };
}

function paint(parent: FakeElement, view: RedisplayAlarmsView, callbacks: RedisplayAlarmsCallbacks): void {
  renderRedisplayAlarms(parent as unknown as HTMLElement, view, callbacks);
}

describe("renderRedisplayAlarms", () => {
  const alarmAt = "2026-11-14T13:30:00";

  it("draws the entity section and presses snooze and stop", () => {
    const view = buildRedisplayAlarms(
      satellite({
        ...quiet,
        ringing: true,
        ringingId: "binary_sensor.ringing",
        nextAlarmId: "sensor.next_alarm",
        nextAlarm: alarmAt,
        snoozedUntilId: "sensor.snoozed",
        snoozedUntil: alarmAt,
        snoozeId: "button.snooze",
        stopId: "button.stop",
      }),
    );
    assert.ok(view);
    const parent = host();
    const seen = recorded();
    paint(parent, view, seen.callbacks);
    assert.equal(parent.querySelector(".rd-alarms-heading")?.textContent, "Alarms");
    assert.equal(parent.querySelector(".rd-alarms-kicker")?.textContent, "Next alarm");
    assert.equal(parent.querySelector('[data-rd-alarms="clock"]')?.textContent, formatAlarmStamp(alarmAt));
    assert.equal(parent.querySelector('[data-rd-alarms="snoozed"]')?.textContent, `Snoozed until ${formatAlarmStamp(alarmAt)}`);
    assert.equal(parent.querySelector('[data-rd-alarms="snoozed"]')?.hidden, false);
    assert.equal(parent.querySelector('[data-rd-alarms="banner"]')?.hidden, false);
    assert.equal(parent.querySelector('[data-rd-alarms="time"]'), null);
    assert.equal(parent.querySelector('[data-rd-alarms="add"]'), null);
    assert.equal(parent.querySelector('[data-rd-alarms="dialog"]'), null);
    parent.querySelector('[data-rd-alarms="snooze"]')?.click();
    parent.querySelector('[data-rd-alarms="stop"]')?.click();
    assert.deepEqual(seen.presses, ["button.snooze", "button.stop"]);
    assert.deepEqual(seen.scripts, []);
  });

  it("shows a ringing banner without buttons when only the sensor exists", () => {
    const view = buildRedisplayAlarms(
      satellite({ ...quiet, ringing: false, ringingId: "binary_sensor.ringing", nextAlarmId: "sensor.next_alarm", nextAlarm: "unknown" }),
    );
    assert.ok(view);
    const parent = host();
    paint(parent, view, recorded().callbacks);
    const banner = parent.querySelector('[data-rd-alarms="banner"]');
    const clock = parent.querySelector('[data-rd-alarms="clock"]');
    assert.equal(banner?.hidden, true);
    assert.equal(parent.querySelector('[data-rd-alarms="snooze"]'), null);
    assert.equal(clock?.textContent, "None");
    assert.equal(clock?.classList.contains("rd-alarms-clock-empty"), true);
  });

  it("loads the list, then adds, toggles, and deletes through the script callbacks", () => {
    const view = buildRedisplayAlarms(satellite({ ...quiet, scriptAvailable: true, kioskName: "Updoot1" }), {
      alarms: [wake({ enabled: false }), wake({ time: "22:00", label: "Bed", days: ["sun"], enabled: true })],
    });
    assert.ok(view);
    const parent = host();
    const seen = recorded();
    paint(parent, view, seen.callbacks);
    assert.equal(parent.querySelector('[data-rd-alarms="list"]'), null);
    const dialog = parent.querySelector('[data-rd-alarms="dialog"]');
    const listed = parent.querySelector('[data-rd-alarms="items"]');
    assert.equal(dialog?.hidden, true);
    assert.equal(listed?.children[listed.children.length - 1]?.textContent, "Add");
    parent.querySelector('[data-rd-alarms="add"]')?.click();
    assert.equal(dialog?.hidden, false);

    parent.querySelector('[data-rd-alarms="set"]')?.click();
    assert.deepEqual(seen.errors, ["Time is required"]);
    assert.equal(parent.querySelector('[data-rd-alarms="error"]')?.textContent, "Time is required");
    assert.equal(dialog?.hidden, false);

    const time = parent.querySelector('[data-rd-alarms="time"]');
    const label = parent.querySelector('[data-rd-alarms="label"]');
    assert.ok(time && label);
    time.value = "06:30:00";
    label.value = "  Wake  ";
    const boxes = parent.querySelectorAll("[data-rd-alarms-day]");
    assert.equal(boxes.length, 7);
    boxes[0].checked = true;
    boxes[4].checked = true;
    parent.querySelector('[data-rd-alarms="set"]')?.click();
    assert.equal(dialog?.hidden, true);
    assert.equal(parent.querySelector('[data-rd-alarms="set"]')?.className.includes("rd-alarms-button-primary"), true);

    const toggles = parent.querySelectorAll('[data-rd-alarms="toggle"]');
    const deletes = parent.querySelectorAll('[data-rd-alarms="delete"]');
    assert.equal(toggles[0]?.textContent, "Turn on");
    assert.equal(toggles[1]?.textContent, "Turn off");
    assert.equal(deletes[0]?.className.includes("rd-alarms-button-danger"), true);
    toggles[0]?.click();
    deletes[1]?.click();
    paint(parent, view, seen.callbacks);

    assert.deepEqual(seen.scripts, [
      { action: "list", extra: undefined },
      { action: "set", extra: { time: "06:30", label: "Wake", days: ["mon", "fri"] } },
      { action: "turn_on", extra: { time: "06:30", label: "Wake", days: ["mon", "fri"] } },
      { action: "delete", extra: { time: "22:00", label: "Bed", days: ["sun"] } },
    ]);
  });

  it("emphasizes the next alarm and keeps Add at the end of the list", () => {
    const alarmAt = "2026-11-14T13:30:00";
    const date = new Date(alarmAt);
    const time = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
    const view = buildRedisplayAlarms(
      satellite({
        ...quiet,
        scriptAvailable: true,
        kioskName: "Updoot1",
        nextAlarmId: "sensor.next_alarm",
        nextAlarm: alarmAt,
      }),
      {
        alarms: [
          wake({ time: "07:00", label: "Early" }),
          wake({ time, label: "Soon", days: [] }),
        ],
      },
    );
    assert.ok(view);
    assert.equal(view.items[0]?.next, true);
    const parent = host();
    paint(parent, view, recorded().callbacks);
    assert.equal(parent.querySelector('[data-rd-alarms="next"]')?.hidden, true);
    const emphasized = parent.querySelector(".rd-alarms-item-next");
    assert.equal(emphasized?.querySelector(".rd-alarms-kicker")?.textContent, "Next");
    assert.equal(emphasized?.querySelector(".rd-alarms-item-time")?.textContent, formatAlarmStamp(alarmAt));
    assert.equal(parent.querySelectorAll(".rd-alarms-item").length, 2);
  });

  it("repaints the clock, banner, and error without clearing the form", () => {
    const first = buildRedisplayAlarms(
      satellite({
        ...quiet,
        scriptAvailable: true,
        ringing: false,
        ringingId: "binary_sensor.ringing",
        nextAlarmId: "sensor.next_alarm",
        nextAlarm: "unknown",
        snoozeId: "button.snooze",
      }),
    );
    assert.ok(first);
    const parent = host();
    const seen = recorded();
    paint(parent, first, seen.callbacks);
    const label = parent.querySelector('[data-rd-alarms="label"]');
    assert.ok(label);
    label.value = "Kitchen";

    const next = buildRedisplayAlarms(
      satellite({
        ...quiet,
        scriptAvailable: true,
        ringing: true,
        ringingId: "binary_sensor.ringing",
        nextAlarmId: "sensor.next_alarm",
        nextAlarm: alarmAt,
        snoozedUntilId: "sensor.snoozed",
        snoozedUntil: alarmAt,
        snoozeId: "button.snooze",
      }),
      { error: "nope" },
    );
    assert.ok(next);
    paint(parent, next, seen.callbacks);
    assert.equal(parent.children.length, 1);
    assert.equal(label.value, "Kitchen");
    assert.equal(parent.querySelector('[data-rd-alarms="clock"]')?.textContent, formatAlarmStamp(alarmAt));
    assert.equal(parent.querySelector('[data-rd-alarms="clock"]')?.classList.contains("rd-alarms-clock-empty"), false);
    assert.equal(parent.querySelector('[data-rd-alarms="banner"]')?.hidden, false);
    assert.equal(parent.querySelector('[data-rd-alarms="snoozed"]')?.hidden, false);
    assert.equal(parent.querySelector('[data-rd-alarms="error"]')?.textContent, "nope");

    const quietNext = buildRedisplayAlarms(
      satellite({
        ...quiet,
        scriptAvailable: true,
        ringingId: "binary_sensor.ringing",
        nextAlarmId: "sensor.next_alarm",
        nextAlarm: alarmAt,
        snoozeId: "button.snooze",
      }),
    );
    assert.ok(quietNext);
    paint(parent, quietNext, seen.callbacks);
    assert.equal(label.value, "Kitchen");
    assert.equal(parent.querySelector('[data-rd-alarms="banner"]')?.hidden, true);
    assert.equal(parent.querySelector('[data-rd-alarms="error"]')?.hidden, true);
    assert.equal(parent.querySelector('[data-rd-alarms="snoozed"]')?.hidden, true);
  });
});
