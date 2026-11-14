import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import type { SatelliteModel } from "../src/model";
import { buildDevice, deviceCss, renderDevice, type DeviceHandlers, type DeviceView } from "../src/redisplay-device";

class El {
  className = "";
  type = "";
  hidden = false;
  open = false;
  children: El[] = [];
  attrs = new Map<string, string>();
  listeners = new Map<string, Array<() => void>>();
  private ownText = "";

  constructor(readonly tagName: string) {}

  get textContent(): string {
    if (this.children.length > 0) return this.children.map((child) => child.textContent).join("");
    return this.ownText;
  }

  set textContent(value: string) {
    this.ownText = value;
    this.children = [];
  }

  setAttribute(name: string, value: string): void {
    this.attrs.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attrs.get(name) ?? null;
  }

  append(...nodes: El[]): void {
    this.children.push(...nodes);
  }

  replaceChildren(...nodes: El[]): void {
    this.children = [...nodes];
    this.ownText = "";
  }

  addEventListener(type: string, listener: () => void): void {
    const list = this.listeners.get(type) ?? [];
    list.push(listener);
    this.listeners.set(type, list);
  }

  click(): void {
    for (const listener of this.listeners.get("click") ?? []) listener();
  }

  querySelector(selector: string): El | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector: string): El[] {
    const found: El[] = [];
    const visit = (node: El): void => {
      for (const child of node.children) {
        if (child.matches(selector)) found.push(child);
        visit(child);
      }
    };
    visit(this);
    return found;
  }

  matches(selector: string): boolean {
    if (selector.startsWith(".")) {
      const classes = this.className.split(/\s+/).filter(Boolean);
      return selector
        .slice(1)
        .split(".")
        .every((name) => classes.includes(name));
    }
    return this.tagName.toLowerCase() === selector.toLowerCase();
  }
}

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

describe("buildDevice", () => {
  it("omits the section when the device has nothing for it", () => {
    assert.equal(
      buildDevice(
        satellite({
          light: {
            entityId: "light.led",
            name: "LED Control Idle",
            state: "off",
            brightness: null,
            effectOptions: [],
          },
          ambient: [{ entityId: "sensor.lux", name: "Ambient light", state: "10", unit: "lx" }],
        }),
      ),
      undefined,
    );
  });

  it("keeps updates, confirmable restarts, the admin link, and diagnostics", () => {
    const view = buildDevice(
      satellite({
        updates: [{ entityId: "update.app", name: "Update", state: "on", installed: "1", latest: "2", title: "App" }],
        actions: [
          { entityId: "button.restart_app", name: "Restart app", confirm: true },
          { entityId: "button.restart_device", name: "Restart device", confirm: true },
          { entityId: "button.other", name: "Identify", confirm: false },
        ],
        remoteAdmin: "https://example.test/admin",
        diagnostics: [{ entityId: "sensor.battery", name: "Battery", state: "100", unit: "%" }],
      }),
    );
    assert.equal(view?.updates[0]?.title, "App");
    assert.equal(view?.actions[0]?.confirm, true);
    assert.equal(view?.actions[2]?.confirm, false);
    assert.equal(view?.remoteAdmin, "https://example.test/admin");
    assert.equal(view?.diagnostics[0]?.name, "Battery");
  });
});

describe("deviceCss", () => {
  it("scopes every rule under an rd-device class", () => {
    const selectors = deviceCss
      .split("}")
      .map((block) => block.slice(0, block.indexOf("{")))
      .filter((selector) => selector.includes("."));
    assert.equal(selectors.length > 0, true);
    for (const selector of selectors) assert.match(selector.trim(), /^\.rd-device/);
  });
});

describe("renderDevice", () => {
  const previousDocument = (globalThis as { document?: unknown }).document;
  const hadDocument = "document" in globalThis;
  (globalThis as { document: { createElement(tag: string): El } }).document = {
    createElement(tag: string) {
      return new El(tag);
    },
  };
  after(() => {
    if (hadDocument) {
      (globalThis as { document?: unknown }).document = previousDocument;
      return;
    }
    delete (globalThis as { document?: unknown }).document;
  });

  const handlers = (): { calls: string[]; handlers: DeviceHandlers } => {
    const calls: string[] = [];
    return {
      calls,
      handlers: {
        onInstall: (entityId) => calls.push(`install:${entityId}`),
        onPress: (entityId, confirm, name) => calls.push(`press:${entityId}:${confirm}:${name}`),
      },
    };
  };

  function view(state = "on"): DeviceView {
    return buildDevice(
      satellite({
        updates: [{ entityId: "update.app", name: "Update", state, installed: "1.0", latest: "1.1", title: "App" }],
        actions: [
          { entityId: "button.restart_app", name: "Restart app", confirm: true },
          { entityId: "button.other", name: "Identify", confirm: false },
        ],
        remoteAdmin: "https://example.test/admin",
        diagnostics: [{ entityId: "sensor.ip", name: "IPv4 address", state: "192.168.0.87" }],
      }),
    ) as DeviceView;
  }

  it("shows Install, asks before restart, and keeps diagnostics collapsed", () => {
    const parent = new El("div");
    const { calls, handlers: on } = handlers();
    renderDevice(parent as unknown as HTMLElement, view(), on);
    assert.equal(parent.querySelector(".rd-device-label")?.textContent, "Device");
    assert.equal(parent.querySelector(".rd-device-install")?.hidden, false);
    assert.equal(parent.querySelector(".rd-device-installed")?.textContent, "Installed 1.0");
    assert.equal(parent.querySelector(".rd-device-link")?.getAttribute("href"), "https://example.test/admin");
    assert.equal(parent.querySelector(".rd-device-link")?.getAttribute("target"), "_blank");
    assert.equal(parent.querySelector("details")?.open, false);
    assert.equal(parent.querySelector(".rd-device-value")?.textContent, "192.168.0.87");

    parent.querySelector(".rd-device-install")?.click();
    parent.querySelectorAll(".rd-device-action")[0]?.click();
    parent.querySelectorAll(".rd-device-action")[1]?.click();
    assert.deepEqual(calls, [
      "install:update.app",
      "press:button.restart_app:true:Restart app",
      "press:button.other:false:Identify",
    ]);
  });

  it("hides Install when the update is not available and keeps the diagnostics element", () => {
    const parent = new El("div");
    const { handlers: on } = handlers();
    renderDevice(parent as unknown as HTMLElement, view("on"), on);
    const details = parent.querySelector("details");
    assert.ok(details);
    details.open = true;
    renderDevice(parent as unknown as HTMLElement, view("off"), on);
    assert.equal(parent.querySelector("details"), details);
    assert.equal(details.open, true);
    assert.equal(parent.querySelector(".rd-device-install")?.hidden, true);
    assert.equal(parent.querySelector(".rd-device-installed")?.hidden, true);
  });
});
