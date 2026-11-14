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
  owner: { activeElement: DomNode | null } | null = null;
  private readonly attrs = new Map<string, string>();
  private readonly listeners = new Map<string, Array<() => void>>();

  constructor(readonly tagName: string) {}

  getRootNode(): { activeElement: DomNode | null } | DomNode {
    return this.owner ?? this;
  }

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
  it("omits the section when the device has no voice agent controls", () => {
    const view = buildAgent(
      satellite({
        voiceSwitches: [
          { entityId: "switch.chimes", name: "Chimes", on: true },
          { entityId: "switch.gate", name: "Noise gate", on: false },
        ],
        timers: [{ entityId: "sensor.timers", name: "Timers", state: "1" }],
        settings: [
          select("select.theme", "Theme", ["Dark", "Light"], "Dark"),
          { entityId: "number.delay", name: "Delay", min: 0, max: 10, step: 1, value: 4 },
        ],
      }),
    );
    assert.equal(view, undefined);
    const mute = buildAgent(satellite({ voiceSwitches: [{ entityId: "switch.mute", name: "Mute", on: true }] }));
    assert.deepEqual(mute?.mute, { entityId: "switch.mute", name: "Mute", on: true });
    assert.equal(mute?.stopWord, undefined);
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
      mute: { entityId: "switch.mute", name: "Mute", on: false },
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
    assert.deepEqual(view?.mute, { entityId: "switch.mute", name: "Mute", on: true });
    assert.equal(JSON.stringify(view).includes("Delay"), false);
    assert.equal(JSON.stringify(view).includes("Timers"), false);
  });

  it("adds assistant volume, mute, and stop word, and leaves the other voice switches out", () => {
    const view = buildAgent(
      satellite({
        voiceSelects: [select("select.wake", "Wake word", ["Hey Jarvis"], "Hey Jarvis")],
        volumes: [
          { entityId: "number.media", name: "Media volume", min: 0, max: 100, step: 5, value: 47 },
          { entityId: "number.assistant", name: "Assistant volume", min: 0, max: 100, step: 5, value: 80 },
        ],
        voiceSwitches: [
          { entityId: "switch.mute", name: "Mute", on: true },
          { entityId: "switch.chimes", name: "Chimes", on: true },
          { entityId: "switch.gate", name: "Noise gate", on: false },
          { entityId: "switch.stop", name: "Stop word", on: true },
          { entityId: "switch.timers", name: "Mute timers", on: false },
        ],
      }),
    );
    assert.equal(view?.volume?.entityId, "number.assistant");
    assert.equal(view?.volume?.value, 80);
    assert.deepEqual(view?.mute, { entityId: "switch.mute", name: "Mute", on: true });
    assert.deepEqual(view?.stopWord, { entityId: "switch.stop", name: "Stop word", on: true });
    assert.equal(JSON.stringify(view).includes("Chimes"), false);
    assert.equal(JSON.stringify(view).includes("Noise gate"), false);
    assert.equal(JSON.stringify(view).includes("Mute timers"), false);
    assert.equal(JSON.stringify(view).includes("Media volume"), false);
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
    assert.match(agentCss, /\.rd-agent\s*\{[^}]*display:\s*flex/);
    assert.match(agentCss, /\.rd-agent\s*\{[^}]*padding:\s*16px 16px 18px/);
    assert.match(agentCss, /\.rd-agent-row\s*\{[^}]*grid-template-columns:\s*1fr 1fr/);
    assert.match(agentCss, /\.rd-agent-row-single\s*\{[^}]*grid-template-columns:\s*1fr/);
    assert.match(agentCss, /\.rd-agent-select\s*\{[^}]*font-size:\s*1\.15rem/);
    for (const token of ["--primary-text-color", "--secondary-text-color", "--primary-color", "--divider-color"]) {
      assert.equal(agentCss.includes(`var(${token})`), true);
    }
    for (const className of [
      "rd-agent",
      "rd-agent-row",
      "rd-agent-row-single",
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

  const agentDocument = {
    activeElement: null as DomNode | null,
    createElement(tag: string): DomNode {
      const node = new DomNode(tag);
      node.owner = agentDocument;
      return node;
    },
  };
  (globalThis as { document: typeof agentDocument }).document = agentDocument;

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

  it("shows Voice Agent as paired rows of selects", () => {
    const parent = mount(sample());
    const section = parent.querySelector(".rd-agent");
    assert.equal(section?.tagName, "section");
    assert.equal(section?.getAttribute("aria-label"), "Voice Agent");
    assert.equal(parent.querySelector(".rd-agent-label"), null);
    assert.equal(classNames(parent).every((name) => name.startsWith("rd-agent")), true);
    assert.equal(parent.children.length, 1);

    const rows = parent.querySelectorAll(".rd-agent-row");
    assert.deepEqual(
      rows.map((row) => row.querySelectorAll(".rd-agent-name").map((node) => node.textContent)),
      [["Wake word"], ["Assistant"], ["Wake word sensitivity"]],
    );
    assert.equal(rows.some((row) => row.className.includes("rd-agent-row-single")), false);

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
    assert.equal(parent.querySelector(".rd-agent-switch-label")?.textContent, "Mute");
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

  it("groups wake words, assistants, finished speaking, and the engine", () => {
    const parent = mount(
      buildAgent(
        satellite({
          voiceSelects: [
            select("select.sensitivity", "VS Wake word sensitivity", ["0.5", "0.8"], "0.5"),
            select("select.wake2", "  Wake word 2  ", ["Hey Mycroft"], "Hey Mycroft"),
            select("select.finished", "Finished speaking detection", ["Silence", "VAD"], "Silence"),
            select("select.engine", "Wake word engine", ["openWakeWord", "microWakeWord"], "openWakeWord"),
            select("select.assistant2", "Assistant 2", ["Cloud"], "Cloud"),
            select("select.assistant", "Assistant", ["Home"], "Home"),
            select("select.wake", "Wake word", ["Hey Jarvis", "Hey Mycroft"], "Hey Jarvis"),
          ],
        }),
      ),
    );
    const rows = parent.querySelectorAll(".rd-agent-row");
    assert.deepEqual(
      rows.map((row) => row.querySelectorAll(".rd-agent-name").map((node) => node.textContent)),
      [
        ["Wake word", "  Wake word 2  "],
        ["Assistant", "Assistant 2"],
        ["Finished speaking detection"],
        ["Wake word engine", "VS Wake word sensitivity"],
      ],
    );
    assert.equal(rows[2]?.className.includes("rd-agent-row-single"), true);
    assert.equal(rows[0]?.className.includes("rd-agent-row-single"), false);
    assert.equal(rows[3]?.className.includes("rd-agent-row-single"), false);
  });

  it("keeps an open select through a re-render and updates the others", () => {
    const calls: string[] = [];
    const parent = mount(sample(), (_domain, _service, data) => calls.push(data.option));
    const selects = parent.querySelectorAll(".rd-agent-select");
    const wake = selects[0];
    const assistant = selects[1];
    const sensitivity = selects[2];
    assert.ok(wake && assistant && sensitivity);
    const wakeOption = optionNodes(wake)[0];
    wake.value = "Hey Mycroft";
    agentDocument.activeElement = wake;

    const next = buildAgent(
      satellite({
        voiceSelects: [
          select("select.wake", "Wake word", ["Hey Jarvis", "Hey Mycroft", "Alexa"], "Hey Jarvis"),
          select("select.assistant", "Assistant", ["Home"], "Home"),
          select("select.sensitivity", "Wake word sensitivity", ["0.5", "0.8"], "0.8"),
        ],
      }),
    );
    renderAgent(parent as unknown as HTMLElement, next, () => undefined);
    assert.equal(parent.querySelectorAll(".rd-agent-select")[0], wake);
    assert.equal(optionNodes(wake)[0], wakeOption);
    assert.equal(wake.value, "Hey Mycroft");
    assert.equal(assistant.value, "Home");
    assert.equal(sensitivity.value, "0.8");
    assert.deepEqual(calls, []);

    agentDocument.activeElement = null;
    renderAgent(parent as unknown as HTMLElement, next, () => undefined);
    assert.equal(parent.querySelectorAll(".rd-agent-select")[0], wake);
    assert.equal(wake.value, "Hey Jarvis");
    assert.deepEqual(
      optionNodes(wake).map((node) => node.value),
      ["Hey Jarvis", "Hey Mycroft", "Alexa"],
    );
    assert.deepEqual(calls, []);
  });
});
