import type { SatelliteModel, SelectControl, SwitchControl, VolumeControl } from "./model";
import { formatVolumeReadout, speakerMark } from "./redisplay";

const ENABLED = "intercom enabled";
const ANSWER_MODE = "intercom answer mode";

const MODES = [
  { id: "ring", label: "Ring", match: "ring" },
  { id: "answer", label: "Answer", match: "answer automatically" },
  { id: "dnd", label: "DND", match: "do not disturb" },
] as const;

export type IntercomModeId = "off" | "ring" | "answer" | "dnd";

export interface IntercomButtonView {
  id: IntercomModeId;
  label: string;
  selected: boolean;
  disabled: boolean;
  /** Answer-mode option sent with select_option. Absent for Off and when that option is missing. */
  option?: string;
}

export interface IntercomVolumeView {
  entityId: string;
  name: string;
  min: number;
  max: number;
  step: number;
  value: number | null;
}

export interface IntercomView {
  /** Intercom volume. Absent until that entity exists. */
  volume?: IntercomVolumeView;
  /** Intercom enabled. Absent when that switch is missing. */
  enabledId?: string;
  /** True when Intercom enabled is on. Absent when the switch is missing. */
  enabledOn?: boolean;
  /** Intercom answer mode. Absent when that select is missing. */
  answerId?: string;
  buttons: IntercomButtonView[];
}

/**
 * The control card calls `switch.turn_on` or `switch.turn_off`
 * with no service data and `{ entity_id }` as the target.
 */
export type IntercomSwitchChange = (
  domain: "switch",
  service: "turn_on" | "turn_off",
  data: undefined,
  target: { entity_id: string },
) => void;

export type IntercomVolumeChange = (entityId: string, value: number) => void;

/**
 * The control card calls `select.select_option` with `{ option }` and `{ entity_id }`.
 * `option` is the string chosen on the select.
 */
export type IntercomSelectChange = (
  domain: "select",
  service: "select_option",
  data: { option: string },
  target: { entity_id: string },
) => void;

/**
 * Intercom volume, then Off / Ring / Answer / DND.
 * Off is Intercom enabled off. The other three turn that switch on and set
 * Intercom answer mode. A button stays disabled when the entity it writes is missing.
 * Intercom do not disturb is the same answer-mode value, so it is not a separate control.
 */
export function buildIntercom(model: SatelliteModel): IntercomView | undefined {
  const enabled = findSwitch(model, ENABLED);
  const answer = findAnswer(model);
  const volume = model.volumes.find((item) => matchesName(item.name, "intercom volume"));
  if (!enabled && !answer && !volume) return undefined;
  const view: IntercomView = { buttons: buildButtons(enabled, answer) };
  if (enabled) {
    view.enabledId = enabled.entityId;
    view.enabledOn = enabled.on;
  }
  if (answer?.entityId) view.answerId = answer.entityId;
  if (volume) view.volume = volumeView(volume);
  return view;
}

export const intercomCss = `
.rd-intercom {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 10px;
  min-height: 158px;
  color: var(--primary-text-color);
}
.rd-intercom-volume {
  display: flex;
  align-items: center;
  gap: 10px;
}
.rd-intercom-speaker {
  display: grid;
  width: 22px;
  height: 22px;
  color: var(--secondary-text-color);
}
.rd-intercom-speaker svg {
  width: 22px;
  height: 22px;
}
.rd-intercom-slider {
  flex: 1 1 auto;
  width: 100%;
  min-width: 0;
  accent-color: var(--primary-color);
}
.rd-intercom-volume-value {
  min-width: 3.2em;
  text-align: right;
  font-variant-numeric: tabular-nums;
  color: var(--secondary-text-color);
}
.rd-intercom-modes {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  flex: 1 1 auto;
  min-height: 112px;
}
.rd-intercom-mode {
  height: 100%;
  min-height: 112px;
  margin: 0;
  padding: 8px;
  border: 0;
  border-radius: 14px;
  background: color-mix(in srgb, var(--primary-text-color) 6%, transparent);
  color: var(--primary-text-color);
  font: inherit;
  font-size: 1.15rem;
  font-weight: 600;
  cursor: pointer;
}
.rd-intercom-mode-on {
  background: color-mix(in srgb, var(--primary-color) 22%, transparent);
  color: var(--primary-color);
}
.rd-intercom-mode:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: 2px;
}
.rd-intercom-mode:disabled {
  cursor: default;
  opacity: 0.45;
}
`;

export function renderIntercom(
  parent: HTMLElement,
  view: IntercomView | undefined,
  onSwitch: IntercomSwitchChange,
  onVolume?: IntercomVolumeChange,
  onSelect?: IntercomSelectChange,
): void {
  if (!view || view.buttons.length === 0) {
    parent.replaceChildren();
    return;
  }
  const root = document.createElement("section");
  root.className = "rd-intercom";
  root.setAttribute("aria-label", "Intercom");
  if (view.volume) root.append(volumeRow(view.volume, onVolume));
  root.append(modeRow(view, onSwitch, onSelect));
  parent.replaceChildren(root);
}

