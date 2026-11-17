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

const ANSWER_OPTIONS = ["Ring", "Answer automatically", "Do not disturb"];

function answerSelect(entityId: string, value: string, name = "Intercom answer mode") {
  return { entityId, name, options: ANSWER_OPTIONS.slice(), value };
}

function render(
  parent: El,
  view: IntercomView | undefined,
  onSwitch: IntercomSwitchChange = () => undefined,
  onVolume?: (entityId: string, value: number) => void,
  onSelect?: IntercomSelectChange,
): void {
  renderIntercom(parent as unknown as HTMLElement, view, onSwitch, onVolume, onSelect);
}

function buttons(view: IntercomView | undefined): Array<[string, string, boolean, boolean, string]> {
  return (view?.buttons ?? []).map((button) => [button.id, button.label, button.selected, button.disabled, button.option ?? ""]);
}

describe("buildIntercom", () => {
  it("omits the section when the device has no intercom switch, volume, or answer mode", () => {
    const view = buildIntercom(
      satellite({
        voiceSwitches: [
          { entityId: "switch.mute", name: "Mute", on: true },
          { entityId: "switch.dnd", name: "Intercom do not disturb", on: true },
        ],
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

  it("maps Ring, Answer, and DND onto the answer-mode options", () => {
    const view = buildIntercom(
      satellite({
        voiceSwitches: [{ entityId: "switch.enabled", name: "Intercom enabled", on: true }],
        settings: [answerSelect("select.answer", "Ring")],
      }),
    );
    assert.equal(view?.enabledId, "switch.enabled");
    assert.equal(view?.enabledOn, true);
    assert.equal(view?.answerId, "select.answer");
    assert.deepEqual(buttons(view), [
      ["off", "Off", false, false, ""],
      ["ring", "Ring", true, false, "Ring"],
      ["answer", "Answer", false, false, "Answer automatically"],
      ["dnd", "DND", false, false, "Do not disturb"],
    ]);
    assert.equal(view?.buttons.filter((button) => button.selected).length, 1);
  });

  it("selects Off when the intercom is disabled", () => {
    const view = buildIntercom(
      satellite({
        voiceSwitches: [{ entityId: "switch.enabled", name: "  Intercom enabled  ", on: false }],
        settings: [answerSelect("select.answer", "Do not disturb")],
      }),
    );
    assert.deepEqual(buttons(view), [
      ["off", "Off", true, false, ""],
      ["ring", "Ring", false, false, "Ring"],
      ["answer", "Answer", false, false, "Answer automatically"],
      ["dnd", "DND", false, false, "Do not disturb"],
    ]);
  });

  it("prefers a voice answer mode select and does not treat unknown as a mode", () => {
    const view = buildIntercom(
      satellite({
        voiceSwitches: [{ entityId: "switch.enabled", name: "Intercom enabled", on: true }],
        voiceSelects: [answerSelect("select.voice", "unknown", "  Intercom answer mode  ")],
        settings: [answerSelect("select.settings", "Ring", "Intercom answer mode")],
      }),
    );
    assert.equal(view?.answerId, "select.voice");
    assert.equal(view?.buttons.find((button) => button.selected), undefined);
    assert.equal(view?.buttons.find((button) => button.id === "ring")?.disabled, false);
  });

  it("keeps mode buttons enabled when intercom is off and the answer select is absent, and disables them when on without a select", () => {
    const offView = buildIntercom(
      satellite({
        voiceSwitches: [{ entityId: "switch.enabled", name: "Intercom enabled", on: false }],
      }),
    );
    assert.equal(offView?.answerId, undefined);
    assert.equal(offView?.volume, undefined);
    assert.deepEqual(buttons(offView), [
      ["off", "Off", true, false, ""],
      ["ring", "Ring", false, false, ""],
      ["answer", "Answer", false, false, ""],
      ["dnd", "DND", false, false, ""],
    ]);

    const onWithoutSelect = buildIntercom(
      satellite({
        voiceSwitches: [{ entityId: "switch.enabled", name: "Intercom enabled", on: true }],
      }),
    );
    assert.deepEqual(buttons(onWithoutSelect), [
      ["off", "Off", false, false, ""],
      ["ring", "Ring", false, true, ""],
      ["answer", "Answer", false, true, ""],
      ["dnd", "DND", false, true, ""],
    ]);
  });

  it("keeps intercom volume and disables every button when the switches are absent", () => {
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
    assert.equal(view?.volume?.entityId, "number.intercom_volume");
    assert.equal(view?.enabledId, undefined);
    assert.equal(view?.buttons.every((button) => button.disabled && !button.selected), true);
  });

  it("matches a device-prefixed enabled switch and answer mode", () => {
    const view = buildIntercom(
      satellite({
        settings: [
          { entityId: "switch.enabled", name: "Updoot2 Intercom enabled", on: true },
          answerSelect("select.answer", "Answer automatically", "Updoot2 Intercom answer mode"),
        ],
      }),
    );
    assert.equal(view?.enabledId, "switch.enabled");
    assert.equal(view?.answerId, "select.answer");
    assert.equal(view?.buttons.find((button) => button.id === "answer")?.selected, true);
  });

  it("prefers the voice enabled switch over a settings switch of the same name", () => {
    const view = buildIntercom(
      satellite({
        voiceSwitches: [{ entityId: "switch.voice", name: "Intercom enabled", on: true }],
        settings: [{ entityId: "switch.settings", name: "Intercom enabled", on: false }],
      }),
    );
    assert.equal(view?.enabledId, "switch.voice");
    assert.equal(view?.enabledOn, true);
  });
});

describe("renderIntercom", () => {
  it("clears the parent when there is no section", () => {
    const parent = host();
    parent.append(new El("p"));
    render(parent, undefined);
    assert.equal(parent.children.length, 0);
  });

  it("puts a speaker icon and the volume slider above four equal buttons", () => {
    const view = buildIntercom(
      satellite({
        voiceSwitches: [{ entityId: "switch.enabled", name: "Intercom enabled", on: true }],
        settings: [answerSelect("select.answer", "Ring")],
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
    const parent = host();
    const volumes: Array<[string, number]> = [];
    render(parent, view, () => undefined, (entityId, value) => volumes.push([entityId, value]));
    const section = parent.querySelector(".rd-intercom");
    assert.deepEqual(
      section?.children.map((node) => node.className),
      ["rd-intercom-volume", "rd-intercom-modes"],
    );
    const volume = section?.children[0];
    assert.equal(volume?.querySelector(".rd-intercom-speaker") !== null, true);
    assert.equal(volume?.textContent?.includes("Intercom"), false);
    assert.equal(volume?.querySelector("input")?.getAttribute("aria-label"), "Intercom volume");
    const slider = volume?.querySelector("input");
    assert.ok(slider);
    slider.value = "40";
    slider.change();
    assert.deepEqual(volumes, [["number.intercom_volume", 40]]);

    const modes = parent.querySelectorAll(".rd-intercom-mode");
    assert.deepEqual(
      modes.map((button) => button.textContent),
      ["Off", "Ring", "Answer", "DND"],
    );
    assert.equal(modes.filter((button) => button.getAttribute("aria-pressed") === "true").length, 1);
    assert.equal(modes[1]?.className.includes("rd-intercom-mode-on"), true);
  });

  it("turns the intercom on and selects the answer mode", () => {
    const view = buildIntercom(
      satellite({
        voiceSwitches: [{ entityId: "switch.enabled", name: "Intercom enabled", on: false }],
        settings: [answerSelect("select.answer", "Ring")],
      }),
    );
    const parent = host();
    const switches: Array<[string, string]> = [];
    const selects: Array<[string, string]> = [];
    render(
      parent,
      view,
      (_domain, service, _data, target) => switches.push([service, target.entity_id]),
      undefined,
      (_domain, _service, data, target) => selects.push([data.option, target.entity_id]),
    );
    const modes = parent.querySelectorAll(".rd-intercom-mode");
    modes[1]?.click();
    assert.deepEqual(switches, [["turn_on", "switch.enabled"]]);
    assert.deepEqual(selects, [["Ring", "select.answer"]]);
    assert.equal(modes.filter((button) => button.getAttribute("aria-pressed") === "true").length, 1);
    assert.equal(modes[1]?.getAttribute("aria-pressed"), "true");

    const alreadyOn = buildIntercom(
      satellite({
        voiceSwitches: [{ entityId: "switch.enabled", name: "Intercom enabled", on: true }],
        settings: [answerSelect("select.answer", "Ring")],
      }),
    );
    const onHost = host();
    const onSwitches: string[] = [];
    const onSelects: string[] = [];
    render(
      onHost,
      alreadyOn,
      (_domain, service) => onSwitches.push(service),
      undefined,
      (_domain, _service, data) => onSelects.push(data.option),
    );
    const onModes = onHost.querySelectorAll(".rd-intercom-mode");
    onModes[2]?.click();
    onModes[3]?.click();
    assert.deepEqual(onSelects, ["Answer automatically", "Do not disturb"]);
    assert.deepEqual(onSwitches, []);
  });

  it("turns the intercom off and does not call for a missing answer mode", () => {
    const view = buildIntercom(
      satellite({
        voiceSwitches: [{ entityId: "switch.enabled", name: "Intercom enabled", on: true }],
      }),
    );
    const parent = host();
    const switches: string[] = [];
    const selects: string[] = [];
    render(
      parent,
      view,
      (_domain, service) => switches.push(service),
      undefined,
      () => selects.push("select"),
    );
    const modes = parent.querySelectorAll(".rd-intercom-mode");
    modes[1]?.click();
    modes[2]?.click();
    modes[3]?.click();
    assert.deepEqual(selects, []);
    assert.deepEqual(switches, []);
    modes[0]?.click();
    assert.deepEqual(switches, ["turn_off"]);
    assert.equal(modes[0]?.getAttribute("aria-pressed"), "true");
  });

  it("turns intercom on and applies the chosen mode once the answer select reappears", () => {
    const parent = host();
    const switches: Array<[string, string]> = [];
    const selects: Array<[string, string]> = [];
    const onSwitch: IntercomSwitchChange = (_domain, service, _data, target) => switches.push([service, target.entity_id]);
    const onSelect: IntercomSelectChange = (_domain, _service, data, target) => selects.push([data.option, target.entity_id]);

    const offWithoutSelect = buildIntercom(
      satellite({
        voiceSwitches: [{ entityId: "switch.enabled", name: "Intercom enabled", on: false }],
      }),
    );
    render(parent, offWithoutSelect, onSwitch, undefined, onSelect);
    const modes = parent.querySelectorAll(".rd-intercom-mode");
    assert.equal(modes[3]?.disabled, false);
    modes[3]?.click();
    assert.deepEqual(switches, [["turn_on", "switch.enabled"]]);
    assert.deepEqual(selects, []);

    const onWithDefaultSelect = buildIntercom(
      satellite({
        voiceSwitches: [{ entityId: "switch.enabled", name: "Intercom enabled", on: true }],
        voiceSelects: [answerSelect("select.answer", "Ring")],
      }),
    );
    render(parent, onWithDefaultSelect, onSwitch, undefined, onSelect);
    assert.deepEqual(selects, [["Do not disturb", "select.answer"]]);
  });

  it("keeps volume controls present and patches DOM in place across mode changes", () => {
    const parent = host();
    const offView = buildIntercom(
      satellite({
        voiceSwitches: [{ entityId: "switch.enabled", name: "Intercom enabled", on: false }],
      }),
    );
    render(parent, offView);
    const section = parent.querySelector(".rd-intercom");
    const volumeRow = parent.querySelector(".rd-intercom-volume");
    const slider = parent.querySelector(".rd-intercom-slider");
    const modes = parent.querySelectorAll(".rd-intercom-mode");
    assert.ok(section && volumeRow && slider);
    assert.equal(slider.disabled, true);
    assert.equal(parent.querySelector(".rd-intercom-volume-value")?.textContent, "—");

    const onView = buildIntercom(
      satellite({
        voiceSwitches: [{ entityId: "switch.enabled", name: "Intercom enabled", on: true }],
        voiceSelects: [answerSelect("select.answer", "Ring")],
        volumes: [{ entityId: "number.intercom_volume", name: "Intercom volume", min: 0, max: 100, step: 5, value: 60 }],
      }),
    );
    render(parent, onView);
    assert.equal(parent.querySelector(".rd-intercom"), section);
    assert.equal(parent.querySelector(".rd-intercom-volume"), volumeRow);
    assert.equal(parent.querySelectorAll(".rd-intercom-mode")[1], modes[1]);
    assert.equal(slider.disabled, false);
    assert.equal(slider.value, "60");
    assert.equal(parent.querySelector(".rd-intercom-volume-value")?.textContent, "60%");
  });
});

describe("intercomCss", () => {
  it("scopes every rule under an rd-intercom class and shares the mode row evenly", () => {
    const selectors = intercomCss
      .split("}")
      .map((block) => block.slice(0, block.indexOf("{")))
      .filter((selector) => selector.includes("."));
    assert.equal(selectors.length > 0, true);
    for (const selector of selectors) {
      assert.match(selector.trim(), /^\.rd-intercom/);
    }
    assert.match(intercomCss, /\.rd-intercom-modes\s*\{[^}]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/);
    assert.match(intercomCss, /\.rd-intercom-modes\s*\{[^}]*min-height:\s*112px/);
    assert.match(intercomCss, /\.rd-intercom-mode:disabled\s*\{[^}]*cursor:\s*default;/);
    assert.match(intercomCss, /\.rd-intercom-mode:disabled\s*\{[^}]*opacity:\s*0\.45;/);
    for (const token of ["--primary-text-color", "--secondary-text-color", "--primary-color"]) {
      assert.equal(intercomCss.includes(`var(${token})`), true);
    }
    for (const className of [
      "rd-intercom",
      "rd-intercom-volume",
      "rd-intercom-speaker",
      "rd-intercom-modes",
      "rd-intercom-mode",
      "rd-intercom-mode-on",
    ]) {
      assert.equal(intercomCss.includes(`.${className}`), true);
    }
  });
});
