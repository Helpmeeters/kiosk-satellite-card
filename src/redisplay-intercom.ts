import type { SatelliteModel, SelectControl, SwitchControl, VolumeControl } from "./model";
import { formatVolumeReadout } from "./redisplay";

const ENABLED = "intercom enabled";
const DISTURB = "intercom do not disturb";
const DISTURB_LABEL = "Intercom do not disturb";
const ANSWER_MODE = "intercom answer mode";
const ANSWER_LABEL = "Intercom answer mode";

export interface IntercomSwitchView {
  entityId: string;
  name: string;
  on: boolean;
}

export interface IntercomVolumeView {
  entityId: string;
  name: string;
  min: number;
  max: number;
  step: number;
  value: number | null;
}

export interface IntercomAnswerView {
  /** Missing when the select is not in the registry. */
  entityId?: string;
  name: string;
  options: string[];
  /** Empty when nothing is selected. An absent select does not get a made-up mode. */
  value: string;
  disabled: boolean;
}

export interface IntercomDisturbView {
  /** Missing when the switch is not in the registry. */
  entityId?: string;
  name: string;
  /** False when the switch is absent. */
  on: boolean;
  disabled: boolean;
}

export interface IntercomView {
  switches: IntercomSwitchView[];
  /** Intercom volume, drawn like the Media volume slider. */
  volume?: IntercomVolumeView;
  /**
   * Intercom answer mode. Set whenever the section is shown.
   * Disabled, with no selection, when the select entity is absent.
   */
  answer?: IntercomAnswerView;
  /**
   * Intercom do not disturb. Set whenever the section is shown.
   * Disabled and off when the switch entity is absent.
   */
  doNotDisturb?: IntercomDisturbView;
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
 * Intercom enabled, Intercom answer mode, Intercom do not disturb, and Intercom volume.
 * Answer mode stays on the tab when its select is absent: disabled, with no selection.
 * Do not disturb stays on the tab when its switch is absent: disabled and off.
 * Intercom volume stays off the tab until that entity exists.
 * The Intercom and Intercom kiosk text sensors are not on SatelliteModel, so there is no call state.
 */
export function buildIntercom(model: SatelliteModel): IntercomView | undefined {
  const enabled = findSwitch(model, ENABLED);
  const switches = enabled ? [{ entityId: enabled.entityId, name: enabled.name, on: enabled.on }] : [];
  const volume = model.volumes.find((item) => normalize(item.name) === "intercom volume");
  const answer = findAnswer(model);
  const disturb = findDisturb(model);
  if (switches.length === 0 && !volume && !answer && !disturb) return undefined;
  const view: IntercomView = {
    switches,
    answer: answer ?? absentAnswer(),
    doNotDisturb: disturb ?? absentDisturb(),
  };
  if (volume) view.volume = volumeView(volume);
  return view;
}

export const intercomCss = `
.rd-intercom {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 14px;
  padding: 16px 16px 18px;
  color: var(--primary-text-color);
}
.rd-intercom-switch {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  width: 100%;
  margin: 0;
  padding: 14px 12px;
  border: 0;
  border-radius: 14px;
  background: color-mix(in srgb, var(--primary-text-color) 6%, transparent);
  color: var(--primary-text-color);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.rd-intercom-switch:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: 2px;
}
.rd-intercom-switch:disabled {
  cursor: default;
  opacity: 0.45;
}
.rd-intercom-switch-on {
  background: color-mix(in srgb, var(--primary-color) 16%, transparent);
}
.rd-intercom-name {
  color: var(--secondary-text-color);
  font-size: 1.05rem;
  line-height: 1.3;
}
.rd-intercom-value {
  color: var(--primary-text-color);
  font-size: 2.4rem;
  font-weight: 500;
  line-height: 1.05;
}
.rd-intercom-switch-on .rd-intercom-value {
  color: var(--primary-color);
}
.rd-intercom-volume {
  display: flex;
  align-items: center;
  gap: 10px;
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
.rd-intercom-field {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
  min-width: 0;
  margin: 0;
}
.rd-intercom-select-name {
  color: var(--secondary-text-color);
  font-size: 0.92rem;
  font-weight: 500;
  line-height: 1.3;
}
.rd-intercom-control {
  position: relative;
  display: block;
  min-width: 0;
}
.rd-intercom-select {
  appearance: none;
  -webkit-appearance: none;
  display: block;
  box-sizing: border-box;
  width: 100%;
  margin: 0;
  padding: 9px 34px 9px 12px;
  border: 1px solid var(--divider-color);
  border-radius: 12px;
  background: color-mix(in srgb, var(--primary-text-color) 6%, transparent);
  color: var(--primary-text-color);
  font: inherit;
  font-size: 1.15rem;
  font-weight: 500;
  line-height: 1.25;
  cursor: pointer;
}
.rd-intercom-select:focus-visible {
  outline: 2px solid var(--primary-color);
  outline-offset: 2px;
}
.rd-intercom-select:disabled {
  cursor: default;
}
.rd-intercom-field-disabled .rd-intercom-control {
  opacity: 0.45;
}
.rd-intercom-mark {
  position: absolute;
  top: 50%;
  right: 13px;
  width: 8px;
  height: 8px;
  margin-top: -6px;
  border-right: 2px solid var(--secondary-text-color);
  border-bottom: 2px solid var(--secondary-text-color);
  transform: rotate(45deg);
  pointer-events: none;
}
`;

export function renderIntercom(
  parent: HTMLElement,
  view: IntercomView | undefined,
  onSwitch: IntercomSwitchChange,
  onVolume?: IntercomVolumeChange,
  onSelect?: IntercomSelectChange,
): void {
  if (!view || (view.switches.length === 0 && !view.volume && !view.answer && !view.doNotDisturb)) {
    parent.replaceChildren();
    return;
  }
  const root = document.createElement("section");
  root.className = "rd-intercom";
  root.setAttribute("aria-label", "Intercom");
  const enabled = view.switches.find((item) => normalize(item.name) === ENABLED);
  const rest = view.switches.filter((item) => item !== enabled);
  if (enabled) root.append(switchButton(enabled, onSwitch));
  if (view.answer) root.append(answerField(view.answer, onSelect));
  if (view.doNotDisturb) root.append(disturbButton(view.doNotDisturb, onSwitch));
  for (const item of rest) root.append(switchButton(item, onSwitch));
  if (view.volume) root.append(volumeRow(view.volume, onVolume));
  parent.replaceChildren(root);
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
  const label = text("span", "rd-intercom-volume-label", "Intercom");
  const slider = document.createElement("input");
  slider.type = "range";
  slider.className = "rd-intercom-slider";
  slider.min = String(volume.min);
  slider.max = String(volume.max);
  slider.step = String(volume.step);
  slider.value = String(volume.value ?? volume.min);
  slider.dataset.entity = volume.entityId;
  slider.setAttribute("aria-label", "Intercom volume");
  const readout = text("span", "rd-intercom-volume-value", volume.value === null ? "" : formatVolumeReadout(volume.value, volume.max));
  slider.addEventListener("input", () => {
    readout.textContent = formatVolumeReadout(Number(slider.value), volume.max);
  });
  slider.addEventListener("change", () => {
    onVolume?.(volume.entityId, Number(slider.value));
  });
  row.append(label, slider, readout);
  return row;
}

function absentAnswer(): IntercomAnswerView {
  return { name: ANSWER_LABEL, options: [], value: "", disabled: true };
}

function absentDisturb(): IntercomDisturbView {
  return { name: DISTURB_LABEL, on: false, disabled: true };
}

function findDisturb(model: SatelliteModel): IntercomDisturbView | undefined {
  const found = findSwitch(model, DISTURB);
  if (!found) return undefined;
  return { entityId: found.entityId, name: found.name, on: found.on, disabled: false };
}

function findAnswer(model: SatelliteModel): IntercomAnswerView | undefined {
  const voice = model.voiceSelects.find((item) => normalize(item.name) === ANSWER_MODE);
  if (voice) return presentAnswer(voice);
  for (const item of model.settings) {
    if (isSelect(item) && normalize(item.name) === ANSWER_MODE) return presentAnswer(item);
  }
  return undefined;
}

function presentAnswer(select: SelectControl): IntercomAnswerView {
  const stored = select.value === "unknown" || select.value === "unavailable" ? "" : select.value;
  const options = select.options.slice();
  if (stored && !options.includes(stored)) options.unshift(stored);
  return {
    entityId: select.entityId,
    name: select.name,
    options,
    value: stored,
    disabled: false,
  };
}

function isSelect(control: SatelliteModel["settings"][number]): control is SelectControl {
  return "options" in control;
}

function answerField(item: IntercomAnswerView, onSelect: IntercomSelectChange | undefined): HTMLElement {
  const entityId = item.disabled ? undefined : item.entityId;
  const label = document.createElement("label");
  label.className = entityId ? "rd-intercom-field" : "rd-intercom-field rd-intercom-field-disabled";
  const caption = entityId ? item.name : ANSWER_LABEL;
  const name = text("span", "rd-intercom-select-name", caption);
  const control = document.createElement("span");
  control.className = "rd-intercom-control";
  const select = document.createElement("select");
  select.className = "rd-intercom-select";
  select.setAttribute("aria-label", caption);
  if (!entityId) {
    select.disabled = true;
    select.value = "";
  } else {
    select.dataset.entity = entityId;
    fillSelect(select, item);
    select.addEventListener("change", () => {
      const option = select.value;
      if (!option) return;
      onSelect?.("select", "select_option", { option }, { entity_id: entityId });
    });
  }
  const mark = document.createElement("span");
  mark.className = "rd-intercom-mark";
  mark.setAttribute("aria-hidden", "true");
  control.append(select, mark);
  label.append(name, control);
  return label;
}

/** A value the entity did not report stays unselected, so the first option is not shown as chosen. */
function fillSelect(select: HTMLSelectElement, item: IntercomAnswerView): void {
  const chosen = item.value && item.options.includes(item.value) ? item.value : "";
  const nodes: HTMLOptionElement[] = [];
  if (!chosen) {
    const blank = document.createElement("option");
    blank.value = "";
    blank.textContent = "";
    nodes.push(blank);
  }
  for (const option of item.options) {
    const node = document.createElement("option");
    node.value = option;
    node.textContent = option;
    nodes.push(node);
  }
  select.replaceChildren(...nodes);
  select.value = chosen;
}

function findSwitch(model: SatelliteModel, name: string): SwitchControl | undefined {
  const voice = model.voiceSwitches.find((item) => normalize(item.name) === name);
  if (voice) return voice;
  for (const item of model.settings) {
    if ("on" in item && normalize(item.name) === name) return item;
  }
  return undefined;
}

function normalize(name: string): string {
  return name.trim().toLowerCase();
}

function text(tag: "p" | "span", className: string, value: string): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = value;
  return node;
}