function buildButtons(enabled: SwitchControl | undefined, answer: SelectControl | undefined): IntercomButtonView[] {
  const off: IntercomButtonView = {
    id: "off",
    label: "Off",
    selected: Boolean(enabled && !enabled.on),
    disabled: !enabled,
  };
  const modes = MODES.map((mode): IntercomButtonView => {
    const option = matchedOption(answer, mode.match);
    const selected = Boolean(enabled?.on && option && normalize(answer?.value ?? "") === mode.match);
    return {
      id: mode.id,
      label: mode.label,
      selected,
      disabled: !enabled || !answer || !option,
      option,
    };
  });
  return [off, ...modes];
}

function matchedOption(select: SelectControl | undefined, match: string): string | undefined {
  if (!select) return undefined;
  const options = select.options.slice();
  const stored = select.value === "unknown" || select.value === "unavailable" ? "" : select.value;
  if (stored && !options.includes(stored)) options.unshift(stored);
  return options.find((option) => normalize(option) === match);
}

function volumeView(volume: VolumeControl): IntercomVolumeView {
  return {
    entityId: volume.entityId,
    name: volume.name,
    min: volume.min,
    max: volume.max,
    step: volume.step,
    value: volume.value,
  };
}

function volumeRow(volume: IntercomVolumeView, onVolume: IntercomVolumeChange | undefined): HTMLElement {
  const row = document.createElement("div");
  row.className = "rd-intercom-volume";
  const slider = document.createElement("input");
  slider.type = "range";
  slider.className = "rd-intercom-slider";
  slider.min = String(volume.min);
  slider.max = String(volume.max);
  slider.step = String(volume.step);
  slider.value = String(volume.value ?? volume.min);
  slider.dataset.entity = volume.entityId;
  slider.setAttribute("aria-label", "Intercom volume");
  const readout = document.createElement("span");
  readout.className = "rd-intercom-volume-value";
  readout.textContent = volume.value === null ? "" : formatVolumeReadout(volume.value, volume.max);
  slider.addEventListener("input", () => {
    readout.textContent = formatVolumeReadout(Number(slider.value), volume.max);
  });
  slider.addEventListener("change", () => {
    onVolume?.(volume.entityId, Number(slider.value));
  });
  row.append(speakerMark("rd-intercom-speaker"), slider, readout);
  return row;
}

function modeRow(
  view: IntercomView,
  onSwitch: IntercomSwitchChange,
  onSelect: IntercomSelectChange | undefined,
): HTMLElement {
  const row = document.createElement("div");
  row.className = "rd-intercom-modes";
  for (const item of view.buttons) row.append(modeButton(row, view, item, onSwitch, onSelect));
  return row;
}

function modeButton(
  row: HTMLElement,
  view: IntercomView,
  item: IntercomButtonView,
  onSwitch: IntercomSwitchChange,
  onSelect: IntercomSelectChange | undefined,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = item.selected ? "rd-intercom-mode rd-intercom-mode-on" : "rd-intercom-mode";
  button.disabled = item.disabled;
  button.textContent = item.label;
  button.setAttribute("data-mode", item.id);
  button.setAttribute("aria-pressed", item.selected ? "true" : "false");
  button.addEventListener("click", () => {
    if (button.disabled) return;
    if (item.id === "off") {
      if (!view.enabledId) return;
      paintPressed(row, "off");
      onSwitch("switch", "turn_off", undefined, { entity_id: view.enabledId });
      return;
    }
    if (!view.answerId || !item.option) return;
    paintPressed(row, item.id);
    if (view.enabledId && view.enabledOn === false) {
      onSwitch("switch", "turn_on", undefined, { entity_id: view.enabledId });
    }
    onSelect?.("select", "select_option", { option: item.option }, { entity_id: view.answerId });
  });
  return button;
}

function paintPressed(row: HTMLElement, id: string): void {
  const buttons = row.querySelectorAll(".rd-intercom-mode");
  buttons.forEach((node) => {
    const on = node.getAttribute("data-mode") === id;
    node.className = on ? "rd-intercom-mode rd-intercom-mode-on" : "rd-intercom-mode";
    node.setAttribute("aria-pressed", on ? "true" : "false");
  });
}

function findAnswer(model: SatelliteModel): SelectControl | undefined {
  const voice = model.voiceSelects.find((item) => matchesName(item.name, ANSWER_MODE));
  if (voice) return voice;
  for (const item of model.settings) {
    if (isSelect(item) && matchesName(item.name, ANSWER_MODE)) return item;
  }
  return undefined;
}

function isSelect(control: SatelliteModel["settings"][number]): control is SelectControl {
  return "options" in control && !("on" in control);
}

function findSwitch(model: SatelliteModel, name: string): SwitchControl | undefined {
  const voice = model.voiceSwitches.find((item) => matchesName(item.name, name));
  if (voice) return voice;
  for (const item of model.settings) {
    if ("on" in item && !("options" in item) && matchesName(item.name, name)) return item;
  }
  return undefined;
}

function matchesName(shown: string, wanted: string): boolean {
  const name = normalize(shown);
  return name === wanted || name.endsWith(` ${wanted}`);
}

function normalize(name: string): string {
  return name.trim().toLowerCase();
}
