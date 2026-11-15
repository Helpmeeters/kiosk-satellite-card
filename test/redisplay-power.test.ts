import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import type { SatelliteModel } from "../src/model";
import { buildPower, powerCss, renderPower, type PowerHandlers, type PowerView } from "../src/redisplay-power";

class El {
  className = "";
  type = "";
  hidden = false;
  id = "";
  href = "";
  target = "";
  rel = "";
  children: El[] = [];
  attrs = new Map<string, string>();
  listeners = new Map<string, Array<(event?: Event) => void>>();
  ownerDocument: { addEventListener?: (type: string, listener: (event: Event) => void) => void; removeEventListener?: (type: string, listener: (event: Event) => void) => void } | null = null;
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
    if (name === "href") this.href = value;
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

  addEventListener(type: string, listener: (event?: Event) => void): void {
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

describe("buildPower", () => {
  it("omits the menu when the device has no restart or admin", () => {
    assert.equal(
      buildPower(
        satellite({
          actions: [{ entityId: "button.other", name: "Identify", confirm: false }],
          voiceSwitches: [{ entityId: "switch.chimes", name: "Chimes", on: true }],
        }),
      ),
      undefined,
    );
  });

  it("keeps restart app, restart device, and the admin url, in that order", () => {
    const view = buildPower(
      satellite({
        actions: [
          { entityId: "button.other", name: "Identify", confirm: false },
          { entityId: "button.restart_device", name: "Restart device", confirm: true },
          { entityId: "button.restart_app", name: "VS Restart app", confirm: true },
        ],
        remoteAdmin: "https://example.test/admin",
      }),
    );
    assert.deepEqual(view, {
      actions: [
        { entityId: "button.restart_app", name: "VS Restart app", confirm: true },
        { entityId: "button.restart_device", name: "Restart device", confirm: true },
      ],
      admin: "https://example.test/admin",
    });
  });
});

describe("powerCss", () => {
  it("scopes every rule under an rd-power class", () => {
    const selectors = powerCss
      .split("}")
      .map((block) => block.slice(0, block.indexOf("{")))
      .filter((selector) => selector.includes("."));
    assert.equal(selectors.length > 0, true);
    for (const selector of selectors) assert.match(selector.trim(), /^\.rd-power/);
  });

  it("paints the menu and its rows with the opaque card surface", () => {
    const surface = "var(--card-background-color, var(--primary-background-color, var(--ha-card-background)))";
    const menu = powerCss.slice(powerCss.indexOf(".rd-power-menu {"), powerCss.indexOf(".rd-power-item {"));
    const item = powerCss.slice(powerCss.indexOf(".rd-power-item {"), powerCss.indexOf(".rd-power-item:hover"));
    assert.equal(menu.includes(`background: ${surface}`), true);
    assert.equal(menu.includes("--ha-card-background, var(--card-background-color"), false);
    assert.equal(item.includes(`background: ${surface}`), true);
    assert.equal(item.includes("transparent"), false);
  });
});

describe("renderPower", () => {
  const previousDocument = (globalThis as { document?: unknown }).document;
  const hadDocument = "document" in globalThis;
  (globalThis as { document: { createElement(tag: string): El; createElementNS(_ns: string, tag: string): El } }).document = {
    createElement(tag: string) {
      return new El(tag);
    },
    createElementNS(_ns: string, tag: string) {
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

  function handlers(): { calls: string[]; handlers: PowerHandlers } {
    const calls: string[] = [];
    return {
      calls,
      handlers: {
        onPress: (entityId, confirm, name) => calls.push(`press:${entityId}:${confirm}:${name}`),
      },
    };
  }

  function view(): PowerView {
    return buildPower(
      satellite({
        actions: [
          { entityId: "button.restart_app", name: "Restart app", confirm: true },
          { entityId: "button.restart_device", name: "Restart device", confirm: true },
        ],
        remoteAdmin: "https://example.test/admin",
      }),
    ) as PowerView;
  }

  it("opens a menu of restart app, restart device, and device admin", () => {
    const parent = new El("div");
    const { calls, handlers: on } = handlers();
    renderPower(parent as unknown as HTMLElement, view(), on);
    const button = parent.querySelector(".rd-power-button");
    const menu = parent.querySelector(".rd-power-menu");
    assert.equal(button?.getAttribute("aria-label"), "Power");
    assert.equal(button?.getAttribute("aria-expanded"), "false");
    assert.equal(menu?.hidden, true);
    assert.equal(menu?.getAttribute("role"), "menu");

    button?.click();
    assert.equal(button?.getAttribute("aria-expanded"), "true");
    assert.equal(menu?.hidden, false);
    assert.deepEqual(
      parent.querySelectorAll(".rd-power-item").map((item) => item.textContent),
      ["Restart app", "Restart device", "Device admin"],
    );
    const admin = parent.querySelector(".rd-power-admin");
    assert.equal(admin?.getAttribute("href"), "https://example.test/admin");
    assert.equal(admin?.getAttribute("target"), "_blank");

    parent.querySelectorAll(".rd-power-item")[0]?.click();
    assert.deepEqual(calls, ["press:button.restart_app:true:Restart app"]);
    assert.equal(menu?.hidden, true);

    button?.click();
    parent.querySelectorAll(".rd-power-item")[1]?.click();
    assert.deepEqual(calls[1], "press:button.restart_device:true:Restart device");
    assert.equal(menu?.hidden, true);
  });

  it("keeps the menu open across a name update and drops it when the device has no power actions", () => {
    const parent = new El("div");
    const { handlers: on } = handlers();
    renderPower(parent as unknown as HTMLElement, view(), on);
    parent.querySelector(".rd-power-button")?.click();
    const menu = parent.querySelector(".rd-power-menu");
    const next = view();
    next.actions[0] = { ...next.actions[0], name: "Restart application" };
    renderPower(parent as unknown as HTMLElement, next, on);
    assert.equal(parent.querySelector(".rd-power-menu"), menu);
    assert.equal(menu?.hidden, false);
    assert.equal(parent.querySelectorAll(".rd-power-item")[0]?.textContent, "Restart application");

    renderPower(parent as unknown as HTMLElement, undefined, on);
    assert.equal(parent.children.length, 0);
  });

  it("closes the menu on a pointer outside it and leaves an inside pointer alone", () => {
    const listeners: Array<(event: Event) => void> = [];
    const doc = {
      addEventListener(_type: string, listener: (event: Event) => void) {
        listeners.push(listener);
      },
      removeEventListener(_type: string, listener: (event: Event) => void) {
        const index = listeners.indexOf(listener);
        if (index >= 0) listeners.splice(index, 1);
      },
    };
    const created = document.createElement.bind(document);
    document.createElement = (tag: string) => {
      const node = created(tag);
      node.ownerDocument = doc;
      return node;
    };
    try {
      const parent = new El("div");
      const { handlers: on } = handlers();
      renderPower(parent as unknown as HTMLElement, view(), on);
      const root = parent.querySelector(".rd-power");
      assert.ok(root);
      parent.querySelector(".rd-power-button")?.click();
      assert.equal(parent.querySelector(".rd-power-menu")?.hidden, false);
      assert.equal(listeners.length, 1);
      listeners[0]?.({ composedPath: () => [root] } as Event);
      assert.equal(parent.querySelector(".rd-power-menu")?.hidden, false);
      listeners[0]?.({ composedPath: () => [] } as Event);
      assert.equal(parent.querySelector(".rd-power-menu")?.hidden, true);
    } finally {
      document.createElement = created;
    }
  });
});