function disturbButton(item: IntercomDisturbView, onSwitch: IntercomSwitchChange): HTMLButtonElement {
  if (!item.disabled && item.entityId) {
    return switchButton({ entityId: item.entityId, name: item.name, on: item.on }, onSwitch);
  }
  const button = document.createElement("button");
  button.type = "button";
  button.disabled = true;
  button.className = "rd-intercom-switch";
  button.setAttribute("role", "switch");
  button.setAttribute("aria-label", DISTURB_LABEL);
  button.setAttribute("aria-checked", "false");
  button.append(text("span", "rd-intercom-name", DISTURB_LABEL), text("span", "rd-intercom-value", "Off"));
  return button;
}

function switchButton(item: IntercomSwitchView, onSwitch: IntercomSwitchChange): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.entity = item.entityId;
  button.setAttribute("role", "switch");
  button.setAttribute("aria-label", item.name);
  const name = text("span", "rd-intercom-name", item.name);
  const value = text("span", "rd-intercom-value", "");
  button.append(name, value);
  paint(button, value, item.on);
  button.addEventListener("click", () => {
    const on = button.getAttribute("aria-checked") !== "true";
    paint(button, value, on);
    onSwitch("switch", on ? "turn_on" : "turn_off", undefined, { entity_id: item.entityId });
  });
  return button;
}

function paint(button: HTMLButtonElement, value: HTMLElement, on: boolean): void {
  button.className = on ? "rd-intercom-switch rd-intercom-switch-on" : "rd-intercom-switch";
  button.setAttribute("aria-checked", on ? "true" : "false");
  value.textContent = on ? "On" : "Off";
}
