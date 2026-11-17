import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import type { SatelliteModel, SensorLine, SwitchControl } from "../src/model";
import { formatClock } from "../src/redisplay";
import {
  assistStem,
  buildTimers,
  renderTimers,
  timerCancelService,
  timerListFromFailure,
  timerListFromPayload,
  timerListService,
  timerStartData,
  timerStartService,
  timersCss,
  type TimerStart,
  type TimersView,
} from "../src/redisplay-timers";

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

function sensor(entityId: string, name: string, state: string, extra: Partial<SensorLine> = {}): SensorLine {
  return { entityId, name, state, ...extra };
}

function toggle(entityId: string, name: string, on: boolean): SwitchControl {
  return { entityId, name, on };
}

class DomNode {
  className = "";
  textContent: string | null = null;
  type = "";
  value = "";
  hidden = false;
  children: DomNode[] = [];
  private readonly attrs = new Map<string, string>();
  private readonly listeners = new Map<string, Array<() => void>>();

  constructor(readonly tagName: string) {}

  setAttribute(name: string, value: string): void {
    this.attrs.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attrs.get(name) ?? null;
  }

  append(...nodes: DomNode[]): void {
    this.children.push(...nodes);
  }

  replaceChildren(...nodes: DomNode[]): void {
    this.children = [...nodes];
  }

