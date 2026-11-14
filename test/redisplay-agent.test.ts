import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import {
  buildModel,
  type EntityState,
  type RegistryEntry,
  type SatelliteModel,
  type SelectControl,
} from "../src/model";
import { agentCss, buildAgent, renderAgent, type AgentSelectChange, type AgentView } from "../src/redisplay-agent";

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

function select(entityId: string, name: string, options: string[], value: string): SelectControl {
  return { entityId, name, options, value };
}

function entry(entityId: string, originalName: string): RegistryEntry {
  return { entity_id: entityId, device_id: "dev1", original_name: originalName };
}

function state(value: string, attributes: Record<string, unknown> = {}): EntityState {
  return { state: value, attributes };
}

class DomNode {
  className = "";
  textContent: string | null = null;
  value = "";
  dataset: Record<string, string> = {};
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

  change(): void {
    for (const listener of this.listeners.get("change") ?? []) listener();
  }

  querySelector(selector: string): DomNode | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector: string): DomNode[] {
    const matches: DomNode[] = [];
    const walk = (node: DomNode): void => {
      if (node.className.split(/\s+/).includes(selector.slice(1))) matches.push(node);
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

function optionNodes(selectNode: DomNode): DomNode[] {
  return selectNode.children.filter((child) => child.tagName.toLowerCase() === "option");
}

describe("buildAgent", () => {
  it("omits the section when the device has none of the voice selects", () => {
    const view = buildAgent(
      satellite({
        voiceSwitches: [{ entityId: "switch.mute", name: "Mute", on: true }],
        timers: [{ entityId: "sensor.timers", name: "Timers", state: "1" }],
        settings: [
          select("select.theme", "Theme", ["Dark", "Light"], "Dark"),
          { entityId: "number.delay", name: "Delay", min: 0, max: 10, step: 1, value: 4 },
        ],
      }),
    );
    assert.equal(view, undefined);
  });

  it("keeps the voice selects in order and leaves settings out", () => {
    const view = buildAgent(
      satellite({
        voiceSelects: [
          select("select.engine", "Wake word engine", ["openWakeWord", "microWakeWord"], "openWakeWord"),
          select("select.wake", "Wake word", ["Hey Jarvis", "Hey Mycroft"], "Hey Jarvis"),
        ],
        voiceSwitches: [{ entityId: "switch.mute", name: "Mute", on: false }],
        settings: [select("select.theme", "Theme", ["Dark", "Light"], "Dark")],
      }),
    );
    assert.deepEqual(view, {
      selects: [
        {
          entityId: "select.engine",
          name: "Wake word engine",
          options: ["openWakeWord", "microWakeWord"],
          value: "openWakeWord",
        },
        {
          entityId: "select.wake",
          name: "Wake word",
          options: ["Hey Jarvis", "Hey Mycroft"],
          value: "Hey Jarvis",
        },
      ],
    });
  });

  it("adds a live value the entity left off the list, and skips unknown and unavailable", () => {
    const engineOptions = ["openWakeWord"];
    const wakeOptions = ["Hey Jarvis"];
    const quietOptions = ["Silence"];
    const view = buildAgent(
      satellite({
        voiceSelects: [
          select("select.assistant", "Assistant", [], "Qwen"),
          select("select.engine", "Wake word engine", engineOptions, "microWakeWord"),
          select("select.wake", "Wake word", wakeOptions, "unknown"),
          select("select.finished", "Finished speaking detection", quietOptions, "unavailable"),
          select("select.wake2", "Wake word 2", ["Hey Jarvis"], ""),
          select("select.sensitivity", "Wake word sensitivity", ["0.5", "0.8"], "0.5"),
        ],
      }),
    );
    assert.deepEqual(
      view?.selects.map((item) => [item.name, item.options, item.value]),
      [
        ["Assistant", ["Qwen"], "Qwen"],
        ["Wake word engine", ["microWakeWord", "openWakeWord"], "microWakeWord"],
        ["Wake word", ["Hey Jarvis"], "unknown"],
        ["Finished speaking detection", ["Silence"], "unavailable"],
        ["Wake word 2", ["Hey Jarvis"], ""],
        ["Wake word sensitivity", ["0.5", "0.8"], "0.5"],
      ],
    );
    assert.deepEqual(engineOptions, ["openWakeWord"]);
    assert.deepEqual(wakeOptions, ["Hey Jarvis"]);
    assert.deepEqual(quietOptions, ["Silence"]);
  });

  it("reads the seven voice selects from a device and ignores leftover settings", () => {
    const built = buildModel({
      deviceId: "dev1",
      devices: [{ id: "dev1", name: "Updoot1", manufacturer: "kiosk_satellite" }],
      entities: [
        entry("select.sensitivity", "VS Wake word sensitivity"),
        entry("select.theme", "Theme"),
        entry("select.engine", "VS Wake word engine"),
        entry("select.finished", "Finished speaking detection"),
        entry("select.assistant2", "Assistant 2"),
        entry("select.assistant", "Assistant"),
        entry("select.wake2", "Wake word 2"),
        entry("select.wake", "Wake word"),
        entry("switch.mute", "VS Mute"),
        entry("sensor.timers", "VS Timers"),
        entry("number.delay", "Delay"),
      ],
      states: {
        "select.wake": state("Hey Jarvis", { options: ["Hey Jarvis", "Hey Mycroft"] }),
        "select.wake2": state("unavailable", { options: ["Hey Jarvis"] }),
        "select.assistant": state("Qwen", {}),
        "select.assistant2": state("Home", { options: ["Home", "Cloud"] }),
        "select.finished": state("Silence", { options: ["Silence", "VAD"] }),
        "select.engine": state("openWakeWord", { options: ["openWakeWord", "microWakeWord"] }),
        "select.sensitivity": state("0.5", { options: ["0.5", "0.8"] }),
        "select.theme": state("Dark", { options: ["Dark", "Light"] }),
        "switch.mute": state("on"),
        "sensor.timers": state("1"),
        "number.delay": state("4", { min: 0, max: 10, step: 1 }),
      },
    });
    const view = buildAgent(built);
    assert.deepEqual(
      view?.selects.map((item) => [item.entityId, item.name, item.value]),
      [
        ["select.wake", "Wake word", "Hey Jarvis"],
        ["select.wake2", "Wake word 2", "unavailable"],
        ["select.assistant", "Assistant", "Qwen"],
        ["select.assistant2", "Assistant 2", "Home"],
        ["select.finished", "Finished speaking detection", "Silence"],
        ["select.engine", "Wake word engine", "openWakeWord"],
        ["select.sensitivity", "Wake word sensitivity", "0.5"],
      ],
    );
    assert.deepEqual(view?.selects[2]?.options, ["Qwen"]);
    assert.equal(JSON.stringify(view).includes("Theme"), false);
    assert.equal(JSON.stringify(view).includes("Mute"), false);
    assert.equal(JSON.stringify(view).includes("Delay"), false);
    assert.equal(JSON.stringify(view).includes("Timers"), false);
  });
});

describe("agentCss", () => {
  it("scopes every rule under an rd-agent class and uses theme tokens", () => {
    const selectors = agentCss
      .split("}")
      .map((block) => block.slice(0, block.indexOf("{")))
      .filter((selector) => selector.includes("."));
    assert.equal(selectors.length > 0, true);
    for (const selector of selectors) {
      assert.match(selector.trim(), /^\.rd-agent/);
    }
    assert.equal(agentCss.includes("grid-template-columns"), false);
    assert.match(agentCss, /\.rd-agent\s*\{[^}]*display:\s*flex/);
    assert.match(agentCss, /\.rd-agent-select\s*\{[^}]*font-size:\s*2rem/);
    for (const token of ["--primary-text-color", "--secondary-text-color", "--primary-color", "--divider-color"]) {
      assert.equal(agentCss.includes(`var(${token})`), true);
    }
    for (const className of [
      "rd-agent",
      "rd-agent-label",
      "rd-agent-field",
      "rd-agent-name",
      "rd-agent-control",
      "rd-agent-select",
      "rd-agent-mark",
    ]) {
      assert.equal(agentCss.includes(`.${className}`), true);
    }
  });
});

describe("renderAgent", () => {
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

  function mount(view: AgentView | undefined, onSelect: AgentSelectChange = () => undefined): DomNode {
    const parent = new DomNode("div");
    renderAgent(parent as unknown as HTMLElement, view, onSelect);
    return parent;
  }

  function sample(): AgentView {
    return buildAgent(
      satellite({
        voiceSelects: [
          select("select.wake", "Wake word", ["Hey Jarvis", "Hey Mycroft"], "Hey Jarvis"),
          select("select.assistant", "Assistant", [], "Qwen"),
          select("select.sensitivity", "Wake word sensitivity", ["0.5", "0.8"], "0.5"),
        ],
        settings: [select("select.theme", "Theme", ["Dark", "Light"], "Dark")],
        voiceSwitches: [{ entityId: "switch.mute", name: "Mute", on: true }],
      }),
    ) as AgentView;
  }

  it("clears the parent when the device has no voice selects", () => {
    const parent = mount(sample());
    assert.equal(parent.querySelector(".rd-agent") !== null, true);
    renderAgent(parent as unknown as HTMLElement, undefined, () => undefined);
    assert.equal(parent.children.length, 0);
    renderAgent(parent as unknown as HTMLElement, { selects: [] }, () => undefined);
    assert.equal(parent.children.length, 0);
  });

  it("shows Voice Agent as a stack of large selects", () => {
    const parent = mount(sample());
    const section = parent.querySelector(".rd-agent");
    assert.equal(section?.tagName, "section");
    assert.equal(section?.getAttribute("aria-label"), "Voice Agent");
    assert.equal(parent.querySelector(".rd-agent-label")?.tagName, "h2");
    assert.equal(parent.querySelector(".rd-agent-label")?.textContent, "Voice Agent");
    assert.equal(classNames(parent).every((name) => name.startsWith("rd-agent")), true);
    assert.equal(parent.children.length, 1);

    const selects = parent.querySelectorAll(".rd-agent-select");
    assert.deepEqual(
      selects.map((node) => node.getAttribute("aria-label")),
      ["Wake word", "Assistant", "Wake word sensitivity"],
    );
    assert.deepEqual(
      parent.querySelectorAll(".rd-agent-name").map((node) => node.textContent),
      ["Wake word", "Assistant", "Wake word sensitivity"],
    );
    assert.equal(selects[0]?.dataset.entity, "select.wake");
    assert.deepEqual(
      optionNodes(selects[0] as DomNode).map((node) => [node.value, node.textContent]),
      [
        ["Hey Jarvis", "Hey Jarvis"],
        ["Hey Mycroft", "Hey Mycroft"],
      ],
    );
    assert.equal(selects[0]?.value, "Hey Jarvis");
    assert.deepEqual(
      optionNodes(selects[1] as DomNode).map((node) => node.value),
      ["Qwen"],
    );
    assert.equal(selects[1]?.value, "Qwen");
    assert.equal(selects[1]?.dataset.entity, "select.assistant");
    assert.equal(parent.querySelector(".rd-agent-mark")?.getAttribute("aria-hidden"), "true");

    const text = textOf(parent);
    assert.equal(text.includes("Theme"), false);
    assert.equal(text.includes("Mute"), false);
    assert.equal(text.includes("Dark"), false);
  });

  it("passes the chosen option string to select.select_option", () => {
    const calls: Array<Parameters<AgentSelectChange>> = [];
    const onSelect: AgentSelectChange = (domain, service, data, target) => {
      calls.push([domain, service, data, target]);
    };
    const parent = mount(sample(), onSelect);
    assert.deepEqual(calls, []);

    const later: Array<Parameters<AgentSelectChange>> = [];
    renderAgent(parent as unknown as HTMLElement, sample(), (domain, service, data, target) => {
      later.push([domain, service, data, target]);
    });
    const selects = parent.querySelectorAll(".rd-agent-select");
    const wake = selects[0];
    assert.ok(wake);
    wake.value = "Hey Mycroft";
    wake.change();
    assert.deepEqual(calls, []);
    assert.deepEqual(later, [
      ["select", "select_option", { option: "Hey Mycroft" }, { entity_id: "select.wake" }],
    ]);

    const sensitivity = selects[2];
    assert.ok(sensitivity);
    sensitivity.value = "0.8";
    sensitivity.change();
    assert.deepEqual(later[1], ["select", "select_option", { option: "0.8" }, { entity_id: "select.sensitivity" }]);
  });

  it("keeps an open select while the view is unchanged, then applies a new value", () => {
    const calls: string[] = [];
    const parent = mount(sample(), (_domain, _service, data) => calls.push(data.option));
    const first = parent.querySelector(".rd-agent-select");
    renderAgent(parent as unknown as HTMLElement, sample(), (_domain, _service, data) => calls.push(data.option));
    assert.equal(parent.querySelector(".rd-agent-select"), first);
    assert.deepEqual(calls, []);

    const next = buildAgent(
      satellite({
        voiceSelects: [
          select("select.wake", "Wake word", ["Hey Jarvis", "Hey Mycroft"], "Hey Mycroft"),
          select("select.assistant", "Assistant", [], "Qwen"),
          select("select.sensitivity", "Wake word sensitivity", ["0.5", "0.8"], "0.8"),
        ],
      }),
    );
    renderAgent(parent as unknown as HTMLElement, next, () => undefined);
    const selects = parent.querySelectorAll(".rd-agent-select");
    assert.notEqual(selects[0], first);
    assert.equal(selects[0]?.value, "Hey Mycroft");
    assert.equal(selects[2]?.value, "0.8");
    assert.deepEqual(calls, []);
  });
});
