import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SatelliteModel } from "../src/model";
import {
  buildIntercom,
  intercomCss,
  renderIntercom,
  type IntercomSelectChange,
  type IntercomSwitchChange,
  type IntercomView,
} from "../src/redisplay-intercom";

class El {
  readonly tagName: string;
  className = "";
  type = "";
  value = "";
  disabled = false;
  children: El[] = [];
  dataset: Record<string, string> = {};
  attrs = new Map<string, string>();
  listeners = new Map<string, Array<() => void>>();
  private ownText = "";

  constructor(tag: string) {
    this.tagName = tag.toUpperCase();
  }

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
    for (const node of nodes) this.children.push(node);
  }

  replaceChildren(...nodes: El[]): void {
    this.children = [];
    this.ownText = "";
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

  change(): void {
    for (const listener of this.listeners.get("change") ?? []) listener();
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

const documentStub = {
  createElement(tag: string): El {
    return new El(tag);
  },
};

(globalThis as { document: typeof documentStub }).document = documentStub;

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

function host(): El {
  return new El("div");
}

function absentAnswer() {
  return {
    name: "Intercom answer mode",
    options: [] as string[],
    value: "",
    disabled: true,
  };
}

function render(parent: El, view: IntercomView | undefined, onSwitch: IntercomSwitchChange = () => undefined): void {
  renderIntercom(parent as unknown as HTMLElement, view, onSwitch);
}

describe("buildIntercom", () => {
  it("omits the section when the device has no intercom switches, volume, or answer mode", () => {
    const view = buildIntercom(
      satellite({
        voiceSwitches: [{ entityId: "switch.mute", name: "Mute", on: true }],
        volumes: [
          {
            entityId: "number.media",
            name: "Media volume",
            min: 0,
            max: 100,
            step: 1,
            value: 15,
          },
        ],
        diagnostics: [
          { entityId: "sensor.intercom", name: "Intercom", state: "ringing" },
          { entityId: "sensor.intercom_kiosk", name: "Intercom kiosk", state: "Kitchen" },
        ],
        settings: [
          {
            entityId: "select.theme",
            name: "Theme",
            options: ["Dark", "Light"],
            value: "Dark",
          },
        ],
      }),
    );
    assert.equal(view, undefined);
  });

  it("uses the answer mode select when that entity is present", () => {
    const options = ["Ring", "Answer automatically", "Do not disturb"];
    const view = buildIntercom(
      satellite({
        settings: [
          {
            entityId: "select.answer",
            name: "Intercom answer mode",
            options,
            value: "Ring",
          },
        ],
      }),
    );
    assert.deepEqual(view, {
      switches: [],
      answer: {
        entityId: "select.answer",
        name: "Intercom answer mode",
        options,
        value: "Ring",
        disabled: false,
      },
    });
  });

  it("prefers a voice answer mode select and does not keep unknown as the selection", () => {
    const view = buildIntercom(
      satellite({
        voiceSelects: [
          {
            entityId: "select.voice",
            name: "  Intercom answer mode  ",
            options: ["Ring", "Answer automatically", "Do not disturb"],
            value: "unknown",
          },
        ],
        settings: [
          {
            entityId: "select.settings",
            name: "Intercom answer mode",
            options: ["Ring"],
            value: "Ring",
          },
        ],
      }),
    );
    assert.deepEqual(view?.answer, {
      entityId: "select.voice",
      name: "  Intercom answer mode  ",
      options: ["Ring", "Answer automatically", "Do not disturb"],
      value: "",
      disabled: false,
    });
  });

  it("keeps answer mode disabled with no selection when the select is absent", () => {
    const view = buildIntercom(
      satellite({
        voiceSwitches: [{ entityId: "switch.enabled", name: "Intercom enabled", on: false }],
      }),
    );
    assert.deepEqual(view, {
      switches: [{ entityId: "switch.enabled", name: "Intercom enabled", on: false }],
      answer: absentAnswer(),
    });
    assert.equal(view?.volume, undefined);
  });

  it("keeps intercom volume when the device has no intercom switches", () => {
    const view = buildIntercom(
      satellite({
        volumes: [
          {
            entityId: "number.intercom_volume",
            name: "Intercom volume",
            min: 0,
            max: 100,
            step: 5,
            value: 60,
          },
        ],
      }),
    );
    assert.deepEqual(view, {
      switches: [],
      volume: {
        entityId: "number.intercom_volume",
        name: "Intercom volume",
        min: 0,
        max: 100,
        step: 5,
        value: 60,
      },
      answer: absentAnswer(),
    });
  });

  it("reads enabled and do not disturb from the voice switches, enabled first", () => {
    const view = buildIntercom(
      satellite({
        voiceSwitches: [
          { entityId: "switch.dnd", name: "Intercom do not disturb", on: false },
          { entityId: "switch.mute", name: "Mute", on: true },
          { entityId: "switch.enabled", name: "  Intercom enabled  ", on: true },
        ],
      }),
    );
    assert.deepEqual(view, {
      switches: [
        { entityId: "switch.enabled", name: "  Intercom enabled  ", on: true },
        { entityId: "switch.dnd", name: "Intercom do not disturb", on: false },
      ],
      answer: absentAnswer(),
    });
  });

  it("keeps a section when only one intercom switch exists", () => {
    const view = buildIntercom(
      satellite({
        voiceSwitches: [{ entityId: "switch.dnd", name: "INTERCOM DO NOT DISTURB", on: true }],
      }),
    );
    assert.deepEqual(view, {
      switches: [{ entityId: "switch.dnd", name: "INTERCOM DO NOT DISTURB", on: true }],
      answer: absentAnswer(),
    });
  });

  it("uses a settings switch when the voice list does not have it", () => {
    const view = buildIntercom(
      satellite({
        settings: [{ entityId: "switch.enabled", name: "Intercom enabled", on: false }],
      }),
    );
    assert.deepEqual(view, {
      switches: [{ entityId: "switch.enabled", name: "Intercom enabled", on: false }],
      answer: absentAnswer(),
    });
  });

  it("prefers the voice switch over a settings switch of the same name", () => {
    const view = buildIntercom(
      satellite({
        voiceSwitches: [{ entityId: "switch.voice", name: "Intercom enabled", on: true }],
        settings: [{ entityId: "switch.settings", name: "Intercom enabled", on: false }],
      }),
    );
    assert.equal(view?.switches[0]?.entityId, "switch.voice");
    assert.equal(view?.switches[0]?.on, true);
  });
});

describe("renderIntercom", () => {
  it("clears the parent when there is no section", () => {
    const parent = host();
    render(parent, {
      switches: [{ entityId: "switch.enabled", name: "Intercom enabled", on: true }],
    });
    assert.equal(parent.querySelector(".rd-intercom") !== null, true);
    render(parent, undefined);
    assert.equal(parent.children.length, 0);
  });

  it("shows the switch names and On or Off in large rows", () => {
    const parent = host();
    render(parent, {
      switches: [
        { entityId: "switch.enabled", name: "Intercom enabled", on: true },
        { entityId: "switch.dnd", name: "Intercom do not disturb", on: false },
      ],
    });
    const section = parent.querySelector(".rd-intercom");
    assert.equal(section?.tagName, "SECTION");
    assert.equal(section?.getAttribute("aria-label"), "Intercom");
    assert.equal(parent.querySelector(".rd-intercom-label"), null);
    const buttons = parent.querySelectorAll(".rd-intercom-switch");
    assert.equal(buttons.length, 2);
    assert.equal(buttons[0]?.querySelector(".rd-intercom-name")?.textContent, "Intercom enabled");
    assert.equal(buttons[0]?.querySelector(".rd-intercom-value")?.textContent, "On");
    assert.equal(buttons[0]?.getAttribute("aria-checked"), "true");
    assert.equal(buttons[0]?.dataset.entity, "switch.enabled");
    assert.equal(buttons[1]?.querySelector(".rd-intercom-name")?.textContent, "Intercom do not disturb");
    assert.equal(buttons[1]?.querySelector(".rd-intercom-value")?.textContent, "Off");
    assert.equal(buttons[1]?.getAttribute("aria-checked"), "false");
    const text = parent.textContent;
    assert.equal(text.includes("ringing"), false);
    assert.equal(text.includes("Kitchen"), false);
    assert.equal(text.includes("idle"), false);
  });

  it("calls switch.turn_on or switch.turn_off with the entity target", () => {
    const parent = host();
    const calls: Array<Parameters<IntercomSwitchChange>> = [];
    const onSwitch: IntercomSwitchChange = (domain, service, data, target) => {
      calls.push([domain, service, data, target]);
    };
    render(parent, {
      switches: [
        { entityId: "switch.enabled", name: "Intercom enabled", on: true },
        { entityId: "switch.dnd", name: "Intercom do not disturb", on: false },
      ],
    }, onSwitch);
    const buttons = parent.querySelectorAll(".rd-intercom-switch");
    buttons[1]?.click();
    buttons[0]?.click();
    buttons[1]?.click();
    assert.deepEqual(calls, [
      ["switch", "turn_on", undefined, { entity_id: "switch.dnd" }],
      ["switch", "turn_off", undefined, { entity_id: "switch.enabled" }],
      ["switch", "turn_off", undefined, { entity_id: "switch.dnd" }],
    ]);
    assert.equal(buttons[0]?.getAttribute("aria-checked"), "false");
    assert.equal(buttons[0]?.querySelector(".rd-intercom-value")?.textContent, "Off");
    assert.equal(buttons[1]?.getAttribute("aria-checked"), "false");
    assert.equal(buttons[0]?.className.includes("rd-intercom-switch-on"), false);
    assert.equal(buttons[1]?.className.includes("rd-intercom-switch-on"), false);
  });

  it("calls select.select_option with the chosen answer mode", () => {
    const parent = host();
    const calls: Array<Parameters<IntercomSelectChange>> = [];
    renderIntercom(
      parent as unknown as HTMLElement,
      {
        switches: [
          { entityId: "switch.enabled", name: "Intercom enabled", on: true },
          { entityId: "switch.dnd", name: "Intercom do not disturb", on: false },
        ],
        answer: {
          entityId: "select.answer",
          name: "Intercom answer mode",
          options: ["Ring", "Answer automatically", "Do not disturb"],
          value: "Answer automatically",
          disabled: false,
        },
      },
      () => undefined,
      undefined,
      (domain, service, data, target) => {
        calls.push([domain, service, data, target]);
      },
    );
    const section = parent.querySelector(".rd-intercom");
    assert.deepEqual(
      section?.children.map((child) => child.className),
      ["rd-intercom-switch rd-intercom-switch-on", "rd-intercom-field", "rd-intercom-switch"],
    );
    const select = parent.querySelector(".rd-intercom-select");
    assert.equal(select?.disabled, false);
    assert.equal(select?.dataset.entity, "select.answer");
    assert.equal(select?.getAttribute("aria-label"), "Intercom answer mode");
    assert.equal(select?.value, "Answer automatically");
    assert.deepEqual(
      select?.querySelectorAll("option").map((node) => node.textContent),
      ["Ring", "Answer automatically", "Do not disturb"],
    );
    assert.equal(parent.querySelector(".rd-intercom-select-name")?.textContent, "Intercom answer mode");
    assert.equal(parent.querySelector(".rd-intercom-mark")?.getAttribute("aria-hidden"), "true");
    assert.ok(select);
    select.value = "Do not disturb";
    select.change();
    assert.deepEqual(calls, [
      ["select", "select_option", { option: "Do not disturb" }, { entity_id: "select.answer" }],
    ]);
  });

  it("renders answer mode disabled, with no selection, when the select is absent", () => {
    const parent = host();
    const calls: Array<Parameters<IntercomSelectChange>> = [];
    renderIntercom(
      parent as unknown as HTMLElement,
      {
        switches: [{ entityId: "switch.enabled", name: "Intercom enabled", on: false }],
        answer: absentAnswer(),
      },
      () => undefined,
      undefined,
      (domain, service, data, target) => {
        calls.push([domain, service, data, target]);
      },
    );
    const select = parent.querySelector(".rd-intercom-select");
    assert.equal(parent.querySelector(".rd-intercom-field")?.className.includes("rd-intercom-field-disabled"), true);
    assert.equal(parent.querySelector(".rd-intercom-select-name")?.textContent, "Intercom answer mode");
    assert.equal(select?.getAttribute("aria-label"), "Intercom answer mode");
    assert.equal(select?.disabled, true);
    assert.equal(select?.value, "");
    assert.equal(select?.dataset.entity, undefined);
    assert.equal(select?.querySelectorAll("option").length, 0);
    const text = parent.textContent;
    assert.equal(text.includes("Ring"), false);
    assert.equal(text.includes("Answer automatically"), false);
    assert.equal(text.includes("Do not disturb"), false);
    select?.change();
    assert.deepEqual(calls, []);
    assert.equal(parent.querySelectorAll(".rd-intercom-switch").length, 1);
    assert.equal(parent.querySelector(".rd-intercom-volume"), null);
  });
});

describe("intercomCss", () => {
  it("scopes every rule under an rd-intercom class and uses theme tokens", () => {
    const selectors = intercomCss
      .split("}")
      .map((block) => block.slice(0, block.indexOf("{")))
      .filter((selector) => selector.includes("."));
    assert.equal(selectors.length > 0, true);
    for (const selector of selectors) {
      assert.match(selector.trim(), /^\.rd-intercom/);
    }
    assert.equal(intercomCss.includes("grid-template-columns"), false);
    assert.match(intercomCss, /\.rd-intercom\s*\{[^}]*padding:\s*16px 16px 18px;/);
    for (const token of ["--primary-text-color", "--secondary-text-color", "--primary-color"]) {
      assert.equal(intercomCss.includes(`var(${token})`), true);
    }
    for (const className of [
      "rd-intercom",
      "rd-intercom-switch",
      "rd-intercom-switch-on",
      "rd-intercom-name",
      "rd-intercom-value",
      "rd-intercom-field",
      "rd-intercom-field-disabled",
      "rd-intercom-select",
      "rd-intercom-select-name",
      "rd-intercom-mark",
    ]) {
      assert.equal(intercomCss.includes(`.${className}`), true);
    }
  });
});