  addEventListener(type: string, listener: () => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  click(): void {
    for (const listener of this.listeners.get("click") ?? []) listener();
  }

  querySelector(selector: string): DomNode | null {
    return this.queryAll(selector)[0] ?? null;
  }

  private queryAll(selector: string): DomNode[] {
    const matches: DomNode[] = [];
    const walk = (node: DomNode): void => {
      const raw = typeof node.className === "string" ? node.className : (node.getAttribute("class") ?? "");
      if (raw.split(/\s+/).includes(selector.slice(1))) matches.push(node);
      for (const child of node.children) walk(child);
    };
    for (const child of this.children) walk(child);
    return matches;
  }
}

function classNames(node: DomNode): string[] {
  const names = node.className.split(/\s+/).filter(Boolean);
  return names.concat(node.children.flatMap(classNames));
}

function textOf(node: DomNode): string {
  return [node.textContent ?? "", ...node.children.map(textOf)].join(" ");
}

describe("buildTimers", () => {
  it("omits the section when the device has no timer entities", () => {
    const view = buildTimers(
      satellite({
        voiceSwitches: [
          toggle("switch.mute_timers", "Mute timers", true),
          toggle("switch.chimes", "Chimes", true),
          toggle("switch.mute", "Mute", false),
        ],
        settings: [toggle("switch.settings_mute", "Mute timers", true)],
      }),
    );
    assert.equal(view, undefined);
  });

  it("shows the next timer in large type and the count underneath", () => {
    const view = buildTimers(
      satellite({
        timers: [
          sensor("sensor.timers", "Timers", "2", { deviceClass: "duration" }),
          sensor("sensor.next", "Next timer", "5", { unit: "min" }),
        ],
        voiceSwitches: [
          toggle("switch.mute", "Mute", true),
          toggle("switch.chimes", "Chimes", true),
          toggle("switch.mute_timers", "Mute timers", false),
          toggle("switch.gate", "Noise gate", true),
        ],
      }),
    );
    assert.equal(view?.headline, "5 min");
    assert.equal(view?.detail, "2 timers");
    assert.deepEqual(view?.count, { entityId: "sensor.timers", name: "Timers", text: "2 timers", value: 2 });
    assert.deepEqual(view?.next, { entityId: "sensor.next", name: "Next timer", text: "5 min" });
    assert.deepEqual(view?.mute, { entityId: "switch.mute_timers", name: "Mute timers", on: false });
  });

  it("uses a singular count and keeps a duration that already includes its unit", () => {
    const one = buildTimers(satellite({ timers: [sensor("sensor.timers", "Timers", "1")] }));
    assert.equal(one?.headline, "1 timer");
    assert.equal(one?.detail, undefined);
    assert.equal(one?.mute, undefined);

    const baked = buildTimers(satellite({ timers: [sensor("sensor.next", "Next timer", "5 min")] }));
    assert.equal(baked?.headline, "5 min");
    assert.equal(baked?.detail, undefined);
  });

  it("counts timers when the next one is not scheduled", () => {
    const view = buildTimers(
      satellite({
        timers: [
          sensor("sensor.timers", " Timers ", "2"),
          sensor("sensor.next", "Next timer", "unknown"),
        ],
      }),
    );
    assert.equal(view?.headline, "2 timers");
    assert.equal(view?.detail, undefined);
    assert.equal(view?.next?.text, "");
  });

  it("says there are no timers when the sensors are empty", () => {
    for (const state of ["", "unknown", "unavailable", "none", "null", " None "]) {
      const view = buildTimers(satellite({ timers: [sensor("sensor.next", "Next timer", state)] }));
      assert.equal(view?.headline, "No timers", state);
    }

    const counted = buildTimers(
      satellite({
        timers: [
          sensor("sensor.timers", "Timers", "0"),
          sensor("sensor.next", "Next timer", "unavailable"),
        ],
      }),
    );
    assert.equal(counted?.headline, "No timers");
    assert.equal(counted?.count?.value, 0);
    assert.equal(counted?.detail, undefined);
  });

  it("does not contradict a scheduled timer with a zero count", () => {
    const view = buildTimers(
      satellite({
        timers: [
          sensor("sensor.timers", "Timers", "0"),
          sensor("sensor.next", "Next timer", "5", { unit: "min" }),
        ],
      }),
    );
    assert.equal(view?.headline, "5 min");
    assert.equal(view?.detail, undefined);
  });

  it("shows a timestamp as a clock time", () => {
    const iso = "2026-11-14T13:30:00";
    const view = buildTimers(
      satellite({ timers: [sensor("sensor.next", "Next timer", iso, { deviceClass: "timestamp" })] }),
    );
    assert.equal(view?.headline, formatClock(iso));
    assert.notEqual(view?.headline, iso);
  });

  it("keeps the mute switch off the section unless it is the mute-timers switch", () => {
    const view = buildTimers(
      satellite({
        timers: [sensor("sensor.timers", "Timers", "2")],
        voiceSwitches: [toggle("switch.mute", "Mute", true)],
        settings: [toggle("switch.settings_mute", "Mute timers", true)],
      }),
    );
    assert.equal(view?.headline, "2 timers");
    assert.equal(view?.mute, undefined);
  });

  it("shows a timer sensor the count and next names do not cover", () => {
    const view = buildTimers(satellite({ timers: [sensor("sensor.left", "Timer left", "30", { unit: "s" })] }));
    assert.equal(view?.headline, "30 s");
    assert.equal(view?.detail, "Timer left");
  });
});

describe("timersCss", () => {
  it("matches the alarm column: uppercase heading, emphasized next time, and iconic header actions", () => {
    const selectors = timersCss.split("}").map((block) => block.split("{")[0] ?? "");
    const classNames = selectors.flatMap((selector) => [...selector.matchAll(/\.([A-Za-z_][\w-]*)/g)].map((match) => match[1] ?? ""));
    assert.ok(classNames.length > 0);
    assert.ok(classNames.every((name) => name.startsWith("rd-timers")));
    assert.match(timersCss, /\.rd-timers\s*\{[^}]*display:\s*flex/);
    assert.match(timersCss, /\.rd-timers\s*\{[^}]*padding:\s*16px 16px 18px/);
    assert.match(timersCss, /\.rd-timers-label\s*\{[^}]*text-transform:\s*uppercase/);
    assert.match(timersCss, /\.rd-timers-headline-next\s*\{[^}]*font-size:\s*1\.5rem/);
    assert.match(timersCss, /\.rd-timers-icon-button\s*\{[^}]*width:\s*32px/);
    assert.match(timersCss, /var\(--primary-text-color\)/);
    assert.match(timersCss, /var\(--secondary-text-color\)/);
    assert.match(timersCss, /var\(--primary-color\)/);
    assert.equal(timersCss.includes("grid-template-columns"), false);
  });
});

describe("renderTimers", () => {
  const previousDocument = (globalThis as { document?: unknown }).document;
  const hadDocument = "document" in globalThis;

  (globalThis as { document: { createElement(tag: string): DomNode } }).document = {
    createElement(tag: string) {
      return new DomNode(tag);
    },
  };

  after(() => {
    if (hadDocument) {
      (globalThis as { document?: unknown }).document = previousDocument;
      return;
    }
    delete (globalThis as { document?: unknown }).document;
  });

  function mount(
    view: TimersView,
    onMute?: (entityId: string, on: boolean) => void,
    onStart?: (start: TimerStart) => void,
  ): DomNode {
    const parent = new DomNode("div");
    renderTimers(parent as unknown as HTMLElement, view, onMute, onStart);
    return parent;
  }

  function view(): TimersView {
    return buildTimers(
      satellite({
        timers: [
          sensor("sensor.timers", "Timers", "2"),
          sensor("sensor.next", "Next timer", "5 min"),
        ],
        voiceSwitches: [
          toggle("switch.chimes", "Chimes", true),
          toggle("switch.mute_timers", "Mute timers", false),
        ],
      }),
    ) as TimersView;
  }

  it("fills the parent with the timer readout and replaces it on the next render", () => {
    const parent = mount(view());
    assert.equal(parent.children.length, 1);
    assert.equal(parent.querySelector(".rd-timers")?.getAttribute("aria-label"), "Timers");
    assert.equal(parent.querySelector(".rd-timers-label")?.textContent, "Timers");
    assert.equal(parent.querySelector(".rd-timers-kicker")?.textContent, "Next");
    assert.equal(parent.querySelector(".rd-timers-kicker")?.hidden, false);
    assert.equal(parent.querySelector(".rd-timers-headline")?.textContent, "5 min");
    assert.equal(parent.querySelector(".rd-timers-headline")?.className.includes("rd-timers-headline-next"), true);
    assert.equal(parent.querySelector(".rd-timers-detail")?.textContent, "2 timers");
    assert.equal(parent.querySelector(".rd-timers-detail")?.hidden, false);
    assert.equal(parent.querySelector(".rd-timers-head")?.querySelector(".rd-timers-switch")?.getAttribute("aria-label"), "Mute timers");
    assert.equal(parent.querySelector(".rd-timers-add"), null);
    assert.equal(classNames(parent).every((name) => name.startsWith("rd-timers")), true);
    assert.equal(textOf(parent).includes("Chimes"), false);

    const idle = buildTimers(satellite({ timers: [sensor("sensor.timers", "Timers", "0")] })) as TimersView;
    renderTimers(parent as unknown as HTMLElement, idle);
    assert.equal(parent.children.length, 1);
    assert.equal(parent.querySelector(".rd-timers-headline")?.textContent, "No timers");
    assert.equal(parent.querySelector(".rd-timers-headline")?.className.includes("rd-timers-headline-empty"), true);
    assert.equal(parent.querySelector(".rd-timers-kicker")?.hidden, true);
    assert.equal(parent.querySelector(".rd-timers-detail")?.hidden, true);
    assert.equal(parent.querySelector(".rd-timers-switch"), null);
  });

  it("handles SVG children whose className is an SVGAnimatedString", () => {
    const doc = (globalThis as { document: { createElementNS?: (ns: string, tag: string) => unknown } }).document;
    const prevNs = doc.createElementNS;
    doc.createElementNS = (_ns: string, tag: string) => {
      const node = new DomNode(tag) as unknown as { className: unknown };
      node.className = { baseVal: "", animVal: "" };
      return node;
    };
    try {
      const parent = mount(view(), undefined, () => undefined);
      assert.equal(parent.querySelector(".rd-timers-headline")?.textContent, "5 min");
      assert.equal(parent.querySelector(".rd-timers-add")?.getAttribute("aria-label"), "Add timer");
    } finally {
      if (prevNs) doc.createElementNS = prevNs;
      else delete doc.createElementNS;
    }
  });

  it("tells the host the next mute state and leaves other switches alone", () => {
    const calls: Array<[string, boolean]> = [];
    const parent = mount(view(), (entityId, on) => calls.push([entityId, on]));
    const button = parent.querySelector(".rd-timers-switch");
    assert.ok(button);
    assert.equal(button?.getAttribute("aria-checked"), "false");
    assert.equal(button?.getAttribute("data-entity"), "switch.mute_timers");
    assert.equal(button?.className.includes("rd-timers-switch-on"), false);

    button?.click();
    assert.deepEqual(calls, [["switch.mute_timers", true]]);
    assert.equal(button?.getAttribute("aria-checked"), "true");
    assert.equal(button?.className.includes("rd-timers-switch-on"), true);

    button?.click();
    assert.deepEqual(calls, [
      ["switch.mute_timers", true],
      ["switch.mute_timers", false],
    ]);
    assert.equal(button?.getAttribute("aria-checked"), "false");
  });

  it("opens a dialog and starts a timer from hours, minutes, and seconds", () => {
    const starts: TimerStart[] = [];
    const parent = mount(view(), undefined, (start) => starts.push(start));
    assert.equal(parent.querySelector(".rd-timers-head")?.querySelector(".rd-timers-add")?.getAttribute("aria-label"), "Add timer");
    parent.querySelector(".rd-timers-add")?.click();
    assert.equal(parent.querySelector(".rd-timers-dialog")?.hidden, false);
    parent.querySelector(".rd-timers-set")?.click();
    assert.equal(parent.querySelector(".rd-timers-error")?.textContent, "Time is required");
    assert.equal(parent.querySelector(".rd-timers-error")?.hidden, false);
    const hours = parent.querySelector(".rd-timers-hours");
    const minutes = parent.querySelector(".rd-timers-minutes");
    const seconds = parent.querySelector(".rd-timers-seconds");
    const name = parent.querySelector(".rd-timers-name");
    assert.ok(hours && minutes && seconds && name);
    assert.equal(hours.value, "");
    assert.equal(minutes.value, "");
    assert.equal(seconds.value, "");
    assert.equal(hours.placeholder, "0");
    assert.equal(minutes.placeholder, "0");
    assert.equal(seconds.placeholder, "0");
    minutes.value = "5";
    name.value = "Eggs";
    parent.querySelector(".rd-timers-set")?.click();
    assert.deepEqual(starts, [{ name: "Eggs", hours: 0, minutes: 5, seconds: 0 }]);
    assert.equal(parent.querySelector(".rd-timers-dialog")?.hidden, true);
    assert.equal(minutes.value, "");
  });

  it("parses vs_list_timers payloads and renders countdown rows with delete buttons", () => {
    const parsed = timerListFromPayload({
      response: {
        timers: [
          {
            timer_id: "t1",
            name: "Eggs",
            total_seconds: 600,
            seconds_left: 569,
            is_active: true,
            ends_at: "2026-11-17T02:56:54.000Z",
            finished: false,
          },
          {
            timer_id: "t2",
            name: "Steep",
            total_seconds: 180,
            seconds_left: 95,
            is_active: false,
            finished: false,
          },
        ],
      },
    });
    assert.equal(parsed.timers?.length, 2);
    const failed = timerListFromFailure(new Error("timeout"), parsed);
    assert.equal(failed.error, "timeout");
    assert.equal(failed.timers?.length, 2);

    const nowMs = Date.parse("2026-11-17T02:50:00.000Z");
    const built = buildTimers(
      satellite({ timers: [sensor("sensor.timers", "Timers", "2")] }),
      undefined,
      parsed,
      nowMs,
    );
    assert.ok(built);
    assert.deepEqual(built.items, [
      { timerId: "t1", displayTime: "6:54", name: "Eggs", detail: "" },
      { timerId: "t2", displayTime: "1:35", name: "Steep", detail: "Paused" },
    ]);

    const cancelled: string[] = [];
    const parent = new DomNode("div");
    renderTimers(parent as unknown as HTMLElement, built, undefined, undefined, (id) => cancelled.push(id));
    assert.equal(parent.querySelector(".rd-timers-row")?.hidden, true);
    const rows = parent.querySelector(".rd-timers-rows")?.children ?? [];
    assert.equal(rows.length, 2);
    assert.equal(rows[0]?.querySelector(".rd-timers-item-time")?.textContent, "6:54");
    assert.equal(rows[0]?.querySelector(".rd-timers-item-label")?.textContent, "Eggs");
    assert.equal(rows[1]?.querySelector(".rd-timers-item-meta")?.textContent, "Paused");
    const del0 = rows[0]?.querySelector(".rd-timers-delete");
    assert.ok(del0);
    del0.click();
    assert.deepEqual(cancelled, ["t1"]);
  });
});

describe("timer start service", () => {
  const fields = { name: {}, hours: {}, minutes: {}, seconds: {} };
  const services = {
    esphome: {
      ks_updoot_vs_start_timer: { fields },
      ks_updoot2_vs_start_timer: { fields },
      ks_updoot_vs_list_timers: { fields: {} },
      ks_updoot_announce: { fields: { message: {} } },
    },
  };

  it("uses the assist satellite stem to pick that device's vs_start_timer", () => {
    assert.equal(assistStem("assist_satellite.updoot_assist_satellite"), "updoot");
    assert.equal(assistStem("assist_satellite.updoot2_assist_satellite"), "updoot2");
    assert.equal(assistStem(undefined), undefined);
    assert.equal(timerStartService(services, "updoot"), "ks_updoot_vs_start_timer");
    assert.equal(timerStartService(services, "updoot2"), "ks_updoot2_vs_start_timer");
    assert.equal(timerStartService(services, "kitchen"), undefined);
    assert.equal(timerStartService(undefined, "updoot"), undefined);
  });

  it("rejects a zero duration and fills an empty label", () => {
    assert.equal(timerStartData({ name: "Eggs", hours: 0, minutes: 0, seconds: 0 }), undefined);
    assert.deepEqual(timerStartData({ name: "  ", hours: 1, minutes: 0, seconds: 0 }), {
      name: "Timer",
      hours: 1,
      minutes: 0,
      seconds: 0,
    });
    assert.deepEqual(timerStartData({ name: "Eggs", hours: 0, minutes: 2.2, seconds: -4 }), {
      name: "Eggs",
      hours: 0,
      minutes: 2,
      seconds: 0,
    });
  });

  it("discovers vs_list_timers and vs_cancel_timer for the device stem", () => {
    const allServices = {
      esphome: {
        ...services.esphome,
        ks_updoot_vs_cancel_timer: { fields: { timer_id: {} } },
        ks_updoot2_vs_list_timers: { fields: {} },
        ks_updoot2_vs_cancel_timer: { fields: { timer_id: {} } },
      },
    };
    assert.equal(timerListService(allServices, "updoot"), "ks_updoot_vs_list_timers");
    assert.equal(timerListService(allServices, "updoot2"), "ks_updoot2_vs_list_timers");
    assert.equal(timerCancelService(allServices, "updoot"), "ks_updoot_vs_cancel_timer");
    assert.equal(timerCancelService(allServices, "updoot2"), "ks_updoot2_vs_cancel_timer");
  });
});
